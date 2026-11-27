import Link from "next/link";
import { cs } from "@/lib/i18n/cs";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">{cs.auth.forbiddenTitle}</h1>
      <p className="text-muted-foreground mt-2">{cs.auth.forbiddenText}</p>
      <Link href="/admin" className="mt-4 inline-block underline">
        {cs.auth.backToAdmin}
      </Link>
    </main>
  );
}
