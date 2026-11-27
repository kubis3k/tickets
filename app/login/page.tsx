import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";
import { safeNext } from "@/lib/auth/redirect";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(first(params.next));

  // Přesměruje jen uživatele s řádkem v `users` (osiřelá auth session by jinak cyklila).
  if (await getSessionUser()) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <p className="text-muted-foreground text-sm">{brand.name}</p>
          <CardTitle className="text-2xl">{cs.auth.loginTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {first(params.error) ? (
            <p role="alert" className="text-destructive text-sm">
              {cs.auth.callbackError}
            </p>
          ) : null}
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
