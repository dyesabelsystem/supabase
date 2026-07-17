import { SESSION_TOKEN_KEY, USER_STORAGE_KEY, User } from '../types';

const SESSION_ACTIVITY_KEY = 'dyesabel_session_last_activity';

export const AUTH_INVALID_EVENT = 'dyesabel:auth-invalid';

let sessionTokenMemory: string | null = null;
let sessionUserMemory: User | null = null;
let hydrated = false;

const hydrateSessionState = () => {
  if (hydrated || typeof window === 'undefined') {
    return;
  }

  hydrated = true;

  const storedToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  sessionTokenMemory = storedToken && storedToken.trim() ? storedToken : null;

  try {
    const storedUser = window.sessionStorage.getItem(USER_STORAGE_KEY);
    sessionUserMemory = storedUser ? JSON.parse(storedUser) as User : null;
  } catch {
    sessionUserMemory = null;
  }
};

const writeSessionState = (token: string | null, user: User | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }

  if (user) {
    window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
  }
};

export const saveSession = (token: string, user: User) => {
  sessionTokenMemory = token;
  sessionUserMemory = user;
  hydrated = true;
  writeSessionState(token, user);
  markSessionActivity();
};

export const clearSession = () => {
  sessionTokenMemory = null;
  sessionUserMemory = null;
  hydrated = true;

  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_ACTIVITY_KEY);
  }
};

export const getSessionToken = (): string | null => {
  hydrateSessionState();
  return sessionTokenMemory;
};

export const getSessionUser = (): User | null => {
  hydrateSessionState();
  return sessionUserMemory;
};

export const updateSessionUser = (nextUser: User) => {
  hydrateSessionState();
  sessionUserMemory = nextUser;
  writeSessionState(sessionTokenMemory, nextUser);
};

export const updateSessionToken = (nextToken: string) => {
  hydrateSessionState();
  const normalizedToken = String(nextToken || '').trim();
  if (!normalizedToken) return;
  sessionTokenMemory = normalizedToken;
  writeSessionState(normalizedToken, sessionUserMemory);
  markSessionActivity();
};

export const markSessionActivity = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
};

export const getLastSessionActivity = (): number | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(SESSION_ACTIVITY_KEY);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const getClientFingerprint = (): string => {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const navigatorValue = window.navigator;
  return [
    navigatorValue.userAgent || '',
    navigatorValue.language || '',
    navigatorValue.platform || '',
    String(window.screen?.width || ''),
    String(window.screen?.height || ''),
    String(new Date().getTimezoneOffset())
  ].join('|').slice(0, 180);
};

export const dispatchAuthInvalidEvent = (error?: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT, { detail: { error: error || 'Unauthorized' } }));
};
