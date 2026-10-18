import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
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
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTasks([]);
      return;
    }
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to_user_id', user.id)
      .order('created_at', { ascending: false });
    setTasks(data || []);
  }, []);

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await load();

      channel = supabase
        .channel(`my-tasks-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tasks', filter: `assigned_to_user_id=eq.${user.id}` },
          (payload) => {
            const t = payload.new;
            setTasks((prev) => [t, ...prev]);
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
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!banner) return undefined;
    const timer = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [banner]);

  const advance = async (t) => {
    const next = NEXT_STATUS[t.status] || 'Pending';
    await supabase
      .from('tasks')
      .update({ status: next, completed_at: next === 'Completed' ? new Date().toISOString() : null })
      .eq('task_id', t.task_id);
    load();
  };

  const enableAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    setPermission(await Notification.requestPermission());
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

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">
          My tasks <span className="text-sm font-semibold text-violet-600">· {open.length} open</span>
        </h2>
        {permission === 'default' && (
          <button
            type="button"
            onClick={enableAlerts}
            className="flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700"
          >
            <Bell size={13} /> Turn on alerts
          </button>
        )}
      </div>

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