"use server";

import { redirect } from "next/navigation";
import { getClientEnv } from "@/lib/config/env.client";
import { cs } from "@/lib/i18n/cs";
import type { LoginFormState } from "@/lib/auth/login-state";
import { isInviteNext, safeNext } from "@/lib/auth/redirect";
import { getAuthRepo } from "@/lib/auth/repo";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { magicLinkSchema, passwordLoginSchema } from "@/lib/validation/auth";

// public: login (před přihlášením neexistuje identita)
export async function signInWithPasswordAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: cs.auth.invalidCredentials };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: cs.auth.invalidCredentials };

  // Auth účet bez řádku v `users` (např. zákazník) do administrace nepatří.
  const appUser = await getAuthRepo().findAppUser(data.user.id);
  // Výjimka: návrat na přijetí pozvánky (řádek v `users` vznikne až při přijetí).
  if (!appUser && !isInviteNext(parsed.data.next)) {
    await supabase.auth.signOut();
    return { error: cs.auth.invalidCredentials };
  }

  redirect(safeNext(parsed.data.next));
}

// public: login (odeslání magic linku, odpověď je vždy stejná)
export async function sendMagicLinkAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: cs.auth.invalidEmail };

  const next = safeNext(parsed.data.next);
  const appUrl = getClientEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const supabase = await createSupabaseServerClient();
  // Výsledek se záměrně ignoruje: odpověď nesmí prozradit, zda účet existuje.
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  return { message: cs.auth.magicLinkSent };
}
