import Link from "next/link";
import type { ReactNode } from "react";
import { requireOrgRoleBySlug } from "@/lib/auth/guards";
import { getAuthRepo } from "@/lib/auth/repo";
import { cs } from "@/lib/i18n/cs";

const linkClass = "font-medium underline-offset-4 hover:underline";

export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { user, org, role } = await requireOrgRoleBySlug(orgSlug, ["owner", "staff"]);
  const isOwner = role === "owner" || role === "platform_admin";
  const t = cs.orgAdmin;
  // Přepínač: jen organizace, kde má uživatel správcovskou roli (door patří do skeneru).
  const memberships = (await getAuthRepo().listMemberships(user.id)).filter(
    (m) => m.role !== "door",
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <span className="text-lg font-semibold">{org.name}</span>
        <details className="relative text-sm">
          <summary className="cursor-pointer select-none">{t.switcherLabel}</summary>
          <ul className="bg-background absolute z-10 mt-1 min-w-48 rounded-md border p-1 shadow-md">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/${m.slug}`}
                  className="hover:bg-accent block rounded px-2 py-1"
                  aria-current={m.slug === org.slug ? "true" : undefined}
                >
                  {m.name}
                </Link>
              </li>
            ))}
            {role === "platform_admin" ? (
              <li>
                <Link href="/admin/platform" className="hover:bg-accent block rounded px-2 py-1">
                  {t.platformLink}
                </Link>
              </li>
            ) : null}
          </ul>
        </details>
      </div>
      <nav aria-label={t.navLabel} className="mb-6 flex gap-4 border-b pb-3 text-sm">
        <Link href={`/admin/${org.slug}`} className={linkClass}>
          {t.navOverview}
        </Link>
        {isOwner ? (
          <>
            <Link href={`/admin/${org.slug}/settings`} className={linkClass}>
              {t.navSettings}
            </Link>
            <Link href={`/admin/${org.slug}/members`} className={linkClass}>
              {t.navMembers}
            </Link>
          </>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
