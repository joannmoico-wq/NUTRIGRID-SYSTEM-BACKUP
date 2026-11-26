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
  isRecordEdited,
  storageKeyForCategory,
  categoryIdForStorageKey,
  queueRecordDeletion,
  getRecordSyncStatus,
  updateRecordSyncStatus,
} from '../utils/bnsStorage';
import {
  applyAdminRealtimeRecordChange,
  deleteMonthlyReportLine,
  loadAdminDataFromSupabase,
  saveMonthlyReportLine,
} from '../utils/adminDataService';
import {
  syncPendingRecordDeletions,
  syncSingleRecord,
} from '../utils/syncService';
import { supabase } from '../utils/supabaseClient';
import MonthlyReportTable from './MonthlyReportTable';
import { NUTRI_GRID_THEME } from '../utils/nutriGridTheme';
import BnsSearchBar from './BnsSearchBar';
import AdminTasks from './AdminTasks';
import BhwAccountsPage from './BhwAccountsPage';
import AdminReportTable, { ACTIONS_HEAD_CELL, ExpandableNote, ReportHeader, REPORT_META } from './AdminReportTable';
import InteractiveMapComponent from './InteractiveMapComponent';
import AdminDocuments from './AdminDocuments';
import ReportExportActions from './ReportExportActions';
import ConfirmActionDialog from './ConfirmActionDialog';
import RecordSyncStatus from './RecordSyncStatus';
import { ImportRecordsExcelButton } from './RecordExcelActions';
import { normalizeImportedRecordHeaders } from '../utils/recordExcel';
import {
  Home,
  Users,
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
  ClipboardList,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getCategoryForm } from './CategorySpecificForms';
import {
  ENVIRONMENTAL_PUROK_OPTIONS,
  normalizeEnvironmentalPurokName,
  normalizePurokName,
  PUROK_OPTIONS,
  sortPurokCounts,
  comparePurokRecords,
} from '../utils/purok';
import { isTaskOverdue } from '../utils/taskSyncService';
import { calculateMonthlyTrend } from '../utils/recordTrends';
import { calculateWhoGrowthStatuses } from '../utils/childGrowth';
import {
  findRecordDuplicate,
  getDuplicateRecordName,
  updateDuplicateRecord,
} from '../utils/recordDuplicates';
import { removeNotesColumns } from '../utils/reportExport';
import {
  getActivityCategoryLabel,
  loadRecordActivityLogs,
  recordInformationCreate,
  recordInformationDelete,
  recordInformationEdit,
} from '../utils/activityLogService';
import {
  formatPhilippineDateTime,
  getPhilippineMonthKey,
} from '../utils/philippineDateTime';
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
const NEW_RECORD_NOTIFICATIONS_KEY = 'nutrigrid_admin_new_record_notifications';
const ADMIN_DATA_CACHE_KEY = 'nutrigrid_admin_data_last_loaded';
const ADMIN_DATA_CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_DATA_STORAGE_KEYS = [
  STORAGE_KEYS.residents,
  STORAGE_KEYS.environmental,
  STORAGE_KEYS.infantfeeding,
  STORAGE_KEYS.lactatingwoman,
  STORAGE_KEYS.pregnantwoman,
  STORAGE_KEYS.monthlynatal,
];

function isAdminDataCacheFresh(userId) {
  try {
    const cacheKey = `${ADMIN_DATA_CACHE_KEY}:${userId || 'shared'}`;
    const loadedAt = Number(localStorage.getItem(cacheKey));
    return (
      Number.isFinite(loadedAt) &&
      loadedAt > 0 &&
      Date.now() >= loadedAt &&
      Date.now() - loadedAt < ADMIN_DATA_CACHE_TTL_MS &&
      ADMIN_DATA_STORAGE_KEYS.every((key) => localStorage.getItem(key) !== null)
    );
  } catch (error) {
    console.error('Could not read the admin data cache timestamp:', error);
    return false;
  }
}

function markAdminDataCacheFresh(userId) {
  try {
    localStorage.setItem(
      `${ADMIN_DATA_CACHE_KEY}:${userId || 'shared'}`,
      String(Date.now())
    );
  } catch (error) {
    console.error('Could not save the admin data cache timestamp:', error);
  }
}

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
  searchTerm,
  setTabSearchTerm,
  performSearch,
  searchResults,
  setSearchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  showNotifications,
  setShowNotifications,
  notifications,
  visibleNotificationItems,
  notificationError,
  onNotificationClick,
  notifRef,
  setDarkMode,
  setActiveTab,
  setSelectedTaskFilter,
  activeTab,
}) => {
  const textColor = darkMode ? THEME.dark.text : THEME.light.text;
  const mutedColor = darkMode ? THEME.dark.muted : THEME.light.muted;
  const iconButtonStyle = {
    backgroundColor: darkMode ? THEME.dark.card : THEME.light.input,
    border: `1px solid ${darkMode ? THEME.dark.border : THEME.light.border}`,
  };

  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5">
      <h1 className="text-xl font-bold uppercase tracking-wide sm:text-2xl" style={{ color: textColor }}>
        {title || 'WELCOME ADMIN!'}
      </h1>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
        {activeTab !== 'activityLogs' && (
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
                setTabSearchTerm('tasks', '');
                setSearchResults([]);
                setActiveTab('tasks');
              } else if (record.categoryId === 'documents') {
                setTabSearchTerm('documents', record.data.name || '');
                setActiveTab('documents');
                setShowSearchSuggestions(false);
              } else {
                if (record.tab) setTabSearchTerm(record.tab, searchTerm);
                setShowSearchSuggestions(false);
                if (record.tab) setActiveTab(record.tab);
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
        )}

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
                {notificationError && (
                  <p role="alert" className="m-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    {notificationError}
                  </p>
                )}
                {visibleNotificationItems.length === 0 && !notificationError ? (
                  <div className="p-4 text-center text-sm" style={{ color: mutedColor }}>
                    No notifications
                  </div>
                ) : visibleNotificationItems.length > 0 ? (
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
                ) : null}
              </div>
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

function isBhwOrAdminActor(actorRole) {
  return ['admin', 'field_worker', 'bhw'].includes(String(actorRole || '').toLowerCase());
}

function matchesActivityActorFilter(log, selectedActorType, currentUserId) {
  const role = String(log.actor_role || '').toLowerCase();
  if (selectedActorType === 'bhw') return ['field_worker', 'bhw'].includes(role);
  if (selectedActorType === 'admin') return role === 'admin';
  if (selectedActorType === 'mine') {
    return String(log.actor_user_id || '') === String(currentUserId || '');
  }
  return isBhwOrAdminActor(role);
}

function ActivityLogsView({
  logs,
  loading,
  error,
  darkMode,
  currentUserId,
  selectedActorType,
  onActorTypeChange,
  actionFilter,
  onActionFilter,
  searchQuery,
  onSearch,
  searchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  selectedMonth,
  onMonthChange,
  standalone = false,
}) {
  const visibleLogs = logs.filter((log) => {
    const action = String(log.action || 'edited').toLowerCase();
    if (actionFilter !== 'all' && action !== actionFilter) return false;
    if (!matchesActivityActorFilter(log, selectedActorType, currentUserId)) return false;
    const date = new Date(log.created_at);
    if (Number.isNaN(date.getTime())) return false;
    if (getPhilippineMonthKey(date) !== selectedMonth) {
      return false;
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const changes = Array.isArray(log.field_changes) ? log.field_changes : [];
    return [
      log.actor_name,
      getActivityCategoryLabel(log.category),
      log.action,
      log.record_id,
      formatPhilippineDateTime(date),
      ...changes.flatMap((change) => [
        change.label,
        change.field,
        change.old_value,
        change.new_value,
      ]),
    ].some((value) => String(value ?? '').toLowerCase().includes(query));
  });

  return (
    <section className="space-y-2">
      <div className="flex w-full flex-col gap-2 border-b px-3 py-2.5" style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-full min-w-0 flex-1 sm:min-w-[17rem] sm:max-w-[32rem]">
            <BnsSearchBar
              query={searchQuery}
              onSearch={onSearch}
              results={searchResults}
              showSuggestions={showSearchSuggestions}
              onSelectResult={(result) => onSearch(result.searchText)}
              onFocusSuggestions={() => setShowSearchSuggestions(true)}
              onBlurSuggestions={() => setShowSearchSuggestions(false)}
              placeholder="SEARCH ACTIVITY LOGS..."
              emptyMessage="No matching activity logs"
              widthClass="w-full"
              tone="admin"
              darkMode={darkMode}
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <label className="relative w-48 flex-none">
              <span className="sr-only">FILTER ACTIVITY BY BHW OR ADMIN</span>
              <select
                value={selectedActorType}
                onChange={(event) => onActorTypeChange(event.target.value)}
                className={`h-11 w-full appearance-none rounded-xl border py-2 pl-3 pr-9 text-center text-xs font-bold tracking-wide shadow-sm transition focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                  darkMode
                    ? 'border-slate-600 bg-[#26263B] text-slate-100'
                    : 'border-gray-300 bg-white text-gray-800'
                }`}
              >
                <option value="bhw">BHW</option>
                <option value="admin">ADMIN</option>
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
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
              buttonClassName="h-11 w-48 justify-between px-3 text-xs uppercase"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter activity by action">
          {[['all', 'ALL'], ['created', 'CREATED'], ['edited', 'EDITED'], ['deleted', 'DELETED']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onActionFilter(value)}
              aria-pressed={actionFilter === value}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                actionFilter === value
                  ? 'text-white shadow-md'
                  : darkMode
                    ? 'border border-[#67445F] bg-[#302338] text-slate-200 hover:bg-[#392A45]'
                    : 'border border-[#E8DCEF] bg-white text-gray-600 hover:bg-purple-50'
              }`}
              style={actionFilter === value
                ? { background: darkMode ? 'linear-gradient(90deg,#A66AD1,#D94E9F)' : 'linear-gradient(90deg,#8F65FF,#FF75C3)' }
                : {}}
            >
              {label}
            </button>
          ))}
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
          {searchQuery.trim()
            ? 'No activity logs match this search.'
            : `No ${actionFilter === 'all' ? 'ACTIVITY' : actionFilter.toUpperCase()} records have been logged for this month.`}
        </p>
      ) : (
        <div className={`${standalone ? 'max-h-[calc(100vh-15rem)]' : 'max-h-[min(20rem,55vh)]'} space-y-2 overflow-y-auto px-2 pb-2`}>
          {visibleLogs.map((log) => {
            const changes = Array.isArray(log.field_changes) ? log.field_changes : [];
            return (
              <article
                key={log.id}
                className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700 bg-[#26263B]' : 'border-[#E8DCEF] bg-white'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {String(log.action || 'edited').toUpperCase()} BY {getActivityActorDisplayName(log.actor_name).toUpperCase()} · {getActivityCategoryLabel(log.category).toUpperCase()}
                    </h3>
                    <p className={`mt-0.5 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      RECORD {log.record_id} · {formatPhilippineDateTime(log.created_at)}
                      {log.pending_sync ? ' · Waiting to sync' : ''}
                    </p>
                  </div>
                </div>
                {changes.length > 0 && (
                  <ul className={`mt-1 divide-y ${darkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                    {changes.map((change, index) => (
                      <li key={`${log.id}-${change.field || index}`} className="grid grid-cols-[minmax(5rem,0.4fr)_minmax(0,1fr)] gap-2 py-1.5 text-sm">
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

function ActivityLogsPage({
  logs,
  loading,
  error,
  darkMode,
  currentUserId,
  onLoadMonth,
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => getPhilippineMonthKey());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedActorType, setSelectedActorType] = useState('bhw');

  useEffect(() => {
    if (onLoadMonth) void onLoadMonth(selectedMonth);
  }, [onLoadMonth, selectedMonth]);

  const actorFilteredLogs = logs.filter((log) =>
    matchesActivityActorFilter(log, selectedActorType, currentUserId)
  );
  const searchResults = searchQuery.trim()
    ? actorFilteredLogs
      .filter((log) => {
        const changes = Array.isArray(log.field_changes) ? log.field_changes : [];
        return [
          log.actor_name,
          getActivityCategoryLabel(log.category),
          log.record_id,
          log.action,
          ...changes.flatMap((change) => [
            change.label,
            change.field,
            change.old_value,
            change.new_value,
          ]),
        ].some((value) => String(value ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase()));
      })
      .slice(0, 20)
      .map((log) => ({
        id: log.id,
        categoryId: 'activityLogs',
        categoryName: `${String(log.action || 'edited').toUpperCase()} · ${getActivityCategoryLabel(log.category)}`,
        displayTitle: `${String(log.action || 'edited').toUpperCase()} · ${getActivityCategoryLabel(log.category)} · Record ${log.record_id}`,
        searchText: String(log.record_id),
        timestamp: log.created_at,
        synced: !log.pending_sync,
      }))
    : [];

  return (
    <div
      className="mt-4 rounded-2xl border p-3 sm:p-5"
      style={{
        backgroundColor: darkMode ? THEME.dark.card : THEME.light.card,
        borderColor: darkMode ? THEME.dark.border : THEME.light.border,
      }}
    >
      <ActivityLogsView
        logs={logs}
        loading={loading}
        error={error}
        darkMode={darkMode}
        currentUserId={currentUserId}
        actionFilter={actionFilter}
        onActionFilter={setActionFilter}
        selectedActorType={selectedActorType}
        onActorTypeChange={setSelectedActorType}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        searchResults={searchResults}
        showSearchSuggestions={showSearchSuggestions}
        setShowSearchSuggestions={setShowSearchSuggestions}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        standalone
      />
    </div>
  );
}

function MonthYearPicker({ value, onChange, min, max, darkMode = false, compact = false, fill = false, label, buttonClassName = '' }) {
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
    <div className={fill ? 'relative min-w-0 flex-1' : compact ? 'relative shrink-0' : 'relative'} ref={pickerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center justify-between rounded-xl border font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${fill ? 'w-full' : ''} ${buttonClassName} ${
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

const AdminDashboard = ({ onLogout, adminName: profileName, currentUserId }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [hasOpenedTasks, setHasOpenedTasks] = useState(false);
  const [purokPeriod, setPurokPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [malnutritionPeriod, setMalnutritionPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyTrendYear, setMonthlyTrendYear] = useState(() => {
    const reportMonthMatch = String(REPORT_META.monthYear || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
    return reportMonthMatch ? reportMonthMatch[2] : String(new Date().getFullYear());
  });
  const [isExpanded, setIsExpanded] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(DARK_MODE_KEY) === 'true');
  const adminName = profileName?.trim() || 'Admin';
  const [searchTerms, setSearchTerms] = useState({});
  const searchTerm = searchTerms[activeTab] || '';
  const setTabSearchTerm = (tab, value) => {
    setSearchTerms((current) => ({ ...current, [tab]: value }));
  };
  const [adminPurokFilter, setAdminPurokFilter] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedTaskFilter, setSelectedTaskFilter] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bhwDeletionRequests, setBhwDeletionRequests] = useState([]);
  const [bhwDeletionRequestError, setBhwDeletionRequestError] = useState('');
  const [deletionRequestTarget, setDeletionRequestTarget] = useState(null);
  const [deletionConfirmationBusy, setDeletionConfirmationBusy] = useState(false);
  const [deletionConfirmationError, setDeletionConfirmationError] = useState('');
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsForMonth, setActivityLogsForMonth] = useState([]);
  const [activityLogLoading, setActivityLogLoading] = useState(true);
  const [activityLogError, setActivityLogError] = useState('');
  const [readNotificationIds, setReadNotificationIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${READ_NOTIFICATIONS_KEY}:${currentUserId || 'shared'}`) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.error('Could not load read notification state:', error);
      return [];
    }
  });
  const [newRecordNotificationIds, setNewRecordNotificationIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${NEW_RECORD_NOTIFICATIONS_KEY}:${currentUserId || 'shared'}`) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.error('Could not load new record notification state:', error);
      return [];
    }
  });
  const [pendingMapScroll, setPendingMapScroll] = useState(false);
  const [alertPuroks, setAlertPuroks] = useState([]);
  const [adminFormCategory, setAdminFormCategory] = useState(null);
  const [adminEditingRecord, setAdminEditingRecord] = useState(null);
  const [adminConfirmation, setAdminConfirmation] = useState(null);
  const [adminConfirmationBusy, setAdminConfirmationBusy] = useState(false);
  const [notificationTarget, setNotificationTarget] = useState(null);
  const [residentPurokFilter, setResidentPurokFilter] = useState('');
  const [monthlyReportBatch, setMonthlyReportBatch] = useState(() => {
    try {
      const savedBatch = Number(localStorage.getItem('nutrigrid_monthly_report_batch'));
      return Number.isInteger(savedBatch) && savedBatch >= 1 && savedBatch <= 4 ? savedBatch : 1;
    } catch (error) {
      console.error('Could not load monthly report batch preference:', error);
      return 1;
    }
  });
  const updateMonthlyReportBatch = (batch) => {
    setMonthlyReportBatch(batch);
    try {
      localStorage.setItem('nutrigrid_monthly_report_batch', String(batch));
    } catch (error) {
      console.error('Could not save monthly report batch preference:', error);
    }
  };
  const [scheduledVisitPurok, setScheduledVisitPurok] = useState('');
  const notifRef = useRef(null);
  const currentActivityMonth = (() => {
    return getPhilippineMonthKey();
  })();
  const activityLogMonthRef = useRef(currentActivityMonth);

  const refreshActivityLogs = useCallback(async (month) => {
    const requestedMonth = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)
      ? month
      : null;
    if (requestedMonth) {
      activityLogMonthRef.current = requestedMonth;
      setActivityLogLoading(true);
    }
    try {
      const [logs, monthLogs] = await Promise.all([
        loadRecordActivityLogs(),
        loadRecordActivityLogs({ month: activityLogMonthRef.current }),
      ]);
      const removeSupersededCreatedLogs = (sourceLogs) => {
        const deletedKeys = new Set(
          sourceLogs
            .filter((log) => String(log.action || '').toLowerCase() === 'deleted')
            .map((log) => `${String(log.category || '').toLowerCase()}:${String(log.record_id || '')}`)
        );
        return sourceLogs.filter((log) =>
          String(log.action || '').toLowerCase() !== 'created' ||
          !deletedKeys.has(`${String(log.category || '').toLowerCase()}:${String(log.record_id || '')}`)
        );
      };
      setActivityLogs(removeSupersededCreatedLogs(logs));
      setActivityLogsForMonth(removeSupersededCreatedLogs(monthLogs));
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

  const refreshBhwDeletionRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_pending_bhw_account_deletion_requests');
      if (error) throw error;
      setBhwDeletionRequests(Array.isArray(data) ? data : []);
      setBhwDeletionRequestError('');
    } catch (error) {
      console.error('Could not load pending BHW account deletion requests:', error);
      const message = error?.message || 'Unknown Supabase error.';
      setBhwDeletionRequestError(
        message.includes('get_pending_bhw_account_deletion_requests') ||
        message.includes('bhw_account_deletion_requests')
          ? 'Deletion-request notifications need Supabase setup. Run supabase-bhw-account-management.sql and deploy the account deletion Edge Functions.'
          : `Could not load BHW deletion requests: ${message}`
      );
    }
  }, []);

  useEffect(() => {
    void refreshBhwDeletionRequests();
    const interval = window.setInterval(() => void refreshBhwDeletionRequests(), 30000);
    window.addEventListener('nutrigrid-bhw-accounts-changed', refreshBhwDeletionRequests);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('nutrigrid-bhw-accounts-changed', refreshBhwDeletionRequests);
    };
  }, [refreshBhwDeletionRequests]);

  useEffect(() => {
    void refreshActivityLogs();
    const channel = supabase
      .channel(`admin-activity-log-updates-${currentUserId || 'shared'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'record_activity_logs' },
        () => void refreshActivityLogs()
      )
      .subscribe((status, error) => {
        if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          console.error('Could not subscribe to Admin Dashboard activity log updates:', error || status);
        }
      });
    window.addEventListener('nutrigrid-activity-logs-changed', refreshActivityLogs);
    return () => {
      window.removeEventListener('nutrigrid-activity-logs-changed', refreshActivityLogs);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshActivityLogs]);

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
    const newRecordIds = newRecordNotificationIds.filter((id) => !ids.includes(id));
    setNewRecordNotificationIds(newRecordIds);
    try {
      localStorage.setItem(
        `${NEW_RECORD_NOTIFICATIONS_KEY}:${currentUserId || 'shared'}`,
        JSON.stringify(newRecordIds)
      );
    } catch (error) {
      console.error('Could not save new record notification state:', error);
    }
  };

  const markActivityLogsRead = () => {
    markNotificationsRead(activityLogs.map((log) => `record-activity:${log.id}`));
  };

  const handleNotificationClick = (item) => {
    if (item.deletionRequest) {
      setDeletionRequestTarget(item.deletionRequest);
      setDeletionConfirmationError('');
      setShowNotifications(false);
      return;
    }
    markNotificationsRead(item.notificationIds || [item.id]);
    setShowNotifications(false);
    if (item.activityLog) {
      setActiveTab('activityLogs');
      setNotificationTarget(null);
      return;
    }
    if (item.recordId) {
      setTabSearchTerm(item.tab, '');
      setAdminPurokFilter('');
      setResidentPurokFilter('');
      setNotificationTarget({ tab: item.tab, rowId: item.rowId || item.recordId });
    } else {
      setNotificationTarget(null);
    }
    setActiveTab(item.mapAlert ? 'dashboard' : item.tab || 'dashboard');
    if (item.mapAlert) {
      setAlertPuroks(item.affectedPuroks || []);
      setPendingMapScroll(true);
    }
  };

  useEffect(() => {
    if (!notificationTarget || notificationTarget.tab !== activeTab) return undefined;
    const timeout = window.setTimeout(() => setNotificationTarget(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [activeTab, notificationTarget]);

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
  const [adminDataStatus, setAdminDataStatus] = useState(
    () => isAdminDataCacheFresh(currentUserId) ? 'loaded' : 'loading'
  );
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
    let syncingPendingRecords = false;
    let refreshAfterLoad = false;
    const realtimeChangesDuringLoad = [];
    const recordSyncCategories = [
      { category: 'residents', key: STORAGE_KEYS.residents },
      { category: 'environmental', key: STORAGE_KEYS.environmental },
      { category: 'infantfeeding', key: STORAGE_KEYS.infantfeeding },
      { category: 'lactatingwoman', key: STORAGE_KEYS.lactatingwoman },
      { category: 'pregnantwoman', key: STORAGE_KEYS.pregnantwoman },
      { category: 'monthlynatal', key: STORAGE_KEYS.monthlynatal },
    ];
    const photoStorageKeys = [
      STORAGE_KEYS.residents,
      STORAGE_KEYS.environmental,
      STORAGE_KEYS.infantfeeding,
      STORAGE_KEYS.lactatingwoman,
      STORAGE_KEYS.pregnantwoman,
      STORAGE_KEYS.monthlynatal,
    ];

    const retryPendingRecords = async () => {
      if (!active || !navigator.onLine || syncingPendingRecords) return;
      const pendingRecords = recordSyncCategories.flatMap(({ category, key }) =>
        getRecords(key)
          .filter((record) =>
            record.created_by_user_id &&
            ['pending_sync', 'sync_failed'].includes(getRecordSyncStatus(record))
          )
          .map((record) => ({ category, key, record }))
      );
      if (!pendingRecords.length) return;

      syncingPendingRecords = true;
      let nextIndex = 0;
      const worker = async () => {
        while (active && navigator.onLine && nextIndex < pendingRecords.length) {
          const item = pendingRecords[nextIndex];
          nextIndex += 1;
          try {
            const error = await syncSingleRecord(item.category, item.record, { includeShared: true });
            if (error && !['offline', 'not-signed-in'].includes(error)) {
              console.error(`Could not retry syncing ${item.category} record ${item.record.id}:`, error);
            }
          } catch (error) {
            console.error(`Could not retry syncing ${item.category} record ${item.record.id}:`, error);
          }
        }
      };
      try {
        await Promise.all(Array.from(
          { length: Math.min(4, pendingRecords.length) },
          () => worker()
        ));
        if (active) setAdminData(reloadAllAdminData(currentUserId));
      } finally {
        syncingPendingRecords = false;
      }
    };

    const loadSharedAdminData = async ({ force = false } = {}) => {
      if (!active) return;
      if (loading) {
        if (force) refreshAfterLoad = true;
        return;
      }
      if (!navigator.onLine) {
        setAdminDataStatus('offline');
        return;
      }
      if (!force && isAdminDataCacheFresh(currentUserId)) {
        setAdminDataStatus('loaded');
        return;
      }

      loading = true;
      try {
        const sharedData = await loadAdminDataFromSupabase(currentUserId, {
          onRecordsLoaded: (records, complete = false) => {
            if (!active) return;
            setAdminData((currentData) => ({ ...currentData, ...records }));
            if (complete) setAdminDataStatus('loaded');
          },
        });
        if (active) {
          setAdminData(sharedData);
          setAdminDataStatus('loaded');
          markAdminDataCacheFresh(currentUserId);
        }
      } catch (error) {
        console.error('Could not load shared admin records from Supabase:', error);
        if (active) setAdminDataStatus('error');
      } finally {
        loading = false;
        if (active && realtimeChangesDuringLoad.length) {
          realtimeChangesDuringLoad.splice(0).forEach(({ category, eventType, row }) => {
            applyAdminRealtimeRecordChange(category, eventType, row);
          });
        }
        if (active && refreshAfterLoad) {
          refreshAfterLoad = false;
          void loadSharedAdminData({ force: true });
        }
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
      if (
        ['upsert', 'realtime-upsert', 'delete'].includes(event.detail?.operation)
      ) {
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
      if (document.visibilityState === 'visible') {
        void loadSharedAdminData();
        void retryPendingRecords();
      }
    };
    let realtimeRefreshTimeout;
    const handleRealtimeChange = (category) => (payload) => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (applyAdminRealtimeRecordChange(category, payload.eventType, row)) {
        if (payload.eventType === 'INSERT') {
          const storageKey = {
            residents: STORAGE_KEYS.residents,
            environmental: STORAGE_KEYS.environmental,
            infantfeeding: STORAGE_KEYS.infantfeeding,
            lactatingwoman: STORAGE_KEYS.lactatingwoman,
            pregnantwoman: STORAGE_KEYS.pregnantwoman,
            monthlynatal: STORAGE_KEYS.monthlynatal,
          }[category];
          const recordId = row?.data?.id ?? row?.local_id ?? row?.id;
          if (storageKey && recordId != null) {
            const notificationId = `record-added:${storageKey}:${recordId}`;
            setNewRecordNotificationIds((current) => {
              const next = Array.from(new Set([...current, notificationId]));
              try {
                localStorage.setItem(
                  `${NEW_RECORD_NOTIFICATIONS_KEY}:${currentUserId || 'shared'}`,
                  JSON.stringify(next)
                );
              } catch (error) {
                console.error('Could not save new record notification state:', error);
              }
              return next;
            });
          }
        }
        if (loading) realtimeChangesDuringLoad.push({ category, eventType: payload.eventType, row });
      } else {
        window.clearTimeout(realtimeRefreshTimeout);
        realtimeRefreshTimeout = window.setTimeout(
          () => void loadSharedAdminData({ force: true }),
          300
        );
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadSharedAdminData();
        void retryPendingRecords();
      }
    };
    const syncQueuedRecordDeletions = () => {
      if (!active || !navigator.onLine) return;
      void syncPendingRecordDeletions({ includeShared: true })
        .then((result) => {
          if (result.errors?.length) {
            console.error('Some queued record deletions are still waiting to sync:', result.errors);
          }
        })
        .catch((error) => {
          console.error('Could not sync queued record deletions:', error);
        });
    };
    const channel = supabase
      .channel(`admin-record-updates-${currentUserId || 'shared'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'residents' }, handleRealtimeChange('residents'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'environmental_sanitation' }, handleRealtimeChange('environmental'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'infant_feeding' }, handleRealtimeChange('infantfeeding'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lactating_women' }, handleRealtimeChange('lactatingwoman'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pregnant_women' }, handleRealtimeChange('pregnantwoman'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_natality' }, handleRealtimeChange('monthlynatal'))
      .subscribe((status, error) => {
        if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          console.error('Could not subscribe to Admin Dashboard record updates:', error || status);
        }
      });

    void loadSharedAdminData();
    void retryPendingRecords();
    void hydrateLocalPhotos();
    window.addEventListener('bns-records-changed', handleLocalRecordsChanged);
    window.addEventListener('storage', handleStorageChanged);
    window.addEventListener('focus', handlePageFocus);
    window.addEventListener('online', syncQueuedRecordDeletions);
    window.addEventListener('online', retryPendingRecords);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    syncQueuedRecordDeletions();

    return () => {
      active = false;
      window.removeEventListener('bns-records-changed', handleLocalRecordsChanged);
      window.removeEventListener('storage', handleStorageChanged);
      window.removeEventListener('focus', handlePageFocus);
      window.removeEventListener('online', syncQueuedRecordDeletions);
      window.removeEventListener('online', retryPendingRecords);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(realtimeRefreshTimeout);
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
        rows = [...rows].sort(comparePurokRecords);
      } else if (adminPurokFilter) {
        rows = rows.filter((record) => normalizeEnvironmentalPurokName(record.purok) === adminPurokFilter);
      }
      return rows;
    },
    [filteredHouseholds, residentPurokFilter, adminPurokFilter]
  );
  const handlePurokResidents = useCallback((purok) => {
    setResidentPurokFilter(normalizePurokName(purok));
    setTabSearchTerm('residents', '');
    setSearchResults([]);
    setActiveTab('residents');
  }, []);
  const handleScheduleVisit = useCallback((purok) => {
    setScheduledVisitPurok(normalizePurokName(purok));
    setActiveTab('tasks');
  }, []);
  const clearScheduledVisitPurok = useCallback(() => setScheduledVisitPurok(''), []);

  const performSearch = (query) => {
    setTabSearchTerm(activeTab, query);
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
    const items = bhwDeletionRequests.map((request) => ({
      id: `bhw-deletion-request:${request.id}`,
      label: 'BHW account deletion request',
      detail: `${request.full_name || request.email} · Tap to review and confirm`,
      deletionRequest: request,
    }));
    activityLogs.forEach((log) => {
      const notificationId = `record-activity:${log.id}`;
      items.push({
        id: notificationId,
        label: `${String(log.action || 'edited').toUpperCase()} · ${getActivityCategoryLabel(log.category)}`,
        detail: `${log.actor_name || 'A BHW'} · ${String(log.action || 'edited')}`,
        activityLog: true,
        tab: 'activityLogs',
        notificationIds: [notificationId],
      });
    });
    const deletedRecordKeys = new Set(
      activityLogs
        .filter((log) => String(log.action || '').toLowerCase() === 'deleted')
        .map((log) => `${log.category}:${log.record_id}`)
    );
    [
      { key: STORAGE_KEYS.residents, data: households, tab: 'residents' },
      { key: STORAGE_KEYS.environmental, data: environmentalSanitationData, tab: 'environmentalSanitation' },
      { key: STORAGE_KEYS.infantfeeding, data: infantFeedingData, tab: 'infantFeeding' },
      { key: STORAGE_KEYS.pregnantwoman, data: pregnantWomenData, tab: 'pregnantWoman' },
      { key: STORAGE_KEYS.lactatingwoman, data: lactatingWomenData, tab: 'lactatingWoman' },
      { key: STORAGE_KEYS.monthlynatal, data: natalityData, tab: 'monthlyNatality' },
    ].forEach(({ key, data, tab }) => {
      const notificationCategory =
        key === STORAGE_KEYS.residents ? 'residents'
          : key === STORAGE_KEYS.environmental ? 'environmental'
            : key === STORAGE_KEYS.infantfeeding ? 'infantfeeding'
              : key === STORAGE_KEYS.pregnantwoman ? 'pregnantwoman'
                : key === STORAGE_KEYS.lactatingwoman ? 'lactatingwoman'
                  : key === STORAGE_KEYS.monthlynatal ? 'monthlynatal'
                    : tab;
      const records = Array.isArray(data) ? data : [];
      records.forEach((record) => {
        const notificationId = `record-added:${key}:${record.id}`;
        if (deletedRecordKeys.has(`${notificationCategory}:${record.id}`)) return;
        const isNewPendingRecord =
          getRecordSyncStatus(record._raw || record) !== 'synced' &&
          !(record.last_edited_at || record._raw?.last_edited_at);
        if (!isNewPendingRecord && !newRecordNotificationIds.includes(notificationId)) return;
        const title = getRecordDisplayTitle(record._raw || record);
        const purok = normalizeEnvironmentalPurokName(record.purok);
        items.push({
          id: notificationId,
          label: `New ${NOTIF_LABELS[key]}`,
          detail: `${title}${purok ? ` · Purok ${purok}` : ''}`,
          tab,
          recordId: record.id,
          rowId: key === STORAGE_KEYS.environmental && purok
            ? `purok:${purok}`
            : record.id,
        });
      });
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
    return items;
  }, [bhwDeletionRequests, households, environmentalSanitationData, infantFeedingData, pregnantWomenData, lactatingWomenData, natalityData, activityLogs, readNotificationIds, newRecordNotificationIds]);

  const visibleNotificationItems = notificationItems.filter(
    (item) =>
      item.deletionRequest
        ? true
        : item.notificationIds
        ? item.notificationIds.some((id) => !readNotificationIds.includes(id))
        : !readNotificationIds.includes(item.id)
  );
  const notifications = visibleNotificationItems.length;

  const confirmBhwAccountDeletion = async () => {
    if (!deletionRequestTarget) return;
    setDeletionConfirmationBusy(true);
    setDeletionConfirmationError('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-bhw-account', {
        body: { request_id: deletionRequestTarget.id },
      });
      if (error) {
        let errorMessage = error.message || 'The deletion request could not be completed.';
        const context = error.context;
        if (context && typeof context.clone === 'function') {
          try {
            const body = await context.clone().json();
            if (body?.error) errorMessage = body.error;
          } catch (parseError) {
            console.error('Could not read the BHW deletion error response:', parseError);
          }
        }
        throw new Error(errorMessage);
      }
      if (!data?.deleted) throw new Error('The server did not confirm the BHW account deletion.');
      setBhwDeletionRequests((current) => current.filter((request) => request.id !== deletionRequestTarget.id));
      setDeletionRequestTarget(null);
      await refreshBhwDeletionRequests();
    } catch (error) {
      console.error('Could not confirm BHW account deletion:', error);
      setDeletionConfirmationError(error.message || 'The deletion request could not be completed.');
    } finally {
      setDeletionConfirmationBusy(false);
    }
  };

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
    const reportYear = Number(monthlyTrendYear);
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
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(reportYear, index, 1);
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
      vulnerableCases: month.vulnerableCases,
      pregnantAndLactating: pregnantCounts[index] + lactatingCounts[index],
      infants: infantsByMonth.get(month.key).size,
    }));
  }, [monthlyTrendYear, natalityData, pregnantWomenData, lactatingWomenData]);
  const monthlyTrendYears = useMemo(() => {
    const reportYear = Number(String(REPORT_META.monthYear || '').match(/\d{4}/)?.[0]);
    const currentYear = new Date().getFullYear();
    const latestYear = Math.max(reportYear || currentYear, currentYear);
    const earliestYear = Math.min(2020, reportYear || currentYear);
    return Array.from({ length: latestYear - earliestYear + 1 }, (_, index) => String(earliestYear + index));
  }, []);
  const activeMonthlyTrend = monthlyTrendData.length > 0;

  const malnutritionStatusData = (() => {
    const currentMonth = malnutritionPeriod;
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
        const editedAt = new Date().toISOString();
        const updatedRecord = {
          ...record,
          photo_url: null,
          residents_photo: null,
          environmental_sanitation_photo: null,
          updated_at: editedAt,
          last_edited_at: editedAt,
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

  const confirmAdminAction = async (actionKey = 'action') => {
    if (!adminConfirmation) return;
    const confirmation = adminConfirmation;
    const action = confirmation[actionKey];
    if (!action) return;
    setAdminConfirmationBusy(true);
    try {
      const nextConfirmation = await action();
      setAdminConfirmation(nextConfirmation || null);
    } finally {
      setAdminConfirmationBusy(false);
    }
  };

  const adminDelete = async (storageKey, id, remoteRecord) => {
    const category = categoryIdForStorageKey(storageKey);
    if (!category) {
      deleteRecordById(storageKey, id);
      refreshData();
      return;
    }

    const localRecord = getRecords(storageKey).find((record) => String(record.id) === String(id));
    const recordToDelete = localRecord || remoteRecord;
    if (category === 'monthlyreport') {
      if (recordToDelete) {
        void recordInformationDelete({
          category,
          record: recordToDelete,
          actorRole: 'admin',
        });
      }
      deleteRecordById(storageKey, id);
      refreshData();
      return;
    }

    if (recordToDelete) {
      void recordInformationDelete({
        category,
        record: recordToDelete,
        actorRole: 'admin',
      });
    }
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

    void syncPendingRecordDeletions({ includeShared: true })
      .then((syncResult) => {
        if (syncResult.errors?.length || syncResult.skipped) {
          const details = syncResult.errors?.join('\n') || `Sync skipped: ${syncResult.skipped}`;
          console.error('Record deletion is saved locally and waiting to sync:', details);
          alert('Deleted locally, but the deletion is still waiting to sync. Check your connection and sign-in, then retry.');
          return;
        }
        setAdminDataStatus('loaded');
      })
      .catch((error) => {
        console.error('Record was deleted locally, but could not be synced:', error);
        alert(`Deleted locally. Supabase sync will retry when possible: ${error.message || 'request failed'}`);
      });
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

  const saveAdminCategoryRecord = async (
    record,
    existingRecord = null,
    { preservePurok = false } = {}
  ) => {
    const key = storageKeyForCategory(record.category);
    const editedAt = new Date().toISOString();
    const recordForSave = existingRecord
      ? updateDuplicateRecord(existingRecord, record, {
          preservePurok,
          preserveMissingPhotos: !adminEditingRecord,
        })
      : record;
    const pending = {
      ...recordForSave,
      updated_at: existingRecord ? editedAt : recordForSave.updated_at,
      last_edited_at: existingRecord ? editedAt : recordForSave.last_edited_at,
      created_by_user_id:
        existingRecord?.created_by_user_id || recordForSave.created_by_user_id || currentUserId,
      synced: false,
      status: 'pending',
      sync_status: 'pending_sync',
      sync_error: null,
    };
    await upsertRecord(key, pending);
    if (existingRecord) {
      void recordInformationEdit({
        category: record.category,
        recordId: pending.id,
        before: existingRecord,
        after: recordForSave,
        actorRole: 'admin',
      });
    } else {
      void recordInformationCreate({
        category: record.category,
        record: pending,
        actorRole: 'admin',
      });
    }
    refreshData();
    closeCategoryForm();
    setAdminDataStatus('loaded');
    void (async () => {
      try {
        updateRecordSyncStatus(key, pending.id, 'syncing', '', pending);
        const syncError = await syncSingleRecord(record.category, pending, {
          includeShared: true,
        });
        if (syncError) {
          if (['offline', 'not-signed-in'].includes(syncError)) {
            updateRecordSyncStatus(key, pending.id, 'pending_sync', '', pending);
          } else {
            updateRecordSyncStatus(key, pending.id, 'sync_failed', syncError, pending);
          }
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
        refreshData();
      } catch (error) {
        updateRecordSyncStatus(key, pending.id, 'sync_failed', error.message || 'Unknown error', pending);
        console.error('Could not sync the admin record to Supabase:', error);
        setAdminDataStatus(navigator.onLine ? 'error' : 'offline');
        alert(`Saved locally, but Supabase sync failed: ${error.message || 'request failed'}`);
      }
    })();
  };

  const handleAdminCategoryFormSubmit = (record) => {
    if (adminEditingRecord) {
      requestAdminConfirmation(
        'Are you sure you want to edit this record?',
        () => saveAdminCategoryRecord(record, adminEditingRecord),
        { confirmLabel: 'Save changes' }
      );
      return;
    }

    const duplicate = findRecordDuplicate(
      record.category,
      record,
      getRecords(storageKeyForCategory(record.category))
    );
    if (!duplicate) {
      requestAdminConfirmation(
        'Are you sure you want to save this record?',
        () => saveAdminCategoryRecord(record),
        { confirmLabel: 'Save' }
      );
      return;
    }

    const saveDuplicateUpdate = () =>
      saveAdminCategoryRecord(record, duplicate.record, { preservePurok: true });
    if (duplicate.type === 'different-purok') {
      const existingPurok = duplicate.record.purok || 'the existing Purok';
      requestAdminConfirmation(
        `There is already an existing record with the same information in another Purok (${existingPurok}). Do you want to add another record or update it in the existing Purok?`,
        () => saveAdminCategoryRecord(record),
        {
          confirmLabel: 'Add another record',
          alternateConfirmLabel: 'Update in existing Purok',
          alternateAction: saveDuplicateUpdate,
          highlightDuplicateFields: true,
        }
      );
      return;
    }

    const name = getDuplicateRecordName(record.category, record);
    requestAdminConfirmation(
      `This record already exists. Do you want to update the existing record with the name of: ${name}?`,
      saveDuplicateUpdate,
      { confirmLabel: 'Update existing record', highlightDuplicateFields: true }
    );
  };

  const showImportError = (error) => {
    setAdminConfirmation({
      message: `Could not import Excel records: ${error?.message || 'Invalid workbook.'}`,
      action: () => {},
      title: 'Import Excel',
      confirmLabel: 'OK',
    });
  };

  const importCategoryRecords = async (storageKey, category, label, importedRows) => {
    if (!currentUserId) {
      setAdminConfirmation({
        message: 'You must be signed in as an admin to import records.',
        action: () => {},
        title: 'Import Excel',
        confirmLabel: 'OK',
      });
      return;
    }

    const existingIds = new Set(getRecords(storageKey).map((record) => String(record.id)));
    const now = new Date().toISOString();
    const recordsToImport = [];
    let skippedDuplicates = 0;
    normalizeImportedRecordHeaders(importedRows, category).forEach((row) => {
      const existingId = row.id == null || String(row.id).trim() === ''
        ? null
        : String(row.id);
      if (existingId && existingIds.has(existingId)) {
        skippedDuplicates += 1;
        return;
      }

      const id = existingId ||
        window.crypto?.randomUUID?.() ||
        `excel-${Date.now()}-${recordsToImport.length}`;
      existingIds.add(String(id));
      recordsToImport.push({
        ...row,
        id,
        created_by_user_id: currentUserId,
        created_at: row.created_at || now,
        updated_at: now,
        synced: false,
        status: 'pending',
        sync_status: 'pending_sync',
        sync_error: '',
      });
    });

    if (!recordsToImport.length) {
      setAdminConfirmation({
        message: `No new ${label} records to import. ${skippedDuplicates} duplicate row(s) were skipped.`,
        action: () => {},
        title: 'Import Excel',
        confirmLabel: 'OK',
      });
      return;
    }
    const performImport = async () => {
      let savedCount = 0;
      try {
        recordsToImport.forEach((record) => {
          upsertRecord(storageKey, record);
          savedCount += 1;
        });
        markNotificationsRead(
          recordsToImport.map((record) => `record-added:${storageKey}:${record.id}`)
        );
        refreshData();
      } catch (error) {
        console.error(`Could not save imported ${label} records:`, error);
        refreshData();
        return {
          title: 'Import Excel',
          message: `Imported ${savedCount} of ${recordsToImport.length} ${label} record(s). The remaining records could not be saved: ${error.message || 'storage error'}.`,
          action: () => {},
          confirmLabel: 'OK',
        };
      }

      let syncFailures = 0;
      if (navigator.onLine) {
        const syncResults = await Promise.all(recordsToImport.map(async (record) => {
          try {
            return await syncSingleRecord(category, record, { includeShared: true });
          } catch (error) {
            console.error(`Could not sync imported ${category} record ${record.id}:`, error);
            return error.message || 'sync failed';
          }
        }));
        syncFailures = syncResults.filter((error) =>
          error && !['offline', 'not-signed-in'].includes(error)
        ).length;
        refreshData();
      }

      const syncMessage = !navigator.onLine || syncFailures
        ? ' Records are saved locally and will retry syncing.'
        : ' Records were synced.';
      return {
        title: 'Import Excel',
        message: `Imported ${savedCount} ${label} record(s). ${skippedDuplicates} duplicate row(s) skipped.${syncMessage}`,
        action: () => {},
        confirmLabel: 'OK',
      };
    };

    setAdminConfirmation({
      title: 'Import Excel',
      message: `Import ${recordsToImport.length} ${label} record(s)? ${skippedDuplicates} duplicate row(s) will be skipped.`,
      confirmLabel: 'Import',
      action: performImport,
    });
  };

  const filterAdminTableData = (rows, term, categoryId) => {
    let filteredRows = rows;
    if (categoryId !== 'environmental') {
      if (adminPurokFilter === '__sorted__') {
        filteredRows = [...filteredRows].sort(comparePurokRecords);
      } else if (adminPurokFilter) {
        filteredRows = filteredRows.filter((row) => normalizeEnvironmentalPurokName(row.purok) === adminPurokFilter);
      }
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
      'wasted-mam',
      'severely-wasted-sam',
      'iron-pregnant',
      'iron-adolescent',
      'iron-lactating',
      'iron-lbw',
      'fic-9-12',
      'newborn-babies-origin',
      'exclusive-breastfeeding',
    ]);
    const getRecordDate = (category, record) => {
      const raw = record._raw || record;
      if (category === 'monthlynatal') return raw.dow || raw.month || raw.created_at || '';
      if (category === 'pregnantwoman' || category === 'lactatingwoman') {
        return raw.date_of_registration || raw.created_at || '';
      }
      if (category === 'infantfeeding') return raw.updated_at || raw.created_at || '';
      return raw.created_at || raw.visit_date || '';
    };
    const getDateParts = (category, record) => {
      const value = String(getRecordDate(category, record));
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
      const numericText = normalized.match(/^\d+(?:\.\d+)?/)?.[0];
      if (!numericText) return 0;
      const amount = Number(numericText);
      return Number.isFinite(amount) && amount >= 0 && amount <= maximum ? amount : 0;
    };
    const add = (slug, category, record, amount = 1) => {
      const date = getDateParts(category, record);
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
          if (raw.vitamin_a === '6–11 months old (100,000 IU)') add('vit-a-6-11', category, record);
          if (raw.vitamin_a === '12–59 months old (200,000 IU)') add('vit-a-12-59', category, record);
          if (raw.vitamin_a === 'Post-partum Women (200,000 IU)') add('vit-a-postpartum', category, record);
          if (numericAmount(raw.iron_status || raw.iron_given, 100) > 0) {
            add('iron-lbw', category, record);
          }
          const wastingStatus = String(raw.w_l_h || '').trim().toLowerCase();
          if (wastingStatus.includes('severely wasted')) {
            add('severely-wasted-sam', category, record);
          } else if (wastingStatus.includes('wasted')) {
            add('wasted-mam', category, record);
          }
          if (raw.fully_immunized) add('fic-9-12', category, record);
          if (raw.newborn_babies) add('newborn-babies-origin', category, record);
        }
        if (category === 'pregnantwoman') {
          if (
            raw.iron_folic_acid_type === 'Pregnant (180 tabs)' &&
            numericAmount(raw.iron_folic_acid) > 0
          ) add('iron-pregnant', category, record);
          if (
            raw.iron_folic_acid_type === 'Adolescent Pregnant (180 tabs)' &&
            numericAmount(raw.iron_folic_acid) > 0
          ) add('iron-adolescent', category, record);
        }
        if (category === 'lactatingwoman' && numericAmount(raw.iron_folic_acid) > 0) {
          add('iron-lactating', category, record);
        }
        if (category === 'infantfeeding' && raw.feeding_3_month) {
          add('exclusive-breastfeeding', category, record);
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

  const unreadActivityLogCount = activityLogs.filter(
    (log) => !readNotificationIds.includes(`record-activity:${log.id}`)
  ).length;

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Home Dashboard' },
    { id: 'residents', icon: Users2, label: 'Residents' },
    { id: 'environmentalSanitation', icon: Leaf, label: 'Environmental Sanitation Report' },
    { id: 'infantFeeding', icon: Baby, label: 'Infant Feeding (0-8 mo)' },
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
    pageFormat = 'a4',
    orientation,
    fontSize,
    cellPadding = 3,
    horizontalPageBreak,
    columnStyles,
    tableMarginBottom = 100,
  }) => {
    const exportData = removeNotesColumns(headers, rows, columnStyles);
    headers = exportData.headers;
    rows = exportData.rows;
    columnStyles = exportData.columnStyles;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const landscape = orientation ? orientation === 'landscape' : headers.length > 8;
    const document = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: pageFormat });
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
      margin: { top: 24, right: 18, bottom: tableMarginBottom, left: 18 },
      styles: {
        font: 'helvetica',
        fontSize: fontSize ?? (headers.length > 18 ? 5 : headers.length > 10 ? 6 : 8),
        cellPadding,
        overflow: 'linebreak',
        halign: 'center',
        textColor: [0, 0, 0],
        lineColor: [100, 100, 105],
        lineWidth: 0.3,
      },
      columnStyles,
      bodyStyles: { halign: 'center', fontStyle: 'normal', textColor: [0, 0, 0] },
      headStyles: {
        fillColor: [238, 234, 246],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        lineColor: [100, 100, 105],
        lineWidth: 0.4,
      },
      didParseCell: (hookData) => {
        if (
          hookData.section === 'body' &&
          sectionRowLabels.includes(String(hookData.row.raw?.[0] || ''))
        ) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [255, 232, 243];
          hookData.cell.styles.textColor = [0, 0, 0];
        }
      },
      horizontalPageBreak: horizontalPageBreak ?? headers.length > 18,
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
                      {col === 'Status' && row._raw && (
                        row._raw.sync_status || row._raw.synced !== undefined
                      ) ? (
                        <RecordSyncStatus record={row._raw} />
                      ) : col === 'Status' ? (
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
                          {getColumnKey(col).toLowerCase() === updatedColumn && isRecordEdited(row._raw) && (
                            <span className="inline-flex max-w-full items-center justify-center rounded-full bg-pink-100 px-1.5 py-0.5 text-center text-[9px] font-semibold text-pink-700">
                              Updated
                            </span>
                          )}
                          {getColumnKey(col).toLowerCase() === updatedColumn &&
                            !columns.includes('Status') &&
                            row._raw && (
                            <RecordSyncStatus record={row._raw} />
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
      className={`admin-sidebar relative flex h-full min-h-0 flex-shrink-0 flex-col border-r transition-all duration-300 ${
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
            src="/icon-192.png"
            alt="NutriGrid"
            className="h-14 w-14 flex-shrink-0 rounded-xl object-cover shadow-md"
          />
          {isExpanded && (
            <div className="overflow-hidden transition-all duration-200">
              <p className="truncate text-lg font-semibold leading-tight" style={{ color: darkMode ? THEME.dark.text : THEME.light.text }}>
                NutriGrid
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pt-4 pb-3">
        {navItems.map(({ id, icon: Icon, label, badge }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                if (id === 'activityLogs') {
                  markActivityLogsRead();
                }
              }}
              title={!isExpanded ? `${label}${badge ? ` (${badge} new)` : ''}` : undefined}
              aria-label={badge ? `${label}, ${badge} unread` : label}
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
              {badge > 0 && (
                <span
                  className={`absolute flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white ${
                    isExpanded ? 'right-2 top-1' : 'right-1 top-0'
                  }`}
                  aria-hidden="true"
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              if (!isExpanded) setIsExpanded(true);
              setSettingsExpanded((expanded) => !expanded);
            }}
            aria-expanded={settingsExpanded}
            className={`relative flex w-full flex-shrink-0 items-center rounded-2xl transition-all ${
              isExpanded ? 'gap-3 px-4 py-3 text-[17px] font-semibold' : 'justify-center px-0 py-3 text-[17px] font-semibold'
            }`}
            style={
              ['users', 'activityLogs'].includes(activeTab)
                ? { background: THEME.accentGradient, color: '#FFFFFF', boxShadow: '0 4px 14px rgba(143, 101, 255, 0.35)' }
                : { color: darkMode ? THEME.dark.muted : THEME.light.text }
            }
            title={!isExpanded ? 'Settings' : undefined}
            aria-label="Settings"
          >
            <Settings size={26} strokeWidth={2.2} className="flex-shrink-0" />
            {isExpanded && (
              <>
                <span className="flex-1 text-left">Settings</span>
                <ChevronDown size={16} className={`transition-transform ${settingsExpanded ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
          {isExpanded && settingsExpanded && (
            <div className="ml-8 space-y-1 border-l border-[#E8DCEF] pl-2">
              {[
                { id: 'users', label: 'BHW Accounts', icon: Users },
                { id: 'activityLogs', label: 'Activity Logs', icon: ClipboardList, badge: unreadActivityLogCount },
              ].map(({ id, label, icon: Icon, badge }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setActiveTab(id);
                      if (id === 'activityLogs') markActivityLogsRead();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                      isActive
                        ? 'bg-violet-100 text-violet-800'
                        : darkMode
                          ? 'text-slate-300 hover:bg-white/5'
                          : 'text-gray-700 hover:bg-white/60'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{label}</span>
                    {badge > 0 && (
                      <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-5 text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-base font-bold" style={{ color: titleColor }}>
              New vs. Repeat Malnutrition Cases
            </p>
            <MonthYearPicker
              value={malnutritionPeriod}
              onChange={setMalnutritionPeriod}
              max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
              darkMode={darkMode}
              compact
              label="Filter malnutrition cases by month and year"
            />
          </div>
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
              Top 10 Puroks by Households — {new Date(
                Number(purokPeriod.slice(0, 4)),
                Number(purokPeriod.slice(5, 7)) - 1,
                1
              ).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }).toUpperCase()}
            </p>
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
            <label className="relative block">
              <span className="sr-only">Choose trend year</span>
              <select
                value={monthlyTrendYear}
                onChange={(event) => setMonthlyTrendYear(event.target.value)}
                className={`min-h-12 min-w-44 appearance-none rounded-xl border bg-white py-2 pl-3.5 pr-10 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                  darkMode ? 'border-[#67445F] bg-[#302338] text-[#FCE7F3]' : 'border-gray-300 text-gray-800'
                }`}
                aria-label="Choose line chart year"
              >
                {monthlyTrendYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <ChevronDown
                size={16}
                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}
                aria-hidden="true"
              />
            </label>
          </div>
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              color: mutedColor,
              backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : THEME.light.surface,
            }}
          >
            {monthlyTrendYear} · January–December
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
                <XAxis dataKey="month" interval={0} tick={{ fontSize: 12, fill: darkMode ? '#D8C8D6' : '#9ca3af' }} axisLine={false} tickLine={false} />
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
      { label: 'Paraan ng Pagpapakain o Pagpapainom', colSpan: 9 },
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
      { label: '6 Buwan' },
      { label: '7 Buwan' },
      { label: '8 Buwan' },
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
        allowView
        scrollToRecordId={notificationTarget?.tab === 'residents' ? notificationTarget.rowId : undefined}
        importAction={
          <ImportRecordsExcelButton
            onImport={(rows) => importCategoryRecords(STORAGE_KEYS.residents, 'residents', 'Residents', rows)}
            onError={showImportError}
          />
        }
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
              orientation: 'landscape',
              fontSize: 7,
              cellPadding: 1.5,
              tableMarginBottom: 72,
              columnStyles: {
                0: { cellWidth: 110 },
                1: { cellWidth: 340 },
                2: { cellWidth: 90 },
                3: { cellWidth: 260 },
              },
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
      const purok = normalizeEnvironmentalPurokName(record.purok) || record.purok || 'Unassigned';
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
    const tableData = ENVIRONMENTAL_PUROK_OPTIONS.map((purok) => {
      const row = { ...(grouped.get(purok) || {}), id: `purok:${purok}`, purok };
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
        scrollToRecordId={notificationTarget?.tab === 'environmentalSanitation' ? notificationTarget.rowId : undefined}
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
        showSyncStatus={false}
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
              pageFormat: 'a3',
              fontSize: 4,
              cellPadding: 1.5,
              horizontalPageBreak: false,
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
      allowView
      scrollToRecordId={notificationTarget?.tab === 'infantFeeding' ? notificationTarget.rowId : undefined}
      importAction={
        <ImportRecordsExcelButton
          onImport={(rows) => importCategoryRecords(STORAGE_KEYS.infantfeeding, 'infantfeeding', 'Infant Feeding', rows)}
          onError={showImportError}
        />
      }
      purokFilter={adminPurokFilter}
      onPurokFilterChange={setAdminPurokFilter}
      columnKeys={['no', 'purok', 'motherName', 'childName', 'week1', 'month1', 'month2', 'month3', 'month4', 'month5', 'month6', 'month7', 'month8', 'notes']}
      headRows={infantFeedingHeadRows}
      legend="Code: E — Exclusive Breastfeeding | M — Mixed Feeding | N — Not Breastfeeding"
      minTableWidth={1260}
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
          title="Infant Feeding (0-8 mo)"
          fileName="alawihao-infant-feeding"
          headers={['No.', 'Purok', 'Mother', 'Child', '1 Week', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months', '6 Months', '7 Months', '8 Months', 'Notes']}
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
            row.month6,
            row.month7,
            row.month8,
            row.notes,
          ])}
          signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
          onExportPdf={(signatures, options = {}) => exportPdfFile({
          fileName: 'alawihao-infant-feeding',
          title: 'Infant Feeding (0-8 mo)',
          headers: ['No.', 'Purok', 'Mother', 'Child', '1 Week', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months', '6 Months', '7 Months', '8 Months', 'Notes'],
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
            row.month6,
            row.month7,
            row.month8,
            row.notes,
          ]),
          signatures,
          preview: options.preview,
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
      allowView
      scrollToRecordId={notificationTarget?.tab === 'lactatingWoman' ? notificationTarget.rowId : undefined}
      importAction={
        <ImportRecordsExcelButton
          onImport={(rows) => importCategoryRecords(STORAGE_KEYS.lactatingwoman, 'lactatingwoman', 'Lactating Women', rows)}
          onError={showImportError}
        />
      }
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
          signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
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
      allowView
      scrollToRecordId={notificationTarget?.tab === 'pregnantWoman' ? notificationTarget.rowId : undefined}
      importAction={
        <ImportRecordsExcelButton
          onImport={(rows) => importCategoryRecords(STORAGE_KEYS.pregnantwoman, 'pregnantwoman', 'Pregnant Women', rows)}
          onError={showImportError}
        />
      }
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
          signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
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
      recordCategory="monthlynatal"
      allowView
      scrollToRecordId={notificationTarget?.tab === 'monthlyNatality' ? notificationTarget.rowId : undefined}
      importAction={
        <ImportRecordsExcelButton
          onImport={(rows) => importCategoryRecords(STORAGE_KEYS.monthlynatal, 'monthlynatal', 'Monthly Natality', rows)}
          onError={showImportError}
        />
      }
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
      searchQuery={searchTerm}
      onBatchChange={updateMonthlyReportBatch}
      selectedBatch={monthlyReportBatch}
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
            void recordInformationDelete({
              category: 'monthlyreport',
              record: line,
              actorRole: 'admin',
            });
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
          signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
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

  const pageTitles = {
    dashboard: null,
    residents: 'Residents',
    environmentalSanitation: 'Environmental Sanitation Report',
    infantFeeding: 'Infant Feeding (0-8 mo)',
    lactatingWoman: 'Lactating Woman',
    pregnantWoman: 'Pregnant Woman',
    monthlyNatality: 'Monthly Natality',
    monthlyReport: 'Monthly Report',
    documents: 'Documents',
    tasks: 'Tasks',
    activityLogs: 'Activity Logs',
    users: 'BHW Accounts',
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
            searchTerm={searchTerm}
            setTabSearchTerm={setTabSearchTerm}
            performSearch={performSearch}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            showSearchSuggestions={showSearchSuggestions}
            setShowSearchSuggestions={setShowSearchSuggestions}
            showNotifications={showNotifications}
            setShowNotifications={setShowNotifications}
            notifications={notifications}
            visibleNotificationItems={visibleNotificationItems}
            notificationError={bhwDeletionRequestError}
            onNotificationClick={handleNotificationClick}
            notifRef={notifRef}
            setDarkMode={setDarkMode}
            setActiveTab={setActiveTab}
            setSelectedTaskFilter={setSelectedTaskFilter}
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
            {activeTab === 'activityLogs' && (
              <ActivityLogsPage
                logs={activityLogsForMonth}
                loading={activityLogLoading}
                error={activityLogError}
                darkMode={darkMode}
                currentUserId={currentUserId}
                onLoadMonth={refreshActivityLogs}
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
            {activeTab === 'users' && <BhwAccountsPage darkMode={darkMode} />}
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
                onSubmit={handleAdminCategoryFormSubmit}
                onCancel={closeCategoryForm}
              />
            </div>
          </section>
        </div>
      )}
      {deletionRequestTarget && (
        <div
          className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletionConfirmationBusy) {
              setDeletionRequestTarget(null);
              setDeletionConfirmationError('');
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bhw-deletion-confirmation-title"
            className="w-full max-w-lg rounded-2xl border border-red-100 bg-white p-5 text-gray-900 shadow-2xl sm:p-6"
          >
            <h2 id="bhw-deletion-confirmation-title" className="text-lg font-extrabold text-red-700">
              Confirm BHW account deletion
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              <strong>{deletionRequestTarget.full_name || 'This BHW'}</strong>
              {deletionRequestTarget.email ? ` (${deletionRequestTarget.email})` : ''} requested account deletion.
              Confirming removes their sign-in and profile.
            </p>
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Household, health, task, and activity records will be retained in Supabase and remain available to Admin.
            </p>
            {deletionConfirmationError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {deletionConfirmationError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletionRequestTarget(null);
                  setDeletionConfirmationError('');
                }}
                disabled={deletionConfirmationBusy}
                className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmBhwAccountDeletion()}
                disabled={deletionConfirmationBusy}
                className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deletionConfirmationBusy ? 'Deleting…' : 'Confirm Deletion'}
              </button>
            </div>
          </section>
        </div>
      )}
      <ConfirmActionDialog
        open={Boolean(adminConfirmation)}
        title={adminConfirmation?.title || 'Confirm changes'}
        message={adminConfirmation?.message}
        confirmLabel={adminConfirmation?.confirmLabel || (adminEditingRecord ? 'Save changes' : 'Save')}
        alternateConfirmLabel={adminConfirmation?.alternateConfirmLabel}
        highlightDuplicateFields={adminConfirmation?.highlightDuplicateFields}
        destructive={adminConfirmation?.destructive}
        busy={adminConfirmationBusy}
        onCancel={() => setAdminConfirmation(null)}
        onConfirm={() => void confirmAdminAction()}
        onAlternateConfirm={() => void confirmAdminAction('alternateAction')}
      />
    </div>
  );
};

export default AdminDashboard;