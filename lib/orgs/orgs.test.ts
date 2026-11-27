import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLog, memberships, organizations } from "@/lib/db/schema";
import { seedAppUser, seedOrg } from "@/test/db/fixtures";
import { createTestDb } from "@/test/db/pglite";
import { orgInputSchema, orgUpdateSchema, type OrgInput } from "@/lib/validation/org";
import {
  changeMemberRole,
  listOrgMembers,
  listUsersWithMemberships,
  removeMember,
} from "./members";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from "./organizations";

let t: Awaited<ReturnType<typeof createTestDb>>;
let actor: string;
let n = 0;
beforeAll(async () => {
  t = await createTestDb();
  actor = await seedAppUser(t.db, "admin@platform.test");
}, 60_000);

const input = (over: Partial<OrgInput> = {}): OrgInput =>
  orgInputSchema.parse({
    slug: `org-${++n}-test`,
    name: "Org",
    vatPayer: false,
    feeBps: 500,
    feeFixed: 0,
    payoutDelayDays: 2,
    ...over,
  });

const auditCount = async (orgId: string) =>
  (await t.db.select().from(auditLog).where(eq(auditLog.organizationId, orgId))).length;

const updateInput = (o: OrgInput) => {
  const rest = orgUpdateSchema.parse(o);
  return rest;
};

describe("createOrganization / updateOrganization", () => {
  it("create → 1 audit řádek", async () => {
    const r = await t.db.transaction((tx) => createOrganization(tx, input({ ico: "12345678" }), actor));
    if (!r.ok) throw new Error("create failed");
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.organizationId, r.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "organization.create", actorId: actor, entityId: r.id });
    expect((await getOrganization(t.db, r.id))?.ico).toBe("12345678");
  });

  it("duplicitní slug → typovaná chyba, žádný audit řádek navíc", async () => {
    const i = input();
    const first = await t.db.transaction((tx) => createOrganization(tx, i, actor));
    if (!first.ok) throw new Error("create failed");
    const before = await auditCount(first.id);
    const second = await t.db.transaction((tx) => createOrganization(tx, i, actor));
    expect(second).toEqual({ ok: false, reason: "slug_taken" });
    expect(await auditCount(first.id)).toBe(before);
    const all = await listOrganizations(t.db);
    expect(all.filter((o) => o.slug === i.slug)).toHaveLength(1);
  });

  it("selhání po insertu (rollback) → 0 audit řádků a organizace nevznikne", async () => {
    const i = input();
    await expect(
      t.db.transaction(async (tx) => {
        await createOrganization(tx, i, actor);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await t.db.select().from(organizations).where(eq(organizations.slug, i.slug))).toHaveLength(0);
    expect(
      await t.db.select().from(auditLog).where(eq(auditLog.action, "organization.create")).then((r) =>
        r.filter((x) => (x.diff as { slug?: string } | null)?.slug === i.slug),
      ),
    ).toHaveLength(0);
  });

  it("update → audit s diffem jen změněných polí", async () => {
    const i = input();
    const c = await t.db.transaction((tx) => createOrganization(tx, i, actor));
    if (!c.ok) throw new Error("create failed");
    const r = await t.db.transaction((tx) =>
      updateOrganization(tx, c.id, { ...updateInput(i), feeBps: 750, feeFixed: 250 }, actor),
    );
    expect(r).toEqual({ ok: true, changed: true });
    const rows = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, c.id), eq(auditLog.action, "organization.update")));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.diff).toEqual({
      feeBps: { from: 500, to: 750 },
      feeFixed: { from: 0, to: 250 },
    });
    const org = await getOrganization(t.db, c.id);
    expect(org).toMatchObject({ feeBps: 750, feeFixed: 250, slug: i.slug });
  });

  it("update beze změny → žádný audit", async () => {
    const i = input();
    const c = await t.db.transaction((tx) => createOrganization(tx, i, actor));
    if (!c.ok) throw new Error("create failed");
    const r = await t.db.transaction((tx) => updateOrganization(tx, c.id, updateInput(i), actor));
    expect(r).toEqual({ ok: true, changed: false });
    expect(await auditCount(c.id)).toBe(1);
  });

  it("update neexistující organizace → not_found", async () => {
    const r = await t.db.transaction((tx) =>
      updateOrganization(tx, "00000000-0000-4000-8000-000000000000", updateInput(input()), actor),
    );
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("listOrganizations vrací počet členů", async () => {
    const org = await seedOrg(t.db);
    await seedAppUser(t.db, `m${++n}@x.test`, { orgId: org.id, role: "owner" });
    await seedAppUser(t.db, `m${++n}@x.test`, { orgId: org.id, role: "staff" });
    const row = (await listOrganizations(t.db)).find((o) => o.id === org.id);
    expect(row?.memberCount).toBe(2);
  });
});

describe("členové: invariant posledního ownera", () => {
  async function setup() {
    const org = await seedOrg(t.db);
    const owner = await seedAppUser(t.db, `o${++n}@x.test`, { orgId: org.id, role: "owner" });
    const staff = await seedAppUser(t.db, `s${++n}@x.test`, { orgId: org.id, role: "staff" });
    return { org, owner, staff };
  }
  const audits = (orgId: string) => auditCount(orgId);

  it("removeMember posledního ownera → odmítnuto, bez auditu", async () => {
    const { org, owner } = await setup();
    const r = await t.db.transaction((tx) =>
      removeMember(tx, { orgId: org.id, userId: owner, actorId: actor }),
    );
    expect(r).toEqual({ ok: false, reason: "last_owner" });
    expect(await audits(org.id)).toBe(0);
    expect(await listOrgMembers(t.db, org.id)).toHaveLength(2);
  });

  it("změna role posledního ownera na staff → odmítnuto", async () => {
    const { org, owner } = await setup();
    const r = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: owner, role: "staff", actorId: actor }),
    );
    expect(r).toEqual({ ok: false, reason: "last_owner" });
    expect(await audits(org.id)).toBe(0);
  });

  it("se 2 ownery jde odebrat i degradovat; poslední pak ne", async () => {
    const { org, owner, staff } = await setup();
    const promote = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: staff, role: "owner", actorId: actor }),
    );
    expect(promote).toEqual({ ok: true, changed: true });
    const demote = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: owner, role: "door", actorId: actor }),
    );
    expect(demote).toEqual({ ok: true, changed: true });
    const last = await t.db.transaction((tx) =>
      removeMember(tx, { orgId: org.id, userId: staff, actorId: actor }),
    );
    expect(last).toEqual({ ok: false, reason: "last_owner" });
    const rm = await t.db.transaction((tx) =>
      removeMember(tx, { orgId: org.id, userId: owner, actorId: actor }),
    );
    expect(rm).toEqual({ ok: true, changed: true });
    expect(await audits(org.id)).toBe(3);
  });

  it("každá mutace = přesně 1 audit řádek, diff role", async () => {
    const { org, staff } = await setup();
    await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: staff, role: "door", actorId: actor }),
    );
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.organizationId, org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "membership.role_change", entityId: staff });
    expect(rows[0]?.diff).toEqual({ userId: staff, role: { from: "staff", to: "door" } });

    await t.db.transaction((tx) => removeMember(tx, { orgId: org.id, userId: staff, actorId: actor }));
    expect(await audits(org.id)).toBe(2);
  });

  it("stejná role a ne-člen → bez změny / not_member, bez auditu", async () => {
    const { org, staff } = await setup();
    const same = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: staff, role: "staff", actorId: actor }),
    );
    expect(same).toEqual({ ok: true, changed: false });
    const other = await seedAppUser(t.db, `x${++n}@x.test`);
    const nm = await t.db.transaction((tx) =>
      removeMember(tx, { orgId: org.id, userId: other, actorId: actor }),
    );
    expect(nm).toEqual({ ok: false, reason: "not_member" });
    expect(await audits(org.id)).toBe(0);
  });

  it("rollback po mutaci → členství i audit beze změny", async () => {
    const { org, staff } = await setup();
    await expect(
      t.db.transaction(async (tx) => {
        await removeMember(tx, { orgId: org.id, userId: staff, actorId: actor });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await audits(org.id)).toBe(0);
    expect(
      await t.db
        .select()
        .from(memberships)
        .where(and(eq(memberships.organizationId, org.id), eq(memberships.userId, staff))),
    ).toHaveLength(1);
  });

  it("souběh: dva owneři se současně degradují → uspěje jen jeden", async () => {
    const org = await seedOrg(t.db);
    const a = await seedAppUser(t.db, `a${++n}@x.test`, { orgId: org.id, role: "owner" });
    const b = await seedAppUser(t.db, `b${++n}@x.test`, { orgId: org.id, role: "owner" });
    const results = await Promise.all([
      t.db.transaction((tx) =>
        changeMemberRole(tx, { orgId: org.id, userId: a, role: "staff", actorId: actor }),
      ),
      t.db.transaction((tx) =>
        changeMemberRole(tx, { orgId: org.id, userId: b, role: "staff", actorId: actor }),
      ),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const owners = (await listOrgMembers(t.db, org.id)).filter((m) => m.role === "owner");
    expect(owners).toHaveLength(1);
  });

  it("listUsersWithMemberships vrací uživatele s org a rolemi", async () => {
    const org = await seedOrg(t.db, "Zeta");
    const u = await seedAppUser(t.db, `z${++n}@x.test`, { orgId: org.id, role: "door" });
    const found = (await listUsersWithMemberships(t.db)).find((x) => x.id === u);
    expect(found?.memberships).toEqual([
      { orgId: org.id, orgSlug: org.slug, orgName: "Zeta", role: "door" },
    ]);
    expect(found?.isPlatformAdmin).toBe(false);
  });
});
