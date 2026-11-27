import { pgEnum } from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["owner", "staff", "door"]);
export const eventStatus = pgEnum("event_status", [
  "draft",
  "published",
  "sold_out",
  "ended",
  "cancelled",
]);
export const promoType = pgEnum("promo_type", ["percent", "fixed"]);
export const reservationStatus = pgEnum("reservation_status", [
  "active",
  "converted",
  "expired",
  "released",
]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "expired",
  "cancelled",
  "refunded",
  "partially_refunded",
]);
export const ticketStatus = pgEnum("ticket_status", ["valid", "checked_in", "void"]);
export const checkinResult = pgEnum("checkin_result", ["ok", "duplicate", "invalid", "void"]);
export const invoiceType = pgEnum("invoice_type", ["invoice", "credit_note", "commission_invoice"]);
export const settlementStatus = pgEnum("settlement_status", ["open", "closed", "paid_out"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);
