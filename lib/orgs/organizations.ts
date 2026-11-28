import { asc, eq, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { memberships, organizations } from "@/lib/db/schema";
import type { AnyDb, AnyTx } from "@/lib/db/types";
import type { OrgInput, OrgUpdateInput } from "@/lib/validation/org";

export type Organization = typeof organizations.$inferSelect;

export type OrganizationListItem = {
  id: string;
  slug: string;
  name: string;
  ico: string | null;
  vatPayer: boolean;
  feeBps: number;
  feeFixed: number;
  memberCount: number;
};

export type CreateOrganizationResult = { ok: true; id: string } | { ok: false; reason: "slug_taken" };

export type UpdateOrganizationResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_found" };

/** Sloupce, které `updateOrganization` smí měnit (slug a Stripe/tracking stav tu nejsou záměrně). */
export const EDITABLE_ORG_FIELDS = [
  "name",
  "legalName",
  "ico",
  "dic",
  "street",
  "city",
  "zip",
  "country",
  "vatPayer",
  "invoicePrefix",
  "feeBps",
  "feeFixed",
  "payoutDelayDays",
  "logoUrl",
  "primaryColor",
  "metaPixelId",
] as const satisfies readonly (keyof OrgUpdateInput & keyof Organization)[];

/**
 * Založí organizaci + 1 audit řádek. Volat v transakci.
 * Duplicitní slug řeší `ON CONFLICT DO NOTHING` (atomicky, bez zrušení transakce výjimkou).
 */
export async function createOrganization(
  tx: AnyTx,
  input: OrgInput,
  actorId: string,
): Promise<CreateOrganizationResult> {
  const [row] = await tx
    .insert(organizations)
    .values(input)
    .onConflictDoNothing({ target: organizations.slug })
    .returning({ id: organizations.id });
  if (!row) return { ok: false, reason: "slug_taken" };

  await recordAudit(tx, {
    actorId,
    organizationId: row.id,
    action: "organization.create",
    entity: "organization",
    entityId: row.id,
    diff: { ...input },
  });
  return { ok: true, id: row.id };
}

/**
 * Upraví organizaci. Řádek se zamkne (`FOR UPDATE`), audit diff obsahuje jen skutečně změněná pole
 * ve tvaru `{ pole: { from, to } }`. Beze změny se nezapíše nic (ani audit).
 */
export async function updateOrganization(
  tx: AnyTx,
  orgId: string,
  input: OrgUpdateInput,
  actorId: string,
): Promise<UpdateOrganizationResult> {
  const [current] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update");
  if (!current) return { ok: false, reason: "not_found" };

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const patch: Partial<OrgUpdateInput> = {};
  for (const field of EDITABLE_ORG_FIELDS) {
    if (current[field] !== input[field]) {
      diff[field] = { from: current[field], to: input[field] };
      Object.assign(patch, { [field]: input[field] });
    }
  }
  if (Object.keys(diff).length === 0) return { ok: true, changed: false };

  await tx
    .update(organizations)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(organizations.id, orgId));

  await recordAudit(tx, {
    actorId,
    organizationId: orgId,
    action: "organization.update",
    entity: "organization",
    entityId: orgId,
    diff,
  });
  return { ok: true, changed: true };
}

/** Všechny organizace s počtem členů (jen pro platform admina). */
export async function listOrganizations(db: AnyDb): Promise<OrganizationListItem[]> {
  return db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      ico: organizations.ico,
      vatPayer: organizations.vatPayer,
      feeBps: organizations.feeBps,
      feeFixed: organizations.feeFixed,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM ${memberships} WHERE ${memberships.organizationId} = ${organizations.id}
      )`,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
}

export async function getOrganization(db: AnyDb, id: string): Promise<Organization | null> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return row ?? null;
}
