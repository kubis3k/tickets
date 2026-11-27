import { randomUUID as uuid } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, type TestTx } from "./pglite";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const U = {
  admin: uuid(),
  ownerA: uuid(),
  staffA: uuid(),
  doorA: uuid(),
  ownerB: uuid(),
  orphan: uuid(),
};
const orgA = uuid();
const orgB = uuid();
const evA1 = uuid();
const evA2 = uuid();
const evB1 = uuid();

/** Tabulky, kde authenticated nikdy nesmí vidět žádný řádek (ani vlastní, ani platform admin). */
const NO_ACCESS = [
  "customers",
  "invitations",
  "jobs",
  "stripe_events",
  "invoice_sequences",
  "audit_log",
  "abandoned_checkouts",
];

async function exec(q: string) {
  await t.client.exec(q);
}

/** Seed jedné organizace: akce, typ, objednávka, vstupenka, doklad atd. */
async function seedOrg(org: string, slug: string, events: string[]) {
  await exec(`INSERT INTO organizations (id, slug, name) VALUES ('${org}', '${slug}', '${slug}')`);
  await exec(`INSERT INTO venues (organization_id, name) VALUES ('${org}', 'Klub ${slug}')`);
  await exec(`INSERT INTO invoice_sequences (organization_id, year, last_number) VALUES ('${org}', 2026, 1)`);
  await exec(`INSERT INTO audit_log (organization_id, action, entity) VALUES ('${org}', 'x', 'y')`);
  await exec(`INSERT INTO invitations (organization_id, email, role, token_hash, expires_at)
              VALUES ('${org}', '${slug}@x.cz', 'staff', 'h-${slug}', now())`);
  for (const ev of events) {
    const tt = uuid();
    const order = uuid();
    const item = uuid();
    const ticket = uuid();
    const inv = uuid();
    const res = uuid();
    await exec(`INSERT INTO events (id, organization_id, slug, name, starts_at) VALUES ('${ev}', '${org}', 'e-${ev}', 'E', now())`);
    await exec(`INSERT INTO ticket_types (id, event_id, organization_id, name) VALUES ('${tt}', '${ev}', '${org}', 'GA')`);
    await exec(`INSERT INTO inventory (ticket_type_id, capacity) VALUES ('${tt}', 10)`);
    await exec(`INSERT INTO price_waves (ticket_type_id, price, starts_at) VALUES ('${tt}', 100, now())`);
    await exec(`INSERT INTO promo_codes (event_id, organization_id, code, type, value) VALUES ('${ev}', '${org}', 'P', 'fixed', 100)`);
    await exec(`INSERT INTO reservations (id, event_id, session_id, items, expires_at) VALUES ('${res}', '${ev}', 's', '[]', now())`);
    await exec(`INSERT INTO abandoned_checkouts (reservation_id, email, expires_at) VALUES ('${res}', 'a@b.cz', now())`);
    await exec(`INSERT INTO orders (id, organization_id, event_id, email, subtotal, total) VALUES ('${order}', '${org}', '${ev}', 'a@b.cz', 100, 100)`);
    await exec(`INSERT INTO order_items (id, order_id, ticket_type_id, unit_price, qty, vat_rate_bps) VALUES ('${item}', '${order}', '${tt}', 100, 1, 1200)`);
    await exec(`INSERT INTO tickets (id, order_id, order_item_id, ticket_type_id, event_id, organization_id, code)
                VALUES ('${ticket}', '${order}', '${item}', '${tt}', '${ev}', '${org}', 'code-${ticket}')`);
    await exec(`INSERT INTO ticket_transfers (ticket_id, to_email, old_code, new_code) VALUES ('${ticket}', 'b@c.cz', 'o', 'n')`);
    await exec(`INSERT INTO checkins (ticket_id, event_id, organization_id, device_id, scanned_at, result)
                VALUES ('${ticket}', '${ev}', '${org}', 'd', now(), 'ok')`);
    await exec(`INSERT INTO invoices (id, organization_id, order_id, number, type, issued_at, totals, issuer_snapshot)
                VALUES ('${inv}', '${org}', '${order}', 'N-${inv}', 'invoice', now(), '{}', '{}')`);
    await exec(`INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit_price, vat_rate_bps, base_amount, vat_amount, total_amount)
                VALUES ('${inv}', 1, 'l', 1, 100, 1200, 89, 11, 100)`);
    await exec(`INSERT INTO refunds (organization_id, order_id, stripe_refund_id, amount) VALUES ('${org}', '${order}', 're_${order}', 10)`);
    await exec(`INSERT INTO settlements (event_id, organization_id) VALUES ('${ev}', '${org}')`);
  }
}

beforeAll(async () => {
  t = await createTestDb();
  for (const [k, id] of Object.entries(U)) {
    await exec(`INSERT INTO auth.users (id, email) VALUES ('${id}', '${k.toLowerCase()}@x.cz')`);
    if (k !== "orphan") await exec(`INSERT INTO users (id, email) VALUES ('${id}', '${k.toLowerCase()}@x.cz')`);
  }
  await exec(`INSERT INTO platform_admins (user_id) VALUES ('${U.admin}')`);
  await seedOrg(orgA, "a", [evA1, evA2]);
  await seedOrg(orgB, "b", [evB1]);
  await exec(`INSERT INTO memberships (user_id, organization_id, role) VALUES
    ('${U.ownerA}', '${orgA}', 'owner'), ('${U.staffA}', '${orgA}', 'staff'),
    ('${U.doorA}', '${orgA}', 'door'), ('${U.ownerB}', '${orgB}', 'owner')`);
  await exec(`INSERT INTO door_assignments (user_id, event_id) VALUES ('${U.doorA}', '${evA1}')`);
  await exec(`INSERT INTO customers (email) VALUES ('zakaznik@x.cz')`);
  await exec(`INSERT INTO jobs (type) VALUES ('mail')`);
  await exec(`INSERT INTO stripe_events (id, type) VALUES ('evt_1', 'x')`);
});
afterAll(async () => {
  await t.client.close();
});

async function publicTables(): Promise<{ name: string; hasOrg: boolean }[]> {
  const res = await t.db.execute(sql`
    SELECT p.tablename AS name,
           EXISTS (SELECT 1 FROM information_schema.columns c
                   WHERE c.table_schema = 'public' AND c.table_name = p.tablename
                     AND c.column_name = 'organization_id') AS "hasOrg"
    FROM pg_tables p WHERE p.schemaname = 'public' ORDER BY 1`);
  return res.rows as { name: string; hasOrg: boolean }[];
}

/** Počet řádků; "permission denied" = 0 (obojí znamená, že data nevidí). */
async function count(uid: string | null, table: string, where = "true"): Promise<number> {
  try {
    return await asUser(t.db, uid, async (tx: TestTx) => {
      const r = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM public."${table}" WHERE ${where}`));
      return (r.rows[0] as { n: number }).n;
    });
  } catch (e) {
    const err = e as Error & { cause?: Error };
    if (/permission denied/.test(`${err.message} ${err.cause?.message ?? ""}`)) return 0;
    throw e;
  }
}

describe("RLS", () => {
  it("DB má 28 tabulek, všechny s RLS", async () => {
    expect(await publicTables()).toHaveLength(28);
    const res = await t.db.execute(
      sql`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`,
    );
    expect((res.rows[0] as { n: number }).n).toBe(0);
  });

  it("asUser nastaví roli a JWT sub, po transakci se role vrátí", async () => {
    const inside = await asUser(t.db, U.ownerA, async (tx) => {
      const r = await tx.execute(sql`SELECT current_user AS u, auth.uid()::text AS uid`);
      return r.rows[0] as { u: string; uid: string };
    });
    expect(inside).toEqual({ u: "authenticated", uid: U.ownerA });
    const after = await t.db.execute(sql`SELECT current_user AS u, auth.uid() AS uid`);
    expect((after.rows[0] as { u: string }).u).not.toBe("authenticated");
    expect((after.rows[0] as { uid: string | null }).uid).toBeNull();
  });

  it("anon nevidí žádný řádek v žádné tabulce", async () => {
    for (const { name } of await publicTables()) {
      expect(await count(null, name), name).toBe(0);
    }
  });

  it("orphan (auth.users bez řádku v users) nevidí nic", async () => {
    for (const { name } of await publicTables()) {
      expect(await count(U.orphan, name), name).toBe(0);
    }
  });

  it("customers/invitations/jobs/stripe_events/invoice_sequences/audit_log/abandoned_checkouts: authenticated 0 řádků", async () => {
    for (const table of NO_ACCESS) {
      for (const uid of [U.ownerA, U.staffA, U.doorA, U.admin]) {
        expect(await count(uid, table), `${table} ${uid}`).toBe(0);
      }
    }
  });

  it("ownerA: v tabulkách s organization_id 0 řádků org B, vlastní data vidí", async () => {
    const withData = [
      "venues", "events", "ticket_types", "promo_codes", "orders", "tickets", "checkins", "invoices", "refunds", "settlements",
    ];
    for (const { name, hasOrg } of await publicTables()) {
      if (!hasOrg || NO_ACCESS.includes(name)) continue;
      expect(await count(U.ownerA, name, `organization_id = '${orgB}'`), `${name} org B`).toBe(0);
      if (withData.includes(name)) {
        expect(await count(U.ownerA, name, `organization_id = '${orgA}'`), `${name} org A`).toBeGreaterThan(0);
      }
    }
    expect(await count(U.ownerA, "organizations")).toBe(1);
    expect(await count(U.ownerA, "organizations", `id = '${orgB}'`)).toBe(0);
  });

  it("ownerA/staffA: child tabulky bez organization_id vidí jen svoje (2 akce org A)", async () => {
    for (const uid of [U.ownerA, U.staffA]) {
      for (const table of [
        "orders", "order_items", "inventory", "price_waves", "ticket_transfers", "reservations", "invoice_lines",
      ]) {
        expect(await count(uid, table), table).toBe(2);
      }
    }
  });

  it("ownerA: memberships jen vlastní org, users jen sdílející org, platform_admins nic", async () => {
    expect(await count(U.ownerA, "memberships")).toBe(3);
    expect(await count(U.ownerA, "memberships", `organization_id = '${orgB}'`)).toBe(0);
    expect(await count(U.ownerA, "users")).toBe(3);
    expect(await count(U.ownerA, "users", `id IN ('${U.ownerB}', '${U.admin}', '${U.orphan}')`)).toBe(0);
    expect(await count(U.ownerA, "platform_admins")).toBe(0);
    expect(await count(U.admin, "platform_admins")).toBe(1);
  });

  it("door_assignments: owner své org ano, cizí org ne", async () => {
    expect(await count(U.ownerA, "door_assignments")).toBe(1);
    expect(await count(U.ownerB, "door_assignments")).toBe(0);
  });

  it("doorA: tickets/checkins/events jen přiřazené akce A1, ne A2", async () => {
    expect(await count(U.doorA, "tickets", `event_id = '${evA1}'`)).toBe(1);
    expect(await count(U.doorA, "tickets", `event_id = '${evA2}'`)).toBe(0);
    expect(await count(U.doorA, "checkins", `event_id = '${evA1}'`)).toBe(1);
    expect(await count(U.doorA, "checkins", `event_id = '${evA2}'`)).toBe(0);
    expect(await count(U.doorA, "events")).toBe(1);
    expect(await count(U.doorA, "events", `id = '${evA1}'`)).toBe(1);
  });

  it("doorA: nevidí orders, invoices ani další org data; vlastní memberships/users ano", async () => {
    for (const table of [
      "orders", "order_items", "invoices", "invoice_lines", "refunds", "settlements", "ticket_types",
      "promo_codes", "venues", "organizations", "inventory", "price_waves", "ticket_transfers", "reservations",
    ]) {
      expect(await count(U.doorA, table), table).toBe(0);
    }
    expect(await count(U.doorA, "memberships")).toBe(1);
    expect(await count(U.doorA, "users")).toBe(1);
  });

  it("doorA po odebrání členství ztratí přístup k akci", async () => {
    await exec(`DELETE FROM memberships WHERE user_id = '${U.doorA}'`);
    try {
      expect(await count(U.doorA, "tickets")).toBe(0);
      expect(await count(U.doorA, "events")).toBe(0);
    } finally {
      await exec(`INSERT INTO memberships (user_id, organization_id, role) VALUES ('${U.doorA}', '${orgA}', 'door')`);
    }
  });

  it("platform admin vidí obě organizace", async () => {
    expect(await count(U.admin, "organizations")).toBe(2);
    expect(await count(U.admin, "events")).toBe(3);
    expect(await count(U.admin, "orders")).toBe(3);
    expect(await count(U.admin, "invoice_lines")).toBe(3);
    expect(await count(U.admin, "users")).toBe(5);
  });

  it("ownerB vidí jen org B", async () => {
    expect(await count(U.ownerB, "orders")).toBe(1);
    expect(await count(U.ownerB, "orders", `organization_id = '${orgA}'`)).toBe(0);
    expect(await count(U.ownerB, "events")).toBe(1);
  });

  it("authenticated nemůže zapisovat (INSERT/UPDATE/DELETE/TRUNCATE)", async () => {
    for (const stmt of [
      `INSERT INTO venues (organization_id, name) VALUES ('${orgA}', 'x')`,
      `UPDATE organizations SET name = 'x'`,
      `DELETE FROM orders`,
      `TRUNCATE orders CASCADE`,
    ]) {
      await expect(
        asUser(t.db, U.ownerA, (tx) => tx.execute(sql.raw(stmt))),
        stmt,
      ).rejects.toThrow();
    }
    expect(await count(U.admin, "orders")).toBe(3);
  });

  it("app.* funkce: anon nemá EXECUTE, authenticated ano", async () => {
    await expect(asUser(t.db, null, (tx) => tx.execute(sql`SELECT app.is_platform_admin()`))).rejects.toThrow();
    const r = await asUser(
      t.db,
      U.admin,
      async (tx) => (await tx.execute(sql`SELECT app.is_platform_admin() AS v`)).rows[0],
    );
    expect(r).toEqual({ v: true });
  });
});
