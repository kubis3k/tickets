import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const signOut = vi.fn();
const findAppUser = vi.fn();

vi.mock("@/lib/config/env.client", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, signOut } }),
}));
vi.mock("@/lib/auth/repo", () => ({
  getAuthRepo: () => ({ findAppUser }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

function req(headers: Record<string, string>, next = "/admin"): NextRequest {
  const body = new URLSearchParams({ token_hash: "abc", type: "email", next });
  return new NextRequest("http://localhost:3000/auth/confirm/verify", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  verifyOtp.mockReset();
  verifyOtp.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
  signOut.mockReset();
  findAppUser.mockReset().mockResolvedValue({ id: "u", email: "u@x.cz" });
});

describe("POST /auth/confirm/verify", () => {
  it("bez Origin → 403, token se nepoužije", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(403);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("cizí Origin → 403", async () => {
    const res = await POST(req({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("Sec-Fetch-Site cross-site → 403", async () => {
    const res = await POST(req({ origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("stejný Origin + same-origin → přihlásí a přesměruje", async () => {
    const res = await POST(req({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/admin");
  });

  it("stejný Origin bez Sec-Fetch-Site → projde", async () => {
    const res = await POST(req({ origin: "http://localhost:3000" }));
    expect(res.status).toBe(303);
    expect(verifyOtp).toHaveBeenCalled();
  });

  describe("session bez řádku v users", () => {
    const sameOrigin = { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };
    beforeEach(() => findAppUser.mockResolvedValue(null));

    it("next=/invite/… → session se ponechá a přesměruje na pozvánku", async () => {
      const res = await POST(req(sameOrigin, "/invite/abc"));
      expect(res.status).toBe(303);
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/invite/abc");
      expect(signOut).not.toHaveBeenCalled();
    });

    it("jiné next → odhlášení a /login?error=callback", async () => {
      const res = await POST(req(sameOrigin, "/admin"));
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
      expect(signOut).toHaveBeenCalled();
    });

    it("next=/invite/../admin (traversal) → odhlášení", async () => {
      const res = await POST(req(sameOrigin, "/invite/../admin"));
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
      expect(signOut).toHaveBeenCalled();
    });
  });
});
