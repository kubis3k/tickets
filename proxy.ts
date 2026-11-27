import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loginUrl } from "@/lib/auth/redirect";
import { getClientEnv } from "@/lib/config/env.client";

// Pozor: proxy NENÍ bezpečnostní hranice. Obnovuje session a odmítá nepřihlášené;
// role a členství vynucují guardy (lib/auth/guards). Žádné DB dotazy.
const PROTECTED_PREFIXES = ["/admin", "/scan"] as const;
const PATHNAME_HEADER = "x-pathname"; // musí odpovídat lib/auth/guards.ts

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  // vždy přepsat, aby klient nemohl hlavičku podvrhnout
  request.headers.set(PATHNAME_HEADER, `${pathname}${search}`);

  let response = NextResponse.next({ request });
  const env = getClientEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Obnoví session (a ověří JWT). Mezi createServerClient a getClaims nesmí být žádný jiný kód.
  const { data } = await supabase.auth.getClaims();
  const authenticated = typeof data?.claims.sub === "string" && data.claims.sub.length > 0;

  if (!authenticated && isProtected(pathname)) {
    const redirect = NextResponse.redirect(new URL(loginUrl(`${pathname}${search}`), request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
