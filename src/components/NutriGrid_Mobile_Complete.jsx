import { registerPushToken } from '../utils/pushNotifications';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, 
  MapPin, 
  Wifi, 
  WifiOff, 
  Check, 
  Plus, 
  List, 
  Menu,
  X,
  AlertCircle,
  CheckCircle,
  Bell,
  UserCircle,
  Baby,
  Heart,
  Users,
  Calendar,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  ChevronDown,
  FileText,
  Edit,
  Trash2,
  Download,
} from 'lucide-react';
import {
  upsertRecord,
  deleteRecordById,
  getRecords,
  updateRecordSyncStatus,
  STORAGE_KEYS,
  storageKeyForCategory,
  filterRecordsBySearch,
  recordMatchesSearch,
  buildSavedRecords,
  performRecordSearch,
  getRecordDisplayTitle,
  getRecordSyncStatus,
  isRecordEdited,
  queueRecordDeletion,
  sortRecordsNewestFirst,
  toAdminEnvironmental,
} from '../utils/bnsStorage';
import {
  signInWithSupabase,
  restoreSupabaseSession,
  signOutSupabase,
  updateSupabaseProfile,
} from '../utils/supabaseAuth';
import {
  checkSessionTimeout,
  clearSessionTimeout,
  recordSessionActivity,
  restoreSessionTimeout,
  startSessionTimeout,
} from '../utils/sessionTimeout';
import {
  getSharedHouseholdCountsByPurokForMonth,
  applyRealtimeRecordChange,
  pullUserRecordsFromSupabase,
  syncPendingRecords,
  syncPendingRecordDeletions,
  syncSingleRecord,
} from '../utils/syncService';
import {
  deduplicateTasks,
  getLocalTasks,
  isTaskOverdue,
  loadTasks,
  syncPendingTasks,
} from '../utils/taskSyncService';
import ReportRowActions from './ReportRowActions';
import { ExpandableNote } from './AdminReportTable';
import RecordDetailsDialog from './RecordDetailsDialog';
import { exportTableToExcel } from '../utils/recordExcel';
import { NUTRI_GRID_THEME } from '../utils/nutriGridTheme';
import {
  comparePurokRecords,
  normalizeEnvironmentalPurokName,
  normalizePurokName,
  PUROK_FILTER_OPTIONS,
  PUROK_FORM_OPTIONS,
} from '../utils/purok';
import { calculateMonthlyTrend } from '../utils/recordTrends';
import { calculateAgeInYears } from '../utils/childGrowth';
import {
  findRecordDuplicate,
  getDuplicateRecordName,
  updateDuplicateRecord,
} from '../utils/recordDuplicates';
import {
  recordInformationCreate,
  recordInformationDelete,
  recordInformationEdit,
  syncPendingActivityLogs,
} from '../utils/activityLogService';
import BnsSearchBar from './BnsSearchBar';
import WelcomePage from './WelcomePage';
import SignInPage from './SignInPage';
import AdminDashboard from './AdminDashboard';
import SideMenu from './SideMenu';
import ForgotPassword from './ForgotPassword';
import { supabase } from '../utils/supabaseClient';
import ConfirmActionDialog from './ConfirmActionDialog';
import RecordSyncStatus from './RecordSyncStatus';
import {
  EnvironmentalSanitationForm,
  ResidentsForm,
  PregnantWomanForm,
  LactatingWomanForm,
  InfantFeedingForm,
  MonthlyNatalityForm,
  compressPhoto,
} from './CategorySpecificForms';

/**
 * NUTRIGRID - MOBILE APP WITH AUTHENTICATION
 * Complete flow: Welcome → Sign In → Main App
 */

const MOBILE = {
  navy: NUTRI_GRID_THEME.accentPurple,
  coral: NUTRI_GRID_THEME.accentPink,
  bg: NUTRI_GRID_THEME.main,
};

const LEGACY_RECORD_KEYS = {
  residents: 'pendingVisits',
  infantfeeding: 'records_infant_feeding',
  lactatingwoman: 'records_lactating_woman',
  pregnantwoman: 'records_pregnant_woman',
};
const PWA_READ_NOTIFICATIONS_KEY = 'nutrigrid_pwa_read_notifications';
const SHARED_PUROK_CACHE_KEY = 'nutrigrid_shared_purok_counts_v3';
const SHARED_PUROK_CACHE_TTL_MS = 5 * 60 * 1000;
const PWA_VIEW_STATE_KEY_PREFIX = 'nutrigrid_pwa_view_state:';
const PWA_PERSISTED_VIEWS = new Set(['home', 'records', 'profile']);
const PWA_CATEGORY_IDS = new Set([
  'residents',
  'environmental',
  'infantfeeding',
  'lactatingwoman',
  'pregnantwoman',
  'monthlynatal',
]);

function getPwaViewStateKey(userId) {
  return `${PWA_VIEW_STATE_KEY_PREFIX}${userId}`;
}

function readPwaViewState(userId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(getPwaViewStateKey(userId)) || 'null');
    const selectedCategory = PWA_CATEGORY_IDS.has(saved?.selectedCategory)
      ? saved.selectedCategory
      : null;
    const activeView = PWA_PERSISTED_VIEWS.has(saved?.activeView) &&
      (saved.activeView !== 'records' || selectedCategory)
      ? saved.activeView
      : 'home';
    const showCategoryForm = Boolean(saved?.showCategoryForm && selectedCategory && activeView === 'home');
    const editingRecordId = showCategoryForm && saved?.editingRecordId != null
      ? String(saved.editingRecordId)
      : null;
    const previewRecord = activeView === 'records' &&
      selectedCategory &&
      saved?.previewRecord?.categoryId === selectedCategory &&
      saved.previewRecord.recordId != null
      ? {
          categoryId: selectedCategory,
          recordId: String(saved.previewRecord.recordId),
        }
      : null;
    return {
      activeView,
      selectedCategory,
      showCategoryForm,
      editingRecordId,
      previewRecord,
    };
  } catch (error) {
    console.error('Could not restore the last PWA view:', error);
    return {
      activeView: 'home',
      selectedCategory: null,
      showCategoryForm: false,
      editingRecordId: null,
      previewRecord: null,
    };
  }
}

function readSharedPurokCache(monthKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(SHARED_PUROK_CACHE_KEY) || '{}');
    const entry = stored[monthKey];
    if (Array.isArray(entry)) return { counts: entry, fetchedAt: 0 };
    if (Array.isArray(entry?.counts) && Number.isFinite(entry.fetchedAt)) return entry;
    return null;
  } catch (error) {
    console.error('Could not read cached Purok totals:', error);
    return null;
  }
}

function saveSharedPurokCache(monthKey, counts) {
  try {
    const stored = JSON.parse(localStorage.getItem(SHARED_PUROK_CACHE_KEY) || '{}');
    localStorage.setItem(
      SHARED_PUROK_CACHE_KEY,
      JSON.stringify({ ...stored, [monthKey]: { counts, fetchedAt: Date.now() } })
    );
  } catch (error) {
    console.error('Could not cache shared Purok totals:', error);
  }
}

function getReadNotificationIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(PWA_READ_NOTIFICATIONS_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch (error) {
    console.error('Could not read PWA notification state:', error);
    return new Set();
  }
}

function removeLegacyRecord(category, id) {
  const key = LEGACY_RECORD_KEYS[category];
  if (!key) return;

  try {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(
      key,
      JSON.stringify(records.filter((record) => String(record.id) !== String(id)))
    );
  } catch (error) {
    console.error(`Could not remove legacy ${category} record from localStorage:`, error);
  }
}

function getLocalRecordMonth(record) {
  const raw = record?._raw || record || {};
  const dateValue = [
    raw.dow,
    raw.visit_date,
    raw.date_of_registration,
    raw.created_at,
    raw.date,
    raw.month,
  ].find((value) => /\b20\d{2}[-/]\d{1,2}/.test(String(value || '')));
  const match = String(dateValue || '').match(/\b(20\d{2})[-/](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
}

function getLocalSharedPurokCounts(monthKey) {
  const counts = new Map();
  getRecords(STORAGE_KEYS.residents).forEach((record) => {
    if (getLocalRecordMonth(record) !== monthKey) return;
    const purok = normalizePurokName(record.purok);
    if (purok) counts.set(purok, (counts.get(purok) || 0) + 1);
  });
  return Array.from(counts, ([purok, count]) => ({ purok, count }))
    .sort((left, right) =>
      right.count - left.count ||
      left.purok.localeCompare(right.purok, undefined, { numeric: true })
    )
    .slice(0, 10);
}

function isOwnedByUser(record, userId) {
  return Boolean(
    userId &&
    String(record?.created_by_user_id || '') === String(userId)
  );
}

function getUserRecords(storageKey, userId) {
  return sortRecordsNewestFirst(
    getRecords(storageKey).filter((record) => isOwnedByUser(record, userId))
  );
}

function replaceUserRecords(records, userId, updatedUserRecords) {
  return [
    ...records.filter((record) => !isOwnedByUser(record, userId)),
    ...updatedUserRecords,
  ];
}

const fieldHeaderStyle = {
  background: NUTRI_GRID_THEME.sidebarGradient,
  color: NUTRI_GRID_THEME.text,
};

function getSessionTimeoutMessage(reason) {
  if (reason === 'idle') {
    return 'You were signed out after 15 minutes of inactivity. Please sign in again.';
  }
  if (reason === 'absolute') {
    return 'You were signed out after 8 hours. Please sign in again.';
  }
  if (reason === 'signed_out') {
    return 'You were signed out in another tab. Please sign in again.';
  }
  return 'Please sign in again to start a secure session.';
}

// Responsive sizing for different phone widths. The app keeps the same layout,
// but scales the entire field-worker UI so compact phones (320-359px),
// standard phones (360-429px), and larger phones/tablets remain comfortable.
const FieldResponsiveShell = ({ children }) => {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 390
  );

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateViewportWidth);
    window.addEventListener('orientationchange', updateViewportWidth);
    return () => {
      window.removeEventListener('resize', updateViewportWidth);
      window.removeEventListener('orientationchange', updateViewportWidth);
    };
  }, []);

  const scale = viewportWidth <= 359 ? 0.88 : viewportWidth <= 429 ? 0.96 : 1;

  return (
    <div
      className="field-responsive-shell"
      style={{
        '--field-scale': scale,
        width: `calc(100% / ${scale})`,
        maxWidth: `calc(28rem / ${scale})`,
        zoom: scale,
        marginLeft: 'auto',
        marginRight: 'auto',
        minHeight: `calc(100vh / ${scale})`,
      }}
    >
      {children}
    </div>
  );
};


const FieldSearchInput = ({
  searchQuery,
  performSearch,
  searchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  setSelectedCategory,
  setActiveView,
  className = '',
}) => (
  <BnsSearchBar
    query={searchQuery}
    onSearch={performSearch}
    results={searchResults}
    showSuggestions={showSearchSuggestions}
    onSelectResult={(record) => {
      setSelectedCategory(record.categoryId);
      setShowSearchSuggestions(false);
      setActiveView('records');
    }}
    onFocusSuggestions={() => setShowSearchSuggestions(true)}
    onBlurSuggestions={() => setShowSearchSuggestions(false)}
    placeholder="Search records..."
    emptyMessage="No matching records"
    className={className}
    tone="field"
  />
);

const PageHeader = ({
  title,
  subtitle,
  onBack,
  showSearch = false,
  searchQuery,
  performSearch,
  searchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  setSelectedCategory,
  setActiveView,
  purokFilter,
  setPurokFilter,
  excelRecords,
  excelHeaders,
  excelRows,
  excelFileName,
}) => (
  <div className="px-5 pt-5 pb-8 rounded-b-[2rem] shadow-md" style={fieldHeaderStyle}>
    {onBack && (
      <button
        onClick={onBack}
        className="mb-3 p-1.5 -ml-1 rounded-lg hover:bg-white/50 transition"
        style={{ color: NUTRI_GRID_THEME.text }}
      >
        <ChevronLeft size={24} />
      </button>
    )}
    <h2 className="text-xl font-bold">{title}</h2>
    {subtitle && <p className="text-sm mt-1" style={{ color: NUTRI_GRID_THEME.muted }}>{subtitle}</p>}
    {showSearch && (
      <FieldSearchInput
        searchQuery={searchQuery}
        performSearch={performSearch}
        searchResults={searchResults}
        showSearchSuggestions={showSearchSuggestions}
        setShowSearchSuggestions={setShowSearchSuggestions}
        setSelectedCategory={setSelectedCategory}
        setActiveView={setActiveView}
        className="mt-4"
      />
    )}
    {(setPurokFilter || excelRecords) && (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {setPurokFilter && (
          <label className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-700">
            <span>Filter:</span>
            <span className="relative inline-flex">
              <select
                value={purokFilter || ''}
                onChange={(event) => setPurokFilter(event.target.value)}
                className="min-w-32 appearance-none rounded-xl border border-[#E8DCEF] bg-white py-1.5 pl-2.5 pr-7 text-xs text-slate-800 shadow-sm outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                aria-label="Filter records by Purok"
              >
                <option value="">All Puroks</option>
                <option value="__sorted__">Purok 1-10</option>
                {PUROK_FILTER_OPTIONS.map((purok) => (
                  <option key={purok} value={purok}>{purok}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-600"
              />
            </span>
          </label>
        )}
        {excelRecords && (
        <button
          type="button"
          onClick={() => exportTableToExcel(excelHeaders, excelRows, excelFileName)}
          disabled={!excelRecords.length}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={14} />
          SAVE AS EXCEL FILE
        </button>
        )}
      </div>
    )}
  </div>
);

const RecordsList = ({
  DASHBOARD_CATEGORIES,
  selectedCategory,
  searchQuery,
  recordsRefresh,
  pendingVisits,
  setPendingVisits,
  startEditRecord,
  deleteCategoryRecord,
  setActiveView,
  MOBILE,
  searchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  performSearch,
  setSelectedCategory,
  currentUserId,
  actorRole,
  requestConfirmation,
  deleteCategoryRecords,
  previewRecord,
  setPreviewRecord,
}) => {
  const [filter, setFilter] = useState('all');
  const [purokFilter, setPurokFilter] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState(() => new Set());

  useEffect(() => {
    setSelectedRecordIds(new Set());
  }, [selectedCategory, recordsRefresh, searchQuery, purokFilter]);

  const selectionKey = (record, index) => String(record.id ?? `row-${index}`);
  const selectedFrom = (records) => records.filter((record, index) =>
    selectedRecordIds.has(selectionKey(record, index))
  );
  const toggleSelection = (record, index) => {
    const key = selectionKey(record, index);
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectionHeader = (records) => {
    const selected = selectedFrom(records);
    const allSelected = records.length > 0 && selected.length === records.length;
    return (
      <span className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => setSelectedRecordIds(
            allSelected ? new Set() : new Set(records.map(selectionKey))
          )}
          aria-label={allSelected ? 'Deselect all visible records' : 'Select all visible records'}
          className="h-4 w-4 cursor-pointer accent-violet-600"
        />
      </span>
    );
  };
  const selectionCell = (record, index) => (
    <span className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={selectedRecordIds.has(selectionKey(record, index))}
        onChange={() => toggleSelection(record, index)}
        aria-label={`Select record ${record.id ?? index + 1}`}
        className="h-4 w-4 cursor-pointer accent-violet-600"
      />
    </span>
  );
  const renderSelectionBar = (records, headers, rows, fileName) => {
    const selectedRecords = selectedFrom(records);
    if (selectedRecords.length === 0) return null;
    const selectedRows = records.flatMap((record, index) =>
      selectedRecordIds.has(selectionKey(record, index)) ? [rows[index]] : []
    );
    return (
      <div className="mx-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-950">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="rounded-full bg-violet-600 px-2.5 py-1 text-xs font-bold text-white">
            {selectedRecords.length}
          </span>
          rows selected
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedRecordIds(new Set())}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            Clear Selection
          </button>
          <button
            type="button"
            onClick={() => exportTableToExcel(headers, selectedRows, `${fileName}-selected`)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            <Download size={14} />
            Export Selected
          </button>
          <button
            type="button"
            onClick={() => deleteCategoryRecords(selectedCategory, selectedRecords)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>
      </div>
    );
  };

  const categoryMeta = DASHBOARD_CATEGORIES.find((c) => c.id === selectedCategory);
  const categoryRecords = useMemo(() => {
    if (!selectedCategory) return [];
    const storedRecords = getUserRecords(
      storageKeyForCategory(selectedCategory),
      currentUserId
    );
    const records = filterRecordsBySearch(
      storedRecords,
      searchQuery
    );
    if (purokFilter === '__sorted__') return [...records].sort(comparePurokRecords);
    return purokFilter
      ? records.filter((record) => normalizeEnvironmentalPurokName(record.purok) === purokFilter)
      : records;
  }, [selectedCategory, recordsRefresh, searchQuery, currentUserId, purokFilter]);

  const mergeWithLegacyFiltered = (canonicalRecords, legacyKey) => {
    let legacy = [];
    try {
      legacy = JSON.parse(localStorage.getItem(legacyKey) || '[]');
    } catch {
      legacy = [];
    }
    const filteredLegacy = filterRecordsBySearch(
      legacy.filter((record) => isOwnedByUser(record, currentUserId)),
      searchQuery
    ).filter((record) =>
      !purokFilter || purokFilter === '__sorted__' ||
      normalizeEnvironmentalPurokName(record.purok) === purokFilter
    );
    const ids = new Set(canonicalRecords.map((r) => String(r.id)));
    const merged = [
      ...canonicalRecords,
      ...filteredLegacy.filter((r) => !ids.has(String(r.id))),
    ];
    return purokFilter === '__sorted__' ? merged.sort(comparePurokRecords) : sortRecordsNewestFirst(merged);
  };

  const recordsSubtitle = (count, label = 'record(s)') =>
    `${count} ${label}${searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ''}`;

  const emptyRecordsMessage = (defaultMsg) =>
    searchQuery.trim() || purokFilter ? 'No records match the current filters.' : defaultMsg;

  const RecordActions = ({ record, allowView = true }) => {
    const isViewingRecord = record.id != null &&
      previewRecord?.categoryId === selectedCategory &&
      String(previewRecord.recordId) === String(record.id);
    return (
      <>
        <ReportRowActions
          onView={allowView && record.id != null
            ? () => setPreviewRecord({
                categoryId: selectedCategory,
                recordId: String(record.id),
              })
            : undefined}
          onEdit={() => startEditRecord(record, selectedCategory)}
          onDelete={() => deleteCategoryRecord(selectedCategory, record)}
        />
        <RecordDetailsDialog
          record={isViewingRecord ? record : null}
          records={categoryRecords}
          recordCategory={selectedCategory}
          compact
          onClose={() => setPreviewRecord(null)}
        />
      </>
    );
  };

  const filteredRecords = (filter === 'all'
    ? pendingVisits
    : pendingVisits.filter((visit) => filter === 'pending' ? !visit.synced : visit.synced)
  ).filter((visit) =>
    !purokFilter || purokFilter === '__sorted__' ||
    normalizeEnvironmentalPurokName(visit.purok) === purokFilter
  );
  const sortedFilteredRecords = purokFilter === '__sorted__'
    ? [...filteredRecords].sort(comparePurokRecords)
    : filteredRecords;

  const handleDeleteRecord = (id) => {
    requestConfirmation(
      'Are you sure you want to delete this record permanently from your phone?',
      () => {
      const deletedRecord = pendingVisits.find((visit) => String(visit.id) === String(id));
      if (deletedRecord) {
        void recordInformationDelete({
          category: 'residents',
          record: deletedRecord,
          actorRole,
        });
      }
      const updated = pendingVisits.filter(v => v.id !== id);
      const allVisits = getRecords(STORAGE_KEYS.pendingVisits);
      localStorage.setItem(
        STORAGE_KEYS.pendingVisits,
        JSON.stringify(replaceUserRecords(allVisits, currentUserId, updated))
      );
      setPendingVisits(updated);
      },
      { title: 'Delete record', confirmLabel: 'Delete', destructive: true }
    );
  };

  const formatLastVisit = (record) => {
    const raw = record.visit_date || record.created_at;
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPurokCell = (value) => {
    const purok = String(value ?? '').trim();
    return purok.replace(/^purok\s*/i, '') || '—';
  };

  const getExportSyncStatus = (record) => {
    const status = getRecordSyncStatus(record);
    return ({
      pending_sync: 'Pending Sync',
      syncing: 'Syncing',
      synced: 'Synced',
      sync_failed: 'Sync Failed',
    })[status];
  };

  const formatTableDate = (raw) => {
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const formatMonth = (raw) => {
    if (!raw) return '—';
    const [year, month] = String(raw).split('-');
    if (!year || !month) return raw;
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const pwDisplayName = (record) =>
    [record.last_name, record.first_name, record.middle_name].filter(Boolean).join(', ') ||
    record.name ||
    '—';

  const updatedName = (value, record) => (
    <span className="flex w-full min-w-0 flex-col items-center gap-1">
      <span className="block w-full min-w-0 whitespace-normal break-words">{value || '—'}</span>
      {selectedCategory !== 'residents' && <RecordSyncStatus record={record} />}
      {isRecordEdited(record) && (
        <span className="inline-flex max-w-full items-center justify-center rounded-full bg-pink-100 px-1.5 py-0.5 text-center text-[9px] font-semibold text-pink-700">
          Updated
        </span>
      )}
    </span>
  );

  if (selectedCategory === 'residents') {
    const residentHeaders = ['Purok', 'Head', 'Members', 'Status', 'Last Visit', 'Notes'];
    const residentRows = categoryRecords.map((record) => [
      formatPurokCell(record.purok),
      record.household_head || '—',
      record.total_members ?? '—',
      getExportSyncStatus(record),
      formatLastVisit(record),
      record.notes || '—',
    ]);

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="Residents"
          subtitle={recordsSubtitle(categoryRecords.length)}
          onBack={() => setActiveView('home')}
          showSearch
          searchQuery={searchQuery}
          performSearch={performSearch}
          searchResults={searchResults}
          showSearchSuggestions={showSearchSuggestions}
          setShowSearchSuggestions={setShowSearchSuggestions}
          setSelectedCategory={setSelectedCategory}
          setActiveView={setActiveView}
          purokFilter={purokFilter}
          setPurokFilter={setPurokFilter}
          excelRecords={categoryRecords}
          excelHeaders={residentHeaders}
          excelRows={residentRows}
          excelFileName="nutrigrid-residents"
        />
        {renderSelectionBar(categoryRecords, residentHeaders, residentRows, 'nutrigrid-residents')}
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[660px]">
                <div className="grid grid-cols-[2rem_1fr_1.2fr_0.6fr_0.7fr_1fr_1.2fr_4.5rem] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">
                  {selectionHeader(categoryRecords)}
                  <span>Purok</span>
                  <span>Head</span>
                  <span>Members</span>
                  <span>Status</span>
                  <span>Last Visit</span>
                  <span>Notes</span>
                  <span className="text-right">Actions</span>
                </div>
                {categoryRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">
                    {emptyRecordsMessage('No resident records yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  categoryRecords.map((record, idx) => (
                    <div
                      key={record.id}
                      className={`grid grid-cols-[2rem_1fr_1.2fr_0.6fr_0.7fr_1fr_1.2fr_4.5rem] gap-2 px-4 py-3 border-b border-gray-100 text-sm text-gray-800 items-center text-center ${selectedRecordIds.has(selectionKey(record, idx)) ? 'bg-violet-50' : ''}`}
                    >
                      {selectionCell(record, idx)}
                      <span className="font-medium truncate">{formatPurokCell(record.purok)}</span>
                      {updatedName(record.household_head, record)}
                      <span>{record.total_members ?? '—'}</span>
                      <RecordSyncStatus record={record} />
                      <span className="text-xs text-gray-600">{formatLastVisit(record)}</span>
                      <ExpandableNote value={record.notes} />
                      <RecordActions record={record} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {categoryRecords.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-3 px-2">
              Swipe sideways to see all columns on small screens.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (selectedCategory === 'environmental') {
    const environmentalColumns = [
      ['purok', 'Purok'],
      ['totalHH', 'Total HH'], ['totalFamilies', 'Total Families'], ['maleCount', 'Male'],
      ['femaleCount', 'Female'], ['totalPopulation', 'Total Population'], ['hhWithOccupation', 'Occupation'],
      ['toiletVS', 'WS'], ['toiletOP', 'OP'], ['toiletCommunal', 'Communal'],
      ['toiletNone', 'NO SANITARY TOILET'], ['waterSourceI', 'I'], ['waterSourceII', 'II'],
      ['waterSourceIII', 'III'], ['withoutPotableWater', 'Without potable water'],
      ['electricityOwned', 'Owned'], ['electricityConnected', 'Connect'],
      ['vegetableGarden', 'Veg. garden'], ['herbalGarden', 'Herbal garden'],
      ['backyardPoultry', 'Backyard poultry/livestock'], ['swine', 'Swine'], ['fishPond', 'Fish pond'],
      ['usesIodizedSalt', 'Uses iodized salt'], ['malunggayTree', 'With malunggay tree'],
      ['garbageCollect', 'Collected'], ['garbageCompostPit', 'Compost Pit'], ['garbageBurned', 'Burned'],
      ['householdSmoker', 'HH w/ smoker'], ['householdNonsmoker', 'HH w/ non-smoker'],
      ['fatherReceivingRe', 'CH. NL father'], ['iodizedSaltSariSari', 'Sari-sari salt'],
      ['iodizedSaltGrocery', 'Grocery salt'],
      ['estBakery', 'Bakery'], ['estCarenderia', 'Carenderia'], ['estRestaurant', 'Restaurant'],
      ['estHotelRest', 'Hotel'],
      ['actions', 'Actions'],
    ];
    const allEnvironmentalRecords = mergeWithLegacyFiltered(categoryRecords, 'records_environmental');
    const adminRecords = toAdminEnvironmental(allEnvironmentalRecords);
    const checkmarkKeys = new Set([
      'toiletVS', 'toiletOP', 'toiletCommunal', 'toiletNone',
      'waterSourceI', 'waterSourceII', 'waterSourceIII', 'withoutPotableWater',
      'electricityOwned', 'electricityConnected', 'vegetableGarden', 'herbalGarden',
      'backyardPoultry', 'swine', 'fishPond', 'usesIodizedSalt', 'malunggayTree',
      'garbageCollect', 'garbageCompostPit', 'garbageBurned', 'householdSmoker',
      'householdNonsmoker', 'fatherReceivingRe', 'iodizedSaltSariSari',
      'iodizedSaltGrocery', 'estBakery', 'estCarenderia', 'estRestaurant', 'estHotelRest',
    ]);

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="Environmental Sanitation"
          subtitle={recordsSubtitle(allEnvironmentalRecords.length)}
          onBack={() => setActiveView('home')}
          showSearch
          searchQuery={searchQuery}
          performSearch={performSearch}
          searchResults={searchResults}
          showSearchSuggestions={showSearchSuggestions}
          setShowSearchSuggestions={setShowSearchSuggestions}
          setSelectedCategory={setSelectedCategory}
          setActiveView={setActiveView}
          purokFilter={purokFilter}
          setPurokFilter={setPurokFilter}
          excelRecords={allEnvironmentalRecords}
          excelHeaders={environmentalColumns
            .filter(([key]) => key !== 'actions')
            .map(([, label]) => label)}
          excelRows={adminRecords.map((record) =>
            environmentalColumns
              .filter(([key]) => key !== 'actions')
              .map(([key]) => checkmarkKeys.has(key)
                ? (record[key] ? '✓' : '')
                : record[key] ?? '—')
          )}
          excelFileName="nutrigrid-environmental-sanitation"
        />
        <div className="px-3 pt-4">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <div className="min-w-[2350px]">
                <div
                  className="grid gap-1 border-b border-green-200 bg-green-50 px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-green-900"
                  style={{ gridTemplateColumns: `repeat(${environmentalColumns.length}, minmax(4.5rem, 1fr))` }}
                >
                  {environmentalColumns.map(([, label]) => (
                    <span key={label} className="truncate">{label}</span>
                  ))}
                </div>
                {allEnvironmentalRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">
                    {emptyRecordsMessage('No environmental sanitation records yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  adminRecords.map((record, index) => (
                    <div
                      key={record.id ?? index}
                      className="grid items-center gap-1 border-b border-gray-100 px-3 py-2.5 text-center text-[11px] text-gray-800"
                      style={{ gridTemplateColumns: `repeat(${environmentalColumns.length}, minmax(4.5rem, 1fr))` }}
                    >
                      {environmentalColumns.map(([key]) => (
                        key === 'actions' ? (
                          <div key={key} className="flex min-w-[4.5rem] items-center justify-center">
                            {record._raw ? (
                              <RecordActions record={record._raw} />
                            ) : (
                              <span className="text-gray-300" aria-hidden="true">—</span>
                            )}
                          </div>
                        ) : key === 'purok' ? (
                          <span key={key} className="flex min-w-0 flex-col items-center gap-1">
                            {key === 'purok' ? formatPurokCell(record[key]) : record[key] || '—'}
                            <RecordSyncStatus record={record._raw || record} />
                          </span>
                        ) : key === 'notes' ? (
                          <ExpandableNote key={key} value={record.notes} />
                        ) : (
                          <span
                            key={key}
                            className={key === 'visited_by' ? 'min-w-0' : 'truncate'}
                            title={String(record[key] ?? '')}
                          >
                            {checkmarkKeys.has(key)
                              ? (record[key] ? '✓' : '')
                              : (record[key] ?? 0)}
                          </span>
                        )
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {allEnvironmentalRecords.length > 0 && (
            <p className="mt-3 px-2 text-center text-xs text-gray-400">
              Swipe sideways to view all sanitation columns.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (selectedCategory === 'pregnantwoman') {
    const allPwRecords = mergeWithLegacyFiltered(categoryRecords, 'records_pregnant_woman');

    const pwHeader = [
      'Purok',
      'Date Reg',
      'FSN',
      'Last',
      'First',
      'Middle',
      'Spouse',
      'Contact',
      'Birthday',
      'Age',
      'Civil',
      'LMP',
      'EDD',
      'PhilHealth',
      '4Ps',
      'Wt',
      'Ht',
      'BMI',
      'MUAC',
      'Given Iron with Folic Acid for',
      'Amount of Tabs',
      'Notes',
    ];
    const pwRows = allPwRecords.map((record) => [
      formatPurokCell(record.purok),
      formatTableDate(record.date_of_registration),
      record.family_serial_number || '—',
      record.last_name || '—',
      record.first_name || '—',
      record.middle_name || '—',
      record.spouse_name || '—',
      record.contact_number || '—',
      formatTableDate(record.birthday),
      record.age ?? '—',
      record.civil_status || '—',
      formatTableDate(record.lmp),
      formatTableDate(record.expected_date_of_delivery),
      record.philhealth_member || '—',
      record.four_ps_beneficiary || '—',
      record.weight ?? '—',
      record.height ?? '—',
      record.bmi ?? '—',
      record.muac ?? '—',
      record.iron_folic_acid_type || '—',
      record.iron_folic_acid || '—',
      record.notes || '—',
    ]);

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="Pregnant Woman"
          subtitle={recordsSubtitle(allPwRecords.length, 'registration(s)')}
          onBack={() => setActiveView('home')}
          showSearch
          searchQuery={searchQuery}
          performSearch={performSearch}
          searchResults={searchResults}
          showSearchSuggestions={showSearchSuggestions}
          setShowSearchSuggestions={setShowSearchSuggestions}
          setSelectedCategory={setSelectedCategory}
          setActiveView={setActiveView}
          purokFilter={purokFilter}
          setPurokFilter={setPurokFilter}
          excelRecords={allPwRecords}
          excelHeaders={pwHeader}
          excelRows={pwRows}
          excelFileName="nutrigrid-pregnant-women"
        />
        {renderSelectionBar(allPwRecords, pwHeader, pwRows, 'nutrigrid-pregnant-women')}
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1700px]">
                <div className="grid grid-cols-[repeat(24,minmax(4.5rem,1fr))] gap-1 px-3 py-3 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-center">
                  {selectionHeader(allPwRecords)}
                  {[...pwHeader, 'Actions'].map((label) => (
                    <span key={label} className="truncate">
                      {label}
                    </span>
                  ))}
                </div>
                {allPwRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">
                    {emptyRecordsMessage('No registrations yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  allPwRecords.map((record, idx) => (
                    <div
                      key={record.id ?? idx}
                      className={`grid grid-cols-[repeat(24,minmax(4.5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center text-center ${selectedRecordIds.has(selectionKey(record, idx)) ? 'bg-violet-50' : ''}`}
                    >
                      {selectionCell(record, idx)}
                      <span>{formatPurokCell(record.purok)}</span>
                      <span>{formatTableDate(record.date_of_registration)}</span>
                      <span className="truncate">{record.family_serial_number || '—'}</span>
                      {updatedName(record.last_name, record)}
                      <span className="truncate">{record.first_name || '—'}</span>
                      <span className="truncate">{record.middle_name || '—'}</span>
                      <span className="truncate">{record.spouse_name || '—'}</span>
                      <span className="truncate">{record.contact_number || '—'}</span>
                      <span>{formatTableDate(record.birthday)}</span>
                      <span>{record.age ?? '—'}</span>
                      <span className="truncate">{record.civil_status || '—'}</span>
                      <span>{formatTableDate(record.lmp)}</span>
                      <span>{formatTableDate(record.expected_date_of_delivery)}</span>
                      <span>{record.philhealth_member || '—'}</span>
                      <span>{record.four_ps_beneficiary || '—'}</span>
                      <span>{record.weight ?? '—'}</span>
                      <span>{record.height ?? '—'}</span>
                      <span>{record.bmi ?? '—'}</span>
                      <span>{record.muac ?? '—'}</span>
                      <span className="truncate">{record.iron_folic_acid_type || '—'}</span>
                      <span>{record.iron_folic_acid || '—'}</span>
                      <ExpandableNote value={record.notes} />
                      <RecordActions record={record} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {allPwRecords.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-3 px-2">
              Swipe sideways to view all registration columns.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (selectedCategory === 'lactatingwoman') {
    const allLwRecords = mergeWithLegacyFiltered(categoryRecords, 'records_lactating_woman');

    const lwHeader = [
      'No',
      'Purok',
      'Date Reg',
      'FSN',
      'Last',
      'First',
      'Middle',
      'Spouse',
      'Contact',
      'Birthday',
      'Age',
      'Civil',
      'PhilHealth',
      '4Ps',
      'Wt',
      'Ht',
      'BMI',
      'MUAC',
      'Iron with Folic Acid',
      'Date Delivered',
      'Notes',
    ];
    const lwRows = allLwRecords.map((record, index) => [
      index + 1,
      formatPurokCell(record.purok),
      formatTableDate(record.date_of_registration),
      record.family_serial_number || '—',
      record.last_name || '—',
      record.first_name || '—',
      record.middle_name || '—',
      record.spouse_name || '—',
      record.contact_number || '—',
      formatTableDate(record.birthday),
      record.age ?? '—',
      record.civil_status || '—',
      record.philhealth_member || '—',
      record.four_ps_beneficiary || '—',
      record.weight ?? '—',
      record.height ?? '—',
      record.bmi ?? '—',
      record.muac ?? '—',
      record.iron_folic_acid || '—',
      formatTableDate(record.date_delivered),
      record.notes || '—',
    ]);

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="Lactating Woman"
          subtitle={recordsSubtitle(allLwRecords.length, 'registration(s)')}
          onBack={() => setActiveView('home')}
          showSearch
          searchQuery={searchQuery}
          performSearch={performSearch}
          searchResults={searchResults}
          showSearchSuggestions={showSearchSuggestions}
          setShowSearchSuggestions={setShowSearchSuggestions}
          setSelectedCategory={setSelectedCategory}
          setActiveView={setActiveView}
          purokFilter={purokFilter}
          setPurokFilter={setPurokFilter}
          excelRecords={allLwRecords}
          excelHeaders={lwHeader}
          excelRows={lwRows}
          excelFileName="nutrigrid-lactating-women"
        />
        {renderSelectionBar(allLwRecords, lwHeader, lwRows, 'nutrigrid-lactating-women')}
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1600px]">
                <div className="grid grid-cols-[repeat(23,minmax(4.5rem,1fr))] gap-1 px-3 py-3 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-center">
                  {selectionHeader(allLwRecords)}
                  {[...lwHeader, 'Actions'].map((label) => (
                    <span key={label} className="truncate">
                      {label}
                    </span>
                  ))}
                </div>
                {allLwRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">
                    {emptyRecordsMessage('No registrations yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  allLwRecords.map((record, idx) => (
                    <div
                      key={record.id ?? idx}
                      className={`grid grid-cols-[repeat(23,minmax(4.5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center text-center ${selectedRecordIds.has(selectionKey(record, idx)) ? 'bg-violet-50' : ''}`}
                    >
                      {selectionCell(record, idx)}
                      <span>{idx + 1}</span>
                      <span>{formatPurokCell(record.purok)}</span>
                      <span>{formatTableDate(record.date_of_registration)}</span>
                      <span className="truncate">{record.family_serial_number || '—'}</span>
                      {updatedName(record.last_name, record)}
                      <span className="truncate">{record.first_name || '—'}</span>
                      <span className="truncate">{record.middle_name || '—'}</span>
                      <span className="truncate">{record.spouse_name || '—'}</span>
                      <span className="truncate">{record.contact_number || '—'}</span>
                      <span>{formatTableDate(record.birthday)}</span>
                      <span>{record.age ?? '—'}</span>
                      <span className="truncate">{record.civil_status || '—'}</span>
                      <span>{record.philhealth_member || '—'}</span>
                      <span>{record.four_ps_beneficiary || '—'}</span>
                      <span>{record.weight ?? '—'}</span>
                      <span>{record.height ?? '—'}</span>
                      <span>{record.bmi ?? '—'}</span>
                      <span>{record.muac ?? '—'}</span>
                      <span>{record.iron_folic_acid || '—'}</span>
                      <span>{formatTableDate(record.date_delivered)}</span>
                      <ExpandableNote value={record.notes} />
                      <RecordActions record={record} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {allLwRecords.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-3 px-2">
              Swipe sideways to view all registration columns.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (selectedCategory === 'monthlynatal') {
    const natalityHeader = [
      'Month',
      'Purok',
      'Mother',
      'Mother Birthday',
      'Age',
      'Child',
      'Sex',
      'DOB',
      'Birth Weight',
      'DOW',
      'Wt (kg)',
      'Ht (cm)',
      'AIM',
      'Length (cm)',
      'W/A',
      'H/A',
      'W/L/H',
      'Iron Drops for LBW/Preterm',
      'Given Vitamin A',
      'Vitamin A Quantity',
      'Fully Immunized (9–12 months)',
      'Newborn Babies',
      'Remarks',
    ];
    const natalityRows = categoryRecords.map((record) => [
      formatMonth(record.month),
      formatPurokCell(record.purok),
      record.mother_name || '—',
      formatTableDate(record.mother_birthday),
      calculateAgeInYears(record.mother_birthday) || record.mother_age || '—',
      record.child_name || '—',
      record.sex === 'boys' ? 'Male' : record.sex === 'girls' ? 'Female' : '—',
      formatTableDate(record.dob),
      record.birth_weight ?? record.birth_weight_kg ?? '—',
      formatTableDate(record.dow),
      record.weight_kg ?? '—',
      record.height_cm ?? '—',
      record.aim ?? '—',
      record.length_cm ?? '—',
      record.w_a || '—',
      record.h_a || '—',
      record.w_l_h || '—',
      record.iron_status || record.iron_given || '—',
      record.vitamin_a || '—',
      record.vitamin_a_count || '—',
      record.fully_immunized ? '✓' : '',
      record.newborn_babies ? '✓' : '',
      record.remarks || record.notes || '—',
    ]);

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="Monthly Natality"
          subtitle={recordsSubtitle(categoryRecords.length)}
          onBack={() => setActiveView('home')}
          showSearch
          searchQuery={searchQuery}
          performSearch={performSearch}
          searchResults={searchResults}
          showSearchSuggestions={showSearchSuggestions}
          setShowSearchSuggestions={setShowSearchSuggestions}
          setSelectedCategory={setSelectedCategory}
          setActiveView={setActiveView}
          purokFilter={purokFilter}
          setPurokFilter={setPurokFilter}
          excelRecords={categoryRecords}
          excelHeaders={natalityHeader}
          excelRows={natalityRows}
          excelFileName="nutrigrid-monthly-natality"
        />
        {renderSelectionBar(categoryRecords, natalityHeader, natalityRows, 'nutrigrid-monthly-natality')}
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1900px]">
                <div className="grid grid-cols-[repeat(25,minmax(4.5rem,1fr))] gap-1 px-3 py-3 bg-amber-50 border-b border-amber-200 text-[10px] font-semibold text-amber-900 uppercase tracking-wide text-center">
                  {selectionHeader(categoryRecords)}
                  {[...natalityHeader, 'Actions'].map((label) => (
                    <span key={label} className="truncate">{label}</span>
                  ))}
                </div>
                {categoryRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">
                    {emptyRecordsMessage('No natality records yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  categoryRecords.map((record, idx) => (
                    <div
                      key={record.id ?? idx}
                      className={`grid grid-cols-[repeat(25,minmax(4.5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center text-center ${selectedRecordIds.has(selectionKey(record, idx)) ? 'bg-violet-50' : ''}`}
                    >
                      {selectionCell(record, idx)}
                      <span className="truncate">{formatMonth(record.month)}</span>
                      <span>{formatPurokCell(record.purok)}</span>
                      {updatedName(record.mother_name, record)}
                      <span>{formatTableDate(record.mother_birthday)}</span>
                      <span>{calculateAgeInYears(record.mother_birthday) || record.mother_age || '—'}</span>
                      <span className="truncate">{record.child_name || '—'}</span>
                      <span>{record.sex === 'boys' ? 'Male' : record.sex === 'girls' ? 'Female' : '—'}</span>
                      <span>{formatTableDate(record.dob)}</span>
                      <span>{record.birth_weight ?? record.birth_weight_kg ?? '—'}</span>
                      <span>{formatTableDate(record.dow)}</span>
                      <span>{record.weight_kg ?? '—'}</span>
                      <span>{record.height_cm ?? '—'}</span>
                      <span>{record.aim ?? '—'}</span>
                      <span>{record.length_cm ?? '—'}</span>
                      <span>{record.w_a || '—'}</span>
                      <span>{record.h_a || '—'}</span>
                      <span>{record.w_l_h || '—'}</span>
                      <span className="truncate">{record.iron_status || record.iron_given || '—'}</span>
                      <span className="truncate">{record.vitamin_a || '—'}</span>
                      <span>{record.vitamin_a_count || '—'}</span>
                      <span>{record.fully_immunized ? '✓' : ''}</span>
                      <span>{record.newborn_babies ? '✓' : ''}</span>
                      <ExpandableNote value={record.remarks || record.notes} />
                      <RecordActions record={record} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {categoryRecords.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-3 px-2">
              Swipe sideways to view all columns.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (selectedCategory === 'infantfeeding') {
    const allIfRecords = mergeWithLegacyFiltered(categoryRecords, 'records_infant_feeding');

    const ifHeader = [
      'Purok',
      'No',
      'Nanay',
      'Bata',
      '1 Linggo',
      '1 Buwan',
      '2 Buwan',
      '3 Buwan',
      '4 Buwan',
      '5 Buwan',
      '6 Buwan',
      '7 Buwan',
      '8 Buwan',
      'Notes',
    ];
    const ifRows = allIfRecords.map((record, index) => [
      formatPurokCell(record.purok),
      String(index + 1).padStart(2, '0'),
      record.mother_name || '—',
      record.child_name || '—',
      record.feeding_1_week || '—',
      record.feeding_1_month || '—',
      record.feeding_2_month || '—',
      record.feeding_3_month || '—',
      record.feeding_4_month || '—',
      record.feeding_5_month || '—',
      record.feeding_6_month || '—',
      record.feeding_7_month || '—',
      record.feeding_8_month || '—',
      record.notes || '—',
    ]);

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="Infant Feeding"
          subtitle={recordsSubtitle(allIfRecords.length)}
          onBack={() => setActiveView('home')}
          showSearch
          searchQuery={searchQuery}
          performSearch={performSearch}
          searchResults={searchResults}
          showSearchSuggestions={showSearchSuggestions}
          setShowSearchSuggestions={setShowSearchSuggestions}
          setSelectedCategory={setSelectedCategory}
          setActiveView={setActiveView}
          purokFilter={purokFilter}
          setPurokFilter={setPurokFilter}
          excelRecords={allIfRecords}
          excelHeaders={ifHeader}
          excelRows={ifRows}
          excelFileName="nutrigrid-infant-feeding"
        />
        {renderSelectionBar(allIfRecords, ifHeader, ifRows, 'nutrigrid-infant-feeding')}
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1320px]">
                <div className="grid grid-cols-[repeat(16,minmax(5rem,1fr))] gap-1 px-3 py-3 bg-pink-50 border-b border-pink-200 text-[10px] font-semibold text-pink-900 uppercase tracking-wide text-center">
                  {selectionHeader(allIfRecords)}
                  {[...ifHeader, 'Actions'].map((label) => (
                    <span key={label} className="truncate">{label}</span>
                  ))}
                </div>
                {allIfRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">
                    {emptyRecordsMessage('No infant feeding records yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  allIfRecords.map((record, idx) => (
                    <div
                      key={record.id ?? idx}
                      className={`grid grid-cols-[repeat(16,minmax(5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center text-center ${selectedRecordIds.has(selectionKey(record, idx)) ? 'bg-violet-50' : ''}`}
                    >
                      {selectionCell(record, idx)}
                      <span>{formatPurokCell(record.purok)}</span>
                      <span>{String(idx + 1).padStart(2, '0')}</span>
                      {updatedName(record.mother_name, record)}
                      <span className="truncate">{record.child_name || '—'}</span>
                      <span>{record.feeding_1_week || '—'}</span>
                      <span>{record.feeding_1_month || '—'}</span>
                      <span>{record.feeding_2_month || '—'}</span>
                      <span>{record.feeding_3_month || '—'}</span>
                      <span>{record.feeding_4_month || '—'}</span>
                      <span>{record.feeding_5_month || '—'}</span>
                      <span>{record.feeding_6_month || '—'}</span>
                      <span>{record.feeding_7_month || '—'}</span>
                      <span>{record.feeding_8_month || '—'}</span>
                      <ExpandableNote value={record.notes} />
                      <RecordActions record={record} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {allIfRecords.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-3 px-2">
              Swipe sideways to view all feeding columns.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
      <PageHeader
        title={categoryMeta ? categoryMeta.name : 'Collected Records'}
        subtitle={recordsSubtitle(categoryRecords.length || sortedFilteredRecords.length)}
        onBack={() => setActiveView('home')}
        showSearch
        searchQuery={searchQuery}
        performSearch={performSearch}
        searchResults={searchResults}
        showSearchSuggestions={showSearchSuggestions}
        setShowSearchSuggestions={setShowSearchSuggestions}
        setSelectedCategory={setSelectedCategory}
        setActiveView={setActiveView}
        purokFilter={purokFilter}
        setPurokFilter={setPurokFilter}
      />

      {selectedCategory ? (
        <div className="px-4 pt-4 space-y-3">
          {categoryRecords.length === 0 ? (
            <div className="text-center py-12">
              <List size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-lg">
                {searchQuery.trim() ? 'No records match your search' : 'No records yet'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {searchQuery.trim() ? 'Try a different name or purok' : 'Tap New Visit on the home screen'}
              </p>
            </div>
          ) : (
            categoryRecords.map((record, idx) => (
              <div key={record.id ?? idx} className="bg-white rounded-xl p-4 border border-gray-200 text-sm text-center">
                <p className="font-bold text-gray-900">
                  {pwDisplayName(record) !== '—' ? pwDisplayName(record) : record.household_head || record.mother_name || record.child_name || `Record ${idx + 1}`}
                </p>
                <p className="text-xs text-gray-500 mt-1">{record.purok || '—'}</p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <p className="text-xs text-gray-500">{formatLastVisit(record)}</p>
                  <RecordActions record={record} />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
      <div className="flex gap-2 px-4 py-3">
        {['all', 'pending', 'synced'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2.5 px-3 rounded-full font-semibold text-xs transition ${
              filter === f
                ? 'text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
            style={filter === f ? { backgroundColor: MOBILE.navy } : {}}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Synced'}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {sortedFilteredRecords.length === 0 ? (
          <div className="text-center py-12">
            <List size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-lg">No records yet</p>
            <p className="text-gray-400 text-sm mt-1">Start by creating a new visit</p>
          </div>
        ) : (
          sortedFilteredRecords.map((visit) => (
            <div 
              key={visit.id} 
              className={`p-4 rounded-lg border-2 ${
                visit.synced 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-amber-50 border-amber-300'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">{visit.household_head}</h3>
                  <p className="text-sm text-gray-600">{visit.address}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RecordSyncStatus record={visit} className="px-3 py-1 text-xs" />
                </div>
              </div>

              <div className="text-xs text-gray-600 space-y-1 mb-3">
                <p>👥 {visit.total_members} family members</p>
                <p>📅 {new Date(visit.visit_date).toLocaleDateString('en-PH')}</p>
                <p>🕐 {new Date(visit.created_at).toLocaleTimeString('en-PH')}</p>
              </div>

              {/* Sanitation Status */}
              <div className="flex gap-2 text-xs mb-3">
                {visit.has_sanitary_toilet && (
                  <span className="bg-blue-200 text-blue-800 px-2 py-1 rounded">🚽 Toilet</span>
                )}
                {visit.has_compost_pit && (
                  <span className="bg-green-200 text-green-800 px-2 py-1 rounded">♻️ Compost</span>
                )}
                {visit.garbage_disposal && (
                  <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">🗑️ Garbage</span>
                )}
              </div>

              <button
                onClick={() => handleDeleteRecord(visit.id)}
                className="w-full py-2 bg-red-100 text-red-700 rounded font-semibold text-sm hover:bg-red-200"
              >
                Delete Record
              </button>
            </div>
          ))
        )}
      </div>
        </>
      )}
    </div>
  );
};

// ====================================================================
// HOME SCREEN
// ====================================================================


const HomeScreen = ({
  pendingVisits,
  searchQuery,
  DASHBOARD_CATEGORIES,
  recordsRefresh,
  selectedCategory,
  setSelectedCategory,
  showNotifications,
  setShowNotifications,
  showMenu,
  setShowMenu,
  userName,
  NUTRI_GRID_THEME,
  MOBILE,
  setActiveView,
  handleCategoryFormSubmit,
  closeCategoryForm,
  currentLocation,
  editingRecord,
  showCategoryForm,
  setShowCategoryForm,
  setCurrentFormType,
  searchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  performSearch,
  isOnline,
  setEditingRecord,
  currentUserId,
  assignedPurok,
  onOpenAssignedTask,
  onClearSyncNotification,
}) => {
  const [readNotificationIds, setReadNotificationIds] = useState(getReadNotificationIds);
  const userCategoryRecords = DASHBOARD_CATEGORIES.map((category) => ({
    ...category,
    records: getUserRecords(storageKeyForCategory(category.id), currentUserId),
  }));
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [pushPermission, setPushPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [pushMessage, setPushMessage] = useState('');
  const [pushRegistered, setPushRegistered] = useState(false);
  const [registeringPush, setRegisteringPush] = useState(false);
  const pushRegistrationAttemptedUserId = useRef(null);
  const pendingSyncNotifications = userCategoryRecords.flatMap((category) =>
    category.records
      .filter((record) => !record.synced && String(record.status || '').toLowerCase() !== 'synced')
      .map((record) => ({
        id: `sync:${category.id}:${record.id}`,
        categoryId: category.id,
        label: category.name,
      }))
  );
  const pendingVisitNotifications = pendingVisits
    .filter(
      (record) =>
        isOwnedByUser(record, currentUserId) &&
        !record.synced &&
        String(record.status || '').toLowerCase() !== 'synced'
    )
    .map((record) => ({ id: `visit:${record.id}`, label: 'Pending field visit' }));
  const unreadSyncNotifications = [
    ...pendingSyncNotifications,
    ...pendingVisitNotifications,
  ].filter((item) => !readNotificationIds.has(item.id));
  const unreadAssignedTasks = assignedTasks.filter(
    (task) => !readNotificationIds.has(`task:${task.task_id}`)
  );
  const notificationCount = unreadSyncNotifications.length + unreadAssignedTasks.length;
  const markNotificationsRead = (ids) => {
    const next = new Set(readNotificationIds);
    ids.forEach((id) => next.add(id));
    setReadNotificationIds(next);
    try {
      localStorage.setItem(PWA_READ_NOTIFICATIONS_KEY, JSON.stringify(Array.from(next)));
    } catch (error) {
      console.error('Could not save PWA notification state:', error);
    }
  };
  const q = searchQuery.trim().toLowerCase();
  const [sharedPurokMonth, setSharedPurokMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [initialSharedPurokCache] = useState(() => readSharedPurokCache(sharedPurokMonth));
  const [initialLocalPurokCounts] = useState(() =>
    getLocalSharedPurokCounts(sharedPurokMonth)
  );
  const initialPurokCounts = initialSharedPurokCache?.counts || initialLocalPurokCounts;
  const [sharedHouseholdsByPurok, setSharedHouseholdsByPurok] = useState(
    () => initialPurokCounts
  );
  const [sharedPurokStatus, setSharedPurokStatus] = useState(
    () => initialSharedPurokCache || initialLocalPurokCounts.length ? 'loaded' : 'loading'
  );
  const [showSharedPurokPicker, setShowSharedPurokPicker] = useState(false);
  const sharedPurokPickerRef = useRef(null);

  useEffect(() => {
    if (!showSharedPurokPicker) return undefined;
    const handlePointerDown = (event) => {
      if (!sharedPurokPickerRef.current?.contains(event.target)) {
        setShowSharedPurokPicker(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowSharedPurokPicker(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSharedPurokPicker]);

  useEffect(() => {
    if (!currentUserId) {
      setAssignedTasks([]);
      return undefined;
    }

    let active = true;
    const refreshAssignedTasks = async () => {
      const localTasks = deduplicateTasks(getLocalTasks()).filter(
        (task) =>
          task.assigned_to_user_id === currentUserId &&
          task.status !== 'Completed' &&
          !isTaskOverdue(task)
      );
      if (active) setAssignedTasks(localTasks);

      if (!navigator.onLine) return;
      try {
        const freshTasks = await loadTasks({ assignedToUserId: currentUserId });
        if (active) {
          setAssignedTasks(freshTasks.filter((task) => task.status !== 'Completed'));
        }
      } catch (error) {
        console.error('Could not refresh assigned-task notifications:', error);
      }
    };

    void refreshAssignedTasks();
    const channel = supabase
      .channel(`pwa-task-notifications-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        () => void refreshAssignedTasks()
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Could not subscribe to live task updates:', error || status);
        }
      });
    const interval = window.setInterval(refreshAssignedTasks, 60000);
    const handleOnline = () => void refreshAssignedTasks();
    const handleTaskChange = () => void refreshAssignedTasks();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshAssignedTasks();
        if (typeof Notification !== 'undefined') setPushPermission(Notification.permission);
      }
    };
    const handleStorage = (event) => {
      if (event.key === 'nutrigrid_tasks' || event.key === 'nutrigrid_pending_task_changes') {
        handleTaskChange();
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('bns-tasks-changed', handleTaskChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('bns-tasks-changed', handleTaskChange);
      window.removeEventListener('storage', handleStorage);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (
      !currentUserId ||
      pushPermission !== 'granted' ||
      pushRegistrationAttemptedUserId.current === currentUserId
    ) return undefined;

    let active = true;
    registerPushToken({ requestPermission: false })
      .then((result) => {
        if (active) {
          pushRegistrationAttemptedUserId.current = currentUserId;
          setPushRegistered(result.ok);
          if (!result.ok) setPushMessage('Push alerts are not available on this device.');
        }
      })
      .catch((error) => {
        console.error('Could not register this device for task push notifications:', error);
        if (active) setPushMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [currentUserId, pushPermission]);

  const enableTaskPushAlerts = async () => {
    setRegisteringPush(true);
    setPushMessage('');
    try {
      const result = await registerPushToken();
      setPushPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      setPushRegistered(result.ok);
      if (!result.ok) {
        setPushMessage(
          result.reason === 'denied'
            ? 'Notifications are blocked. Allow them for NutriGrid in your browser settings.'
            : result.reason === 'not-signed-in'
              ? 'Sign in again to enable task alerts on this device.'
              : 'Push alerts are not supported by this browser or device.'
        );
      } else {
        pushRegistrationAttemptedUserId.current = currentUserId;
        setPushMessage('Task alerts are enabled on this device.');
      }
    } catch (error) {
      console.error('Could not enable task push notifications:', error);
      setPushMessage(error.message);
    } finally {
      setRegisteringPush(false);
    }
  };

  useEffect(() => {
    let active = true;
    let loading = false;
    const cachedEntry = readSharedPurokCache(sharedPurokMonth);
    const localCounts = getLocalSharedPurokCounts(sharedPurokMonth);
    const fallbackCounts = cachedEntry?.counts || localCounts;
    if (cachedEntry || localCounts.length) {
      setSharedHouseholdsByPurok(fallbackCounts);
      setSharedPurokStatus('loaded');
    } else {
      setSharedHouseholdsByPurok([]);
      setSharedPurokStatus('loading');
    }

    const loadSharedPurokCounts = async ({ force = false } = {}) => {
      const currentCache = readSharedPurokCache(sharedPurokMonth);
      if (
        !force &&
        currentCache &&
        Date.now() >= currentCache.fetchedAt &&
        Date.now() - currentCache.fetchedAt < SHARED_PUROK_CACHE_TTL_MS
      ) {
        if (active) {
          setSharedHouseholdsByPurok(currentCache.counts);
          setSharedPurokStatus('loaded');
        }
        return;
      }
      if (loading) return;
      if (!navigator.onLine) {
        if (active && !fallbackCounts.length) setSharedPurokStatus('offline');
        return;
      }

      loading = true;
      try {
        const counts = await getSharedHouseholdCountsByPurokForMonth(sharedPurokMonth);
        if (active) {
          setSharedHouseholdsByPurok(counts);
          setSharedPurokStatus('loaded');
          saveSharedPurokCache(sharedPurokMonth, counts);
        }
      } catch (error) {
        console.error('Could not load shared Purok totals from Supabase:', error);
        if (active && !fallbackCounts.length) setSharedPurokStatus('error');
      } finally {
        loading = false;
      }
    };

    const refreshFromLocalRecords = (event) => {
      if (event?.detail?.key && event.detail.key !== STORAGE_KEYS.residents) return;
      if ('key' in (event || {}) && event.key !== STORAGE_KEYS.residents) return;
      void loadSharedPurokCounts({ force: true });
    };
    let realtimeRefreshTimeout;
    const handleRealtimeChange = () => {
      window.clearTimeout(realtimeRefreshTimeout);
      realtimeRefreshTimeout = window.setTimeout(
        () => void loadSharedPurokCounts({ force: true }),
        300
      );
    };

    void loadSharedPurokCounts();
    window.addEventListener('online', loadSharedPurokCounts);
    window.addEventListener('focus', loadSharedPurokCounts);
    window.addEventListener('bns-records-changed', refreshFromLocalRecords);
    window.addEventListener('storage', refreshFromLocalRecords);
    const handleVisibilityChange = () => {
      if (!document.hidden) void loadSharedPurokCounts();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const channel = supabase
      .channel('pwa-shared-purok-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'residents' }, handleRealtimeChange)
      .subscribe();

    return () => {
      active = false;
      window.removeEventListener('online', loadSharedPurokCounts);
      window.removeEventListener('focus', loadSharedPurokCounts);
      window.removeEventListener('bns-records-changed', refreshFromLocalRecords);
      window.removeEventListener('storage', refreshFromLocalRecords);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(realtimeRefreshTimeout);
      void supabase.removeChannel(channel);
    };
  }, [sharedPurokMonth]);

  const categoriesWithCounts = userCategoryRecords.map((cat) => ({
    ...cat,
    count: cat.records.length,
  }));
  const totalCategoryRecordCount = categoriesWithCounts.reduce(
    (total, category) => total + category.count,
    0
  );

  const residentRecords = getUserRecords(STORAGE_KEYS.residents, currentUserId);
  const pregnantWomenRecords = getUserRecords(STORAGE_KEYS.pregnantwoman, currentUserId);
  const infantFeedingRecords = getUserRecords(STORAGE_KEYS.infantfeeding, currentUserId);
  const pregnantWomenCount = pregnantWomenRecords.length;
  const childrenCount = infantFeedingRecords.length;
  const totalCategoryRecords = userCategoryRecords.flatMap(({ records }) => records);
  const overviewTrends = {
    households: calculateMonthlyTrend(residentRecords),
    pregnant: calculateMonthlyTrend(pregnantWomenRecords),
    children: calculateMonthlyTrend(infantFeedingRecords),
    records: calculateMonthlyTrend(totalCategoryRecords),
  };
  const syncedHouseholds = residentRecords.filter(
    (record) => record.synced || String(record.status || '').toLowerCase() === 'synced'
  ).length;
  const pendingHouseholds = residentRecords.length - syncedHouseholds;
  const syncedPercent = residentRecords.length
    ? Math.round((syncedHouseholds / residentRecords.length) * 100)
    : 0;
  const maxPurokCount = Math.max(1, ...sharedHouseholdsByPurok.map(({ count }) => count));
  const [sharedPurokYear, sharedPurokMonthNumber] = sharedPurokMonth.split('-').map(Number);
  const selectedCategoryIcon = {
    residents: Users,
    environmental: MapPin,
    infantfeeding: Baby,
    lactatingwoman: UserCircle,
    pregnantwoman: Heart,
    monthlynatal: Calendar,
  }[selectedCategory] || UserCircle;

  const filteredCategories = categoriesWithCounts.filter((cat) => {
    if (!q) return true;
    if (cat.name.toLowerCase().includes(q)) return true;
    return cat.records.some((r) => recordMatchesSearch(r, q));
  });

  const selectedCategoryData = categoriesWithCounts.find((c) => c.id === selectedCategory);
  const selectedCategoryPanelRef = useRef(null);
  useEffect(() => {
    if (!selectedCategory) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      selectedCategoryPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [selectedCategory]);
  const selectedCategoryRecords = selectedCategory
    ? getUserRecords(storageKeyForCategory(selectedCategory), currentUserId)
    : [];
  const liveCount = selectedCategoryRecords.length;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const categoryRecordsThisMonth = selectedCategoryRecords.filter(
    (record) => getLocalRecordMonth(record) === currentMonth
  ).length;
  const syncedCategoryRecords = selectedCategoryRecords.filter(
    (record) => record.synced || String(record.status || '').toLowerCase() === 'synced'
  ).length;
  const pendingCategoryRecords = liveCount - syncedCategoryRecords;
  const completedPercent = liveCount
    ? Math.round((syncedCategoryRecords / liveCount) * 100)
    : 0;

  const StatRow = ({ label, value, fillWidth, background, track, fill, textColor }) => (
    <div className="rounded-[20px] p-4" style={{ backgroundColor: background }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: textColor }}>{label}</span>
        <span className="text-lg font-bold" style={{ color: textColor }}>{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: track }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: fillWidth, backgroundColor: fill }} />
      </div>
    </div>
  );

  return (
    <div className="pb-8 min-h-screen" style={{ background: NUTRI_GRID_THEME.pageGradient }}>
      <div
        className="px-5 pt-5 pb-8 rounded-b-[2rem] shadow-lg relative"
        style={fieldHeaderStyle}
      >
        <div className="flex items-center justify-between mb-5">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-2.5 rounded-full bg-white/50 hover:bg-white/70 transition"
            style={{ color: NUTRI_GRID_THEME.text }}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 relative">
            {!isOnline && <WifiOff size={16} className="text-amber-600" />}
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="p-2.5 rounded-full bg-white/50 hover:bg-white/70 transition relative"
              style={{ color: NUTRI_GRID_THEME.text }}
            >
              <Bell size={20} />
              {notificationCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center"
                  style={{ backgroundColor: MOBILE.coral }}
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="fixed inset-0 z-40 cursor-default bg-transparent"
                  aria-label="Close notifications"
                />
                <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-gray-100 bg-white text-gray-800 shadow-xl">
                <div className="px-4 py-3 border-b font-semibold text-sm" style={{ color: MOBILE.navy }}>
                  Notifications
                </div>
                <div className="max-h-56 overflow-y-auto p-3 space-y-2 text-xs">
                  {notificationCount === 0 ? (
                    <p className="text-gray-500 py-2">No new notifications.</p>
                  ) : (
                    <>
                      {categoriesWithCounts.map((category) => {
                        const unreadRecords = unreadSyncNotifications.filter(
                          (item) => item.categoryId === category.id
                        );
                        if (!unreadRecords.length) return null;
                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => {
                              markNotificationsRead(unreadRecords.map((item) => item.id));
                              onClearSyncNotification?.();
                              setSelectedCategory(category.id);
                              setShowNotifications(false);
                            }}
                            className="w-full rounded-lg p-2 text-left hover:bg-blue-50"
                          >
                            <span className="font-semibold">{category.name}</span>
                            <span className="ml-1 text-amber-600">— {unreadRecords.length} pending sync</span>
                          </button>
                        );
                      })}
                      {pendingVisitNotifications.some((item) => !readNotificationIds.has(item.id)) && (
                        <button
                          type="button"
                          onClick={() => {
                            const unreadVisits = pendingVisitNotifications.filter(
                              (item) => !readNotificationIds.has(item.id)
                            );
                            markNotificationsRead(unreadVisits.map((item) => item.id));
                            onClearSyncNotification?.();
                            setSelectedCategory('residents');
                            setShowNotifications(false);
                          }}
                          className="w-full rounded-lg p-2 text-left text-amber-700 hover:bg-amber-50"
                        >
                          {pendingVisitNotifications.filter((item) => !readNotificationIds.has(item.id)).length} field visit(s) pending sync
                        </button>
                      )}
                      {unreadAssignedTasks.length > 0 && (
                        <div className="border-t border-gray-100 pt-2">
                          <p className="px-2 pb-1 font-semibold text-violet-700">Assigned tasks</p>
                          {unreadAssignedTasks.map((task) => (
                            <button
                              key={task.task_id}
                              type="button"
                              onClick={() => {
                                markNotificationsRead([`task:${task.task_id}`]);
                                setShowNotifications(false);
                                onOpenAssignedTask(task);
                              }}
                              className="w-full rounded-lg p-2 text-left hover:bg-blue-50"
                            >
                              <span className="block truncate font-semibold">{task.title}</span>
                              <span className="text-gray-500">
                                {task.due_date ? `Due ${task.due_date}` : task.status || 'Pending'}
                                {task.purok ? ` · ${task.purok}` : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {pushPermission !== 'unsupported' && (
                  <div className="border-t border-gray-100 p-3">
                    {pushPermission === 'granted' ? (
                      <div>
                        <p role="status" className={`text-xs font-medium ${pushRegistered ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {pushRegistered
                            ? pushMessage || 'Task alerts are enabled on this device.'
                            : pushMessage || 'Task alerts are not registered on this device yet.'}
                        </p>
                        {!pushRegistered && (
                          <button
                            type="button"
                            onClick={() => void enableTaskPushAlerts()}
                            disabled={registeringPush}
                            className="mt-2 w-full rounded-lg bg-violet-50 p-2 text-left font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                          >
                            {registeringPush ? 'Setting up task alerts…' : 'Set up task alerts'}
                          </button>
                        )}
                      </div>
                    ) : pushPermission === 'denied' ? (
                      <p className="text-xs text-amber-700">
                        Notifications are blocked. Allow them for NutriGrid in your browser settings.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void enableTaskPushAlerts()}
                        disabled={registeringPush}
                        className="w-full rounded-lg bg-violet-50 p-2 text-left font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                      >
                        {registeringPush ? 'Enabling task alerts…' : 'Enable task alerts on this device'}
                      </button>
                    )}
                    {pushMessage && pushPermission === 'default' && (
                      <p role="status" className="mt-1 text-xs text-rose-600">{pushMessage}</p>
                    )}
                  </div>
                )}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setShowNotifications(false);
                setActiveView('profile');
              }}
              className="p-2.5 rounded-full bg-white/50 hover:bg-white/70 transition"
              style={{ color: NUTRI_GRID_THEME.text }}
              aria-label="Open profile"
              title="Profile"
            >
              <UserCircle size={20} />
            </button>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-4" style={{ color: NUTRI_GRID_THEME.text }}>
          Welcome, {userName.split(' ')[0]}
        </h1>

        <FieldSearchInput
            searchQuery={searchQuery}
            performSearch={performSearch}
            searchResults={searchResults}
            showSearchSuggestions={showSearchSuggestions}
            setShowSearchSuggestions={setShowSearchSuggestions}
            setSelectedCategory={setSelectedCategory}
            setActiveView={setActiveView}
          />
      </div>

      <div className="px-4 pt-5 space-y-4">
        <section aria-labelledby="pwa-overview-heading" className="space-y-2.5">
          <h2 id="pwa-overview-heading" className="px-0.5 text-base font-bold" style={{ color: NUTRI_GRID_THEME.text }}>
            Overview
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total Households', value: residentRecords.length, icon: Users, color: '#7048E8', background: '#F1EDFF', trend: overviewTrends.households },
              { label: 'Pregnant Women', value: pregnantWomenCount, icon: Heart, color: '#D94E9F', background: '#FFF0F7', trend: overviewTrends.pregnant },
              { label: 'Children (0-5)', value: childrenCount, icon: Baby, color: '#35AFC1', background: '#E9FAFC', trend: overviewTrends.children },
              { label: 'Total Records', value: totalCategoryRecordCount, icon: UserCircle, color: '#E99A45', background: '#FFF5E9', trend: overviewTrends.records },
            ].map(({ label, value, subtitle, icon: Icon, color, background, trend }) => (
              <div
                key={label}
                className="relative flex min-h-[112px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-black/5 px-2 pb-5 pt-2 shadow-sm"
                style={{ background: `linear-gradient(135deg, #FFFFFF 0%, ${background} 100%)` }}
              >
                <span
                  className="absolute -bottom-5 -right-2 h-10 w-14 rotate-[-18deg] rounded-full opacity-20"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span
                  className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white shadow-sm"
                  style={{ background: `linear-gradient(145deg, ${color} 0%, ${color}CC 100%)` }}
                >
                  <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="relative z-10 flex min-h-6 w-full min-w-0 items-center justify-center text-center text-[10px] font-semibold uppercase leading-tight text-gray-700">
                  {label}
                </span>
                <span className="relative z-10 block w-full text-center text-xl font-bold leading-none text-gray-900">{value}</span>
                {subtitle && (
                  <span className="relative z-10 block text-center text-[9px] leading-tight text-gray-500">{subtitle}</span>
                )}
                <span title={trend.description} aria-label={trend.description} className={`absolute bottom-1 right-2 z-10 inline-flex items-center gap-0.5 text-[8px] font-bold ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {trend.isPositive
                    ? <TrendingUp size={10} strokeWidth={2.5} aria-hidden="true" />
                    : <TrendingDown size={10} strokeWidth={2.5} aria-hidden="true" />}
                  {trend.label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <section className="min-w-0 rounded-xl border border-[#E8DCEF] bg-white p-2.5 shadow-sm" aria-labelledby="household-status-heading">
              <h3 id="household-status-heading" className="mb-2 truncate text-[11px] font-bold text-gray-800">Household Status</h3>
              <div className="flex items-center justify-center gap-2">
                <div
                  className="relative h-[76px] w-[76px] shrink-0 rounded-full"
                  role="img"
                  aria-label={`${syncedHouseholds} synced and ${pendingHouseholds} pending households`}
                  style={{
                    background: `conic-gradient(#8F65FF 0% ${syncedPercent}%, #FF75C3 ${syncedPercent}% 100%)`,
                  }}
                >
                  <div className="absolute inset-[11px] grid place-content-center rounded-full bg-white text-center">
                    <span className="text-base font-bold leading-none text-gray-900">{residentRecords.length}</span>
                    <span className="mt-0.5 text-[8px] leading-none text-gray-500">Households</span>
                  </div>
                </div>
                <div className="min-w-0 space-y-2 text-[9px] leading-tight">
                  <div>
                    <p className="flex items-center gap-1 font-medium text-gray-500"><span className="h-2 w-2 shrink-0 rounded-full bg-[#8F65FF]" />Synced</p>
                    <p className="pl-3 text-xs font-bold text-gray-800">{syncedHouseholds} <span className="font-medium text-gray-500">({syncedPercent}%)</span></p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 font-medium text-gray-500"><span className="h-2 w-2 shrink-0 rounded-full bg-[#FF75C3]" />Pending</p>
                    <p className="pl-3 text-xs font-bold text-gray-800">{pendingHouseholds} <span className="font-medium text-gray-500">({residentRecords.length ? 100 - syncedPercent : 0}%)</span></p>
                  </div>
                </div>
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-[#E8DCEF] bg-white p-2.5 shadow-sm" aria-labelledby="purok-households-heading">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-1">
                <h3 id="purok-households-heading" className="min-w-0 flex-1 text-[9px] font-bold leading-tight text-gray-800">Top 10 Puroks</h3>
                <div className="relative shrink-0" ref={sharedPurokPickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowSharedPurokPicker((open) => !open)}
                    className="inline-flex min-h-7 max-w-[76px] items-center justify-between gap-0.5 rounded-lg border border-[#E8DCEF] bg-white px-1 py-1 text-[8px] font-semibold text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                    aria-label="Filter Top 10 Puroks by month and year"
                    aria-haspopup="dialog"
                    aria-expanded={showSharedPurokPicker}
                  >
                    <span className="truncate">
                      {new Date(sharedPurokYear, sharedPurokMonthNumber - 1, 1)
                        .toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                    </span>
                    <ChevronDown size={10} className="shrink-0" aria-hidden="true" />
                  </button>
                  {showSharedPurokPicker && (
                    <div
                      className="absolute right-0 z-[100] mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
                      role="dialog"
                      aria-label="Filter Top 10 Puroks by month and year"
                    >
                      <label className="relative mb-2 block">
                        <span className="sr-only">Choose year</span>
                        <select
                          value={sharedPurokYear}
                          onChange={(event) => {
                            const year = Number(event.target.value);
                            const month = Math.min(
                              sharedPurokMonthNumber,
                              year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12
                            );
                            setSharedPurokMonth(`${year}-${String(month).padStart(2, '0')}`);
                          }}
                          className="w-full appearance-none rounded-md border border-gray-200 bg-gray-100 py-2 pl-3 pr-9 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                        >
                          {Array.from({ length: new Date().getFullYear() - 1999 }, (_, index) => 2000 + index)
                            .reverse()
                            .map((year) => <option key={year} value={year}>{year}</option>)}
                        </select>
                        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600" aria-hidden="true" />
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {Array.from({ length: 12 }, (_, index) => {
                          const month = index + 1;
                          const monthKey = `${sharedPurokYear}-${String(month).padStart(2, '0')}`;
                          const isFutureMonth = monthKey > currentMonth;
                          return (
                            <button
                              key={monthKey}
                              type="button"
                              disabled={isFutureMonth}
                              onClick={() => {
                                setSharedPurokMonth(monthKey);
                                setShowSharedPurokPicker(false);
                              }}
                              className={`rounded-lg px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-35 ${
                                monthKey === sharedPurokMonth
                                  ? 'bg-[#8F65FF] text-white'
                                  : 'text-gray-700 hover:bg-violet-50'
                              }`}
                            >
                              {new Date(sharedPurokYear, index, 1).toLocaleDateString('en', { month: 'short' })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {sharedHouseholdsByPurok.length ? (
                <div className="space-y-[5px]">
                  {sharedHouseholdsByPurok.map(({ purok, count }) => (
                    <div key={purok} className="flex min-w-0 items-center gap-1">
                      <span className="w-[43px] shrink-0 truncate text-[8px] leading-none text-gray-500">{purok}</span>
                      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F1ECF7]">
                        <span
                          className="block h-full rounded-full bg-[#8F65FF]"
                          style={{ width: `${Math.max(5, (count / maxPurokCount) * 100)}%` }}
                        />
                      </span>
                      <span className="w-3 shrink-0 text-right text-[8px] font-semibold leading-none text-gray-600">{count}</span>
                    </div>
                  ))}
                </div>
              ) : sharedPurokStatus === 'loading' ? (
                <p className="py-5 text-center text-[9px] leading-tight text-gray-500">Loading Purok data…</p>
              ) : sharedPurokStatus === 'error' ? (
                <p className="py-5 text-center text-[9px] leading-tight text-red-600">Shared data unavailable for this month.</p>
              ) : sharedPurokStatus === 'offline' ? (
                <p className="py-5 text-center text-[9px] leading-tight text-gray-500">Connect to the internet to load shared Purok data.</p>
              ) : (
                <p className="py-5 text-center text-[9px] leading-tight text-gray-500">No household records for this month.</p>
              )}
            </section>
          </div>
        </section>

        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-base font-bold" style={{ color: NUTRI_GRID_THEME.text }}>
            Categories
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {filteredCategories.length === 0 && q ? (
            <p className="col-span-3 text-center text-sm text-gray-500 py-6">
              No categories or records match “{searchQuery.trim()}”.
            </p>
          ) : null}
          {filteredCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory((current) => (current === cat.id ? null : cat.id))}
                className={`rounded-2xl p-3 flex flex-col items-center text-center min-h-[108px] shadow-sm active:scale-[0.97] transition ring-2 ${
                  isSelected ? 'ring-offset-2' : 'ring-transparent'
                }`}
                style={{
                  backgroundColor: cat.bgColor,
                  ...(isSelected ? { '--tw-ring-color': cat.accentColor } : {}),
                }}
              >
                <span className="text-3xl mb-1.5 leading-none">{cat.emoji}</span>
                <span className="text-[10px] font-semibold text-gray-800 leading-tight line-clamp-2">{cat.name}</span>
                <span className="text-xs font-bold text-gray-600 mt-1">{cat.count}</span>
              </button>
            );
          })}
        </div>

        {selectedCategoryData && (
          <div ref={selectedCategoryPanelRef} className="space-y-3 pt-1">
            <div
              className={`relative flex min-h-[210px] flex-col items-center justify-center overflow-hidden rounded-[28px] px-5 py-6 text-center text-white shadow-md ${selectedCategory === 'residents' ? '' : `bg-gradient-to-br ${selectedCategoryData.gradient}`}`}
              style={{
                background: selectedCategory === 'residents'
                  ? 'linear-gradient(135deg, #3D66B8 0%, #5B86DC 100%)'
                  : undefined,
              }}
            >
              <div className="absolute -top-7 -right-6 h-24 w-24 rounded-full bg-white/10" aria-hidden="true" />
              <div className="absolute -bottom-10 -left-5 h-28 w-28 rounded-full bg-black/5" aria-hidden="true" />
              <div className="relative z-10 mb-2 grid h-11 w-11 place-items-center text-white">
                {React.createElement(selectedCategoryIcon, { size: 34, strokeWidth: 2.2, 'aria-hidden': true })}
              </div>
              <h3 className="relative z-10 max-w-full text-xl font-semibold leading-tight">{selectedCategoryData.name}</h3>
              <p className="relative z-10 mt-3 text-6xl font-bold leading-none">{liveCount}</p>
              <p className="relative z-10 mt-2 text-base text-white/90">Total Records</p>
            </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRecord(null);
                    setShowCategoryForm(true);
                  }}
                  className={`flex min-h-14 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.98] ${selectedCategoryData.gradient ? `bg-gradient-to-r ${selectedCategoryData.gradient}` : ''}`}
                  style={!selectedCategoryData.gradient ? { backgroundColor: selectedCategoryData.accentColor } : undefined}
                >
                  <Plus size={20} />
                  New Visit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('records')}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-full border-2 bg-white px-4 py-3 text-sm font-bold shadow-sm transition active:scale-[0.98]"
                  style={{
                    borderColor: selectedCategoryData.accentColor,
                    color: selectedCategoryData.accentColor,
                  }}
                >
                  <FileText size={20} />
                  Records
                </button>
              </div>

            <StatRow
              label="This Month"
              value={`+${categoryRecordsThisMonth}`}
              fillWidth={`${liveCount ? (categoryRecordsThisMonth / liveCount) * 100 : 0}%`}
              background="#FFF0F7"
              track="#F5B6DA"
              fill="#D94E9F"
              textColor="#9D174D"
            />
            <StatRow
              label="Completed"
              value={`${completedPercent}%`}
              fillWidth={`${completedPercent}%`}
              background="#ECFDF5"
              track="#A7F3D0"
              fill="#059669"
              textColor="#065F46"
            />
            <StatRow
              label="Pending"
              value={String(pendingCategoryRecords)}
              fillWidth={`${liveCount ? (pendingCategoryRecords / liveCount) * 100 : 0}%`}
              background="#FFFBEB"
              track="#FDE68A"
              fill="#F59E0B"
              textColor="#92400E"
            />

          </div>
        )}

        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-start gap-3">
            <WifiOff size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Currently Offline</p>
              <p className="text-xs mt-1">Save locally. Changes sync automatically when you&apos;re back online.</p>
            </div>
          </div>
        )}

      </div>

      {showCategoryForm && selectedCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div
              className={`sticky top-0 bg-gradient-to-r ${selectedCategoryData?.gradient} px-5 py-4 flex items-center justify-between rounded-t-3xl text-white sm:rounded-t-2xl`}
            >
              <h2 className="text-lg font-bold pr-2">
                {selectedCategoryData?.name} — {editingRecord ? 'Edit Record' : 'New Visit'}
              </h2>
              <button
                type="button"
                onClick={closeCategoryForm}
                className="p-2 rounded-full hover:bg-white/15"
              >
                <X size={22} />
              </button>
            </div>
            <div className="bg-white p-5 sm:p-6 pb-8 overflow-y-auto">
              {selectedCategory === 'environmental' && (
                <EnvironmentalSanitationForm
                  key={`environmental-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  initialData={editingRecord}
                  currentLocation={currentLocation}
                  userName={userName}
                  assignedPurok={assignedPurok}
                />
              )}
              {selectedCategory === 'residents' && (
                <ResidentsForm
                  key={`residents-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  currentLocation={currentLocation}
                  userName={userName}
                  initialData={editingRecord}
                  assignedPurok={assignedPurok}
                />
              )}
              {selectedCategory === 'infantfeeding' && (
                <InfantFeedingForm
                  key={`infantfeeding-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  currentLocation={currentLocation}
                  userName={userName}
                  initialData={editingRecord}
                  assignedPurok={assignedPurok}
                />
              )}
              {selectedCategory === 'lactatingwoman' && (
                <LactatingWomanForm
                  key={`lactatingwoman-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  currentLocation={currentLocation}
                  userName={userName}
                  initialData={editingRecord}
                  assignedPurok={assignedPurok}
                />
              )}
              {selectedCategory === 'pregnantwoman' && (
                <PregnantWomanForm
                  key={`pregnantwoman-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  currentLocation={currentLocation}
                  userName={userName}
                  initialData={editingRecord}
                  assignedPurok={assignedPurok}
                />
              )}
              {selectedCategory === 'monthlynatal' && (
                <MonthlyNatalityForm
                  key={`monthlynatal-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  currentLocation={currentLocation}
                  userName={userName}
                  initialData={editingRecord}
                  assignedPurok={assignedPurok}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProfileScreen = ({ user, onSave, onCancel, onResetPassword, onLogout, onDeleteAccount }) => {
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [age, setAge] = useState(user?.age == null ? '' : String(user.age));
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const submitAccountDeletion = async (event) => {
    event.preventDefault();
    setDeleteError('');
    setIsDeletingAccount(true);
    try {
      const result = await onDeleteAccount(deletePassword);
      if (!result?.success) {
        setDeleteError(result?.error || 'Account deletion could not be completed. Please try again.');
        return;
      }
      setDeleteSuccess(result.message || 'Your deletion request was sent to Admin for review.');
      setShowDeleteDialog(false);
      setDeletePassword('');
    } catch (error) {
      console.error('Account deletion confirmation failed:', error);
      setDeleteError(error.message || 'Account deletion could not be completed. Please try again.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="flex items-center gap-3 border-t-4 border-pink-200 bg-white px-4 py-4 shadow-sm">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Back to dashboard"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Profile</h1>
      </header>

      <main className="space-y-4 px-4 pt-5">
        <form
          className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ fullName, age });
          }}
        >
          <h2 className="mb-4 text-base font-bold text-gray-900">Edit Profile</h2>
          <p className="mb-4 break-all text-sm text-gray-500">{user?.email}</p>
          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">Name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoComplete="name"
              required
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">Age</span>
            <input
              type="number"
              min="1"
              max="120"
              value={age}
              onChange={(event) => setAge(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              inputMode="numeric"
              required
            />
          </label>
          <button
            type="button"
            onClick={onResetPassword}
            className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center font-semibold uppercase text-blue-700 hover:bg-blue-100"
          >
            Reset Password
          </button>
          <div className="space-y-3 pt-1" aria-label="Profile actions">
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-4 font-bold text-white shadow-sm hover:from-blue-700 hover:to-blue-600"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-red-700">⚠️ Danger Zone</h2>
          <div className="space-y-3">
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-xl border-2 border-red-300 bg-white px-4 py-3 font-bold text-red-700 hover:bg-red-50"
            >
              Log Out
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError('');
                setDeleteSuccess('');
                setDeletePassword('');
                setShowDeleteDialog(true);
              }}
              className="w-full rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 font-bold text-red-800 hover:bg-red-100"
            >
              Request Account Deletion
            </button>
          </div>
          {deleteSuccess && (
            <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {deleteSuccess}
            </p>
          )}
        </section>
      </main>
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submitAccountDeletion}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-account-title" className="text-lg font-bold text-red-800">
                  Request account deletion?
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Your account will be deleted only after an Admin confirms the request. Your health records and activity history will remain in the Admin Dashboard and Supabase. Enter your password to confirm the request.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeletingAccount}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close delete account dialog"
              >
                <X size={20} />
              </button>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Password</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
            {deleteError && <p role="alert" className="text-sm font-medium text-red-700">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeletingAccount}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeletingAccount || !deletePassword}
                className="flex-1 rounded-xl bg-red-700 px-4 py-3 font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {isDeletingAccount ? 'Submitting…' : 'Request deletion'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};


const NutriGridMobile = () => {
  // Authentication States
  const [appState, setAppState] = useState('loading'); // loading, welcome, signin, app
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // App States (when authenticated)
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [pendingVisits, setPendingVisits] = useState([]);
  const [activeView, setActiveView] = useState('home');
  const [userName, setUserName] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [taskNavigationDate, setTaskNavigationDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [syncNotification, setSyncNotification] = useState('');
  const [syncNotificationIsError, setSyncNotificationIsError] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [sessionTimeoutMessage, setSessionTimeoutMessage] = useState('');
  const lastBackgroundSyncError = useRef('');
  const syncInFlight = useRef(false);
  const wasOffline = useRef(!navigator.onLine);
  const locationWatchId = useRef(null);

  const startLocationUpdates = (userId) => {
    if (!navigator.geolocation || locationWatchId.current !== null) return;
    const requestKey = `nutrigrid_location_requested:${userId}`;
    try {
      if (localStorage.getItem(requestKey)) return;
      localStorage.setItem(requestKey, 'true');
    } catch (error) {
      console.error('Could not save the location prompt preference:', error);
    }
    locationWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          if (locationWatchId.current !== null) {
            navigator.geolocation.clearWatch(locationWatchId.current);
          }
          locationWatchId.current = null;
          return;
        }
        console.warn('Location is temporarily unavailable:', error.message);
      },
      { maximumAge: 60000, timeout: 15000 }
    );
  };

  const requestConfirmation = (message, action, options = {}) => {
    setPendingConfirmation({ message, action, ...options });
  };

  const runConfirmedAction = async () => {
    if (!pendingConfirmation) return;
    setConfirmationBusy(true);
    try {
      await pendingConfirmation.action();
      setPendingConfirmation(null);
    } catch (error) {
      console.error('Confirmed action failed:', error);
      setPendingConfirmation(null);
      showSyncNotification(
        error.message || 'The action could not be completed. Please try again.',
        { isError: true }
      );
    } finally {
      setConfirmationBusy(false);
    }
  };

  const showSyncNotification = (message, { isError = false } = {}) => {
    setSyncNotification(message);
    setSyncNotificationIsError(isError);
  };

  useEffect(() => {
    if (!syncNotification) return undefined;
    const timeout = window.setTimeout(() => setSyncNotification(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [syncNotification]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !currentUser?.id ||
      (!showCategoryForm && activeView !== 'visit') ||
      !navigator.onLine
    ) {
      return undefined;
    }

    let active = true;
    const userId = currentUser.id;
    void supabase
      .from('profiles')
      .select('assigned_purok')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('The account profile was not returned.');
        if (active) {
          setCurrentUser((user) => (
            user?.id === userId
              ? { ...user, assignedPurok: data.assigned_purok || '' }
              : user
          ));
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error('Could not refresh the assigned Purok:', error);
        showSyncNotification(`Could not refresh your assigned Purok: ${error.message}`, { isError: true });
      });

    return () => {
      active = false;
    };
  }, [activeView, currentUser?.id, isAuthenticated, showCategoryForm]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !PWA_PERSISTED_VIEWS.has(activeView)) return;
    try {
      sessionStorage.setItem(
        getPwaViewStateKey(currentUser.id),
        JSON.stringify({
          activeView,
          selectedCategory: PWA_CATEGORY_IDS.has(selectedCategory) ? selectedCategory : null,
          showCategoryForm: activeView === 'home' && showCategoryForm,
          editingRecordId: activeView === 'home' && showCategoryForm && editingRecord?.id != null
            ? String(editingRecord.id)
            : null,
          previewRecord: activeView === 'records' ? previewRecord : null,
        })
      );
    } catch (error) {
      console.error('Could not save the current PWA view:', error);
    }
  }, [
    activeView,
    currentUser?.id,
    editingRecord?.id,
    isAuthenticated,
    previewRecord,
    selectedCategory,
    showCategoryForm,
  ]);

  useEffect(() => {
    if (activeView !== 'records' && previewRecord) setPreviewRecord(null);
    if (
      activeView === 'records' &&
      previewRecord &&
      previewRecord.categoryId !== selectedCategory
    ) setPreviewRecord(null);
  }, [activeView, previewRecord, selectedCategory]);

  // Initialize app
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const restoreUser = async (userData) => {
      const timeoutReason = restoreSessionTimeout(userData.id);
      if (timeoutReason) {
        try {
          await signOutSupabase(userData.id);
        } catch (error) {
          console.error('Could not fully sign out the expired session:', error);
        }
        setSessionTimeoutMessage(getSessionTimeoutMessage(timeoutReason));
        setAppState('signin');
        return;
      }
      completeSignIn(userData, { restoring: true });
    };

    const restoreAuthentication = async () => {
      try {
        if (!navigator.onLine) {
          const cachedUser = await restoreSupabaseSession(null, { allowCachedProfile: true });
          if (cachedUser) await restoreUser(cachedUser);
          else setAppState('welcome');
          return;
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error && navigator.onLine) throw new Error(`Could not restore sign-in session: ${error.message}`);
        if (error) console.warn('Restoring the saved sign-in session while offline:', error.message);
        const userData = session
          ? await restoreSupabaseSession(session)
          : await restoreSupabaseSession(null, { allowCachedProfile: true });
        if (userData) await restoreUser(userData);
        else setAppState('welcome');
      } catch (error) {
        console.error('Could not restore Supabase sign-in:', error);
        if (!navigator.onLine || /failed to fetch|network|fetch failed|load failed|connection|offline/i.test(error.message || '')) {
          try {
            const cachedUser = await restoreSupabaseSession(null, { allowCachedProfile: true });
            if (cachedUser) {
              await restoreUser(cachedUser);
              return;
            }
          } catch (offlineError) {
            console.error('Could not restore the cached offline profile:', offlineError);
          }
        }
        setAppState('welcome');
      }
    };
    void restoreAuthentication();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (locationWatchId.current !== null) {
        navigator.geolocation?.clearWatch(locationWatchId.current);
      }
    };
  }, []);

  // ====================================================================
  // HANDLERS
  // ====================================================================

  const handleWelcomeComplete = () => {
    setAppState('signin');
  };

  const completeSignIn = (userData, { restoring = false } = {}) => {
    try {
      if (!restoring) startSessionTimeout(userData.id);
      setSessionTimeoutMessage('');
    } catch (error) {
      console.error('Could not initialize sign-in timeout tracking:', error);
      throw new Error('Secure sign-in session could not be initialized. Please try again.');
    }
    const savedView = readPwaViewState(userData.id);
    const restoredEditingRecord = savedView.editingRecordId
      ? getUserRecords(
          storageKeyForCategory(savedView.selectedCategory),
          userData.id
        ).find((record) => String(record.id) === savedView.editingRecordId) || null
      : null;
    startLocationUpdates(userData.id);
    setCurrentUser(userData);
    setActiveView(savedView.activeView);
    setShowNotifications(false);
    setShowMenu(false);
    setShowCategoryForm(
      savedView.showCategoryForm &&
      (!savedView.editingRecordId || Boolean(restoredEditingRecord))
    );
    setEditingRecord(restoredEditingRecord);
    setPreviewRecord(savedView.previewRecord);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchSuggestions(false);
    setSelectedCategory(savedView.selectedCategory);
    setRecordsRefresh((version) => version + 1);
    setUserName(
      userData.fullName || (userData.firstName
        ? `${userData.firstName}${userData.lastName ? ` ${userData.lastName}` : ''}`
        : userData.email?.split('@')[0] || 'User')
    );
    setPendingVisits(
      getRecords(STORAGE_KEYS.pendingVisits).filter((record) =>
        isOwnedByUser(record, userData.id)
      )
    );
    setIsAuthenticated(true);
    setAppState('app');
  };

  const handleSignIn = async (credentials) => {
    completeSignIn(await signInWithSupabase(credentials));
  };

  const handleSaveProfile = ({ fullName, age }) => requestConfirmation(
    'Are you sure you want to save your changes?',
    async () => {
      const updatedUser = await updateSupabaseProfile(currentUser, { fullName, age });
      setCurrentUser(updatedUser);
      setUserName(updatedUser.fullName);
      setActiveView('home');
      showSyncNotification('Profile changes saved.');
    },
    { title: 'Save profile changes', confirmLabel: 'Save changes' }
  );

  const performLogout = async (timeoutReason = '') => {
    try {
      await signOutSupabase(currentUser?.id);
    } catch (error) {
      console.error('Could not fully sign out from Supabase; local app access was cleared:', error);
    } finally {
      try {
        clearSessionTimeout(currentUser?.id);
      } catch (error) {
        console.error('Could not clear sign-in timeout tracking:', error);
      }
      if (currentUser?.id) {
        try {
          localStorage.removeItem(`nutrigrid_location_requested:${currentUser.id}`);
        } catch (error) {
          console.error('Could not clear the location prompt preference:', error);
        }
        try {
          sessionStorage.removeItem(getPwaViewStateKey(currentUser.id));
        } catch (error) {
          console.error('Could not clear the saved PWA view:', error);
        }
      }
      if (locationWatchId.current !== null) {
        navigator.geolocation?.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
      setCurrentLocation(null);
      setIsAuthenticated(false);
      setCurrentUser(null);
      setActiveView('home');
      setShowNotifications(false);
      setShowMenu(false);
      setSelectedCategory(null);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchSuggestions(false);
      setShowCategoryForm(false);
      setEditingRecord(null);
      setPreviewRecord(null);
      setAppState('signin');
      setSessionTimeoutMessage(timeoutReason);
    }
  };

  useEffect(() => {
    const userId = currentUser?.id;
    if (!isAuthenticated || !userId) return undefined;
    let logoutStarted = false;
    const enforceTimeout = () => {
      if (logoutStarted) return;
      try {
        const reason = checkSessionTimeout(userId);
        if (!reason) return;
        logoutStarted = true;
        void performLogout(getSessionTimeoutMessage(reason));
      } catch (error) {
        console.error('Could not verify sign-in timeout:', error);
        logoutStarted = true;
        void performLogout('Your session could not be verified. Please sign in again.');
      }
    };
    const recordActivity = () => {
      enforceTimeout();
      if (logoutStarted) return;
      try {
        recordSessionActivity(userId);
      } catch (error) {
        console.error('Could not record sign-in activity:', error);
        logoutStarted = true;
        void performLogout('Your session could not be verified. Please sign in again.');
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') enforceTimeout();
    };
    const interval = window.setInterval(enforceTimeout, 15000);
    const activityEvents = ['pointermove', 'keydown', 'click', 'touchstart', 'wheel', 'scroll'];
    activityEvents.forEach((eventName) =>
      document.addEventListener(eventName, recordActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', enforceTimeout);
    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) =>
        document.removeEventListener(eventName, recordActivity)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', enforceTimeout);
    };
  }, [isAuthenticated, currentUser?.id]);

  const handleLogout = () => requestConfirmation(
    'Are you sure you want to log out?',
    performLogout,
    { title: 'Log out', confirmLabel: 'Log out', destructive: true }
  );

  const handleDeleteAccount = async (password) => {
    if (!currentUser?.email) {
      return { success: false, error: 'Could not verify the signed-in email address.' };
    }
    try {
      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password,
      });
      if (passwordError) {
        return {
          success: false,
          error: passwordError.message === 'Invalid login credentials'
            ? 'The password is incorrect.'
            : `Could not verify your password: ${passwordError.message}`,
        };
      }

      const { data, error } = await supabase.functions.invoke('delete-own-account');
      if (error) {
        const context = error.context;
        if (context && typeof context.clone === 'function') {
          try {
            const body = await context.clone().json();
            if (body?.error) return { success: false, error: body.error };
          } catch (parseError) {
            console.error('Could not read the account deletion request error:', parseError);
          }
        }
        return { success: false, error: error.message || 'Account deletion request could not be submitted.' };
      }
      if (!data?.request_created) {
        return { success: false, error: 'The server did not confirm the deletion request.' };
      }
      return {
        success: true,
        message: data.already_pending
          ? 'Your account deletion request is already awaiting Admin review.'
          : 'Your deletion request was sent to Admin for review. Your account remains active until it is confirmed.',
      };
    } catch (error) {
      console.error('Account deletion failed:', error);
      return {
        success: false,
        error: error.message || 'Account deletion could not be completed. Please try again.',
      };
    }
  };

  const syncData = async ({ notify = true } = {}) => {
    try {
      const deletionResult = await syncPendingRecordDeletions();
      const recordResult = await syncPendingRecords();
      let pulledRecords = 0;
      const result = {
        synced: (deletionResult.synced || 0) + (recordResult.synced || 0),
        records: (deletionResult.records || 0) + (recordResult.records || 0),
        errors: [...(deletionResult.errors || []), ...(recordResult.errors || [])],
        skipped: deletionResult.skipped || recordResult.skipped,
      };
      if (currentUser?.id) {
        const pullResult = await pullUserRecordsFromSupabase(currentUser.id);
        pulledRecords = pullResult.records || 0;
        result.records += pulledRecords;
        result.errors.push(...(pullResult.errors || []));
      }
      const latestVisits = getRecords(STORAGE_KEYS.pendingVisits).filter((record) =>
        isOwnedByUser(record, currentUser?.id)
      );
      setPendingVisits(latestVisits);
      setRecordsRefresh((version) => version + 1);

      if (result.synced > 0) {
        showSyncNotification(
          `${result.synced} ${result.synced === 1 ? 'record' : 'records'} synced and saved in the Admin Dashboard and database.`
        );
      }

      if (notify) {
        if (result.skipped === 'offline') {
          alert('You are offline. Records will sync when the connection returns.');
        } else if (result.skipped === 'not-signed-in') {
          alert('Sign in before syncing records to Supabase.');
        } else if (result.errors?.length) {
          const firstError = result.errors[0];
          const remainingErrors = result.errors.length - 1;
          alert(
            `${result.synced} record(s) uploaded; ${result.errors.length} failed.\n\n${firstError}` +
            (remainingErrors ? `\n\n${remainingErrors} more error(s). Check the browser console.` : '')
          );
        }
      } else if (result.errors.length) {
        const syncError = result.errors[0];
        if (lastBackgroundSyncError.current !== syncError) {
          showSyncNotification(`Cloud sync needs attention: ${syncError}`);
          lastBackgroundSyncError.current = syncError;
        }
      } else {
        lastBackgroundSyncError.current = '';
      }
      return result;
    } catch (error) {
      console.error('Supabase sync failed:', error);
      if (notify) alert(error.message || 'Could not sync records to Supabase.');
      else if (lastBackgroundSyncError.current !== error.message) {
        showSyncNotification(`Cloud sync needs attention: ${error.message || 'Unknown error'}`);
        lastBackgroundSyncError.current = error.message || 'Unknown error';
      }
      return { synced: 0, errors: [error.message || 'Unknown sync error'] };
    }
  };

  useEffect(() => {
    if (!isAuthenticated || currentUser?.role?.toLowerCase() === 'admin') return undefined;

    const syncWhenOnline = ({ notify = false } = {}) => {
      if (!navigator.onLine || syncInFlight.current) return;

      syncInFlight.current = true;
      void Promise.all([
        syncData({ notify }),
        syncPendingActivityLogs().then((result) => {
          if (result.errors.length) {
            console.error('Some record activity logs are waiting to sync:', result.errors);
          }
        }),
        syncPendingTasks().then((result) => {
          if (result.errors?.length) {
            console.error('Some tasks are waiting to sync:', result.errors);
          } else if (result.synced > 0) {
            showSyncNotification(
              `${result.synced} ${result.synced === 1 ? 'task' : 'tasks'} synced and saved in the Admin Dashboard and database.`
            );
          }
        }),
      ]).catch((error) => {
        console.error('Could not complete online sync:', error);
      }).finally(() => {
        syncInFlight.current = false;
      });
    };

    const handleOffline = () => {
      wasOffline.current = true;
    };
    const handleOnline = () => {
      if (wasOffline.current) syncWhenOnline({ notify: true });
      wasOffline.current = false;
    };

    syncWhenOnline({ notify: true });
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthenticated, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || currentUser.role?.toLowerCase() === 'admin') {
      return undefined;
    }

    const tableCategories = [
      ['residents', 'residents'],
      ['environmental_sanitation', 'environmental'],
      ['infant_feeding', 'infantfeeding'],
      ['lactating_women', 'lactatingwoman'],
      ['pregnant_women', 'pregnantwoman'],
      ['monthly_natality', 'monthlynatal'],
    ];
    const channel = supabase.channel(`pwa-record-updates-${currentUser.id}`);
    tableCategories.forEach(([table, category]) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        (payload) => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (applyRealtimeRecordChange(category, payload.eventType, row, currentUser.id)) {
            setRecordsRefresh((version) => version + 1);
          } else if (
            payload.eventType === 'DELETE' &&
            [
              row?.created_by_user_id,
              row?.user_id,
              row?.data?.created_by_user_id,
              row?.data?.user_id,
            ]
              .filter(Boolean)
              .every((ownerId) => String(ownerId) === String(currentUser.id))
          ) {
            void pullUserRecordsFromSupabase(currentUser.id)
              .then((result) => {
                if (result.errors.length) {
                  console.error('Could not reconcile a record deletion from Supabase:', result.errors);
                  return;
                }
                setRecordsRefresh((version) => version + 1);
              })
              .catch((error) => {
                console.error('Could not reconcile a record deletion from Supabase:', error);
              });
          }
        }
      );
    });
    channel.subscribe((status, error) => {
      if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
        console.error('Could not subscribe to Admin Dashboard record updates:', error || status);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    const refreshPendingCount = () => setRecordsRefresh((version) => version + 1);
    const handleStorage = (event) => {
      if (
        event.key === STORAGE_KEYS.pendingRecordDeletions ||
        event.key === 'nutrigrid_pending_task_changes' ||
        event.key === STORAGE_KEYS.pendingVisits ||
        Object.values(STORAGE_KEYS).includes(event.key)
      ) {
        refreshPendingCount();
      }
    };
    window.addEventListener('bns-records-changed', refreshPendingCount);
    window.addEventListener('bns-tasks-changed', refreshPendingCount);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('bns-records-changed', refreshPendingCount);
      window.removeEventListener('bns-tasks-changed', refreshPendingCount);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const saveCategoryForm = async (formData, duplicateRecord = null, preserveExistingPurok = false) => {
    const existingRecord = duplicateRecord || editingRecord;
    const wasEditingFormRecord = Boolean(editingRecord);
    const key = storageKeyForCategory(formData.category);
    const editedAt = new Date().toISOString();
    let recordFormData = duplicateRecord
      ? updateDuplicateRecord(duplicateRecord, formData, {
          preservePurok: preserveExistingPurok,
        })
      : formData;
    if (currentUser?.assignedPurok && !preserveExistingPurok) {
      recordFormData = {
        ...recordFormData,
        purok: currentUser.assignedPurok,
      };
    }
    const pending = {
      ...recordFormData,
      updated_at: existingRecord ? editedAt : formData.updated_at,
      last_edited_at: existingRecord ? editedAt : formData.last_edited_at,
      created_by_user_id: currentUser?.id || recordFormData.created_by_user_id || '',
      synced: false,
      status: 'pending',
      sync_status: 'pending_sync',
      sync_error: null,
    };
    const ownedPending = pending;
    try {
      await upsertRecord(key, ownedPending);
    } catch (error) {
      console.error('Could not save the record locally:', error);
      showSyncNotification('Could not save the record on this device. Check device storage and try again.');
      throw error;
    }
    if (existingRecord) {
      void recordInformationEdit({
        category: formData.category,
        recordId: ownedPending.id,
        before: existingRecord,
        after: recordFormData,
        actorRole: currentUser?.role,
      });
    } else {
      void recordInformationCreate({
        category: formData.category,
        record: ownedPending,
        actorRole: currentUser?.role,
      });
    }
    removeLegacyRecord(formData.category, ownedPending.id);
    setEditingRecord(null);
    setShowCategoryForm(false);
    if (wasEditingFormRecord) setActiveView('records');
    setRecordsRefresh((v) => v + 1);
    showSyncNotification('Record saved on this device. Syncing to Supabase…');
    updateRecordSyncStatus(key, ownedPending.id, 'syncing', '', ownedPending);

    void syncSingleRecord(formData.category, ownedPending)
      .then((syncErr) => {
        if (!syncErr) {
          setRecordsRefresh((v) => v + 1);
          showSyncNotification('Record synced and saved in the Admin Dashboard and database.');
          return;
        }
        if (syncErr === 'offline') {
          updateRecordSyncStatus(key, ownedPending.id, 'pending_sync', '', ownedPending);
          showSyncNotification('Record saved on this device. It will sync when you are back online.');
          return;
        }
        if (syncErr === 'not-signed-in') {
          updateRecordSyncStatus(key, ownedPending.id, 'pending_sync', '', ownedPending);
          showSyncNotification('Record saved on this device. Sign in to sync it to Supabase.');
          return;
        }
        updateRecordSyncStatus(key, ownedPending.id, 'sync_failed', syncErr, ownedPending);
        console.error('Record sync failed:', syncErr);
        showSyncNotification(`Record saved on this device, but cloud sync failed: ${syncErr}`);
      })
      .catch((error) => {
        updateRecordSyncStatus(key, ownedPending.id, 'sync_failed', error.message || 'Unknown error', ownedPending);
        console.error('Record sync failed:', error);
        showSyncNotification(`Record saved on this device, but cloud sync failed: ${error.message || 'Unknown error'}`);
      });
  };

  const handleCategoryFormSubmit = (formData) => {
    if (editingRecord) {
      requestConfirmation(
        'Are you sure you want to edit this record?',
        () => saveCategoryForm(formData),
        { confirmLabel: 'Save changes' }
      );
      return;
    }

    const key = storageKeyForCategory(formData.category);
    const duplicate = findRecordDuplicate(
      formData.category,
      formData,
      getRecords(key),
      { includeEnvironmental: formData.category === 'environmental' }
    );
    if (!duplicate) {
      requestConfirmation(
        `Are you sure you want to save this ${DASHBOARD_CATEGORIES.find(({ id }) => id === formData.category)?.name || 'record'}?`,
        () => saveCategoryForm(formData),
        { confirmLabel: 'Save' }
      );
      return;
    }

    const existingPurok = duplicate.record.purok || 'the existing Purok';
    const saveDuplicateUpdate = () => saveCategoryForm(formData, duplicate.record, true);
    if (duplicate.type === 'different-purok') {
      requestConfirmation(
        `This record already exists in ${existingPurok}. Please ask an Admin to update it in that Purok.`,
        () => {},
        { confirmLabel: 'OK' }
      );
      return;
    }

    const name = getDuplicateRecordName(formData.category, formData);
    const message = formData.category === 'environmental'
      ? `This environmental record already exists for ${formData.visit_date}. Do you want to update the existing record?`
      : `This record already exists. Do you want to update the existing record with the name of: ${name}?`;
    requestConfirmation(message, saveDuplicateUpdate, { confirmLabel: 'Update existing record' });
  };

  const deleteCategoryRecords = (categoryId, records) => requestConfirmation(
    `Are you sure you want to delete ${records.length === 1 ? 'this record' : `these ${records.length} selected records`}? This removes them from Field Worker and Admin.`,
    async () => {
      records.forEach((record) => {
        const id = record.id;
        void recordInformationDelete({
          category: categoryId,
          record,
          actorRole: currentUser?.role,
        });
        queueRecordDeletion(
          categoryId,
          id,
          Boolean(record.synced || String(record.status || '').toLowerCase() === 'synced'),
          record.created_by_user_id || currentUser?.id
        );
        deleteRecordById(storageKeyForCategory(categoryId), id);
        removeLegacyRecord(categoryId, id);
        if (String(editingRecord?.id) === String(id)) {
          setEditingRecord(null);
          setShowCategoryForm(false);
        }
      });
      setRecordsRefresh((v) => v + 1);

      if (!navigator.onLine) {
        alert(`${records.length} record(s) deleted on this device. The deletions will sync when you are back online.`);
        return;
      }

      try {
        const result = await syncPendingRecordDeletions();
        if (result.skipped || result.errors?.length) {
          alert('Records deleted locally, but some deletions are still waiting to sync. Check your connection and sign-in, then retry.');
          return;
        }
        showSyncNotification('Record deletion synced to the Admin Dashboard and database.');
      } catch (error) {
        console.error('Record deletions are saved locally and waiting to sync:', error);
        alert('Records deleted locally, but the deletions could not sync. Check your connection and try again.');
      }
    },
    {
      title: records.length === 1 ? 'Delete record' : 'Delete selected records',
      confirmLabel: records.length === 1 ? 'Delete' : 'Delete records',
      destructive: true,
    }
  );

  const deleteCategoryRecord = (categoryId, record) =>
    deleteCategoryRecords(categoryId, [record]);

  const startEditRecord = (record, categoryId) => {
    setSelectedCategory(record.category || categoryId);
    setEditingRecord(record);
    setShowCategoryForm(true);
    setActiveView('home');
  };

  const closeCategoryForm = () => {
    const wasEditingRecord = Boolean(editingRecord);
    setShowCategoryForm(false);
    setEditingRecord(null);
    if (wasEditingRecord) setActiveView('records');
  };

  const DASHBOARD_CATEGORIES = [
    { id: 'residents', name: 'Residents', emoji: '👥', gradient: 'from-blue-500 to-blue-700', bgColor: '#eff6ff', accentColor: '#1d4ed8', count: 245 },
    { id: 'environmental', name: 'Environmental Sanitation', emoji: '🌍', gradient: 'from-emerald-500 to-green-700', bgColor: '#ecfdf5', accentColor: '#047857', count: 89 },
    { id: 'infantfeeding', name: 'Infant Feeding', emoji: '🍼', gradient: 'from-violet-500 to-purple-700', bgColor: '#f3e8ff', accentColor: '#6d28d9', count: 142 },
    { id: 'lactatingwoman', name: 'Lactating Woman', emoji: '❤️', gradient: 'from-rose-500 to-red-600', bgColor: '#fff1f2', accentColor: '#be123c', count: 35 },
    { id: 'pregnantwoman', name: 'Pregnant Woman', emoji: '🤰', gradient: 'from-pink-400 to-rose-500', bgColor: '#fce7f3', accentColor: '#be185d', count: 28 },
    { id: 'monthlynatal', name: 'Monthly Natality', emoji: '📅', gradient: 'from-amber-400 to-yellow-600', bgColor: '#fef3c7', accentColor: '#b45309', count: 12 },
  ];

  const savedRecords = useMemo(
    () => buildSavedRecords().filter((record) => isOwnedByUser(record.data, currentUser?.id)),
    [currentUser?.id, recordsRefresh]
  );

  const performSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setSearchResults([]);
      setShowSearchSuggestions(false);
      return;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const results = performRecordSearch(savedRecords, query).sort((left, right) => {
      const leftStartsWithQuery = getRecordDisplayTitle(left.data).toLowerCase().startsWith(normalizedQuery);
      const rightStartsWithQuery = getRecordDisplayTitle(right.data).toLowerCase().startsWith(normalizedQuery);
      return Number(rightStartsWithQuery) - Number(leftStartsWithQuery);
    });
    setSearchResults(results);
    setShowSearchSuggestions(true);
  };


  const HouseVisitForm = () => {
    const [formData, setFormData] = useState({
      purok: currentUser?.assignedPurok || '',
      household_head: '',
      address: '',
      total_members: '',
      contact_number: '',
      has_sanitary_toilet: false,
      has_compost_pit: false,
      water_source: 'piped',
      garbage_disposal: false,
      photo_url: null,
      gps_lat: currentLocation?.lat || '',
      gps_lng: currentLocation?.lng || '',
      visit_date: new Date().toISOString().split('T')[0],
      visited_by: userName,
      notes: ''
    });

    const [photoPreview, setPhotoPreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handlePhotoCapture = async () => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
            const photo = await compressPhoto(file);
            setPhotoPreview(photo);
            setFormData((previous) => ({ ...previous, photo_url: photo }));
          } catch (error) {
            console.error('Could not process household photo:', error);
            alert(error.message || 'Could not process this photo.');
          }
        };
        
        input.click();
      } catch (error) {
        console.error('Camera access error:', error);
        alert('Camera access denied. Please enable camera permissions.');
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      requestConfirmation('Are you sure you want to save this household visit?', async () => {
      setIsSubmitting(true);

      const visitData = {
        ...formData,
        purok: currentUser?.assignedPurok || formData.purok,
        id: Date.now(),
        created_by_user_id: currentUser?.id || '',
        synced: false,
        created_at: new Date().toISOString(),
        status: 'pending',
        sync_status: 'pending_sync',
        sync_error: null,
      };

      const updated = [...pendingVisits, visitData];
      const allVisits = getRecords(STORAGE_KEYS.pendingVisits);
      localStorage.setItem(
        STORAGE_KEYS.pendingVisits,
        JSON.stringify(replaceUserRecords(allVisits, currentUser?.id, updated))
      );
      setPendingVisits(updated);

      if (navigator.onLine) {
        const result = await syncData({ notify: false });
        if (result.skipped || result.errors?.length) {
          alert('Saved locally. Sync will retry automatically when available.');
        }
      } else {
        alert('Saved locally.');
      }

      setFormData({
        purok: currentUser?.assignedPurok || '',
        household_head: '',
        address: '',
        total_members: '',
        contact_number: '',
        has_sanitary_toilet: false,
        has_compost_pit: false,
        water_source: 'piped',
        garbage_disposal: false,
        photo_url: null,
        gps_lat: currentLocation?.lat || '',
        gps_lng: currentLocation?.lng || '',
        visit_date: new Date().toISOString().split('T')[0],
        visited_by: userName,
        notes: ''
      });
      setPhotoPreview(null);
      setIsSubmitting(false);

      setTimeout(() => setActiveView('home'), 1500);
      }, { confirmLabel: 'Save' });
    };

    return (
      <div className="pb-8 min-h-screen" style={{ backgroundColor: MOBILE.bg }}>
        <PageHeader
          title="House Visit Form"
          subtitle="Record household data"
          onBack={() => setActiveView('home')}
        />

        <form onSubmit={handleSubmit} className="px-4 py-5 space-y-4 -mt-2">
          {/* Purok / Zone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Purok / Zone *
            </label>
            {currentUser?.assignedPurok ? (
              <input
                type="text"
                required
                readOnly
                aria-readonly="true"
                value={currentUser.assignedPurok}
                className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-700 shadow-sm"
              />
            ) : (
              <select
                required
                value={formData.purok}
                onChange={(e) => setFormData({ ...formData, purok: e.target.value })}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-300 focus:border-blue-400 text-base shadow-sm"
              >
                <option value="">Select Purok</option>
                {PUROK_FORM_OPTIONS.map((purok) => <option key={purok} value={purok}>{purok}</option>)}
              </select>
            )}
          </div>

          {/* Household Head */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Household Head *
            </label>
            <input
              type="text"
              required
              value={formData.household_head}
              onChange={(e) => setFormData({...formData, household_head: e.target.value})}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
              placeholder="Juan Dela Cruz"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Address *
            </label>
            <input
              type="text"
              required
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
              placeholder="Sitio Santol, Alawihao"
            />
          </div>

          {/* Total Members */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Total Family Members *
            </label>
            <input
              type="number"
              required
              min="1"
              max="20"
              value={formData.total_members}
              onChange={(e) => setFormData({...formData, total_members: e.target.value})}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
              placeholder="5"
            />
          </div>

          {/* Contact Number */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Contact Number
            </label>
            <input
              type="tel"
              value={formData.contact_number}
              onChange={(e) => setFormData({...formData, contact_number: e.target.value})}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
              placeholder="09171234567"
            />
          </div>

          {/* Water Source */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Water Source *
            </label>
            <select
              required
              value={formData.water_source}
              onChange={(e) => setFormData({...formData, water_source: e.target.value})}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
            >
              <option value="">Select water source...</option>
              <option value="piped">Piped Water (Level 1)</option>
              <option value="well">Dug Well (Level 2)</option>
              <option value="other">Other (Level 3)</option>
            </select>
          </div>

          {/* Environmental Sanitation */}
          <div className="bg-purple-50 p-5 rounded-lg border-2 border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-4">Environmental Sanitation</h3>
            
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.has_sanitary_toilet}
                onChange={(e) => setFormData({...formData, has_sanitary_toilet: e.target.checked})}
                className="w-6 h-6 text-purple-600 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-base font-medium text-gray-700">Has Sanitary Toilet</span>
            </label>

            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.has_compost_pit}
                onChange={(e) => setFormData({...formData, has_compost_pit: e.target.checked})}
                className="w-6 h-6 text-purple-600 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-base font-medium text-gray-700">Has Compost Pit</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.garbage_disposal}
                onChange={(e) => setFormData({...formData, garbage_disposal: e.target.checked})}
                className="w-6 h-6 text-purple-600 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-base font-medium text-gray-700">Regular Garbage Disposal</span>
            </label>
          </div>

          {/* Photo Capture */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              House Photo (Optional)
            </label>
            {photoPreview && (
              <div className="relative mb-4 rounded-lg overflow-hidden">
                <img 
                  src={photoPreview} 
                  alt="Preview" 
                  className="w-full h-48 object-cover rounded-lg border-2 border-green-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview(null);
                    setFormData({...formData, photo_url: null});
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handlePhotoCapture}
              className="w-full flex items-center justify-center gap-3 px-4 py-4 border-2 border-dashed border-purple-400 rounded-lg hover:bg-purple-50 active:bg-purple-100 transition"
            >
              <Camera size={24} className="text-purple-600" />
              <span className="text-base font-semibold text-purple-600">Capture Photo</span>
            </button>
          </div>

          {/* GPS Location */}
          <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={20} className="text-green-600" />
              <span className="font-semibold text-green-700">GPS Location</span>
            </div>
            {currentLocation ? (
              <div className="text-sm text-green-700">
                <p className="font-mono">📍 {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</p>
                <p className="text-xs opacity-75 mt-1">Accuracy: ±{Math.round(currentLocation.accuracy)}m</p>
              </div>
            ) : (
              <p className="text-sm text-green-600">Getting location...</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Additional Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
              rows="4"
              placeholder="Any observations or special notes..."
            />
          </div>

          {/* Offline Notice */}
          {!isOnline && (
            <div className="bg-amber-50 border-2 border-amber-300 text-amber-800 px-4 py-4 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Offline Mode</p>
                <p className="text-sm opacity-90">Data will sync when you're back online</p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white py-4 rounded-lg font-bold hover:from-purple-700 hover:to-pink-600 active:from-purple-800 active:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                Saving...
              </>
            ) : (
              <>
                <Check size={24} />
                Save Visit
              </>
            )}
          </button>
        </form>
      </div>
    );
  };

  // ====================================================================
  // RECORDS LIST COMPONENT
  // ====================================================================

  // ====================================================================
  // MAIN RENDER
  // ====================================================================

  if (appState === 'loading') {
    return <div className="min-h-screen bg-white" aria-label="Restoring local sign-in" />;
  }

  // Show Welcome Page
  if (appState === 'welcome') {
    return <WelcomePage onComplete={handleWelcomeComplete} />;
  }

  // Show Sign-In Page
  if (appState === 'signin') {
    return (
      <SignInPage
        onSignIn={handleSignIn}
        timeoutMessage={sessionTimeoutMessage}
      />
    );
  }

  if (appState === 'app' && isAuthenticated && currentUser?.role?.toLowerCase() === 'admin') {
    return (
      <AdminDashboard
        adminName={currentUser.fullName}
        currentUserId={currentUser.id}
        onLogout={performLogout}
      />
    );
  }

  // Show Main App
  if (appState === 'app' && isAuthenticated) {
    return (
      <div className="pwa-ui-labels">
        {syncNotification && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed left-1/2 top-4 z-[120] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
              syncNotificationIsError
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {syncNotificationIsError ? (
              <AlertCircle size={19} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
            ) : (
              <CheckCircle size={19} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
            )}
            <span className="flex-1 font-medium">{syncNotification}</span>
            <button
              type="button"
              onClick={() => setSyncNotification('')}
              aria-label="Dismiss sync notification"
              className={`rounded-full p-1 transition ${
                syncNotificationIsError
                  ? 'text-red-700 hover:bg-red-100'
                  : 'text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <SideMenu
          open={showMenu}
          onClose={() => setShowMenu(false)}
          taskNavigationDate={taskNavigationDate}
        />
        <FieldResponsiveShell>
        <div className="max-w-md mx-auto min-h-screen flex flex-col overflow-x-hidden shadow-xl" style={{ backgroundColor: MOBILE.bg }}>
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {activeView === 'home' && (
            <HomeScreen
              pendingVisits={pendingVisits}
              recordsRefresh={recordsRefresh}
              searchQuery={searchQuery}
              DASHBOARD_CATEGORIES={DASHBOARD_CATEGORIES}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              showNotifications={showNotifications}
              setShowNotifications={setShowNotifications}
              showMenu={showMenu}
              setShowMenu={setShowMenu}
              userName={userName}
              NUTRI_GRID_THEME={NUTRI_GRID_THEME}
              MOBILE={MOBILE}
              setActiveView={setActiveView}
              handleCategoryFormSubmit={handleCategoryFormSubmit}
              closeCategoryForm={closeCategoryForm}
              currentLocation={currentLocation}
              editingRecord={editingRecord}
              showCategoryForm={showCategoryForm}
              setShowCategoryForm={setShowCategoryForm}
              searchResults={searchResults}
              showSearchSuggestions={showSearchSuggestions}
              setShowSearchSuggestions={setShowSearchSuggestions}
              performSearch={performSearch}
              isOnline={isOnline}
              setEditingRecord={setEditingRecord}
              currentUserId={currentUser?.id}
              assignedPurok={currentUser?.assignedPurok}
              onOpenAssignedTask={(task) => {
                setTaskNavigationDate(task.due_date || '');
                setShowMenu(true);
              }}
              onClearSyncNotification={() => setSyncNotification('')}
            />
          )}
          {activeView === 'profile' && (
            <ProfileScreen
              user={currentUser}
              onSave={handleSaveProfile}
              onCancel={() => setActiveView('home')}
              onResetPassword={() => setActiveView('password')}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
            />
          )}
          {activeView === 'password' && (
            <ForgotPassword
              initialEmail={currentUser?.email}
              onBack={() => setActiveView('home')}
              onDone={performLogout}
            />
          )}
          {activeView === 'visit' && <HouseVisitForm />}
          {activeView === 'records' && (
            <RecordsList
              DASHBOARD_CATEGORIES={DASHBOARD_CATEGORIES}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              recordsRefresh={recordsRefresh}
              currentUserId={currentUser?.id}
              actorRole={currentUser?.role}
              pendingVisits={pendingVisits}
              setPendingVisits={setPendingVisits}
              startEditRecord={startEditRecord}
              deleteCategoryRecord={deleteCategoryRecord}
              deleteCategoryRecords={deleteCategoryRecords}
              setActiveView={setActiveView}
              MOBILE={MOBILE}
              searchResults={searchResults}
              showSearchSuggestions={showSearchSuggestions}
              setShowSearchSuggestions={setShowSearchSuggestions}
              performSearch={performSearch}
              setSelectedCategory={setSelectedCategory}
              previewRecord={previewRecord}
              setPreviewRecord={setPreviewRecord}
              requestConfirmation={requestConfirmation}
            />
          )}
          </div>
        </div>
        </FieldResponsiveShell>
        <ConfirmActionDialog
          open={Boolean(pendingConfirmation)}
          title={pendingConfirmation?.title || 'Confirm changes'}
          message={pendingConfirmation?.message}
          confirmLabel={pendingConfirmation?.confirmLabel || 'Save'}
          destructive={pendingConfirmation?.destructive}
          busy={confirmationBusy}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={() => void runConfirmedAction()}
        />
      </div>
    );
  }

  // Fallback
  return null;
};

export default NutriGridMobile;