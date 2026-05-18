import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  url &&
    anonKey &&
    !url.includes('your-project-id') &&
    !anonKey.includes('your-supabase-anon-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function ensureSupabaseSession() {
  if (!supabase) return null;

  const { data: existing, error: existingError } = await supabase.auth.getSession();
  if (existingError) throw existingError;
  if (existing?.session?.user) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
