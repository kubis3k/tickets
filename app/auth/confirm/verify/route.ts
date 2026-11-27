import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv } from "@/lib/config/env.client";
import { isInviteNext, safeNext } from "@/lib/auth/redirect";
import { getAuthRepo } from "@/lib/auth/repo";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { confirmSchema } from "@/lib/validation/auth";

function redirectTo(path: string): NextResponse {
  const base = getClientEnv().NEXT_PUBLIC_APP_URL;
  // 303: po POSTu prohlížeč pokračuje GET-em
  return NextResponse.redirect(new URL(path, base), 303);
}

// public: magic link confirm (POST po kliknutí na potvrzovací stránce, před přihlášením)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    origin === null ||
    origin !== new URL(getClientEnv().NEXT_PUBLIC_APP_URL).origin ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const form = await request.formData();
  const parsed = confirmSchema.safeParse({
    token_hash: form.get("token_hash") ?? undefined,
    type: form.get("type") ?? undefined,
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success) return redirectTo("/login?error=callback");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.token_hash,
    type: parsed.data.type,
  });
  const userId = error ? null : (data.user?.id ?? null);
  if (!userId) return redirectTo("/login?error=callback");

  // Auth účet bez řádku v `users` do administrace nepatří.
  // Výjimka: návrat na přijetí pozvánky (řádek v `users` vznikne až při přijetí).
  if (!(await getAuthRepo().findAppUser(userId)) && !isInviteNext(parsed.data.next)) {
    await supabase.auth.signOut();
    return redirectTo("/login?error=callback");
  }

  return redirectTo(safeNext(parsed.data.next));
}
