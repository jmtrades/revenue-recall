"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key) for client-side auth flows (OAuth, etc). */
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
