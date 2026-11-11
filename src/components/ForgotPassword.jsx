import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { ChevronLeft, CheckCircle2 } from 'lucide-react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PINK = '#f08c8c';
const BUTTON_PINK = '#f09a9a';

// Outlined pink icons drawn to match the reference
const LockIcon = ({ badge }) => (
  <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="13" height="10" rx="2" />
    <path d="M7.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
    <circle cx="10.5" cy="16" r="1" />
    {badge === 'question' && (
      <>
        <circle cx="18" cy="18" r="3.5" fill="#fff" />
        <path d="M17.3 17.2a.8.8 0 1 1 1.1.8c-.2.1-.4.4-.4.7" />
      </>
    )}
    {badge === 'check' && (
      <>
        <circle cx="18" cy="18" r="3.5" fill="#fff" />
        <path d="M16.6 18l1 1 1.8-2" />
      </>
    )}
  </svg>
);

const MailIcon = () => (
  <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 8l9 6 9-6" />
    <path d="M8 6V4h8v4" />
    <circle cx="12" cy="11" r="1.6" />
  </svg>
);

const IconCircle = ({ children }) => (
  <div
    className="mx-auto mt-8 grid h-44 w-44 place-items-center rounded-full bg-white"
    style={{ boxShadow: '0 0 40px 6px rgba(248, 180, 180, 0.45)' }}
  >
    {children}
  </div>
);

const Header = ({ title, onBack }) => (
  <div className="relative flex items-center justify-center">
    <button
      type="button"
      onClick={onBack}
      className="absolute left-0 p-1 text-2xl leading-none"
      style={{ color: PINK }}
      aria-label="Back"
    >
      <ChevronLeft size={22} />
    </button>
    <h1 className="text-base text-slate-600">{title}</h1>
  </div>
);

const PinkButton = ({ children, ...props }) => (
  <button
    type="button"
    {...props}
    className="w-full rounded-2xl py-3 text-sm text-white shadow disabled:opacity-60"
    style={{ backgroundColor: BUTTON_PINK }}
  >
    {children}
  </button>
);

const FieldBox = ({ label, ...inputProps }) => (
  <label className="relative block">
    <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-slate-500">{label}</span>
    <span className="block rounded-xl border border-pink-300 bg-white px-4 py-2.5">
      <input
        {...inputProps}
        className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-300"
      />
    </span>
  </label>
);

export default function ForgotPassword({ onBack, onDone, initialEmail = '' }) {
  const [step, setStep] = useState('email'); // email | link-sent | reset | done
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const recoveryLink = `${window.location.hash}${window.location.search}`.includes('type=recovery') ||
      window.location.hash.includes('access_token=');
    if (recoveryLink) setStep('reset');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStep('reset');
    });
    return () => subscription.unsubscribe();
  }, []);

  const sendResetLink = async (e) => {
    e?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) {
      setMessage('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setEmail(address);
    setStep('link-sent');
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('The passwords do not match.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await supabase.auth.signOut();
    setStep('done');
  };

  const Message = () =>
    message ? <p className="mt-4 text-center text-xs text-rose-500">{message}</p> : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="flex h-[600px] w-full max-w-xs flex-col rounded-[2.5rem] bg-white p-6 shadow-xl ring-1 ring-slate-200">
        {step === 'email' && (
          <form onSubmit={sendResetLink} className="flex flex-1 flex-col">
            <Header title="Forgot Password" onBack={onBack} />
            <IconCircle>
              <LockIcon badge="question" />
            </IconCircle>
            <p className="mt-8 text-center text-sm leading-relaxed text-slate-800">
              Please Enter Your Email Address To
              <br />
              Receive a password reset link.
            </p>
            <div className="mt-8">
              <FieldBox
                label="Email Address"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Message />
            <div className="mt-auto space-y-6">
              <PinkButton type="submit" disabled={busy}>
                {busy ? 'Sending...' : 'Send'}
              </PinkButton>
            </div>
          </form>
        )}

        {step === 'link-sent' && (
          <div className="flex flex-1 flex-col">
            <Header title="Check Your Email" onBack={() => setStep('email')} />
            <IconCircle>
              <MailIcon />
            </IconCircle>
            <p className="mt-8 text-center text-sm leading-relaxed text-slate-800">
              Open the password reset link sent to
              <br />
              {email}
            </p>
            <Message />
            <div className="mt-auto space-y-4">
              <PinkButton type="button" onClick={() => setStep('email')}>
                Send Again
              </PinkButton>
            </div>
          </div>
        )}

        {step === 'reset' && (
          <form onSubmit={savePassword} className="flex flex-1 flex-col">
            <Header title="Create New Password" onBack={() => setStep('email')} />
            <IconCircle>
              <LockIcon badge="check" />
            </IconCircle>
            <p className="mt-8 text-center text-sm leading-relaxed text-slate-800">
              Your New Password Must Be Different
              <br />
              From Previously Used Password.
            </p>
            <div className="mt-6 space-y-4">
              <FieldBox
                label="New Password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <FieldBox
                label="Confirm Password"
                type="password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Message />
            <div className="mt-auto">
              <p className="mb-6 text-center text-xs underline" style={{ color: PINK }}>
                Change Password
              </p>
              <PinkButton type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Save'}
              </PinkButton>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-1 flex-col">
            <Header title="Password Updated" onBack={onBack} />
            <IconCircle>
              <CheckCircle2 size={90} strokeWidth={1.4} style={{ color: PINK }} />
            </IconCircle>
            <p className="mt-8 text-center text-sm text-slate-800">
              You can now log in with your new password.
            </p>
            <div className="mt-auto">
              <PinkButton type="button" onClick={onDone}>
                Back to Log In
              </PinkButton>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}