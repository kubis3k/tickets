import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Stejná cesta jako `DEFAULT_OUTBOX_DIR` v `lib/email/drivers/outbox.ts` (relativně ke kořeni repa). */
const OUTBOX_DIR = ".e2e-outbox";

type OutboxMessage = { to: string; subject: string; text: string; html: string };

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@.+_-]/g, "_");
}

/** Nejnovější zpráva pro daný e-mail, nebo `null`. Soubory se jmenují `<timestamp>-<to>.json`. */
export function latestOutboxMessage(to: string, dir: string = OUTBOX_DIR): OutboxMessage | null {
  if (!existsSync(dir)) return null;
  const suffix = `-${safeFilePart(to)}.json`;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  const newest = files.at(-1);
  if (!newest) return null;
  return JSON.parse(readFileSync(join(dir, newest), "utf8")) as OutboxMessage;
}

/** Počká na e-mail v outboxu. Vyžaduje dev server s `EMAIL_DRIVER=outbox`. */
export async function waitForOutboxMessage(to: string, timeoutMs = 20_000): Promise<OutboxMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const message = latestOutboxMessage(to);
    if (message) return message;
    if (Date.now() > deadline) {
      throw new Error(
        `V ${OUTBOX_DIR}/ se neobjevil e-mail pro ${to}. Běží dev server s EMAIL_DRIVER=outbox?`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Cesta pozvánky (`/invite/<token>`) z textu e-mailu. Host se záměrně zahazuje. */
export function extractInvitePath(message: OutboxMessage): string {
  const match = /https?:\/\/[^\s"<>]+(\/invite\/[A-Za-z0-9_-]+)/.exec(message.text);
  if (!match?.[1]) throw new Error("V e-mailu není odkaz na pozvánku");
  return match[1];
}
