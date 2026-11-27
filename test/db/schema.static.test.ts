import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";

const isTable = (v: unknown): v is PgTable => is(v, PgTable);
const tables = Object.values(schema as Record<string, unknown>).filter(isTable);

/** Tabulky, jejichž PK není uuid, a proč. */
const PK_EXCEPTIONS: Record<string, string> = {
  stripe_events: "id = Stripe event id (text)",
  inventory: "PK = ticket_type_id (uuid, ale FK, ne defaultRandom)",
  memberships: "složený PK",
  door_assignments: "složený PK",
  invoice_sequences: "složený PK (organization_id, year)",
};

const MONEY_NAME = /(^|_)(amount|price|total|subtotal|discount|gross|rounding|fee|fees|refunds|fee_base|fee_fixed|vat_amount|unit_price)$/;
const BPS_NAME = /_bps$/;
const FORBIDDEN_TYPES = ["PgReal", "PgDoublePrecision", "PgNumeric", "PgNumericNumber", "PgNumericBigInt", "PgNumericString", "PgDecimal"];

describe("DB schema – statické invarianty", () => {
  it("obsahuje všechny očekávané tabulky", () => {
    const names = tables.map((t) => getTableConfig(t).name).sort();
    expect(names).toEqual(
      [
        "abandoned_checkouts", "audit_log", "checkins", "customers", "door_assignments",
        "events", "inventory", "invitations", "invoice_lines", "invoice_sequences", "invoices", "jobs",
        "memberships", "order_items", "orders", "organizations", "platform_admins",
        "price_waves", "promo_codes", "refunds", "reservations", "settlements", "stripe_events",
        "ticket_transfers", "ticket_types", "tickets", "users", "venues",
      ].sort(),
    );
  });

  for (const table of tables) {
    const cfg = getTableConfig(table);

    describe(cfg.name, () => {
      it("má zapnuté RLS", () => {
        expect(cfg.enableRLS).toBe(true);
      });

      it("PK je uuid (mimo whitelist)", () => {
        if (cfg.name in PK_EXCEPTIONS) return;
        const pk = cfg.columns.filter((c) => c.primary);
        expect(pk).toHaveLength(1);
        expect(pk[0]?.getSQLType()).toBe("uuid");
      });

      it("každý timestamp je withTimezone", () => {
        for (const c of cfg.columns.filter((c) => c.columnType === "PgTimestamp")) {
          expect(c.getSQLType(), `${cfg.name}.${c.name}`).toBe("timestamp with time zone");
        }
      });

      it("peněžní sloupce jsou integer|bigint, procenta jsou integer bps", () => {
        for (const c of cfg.columns.filter((c) => MONEY_NAME.test(c.name))) {
          expect(["integer", "bigint"], `${cfg.name}.${c.name}`).toContain(c.getSQLType());
        }
        for (const c of cfg.columns.filter((c) => BPS_NAME.test(c.name))) {
          expect(c.getSQLType(), `${cfg.name}.${c.name}`).toBe("integer");
        }
      });

      it("bigint je jen mode number a jen v settlements", () => {
        for (const c of cfg.columns.filter((c) => c.getSQLType() === "bigint")) {
          expect(cfg.name, `${cfg.name}.${c.name}`).toBe("settlements");
          expect(c.columnType, `${cfg.name}.${c.name}`).toBe("PgBigInt53");
        }
      });

      it("nepoužívá real/double/numeric", () => {
        for (const c of cfg.columns) {
          expect(FORBIDDEN_TYPES, `${cfg.name}.${c.name}`).not.toContain(c.columnType);
          expect(c.getSQLType()).not.toMatch(/^(real|double precision|numeric|decimal|money)/);
        }
      });
    });
  }

  it("výjimky z PK whitelistu existují (žádný mrtvý záznam)", () => {
    const names = new Set(tables.map((t) => getTableConfig(t).name));
    for (const name of Object.keys(PK_EXCEPTIONS)) expect(names.has(name)).toBe(true);
  });
});
