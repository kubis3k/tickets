import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(43);

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const getUser = vi.fn();
const signOut = vi.fn();
const signInWithPassword = vi.fn();
const createUser = vi.fn();
const deleteUser = vi.fn();
vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser, signOut, signInWithPassword } }),
}));
vi.mock("@/lib/auth/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { createUser, deleteUser } } }),
}));
const requireAuthSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireAuthSession: () => requireAuthSession() }));

const transaction = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ transaction }) }));
const acceptInvitation = vi.fn();
vi.mock("@/lib/invitations/accept", () => ({
  acceptInvitation: (...a: unknown[]) => acceptInvitation(...a),
}));
const getInvitationByToken = vi.fn();
vi.mock("@/lib/invitations/lookup", () => ({
  getInvitationByToken: (...a: unknown[]) => getInvitationByToken(...a),
}));

import { cs } from "@/lib/i18n/cs";
import { acceptInviteAction, leaveInviteAction } from "./actions";

const form = (password?: string) => {
  const f = new FormData();
  f.set("token", TOKEN);
  if (password) f.set("password", password);
  return f;
};
const prev = {};
const PASSWORD = "heslo-dost-dlouhe-1";

beforeEach(() => {
  for (const m of [
    getUser,
    signOut,
    signInWithPassword,
    createUser,
    deleteUser,
    transaction,
    acceptInvitation,
    getInvitationByToken,
    requireAuthSession,
  ]) {
    m.mockReset();
  }
  redirect.mockReset().mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  deleteUser.mockResolvedValue({});
  signOut.mockResolvedValue({});
  getInvitationByToken.mockResolvedValue({ email: "new@x.cz" });
});

describe("acceptInviteAction", () => {
  it("email_exists vrátí odkaz na login, účet nepřihlašuje ani netransakuje", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422 },
    });
    const res = await acceptInviteAction(prev, form(PASSWORD));
    expect(res.error).toBe(cs.invitations.accountExists);
    expect(res.loginHref).toBe(`/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("chyba tx po createUser smaže účet, odhlásí a rethrowne", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    createUser.mockResolvedValue({ data: { user: { id: "new-id" } }, error: null });
    signInWithPassword.mockResolvedValue({ error: null });
    transaction.mockRejectedValue(new Error("db down"));
    await expect(acceptInviteAction(prev, form(PASSWORD))).rejects.toThrow("db down");
    expect(deleteUser).toHaveBeenCalledWith("new-id");
    expect(signOut).toHaveBeenCalled();
  });

  it("chyba tx u existující session účet nemaže", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@x.cz" } } });
    transaction.mockRejectedValue(new Error("db down"));
    await expect(acceptInviteAction(prev, form())).rejects.toThrow("db down");
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("session bez řádku v users s odpovídajícím e-mailem přijme pozvánku", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "ghost-id", email: "new@x.cz" } } });
    acceptInvitation.mockResolvedValue({ ok: true, orgSlug: "acme" });
    await expect(acceptInviteAction(prev, form())).rejects.toThrow("REDIRECT:/admin/acme");
    expect(acceptInvitation).toHaveBeenCalledWith(expect.anything(), {
      token: TOKEN,
      authUserId: "ghost-id",
      authEmail: "new@x.cz",
    });
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("leaveInviteAction", () => {
  it("session bez users se odhlásí a vrátí na login s návratem na pozvánku", async () => {
    requireAuthSession.mockResolvedValue({ id: "ghost", email: "g@x.cz" });
    await expect(leaveInviteAction(TOKEN)).rejects.toThrow(
      `REDIRECT:/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );
    expect(signOut).toHaveBeenCalled();
  });

  it("nepřihlášený: guard přesměruje, signOut se nevolá", async () => {
    requireAuthSession.mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(leaveInviteAction(TOKEN)).rejects.toThrow("REDIRECT:/login");
    expect(signOut).not.toHaveBeenCalled();
  });
});
