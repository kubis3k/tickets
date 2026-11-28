/** Přihlašovací údaje platform admina pro e2e. Nikdy se nevypisují. */
export function adminCredentials(): { email: string; password: string } {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Chybí E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD (nebo PLATFORM_ADMIN_EMAIL/SEED_ADMIN_PASSWORD)",
    );
  }
  return { email, password };
}

/** Guard proti produkci: e2e smí běžet jen proti localhost. */
export function assertLocalE2e(): void {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    // neplatná URL se řeší níže jako nelokální
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      "E2E odmítnuto: NEXT_PUBLIC_APP_URL není localhost. Spouštěj e2e jen proti lokálnímu/testovacímu prostředí, nikdy proti produkci.",
    );
  }
}

export function e2eBaseUrl(): string {
  assertLocalE2e();
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
