import type { AnyTx } from "@/lib/db/types";
import { auditLog } from "@/lib/db/schema";

export type AuditInput = {
  actorId: string | null;
  organizationId?: string | null;
  /** např. `invitation.create` */
  action: string;
  entity: string;
  entityId: string | null;
  /** Změněné hodnoty. Žádné tokeny, hashe ani hesla (kontroluje se). */
  diff?: Record<string, unknown> | null;
};

const SECRET_KEY = /token|hash|password|secret|api[_-]?key|authorization|cookie/i;

/** Vyhodí, pokud `diff` obsahuje klíč, který vypadá jako tajná hodnota. */
export function assertNoSecrets(value: unknown, path = "diff"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        throw new Error(`audit: klíč "${path}.${key}" vypadá jako tajná hodnota`);
      }
      assertNoSecrets(v, `${path}.${key}`);
    }
  }
}

/**
 * Zapíše řádek auditu. Volá se VŽDY ve stejné transakci jako auditovaná změna,
 * takže rollback změny zruší i audit (a naopak změna bez auditu nevznikne).
 */
export async function recordAudit(tx: AnyTx, input: AuditInput): Promise<void> {
  const diff = input.diff ?? null;
  assertNoSecrets(diff);
  await tx.insert(auditLog).values({
    actorId: input.actorId,
    organizationId: input.organizationId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    diff,
  });
}
