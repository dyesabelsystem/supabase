import React, { useEffect, useState } from 'react';
import { X, Eye, EyeOff, User, Lock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config';
import { LoadingScreen } from './LoadingScreen';
import { supabase } from '../services/supabaseClient';
import { AUTH_REDIRECT_MESSAGE_KEY } from '../contexts/AuthContext';
import { ACCOUNT_NOT_FOUND_ERROR } from '../services/apiClient';
import { toast } from 'sonner';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const { login, loginWithGoogle, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [view, setView] = useState<'login' | 'forgot_password'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const showLoginError = (message: string) => {
    setError(message);
    toast.error(message, { id: 'email-password-login-error' });
  };

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setView('login');
      setUsername('');
      setPassword('');
      setSuccessMessage('');

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const oauthError = searchParams.get('error') || hashParams.get('error');
      const oauthErrorDescription =
        searchParams.get('error_description') || hashParams.get('error_description');

      if (oauthError) {
        const message = oauthErrorDescription?.includes('No Dyesabel account is associated')
          ? ACCOUNT_NOT_FOUND_ERROR
          : oauthErrorDescription || 'Google sign in failed. Please try again.';

        setError(message);
        toast.error(message, { id: 'google-oauth-error' });

        ['error', 'error_code', 'error_description'].forEach((key) => {
          searchParams.delete(key);
          hashParams.delete(key);
        });

        const nextSearch = searchParams.toString();
        const nextHash = hashParams.toString();
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`
        );
        return;
      }

      const redirectMessage = window.sessionStorage.getItem(AUTH_REDIRECT_MESSAGE_KEY);
      if (redirectMessage) {
        setError(redirectMessage);
        toast.error(redirectMessage, { id: 'google-oauth-error' });
        window.sessionStorage.removeItem(AUTH_REDIRECT_MESSAGE_KEY);
      } else if (!isAuthLoading) {
        setError('');
      }
    }
  }, [isAuthLoading, isOpen]);

  useEffect(() => {
    if (isAuthenticated && isOpen) {
      onClose();
      onLoginSuccess?.();
    }
  }, [isAuthenticated, isOpen, onClose, onLoginSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!username || !password) {
      showLoginError('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    const result = await login(username, password);
    setIsLoading(false);

    if (!result.success) {
      showLoginError(result.error || 'Login failed. Please try again.');
      return;
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const email = username.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setIsLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccessMessage('Password reset instructions were sent if that email is registered.');
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    const result = await loginWithGoogle();
    if (!result.success) {
      setError(result.error || 'Google sign in failed. Please try again.');
      setIsLoading(false);
    }
  };

  const switchToForgotPassword = () => {
    setView('forgot_password');
    setError('');
    setSuccessMessage('');
  };

  const switchToLogin = () => {
    setView('login');
    setError('');
    setSuccessMessage('');
  };

  if (!isOpen && !isVisible) return null;

  return (
    <>
      <div className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
        <div
          className="absolute inset-0 bg-ocean-deep/80 backdrop-blur-md transition-opacity duration-300"
          onClick={onClose}
        />

        <div
          className={`relative max-h-[95vh] sm:max-h-[92vh] w-[95vw] max-w-sm sm:max-w-md overflow-y-auto rounded-xl sm:rounded-2xl border border-white/10 bg-white px-4 sm:px-6 py-6 sm:py-8 shadow-2xl transition-all duration-300 dark:bg-[#051923] custom-scrollbar ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-8 scale-95'}`}
        >
          <button
            onClick={onClose}
            className="absolute right-3 sm:right-4 top-3 sm:top-4 z-10 rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
          >
            <X size={20} />
          </button>

          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center">
              <img
                src={APP_CONFIG.logoUrl}
                alt="Dyesabel Philippines logo"
                className="h-full w-full rounded-full object-contain drop-shadow-md"
              />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-ocean-deep dark:text-white md:text-3xl">
              {view === 'login' ? 'Welcome Back' : 'Reset Password'}
            </h2>
            <p className="mt-2 text-sm font-medium text-ocean-deep/60 dark:text-gray-400">
              {view === 'login' ? 'Sign in to access your dashboard' : 'Enter your email to receive reset instructions'}
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <AlertCircle className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" size={18} />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
              <CheckCircle className="mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" size={18} />
              <p className="text-sm text-green-700 dark:text-green-300">{successMessage}</p>
            </div>
          )}

          {view === 'login' ? (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-3.5 font-bold text-ocean-deep shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
                  <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.8 3-4.4 3-7.5Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.3l-3.2-2.6c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.5 14.1a6 6 0 0 1 0-3.9V7.5H3.2a10 10 0 0 0 0 9.2l3.3-2.6Z" />
                  <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 3.2 7.5l3.3 2.7A5.8 5.8 0 0 1 12 6Z" />
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
                or
                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
              </div>

              <div className="space-y-1.5">
                <label className="ml-1 text-sm font-bold text-ocean-deep dark:text-gray-300">Email</label>
                <div className="group relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-primary-blue" size={18} />
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 font-medium text-ocean-deep transition-all placeholder:font-normal focus:border-primary-cyan focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="ml-1 text-sm font-bold text-ocean-deep dark:text-gray-300">Password</label>
                <div className="group relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-primary-blue" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-12 font-medium text-ocean-deep transition-all placeholder:font-normal focus:border-primary-cyan focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={isLoading}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 transition-colors hover:text-ocean-deep disabled:opacity-50 dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-ocean-deep to-primary-blue py-4 text-lg font-bold tracking-wide text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:from-primary-blue hover:to-primary-cyan hover:shadow-primary-cyan/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none"
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={switchToForgotPassword}
                disabled={isLoading}
                className="w-full text-sm font-semibold text-primary-blue hover:underline disabled:opacity-50 dark:text-primary-cyan"
              >
                Forgot password?
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handlePasswordReset}>
              <div className="space-y-1.5">
                <label className="ml-1 text-sm font-bold text-ocean-deep dark:text-gray-300">Email Address</label>
                <div className="group relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-primary-blue" size={18} />
                  <input
                    type="email"
                    placeholder="Enter your registered email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 font-medium text-ocean-deep transition-all placeholder:font-normal focus:border-primary-cyan focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !username.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ocean-deep to-primary-blue py-4 text-lg font-bold tracking-wide text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:from-primary-blue hover:to-primary-cyan hover:shadow-primary-cyan/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none"
              >
                {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              
              <button
                type="button"
                onClick={switchToLogin}
                disabled={isLoading}
                className="w-full text-sm font-semibold text-primary-blue hover:underline disabled:opacity-50 dark:text-primary-cyan"
              >
                Back to Login
              </button>
            </form>
          )}
        </div>
      </div>

      {isLoading && view === 'login' && (
        <LoadingScreen
          title="Signing You In"
          subtitle="Opening your dashboard"
        />
      )}
    </>
  );
};
