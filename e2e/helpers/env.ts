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

export function e2eBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
