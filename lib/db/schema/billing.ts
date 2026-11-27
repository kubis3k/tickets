import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./_helpers";
import { invoiceType, settlementStatus } from "./enums";
import { events } from "./events";
import { organizations } from "./identity";
import { orders } from "./orders";

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** vystavovatel dokladu */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** příjemce faktury za provizi (organizace, které se účtuje); jinak null */
    recipientOrganizationId: uuid("recipient_organization_id").references(() => organizations.id),
    /** null u faktury za provizi (vyúčtování akce) */
    orderId: uuid("order_id").references(() => orders.id),
    /** dobropis odkazuje na původní doklad */
    creditForInvoiceId: uuid("credit_for_invoice_id").references((): AnyPgColumn => invoices.id),
    number: text("number").notNull(),
    type: invoiceType("type").notNull(),
    pdfPath: text("pdf_path"),
    issuedAt: tstz("issued_at").notNull(),
    /** součty dokladu; částky v haléřích. Řádky jsou v invoice_lines. */
    totals: jsonb("totals").notNull(),
    /** údaje vystavovatele v době vystavení (pozdější změna organizace doklad nemění) */
    issuerSnapshot: jsonb("issuer_snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_organization_id_number_uq").on(t.organizationId, t.number),
    index("invoices_organization_id_idx").on(t.organizationId),
    index("invoices_order_id_idx").on(t.orderId),
    index("invoices_recipient_organization_id_idx").on(t.recipientOrganizationId),
    // max. jedna faktura na objednávku (dobropisů může být víc)
    uniqueIndex("invoices_order_id_invoice_uq")
      .on(t.orderId)
      .where(sql`${t.type} = 'invoice'`),
    check(
      "invoices_credit_note_has_original",
      sql`${t.type} <> 'credit_note' OR ${t.creditForInvoiceId} IS NOT NULL`,
    ),
    check("invoices_invoice_has_order", sql`${t.type} <> 'invoice' OR ${t.orderId} IS NOT NULL`),
    check(
      "invoices_commission_has_recipient",
      sql`${t.type} <> 'commission_invoice' OR ${t.recipientOrganizationId} IS NOT NULL`,
    ),
    index("invoices_credit_for_invoice_id_idx").on(t.creditForInvoiceId),
  ],
).enableRLS();

/** Strukturované řádky dokladu; součet řádků = totals dokladu, na haléř přesně. */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    /** cena za kus v haléřích */
    unitPrice: integer("unit_price").notNull(),
    vatRateBps: integer("vat_rate_bps").notNull(),
    baseAmount: integer("base_amount").notNull(),
    vatAmount: integer("vat_amount").notNull(),
    totalAmount: integer("total_amount").notNull(),
  },
  (t) => [
    uniqueIndex("invoice_lines_invoice_id_position_uq").on(t.invoiceId, t.position),
    check("invoice_lines_position_pos", sql`${t.position} > 0`),
    check("invoice_lines_quantity_pos", sql`${t.quantity} > 0`),
    check("invoice_lines_vat_rate_bps_range", sql`${t.vatRateBps} >= 0 AND ${t.vatRateBps} <= 10000`),
    check("invoice_lines_total_sum", sql`${t.totalAmount} = ${t.baseAmount} + ${t.vatAmount}`),
  ],
).enableRLS();

/** Vratky plateb. Částka a poplatek v haléřích; dobropis vzniká ke každému refundu. */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    orderId: uuid("order_id").notNull(),
    stripeRefundId: text("stripe_refund_id").notNull().unique(),
    amount: integer("amount").notNull(),
    /** část application_fee vrácená platformou */
    applicationFeeRefunded: integer("application_fee_refunded").notNull().default(0),
    reason: text("reason"),
    creditNoteId: uuid("credit_note_id")
      .unique()
      .references(() => invoices.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "refunds_order_org_fk",
      columns: [t.orderId, t.organizationId],
      foreignColumns: [orders.id, orders.organizationId],
    }),
    index("refunds_organization_id_idx").on(t.organizationId),
    index("refunds_order_id_idx").on(t.orderId),
    check("refunds_amount_pos", sql`${t.amount} > 0`),
    check("refunds_fee_nonneg", sql`${t.applicationFeeRefunded} >= 0`),
  ],
).enableRLS();

/** Číselná řada bez děr: inkrementuje se v transakci vystavení dokladu. */
export const invoiceSequences = pgTable(
  "invoice_sequences",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.year] }),
    check("invoice_sequences_last_number_nonneg", sql`${t.lastNumber} >= 0`),
  ],
).enableRLS();

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    // agregáty za celou akci, vše v haléřích; bigint (mode number) kvůli součtům přes mnoho objednávek
    gross: bigint("gross", { mode: "number" }).notNull().default(0),
    refunds: bigint("refunds", { mode: "number" }).notNull().default(0),
    stripeFees: bigint("stripe_fees", { mode: "number" }).notNull().default(0),
    feeBase: bigint("fee_base", { mode: "number" }).notNull().default(0),
    feeVat: bigint("fee_vat", { mode: "number" }).notNull().default(0),
    payoutAmount: bigint("payout_amount", { mode: "number" }).notNull().default(0),
    rounding: bigint("rounding", { mode: "number" }).notNull().default(0),
    commissionInvoiceId: uuid("commission_invoice_id").references(() => invoices.id),
    stripePayoutId: text("stripe_payout_id").unique(),
    status: settlementStatus("status").notNull().default("open"),
    payoutDueAt: tstz("payout_due_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "settlements_event_org_fk",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [events.id, events.organizationId],
    }),
    uniqueIndex("settlements_event_id_uq").on(t.eventId),
    index("settlements_organization_id_idx").on(t.organizationId),
    index("settlements_commission_invoice_id_idx").on(t.commissionInvoiceId),
  ],
).enableRLS();
