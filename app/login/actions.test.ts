import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/config/env.client", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
const signInWithPassword = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword, signOut } }),
}));
const findAppUser = vi.fn();
vi.mock("@/lib/auth/repo", () => ({ getAuthRepo: () => ({ findAppUser }) }));

import { signInWithPasswordAction } from "./actions";

const form = (next: string) => {
  const f = new FormData();
  f.set("email", "g@x.cz");
  f.set("password", "heslo-dost-dlouhe-1");
  f.set("next", next);
  return f;
};

beforeEach(() => {
  signInWithPassword
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "ghost" } }, error: null });
  signOut.mockReset();
  findAppUser.mockReset().mockResolvedValue(null);
});

describe("signInWithPasswordAction: session bez řádku v users", () => {
  it("next=/invite/x ponechá session a přesměruje na pozvánku", async () => {
    await expect(signInWithPasswordAction({}, form("/invite/abc"))).rejects.toThrow(
      "REDIRECT:/invite/abc",
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  it("next=/admin odhlásí", async () => {
    const res = await signInWithPasswordAction({}, form("/admin"));
    expect(res.error).toBeDefined();
    expect(signOut).toHaveBeenCalled();
  });

  it("podvržené next (//invite/x, /invitex) odhlásí", async () => {
    await signInWithPasswordAction({}, form("//invite/x"));
    await signInWithPasswordAction({}, form("/invitex"));
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
