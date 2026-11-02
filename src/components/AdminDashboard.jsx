import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STORAGE_KEYS,
  deleteRecordById,
  upsertRecord,
  reloadAllAdminData,
  filterRecordsBySearch,
  recordMatchesSearch,
  getRecords,
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
import AdminReportTable, { ACTIONS_HEAD_CELL, ReportHeader, REPORT_META } from './AdminReportTable';
import InteractiveMapComponent from './InteractiveMapComponent';
import AdminDocuments from './AdminDocuments';
import ReportExportActions from './ReportExportActions';
import ConfirmActionDialog from './ConfirmActionDialog';
import TaskIcon from './TaskIcon';
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
  UserCircle,
  KeyRound,
  Droplets,
  Milk,
  Calendar,
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { getCategoryForm } from './CategorySpecificForms';
import { normalizePurokName, sortPurokCounts } from '../utils/purok';
import { isTaskOverdue } from '../utils/taskSyncService';
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

const ADMIN_FORM_TITLES = {
  residents: 'Residents - New Visit',
  environmental: 'Environmental Sanitation - New Report',
  infantfeeding: 'Infant Feeding - New Record',
  lactatingwoman: 'Lactating Woman - New Registration',
  pregnantwoman: 'Pregnant Woman - New Registration',
  monthlynatal: 'Monthly Natality - New Record',
};

const BNS_RHM_SIGNATURE_OPTIONS = [
  { id: 'bns', label: 'BNS', role: 'Barangay Nutrition Scholar' },
  { id: 'rhm', label: 'RURAL HEALTH MIDWIFE', role: 'Rural Health Midwife' },
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
  notificationItems,
  notifRef,
  setDarkMode,
  setActiveTab,
  setSelectedTaskFilter,
  activeTab,
  adminEmail,
  onLogout,
}) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const accountRef = useRef(null);
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
    };
    document.addEventListener('mousedown', closeAccountMenu);
    return () => document.removeEventListener('mousedown', closeAccountMenu);
  }, []);

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
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            onClick={() => {
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

const AdminDashboard = ({ onLogout, adminName: profileName, adminEmail = '', currentUserId }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [monthlyTrendView, setMonthlyTrendView] = useState('new-repeat');
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
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedTaskFilter, setSelectedTaskFilter] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [adminFormCategory, setAdminFormCategory] = useState(null);
  const [adminEditingRecord, setAdminEditingRecord] = useState(null);
  const [adminConfirmation, setAdminConfirmation] = useState(null);
  const [adminConfirmationBusy, setAdminConfirmationBusy] = useState(false);
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

  const pwaPhotoDocuments = useMemo(() => {
    const categories = [
      { id: 'residents', label: 'Residents', records: households },
      { id: 'environmental', label: 'Environmental Sanitation', records: environmentalSanitationData },
      { id: 'infantfeeding', label: 'Infant Feeding', records: infantFeedingData },
      { id: 'lactatingwoman', label: 'Lactating Woman', records: lactatingWomenData },
      { id: 'pregnantwoman', label: 'Pregnant Woman', records: pregnantWomenData },
      { id: 'monthlynatal', label: 'Monthly Natality', records: natalityData },
    ];

    return categories.flatMap(({ id, label, records }) =>
      (records || []).flatMap((record, index) => {
        const raw = record._raw || record;
        const image = raw.photo_url ||
          raw.residents_photo ||
          raw.environmental_sanitation_photo ||
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
        const dateValue = raw.visit_date ||
          raw.date_of_registration ||
          raw.dow ||
          raw.created_at ||
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
      })
    );
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
    return items;
  }, [households, environmentalSanitationData, infantFeedingData, pregnantWomenData, lactatingWomenData, natalityData]);

  const notifications = notificationItems.length;

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
    };
  }, [
    households,
    environmentalSanitationData,
    infantFeedingData,
    lactatingWomenData,
    pregnantWomenData,
    natalityData,
  ]);

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
        newCases: 0,
        repeatCases: 0,
        vulnerableCases: 0,
        pregnantAndLactating: 0,
        infants: 0,
      };
    });
    const malnutritionByMonth = new Map(months.map((month) => [month.key, new Set()]));
    const firstMalnutritionMonthByChild = new Map();
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
      const firstMonth = firstMalnutritionMonthByChild.get(childKey);
      if (!firstMonth || weighingMonth < firstMonth) {
        firstMalnutritionMonthByChild.set(childKey, weighingMonth);
      }
      if (malnutritionByMonth.has(weighingMonth)) {
        malnutritionByMonth.get(weighingMonth).add(childKey);
      }
    });

    months.forEach((month) => {
      const malnourishedChildren = malnutritionByMonth.get(month.key);
      month.vulnerableCases = malnourishedChildren.size;
      month.newCases = Array.from(malnourishedChildren)
        .filter((childKey) => firstMalnutritionMonthByChild.get(childKey) === month.key).length;
      month.repeatCases = month.vulnerableCases - month.newCases;
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
  const activeMonthlyTrend = monthlyTrendView === 'new-repeat'
    ? monthlyTrendData.some((month) => month.newCases > 0 || month.repeatCases > 0)
    : monthlyTrendData.some((month) =>
      month.vulnerableCases > 0 ||
      month.pregnantAndLactating > 0 ||
      month.infants > 0
    );

  const syncedPct = stats.synced + stats.pending
    ? Math.round((stats.synced / (stats.synced + stats.pending)) * 100)
    : 0;
  const pendingPct = stats.synced + stats.pending ? 100 - syncedPct : 0;

  const householdStatusData = [
    { name: 'Synced', value: stats.synced, color: THEME.accentPurple, pct: syncedPct },
    { name: 'Pending', value: stats.pending, color: THEME.accentPink, pct: pendingPct },
  ];

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
      const raw = row?._raw || getRecords(storageKey).find((r) => r.id === id);
      if (raw) openCategoryForm(formCategory, raw);
    },
    onDelete: (id) => requestAdminConfirmation(
      'Are you sure you want to delete this record? This cannot be undone.',
      () => adminDelete(storageKey, id, dataset.find((row) => row.id === id)?._raw),
      { title: 'Delete record', confirmLabel: 'Delete', destructive: true }
    ),
  });

  const filterAdminTableData = (rows, term, categoryId) => {
    if (!term.trim()) return rows;
    const q = term.trim().toLowerCase();
    return rows.filter((row) => recordMatchesSearch({ ...row, category: categoryId }, q));
  };

  const filteredEnvironmental = useMemo(
    () => filterAdminTableData(environmentalSanitationData, searchTerm, 'environmental'),
    [environmentalSanitationData, searchTerm]
  );
  const filteredInfantFeeding = useMemo(
    () => filterAdminTableData(infantFeedingData, searchTerm, 'infantfeeding'),
    [infantFeedingData, searchTerm]
  );
  const filteredLactating = useMemo(
    () => filterAdminTableData(lactatingWomenData, searchTerm, 'lactatingwoman'),
    [lactatingWomenData, searchTerm]
  );
  const filteredPregnant = useMemo(
    () => filterAdminTableData(pregnantWomenData, searchTerm, 'pregnantwoman'),
    [pregnantWomenData, searchTerm]
  );
  const filteredNatality = useMemo(
    () => filterAdminTableData(natalityData, searchTerm, 'monthlynatal'),
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
    { id: 'tasks', icon: TaskIcon, label: 'Tasks' },
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

  const exportPdfFile = async ({
    fileName,
    title,
    headers,
    rows,
    preamble = [],
    headRows,
    signatures = [],
    preview = false,
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
        approvalColumnCenter - signatureWidth / 2, approvalY + 50, signatureWidth, signatureHeight);
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
      const columnLeft = approvalGroupLeft + approvalColumnWidth * index + 5;
      const columnCenter = approvalGroupLeft + approvalColumnWidth * (index + 0.5);
      document.setFont('helvetica', 'normal');
      document.setFontSize(8);
      document.text(label, columnLeft, approvalY + 14);
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
    <div className="relative grid min-h-[76px] place-items-center rounded-[1.35rem] px-16 py-2.5" style={overviewStatStyle}>
      <div
        className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-xl shadow-sm"
        style={{ background: THEME.accentGradient }}
      >
        <Icon size={25} strokeWidth={2} className="text-white" />
      </div>
      <div className="min-w-0 text-center">
        <p className="text-center text-sm font-bold" style={{ color: darkMode ? THEME.dark.muted : THEME.light.muted }}>
          {label}
        </p>
        <p className="mt-0.5 text-center text-3xl font-extrabold leading-tight" style={{ color: darkMode ? THEME.dark.text : THEME.light.text }}>
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
          <OverviewCard icon={FileText} label="Total Records" value={stats.totalRecords} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 min-h-[250px] rounded-3xl p-4" style={dashCardStyle}>
          <p className="text-base font-bold mb-2" style={{ color: titleColor }}>
            Household Status
          </p>
          <div className="flex min-h-[195px] items-center justify-center gap-6">
            <div className="h-[190px] w-[190px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={householdStatusData.filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
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
            <div className="flex min-w-[130px] flex-1 flex-col justify-center gap-4">
              {householdStatusData.map((item) => (
                <div key={item.name} className="border-b pb-3 last:border-b-0 last:pb-0" style={{ borderColor: darkMode ? THEME.dark.border : THEME.light.border }}>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-semibold" style={{ color: mutedColor }}>
                      {item.name}
                    </span>
                    <span className="ml-auto text-sm font-bold" style={{ color: titleColor }}>
                      {item.value}
                    </span>
                  </div>
                  <p className="ml-5 mt-1 text-xs font-medium" style={{ color: mutedColor }}>{item.pct}% of households</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`lg:col-span-6 ${dashCardClass}`} style={dashCardStyle}>
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <label className="relative block">
            <span className="sr-only">Choose monthly trend chart</span>
            <select
              value={monthlyTrendView}
              onChange={(event) => setMonthlyTrendView(event.target.value)}
              className="max-w-[min(60vw,28rem)] appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm font-bold text-gray-800 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="new-repeat">New vs. Repeat Malnutrition Cases</option>
              <option value="vulnerable">Total Vulnerable Demographics Trend</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          </label>
          <label className="relative ml-auto block">
            <span className="sr-only">Choose the last month in the trend window</span>
            <select
              value={monthlyTrendEndMonth}
              onChange={(event) => setMonthlyTrendEndMonth(event.target.value)}
              className="appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm font-semibold text-gray-800 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              {monthlyTrendMonthOptions.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          </label>
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
          {monthlyTrendView === 'new-repeat'
            ? 'New cases are children first flagged as underweight, stunted, or wasted in available weighing records. Repeat cases were flagged in an earlier month and remain flagged.'
            : 'Barangay-wide counts: children with recorded underweight, stunted, or wasted status; pregnancy registrations not past any recorded due date; lactating women within 24 months after delivery; and infants aged 0–11 months based on date of birth.'}
        </p>
        <div className="h-[280px]">
          {!activeMonthlyTrend ? (
            <EmptyState message="No dated records are available for the selected monthly trend." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                {monthlyTrendView === 'new-repeat' ? (
                  <>
                    <Line type="monotone" dataKey="newCases" stroke={THEME.accentPink} strokeWidth={2.5} dot={{ r: 4 }} name="New Cases" />
                    <Line type="monotone" dataKey="repeatCases" stroke={THEME.accentPurple} strokeWidth={2.5} dot={{ r: 4 }} name="Ongoing / Repeat Cases" />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="vulnerableCases" stroke={THEME.accentPink} strokeWidth={2.5} dot={{ r: 4 }} name="Total Underweight / Stunted / Wasted Cases" />
                    <Line type="monotone" dataKey="pregnantAndLactating" stroke={THEME.accentPurple} strokeWidth={2.5} dot={{ r: 4 }} name="Pregnant & Lactating Women" />
                    <Line type="monotone" dataKey="infants" stroke="#2B9A8F" strokeWidth={2.5} dot={{ r: 4 }} name="Infants (0–11 months)" />
                  </>
                )}
              </LineChart>
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
  const environmentalExportHeaders = [
    'Purok',
    'Total HH',
    'Total Families',
    'Compost Pit',
    'Collect',
    'Others',
    'Level I',
    'Level II',
    'Level III',
    'Without potable water source',
    'w/ Sanitary Toilet',
    'w/out Sanitary Toilet',
    'Sari-Sari Store',
    'Grocery Stores',
    'Bakery',
    'Carenderia',
    'Restaurant',
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
        exportActions={
          <ReportExportActions
            title="Residents Masterlist"
            fileName="alawihao-residents"
            headers={['Purok', 'Household Head', 'Members', 'Last Visit']}
            rows={filteredResidentHouseholds.map((row) => [row.purok, row.head, row.members, row.lastVisit])}
            signatureOptions={BNS_RHM_SIGNATURE_OPTIONS}
            onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-residents',
            title: 'Residents Masterlist',
            headers: ['Purok', 'Household Head', 'Members', 'Last Visit'],
            rows: filteredResidentHouseholds.map((row) => [row.purok, row.head, row.members, row.lastVisit]),
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
    const tableData = filteredEnvironmental.map((record) => ({ ...record }));
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
        exportActions={
          <ReportExportActions
            title="BNS Environmental Sanitation Report"
            fileName="alawihao-environmental-sanitation-2026"
            headers={environmentalExportHeaders}
            rows={tableData.map((record) =>
              environmentalColumnKeys.map((key) =>
                [
                  'garbageCompostPit', 'garbageCollect', 'garbageOthers', 'waterLevelI',
                  'waterLevelII', 'waterLevelIII', 'withoutPotableWater', 'toiletWithSanitary',
                  'toiletWithoutSanitary', 'iodizedSaltSariSari', 'fortifiedFoodsGrocery',
                  'estBakery', 'estCarenderia', 'estRestaurant',
                ].includes(key) ? markCheck(record[key]) : record[key] ?? ''
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
                  [
                    'garbageCompostPit', 'garbageCollect', 'garbageOthers', 'waterLevelI',
                    'waterLevelII', 'waterLevelIII', 'withoutPotableWater', 'toiletWithSanitary',
                    'toiletWithoutSanitary', 'iodizedSaltSariSari', 'fortifiedFoodsGrocery',
                    'estBakery', 'estCarenderia', 'estRestaurant',
                  ].includes(key) ? markCheck(record[key]) : record[key] ?? ''
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
      exportActions={
        <ReportExportActions
          title="Infant Feeding (0-5 mo)"
          fileName="alawihao-infant-feeding"
          headers={['No.', 'Purok', 'Mother', 'Child', '1 Week', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months']}
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
          ])}
          onExportPdf={() => exportPdfFile({
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
          })}
        />
      }
      {...infantFeedingActions}
    />
  );

  const lactatingExportHeaders = [
    'No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name',
    'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'PhilHealth',
    '4Ps', 'Wt.', 'Ht.', 'BMI', 'MUAC', 'Date Delivered',
  ];
  const lactatingExportRows = filteredLactating.map((row) => [
    row.no, row.purok, row.dateRegistration, row.familySerial, row.lastName, row.firstName,
    row.middleName, row.spouseName, row.contactNumber, row.birthday, row.age, row.civilStatus,
    row.philhealth, row.fourPs, row.wt, row.ht, row.bmi, row.muac, row.dateDelivered,
  ]);
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
      exportActions={
        <ReportExportActions
          title="Masterlist of Pregnant Women"
          fileName="alawihao-pregnant-women"
          headers={['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'LMP', 'Expected Delivery', 'PhilHealth', '4Ps', 'Wt', 'Ht', 'BMI', 'MUAC']}
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
          ])}
          signatureOptions={BNS_RHM_RHMPP_NDP_SIGNATURE_OPTIONS}
          onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-pregnant-women',
            title: 'Masterlist of Pregnant Women',
            headers: ['No.', 'Purok', 'Date Registration', 'Family Serial No.', 'Last Name', 'First Name', 'Middle Name', 'Spouse', 'Contact', 'Birthday', 'Age', 'Civil Status', 'LMP', 'Expected Delivery', 'PhilHealth', '4Ps', 'Wt', 'Ht', 'BMI', 'MUAC'],
            rows: filteredPregnant.map((row) => [
              row.no, row.purok, row.dateRegistration, row.familySerial, row.lastName,
              row.firstName, row.middleName, row.spouseName, row.contactNumber,
              row.birthday, row.age, row.civilStatus, row.lmp, row.expectedDelivery,
              row.philhealth, row.fourPs, row.wt, row.ht, row.bmi, row.muac,
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

  const natalityExportHeaders = [
    'No.', 'Purok', 'Mother', 'Child', 'Sex', 'DOB', 'Birth Weight', 'Follow-up Date',
    'AIM (Months)', 'Length (cm)', 'Wt (kg)', 'Height (cm)', 'W/A', 'H/A', 'W/L/H',
    'Iron/Services', 'Remarks',
  ];
  const natalityExportRows = filteredNatality.map((row) => [
    row.no, row.purok, row.motherName, row.childName, row.sex, row.dob, row.birthWeight,
    row.dow, row.aim, row.length, row.weight, row.height, row.wA, row.hA, row.wLH,
    row.ironStatus, row.remarks,
  ]);
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

  const monthlyReportExportHeaders = [
    'Indicator', 'M1 Male', 'M1 Female', 'M2 Male', 'M2 Female', 'M3 Male', 'M3 Female',
    'Total Male', 'Total Female',
  ];
  const monthlyReportExportRows = monthlyReportData
    .filter((row) => !row.isHeader)
    .map((row) => [
      row.indicator || row.subcategory, row.m1M, row.m1F, row.m2M, row.m2F,
      row.m3M, row.m3F, row.tM, row.tF,
    ]);
  const monthlyReportMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const monthlyReportFileName = `ALAWIHAO- Monthly Report- ${monthlyReportMonth} ${REPORT_META.reportYear}`;
  const MonthlyReport = () => (
    <MonthlyReportTable
      darkMode={darkMode}
      data={monthlyReportData}
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
      onAddLine={(line) => {
        requestAdminConfirmation(
          `Save monthly data for "${line.indicator}"?`,
          async () => {
            try {
              const savedLine = await saveMonthlyReportLine(line);
              upsertRecord(STORAGE_KEYS.monthlyReport, savedLine);
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
        preamble: [
          'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
          `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
        ],
      })}
      exportActions={
        <ReportExportActions
          title="Essential Health Services Monthly Report"
          fileName={monthlyReportFileName}
          headers={monthlyReportExportHeaders}
          rows={monthlyReportExportRows}
          preamble={[
            'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
            `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
          ]}
          signatureOptions={BNS_RHM_RHMPP_NDP_SIGNATURE_OPTIONS}
          enableEmail
          onExportPdf={(signatures, options = {}) => exportPdfFile({
            fileName: 'alawihao-essential-health-services-2026',
            title: 'Essential Health Services Monthly Report',
            headers: monthlyReportExportHeaders,
            rows: monthlyReportExportRows,
            signatures,
            preview: options.preview,
            preamble: [
              'SUB-TASK GROUP SOCIAL RECOVERY & SUB-TASK UNIT ESSENTIAL HEALTH SERVICES',
              `Barangay: ${REPORT_META.barangay} | Year: ${REPORT_META.reportYear}`,
            ],
          })}
          onSendEmail={async (emailDetails) => {
            if (!supabase.functions?.invoke) {
              throw new Error('Supabase email sending is not configured in this environment.');
            }
            const { data, error } = await supabase.functions.invoke('send-monthly-report-email', {
              body: emailDetails,
            });
            if (error) {
              const details = error.context instanceof Response
                ? (await error.context.clone().json().catch(() => null))?.error
                : null;
              throw new Error(`Could not send monthly report email: ${details || error.message}`);
            }
            if (data?.error) throw new Error(data.error);
            if (!data?.sent) throw new Error('The email service did not confirm delivery.');
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
            notificationItems={notificationItems}
            notifRef={notifRef}
            setDarkMode={setDarkMode}
            setActiveTab={setActiveTab}
            setSelectedTaskFilter={setSelectedTaskFilter}
            adminEmail={adminEmail}
            onLogout={onLogout}
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
            {activeTab === 'documents' && (
              <AdminDocuments
                darkMode={darkMode}
                searchQuery={searchTerm}
                onSearchResultsChange={handleSearchResultsChange}
                pwaPhotos={pwaPhotoDocuments}
                onDeletePwaPhoto={requestPwaPhotoDeletion}
              />
            )}
            {activeTab === 'tasks' && (
              <AdminTasks
                initialPurok={scheduledVisitPurok}
                onInitialTaskHandled={clearScheduledVisitPurok}
                searchQuery={searchTerm}
                onSearchResultsChange={handleSearchResultsChange}
                selectedTaskFilter={selectedTaskFilter}
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
                onSubmit={(record) => requestAdminConfirmation(
                  `Are you sure you want to ${adminEditingRecord ? 'edit' : 'save'} this record?`,
                  async () => {
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