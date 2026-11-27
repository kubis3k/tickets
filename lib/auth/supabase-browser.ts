import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/config/env.client";

/** Supabase klient pro prohlížeč (jen anon klíč). */
export function createSupabaseBrowserClient(): SupabaseClient {
  const env = getClientEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
