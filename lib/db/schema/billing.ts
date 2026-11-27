import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
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
    /** null u faktury za provizi (vyúčtování akce) */
    orderId: uuid("order_id").references(() => orders.id),
    /** dobropis odkazuje na původní doklad */
    creditForInvoiceId: uuid("credit_for_invoice_id").references((): AnyPgColumn => invoices.id),
    number: text("number").notNull(),
    type: invoiceType("type").notNull(),
    pdfPath: text("pdf_path"),
    issuedAt: tstz("issued_at").notNull(),
    /** součty a řádky dokladu; částky v haléřích */
    totals: jsonb("totals").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_organization_id_number_uq").on(t.organizationId, t.number),
    index("invoices_organization_id_idx").on(t.organizationId),
    index("invoices_order_id_idx").on(t.orderId),
    index("invoices_credit_for_invoice_id_idx").on(t.creditForInvoiceId),
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
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    // vše v haléřích
    gross: integer("gross").notNull().default(0),
    feeBase: integer("fee_base").notNull().default(0),
    feeVat: integer("fee_vat").notNull().default(0),
    payoutAmount: integer("payout_amount").notNull().default(0),
    rounding: integer("rounding").notNull().default(0),
    commissionInvoiceId: uuid("commission_invoice_id").references(() => invoices.id),
    stripePayoutId: text("stripe_payout_id"),
    status: settlementStatus("status").notNull().default("open"),
    payoutDueAt: tstz("payout_due_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("settlements_event_id_uq").on(t.eventId),
    index("settlements_organization_id_idx").on(t.organizationId),
    index("settlements_commission_invoice_id_idx").on(t.commissionInvoiceId),
  ],
).enableRLS();
