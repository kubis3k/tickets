import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { invitations } from "@/lib/db/schema";
import type { AnyTx } from "@/lib/db/types";

export type RevokeInvitationInput = { invitationId: string; actorId: string; orgId: string };
export type RevokeInvitationResult = { ok: true } | { ok: false; reason: "not_found" };

/** Zruší aktivní pozvánku organizace. Filtr `organization_id` brání zrušení cizí pozvánky. */
export async function revokeInvitation(
  tx: AnyTx,
  input: RevokeInvitationInput,
): Promise<RevokeInvitationResult> {
  const [row] = await tx
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(invitations.id, input.invitationId),
        eq(invitations.organizationId, input.orgId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id, email: invitations.email, role: invitations.role });
  if (!row) return { ok: false, reason: "not_found" };

  await recordAudit(tx, {
    actorId: input.actorId,
    organizationId: input.orgId,
    action: "invitation.revoke",
    entity: "invitation",
    entityId: row.id,
    diff: { email: row.email, role: row.role },
  });
  return { ok: true };
}
