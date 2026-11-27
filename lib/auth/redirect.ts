export const DEFAULT_AFTER_LOGIN = "/admin";

const PLACEHOLDER_ORIGIN = "http://internal.invalid";

function hasForbiddenChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    // zpětné lomítko a řídicí znaky prohlížeče normalizují nebo ignorují
    if (ch === "\\" || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Ochrana proti open redirectu: propustí jen relativní cestu uvnitř aplikace.
 * Cokoli jiného (absolutní URL, `//host`, `/\host`, `javascript:`) vrátí `fallback`.
 */
export function safeNext(
  next: string | null | undefined,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (hasForbiddenChar(next)) return fallback;
  try {
    if (new URL(next, PLACEHOLDER_ORIGIN).origin !== PLACEHOLDER_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return next;
}

export function loginUrl(next?: string | null): string {
  const safe = safeNext(next, "");
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/**
 * Session bez řádku v `users` (pozvaný, který ještě nepřijal pozvánku) se po přihlášení smí
 * ponechat jen při návratu na přijetí pozvánky. Jinak se odhlásí.
 */
export function isInviteNext(next: string | null | undefined): boolean {
  const safe = safeNext(next, "");
  if (safe === "") return false;
  // Porovnává se normalizovaná cesta (URL rozloží `.`/`..` a `%2e%2e`), ne surový řetězec.
  const pathname = new URL(safe, PLACEHOLDER_ORIGIN).pathname;
  return pathname.startsWith("/invite/") && !pathname.includes("..");
}
