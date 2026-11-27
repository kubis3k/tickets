"use server";

import { redirect } from "next/navigation";
import { requireAuthSession } from "@/lib/auth/guards";
import { loginUrl } from "@/lib/auth/redirect";
import { createSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { getDb } from "@/lib/db/client";
import { cs } from "@/lib/i18n/cs";
import { acceptInvitation } from "@/lib/invitations/accept";
import { getInvitationByToken } from "@/lib/invitations/lookup";
import type { InviteFormState } from "@/lib/invitations/state";
import { inviteAcceptSchema, inviteTokenSchema } from "@/lib/validation/invitations";

function isEmailExists(error: { code?: string; status?: number }): boolean {
  return error.code === "email_exists" || error.status === 422;
}

// public: invite accept (token je autorizace)
export async function acceptInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const rawPassword = formData.get("password");
  const parsed = inviteAcceptSchema.safeParse({
    token: formData.get("token"),
    password: typeof rawPassword === "string" && rawPassword.length > 0 ? rawPassword : undefined,
  });
  if (!parsed.success) {
    const tokenOk = inviteTokenSchema.safeParse(formData.get("token")).success;
    return { error: tokenOk ? cs.invitations.passwordInvalid : cs.invitations.invalidText };
  }
  const { token, password } = parsed.data;

  const db = getDb();
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getUser();

  let acceptor: { id: string; email: string };
  let createdUserId: string | null = null;

  if (sessionData.user?.email) {
    // (b)/(c) přihlášený uživatel: e-mail se porovná v acceptInvitation
    acceptor = { id: sessionData.user.id, email: sessionData.user.email };
  } else {
    // (a) nepřihlášený: účet vzniká jen tady, a to s e-mailem z pozvánky, ne z formuláře
    const invitation = await getInvitationByToken(db, token);
    if (!invitation) return { error: cs.invitations.invalidText };
    if (!password) return { error: cs.invitations.passwordInvalid };

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      if (error && isEmailExists(error)) {
        return {
          error: cs.invitations.accountExists,
          loginHref: loginUrl(`/invite/${token}`),
        };
      }
      return { error: cs.invitations.genericError };
    }
    createdUserId = data.user.id;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: invitation.email,
      password,
    });
    if (signInError) {
      await removeCreatedAccount(createdUserId);
      return { error: cs.invitations.genericError };
    }
    acceptor = { id: data.user.id, email: invitation.email };
  }

  let result: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    result = await db.transaction((tx) =>
      acceptInvitation(tx, { token, authUserId: acceptor.id, authEmail: acceptor.email }),
    );
  } catch (err) {
    if (createdUserId) {
      // Chyba transakce po vytvoření účtu: žádný osiřelý účet ani session.
      await supabase.auth.signOut();
      await removeCreatedAccount(createdUserId);
    }
    throw err;
  }

  if (!result.ok) {
    if (createdUserId) {
      // Souběh (někdo pozvánku mezi tím použil): nenecháme osiřelý účet ani session.
      await supabase.auth.signOut();
      await removeCreatedAccount(createdUserId);
    }
    if (result.reason === "email_mismatch") {
      return { error: cs.invitations.emailMismatchText };
    }
    return {
      error: result.reason === "expired" ? cs.invitations.expiredText : cs.invitations.invalidText,
    };
  }

  redirect(`/admin/${result.orgSlug}`);
}

async function removeCreatedAccount(userId: string): Promise<void> {
  try {
    await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  } catch {
    // Osiřelý auth účet bez řádku v `users` guardem neprojde; nic dalšího nedělat.
  }
}

/** Odhlásí přihlášeného uživatele s jiným e-mailem a vrátí ho na pozvánku přes přihlášení. */
export async function leaveInviteAction(token: string): Promise<void> {
  await requireAuthSession();
  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) redirect("/login");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(loginUrl(`/invite/${parsed.data}`));
}
