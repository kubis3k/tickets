import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/config/env";
import { getClientEnv } from "@/lib/config/env.client";

/** Service role klient. Obchází RLS. Jen na serveru, jen pro admin operace (např. vytvoření účtu). */
export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(
    getClientEnv().NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
