import "server-only";
import { cache } from "react";
import { getAuthRepo } from "./repo";
import { createSupabaseServerClient } from "./supabase-server";
import type { SessionUser } from "./types";

/**
 * Přihlášený uživatel aplikace. `getClaims()` ověřuje podpis JWT (asymetrické klíče lokálně,
 * jinak dotazem na Auth server). Identita platí, jen když existuje řádek v `users`:
 * zákaznický nebo osiřelý auth účet admin části neprojde.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const id = data.claims.sub;
  if (typeof id !== "string" || id.length === 0) return null;
  const row = await getAuthRepo().findAppUser(id);
  return row ? { id: row.id, email: row.email } : null;
});

/**
 * Identita ze Supabase session bez kontroly řádku v `users` (jen pro přijetí pozvánky, kde
 * řádek teprve vznikne). `getUser()` ověřuje token na Auth serveru.
 */
export const getAuthSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
});
