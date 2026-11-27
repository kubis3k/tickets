import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import {
  doorAssignments,
  events,
  memberships,
  organizations,
  platformAdmins,
  users,
} from "@/lib/db/schema";
import type { MembershipRef, OrgRef, OrgRole } from "./types";

export interface AuthRepo {
  findAppUser(id: string): Promise<{ id: string; email: string } | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
  getMembership(userId: string, orgId: string): Promise<{ role: OrgRole } | null>;
  getOrgBySlug(slug: string): Promise<OrgRef | null>;
  listMemberships(userId: string): Promise<MembershipRef[]>;
  isDoorForEvent(userId: string, eventId: string): Promise<boolean>;
  getEventOrg(eventId: string): Promise<{ organizationId: string } | null>;
}

export function createAuthRepo(db: Db): AuthRepo {
  return {
    async findAppUser(id) {
      const [row] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return row ?? null;
    },

    async isPlatformAdmin(userId) {
      const [row] = await db
        .select({ userId: platformAdmins.userId })
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, userId))
        .limit(1);
      return row !== undefined;
    },

    async getMembership(userId, orgId) {
      const [row] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)))
        .limit(1);
      return row ?? null;
    },

    async getOrgBySlug(slug) {
      const [row] = await db
        .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      return row ?? null;
    },

    async listMemberships(userId) {
      return db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(eq(memberships.userId, userId))
        .orderBy(asc(organizations.name), asc(organizations.id));
    },

    async isDoorForEvent(userId, eventId) {
      const [row] = await db
        .select({ userId: doorAssignments.userId })
        .from(doorAssignments)
        .where(and(eq(doorAssignments.userId, userId), eq(doorAssignments.eventId, eventId)))
        .limit(1);
      return row !== undefined;
    },

    async getEventOrg(eventId) {
      const [row] = await db
        .select({ organizationId: events.organizationId })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      return row ?? null;
    },
  };
}

let instance: AuthRepo | undefined;

/** Výchozí implementace nad Drizzle (lazy, aby import nevyžadoval DB). */
export function getAuthRepo(): AuthRepo {
  instance ??= createAuthRepo(getDb());
  return instance;
}
