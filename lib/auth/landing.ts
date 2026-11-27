import type { AuthRepo } from "./repo";

export type AdminLanding = { kind: "platform" } | { kind: "org"; slug: string } | { kind: "none" };

/** Kam patří přihlášený uživatel po vstupu na /admin. */
export async function resolveAdminLanding(repo: AuthRepo, userId: string): Promise<AdminLanding> {
  if (await repo.isPlatformAdmin(userId)) return { kind: "platform" };
  const [first] = await repo.listMemberships(userId);
  return first ? { kind: "org", slug: first.slug } : { kind: "none" };
}
