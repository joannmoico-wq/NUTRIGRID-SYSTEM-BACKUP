import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STORAGE_KEYS,
  RECORDS_CHANGED_SIGNAL_KEY,
  deleteRecordById,
  upsertRecord,
  reloadAllAdminData,
  filterRecordsBySearch,
  recordMatchesSearch,
  getRecords,
  getRecordsWithPhotos,
  buildSavedRecords,
  performRecordSearch,
  getRecordDisplayTitle,
  storageKeyForCategory,
  categoryIdForStorageKey,
  queueRecordDeletion,
} from '../utils/bnsStorage';
import {
  deleteMonthlyReportLine,
  loadAdminDataFromSupabase,
  saveMonthlyReportLine,
} from '../utils/adminDataService';
import { syncPendingRecords, syncSingleRecord } from '../utils/syncService';
import { supabase } from '../utils/supabaseClient';
import MonthlyReportTable from './MonthlyReportTable';
import { NUTRI_GRID_THEME } from '../utils/nutriGridTheme';
import BnsSearchBar from './BnsSearchBar';
import AdminTasks from './AdminTasks';
import AdminReportTable, { ACTIONS_HEAD_CELL, ExpandableNote, ReportHeader, REPORT_META } from './AdminReportTable';
import InteractiveMapComponent from './InteractiveMapComponent';
import AdminDocuments from './AdminDocuments';
import ReportExportActions from './ReportExportActions';
import ConfirmActionDialog from './ConfirmActionDialog';
import {
  Home,
  Users,
  Archive,
  FileText,
  Settings,
  LogOut,
  Bell,
  Plus,
  Edit,
  Trash2,
  Heart,
  Baby,
  Moon,
  Sun,
  UserCircle,
  KeyRound,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  LayoutDashboard,
  Users2,
  Leaf,
  PersonStanding,
  CalendarDays,
  BarChart3,
  Folder,
  ClipboardCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getCategoryForm } from './CategorySpecificForms';
import { normalizePurokName, PUROK_OPTIONS, sortPurokCounts, getPurokNumber } from '../utils/purok';
import { isTaskOverdue } from '../utils/taskSyncService';
import { calculateMonthlyTrend } from '../utils/recordTrends';
import { calculateWhoGrowthStatuses } from '../utils/childGrowth';
import {
  getActivityCategoryLabel,
  loadRecordActivityLogs,
  recordInformationEdit,
} from '../utils/activityLogService';
import nutrigridIcon from '../public/icon-192.png';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip,
  Line,
  LineChart,
} from 'recharts';

const THEME = {
  accentGradient: 'linear-gradient(90deg, #8F65FF 0%, #FF75C3 100%)',
  accentPink: '#FF75C3',
  accentPurple: '#8F65FF',
  light: {
    page: '#F9F5FB',
    pageGradient: 'linear-gradient(160deg, #F3E8FF 0%, #FAF0F8 45%, #FFF0F6 100%)',
    sidebarGradient: NUTRI_GRID_THEME.sidebarGradient,
    main: '#FAF7FC',
    card: '#FFFCFE',
    surface: '#FFF5FA',
    input: '#FFFFFF',
    text: '#2D2D3A',
    muted: '#6B6B80',
    border: '#E8DCEF',
  },
  dark: {
    page: '#1D1D2C',
    sidebar: '#1D1D2C',
    card: '#26263B',
    text: '#FFFFFF',
    muted: '#A0A0B8',
    border: '#333348',
  },
};

const DARK_MODE_KEY = 'bns_admin_dark_mode';
const READ_NOTIFICATIONS_KEY = 'nutrigrid_admin_read_notifications';

const ADMIN_FORM_TITLES = {
  residents: 'Residents - New Visit',
  environmental: 'Environmental Sanitation - New Report',
  infantfeeding: 'Infant Feeding - New Record',
  lactatingwoman: 'Lactating Woman - New Registration',
  pregnantwoman: 'Pregnant Woman - New Registration',
  monthlynatal: 'Monthly Natality - New Record',
};

const ADMIN_FORM_GRADIENTS = {
  residents: 'linear-gradient(90deg, #3B82F6 0%, #1D4ED8 100%)',
  environmental: 'linear-gradient(90deg, #10B981 0%, #15803D 100%)',
  infantfeeding: 'linear-gradient(90deg, #8B5CF6 0%, #7E22CE 100%)',
  lactatingwoman: 'linear-gradient(90deg, #F43F5E 0%, #DC2626 100%)',
  pregnantwoman: 'linear-gradient(90deg, #F472B6 0%, #F43F5E 100%)',
  monthlynatal: 'linear-gradient(90deg, #FBBF24 0%, #CA8A04 100%)',
};

const BNS_RHM_SIGNATURE_OPTIONS = [
  { id: 'bns', label: 'BNS', role: 'Barangay Nutrition Scholar' },
  { id: 'rhm', label: 'RURAL MIDWIFE', role: 'Rural Health Midwife' },
];

const BNS_RHM_RHMPP_NDP_SIGNATURE_OPTIONS = [
  { id: 'bns', label: 'BNS', role: 'Barangay Nutrition Scholar' },
  { id: 'rhm', label: 'RHM/RHMPP/NDP', role: 'RHM/RHMPP/NDP' },
];

const NOTIF_LABELS = {
  [STORAGE_KEYS.residents]: 'Residents',
  [STORAGE_KEYS.environmental]: 'Environmental Sanitation',
  [STORAGE_KEYS.infantfeeding]: 'Infant Feeding',
  [STORAGE_KEYS.lactatingwoman]: 'Lactating Woman',
  [STORAGE_KEYS.pregnantwoman]: 'Pregnant Woman',
  [STORAGE_KEYS.monthlynatal]: 'Monthly Natality',
  [STORAGE_KEYS.pendingVisits]: 'Pending field visits',
};

function getNutritionCareNeeds(records) {
  const latestRecords = new Map();
  records.forEach((record, index) => {
    const raw = record._raw || record;
    const childName = String(raw.child_name || raw.name_of_child || record.childName || '').trim();
    const birthday = raw.dob || record.dob || '';
    const childKey = `${normalizePurokName(raw.purok || record.purok) || ''}:${birthday}:${childName.toLowerCase() || record.id || index}`;
    const dateValue =
      raw.updated_at ||
      record.updated_at ||
      raw.updatedAt ||
      record.updatedAt ||
      raw.dow ||
      record.dow ||
      raw.created_at ||
      record.created_at ||
      '';
    const timestamp = Date.parse(dateValue) || 0;
    const previous = latestRecords.get(childKey);
    if (!previous || timestamp >= previous.timestamp) {
      latestRecords.set(childKey, { record, raw, childName, timestamp });
    }
  });

  return Array.from(latestRecords.values()).flatMap(({ record, raw, childName, timestamp }) => {
    const computed = calculateWhoGrowthStatuses({
      sex: ({
        male: 'boys',
        female: 'girls',
      }[String(raw.sex || record.sex || '').toLowerCase()] || String(raw.sex || record.sex || '').toLowerCase()),
      birthday: raw.dob || record.dob,
      weighingDate: raw.dow || record.dow,
      weightKg: raw.weight_kg ?? raw.wt_kg ?? record.weight,
      lengthCm: raw.length_cm ?? record.length,
      heightCm: raw.height_cm ?? raw.ht_cm ?? record.height,
    });
    const statuses = [
      raw.w_a || record.wA || computed.w_a,
      raw.h_a || record.hA || computed.h_a,
      raw.w_l_h || record.wLH || computed.w_l_h,
    ].map((status) => String(status || '').trim().toLowerCase());
    const needsNutritionSupport = statuses.some((status) =>
      status.includes('underweight') || status.includes('stunted') || status.includes('wasted')
    );
    if (!needsNutritionSupport) return [];

    const riskStatuses = statuses.filter((status) =>
      status.includes('underweight') || status.includes('stunted') || status.includes('wasted')
    );
    const recordId = String(record.id || `${childName}-${raw.dow || record.dow || ''}`);
    return [{
      id: `${recordId}:${timestamp}:${riskStatuses.join('|')}`,
      recordId,
      name: childName || 'Child',
      purok: raw.purok || record.purok || '',
      statuses: riskStatuses,
      timestamp,
    }];
  });
}

// Header uses ONLY darkMode for styling. The notification dropdown
// must never change the header's colors.
const AdminHeader = ({
  title,
  darkMode,
  adminName,
  searchTerm,
  setSearchTerm,
  performSearch,
  searchResults,
  setSearchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  showNotifications,
  setShowNotifications,
  notifications,
  visibleNotificationItems,
  onNotificationClick,
  notifRef,
  setDarkMode,
  setActiveTab,
  setSelectedTaskFilter,
  activeTab,
  adminEmail,
  onLogout,
  showActivityLogs,
  setShowActivityLogs,
  activityLogs,
  activityLogLoading,
  activityLogError,
  currentUserId,
  showOnlyMyActivity,
  setShowOnlyMyActivity,
  selectedActivityId,
}) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [activityMonth, setActivityMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const accountRef = useRef(null);
  const activityRef = useRef(null);
  const textColor = darkMode ? THEME.dark.text : THEME.light.text;
  const mutedColor = darkMode ? THEME.dark.muted : THEME.light.muted;
  const iconButtonStyle = {
    backgroundColor: darkMode ? THEME.dark.card : THEME.light.input,
    border: `1px solid ${darkMode ? THEME.dark.border : THEME.light.border}`,
  };

  useEffect(() => {
    const closeAccountMenu = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
      if (activityRef.current && !activityRef.current.contains(event.target)) {
        setShowActivityLogs(false);
      }
    };
    document.addEventListener('mousedown', closeAccountMenu);
    return () => document.removeEventListener('mousedown', closeAccountMenu);
  }, [setShowActivityLogs]);

  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5">
      <h1 className="text-xl font-bold sm:text-2xl" style={{ color: textColor }}>
        {title || `Welcome ${adminName.split(' ')[0]} !`}
      </h1>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
        <BnsSearchBar
          query={searchTerm}
          onSearch={performSearch}
          results={searchResults}
          showSuggestions={showSearchSuggestions}
          onSelectResult={(record) => {
            if (record.isNav) {
              setActiveTab(record.tab);
            } else if (record.categoryId === 'tasks') {
              const task = record.data;
              setSelectedTaskFilter(
                isTaskOverdue(task)
                  ? 'Overdue'
                  : task.status === 'In Progress'
                    ? 'In Progress'
                    : task.status === 'Completed'
                      ? 'Completed'
                      : 'Pending'
              );
              setSearchTerm('');
              setSearchResults([]);
              setActiveTab('tasks');
            } else if (record.categoryId === 'documents') {
              setSearchTerm(record.data.name || '');
              setActiveTab('documents');
              setShowSearchSuggestions(false);
            } else {
              setShowSearchSuggestions(false);
              setActiveTab(record.tab);
            }
          }}
          onFocusSuggestions={() => setShowSearchSuggestions(true)}
          onBlurSuggestions={() => setShowSearchSuggestions(false)}
          placeholder={
            activeTab === 'tasks'
              ? 'Search tasks...'
              : activeTab === 'documents'
                ? 'Search documents...'
                : 'Search records...'
          }
          emptyMessage="No matching records"
          widthClass="w-36 sm:w-56 md:w-72 lg:w-80"
          tone="admin"
          darkMode={darkMode}
        />

        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center hover:opacity-95 transition shadow-sm"
          style={iconButtonStyle}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            <Sun size={18} style={{ color: THEME.accentPink }} />
          ) : (
            <Moon size={18} style={{ color: THEME.accentPurple }} />
          )}
        </button>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setShowActivityLogs(false);
              setShowNotifications((open) => !open);
            }}
            className={`relative w-10 h-10 rounded-2xl flex items-center justify-center hover:opacity-95 transition shadow-sm ${
              showNotifications ? 'ring-2 ring-[#8F65FF]/40' : ''
            }`}
            style={iconButtonStyle}
            aria-label="Notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={18} style={{ color: mutedColor }} />

            {notifications > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 text-white text-xs rounded-full flex items-center justify-center font-bold"
                style={{ background: THEME.accentGradient }}
              >
                {notifications > 99 ? '99+' : notifications}
              </span>
            )}
          </button>

          {showNotifications && (
            <div
              className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-3xl shadow-xl z-50"
              style={{
                backgroundColor: darkMode ? THEME.dark.card : THEME.light.card,
                border: `1px solid ${darkMode ? THEME.dark.border : THEME.light.border}`,
              }}
            >
              <div className="p-4 border-b" style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}>
                <p className="font-semibold text-sm" style={{ color: textColor }}>
                  Notifications ({notifications})
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}>
                {visibleNotificationItems.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: mutedColor }}>
                    No notifications
                  </div>
                ) : (
                  visibleNotificationItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNotificationClick(item)}
                      className="w-full p-3 text-left transition hover:bg-pink-50/70 dark:hover:bg-white/10"
                    >
                      <p className="text-sm font-medium" style={{ color: textColor }}>
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: mutedColor }}>
                        {item.detail}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="relative" ref={activityRef}>
          <button
            type="button"
            onClick={() => {
              setShowNotifications(false);
              setShowActivityLogs((open) => !open);
            }}
            className={`relative flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm transition hover:opacity-95 ${
              showActivityLogs ? 'ring-2 ring-[#8F65FF]/40' : ''
            }`}
            style={iconButtonStyle}
            aria-label="Activity logs"
            title="Activity logs"
            aria-expanded={showActivityLogs}
          >
            <Archive size={18} style={{ color: mutedColor }} />
          </button>
          {showActivityLogs && (
            <div
              className="absolute right-0 z-50 mt-2 max-h-[min(30rem,75vh)] w-[min(22rem,calc(100vw-2rem))] overflow-visible rounded-3xl shadow-xl"
              style={{
                backgroundColor: darkMode ? THEME.dark.card : THEME.light.card,
                border: `1px solid ${darkMode ? THEME.dark.border : THEME.light.border}`,
              }}
            >
              <ActivityLogsView
                logs={activityLogs}
                loading={activityLogLoading}
                error={activityLogError}
                darkMode={darkMode}
                currentUserId={currentUserId}
                showOnlyMine={showOnlyMyActivity}
                onToggleMine={setShowOnlyMyActivity}
                selectedMonth={activityMonth}
                onMonthChange={setActivityMonth}
                selectedActivityId={selectedActivityId}
              />
            </div>
          )}
        </div>
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            onClick={() => {
              setShowActivityLogs(false);
              setShowAccountMenu((open) => !open);
              setShowNotifications(false);
              setAccountMessage('');
            }}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm hover:opacity-95 transition ${
              showAccountMenu ? 'ring-2 ring-[#8F65FF]/40' : ''
            }`}
            style={iconButtonStyle}
            aria-label="Account options"
            aria-expanded={showAccountMenu}
          >
            <UserCircle size={19} style={{ color: mutedColor }} />
          </button>
          {showAccountMenu && (
            <div
              className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border p-2 shadow-xl"
              style={{
                backgroundColor: darkMode ? THEME.dark.card : THEME.light.card,
                borderColor: darkMode ? THEME.dark.border : THEME.light.border,
              }}
            >
              <p className="truncate px-3 py-2 text-xs" style={{ color: mutedColor }}>{adminEmail}</p>
              <button
                type="button"
                disabled={accountBusy || !adminEmail}
                onClick={async () => {
                  setAccountBusy(true);
                  setAccountMessage('');
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(adminEmail);
                    if (error) throw new Error(error.message);
                    setAccountMessage('Password reset instructions sent to your email.');
                  } catch (error) {
                    console.error('Could not send admin password reset:', error);
                    setAccountMessage(`Could not send reset email: ${error.message}`);
                  } finally {
                    setAccountBusy(false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-violet-50 disabled:opacity-60"
                style={{ color: textColor }}
              >
                <KeyRound size={16} /> Reset password
              </button>
              <button
                type="button"
                disabled={accountBusy}
                onClick={async () => {
                  if (!window.confirm('Permanently delete this approved admin account? This cannot be undone.')) return;
                  setAccountBusy(true);
                  setAccountMessage('');
                  try {
                    const { error } = await supabase.functions.invoke('delete-own-account');
                    if (error) throw new Error(error.message);
                    await onLogout?.();
                  } catch (error) {
                    console.error('Could not delete admin account:', error);
                    setAccountMessage(`Account deletion failed: ${error.message}`);
                  } finally {
                    setAccountBusy(false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 size={16} /> Delete account
              </button>
              {accountMessage && <p role="status" className="px-3 py-2 text-xs text-violet-700">{accountMessage}</p>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

function getActivityActorDisplayName(actorName) {
  const name = String(actorName || '').replace(/^BHW\s+/i, '').trim();
  return name || 'Field Worker';
}

function ActivityLogsView({
  logs,
  loading,
  error,
  darkMode,
  currentUserId,
  showOnlyMine,
  onToggleMine,
  selectedMonth,
  onMonthChange,
  selectedActivityId,
}) {
  const actorLogs = showOnlyMine
    ? logs.filter((log) => log.actor_user_id === currentUserId)
    : logs.filter((log) => ['field_worker', 'bhw'].includes(String(log.actor_role || '').toLowerCase()));
  const visibleLogs = actorLogs.filter((log) => {
    const date = new Date(log.created_at);
    if (Number.isNaN(date.getTime())) return false;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === selectedMonth;
  });

  return (
    <section className="space-y-2">
      <div className="flex w-full flex-col gap-2 border-b px-3 py-2.5" style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}>
        <h2 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Activity Logs</h2>
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Choose whose edits to show</span>
            <select
              value={showOnlyMine ? 'mine' : 'bhw'}
              onChange={(event) => onToggleMine(event.target.value === 'mine')}
              className={`w-full appearance-none rounded-lg border py-1.5 pl-2 pr-7 text-center text-[11px] font-bold tracking-wide shadow-sm transition focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                darkMode
                  ? 'border-slate-600 bg-[#26263B] text-slate-100'
                  : 'border-[#E8DCEF] bg-white text-gray-800'
              }`}
            >
              <option value="bhw">BHW Modified</option>
              <option value="mine">User Revised</option>
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
          </label>
          <MonthYearPicker
            value={selectedMonth}
            onChange={onMonthChange}
            max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
            darkMode={darkMode}
            compact
            label="Filter activity logs by month and year"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {error}
        </p>
      )}
      {loading && logs.length === 0 ? (
        <p className={`p-4 text-center text-xs ${darkMode ? 'text-slate-300' : 'text-gray-500'}`}>
          Loading activity…
        </p>
      ) : visibleLogs.length === 0 ? (
        <p className={`p-4 text-center text-xs ${darkMode ? 'text-slate-300' : 'text-gray-500'}`}>
          {showOnlyMine
            ? 'You have not edited any records in this month.'
            : 'No BHW record edits have been logged for this month.'}
        </p>
      ) : (
        <div className="max-h-[min(20rem,55vh)] space-y-2 overflow-y-auto px-2 pb-2">
          {visibleLogs.map((log) => {
            const changes = Array.isArray(log.field_changes) ? log.field_changes : [];
            return (
              <article
                key={log.id}
                className={`rounded-xl border p-2.5 ${
                  log.id === selectedActivityId
                    ? 'border-violet-400 ring-2 ring-violet-300/70'
                    : darkMode
                      ? 'border-slate-700 bg-[#26263B]'
                      : 'border-[#E8DCEF] bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-xs font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      BHW {getActivityActorDisplayName(log.actor_name)} updated {getActivityCategoryLabel(log.category)}
                    </h3>
                    <p className={`mt-0.5 text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Record {log.record_id} · {new Date(log.created_at).toLocaleString()}
                      {log.pending_sync ? ' · Waiting to sync' : ''}
                    </p>
                  </div>
                </div>
                {changes.length > 0 && (
                  <ul className={`mt-1 divide-y ${darkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                    {changes.map((change, index) => (
                      <li key={`${log.id}-${change.field || index}`} className="grid grid-cols-[minmax(5rem,0.4fr)_minmax(0,1fr)] gap-1 py-1 text-[11px]">
                        <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                          {change.label || change.field}
                        </span>
                        <span className={`${darkMode ? 'text-slate-300' : 'text-gray-600'} break-words`}>
                          {change.old_value || '—'} <span aria-label="changed to" className="px-1 font-bold text-violet-500">→</span> {change.new_value || '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MonthYearPicker({ value, onChange, min, max, darkMode = false, compact = false, label }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const [selectedYear, selectedMonth] = /^\d{4}-\d{2}$/.test(value)
    ? value.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];
  const currentYear = new Date().getFullYear();
  const minYear = min ? Number(min.slice(0, 4)) : 2000;
  const maxYear = max ? Number(max.slice(0, 4)) : currentYear;
  const years = Array.from(
    { length: Math.max(1, maxYear - minYear + 1) },
    (_, index) => minYear + index
  );
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const formatMonthValue = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const yearSelectClass = `w-full appearance-none rounded-md border pl-3 pr-9 font-bold focus:outline-none focus:ring-2 focus:ring-violet-300 ${
    compact ? 'py-1.5 text-xs' : 'py-2 text-sm'
  } ${
    darkMode
      ? 'border-slate-600 bg-[#302338] text-white'
      : 'border-gray-200 bg-gray-100 text-gray-800'
  }`;

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center justify-between rounded-xl border font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${
          compact ? 'min-h-9 min-w-0 gap-1.5 px-2 py-1.5 text-[10px]' : 'min-h-11 min-w-40 gap-3 px-3 py-2 text-sm'
        } ${
          darkMode
            ? 'border-[#67445F] bg-[#302338] text-[#FCE7F3]'
            : 'border-gray-300 bg-white text-gray-800'
        }`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={compact ? 'whitespace-nowrap' : ''}>
          {new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('en', { month: compact ? 'short' : 'long', year: 'numeric' })}
        </span>
        <ChevronDown size={compact ? 13 : 16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-[100] mt-2 rounded-xl border p-3 shadow-xl ${
            compact ? 'w-56' : 'w-64'
          } ${
            darkMode ? 'border-[#67445F] bg-[#26263B]' : 'border-gray-200 bg-white'
          }`}
          role="dialog"
          aria-label={label}
        >
          <label className="relative mb-2 block">
            <span className="sr-only">Choose year</span>
            <select
              value={selectedYear}
              onChange={(event) => {
                const year = Number(event.target.value);
                let month = Math.min(selectedMonth, 12);
                let candidate = formatMonthValue(year, month);
                if (min && candidate < min) {
                  month = year === minYear ? Number(min.slice(5, 7)) : 1;
                  candidate = formatMonthValue(year, month);
                }
                if (max && candidate > max) {
                  month = year === maxYear ? Number(max.slice(5, 7)) : 12;
                  candidate = formatMonthValue(year, month);
                }
                if ((!min || candidate >= min) && (!max || candidate <= max)) onChange(candidate);
              }}
              className={yearSelectClass}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <ChevronDown
              size={compact ? 14 : 16}
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}
              aria-hidden="true"
            />
          </label>
          <div className={`grid grid-cols-3 ${compact ? 'gap-1' : 'gap-1.5'}`}>
            {monthNames.map((name, index) => {
              const month = index + 1;
              const monthValue = formatMonthValue(selectedYear, month);
              const disabled = Boolean((min && monthValue < min) || (max && monthValue > max));
              const selectedMonthValue = formatMonthValue(selectedYear, selectedMonth);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(monthValue);
                    setOpen(false);
                  }}
                  className={`rounded-lg px-2 font-medium disabled:cursor-not-allowed disabled:opacity-35 ${
                    compact ? 'py-1.5 text-xs' : 'py-2 text-sm'
                  } ${
                    monthValue === selectedMonthValue
                      ? 'bg-[#8F65FF] text-white'
                      : darkMode
                        ? 'text-slate-200 hover:bg-white/10'
                        : 'text-gray-700 hover:bg-violet-50'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const AdminDashboard = ({ onLogout, adminName: profileName, adminEmail = '', currentUserId }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [hasOpenedTasks, setHasOpenedTasks] = useState(false);
  const [purokPeriod, setPurokPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyTrendEndMonth, setMonthlyTrendEndMonth] = useState(() => {
    const reportMonthMatch = String(REPORT_META.monthYear || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!reportMonthMatch) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const monthIndex = new Date(`${reportMonthMatch[1]} 1, ${reportMonthMatch[2]}`).getMonth();
    return `${reportMonthMatch[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
  });
  const [isExpanded, setIsExpanded] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(DARK_MODE_KEY) === 'true');
  const adminName = profileName?.trim() || 'Admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [adminPurokFilter, setAdminPurokFilter] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedTaskFilter, setSelectedTaskFilter] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogLoading, setActivityLogLoading] = useState(true);
  const [activityLogError, setActivityLogError] = useState('');
  const [showOnlyMyActivity, setShowOnlyMyActivity] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [readNotificationIds, setReadNotificationIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${READ_NOTIFICATIONS_KEY}:${currentUserId || 'shared'}`) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.error('Could not load read notification state:', error);
      return [];
    }
  });
  const [pendingMapScroll, setPendingMapScroll] = useState(false);
  const [alertPuroks, setAlertPuroks] = useState([]);
  const [adminFormCategory, setAdminFormCategory] = useState(null);
  const [adminEditingRecord, setAdminEditingRecord] = useState(null);
  const [adminConfirmation, setAdminConfirmation] = useState(null);
  const [adminConfirmationBusy, setAdminConfirmationBusy] = useState(false);
  const [residentPurokFilter, setResidentPurokFilter] = useState('');
  const [monthlyReportBatch, setMonthlyReportBatch] = useState(1);
  const [scheduledVisitPurok, setScheduledVisitPurok] = useState('');
  const notifRef = useRef(null);

  const refreshActivityLogs = useCallback(async () => {
    try {
      const logs = await loadRecordActivityLogs();
      setActivityLogs(logs);
      setActivityLogError('');
    } catch (error) {
      console.error('Could not load record activity logs:', error);
      setActivityLogError(
        error.message.includes('record_activity_logs')
          ? 'Activity Logs need Supabase setup. Run supabase-record-activity-logs.sql in the Supabase SQL Editor.'
          : `Could not load Activity Logs: ${error.message}`
      );
    } finally {
      setActivityLogLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshActivityLogs();
    const interval = window.setInterval(() => void refreshActivityLogs(), 30000);
    window.addEventListener('nutrigrid-activity-logs-changed', refreshActivityLogs);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('nutrigrid-activity-logs-changed', refreshActivityLogs);
    };
  }, [refreshActivityLogs]);

  useEffect(() => {
    localStorage.setItem(DARK_MODE_KEY, String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (activeTab === 'tasks') setHasOpenedTasks(true);
  }, [activeTab]);

  const markNotificationsRead = (ids) => {
    const next = Array.from(new Set([...readNotificationIds, ...ids]));
    setReadNotificationIds(next);
    try {
      localStorage.setItem(
        `${READ_NOTIFICATIONS_KEY}:${currentUserId || 'shared'}`,
        JSON.stringify(next)
      );
    } catch (error) {
      console.error('Could not save read notification state:', error);
    }
  };

  const handleNotificationClick = (item) => {
    markNotificationsRead(item.notificationIds || [item.id]);
    setShowNotifications(false);
    if (item.activityId) {
      setSelectedActivityId(item.activityId);
      const selectedLog = activityLogs.find((log) => log.id === item.activityId);
      setShowOnlyMyActivity(selectedLog?.actor_user_id === currentUserId);
      setShowActivityLogs(true);
    }
    setActiveTab(item.mapAlert || item.activityId ? 'dashboard' : item.tab || 'dashboard');
    if (item.mapAlert) {
      setAlertPuroks(item.affectedPuroks || []);
      setPendingMapScroll(true);
    }
  };

  useEffect(() => {
    if (!pendingMapScroll || activeTab !== 'dashboard') return undefined;
    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById('admin-map-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      setPendingMapScroll(false);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [pendingMapScroll, activeTab]);

  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 767px)');
    const collapseSidebar = (event) => {
      if (event.matches) setIsExpanded(false);
    };
    mobileViewport.addEventListener('change', collapseSidebar);
    return () => mobileViewport.removeEventListener('change', collapseSidebar);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [adminData, setAdminData] = useState(() => reloadAllAdminData(currentUserId));
  const [adminDataStatus, setAdminDataStatus] = useState('loading');
  const {
    households,
    pregnantWomenData,
    infantFeedingData,
    lactatingWomenData,
    natalityData,
    environmentalSanitationData,
    monthlyReportData,
  } = adminData;

  const pwaPhotoDocuments = useMemo(() => {
    const categories = [
      { id: 'residents', label: 'Residents', storageKey: STORAGE_KEYS.residents, records: households },
      { id: 'environmental', label: 'Environmental Sanitation', storageKey: STORAGE_KEYS.environmental, records: environmentalSanitationData },
      { id: 'infantfeeding', label: 'Infant Feeding', storageKey: STORAGE_KEYS.infantfeeding, records: infantFeedingData },
      { id: 'lactatingwoman', label: 'Lactating Woman', storageKey: STORAGE_KEYS.lactatingwoman, records: lactatingWomenData },
      { id: 'pregnantwoman', label: 'Pregnant Woman', storageKey: STORAGE_KEYS.pregnantwoman, records: pregnantWomenData },
      { id: 'monthlynatal', label: 'Monthly Natality', storageKey: STORAGE_KEYS.monthlynatal, records: natalityData },
    ];

    return categories.flatMap(({ id, label, storageKey, records }) => {
      const localRecordsById = new Map(
        getRecords(storageKey).map((record) => [String(record.id), record])
      );
      return (records || []).flatMap((record, index) => {
        const raw = record._raw || record;
        const localRaw = localRecordsById.get(String(record.id)) || {};
        const image = raw.photo_url ||
          raw.residents_photo ||
          raw.environmental_sanitation_photo ||
          raw.residentsPhoto ||
          localRaw.photo_url ||
          localRaw.residents_photo ||
          localRaw.environmental_sanitation_photo ||
          record.environmentalSanitationPhoto;
        if (
          typeof image !== 'string' ||
          (!image.startsWith('data:image/') && !/^https?:\/\//i.test(image))
        ) return [];

        const personName = raw.household_head ||
          raw.child_name ||
          raw.mother_name ||
          [raw.first_name, raw.middle_name, raw.last_name].filter(Boolean).join(' ') ||
          `Record ${record.id ?? index + 1}`;
        const dateValue = raw.updated_at ||
          raw.created_at ||
          raw.visit_date ||
          raw.date_of_registration ||
          raw.dow ||
          raw.month ||
          '';
        const monthMatch = String(dateValue).match(/^(20\d{2})[-/](\d{1,2})/);
        const monthKey = monthMatch
          ? `${monthMatch[1]}-${monthMatch[2].padStart(2, '0')}`
          : '';
        const parsedDate = dateValue
          ? new Date(/^\d{4}-\d{2}$/.test(String(dateValue)) ? `${dateValue}-01` : dateValue)
          : null;
        const addedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;
        const extension = image.match(/^data:image\/([a-z0-9.+-]+);/i)?.[1] ||
          image.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1] ||
          'jpeg';
        const size = image.startsWith('data:image/')
          ? Math.round(((image.split(',')[1] || '').length * 3) / 4)
          : 0;

        return [{
          id: `pwa-photo-${id}-${record.id ?? index}`,
          name: `${label} - ${personName}.${extension}`,
          path: `${label} / ${personName}`,
          type: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
          size,
          addedAt,
          monthKey,
          recordDate: dateValue,
          url: image,
          source: 'PWA',
          category: id,
          categoryLabel: label,
          recordId: record.id,
        }];
      });
    });
  }, [
    households,
    environmentalSanitationData,
    infantFeedingData,
    lactatingWomenData,
    pregnantWomenData,
    natalityData,
  ]);

  const refreshData = () => setAdminData(reloadAllAdminData(currentUserId));

  useEffect(() => {
    let active = true;
    let loading = false;
    const photoStorageKeys = [
      STORAGE_KEYS.residents,
      STORAGE_KEYS.environmental,
      STORAGE_KEYS.infantfeeding,
      STORAGE_KEYS.lactatingwoman,
      STORAGE_KEYS.pregnantwoman,
      STORAGE_KEYS.monthlynatal,
    ];

    const loadSharedAdminData = async () => {
      if (!active) return;
      if (loading) return;
      if (!navigator.onLine) {
        setAdminDataStatus('offline');
        return;
      }

      loading = true;
      try {
        const sharedData = await loadAdminDataFromSupabase(currentUserId, {
          onRecordsLoaded: (records) => {
            if (!active) return;
            setAdminData((currentData) => ({ ...currentData, ...records }));
            setAdminDataStatus('loaded');
          },
        });
        if (active) {
          setAdminData(sharedData);
          setAdminDataStatus('loaded');
        }
      } catch (error) {
        console.error('Could not load shared admin records from Supabase:', error);
        if (active) setAdminDataStatus('error');
      } finally {
        loading = false;
      }
    };

    const hydrateLocalPhotos = async () => {
      try {
        await Promise.all(photoStorageKeys.map((key) => getRecordsWithPhotos(key)));
        if (active) setAdminData(reloadAllAdminData(currentUserId));
      } catch (error) {
        console.error('Could not hydrate local record photos from IndexedDB:', error);
      }
    };

    const handleLocalRecordsChanged = (event) => {
      if (event.detail?.operation === 'upsert' || event.detail?.operation === 'delete') {
        setAdminData(reloadAllAdminData(currentUserId));
        if (event.detail.operation === 'upsert') void hydrateLocalPhotos();
      }
    };
    const handleStorageChanged = (event) => {
      if (event.key === RECORDS_CHANGED_SIGNAL_KEY) {
        setAdminData(reloadAllAdminData(currentUserId));
        void hydrateLocalPhotos();
        if (document.visibilityState === 'visible') void loadSharedAdminData();
        return;
      }
      if (event.key && Object.values(STORAGE_KEYS).includes(event.key)) {
        setAdminData(reloadAllAdminData(currentUserId));
        if (photoStorageKeys.includes(event.key)) void hydrateLocalPhotos();
        if (document.visibilityState === 'visible') void loadSharedAdminData();
      }
    };

    const handlePageFocus = () => {
      if (document.visibilityState === 'visible') void loadSharedAdminData();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadSharedAdminData();
    };
    const channel = supabase
      .channel(`admin-record-updates-${currentUserId || 'shared'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'residents' }, handlePageFocus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'environmental_sanitation' }, handlePageFocus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'infant_feeding' }, handlePageFocus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lactating_women' }, handlePageFocus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pregnant_women' }, handlePageFocus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_natality' }, handlePageFocus)
      .subscribe();

    void loadSharedAdminData();
    void hydrateLocalPhotos();
    window.addEventListener('bns-records-changed', handleLocalRecordsChanged);
    window.addEventListener('storage', handleStorageChanged);
    window.addEventListener('focus', handlePageFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener('bns-records-changed', handleLocalRecordsChanged);
      window.removeEventListener('storage', handleStorageChanged);
      window.removeEventListener('focus', handlePageFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, []);

  const filteredHouseholds = useMemo(() => filterRecordsBySearch(households, searchTerm), [households, searchTerm]);
  const filteredResidentHouseholds = useMemo(
    () => {
      let rows = residentPurokFilter
        ? filteredHouseholds.filter((record) => normalizePurokName(record.purok) === residentPurokFilter)
        : filteredHouseholds;
      if (adminPurokFilter === '__sorted__') {
        rows = [...rows].sort((a, b) => getPurokNumber(a.purok) - getPurokNumber(b.purok));
      } else if (adminPurokFilter) {
        rows = rows.filter((record) => normalizePurokName(record.purok) === adminPurokFilter);
      }
      return rows;
    },
    [filteredHouseholds, residentPurokFilter, adminPurokFilter]
  );
  const handlePurokResidents = useCallback((purok) => {
    setResidentPurokFilter(normalizePurokName(purok));
    setSearchTerm('');
    setSearchResults([]);
    setActiveTab('residents');
  }, []);
  const handleScheduleVisit = useCallback((purok) => {
    setScheduledVisitPurok(normalizePurokName(purok));
    setActiveTab('tasks');
  }, []);
  const clearScheduledVisitPurok = useCallback(() => setScheduledVisitPurok(''), []);

  const performSearch = (query) => {
    setSearchTerm(query);
    setSearchResults(
      query.trim() && !['tasks', 'documents'].includes(activeTab)
        ? performRecordSearch(buildSavedRecords(), query)
        : []
    );
  };
  const handleSearchResultsChange = useCallback((results) => {
    setSearchResults((current) => {
      if (
        current.length === results.length &&
        current.every((item, index) => item.id === results[index]?.id)
      ) {
        return current;
      }
      return results;
    });
  }, []);
  useEffect(() => {
    if (!['tasks', 'documents'].includes(activeTab)) {
      setSearchResults(
        searchTerm.trim() ? performRecordSearch(buildSavedRecords(), searchTerm) : []
      );
    }
  }, [activeTab, searchTerm]);

  const notificationItems = useMemo(() => {
    const items = [];
    [
      { key: STORAGE_KEYS.residents, data: households, tab: 'residents' },
      { key: STORAGE_KEYS.environmental, data: environmentalSanitationData, tab: 'environmentalSanitation' },
      { key: STORAGE_KEYS.infantfeeding, data: infantFeedingData, tab: 'infantFeeding' },
      { key: STORAGE_KEYS.pregnantwoman, data: pregnantWomenData, tab: 'pregnantWoman' },
      { key: STORAGE_KEYS.lactatingwoman, data: lactatingWomenData, tab: 'lactatingWoman' },
      { key: STORAGE_KEYS.monthlynatal, data: natalityData, tab: 'monthlyNatality' },
    ].forEach(({ key, data, tab }) => {
      const records = Array.isArray(data) ? data : [];
      const pending = records.filter((r) => r.status === 'Pending');
      if (pending.length > 0) {
        items.push({
          id: `${key}-summary`,
          label: NOTIF_LABELS[key],
          detail: `${pending.length} pending record${pending.length > 1 ? 's' : ''}`,
          tab,
        });
      }
    });
    const pendingVisits = getRecords(STORAGE_KEYS.pendingVisits) || [];
    pendingVisits.forEach((v) => {
      items.push({
        id: `visit-${v.id}`,
        label: NOTIF_LABELS[STORAGE_KEYS.pendingVisits],
        detail: v.category || v.household_head || 'Visit pending sync',
      });
    });
    const careNeeds = getNutritionCareNeeds(natalityData);
    const legacyReadCareNeedIds = new Set(
      readNotificationIds
        .filter((id) => id.startsWith('nutrition-care:'))
        .flatMap((id) => id.slice('nutrition-care:'.length).split(','))
    );
    const newCareNeeds = careNeeds.filter(
      ({ id, recordId }) =>
        !readNotificationIds.includes(`nutrition-care:${id}`) &&
        !legacyReadCareNeedIds.has(recordId)
    );
    if (newCareNeeds.length) {
      const notificationIds = newCareNeeds.map(({ id }) => `nutrition-care:${id}`);
      items.push({
        id: `nutrition-care:${notificationIds.join(',')}`,
        notificationIds,
        affectedPuroks: Array.from(new Set(
          newCareNeeds.map(({ purok }) => normalizePurokName(purok)).filter(Boolean)
        )),
        label: 'Feeding program & parental guide',
        detail: `${newCareNeeds.length} new child record${newCareNeeds.length === 1 ? '' : 's'} may benefit from nutrition support and caregiver guidance. Tap to review the map.`,
        mapAlert: true,
      });
    }
    activityLogs.forEach((log) => {
      items.push({
        id: `record-activity:${log.id}`,
        notificationIds: [`record-activity:${log.id}`],
        activityId: log.id,
        label: `BHW ${getActivityActorDisplayName(log.actor_name)} updated information`,
        detail: 'Tap this to see details in Activity Logs.',
        tab: 'activityLogs',
      });
    });
    return items;
  }, [households, environmentalSanitationData, infantFeedingData, pregnantWomenData, lactatingWomenData, natalityData, readNotificationIds, activityLogs]);

  const visibleNotificationItems = notificationItems.filter(
    (item) =>
      item.notificationIds
        ? item.notificationIds.some((id) => !readNotificationIds.includes(id))
        : !readNotificationIds.includes(item.id)
  );
  const notifications = visibleNotificationItems.length;

  // All figures below come from saved local records. Nothing is hardcoded.
  const stats = useMemo(() => {
    const synced = households.filter((h) => h.status === 'Synced').length;
    const pending = households.filter((h) => h.status === 'Pending').length;
    const totalRecords =
      households.length +
      environmentalSanitationData.length +
      infantFeedingData.length +
      lactatingWomenData.length +
      pregnantWomenData.length +
      natalityData.length;
    return {
      totalHouseholds: households.length,
      pregnantWomen: pregnantWomenData.length,
      childrenUnderFive: infantFeedingData.length,
      totalRecords,
      lactatingWomen: lactatingWomenData.length,
      synced,
      pending,
      trends: {
        totalHouseholds: calculateMonthlyTrend(households),
        pregnantWomen: calculateMonthlyTrend(pregnantWomenData),
        childrenUnderFive: calculateMonthlyTrend(infantFeedingData),
        totalRecords: calculateMonthlyTrend([
          ...households,
          ...environmentalSanitationData,
          ...infantFeedingData,
          ...lactatingWomenData,
          ...pregnantWomenData,
          ...natalityData,
        ]),
      },
    };
  }, [
    households,
    environmentalSanitationData,
    infantFeedingData,
    lactatingWomenData,
    pregnantWomenData,
    natalityData,
  ]);

  // Top puroks, counted from saved household records for the selected period.
  const purokData = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(purokPeriod)) return [];
    const [year, month] = purokPeriod.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);

    const counts = new Map();
    households.forEach((h) => {
      const raw = h._raw || h;
      const dateValue =
        raw.visit_date ||
        h.visit_date ||
        h.lastVisit ||
        raw.created_at ||
        h.created_at ||
        raw.updated_at ||
        h.updated_at;
      const dateString = String(dateValue || '');
      const dateOnly = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const recordDate = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : dateValue ? new Date(dateValue) : null;
      if (!recordDate || Number.isNaN(recordDate.getTime())) return;
      if (recordDate < periodStart || recordDate >= periodEnd) return;
      const name = normalizePurokName(h.purok);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return sortPurokCounts(
      Array.from(counts, ([purok, count]) => ({ purok, count }))
    ).map(({ purok, count }) => ({ name: purok, value: count }));
  }, [households, purokPeriod]);
  const maxPurokHouseholdCount = Math.max(1, ...purokData.map(({ value }) => value));

  const monthlyTrendData = useMemo(() => {
    const [reportYear, reportMonthIndex] = monthlyTrendEndMonth.split('-').map(Number);
    const reportMonth = new Date(reportYear, reportMonthIndex - 1, 1);
    const parseDate = (value) => {
      if (!value) return null;
      const dateString = String(value);
      const dateOnly = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const monthKeyFor = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(reportMonth.getFullYear(), reportMonth.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        month: date.toLocaleDateString('en', { month: 'short' }),
        startDate: date,
        endDate: new Date(date.getFullYear(), date.getMonth() + 1, 0),
        vulnerableCases: 0,
        pregnantAndLactating: 0,
        infants: 0,
      };
    });
    const malnutritionByMonth = new Map(months.map((month) => [month.key, new Set()]));
    natalityData.forEach((record) => {
      const raw = record._raw || record;
      const weighingDate = parseDate(raw.dow || record.dow);
      const weighingMonth = weighingDate ? monthKeyFor(weighingDate) : '';
      const childKey = `${raw.dob || record.dob || ''}:${String(
        raw.child_name || raw.name_of_child || record.childName || record.id
      ).trim().toLowerCase()}`;
      const statuses = [
        raw.w_a || record.wA,
        raw.h_a || record.hA,
        raw.w_l_h || record.wLH,
      ].map((status) => String(status || '').toLowerCase());
      const isMalnourished = statuses.some((status) =>
        status.includes('underweight') ||
        status.includes('stunted') ||
        status.includes('wasted')
      );
      if (!isMalnourished || !weighingDate) return;
      if (malnutritionByMonth.has(weighingMonth)) {
        malnutritionByMonth.get(weighingMonth).add(childKey);
      }
    });

    months.forEach((month) => {
      const malnourishedChildren = malnutritionByMonth.get(month.key);
      month.vulnerableCases = malnourishedChildren.size;
    });

    const countActiveRecords = (records, category) => months.map((month) => {
      const active = new Set();
      records.forEach((record) => {
        const raw = record._raw || record;
        const identity = String(raw.id ?? record.id ?? [
          raw.first_name || '',
          raw.last_name || '',
          raw.birthday || '',
        ].join(':'));
        if (category === 'pregnant') {
          const registered = parseDate(raw.date_of_registration || raw.created_at);
          const deliveryDue = parseDate(raw.expected_date_of_delivery);
          if (
            registered &&
            registered <= month.endDate &&
            (!deliveryDue || deliveryDue >= month.startDate)
          ) active.add(identity);
          return;
        }
        const delivered = parseDate(raw.date_delivered);
        if (!delivered || delivered > month.endDate) return;
        const postpartumCutoff = new Date(
          month.endDate.getFullYear() - 2,
          month.endDate.getMonth(),
          month.endDate.getDate()
        );
        if (delivered >= postpartumCutoff) active.add(identity);
      });
      return active.size;
    });
    const pregnantCounts = countActiveRecords(pregnantWomenData, 'pregnant');
    const lactatingCounts = countActiveRecords(lactatingWomenData, 'lactating');
    const infantsByMonth = new Map(months.map((month) => [month.key, new Set()]));
    natalityData.forEach((record) => {
      const raw = record._raw || record;
      const dob = parseDate(raw.dob || record.dob);
      if (!dob) return;
      const childKey = `${raw.dob || record.dob || ''}:${String(
        raw.child_name || raw.name_of_child || record.childName || record.id
      ).trim().toLowerCase()}`;
      months.forEach((month) => {
        const infantCutoff = new Date(month.endDate.getFullYear() - 1, month.endDate.getMonth(), month.endDate.getDate());
        if (dob <= month.endDate && dob > infantCutoff) {
          infantsByMonth.get(month.key).add(childKey);
        }
      });
    });
    return months.map((month, index) => ({
      ...month,
      pregnantAndLactating: pregnantCounts[index] + lactatingCounts[index],
      infants: infantsByMonth.get(month.key).size,
    }));
  }, [monthlyTrendEndMonth, natalityData, pregnantWomenData, lactatingWomenData]);
  const monthlyTrendMonthOptions = useMemo(() => {
    const reportMonthMatch = String(REPORT_META.monthYear || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
    const reportMonth = reportMonthMatch
      ? new Date(`${reportMonthMatch[1]} 1, ${reportMonthMatch[2]}`)
      : new Date();
    const now = new Date();
    const latestMonth = new Date(
      Math.max(reportMonth.getFullYear(), now.getFullYear()),
      reportMonth.getFullYear() > now.getFullYear()
        ? reportMonth.getMonth()
        : reportMonth.getFullYear() < now.getFullYear()
          ? now.getMonth()
          : Math.max(reportMonth.getMonth(), now.getMonth()),
      1
    );
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(latestMonth.getFullYear(), latestMonth.getMonth() - 23 + index, 1);
      return {
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
      };
    });
  }, []);
  const activeMonthlyTrend = monthlyTrendData.some((month) =>
    month.vulnerableCases > 0 ||
    month.pregnantAndLactating > 0 ||
    month.infants > 0
  );

  const malnutritionStatusData = (() => {
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const malnutritionByMonth = new Map();
    const firstMalnutritionMonthByChild = new Map();

    natalityData.forEach((record) => {
      const raw = record._raw || record;
      const dateValue = raw.dow || record.dow;
      const dateString = String(dateValue || '');
      const dateOnly = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const weighingDate = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : dateValue ? new Date(dateValue) : null;
      if (!weighingDate || Number.isNaN(weighingDate.getTime())) return;
      const month = `${weighingDate.getFullYear()}-${String(weighingDate.getMonth() + 1).padStart(2, '0')}`;
      const statuses = [raw.w_a || record.wA, raw.h_a || record.hA, raw.w_l_h || record.wLH]
        .map((status) => String(status || '').toLowerCase());
      const isMalnourished = statuses.some((status) =>
        status.includes('underweight') || status.includes('stunted') || status.includes('wasted')
      );
      if (!isMalnourished) return;

      const childName = String(raw.child_name || raw.name_of_child || record.childName || '').trim().toLowerCase();
      const childKey = `${raw.dob || record.dob || ''}:${childName || raw.id || record.id || ''}`;
      const firstMonth = firstMalnutritionMonthByChild.get(childKey);
      if (!firstMonth || month < firstMonth) firstMalnutritionMonthByChild.set(childKey, month);
      if (!malnutritionByMonth.has(month)) malnutritionByMonth.set(month, new Set());
      malnutritionByMonth.get(month).add(childKey);
    });

    const currentCases = malnutritionByMonth.get(currentMonth) || new Set();
    const newCases = Array.from(currentCases)
      .filter((childKey) => firstMalnutritionMonthByChild.get(childKey) === currentMonth).length;
    const repeatCases = currentCases.size - newCases;
    const total = newCases + repeatCases;
    return [
      { name: 'New Cases', value: newCases, color: THEME.accentPink, pct: total ? Math.round((newCases / total) * 100) : 0 },
      { name: 'Repeat Cases', value: repeatCases, color: THEME.accentPurple, pct: total ? 100 - Math.round((newCases / total) * 100) : 0 },
    ];
  })();

  const requestAdminConfirmation = (message, action, options = {}) => {
    setAdminConfirmation({ message, action, ...options });
  };

  const requestPwaPhotoDeletion = (photo) => {
    const categoryStorageKeys = {
      residents: STORAGE_KEYS.residents,
      environmental: STORAGE_KEYS.environmental,
      infantfeeding: STORAGE_KEYS.infantfeeding,
      lactatingwoman: STORAGE_KEYS.lactatingwoman,
      pregnantwoman: STORAGE_KEYS.pregnantwoman,
      monthlynatal: STORAGE_KEYS.monthlynatal,
    };
    const storageKey = categoryStorageKeys[photo.category];
    const record = storageKey && getRecords(storageKey).find(
      (item) => String(item.id) === String(photo.recordId)
    );
    if (!record) {
      alert('Could not find the record for this photo. Refresh the dashboard and try again.');
      return;
    }

    requestAdminConfirmation(
      `Remove the photo from "${photo.name}"? The rest of the record will be kept.`,
      async () => {
        const updatedRecord = {
          ...record,
          photo_url: null,
          residents_photo: null,
          environmental_sanitation_photo: null,
          synced: false,
          status: 'pending',
        };
        upsertRecord(storageKey, updatedRecord);
        refreshData();

        if (!navigator.onLine) {
          alert('Photo removed on this device. The change will sync to Supabase when you are back online.');
          return;
        }

        try {
          const syncError = await syncSingleRecord(photo.category, updatedRecord, {
            includeShared: true,
          });
          if (syncError) {
            console.error('Photo removal is saved locally and waiting to sync:', syncError);
            alert(`Photo removed on this device, but could not sync to Supabase: ${syncError}`);
            return;
          }
          upsertRecord(storageKey, { ...updatedRecord, synced: true, status: 'Synced' });
          refreshData();
        } catch (syncError) {
          console.error('Photo removal is saved locally and waiting to sync:', syncError);
          alert('Photo removed on this device, but could not sync to Supabase. Check the connection and try again.');
        }
      },
      { title: 'Delete photo', confirmLabel: 'Delete photo', destructive: true }
    );
  };

  const confirmAdminAction = async () => {
    if (!adminConfirmation) return;
    setAdminConfirmationBusy(true);
    try {
      await adminConfirmation.action();
      setAdminConfirmation(null);
    } finally {
      setAdminConfirmationBusy(false);
    }
  };

  const adminDelete = async (storageKey, id, remoteRecord) => {
    const category = categoryIdForStorageKey(storageKey);
    if (!category || category === 'monthlyreport') {
      deleteRecordById(storageKey, id);
      refreshData();
      return;
    }

    const localRecord = getRecords(storageKey).find((record) => String(record.id) === String(id));
    const remoteRecordExpected = Boolean(
      localRecord?.synced ||
      remoteRecord?.synced ||
      String(remoteRecord?.status || '').toLowerCase() === 'synced'
    );
    queueRecordDeletion(category, id, remoteRecordExpected, localRecord?.created_by_user_id || currentUserId);
    deleteRecordById(storageKey, id);
    refreshData();

    if (!navigator.onLine) {
      alert('Deleted on this device. The deletion will sync to Supabase when you are back online.');
      return;
    }

    try {
      const syncResult = await syncPendingRecords({ includeShared: true });
      if (syncResult.errors?.length || syncResult.skipped) {
        const details = syncResult.errors?.join('\n') || `Sync skipped: ${syncResult.skipped}`;
        console.error('Record deletion is saved locally and waiting to sync:', details);
        alert('Deleted locally, but the deletion is still waiting to sync. Check your connection and sign-in, then retry.');
        return;
      }

      setAdminData(await loadAdminDataFromSupabase(currentUserId));
      setAdminDataStatus('loaded');
    } catch (error) {
      console.error('Record was deleted locally, but could not be synced:', error);
      alert(`Deleted locally. Supabase sync will retry when possible: ${error.message || 'request failed'}`);
    }
  };

  const openCategoryForm = (category, raw = null) => {
    setAdminEditingRecord(raw);
    setAdminFormCategory(category);
  };

  const closeCategoryForm = () => {
    setAdminFormCategory(null);
    setAdminEditingRecord(null);
  };

  const categoryCrud = (storageKey, formCategory, dataset) => ({
    onAdd: () => openCategoryForm(formCategory),
    onEdit: (id) => {
      const row = dataset.find((r) => r.id === id);
      const localRecord = getRecords(storageKey).find((record) => String(record.id) === String(id));
      const raw = row?._raw || localRecord;
      if (raw) {
        openCategoryForm(formCategory, {
          ...raw,
          photo_url: raw.photo_url ||
            raw.residents_photo ||
            raw.environmental_sanitation_photo ||
            raw.residentsPhoto ||
            localRecord?.photo_url ||
            localRecord?.residents_photo ||
            localRecord?.environmental_sanitation_photo ||
            null,
        });
      }
    },
    onDelete: (id) => requestAdminConfirmation(
      'Are you sure you want to delete this record? This cannot be undone.',
      () => adminDelete(storageKey, id, dataset.find((row) => row.id === id)?._raw),
      { title: 'Delete record', confirmLabel: 'Delete', destructive: true }
    ),
  });

  const filterAdminTableData = (rows, term, categoryId) => {
    let filteredRows = rows;
    if (adminPurokFilter === '__sorted__') {
      filteredRows = [...filteredRows].sort((a, b) => getPurokNumber(a.purok) - getPurokNumber(b.purok));
    } else if (adminPurokFilter) {
      filteredRows = filteredRows.filter((row) => normalizePurokName(row.purok) === adminPurokFilter);
    }
    if (!term.trim()) return filteredRows;
    const q = term.trim().toLowerCase();
    return filteredRows.filter((row) => recordMatchesSearch({ ...row, category: categoryId }, q));
  };

  const autoMonthlyReportData = useMemo(() => {
    const sourceRows = [
      ['monthlynatal', natalityData],
      ['pregnantwoman', pregnantWomenData],
      ['lactatingwoman', lactatingWomenData],
      ['infantfeeding', infantFeedingData],
    ];
    const derived = new Map();
    const categoryDerivedSlugs = new Set([
      'vit-a-6-11',
      'vit-a-12-59',
      'vit-a-postpartum',
      'iron-pregnant',
      'iron-adolescent',
      'iron-lactating',
      'iron-lbw',
      'fic-9-12',
      'newborn-babies-origin',
      'exclusive-breastfeeding',
    ]);
    const getRecordDate = (record) => {
      const raw = record._raw || record;
      return raw.updated_at || raw.created_at || raw.date_of_registration || raw.dow || raw.month || '';
    };
    const getDateParts = (record) => {
      const value = String(getRecordDate(record));
      const match = value.match(/^(20\d{2})[-/](\d{1,2})/);
      if (!match) return null;
      const month = Number(match[2]);
      const batch = Math.ceil(month / 3);
      return {
        year: Number(match[1]),
        batch,
        monthIndex: (month - 1) % 3,
      };
    };
    const numericAmount = (value, maximum = Number.POSITIVE_INFINITY) => {
      const normalized = String(value ?? '').trim();
      if (!normalized) return 0;
      const amount = Number(normalized);
      return Number.isFinite(amount) && amount >= 0 && amount <= maximum ? amount : 0;
    };
    const add = (slug, record, amount = 1) => {
      const date = getDateParts(record);
      if (!date || date.year !== Number(REPORT_META.reportYear)) return;
      const key = `${date.batch}:${slug}`;
      const current = derived.get(key) || { m1M: 0, m1F: 0, m2M: 0, m2F: 0, m3M: 0, m3F: 0 };
      const raw = record._raw || record;
      const isMale = raw.sex === 'boys' || record.sex === 'Male';
      const genderKey = `${date.monthIndex === 0 ? 'm1' : date.monthIndex === 1 ? 'm2' : 'm3'}${isMale ? 'M' : 'F'}`;
      current[genderKey] += Number(amount) || 0;
      derived.set(key, current);
    };

    sourceRows.forEach(([category, records]) => {
      (records || []).forEach((record) => {
        const raw = record._raw || record;
        if (category === 'monthlynatal') {
          if (raw.vitamin_a === '6–11 months old (100,000 IU)') add('vit-a-6-11', record, numericAmount(raw.vitamin_a_count));
          if (raw.vitamin_a === '12–59 months old (200,000 IU)') add('vit-a-12-59', record, numericAmount(raw.vitamin_a_count));
          if (raw.vitamin_a === 'Post-partum Women (200,000 IU)') add('vit-a-postpartum', record, numericAmount(raw.vitamin_a_count));
          if (raw.iron_status || raw.iron_given) {
            add('iron-lbw', record, numericAmount(raw.iron_status || raw.iron_given, 100));
          }
          if (raw.fully_immunized) add('fic-9-12', record);
          if (raw.newborn_babies) add('newborn-babies-origin', record);
        }
        if (category === 'pregnantwoman') {
          if (raw.iron_folic_acid_type === 'Pregnant (180 tabs)') add('iron-pregnant', record, numericAmount(raw.iron_folic_acid));
          if (raw.iron_folic_acid_type === 'Adolescent Pregnant (180 tabs)') add('iron-adolescent', record, numericAmount(raw.iron_folic_acid));
        }
        if (category === 'lactatingwoman' && raw.iron_folic_acid) {
          add('iron-lactating', record, numericAmount(raw.iron_folic_acid));
        }
        if (category === 'infantfeeding' && raw.feeding_3_month) {
          add('exclusive-breastfeeding', record);
        }
      });
    });

    return monthlyReportData.map((row) => {
      const next = { ...row };
      const values = derived.get(`${Number(row.reportQuarter || 1)}:${row.slug}`);
      if (row.isHeader) return next;
      if (categoryDerivedSlugs.has(row.slug)) {
        Object.assign(next, values || {
          m1M: 0,
          m1F: 0,
          m2M: 0,
          m2F: 0,
          m3M: 0,
          m3F: 0,
        });
      } else if (values) {
        Object.assign(next, values);
      } else {
        return next;
      }
      next.tM = next.m1M + next.m2M + next.m3M;
      next.tF = next.m1F + next.m2F + next.m3F;
      return next;
    });
  }, [
    monthlyReportData,
    natalityData,
    pregnantWomenData,
    lactatingWomenData,
    infantFeedingData,
  ]);

  const filteredEnvironmental = useMemo(
    () => filterAdminTableData(environmentalSanitationData, searchTerm, 'environmental'),
    [environmentalSanitationData, searchTerm, adminPurokFilter]
  );
  const filteredInfantFeeding = useMemo(
    () => filterAdminTableData(infantFeedingData, searchTerm, 'infantfeeding'),
    [infantFeedingData, searchTerm, adminPurokFilter]
  );
  const filteredLactating = useMemo(
    () => filterAdminTableData(lactatingWomenData, searchTerm, 'lactatingwoman'),
    [lactatingWomenData, searchTerm, adminPurokFilter]
  );
  const filteredPregnant = useMemo(
    () => filterAdminTableData(pregnantWomenData, searchTerm, 'pregnantwoman'),
    [pregnantWomenData, searchTerm, adminPurokFilter]
  );
  const filteredNatality = useMemo(
    () => filterAdminTableData(natalityData, searchTerm, 'monthlynatal'),
    [natalityData, searchTerm, adminPurokFilter]
  );

  const residentActions = categoryCrud(STORAGE_KEYS.residents, 'residents', households);
  const environmentalActions = categoryCrud(
    STORAGE_KEYS.environmental,
    'environmental',
    environmentalSanitationData
  );
  const infantFeedingActions = categoryCrud(
    STORAGE_KEYS.infantfeeding,
    'infantfeeding',
    infantFeedingData
  );
  const lactatingActions = categoryCrud(
    STORAGE_KEYS.lactatingwoman,
    'lactatingwoman',
    lactatingWomenData
  );
  const pregnantActions = categoryCrud(
    STORAGE_KEYS.pregnantwoman,
    'pregnantwoman',
    pregnantWomenData
  );
  const natalityActions = categoryCrud(STORAGE_KEYS.monthlynatal, 'monthlynatal', natalityData);

  const markCheck = (value) => (Number(value) > 0 ? '✓' : '');

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Home Dashboard' },
    { id: 'residents', icon: Users2, label: 'Residents' },
    { id: 'environmentalSanitation', icon: Leaf, label: 'Environmental Sanitation Report' },
    { id: 'infantFeeding', icon: Baby, label: 'Infant Feeding (0-5 mo)' },
    { id: 'lactatingWoman', icon: PersonStanding, label: 'Lactating Woman' },
    { id: 'pregnantWoman', icon: Heart, label: 'Pregnant Woman' },
    { id: 'monthlyNatality', icon: CalendarDays, label: 'Monthly Natality' },
    { id: 'monthlyReport', icon: BarChart3, label: 'Monthly Report' },
    { id: 'documents', icon: Folder, label: 'Documents' },
    { id: 'tasks', icon: ClipboardCheck, label: 'Tasks' },
  ];

  // ====================================================================
  // SHARED UI COMPONENTS
  // ====================================================================

  const cardSurfaceStyle = darkMode
    ? {
        background: 'linear-gradient(135deg, rgba(255,117,195,0.08) 0%, rgba(143,101,255,0.06) 100%)',
        border: `1px solid ${THEME.dark.border}`,
      }
    : {
        background: 'linear-gradient(135deg, #FFF5FB 0%, #FAF5FF 100%)',
        border: '1px solid #E8C4F0',
      };

  const FormCard = ({ children }) => (
    <div className="rounded-3xl overflow-hidden" style={cardSurfaceStyle}>
      {children}
    </div>
  );

  const FormToolbar = ({ onAdd, onExport, recordCount }) => (
    <div
      className="px-6 py-3 border-b flex items-center justify-between gap-3"
      style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}
    >
      <span className="text-xs font-semibold" style={{ color: darkMode ? THEME.dark.muted : THEME.light.muted }}>
        {recordCount} record(s)
      </span>
      <div className="flex items-center gap-2">
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 border transition"
            style={{ color: darkMode ? THEME.dark.text : THEME.light.text, borderColor: darkMode ? THEME.dark.border : THEME.light.border }}
          >
            <Download size={16} />
            Export PDF
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-[#9D174D] transition hover:bg-[#FBCFE8]"
            style={{ backgroundColor: '#FCE7F3' }}
          >
            <Plus size={16} />
            Add New
          </button>
        )}
      </div>
    </div>
  );

  const RowActions = ({ onEdit, onDelete }) => (
    <div className="flex gap-2">
      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg hover:opacity-80"
        style={{ color: THEME.accentPurple, backgroundColor: darkMode ? 'rgba(143,101,255,0.15)' : '#F3EEFF' }}
      >
        <Edit size={14} />
      </button>
      <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
        <Trash2 size={14} />
      </button>
    </div>
  );

  const getColumnKey = (col) =>
    col.charAt(0).toLowerCase() + col.slice(1).replace(/\s+(.)/g, (_, char) => char.toUpperCase());

  const exportPdfFile = async ({
    fileName,
    title,
    headers,
    rows,
    preamble = [],
    headRows,
    signatures = [],
    preview = false,
    sectionRowLabels = [],
  }) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const landscape = headers.length > 8;
    const document = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = document.internal.pageSize.getWidth();
    let startY = 32;

    if (preamble.length) {
      preamble.forEach((line) => {
        if (!line) {
          startY += 6;
          return;
        }
        document.setFont('helvetica', 'normal');
        document.setFontSize(9);
        document.text(line, pageWidth / 2, startY, { align: 'center' });
        startY += 13;
      });
    } else {
      document.setFont('helvetica', 'bold');
      document.setFontSize(14);
      document.text(title, pageWidth / 2, startY, { align: 'center' });
      startY += 18;
    }

    autoTable(document, {
      startY: startY + 4,
      head: headRows || [headers],
      body: rows,
      theme: 'grid',
      margin: { top: 24, right: 18, bottom: 100, left: 18 },
      styles: { font: 'helvetica', fontSize: headers.length > 18 ? 5 : headers.length > 10 ? 6 : 8, cellPadding: 3, overflow: 'linebreak', halign: 'center' },
      bodyStyles: { halign: 'center', fontStyle: 'bold' },
      headStyles: { fillColor: [238, 234, 246], textColor: [35, 35, 45], fontStyle: 'bold', halign: 'center' },
      didParseCell: (hookData) => {
        if (
          hookData.section === 'body' &&
          sectionRowLabels.includes(String(hookData.row.raw?.[0] || ''))
        ) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [255, 232, 243];
          hookData.cell.styles.textColor = [45, 45, 58];
        }
      },
      horizontalPageBreak: headers.length > 18,
      horizontalPageBreakRepeat: 1,
    });

    const pageHeight = document.internal.pageSize.getHeight();
    const approvalHeight = 124;
    let approvalY = document.lastAutoTable.finalY + 24;
    if (approvalY + approvalHeight > pageHeight - 18) {
      document.addPage();
      approvalY = 36;
    }

    await Promise.all(signatures.map(async (signature) => {
      const signatureDimensions = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error(`Could not decode ${signature.signer?.label || ''} signature image.`));
        image.src = signature.dataUrl;
      });
      const signatureColumnWidth = (pageWidth * 0.8 / 3) - 12;
      const scale = Math.min(signatureColumnWidth / signatureDimensions.width, 46 / signatureDimensions.height);
      const signatureWidth = signatureDimensions.width * scale;
      const signatureHeight = signatureDimensions.height * scale;
      const approvalColumn = signature.signer?.id === 'rhm' ? 1 : 0;
      const approvalGroupLeft = pageWidth * 0.1;
      const approvalColumnWidth = pageWidth * 0.8 / 3;
      const approvalColumnCenter = approvalGroupLeft + approvalColumnWidth * (approvalColumn + 0.5);
      document.addImage(signature.dataUrl, signature.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG',
        approvalColumnCenter - signatureWidth / 2,
        approvalY + 55, signatureWidth, signatureHeight);
    }));

    const approvalColumns = [
      { name: 'LAARNI B. POMADA', role: 'Barangay Nutrition Scholar' },
      {
        name: 'EVANGELINE S. CANIT, RM',
        role: signatures.find((signature) => signature.signer?.id === 'rhm')?.signer?.role || 'Rural Health Midwife',
      },
      { name: 'ANITA P. AURO, RN, RM', role: 'Municipal Nutrition Action Officer II' },
    ];
    approvalColumns.forEach(({ name, role }, index) => {
      const label = ['PREPARED BY:', 'CHECKED:', 'NOTED:'][index];
      const approvalGroupLeft = pageWidth * 0.1;
      const approvalColumnWidth = pageWidth * 0.8 / 3;
      const columnLeft = approvalGroupLeft + approvalColumnWidth * index;
      const columnCenter = approvalGroupLeft + approvalColumnWidth * (index + 0.5);
      document.setFont('helvetica', 'normal');
      document.setFontSize(8);
      document.text(label, columnLeft + 5, approvalY + 52);
      document.setFont('helvetica', 'bold');
      document.setFontSize(8);
      document.text(name, columnCenter, approvalY + 101, { align: 'center' });
      document.setFont('helvetica', 'normal');
      document.setFontSize(7);
      document.text(role, columnCenter, approvalY + 112, { align: 'center', maxWidth: approvalColumnWidth - 12 });
    });

    if (preview) {
      return document.output('blob');
    }
    document.save(`${fileName}.pdf`);
  };

  const TableView = ({ data, columns, fileName = 'records', onAdd, onEdit, onDelete, onExport: customExport, aboveTable }) => {
    const showActions = Boolean(onEdit && onDelete);
    const nameColumns = new Set(['head', 'householdhead', 'mothername', 'childname', 'firstname', 'lastname', 'name']);
    const updatedColumn = getColumnKey(columns.find((column) =>
      nameColumns.has(getColumnKey(column).toLowerCase())
    ) || columns[0] || '').toLowerCase();
    const exportTable = () => exportPdfFile({
      fileName,
      title: fileName.replace(/-/g, ' '),
      headers: columns,
      rows: data.map((row) => columns.map((column) => row[getColumnKey(column)] ?? '')),
    });

    return (
      <FormCard>
      <FormToolbar onAdd={onAdd} onExport={customExport || exportTable} recordCount={data.length} />
      <div className="overflow-x-auto px-5 pb-5 pt-2">
        {aboveTable}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600"
                >
                  {col}
                </th>
              ))}
              {showActions && (
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showActions ? 1 : 0)}
                  className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
                >
                  {searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/20">
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-2.5 text-center text-sm font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                    >
                      {col === 'Status' ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            row[getColumnKey(col)] === 'Active' || row[getColumnKey(col)] === 'Synced'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {row[getColumnKey(col)]}
                        </span>
                      ) : ['notes', 'remarks'].includes(getColumnKey(col).toLowerCase()) ? (
                        <ExpandableNote value={row[getColumnKey(col)]} darkMode={darkMode} />
                      ) : (
                        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1">
                          <span className={`min-w-0 ${
                            getColumnKey(col).toLowerCase() === updatedColumn
                              ? 'whitespace-normal break-words'
                              : 'truncate'
                          }`}>{row[getColumnKey(col)]}</span>
                          {getColumnKey(col).toLowerCase() === updatedColumn && row._raw?.updated_at && (
                            <span className="inline-flex max-w-full items-center justify-center rounded-full bg-pink-100 px-1.5 py-0.5 text-center text-[9px] font-semibold text-pink-700">
                              Updated
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                  {showActions && (
                    <td className="px-3 py-2.5 border border-gray-200 dark:border-gray-600">
                      <RowActions onEdit={() => onEdit(row.id)} onDelete={() => onDelete(row.id)} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </FormCard>
    );
  };

  // ====================================================================
  // SIDEBAR
  // ====================================================================

  const Sidebar = () => (
    <aside
      className={`relative flex h-full min-h-0 flex-shrink-0 flex-col border-r transition-all duration-300 ${
        isExpanded ? 'w-64' : 'w-20'
      }`}
      style={{
        background: darkMode ? THEME.dark.sidebar : THEME.light.sidebarGradient,
        borderColor: darkMode ? THEME.dark.border : 'rgba(255, 255, 255, 0.35)',
        overflow: 'visible',
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -right-3.5 top-6 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition hover:scale-105"
        aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      <div className={`flex flex-shrink-0 items-center px-4 pt-5 pb-4 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
        <div className={`flex min-w-0 items-center gap-3 ${!isExpanded ? 'justify-center' : ''}`}>
          <img
            src={nutrigridIcon}
            alt="NutriGrid"
            className="h-14 w-14 flex-shrink-0 rounded-xl object-cover shadow-md"
          />
          {isExpanded && (
            <div className="overflow-hidden transition-all duration-200">
              <p className="truncate text-lg font-semibold leading-tight" style={{ color: darkMode ? THEME.dark.text : THEME.light.text }}>
                NutriGrid
              </p>
              <p className="mt-1 truncate text-sm" style={{ color: darkMode ? THEME.dark.muted : THEME.light.muted }}>
                {adminName}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pt-4 pb-3">
        {navItems.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              title={!isExpanded ? label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex w-full flex-shrink-0 items-center rounded-2xl transition-all ${
                isExpanded ? 'gap-3 px-4 py-2.5 text-base font-medium' : 'justify-center px-0 py-2.5 text-base font-medium'
              }`}
              style={
                isActive
                  ? { background: THEME.accentGradient, color: '#FFFFFF', boxShadow: '0 4px 14px rgba(143, 101, 255, 0.35)' }
                  : { color: darkMode ? THEME.dark.muted : THEME.light.text }
              }
              onMouseEnter={(event) => {
                if (!isActive) event.currentTarget.style.backgroundColor = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.45)';
              }}
              onMouseLeave={(event) => {
                if (!isActive) event.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isActive && isExpanded && (
                <span className="absolute left-1.5 top-2 bottom-2 w-1 rounded-full bg-white/85" aria-hidden="true" />
              )}
              <Icon size={26} strokeWidth={2.2} className="flex-shrink-0" />
              {isExpanded && <span className="truncate text-left leading-snug">{label}</span>}
            </button>
          );
        })}
      </nav>

      <div
        className={`flex-shrink-0 border-t px-4 pt-2 pb-4 ${isExpanded ? '' : 'flex justify-center'}`}
        style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}
      >
        <button
          type="button"
          onClick={() => onLogout?.()}
          title={!isExpanded ? 'Logout' : undefined}
          className={`flex w-full items-center rounded-2xl text-red-500 transition hover:bg-red-50/70 ${
            isExpanded ? 'gap-3 px-4 py-3 text-sm font-medium' : 'justify-center px-0 py-3'
          }`}
        >
          <LogOut size={19} className="flex-shrink-0" />
          {isExpanded && <span className="text-base font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );

  const OverviewCard = ({ icon: Icon, label, value, accent, tint, trend }) => (
    <div
      className="relative flex min-h-[104px] min-w-0 items-center overflow-hidden rounded-2xl border px-3 py-3 shadow-sm"
      style={{
        background: `linear-gradient(135deg, #FFFFFF 0%, ${tint} 100%)`,
        borderColor: `${accent}30`,
      }}
    >
      <div
        className="absolute left-3 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-sm"
        style={{ background: `linear-gradient(145deg, ${accent} 0%, ${accent}CC 100%)` }}
      >
        <Icon className="block shrink-0" size={32} strokeWidth={2.2} aria-hidden="true" />
      </div>
      <div className="relative z-10 w-full min-w-0 text-center">
        <p className="truncate text-sm font-bold leading-tight" style={{ color: THEME.light.text }}>
          {label}
        </p>
        <p className="mt-1 text-3xl font-extrabold leading-none" style={{ color: THEME.light.text }}>
          {value}
        </p>
      </div>
      <span title={trend.description} aria-label={trend.description} className={`absolute bottom-2 right-3 z-10 inline-flex items-center gap-0.5 text-[10px] font-bold ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {trend.isPositive
          ? <TrendingUp size={12} strokeWidth={2.5} aria-hidden="true" />
          : <TrendingDown size={12} strokeWidth={2.5} aria-hidden="true" />}
        {trend.label}
      </span>
      <div
        className="absolute -bottom-7 -right-2 h-16 w-24 rotate-[-18deg] rounded-full opacity-20"
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />
    </div>
  );

  const dashCardClass = 'rounded-3xl p-5';
  const dashCardStyle = darkMode
    ? {
        backgroundColor: THEME.dark.card,
        border: `1px solid ${THEME.dark.border}`,
      }
    : {
        background: 'linear-gradient(135deg, #FFF5FB 0%, #FAF5FF 100%)',
        border: `1px solid ${THEME.light.border}`,
      };
  const titleColor = darkMode ? THEME.dark.text : THEME.light.text;
  const chartMutedColor = darkMode ? THEME.dark.muted : THEME.light.muted;
  const mutedColor = darkMode ? THEME.dark.muted : THEME.light.muted;

  const EmptyState = ({ message }) => (
    <div className="h-full min-h-[200px] flex items-center justify-center text-center px-4">
      <p className="text-sm" style={{ color: chartMutedColor }}>
        {message}
      </p>
    </div>
  );

  // ====================================================================
  // DASHBOARD
  // ====================================================================

  const DashboardView = () => (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: mutedColor }}>
          Over View
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <OverviewCard icon={Home} label="Total Households" value={stats.totalHouseholds} accent="#7048E8" tint="#F1EDFF" trend={stats.trends.totalHouseholds} />
          <OverviewCard icon={Heart} label="Pregnant Women" value={stats.pregnantWomen} accent="#D94E9F" tint="#FFF0F7" trend={stats.trends.pregnantWomen} />
          <OverviewCard icon={Baby} label="Children (0-5)" value={stats.childrenUnderFive} accent="#35AFC1" tint="#E9FAFC" trend={stats.trends.childrenUnderFive} />
          <OverviewCard icon={FileText} label="Total Records" value={stats.totalRecords} accent="#E99A45" tint="#FFF5E9" trend={stats.trends.totalRecords} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 min-h-[250px] rounded-3xl p-4" style={dashCardStyle}>
          <p className="text-base font-bold mb-2" style={{ color: titleColor }}>
            New vs. Repeat Malnutrition Cases
          </p>
          <div className="flex min-h-[195px] items-center justify-center gap-6">
            <div className="h-[190px] w-[190px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={malnutritionStatusData.filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {malnutritionStatusData
                      .filter((d) => d.value > 0)
                      .map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [v, 'Cases']}
                    contentStyle={{
                      borderRadius: '12px',
                      border: `1px solid ${darkMode ? THEME.dark.border : THEME.light.border}`,
                      backgroundColor: '#FFFFFF',
                      color: THEME.light.text,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex min-w-[130px] flex-1 flex-col justify-center gap-4">
              {malnutritionStatusData.map((item) => (
                <div key={item.name} className="border-b pb-3 last:border-b-0 last:pb-0" style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-semibold" style={{ color: chartMutedColor }}>
                      {item.name}
                    </span>
                    <span className="ml-auto text-sm font-bold" style={{ color: titleColor }}>
                      {item.value}
                    </span>
                  </div>
                  <p className="ml-5 mt-1 text-xs font-medium" style={{ color: chartMutedColor }}>{item.pct}% of cases</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`lg:col-span-6 ${dashCardClass}`} style={dashCardStyle}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-base font-bold" style={{ color: titleColor }}>
              Top 10 Puroks by Households
            </p>
            <MonthYearPicker
              value={purokPeriod}
              onChange={setPurokPeriod}
              max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
              darkMode={darkMode}
              label="Filter Top 10 Puroks by month and year"
            />
          </div>
          {purokData.length === 0 ? (
            <div className="min-h-[150px]">
              <EmptyState message="No household records yet. This chart fills in as records are saved." />
            </div>
          ) : (
            <div className="space-y-1.5" aria-label="Top 10 puroks ranked by households">
              {purokData.map(({ name, value }) => {
                return (
                  <div key={name} className="grid grid-cols-[3.25rem_minmax(0,1fr)_1rem] items-center gap-2 text-[11px]">
                    <span className="truncate" style={{ color: chartMutedColor }}>{name}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-purple-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(value / maxPurokHouseholdCount) * 100}%`,
                          backgroundColor: THEME.accentPurple,
                        }}
                      />
                    </div>
                    <span className="text-right font-medium" style={{ color: titleColor }}>{value}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={`${dashCardClass} p-6`} style={dashCardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm font-bold" style={{ color: titleColor }}>
            Total Vulnerable Demographics Trend
          </p>
          <div className="ml-auto">
            <MonthYearPicker
              value={monthlyTrendEndMonth}
              onChange={setMonthlyTrendEndMonth}
              min={monthlyTrendMonthOptions[0]?.value}
              max={monthlyTrendMonthOptions[monthlyTrendMonthOptions.length - 1]?.value}
              darkMode={darkMode}
              label="Choose the last month in the trend window"
            />
          </div>
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              color: mutedColor,
              backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : THEME.light.surface,
            }}
          >
            {monthlyTrendMonthOptions.find((month) => month.value === monthlyTrendEndMonth)?.label || monthlyTrendEndMonth} · 6-month window
          </span>
        </div>
        <p className="mb-3 text-xs" style={{ color: mutedColor }}>
          Barangay-wide counts: children with recorded underweight, stunted, or wasted status; pregnancy registrations not past any recorded due date; lactating women within 24 months after delivery; and infants aged 0–11 months based on date of birth.
        </p>
        <div className="h-[280px]">
          {!activeMonthlyTrend ? (
            <EmptyState message="No dated records are available for the selected monthly trend." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#554153' : '#f0f0f0'} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: darkMode ? '#D8C8D6' : '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: darkMode ? '#D8C8D6' : '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{
                    borderRadius: '12px',
                    border: `1px solid ${darkMode ? '#67445F' : '#E8DCEF'}`,
                    backgroundColor: '#FFFFFF',
                    color: titleColor,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                />
                <Legend wrapperStyle={{ color: titleColor }} />
                <Line type="monotone" dataKey="vulnerableCases" stroke={THEME.accentPink} strokeWidth={2.5} dot={{ r: 4 }} name="Total Underweight / Stunted / Wasted Cases" />
                <Line type="monotone" dataKey="pregnantAndLactating" stroke={THEME.accentPurple} strokeWidth={2.5} dot={{ r: 4 }} name="Pregnant & Lactating Women" />
                <Line type="monotone" dataKey="infants" stroke="#2B9A8F" strokeWidth={2.5} dot={{ r: 4 }} name="Infants (0–11 months)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div id="admin-map-section" className={dashCardClass} style={dashCardStyle}>
        <InteractiveMapComponent
          darkMode={darkMode}
          onPurokResidents={handlePurokResidents}
          onScheduleVisit={handleScheduleVisit}
          households={households}
          pregnantWomenData={pregnantWomenData}
          lactatingWomenData={lactatingWomenData}
          infantFeedingData={infantFeedingData}
          environmentalSanitationData={environmentalSanitationData}
          natalityData={natalityData}
          dataStatus={adminDataStatus}
          highlightedPuroks={alertPuroks}
        />
      </div>

    </div>
  );

  const environmentalColumnKeys = [
    'purok',
    'totalHH',
    'totalFamilies',
    'maleCount',
    'femaleCount',
    'totalPopulation',
    'hhWithOccupation',
    'toiletVS',
    'toiletOP',
    'toiletCommunal',
    'toiletNone',
    'waterSourceI',
    'waterSourceII',
    'waterSourceIII',
    'withoutPotableWater',
    'electricityOwned',
    'electricityConnected',
    'vegetableGarden',
    'herbalGarden',
    'backyardPoultry',
    'swine',
    'fishPond',
    'usesIodizedSalt',
    'malunggayTree',
    'garbageCollect',
    'garbageCompostPit',
    'garbageBurned',
    'householdSmoker',
    'householdNonsmoker',
    'fatherReceivingRe',
    'iodizedSaltSariSari',
    'iodizedSaltGrocery',
    'estBakery',
    'estCarenderia',
    'estRestaurant',
    'estHotelRest',
  ];
  const environmentalExportHeaders = [
    'Purok',
    'Total HH',
    'Total Families',
    'Total HH Members (Male)',
    'Total HH Members (Female)',
    'Total Population',
    'HH Member With Occupation',
    'WS',
    'OP',
    'Communal',
    'NO SANITARY TOILET',
    'I',
    'II',
    'III',
    'Without Potable Water Source',
    'Electricity Owned',
    'Electricity Connected',
    'Vegetable Garden',
    'Herbal Garden',
    'Backyard Poultry/Livestock',
    'Swine',
    'Fish Pond',
    'Uses Iodized Salt',
    'With Malunggay Tree',
    'Collected',
    'Compost Pit',
    'Burned',
    'HH W/ Smoker',
    'HH W/ Non-Smoker',
    'CH. NL Father',
    'Sari-Sari Store Selling Iodized Salt',
    'Grocery Store Selling Iodized Salt',
    'Bakery',
    'Carenderia',
    'Restaurant',
    'Hotel',
  ];

  const environmentalHeadRows = [
    [
      { label: 'PUROK', rowSpan: 2 },
      { label: 'TOTAL NO. OF HH', rowSpan: 2 },
      { label: 'TOTAL NO. OF FAMILIES', rowSpan: 2 },
      { label: 'TOTAL NO. OF HH MEMBERS', colSpan: 2 },
      { label: 'TOTAL POPULATION', rowSpan: 2 },
      { label: 'NO. OF HH MEMBER WITH OCCUPATION', rowSpan: 2 },
      { label: 'TOILET TYPE', colSpan: 4 },
      { label: 'HOUSEHOLD WATER SUPPLY', colSpan: 4 },
      { label: 'ELECTRICITY', colSpan: 2 },
      { label: 'FOOD PRODUCTION', colSpan: 7 },
      { label: 'GARBAGE DISPOSAL', colSpan: 3 },
      { label: 'HEALTH METRICS', colSpan: 5 },
      { label: 'ESTABLISHMENTS USING IODIZED SALT', colSpan: 4 },
    ],
    [
      { label: 'MALE' }, { label: 'FEMALE' },
      { label: 'WS' }, { label: 'OP' }, { label: 'COMMUNAL' }, { label: 'NO SANITARY TOILET' },
      { label: 'I' }, { label: 'II' }, { label: 'III' },
      { label: 'WITHOUT POTABLE WATER SOURCE' },
      { label: 'OWNED' }, { label: 'CONNECT' },
      { label: 'VEG. GARDEN' }, { label: 'HERBAL GARDEN' },
      { label: 'BACKYARD POULTRY/LIVESTOCK' }, { label: 'SWINE' }, { label: 'FISH POND' },
      { label: 'USES IODIZED SALT' }, { label: 'WITH MAL. TREE' },
      { label: 'COLLECTED' }, { label: 'COMPOST PIT' }, { label: 'BURNED' },
      { label: 'HH W/ SMOKER' }, { label: 'HH W/ NON-SMOKER' }, { label: 'CH. NL FATHER' },
      { label: 'SARI-SARI STORE SELLING IODIZED SALT' },
      { label: 'GROCERY STORE SELLING IODIZED SALT' },
      { label: 'BAKERY' }, { label: 'CARENDERIA' }, { label: 'RESTAURANT' }, { label: 'HOTEL' },
    ],
  ];

  const infantFeedingHeadRows = [
    [
      { label: 'No.', rowSpan: 2 },
      { label: 'Purok', rowSpan: 2 },
      { label: 'Pangalan ng Nanay', rowSpan: 2 },
      { label: 'Pangalan ng Bata', rowSpan: 2 },
      { label: 'Paraan ng Pagpapakain o Pagpapainom', colSpan: 6 },
      { label: 'Iron with Folic Acid', colSpan: 2 },
      { label: 'Notes', rowSpan: 2 },
      ACTIONS_HEAD_CELL,
    ],
    [
      { label: '1 Linggo' },
      { label: '1 Buwan' },
      { label: '2 Buwan' },
      { label: '3 Buwan' },
      { label: '4 Buwan' },
      { label: '5 Buwan' },
    ],
  ];

  const pregnantWomenHeadRows = [
    [
      { label: 'No.', rowSpan: 2 },
      { label: 'Purok', rowSpan: 2 },
      { label: 'Date of Registration', rowSpan: 2 },
      { label: 'Family Serial Number', rowSpan: 2 },
      { label: 'Name of Pregnant Woman', colSpan: 3 },
      { label: 'Name of Spouse', rowSpan: 2 },
      { label: 'Contact Number', rowSpan: 2 },
      { label: 'Birthday', rowSpan: 2 },
      { label: 'Age', rowSpan: 2 },
      { label: 'Civil Status', rowSpan: 2 },
      { label: 'LMP', rowSpan: 2 },
      { label: 'EDD', rowSpan: 2 },
      { label: 'PhilHealth', rowSpan: 2 },
      { label: '4Ps', rowSpan: 2 },
      { label: 'Measurements', colSpan: 4 },
      { label: 'Given Iron with Folic Acid', colSpan: 2 },
      { label: 'Notes', rowSpan: 2 },
      ACTIONS_HEAD_CELL,
    ],
    [
      { label: 'Last Name' },
      { label: 'First Name' },
      { label: 'Middle Name' },
      { label: 'Wt.' },
      { label: 'Ht.' },
      { label: 'BMI' },
      { label: 'MUAC' },
      { label: 'For' },
      { label: 'Amount of Tabs' },
    ],
  ];

  const monthlyNatalityHeadRows = [
    [
      { label: 'No.', rowSpan: 2 },
      { label: 'Purok', rowSpan: 2 },
      { label: 'Name of Mother', rowSpan: 2 },
      { label: 'Mother Birthday', rowSpan: 2 },
      { label: 'Mother Age', rowSpan: 2 },
      { label: 'Name of Child', rowSpan: 2 },
      { label: 'Sex', rowSpan: 2 },
      { label: 'Date of Birth', rowSpan: 2 },
      { label: 'Birth Weight', rowSpan: 2 },
      { label: 'Date of Follow-up Weighing', rowSpan: 2 },
      { label: 'AIM (Months)', rowSpan: 2 },
      { label: 'Length (cm)', rowSpan: 2 },
      { label: 'Measurements', colSpan: 2 },
      { label: 'Nutrition Status', colSpan: 3 },
      { label: 'Iron Drops for LBW/Preterm Babies', rowSpan: 2 },
      { label: 'Given Vitamin A', rowSpan: 2 },
      { label: 'Vitamin A Quantity', rowSpan: 2 },
      { label: 'Fully Immunized (9–12 months)', rowSpan: 2 },
      { label: 'Newborn Babies', rowSpan: 2 },
      { label: 'Remarks', rowSpan: 2 },
      ACTIONS_HEAD_CELL,
    ],
    [
      { label: 'Wt. (kg)' },
      { label: 'Height (cm)' },
      { label: 'W/A' },
      { label: 'H/A' },
      { label: 'W/L or H/L' },
    ],
  ];

  const Residents = () => (
    <div className="space-y-4">
      {residentPurokFilter && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${darkMode ? 'border-blue-900 bg-blue-950/40 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
          <span className="text-sm font-semibold">Showing residents in {residentPurokFilter}</span>
          <button
            type="button"
            onClick={() => setResidentPurokFilter('')}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:bg-blue-100"
          >
            Clear purok filter
          </button>
        </div>
      )}
      <AdminReportTable
        darkMode={darkMode}
        data={filteredResidentHouseholds}
        purokFilter={adminPurokFilter}
        onPurokFilterChange={setAdminPurokFilter}
        columnKeys={['purok', 'head', 'members', 'lastVisit', 'notes']}
        singleRowHeaders={['Purok', 'Household Head', 'Members', 'Last Visit', 'Notes']}
        reportHeader={
          <ReportHeader
            title="Residents Masterlist"
            subtitle={`Barangay ${REPORT_META.barangay}`}
            fields={[
              { label: 'Barangay', value: REPORT_META.barangay },
              { label: 'Municipality', value: REPORT_META.municipality },
              { label: 'Province', value: REPORT_META.province },
            ]}
          />
        }
        emptyMessage={searchTerm.trim() || residentPurokFilter ? 'No records match the current filters.' : 'No records yet.'}
        exportActions={
          <ReportExportActions
            title="Residents Masterlist"
            fileName="alawihao-residents"
            headers={['Purok', 'Household Head', 'Members', 'Last Visit', 'Notes']}
            rows={filteredResidentHouseholds.map((row) => [row.purok, row.head, row.members, row.lastVisit, row.notes])}
            signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
            onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-residents',
            title: 'Residents Masterlist',
            headers: ['Purok', 'Household Head', 'Members', 'Last Visit', 'Notes'],
            rows: filteredResidentHouseholds.map((row) => [row.purok, row.head, row.members, row.lastVisit, row.notes]),
            signatures,
            preview: options.preview,
            })}
          />
        }
        {...residentActions}
      />
    </div>
  );

  const EnvironmentalSanitation = () => {
    const numericKeys = [
      'totalHH', 'totalFamilies', 'maleCount', 'femaleCount', 'totalPopulation', 'hhWithOccupation',
      'toiletVS', 'toiletOP', 'toiletCommunal', 'toiletNone', 'waterSourceI', 'waterSourceII',
      'waterSourceIII', 'withoutPotableWater',
      'electricityOwned', 'electricityConnected', 'vegetableGarden', 'herbalGarden',
      'backyardPoultry', 'swine', 'fishPond', 'usesIodizedSalt', 'malunggayTree',
      'garbageCollect', 'garbageCompostPit', 'garbageBurned',
      'householdSmoker', 'householdNonsmoker', 'fatherReceivingRe',
      'iodizedSaltSariSari', 'iodizedSaltGrocery',
      'estBakery', 'estCarenderia', 'estRestaurant', 'estHotelRest',
    ];
    const grouped = new Map();
    filteredEnvironmental.forEach((record) => {
      const purok = normalizePurokName(record.purok) || record.purok || 'Unassigned';
      const current = grouped.get(purok) || {
        purok,
        id: record.id,
        _raw: record._raw || record,
      };
      numericKeys.forEach((key) => {
        current[key] = (current[key] || 0) + (Number(record[key]) || 0);
      });
      grouped.set(purok, current);
    });
    const tableData = Array.from({ length: 10 }, (_, index) => {
      const normalizedPurok = `Purok ${index + 1}`;
      const purok = `P-${index + 1}`;
      const row = { ...(grouped.get(normalizedPurok) || {}), purok };
      numericKeys.forEach((key) => { row[key] = row[key] || 0; });
      return row;
    });
    const total = { purok: 'TOTAL' };
    numericKeys.forEach((key) => { total[key] = tableData.reduce((sum, row) => sum + (Number(row[key]) || 0), 0); });
    tableData.push(total);
    return (
      <AdminReportTable
        darkMode={darkMode}
        data={tableData}
        purokFilter={adminPurokFilter}
        onPurokFilterChange={setAdminPurokFilter}
        columnKeys={environmentalColumnKeys}
        headRows={environmentalHeadRows}
        reportHeader={
          <ReportHeader
            title="BNS Environmental Sanitation Report"
            subtitle={`Barangay: ${REPORT_META.barangay}`}
            fields={[
              { label: 'Barangay', value: REPORT_META.barangay },
              { label: 'Report Year', value: REPORT_META.reportYear },
              { label: 'Municipality', value: REPORT_META.municipality },
            ]}
          />
        }
        getCellValue={(row, key) => row[key] ?? 0}
        showPurokFilter={false}
        emptyMessage={searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
        minTableWidth={1100}
        exportActions={
          <ReportExportActions
            title="BNS Environmental Sanitation Report"
            fileName="alawihao-environmental-sanitation-2026"
            headers={environmentalExportHeaders}
            rows={tableData.map((record) =>
              environmentalColumnKeys.map((key) =>
                record[key] ?? 0
              )
            )}
            preamble={[
              `Barangay: ${REPORT_META.barangay}`,
              `Report Year: ${REPORT_META.reportYear}`,
            ]}
            signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
            onExportPdf={(signatures, options = {}) => exportPdfFile({
              fileName: 'alawihao-environmental-sanitation-2026',
              title: 'BNS Environmental Sanitation Report',
              headers: environmentalExportHeaders,
              rows: tableData.map((record) =>
                environmentalColumnKeys.map((key) =>
                  record[key] ?? 0
                )
              ),
              preamble: [
                `Barangay: ${REPORT_META.barangay}`,
                `Report Year: ${REPORT_META.reportYear}`,
              ],
              signatures,
              preview: options.preview,
            })}
          />
        }
        {...environmentalActions}
      />
    );
  };

  const InfantFeeding = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredInfantFeeding}
      purokFilter={adminPurokFilter}
      onPurokFilterChange={setAdminPurokFilter}
      columnKeys={['no', 'purok', 'motherName', 'childName', 'week1', 'month1', 'month2', 'month3', 'month4', 'month5', 'notes']}
      headRows={infantFeedingHeadRows}
      legend="Code: E — Exclusive Breastfeeding | M — Mixed Feeding | N — Not Breastfeeding"
      minTableWidth={980}
      reportHeader={
        <ReportHeader
          title="Uri ng Paraan ng Pagpapakain sa Sanggol"
          subtitle="Classification of Infant Feeding Practices"
          fields={[
            { label: 'Lungsod/Munisipalidad', value: REPORT_META.municipality },
            { label: 'Barangay (Purok/Sitio/Zone/Block)', value: REPORT_META.barangay },
            { label: 'Petsa ng Pagsusumite ng Forms-B', value: REPORT_META.formsSubmitDate },
            { label: 'Pangalan ng Gumagabay sa Nanay (BNS)', value: REPORT_META.bnsGuide },
            { label: 'Panahon ng Pagbisita — Simula', value: REPORT_META.visitPeriodStart },
            { label: 'Panahon ng Pagbisita — Tapos', value: REPORT_META.visitPeriodEnd },
          ]}
        />
      }
      emptyMessage={searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
      exportActions={
        <ReportExportActions
          title="Infant Feeding (0-5 mo)"
          fileName="alawihao-infant-feeding"
          headers={['No.', 'Purok', 'Mother', 'Child', '1 Week', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months', 'Notes']}
          rows={filteredInfantFeeding.map((row) => [
            row.no,
            row.purok,
            row.motherName,
            row.childName,
            row.week1,
            row.month1,
            row.month2,
            row.month3,
            row.month4,
            row.month5,
            row.notes,
          ])}
          onExportPdf={() => exportPdfFile({
          fileName: 'alawihao-infant-feeding',
          title: 'Infant Feeding (0-5 mo)',
          headers: ['No.', 'Purok', 'Mother', 'Child', '1 Week', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months', 'Notes'],
          rows: filteredInfantFeeding.map((row) => [
            row.no,
            row.purok,
            row.motherName,
            row.childName,
            row.week1,
            row.month1,
            row.month2,
            row.month3,
            row.month4,
            row.month5,
            row.notes,
          ]),
          })}
        />
      }
      {...infantFeedingActions}
    />
  );

  const lactatingExportHeaders = [
    'No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name',
    'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'PhilHealth',
    '4Ps', 'Wt.', 'Ht.', 'BMI', 'MUAC', 'Iron with Folic Acid', 'Date Delivered', 'Notes',
  ];
  const lactatingExportRows = filteredLactating.map((row) => [
    row.no, row.purok, row.dateRegistration, row.familySerial, row.lastName, row.firstName,
    row.middleName, row.spouseName, row.contactNumber, row.birthday, row.age, row.civilStatus,
    row.philhealth, row.fourPs, row.wt, row.ht, row.bmi, row.muac, row.ironFolicAcid, row.dateDelivered, row.notes,
  ]);
  const LactatingWomen = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredLactating}
      purokFilter={adminPurokFilter}
      onPurokFilterChange={setAdminPurokFilter}
      columnKeys={[
        'no',
        'purok',
        'dateRegistration',
        'familySerial',
        'lastName',
        'firstName',
        'middleName',
        'spouseName',
        'contactNumber',
        'birthday',
        'age',
        'civilStatus',
        'philhealth',
        'fourPs',
        'wt',
        'ht',
        'bmi',
        'muac',
        'ironFolicAcid',
        'dateDelivered',
        'notes',
      ]}
      singleRowHeaders={[
        'No.',
        'Purok',
        'Date Registration',
        'Family Serial No.',
        'Last Name',
        'First Name',
        'Middle Name',
        'Spouse',
        'Contact',
        'Birthday',
        'Age',
        'Civil Status',
        'PhilHealth',
        '4Ps',
        'Wt.',
        'Ht.',
        'BMI',
        'MUAC',
        'Iron with Folic Acid',
        'Date Delivered',
        'Notes',
      ]}
      reportHeader={
        <ReportHeader
          title="Masterlist Lactating Women"
          subtitle={`Barangay: ${REPORT_META.barangay}`}
          fields={[
            { label: 'Month/Year', value: REPORT_META.monthYear },
            { label: 'Purok', value: 'All Puroks' },
            { label: 'City/Municipality', value: REPORT_META.municipality },
            { label: 'Province', value: REPORT_META.province },
            { label: 'Barangay', value: REPORT_META.barangay },
          ]}
        />
      }
      emptyMessage={searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
      onExport={() => exportPdfFile({
        fileName: 'alawihao-lactating-women',
        title: 'Masterlist Lactating Women',
        headers: lactatingExportHeaders,
        rows: lactatingExportRows,
      })}
      exportActions={
        <ReportExportActions
          title="Masterlist Lactating Women"
          fileName="alawihao-lactating-women"
          headers={lactatingExportHeaders}
          rows={lactatingExportRows}
          signatureOptions={BNS_RHM_RHMPP_NDP_SIGNATURE_OPTIONS}
          onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-lactating-women',
            title: 'Masterlist Lactating Women',
            headers: lactatingExportHeaders,
            rows: lactatingExportRows,
            signatures,
            preview: options.preview,
          })}
        />
      }
      minTableWidth={1700}
      {...lactatingActions}
    />
  );

  const PregnantWomen = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredPregnant}
      purokFilter={adminPurokFilter}
      onPurokFilterChange={setAdminPurokFilter}
      columnKeys={[
        'no',
        'purok',
        'dateRegistration',
        'familySerial',
        'lastName',
        'firstName',
        'middleName',
        'spouseName',
        'contactNumber',
        'birthday',
        'age',
        'civilStatus',
        'lmp',
        'expectedDelivery',
        'philhealth',
        'fourPs',
        'wt',
        'ht',
        'bmi',
        'muac',
        'ironFolicAcidType',
        'ironFolicAcid',
        'notes',
      ]}
      headRows={pregnantWomenHeadRows}
      reportHeader={
        <ReportHeader
          title="Masterlist of Pregnant Women"
          subtitle={`Barangay: ${REPORT_META.barangay}`}
          fields={[
            { label: 'LGU', value: REPORT_META.municipality },
            { label: 'Month', value: REPORT_META.monthYear },
            { label: 'City/Municipality', value: REPORT_META.municipality },
            { label: 'Province', value: REPORT_META.province },
            { label: 'Barangay', value: REPORT_META.barangay },
          ]}
        />
      }
      emptyMessage={searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
      exportActions={
        <ReportExportActions
          title="Masterlist of Pregnant Women"
          fileName="alawihao-pregnant-women"
          headers={['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'LMP', 'Expected Delivery', 'PhilHealth', '4Ps', 'Wt', 'Ht', 'BMI', 'MUAC', 'Given Iron with Folic Acid for', 'Amount of Tabs', 'Notes']}
          rows={filteredPregnant.map((row) => [
            row.no,
            row.purok,
            row.dateRegistration,
            row.familySerial,
            row.lastName,
            row.firstName,
            row.middleName,
            row.spouseName,
            row.contactNumber,
            row.birthday,
            row.age,
            row.civilStatus,
            row.lmp,
            row.expectedDelivery,
            row.philhealth,
            row.fourPs,
            row.wt,
            row.ht,
            row.bmi,
            row.muac,
            row.ironFolicAcidType,
            row.ironFolicAcid,
            row.notes,
          ])}
          signatureOptions={BNS_RHM_RHMPP_NDP_SIGNATURE_OPTIONS}
          onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-pregnant-women',
            title: 'Masterlist of Pregnant Women',
            headers: ['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'LMP', 'Expected Delivery', 'PhilHealth', '4Ps', 'Wt', 'Ht', 'BMI', 'MUAC', 'Given Iron with Folic Acid for', 'Amount of Tabs', 'Notes'],
            rows: filteredPregnant.map((row) => [
              row.no, row.purok, row.dateRegistration, row.familySerial, row.lastName,
              row.firstName, row.middleName, row.spouseName, row.contactNumber,
              row.birthday, row.age, row.civilStatus, row.lmp, row.expectedDelivery,
              row.philhealth, row.fourPs, row.wt, row.ht, row.bmi, row.muac,
              row.ironFolicAcidType, row.ironFolicAcid, row.notes,
            ]),
            signatures,
            preview: options.preview,
          })}
        />
      }
      onExport={() =>
        exportPdfFile({
          fileName: 'alawihao-pregnant-women',
          title: 'Masterlist of Pregnant Women',
          headers: ['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'LMP', 'Expected Delivery', 'PhilHealth', '4Ps', 'Wt', 'Ht', 'BMI', 'MUAC', 'Given Iron with Folic Acid for', 'Amount of Tabs', 'Notes'],
          rows: filteredPregnant.map((row) => [
            row.no,
            row.purok,
            row.dateRegistration,
            row.familySerial,
            row.lastName,
            row.firstName,
            row.middleName,
            row.spouseName,
            row.contactNumber,
            row.birthday,
            row.age,
            row.civilStatus,
            row.lmp,
            row.expectedDelivery,
            row.philhealth,
            row.fourPs,
            row.wt,
            row.ht,
            row.bmi,
            row.muac,
            row.ironFolicAcidType,
            row.ironFolicAcid,
            row.notes,
          ]),
        })
      }
      minTableWidth={2000}
      {...pregnantActions}
    />
  );

  const natalityExportHeaders = [
    'No.', 'Purok', 'Mother', 'Mother Birthday', 'Mother Age', 'Child', 'Sex', 'DOB', 'Birth Weight', 'Follow-up Date',
    'AIM (Months)', 'Length (cm)', 'Wt (kg)', 'Height (cm)', 'W/A', 'H/A', 'W/L/H',
    'Iron Drops for LBW/Preterm', 'Given Vitamin A', 'Vitamin A Quantity',
    'Fully Immunized (9–12 months)', 'Newborn Babies', 'Remarks',
  ];
  const natalityExportRows = filteredNatality.map((row) => [
    row.no, row.purok, row.motherName, row.motherBirthday, row.motherAge, row.childName, row.sex, row.dob, row.birthWeight,
    row.dow, row.aim, row.length, row.weight, row.height, row.wA, row.hA, row.wLH,
    row.ironStatus, row.vitaminA, row.vitaminACount, row.fullyImmunized,
    row.newbornBabies, row.remarks,
  ]);
  const MonthlyNatality = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredNatality}
      purokFilter={adminPurokFilter}
      onPurokFilterChange={setAdminPurokFilter}
      columnKeys={['no', 'purok', 'motherName', 'motherBirthday', 'motherAge', 'childName', 'sex', 'dob', 'birthWeight', 'dow', 'aim', 'length', 'weight', 'height', 'wA', 'hA', 'wLH', 'ironStatus', 'vitaminA', 'vitaminACount', 'fullyImmunized', 'newbornBabies', 'remarks']}
      headRows={monthlyNatalityHeadRows}
      reportHeader={
        <ReportHeader
          title="Monthly Natality with Weight, Length & Height"
          subtitle={`Barangay ${REPORT_META.barangay}`}
          fields={[
            { label: 'Month', value: REPORT_META.monthYear },
            { label: 'Barangay', value: REPORT_META.barangay },
          ]}
        />
      }
      emptyMessage={searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
      onExport={() => exportPdfFile({
        fileName: 'alawihao-monthly-natality',
        title: 'Monthly Natality',
        headers: natalityExportHeaders,
        rows: natalityExportRows,
      })}
      exportActions={
        <ReportExportActions
          title="Monthly Natality"
          fileName="alawihao-monthly-natality"
          headers={natalityExportHeaders}
          rows={natalityExportRows}
          signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
          onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-monthly-natality',
            title: 'Monthly Natality',
            headers: natalityExportHeaders,
            rows: natalityExportRows,
            signatures,
            preview: options.preview,
          })}
        />
      }
      minTableWidth={1900}
      {...natalityActions}
    />
  );

  const monthlyReportBatchMonths = [
    ['January', 'February', 'March'],
    ['April', 'May', 'June'],
    ['July', 'August', 'September'],
    ['October', 'November', 'December'],
  ][monthlyReportBatch - 1];
  const monthlyReportExportHeaders = [
    'Indicator',
    `${monthlyReportBatchMonths[0]} Male`, `${monthlyReportBatchMonths[0]} Female`,
    `${monthlyReportBatchMonths[1]} Male`, `${monthlyReportBatchMonths[1]} Female`,
    `${monthlyReportBatchMonths[2]} Male`, `${monthlyReportBatchMonths[2]} Female`,
    'Total Male', 'Total Female',
  ];
  const monthlyReportSectionRowLabels = [
    'New Cases of',
    'Given Vitamin A',
    'No. Given Iron with Folic Acid',
    'No. of Infants Given Iron Drops',
    'National Immunization Program',
    'Follow-up Weighing',
    'Newborn Babies',
    'Introduce Complementary Feeding',
    'Breast Feeding IYCF Report',
    'Deliveries',
  ];
  const monthlyReportExportRows = autoMonthlyReportData
    .filter((row) => Number(row.reportQuarter || 1) === monthlyReportBatch)
    .map((row) => [
      row.indicator || row.subcategory,
      ...(row.isHeader
        ? ['', '', '', '', '', '', '', '']
        : [row.m1M, row.m1F, row.m2M, row.m2F, row.m3M, row.m3F, row.tM, row.tF]),
    ]);
  const monthlyReportMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const monthlyReportFileName = `ALAWIHAO- Monthly Report- ${monthlyReportMonth} ${REPORT_META.reportYear}`;
  const MonthlyReport = () => (
    <MonthlyReportTable
      darkMode={darkMode}
      data={autoMonthlyReportData}
      onBatchChange={setMonthlyReportBatch}
      onSaveLine={(line) => requestAdminConfirmation(
        'Are you sure you want to save these indicator changes?',
        async () => {
          try {
            const savedLine = await saveMonthlyReportLine(line);
            upsertRecord(STORAGE_KEYS.monthlyReport, savedLine);
            refreshData();
          } catch (error) {
            console.error('Could not save monthly report line:', error);
            alert(error.message);
          }
        }
      )}
      onDeleteLine={(line) => requestAdminConfirmation(
        'Are you sure you want to delete this indicator?',
        async () => {
          try {
            await deleteMonthlyReportLine(line);
            deleteRecordById(STORAGE_KEYS.monthlyReport, line.id);
            refreshData();
          } catch (error) {
            console.error('Could not delete monthly report line:', error);
            alert(error.message);
          }
        },
        { title: 'Delete indicator', confirmLabel: 'Delete', destructive: true }
      )}
      onAddLines={(lines) => {
        requestAdminConfirmation(
          `Save monthly data for ${lines.length} indicators?`,
          async () => {
            try {
              const savedLines = await Promise.all(lines.map((line) => saveMonthlyReportLine(line)));
              savedLines.forEach((savedLine) => upsertRecord(STORAGE_KEYS.monthlyReport, savedLine));
              refreshData();
            } catch (error) {
              console.error('Could not save monthly report data:', error);
              alert(error.message);
            }
          }
        );
      }}
      onGenerateReport={() => exportPdfFile({
        fileName: monthlyReportFileName,
        title: 'Essential Health Services Monthly Report',
        headers: monthlyReportExportHeaders,
        rows: monthlyReportExportRows,
        sectionRowLabels: monthlyReportSectionRowLabels,
        preamble: [
          'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
          `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
          `Batch ${monthlyReportBatch}: ${monthlyReportBatchMonths.join(', ')}`,
        ],
      })}
      exportActions={
        <ReportExportActions
          title="Essential Health Services Monthly Report"
          fileName={monthlyReportFileName}
          headers={monthlyReportExportHeaders}
          rows={monthlyReportExportRows}
          sectionRowLabels={monthlyReportSectionRowLabels}
          preamble={[
            'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
            `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
            `Batch ${monthlyReportBatch}: ${monthlyReportBatchMonths.join(', ')}`,
          ]}
          signatureOptions={BNS_RHM_RHMPP_NDP_SIGNATURE_OPTIONS}
          enableEmail
          onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-essential-health-services-2026',
            title: 'Essential Health Services Monthly Report',
            headers: monthlyReportExportHeaders,
            rows: monthlyReportExportRows,
            sectionRowLabels: monthlyReportSectionRowLabels,
            signatures,
            preview: options.preview,
            preamble: [
              'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
              `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
              `Batch ${monthlyReportBatch}: ${monthlyReportBatchMonths.join(', ')}`,
            ],
          })}
          onSendEmail={async (emailDetails) => {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session?.access_token) {
              throw new Error('Your sign-in session expired. Sign in again before sending the report.');
            }
            const response = await fetch(
              import.meta.env.VITE_REPORT_EMAIL_API_URL || '/api/reports/email',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(emailDetails),
              }
            );
            const result = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(result?.error || `Could not send report email (HTTP ${response.status}).`);
            }
            if (!result?.sent) throw new Error('The email service did not confirm delivery.');
          }}
        />
      }
    />
  );

  const UserManagement = () => (
    <div className="p-16 rounded-3xl text-center" style={cardSurfaceStyle}>
      <Users size={48} className="mx-auto text-gray-300 mb-4" />
      <p className="text-gray-500">User management coming soon</p>
    </div>
  );

  const pageTitles = {
    dashboard: null,
    residents: 'Residents',
    environmentalSanitation: 'Environmental Sanitation Report',
    infantFeeding: 'Infant Feeding (0-5 mo)',
    lactatingWoman: 'Lactating Woman',
    pregnantWoman: 'Pregnant Woman',
    monthlyNatality: 'Monthly Natality',
    monthlyReport: 'Monthly Report',
    documents: 'Documents',
    tasks: 'Tasks',
    activityLogs: 'Activity Logs',
    users: 'Settings',
  };

  const AdminCategoryForm = adminFormCategory ? getCategoryForm(adminFormCategory) : null;

  return (
    <div
      className={`min-h-screen w-full p-2 sm:p-4 md:p-6 ${darkMode ? 'dark' : ''}`}
      style={{ background: darkMode ? THEME.dark.page : THEME.light.pageGradient }}
    >
      <div
        className="flex min-w-0 w-full rounded-[2rem] overflow-hidden h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] relative"
        style={{
          background: darkMode ? THEME.dark.page : THEME.light.pageGradient,
          boxShadow: darkMode ? '0 8px 40px rgba(0,0,0,0.35)' : '0 8px 40px rgba(143, 101, 255, 0.12)',
        }}
      >
        <Sidebar />
        <main
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            backgroundColor: darkMode ? THEME.dark.page : THEME.light.main,
            backgroundImage: darkMode
              ? 'none'
              : 'radial-gradient(circle at 80% 0%, rgba(255, 117, 195, 0.08) 0%, transparent 45%), radial-gradient(circle at 0% 100%, rgba(143, 101, 255, 0.07) 0%, transparent 40%)',
          }}
        >
          <AdminHeader
            title={pageTitles[activeTab]}
            activeTab={activeTab}
            darkMode={darkMode}
            adminName={adminName}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            performSearch={performSearch}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            showSearchSuggestions={showSearchSuggestions}
            setShowSearchSuggestions={setShowSearchSuggestions}
            showNotifications={showNotifications}
            setShowNotifications={setShowNotifications}
            notifications={notifications}
            visibleNotificationItems={visibleNotificationItems}
            onNotificationClick={handleNotificationClick}
            notifRef={notifRef}
            setDarkMode={setDarkMode}
            setActiveTab={setActiveTab}
            setSelectedTaskFilter={setSelectedTaskFilter}
            adminEmail={adminEmail}
            onLogout={onLogout}
            showActivityLogs={showActivityLogs}
            setShowActivityLogs={setShowActivityLogs}
            activityLogs={activityLogs}
            activityLogLoading={activityLogLoading}
            activityLogError={activityLogError}
            currentUserId={currentUserId}
            showOnlyMyActivity={showOnlyMyActivity}
            setShowOnlyMyActivity={setShowOnlyMyActivity}
            selectedActivityId={selectedActivityId}
          />
          <div className="min-w-0 flex-1 overflow-y-auto px-3 pb-5 sm:px-5 sm:pb-6 lg:px-8 lg:pb-8">
            {adminDataStatus === 'loading' && (
              <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">
                Loading shared BHW records from Supabase...
              </p>
            )}
            {(adminDataStatus === 'error' || adminDataStatus === 'offline') && (
              <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                {adminDataStatus === 'offline'
                  ? 'Offline: showing records saved on this device; shared Supabase records will load when reconnected.'
                  : 'Could not load shared Supabase records. Showing records saved on this device; check admin read policies and the browser console.'}
              </p>
            )}
            {activeTab === 'dashboard' && DashboardView()}
            {activeTab === 'residents' && Residents()}
            {activeTab === 'environmentalSanitation' && EnvironmentalSanitation()}
            {activeTab === 'infantFeeding' && InfantFeeding()}
            {activeTab === 'lactatingWoman' && LactatingWomen()}
            {activeTab === 'pregnantWoman' && PregnantWomen()}
            {activeTab === 'monthlyNatality' && MonthlyNatality()}
            {activeTab === 'monthlyReport' && MonthlyReport()}
            {activeTab === 'documents' && (
              <AdminDocuments
                darkMode={darkMode}
                searchQuery={searchTerm}
                onSearchResultsChange={handleSearchResultsChange}
                pwaPhotos={pwaPhotoDocuments}
                onDeletePwaPhoto={requestPwaPhotoDeletion}
              />
            )}
            {(activeTab === 'tasks' || hasOpenedTasks) && (
              <div className={activeTab === 'tasks' ? '' : 'hidden'}>
              <AdminTasks
                darkMode={darkMode}
                initialPurok={scheduledVisitPurok}
                onInitialTaskHandled={clearScheduledVisitPurok}
                searchQuery={searchTerm}
                onSearchResultsChange={handleSearchResultsChange}
                selectedTaskFilter={selectedTaskFilter}
              />
              </div>
            )}
            {activeTab === 'users' && <UserManagement />}
          </div>
        </main>
      </div>

      {adminFormCategory && AdminCategoryForm && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/55 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCategoryForm();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-category-form-title"
            className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <header
              className="flex items-center justify-between gap-4 px-5 py-4 text-white"
              style={{ background: ADMIN_FORM_GRADIENTS[adminFormCategory] }}
            >
              <h2 id="admin-category-form-title" className="text-lg font-bold">
                {ADMIN_FORM_TITLES[adminFormCategory]}
              </h2>
              <button
                type="button"
                onClick={closeCategoryForm}
                className="rounded-lg p-1.5 hover:bg-white/15"
                aria-label="Close form"
              >
                <X size={21} />
              </button>
            </header>
            <div className="overflow-y-auto p-4 sm:p-6">
              <AdminCategoryForm
                userName={adminName}
                initialData={adminEditingRecord}
                onSubmit={(record) => requestAdminConfirmation(
                  `Are you sure you want to ${adminEditingRecord ? 'edit' : 'save'} this record?`,
                  async () => {
                  const key = storageKeyForCategory(record.category);
                  const pending = {
                    ...record,
                    updated_at: adminEditingRecord
                      ? new Date().toISOString()
                      : record.updated_at,
                    created_by_user_id: record.created_by_user_id || currentUserId,
                    synced: false,
                    status: 'pending',
                  };
                  await upsertRecord(key, pending);
                  if (adminEditingRecord) {
                    void recordInformationEdit({
                      category: record.category,
                      recordId: pending.id,
                      before: adminEditingRecord,
                      after: record,
                      actorRole: 'admin',
                    });
                  }
                  refreshData();
                  closeCategoryForm();
                  setAdminDataStatus('loaded');
                  void (async () => {
                    try {
                      const syncError = await syncSingleRecord(record.category, pending, {
                        includeShared: true,
                      });
                      if (syncError) {
                        const message = syncError === 'offline'
                          ? 'Saved locally. The changes will sync to Supabase when you are back online.'
                          : syncError === 'not-signed-in'
                            ? 'Saved locally. Sign in to Supabase to sync these changes.'
                            : `Saved locally, but Supabase sync failed: ${syncError}`;
                        if (!['offline', 'not-signed-in'].includes(syncError)) {
                          console.error('Admin record changes are still waiting to sync:', syncError);
                          setAdminDataStatus(navigator.onLine ? 'error' : 'offline');
                        }
                        alert(message);
                        return;
                      }
                      await upsertRecord(key, { ...pending, synced: true, status: 'Synced' });
                      refreshData();
                    } catch (error) {
                      console.error('Could not sync the admin record to Supabase:', error);
                      setAdminDataStatus(navigator.onLine ? 'error' : 'offline');
                      alert(`Saved locally, but Supabase sync failed: ${error.message || 'request failed'}`);
                    }
                  })();
                  }
                )}
                onCancel={closeCategoryForm}
              />
            </div>
          </section>
        </div>
      )}
      <ConfirmActionDialog
        open={Boolean(adminConfirmation)}
        title={adminConfirmation?.title || 'Confirm changes'}
        message={adminConfirmation?.message}
        confirmLabel={adminConfirmation?.confirmLabel || (adminEditingRecord ? 'Save changes' : 'Save')}
        destructive={adminConfirmation?.destructive}
        busy={adminConfirmationBusy}
        onCancel={() => setAdminConfirmation(null)}
        onConfirm={() => void confirmAdminAction()}
      />
    </div>
  );
};

export default AdminDashboard;