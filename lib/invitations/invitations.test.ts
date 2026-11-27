import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLog, invitations, memberships, users } from "@/lib/db/schema";
import { seedAppUser, seedAuthUser, seedOrg } from "@/test/db/fixtures";
import { createTestDb } from "@/test/db/pglite";
import { acceptInvitation } from "./accept";
import { createInvitation, INVITATION_TTL_DAYS } from "./create";
import { getInvitationByToken, maskEmail } from "./lookup";
import { revokeInvitation } from "./revoke";
import { generateToken, hashToken } from "./tokens";

let t: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeAll(async () => {
  t = await createTestDb();
  ownerId = await seedAppUser(t.db, "admin@platform.test");
}, 60_000);

let counter = 0;
const nextEmail = () => `user${++counter}@example.test`;

async function invite(
  orgId: string,
  email = nextEmail(),
  role: "owner" | "staff" | "door" = "staff",
) {
  const res = await t.db.transaction((tx) =>
    createInvitation(tx, { orgId, email, role, invitedBy: ownerId }),
  );
  if (!res.ok) throw new Error("create failed");
  return res;
}

const accept = (token: string, authUserId: string, authEmail: string) =>
  t.db.transaction((tx) => acceptInvitation(tx, { token, authUserId, authEmail }));

const auditFor = (orgId: string) =>
  t.db.select().from(auditLog).where(eq(auditLog.organizationId, orgId));

describe("tokens", () => {
  it("generateToken: 43 znaků base64url, unikátní; hashToken: sha256 hex, deterministický", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});

describe("createInvitation", () => {
  it("uloží jen hash (token není v DB nikde), e-mail normalizuje, platnost +7 dní", async () => {
    const org = await seedOrg(t.db);
    const now = new Date("2026-12-01T10:00:00.000Z");
    const res = await t.db.transaction((tx) =>
      createInvitation(tx, {
        orgId: org.id,
        email: "  Jan.Novak@Example.TEST ",
        role: "owner",
        invitedBy: ownerId,
        now,
      }),
    );
    if (!res.ok) throw new Error("expected ok");
    const [row] = await t.db.select().from(invitations).where(eq(invitations.id, res.invitationId));
    expect(row?.email).toBe("jan.novak@example.test");
    expect(row?.tokenHash).toBe(hashToken(res.token));
    expect(row?.expiresAt.getTime()).toBe(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
    expect(INVITATION_TTL_DAYS).toBe(7);

    const dump = JSON.stringify([
      await t.db.select().from(invitations),
      await t.db.select().from(auditLog),
    ]);
    expect(dump).not.toContain(res.token);
    const audit = (await auditFor(org.id)).filter((a) => a.action === "invitation.create");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(res.invitationId);
  });

  it("aktivní pozvánka pro (org, e-mail) se nahradí: stará se zruší, nová funguje", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const first = await invite(org.id, email);
    const second = await invite(org.id, email);
    expect(await getInvitationByToken(t.db, first.token)).toBeNull();
    expect((await getInvitationByToken(t.db, second.token))?.invitationId).toBe(
      second.invitationId,
    );
    const actions = (await auditFor(org.id)).map((a) => a.action).sort();
    expect(actions).toEqual(["invitation.create", "invitation.create", "invitation.revoke"]);
    const userId = await seedAuthUser(t.db, email);
    expect(await accept(first.token, userId, email)).toEqual({ ok: false, reason: "invalid" });
    expect((await accept(second.token, userId, email)).ok).toBe(true);
  });

  it("existující člen organizace → already_member a nic se nezapíše", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    await seedAppUser(t.db, email, { orgId: org.id, role: "staff" });
    const res = await t.db.transaction((tx) =>
      createInvitation(tx, {
        orgId: org.id,
        email: email.toUpperCase(),
        role: "owner",
        invitedBy: ownerId,
      }),
    );
    expect(res).toEqual({ ok: false, reason: "already_member" });
    expect(
      await t.db.select().from(invitations).where(eq(invitations.organizationId, org.id)),
    ).toHaveLength(0);
    expect(await auditFor(org.id)).toHaveLength(0);
  });

  it("člen jiné organizace může být pozván", async () => {
    const orgA = await seedOrg(t.db);
    const orgB = await seedOrg(t.db);
    const email = nextEmail();
    await seedAppUser(t.db, email, { orgId: orgA.id, role: "owner" });
    expect(
      (
        await t.db.transaction((tx) =>
          createInvitation(tx, { orgId: orgB.id, email, role: "staff", invitedBy: ownerId }),
        )
      ).ok,
    ).toBe(true);
  });
});

describe("acceptInvitation", () => {
  it("OK: vznikne users + membership a 2 audit řádky (accept + membership.create)", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email, "staff");
    const authId = await seedAuthUser(t.db, email);

    const res = await accept(inv.token, authId, email.toUpperCase());
    expect(res).toEqual({
      ok: true,
      organizationId: org.id,
      orgSlug: org.slug,
      role: "staff",
      membershipCreated: true,
    });

    const [u] = await t.db.select().from(users).where(eq(users.id, authId));
    expect(u?.email).toBe(email);
    const m = await t.db.select().from(memberships).where(eq(memberships.userId, authId));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ organizationId: org.id, role: "staff" });
    const [row] = await t.db.select().from(invitations).where(eq(invitations.id, inv.invitationId));
    expect(row?.acceptedAt).not.toBeNull();
    expect(row?.acceptedBy).toBe(authId);

    const audit = (await auditFor(org.id)).filter((a) => a.actorId === authId);
    expect(audit.map((a) => a.action).sort()).toEqual(["invitation.accept", "membership.create"]);
    expect(JSON.stringify(audit)).not.toContain(inv.token);
  });

  it("podruhé s týmž tokenem → invalid", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email);
    const authId = await seedAuthUser(t.db, email);
    expect((await accept(inv.token, authId, email)).ok).toBe(true);
    expect(await accept(inv.token, authId, email)).toEqual({ ok: false, reason: "invalid" });
  });

  it("neexistující token → invalid", async () => {
    const authId = await seedAuthUser(t.db, nextEmail());
    expect(await accept(generateToken(), authId, "x@example.test")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("po expiraci → expired a nic se nezapíše", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email);
    await t.db
      .update(invitations)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(invitations.id, inv.invitationId));
    const authId = await seedAuthUser(t.db, email);
    expect(await accept(inv.token, authId, email)).toEqual({ ok: false, reason: "expired" });
    expect(await getInvitationByToken(t.db, inv.token)).toBeNull();
    expect(
      await t.db.select().from(memberships).where(eq(memberships.userId, authId)),
    ).toHaveLength(0);
  });

  it("po revoke → invalid (navenek stejné jako neexistující)", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email);
    const r = await t.db.transaction((tx) =>
      revokeInvitation(tx, { invitationId: inv.invitationId, actorId: ownerId, orgId: org.id }),
    );
    expect(r).toEqual({ ok: true });
    const authId = await seedAuthUser(t.db, email);
    expect(await accept(inv.token, authId, email)).toEqual({ ok: false, reason: "invalid" });
  });

  it("nesoulad e-mailu → email_mismatch, nic se nezapsalo (ani audit, ani users) a pozvánka zůstává platná", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email);
    const otherEmail = nextEmail();
    const otherId = await seedAuthUser(t.db, otherEmail);
    const auditBefore = (await auditFor(org.id)).length;

    expect(await accept(inv.token, otherId, otherEmail)).toEqual({
      ok: false,
      reason: "email_mismatch",
    });
    expect(await t.db.select().from(users).where(eq(users.id, otherId))).toHaveLength(0);
    expect(
      await t.db.select().from(memberships).where(eq(memberships.userId, otherId)),
    ).toHaveLength(0);
    const [row] = await t.db.select().from(invitations).where(eq(invitations.id, inv.invitationId));
    expect(row?.acceptedAt).toBeNull();
    expect(row?.acceptedBy).toBeNull();
    expect((await auditFor(org.id)).length).toBe(auditBefore);

    const rightId = await seedAuthUser(t.db, email);
    expect((await accept(inv.token, rightId, email)).ok).toBe(true);
  });

  it("existující členství se nepřepíše; pozvánka se jen označí, membership.create se nezapíše", async () => {
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email, "door");
    // člen vznikl až po vytvoření pozvánky (např. jinou pozvánkou)
    const userId = await seedAppUser(t.db, email, { orgId: org.id, role: "owner" });
    const res = await accept(inv.token, userId, email);
    expect(res).toMatchObject({ ok: true, role: "door", membershipCreated: false });
    const m = await t.db.select().from(memberships).where(eq(memberships.userId, userId));
    expect(m).toHaveLength(1);
    expect(m[0]?.role).toBe("owner");
    const actions = (await auditFor(org.id))
      .filter((a) => a.actorId === userId)
      .map((a) => a.action);
    expect(actions).toEqual(["invitation.accept"]);
  });

  it("10× souběžný accept → přesně 1 ok, ostatní invalid, 1 membership", async () => {
    // PGlite je jednoprocesová a transakce serializuje, test tedy ověřuje logiku claimu
    // (jedno použití), ne řádkové zámky skutečného Postgresu.
    const org = await seedOrg(t.db);
    const email = nextEmail();
    const inv = await invite(org.id, email);
    const authId = await seedAuthUser(t.db, email);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => accept(inv.token, authId, email)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "invalid")).toHaveLength(9);
    expect(
      await t.db.select().from(memberships).where(eq(memberships.organizationId, org.id)),
    ).toHaveLength(1);
    const acceptAudit = (await auditFor(org.id)).filter((a) => a.action === "invitation.accept");
    expect(acceptAudit).toHaveLength(1);
  });
});

describe("revokeInvitation", () => {
  it("cizí organizace → not_found a pozvánka zůstává aktivní; vlastní → ok + audit", async () => {
    const orgA = await seedOrg(t.db);
    const orgB = await seedOrg(t.db);
    const inv = await invite(orgA.id);
    const wrong = await t.db.transaction((tx) =>
      revokeInvitation(tx, { invitationId: inv.invitationId, actorId: ownerId, orgId: orgB.id }),
    );
    expect(wrong).toEqual({ ok: false, reason: "not_found" });
    expect(await getInvitationByToken(t.db, inv.token)).not.toBeNull();

    const ok = await t.db.transaction((tx) =>
      revokeInvitation(tx, { invitationId: inv.invitationId, actorId: ownerId, orgId: orgA.id }),
    );
    expect(ok).toEqual({ ok: true });
    const revokeAudit = (await auditFor(orgA.id)).filter((a) => a.action === "invitation.revoke");
    expect(revokeAudit).toHaveLength(1);
    expect(await auditFor(orgB.id)).toHaveLength(0);
    // podruhé už není co rušit
    expect(
      await t.db.transaction((tx) =>
        revokeInvitation(tx, { invitationId: inv.invitationId, actorId: ownerId, orgId: orgA.id }),
      ),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("getInvitationByToken", () => {
  it("vrací org, roli, maskovaný e-mail a expiraci jen pro aktivní pozvánku", async () => {
    const org = await seedOrg(t.db, "Pořadatel s.r.o.");
    const email = "karel.novak@example.test";
    const inv = await invite(org.id, email, "owner");
    const found = await getInvitationByToken(t.db, inv.token);
    expect(found).toMatchObject({
      orgName: "Pořadatel s.r.o.",
      orgSlug: org.slug,
      role: "owner",
      email,
      emailMasked: "k***@example.test",
    });
    expect(found?.expiresAt.getTime()).toBe(inv.expiresAt.getTime());

    const authId = await seedAuthUser(t.db, email);
    await accept(inv.token, authId, email);
    expect(await getInvitationByToken(t.db, inv.token)).toBeNull();
    expect(await getInvitationByToken(t.db, "nesmysl")).toBeNull();
  });

  it("maskEmail", () => {
    expect(maskEmail("ab@c.cz")).toBe("a***@c.cz");
    expect(maskEmail("bez-zavinace")).toBe("***");
  });
});
