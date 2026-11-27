import { and, eq, isNull, sql } from "drizzle-orm";
import { invitations, organizations } from "@/lib/db/schema";
import type { AnyDb } from "@/lib/db/types";
import { hashToken } from "./tokens";
import type { InviteRole } from "./types";

export type ActiveInvitation = {
  invitationId: string;
  organizationId: string;
  orgName: string;
  orgSlug: string;
  role: InviteRole;
  /** Plný e-mail jen pro serverovou logiku (createUser, porovnání). Do UI patří `emailMasked`. */
  email: string;
  emailMasked: string;
  expiresAt: Date;
};

/** `jan.novak@firma.cz` → `j***@firma.cz` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Aktivní (nepřijatá, nezrušená, nevypršelá) pozvánka podle tokenu, jinak `null`. */
export async function getInvitationByToken(
  db: AnyDb,
  token: string,
): Promise<ActiveInvitation | null> {
  const [row] = await db
    .select({
      invitationId: invitations.id,
      organizationId: invitations.organizationId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      role: invitations.role,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        sql`${invitations.expiresAt} > now()`,
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row, emailMasked: maskEmail(row.email) };
}
