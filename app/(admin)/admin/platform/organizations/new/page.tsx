import { OrgForm } from "@/components/platform/org-form";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { cs } from "@/lib/i18n/cs";
import { EMPTY_ORG_FORM } from "@/lib/orgs/form";
import { createOrganizationAction } from "../../actions";

export default async function NewOrganizationPage() {
  await requirePlatformAdmin();
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{cs.platform.newOrganizationTitle}</h1>
      <OrgForm mode="create" initial={EMPTY_ORG_FORM} action={createOrganizationAction} />
    </main>
  );
}
