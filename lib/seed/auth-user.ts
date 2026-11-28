/** Minimální tvar Supabase admin API, který seed potřebuje (usnadňuje test bez sítě). */
export type AuthAdminApi = {
  listUsers(params: { page: number; perPage: number }): Promise<{
    data: { users: { id: string; email?: string | null }[] };
    error: { code?: string } | null;
  }>;
  createUser(attrs: { email: string; email_confirm: boolean; password?: string }): Promise<{
    data: { user: { id: string } | null };
    error: { code?: string } | null;
  }>;
};

const PER_PAGE = 200;
const MAX_PAGES = 1000;

/**
 * Najde auth uživatele podle e-mailu (stránkováním), jinak ho vytvoří.
 * Heslo se použije jen při vytvoření a jen pokud je zadané (jinak se přihlašuje magic linkem).
 * Chyby nesou jen kód, nikdy e-mail ani heslo.
 */
export async function ensureAuthUser(
  admin: AuthAdminApi,
  email: string,
  password?: string,
): Promise<{ id: string; created: boolean }> {
  const wanted = email.trim().toLowerCase();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`seed: listUsers selhalo (${error.code ?? "unknown"})`);
    const found = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (found) return { id: found.id, created: false };
    if (data.users.length < PER_PAGE) break;
  }

  const { data, error } = await admin.createUser({
    email: wanted,
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  if (error || !data.user) {
    throw new Error(`seed: createUser selhalo (${error?.code ?? "unknown"})`);
  }
  return { id: data.user.id, created: true };
}
