import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "@/lib/config/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let instance: Db | undefined;

/** Lazy singleton. `prepare: false` kvůli transakčnímu poolerovi (port 6543). */
export function getDb(): Db {
  if (!instance) {
    const client = postgres(getServerEnv().DATABASE_URL, { prepare: false, max: 5 });
    instance = drizzle(client, { schema });
  }
  return instance;
}
