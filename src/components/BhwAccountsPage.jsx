import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { PUROK_FORM_OPTIONS } from '../utils/purok';
import {
  Plus,
  Search,
  Eye,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  Ban,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';

const PUROK_LIST = PUROK_FORM_OPTIONS;
const PHONE_ALLOWED_PATTERN = /^[0-9+()\s-]*$/;
const BHW_DESIGNATION = 'Barangay Health Worker';

function isValidPhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return PHONE_ALLOWED_PATTERN.test(value) && digits.length >= 7 && digits.length <= 15;
}

function isValidPurok(value) {
  return PUROK_LIST.includes(value);
}

async function accountErrorMessage(error) {
  const context = error?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json();
      if (body?.error) return body.error;
    } catch (parseError) {
      console.error('Could not read the BHW account error response:', parseError);
    }
  }
  return context?.body?.error || error?.message || 'The request could not be completed.';
}

// Reads whatever your RPC returns and normalizes it.
function normalizeAccount(raw) {
  const status = String(raw.status || '').toLowerCase();
  const inactive =
    raw.is_active === false ||
    raw.active === false ||
    ['inactive', 'resigned', 'disabled'].includes(status);
  const email = raw.email || '';
  return {
    id: raw.id,
    fullName: raw.full_name || email || 'Unnamed',
    username: raw.username || (email ? email.split('@')[0] : ''),
    email,
    purok: raw.assigned_purok || raw.purok || '',
    inactive,
    statusLabel: inactive ? (status === 'resigned' ? 'Resigned' : 'Inactive') : 'Active',
    createdAt: raw.created_at || raw.approved_at || '',
    createdBy: raw.created_by_name || raw.created_by || '',
    contactNumber: raw.contact_number || raw.phone_number || '',
    designation: raw.designation || raw.title || '',
    lastLoginAt: raw.last_login_at || raw.last_sign_in_at || '',
    residentsEncoded: raw.residents_encoded ?? raw.residentsEncoded,
    maternalInfantLogs: raw.maternal_infant_logs ?? raw.maternalInfantLogs,
    monthlyReportsFiled: raw.monthly_reports_filed ?? raw.monthlyReportsFiled,
    tasksCompleted: raw.tasks_completed ?? raw.tasksCompleted,
  };
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = window.crypto.getRandomValues(new Uint32Array(8));
  const body = Array.from(bytes, (n) => chars[n % chars.length]).join('');
  return `Nutri${body}#${new Date().getFullYear()}`;
}

function StatCard({ label, value, hint, hintColor, icon: Icon, iconBg, iconColor, darkMode }) {
  return (
    <div
      className={`flex min-h-44 flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center ${
        darkMode ? 'border-[#333348] bg-[#26263B]' : 'border-[#E8DCEF] bg-white'
      }`}
    >
      <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: iconBg }}>
        <Icon size={20} style={{ color: iconColor }} />
      </span>
      <p className={`text-sm font-bold uppercase leading-snug tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
        {label}
      </p>
      <p className={`mt-1 text-4xl font-extrabold leading-none ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className={`mt-1 text-sm font-medium ${hintColor}`}>{hint}</p>
    </div>
  );
}

function CreateBhwModal({ darkMode, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [contactError, setContactError] = useState('');
  const [password, setPassword] = useState(() => generateTempPassword());
  const [purok, setPurok] = useState(PUROK_LIST[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fieldClass = `h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${
    darkMode ? 'border-slate-600 bg-[#302338] text-white' : 'border-gray-200 bg-[#F8F7FB] text-gray-800'
  }`;
  const labelClass = `mb-1.5 block text-xs font-bold ${darkMode ? 'text-slate-200' : 'text-gray-700'}`;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('Full name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!isValidPhoneNumber(contactNumber)) {
      return setError('Enter a valid contact number with 7 to 15 digits. Letters are not allowed.');
    }
    if (password.length < 8) return setError('Temporary password must be at least 8 characters.');

    setBusy(true);
    try {
      // Needs a server-side function: the browser cannot create auth users safely.
      const { error: fnError } = await supabase.functions.invoke('create-bhw-account', {
        body: {
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          temporary_password: password,
          assigned_purok: purok,
          contact_number: contactNumber.trim(),
          designation: BHW_DESIGNATION,
          role: 'bhw',
        },
      });
      if (fnError) throw new Error(await accountErrorMessage(fnError));
      await onCreated();
      onClose();
    } catch (err) {
      console.error('Could not create BHW account:', err);
      setError(`Could not create account: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-bhw-title"
        className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl shadow-2xl ${darkMode ? 'bg-[#26263B]' : 'bg-white'}`}
      >
        <div
          className={`flex items-start justify-between gap-3 px-6 py-5 ${
            darkMode ? 'bg-[#302338]' : 'bg-[#FFF5F3]'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg,#8F65FF,#D94E9F)' }}
            >
              <UserPlus size={19} />
            </span>
            <div>
              <h2 id="create-bhw-title" className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Create BHW Account
              </h2>
              <p className="text-xs text-gray-500">Register a new Barangay Health Worker</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label className={labelClass} htmlFor="bhw-full-name">Full Name *</label>
            <input
              id="bhw-full-name"
              className={fieldClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Maria Santos"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bhw-email">Email address *</label>
              <input
                id="bhw-email"
                type="email"
                className={fieldClass}
                placeholder="e.g., maria.santos@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="bhw-contact-number">Contact number *</label>
              <input
                id="bhw-contact-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={22}
                className={fieldClass}
                placeholder="e.g., +63 919 341 8821"
                value={contactNumber}
                onChange={(e) => {
                  if (!PHONE_ALLOWED_PATTERN.test(e.target.value)) {
                    setContactError('Letters and other characters are not allowed.');
                    return;
                  }
                  setContactNumber(e.target.value);
                  setContactError('');
                }}
                aria-invalid={Boolean(contactError)}
                aria-describedby={contactError ? 'bhw-contact-error' : 'bhw-contact-help'}
                required
              />
              <p id={contactError ? 'bhw-contact-error' : 'bhw-contact-help'} className={`mt-1 text-xs ${contactError ? 'text-red-600' : 'text-gray-500'}`}>
                {contactError || 'Use 7 to 15 digits; spaces, +, hyphens and parentheses are allowed.'}
              </p>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="bhw-password">Temporary Password *</label>
            <div className="flex gap-2">
              <input
                id="bhw-password"
                className={`${fieldClass} min-w-0 font-mono`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set a temporary password"
                required
              />
              <button
                type="button"
                onClick={() => setPassword(generateTempPassword())}
                className="shrink-0 rounded-xl bg-pink-50 px-4 text-xs font-bold text-pink-600 hover:bg-pink-100"
              >
                New
              </button>
            </div>
          </div>
          <div>
            <p className={labelClass}>Official designation / title</p>
            <p className={`py-2 text-sm font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-700'}`}>
              {BHW_DESIGNATION}
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="bhw-purok">Assigned Purok *</label>
            <div className="relative">
              <select
                id="bhw-purok"
                className={`${fieldClass} appearance-none pr-9`}
                value={purok}
                onChange={(e) => setPurok(e.target.value)}
              >
                {PUROK_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: darkMode ? '#333348' : '#F0EAF5' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${
                darkMode ? 'bg-white/10 text-slate-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg,#8F65FF,#D94E9F)' }}
            >
              {busy ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ViewBhwModal({
  account,
  darkMode,
  editable = false,
  onClose,
  onNavigate,
  previousAccount,
  nextAccount,
  onAccountUpdated,
  activity,
  activityLoading,
  activityError,
}) {
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [fullName, setFullName] = useState(account.fullName);
  const [contactNumber, setContactNumber] = useState(account.contactNumber);
  const [contactError, setContactError] = useState('');
  const [assignedPurok, setAssignedPurok] = useState(
    isValidPurok(account.purok) ? account.purok : ''
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const panelClass = darkMode
    ? 'border-[#333348] bg-[#26263B] text-slate-100'
    : 'border-[#E8DCEF] bg-white text-gray-800';
  const inputClass = `h-11 w-full rounded-xl border px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${
    darkMode ? 'border-slate-600 bg-[#302338] text-white' : 'border-gray-200 bg-white text-gray-800'
  }`;

  useEffect(() => {
    setFullName(account.fullName);
    setContactNumber(account.contactNumber);
    setContactError('');
    setAssignedPurok(isValidPurok(account.purok) ? account.purok : '');
    setProfileMessage('');
    setProfileError('');
    setResetMessage('');
    setResetError('');
  }, [account.id]);

  const submitProfileUpdate = async (profile) => {
    setProfileMessage('');
    setProfileError('');
    if (!profile.fullName.trim()) {
      setProfileError('Full name is required.');
      return;
    }
    if (!isValidPhoneNumber(profile.contactNumber)) {
      setContactError('Enter a valid contact number with 7 to 15 digits. Letters are not allowed.');
      setProfileError('Check the contact number before saving.');
      return;
    }
    if (!isValidPurok(profile.assignedPurok)) {
      setProfileError('Choose a valid assigned Purok before saving.');
      return;
    }
    setSavingProfile(true);
    try {
      const { data, error: requestError } = await supabase.rpc('admin_update_bhw_profile', {
        p_user_id: account.id,
        p_full_name: profile.fullName.trim(),
        p_contact_number: profile.contactNumber.trim(),
        p_designation: BHW_DESIGNATION,
        p_assigned_purok: profile.assignedPurok,
      });
      if (requestError) throw new Error(requestError.message);
      if (!data || typeof data !== 'object') throw new Error('Supabase did not return the updated account.');
      onAccountUpdated(data);
      setFullName(data.full_name || profile.fullName);
      setContactNumber(data.contact_number || profile.contactNumber);
      setAssignedPurok(data.assigned_purok || profile.assignedPurok);
      setProfileMessage('BHW account details updated.');
    } catch (error) {
      console.error('Could not update BHW account details:', error);
      setProfileError(`Could not update BHW account: ${await accountErrorMessage(error)}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const saveProfile = async (event) => {
    event?.preventDefault();
    await submitProfileUpdate({ fullName, contactNumber, assignedPurok });
  };

  const savePurok = async () => {
    setProfileMessage('');
    setProfileError('');
    if (!isValidPurok(assignedPurok)) {
      setProfileError('Choose a valid assigned Purok before saving.');
      return;
    }

    setSavingProfile(true);
    try {
      const { data, error: requestError } = await supabase.rpc('admin_update_bhw_assigned_purok', {
        p_user_id: account.id,
        p_assigned_purok: assignedPurok,
      });
      if (requestError) throw new Error(requestError.message);
      if (!data || typeof data !== 'object') throw new Error('Supabase did not return the updated account.');
      onAccountUpdated(data);
      setAssignedPurok(data.assigned_purok || assignedPurok);
      setProfileMessage('BHW Purok assignment updated.');
    } catch (error) {
      console.error('Could not update BHW Purok assignment:', error);
      setProfileError(`Could not update assigned Purok: ${await accountErrorMessage(error)}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!account.email) return;
    setResetBusy(true);
    setResetMessage('');
    setResetError('');
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(account.email);
      if (requestError) throw new Error(requestError.message);
      setResetMessage(`Password reset link sent to ${account.email}.`);
    } catch (error) {
      console.error('Could not send BHW password reset email:', error);
      setResetError(`Could not send password reset email: ${error.message}`);
    } finally {
      setResetBusy(false);
    }
  };

  const Field = ({ label, value, mono = false }) => (
    <div className="min-w-0 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 break-words text-base font-medium ${mono ? 'font-mono text-sm' : ''}`}>
        {value || '—'}
      </p>
    </div>
  );

  const metrics = [
    { label: 'Residents Encoded', value: activity?.residents_encoded, hint: 'Household records' },
    { label: 'Maternal & Infant Logs', value: activity?.maternal_infant_logs, hint: 'Program records' },
    { label: 'Tasks Completed', value: activity?.tasks_completed, hint: 'Assigned tasks' },
  ];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/45 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bhw-details-title"
        className={`max-h-[94vh] w-full max-w-7xl overflow-y-auto rounded-3xl border shadow-2xl ${
          darkMode ? 'border-[#333348] bg-[#26263B] text-white' : 'border-[#E8DCEF] bg-white text-gray-900'
        }`}
      >
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-7 ${
          darkMode ? 'border-[#333348]' : 'border-[#F0EAF5]'
        }`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 font-semibold ${
                darkMode ? 'border-slate-600 bg-[#302338] text-slate-100' : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              <ChevronLeft size={16} />
              Back to User Management
            </button>
            <span className="text-gray-400">User Management</span>
            <span className="text-gray-400">/</span>
            <span className="truncate font-semibold">{account.fullName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(previousAccount)}
              disabled={!previousAccount}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                darkMode ? 'border-slate-600 bg-[#302338] text-slate-100' : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              <ChevronLeft size={15} /> Previous User
            </button>
            <button
              type="button"
              onClick={() => onNavigate(nextAccount)}
              disabled={!nextAccount}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                darkMode ? 'border-slate-600 bg-[#302338] text-slate-100' : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              Next User <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close BHW account details"
              className={`grid h-10 w-10 place-items-center rounded-full border ${
                darkMode ? 'border-slate-600 bg-[#302338] text-slate-200' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-7">
          <header className={`flex flex-wrap items-center gap-4 rounded-3xl border p-5 sm:p-6 ${
            darkMode ? 'border-[#333348] bg-[#302338]' : 'border-[#F0EAF5] bg-gradient-to-r from-[#FFF5F8] to-white'
          }`}>
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-pink-500 text-2xl font-extrabold text-white shadow-md">
              {initials(account.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="bhw-details-title" className={`text-2xl font-extrabold sm:text-3xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {account.fullName}
                </h2>
                <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700">
                  Barangay Health Worker
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  account.inactive ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                  {account.statusLabel}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                <span className="font-mono">ID: {account.id || '—'}</span>
                <span aria-hidden="true">•</span>
                <span className="font-semibold text-violet-700">{account.purok || 'Purok not assigned'}</span>
              </p>
            </div>
            {editable && (
              <button
                type="button"
                onClick={() => void sendPasswordReset()}
                disabled={resetBusy || !account.email}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  darkMode ? 'border-slate-600 bg-[#26263B] text-slate-100' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                <ShieldCheck size={16} />
                {resetBusy ? 'Sending…' : 'Reset Password'}
              </button>
            )}
          </header>

          {editable && (resetMessage || resetError) && (
            <p
              role={resetError ? 'alert' : 'status'}
              className={`rounded-xl border px-4 py-3 text-sm ${
                resetError
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {resetError || resetMessage}
            </p>
          )}

          {editable && (profileMessage || profileError) && (
            <p
              role={profileError ? 'alert' : 'status'}
              className={`rounded-xl border px-4 py-3 text-sm ${
                profileError
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {profileError || profileMessage}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className={`rounded-3xl border p-5 sm:p-6 ${panelClass}`} aria-label="Personal and contact details">
              <div className={`mb-3 flex items-center justify-between border-b pb-3 ${
                darkMode ? 'border-[#414156]' : 'border-[#F0EAF5]'
              }`}>
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-violet-700">Personal & Contact Details</h3>
                <span className="text-xs text-gray-400">Staff Record</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {editable ? (
                  <>
                    <label className="min-w-0">
                      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Full legal name</span>
                      <input value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} placeholder="e.g., Maria Santos" required />
                    </label>
                    <label className="min-w-0">
                      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Contact number</span>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={22}
                        value={contactNumber}
                        placeholder="e.g., +63 919 341 8821"
                        onChange={(event) => {
                          if (!PHONE_ALLOWED_PATTERN.test(event.target.value)) {
                            setContactError('Letters and other characters are not allowed.');
                            return;
                          }
                          setContactNumber(event.target.value);
                          setContactError('');
                        }}
                        className={`${inputClass} ${contactError ? 'border-red-400' : ''}`}
                        aria-invalid={Boolean(contactError)}
                        required
                      />
                      {contactError && <span className="mt-1 block text-xs text-red-600">{contactError}</span>}
                    </label>
                    <label className="min-w-0 text-center sm:col-span-2">
                      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Email address</span>
                      <input value={account.email} className={`${inputClass} text-center opacity-75`} readOnly aria-readonly="true" />
                    </label>
                  </>
                ) : (
                  <>
                    <Field label="Full legal name" value={account.fullName} />
                    <Field label="Contact number" value={account.contactNumber} />
                    <Field label="Email address" value={account.email} />
                  </>
                )}
              </div>
              {editable && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={savingProfile}
                    className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-xs font-extrabold uppercase tracking-wide text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(90deg,#8F65FF,#D94E9F)' }}
                  >
                    {savingProfile ? 'SAVING…' : 'SAVE DETAILS'}
                  </button>
                </div>
              )}
            </section>

            <section className={`rounded-3xl border p-5 sm:p-6 ${panelClass}`} aria-label="Credentials, purok and audit metadata">
              <div className={`mb-3 flex items-center justify-between border-b pb-3 ${
                darkMode ? 'border-[#414156]' : 'border-[#F0EAF5]'
              }`}>
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-violet-700">Credentials, Purok & Audit Metadata</h3>
                <span className="text-xs text-gray-400">Access Control</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="System role" value="Barangay Health Worker" />
                {editable ? (
                  <label className="relative min-w-0 sm:col-span-2">
                    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Assigned Purok</span>
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <select
                          value={assignedPurok}
                          onChange={(event) => setAssignedPurok(event.target.value)}
                          className={`${inputClass} appearance-none pr-9`}
                          required
                        >
                          {!assignedPurok && <option value="" disabled>Select a Purok</option>}
                          {PUROK_LIST.map((purok) => <option key={purok} value={purok}>{purok}</option>)}
                        </select>
                        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      </div>
                      <button
                        type="button"
                        onClick={() => void savePurok()}
                        disabled={savingProfile || !isValidPurok(assignedPurok)}
                        className="h-11 shrink-0 rounded-xl px-5 text-xs font-extrabold uppercase tracking-wide text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(90deg,#8F65FF,#D94E9F)' }}
                      >
                        {savingProfile ? 'UPDATING…' : 'UPDATE PUROK'}
                      </button>
                    </div>
                  </label>
                ) : (
                  <Field label="Assigned Purok" value={account.purok} />
                )}
                <Field label="Account created" value={formatDate(account.createdAt)} />
                <Field label="Created by" value={account.createdBy} />
                <Field label="Last portal login" value={formatDateTime(account.lastLoginAt)} />
                <Field label="Account ID" value={account.id} mono />
              </div>
            </section>
          </div>

          <section className={`rounded-3xl border p-5 sm:p-6 ${panelClass}`} aria-label="BHW activity summary">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wide">NutriGrid Encoding & Activity Summary</h3>
              <p className="text-xs text-gray-400">Historical records remain linked to this user ID</p>
            </div>
            {activityError && (
              <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {activityError}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className={`flex min-h-32 flex-col items-center justify-center rounded-2xl border p-4 text-center ${
                    darkMode ? 'border-[#414156] bg-[#302338]' : 'border-[#F0EAF5] bg-[#FCFAFD]'
                  }`}
                >
                  <p className={`flex min-h-10 items-center justify-center text-center text-sm font-bold uppercase leading-snug tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-600'}`}>
                    {metric.label}
                  </p>
                  <p className={`mt-1 text-center text-3xl font-extrabold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {activityLoading ? '…' : metric.value ?? '—'}
                  </p>
                  <p className="mt-1 text-center text-xs font-medium uppercase tracking-wide text-gray-400">{metric.hint}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function DeleteBhwAccountModal({ account, darkMode, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deleteAccount = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: requestError } = await supabase.functions.invoke('admin-delete-bhw-account', {
        body: { user_id: account.id },
      });
      if (requestError) throw new Error(await accountErrorMessage(requestError));
      if (!data?.deleted) throw new Error('The server did not confirm the BHW account deletion.');
      await onDeleted();
    } catch (deleteError) {
      console.error('Could not delete the BHW account:', deleteError);
      setError(`Could not delete BHW account: ${await accountErrorMessage(deleteError)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-bhw-account-title"
        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6 ${
          darkMode ? 'border-[#414156] bg-[#26263B] text-slate-100' : 'border-red-100 bg-white text-gray-900'
        }`}
      >
        <h2 id="delete-bhw-account-title" className="text-lg font-extrabold text-red-700">
          Delete BHW account?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Delete the sign-in and profile for <strong>{account.fullName}</strong> ({account.email})?
          Health records, assigned tasks, and activity history will remain in Supabase and the Admin Dashboard.
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              darkMode ? 'bg-white/10 text-slate-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void deleteAccount()}
            disabled={busy}
            className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function BhwAccountsPage({ darkMode }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'fullName', dir: 'asc' });
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [activityByUser, setActivityByUser] = useState({});
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');

  const loadAccounts = async () => {
    setLoading(true);
    setActivityLoading(true);
    setError('');
    setActivityError('');
    try {
      const { data, error: requestError } = await supabase.rpc('get_approved_bhws');
      if (requestError) throw new Error(requestError.message);
      const loadedAccounts = (data || []).map(normalizeAccount);
      setAccounts(loadedAccounts);
      if (!loadedAccounts.length) {
        setActivityByUser({});
        setActivityLoading(false);
        setLoading(false);
        return;
      }
    } catch (loadError) {
      console.error('Could not load approved BHW accounts:', loadError);
      setError(`Could not load BHW accounts: ${loadError.message}`);
      setActivityByUser({});
      setActivityLoading(false);
      setLoading(false);
      return;
    }

    try {
      const { data: summaries, error: summaryRequestError } = await supabase.rpc('get_bhw_activity_summaries');
      if (summaryRequestError) throw new Error(summaryRequestError.message);
      setActivityByUser(Object.fromEntries(
        (summaries || []).map((summary) => [String(summary.user_id), summary])
      ));
    } catch (summaryError) {
      console.error('Could not load BHW activity summaries:', summaryError);
      setActivityError(`Could not load BHW activity summaries: ${summaryError.message}`);
      setActivityByUser({});
    } finally {
      setLoading(false);
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const stats = useMemo(() => {
    const inactive = accounts.filter((a) => a.inactive).length;
    return { total: accounts.length, active: accounts.length - inactive, inactive };
  }, [accounts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = accounts.filter((a) => {
      if (statusFilter === 'active' && a.inactive) return false;
      if (statusFilter === 'inactive' && !a.inactive) return false;
      if (!q) return true;
      return [a.fullName, a.username, a.email, a.purok].some((v) => String(v).toLowerCase().includes(q));
    });
    const { key, dir } = sort;
    rows.sort((l, r) => {
      const a = String(l[key] ?? '');
      const b = String(r[key] ?? '');
      return (key === 'purok' ? a.localeCompare(b, undefined, { numeric: true }) : a.localeCompare(b)) * (dir === 'asc' ? 1 : -1);
    });
    return rows;
  }, [accounts, query, statusFilter, sort]);
  const activeAccount = editing || viewing;
  const viewingIndex = activeAccount
    ? visible.findIndex((account) => String(account.id) === String(activeAccount.id))
    : -1;
  const previousAccount = viewingIndex > 0 ? visible[viewingIndex - 1] : null;
  const nextAccount = viewingIndex >= 0 && viewingIndex < visible.length - 1
    ? visible[viewingIndex + 1]
    : null;
  const updateAccountInList = (rawUpdatedAccount) => {
    const updatedAccount = normalizeAccount(rawUpdatedAccount);
    const previous = accounts.find((account) => String(account.id) === String(updatedAccount.id));
    const merged = { ...previous, ...updatedAccount };
    setAccounts((current) => current.map((account) =>
      String(account.id) === String(merged.id) ? merged : account
    ));
    setViewing((current) => current && String(current.id) === String(merged.id) ? merged : current);
    setEditing((current) => current && String(current.id) === String(merged.id) ? merged : current);
  };

  const toggleSort = (key) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const panel = darkMode ? 'border-[#333348] bg-[#26263B] text-slate-100' : 'border-[#E8DCEF] bg-white text-gray-800';
  const selectClass = `h-10 appearance-none rounded-xl border pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${
    darkMode ? 'border-slate-600 bg-[#302338] text-white' : 'border-gray-200 bg-white text-gray-700'
  }`;

  const SortHead = ({ label, k, className = '' }) => (
    <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500 ${className}`}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1">
        {label}
        <span className="text-[10px] opacity-60">{sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`text-2xl font-extrabold ${darkMode ? 'text-white' : 'text-gray-900'}`}>BHW Account Management</h2>
          <p className="text-sm text-gray-500">
            Create and manage Barangay Health Worker (BHW) credentials, assigned puroks, and account statuses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md hover:opacity-95"
          style={{ background: 'linear-gradient(90deg,#8F65FF,#D94E9F)' }}
        >
          <Plus size={16} /> Create BHW Account
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard
          darkMode={darkMode}
          label="Total BHW Accounts"
          value={stats.total}
          hint="Field Accounts"
          hintColor="text-violet-600"
          icon={ShieldCheck}
          iconBg="#F1EDFF"
          iconColor="#7048E8"
        />
        <StatCard
          darkMode={darkMode}
          label="Active Barangay Health Workers"
          value={stats.active}
          hint="Can sign in"
          hintColor="text-green-600"
          icon={CheckCircle2}
          iconBg="#E6F8EF"
          iconColor="#16A34A"
        />
        <StatCard
          darkMode={darkMode}
          label="Inactive / Resigned Accounts"
          value={stats.inactive}
          hint="Audit Logs Preserved"
          hintColor="text-gray-400"
          icon={Ban}
          iconBg="#FFF3DC"
          iconColor="#D97706"
        />
      </div>

      <div className={`overflow-hidden rounded-2xl border ${panel}`}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="relative min-w-[14rem] flex-1 sm:max-w-md">
            <span className="sr-only">Search BHW accounts</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username/ID, or purok..."
              className={`h-10 w-full rounded-xl border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                darkMode ? 'border-slate-600 bg-[#302338] text-white' : 'border-gray-200 bg-[#F8F7FB]'
              }`}
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Filter by status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive / Resigned</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            </label>
            <button
              type="button"
              onClick={() => void loadAccounts()}
              disabled={loading}
              aria-label="Refresh accounts"
              className={`flex h-10 w-10 items-center justify-center rounded-xl border disabled:opacity-50 ${
                darkMode ? 'border-slate-600 bg-[#302338]' : 'border-gray-200 bg-white'
              }`}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>
        ) : loading && accounts.length === 0 ? (
          <p className="p-6 text-center text-sm">Loading BHW accounts…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">
            {accounts.length === 0 ? 'No BHW accounts found.' : 'No accounts match your search or filter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className={darkMode ? 'bg-[#302338]' : 'bg-[#FBF5F4]'}>
                <tr>
                  <SortHead label="User & Username" k="fullName" />
                  <SortHead label="Assigned Purok" k="purok" />
                  <SortHead label="Status" k="statusLabel" />
                  <SortHead label="Date Created" k="createdAt" />
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id} className="border-t" style={{ borderColor: darkMode ? '#333348' : '#F0EAF5' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                          style={{ background: 'linear-gradient(135deg,#8F65FF,#7048E8)' }}
                        >
                          {initials(a.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{a.fullName}</p>
                          <p className="truncate font-mono text-[11px] text-gray-400">{a.username || a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{a.purok || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          a.inactive ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${a.inactive ? 'bg-amber-500' : 'bg-green-500'}`} />
                        {a.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(a)}
                          aria-label={`View ${a.fullName}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-600 hover:bg-violet-100"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          aria-label={`Edit ${a.fullName}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(a)}
                          aria-label={`Delete ${a.fullName}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBhwModal darkMode={darkMode} onClose={() => setShowCreate(false)} onCreated={loadAccounts} />
      )}
      {viewing && (
        <ViewBhwModal
          account={viewing}
          darkMode={darkMode}
          onClose={() => setViewing(null)}
          onNavigate={setViewing}
          onAccountUpdated={updateAccountInList}
          previousAccount={previousAccount}
          nextAccount={nextAccount}
          activity={activityByUser[String(viewing.id)]}
          activityLoading={activityLoading}
          activityError={activityError}
        />
      )}
      {editing && (
        <ViewBhwModal
          account={editing}
          darkMode={darkMode}
          editable
          onClose={() => setEditing(null)}
          onNavigate={setEditing}
          onAccountUpdated={updateAccountInList}
          previousAccount={previousAccount}
          nextAccount={nextAccount}
          activity={activityByUser[String(editing.id)]}
          activityLoading={activityLoading}
          activityError={activityError}
        />
      )}
      {deleting && (
        <DeleteBhwAccountModal
          account={deleting}
          darkMode={darkMode}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await loadAccounts();
            window.dispatchEvent(new Event('nutrigrid-bhw-accounts-changed'));
          }}
        />
      )}
    </section>
  );
}