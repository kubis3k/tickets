import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase `auth` schéma. Deklarováno jen kvůli cizím klíčům;
 * drizzle-kit ho negeneruje (`schemaFilter: ['public']`).
 */
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});
