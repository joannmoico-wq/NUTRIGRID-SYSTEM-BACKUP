import { supabase } from './supabaseClient';
import { flushPendingSyncLogs, writeSyncLog } from './syncService';

const TASKS_STORAGE_KEY = 'nutrigrid_tasks';
const PENDING_TASKS_STORAGE_KEY = 'nutrigrid_pending_task_changes';
const BHW_PROFILES_STORAGE_KEY = 'nutrigrid_bhw_profiles';
const TASK_NOTIFICATION_PREFIX = 'nutrigrid_task_notification_';
const TASK_PAGE_SIZE = 100;
let syncingTasks = false;
let syncRequested = false;
let syncAllRequested = false;
const requestedTaskIds = new Set();

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

function isValidTaskId(taskId) {
  return taskId !== null &&
    taskId !== undefined &&
    /^-?\d+$/.test(String(taskId).trim());
}

function taskTimestamp(task) {
  const timestamp = Date.parse(task?.created_at || task?.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function taskIdentity(task) {
  const createdAt = taskTimestamp(task);
  const details = JSON.stringify([
    task?.assigned_to_user_id,
    task?.title,
    task?.description,
    task?.purok,
    task?.due_date,
  ].map((value) => String(value ?? '').trim().toLowerCase()));
  return createdAt === null ? `details:${details}` : `created:${createdAt}:${details}`;
}

function findUniqueRemoteTask(remoteTasks, task) {
  const timestamp = taskTimestamp(task);
  if (timestamp === null) return null;
  const timestampMatches = remoteTasks.filter(
    (remoteTask) => taskTimestamp(remoteTask) === timestamp
  );
  if (timestampMatches.length === 1) return timestampMatches[0];
  if (timestampMatches.length < 2) return null;

  const detailMatches = timestampMatches.filter(
    (remoteTask) =>
      String(remoteTask.title || '').trim() === String(task.title || '').trim() &&
      remoteTask.assigned_to_user_id === task.assigned_to_user_id
  );
  return detailMatches.length === 1 ? detailMatches[0] : null;
}

function sameLocalTask(left, right) {
  if (!left || !right) return false;
  const leftTimestamp = taskTimestamp(left);
  const rightTimestamp = taskTimestamp(right);
  if (leftTimestamp !== null && rightTimestamp !== null) {
    return leftTimestamp === rightTimestamp;
  }
  return taskIdentity(left) === taskIdentity(right);
}

function samePendingTask(change, taskId, task) {
  if (isValidTaskId(taskId)) return String(change.taskId) === String(taskId);
  return (
    !isValidTaskId(change.taskId) &&
    (task ? sameLocalTask(change.task, task) : String(change.taskId) === String(taskId))
  );
}

async function findMatchingRemoteTaskId(task) {
  const title = String(task?.title || '').trim();
  if (!title) {
    return {
      error: 'The task has no valid ID or title, so it cannot be safely matched in Supabase.',
    };
  }

  const createdAt = taskTimestamp(task);
  if (createdAt !== null) {
    const exactResult = await supabase
      .from('tasks')
      .select('task_id')
      .eq('created_at', new Date(createdAt).toISOString())
      .limit(2);
    if (exactResult.error) return { error: exactResult.error.message };
    const exactMatches = (exactResult.data || []).filter((row) => isValidTaskId(row.task_id));
    if (exactMatches.length === 1) return { taskId: exactMatches[0].task_id };
    if (exactMatches.length > 1) {
      return {
        error: 'The task has no valid ID and matches multiple Supabase tasks; no task was changed.',
      };
    }

    const nearbyResult = await supabase
      .from('tasks')
      .select('task_id, created_at, title, assigned_to_user_id')
      .gte('created_at', new Date(createdAt - 1000).toISOString())
      .lte('created_at', new Date(createdAt + 1000).toISOString())
      .limit(100);
    if (nearbyResult.error) return { error: nearbyResult.error.message };
    const nearbyMatches = (nearbyResult.data || []).filter((row) => {
      const rowTimestamp = taskTimestamp(row);
      return isValidTaskId(row.task_id) &&
        rowTimestamp !== null &&
        Math.abs(rowTimestamp - createdAt) <= 1000 &&
        String(row.title || '').trim() === title &&
        (
          !Object.prototype.hasOwnProperty.call(task, 'assigned_to_user_id') ||
          row.assigned_to_user_id === task.assigned_to_user_id
        );
    });
    if (nearbyMatches.length === 1) return { taskId: nearbyMatches[0].task_id };
    if (nearbyMatches.length > 1) {
      return {
        error: 'The task has no valid ID and matches multiple Supabase tasks; no task was changed.',
      };
    }
  }

  let query = supabase.from('tasks').select('task_id').eq('title', title);
  if (Object.prototype.hasOwnProperty.call(task, 'assigned_to_user_id')) {
    query = task.assigned_to_user_id
      ? query.eq('assigned_to_user_id', task.assigned_to_user_id)
      : query.is('assigned_to_user_id', null);
  }
  const { data, error } = await query.limit(2);
  if (error) return { error: error.message };
  const matches = (data || []).filter((row) => isValidTaskId(row.task_id));
  if (matches.length === 1) return { taskId: matches[0].task_id };
  return {
    error: matches.length
      ? 'The task has no valid ID and matches multiple Supabase tasks; no task was changed.'
      : 'The task has no valid ID and no matching Supabase task was found.',
  };
}

function persistResolvedTaskId(change, taskId) {
  const oldTaskId = String(change.taskId);
  const syncedAt = change.updatedAt;
  const updatedChange = {
    ...change,
    taskId: String(taskId),
    task: { ...change.task, task_id: taskId },
  };
  const pending = getPendingTaskChanges().map((item) =>
    String(item.taskId) === oldTaskId && item.updatedAt === syncedAt
      ? updatedChange
      : item
  );
  const tasks = getLocalTasks().map((task) =>
    String(task.task_id) === oldTaskId &&
    sameLocalTask(task, change.task)
      ? { ...task, task_id: taskId }
      : task
  );
  localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(pending));
  publishTasks(tasks, null, 'refresh');
  return updatedChange;
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

export function deduplicateTasks(tasks) {
  const unique = new Map();
  for (const task of tasks) {
    const identity = task.title
      ? JSON.stringify([
          task.assigned_to_user_id,
          task.title,
          task.description,
          task.purok,
          task.due_date,
          task.created_at || task.createdAt,
          task.priority || 'Normal',
          task.status || 'Pending',
        ].map((value) => String(value ?? '').trim().toLowerCase()))
      : `task:${task.task_id}`;
    if (!unique.has(identity)) unique.set(identity, task);
  }
  return Array.from(unique.values());
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
    pending
      .filter((change) =>
        change.operation === 'delete' &&
        change.source === 'admin' &&
        isValidTaskId(change.taskId)
      )
      .map((change) => String(change.taskId))
  );
  pending
    .filter((change) =>
      change.operation === 'delete' &&
      change.source === 'admin' &&
      !isValidTaskId(change.taskId) &&
      change.task
    )
    .forEach((change) => {
      const remoteTask = findUniqueRemoteTask(remoteTasks, change.task);
      if (remoteTask) deletedIds.add(String(remoteTask.task_id));
    });
  const merged = new Map(
    remoteTasks
      .filter((task) => !deletedIds.has(String(task.task_id)))
      .map((task) => [String(task.task_id), task])
  );

  pending
    .filter((change) => change.operation === 'upsert' && change.task)
    .forEach((change) => {
      const remoteTask = isValidTaskId(change.taskId)
        ? null
        : findUniqueRemoteTask(remoteTasks, change.task);
      const key = isValidTaskId(change.taskId)
        ? String(change.taskId)
        : remoteTask
          ? String(remoteTask.task_id)
          : `local:${taskIdentity(change.task)}`;
      merged.set(key, change.task);
    });

  const tasks = deduplicateTasks(Array.from(merged.values())).sort(
    (left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0)
  );
  publishTasks(tasks, null, 'refresh', false);
  return tasks;
}

export function saveTaskLocally(task, fieldsToSync) {
  const tasks = getLocalTasks();
  const index = tasks.findIndex((item) =>
    isValidTaskId(task.task_id)
      ? String(item.task_id) === String(task.task_id)
      : !isValidTaskId(item.task_id) && sameLocalTask(item, task)
  );
  if (index < 0) tasks.push(task);
  else tasks[index] = { ...tasks[index], ...task };

  const pending = getPendingTaskChanges().filter(
    (item) => !samePendingTask(item, task.task_id, task)
  );
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

export function deleteTaskLocally(taskOrId, source = 'admin') {
  const task = taskOrId && typeof taskOrId === 'object' ? taskOrId : null;
  const taskId = task ? task.task_id : taskOrId;
  const taskIdString = String(taskId);
  const tasks = getLocalTasks().filter((item) => {
    if (isValidTaskId(taskId)) return String(item.task_id) !== taskIdString;
    return !task || !sameLocalTask(item, task);
  });
  const pending = getPendingTaskChanges();
  const nextPending = pending.filter(
    (item) => !samePendingTask(item, taskId, task)
  );
  if (!taskIdString.startsWith('-')) {
    nextPending.push({
      taskId: taskIdString,
      operation: 'delete',
      source,
      task,
      updatedAt: new Date().toISOString(),
    });
  }
  localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(nextPending));
  publishTasks(tasks, task || { task_id: taskId }, 'delete');
}

export function getCachedBhwProfiles() {
  return readArray(BHW_PROFILES_STORAGE_KEY);
}

export function cacheBhwProfiles(profiles) {
  localStorage.setItem(BHW_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

export async function loadTasks({ assignedToUserId } = {}) {
  const selectTasks = (tasks) => {
    const uniqueTasks = deduplicateTasks(tasks);
    const assignedTasks = assignedToUserId
      ? uniqueTasks.filter((task) => task.assigned_to_user_id === assignedToUserId)
      : uniqueTasks;
    return assignedToUserId
      ? assignedTasks.filter((task) => !isTaskOverdue(task))
      : assignedTasks;
  };

  if (!navigator.onLine) {
    return selectTasks(getLocalTasks());
  }

  const remoteTasks = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + TASK_PAGE_SIZE - 1);
    if (assignedToUserId) query = query.eq('assigned_to_user_id', assignedToUserId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    remoteTasks.push(...(data || []));
    if (!data || data.length < TASK_PAGE_SIZE) break;
    offset += TASK_PAGE_SIZE;
  }

  const merged = cacheRemoteTasks([
    ...getLocalTasks().filter((task) => String(task.task_id).startsWith('-')),
    ...remoteTasks,
  ]);
  return selectTasks(merged);
}

export async function syncPendingTasks({ taskIds } = {}) {
  const isTargetedSync = Array.isArray(taskIds) && taskIds.length > 0;
  if (isTargetedSync) {
    taskIds.forEach((taskId) => requestedTaskIds.add(String(taskId)));
  } else {
    syncAllRequested = true;
  }
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
    if (!isTargetedSync) {
      void flushPendingSyncLogs()
        .then(({ errors }) => {
          if (errors.length) console.error('Previously queued sync logs are still waiting:', errors);
        })
        .catch((error) => console.error('Could not flush queued sync logs:', error));
    }
    do {
      syncRequested = false;
      const syncAll = syncAllRequested;
      const taskIdsToSync = new Set(requestedTaskIds);
      syncAllRequested = false;
      requestedTaskIds.clear();
      const pendingChanges = getPendingTaskChanges().filter(
        (change) => syncAll || taskIdsToSync.has(String(change.taskId))
      );
      for (const pendingChange of pendingChanges) {
        let change = pendingChange;
        if (
          ['upsert', 'delete'].includes(change.operation) &&
          !isValidTaskId(change.taskId)
        ) {
          if (!change.task) {
            if (change.operation === 'delete') {
              const remaining = getPendingTaskChanges().filter(
                (item) =>
                  String(item.taskId) !== String(change.taskId) ||
                  item.updatedAt !== change.updatedAt
              );
              localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(remaining));
            }
            result.errors.push(
              `Task with invalid ID: ${change.operation} has no saved task details to identify the Supabase row. Reload and retry the action.`
            );
            continue;
          }
          const resolved = await findMatchingRemoteTaskId(change.task);
          if (!resolved.taskId) {
            result.errors.push(`Task with invalid ID: ${resolved.error}`);
            continue;
          }
          change = persistResolvedTaskId(change, resolved.taskId);
        }
        if (!isValidTaskId(change.taskId)) {
          result.errors.push(`Task ${change.taskId} ${change.operation}: task ID is invalid.`);
          continue;
        }
        result.records++;
        let response;
        let syncedTaskId = change.taskId;
        if (change.operation === 'delete') {
          if (!change.source) {
            const existing = await supabase
              .from('tasks')
              .select('task_id, due_date, status, assigned_to_user_id')
              .eq('task_id', change.taskId)
              .maybeSingle();
            if (existing.error) {
              result.errors.push(
                `Task ${change.taskId} pending-delete check: ${existing.error.message}`
              );
              continue;
            }
            if (existing.data && isTaskOverdue(existing.data)) {
              const remaining = getPendingTaskChanges().filter(
                (item) => String(item.taskId) !== String(change.taskId)
              );
              localStorage.setItem(PENDING_TASKS_STORAGE_KEY, JSON.stringify(remaining));
              console.warn(
                `Kept overdue task ${change.taskId} in Supabase; only hide it from the assigned BHW's PWA.`
              );
              result.synced++;
              continue;
            }
          }
          response = await supabase
            .from('tasks')
            .delete()
            .eq('task_id', change.taskId)
            .select('task_id');
          if (!response.error && !response.data?.length) {
            const existing = await supabase
              .from('tasks')
              .select('task_id')
              .eq('task_id', change.taskId)
              .maybeSingle();
            if (existing.error) {
              response = { error: existing.error };
            } else {
              response = {
                error: {
                  message: existing.data
                    ? 'Supabase did not delete the task. Check the task delete policy.'
                    : 'Supabase did not confirm task deletion. The task may already be deleted or hidden by row-level security.',
                },
              };
            }
          }
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
          const rlsHint = response.error.code === '42501'
            ? ' Run supabase-tasks-rls-fix.sql and verify the signed-in admin profile is approved.'
            : '';
          result.errors.push(
            `Task ${change.taskId} ${change.operation}: ${response.error.message}${rlsHint}`
          );
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

    void writeSyncLog(
      session.user.id,
      result.records,
      result.synced,
      result.errors.length > 0
    )
      .then((logError) => {
        if (logError) console.error('Could not write task sync log:', logError);
      })
      .catch((error) => console.error('Could not write task sync log:', error));
  } finally {
    syncingTasks = false;
  }
  return result;
}

export function createLocalTaskId() {
  return -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}
