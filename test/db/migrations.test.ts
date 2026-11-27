import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./pglite";
import { events, inventory, organizations, ticketTypes } from "@/lib/db/schema";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.client.close();
});

/** Drizzle obaluje chybu Postgresu; skutečná zpráva je v `cause`. */
async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("očekávána chyba, dotaz prošel");
}

async function seedTicketType() {
  const [org] = await t.db
    .insert(organizations)
    .values({ slug: `org-${crypto.randomUUID()}`, name: "Org" })
    .returning();
  const [ev] = await t.db
    .insert(events)
    .values({ organizationId: org!.id, slug: "ev", name: "Ev", startsAt: new Date() })
    .returning();
  const [tt] = await t.db.insert(ticketTypes).values({ eventId: ev!.id, name: "GA" }).returning();
  return { org: org!, ev: ev!, tt: tt! };
}

describe("migrace v PGlite", () => {
  it("vytvoří všechny tabulky s RLS", async () => {
    const res = await t.db.execute(
      sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT rowsecurity)::int AS no_rls
          FROM pg_tables WHERE schemaname = 'public'`,
    );
    const row = res.rows[0] as { n: number; no_rls: number };
    expect(row.n).toBe(26);
    expect(row.no_rls).toBe(0);
  });

  it("insert do inventory v mezích kapacity projde", async () => {
    const { tt } = await seedTicketType();
    await t.db.insert(inventory).values({ ticketTypeId: tt.id, capacity: 10, sold: 6, reserved: 4 });
  });

  it("insert do inventory přesahující capacity selže (CHECK)", async () => {
    const { tt } = await seedTicketType();
    const msg = await pgError(
      t.db.insert(inventory).values({ ticketTypeId: tt.id, capacity: 10, sold: 6, reserved: 5 }),
    );
    expect(msg).toMatch(/inventory_within_capacity/);
  });

  it("update inventory přes capacity selže, záporné hodnoty selžou", async () => {
    const { tt } = await seedTicketType();
    await t.db.insert(inventory).values({ ticketTypeId: tt.id, capacity: 5 });
    const over = await pgError(
      t.db.execute(sql`UPDATE inventory SET reserved = reserved + 6 WHERE ticket_type_id = ${tt.id}`),
    );
    expect(over).toMatch(/inventory_within_capacity/);
    const other = (await seedTicketType()).tt.id;
    const neg = await pgError(t.db.insert(inventory).values({ ticketTypeId: other, capacity: 5, sold: -1 }));
    expect(neg).toMatch(/inventory_within_capacity/);
  });

  it("duplicitní slug organizace selže", async () => {
    await t.db.insert(organizations).values({ slug: "dup", name: "A" });
    const msg = await pgError(t.db.insert(organizations).values({ slug: "dup", name: "B" }));
    expect(msg).toMatch(/organizations_slug_unique/);
  });

  it("duplicitní (org, event slug) selže, stejný slug v jiné org projde", async () => {
    const { org } = await seedTicketType();
    const msg = await pgError(
      t.db.insert(events).values({ organizationId: org.id, slug: "ev", name: "X", startsAt: new Date() }),
    );
    expect(msg).toMatch(/events_organization_id_slug_uq/);
    const { org: other } = await seedTicketType();
    expect(other.id).not.toBe(org.id);
  });

  it("order: total musí odpovídat subtotal - discount", async () => {
    const { org, ev } = await seedTicketType();
    const { orders } = await import("@/lib/db/schema");
    const msg = await pgError(
      t.db.insert(orders).values({
        organizationId: org.id, eventId: ev.id, email: "a@b.cz", subtotal: 1000, discount: 100, total: 1000,
      }),
    );
    expect(msg).toMatch(/orders_amounts_valid/);
    await t.db.insert(orders).values({
      organizationId: org.id, eventId: ev.id, email: "a@b.cz", subtotal: 1000, discount: 100, total: 900,
    });
  });

  it("promo kód je unikátní case-insensitive v rámci akce", async () => {
    const { ev } = await seedTicketType();
    const { promoCodes } = await import("@/lib/db/schema");
    await t.db.insert(promoCodes).values({ eventId: ev.id, code: "Leto", type: "percent", value: 1000 });
    const msg = await pgError(
      t.db.insert(promoCodes).values({ eventId: ev.id, code: "LETO", type: "fixed", value: 5000 }),
    );
    expect(msg).toMatch(/promo_codes_event_id_code_uq/);
  });

  it("invitations.email musí být lower-case", async () => {
    const { org } = await seedTicketType();
    const { invitations } = await import("@/lib/db/schema");
    const msg = await pgError(
      t.db.insert(invitations).values({
        organizationId: org.id, email: "A@B.cz", role: "staff", tokenHash: "h1", expiresAt: new Date(),
      }),
    );
    expect(msg).toMatch(/invitations_email_lower/);
  });
});
