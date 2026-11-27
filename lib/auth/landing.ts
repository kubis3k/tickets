import type { AuthRepo } from "./repo";

export type AdminLanding = { kind: "platform" } | { kind: "org"; slug: string } | { kind: "scanner" } | { kind: "none" };

/** Kam patří přihlášený uživatel po vstupu na /admin. */
export async function resolveAdminLanding(repo: AuthRepo, userId: string): Promise<AdminLanding> {
  if (await repo.isPlatformAdmin(userId)) return { kind: "platform" };
  const memberships = await repo.listMemberships(userId);
  // Členství owner/staff má přednost; uživatel jen s rolí door patří do skeneru.
  const staff = memberships.find((m) => m.role !== "door");
  if (staff) return { kind: "org", slug: staff.slug };
  return memberships.length > 0 ? { kind: "scanner" } : { kind: "none" };
}
