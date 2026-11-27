CREATE TYPE "public"."checkin_result" AS ENUM('ok', 'duplicate', 'invalid', 'void');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'sold_out', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('invoice', 'credit_note', 'commission_invoice');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'expired', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'staff', 'door');--> statement-breakpoint
CREATE TYPE "public"."promo_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'converted', 'expired', 'released');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('open', 'closed', 'paid_out');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valid', 'checked_in', 'void');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_email_lower" CHECK ("invitations"."email" = lower("invitations"."email"))
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"ico" text,
	"dic" text,
	"street" text,
	"city" text,
	"zip" text,
	"country" text DEFAULT 'CZ' NOT NULL,
	"vat_payer" boolean DEFAULT false NOT NULL,
	"invoice_prefix" text,
	"fee_bps" integer DEFAULT 500 NOT NULL,
	"fee_fixed" integer DEFAULT 0 NOT NULL,
	"payout_delay_days" integer DEFAULT 2 NOT NULL,
	"logo_url" text,
	"primary_color" text,
	"stripe_account_id" text,
	"stripe_charges_enabled" boolean DEFAULT false NOT NULL,
	"stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
	"meta_pixel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_stripe_account_id_unique" UNIQUE("stripe_account_id"),
	CONSTRAINT "organizations_fee_bps_range" CHECK ("organizations"."fee_bps" >= 0 AND "organizations"."fee_bps" <= 10000),
	CONSTRAINT "organizations_fee_fixed_nonneg" CHECK ("organizations"."fee_fixed" >= 0),
	CONSTRAINT "organizations_payout_delay_nonneg" CHECK ("organizations"."payout_delay_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lower" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "door_assignments" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "door_assignments_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "door_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"doors_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"total_capacity" integer DEFAULT 0 NOT NULL,
	"fee_override_bps" integer,
	"require_holder_names" boolean DEFAULT false NOT NULL,
	"require_age_18" boolean DEFAULT false NOT NULL,
	"allow_transfers" boolean DEFAULT false NOT NULL,
	"transfer_cutoff_hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_id_organization_id_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "events_total_capacity_nonneg" CHECK ("events"."total_capacity" >= 0),
	CONSTRAINT "events_fee_override_bps_range" CHECK ("events"."fee_override_bps" IS NULL OR ("events"."fee_override_bps" >= 0 AND "events"."fee_override_bps" <= 10000)),
	CONSTRAINT "events_transfer_cutoff_nonneg" CHECK ("events"."transfer_cutoff_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory" (
	"ticket_type_id" uuid PRIMARY KEY NOT NULL,
	"capacity" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_within_capacity" CHECK ("inventory"."sold" >= 0 AND "inventory"."reserved" >= 0 AND "inventory"."sold" + "inventory"."reserved" <= "inventory"."capacity")
);
--> statement-breakpoint
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "price_waves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"capacity" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_waves_price_nonneg" CHECK ("price_waves"."price" >= 0),
	CONSTRAINT "price_waves_sold_within_capacity" CHECK ("price_waves"."sold_count" >= 0 AND "price_waves"."reserved_count" >= 0 AND ("price_waves"."capacity" IS NULL OR "price_waves"."sold_count" + "price_waves"."reserved_count" <= "price_waves"."capacity"))
);
--> statement-breakpoint
ALTER TABLE "price_waves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"type" "promo_type" NOT NULL,
	"value" integer NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"ticket_type_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_used_within_max" CHECK ("promo_codes"."max_uses" IS NULL OR "promo_codes"."used_count" <= "promo_codes"."max_uses"),
	CONSTRAINT "promo_codes_value_valid" CHECK (("promo_codes"."type" = 'percent' AND "promo_codes"."value" > 0 AND "promo_codes"."value" <= 10000) OR ("promo_codes"."type" = 'fixed' AND "promo_codes"."value" > 0)),
	CONSTRAINT "promo_codes_uses_valid" CHECK ("promo_codes"."used_count" >= 0 AND ("promo_codes"."max_uses" IS NULL OR "promo_codes"."max_uses" >= 0))
);
--> statement-breakpoint
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"promo_code_id" uuid,
	"items" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"vat_rate_bps" integer DEFAULT 1200 NOT NULL,
	"total_capacity" integer DEFAULT 0 NOT NULL,
	"max_per_order" integer DEFAULT 10 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_vat_rate_bps_range" CHECK ("ticket_types"."vat_rate_bps" >= 0 AND "ticket_types"."vat_rate_bps" <= 10000),
	CONSTRAINT "ticket_types_total_capacity_nonneg" CHECK ("ticket_types"."total_capacity" >= 0),
	CONSTRAINT "ticket_types_max_per_order_pos" CHECK ("ticket_types"."max_per_order" > 0)
);
--> statement-breakpoint
ALTER TABLE "ticket_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_capacity_nonneg" CHECK ("venues"."capacity" IS NULL OR "venues"."capacity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "venues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "abandoned_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"recovered_order_id" uuid,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abandoned_checkouts_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "abandoned_checkouts_emails_sent_nonneg" CHECK ("abandoned_checkouts"."emails_sent" >= 0)
);
--> statement-breakpoint
ALTER TABLE "abandoned_checkouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"scanned_by" uuid,
	"device_id" text NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"result" "checkin_result" NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"price_wave_id" uuid,
	"unit_price" integer NOT NULL,
	"qty" integer NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	CONSTRAINT "order_items_qty_pos" CHECK ("order_items"."qty" > 0),
	CONSTRAINT "order_items_amounts_valid" CHECK ("order_items"."unit_price" >= 0 AND "order_items"."discount_amount" >= 0 AND "order_items"."discount_amount" <= "order_items"."unit_price" * "order_items"."qty"),
	CONSTRAINT "order_items_vat_rate_bps_range" CHECK ("order_items"."vat_rate_bps" >= 0 AND "order_items"."vat_rate_bps" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"customer_id" uuid,
	"reservation_id" uuid,
	"promo_code_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"company_ico" text,
	"company_dic" text,
	"age_confirmed_at" timestamp with time zone,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent" text,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"application_fee" integer DEFAULT 0 NOT NULL,
	"utm" jsonb,
	"fbp" text,
	"fbc" text,
	"client_ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "orders_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "orders_stripe_payment_intent_unique" UNIQUE("stripe_payment_intent"),
	CONSTRAINT "orders_id_event_id_uq" UNIQUE("id","event_id"),
	CONSTRAINT "orders_id_organization_id_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "orders_currency_czk" CHECK ("orders"."currency" = 'CZK'),
	CONSTRAINT "orders_refunded_amount_range" CHECK ("orders"."refunded_amount" >= 0 AND "orders"."refunded_amount" <= "orders"."total"),
	CONSTRAINT "orders_amounts_valid" CHECK ("orders"."subtotal" >= 0 AND "orders"."discount" >= 0 AND "orders"."discount" <= "orders"."subtotal" AND "orders"."total" = "orders"."subtotal" - "orders"."discount"),
	CONSTRAINT "orders_application_fee_range" CHECK ("orders"."application_fee" >= 0 AND "orders"."application_fee" <= "orders"."total")
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_customer_id" uuid,
	"to_email" text NOT NULL,
	"to_name" text,
	"old_code" text NOT NULL,
	"new_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"qr_version" integer DEFAULT 1 NOT NULL,
	"holder_name" text,
	"code" text NOT NULL,
	"status" "ticket_status" DEFAULT 'valid' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "tickets_id_event_id_uq" UNIQUE("id","event_id"),
	CONSTRAINT "tickets_code_min_length" CHECK (char_length("tickets"."code") >= 16),
	CONSTRAINT "tickets_qr_version_pos" CHECK ("tickets"."qr_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"base_amount" integer NOT NULL,
	"vat_amount" integer NOT NULL,
	"total_amount" integer NOT NULL,
	CONSTRAINT "invoice_lines_position_pos" CHECK ("invoice_lines"."position" > 0),
	CONSTRAINT "invoice_lines_quantity_pos" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_vat_rate_bps_range" CHECK ("invoice_lines"."vat_rate_bps" >= 0 AND "invoice_lines"."vat_rate_bps" <= 10000),
	CONSTRAINT "invoice_lines_total_sum" CHECK ("invoice_lines"."total_amount" = "invoice_lines"."base_amount" + "invoice_lines"."vat_amount")
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"organization_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_sequences_organization_id_year_pk" PRIMARY KEY("organization_id","year"),
	CONSTRAINT "invoice_sequences_last_number_nonneg" CHECK ("invoice_sequences"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_organization_id" uuid,
	"order_id" uuid,
	"credit_for_invoice_id" uuid,
	"number" text NOT NULL,
	"type" "invoice_type" NOT NULL,
	"pdf_path" text,
	"issued_at" timestamp with time zone NOT NULL,
	"totals" jsonb NOT NULL,
	"issuer_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_credit_note_has_original" CHECK ("invoices"."type" <> 'credit_note' OR "invoices"."credit_for_invoice_id" IS NOT NULL),
	CONSTRAINT "invoices_invoice_has_order" CHECK ("invoices"."type" <> 'invoice' OR "invoices"."order_id" IS NOT NULL),
	CONSTRAINT "invoices_commission_has_recipient" CHECK ("invoices"."type" <> 'commission_invoice' OR "invoices"."recipient_organization_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_refund_id" text NOT NULL,
	"amount" integer NOT NULL,
	"application_fee_refunded" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"credit_note_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_stripe_refund_id_unique" UNIQUE("stripe_refund_id"),
	CONSTRAINT "refunds_credit_note_id_unique" UNIQUE("credit_note_id"),
	CONSTRAINT "refunds_amount_pos" CHECK ("refunds"."amount" > 0),
	CONSTRAINT "refunds_fee_nonneg" CHECK ("refunds"."application_fee_refunded" >= 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"gross" bigint DEFAULT 0 NOT NULL,
	"refunds" bigint DEFAULT 0 NOT NULL,
	"stripe_fees" bigint DEFAULT 0 NOT NULL,
	"fee_base" bigint DEFAULT 0 NOT NULL,
	"fee_vat" bigint DEFAULT 0 NOT NULL,
	"payout_amount" bigint DEFAULT 0 NOT NULL,
	"rounding" bigint DEFAULT 0 NOT NULL,
	"commission_invoice_id" uuid,
	"stripe_payout_id" text,
	"status" "settlement_status" DEFAULT 'open' NOT NULL,
	"payout_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_stripe_payout_id_unique" UNIQUE("stripe_payout_id")
);
--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_nonneg" CHECK ("jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_assignments" ADD CONSTRAINT "door_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_assignments" ADD CONSTRAINT "door_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_waves" ADD CONSTRAINT "price_waves_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_event_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "public"."events"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "public"."events"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_checkouts" ADD CONSTRAINT "abandoned_checkouts_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_checkouts" ADD CONSTRAINT "abandoned_checkouts_recovered_order_id_orders_id_fk" FOREIGN KEY ("recovered_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "public"."events"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_ticket_event_fk" FOREIGN KEY ("ticket_id","event_id") REFERENCES "public"."tickets"("id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_wave_id_price_waves_id_fk" FOREIGN KEY ("price_wave_id") REFERENCES "public"."price_waves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "public"."events"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_from_customer_id_customers_id_fk" FOREIGN KEY ("from_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_event_fk" FOREIGN KEY ("order_id","event_id") REFERENCES "public"."orders"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "public"."events"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recipient_organization_id_organizations_id_fk" FOREIGN KEY ("recipient_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_for_invoice_id_invoices_id_fk" FOREIGN KEY ("credit_for_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_credit_note_id_invoices_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_org_fk" FOREIGN KEY ("order_id","organization_id") REFERENCES "public"."orders"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_commission_invoice_id_invoices_id_fk" FOREIGN KEY ("commission_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_event_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "public"."events"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_organization_id_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_email_active_uq" ON "invitations" USING btree ("organization_id","email") WHERE "invitations"."accepted_at" IS NULL AND "invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "door_assignments_event_id_idx" ON "door_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_organization_id_slug_uq" ON "events" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "events_organization_id_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_venue_id_idx" ON "events" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "price_waves_ticket_type_id_idx" ON "price_waves" USING btree ("ticket_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_event_id_code_uq" ON "promo_codes" USING btree ("event_id",upper("code"));--> statement-breakpoint
CREATE INDEX "promo_codes_event_id_idx" ON "promo_codes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "promo_codes_organization_id_idx" ON "promo_codes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reservations_event_id_idx" ON "reservations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reservations_promo_code_id_idx" ON "reservations" USING btree ("promo_code_id");--> statement-breakpoint
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "reservations_session_id_idx" ON "reservations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ticket_types_event_id_idx" ON "ticket_types" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ticket_types_organization_id_idx" ON "ticket_types" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "venues_organization_id_idx" ON "venues" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "abandoned_checkouts_reservation_id_idx" ON "abandoned_checkouts" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "abandoned_checkouts_recovered_order_id_idx" ON "abandoned_checkouts" USING btree ("recovered_order_id");--> statement-breakpoint
CREATE INDEX "checkins_event_id_idx" ON "checkins" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "checkins_organization_id_idx" ON "checkins" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "checkins_scanned_by_idx" ON "checkins" USING btree ("scanned_by");--> statement-breakpoint
CREATE INDEX "checkins_ticket_id_idx" ON "checkins" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "checkins_scanned_at_idx" ON "checkins" USING btree ("scanned_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_ticket_type_id_idx" ON "order_items" USING btree ("ticket_type_id");--> statement-breakpoint
CREATE INDEX "order_items_price_wave_id_idx" ON "order_items" USING btree ("price_wave_id");--> statement-breakpoint
CREATE INDEX "orders_reservation_id_idx" ON "orders" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "orders_organization_id_idx" ON "orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "orders_event_id_idx" ON "orders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_promo_code_id_idx" ON "orders" USING btree ("promo_code_id");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ticket_transfers_ticket_id_idx" ON "ticket_transfers" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_transfers_from_customer_id_idx" ON "ticket_transfers" USING btree ("from_customer_id");--> statement-breakpoint
CREATE INDEX "tickets_order_item_id_idx" ON "tickets" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "tickets_organization_id_idx" ON "tickets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tickets_order_id_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tickets_ticket_type_id_idx" ON "tickets" USING btree ("ticket_type_id");--> statement-breakpoint
CREATE INDEX "tickets_event_id_idx" ON "tickets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tickets_checked_in_by_idx" ON "tickets" USING btree ("checked_in_by");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_invoice_id_position_uq" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_organization_id_number_uq" ON "invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "invoices_organization_id_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_order_id_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_recipient_organization_id_idx" ON "invoices" USING btree ("recipient_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_id_invoice_uq" ON "invoices" USING btree ("order_id") WHERE "invoices"."type" = 'invoice';--> statement-breakpoint
CREATE INDEX "invoices_credit_for_invoice_id_idx" ON "invoices" USING btree ("credit_for_invoice_id");--> statement-breakpoint
CREATE INDEX "refunds_organization_id_idx" ON "refunds" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "refunds_order_id_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_event_id_uq" ON "settlements" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "settlements_organization_id_idx" ON "settlements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "settlements_commission_invoice_id_idx" ON "settlements" USING btree ("commission_invoice_id");--> statement-breakpoint
CREATE INDEX "audit_log_organization_id_at_idx" ON "audit_log" USING btree ("organization_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "jobs_status_run_at_idx" ON "jobs" USING btree ("status","run_at");