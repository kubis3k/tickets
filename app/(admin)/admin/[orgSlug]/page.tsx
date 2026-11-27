import { requireOrgRoleBySlug } from "@/lib/auth/guards";
import { cs } from "@/lib/i18n/cs";

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { org } = await requireOrgRoleBySlug((await params).orgSlug, ["owner", "staff"]);
  return (
    <main className="space-y-2">
      <h1 className="text-2xl font-semibold">{cs.orgAdmin.dashboardTitle(org.name)}</h1>
      <p className="text-muted-foreground">{cs.orgAdmin.dashboardPlaceholder}</p>
    </main>
  );
}
