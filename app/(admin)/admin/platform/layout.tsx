import Link from "next/link";
import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { cs } from "@/lib/i18n/cs";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="mx-auto max-w-6xl p-6">
      <nav aria-label={cs.platform.title} className="mb-6 flex gap-4 border-b pb-3 text-sm">
        <Link href="/admin/platform" className="font-medium underline-offset-4 hover:underline">
          {cs.platform.navOrganizations}
        </Link>
        <Link
          href="/admin/platform/users"
          className="font-medium underline-offset-4 hover:underline"
        >
          {cs.platform.navUsers}
        </Link>
      </nav>
      {children}
    </div>
  );
}
