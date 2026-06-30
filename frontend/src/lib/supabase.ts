import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const SUPABASE_CONFIG_ERROR =
  'Supabase is not configured. Create frontend/.env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';

export function getSupabaseErrorMessage(error: unknown, fallback = 'Unable to connect to Supabase.'): string {
  if (!isSupabaseConfigured) return SUPABASE_CONFIG_ERROR;
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return 'Unable to reach Supabase. Check your internet connection and Supabase project settings.';
    }

    return error.message;
  }
  if (typeof error === 'string') return error;
  return fallback;
}

if (!isSupabaseConfigured) {
  console.warn(
    'Missing Supabase env vars. Copy frontend/.env.example to frontend/.env and add your credentials.',
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
);
