import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, tstz } from "./_helpers";
import { checkinResult, orderStatus, ticketStatus } from "./enums";
import { events, priceWaves, promoCodes, reservations, ticketTypes } from "./events";
import { customers, organizations, users } from "./identity";

export type OrderUtm = Record<string, string>;

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    customerId: uuid("customer_id").references(() => customers.id),
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name"),
    companyIco: text("company_ico"),
    companyDic: text("company_dic"),
    ageConfirmedAt: tstz("age_confirmed_at"),
    // vše v haléřích
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    currency: text("currency").notNull().default("CZK"),
    status: orderStatus("status").notNull().default("pending"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntent: text("stripe_payment_intent"),
    applicationFee: integer("application_fee").notNull().default(0),
    utm: jsonb("utm").$type<OrderUtm>(),
    fbp: text("fbp"),
    fbc: text("fbc"),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    paidAt: tstz("paid_at"),
  },
  (t) => [
    index("orders_organization_id_idx").on(t.organizationId),
    index("orders_event_id_idx").on(t.eventId),
    index("orders_customer_id_idx").on(t.customerId),
    index("orders_promo_code_id_idx").on(t.promoCodeId),
    index("orders_stripe_payment_intent_idx").on(t.stripePaymentIntent),
    index("orders_email_idx").on(t.email),
    check(
      "orders_amounts_valid",
      sql`${t.subtotal} >= 0 AND ${t.discount} >= 0 AND ${t.discount} <= ${t.subtotal} AND ${t.total} = ${t.subtotal} - ${t.discount}`,
    ),
    check(
      "orders_application_fee_range",
      sql`${t.applicationFee} >= 0 AND ${t.applicationFee} <= ${t.total}`,
    ),
  ],
).enableRLS();

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    priceWaveId: uuid("price_wave_id").references(() => priceWaves.id),
    /** cena za kus v haléřích před slevou */
    unitPrice: integer("unit_price").notNull(),
    qty: integer("qty").notNull(),
    /** podíl slevy objednávky připadající na řádek (haléře); součet = orders.discount */
    discountAmount: integer("discount_amount").notNull().default(0),
    vatRateBps: integer("vat_rate_bps").notNull(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_ticket_type_id_idx").on(t.ticketTypeId),
    index("order_items_price_wave_id_idx").on(t.priceWaveId),
    check("order_items_qty_pos", sql`${t.qty} > 0`),
    check(
      "order_items_amounts_valid",
      sql`${t.unitPrice} >= 0 AND ${t.discountAmount} >= 0 AND ${t.discountAmount} <= ${t.unitPrice} * ${t.qty}`,
    ),
    check("order_items_vat_rate_bps_range", sql`${t.vatRateBps} >= 0 AND ${t.vatRateBps} <= 10000`),
  ],
).enableRLS();

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    /** denormalizace pro scanner a QR token `ticketId.eventId.sig` */
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    holderName: text("holder_name"),
    code: text("code").notNull().unique(),
    status: ticketStatus("status").notNull().default("valid"),
    checkedInAt: tstz("checked_in_at"),
    checkedInBy: uuid("checked_in_by").references(() => users.id, { onDelete: "set null" }),
    deviceId: text("device_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tickets_order_id_idx").on(t.orderId),
    index("tickets_ticket_type_id_idx").on(t.ticketTypeId),
    index("tickets_event_id_idx").on(t.eventId),
    index("tickets_checked_in_by_idx").on(t.checkedInBy),
  ],
).enableRLS();

export const ticketTransfers = pgTable(
  "ticket_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id),
    fromCustomerId: uuid("from_customer_id").references(() => customers.id),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    oldCode: text("old_code").notNull(),
    newCode: text("new_code").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ticket_transfers_ticket_id_idx").on(t.ticketId),
    index("ticket_transfers_from_customer_id_idx").on(t.fromCustomerId),
  ],
).enableRLS();

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = sken neplatného tokenu */
    ticketId: uuid("ticket_id").references(() => tickets.id),
    deviceId: text("device_id").notNull(),
    scannedAt: tstz("scanned_at").notNull(),
    result: checkinResult("result").notNull(),
    syncedAt: tstz("synced_at"),
  },
  (t) => [
    index("checkins_ticket_id_idx").on(t.ticketId),
    index("checkins_scanned_at_idx").on(t.scannedAt),
  ],
).enableRLS();

export const abandonedCheckouts = pgTable(
  "abandoned_checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    recoveredOrderId: uuid("recovered_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    emailsSent: integer("emails_sent").notNull().default(0),
    lastSentAt: tstz("last_sent_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("abandoned_checkouts_reservation_id_idx").on(t.reservationId),
    index("abandoned_checkouts_recovered_order_id_idx").on(t.recoveredOrderId),
    check("abandoned_checkouts_emails_sent_nonneg", sql`${t.emailsSent} >= 0`),
  ],
).enableRLS();
