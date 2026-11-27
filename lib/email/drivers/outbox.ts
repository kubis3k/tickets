import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmailDriver } from "../types";

export const DEFAULT_OUTBOX_DIR = ".e2e-outbox";

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@.+_-]/g, "_");
}

/**
 * Jen pro e2e a lokální vývoj (`EMAIL_DRIVER=outbox`): zprávy se zapíšou do souborů
 * `<timestamp>-<to>.json` s `to, subject, html, text`. V produkci se nesmí použít.
 */
export function createOutboxDriver(dir: string = DEFAULT_OUTBOX_DIR): EmailDriver {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("outbox driver není povolen v produkci");
  }
  return {
    async send(message) {
      await mkdir(dir, { recursive: true });
      const to = safeFilePart(message.to);
      let stamp = Date.now();
      for (;;) {
        const id = `${stamp}-${to}`;
        try {
          await writeFile(
            join(dir, `${id}.json`),
            JSON.stringify(
              { to: message.to, subject: message.subject, html: message.html, text: message.text },
              null,
              2,
            ),
            { flag: "wx" },
          );
          return { id };
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          stamp += 1;
        }
      }
    },
  };
}
