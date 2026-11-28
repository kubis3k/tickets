import { eq, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  auditLog,
  events,
  inventory,
  memberships,
  organizations,
  platformAdmins,
  priceWaves,
  ticketTypes,
  users,
  venues,
} from "@/lib/db/schema";
import { seedAuthUser } from "@/test/db/fixtures";
import { createTestDb } from "@/test/db/pglite";
import { ensureAuthUser, type AuthAdminApi } from "./auth-user";
import { runSeed, SEED_ORG_SLUG } from "./seed";

const tables: PgTable[] = [
  users,
  platformAdmins,
  organizations,
  memberships,
  venues,
  events,
  ticketTypes,
  priceWaves,
  inventory,
  auditLog,
];

let t: Awaited<ReturnType<typeof createTestDb>>;
let adminId: string;
const adminEmail = "Admin@Seed.Test";

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of tables) {
    const [row] = await t.db.select({ n: sql<number>`count(*)::int` }).from(table);
    out[getTableName(table)] = row?.n ?? 0;
  }
  return out;
}

beforeAll(async () => {
  t = await createTestDb();
  adminId = await seedAuthUser(t.db, "admin@seed.test");
}, 60_000);

describe("runSeed", () => {
  it("při druhém běhu nevznikne žádný nový řádek", async () => {
    const first = await runSeed(t.db, { adminAuthUserId: adminId, adminEmail });
    expect(first).toEqual({
      users: 1,
      platformAdmins: 1,
      organizations: 1,
      venues: 1,
      events: 1,
      ticketTypes: 1,
      priceWaves: 1,
      inventory: 1,
    });
    const afterFirst = await counts();

    const second = await runSeed(t.db, { adminAuthUserId: adminId, adminEmail });
    expect(Object.values(second).every((n) => n === 0)).toBe(true);
    expect(await counts()).toEqual(afterFirst);
  });

  it("organizace má správné IČO, DIČ, plátce DPH, prefix a provizi", async () => {
    const [org] = await t.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, SEED_ORG_SLUG));
    expect(org).toMatchObject({
      name: "3Lwave",
      legalName: "Globaal Elevate Production s.r.o.",
      ico: "24972070",
      dic: "CZ24972070",
      vatPayer: true,
      invoicePrefix: "3LW",
      feeBps: 500,
      feeFixed: 0,
    });
  });

  it("admin je platform admin, e-mail je lower-case a není členem organizace", async () => {
    const [user] = await t.db.select().from(users).where(eq(users.id, adminId));
    expect(user?.email).toBe("admin@seed.test");
    const admins = await t.db.select().from(platformAdmins);
    expect(admins.map((a) => a.userId)).toEqual([adminId]);
    expect(await t.db.select().from(memberships)).toHaveLength(0);
  });

  it("inventory.capacity = ticket_types.total_capacity, sold a reserved jsou 0", async () => {
    const [type] = await t.db.select().from(ticketTypes);
    const [inv] = await t.db.select().from(inventory);
    expect(type?.vatRateBps).toBe(1200);
    expect(type?.totalCapacity).toBeGreaterThan(0);
    expect(inv).toMatchObject({
      ticketTypeId: type?.id,
      capacity: type?.totalCapacity,
      sold: 0,
      reserved: 0,
    });
  });

  it("akce je draft v budoucnosti a cenová vlna je v celých haléřích", async () => {
    const [event] = await t.db.select().from(events);
    expect(event?.status).toBe("draft");
    expect(event?.startsAt.getTime()).toBeGreaterThan(Date.now());
    const [wave] = await t.db.select().from(priceWaves);
    expect(wave?.price).toBe(59_900);
  });

  it("opakovaný seed nepřepíše úpravy ani prodej", async () => {
    await t.db.update(organizations).set({ city: "Brno" }).where(eq(organizations.slug, SEED_ORG_SLUG));
    await t.db.update(inventory).set({ sold: 3 });
    await runSeed(t.db, { adminAuthUserId: adminId, adminEmail });
    const [org] = await t.db.select().from(organizations).where(eq(organizations.slug, SEED_ORG_SLUG));
    const [inv] = await t.db.select().from(inventory);
    expect(org?.city).toBe("Brno");
    expect(inv?.sold).toBe(3);
  });

  it("zapíše jediný audit řádek `seed` bez actora", async () => {
    const rows = await t.db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "seed", actorId: null, entity: "organization" });
  });
});

describe("ensureAuthUser", () => {
  function fakeAdmin(existing: { id: string; email: string }[]) {
    const created: { email: string; password?: string }[] = [];
    const api: AuthAdminApi = {
      async listUsers({ page, perPage }) {
        const slice = existing.slice((page - 1) * perPage, page * perPage);
        return { data: { users: slice }, error: null };
      },
      async createUser(attrs) {
        created.push({ email: attrs.email, password: attrs.password });
        return { data: { user: { id: "new-id" } }, error: null };
      },
    };
    return { api, created };
  }

  it("najde existující účet case-insensitive a nic nevytváří", async () => {
    const { api, created } = fakeAdmin([{ id: "u1", email: "Admin@Seed.Test" }]);
    expect(await ensureAuthUser(api, "admin@seed.test", "x")).toEqual({ id: "u1", created: false });
    expect(created).toHaveLength(0);
  });

  it("najde účet na druhé stránce", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.test` }));
    many.push({ id: "target", email: "admin@seed.test" });
    const { api, created } = fakeAdmin(many);
    expect((await ensureAuthUser(api, "admin@seed.test")).id).toBe("target");
    expect(created).toHaveLength(0);
  });

  it("vytvoří účet s heslem jen když je zadané", async () => {
    const withPw = fakeAdmin([]);
    await ensureAuthUser(withPw.api, "A@B.cz", "tajne-heslo-123");
    expect(withPw.created).toEqual([{ email: "a@b.cz", password: "tajne-heslo-123" }]);

    const noPw = fakeAdmin([]);
    await ensureAuthUser(noPw.api, "a@b.cz");
    expect(noPw.created[0]?.password).toBeUndefined();
  });

  it("chyba nenese e-mail ani heslo", async () => {
    const api: AuthAdminApi = {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      createUser: async () => ({ data: { user: null }, error: { code: "boom" } }),
    };
    const err = await ensureAuthUser(api, "secret@x.test", "tajne-heslo-123").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("boom");
    expect(message).not.toContain("secret@x.test");
    expect(message).not.toContain("tajne-heslo-123");
  });
});
