import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  transaction: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePlatformAdmin: m.requirePlatformAdmin }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ transaction: m.transaction }) }));
vi.mock("@/lib/orgs/organizations", () => ({
  createOrganization: m.createOrganization,
  updateOrganization: m.updateOrganization,
}));
vi.mock("@/lib/orgs/members", () => ({
  changeMemberRole: m.changeMemberRole,
  removeMember: m.removeMember,
}));
vi.mock("@/lib/invitations/actions", () => ({
  inviteMemberAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import {
  changeMemberRoleAction,
  createOrganizationAction,
  removeMemberAction,
  updateOrganizationAction,
} from "./actions";

const ID = "3f9f1c1e-6a0e-4d6c-9a52-0b1f0a3c1111";
const form = new FormData();
form.set("slug", "moje-org");
form.set("name", "Moje org");
form.set("feePercent", "5");
form.set("feeFixedCzk", "0");
form.set("payoutDelayDays", "2");

describe("platform actions: guard je první", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requirePlatformAdmin.mockRejectedValue(new Error("forbidden"));
  });

  const untouched = (): void => {
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.createOrganization).not.toHaveBeenCalled();
    expect(m.updateOrganization).not.toHaveBeenCalled();
    expect(m.changeMemberRole).not.toHaveBeenCalled();
    expect(m.removeMember).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  };

  it("createOrganizationAction", async () => {
    await expect(createOrganizationAction({}, form)).rejects.toThrow("forbidden");
    untouched();
  });

  it("updateOrganizationAction", async () => {
    await expect(updateOrganizationAction(ID, {}, form)).rejects.toThrow("forbidden");
    untouched();
  });

  it("changeMemberRoleAction", async () => {
    await expect(
      changeMemberRoleAction({ orgId: ID, userId: ID, role: "owner" }),
    ).rejects.toThrow("forbidden");
    untouched();
  });

  it("removeMemberAction", async () => {
    await expect(removeMemberAction({ orgId: ID, userId: ID })).rejects.toThrow("forbidden");
    untouched();
  });
});
