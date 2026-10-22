import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import {
  cacheBhwProfiles,
  createLocalTaskId,
  deleteTaskLocally,
  getCachedBhwProfiles,
  getLocalTasks,
  loadTasks,
  saveTaskLocally,
  syncPendingTasks,
  isTaskOverdue,
} from '../utils/taskSyncService';
import { ClipboardList, Plus, Trash2, Calendar, MapPin, Flag, X, Edit } from 'lucide-react';

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

export default function AdminTasks() {
  const [tasks, setTasks] = useState([]);
  const [bhws, setBhws] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [bhwLoadError, setBhwLoadError] = useState('');

  const load = async () => {
    try {
      const taskData = await loadTasks();
      setTasks(taskData);
    } catch (error) {
      console.error('Could not load tasks:', error);
      setTasks(getLocalTasks());
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
      refresh();
    };
    const handleStorage = (event) => {
      if (event.key === 'nutrigrid_tasks' || event.key === 'nutrigrid_pending_task_changes') refresh();
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
    window.addEventListener('online', sync);
    window.addEventListener('bns-tasks-changed', refresh);
    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
      window.removeEventListener('bns-tasks-changed', refresh);
      window.removeEventListener('storage', handleStorage);
      supabase.removeChannel(channel);
    };
  }, []);

  const bhwName = (id) => {
    const b = bhws.find((x) => x.id === id);
    return b ? b.full_name || b.email : 'Unassigned';
  };

  const counts = useMemo(
    () => ({
      All: tasks.length,
      Pending: tasks.filter((t) => t.status === 'Pending').length,
      Overdue: tasks.filter((t) => isTaskOverdue(t)).length,
      'In Progress': tasks.filter((t) => t.status === 'In Progress').length,
      Completed: tasks.filter((t) => t.status === 'Completed').length,
    }),
    [tasks]
  );

  const visible = (filter === 'All'
    ? tasks
    : filter === 'Overdue'
      ? tasks.filter((t) => isTaskOverdue(t))
      : tasks.filter((t) => t.status === filter)
  ).sort((left, right) => Number(isTaskOverdue(right)) - Number(isTaskOverdue(left)));

  const saveTask = async (e) => {
    e.preventDefault();
    if (!form.assigned_to_user_id) {
      setMessage('Choose a BHW to assign this task to.');
      return;
    }
    setBusy(true);
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
    saveTaskLocally(task);
    setTasks(getLocalTasks());
    setForm(emptyForm);
    setShowForm(false);
    setEditingTask(null);

    try {
      const result = await syncPendingTasks();
      if (result.errors?.length || result.skipped) {
        setMessage('Saved on this device. The task will sync when this device is online and signed in.');
      } else if (result.migrationPending) {
        setMessage('Saved on this device. Apply the latest task migration in Supabase to sync overdue details.');
      } else if (result.notificationErrors?.length) {
        setMessage(`Task saved, but push notification was not sent: ${result.notificationErrors[0]}`);
      } else {
        setMessage(`${editingTask ? 'Task updated' : 'Task assigned'} to ${bhwName(task.assigned_to_user_id)}.`);
        await load();
      }
    } catch (error) {
      console.error('Could not sync task:', error);
      setMessage('Saved on this device. The task will sync when Supabase is available.');
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return;
    deleteTaskLocally(id);
    setTasks(getLocalTasks());
    try {
      const result = await syncPendingTasks();
      setMessage(result.errors?.length || result.skipped
        ? 'Deleted on this device. The deletion will sync when online.'
        : 'Task deleted.');
    } catch (error) {
      console.error('Could not sync task deletion:', error);
      setMessage('Deleted on this device. The deletion will sync when Supabase is available.');
    }
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

  const inputClass =
    'w-full rounded-xl border border-[#E8DCEF] bg-white px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#8F65FF]/30';

  return (
    <div className="space-y-5">
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
                  : 'bg-white text-gray-600 border border-[#E8DCEF] hover:bg-purple-50'
              }`}
              style={filter === f ? { background: 'linear-gradient(90deg,#8F65FF,#FF75C3)' } : {}}
            >
              {f} <span className="opacity-75">· {counts[f]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => editTask(t)}
          className="absolute right-12 bottom-3 rounded-full p-2 text-gray-400 opacity-0 transition hover:bg-violet-50 hover:text-violet-600 group-hover:opacity-100"
          aria-label="Edit task"
        >
          <Edit size={15} />
        </button>
        <button
          type="button"
          onClick={() => { setShowForm(true); void load(); }}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md"
          style={{ background: 'linear-gradient(90deg,#8F65FF,#FF75C3)' }}
        >
          <Plus size={18} /> New task
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800 flex justify-between">
          {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Task grid */}
      {visible.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#E8C4F0] bg-white/60 p-12 text-center">
          <ClipboardList size={40} className="mx-auto text-[#8F65FF]/50" />
          <p className="mt-3 font-semibold text-gray-700">No tasks here yet</p>
          <p className="text-sm text-gray-500">Create a task and assign it to a BHW.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <article
              key={t.task_id}
              className="group relative rounded-3xl border border-[#E8C4F0] bg-gradient-to-br from-white to-[#FAF5FF] p-5 shadow-sm transition hover:shadow-lg"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${PRIORITY_STYLE[t.priority]}`}>
                  <Flag size={11} className="mr-1 inline" />
                  {t.priority}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[t.status]}`}>
                  {t.status}
                </span>
              </div>

              <h3 className="text-base font-bold text-gray-900 leading-snug">{t.title}</h3>
              {t.description && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-600">{t.description}</p>
              )}

              <div className="mt-4 space-y-1.5 text-xs text-gray-600">
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
                  <p className={`flex items-center gap-1.5 ${isTaskOverdue(t) ? 'font-bold text-gray-400' : ''}`}>
                    <Calendar size={13} /> Due {t.due_date} {isTaskOverdue(t) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px]">Overdue</span>}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => deleteTask(t.task_id)}
                className="absolute right-3 bottom-3 rounded-full p-2 text-gray-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                aria-label="Delete task"
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveTask}
            className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingTask ? 'Edit task' : 'New task'}</h2>
              <button type="button" onClick={() => { setShowForm(false); setEditingTask(null); setForm(emptyForm); }} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <label className="block text-xs font-semibold text-gray-600">
              Task title
              <input
                className={`${inputClass} mt-1`}
                required
                placeholder="e.g. Weigh children in Purok 3"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Task details (optional)
              <textarea
                className={`${inputClass} mt-1`}
                rows="3"
                placeholder="Add instructions for the BHW"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-gray-600">
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
              <input
                className={inputClass}
                placeholder="Purok"
                value={form.purok}
                onChange={(e) => setForm({ ...form, purok: e.target.value })}
              />
              <select
                className={inputClass}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <label className="block text-xs font-semibold text-gray-600">
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
              <p className="text-xs text-gray-500">No approved BHW accounts found in Supabase.</p>
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
    </div>
  );
}