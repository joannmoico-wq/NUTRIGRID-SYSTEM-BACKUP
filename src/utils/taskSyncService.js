import { supabase } from './supabaseClient';
import { flushPendingSyncLogs, writeSyncLog } from './syncService';

const TASKS_STORAGE_KEY = 'nutrigrid_tasks';
const PENDING_TASKS_STORAGE_KEY = 'nutrigrid_pending_task_changes';
const BHW_PROFILES_STORAGE_KEY = 'nutrigrid_bhw_profiles';
const TASK_NOTIFICATION_PREFIX = 'nutrigrid_task_notification_';
let syncingTasks = false;
let syncRequested = false;

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Could not read ${key}:`, error);
    return [];
  }
}

function isMissingTaskColumnError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('schema cache') && message.includes('column');
}

function publishTasks(tasks, task = null, operation = 'refresh', notify = true) {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  if (notify) {
    window.dispatchEvent(new CustomEvent('bns-tasks-changed', {
      detail: { operation, task },
    }));
  }
}

export function getLocalTasks() {
  return readArray(TASKS_STORAGE_KEY);
}

function todayIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTaskOverdue(task, now = new Date()) {
  const dueDate = String(task?.due_date || '').slice(0, 10);
  return (
    task?.status !== 'Completed' &&
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
    dueDate < todayIso(now)
  );
}

function notificationClaimKey(taskId, rolloverCount) {
  return `${TASK_NOTIFICATION_PREFIX}${taskId}_${rolloverCount}`;
}

export function notifyTaskOnce(task, title = 'Task overdue') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const count = Number(task.overdue_count || 0);
  const key = notificationClaimKey(task.task_id, count);
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, '1');
  new Notification(title, {
    body: `${task.title} needs attention.`,
    icon: '/icon-192.png',
    tag: `nutrigrid-task-${task.task_id}-overdue-${count}`,
  });
  return true;
}

export function getPendingTaskChanges() {
  return readArray(PENDING_TASKS_STORAGE_KEY);
}

export function cacheRemoteTasks(remoteTasks) {
  const pending = getPendingTaskChanges();
  const deletedIds = new Set(
    pending.filter((change) => change.operation === 'delete').map((change) => String(change.taskId))
  );
  const merged = new Map(
    remoteTasks
      .filter((task) => !deletedIds.has(String(task.task_id)))
      .map((task) => [String(task.task_id), task])
  );

  pending
    .filter((change) => change.operation === 'upsert' && change.task)
    .forEach((change) => merged.set(String(change.taskId), change.task));

  const tasks = Array.from(merged.values()).sort(
    (left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0)
  );
  publishTasks(tasks, null, 'refresh', false);
  return tasks;
}

export function saveTaskLocally(task, fieldsToSync) {
  const tasks = getLocalTasks();
  const index = tasks.findIndex((item) => String(item.task_id) === String(task.task_id));
  if (index < 0) tasks.push(task);
  else tasks[index] = { ...tasks[index], ...task };

  const pending = getPendingTaskChanges().filter((item) => String(item.taskId) !== String(task.task_id));
  const change = {
    taskId: String(task.task_id),
    operation: 'upsert',
    task,
    updatedAt: new Date().toISOString(),
  };
  if (fieldsToSync) {
    change.updates = Object.fromEntries(
      fieldsToSync
        .filter((field) => Object.prototype.hasOwnProperty.call(task, field))
        .map((field) => [field, task[field]])
    );
  }
  pending.push(change);
  localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(pending));
  publishTasks(tasks, task, 'upsert');
  return task;
}

function reconcileSyncedTaskId(localTaskId, remoteTaskId, syncedAt) {
  const tasks = getLocalTasks().map((task) =>
    String(task.task_id) === String(localTaskId)
      ? { ...task, task_id: remoteTaskId }
      : task
  );
  const pending = getPendingTaskChanges().flatMap((change) => {
    if (String(change.taskId) !== String(localTaskId)) return [change];
    if (change.updatedAt === syncedAt) return [];
    return [{
      ...change,
      taskId: String(remoteTaskId),
      task: change.task ? { ...change.task, task_id: remoteTaskId } : change.task,
    }];
  });
  localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(pending));
  publishTasks(tasks, null, 'refresh');
}

export function deleteTaskLocally(taskId) {
  const tasks = getLocalTasks().filter((item) => String(item.task_id) !== String(taskId));
  const pending = getPendingTaskChanges();
  const nextPending = pending.filter((item) => String(item.taskId) !== String(taskId));
  nextPending.push({
    taskId: String(taskId),
    operation: 'delete',
    updatedAt: new Date().toISOString(),
  });
  localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(nextPending));
  publishTasks(tasks, { task_id: taskId }, 'delete');
}

export function getCachedBhwProfiles() {
  return readArray(BHW_PROFILES_STORAGE_KEY);
}

export function cacheBhwProfiles(profiles) {
  localStorage.setItem(BHW_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

export async function loadTasks({ assignedToUserId } = {}) {
  const selectTasks = (tasks) => assignedToUserId
    ? tasks.filter((task) => task.assigned_to_user_id === assignedToUserId)
    : tasks;
  if (!navigator.onLine) {
    const local = getLocalTasks();
    return selectTasks(local);
  }

  let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (assignedToUserId) query = query.eq('assigned_to_user_id', assignedToUserId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const merged = cacheRemoteTasks([
    ...getLocalTasks().filter((task) => String(task.task_id).startsWith('-')),
    ...(data || []),
  ]);
  return selectTasks(merged);
}

export async function syncPendingTasks() {
  if (syncingTasks) {
    syncRequested = true;
    return { synced: 0, errors: [], skipped: 'sync-in-progress' };
  }
  if (!navigator.onLine) return { synced: 0, skipped: 'offline' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { synced: 0, skipped: 'not-signed-in' };

  syncingTasks = true;
  const result = { synced: 0, records: 0, errors: [], notificationErrors: [], migrationPending: false };
  try {
    const pendingLogResult = await flushPendingSyncLogs();
    if (pendingLogResult.errors.length) {
      console.error('Previously queued sync logs are still waiting:', pendingLogResult.errors);
    }
    do {
      syncRequested = false;
      for (const change of getPendingTaskChanges()) {
        result.records++;
        let response;
        let syncedTaskId = change.taskId;
        if (change.operation === 'delete') {
          response = await supabase.from('tasks').delete().eq('task_id', change.taskId);
        } else {
          const { task } = change;
          if (!task) continue;
          if (String(change.taskId).startsWith('-')) {
            const existing = await supabase
              .from('tasks')
              .select('task_id')
              .eq('task_id', change.taskId)
              .maybeSingle();
            if (existing.error) {
              response = { error: existing.error };
            } else if (existing.data) {
              syncedTaskId = existing.data.task_id;
              const updates = change.updates || Object.fromEntries(
                Object.entries(task).filter(([field]) => field !== 'task_id')
              );
              response = Object.keys(updates).length
                ? await supabase
                    .from('tasks')
                    .update(updates)
                    .eq('task_id', change.taskId)
                    .select('task_id')
                : { error: null, data: [{ task_id: existing.data.task_id }] };
            } else {
              const { task_id: _localTaskId, ...taskToInsert } = task;
              response = await supabase
                .from('tasks')
                .insert(taskToInsert)
                .select('task_id')
                .single();
              if (!response.error && response.data) {
                syncedTaskId = response.data.task_id;
                const { data: notification, error: notificationError } = await supabase.functions.invoke(
                  'send-task-notification',
                  { body: { task_id: String(syncedTaskId) } }
                );
                if (notificationError) {
                  const errorMessage = notificationError.message || 'The Edge Function is unavailable.';
                  result.notificationErrors.push(errorMessage);
                  console.error('Task was saved, but its push notification could not be sent:', notificationError);
                } else if (!notification?.sent) {
                  result.notificationErrors.push(
                    notification?.reason || 'The assigned BHW has not registered this device for push notifications.'
                  );
                  console.warn(
                    `Task was saved, but push notification was not sent: ${notification?.reason || 'unknown reason'}.`
                  );
                }
              }
            }
          } else {
            let updates = change.updates;
            if (!updates || !Object.keys(updates).length) {
              updates = Object.prototype.hasOwnProperty.call(task, 'status')
                ? {
                    status: task.status,
                    ...(Object.prototype.hasOwnProperty.call(task, 'completed_at')
                      ? { completed_at: task.completed_at }
                      : {}),
                  }
                : Object.fromEntries(
                    Object.entries(task).filter(([field]) => field !== 'task_id')
                  );
            }
            if (!Object.keys(updates).length) {
              const latest = getPendingTaskChanges().find(
                (item) => String(item.taskId) === String(change.taskId)
              );
              if (latest?.updatedAt === change.updatedAt) {
                localStorage.setItem(
                  PENDING_TASKS_STORAGE_KEY,
                  JSON.stringify(getPendingTaskChanges().filter(
                    (item) => String(item.taskId) !== String(change.taskId)
                  ))
                );
              }
              result.synced++;
              continue;
            }
            response = await supabase
              .from('tasks')
              .update(updates)
              .eq('task_id', change.taskId)
              .select('task_id');
            if (!response.error && !response.data?.length) {
              result.errors.push(
                `Task ${change.taskId} update: Supabase did not confirm an updated task row. Check that the task exists and the signed-in user is allowed to update it.`
              );
              continue;
            }
          }
        }

        if (response.error) {
          if (isMissingTaskColumnError(response.error)) {
            result.migrationPending = true;
            continue;
          }
          result.errors.push(`Task ${change.taskId} ${change.operation}: ${response.error.message}`);
          continue;
        }
        if (
          change.operation === 'upsert' &&
          !(
            Array.isArray(response.data)
              ? response.data.length
              : response.data
          )
        ) {
          result.errors.push(
            `Task ${change.taskId} update: Supabase did not confirm an updated task row. Check that the task exists and the signed-in user is allowed to update it.`
          );
          continue;
        }

        if (String(syncedTaskId) !== String(change.taskId)) {
          reconcileSyncedTaskId(change.taskId, syncedTaskId, change.updatedAt);
          result.synced++;
          continue;
        }

        const latest = getPendingTaskChanges().find(
          (item) => String(item.taskId) === String(change.taskId)
        );
        if (latest?.updatedAt === change.updatedAt) {
          localStorage.setItem(
            PENDING_TASKS_STORAGE_KEY,
            JSON.stringify(getPendingTaskChanges().filter(
              (item) => String(item.taskId) !== String(change.taskId)
            ))
          );
        }
        result.synced++;
      }
    } while (syncRequested && navigator.onLine);

    const logError = await writeSyncLog(
      session.user.id,
      result.records,
      result.synced,
      result.errors.length > 0
    );
    if (logError) result.errors.push(`Could not write task sync log: ${logError}`);
  } finally {
    syncingTasks = false;
  }
  return result;
}

export function createLocalTaskId() {
  return -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}
