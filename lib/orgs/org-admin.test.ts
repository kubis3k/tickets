import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLog, memberships, organizations } from "@/lib/db/schema";
import { seedAppUser, seedOrg } from "@/test/db/fixtures";
import { createTestDb } from "@/test/db/pglite";
import { orgOwnerSettingsSchema, type OrgOwnerSettingsInput } from "@/lib/validation/org-owner";
import { changeMemberRole, removeMember } from "./members";
import { updateOrgOwnerSettings } from "./org-admin";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

const settings = (over: Record<string, unknown> = {}): OrgOwnerSettingsInput =>
  orgOwnerSettingsSchema.parse({ name: "Nový název", country: "CZ", ...over });

const getOrg = async (id: string) => {
  const [row] = await t.db.select().from(organizations).where(eq(organizations.id, id));
  if (!row) throw new Error("org missing");
  return row;
};
const audits = (orgId: string) =>
  t.db.select().from(auditLog).where(eq(auditLog.organizationId, orgId));

describe("orgOwnerSettingsSchema", () => {
  it("pole mimo whitelist (poplatky, DPH, IČO, slug, prefix) zahodí", () => {
    const parsed = orgOwnerSettingsSchema.parse({
      name: "X",
      feeBps: 9000,
      feeFixed: 5000,
      vatPayer: true,
      invoicePrefix: "HACK",
      ico: "12345678",
      dic: "CZ12345678",
      slug: "hack",
      payoutDelayDays: 0,
      legalName: "Hack s.r.o.",
    });
    expect(Object.keys(parsed).sort()).toEqual(
      ["city", "country", "logoUrl", "name", "primaryColor", "street", "zip"].sort(),
    );
  });

  it("odmítne http logo a špatnou barvu", () => {
    expect(orgOwnerSettingsSchema.safeParse({ name: "X", logoUrl: "http://a.cz/l.png" }).success).toBe(false);
    expect(orgOwnerSettingsSchema.safeParse({ name: "X", primaryColor: "red" }).success).toBe(false);
  });
});

describe("updateOrgOwnerSettings", () => {
  it("změní jen povolené sloupce, 1 audit řádek jen se změněnými poli", async () => {
    const org = await seedOrg(t.db, "Původní");
    const owner = await seedAppUser(t.db, "o1@x.test", { orgId: org.id, role: "owner" });
    await t.db
      .update(organizations)
      .set({ feeBps: 700, feeFixed: 250, vatPayer: true, invoicePrefix: "ABC", ico: "12345678" })
      .where(eq(organizations.id, org.id));

    // Obejití Zodu: input s navíc poli (non-literal, aby prošel typem) – funkce je musí ignorovat.
    const sneaky = { ...settings({ city: "Brno" }), feeBps: 0, feeFixed: 0, vatPayer: false, ico: null };
    const r = await t.db.transaction((tx) => updateOrgOwnerSettings(tx, org.id, sneaky, owner));
    expect(r).toEqual({ ok: true, changed: true });

    const after = await getOrg(org.id);
    expect(after).toMatchObject({
      name: "Nový název",
      city: "Brno",
      feeBps: 700,
      feeFixed: 250,
      vatPayer: true,
      invoicePrefix: "ABC",
      ico: "12345678",
    });
    const rows = await audits(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "organization.update", actorId: owner });
    expect(Object.keys(rows[0]?.diff as object).sort()).toEqual(["city", "name"]);
  });

  it("beze změny nezapíše audit", async () => {
    const org = await seedOrg(t.db, "Stejný");
    const owner = await seedAppUser(t.db, "o2@x.test", { orgId: org.id, role: "owner" });
    const r = await t.db.transaction((tx) =>
      updateOrgOwnerSettings(tx, org.id, settings({ name: "Stejný" }), owner),
    );
    expect(r).toEqual({ ok: true, changed: false });
    expect(await audits(org.id)).toHaveLength(0);
  });

  it("neexistující organizace → not_found", async () => {
    const owner = await seedAppUser(t.db, "o3@x.test");
    const r = await t.db.transaction((tx) =>
      updateOrgOwnerSettings(tx, "00000000-0000-4000-8000-000000000000", settings(), owner),
    );
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("izolace organizací v členech (orgId z guardu)", () => {
  it("owner org A nemůže změnit roli ani odebrat člena org B", async () => {
    const orgA = await seedOrg(t.db, "A");
    const orgB = await seedOrg(t.db, "B");
    const ownerA = await seedAppUser(t.db, "oa@x.test", { orgId: orgA.id, role: "owner" });
    const ownerB = await seedAppUser(t.db, "ob@x.test", { orgId: orgB.id, role: "owner" });
    const staffB = await seedAppUser(t.db, "sb@x.test", { orgId: orgB.id, role: "staff" });

    const change = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: orgA.id, userId: staffB, role: "owner", actorId: ownerA }),
    );
    expect(change).toEqual({ ok: false, reason: "not_member" });
    const remove = await t.db.transaction((tx) =>
      removeMember(tx, { orgId: orgA.id, userId: ownerB, actorId: ownerA }),
    );
    expect(remove).toEqual({ ok: false, reason: "not_member" });

    const rows = await t.db.select().from(memberships).where(eq(memberships.organizationId, orgB.id));
    expect(rows.map((r) => [r.userId, r.role]).sort()).toEqual(
      [[ownerB, "owner"], [staffB, "staff"]].sort(),
    );
    expect(await audits(orgA.id)).toHaveLength(0);
    expect(await audits(orgB.id)).toHaveLength(0);
  });

  it("owner se smí degradovat, jen pokud zůstane jiný owner", async () => {
    const org = await seedOrg(t.db, "C");
    const a = await seedAppUser(t.db, "ca@x.test", { orgId: org.id, role: "owner" });
    const b = await seedAppUser(t.db, "cb@x.test", { orgId: org.id, role: "owner" });
    const first = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: a, role: "staff", actorId: a }),
    );
    expect(first).toEqual({ ok: true, changed: true });
    const last = await t.db.transaction((tx) =>
      changeMemberRole(tx, { orgId: org.id, userId: b, role: "staff", actorId: b }),
    );
    expect(last).toEqual({ ok: false, reason: "last_owner" });
    const [row] = await t.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, org.id), eq(memberships.userId, b)));
    expect(row?.role).toBe("owner");
  });
});
