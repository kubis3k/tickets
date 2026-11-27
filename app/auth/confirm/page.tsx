import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";
import { safeNext } from "@/lib/auth/redirect";
import { confirmSchema } from "@/lib/validation/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Neposílat token v Referer na další stránky.
export const metadata = { referrer: "no-referrer" } as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Potvrzovací krok magic linku: GET nic nespotřebuje, přihlášení až po kliknutí (POST). */
export default async function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const parsed = confirmSchema.safeParse({
    token_hash: first(params.token_hash),
    type: first(params.type),
    next: first(params.next),
  });
  if (!parsed.success) redirect("/login?error=callback");

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <p className="text-muted-foreground text-sm">{brand.name}</p>
          <CardTitle className="text-2xl">{cs.auth.confirmTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{cs.auth.confirmText}</p>
          <form method="post" action="/auth/confirm/verify" className="space-y-4">
            <input type="hidden" name="token_hash" value={parsed.data.token_hash} />
            <input type="hidden" name="type" value={parsed.data.type} />
            <input type="hidden" name="next" value={safeNext(parsed.data.next)} />
            <Button type="submit" className="w-full">
              {cs.auth.confirmContinue}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
