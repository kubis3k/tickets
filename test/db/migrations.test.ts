import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./pglite";
import {
  events,
  inventory,
  invitations,
  invoices,
  orderItems,
  orders,
  organizations,
  priceWaves,
  promoCodes,
  settlements,
  tickets,
  ticketTypes,
} from "@/lib/db/schema";

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
  const [tt] = await t.db.insert(ticketTypes).values({ eventId: ev!.id, organizationId: org!.id, name: "GA" }).returning();
  return { org: org!, ev: ev!, tt: tt! };
}

describe("migrace v PGlite", () => {
  it("vytvoří všechny tabulky s RLS", async () => {
    const res = await t.db.execute(
      sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT rowsecurity)::int AS no_rls
          FROM pg_tables WHERE schemaname = 'public'`,
    );
    const row = res.rows[0] as { n: number; no_rls: number };
    expect(row.n).toBe(28);
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
    const { ev, org } = await seedTicketType();
    await t.db.insert(promoCodes).values({ eventId: ev.id, organizationId: org.id, code: "Leto", type: "percent", value: 1000 });
    const msg = await pgError(
      t.db.insert(promoCodes).values({ eventId: ev.id, organizationId: org.id, code: "LETO", type: "fixed", value: 5000 }),
    );
    expect(msg).toMatch(/promo_codes_event_id_code_uq/);
  });

  it("invitations.email musí být lower-case", async () => {
    const { org } = await seedTicketType();
    const msg = await pgError(
      t.db.insert(invitations).values({
        organizationId: org.id, email: "A@B.cz", role: "staff", tokenHash: "h1", expiresAt: new Date(),
      }),
    );
    expect(msg).toMatch(/invitations_email_lower/);
  });

  async function seedOrder(over?: { org: typeof organizations.$inferSelect; ev: typeof events.$inferSelect }) {
    const base = await seedTicketType();
    const org = over?.org ?? base.org;
    const ev = over?.ev ?? base.ev;
    const [order] = await t.db
      .insert(orders)
      .values({ organizationId: org.id, eventId: ev.id, email: "a@b.cz", subtotal: 1000, total: 1000 })
      .returning();
    return { ...base, org, ev, order: order! };
  }

  it("složená FK: order s akcí z jiné organizace selže", async () => {
    const a = await seedTicketType();
    const b = await seedTicketType();
    const msg = await pgError(
      t.db.insert(orders).values({
        organizationId: a.org.id, eventId: b.ev.id, email: "a@b.cz", subtotal: 100, total: 100,
      }),
    );
    expect(msg).toMatch(/orders_event_org_fk/);
  });

  it("tickets: objednávka z jiné akce selže, ze stejné projde", async () => {
    const { org, ev, tt, order } = await seedOrder();
    const [item] = await t.db
      .insert(orderItems)
      .values({ orderId: order.id, ticketTypeId: tt.id, unitPrice: 1000, qty: 1, vatRateBps: 1200 })
      .returning();
    const [ev2] = await t.db
      .insert(events)
      .values({ organizationId: org.id, slug: "ev2", name: "Ev2", startsAt: new Date() })
      .returning();
    const row = {
      orderId: order.id, orderItemId: item!.id, ticketTypeId: tt.id,
      organizationId: org.id, code: "0123456789abcdef0123",
    };
    const msg = await pgError(t.db.insert(tickets).values({ ...row, eventId: ev2!.id }));
    expect(msg).toMatch(/tickets_order_event_fk/);
    const [ok] = await t.db.insert(tickets).values({ ...row, eventId: ev.id }).returning();
    expect(ok!.qrVersion).toBe(1);
    const short = await pgError(t.db.insert(tickets).values({ ...row, eventId: ev.id, code: "kratky" }));
    expect(short).toMatch(/tickets_code_min_length/);
  });

  it("invoices: doklad s objednávkou jiné organizace selže, vlastní projde", async () => {
    const a = await seedOrder();
    const b = await seedTicketType();
    const base = { type: "invoice" as const, issuedAt: new Date(), totals: {}, issuerSnapshot: {} };
    const msg = await pgError(
      t.db.insert(invoices).values({ ...base, organizationId: b.org.id, orderId: a.order.id, number: "2026-1" }),
    );
    expect(msg).toMatch(/invoices_order_org_fk/);
    await t.db.insert(invoices).values({ ...base, organizationId: a.org.id, orderId: a.order.id, number: "2026-1" });
  });

  it("tickets: typ vstupenky z jiné akce selže (složená FK)", async () => {
    const { org, tt, order } = await seedOrder();
    const [item] = await t.db
      .insert(orderItems)
      .values({ orderId: order.id, ticketTypeId: tt.id, unitPrice: 1000, qty: 1, vatRateBps: 1200 })
      .returning();
    const [ev2] = await t.db
      .insert(events)
      .values({ organizationId: org.id, slug: "ev3", name: "Ev3", startsAt: new Date() })
      .returning();
    const [order2] = await t.db
      .insert(orders)
      .values({ organizationId: org.id, eventId: ev2!.id, email: "a@b.cz", subtotal: 1, total: 1 })
      .returning();
    const msg = await pgError(
      t.db.insert(tickets).values({
        orderId: order2!.id, orderItemId: item!.id, ticketTypeId: tt.id, eventId: ev2!.id,
        organizationId: org.id, code: "abcdef0123456789abcd",
      }),
    );
    expect(msg).toMatch(/tickets_ticket_type_event_fk/);
  });

  it("promo: used_count > max_uses selže", async () => {
    const { ev, org } = await seedTicketType();
    const msg = await pgError(
      t.db.insert(promoCodes).values({
        eventId: ev.id, organizationId: org.id, code: "X", type: "fixed", value: 100, maxUses: 2, usedCount: 3,
      }),
    );
    expect(msg).toMatch(/promo_codes_used_within_max/);
  });

  it("price_waves: sold + reserved > capacity selže", async () => {
    const { tt } = await seedTicketType();
    const msg = await pgError(
      t.db.insert(priceWaves).values({
        ticketTypeId: tt.id, price: 100, startsAt: new Date(), capacity: 10, soldCount: 6, reservedCount: 5,
      }),
    );
    expect(msg).toMatch(/price_waves_sold_within_capacity/);
    await t.db.insert(priceWaves).values({
      ticketTypeId: tt.id, price: 100, startsAt: new Date(), capacity: 10, soldCount: 6, reservedCount: 4,
    });
  });

  const issuer = { legalName: "Org s.r.o." };

  it("invoices: druhý doklad typu invoice na objednávku selže, dobropis projde", async () => {
    const { org, order } = await seedOrder();
    const base = { organizationId: org.id, orderId: order.id, issuedAt: new Date(), totals: {}, issuerSnapshot: issuer };
    const [inv] = await t.db.insert(invoices).values({ ...base, number: "2026-0001", type: "invoice" }).returning();
    const dup = await pgError(t.db.insert(invoices).values({ ...base, number: "2026-0002", type: "invoice" }));
    expect(dup).toMatch(/invoices_order_id_invoice_uq/);
    await t.db.insert(invoices).values({
      ...base, number: "2026-0003", type: "credit_note", creditForInvoiceId: inv!.id,
    });
  });

  it("invoices: credit_note bez credit_for_invoice_id selže", async () => {
    const { org, order } = await seedOrder();
    const msg = await pgError(
      t.db.insert(invoices).values({
        organizationId: org.id, orderId: order.id, number: "CN-1", type: "credit_note",
        issuedAt: new Date(), totals: {}, issuerSnapshot: issuer,
      }),
    );
    expect(msg).toMatch(/invoices_credit_note_has_original/);
  });

  it("invoices: commission_invoice bez příjemce a invoice bez objednávky selžou", async () => {
    const { org } = await seedTicketType();
    const base = { organizationId: org.id, issuedAt: new Date(), totals: {}, issuerSnapshot: issuer };
    const c = await pgError(t.db.insert(invoices).values({ ...base, number: "K-1", type: "commission_invoice" }));
    expect(c).toMatch(/invoices_commission_has_recipient/);
    const i = await pgError(t.db.insert(invoices).values({ ...base, number: "F-1", type: "invoice" }));
    expect(i).toMatch(/invoices_invoice_has_order/);
  });

  it("invoices: (organization_id, number) je unikátní", async () => {
    const a = await seedOrder();
    const b = await seedOrder({ org: a.org, ev: a.ev });
    const base = { organizationId: a.org.id, issuedAt: new Date(), totals: {}, issuerSnapshot: issuer, type: "invoice" as const };
    await t.db.insert(invoices).values({ ...base, orderId: a.order.id, number: "2026-9" });
    const msg = await pgError(t.db.insert(invoices).values({ ...base, orderId: b.order.id, number: "2026-9" }));
    expect(msg).toMatch(/invoices_organization_id_number_uq/);
  });

  it("settlements: unikát event_id, bigint agregát přes 2^31", async () => {
    const { org, ev } = await seedTicketType();
    const [s] = await t.db
      .insert(settlements)
      .values({ eventId: ev.id, organizationId: org.id, gross: 5_000_000_000 })
      .returning();
    expect(s!.gross).toBe(5_000_000_000);
    const msg = await pgError(t.db.insert(settlements).values({ eventId: ev.id, organizationId: org.id }));
    expect(msg).toMatch(/settlements_event_id_uq/);
  });

  it("invitations: dvě aktivní pozvánky na stejný e-mail/org selžou, po odvolání projde", async () => {
    const { org } = await seedTicketType();
    const row = { organizationId: org.id, email: "x@y.cz", role: "staff" as const, expiresAt: new Date() };
    await t.db.insert(invitations).values({ ...row, tokenHash: "a1" });
    const msg = await pgError(t.db.insert(invitations).values({ ...row, tokenHash: "a2" }));
    expect(msg).toMatch(/invitations_org_email_active_uq/);
    await t.db.update(invitations).set({ revokedAt: new Date() }).where(sql`${invitations.organizationId} = ${org.id}`);
    await t.db.insert(invitations).values({ ...row, tokenHash: "a3" });
  });

  it("orders: refunded_amount <= total, měna jen CZK, payment intent unikátní", async () => {
    const { org, ev } = await seedTicketType();
    const base = { organizationId: org.id, eventId: ev.id, email: "a@b.cz", subtotal: 1000, total: 1000 };
    expect(await pgError(t.db.insert(orders).values({ ...base, refundedAmount: 1001 }))).toMatch(/orders_refunded_amount_range/);
    expect(await pgError(t.db.insert(orders).values({ ...base, currency: "EUR" }))).toMatch(/orders_currency_czk/);
    await t.db.insert(orders).values({ ...base, stripePaymentIntent: "pi_1" });
    expect(await pgError(t.db.insert(orders).values({ ...base, stripePaymentIntent: "pi_1" }))).toMatch(/stripe_payment_intent/);
  });

  it("users.email musí být lower-case", async () => {
    const id = crypto.randomUUID();
    await t.db.execute(sql`INSERT INTO auth.users (id, email) VALUES (${id}, 'A@b.cz')`);
    const msg = await pgError(t.db.execute(sql`INSERT INTO users (id, email) VALUES (${id}, 'A@b.cz')`));
    expect(msg).toMatch(/users_email_lower/);
  });
});
