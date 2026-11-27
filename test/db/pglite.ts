import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
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

type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
export type TestTx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

/**
 * Spustí `fn` v transakci jako Supabase klient: `uid` = authenticated s JWT sub,
 * `null` = anon. `SET LOCAL` platí jen do konce transakce, po ní se role sama vrátí.
 * Transakce se vždy vrací zpět (rollback), takže `fn` nic nezanechá.
 */
export async function asUser<T>(db: TestDb, uid: string | null, fn: (tx: TestTx) => Promise<T>): Promise<T> {
  const rollback = Symbol("rollback");
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      if (uid === null) {
        await tx.execute(sql`SET LOCAL ROLE anon`);
      } else {
        await tx.execute(sql`SET LOCAL ROLE authenticated`);
        await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', ${uid}, true)`);
      }
      result = await fn(tx);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  return result as T;
}
