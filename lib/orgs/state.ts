export type OrgFormState = {
  readonly ok?: boolean;
  readonly message?: string;
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /** Odeslané hodnoty, aby se po chybě validace formulář nevyprázdnil. */
  readonly values?: Readonly<Record<string, string>>;
};

export type MutationResult = { ok: true; message: string } | { ok: false; error: string };

/** Jen textové položky formuláře (soubory se zahodí). */
export function stringEntries(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
