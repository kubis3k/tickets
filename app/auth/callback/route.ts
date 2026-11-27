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

// public: auth callback (výměna kódu / token_hash za session, před přihlášením)
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
  const supabase = await createSupabaseServerClient();

  let userId: string | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? null;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) userId = data.user?.id ?? null;
  }
  if (!userId) return redirectTo("/login?error=callback");

  // Auth účet bez řádku v `users` do administrace nepatří.
  if (!(await getAuthRepo().findAppUser(userId))) {
    await supabase.auth.signOut();
    return redirectTo("/login?error=callback");
  }

  return redirectTo(next);
}
