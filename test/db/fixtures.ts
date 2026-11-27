import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { memberships, organizations, users } from "@/lib/db/schema";
import type { AnyDb } from "@/lib/db/types";

type OrgRole = "owner" | "staff" | "door";

export async function seedOrg(
  db: AnyDb,
  name = "Testovací org",
): Promise<{ id: string; slug: string }> {
  const slug = `org-${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(organizations)
    .values({ slug, name })
    .returning({ id: organizations.id });
  if (!row) throw new Error("seedOrg failed");
  return { id: row.id, slug };
}

/** Účet v `auth.users` (stub) bez řádku v `users`, jako po `admin.createUser`. */
export async function seedAuthUser(db: AnyDb, email: string): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`);
  return id;
}

/** Plnohodnotný uživatel aplikace (auth + users), volitelně člen organizace. */
export async function seedAppUser(
  db: AnyDb,
  email: string,
  membership?: { orgId: string; role: OrgRole },
): Promise<string> {
  const id = await seedAuthUser(db, email);
  await db.insert(users).values({ id, email });
  if (membership) {
    await db
      .insert(memberships)
      .values({ userId: id, organizationId: membership.orgId, role: membership.role });
  }
  return id;
}
