import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit `.env.local` nenačítá; nic se nevypisuje.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// DIRECT_URL se čte jen z procesu; `generate` a `check` databázi nepotřebují.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DIRECT_URL ?? "" },
});
