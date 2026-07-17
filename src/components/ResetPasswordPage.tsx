import React, { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { APP_CONFIG } from '../config';
import {
  initialRecoveryCallbackDetected,
  initialRecoveryError,
  supabase
} from '../services/supabaseClient';
import { LOGIN_PATH } from '../utils/routes';
import { getPasswordRequirements, getPasswordValidationError } from '../utils/password';

type RecoveryStatus = 'checking' | 'ready' | 'invalid' | 'success';

const hasRecoveryParameters = () => {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.get('type') === 'recovery'
    || hash.get('type') === 'recovery'
    || search.has('code')
    || hash.has('access_token');
};

export const ResetPasswordPage: React.FC = () => {
  const [status, setStatus] = useState<RecoveryStatus>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const passwordRequirements = getPasswordRequirements(password);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const urlError =
      initialRecoveryError
      || search.get('error_description')
      || hash.get('error_description');
    const arrivedFromRecoveryLink =
      initialRecoveryCallbackDetected
      || hasRecoveryParameters();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === 'PASSWORD_RECOVERY' && session) {
        setError('');
        setStatus('ready');
      }
    });

    const validateSession = async () => {
      if (urlError) {
        setError(urlError);
        setStatus('invalid');
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setStatus('invalid');
      } else if (arrivedFromRecoveryLink && data.session) {
        setStatus('ready');
      } else {
        setStatus('invalid');
      }
    };

    void validateSession();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const validationError = getPasswordValidationError(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    window.history.replaceState({}, document.title, '/reset-password');
    setPassword('');
    setConfirmPassword('');
    setSubmitting(false);
    setStatus('success');
  };

  const goToLogin = () => {
    window.history.replaceState(null, '', LOGIN_PATH);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-24 text-ocean-deep dark:bg-[#051923] dark:text-white">
      <section className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/10 dark:bg-[#082536]">
        <img src={APP_CONFIG.logoUrl} alt="Dyesabel Philippines logo" className="mx-auto mb-5 h-20 w-20 rounded-full object-contain" />

        {status === 'checking' && <Status icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Verifying your reset link" detail="This should only take a moment." />}
        {status === 'invalid' && (
          <Status
            icon={<AlertCircle className="h-8 w-8 text-red-500" />}
            title="Reset link unavailable"
            detail={error || 'This password reset link is invalid, expired, or has already been used.'}
            action={<Action onClick={goToLogin}>Back to sign in</Action>}
          />
        )}
        {status === 'success' && (
          <Status
            icon={<CheckCircle2 className="h-8 w-8 text-green-500" />}
            title="Password updated"
            detail="Your password has been changed. Sign in with your new password."
            action={<Action onClick={goToLogin}>Continue to sign in</Action>}
          />
        )}
        {status === 'ready' && (
          <>
            <div className="text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-primary-blue dark:text-primary-cyan" />
              <h1 className="mt-4 text-2xl font-black">Create a new password</h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Choose a new password for your account.</p>
            </div>
            {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
            <form onSubmit={submit} className="mt-6 space-y-4">
              <PasswordField label="New password" value={password} visible={showPassword} onChange={setPassword} onToggle={() => setShowPassword((value) => !value)} />
              <PasswordField label="Confirm new password" value={confirmPassword} visible={showConfirmPassword} onChange={setConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
                {passwordRequirements.map((requirement) => (
                  <span key={requirement.key} className={`flex items-center gap-1 text-[10px] ${requirement.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                    <CheckCircle2 className="h-3 w-3" /> {requirement.label}
                  </span>
                ))}
              </div>
              <button type="submit" disabled={submitting || !password || !confirmPassword} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ocean-deep to-primary-blue px-4 py-3.5 font-bold text-white disabled:opacity-50">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
};

const Status = ({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) => (
  <div className="py-4 text-center">
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">{icon}</span>
    <h1 className="mt-5 text-2xl font-black">{title}</h1>
    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
    {action}
  </div>
);

const Action = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="mt-6 w-full rounded-xl bg-ocean-deep px-4 py-3 font-bold text-white dark:bg-white dark:text-ocean-deep">{children}</button>
);

const PasswordField = ({ label, value, visible, onChange, onToggle }: { label: string; value: string; visible: boolean; onChange: (value: string) => void; onToggle: () => void }) => (
  <label className="block text-sm font-bold">
    {label}
    <span className="relative mt-1.5 block">
      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} minLength={12} required autoComplete="new-password" placeholder="At least 12 strong characters" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-12 font-medium outline-none focus:border-primary-cyan focus:ring-2 focus:ring-primary-cyan/40 dark:border-white/10 dark:bg-white/5" />
      <button type="button" onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </span>
  </label>
);
