import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG, requireConfig } from '../config';

const initialSearch = typeof window === 'undefined'
  ? new URLSearchParams()
  : new URLSearchParams(window.location.search);
const initialHash = typeof window === 'undefined'
  ? new URLSearchParams()
  : new URLSearchParams(window.location.hash.replace(/^#/, ''));

// Capture these before createClient() consumes and removes the auth callback URL.
export const initialRecoveryCallbackDetected =
  (typeof window !== 'undefined' && window.location.pathname === '/reset-password')
  && (
    initialSearch.get('type') === 'recovery'
    || initialHash.get('type') === 'recovery'
    || initialSearch.has('code')
    || initialHash.has('access_token')
  );

export const initialRecoveryError =
  initialSearch.get('error_description')
  || initialHash.get('error_description')
  || '';

export const supabase = createClient(
  requireConfig(APP_CONFIG.supabaseUrl, 'VITE_SUPABASE_URL'),
  requireConfig(APP_CONFIG.supabasePublishableKey, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
