import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import {
  getLocalTasks,
  loadTasks,
  saveTaskLocally,
  syncPendingTasks,
} from '../utils/taskSyncService';
import { registerPushToken } from '../utils/pushNotifications';
import { ClipboardList, Calendar, MapPin, Bell, CheckCircle2, Circle, Clock } from 'lucide-react';

const NEXT_STATUS = { Pending: 'In Progress', 'In Progress': 'Completed', Completed: 'Pending' };

const STEP_ICON = {
  Pending: Circle,
  'In Progress': Clock,
  Completed: CheckCircle2,
};

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [banner, setBanner] = useState(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [registeringPush, setRegisteringPush] = useState(false);
  const pushRegistrationAttempted = useRef(false);
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
      setTasks(await loadTasks({ assignedToUserId: user.id }));
    } catch (error) {
      console.error('Could not load assigned tasks:', error);
      setTasks(getLocalTasks().filter((task) => task.assigned_to_user_id === user.id));
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
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('New task assigned', { body: t.title, icon: '/icon-192.png' });
            }
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

  const advance = async (t) => {
    const next = NEXT_STATUS[t.status] || 'Pending';
    saveTaskLocally({
      ...t,
      status: next,
      completed_at: next === 'Completed' ? new Date().toISOString() : null,
    }, ['status', 'completed_at']);
    setTasks(getLocalTasks().filter((task) => task.assigned_to_user_id === t.assigned_to_user_id));
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

  const open = tasks.filter((t) => t.status !== 'Completed');

  return (
    <section className="space-y-3">
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
      {permission === 'denied' && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Notifications are blocked. Allow them for NutriGrid in your browser settings to receive task alerts.
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#E8C4F0] bg-white/70 p-6 text-center">
          <ClipboardList size={32} className="mx-auto text-[#8F65FF]/50" />
          <p className="mt-2 text-sm text-gray-600">No tasks assigned to you yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => {
            const Icon = STEP_ICON[t.status] || Circle;
            const done = t.status === 'Completed';
            return (
              <li
                key={t.task_id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  done ? 'border-emerald-200 opacity-70' : 'border-[#E8C4F0]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => advance(t)}
                    className="mt-0.5 shrink-0"
                    aria-label={`Mark as ${NEXT_STATUS[t.status]}`}
                  >
                    <Icon
                      size={24}
                      className={done ? 'text-emerald-500' : t.status === 'In Progress' ? 'text-blue-500' : 'text-gray-300'}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold text-gray-900 ${done ? 'line-through' : ''}`}>{t.title}</p>
                    {t.description && <p className="mt-0.5 text-sm text-gray-600">{t.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                      {t.purok && (
                        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                          <MapPin size={11} /> {t.purok}
                        </span>
                      )}
                      {t.due_date && (
                        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                          <Calendar size={11} /> {t.due_date}
                        </span>
                      )}
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
                <div className="mt-3 flex gap-1 rounded-full bg-gray-100 p-1 text-[11px] font-bold">
                  {['Pending', 'In Progress', 'Completed'].map((s) => (
                    <span
                      key={s}
                      className={`flex-1 rounded-full py-1 text-center transition ${
                        t.status === s
                          ? 'bg-gradient-to-r from-[#8F65FF] to-[#FF75C3] text-white shadow'
                          : 'text-gray-500'
                      }`}
                    >
                      {s}
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