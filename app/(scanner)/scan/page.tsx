import { requireAnyMembership } from "@/lib/auth/guards";
import { cs } from "@/lib/i18n/cs";

export default async function ScanHome() {
  await requireAnyMembership();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{cs.scanner.title}</h1>
      <p className="text-muted-foreground mt-2">{cs.scanner.placeholder}</p>
    </main>
  );
}
