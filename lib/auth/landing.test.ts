import { describe, expect, it } from "vitest";
import { resolveAdminLanding } from "./landing";
import type { AuthRepo } from "./repo";
import type { MembershipRef } from "./types";

function repo(admin: boolean, memberships: MembershipRef[]): AuthRepo {
  return {
    findAppUser: async () => null,
    isPlatformAdmin: async () => admin,
    getMembership: async () => null,
    getOrgBySlug: async () => null,
    listMemberships: async () => memberships,
    isDoorForEvent: async () => false,
    getEventOrg: async () => null,
  };
}

const org = { id: "o1", slug: "acme", name: "Acme", role: "staff" as const };

describe("resolveAdminLanding", () => {
  it("platform admin → platform", async () => {
    expect(await resolveAdminLanding(repo(true, [org]), "u")).toEqual({ kind: "platform" });
  });
  it("člen → první organizace", async () => {
    expect(await resolveAdminLanding(repo(false, [org]), "u")).toEqual({
      kind: "org",
      slug: "acme",
    });
  });
  it("bez organizace → none", async () => {
    expect(await resolveAdminLanding(repo(false, []), "u")).toEqual({ kind: "none" });
  });
});
