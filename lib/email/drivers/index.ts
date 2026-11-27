import "server-only";
import { getServerEnv } from "@/lib/config/env";
import type { EmailDriver } from "../types";
import { createOutboxDriver } from "./outbox";
import { createResendDriver } from "./resend";

/** Výběr podle `EMAIL_DRIVER` (default `resend`; `outbox` je zakázaný v produkci už v env schématu). */
export function getEmailDriver(): EmailDriver {
  const env = getServerEnv();
  if (env.EMAIL_DRIVER === "outbox") return createOutboxDriver();
  return createResendDriver({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
}
