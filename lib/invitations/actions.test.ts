import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  sendEmail: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireOrgRole: m.requireOrgRole }));
vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ transaction: m.transaction, select: m.select }),
}));
vi.mock("@/lib/config/env.client", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.sendEmail }));
vi.mock("./create", () => ({ createInvitation: m.createInvitation }));
vi.mock("./revoke", () => ({ revokeInvitation: m.revokeInvitation }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { inviteMemberAction, revokeInvitationAction } from "./actions";

const ORG = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c1111";
const INV = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c2222";

describe("invitation actions: guard je první, jen owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireOrgRole.mockRejectedValue(new Error("forbidden"));
  });

  it("inviteMemberAction: ne-owner → throw, nic se nezapíše ani neodešle", async () => {
    const f = new FormData();
    f.set("email", "a@example.com");
    f.set("role", "staff");
    await expect(inviteMemberAction(ORG, f)).rejects.toThrow("forbidden");
    expect(m.requireOrgRole).toHaveBeenCalledWith(ORG, ["owner"]);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.createInvitation).not.toHaveBeenCalled();
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("revokeInvitationAction: ne-owner → throw, bez transakce", async () => {
    await expect(revokeInvitationAction(ORG, INV)).rejects.toThrow("forbidden");
    expect(m.requireOrgRole).toHaveBeenCalledWith(ORG, ["owner"]);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("invitation actions: validace až po guardu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireOrgRole.mockResolvedValue({ user: { id: "u" } });
  });

  it("neplatný e-mail / role → chyba, žádná transakce, žádný e-mail", async () => {
    for (const [email, role] of [
      ["není-email", "staff"],
      ["a@example.com", "platform_admin"],
      ["", ""],
    ] as const) {
      const f = new FormData();
      f.set("email", email);
      f.set("role", role);
      const r = await inviteMemberAction(ORG, f);
      expect(r.ok).toBe(false);
    }
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("neplatné id pozvánky → chyba bez transakce", async () => {
    const r = await revokeInvitationAction(ORG, "x");
    expect(r.ok).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
