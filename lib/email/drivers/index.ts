import "server-only";
import { getServerEnv } from "@/lib/config/env";
import type { EmailDriver } from "../types";
import { createOutboxDriver } from "./outbox";
import { createResendDriver } from "./resend";

/** Výběr podle `EMAIL_DRIVER` (default `resend`; `outbox` je zakázaný v produkci už v env schématu). */
export function getEmailDriver(): EmailDriver {
  const env = getServerEnv();
  if (env.EMAIL_DRIVER === "outbox") return createOutboxDriver();
  // Schéma garantuje obě hodnoty při EMAIL_DRIVER=resend; assert zúží typ.
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("RESEND_API_KEY a EMAIL_FROM jsou povinné při EMAIL_DRIVER=resend");
  }
  return createResendDriver({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
}
