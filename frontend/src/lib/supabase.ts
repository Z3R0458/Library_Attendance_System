import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://ozptnxtqjiutsiyetyac.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_2oIiXaaLJ0JGQQzWjm4RKg_akT2gShG';

function cleanEnvValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/g, '');
}

const envSupabaseUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL);
const envSupabaseKey = cleanEnvValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

const supabaseUrl = normalizeSupabaseUrl(envSupabaseUrl || DEFAULT_SUPABASE_URL);
const supabaseKey = (
  envSupabaseKey || DEFAULT_SUPABASE_KEY
).trim();

export const isUsingBundledSupabaseDefaults = !envSupabaseUrl || !envSupabaseKey;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const SUPABASE_CONFIG_ERROR =
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel and frontend/.env.';

export function getSupabaseErrorMessage(error: unknown, fallback = 'Unable to connect to Supabase.'): string {
  if (!isSupabaseConfigured) return SUPABASE_CONFIG_ERROR;
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return `Unable to reach Supabase at ${supabaseUrl}. On Vercel, confirm VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, then redeploy. Also check that the Supabase project is active and reachable from this device.`;
    }

    return error.message;
  }
  if (typeof error === 'string') return error;
  return fallback;
}

if (!isSupabaseConfigured || isUsingBundledSupabaseDefaults) {
  console.warn(
    'Using bundled Supabase defaults. For Vercel, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
