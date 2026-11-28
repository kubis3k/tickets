// Spouští se přes `pnpm db:seed` = `tsx --conditions=react-server`, aby šlo importovat
// `server-only` moduly (supabase-admin) mimo Next. Service role klíč zůstává jen v env.ts a supabase-admin.ts.
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createSupabaseAdminClient } from "../lib/auth/supabase-admin";
import { EnvValidationError, getServerEnv } from "../lib/config/env";
import { getClientEnv } from "../lib/config/env.client";
import * as schema from "../lib/db/schema";
import { ensureAuthUser } from "../lib/seed/auth-user";
import { runSeed } from "../lib/seed/seed";

// Mimo Next se `.env.local` nenačítá. Nic se nevypisuje.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main(): Promise<void> {
  // Validace přes sdílená Zod schémata; chyba nese jen názvy proměnných.
  const env = getServerEnv();
  getClientEnv();

  const supabase = createSupabaseAdminClient();
  const admin = await ensureAuthUser(
    {
      listUsers: (params) => supabase.auth.admin.listUsers(params),
      createUser: (attrs) => supabase.auth.admin.createUser(attrs),
    },
    env.PLATFORM_ADMIN_EMAIL,
    env.SEED_ADMIN_PASSWORD,
  );
  console.info("admin ready");

  // Migrace i seed jdou přes přímé spojení (port 5432).
  const client = postgres(env.DIRECT_URL, { prepare: false, max: 1 });
  try {
    const counts = await runSeed(drizzle(client, { schema }), {
      adminAuthUserId: admin.id,
      adminEmail: env.PLATFORM_ADMIN_EMAIL,
    });
    console.info("seed done", counts);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof EnvValidationError) {
    console.error(error.message); // jen názvy proměnných
  } else {
    // Bez detailu chyby: může obsahovat connection string nebo e-mail.
    console.error("seed failed", error instanceof Error ? error.name : "unknown");
  }
  process.exit(1);
});
