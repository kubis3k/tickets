import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv } from "@/lib/config/env.client";
import { safeNext } from "@/lib/auth/redirect";
import { getAuthRepo } from "@/lib/auth/repo";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { callbackSchema } from "@/lib/validation/auth";

function redirectTo(path: string): NextResponse {
  const base = getClientEnv().NEXT_PUBLIC_APP_URL;
  return NextResponse.redirect(new URL(path, base));
}

// public: auth callback (výměna PKCE kódu za session, token_hash přesměruje na potvrzení)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const parsed = callbackSchema.safeParse({
    code: params.get("code") ?? undefined,
    token_hash: params.get("token_hash") ?? undefined,
    type: params.get("type") ?? undefined,
    next: params.get("next") ?? undefined,
  });
  if (!parsed.success) return redirectTo("/login?error=callback");

  const { code, token_hash: tokenHash, type } = parsed.data;
  const next = safeNext(parsed.data.next);

  // token_hash GET-em nikdy nepřihlašuje (login CSRF, e-mailové skenery/prefetch spotřebují token):
  // přesměruje na potvrzovací stránku, přihlášení proběhne až POSTem na /auth/confirm/verify.
  if (!code && tokenHash && type) {
    const query = new URLSearchParams({ token_hash: tokenHash, type, next });
    return redirectTo(`/auth/confirm?${query.toString()}`);
  }
  if (!code) return redirectTo("/login?error=callback");

  const supabase = await createSupabaseServerClient();
  let userId: string | null = null;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) userId = data.user?.id ?? null;
  if (!userId) return redirectTo("/login?error=callback");

  // Auth účet bez řádku v `users` do administrace nepatří.
  if (!(await getAuthRepo().findAppUser(userId))) {
    await supabase.auth.signOut();
    return redirectTo("/login?error=callback");
  }

  return redirectTo(next);
}
