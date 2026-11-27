import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

const root = process.cwd();

/** Rozdělí drizzle-kit SQL soubor na jednotlivé příkazy. */
export function splitMigration(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function migrationFiles(): string[] {
  return readdirSync(join(root, "drizzle"))
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
}

/** Čerstvá in-memory DB: auth stub + všechny migrace v pořadí. */
export async function createTestDb() {
  const client = new PGlite();
  await client.exec(readFileSync(join(root, "test/sql/auth-stub.sql"), "utf8"));
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(root, "drizzle", file), "utf8");
    for (const statement of splitMigration(sql)) {
      await client.exec(statement);
    }
  }
  const db = drizzle(client, { schema });
  return { client, db };
}
