import "server-only";
import { headers } from "next/headers";
import { forbidden, notFound, redirect } from "next/navigation";
import { loginUrl } from "./redirect";
import { getAuthRepo, type AuthRepo } from "./repo";
import { getSessionUser } from "./session";
import type { EffectiveRole, OrgRef, OrgRole, SessionUser } from "./types";

/** Hlavička, kterou nastavuje proxy.ts (cesta + query) pro `next` v přesměrování na login. */
export const PATHNAME_HEADER = "x-pathname";

export type GuardDeps = {
  getRepo: () => AuthRepo;
  getSessionUser: () => Promise<SessionUser | null>;
  getCurrentPath: () => Promise<string | null>;
};

const STAFF_ROLES: readonly OrgRole[] = ["owner", "staff"];

/**
 * Guardy pro server actions, stránky a layouty.
 * - nepřihlášený (nebo účet bez řádku v `users`) → redirect na /login?next=…
 * - přihlášený ne-člen organizace → notFound() (404, neprozrazuje existenci organizací)
 * - člen se špatnou rolí → forbidden() (403)
 * - platform admin projde všemi guardy
 */
export function createGuards(deps: GuardDeps) {
  async function requireAuthenticated(): Promise<SessionUser> {
    const user = await deps.getSessionUser();
    if (!user) redirect(loginUrl(await deps.getCurrentPath()));
    return user;
  }

  async function requirePlatformAdmin(): Promise<SessionUser> {
    const user = await requireAuthenticated();
    if (!(await deps.getRepo().isPlatformAdmin(user.id))) forbidden();
    return user;
  }

  /** Přihlášený platform admin nebo člen aspoň jedné organizace (libovolná role). */
  async function requireAnyMembership(): Promise<SessionUser> {
    const user = await requireAuthenticated();
    const repo = deps.getRepo();
    if (await repo.isPlatformAdmin(user.id)) return user;
    if ((await repo.listMemberships(user.id)).length === 0) forbidden();
    return user;
  }

  async function requireOrgRole(
    orgId: string,
    roles: readonly OrgRole[],
  ): Promise<{ user: SessionUser; orgId: string; role: EffectiveRole }> {
    const user = await requireAuthenticated();
    const repo = deps.getRepo();
    if (await repo.isPlatformAdmin(user.id)) return { user, orgId, role: "platform_admin" };
    const membership = await repo.getMembership(user.id, orgId);
    if (!membership) notFound();
    if (!roles.includes(membership.role)) forbidden();
    return { user, orgId, role: membership.role };
  }

  async function requireOrgRoleBySlug(
    slug: string,
    roles: readonly OrgRole[],
  ): Promise<{ user: SessionUser; org: OrgRef; role: EffectiveRole }> {
    const user = await requireAuthenticated();
    const repo = deps.getRepo();
    const org = await repo.getOrgBySlug(slug);
    if (!org) notFound();
    if (await repo.isPlatformAdmin(user.id)) return { user, org, role: "platform_admin" };
    const membership = await repo.getMembership(user.id, org.id);
    if (!membership) notFound();
    if (!roles.includes(membership.role)) forbidden();
    return { user, org, role: membership.role };
  }

  /** Door (člen org akce s rolí door + přiřazení k akci), owner/staff organizace akce, nebo platform admin. */
  async function requireDoor(
    eventId: string,
  ): Promise<{ user: SessionUser; organizationId: string; role: EffectiveRole }> {
    const user = await requireAuthenticated();
    const repo = deps.getRepo();
    const eventOrg = await repo.getEventOrg(eventId);
    if (!eventOrg) notFound();
    const organizationId = eventOrg.organizationId;
    if (await repo.isPlatformAdmin(user.id)) {
      return { user, organizationId, role: "platform_admin" };
    }
    const membership = await repo.getMembership(user.id, organizationId);
    if (membership && STAFF_ROLES.includes(membership.role)) {
      return { user, organizationId, role: membership.role };
    }
    // Přiřazení k akci samo nestačí: door musí být i platným členem (role door) organizace akce.
    if (!membership) notFound();
    if (membership.role === "door" && (await repo.isDoorForEvent(user.id, eventId))) {
      return { user, organizationId, role: "door" };
    }
    forbidden();
  }

  return {
    requireAuthenticated,
    requirePlatformAdmin,
    requireAnyMembership,
    requireOrgRole,
    requireOrgRoleBySlug,
    requireDoor,
  };
}

export type Guards = ReturnType<typeof createGuards>;

async function currentPath(): Promise<string | null> {
  try {
    return (await headers()).get(PATHNAME_HEADER);
  } catch {
    return null; // mimo kontext požadavku
  }
}

const guards = createGuards({
  getRepo: getAuthRepo,
  getSessionUser,
  getCurrentPath: currentPath,
});

export const requireAuthenticated = guards.requireAuthenticated;
export const requirePlatformAdmin = guards.requirePlatformAdmin;
export const requireAnyMembership = guards.requireAnyMembership;
export const requireOrgRole = guards.requireOrgRole;
export const requireOrgRoleBySlug = guards.requireOrgRoleBySlug;
export const requireDoor = guards.requireDoor;
