import { eq, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { organizations } from "@/lib/db/schema";
import type { AnyTx } from "@/lib/db/types";
import type { OrgOwnerSettingsInput } from "@/lib/validation/org-owner";

export type UpdateOrgOwnerSettingsResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_found" };

/** Jediné sloupce, které owner smí měnit (viz `orgOwnerSettingsSchema`). */
export const OWNER_EDITABLE_FIELDS = [
  "name",
  "street",
  "city",
  "zip",
  "country",
  "logoUrl",
  "primaryColor",
] as const satisfies readonly (keyof OrgOwnerSettingsInput & keyof typeof organizations.$inferSelect)[];

/**
 * Upraví nastavení organizace z pohledu ownera. Iteruje jen po `OWNER_EDITABLE_FIELDS`, takže
 * případná další pole ve vstupu (poplatky, DPH, …) se ignorují i bez validace. Řádek se zamkne,
 * audit diff má jen skutečně změněná pole; beze změny se nezapíše nic. Volat v transakci.
 */
export async function updateOrgOwnerSettings(
  tx: AnyTx,
  orgId: string,
  input: OrgOwnerSettingsInput,
  actorId: string,
): Promise<UpdateOrgOwnerSettingsResult> {
  const [current] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update");
  if (!current) return { ok: false, reason: "not_found" };

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const patch: Partial<OrgOwnerSettingsInput> = {};
  for (const field of OWNER_EDITABLE_FIELDS) {
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
