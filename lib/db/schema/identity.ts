import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { createdAt, tstz, updatedAt } from "./_helpers";
import { orgRole } from "./enums";

/** Admin/staff/door účty. `id` = `auth.users.id`. */
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** vždy lower-case (CHECK) */
    email: text("email").notNull().unique(),
    name: text("name"),
    createdAt: createdAt(),
  },
  (t) => [check("users_email_lower", sql`${t.email} = lower(${t.email})`)],
).enableRLS();

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}).enableRLS();

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    // fakturační údaje
    legalName: text("legal_name"),
    ico: text("ico"),
    dic: text("dic"),
    street: text("street"),
    city: text("city"),
    zip: text("zip"),
    country: text("country").notNull().default("CZ"),
    vatPayer: boolean("vat_payer").notNull().default(false),
    invoicePrefix: text("invoice_prefix"),
    // platformní poplatek: bps z ceny po slevě + fixní část v haléřích
    feeBps: integer("fee_bps").notNull().default(500),
    feeFixed: integer("fee_fixed").notNull().default(0),
    payoutDelayDays: integer("payout_delay_days").notNull().default(2),
    // branding
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color"),
    // Stripe Connect
    stripeAccountId: text("stripe_account_id").unique(),
    stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
    // tracking (CAPI token je odložen do F5)
    metaPixelId: text("meta_pixel_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("organizations_fee_bps_range", sql`${t.feeBps} >= 0 AND ${t.feeBps} <= 10000`),
    check("organizations_fee_fixed_nonneg", sql`${t.feeFixed} >= 0`),
    check("organizations_payout_delay_nonneg", sql`${t.payoutDelayDays} >= 0`),
  ],
).enableRLS();

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.organizationId] }),
    index("memberships_organization_id_idx").on(t.organizationId),
  ],
).enableRLS();

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** vždy lower-case (CHECK); citext se nepoužívá */
    email: text("email").notNull(),
    role: orgRole("role").notNull(),
    /** jen hash tokenu, nikdy token samotný */
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: tstz("expires_at").notNull(),
    acceptedAt: tstz("accepted_at"),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("invitations_email_lower", sql`${t.email} = lower(${t.email})`),
    index("invitations_organization_id_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
    // max. jedna aktivní pozvánka na (org, e-mail)
    uniqueIndex("invitations_org_email_active_uq")
      .on(t.organizationId, t.email)
      .where(sql`${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  ],
).enableRLS();

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("customers_email_idx").on(t.email)],
).enableRLS();
