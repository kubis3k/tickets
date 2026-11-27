import type { z } from "zod";

export type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly names: readonly string[];
  constructor(names: readonly string[]) {
    super(`Neplatná nebo chybějící konfigurace prostředí: ${names.join(", ")}`);
    this.name = "EnvValidationError";
    this.names = names;
  }
}

/** Produkční runtime: Vercel production, nebo Next production server (ne build fáze). */
export function isProductionRuntime(source: EnvSource): boolean {
  if (source.VERCEL_ENV === "production") return true;
  return source.NODE_ENV === "production" && source.NEXT_PHASE !== "phase-production-build";
}

/** SKIP_ENV_VALIDATION=1 je povolen jen mimo produkční runtime. V produkci se ignoruje. */
export function skipValidation(source: EnvSource): boolean {
  return source.SKIP_ENV_VALIDATION === "1" && !isProductionRuntime(source);
}

/** Parsuje schéma; chyba nese jen NÁZVY proměnných, nikdy hodnoty. */
export function parseEnv<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "unknown")))];
    throw new EnvValidationError(names);
  }
  return result.data;
}
