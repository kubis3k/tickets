import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const signOut = vi.fn();
const findAppUser = vi.fn();

vi.mock("@/lib/config/env.client", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { verifyOtp, exchangeCodeForSession, signOut },
  }),
}));
vi.mock("@/lib/auth/repo", () => ({
  getAuthRepo: () => ({ findAppUser }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost:3000/auth/callback?${qs}`);

beforeEach(() => {
  verifyOtp.mockReset();
  exchangeCodeForSession.mockReset();
  signOut.mockReset();
  findAppUser.mockReset().mockResolvedValue({ id: "u", email: "u@x.cz" });
});

describe("GET /auth/callback", () => {
  it("token_hash nepřihlašuje, přesměruje na potvrzovací stránku", async () => {
    const res = await GET(req("token_hash=abc&type=email&next=%2Fadmin%2Facme"));
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/auth/confirm");
    expect(loc.searchParams.get("token_hash")).toBe("abc");
    expect(loc.searchParams.get("next")).toBe("/admin/acme");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("neplatný next se při přesměrování nahradí bezpečným", async () => {
    const res = await GET(req("token_hash=abc&type=email&next=%2F%2Fevil.com"));
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("next")).toBe("/admin");
  });

  it("PKCE code se vymění za session a přesměruje na next", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const res = await GET(req("code=c1&next=%2Fadmin"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("c1");
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/admin");
  });

  it("bez code i token_hash → login s chybou", async () => {
    const res = await GET(req("next=%2Fadmin"));
    expect(res.headers.get("location")).toContain("/login?error=callback");
  });

  it("session bez users a next=/invite/x se ponechá a přesměruje na pozvánku", async () => {
    findAppUser.mockResolvedValue(null);
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "ghost" } }, error: null });
    const res = await GET(req("code=c1&next=%2Finvite%2Fabc"));
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/invite/abc");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("session bez users a next=/admin se odhlásí", async () => {
    findAppUser.mockResolvedValue(null);
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "ghost" } }, error: null });
    const res = await GET(req("code=c1&next=%2Fadmin"));
    expect(res.headers.get("location")).toContain("/login?error=callback");
    expect(signOut).toHaveBeenCalled();
  });
});
