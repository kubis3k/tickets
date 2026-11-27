import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./_helpers";
import { eventStatus, promoType, reservationStatus } from "./enums";
import { organizations, users } from "./identity";

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    address: text("address"),
    capacity: integer("capacity"),
    createdAt: createdAt(),
  },
  (t) => [
    index("venues_organization_id_idx").on(t.organizationId),
    check("venues_capacity_nonneg", sql`${t.capacity} IS NULL OR ${t.capacity} >= 0`),
  ],
).enableRLS();

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at"),
    doorsAt: tstz("doors_at"),
    status: eventStatus("status").notNull().default("draft"),
    totalCapacity: integer("total_capacity").notNull().default(0),
    /** přepis platformního poplatku pro akci; null = poplatek organizace */
    feeOverrideBps: integer("fee_override_bps"),
    requireHolderNames: boolean("require_holder_names").notNull().default(false),
    requireAge18: boolean("require_age_18").notNull().default(false),
    allowTransfers: boolean("allow_transfers").notNull().default(false),
    transferCutoffHours: integer("transfer_cutoff_hours").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("events_organization_id_slug_uq").on(t.organizationId, t.slug),
    // cíl složených FK: dítě akce nemůže mít jinou organizaci než akce
    unique("events_id_organization_id_uq").on(t.id, t.organizationId),
    index("events_organization_id_idx").on(t.organizationId),
    index("events_venue_id_idx").on(t.venueId),
    check("events_total_capacity_nonneg", sql`${t.totalCapacity} >= 0`),
    check(
      "events_fee_override_bps_range",
      sql`${t.feeOverrideBps} IS NULL OR (${t.feeOverrideBps} >= 0 AND ${t.feeOverrideBps} <= 10000)`,
    ),
    check("events_transfer_cutoff_nonneg", sql`${t.transferCutoffHours} >= 0`),
  ],
).enableRLS();

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    /** denormalizace; konzistenci s akcí hlídá složená FK */
    organizationId: uuid("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** sazba DPH v bps (1200 = 12 %) */
    vatRateBps: integer("vat_rate_bps").notNull().default(1200),
    totalCapacity: integer("total_capacity").notNull().default(0),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "ticket_types_event_org_fk",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [events.id, events.organizationId],
    }).onDelete("cascade"),
    // cíl složené FK z tickets (typ vstupenky patří ke stejné akci jako vstupenka)
    unique("ticket_types_id_event_id_uq").on(t.id, t.eventId),
    index("ticket_types_event_id_idx").on(t.eventId),
    index("ticket_types_organization_id_idx").on(t.organizationId),
    check("ticket_types_vat_rate_bps_range", sql`${t.vatRateBps} >= 0 AND ${t.vatRateBps} <= 10000`),
    check("ticket_types_total_capacity_nonneg", sql`${t.totalCapacity} >= 0`),
    check("ticket_types_max_per_order_pos", sql`${t.maxPerOrder} > 0`),
  ],
).enableRLS();

export const priceWaves = pgTable(
  "price_waves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "cascade" }),
    /** cena za kus v haléřích */
    price: integer("price").notNull(),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at"),
    /** null = vlna nemá vlastní limit */
    capacity: integer("capacity"),
    soldCount: integer("sold_count").notNull().default(0),
    /** rezervováno v košících; mění se výhradně přes lib/inventory */
    reservedCount: integer("reserved_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("price_waves_ticket_type_id_idx").on(t.ticketTypeId),
    check("price_waves_price_nonneg", sql`${t.price} >= 0`),
    check(
      "price_waves_sold_within_capacity",
      sql`${t.soldCount} >= 0 AND ${t.reservedCount} >= 0 AND (${t.capacity} IS NULL OR ${t.soldCount} + ${t.reservedCount} <= ${t.capacity})`,
    ),
  ],
).enableRLS();

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    code: text("code").notNull(),
    type: promoType("type").notNull(),
    /** percent: bps (1000 = 10 %); fixed: haléře */
    value: integer("value").notNull(),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    validFrom: tstz("valid_from"),
    validTo: tstz("valid_to"),
    /** prázdné pole = platí pro všechny typy vstupenek */
    ticketTypeIds: uuid("ticket_type_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("promo_codes_event_id_code_uq").on(t.eventId, sql`upper(${t.code})`),
    foreignKey({
      name: "promo_codes_event_org_fk",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [events.id, events.organizationId],
    }).onDelete("cascade"),
    index("promo_codes_event_id_idx").on(t.eventId),
    index("promo_codes_organization_id_idx").on(t.organizationId),
    check(
      "promo_codes_used_within_max",
      sql`${t.maxUses} IS NULL OR ${t.usedCount} <= ${t.maxUses}`,
    ),
    check(
      "promo_codes_value_valid",
      sql`(${t.type} = 'percent' AND ${t.value} > 0 AND ${t.value} <= 10000) OR (${t.type} = 'fixed' AND ${t.value} > 0)`,
    ),
    check(
      "promo_codes_uses_valid",
      sql`${t.usedCount} >= 0 AND (${t.maxUses} IS NULL OR ${t.maxUses} >= 0)`,
    ),
  ],
).enableRLS();

/** Jediný zdroj pravdy o kapacitě. Mění se výhradně přes lib/inventory. */
export const inventory = pgTable(
  "inventory",
  {
    ticketTypeId: uuid("ticket_type_id")
      .primaryKey()
      .references(() => ticketTypes.id, { onDelete: "cascade" }),
    capacity: integer("capacity").notNull(),
    sold: integer("sold").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "inventory_within_capacity",
      sql`${t.sold} >= 0 AND ${t.reserved} >= 0 AND ${t.sold} + ${t.reserved} <= ${t.capacity}`,
    ),
  ],
).enableRLS();

export type ReservationItem = {
  ticketTypeId: string;
  priceWaveId: string;
  qty: number;
};

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    sessionId: text("session_id").notNull(),
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id, { onDelete: "set null" }),
    items: jsonb("items").$type<ReservationItem[]>().notNull(),
    expiresAt: tstz("expires_at").notNull(),
    status: reservationStatus("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reservations_event_id_idx").on(t.eventId),
    index("reservations_promo_code_id_idx").on(t.promoCodeId),
    index("reservations_status_expires_at_idx").on(t.status, t.expiresAt),
    index("reservations_session_id_idx").on(t.sessionId),
  ],
).enableRLS();


/** Přiřazení door účtu k akci (scanner vidí jen přiřazené akce). */
export const doorAssignments = pgTable(
  "door_assignments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.eventId] }),
    index("door_assignments_event_id_idx").on(t.eventId),
  ],
).enableRLS();
