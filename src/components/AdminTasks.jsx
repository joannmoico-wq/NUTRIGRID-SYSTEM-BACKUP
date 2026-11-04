import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import {
  cacheBhwProfiles,
  createLocalTaskId,
  deleteTaskLocally,
  deduplicateTasks,
  getCachedBhwProfiles,
  getLocalTasks,
  loadTasks,
  saveTaskLocally,
  syncPendingTasks,
  isTaskOverdue,
} from '../utils/taskSyncService';
import { Plus, Trash2, Calendar, MapPin, Flag, X, Edit } from 'lucide-react';
import TaskIcon from './TaskIcon';
import ConfirmActionDialog from './ConfirmActionDialog';

const PRIORITIES = ['High', 'Normal', 'Low'];
const FILTERS = ['All', 'Overdue', 'Pending', 'In Progress', 'Completed'];

const emptyForm = {
  title: '',
  description: '',
  purok: '',
  priority: 'Normal',
  due_date: '',
  assigned_to_user_id: '',
};

const STATUS_STYLE = {
  Pending: 'bg-gray-100 text-gray-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Completed: 'bg-emerald-100 text-emerald-700',
};

const PRIORITY_STYLE = {
  High: 'bg-rose-100 text-rose-700',
  Normal: 'bg-violet-100 text-violet-700',
  Low: 'bg-slate-100 text-slate-600',
};

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminTasks({
  darkMode = false,
  initialPurok = '',
  onInitialTaskHandled,
  searchQuery = '',
  onSearchResultsChange,
  selectedTaskFilter,
}) {
  const [tasks, setTasks] = useState([]);
  const [bhws, setBhws] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [reschedulingTask, setReschedulingTask] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [bhwLoadError, setBhwLoadError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [, setOverdueClock] = useState(0);

  const runConfirmedAction = async () => {
    if (!confirmation) return;
    setConfirmationBusy(true);
    try {
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setConfirmationBusy(false);
    }
  };

  useEffect(() => {
    if (selectedTaskFilter) setFilter(selectedTaskFilter);
  }, [selectedTaskFilter]);

  const load = async () => {
    try {
      const taskData = await loadTasks();
      setTasks(taskData);
    } catch (error) {
      console.error('Could not load tasks:', error);
      setTasks(deduplicateTasks(getLocalTasks()));
      setMessage(`Could not refresh tasks: ${error.message}`);
    }

    if (!navigator.onLine) {
      setBhws(getCachedBhwProfiles());
      setBhwLoadError('Offline: showing previously loaded approved BHW accounts.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_approved_bhws');
      if (error) throw new Error(error.message);
      const workers = data || [];
      workers.sort((left, right) =>
        (left.full_name || left.email || '').localeCompare(right.full_name || right.email || '')
      );
      cacheBhwProfiles(workers);
      setBhws(workers);
      setBhwLoadError('');
    } catch (error) {
      console.error('Could not fetch approved BHW accounts:', error);
      setBhws(getCachedBhwProfiles());
      setBhwLoadError(`Could not fetch approved BHW accounts: ${error.message}`);
    }
  };

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) void load();
    };
    const sync = async () => {
      const result = await syncPendingTasks();
      if (result.errors?.length) {
        console.error('Some tasks are waiting to sync:', result.errors);
        setMessage(`Task sync failed; the change is still saved on this device and will retry: ${result.errors[0]}`);
      } else if (result.migrationPending) {
        setMessage('Saved on this device. Apply the latest task migration in Supabase to sync overdue details.');
      }
      if (result.synced > 0) refresh();
    };
    const refreshFromLocalCache = () => {
      if (active) setTasks(deduplicateTasks(getLocalTasks()));
    };
    const handleStorage = (event) => {
      if (event.key === 'nutrigrid_tasks' || event.key === 'nutrigrid_pending_task_changes') {
        refreshFromLocalCache();
      }
    };
    refresh();
    if (navigator.onLine) void sync();
    const channel = supabase
      .channel('admin-tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refresh)
      .subscribe();
    const interval = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 60000);
    const overdueInterval = window.setInterval(() => setOverdueClock(Date.now()), 60000);
    window.addEventListener('online', sync);
    window.addEventListener('bns-tasks-changed', refreshFromLocalCache);
    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearInterval(overdueInterval);
      window.removeEventListener('online', sync);
      window.removeEventListener('bns-tasks-changed', refreshFromLocalCache);
      window.removeEventListener('storage', handleStorage);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!initialPurok) return;
    setEditingTask(null);
    setForm({
      ...emptyForm,
      title: `Schedule a community visit to ${initialPurok}`,
      description: 'Follow up on the selected purok and review community health needs.',
      purok: initialPurok,
    });
    setShowForm(true);
    onInitialTaskHandled?.();
  }, [initialPurok, onInitialTaskHandled]);

  const bhwName = (id) => {
    const b = bhws.find((x) => x.id === id);
    return b ? b.full_name || b.email : 'Unassigned';
  };

  const counts = useMemo(
    () => ({
      All: tasks.length,
      Pending: tasks.filter((t) => t.status === 'Pending' && !isTaskOverdue(t)).length,
      Overdue: tasks.filter((t) => isTaskOverdue(t)).length,
      'In Progress': tasks.filter((t) => t.status === 'In Progress').length,
      Completed: tasks.filter((t) => t.status === 'Completed').length,
    }),
    [tasks]
  );

  const taskSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return tasks
      .filter((task) => {
        const values = [
          task.title,
          task.description,
          task.purok,
          task.status,
          task.priority,
          task.due_date,
          bhwName(task.assigned_to_user_id),
        ];
        return values.some((value) => String(value || '').toLowerCase().includes(query));
      })
      .slice(0, 20)
      .map((task) => ({
        id: task.task_id,
        categoryId: 'tasks',
        categoryName: `${bhwName(task.assigned_to_user_id)} · ${isTaskOverdue(task) ? 'Overdue' : task.status}`,
        displayTitle: task.title,
        data: task,
        timestamp: task.due_date,
        synced: true,
      }));
  }, [tasks, searchQuery, bhws]);
  useEffect(() => {
    onSearchResultsChange?.(taskSuggestions);
  }, [taskSuggestions, onSearchResultsChange]);

  const searchedTasks = searchQuery.trim()
    ? tasks.filter((task) =>
        [
          task.title,
          task.description,
          task.purok,
          task.status,
          task.priority,
          task.due_date,
          bhwName(task.assigned_to_user_id),
        ].some((value) => String(value || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
      )
    : tasks;
  const visible = (searchQuery.trim()
    ? searchedTasks
    : filter === 'All'
      ? searchedTasks
      : filter === 'Overdue'
        ? searchedTasks.filter((t) => isTaskOverdue(t))
        : filter === 'Pending'
          ? searchedTasks.filter((t) => t.status === 'Pending' && !isTaskOverdue(t))
          : searchedTasks.filter((t) => t.status === filter)
  ).sort((left, right) => Number(isTaskOverdue(right)) - Number(isTaskOverdue(left)));

  const saveTask = async (e) => {
    e.preventDefault();
    if (!form.assigned_to_user_id) {
      setMessage('Choose a BHW to assign this task to.');
      return;
    }
    const task = {
      ...(editingTask || {}),
      task_id: editingTask?.task_id ?? createLocalTaskId(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      purok: form.purok.trim() || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to_user_id: form.assigned_to_user_id,
      status: editingTask?.status || 'Pending',
      completed_at: editingTask?.completed_at || null,
      created_at: editingTask?.created_at || new Date().toISOString(),
    };
    setConfirmation({
      message: `Are you sure you want to ${editingTask ? 'edit' : 'save'} this task?`,
      confirmLabel: editingTask ? 'Save changes' : 'Save',
      action: async () => {
        setBusy(true);
        const actionLabel = editingTask ? 'Task updated' : 'Task assigned';
        saveTaskLocally(task);
        setTasks(deduplicateTasks(getLocalTasks()));
        setForm(emptyForm);
        setShowForm(false);
        setEditingTask(null);
        setMessage(`${actionLabel} locally. Syncing to Supabase…`);
        setBusy(false);

        void (async () => {
          try {
            const result = await syncPendingTasks();
            if (result.errors?.length || result.skipped) {
              setMessage('Saved on this device. The task will sync when this device is online and signed in.');
            } else if (result.migrationPending) {
              setMessage('Saved on this device. Apply the latest task migration in Supabase to sync overdue details.');
            } else if (result.notificationErrors?.length) {
              setMessage(`Task saved, but push notification was not sent: ${result.notificationErrors[0]}`);
            } else {
              setMessage(`${actionLabel} to ${bhwName(task.assigned_to_user_id)}.`);
              await load();
            }
          } catch (error) {
            console.error('Could not sync task:', error);
            setMessage('Saved on this device. The task will sync when Supabase is available.');
          }
        })();
      },
    });
  };

  const deleteTask = async (id) => {
    setConfirmation({
      title: 'Delete task',
      message: 'Are you sure you want to delete this task?',
      confirmLabel: 'Delete',
      destructive: true,
      action: async () => {
    deleteTaskLocally(id);
    setTasks(deduplicateTasks(getLocalTasks()));
    try {
      const result = await syncPendingTasks();
      setMessage(result.errors?.length || result.skipped
        ? 'Deleted on this device. The deletion will sync when online.'
        : 'Task deleted.');
    } catch (error) {
      console.error('Could not sync task deletion:', error);
      setMessage('Deleted on this device. The deletion will sync when Supabase is available.');
    }
      },
    });
  };

  const openReschedule = (task) => {
    setReschedulingTask(task);
    setRescheduleDate(localDateInputValue());
  };

  const saveReschedule = async (event) => {
    event.preventDefault();
    if (!reschedulingTask || !rescheduleDate) return;

    const updatedTask = { ...reschedulingTask, due_date: rescheduleDate };
    setConfirmation({
      message: 'Are you sure you want to save this new due date?',
      confirmLabel: 'Save new date',
      action: async () => {
    saveTaskLocally(updatedTask, ['due_date']);
    setTasks(deduplicateTasks(getLocalTasks()));
    setReschedulingTask(null);
    setRescheduleDate('');

    try {
      const result = await syncPendingTasks();
      setMessage(result.errors?.length || result.skipped
        ? 'New due date saved on this device. It will sync when online.'
        : 'Task rescheduled.');
    } catch (error) {
      console.error('Could not sync task reschedule:', error);
      setMessage('New due date saved on this device. It will sync when Supabase is available.');
    }
      },
    });
  };

  const editTask = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title || '',
      description: task.description || '',
      purok: task.purok || '',
      priority: task.priority || 'Normal',
      due_date: task.due_date || '',
      assigned_to_user_id: task.assigned_to_user_id || '',
    });
    setShowForm(true);
  };

  const inputClass = `box-border w-full min-w-0 rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8F65FF]/30 ${
    darkMode
      ? 'border-[#67445F] bg-[#302338] text-white placeholder:text-slate-400'
      : 'border-[#E8DCEF] bg-white text-gray-800'
  }`;
  const mutedTextClass = darkMode ? 'text-slate-300' : 'text-gray-600';
  const modalClass = darkMode
    ? 'border border-[#67445F] bg-[#2B2038] text-white'
    : 'bg-white text-gray-900';

  return (
    <div className={`space-y-5 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === f
                  ? 'text-white shadow-md'
                  : darkMode
                    ? 'border border-[#67445F] bg-[#302338] text-slate-200 hover:bg-[#392A45]'
                    : 'border border-[#E8DCEF] bg-white text-gray-600 hover:bg-purple-50'
              }`}
              style={filter === f ? { background: darkMode ? 'linear-gradient(90deg,#A66AD1,#D94E9F)' : 'linear-gradient(90deg,#8F65FF,#FF75C3)' } : {}}
            >
              {f} <span className="opacity-75">· {counts[f]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); void load(); }}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md"
          style={{ background: 'linear-gradient(100deg,#F0A0D4 0%,#D94E9F 100%)' }}
        >
          <Plus size={18} /> New task
        </button>
      </div>

      {message && (
        <div className={`flex justify-between rounded-xl px-4 py-3 text-sm ${darkMode ? 'bg-[#392A45] text-pink-100' : 'bg-violet-50 text-violet-800'}`}>
          {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Task grid */}
      {visible.length === 0 ? (
        <div className={`rounded-3xl border-2 border-dashed p-12 text-center ${
          darkMode ? 'border-[#67445F] bg-[#2B2038]' : 'border-[#E8C4F0] bg-white/60'
        }`}>
          <TaskIcon size={48} className="mx-auto text-[#8F65FF]/70" />
          <p className={`mt-3 font-semibold ${darkMode ? 'text-white' : 'text-gray-700'}`}>No tasks here yet</p>
          <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-500'}`}>Create a task and assign it to a BHW.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const overdue = isTaskOverdue(t);
            const displayedStatus = overdue ? 'Overdue' : t.status;
            return (
              <article
                key={t.task_id}
                className={`group relative rounded-3xl border p-5 shadow-sm transition hover:shadow-lg ${
                  darkMode
                    ? 'border-[#67445F] bg-gradient-to-br from-[#2B2038] to-[#35263D] hover:shadow-black/30'
                    : 'border-[#E8C4F0] bg-gradient-to-br from-white to-[#FAF5FF]'
                }`}
              >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${PRIORITY_STYLE[t.priority]}`}>
                  <Flag size={11} className="mr-1 inline" />
                  {t.priority}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  overdue ? 'bg-rose-100 text-rose-700' : STATUS_STYLE[t.status]
                }`}>
                  {displayedStatus}
                </span>
              </div>

              <h3 className={`text-base font-bold leading-snug ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t.title}</h3>
              {t.description && (
                <p className={`mt-1 line-clamp-2 text-sm ${mutedTextClass}`}>{t.description}</p>
              )}

              <div className={`mt-4 space-y-1.5 text-xs ${mutedTextClass}`}>
                <p className="flex items-center gap-1.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#8F65FF] to-[#FF75C3] text-[10px] font-bold text-white">
                    {(bhwName(t.assigned_to_user_id) || '?').charAt(0).toUpperCase()}
                  </span>
                  {bhwName(t.assigned_to_user_id)}
                </p>
                {t.purok && (
                  <p className="flex items-center gap-1.5"><MapPin size={13} /> {t.purok}</p>
                )}
                {t.due_date && (
                  <p className={`flex items-center gap-1.5 ${isTaskOverdue(t) ? 'font-bold text-rose-300' : ''}`}>
                    <Calendar size={13} /> Due {t.due_date} {isTaskOverdue(t) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px]">Overdue</span>}
                  </p>
                )}
              </div>

              <div className="absolute bottom-3 right-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => editTask(t)}
                  className={`rounded-full p-2 transition hover:bg-violet-50 hover:text-violet-600 ${darkMode ? 'text-slate-300' : 'text-gray-400'}`}
                  aria-label="Edit task"
                >
                  <Edit size={15} />
                </button>
                {overdue && (
                  <button
                    type="button"
                    onClick={() => openReschedule(t)}
                    className="flex items-center gap-1 rounded-full bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                    aria-label={`Reschedule ${t.title}`}
                  >
                    <Calendar size={14} /> Re-schedule
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteTask(t.task_id)}
                  className={`rounded-full p-2 transition hover:bg-rose-50 hover:text-rose-600 ${darkMode ? 'text-slate-300' : 'text-gray-400'}`}
                  aria-label="Delete task"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              </article>
            );
          })}
        </div>
      )}

      {reschedulingTask && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveReschedule}
            className={`w-full max-w-sm space-y-4 rounded-3xl p-6 shadow-2xl ${modalClass}`}
          >
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Re-schedule task</h2>
              <button
                type="button"
                onClick={() => setReschedulingTask(null)}
                aria-label="Close reschedule dialog"
              >
                <X size={20} />
              </button>
            </div>
            <p className={`text-sm ${mutedTextClass}`}>{reschedulingTask.title}</p>
            <label className={`block text-xs font-semibold ${mutedTextClass}`}>
              New due date
              <input
                type="date"
                required
                min={localDateInputValue()}
                className={`${inputClass} mt-1`}
                value={rescheduleDate}
                onChange={(event) => setRescheduleDate(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReschedulingTask(null)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  darkMode ? 'border-slate-600 text-slate-200 hover:bg-white/10' : 'border-gray-200 text-gray-600'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(90deg,#8F65FF,#FF75C3)' }}
              >
                Save new date
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveTask}
            className={`w-full max-w-lg space-y-4 rounded-3xl p-6 shadow-2xl ${modalClass}`}
          >
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{editingTask ? 'Edit task' : 'New task'}</h2>
              <button type="button" onClick={() => { setShowForm(false); setEditingTask(null); setForm(emptyForm); }} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <label className={`block text-xs font-semibold ${mutedTextClass}`}>
              Task title
              <input
                className={`${inputClass} mt-1`}
                required
                placeholder="e.g. Weigh children in Purok 3"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className={`block text-xs font-semibold ${mutedTextClass}`}>
              Task details (optional)
              <textarea
                className={`${inputClass} mt-1`}
                rows="3"
                placeholder="Add instructions for the BHW"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`block text-xs font-semibold ${mutedTextClass}`}>
                Assign to approved BHW
                <select
                  className={`${inputClass} mt-1`}
                  required
                  value={form.assigned_to_user_id}
                  onChange={(e) => setForm({ ...form, assigned_to_user_id: e.target.value })}
                >
                  <option value="">Select approved BHW…</option>
                  {bhws.map((b) => (
                    <option key={b.id} value={b.id}>{b.full_name || b.email}</option>
                  ))}
                </select>
              </label>
              <label className={`block min-w-0 text-xs font-semibold ${mutedTextClass}`}>
                Purok
                <input
                  type="text"
                  className={`${inputClass} mt-1`}
                  placeholder="Purok"
                  value={form.purok}
                  onChange={(e) => setForm({ ...form, purok: e.target.value })}
                />
              </label>
              <label className={`block min-w-0 text-xs font-semibold ${mutedTextClass}`}>
                Priority
                <select
                  className={`${inputClass} mt-1`}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className={`block text-xs font-semibold ${mutedTextClass}`}>
                Due date
                <input
                  type="date"
                  className={`${inputClass} mt-1`}
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </label>
            </div>

            {bhwLoadError && <p className="text-xs text-amber-700">{bhwLoadError}</p>}
            {!bhwLoadError && bhws.length === 0 && (
              <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-gray-500'}`}>No approved BHW accounts found in Supabase.</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full py-3 font-bold text-white shadow-md disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg,#8F65FF,#FF75C3)' }}
            >
              {busy ? 'Saving…' : editingTask ? 'Save changes' : 'Assign task'}
            </button>
          </form>
        </div>
      )}
      <ConfirmActionDialog
        open={Boolean(confirmation)}
        title={confirmation?.title || 'Confirm changes'}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel || 'Save'}
        destructive={confirmation?.destructive}
        busy={confirmationBusy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}