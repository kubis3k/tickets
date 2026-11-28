import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { invitations, memberships, organizations, platformAdmins, users } from "@/lib/db/schema";
import type { AnyDb, AnyTx } from "@/lib/db/types";
import type { InviteRole } from "@/lib/invitations/types";

export type OrgMember = { userId: string; email: string; name: string | null; role: InviteRole };

export type UserWithMemberships = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  memberships: { orgId: string; orgSlug: string; orgName: string; role: InviteRole }[];
};

export type OrgInvitation = {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: Date;
  expired: boolean;
};

export type MemberMutationResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_member" | "last_owner" };

export async function listOrgMembers(db: AnyDb, orgId: string): Promise<OrgMember[]> {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, orgId))
    .orderBy(asc(users.email));
}

/** Čekající pozvánky organizace (nepřijaté, nezrušené); vypršelé jsou označené `expired`. */
export async function listOrgInvitations(db: AnyDb, orgId: string): Promise<OrgInvitation[]> {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      expired: sql<boolean>`${invitations.expiresAt} <= now()`,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, orgId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .orderBy(asc(invitations.expiresAt));
}

/** Všichni uživatelé s jejich členstvími (jen pro platform admina). */
export async function listUsersWithMemberships(db: AnyDb): Promise<UserWithMemberships[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isPlatformAdmin: sql<boolean>`${platformAdmins.userId} IS NOT NULL`,
      orgId: organizations.id,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      role: memberships.role,
    })
    .from(users)
    .leftJoin(platformAdmins, eq(platformAdmins.userId, users.id))
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
    .orderBy(asc(users.email), asc(organizations.name));

  const byId = new Map<string, UserWithMemberships>();
  for (const row of rows) {
    let user = byId.get(row.id);
    if (!user) {
      user = {
        id: row.id,
        email: row.email,
        name: row.name,
        isPlatformAdmin: row.isPlatformAdmin,
        memberships: [],
      };
      byId.set(row.id, user);
    }
    if (row.orgId && row.orgSlug && row.orgName && row.role) {
      user.memberships.push({
        orgId: row.orgId,
        orgSlug: row.orgSlug,
        orgName: row.orgName,
        role: row.role,
      });
    }
  }
  return [...byId.values()];
}

/**
 * Zamkne všechna členství organizace (`FOR UPDATE`) a vrátí je. Souběžná změna rolí/odebrání
 * téže organizace počká na commit; po uvolnění zámku vidí už aktuální data, takže invariant
 * "aspoň 1 owner" nejde obejít souběhem.
 */
async function lockOrgMemberships(tx: AnyTx, orgId: string) {
  return tx
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.organizationId, orgId))
    .for("update");
}

export type ChangeMemberRoleInput = {
  orgId: string;
  userId: string;
  role: InviteRole;
  actorId: string;
};

/** Změní roli člena. Poslední owner nejde degradovat. Změna = přesně 1 audit řádek. Volat v transakci. */
export async function changeMemberRole(
  tx: AnyTx,
  input: ChangeMemberRoleInput,
): Promise<MemberMutationResult> {
  const rows = await lockOrgMemberships(tx, input.orgId);
  const target = rows.find((r) => r.userId === input.userId);
  if (!target) return { ok: false, reason: "not_member" };
  if (target.role === input.role) return { ok: true, changed: false };

  const owners = rows.filter((r) => r.role === "owner").length;
  if (target.role === "owner" && owners <= 1) return { ok: false, reason: "last_owner" };

  await tx
    .update(memberships)
    .set({ role: input.role })
    .where(and(eq(memberships.organizationId, input.orgId), eq(memberships.userId, input.userId)));
  await recordAudit(tx, {
    actorId: input.actorId,
    organizationId: input.orgId,
    action: "membership.role_change",
    entity: "membership",
    entityId: input.userId,
    diff: { userId: input.userId, role: { from: target.role, to: input.role } },
  });
  return { ok: true, changed: true };
}

export type RemoveMemberInput = { orgId: string; userId: string; actorId: string };

/** Odebere člena. Poslední owner nejde odebrat. Odebrání = přesně 1 audit řádek. Volat v transakci. */
export async function removeMember(
  tx: AnyTx,
  input: RemoveMemberInput,
): Promise<MemberMutationResult> {
  const rows = await lockOrgMemberships(tx, input.orgId);
  const target = rows.find((r) => r.userId === input.userId);
  if (!target) return { ok: false, reason: "not_member" };

  const owners = rows.filter((r) => r.role === "owner").length;
  if (target.role === "owner" && owners <= 1) return { ok: false, reason: "last_owner" };

  await tx
    .delete(memberships)
    .where(and(eq(memberships.organizationId, input.orgId), eq(memberships.userId, input.userId)));
  await recordAudit(tx, {
    actorId: input.actorId,
    organizationId: input.orgId,
    action: "membership.remove",
    entity: "membership",
    entityId: input.userId,
    diff: { userId: input.userId, role: target.role },
  });
  return { ok: true, changed: true };
}
