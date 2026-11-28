import { z } from "zod";
import { cs } from "@/lib/i18n/cs";
import { MAX_INT4, parseCzkToHalere, parsePercentToBps } from "@/lib/money/parse";

const v = cs.platform.validation;

export const RESERVED_SLUGS = [
  "platform",
  "login",
  "api",
  "scan",
  "invite",
  "auth",
  "admin",
] as const;

/** Prázdný řetězec / chybějící hodnota → `null`, jinak oříznutý string; pak se validuje `inner`. */
function nullable<T extends z.ZodType>(inner: T) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }, inner.nullable());
}

const text = (max: number) => z.string().max(max, { error: v.text });

export const slugSchema = z
  .string({ error: v.slug })
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, { error: v.slug })
  .refine((slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug), { error: v.slugReserved });

/** Pole, která jdou měnit po založení (bez `slug`). */
const editableShape = {
  name: z.string({ error: v.name }).trim().min(1, { error: v.name }).max(120, { error: v.name }),
  legalName: nullable(text(200)),
  ico: nullable(z.string().regex(/^\d{8}$/, { error: v.ico })),
  dic: nullable(z.string().regex(/^CZ\d{8,10}$/, { error: v.dic })),
  street: nullable(text(200)),
  city: nullable(text(120)),
  zip: nullable(text(20)),
  country: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim().toUpperCase() : "CZ"),
    z.string().regex(/^[A-Z]{2}$/, { error: v.country }),
  ),
  vatPayer: z.boolean(),
  invoicePrefix: z.preprocess(
    (value) => {
      if (typeof value !== "string") return null;
      const upper = value.trim().toUpperCase();
      return upper === "" ? null : upper;
    },
    z
      .string()
      .regex(/^[A-Z0-9]{1,10}$/, { error: v.invoicePrefix })
      .nullable(),
  ),
  /** procenta v bps (100 = 1 %) */
  feeBps: z
    .number({ error: v.feePercent })
    .int({ error: v.feePercent })
    .min(0, { error: v.feePercent })
    .max(10_000, { error: v.feePercent }),
  /** haléře */
  feeFixed: z
    .number({ error: v.feeFixedCzk })
    .int({ error: v.feeFixedCzk })
    .min(0, { error: v.feeFixedCzk })
    .max(MAX_INT4, { error: v.feeFixedCzk }),
  payoutDelayDays: z
    .number({ error: v.payoutDelayDays })
    .int({ error: v.payoutDelayDays })
    .min(0, { error: v.payoutDelayDays })
    .max(365, { error: v.payoutDelayDays }),
  logoUrl: nullable(
    z.url({ protocol: /^https$/, error: v.logoUrl }).max(2048, { error: v.logoUrl }),
  ),
  primaryColor: nullable(z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: v.primaryColor })),
  metaPixelId: nullable(z.string().regex(/^\d{5,20}$/, { error: v.metaPixelId })),
};

export const orgUpdateSchema = z.object(editableShape);
export const orgInputSchema = z.object({ slug: slugSchema, ...editableShape });

export type OrgInput = z.infer<typeof orgInputSchema>;
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Formulářové vstupy (procenta, Kč, dny jako string) → hodnoty pro schéma (bps, haléře, číslo).
 * Neparsovatelná hodnota se vynechá, takže ji schéma odmítne s hláškou pro příslušné pole.
 */
function normalizeOrgForm(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const form = raw as Record<string, unknown>;
  const feeFixedText = str(form.feeFixedCzk).trim();
  const days = str(form.payoutDelayDays).trim();
  return {
    ...form,
    vatPayer: form.vatPayer === "on" || form.vatPayer === "true" || form.vatPayer === true,
    feeBps: parsePercentToBps(str(form.feePercent)) ?? undefined,
    feeFixed: feeFixedText === "" ? 0 : (parseCzkToHalere(feeFixedText) ?? undefined),
    payoutDelayDays: /^\d{1,3}$/.test(days) ? Number(days) : undefined,
  };
}

export const orgFormSchema = z.preprocess(normalizeOrgForm, orgInputSchema);
export const orgUpdateFormSchema = z.preprocess(normalizeOrgForm, orgUpdateSchema);

const FIELD_ALIASES: Readonly<Record<string, string>> = {
  feeBps: "feePercent",
  feeFixed: "feeFixedCzk",
};

/** Zod issues → `{ pole formuláře: první hláška }`. */
export function orgFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    const field = FIELD_ALIASES[key] ?? key;
    if (field !== "" && !(field in out)) out[field] = issue.message;
  }
  return out;
}
