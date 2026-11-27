import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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
    eventId: uuid("event_id").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    /** rezervace, ze které objednávka vznikla */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
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
    stripePaymentIntent: text("stripe_payment_intent").unique(),
    /** součet vrácených částek (haléře); synchronizuje se s tabulkou refunds */
    refundedAmount: integer("refunded_amount").notNull().default(0),
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
    foreignKey({
      name: "orders_event_org_fk",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [events.id, events.organizationId],
    }),
    // cíle složených FK z tickets (akce) a refunds (organizace)
    unique("orders_id_event_id_uq").on(t.id, t.eventId),
    unique("orders_id_organization_id_uq").on(t.id, t.organizationId),
    index("orders_reservation_id_idx").on(t.reservationId),
    check("orders_currency_czk", sql`${t.currency} = 'CZK'`),
    check(
      "orders_refunded_amount_range",
      sql`${t.refundedAmount} >= 0 AND ${t.refundedAmount} <= ${t.total}`,
    ),
    index("orders_organization_id_idx").on(t.organizationId),
    index("orders_event_id_idx").on(t.eventId),
    index("orders_customer_id_idx").on(t.customerId),
    index("orders_promo_code_id_idx").on(t.promoCodeId),
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
    orderId: uuid("order_id").notNull(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    /** denormalizace pro scanner a QR token `ticketId.eventId.version.sig` */
    eventId: uuid("event_id").notNull(),
    /** denormalizace; konzistenci s akcí hlídá složená FK */
    organizationId: uuid("organization_id").notNull(),
    /**
     * Verze QR podpisu. Převod vstupenky ji zvýší, čímž znehodnotí starý QR
     * (token = `ticketId.eventId.version.sig`; scanner porovná s DB).
     */
    qrVersion: integer("qr_version").notNull().default(1),
    holderName: text("holder_name"),
    code: text("code").notNull().unique(),
    status: ticketStatus("status").notNull().default("valid"),
    checkedInAt: tstz("checked_in_at"),
    checkedInBy: uuid("checked_in_by").references(() => users.id, { onDelete: "set null" }),
    deviceId: text("device_id"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "tickets_order_event_fk",
      columns: [t.orderId, t.eventId],
      foreignColumns: [orders.id, orders.eventId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tickets_event_org_fk",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [events.id, events.organizationId],
    }),
    // cíl složené FK z checkins
    unique("tickets_id_event_id_uq").on(t.id, t.eventId),
    check("tickets_code_min_length", sql`char_length(${t.code}) >= 16`),
    check("tickets_qr_version_pos", sql`${t.qrVersion} >= 1`),
    index("tickets_order_item_id_idx").on(t.orderItemId),
    index("tickets_organization_id_idx").on(t.organizationId),
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
    ticketId: uuid("ticket_id"),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    scannedBy: uuid("scanned_by").references(() => users.id, { onDelete: "set null" }),
    deviceId: text("device_id").notNull(),
    scannedAt: tstz("scanned_at").notNull(),
    result: checkinResult("result").notNull(),
    syncedAt: tstz("synced_at"),
  },
  (t) => [
    foreignKey({
      name: "checkins_event_org_fk",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [events.id, events.organizationId],
    }),
    // sken vstupenky musí patřit stejné akci (ticket_id NULL = neplatný token, FK se nevyhodnocuje)
    foreignKey({
      name: "checkins_ticket_event_fk",
      columns: [t.ticketId, t.eventId],
      foreignColumns: [tickets.id, tickets.eventId],
    }),
    index("checkins_event_id_idx").on(t.eventId),
    index("checkins_organization_id_idx").on(t.organizationId),
    index("checkins_scanned_by_idx").on(t.scannedBy),
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
    /** hash odkazu pro obnovení košíku (token se neukládá); null = bez odkazu */
    tokenHash: text("token_hash").unique(),
    expiresAt: tstz("expires_at").notNull(),
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
