import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazily-constructed Supabase client. Returns null when not configured so the
 * app keeps running on the built-in in-memory store. A Supabase-backed
 * CrmProvider can be built on top of this without changing anything upstream.
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}
