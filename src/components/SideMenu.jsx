import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { X, ChevronLeft, ChevronRight, Clock, Circle, LogOut } from 'lucide-react';
import MyTasks from './MyTasks';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Start of the week (Sunday) containing a date
const startOfWeek = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const DAY_TONES = [
  'from-[#DDEBFF] to-[#EAF3FF]',
  'from-[#E4DEFF] to-[#F0EBFF]',
  'from-[#FFE1F0] to-[#FFEFF7]',
  'from-[#FFEBD9] to-[#FFF4E8]',
  'from-[#DFF7EC] to-[#EEFBF4]',
];

const TASK_ICON_BG = ['bg-[#DDEBFF]', 'bg-[#FFE1F0]', 'bg-[#E4DEFF]', 'bg-[#FFEBD9]', 'bg-[#DFF7EC]'];

export default function SideMenu({ open, onClose, onLogout }) {
  const today = new Date();
  const todayKey = toKey(today);

  const [tasks, setTasks] = useState([]);
  const [anchor, setAnchor] = useState(() => startOfWeek(today));
  const [selected, setSelected] = useState(todayKey);
  const [showMonth, setShowMonth] = useState(false);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

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
      .select('task_id, title, status, due_date, priority, purok')
      .eq('assigned_to_user_id', user.id)
      .neq('status', 'Completed')
      .order('due_date', { ascending: true, nullsFirst: false });
    setTasks(data || []);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const taskCountByDay = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (t.due_date) map[t.due_date] = (map[t.due_date] || 0) + 1;
    });
    return map;
  }, [tasks]);

  // Seven days of the current week strip
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(anchor);
        d.setDate(anchor.getDate() + i);
        return d;
      }),
    [anchor]
  );

  const weekLabel = `Week of ${anchor.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
  const dayTasks = tasks.filter((t) => t.due_date === selected);
  const openCount = tasks.length;
  const selectedIsToday = selected === todayKey;

  const shiftWeek = (delta) =>
    setAnchor((a) => {
      const d = new Date(a);
      d.setDate(a.getDate() + delta * 7);
      return d;
    });

  // Full-month grid, shown when the calendar icon is tapped
  const monthCells = useMemo(() => {
    const first = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = Array(first).fill(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    return cells;
  }, [month]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/20 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Calendar and tasks"
        className={`fixed left-0 top-0 z-[70] flex h-full w-[88%] max-w-sm flex-col overflow-hidden bg-gradient-to-b from-[#DDEBFF] via-[#F4E8FF] to-[#FFE9F3] shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-7">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900">
              {selectedIsToday ? 'Good day' : 'Schedule'}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-gray-500">{weekLabel}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowMonth((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white shadow-sm text-[#8F65FF]"
              aria-label="Toggle month view"
            >
              <span className="text-[10px] font-extrabold">{month.getDate() && 'CAL'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white shadow-sm text-gray-700"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4 space-y-4">
          {/* Week strip */}
          {!showMonth && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                className="grid h-8 w-6 place-items-center text-gray-500"
                aria-label="Previous week"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="grid flex-1 grid-cols-7 gap-1.5">
                {week.map((d, i) => {
                  const key = toKey(d);
                  const isSel = key === selected;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(key)}
                      className={`flex flex-col items-center rounded-2xl py-2 transition ${
                        isSel
                          ? 'bg-gradient-to-b from-[#8F65FF] to-[#B388FF] text-white shadow-lg'
                          : 'bg-white text-gray-800 shadow-sm'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          isSel ? 'text-white/90' : isWeekend ? 'text-rose-500' : 'text-[#8F65FF]'
                        }`}
                      >
                        {WEEKDAYS[d.getDay()]}
                      </span>
                      <span className="mt-0.5 text-base font-extrabold">{d.getDate()}</span>
                      {taskCountByDay[key] > 0 && (
                        <span className={`mt-1 h-1 w-1 rounded-full ${isSel ? 'bg-white' : 'bg-[#FF75C3]'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                className="grid h-8 w-6 place-items-center text-gray-500"
                aria-label="Next week"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Month grid (toggled) */}
          {showMonth && (
            <div className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="p-1 text-gray-600"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <p className="text-sm font-bold text-gray-800">
                  {month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                </p>
                <button
                  type="button"
                  onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="p-1 text-gray-600"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-semibold text-gray-400">
                {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-y-1">
                {monthCells.map((d, i) => {
                  if (!d) return <span key={`e-${i}`} />;
                  const key = toKey(d);
                  const isSel = key === selected;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelected(key);
                        setAnchor(startOfWeek(d));
                        setShowMonth(false);
                      }}
                      className={`relative mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${
                        isSel ? 'bg-[#8F65FF] text-white' : 'text-gray-700 hover:bg-purple-50'
                      }`}
                    >
                      {d.getDate()}
                      {taskCountByDay[key] > 0 && (
                        <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${isSel ? 'bg-white' : 'bg-[#FF75C3]'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today card with progress */}
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-lg font-extrabold text-gray-900">
              {selectedIsToday ? 'Today' : selected}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              You have <span className="font-bold text-[#8F65FF]">{dayTasks.length}</span>{' '}
              {dayTasks.length === 1 ? 'task' : 'tasks'} due this day
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#F1ECF7]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8F65FF] to-[#FF75C3]"
                style={{ width: openCount ? `${Math.max(8, 100 - (dayTasks.length / openCount) * 100)}%` : '100%' }}
              />
            </div>
          </div>

          {/* Task cards for the selected day */}
          {dayTasks.length === 0 ? (
            <div className="rounded-3xl bg-white/70 p-6 text-center text-sm text-gray-500">
              Nothing due this day.
            </div>
          ) : (
            <ul className="space-y-3">
              {dayTasks.map((t, i) => {
                const Icon = t.status === 'In Progress' ? Clock : Circle;
                return (
                  <li
                    key={t.task_id}
                    className={`flex items-center justify-between rounded-3xl bg-gradient-to-r ${
                      DAY_TONES[i % DAY_TONES.length]
                    } p-4 shadow-sm`}
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-bold text-gray-900">{t.title}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                        <Clock size={11} />
                        {t.status}
                        {t.purok ? ` · ${t.purok}` : ''}
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          t.priority === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-white/80 text-[#8F65FF]'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                    <div
                      className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                        TASK_ICON_BG[i % TASK_ICON_BG.length]
                      }`}
                    >
                      <Icon size={22} className="text-[#8F65FF]" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {open && (
            <div className="rounded-3xl bg-white/80 p-3 shadow-sm">
              <MyTasks />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/70 p-4">
          <button
            type="button"
            onClick={async () => {
              onClose();
              await onLogout?.();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white/80 px-4 py-3 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50"
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}