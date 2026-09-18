import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function isValidSupabaseUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  isValidSupabaseUrl(url) &&
  publishableKey &&
  !publishableKey.includes('your-supabase-anon-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
      global: {
        headers: {
          'X-Client-Info': 'personal-expense-manager/2.0',
        },
      },
    })
  : null;

let sessionPromise = null;

export async function ensureSupabaseSession() {
  if (!supabase) return null;

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data: existing, error: existingError } = await supabase.auth.getSession();
      if (existingError) throw existingError;
      if (existing?.session?.user) return existing.session;

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      if (!data?.session?.user) throw new Error('Supabase did not return an authenticated session.');
      return data.session;
    })().finally(() => {
      sessionPromise = null;
    });
  }

  return sessionPromise;
}
