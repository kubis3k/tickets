import { z } from "zod";
import { orgUpdateSchema } from "@/lib/validation/org";

const shape = orgUpdateSchema.shape;

/**
 * Co smí měnit owner organizace: zobrazovaný název, fakturační adresa (bez IČO/DIČ/obchodního jména)
 * a branding. Poplatky, `vat_payer`, prefix řady, IČO/DIČ, slug a výplatní lhůtu mění jen platform admin.
 * Pole se skládají z hlídaných polí `orgUpdateSchema`; `z.object` zahodí (strip) vše ostatní ve vstupu,
 * takže `feeBps` apod. se nikdy nedostanou dál. (`pick` nejde, schéma má `superRefine`.)
 */
export const orgOwnerSettingsSchema = z.object({
  name: shape.name,
  street: shape.street,
  city: shape.city,
  zip: shape.zip,
  country: shape.country,
  logoUrl: shape.logoUrl,
  primaryColor: shape.primaryColor,
});

export type OrgOwnerSettingsInput = z.infer<typeof orgOwnerSettingsSchema>;
