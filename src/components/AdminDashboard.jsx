import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STORAGE_KEYS,
  deleteRecordById,
  upsertRecord,
  nextRecordId,
  reloadAllAdminData,
  filterRecordsBySearch,
  countPendingAcrossCategories,
  getRecords,
  performRecordSearch,
  getRecordDisplayTitle,
  storageKeyForCategory,
  categoryIdForStorageKey,
  queueRecordDeletion,
} from '../utils/bnsStorage';
import { loadAdminDataFromSupabase } from '../utils/adminDataService';
import { syncPendingRecords, syncSingleRecord } from '../utils/syncService';
import { supabase } from '../utils/supabaseClient';
import MonthlyReportTable from './MonthlyReportTable';
import { NUTRI_GRID_THEME } from '../utils/nutriGridTheme';
import BnsSearchBar from './BnsSearchBar';
import AdminTasks from './AdminTasks';
import AdminReportTable, { ACTIONS_HEAD_CELL, ReportHeader, REPORT_META } from './AdminReportTable';
import InteractiveMapComponent from './InteractiveMapComponent';
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
  ClipboardList,
  UserCircle,
  Droplets,
  Milk,
  Calendar,
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { getCategoryForm } from './CategorySpecificForms';
import { normalizePurokName, sortPurokCounts } from '../utils/purok';
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
  Area,
  ComposedChart,
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

const ADMIN_FORM_TITLES = {
  residents: 'Residents - New Visit',
  environmental: 'Environmental Sanitation - New Report',
  infantfeeding: 'Infant Feeding - New Record',
  lactatingwoman: 'Lactating Woman - New Registration',
  pregnantwoman: 'Pregnant Woman - New Registration',
  monthlynatal: 'Monthly Natality - New Record',
};

const NOTIF_LABELS = {
  [STORAGE_KEYS.residents]: 'Residents',
  [STORAGE_KEYS.environmental]: 'Environmental Sanitation',
  [STORAGE_KEYS.infantfeeding]: 'Infant Feeding',
  [STORAGE_KEYS.lactatingwoman]: 'Lactating Woman',
  [STORAGE_KEYS.pregnantwoman]: 'Pregnant Woman',
  [STORAGE_KEYS.monthlynatal]: 'Monthly Natality',
  [STORAGE_KEYS.pendingVisits]: 'Pending field visits',
};

// Header uses ONLY darkMode for styling. The notification dropdown
// must never change the header's colors.
const AdminHeader = ({
  title,
  darkMode,
  adminName,
  searchTerm,
  performSearch,
  searchResults,
  showSearchSuggestions,
  setShowSearchSuggestions,
  showNotifications,
  setShowNotifications,
  notifications,
  notificationItems,
  notifRef,
  setDarkMode,
  setActiveTab,
}) => {
  const textColor = darkMode ? THEME.dark.text : THEME.light.text;
  const mutedColor = darkMode ? THEME.dark.muted : THEME.light.muted;
  const iconButtonStyle = {
    backgroundColor: darkMode ? THEME.dark.card : THEME.light.input,
    border: `1px solid ${darkMode ? THEME.dark.border : THEME.light.border}`,
  };

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
            } else {
              performSearch(getRecordDisplayTitle(record.data));
              setActiveTab(record.tab);
            }
          }}
          onFocusSuggestions={() => setShowSearchSuggestions(true)}
          onBlurSuggestions={() => setShowSearchSuggestions(false)}
          placeholder="Search records..."
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
            onClick={() => setShowNotifications((open) => !open)}
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
                {notificationItems.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: mutedColor }}>
                    No notifications
                  </div>
                ) : (
                  notificationItems.map((item) => (
                    <div key={item.id} className="p-3 hover:bg-purple-50/50">
                      <p className="font-medium text-sm" style={{ color: textColor }}>
                        {item.label}
                      </p>
                      <p className="text-xs mt-1" style={{ color: mutedColor }}>
                        {item.detail}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const AdminDashboard = ({ onLogout, adminName: profileName, currentUserId }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isExpanded, setIsExpanded] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(DARK_MODE_KEY) === 'true');
  const adminName = profileName?.trim() || 'Admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [adminFormCategory, setAdminFormCategory] = useState(null);
  const [adminEditingRecord, setAdminEditingRecord] = useState(null);
  const [residentPurokFilter, setResidentPurokFilter] = useState('');
  const [scheduledVisitPurok, setScheduledVisitPurok] = useState('');
  const notifRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(DARK_MODE_KEY, String(darkMode));
  }, [darkMode]);

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

  const refreshData = () => setAdminData(reloadAllAdminData(currentUserId));

  useEffect(() => {
    let active = true;
    let loading = false;

    const loadSharedAdminData = async () => {
      if (!active) return;
      if (loading) return;
      if (!navigator.onLine) {
        setAdminDataStatus('offline');
        return;
      }

      loading = true;
      try {
        const sharedData = await loadAdminDataFromSupabase(currentUserId);
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

    const handleLocalRecordsChanged = (event) => {
      if (event.detail?.operation === 'upsert' || event.detail?.operation === 'delete') {
        setAdminData(reloadAllAdminData(currentUserId));
      }
    };
    const handleStorageChanged = (event) => {
      if (event.key && Object.values(STORAGE_KEYS).includes(event.key)) {
        setAdminData(reloadAllAdminData(currentUserId));
      }
    };

    void loadSharedAdminData();
    window.addEventListener('bns-records-changed', handleLocalRecordsChanged);
    window.addEventListener('storage', handleStorageChanged);

    return () => {
      active = false;
      window.removeEventListener('bns-records-changed', handleLocalRecordsChanged);
      window.removeEventListener('storage', handleStorageChanged);
    };
  }, []);

  const filteredHouseholds = useMemo(() => filterRecordsBySearch(households, searchTerm), [households, searchTerm]);
  const filteredResidentHouseholds = useMemo(
    () => residentPurokFilter
      ? filteredHouseholds.filter((record) => normalizePurokName(record.purok) === residentPurokFilter)
      : filteredHouseholds,
    [filteredHouseholds, residentPurokFilter]
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
    setSearchResults(query.trim() ? performRecordSearch(query) : []);
  };

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
    return items;
  }, [households, environmentalSanitationData, infantFeedingData, pregnantWomenData, lactatingWomenData, natalityData]);

  const notifications = notificationItems.length;

  // All figures below come from saved local records. Nothing is hardcoded.
  const stats = useMemo(() => {
    const synced = households.filter((h) => h.status === 'Synced').length;
    const pending = households.filter((h) => h.status === 'Pending').length;
    return {
      totalHouseholds: households.length,
      pregnantWomen: pregnantWomenData.length,
      childrenUnderFive: infantFeedingData.length,
      reportsPending: countPendingAcrossCategories(),
      lactatingWomen: lactatingWomenData.length,
      synced,
      pending,
    };
  }, [households, pregnantWomenData, infantFeedingData, lactatingWomenData]);

  // Top puroks, counted from saved household records.
  const purokData = useMemo(() => {
    const counts = new Map();
    households.forEach((h) => {
      const name = normalizePurokName(h.purok);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return sortPurokCounts(
      Array.from(counts, ([purok, count]) => ({ purok, count }))
    ).map(({ purok, count }) => ({ name: purok, value: count }));
  }, [households]);
  const maxPurokHouseholdCount = Math.max(1, ...purokData.map(({ value }) => value));

  const monthlyTrendData = useMemo(() => {
    const reportMonthMatch = String(REPORT_META.monthYear || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
    const reportMonthIndex = reportMonthMatch
      ? new Date(`${reportMonthMatch[1]} 1, ${reportMonthMatch[2]}`).getMonth()
      : new Date().getMonth();
    const reportYear = reportMonthMatch ? Number(reportMonthMatch[2]) : new Date().getFullYear();
    const reportMonth = new Date(reportYear, reportMonthIndex, 1);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(reportMonth.getFullYear(), reportMonth.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        month: date.toLocaleDateString('en', { month: 'short' }),
        malnutrition: 0,
        births: 0,
        fullyImmunized: null,
      };
    });
    const byMonth = new Map(months.map((month) => [month.key, month]));
    const birthsByMonth = new Map(months.map((month) => [month.key, new Set()]));
    const malnutritionByMonth = new Map(months.map((month) => [month.key, new Set()]));

    natalityData.forEach((record) => {
      const visitMonth = String(record.dow || '').slice(0, 7);
      const birthMonth = String(record.dob || '').slice(0, 7);
      const visitSummary = byMonth.get(visitMonth);
      const birthSummary = byMonth.get(birthMonth);
      const childKey = `${record.dob || ''}:${String(record.childName || record.motherName || record.id)}`;
      if (birthSummary) birthsByMonth.get(birthMonth).add(childKey);

      if (visitSummary) {
        const statuses = [record.wA, record.hA, record.wLH]
          .map((status) => String(status || '').toLowerCase());
        if (statuses.some((status) =>
          status.includes('underweight') ||
          status.includes('stunted') ||
          status.includes('wasted')
        )) {
          malnutritionByMonth.get(visitMonth).add(childKey);
        }
      }
    });

    months.forEach((month) => {
      month.births = birthsByMonth.get(month.key).size;
      month.malnutrition = malnutritionByMonth.get(month.key).size;
    });

    const immunizationReport = monthlyReportData.find((row) =>
      String(row.slug || '').toLowerCase() === 'fic-9-12' ||
      String(row.indicator || '').toLowerCase().includes('fully immunized children')
    );
    if (immunizationReport) {
      const hasReportedImmunizationCounts = [1, 2, 3].some((period) =>
        Number(immunizationReport[`m${period}M`] || 0) > 0 ||
        Number(immunizationReport[`m${period}F`] || 0) > 0
      );
      if (hasReportedImmunizationCounts) {
        [1, 2, 3].forEach((period) => {
          const date = new Date(reportMonth.getFullYear(), reportMonth.getMonth() - 3 + period, 1);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const month = byMonth.get(key);
          if (!month) return;
          const male = Number(immunizationReport[`m${period}M`]);
          const female = Number(immunizationReport[`m${period}F`]);
          if (Number.isFinite(male) && Number.isFinite(female)) {
            month.fullyImmunized = male + female;
          }
        });
      }
    }

    return months.map((month) => ({
      ...month,
      immunizationRate:
        month.fullyImmunized !== null && month.births > 0
          ? (month.fullyImmunized / month.births) * 100
          : null,
    }));
  }, [natalityData, monthlyReportData]);
  const hasMonthlyTrendData = monthlyTrendData.some(
    (month) => month.malnutrition > 0 || month.births > 0 || month.immunizationRate !== null
  );

  const syncedPct = stats.synced + stats.pending
    ? Math.round((stats.synced / (stats.synced + stats.pending)) * 100)
    : 0;
  const pendingPct = stats.synced + stats.pending ? 100 - syncedPct : 0;

  const householdStatusData = [
    { name: 'Synced', value: stats.synced, color: THEME.accentPurple, pct: syncedPct },
    { name: 'Pending', value: stats.pending, color: THEME.accentPink, pct: pendingPct },
  ];

  const adminDelete = async (storageKey, id, remoteRecord) => {
    if (!confirm('Delete this record permanently?')) return;
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
      const raw = row?._raw || getRecords(storageKey).find((r) => r.id === id);
      if (raw) openCategoryForm(formCategory, raw);
    },
    onDelete: (id) => adminDelete(storageKey, id, dataset.find((row) => row.id === id)?._raw),
  });

  const filterAdminTableData = (rows, term) => {
    if (!term.trim()) return rows;
    const q = term.trim().toLowerCase();
    return rows.filter((row) =>
      Object.entries(row).some(
        ([key, value]) =>
          key !== '_raw' && key !== 'id' && value != null && String(value).toLowerCase().includes(q)
      )
    );
  };

  const filteredEnvironmental = useMemo(
    () => filterAdminTableData(environmentalSanitationData, searchTerm),
    [environmentalSanitationData, searchTerm]
  );
  const filteredInfantFeeding = useMemo(
    () => filterAdminTableData(infantFeedingData, searchTerm),
    [infantFeedingData, searchTerm]
  );
  const filteredLactating = useMemo(
    () => filterAdminTableData(lactatingWomenData, searchTerm),
    [lactatingWomenData, searchTerm]
  );
  const filteredPregnant = useMemo(
    () => filterAdminTableData(pregnantWomenData, searchTerm),
    [pregnantWomenData, searchTerm]
  );
  const filteredNatality = useMemo(
    () => filterAdminTableData(natalityData, searchTerm),
    [natalityData, searchTerm]
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
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'residents', icon: Users, label: 'Residents' },
    { id: 'environmentalSanitation', icon: Droplets, label: 'Environmental Sanitation Report' },
    { id: 'infantFeeding', icon: Baby, label: 'Infant Feeding (0-5 mo)' },
    { id: 'lactatingWoman', icon: Milk, label: 'Lactating Woman' },
    { id: 'pregnantWoman', icon: Heart, label: 'Pregnant Woman' },
    { id: 'monthlyNatality', icon: Calendar, label: 'Monthly Natality' },
    { id: 'monthlyReport', icon: FileSpreadsheet, label: 'Monthly Report' },
    { id: 'documents', icon: FileText, label: 'Documents' },
    { id: 'tasks', icon: ClipboardList, label: 'Tasks' },
    { id: 'users', icon: Settings, label: 'Settings' },
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
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white transition"
            style={{ background: THEME.accentGradient }}
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

  const exportPdfFile = async ({ fileName, title, headers, rows, preamble = [], headRows }) => {
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
      margin: { top: 24, right: 18, bottom: 24, left: 18 },
      styles: { font: 'helvetica', fontSize: headers.length > 18 ? 5 : headers.length > 10 ? 6 : 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [238, 234, 246], textColor: [35, 35, 45], fontStyle: 'bold', halign: 'center' },
      horizontalPageBreak: headers.length > 18,
      horizontalPageBreakRepeat: 1,
    });

    document.save(`${fileName}.pdf`);
  };

  const TableView = ({ data, columns, fileName = 'records', onAdd, onEdit, onDelete, onExport: customExport, aboveTable }) => {
    const showActions = Boolean(onEdit && onDelete);
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
                      className="px-3 py-2.5 text-center text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
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
                      ) : (
                        row[getColumnKey(col)]
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
      className={`flex-shrink-0 flex flex-col h-full min-h-0 border-r transition-all duration-300 relative ${
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
        className="absolute -right-3.5 top-6 z-30 w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-md text-gray-600 hover:scale-105 transition"
        aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      <div className={`p-4 pb-4 flex items-center ${isExpanded ? 'justify-between' : 'justify-center flex-col gap-3'}`}>
        <div className={`flex items-center gap-3 ${!isExpanded && 'justify-center'}`}>
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold text-white shadow-md flex-shrink-0"
            style={{ background: THEME.accentGradient }}
          >
            MS
          </div>
          {isExpanded && (
            <div className="overflow-hidden transition-all duration-200">
              <p className="font-semibold text-sm leading-tight truncate" style={{ color: darkMode ? THEME.dark.text : THEME.light.text }}>
                NutriGrid
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: darkMode ? THEME.dark.muted : THEME.light.muted }}>
                {adminName}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 min-h-0 px-3 py-2 pb-4 space-y-2.5 overflow-y-auto overscroll-contain">
        {navItems.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              title={!isExpanded ? label : undefined}
              className={`w-full flex items-center transition-all rounded-2xl ${
                isExpanded ? 'gap-3.5 px-4 py-3.5 text-base font-medium' : 'justify-center px-0 py-3.5 text-base font-medium'
              }`}
              style={
                isActive
                  ? { background: THEME.accentGradient, color: '#FFFFFF', boxShadow: '0 4px 14px rgba(143, 101, 255, 0.35)' }
                  : { color: darkMode ? THEME.dark.muted : THEME.light.text }
              }
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.45)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Icon size={21} className="flex-shrink-0" />
              {isExpanded && <span className="text-left leading-snug truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      <div
        className={`flex-shrink-0 p-4 border-t flex flex-col gap-2 ${isExpanded ? '' : 'items-center'}`}
        style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}
      >
        <button
          type="button"
          onClick={() => onLogout?.()}
          title={!isExpanded ? 'Logout' : undefined}
          className={`w-full flex items-center text-red-500 hover:bg-red-50 rounded-2xl transition ${
            isExpanded ? 'gap-3 px-4 py-3 text-sm' : 'justify-center px-0 py-3'
          }`}
        >
          <LogOut size={19} className="flex-shrink-0" />
          {isExpanded && <span className="text-base font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );

  const overviewStatStyle = darkMode
    ? {
        background: 'linear-gradient(135deg, rgba(255,117,195,0.14) 0%, rgba(143,101,255,0.12) 100%)',
        border: `1px solid ${THEME.dark.border}`,
      }
    : {
        background: 'linear-gradient(135deg, #FFF5FB 0%, #FAF5FF 100%)',
        border: '1px solid #E8C4F0',
      };

  const OverviewCard = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-4 px-5 py-5 rounded-[1.35rem]" style={overviewStatStyle}>
      <div
        className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center shadow-sm"
        style={{ background: THEME.accentGradient }}
      >
        <Icon size={26} strokeWidth={2} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: darkMode ? THEME.dark.muted : THEME.light.muted }}>
          {label}
        </p>
        <p className="text-3xl font-extrabold leading-tight mt-0.5" style={{ color: darkMode ? THEME.dark.text : THEME.light.text }}>
          {value}
        </p>
      </div>
    </div>
  );

  const dashCardClass = 'rounded-3xl p-5';
  const dashCardStyle = cardSurfaceStyle;
  const titleColor = darkMode ? THEME.dark.text : THEME.light.text;
  const mutedColor = darkMode ? THEME.dark.muted : THEME.light.muted;

  const EmptyState = ({ message }) => (
    <div className="h-full min-h-[200px] flex items-center justify-center text-center px-4">
      <p className="text-sm" style={{ color: mutedColor }}>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <OverviewCard icon={Home} label="Total Households" value={stats.totalHouseholds} />
          <OverviewCard icon={Heart} label="Pregnant Women" value={stats.pregnantWomen} />
          <OverviewCard icon={Baby} label="Children (0-5)" value={stats.childrenUnderFive} />
          <OverviewCard icon={ClipboardList} label="Reports Pending" value={stats.reportsPending} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={`lg:col-span-3 ${dashCardClass}`} style={dashCardStyle}>
          <p className="text-base font-bold mb-4" style={{ color: titleColor }}>
            No of Beneficiaries
          </p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: THEME.accentGradient }}>
              <UserCircle size={32} className="text-white" />
            </div>
            <div>
              <p className="text-4xl font-extrabold" style={{ color: titleColor }}>
                {stats.totalHouseholds + stats.childrenUnderFive}
              </p>
              <p className="text-sm font-medium mt-1" style={{ color: mutedColor }}>
                Total Registered
              </p>
            </div>
          </div>
        </div>

        <div className={`lg:col-span-4 ${dashCardClass}`} style={dashCardStyle}>
          <p className="text-base font-bold mb-2" style={{ color: titleColor }}>
            Household Status
          </p>
          <div className="flex items-center gap-4">
            <div className="w-[160px] h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={householdStatusData.filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {householdStatusData
                      .filter((d) => d.value > 0)
                      .map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'Households']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {householdStatusData.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-xs" style={{ color: mutedColor }}>
                      {item.name}
                    </span>
                  </div>
                  <p className="text-lg font-bold ml-5" style={{ color: titleColor }}>
                    {item.pct}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`lg:col-span-5 ${dashCardClass}`} style={dashCardStyle}>
          <p className="text-base font-bold mb-3" style={{ color: titleColor }}>
            Top 10 Puroks by Households
          </p>
          {purokData.length === 0 ? (
            <div className="min-h-[150px]">
              <EmptyState message="No household records yet. This chart fills in as records are saved." />
            </div>
          ) : (
            <div className="space-y-1.5" aria-label="Top 10 puroks ranked by households">
              {purokData.map(({ name, value }) => {
                return (
                  <div key={name} className="grid grid-cols-[3.25rem_minmax(0,1fr)_1rem] items-center gap-2 text-[11px]">
                    <span className="truncate" style={{ color: mutedColor }}>{name}</span>
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
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-bold" style={{ color: titleColor }}>
            Malnutrition Cases vs Immunization Rate
          </p>
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              color: mutedColor,
              backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : THEME.light.surface,
            }}
          >
            {REPORT_META.monthYear} · last 6 months
          </span>
        </div>
        <p className="mb-3 text-xs" style={{ color: mutedColor }}>
          Malnutrition cases use recorded WHO classifications. Estimated immunization rate = fully immunized children ÷ live births × 100; a rate is shown only when both counts are available for that month.
        </p>
        <div className="h-[280px]">
          {!hasMonthlyTrendData ? (
            <EmptyState message="No monthly natality records or immunization counts are available for this reporting period yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="cases" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 'auto']} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [
                    value == null ? 'Not available' : name === 'Estimated Immunization Rate' ? `${Number(value).toFixed(1)}%` : value,
                    name,
                  ]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Area yAxisId="cases" type="monotone" dataKey="malnutrition" fill={THEME.accentPink} fillOpacity={0.16} stroke={THEME.accentPink} strokeWidth={2.5} dot={{ r: 4, fill: THEME.accentPink, strokeWidth: 0 }} name="Malnutrition Cases" />
                <Line yAxisId="rate" type="monotone" dataKey="immunizationRate" stroke={THEME.accentPurple} strokeWidth={2.5} dot={{ r: 4, fill: THEME.accentPurple, strokeWidth: 0 }} name="Estimated Immunization Rate" connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className={dashCardClass} style={dashCardStyle}>
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
        />
      </div>

      <AdminReportTable
        darkMode={darkMode}
        data={filteredHouseholds}
        columnKeys={['purok', 'head', 'members', 'lastVisit']}
        singleRowHeaders={['Purok', 'Household Head', 'Members', 'Last Visit']}
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
        onExport={() =>
          exportPdfFile({
            fileName: 'alawihao-residents',
            title: 'Residents',
            headers: ['Purok', 'Household Head', 'Members', 'Last Visit'],
            rows: filteredResidentHouseholds.map((row) => [row.purok, row.head, row.members, row.lastVisit]),
          })
        }
        {...residentActions}
      />
    </div>
  );

  const environmentalColumnKeys = [
    'purok',
    'totalHH',
    'totalFamilies',
    'garbageCompostPit',
    'garbageCollect',
    'garbageOthers',
    'waterLevelI',
    'waterLevelII',
    'waterLevelIII',
    'withoutPotableWater',
    'toiletWithSanitary',
    'toiletWithoutSanitary',
    'iodizedSaltSariSari',
    'fortifiedFoodsGrocery',
    'estBakery',
    'estCarenderia',
    'estRestaurant',
  ];

  const environmentalHeadRows = [
    [
      { label: 'Purok', rowSpan: 2 },
      { label: 'Total HH', rowSpan: 2 },
      { label: 'Total Families', rowSpan: 2 },
      { label: 'Garbage Disposal', colSpan: 3 },
      { label: 'Household Water Supply', colSpan: 4 },
      { label: 'Household Toilet Facility', colSpan: 2 },
      { label: 'Selling Iodized Salt', colSpan: 1 },
      { label: 'Selling Fortified Foods', colSpan: 1 },
      { label: 'Establishments Using Iodized Salt', colSpan: 3 },
      ACTIONS_HEAD_CELL,
    ],
    [
      { label: 'Compost Pit' },
      { label: 'Collect' },
      { label: 'Others' },
      { label: 'Level I' },
      { label: 'Level II' },
      { label: 'Level III' },
      { label: 'Without potable water source' },
      { label: 'w/ Sanitary Toilet' },
      { label: 'w/out Sanitary Toilet' },
      { label: 'Sari-Sari Store' },
      { label: 'Grocery Stores' },
      { label: 'Bakery' },
      { label: 'Carenderia' },
      { label: 'Restaurant' },
    ],
  ];

  const infantFeedingHeadRows = [
    [
      { label: 'No.', rowSpan: 2 },
      { label: 'Purok', rowSpan: 2 },
      { label: 'Pangalan ng Nanay', rowSpan: 2 },
      { label: 'Pangalan ng Bata', rowSpan: 2 },
      { label: 'Paraan ng Pagpapakain o Pagpapainom', colSpan: 6 },
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
    ],
  ];

  const monthlyNatalityHeadRows = [
    [
      { label: 'No.', rowSpan: 2 },
      { label: 'Purok', rowSpan: 2 },
      { label: 'Name of Mother', rowSpan: 2 },
      { label: 'Name of Child', rowSpan: 2 },
      { label: 'Sex', rowSpan: 2 },
      { label: 'Date of Birth', rowSpan: 2 },
      { label: 'Birth Weight', rowSpan: 2 },
      { label: 'Date of Follow-up Weighing', rowSpan: 2 },
      { label: 'AIM (Months)', rowSpan: 2 },
      { label: 'Length (cm)', rowSpan: 2 },
      { label: 'Measurements', colSpan: 2 },
      { label: 'Nutrition Status', colSpan: 3 },
      { label: 'Iron Given / Other Services', rowSpan: 2 },
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
        columnKeys={['purok', 'head', 'members', 'lastVisit']}
        singleRowHeaders={['Purok', 'Household Head', 'Members', 'Last Visit']}
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
        onExport={() =>
          exportPdfFile({
            fileName: 'alawihao-residents',
            title: 'Residents Masterlist',
            headers: ['Purok', 'Household Head', 'Members', 'Last Visit'],
            rows: filteredHouseholds.map((row) => [row.purok, row.head, row.members, row.lastVisit]),
          })
        }
        {...residentActions}
      />
    </div>
  );

  const EnvironmentalSanitation = () => {
    const tableData = filteredEnvironmental.map((record) => ({ ...record }));
    const exportReport = () =>
      exportPdfFile({
        fileName: 'alawihao-environmental-sanitation-2026',
        title: 'BNS Environmental Sanitation Report',
        headers: environmentalHeadRows[1].map((c) => c.label),
        rows: tableData.map((record) =>
          environmentalColumnKeys.map((key) =>
            ['garbageCompostPit', 'garbageCollect', 'garbageOthers', 'waterLevelI', 'waterLevelII', 'waterLevelIII', 'withoutPotableWater', 'toiletWithSanitary', 'toiletWithoutSanitary', 'iodizedSaltSariSari', 'fortifiedFoodsGrocery', 'estBakery', 'estCarenderia', 'estRestaurant'].includes(key)
              ? markCheck(record[key])
              : record[key] ?? ''
          )
        ),
        preamble: [
          'BNS Environmental Sanitation Report',
          `Barangay: ${REPORT_META.barangay}`,
          `Report Year: ${REPORT_META.reportYear}`,
        ],
      });

    return (
      <AdminReportTable
        darkMode={darkMode}
        data={tableData}
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
        getCellValue={(row, key) =>
          [
            'garbageCompostPit',
            'garbageCollect',
            'garbageOthers',
            'waterLevelI',
            'waterLevelII',
            'waterLevelIII',
            'withoutPotableWater',
            'toiletWithSanitary',
            'toiletWithoutSanitary',
            'iodizedSaltSariSari',
            'fortifiedFoodsGrocery',
            'estBakery',
            'estCarenderia',
            'estRestaurant',
          ].includes(key)
            ? markCheck(row[key])
            : row[key] ?? '—'
        }
        emptyMessage={searchTerm.trim() ? 'No records match your search.' : 'No records yet.'}
        minTableWidth={1100}
        onExport={exportReport}
        {...environmentalActions}
      />
    );
  };

  const InfantFeeding = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredInfantFeeding}
      columnKeys={['no', 'purok', 'motherName', 'childName', 'week1', 'month1', 'month2', 'month3', 'month4', 'month5']}
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
      onExport={() =>
        exportPdfFile({
          fileName: 'alawihao-infant-feeding',
          title: 'Infant Feeding (0-5 mo)',
          headers: ['No.', 'Purok', 'Mother', 'Child', '1 Week', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months'],
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
          ]),
        })
      }
      {...infantFeedingActions}
    />
  );

  const LactatingWomen = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredLactating}
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
        'dateDelivered',
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
        'Date Delivered',
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
      onExport={() =>
        exportPdfFile({
          fileName: 'alawihao-lactating-women',
          title: 'Masterlist Lactating Women',
          headers: ['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'PhilHealth', '4Ps', 'Wt.', 'Ht.', 'BMI', 'MUAC', 'Date Delivered'],
          rows: filteredLactating.map((row) => [
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
            row.philhealth,
            row.fourPs,
            row.wt,
            row.ht,
            row.bmi,
            row.muac,
            row.dateDelivered,
          ]),
        })
      }
      minTableWidth={1700}
      {...lactatingActions}
    />
  );

  const PregnantWomen = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredPregnant}
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
      onExport={() =>
        exportPdfFile({
          fileName: 'alawihao-pregnant-women',
          title: 'Masterlist of Pregnant Women',
          headers: ['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'LMP', 'Expected Delivery', 'PhilHealth', '4Ps', 'Wt', 'Ht', 'BMI', 'MUAC'],
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
          ]),
        })
      }
      minTableWidth={1800}
      {...pregnantActions}
    />
  );

  const MonthlyNatality = () => (
    <AdminReportTable
      darkMode={darkMode}
      data={filteredNatality}
      columnKeys={['no', 'purok', 'motherName', 'childName', 'sex', 'dob', 'birthWeight', 'dow', 'aim', 'length', 'weight', 'height', 'wA', 'hA', 'wLH', 'ironStatus', 'remarks']}
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
      onExport={() =>
        exportPdfFile({
          fileName: 'alawihao-monthly-natality',
          title: 'Monthly Natality',
          headers: ['No.', 'Purok', 'Mother', 'Child', 'Sex', 'DOB', 'Birth Weight', 'Follow-up Date', 'AIM (Months)', 'Length (cm)', 'Wt (kg)', 'Height (cm)', 'W/A', 'H/A', 'W/L/H', 'Iron/Services', 'Remarks'],
          rows: filteredNatality.map((row) => [
            row.no,
            row.purok,
            row.motherName,
            row.childName,
            row.sex,
            row.dob,
            row.birthWeight,
            row.dow,
            row.aim,
            row.length,
            row.weight,
            row.height,
            row.wA,
            row.hA,
            row.wLH,
            row.ironStatus,
            row.remarks,
          ]),
        })
      }
      minTableWidth={1900}
      {...natalityActions}
    />
  );

  const MonthlyReport = () => (
    <MonthlyReportTable
      darkMode={darkMode}
      data={monthlyReportData}
      onSaveLine={(line) => {
        upsertRecord(STORAGE_KEYS.monthlyReport, line);
        refreshData();
      }}
      onDeleteLine={(id) => {
        if (!confirm('Remove this indicator line from the local report?')) return;
        deleteRecordById(STORAGE_KEYS.monthlyReport, id);
        refreshData();
      }}
      onAddLine={() => {
        const label = prompt('New indicator label');
        if (!label?.trim()) return;
        upsertRecord(STORAGE_KEYS.monthlyReport, {
          id: nextRecordId(),
          slug: `custom-${Date.now()}`,
          indicator: label.trim(),
          category: label.trim(),
          subcategory: label.trim(),
          isHeader: false,
          sortOrder: monthlyReportData.length + 1,
          barangay: REPORT_META.barangay,
          reportYear: Number(REPORT_META.reportYear) || new Date().getFullYear(),
          m1M: 0,
          m1F: 0,
          m2M: 0,
          m2F: 0,
          m3M: 0,
          m3F: 0,
          tM: 0,
          tF: 0,
        });
        refreshData();
      }}
      onGenerateReport={() =>
        exportPdfFile({
          fileName: 'alawihao-essential-health-services-2026',
          title: 'Essential Health Services Monthly Report',
          headers: [
            'Indicator',
            'M1 Male',
            'M1 Female',
            'M2 Male',
            'M2 Female',
            'M3 Male',
            'M3 Female',
            'Total Male',
            'Total Female',
          ],
          rows: monthlyReportData
            .filter((row) => !row.isHeader)
            .map((row) => [
              row.indicator || row.subcategory,
              row.m1M,
              row.m1F,
              row.m2M,
              row.m2F,
              row.m3M,
              row.m3F,
              row.tM,
              row.tF,
            ]),
          preamble: [
            'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
            `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
          ],
        })
      }
    />
  );

  const Documents = () => (
    <div className="p-16 rounded-3xl text-center" style={cardSurfaceStyle}>
      <FileText size={48} className="mx-auto text-gray-300 mb-4" />
      <p className="text-gray-500">Document management coming soon</p>
    </div>
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
            darkMode={darkMode}
            adminName={adminName}
            searchTerm={searchTerm}
            performSearch={performSearch}
            searchResults={searchResults}
            showSearchSuggestions={showSearchSuggestions}
            setShowSearchSuggestions={setShowSearchSuggestions}
            showNotifications={showNotifications}
            setShowNotifications={setShowNotifications}
            notifications={notifications}
            notificationItems={notificationItems}
            notifRef={notifRef}
            setDarkMode={setDarkMode}
            setActiveTab={setActiveTab}
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
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'residents' && <Residents />}
            {activeTab === 'environmentalSanitation' && <EnvironmentalSanitation />}
            {activeTab === 'infantFeeding' && <InfantFeeding />}
            {activeTab === 'lactatingWoman' && <LactatingWomen />}
            {activeTab === 'pregnantWoman' && <PregnantWomen />}
            {activeTab === 'monthlyNatality' && <MonthlyNatality />}
            {activeTab === 'monthlyReport' && <MonthlyReport />}
            {activeTab === 'documents' && <Documents />}
            {activeTab === 'tasks' && (
              <AdminTasks
                initialPurok={scheduledVisitPurok}
                onInitialTaskHandled={clearScheduledVisitPurok}
              />
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
            <header className="flex items-center justify-between gap-4 bg-gradient-to-r from-violet-500 to-pink-400 px-5 py-4 text-white">
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
                onSubmit={async (record) => {
                  const key = storageKeyForCategory(record.category);
                  const pending = {
                    ...record,
                    created_by_user_id: record.created_by_user_id || currentUserId,
                    synced: false,
                    status: 'pending',
                  };
                  upsertRecord(key, pending);
                  refreshData();
                  closeCategoryForm();
                  try {
                    const singleErr = await syncSingleRecord(record.category, pending, {
                      includeShared: true,
                    });
                    if (singleErr === 'offline' || singleErr === 'not-signed-in') {
                      alert(
                        singleErr === 'offline'
                          ? 'Saved locally. The changes will sync to Supabase when you are back online.'
                          : 'Saved locally. Sign in to Supabase to sync these changes.'
                      );
                      return;
                    }
                    if (!singleErr) {
                      upsertRecord(key, { ...pending, synced: true, status: 'Synced' });
                      refreshData();
                    }
                    const syncResult = await syncPendingRecords({ includeShared: true });
                    if (syncResult.skipped) {
                      alert('Saved locally. The changes are waiting to sync with Supabase.');
                      return;
                    }
                    if (syncResult.errors?.length) {
                      console.error('Admin record changes are still waiting to sync:', syncResult.errors);
                      alert('Saved locally, but the changes are still waiting to sync. Check the connection and try again.');
                      return;
                    }
                    const sharedData = await loadAdminDataFromSupabase(currentUserId);
                    setAdminData(sharedData);
                    setAdminDataStatus('loaded');
                    if (syncResult.errors?.length) {
                      alert(`Saved, but ${syncResult.errors.length} record(s) could not sync. Check the browser console.`);
                    } else if (syncResult.skipped) {
                      alert('Saved on this device. Connect to the internet and sign in again to sync it.');
                    }
                  } catch (error) {
                    console.error('Could not sync the admin record to Supabase:', error);
                    setAdminDataStatus(navigator.onLine ? 'error' : 'offline');
                    alert('Saved on this device, but could not update the shared Supabase records. Check the admin write policy and try again.');
                  }
                }}
                onCancel={closeCategoryForm}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;