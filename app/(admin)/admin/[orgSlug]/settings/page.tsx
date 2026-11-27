import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/org-admin/settings-form";
import { requireOrgRoleBySlug } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { cs } from "@/lib/i18n/cs";
import { getOrganization } from "@/lib/orgs/organizations";
import { formatBps, formatHalere } from "@/lib/money/format";
import { updateOrgSettingsAction } from "../actions";

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { org: ref } = await requireOrgRoleBySlug((await params).orgSlug, ["owner"]);
  const org = await getOrganization(getDb(), ref.id);
  if (!org) notFound();
  const t = cs.orgAdmin;
  const dash = "–";
  const managed: [string, string][] = [
    [t.managed.slug, org.slug],
    [t.managed.legalName, org.legalName ?? dash],
    [t.managed.ico, org.ico ?? dash],
    [t.managed.dic, org.dic ?? dash],
    [t.managed.vatPayer, org.vatPayer ? cs.platform.yes : cs.platform.no],
    [t.managed.invoicePrefix, org.invoicePrefix ?? dash],
    [t.managed.fee, `${formatBps(org.feeBps)} + ${formatHalere(org.feeFixed)}`],
    [t.managed.payoutDelayDays, String(org.payoutDelayDays)],
  ];

  return (
    <main className="space-y-8">
      <h1 className="text-2xl font-semibold">{t.settingsTitle}</h1>
      <SettingsForm
        initial={{
          name: org.name,
          street: org.street ?? "",
          city: org.city ?? "",
          zip: org.zip ?? "",
          country: org.country,
          logoUrl: org.logoUrl ?? "",
          primaryColor: org.primaryColor ?? "",
        }}
        action={updateOrgSettingsAction.bind(null, org.slug)}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.sectionManaged}</h2>
        <p className="text-muted-foreground text-sm">{t.managedHint}</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {managed.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
