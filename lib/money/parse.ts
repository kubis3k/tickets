/**
 * Parsování uživatelského vstupu na integer. Bez float aritmetiky: vstup se rozloží jako string
 * na celou a desetinnou část a složí se celočíselně.
 */

/** Horní mez = max. `integer` v Postgresu (sloupce `fee_fixed` apod.). */
export const MAX_INT4 = 2_147_483_647;

// mezera, nezlomitelná mezera (U+00A0) a úzká nezlomitelná mezera (U+202F) jako oddělovač tisíců
const GROUPED = /^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/;
const PLAIN = /^\d+(?:[.,]\d{1,2})?$/;

/** Rozloží `"1 234,5"` na celé číslo a nejvýš 2 desetinné číslice; jinak `null`. */
function splitDecimal(input: string): { whole: string; fraction: string } | null {
  const text = input.trim();
  if (!PLAIN.test(text) && !GROUPED.test(text)) return null;
  const compact = text.replace(/[ \u00a0\u202f]/g, "");
  const [whole = "", fraction = ""] = compact.split(/[.,]/);
  return { whole, fraction: fraction.padEnd(2, "0") };
}

/**
 * `"12,5"` → 1250, `"1 234,56"` → 123456. Povolené jsou max. 2 desetinná místa, oddělovač `,` nebo `.`,
 * mezery jako tisíce (po třech číslicích). Záporné hodnoty, 3+ desetinná místa, písmena a přetečení
 * `integer` vrací `null`.
 */
export function parseCzkToHalere(input: string): number | null {
  const parts = splitDecimal(input);
  if (!parts) return null;
  if (parts.whole.length > 10) return null;
  const halere = Number(parts.whole) * 100 + Number(parts.fraction);
  return Number.isSafeInteger(halere) && halere <= MAX_INT4 ? halere : null;
}

/** `"5"` → 500, `"5,5"` → 550, `"12.25"` → 1225 (bps). Rozsah 0–100 %, max. 2 desetinná místa. */
export function parsePercentToBps(input: string): number | null {
  const parts = splitDecimal(input);
  if (!parts || parts.whole.length > 3) return null;
  const bps = Number(parts.whole) * 100 + Number(parts.fraction);
  return bps <= 10_000 ? bps : null;
}
