import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { AuthService } from '../services/DriveService';
import { ACCOUNT_NOT_FOUND_ERROR } from '../services/apiClient';
import { supabase } from '../services/supabaseClient';
import { clearPersistedAppState } from '../utils/appState';
import {
  AUTH_INVALID_EVENT,
  clearSession,
  getClientFingerprint,
  getLastSessionActivity,
  getSessionToken,
  getSessionUser,
  markSessionActivity,
  saveSession,
  updateSessionUser
} from '../utils/session';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  checkPermission: (requiredRole: UserRole, chapterId?: string) => boolean;
  updateCurrentUser: (nextUser: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CLIENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const AUTH_REDIRECT_MESSAGE_KEY = 'dyesabel:auth-redirect-message';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getSessionUser());
  // Auth may still be restoring an OAuth callback even when the app's custom
  // session has not been persisted yet. Keep this true until that check ends so
  // the login modal can show callback failures immediately.
  const [isLoading, setIsLoading] = useState(true);

  const logout = () => {
    const token = getSessionToken();
    setUser(null);
    clearPersistedAppState();
    clearSession();

    if (token) {
      void AuthService.logout(token);
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const token = getSessionToken();
      const isPasswordRecoveryPage = window.location.pathname === '/reset-password';

      if (isPasswordRecoveryPage) {
        setIsLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const activeToken = token || sessionData.session?.access_token || null;

      if (activeToken) {
        try {
          const result = await AuthService.validateSession(activeToken);
          if (result.success && result.user) {
            setUser(result.user);
            saveSession(activeToken, result.user);
            markSessionActivity();
          } else {
            if (!token && sessionData.session) {
              window.sessionStorage.setItem(
                AUTH_REDIRECT_MESSAGE_KEY,
                ACCOUNT_NOT_FOUND_ERROR
              );
            }
            setUser(null);
            clearSession();
            await supabase.auth.signOut({ scope: 'local' });
          }
        } catch {
          if (!token && sessionData.session) {
            window.sessionStorage.setItem(
              AUTH_REDIRECT_MESSAGE_KEY,
              ACCOUNT_NOT_FOUND_ERROR
            );
          }
          setUser(null);
          clearSession();
          await supabase.auth.signOut({ scope: 'local' });
        }
      }
      setIsLoading(false);
    };
    void checkSession();
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await AuthService.login(username, password, getClientFingerprint());

      if (result.success && result.user && result.sessionToken) {
        setUser(result.user);
        saveSession(result.sessionToken, result.user);
        setIsLoading(false);
        return { success: true };
      } else {
        setIsLoading(false);
        return { success: false, error: result.error || 'Invalid credentials' };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      const userFriendlyError = errorMsg.includes('fetch') || errorMsg.includes('Network')
        ? 'Unable to reach server. Please check your internet connection and try again.'
        : 'Connection failed. Please try again.';
      setIsLoading(false);
      return { success: false, error: userFriendlyError };
    }
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    window.sessionStorage.removeItem(AUTH_REDIRECT_MESSAGE_KEY);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    return error
      ? { success: false, error: error.message }
      : { success: true };
  };

  const updateCurrentUser = (nextUser: User) => {
    setUser(nextUser);
    updateSessionUser(nextUser);
  };

  const checkPermission = (requiredRole: UserRole | null, chapterId?: string): boolean => {
    if (!user) return false;
    const isGlobalEditor = user.role === 'editor' && !user.chapterId;
    const isScopedEditor = user.role === 'editor' && !!chapterId && user.chapterId === chapterId;

    // Admin has access to everything
    if (user.role === 'admin') return true;

    // Global editor can manage shared content and all chapters
    if (isGlobalEditor && requiredRole === 'editor') return true;

    // Chapter-scoped editor can manage only their chapter
    if (isScopedEditor && requiredRole === 'chapter_head') return true;

    // Chapter head can edit their specific chapter
    if (user.role === 'chapter_head' && requiredRole === 'chapter_head') {
      if (chapterId && user.chapterId === chapterId) return true;
    }

    return false;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleAuthInvalid = () => logout();
    const activityEvents: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    let idleIntervalId: number | null = null;

    const handleActivity = () => {
      if (!getSessionToken()) {
        return;
      }
      markSessionActivity();
    };

    const checkIdleTimeout = () => {
      const token = getSessionToken();
      if (!token) {
        return;
      }

      const lastActivity = getLastSessionActivity();
      if (lastActivity && Date.now() - lastActivity > CLIENT_IDLE_TIMEOUT_MS) {
        logout();
      }
    };

    window.addEventListener(AUTH_INVALID_EVENT, handleAuthInvalid as EventListener);
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    idleIntervalId = window.setInterval(checkIdleTimeout, 30 * 1000);

    return () => {
      window.removeEventListener(AUTH_INVALID_EVENT, handleAuthInvalid as EventListener);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      if (idleIntervalId !== null) {
        window.clearInterval(idleIntervalId);
      }
    };
  }, [user]);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWithGoogle,
    logout,
    checkPermission,
    updateCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
