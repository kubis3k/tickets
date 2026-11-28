import "server-only";
import { z } from "zod";
import { parseEnv, skipValidation, type EnvSource } from "./env.shared";

export { EnvValidationError } from "./env.shared";
export { clientEnv, getClientEnv, type ClientEnv } from "./env.client";

const serverSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
    EMAIL_DRIVER: z.enum(["resend", "outbox"]).default("resend"),
    PLATFORM_ADMIN_EMAIL: z.string().email(),
    SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
    VERCEL_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_DRIVER === "resend") {
      for (const key of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} je povinná při EMAIL_DRIVER=resend`,
          });
        }
      }
    }
    if (env.VERCEL_ENV === "production" && env.EMAIL_DRIVER === "outbox") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_DRIVER"],
        message: "EMAIL_DRIVER=outbox není povolen v produkci",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

let serverCache: ServerEnv | undefined;

export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  if (serverCache) return serverCache;
  const env = skipValidation(source)
    ? (source as unknown as ServerEnv)
    : parseEnv(serverSchema, source);
  serverCache = env;
  return env;
}

/** Pouze pro testy. */
export function resetServerEnvCache(): void {
  serverCache = undefined;
}
