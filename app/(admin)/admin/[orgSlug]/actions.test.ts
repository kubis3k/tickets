import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireOrgRoleBySlug: vi.fn(),
  transaction: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  updateOrgOwnerSettings: vi.fn(),
  inviteMemberAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireOrgRoleBySlug: m.requireOrgRoleBySlug }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ transaction: m.transaction }) }));
vi.mock("@/lib/orgs/members", () => ({
  changeMemberRole: m.changeMemberRole,
  removeMember: m.removeMember,
}));
vi.mock("@/lib/orgs/org-admin", () => ({ updateOrgOwnerSettings: m.updateOrgOwnerSettings }));
vi.mock("@/lib/invitations/actions", () => ({
  inviteMemberAction: m.inviteMemberAction,
  revokeInvitationAction: m.revokeInvitationAction,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import {
  changeMemberRoleAction,
  inviteToOrgAction,
  removeMemberAction,
  revokeOrgInvitationAction,
  updateOrgSettingsAction,
} from "./actions";

const ID = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c1111";
const OTHER_ORG = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c2222";
const GUARD_ORG = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c3333";
const ACTOR = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c4444";
const form = new FormData();
form.set("name", "Moje org");
form.set("email", "a@example.com");
form.set("role", "staff");

const untouched = (): void => {
  expect(m.transaction).not.toHaveBeenCalled();
  expect(m.changeMemberRole).not.toHaveBeenCalled();
  expect(m.removeMember).not.toHaveBeenCalled();
  expect(m.updateOrgOwnerSettings).not.toHaveBeenCalled();
  expect(m.inviteMemberAction).not.toHaveBeenCalled();
  expect(m.revokeInvitationAction).not.toHaveBeenCalled();
  expect(m.revalidatePath).not.toHaveBeenCalled();
  expect(m.redirect).not.toHaveBeenCalled();
};

describe("org admin actions: guard je první (staff/cizí uživatel neprojde)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireOrgRoleBySlug.mockRejectedValue(new Error("forbidden"));
  });

  it("updateOrgSettingsAction", async () => {
    await expect(updateOrgSettingsAction("slug", {}, form)).rejects.toThrow("forbidden");
    untouched();
  });
  it("changeMemberRoleAction", async () => {
    await expect(changeMemberRoleAction("slug", { userId: ID, role: "owner" })).rejects.toThrow(
      "forbidden",
    );
    untouched();
  });
  it("removeMemberAction", async () => {
    await expect(removeMemberAction("slug", { userId: ID })).rejects.toThrow("forbidden");
    untouched();
  });
  it("inviteToOrgAction", async () => {
    await expect(inviteToOrgAction("slug", form)).rejects.toThrow("forbidden");
    untouched();
  });
  it("revokeOrgInvitationAction", async () => {
    await expect(revokeOrgInvitationAction("slug", ID)).rejects.toThrow("forbidden");
    untouched();
  });
});

describe("org admin actions: jen owner a orgId z guardu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireOrgRoleBySlug.mockResolvedValue({
      user: { id: ACTOR },
      org: { id: GUARD_ORG, slug: "moje" },
    });
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn("tx"));
    m.changeMemberRole.mockResolvedValue({ ok: true });
    m.removeMember.mockResolvedValue({ ok: true });
    m.updateOrgOwnerSettings.mockResolvedValue({ ok: true, changed: true });
    m.inviteMemberAction.mockResolvedValue({ ok: true, message: "ok" });
    m.revokeInvitationAction.mockResolvedValue({ ok: true, message: "ok" });
  });

  it("každá akce žádá roli výhradně ['owner'] (staff a door nesmí)", async () => {
    await updateOrgSettingsAction("moje", {}, form);
    await changeMemberRoleAction("moje", { userId: ID, role: "staff" });
    await removeMemberAction("moje", { userId: ID });
    await inviteToOrgAction("moje", form);
    await revokeOrgInvitationAction("moje", ID);
    expect(m.requireOrgRoleBySlug).toHaveBeenCalledTimes(5);
    for (const call of m.requireOrgRoleBySlug.mock.calls) {
      expect(call).toEqual(["moje", ["owner"]]);
    }
  });

  it("orgId ve vstupu (cizí organizace) se ignoruje, použije se org z guardu a actor z guardu", async () => {
    await changeMemberRoleAction("moje", {
      userId: ID,
      role: "staff",
      orgId: OTHER_ORG,
      actorId: OTHER_ORG,
    } as { userId: string; role: string });
    expect(m.changeMemberRole).toHaveBeenCalledWith("tx", {
      orgId: GUARD_ORG,
      userId: ID,
      role: "staff",
      actorId: ACTOR,
    });

    await removeMemberAction("moje", { userId: ID, orgId: OTHER_ORG } as { userId: string });
    expect(m.removeMember).toHaveBeenCalledWith("tx", {
      orgId: GUARD_ORG,
      userId: ID,
      actorId: ACTOR,
    });

    await inviteToOrgAction("moje", form);
    expect(m.inviteMemberAction.mock.calls[0]?.[0]).toBe(GUARD_ORG);
    await revokeOrgInvitationAction("moje", ID);
    expect(m.revokeInvitationAction.mock.calls[0]?.[0]).toBe(GUARD_ORG);
  });

  it("neplatný vstup → chyba a žádná transakce (Zod až po guardu)", async () => {
    const r1 = await changeMemberRoleAction("moje", { userId: "není-uuid", role: "staff" });
    const r2 = await changeMemberRoleAction("moje", { userId: ID, role: "superadmin" });
    const r3 = await removeMemberAction("moje", { userId: "x" });
    const r4 = await revokeOrgInvitationAction("moje", "x");
    for (const r of [r1, r2, r3, r4]) expect(r.ok).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.revokeInvitationAction).not.toHaveBeenCalled();
  });

  it("role 'door' ani cokoli mimo INVITE_ROLES z obejití formuláře projde jen pokud je v enumu", async () => {
    const r = await changeMemberRoleAction("moje", { userId: ID, role: "platform_admin" });
    expect(r.ok).toBe(false);
    expect(m.changeMemberRole).not.toHaveBeenCalled();
  });

  it("poslední owner → chyba z služby se propíše, bez redirectu", async () => {
    m.removeMember.mockResolvedValue({ ok: false, reason: "last_owner" });
    const r = await removeMemberAction("moje", { userId: ID });
    expect(r.ok).toBe(false);
    expect(m.redirect).not.toHaveBeenCalled();
  });
});
