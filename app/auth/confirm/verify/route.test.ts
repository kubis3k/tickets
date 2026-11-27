import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();

vi.mock("@/lib/config/env.client", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, signOut: vi.fn() } }),
}));
vi.mock("@/lib/auth/repo", () => ({
  getAuthRepo: () => ({ findAppUser: async () => ({ id: "u", email: "u@x.cz" }) }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

function req(headers: Record<string, string>): NextRequest {
  const body = new URLSearchParams({ token_hash: "abc", type: "email", next: "/admin" });
  return new NextRequest("http://localhost:3000/auth/confirm/verify", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  verifyOtp.mockReset();
  verifyOtp.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
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
});
