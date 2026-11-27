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
  it("jen role door → scanner", async () => {
    const door = { ...org, role: "door" as const };
    expect(await resolveAdminLanding(repo(false, [door]), "u")).toEqual({ kind: "scanner" });
  });
  it("door + staff v jiné org → org (staff má přednost)", async () => {
    const door = { id: "o0", slug: "club", name: "Club", role: "door" as const };
    expect(await resolveAdminLanding(repo(false, [door, org]), "u")).toEqual({
      kind: "org",
      slug: "acme",
    });
  });
  it("platform admin s rolí door → platform", async () => {
    const door = { ...org, role: "door" as const };
    expect(await resolveAdminLanding(repo(true, [door]), "u")).toEqual({ kind: "platform" });
  });
  it("bez organizace → none", async () => {
    expect(await resolveAdminLanding(repo(false, []), "u")).toEqual({ kind: "none" });
  });
});
