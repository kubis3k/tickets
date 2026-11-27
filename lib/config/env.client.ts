import { z } from "zod";
import { parseEnv, skipValidation, type EnvSource } from "./env.shared";

// Bez "server-only": smí se importovat i z klientských komponent.
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

let clientCache: ClientEnv | undefined;

export function getClientEnv(source?: EnvSource): ClientEnv {
  if (clientCache) return clientCache;
  // NEXT_PUBLIC_* se v klientském bundlu inlinuje jen při přímém přístupu k process.env.X
  const src: EnvSource = source ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PHASE: process.env.NEXT_PHASE,
  };
  const env = skipValidation(src) ? (src as unknown as ClientEnv) : parseEnv(clientSchema, src);
  clientCache = env;
  return env;
}

/** Lazy přístup (parse při prvním čtení, cache). */
export const clientEnv: ClientEnv = new Proxy({} as ClientEnv, {
  get: (_t, key) => {
    // Nestringové klíče a thenable/React probe nespouští validaci.
    if (typeof key !== "string" || key === "$$typeof" || key === "then") return undefined;
    return getClientEnv()[key as keyof ClientEnv];
  },
});

/** Pouze pro testy. */
export function resetClientEnvCache(): void {
  clientCache = undefined;
}
