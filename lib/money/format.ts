/**
 * Formátování jen pro zobrazení. Vstup je vždy integer; dělí se celočíselně (bez float dělení),
 * takže výsledek je přesný pro každý integer.
 */

const NBSP = "\u00a0";
const wholeFormat = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0, useGrouping: true });

function assertInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what}: očekáván integer, dostal ${value}`);
}

function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

/** `59900` → `"599,00 Kč"` (tisíce odděleny nezlomitelnou mezerou, před „Kč" také). */
export function formatHalere(halere: number): string {
  assertInteger(halere, "formatHalere");
  const sign = halere < 0 ? "-" : "";
  const abs = Math.abs(halere);
  const whole = wholeFormat.format((abs - (abs % 100)) / 100);
  return `${sign}${whole},${twoDigits(abs % 100)}${NBSP}Kč`;
}

/** Hodnota pro `<input>`: `59900` → `"599,00"`, bez tisícových mezer a měny (zpětně parsovatelné). */
export function formatHalereInput(halere: number): string {
  assertInteger(halere, "formatHalereInput");
  const sign = halere < 0 ? "-" : "";
  const abs = Math.abs(halere);
  return `${sign}${(abs - (abs % 100)) / 100},${twoDigits(abs % 100)}`;
}

/** `500` → `"5 %"`, `550` → `"5,5 %"`, `525` → `"5,25 %"` (nezlomitelná mezera před %). */
export function formatBps(bps: number): string {
  return `${formatBpsInput(bps)}${NBSP}%`;
}

/** Hodnota pro `<input>` v procentech: `500` → `"5"`, `550` → `"5,5"`, `525` → `"5,25"`. */
export function formatBpsInput(bps: number): string {
  assertInteger(bps, "formatBps");
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  const whole = (abs - (abs % 100)) / 100;
  const rest = abs % 100;
  if (rest === 0) return `${sign}${whole}`;
  const fraction = twoDigits(rest).replace(/0$/, "");
  return `${sign}${whole},${fraction}`;
}
