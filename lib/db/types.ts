import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Společný typ pro produkční (postgres-js) i testovací (PGlite) databázi.
 * Funkce v `lib/` berou `db` / `tx` parametrem, server actions předají `getDb()`.
 */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Transakce je také `AnyDb` (stejné API), typ jen dokumentuje záměr „volat uvnitř transakce". */
export type AnyTx = AnyDb;
