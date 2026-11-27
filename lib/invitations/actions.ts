"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createElement } from "react";
import { requireOrgRole } from "@/lib/auth/guards";
import { getClientEnv } from "@/lib/config/env.client";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { Invite } from "@/lib/email/templates/Invite";
import { sendEmail } from "@/lib/email/send";
import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";
import { inviteMemberSchema, revokeInvitationSchema } from "@/lib/validation/invitations";
import { createInvitation } from "./create";
import { revokeInvitation } from "./revoke";

export type InvitationActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function inviteMemberAction(
  orgId: string,
  formData: FormData,
): Promise<InvitationActionResult> {
  const { user } = await requireOrgRole(orgId, ["owner"]);
  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: cs.invitations.invalidInput };

  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return { ok: false as const, reason: "not_found" as const };
    const result = await createInvitation(tx, {
      orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedBy: user.id,
    });
    return result.ok ? { ...result, org } : result;
  });

  if (!created.ok) {
    return {
      ok: false,
      error:
        created.reason === "already_member"
          ? cs.invitations.alreadyMember
          : cs.invitations.notFound,
    };
  }

  // E-mail až po commitu: token existuje jen v paměti a v odkazu v e-mailu.
  const appUrl = getClientEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  try {
    await sendEmail({
      to: created.email,
      subject: cs.email.invite.subject(brand.name, created.org.name),
      react: createElement(Invite, {
        orgName: created.org.name,
        role: parsed.data.role,
        inviteUrl: `${appUrl}/invite/${created.token}`,
        expiresAt: created.expiresAt,
      }),
    });
  } catch {
    // Bez detailu chyby: může obsahovat adresu příjemce. Opakované pozvání starou pozvánku nahradí.
    console.error("invitation email failed");
    revalidatePath(`/admin/${created.org.slug}/members`);
    return { ok: false, error: cs.invitations.emailFailed };
  }

  revalidatePath(`/admin/${created.org.slug}/members`);
  return { ok: true, message: cs.invitations.inviteSent };
}

export async function revokeInvitationAction(
  orgId: string,
  invitationId: string,
): Promise<InvitationActionResult> {
  const { user } = await requireOrgRole(orgId, ["owner"]);
  const parsed = revokeInvitationSchema.safeParse({ invitationId });
  if (!parsed.success) return { ok: false, error: cs.invitations.notFound };

  const db = getDb();
  const result = await db.transaction((tx) =>
    revokeInvitation(tx, { invitationId: parsed.data.invitationId, actorId: user.id, orgId }),
  );
  if (!result.ok) return { ok: false, error: cs.invitations.notFound };

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (org) revalidatePath(`/admin/${org.slug}/members`);
  return { ok: true, message: cs.invitations.inviteRevoked };
}
