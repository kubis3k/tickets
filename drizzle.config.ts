import { defineConfig } from "drizzle-kit";

// DIRECT_URL se čte jen z procesu; `generate` a `check` databázi nepotřebují.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DIRECT_URL ?? "" },
});
