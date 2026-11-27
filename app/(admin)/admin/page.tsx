import { cs } from "@/lib/i18n/cs";

export default function AdminHome() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{cs.admin.title}</h1>
      <p className="text-muted-foreground mt-2">{cs.admin.placeholder}</p>
    </main>
  );
}
