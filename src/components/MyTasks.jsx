import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import {
  getLocalTasks,
  deduplicateTasks,
  loadTasks,
  saveTaskLocally,
  syncPendingTasks,
  isTaskOverdue,
  notifyTaskOnce,
} from '../utils/taskSyncService';
import { registerPushToken } from '../utils/pushNotifications';
import { Calendar, MapPin, Bell, CheckCircle2, Circle, Clock, PartyPopper, X } from 'lucide-react';
import BnsSearchBar from './BnsSearchBar';
import TaskIcon from './TaskIcon';
import ConfirmActionDialog from './ConfirmActionDialog';

const NEXT_STATUS = { Pending: 'In Progress', 'In Progress': 'Completed', Completed: 'Pending' };

const STEP_ICON = {
  Pending: Circle,
  'In Progress': Clock,
  Completed: CheckCircle2,
};

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [taskStatusFilter, setTaskStatusFilter] = useState(null);
  const [banner, setBanner] = useState(null);
  const [completionCelebration, setCompletionCelebration] = useState(false);
  const [completionTaskId, setCompletionTaskId] = useState(null);
  const [pendingTaskChange, setPendingTaskChange] = useState(null);
  const [taskChangeBusy, setTaskChangeBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [registeringPush, setRegisteringPush] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [taskSearch, setTaskSearch] = useState('');
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
  const pushRegistrationAttempted = useRef(false);
  const completionTaskIdRef = useRef(null);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setTasks([]);
      return;
    }
    try {
      const assignedTasks = await loadTasks({ assignedToUserId: user.id });
      setTasks(assignedTasks.filter((task) =>
        task.status !== 'Completed' || task.task_id === completionTaskIdRef.current
      ));
    } catch (error) {
      console.error('Could not load assigned tasks:', error);
      setTasks(deduplicateTasks(getLocalTasks()).filter(
        (task) => task.assigned_to_user_id === user.id &&
          (task.status !== 'Completed' || task.task_id === completionTaskIdRef.current)
      ));
    }
  }, []);

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;
      await load();

      channel = supabase
        .channel(`my-tasks-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tasks', filter: `assigned_to_user_id=eq.${user.id}` },
          (payload) => {
            const t = payload.new;
            void load();
            setBanner(t.title);
            notifyTaskOnce(t, 'New task assigned');
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `assigned_to_user_id=eq.${user.id}` },
          () => load()
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'tasks' },
          () => load()
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (permission !== 'granted' || pushRegistrationAttempted.current) return;
    pushRegistrationAttempted.current = true;
    registerPushToken({ requestPermission: false })
      .then((result) => {
        if (!result.ok) setPushMessage('Push notifications are not available on this browser or device.');
      })
      .catch((error) => {
        console.error('Could not register this device for push notifications:', error);
        setPushMessage(error.message);
      });
  }, [permission]);

  useEffect(() => {
    const sync = async () => {
      const result = await syncPendingTasks();
      if (result.errors?.length) console.error('Some task changes are waiting to sync:', result.errors);
      await load();
    };
    const handleLocalChange = () => void load();
    const handleStorage = (event) => {
      if (event.key === 'nutrigrid_tasks' || event.key === 'nutrigrid_pending_task_changes') {
        handleLocalChange();
      }
    };
    void load();
    if (navigator.onLine) void sync();
    const interval = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 60000);
    window.addEventListener('online', sync);
    window.addEventListener('bns-tasks-changed', handleLocalChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
      window.removeEventListener('bns-tasks-changed', handleLocalChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [load]);

  useEffect(() => {
    if (!banner) return undefined;
    const timer = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [banner]);

  const finishCompletionCelebration = () => {
    completionTaskIdRef.current = null;
    setTasks((current) => current.filter((task) => task.task_id !== completionTaskId));
    setCompletionTaskId(null);
    setCompletionCelebration(false);
  };

  useEffect(() => {
    if (!completionCelebration || !completionTaskId) return undefined;
    const timer = window.setTimeout(finishCompletionCelebration, 4000);
    return () => window.clearTimeout(timer);
  }, [completionCelebration, completionTaskId]);

  const advance = async (t) => {
    const next = NEXT_STATUS[t.status] || 'Pending';
    setPendingTaskChange({
      message: `Are you sure you want to update "${t.title}" to ${next}?`,
      confirmLabel: 'Save changes',
      action: async () => {
    saveTaskLocally({
      ...t,
      status: next,
      completed_at: next === 'Completed' ? new Date().toISOString() : null,
    }, ['status', 'completed_at']);
    if (next === 'Completed') {
      completionTaskIdRef.current = t.task_id;
      setCompletionTaskId(t.task_id);
      setCompletionCelebration(true);
      setTaskStatusFilter(null);
    }
    setTasks(deduplicateTasks(getLocalTasks()).filter(
      (task) => task.assigned_to_user_id === t.assigned_to_user_id &&
        (task.status !== 'Completed' || task.task_id === (next === 'Completed' ? t.task_id : completionTaskIdRef.current))
    ));
    try {
      const result = await syncPendingTasks();
      if (result.errors?.length) {
        console.error('Task status is saved locally and waiting to sync:', result.errors);
        setSyncMessage(`Saved on this device; Supabase update failed and will retry automatically: ${result.errors[0]}`);
      } else if (result.skipped) {
        setSyncMessage('Saved on this device; the task will sync automatically when online.');
      } else {
        setSyncMessage('');
      }
    } catch (error) {
      console.error('Task status is saved locally and waiting to sync:', error);
      setSyncMessage(`Saved on this device; Supabase update failed and will retry automatically: ${error.message}`);
    }
      },
    });
  };

  const confirmTaskChange = async () => {
    if (!pendingTaskChange) return;
    setTaskChangeBusy(true);
    try {
      await pendingTaskChange.action();
      setPendingTaskChange(null);
    } finally {
      setTaskChangeBusy(false);
    }
  };

  const enableAlerts = async () => {
    setRegisteringPush(true);
    setPushMessage('');
    pushRegistrationAttempted.current = true;
    try {
      const result = await registerPushToken();
      setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      if (!result.ok) {
        setPushMessage(
          result.reason === 'denied'
            ? 'Allow notifications in your browser settings, then try again.'
            : result.reason === 'not-signed-in'
              ? 'Sign in to register this device for task notifications.'
              : 'Push notifications are not supported by this browser or device.'
        );
      } else {
        setPushMessage('Push notifications enabled on this device.');
      }
    } catch (error) {
      console.error('Could not enable task push notifications:', error);
      setPushMessage(error.message);
    } finally {
      setRegisteringPush(false);
    }
  };

  const query = taskSearch.trim().toLowerCase();
  const taskSuggestions = query
    ? tasks
        .filter((task) =>
          [task.title, task.description, task.purok, task.status, task.priority, task.due_date]
            .some((value) => String(value || '').toLowerCase().includes(query))
        )
        .slice(0, 20)
        .map((task) => ({
          id: task.task_id,
          categoryId: 'tasks',
          categoryName: task.status,
          displayTitle: task.title,
          data: task,
          timestamp: task.due_date,
          synced: true,
        }))
    : [];
  const filteredTasks = query
    ? tasks.filter((task) =>
        [task.title, task.description, task.purok, task.status, task.priority, task.due_date]
          .some((value) => String(value || '').toLowerCase().includes(query))
      )
    : tasks;
  const activeTasks = filteredTasks.filter((task) =>
    task.status !== 'Completed' || task.task_id === completionTaskId
  );
  const taskStatusCounts = {
    Pending: activeTasks.filter((task) => task.status === 'Pending').length,
    'In Progress': activeTasks.filter((task) => task.status === 'In Progress').length,
  };
  const visibleTasks = taskStatusFilter
    ? activeTasks.filter((task) => task.status === taskStatusFilter)
    : activeTasks;
  const orderedTasks = visibleTasks
    .sort((left, right) => Number(isTaskOverdue(right)) - Number(isTaskOverdue(left)));

  return (
    <section className="space-y-3">
      {completionCelebration && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) finishCompletionCelebration();
          }}
        >
          <style>{`
            @keyframes nutrigrid-confetti-fall {
              0% { transform: translateY(-12vh) rotate(0deg); opacity: 1; }
              100% { transform: translateY(75vh) rotate(640deg); opacity: 0; }
            }
          `}</style>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {Array.from({ length: 32 }, (_, index) => (
              <span
                key={index}
                className="absolute top-0 h-3 w-2 rounded-sm"
                style={{
                  left: `${(index * 37) % 100}%`,
                  backgroundColor: ['#8F65FF', '#FF75C3', '#34D399', '#FBBF24', '#60A5FA'][index % 5],
                  animation: `nutrigrid-confetti-fall ${2.4 + (index % 5) * 0.3}s ease-in ${(index % 8) * 0.17}s both`,
                }}
              />
            ))}
          </div>
          <section
            className="relative w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-complete-title"
          >
            <button
              type="button"
              onClick={finishCompletionCelebration}
              className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close congratulations"
            >
              <X size={18} />
            </button>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <PartyPopper size={34} aria-hidden="true" />
            </span>
            <h2 id="task-complete-title" className="mt-4 text-xl font-extrabold text-slate-900">
              You completed your task. Congratulations!
            </h2>
            <p className="mt-2 text-sm text-slate-600">This task will leave your PWA list after the celebration.</p>
            <button
              type="button"
              onClick={finishCompletionCelebration}
              className="mt-5 rounded-full bg-gradient-to-r from-[#8F65FF] to-[#FF75C3] px-6 py-2.5 text-sm font-bold text-white"
            >
              Done
            </button>
          </section>
        </div>
      )}
      {/* New-task banner */}
      {banner && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#8F65FF] to-[#FF75C3] p-4 text-white shadow-lg animate-pulse">
          <Bell size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase opacity-90">New task assigned</p>
            <p className="truncate font-bold">{banner}</p>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}
      <ConfirmActionDialog
        open={Boolean(pendingTaskChange)}
        title="Confirm task update"
        message={pendingTaskChange?.message}
        confirmLabel={pendingTaskChange?.confirmLabel || 'Save'}
        busy={taskChangeBusy}
        onCancel={() => setPendingTaskChange(null)}
        onConfirm={() => void confirmTaskChange()}
      />
      {syncMessage && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {syncMessage}
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">
          My tasks <span className="text-sm font-semibold text-violet-600">· {open.length} open</span>
        </h2>
        {permission !== 'unsupported' && permission !== 'denied' && (
          <button
            type="button"
            onClick={enableAlerts}
            disabled={registeringPush}
            className="flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700"
          >
            <Bell size={13} /> {registeringPush ? 'Enabling…' : 'Enable push alerts'}
          </button>
        )}
      </div>
      {pushMessage && (
        <p role="status" className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800">
          {pushMessage}
        </p>
      )}
      <BnsSearchBar
        query={taskSearch}
        onSearch={(value) => {
          setTaskSearch(value);
          setShowTaskSuggestions(true);
        }}
        results={taskSuggestions}
        showSuggestions={showTaskSuggestions}
        onFocusSuggestions={() => setShowTaskSuggestions(true)}
        onBlurSuggestions={() => setShowTaskSuggestions(false)}
        onSelectResult={(result) => {
          setTaskSearch(result.data.title || '');
          setShowTaskSuggestions(false);
        }}
        placeholder="Search your tasks..."
        emptyMessage="No matching tasks"
        tone="field"
        portalSuggestions
      />
      {permission === 'denied' && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Notifications are blocked. Allow them for NutriGrid in your browser settings to receive task alerts.
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter tasks by status">
        {['Pending', 'In Progress'].map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={taskStatusFilter === status}
            onClick={() => setTaskStatusFilter((current) => current === status ? null : status)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              taskStatusFilter === status
                ? 'border-transparent bg-gradient-to-r from-[#8F65FF] to-[#FF75C3] text-white shadow'
                : 'border-[#E8DCEF] bg-white text-gray-700 hover:bg-purple-50'
            }`}
          >
            {status} <span className="opacity-75">· {taskStatusCounts[status]}</span>
          </button>
        ))}
      </div>

      {orderedTasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#E8C4F0] bg-white/70 p-6 text-center">
          <TaskIcon size={44} className="mx-auto text-[#8F65FF]/70" />
          <p className="mt-2 text-sm text-gray-600">
            {query
              ? 'No tasks match your search.'
              : taskStatusFilter
                ? `No ${taskStatusFilter.toLowerCase()} tasks right now.`
                : 'No tasks assigned to you yet.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orderedTasks.map((t) => {
            const Icon = STEP_ICON[t.status] || Circle;
            const overdue = isTaskOverdue(t);
            const notes = (Array.isArray(t.task_notes) ? t.task_notes : [])
              .filter(
                (note) => !String(note?.message || note).includes('Automatically rescheduled from')
              );
            const isCelebratingCompletion = t.task_id === completionTaskId && t.status === 'Completed';
            return (
              <li
                key={t.task_id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  isCelebratingCompletion
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-[#E8C4F0] bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => advance(t)}
                    disabled={t.status === 'Completed'}
                    className="mt-0.5 shrink-0 disabled:cursor-default"
                    aria-label={`Mark as ${NEXT_STATUS[t.status]}`}
                  >
                    <Icon
                      size={24}
                      className={
                        t.status === 'Completed'
                          ? 'text-emerald-600'
                          : t.status === 'In Progress'
                            ? 'text-blue-500'
                            : 'text-gray-300'
                      }
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold ${isCelebratingCompletion ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.title}</p>
                    {t.description && <p className="mt-0.5 text-sm text-gray-600">{t.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                      {t.purok && (
                        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                          <MapPin size={11} /> {t.purok}
                        </span>
                      )}
                      {t.due_date && (
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${overdue ? 'bg-gray-100 text-gray-400' : 'bg-gray-100'}`}>
                          <Calendar size={11} /> {t.due_date}
                        </span>
                      )}
                      {overdue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Overdue</span>}
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          t.priority === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                  </div>
                </div>
                {notes.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-violet-700"
                      onClick={() => setExpandedNotes((current) => ({ ...current, [t.task_id]: !current[t.task_id] }))}
                    >
                      {expandedNotes[t.task_id] ? 'Hide task notes' : `View task notes (${notes.length})`}
                    </button>
                    {expandedNotes[t.task_id] && (
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        {notes.map((note, index) => <p key={`${t.task_id}-note-${index}`}>{note.message || note}</p>)}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex gap-1 rounded-full bg-gray-100 p-1 text-[11px] font-bold">
                  {['Pending', 'In Progress', 'Completed'].map((s) => (
                    <span
                      key={s}
                      className={`flex-1 rounded-full py-1 text-center transition ${
                        t.status === s
                          ? s === 'Pending' && overdue
                            ? 'bg-rose-100 text-rose-700 shadow'
                            : 'bg-gradient-to-r from-[#8F65FF] to-[#FF75C3] text-white shadow'
                          : 'text-gray-500'
                      }`}
                    >
                      {s === 'Pending' && overdue ? 'Overdue' : s}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}