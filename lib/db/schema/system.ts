import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./_helpers";
import { jobStatus } from "./enums";
import { organizations, users } from "./identity";

/** Idempotence webhooků: INSERT ... ON CONFLICT DO NOTHING, pak zpracování. */
export const stripeEvents = pgTable("stripe_events", {
  /** Stripe event id (evt_...) */
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: tstz("received_at").notNull().defaultNow(),
  processedAt: tstz("processed_at"),
}).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diff: jsonb("diff"),
    at: tstz("at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_organization_id_at_idx").on(t.organizationId, t.at),
    index("audit_log_actor_id_idx").on(t.actorId),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
).enableRLS();

/** Outbox / fronta úloh (e-maily, follow-upy webhooků, cron). */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAt: tstz("run_at").notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_status_run_at_idx").on(t.status, t.runAt),
    check("jobs_attempts_nonneg", sql`${t.attempts} >= 0`),
  ],
).enableRLS();
