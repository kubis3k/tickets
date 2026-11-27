import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

import { createGuards } from "./guards";
import type { AuthRepo } from "./repo";
import type { MembershipRef, OrgRole, SessionUser } from "./types";

const ORG_A = { id: "org-a", slug: "a", name: "A" };
const ORG_B = { id: "org-b", slug: "b", name: "B" };
const EVENT_A = "event-a";
const EVENT_B = "event-b";

type World = {
  users: Record<string, string>; // id → email (řádky v `users`)
  admins: string[];
  memberships: { userId: string; orgId: string; role: OrgRole }[];
  doors: { userId: string; eventId: string }[];
};

const world: World = {
  users: {
    admin: "admin@x.cz",
    ownerA: "oa@x.cz",
    staffA: "sa@x.cz",
    doorA: "da@x.cz",
    doorFree: "df@x.cz",
    doorGhost: "dg@x.cz",
    ownerB: "ob@x.cz",
    loner: "l@x.cz",
  },
  admins: ["admin"],
  memberships: [
    { userId: "ownerA", orgId: "org-a", role: "owner" },
    { userId: "staffA", orgId: "org-a", role: "staff" },
    { userId: "doorA", orgId: "org-a", role: "door" },
    { userId: "doorFree", orgId: "org-a", role: "door" },
    { userId: "ownerB", orgId: "org-b", role: "owner" },
  ],
  // doorGhost má přiřazení bez členství (nesmí projít)
  doors: [
    { userId: "doorA", eventId: EVENT_A },
    { userId: "doorGhost", eventId: EVENT_A },
  ],
};

const repo: AuthRepo = {
  findAppUser: async (id) => {
    const email = world.users[id];
    return email ? { id, email } : null;
  },
  isPlatformAdmin: async (id) => world.admins.includes(id),
  getMembership: async (userId, orgId) => {
    const m = world.memberships.find((x) => x.userId === userId && x.orgId === orgId);
    return m ? { role: m.role } : null;
  },
  getOrgBySlug: async (slug) => [ORG_A, ORG_B].find((o) => o.slug === slug) ?? null,
  listMemberships: async (userId): Promise<MembershipRef[]> =>
    world.memberships
      .filter((m) => m.userId === userId)
      .map((m) => ({ ...[ORG_A, ORG_B].find((o) => o.id === m.orgId)!, role: m.role })),
  isDoorForEvent: async (userId, eventId) =>
    world.doors.some((d) => d.userId === userId && d.eventId === eventId),
  getEventOrg: async (eventId) =>
    eventId === EVENT_A
      ? { organizationId: "org-a" }
      : eventId === EVENT_B
        ? { organizationId: "org-b" }
        : null,
};

let sessionId: string | null = null;
let path: string | null = null;

const guards = createGuards({
  getRepo: () => repo,
  getSessionUser: async (): Promise<SessionUser | null> => {
    if (!sessionId) return null;
    const row = await repo.findAppUser(sessionId);
    return row ?? null;
  },
  getCurrentPath: async () => path,
});

const as = (id: string | null) => {
  sessionId = id;
};

beforeEach(() => {
  sessionId = null;
  path = null;
});

describe("requireAuthenticated", () => {
  it("anonym → redirect na /login", async () => {
    await expect(guards.requireAuthenticated()).rejects.toThrow("REDIRECT:/login");
  });
  it("anonym → redirect s next z aktuální cesty", async () => {
    path = "/admin/acme?x=1";
    await expect(guards.requireAuthenticated()).rejects.toThrow(
      "REDIRECT:/login?next=%2Fadmin%2Facme%3Fx%3D1",
    );
  });
  it("podvržená cesta (open redirect) se do next nedostane", async () => {
    path = "//evil.com";
    await expect(guards.requireAuthenticated()).rejects.toThrow(/^REDIRECT:\/login$/);
  });
  it("auth účet bez řádku v users → redirect", async () => {
    as("ghost");
    await expect(guards.requireAuthenticated()).rejects.toThrow("REDIRECT:/login");
  });
  it("uživatel s řádkem projde", async () => {
    as("loner");
    await expect(guards.requireAuthenticated()).resolves.toMatchObject({ id: "loner" });
  });
});

describe("requirePlatformAdmin", () => {
  it("admin projde", async () => {
    as("admin");
    await expect(guards.requirePlatformAdmin()).resolves.toMatchObject({ id: "admin" });
  });
  it("owner → forbidden, anonym → redirect", async () => {
    as("ownerA");
    await expect(guards.requirePlatformAdmin()).rejects.toThrow("FORBIDDEN");
    as(null);
    await expect(guards.requirePlatformAdmin()).rejects.toThrow("REDIRECT:");
  });
});

describe("requireOrgRole / requireOrgRoleBySlug", () => {
  it("anonym → redirect", async () => {
    await expect(guards.requireOrgRole("org-a", ["owner"])).rejects.toThrow("REDIRECT:");
    await expect(guards.requireOrgRoleBySlug("a", ["owner"])).rejects.toThrow("REDIRECT:");
  });
  it("účet bez users řádku → odmítnut", async () => {
    as("ghost");
    await expect(guards.requireOrgRole("org-a", ["owner"])).rejects.toThrow("REDIRECT:");
  });
  it("platform admin projde všude", async () => {
    as("admin");
    await expect(guards.requireOrgRole("org-a", ["owner"])).resolves.toMatchObject({
      role: "platform_admin",
    });
    await expect(guards.requireOrgRoleBySlug("b", ["owner"])).resolves.toMatchObject({
      org: ORG_B,
      role: "platform_admin",
    });
    await expect(guards.requireDoor(EVENT_B)).resolves.toMatchObject({ role: "platform_admin" });
  });
  it("ownerA na org A owner-only OK", async () => {
    as("ownerA");
    await expect(guards.requireOrgRole("org-a", ["owner"])).resolves.toMatchObject({
      role: "owner",
    });
    await expect(guards.requireOrgRoleBySlug("a", ["owner"])).resolves.toMatchObject({
      org: ORG_A,
      role: "owner",
    });
  });
  it("staffA na owner-only → forbidden; na owner+staff OK", async () => {
    as("staffA");
    await expect(guards.requireOrgRole("org-a", ["owner"])).rejects.toThrow("FORBIDDEN");
    await expect(guards.requireOrgRoleBySlug("a", ["owner"])).rejects.toThrow("FORBIDDEN");
    await expect(guards.requireOrgRole("org-a", ["owner", "staff"])).resolves.toBeDefined();
  });
  it("ownerB na org A → notFound", async () => {
    as("ownerB");
    await expect(guards.requireOrgRole("org-a", ["owner", "staff", "door"])).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(guards.requireOrgRoleBySlug("a", ["owner"])).rejects.toThrow("NOT_FOUND");
  });
  it("neexistující slug → notFound", async () => {
    as("ownerA");
    await expect(guards.requireOrgRoleBySlug("zzz", ["owner"])).rejects.toThrow("NOT_FOUND");
  });
});

describe("requireDoor", () => {
  it("anonym → redirect", async () => {
    await expect(guards.requireDoor(EVENT_A)).rejects.toThrow("REDIRECT:");
  });
  it("door bez přiřazení (člen org) → forbidden", async () => {
    as("doorFree");
    await expect(guards.requireDoor(EVENT_A)).rejects.toThrow("FORBIDDEN");
  });
  it("přiřazení k akci bez členství v organizaci → notFound", async () => {
    as("doorGhost");
    await expect(guards.requireDoor(EVENT_A)).rejects.toThrow("NOT_FOUND");
  });
  it("členství door bez přiřazení k akci → odmítnuto", async () => {
    as("doorFree");
    await expect(guards.requireDoor(EVENT_A)).rejects.toThrow("FORBIDDEN");
  });
  it("door s přiřazením OK", async () => {
    as("doorA");
    await expect(guards.requireDoor(EVENT_A)).resolves.toMatchObject({ role: "door" });
  });
  it("door přiřazený k akci A nemá přístup k akci B (jiná org) → notFound", async () => {
    as("doorA");
    await expect(guards.requireDoor(EVENT_B)).rejects.toThrow("NOT_FOUND");
  });
  it("owner a staff org akce OK", async () => {
    as("ownerA");
    await expect(guards.requireDoor(EVENT_A)).resolves.toMatchObject({ role: "owner" });
    as("staffA");
    await expect(guards.requireDoor(EVENT_A)).resolves.toMatchObject({ role: "staff" });
  });
  it("owner cizí org → notFound", async () => {
    as("ownerB");
    await expect(guards.requireDoor(EVENT_A)).rejects.toThrow("NOT_FOUND");
  });
  it("neexistující akce → notFound", async () => {
    as("ownerA");
    await expect(guards.requireDoor("nope")).rejects.toThrow("NOT_FOUND");
  });
});

describe("requireAnyMembership", () => {
  it("člen i platform admin projdou, uživatel bez organizace → forbidden", async () => {
    as("doorA");
    await expect(guards.requireAnyMembership()).resolves.toBeDefined();
    as("admin");
    await expect(guards.requireAnyMembership()).resolves.toBeDefined();
    as("loner");
    await expect(guards.requireAnyMembership()).rejects.toThrow("FORBIDDEN");
    as(null);
    await expect(guards.requireAnyMembership()).rejects.toThrow("REDIRECT:");
  });
});
