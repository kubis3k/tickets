import { redirect } from "next/navigation";
import { requireAuthenticated } from "@/lib/auth/guards";
import { resolveAdminLanding } from "@/lib/auth/landing";
import { getAuthRepo } from "@/lib/auth/repo";
import { cs } from "@/lib/i18n/cs";

export default async function AdminHome() {
  const user = await requireAuthenticated();
  const landing = await resolveAdminLanding(getAuthRepo(), user.id);
  if (landing.kind === "platform") redirect("/admin/platform");
  if (landing.kind === "scanner") redirect("/scan");
  if (landing.kind === "org") redirect(`/admin/${landing.slug}`);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{cs.admin.noOrganizationTitle}</h1>
      <p className="text-muted-foreground mt-2">{cs.admin.noOrganizationText}</p>
    </main>
  );
}
