import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { invitations, memberships, users } from "@/lib/db/schema";
import type { AnyTx } from "@/lib/db/types";
import { generateToken, hashToken } from "./tokens";
import type { InviteRole } from "./types";

export const INVITATION_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CreateInvitationInput = {
  orgId: string;
  email: string;
  role: InviteRole;
  invitedBy: string;
  /** jen pro testy */
  now?: Date;
};

export type CreateInvitationResult =
  | { ok: true; invitationId: string; token: string; email: string; expiresAt: Date }
  | { ok: false; reason: "already_member" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Vytvoří pozvánku. Volat v transakci; e-mail se posílá až PO commitu (token se vrací jen kvůli němu).
 *
 * Existuje-li aktivní pozvánka pro (org, e-mail), stará se zruší a vznikne nová: správce tak může
 * znovu poslat ztracený odkaz a starý odkaz přestane fungovat (max. jedna aktivní pozvánka).
 * Pokud je e-mail už členem organizace, vrací `already_member`.
 */
export async function createInvitation(
  tx: AnyTx,
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();

  const [member] = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, email), eq(memberships.organizationId, input.orgId)))
    .limit(1);
  if (member) return { ok: false, reason: "already_member" };

  const superseded = await tx
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(invitations.organizationId, input.orgId),
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });
  for (const old of superseded) {
    await recordAudit(tx, {
      actorId: input.invitedBy,
      organizationId: input.orgId,
      action: "invitation.revoke",
      entity: "invitation",
      entityId: old.id,
      diff: { email, reason: "superseded" },
    });
  }

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS);
  const [created] = await tx
    .insert(invitations)
    .values({
      organizationId: input.orgId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .returning({ id: invitations.id });
  if (!created) throw new Error("invitation insert returned no row");

  await recordAudit(tx, {
    actorId: input.invitedBy,
    organizationId: input.orgId,
    action: "invitation.create",
    entity: "invitation",
    entityId: created.id,
    diff: { email, role: input.role, expiresAt: expiresAt.toISOString() },
  });

  return { ok: true, invitationId: created.id, token, email, expiresAt };
}
