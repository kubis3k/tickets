import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLog } from "@/lib/db/schema";
import { createTestDb } from "@/test/db/pglite";
import { seedOrg } from "@/test/db/fixtures";
import { assertNoSecrets, recordAudit } from "./record";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

describe("recordAudit", () => {
  it("zapíše řádek s organizací a diffem", async () => {
    const org = await seedOrg(t.db);
    const entityId = randomUUID();
    await t.db.transaction((tx) =>
      recordAudit(tx, {
        actorId: null,
        organizationId: org.id,
        action: "test.create",
        entity: "thing",
        entityId,
        diff: { name: "x" },
      }),
    );
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: org.id,
      action: "test.create",
      entity: "thing",
      diff: { name: "x" },
    });
  });

  it("výjimka v transakci zruší i audit (0 řádků)", async () => {
    const entityId = randomUUID();
    await expect(
      t.db.transaction(async (tx) => {
        await recordAudit(tx, {
          actorId: null,
          action: "test.rollback",
          entity: "thing",
          entityId,
          diff: { a: 1 },
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
    expect(rows).toHaveLength(0);
  });

  it("odmítne diff s klíčem připomínajícím tajnou hodnotu", async () => {
    for (const diff of [
      { token: "x" },
      { tokenHash: "x" },
      { nested: { password: "x" } },
      { list: [{ api_key: "x" }] },
    ]) {
      expect(() => assertNoSecrets(diff)).toThrow(/tajná/);
    }
    await expect(
      t.db.transaction((tx) =>
        recordAudit(tx, {
          actorId: null,
          action: "test.secret",
          entity: "thing",
          entityId: null,
          diff: { token_hash: "abc" },
        }),
      ),
    ).rejects.toThrow();
    expect(() => assertNoSecrets({ email: "a@b.cz", role: "owner" })).not.toThrow();
  });
});
