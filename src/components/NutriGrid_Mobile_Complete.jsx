import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, 
  MapPin, 
  Wifi, 
  WifiOff, 
  Check, 
  Plus, 
  Upload, 
  List, 
  Menu,
  X,
  AlertCircle,
  CheckCircle,
  Bell,
  Baby,
  Heart,
  Users,
  ChevronLeft,
  FileText,
  Edit,
  Trash2,
} from 'lucide-react';
import {
  upsertRecord,
  deleteRecordById,
  getRecords,
  STORAGE_KEYS,
  storageKeyForCategory,
  filterRecordsBySearch,
  recordMatchesSearch,
  countPendingAcrossCategories,
  buildSavedRecords,
  performRecordSearch,
  getRecordDisplayTitle,
} from '../utils/bnsStorage';
import {
  registerWithSupabase,
  signInWithSupabase,
  restoreSupabaseSession,
  signOutSupabase,
} from '../utils/supabaseAuth';
import {
  deleteRemoteRecord,
  getSharedHouseholdCountsByPurok,
  syncPendingRecords,
  syncSingleRecord,
} from '../utils/syncService';
import ReportRowActions from './ReportRowActions';
import { NUTRI_GRID_THEME } from '../utils/nutriGridTheme';
import BnsSearchBar from './BnsSearchBar';
import WelcomePage from './WelcomePage';
import SignInPage from './SignInPage';
import AdminDashboard from './AdminDashboard';
import SideMenu from './SideMenu';
import {
  EnvironmentalSanitationForm,
  ResidentsForm,
  PregnantWomanForm,
  LactatingWomanForm,
  InfantFeedingForm,
  MonthlyNatalityForm,
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

const fieldHeaderStyle = {
  background: NUTRI_GRID_THEME.sidebarGradient,
  color: NUTRI_GRID_THEME.text,
};

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
      performSearch(getRecordDisplayTitle(record.data));
      setSelectedCategory(record.categoryId);
      setActiveView('home');
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
}) => {
  const [filter, setFilter] = useState('all');

  const categoryMeta = DASHBOARD_CATEGORIES.find((c) => c.id === selectedCategory);
  const categoryRecords = useMemo(() => {
    if (!selectedCategory) return [];
    return filterRecordsBySearch(
      getRecords(storageKeyForCategory(selectedCategory)),
      searchQuery
    );
  }, [selectedCategory, recordsRefresh, searchQuery]);

  const mergeWithLegacyFiltered = (canonicalRecords, legacyKey) => {
    let legacy = [];
    try {
      legacy = JSON.parse(localStorage.getItem(legacyKey) || '[]');
    } catch {
      legacy = [];
    }
    const filteredLegacy = filterRecordsBySearch(legacy, searchQuery);
    const ids = new Set(canonicalRecords.map((r) => r.id));
    return [...canonicalRecords, ...filteredLegacy.filter((r) => !ids.has(r.id))];
  };

  const recordsSubtitle = (count, label = 'record(s)') =>
    `${count} ${label}${searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ''}`;

  const emptyRecordsMessage = (defaultMsg) =>
    searchQuery.trim() ? 'No records match your search.' : defaultMsg;

  const RecordActions = ({ record }) => (
    <ReportRowActions
      onEdit={() => startEditRecord(record)}
      onDelete={() => deleteCategoryRecord(selectedCategory, record.id)}
    />
  );

  const filteredRecords = filter === 'all' 
    ? pendingVisits 
    : pendingVisits.filter(v => 
        filter === 'pending' ? !v.synced : v.synced
      );

  const handleDeleteRecord = (id) => {
    if (confirm('Delete this record? It will be permanently removed from your phone.')) {
      const updated = pendingVisits.filter(v => v.id !== id);
      localStorage.setItem('pendingVisits', JSON.stringify(updated));
      setPendingVisits(updated);
    }
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

  const statusLabel = (record) => {
    if (record.synced) return 'Synced';
    if (record.status === 'completed') return 'Completed';
    return 'Pending';
  };

  if (selectedCategory === 'residents') {
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
        />
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[1fr_1.2fr_0.6fr_0.7fr_1fr_4.5rem] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <span>Purok</span>
                  <span>Head</span>
                  <span>Members</span>
                  <span>Status</span>
                  <span>Last Visit</span>
                  <span className="text-right">Actions</span>
                </div>
                {categoryRecords.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">
                    {emptyRecordsMessage('No resident records yet. Tap New Visit to add one.')}
                  </div>
                ) : (
                  categoryRecords.map((record) => (
                    <div
                      key={record.id}
                      className="grid grid-cols-[1fr_1.2fr_0.6fr_0.7fr_1fr_4.5rem] gap-2 px-4 py-3 border-b border-gray-100 text-sm text-gray-800 items-center"
                    >
                      <span className="font-medium truncate">{record.purok || '—'}</span>
                      <span className="truncate">{record.household_head || '—'}</span>
                      <span>{record.total_members ?? '—'}</span>
                      <span
                        className={`text-xs font-semibold ${
                          record.synced ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {statusLabel(record)}
                      </span>
                      <span className="text-xs text-gray-600">{formatLastVisit(record)}</span>
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

  if (selectedCategory === 'pregnantwoman') {
    const allPwRecords = mergeWithLegacyFiltered(categoryRecords, 'records_pregnant_woman');

    const pwHeader = [
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
    ];

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
        />
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1400px]">
                <div className="grid grid-cols-[repeat(18,minmax(4.5rem,1fr))] gap-1 px-3 py-3 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  {pwHeader.map((label) => (
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
                      className="grid grid-cols-[repeat(18,minmax(4.5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center"
                    >
                      <span>{formatTableDate(record.date_of_registration)}</span>
                      <span className="truncate">{record.family_serial_number || '—'}</span>
                      <span className="truncate">{record.last_name || '—'}</span>
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
      'Date Delivered',
    ];

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
        />
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1450px]">
                <div className="grid grid-cols-[repeat(18,minmax(4.5rem,1fr))] gap-1 px-3 py-3 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  {lwHeader.map((label) => (
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
                      className="grid grid-cols-[repeat(18,minmax(4.5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center"
                    >
                      <span>{idx + 1}</span>
                      <span>{formatTableDate(record.date_of_registration)}</span>
                      <span className="truncate">{record.family_serial_number || '—'}</span>
                      <span className="truncate">{record.last_name || '—'}</span>
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
                      <span>{formatTableDate(record.date_delivered)}</span>
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
      'Mother',
      'Age',
      'Child',
      'DOB',
      'DOW',
      'Wt (kg)',
      'Ht (cm)',
      'AIM',
      'W/A',
      'H/A',
      'W/L/H',
    ];

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
        />
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-[repeat(12,minmax(4.5rem,1fr))] gap-1 px-3 py-3 bg-amber-50 border-b border-amber-200 text-[10px] font-semibold text-amber-900 uppercase tracking-wide">
                  {natalityHeader.map((label) => (
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
                      className="grid grid-cols-[repeat(12,minmax(4.5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center"
                    >
                      <span className="truncate">{formatMonth(record.month)}</span>
                      <span className="truncate">{record.mother_name || '—'}</span>
                      <span>{record.mother_age ?? '—'}</span>
                      <span className="truncate">{record.child_name || '—'}</span>
                      <span>{formatTableDate(record.dob)}</span>
                      <span>{formatTableDate(record.dow)}</span>
                      <span>{record.weight_kg ?? '—'}</span>
                      <span>{record.height_cm ?? '—'}</span>
                      <span>{record.aim ?? '—'}</span>
                      <span>{record.w_a || '—'}</span>
                      <span>{record.h_a || '—'}</span>
                      <span>{record.w_l_h || '—'}</span>
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
      'No',
      'Nanay',
      'Bata',
      '1 Linggo',
      '1 Buwan',
      '2 Buwan',
      '3 Buwan',
      '4 Buwan',
      '5 Buwan',
    ];

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
        />
        <div className="px-3 pt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[repeat(9,minmax(5rem,1fr))] gap-1 px-3 py-3 bg-pink-50 border-b border-pink-200 text-[10px] font-semibold text-pink-900 uppercase tracking-wide">
                  {ifHeader.map((label) => (
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
                      className="grid grid-cols-[repeat(9,minmax(5rem,1fr))] gap-1 px-3 py-2.5 border-b border-gray-100 text-[11px] text-gray-800 items-center"
                    >
                      <span>{String(idx + 1).padStart(2, '0')}</span>
                      <span className="truncate">{record.mother_name || '—'}</span>
                      <span className="truncate">{record.child_name || '—'}</span>
                      <span>{record.feeding_1_week || '—'}</span>
                      <span>{record.feeding_1_month || '—'}</span>
                      <span>{record.feeding_2_month || '—'}</span>
                      <span>{record.feeding_3_month || '—'}</span>
                      <span>{record.feeding_4_month || '—'}</span>
                      <span>{record.feeding_5_month || '—'}</span>
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
        subtitle={recordsSubtitle(categoryRecords.length || filteredRecords.length)}
        onBack={() => setActiveView('home')}
        showSearch
        searchQuery={searchQuery}
        performSearch={performSearch}
        searchResults={searchResults}
        showSearchSuggestions={showSearchSuggestions}
        setShowSearchSuggestions={setShowSearchSuggestions}
        setSelectedCategory={setSelectedCategory}
        setActiveView={setActiveView}
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
              <div key={record.id ?? idx} className="bg-white rounded-xl p-4 border border-gray-200 text-sm">
                <p className="font-bold text-gray-900">
                  {pwDisplayName(record) !== '—' ? pwDisplayName(record) : record.household_head || record.mother_name || record.child_name || `Record ${idx + 1}`}
                </p>
                <p className="text-xs text-gray-500 mt-1">{formatLastVisit(record)}</p>
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
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12">
            <List size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-lg">No records yet</p>
            <p className="text-gray-400 text-sm mt-1">Start by creating a new visit</p>
          </div>
        ) : (
          filteredRecords.map((visit) => (
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
                  <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                    visit.synced 
                      ? 'bg-green-200 text-green-800' 
                      : 'bg-amber-200 text-amber-800'
                  }`}>
                    {visit.synced ? (
                      <>
                        <CheckCircle size={14} />
                        Synced
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} />
                        Pending
                      </>
                    )}
                  </span>
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
  syncData,
  setEditingRecord,
}) => {
  const notificationCount = countPendingAcrossCategories();
  const pendingCount = notificationCount;
  const q = searchQuery.trim().toLowerCase();
  const [sharedHouseholdsByPurok, setSharedHouseholdsByPurok] = useState([]);
  const [sharedPurokStatus, setSharedPurokStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    const loadSharedPurokCounts = async () => {
      if (!navigator.onLine) {
        if (active) setSharedPurokStatus('offline');
        return;
      }

      try {
        const counts = await getSharedHouseholdCountsByPurok();
        if (active) {
          setSharedHouseholdsByPurok(counts);
          setSharedPurokStatus('loaded');
        }
      } catch (error) {
        console.error('Could not load shared Purok totals from Supabase:', error);
        if (active) setSharedPurokStatus('error');
      }
    };

    void loadSharedPurokCounts();
    const interval = window.setInterval(loadSharedPurokCounts, 60000);
    window.addEventListener('online', loadSharedPurokCounts);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', loadSharedPurokCounts);
    };
  }, [recordsRefresh]);

  const categoriesWithCounts = DASHBOARD_CATEGORIES.map((cat) => ({
    ...cat,
    count: getRecords(storageKeyForCategory(cat.id)).length,
  }));

  const residentRecords = getRecords(STORAGE_KEYS.residents);
  const pregnantWomenCount = getRecords(STORAGE_KEYS.pregnantwoman).length;
  const childrenCount = getRecords(STORAGE_KEYS.infantfeeding).length;
  const syncedHouseholds = residentRecords.filter((record) => record.synced).length;
  const pendingHouseholds = residentRecords.length - syncedHouseholds;
  const syncedPercent = residentRecords.length
    ? Math.round((syncedHouseholds / residentRecords.length) * 100)
    : 0;
  const maxPurokCount = Math.max(1, ...sharedHouseholdsByPurok.map(({ count }) => count));

  const filteredCategories = categoriesWithCounts.filter((cat) => {
    if (!q) return true;
    if (cat.name.toLowerCase().includes(q)) return true;
    return getRecords(storageKeyForCategory(cat.id)).some((r) => recordMatchesSearch(r, q));
  });

  const selectedCategoryData = categoriesWithCounts.find((c) => c.id === selectedCategory);
  const liveCount = selectedCategory
    ? getRecords(storageKeyForCategory(selectedCategory)).length
    : 0;
  const monthDelta = selectedCategoryData
    ? Math.max(1, Math.floor(liveCount * 0.15) || 1)
    : 0;

  const StatRow = ({ label, value, fillWidth, cardClass, barTrackClass, fillClass, valueClass }) => (
    <div className={`rounded-2xl p-4 ${cardClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-semibold ${valueClass}`}>{label}</span>
        <span className={`text-lg font-bold ${valueClass}`}>{value}</span>
      </div>
      <div className={`w-full h-2.5 rounded-full overflow-hidden ${barTrackClass}`}>
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: fillWidth }} />
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
              <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-xl z-50 text-gray-800 border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b font-semibold text-sm" style={{ color: MOBILE.navy }}>
                  Notifications
                </div>
                <div className="max-h-56 overflow-y-auto p-3 space-y-2 text-xs">
                  {notificationCount === 0 ? (
                    <p className="text-gray-500 py-2">All records are up to date.</p>
                  ) : (
                    categoriesWithCounts
                      .filter((cat) =>
                        getRecords(storageKeyForCategory(cat.id)).some((r) => !r.synced)
                      )
                      .map((cat) => {
                        const n = getRecords(storageKeyForCategory(cat.id)).filter((r) => !r.synced).length;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat.id);
                              setShowNotifications(false);
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-blue-50"
                          >
                            <span className="font-semibold">{cat.name}</span>
                            <span className="text-amber-600 ml-1">— {n} pending sync</span>
                          </button>
                        );
                      })
                  )}
                  {pendingCount > 0 && (
                    <p className="text-amber-700 pt-1">{pendingCount} house visit(s) pending sync</p>
                  )}
                </div>
              </div>
            )}
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
              { label: 'Total Households', value: residentRecords.length, icon: Users, color: '#5575F7' },
              { label: 'Pregnant Women', value: pregnantWomenCount, icon: Heart, color: '#E854A8' },
              { label: 'Children (0-5)', value: childrenCount, icon: Baby, color: '#16A889' },
              { label: 'Reports Pending', value: notificationCount, icon: FileText, color: '#8F65FF' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="flex min-h-[76px] min-w-0 items-center gap-2.5 rounded-xl border border-black/5 bg-white px-2.5 py-2 shadow-sm"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: color }}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[10px] font-semibold leading-tight text-gray-600">{label}</span>
                  <span className="mt-0.5 block text-xl font-bold leading-none text-gray-900">{value}</span>
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
              <h3 id="purok-households-heading" className="mb-2 truncate text-[11px] font-bold text-gray-800">Top 10 Puroks</h3>
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
                <p className="py-5 text-center text-[9px] leading-tight text-gray-500">Loading shared data...</p>
              ) : sharedPurokStatus === 'error' ? (
                <p className="py-5 text-center text-[9px] leading-tight text-red-600">Shared data unavailable. Check Supabase read access.</p>
              ) : (
                <p className="py-5 text-center text-[9px] leading-tight text-gray-500">No household records yet.</p>
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
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-2xl p-3 flex flex-col items-center text-center min-h-[108px] shadow-sm active:scale-[0.97] transition ring-2 ${
                  isSelected ? 'ring-blue-600 ring-offset-2' : 'ring-transparent'
                }`}
                style={{ backgroundColor: cat.bgColor }}
              >
                <span className="text-3xl mb-1.5 leading-none">{cat.emoji}</span>
                <span className="text-[10px] font-semibold text-gray-800 leading-tight line-clamp-2">{cat.name}</span>
                <span className="text-xs font-bold text-gray-600 mt-1">{cat.count}</span>
              </button>
            );
          })}
        </div>

        {selectedCategoryData && (
          <div className="space-y-3 pt-1">
            <div
              className={`bg-gradient-to-br ${selectedCategoryData.gradient} rounded-3xl p-5 text-white relative overflow-hidden shadow-md`}
            >
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
              <div className="flex items-center gap-2 relative z-10 mb-4 min-w-0">
                <span className="text-3xl shrink-0">{selectedCategoryData.emoji}</span>
                <h3 className="text-lg font-bold leading-tight">{selectedCategoryData.name}</h3>
              </div>
              <p className="text-5xl font-bold relative z-10">{liveCount}</p>
              <p className="text-sm text-white/90 relative z-10 mt-1">Total Records</p>
            </div>

            <StatRow
              label="This Month"
              value={`+${monthDelta}`}
              fillWidth="65%"
              cardClass="bg-blue-50"
              barTrackClass="bg-blue-200/70"
              fillClass="bg-blue-600"
              valueClass="text-blue-700"
            />
            <StatRow
              label="Completed"
              value="87%"
              fillWidth="87%"
              cardClass="bg-emerald-50"
              barTrackClass="bg-emerald-200/70"
              fillClass="bg-emerald-600"
              valueClass="text-emerald-800"
            />
            <StatRow
              label="Pending"
              value={String(pendingCount)}
              fillWidth={pendingCount > 0 ? '30%' : '0%'}
              cardClass="bg-amber-50"
              barTrackClass="bg-amber-200/70"
              fillClass="bg-amber-500"
              valueClass="text-amber-800"
            />

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingRecord(null);
                  setShowCategoryForm(true);
                }}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm shadow-md active:scale-[0.98] transition"
                style={{ backgroundColor: MOBILE.navy }}
              >
                <Plus size={20} />
                New Visit
              </button>
              <button
                type="button"
                onClick={() => setActiveView('records')}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border-2 bg-white active:scale-[0.98] transition"
                style={{ borderColor: MOBILE.navy, color: MOBILE.navy }}
              >
                <FileText size={20} />
                Records
              </button>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-start gap-3">
            <WifiOff size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Currently Offline</p>
              <p className="text-xs mt-1">Data will sync when you&apos;re back online.</p>
            </div>
          </div>
        )}

        {isOnline && pendingCount > 0 && (
          <button
            type="button"
            onClick={syncData}
            className="w-full text-white p-4 rounded-2xl shadow-md flex items-center justify-between active:scale-[0.98] transition"
            style={{ backgroundColor: MOBILE.coral }}
          >
            <div className="text-left">
              <p className="font-bold text-sm">Sync Data Now</p>
              <p className="text-xs text-white/85">{pendingCount} record(s) ready</p>
            </div>
            <Upload size={20} />
          </button>
        )}

      </div>

      {showCategoryForm && selectedCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 max-w-md mx-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-h-[92vh] overflow-y-auto">
            <div
              className="sticky top-0 text-white px-5 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl"
              style={{ backgroundColor: MOBILE.navy }}
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
            <div className="p-4 pb-8">
              {selectedCategory === 'environmental' && (
                <EnvironmentalSanitationForm
                  key={`environmental-${editingRecord?.id || 'new'}`}
                  onSubmit={handleCategoryFormSubmit}
                  onCancel={closeCategoryForm}
                  initialData={editingRecord}
                  currentLocation={currentLocation}
                  userName={userName}
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
                />
              )}
            </div>
          </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  // Initialize app
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Get location
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => console.error('Location error:', error)
      );
    }

    // Load pending visits
    const pending = JSON.parse(localStorage.getItem('pendingVisits') || '[]');
    setPendingVisits(pending);

    restoreSupabaseSession()
      .then((userData) => {
        if (userData) {
          completeSignIn(userData);
        } else {
          setAppState('welcome');
        }
      })
      .catch((error) => {
        console.error('Could not restore Supabase sign-in:', error);
        setAppState('welcome');
      });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ====================================================================
  // HANDLERS
  // ====================================================================

  const handleWelcomeComplete = () => {
    setAppState('signin');
  };

  const completeSignIn = (userData) => {
    setCurrentUser(userData);
    setUserName(
      userData.fullName || (userData.firstName
        ? `${userData.firstName}${userData.lastName ? ` ${userData.lastName}` : ''}`
        : userData.email?.split('@')[0] || 'User')
    );
    setIsAuthenticated(true);
    setAppState('app');
  };

  const handleSignIn = async (credentials) => {
    completeSignIn(await signInWithSupabase(credentials));
  };

  const handleRegister = async (accountData) => {
    await registerWithSupabase(accountData);
  };

  const handleLogout = async () => {
    try {
      await signOutSupabase();
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setSelectedCategory(null);
      setShowCategoryForm(false);
      setEditingRecord(null);
      setAppState('signin');
    }
  };

  const syncData = async ({ notify = true } = {}) => {
    try {
      const result = await syncPendingRecords();
      const latestVisits = JSON.parse(localStorage.getItem('pendingVisits') || '[]');
      setPendingVisits(latestVisits);
      setRecordsRefresh((version) => version + 1);

      if (notify) {
        if (result.skipped === 'offline') {
          alert('You are offline. Records will sync when the connection returns.');
        } else if (result.skipped === 'not-signed-in') {
          alert('Sign in before syncing records to Supabase.');
        } else if (result.errors?.length) {
          alert(`${result.synced} record(s) uploaded; ${result.errors.length} failed. Check the console for details.`);
        } else {
          alert(result.synced
            ? `${result.synced} record(s) synced to Supabase.`
            : 'There are no unsynced records.');
        }
      }
      return result;
    } catch (error) {
      console.error('Supabase sync failed:', error);
      if (notify) alert(error.message || 'Could not sync records to Supabase.');
      return { synced: 0, errors: [error.message] };
    }
  };

  useEffect(() => {
    if (!isAuthenticated || currentUser?.role?.toLowerCase() === 'admin') return undefined;

    const syncWhenOnline = () => {
      if (navigator.onLine) void syncData({ notify: false });
    };
    syncWhenOnline();
    window.addEventListener('online', syncWhenOnline);
    const timer = window.setInterval(syncWhenOnline, 60000);

    return () => {
      window.removeEventListener('online', syncWhenOnline);
      window.clearInterval(timer);
    };
  }, [isAuthenticated, currentUser?.role]);

  const handleCategoryFormSubmit = async (formData) => {
    const key = storageKeyForCategory(formData.category);
    const pending = { ...formData, synced: false, status: 'pending' };
    upsertRecord(key, pending);
    setEditingRecord(null);
    setShowCategoryForm(false);
    setRecordsRefresh((v) => v + 1);

    const syncErr = await syncSingleRecord(formData.category, pending);
    if (!syncErr) {
      upsertRecord(key, { ...pending, synced: true, status: 'Synced' });
      setRecordsRefresh((v) => v + 1);
      alert('Saved and synced to Supabase. Same data appears in Admin Dashboard.');
      return;
    }
    if (syncErr === 'offline') {
      alert('Saved on this device. Will sync when you are back online.');
      return;
    }
    if (syncErr === 'not-signed-in') {
      alert('Saved locally. Sign in to sync to Supabase.');
      return;
    }
    alert(`Saved locally, but sync failed: ${syncErr}`);
  };

  const deleteCategoryRecord = async (categoryId, id) => {
    if (!confirm('Delete this record? This removes it from Field Worker and Admin.')) return;
    deleteRecordById(storageKeyForCategory(categoryId), id);
    if (editingRecord?.id === id) {
      setEditingRecord(null);
      setShowCategoryForm(false);
    }
    setRecordsRefresh((v) => v + 1);

    const remoteErr = await deleteRemoteRecord(categoryId, String(id));
    if (remoteErr && remoteErr !== 'offline' && remoteErr !== 'not-signed-in') {
      console.warn('Supabase delete failed:', remoteErr);
    }
  };

  const startEditRecord = (record) => {
    setSelectedCategory(record.category);
    setEditingRecord(record);
    setShowCategoryForm(true);
    setActiveView('home');
  };

  const closeCategoryForm = () => {
    setShowCategoryForm(false);
    setEditingRecord(null);
  };

  const DASHBOARD_CATEGORIES = [
    { id: 'residents', name: 'Residents', emoji: '👥', gradient: 'from-blue-500 to-blue-700', bgColor: '#e8f0fe', count: 245 },
    { id: 'environmental', name: 'Environmental Sanitation', emoji: '🌍', gradient: 'from-emerald-500 to-green-700', bgColor: '#e6f7ed', count: 89 },
    { id: 'infantfeeding', name: 'Infant Feeding', emoji: '🍼', gradient: 'from-pink-500 to-pink-600', bgColor: '#fce8f0', count: 142 },
    { id: 'lactatingwoman', name: 'Lactating Woman', emoji: '❤️', gradient: 'from-rose-500 to-red-600', bgColor: '#ffe8e6', count: 35 },
    { id: 'pregnantwoman', name: 'Pregnant Woman', emoji: '🤰', gradient: 'from-violet-500 to-purple-700', bgColor: '#f0e8ff', count: 28 },
    { id: 'monthlynatal', name: 'Monthly Natality', emoji: '📅', gradient: 'from-amber-400 to-yellow-600', bgColor: '#fff8e1', count: 12 },
  ];

  const savedRecords = useMemo(() => buildSavedRecords(), [recordsRefresh]);

  const performSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setSearchResults([]);
      setShowSearchSuggestions(false);
      return;
    }

    const results = performRecordSearch(savedRecords, query);
    setSearchResults(results.slice(0, 15));
    setShowSearchSuggestions(true);
  };


  const HouseVisitForm = () => {
    const [formData, setFormData] = useState({
      purok: '',
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
        
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setPhotoPreview(event.target.result);
              setFormData({...formData, photo_url: event.target.result});
            };
            reader.readAsDataURL(file);
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
      setIsSubmitting(true);

      const visitData = {
        ...formData,
        id: Date.now(),
        synced: false,
        created_at: new Date().toISOString(),
        status: 'pending'
      };

      const updated = [...pendingVisits, visitData];
      localStorage.setItem('pendingVisits', JSON.stringify(updated));
      setPendingVisits(updated);

      if (isOnline) {
        await syncData();
      }

      alert(
        isOnline 
          ? '✅ Visit recorded and synced!' 
          : '✅ Visit recorded! Will sync when online.'
      );

      setFormData({
        purok: '',
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
            <input
              type="text"
              required
              value={formData.purok}
              onChange={(e) => setFormData({...formData, purok: e.target.value})}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-300 focus:border-blue-400 text-base shadow-sm"
              placeholder="Purok 1, Purok 2, etc."
            />
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
              placeholder="Sitio Santol, Camambugan"
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
    return <SignInPage onSignIn={handleSignIn} onRegister={handleRegister} />;
  }

  if (appState === 'app' && isAuthenticated && currentUser?.role?.toLowerCase() === 'admin') {
    return <AdminDashboard adminName={currentUser.fullName} onLogout={handleLogout} />;
  }

  // Show Main App
  if (appState === 'app' && isAuthenticated) {
    return (
      <>
        <SideMenu open={showMenu} onClose={() => setShowMenu(false)} onLogout={handleLogout} />
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
              syncData={syncData}
              setEditingRecord={setEditingRecord}
            />
          )}
          {activeView === 'visit' && <HouseVisitForm />}
          {activeView === 'records' && (
            <RecordsList
              DASHBOARD_CATEGORIES={DASHBOARD_CATEGORIES}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              recordsRefresh={recordsRefresh}
              pendingVisits={pendingVisits}
              setPendingVisits={setPendingVisits}
              startEditRecord={startEditRecord}
              deleteCategoryRecord={deleteCategoryRecord}
              setActiveView={setActiveView}
              MOBILE={MOBILE}
              searchResults={searchResults}
              showSearchSuggestions={showSearchSuggestions}
              setShowSearchSuggestions={setShowSearchSuggestions}
              performSearch={performSearch}
              setSelectedCategory={setSelectedCategory}
            />
          )}
          </div>
        </div>
        </FieldResponsiveShell>
      </>
    );
  }

  // Fallback
  return null;
};

export default NutriGridMobile;