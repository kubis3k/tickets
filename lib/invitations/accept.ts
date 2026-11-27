import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { invitations, memberships, organizations, users } from "@/lib/db/schema";
import type { AnyTx } from "@/lib/db/types";
import { normalizeEmail } from "./create";
import { hashToken } from "./tokens";
import type { InviteRole } from "./types";

export type AcceptInvitationInput = {
  token: string;
  authUserId: string;
  authEmail: string;
};

export type AcceptInvitationResult =
  | {
      ok: true;
      organizationId: string;
      orgSlug: string;
      role: InviteRole;
      membershipCreated: boolean;
    }
  | { ok: false; reason: "invalid" | "expired" | "email_mismatch" };

/**
 * Přijme pozvánku. Volat v transakci.
 *
 * Claim je jediný atomický UPDATE, který zároveň hlídá platnost, expiraci i shodu e-mailu:
 * při souběhu uspěje přesně jeden. Při neúspěchu se nic nezapíše (pozvánka se nespálí
 * ani při špatném e-mailu). `invalid` pokrývá neexistující, použitou i zrušenou pozvánku.
 *
 * Existující členství se nemění (role se nepřepisuje, ani nesnižuje, ani nezvyšuje);
 * pozvánka se jen označí jako přijatá.
 */
export async function acceptInvitation(
  tx: AnyTx,
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const tokenHash = hashToken(input.token);
  const authEmail = normalizeEmail(input.authEmail);

  const [claimed] = await tx
    .update(invitations)
    .set({ acceptedAt: sql`now()` })
    .where(
      and(
        eq(invitations.tokenHash, tokenHash),
        eq(invitations.email, authEmail),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        sql`${invitations.expiresAt} > now()`,
      ),
    )
    .returning({
      id: invitations.id,
      organizationId: invitations.organizationId,
      role: invitations.role,
    });

  if (!claimed) {
    const [row] = await tx
      .select({
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        expired: sql<boolean>`${invitations.expiresAt} <= now()`,
      })
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.acceptedAt || row.revokedAt) return { ok: false, reason: "invalid" };
    if (row.expired) return { ok: false, reason: "expired" };
    return { ok: false, reason: "email_mismatch" };
  }

  // `accepted_by` má FK na users, takže se doplní až po upsertu users (claim sám nic cizího nezapisuje).
  await tx
    .insert(users)
    .values({ id: input.authUserId, email: authEmail })
    .onConflictDoUpdate({ target: users.id, set: { email: authEmail } });

  await tx
    .update(invitations)
    .set({ acceptedBy: input.authUserId })
    .where(eq(invitations.id, claimed.id));

  const inserted = await tx
    .insert(memberships)
    .values({
      userId: input.authUserId,
      organizationId: claimed.organizationId,
      role: claimed.role,
    })
    .onConflictDoNothing()
    .returning({ userId: memberships.userId });
  const membershipCreated = inserted.length > 0;

  await recordAudit(tx, {
    actorId: input.authUserId,
    organizationId: claimed.organizationId,
    action: "invitation.accept",
    entity: "invitation",
    entityId: claimed.id,
    diff: { role: claimed.role, membershipCreated },
  });
  if (membershipCreated) {
    await recordAudit(tx, {
      actorId: input.authUserId,
      organizationId: claimed.organizationId,
      action: "membership.create",
      entity: "membership",
      entityId: input.authUserId,
      diff: { role: claimed.role, via: "invitation" },
    });
  }

  const [org] = await tx
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, claimed.organizationId))
    .limit(1);
  if (!org) throw new Error("organization of accepted invitation not found");

  return {
    ok: true,
    organizationId: claimed.organizationId,
    orgSlug: org.slug,
    role: claimed.role,
    membershipCreated,
  };
}
