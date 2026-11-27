import { Resend } from "resend";
import type { EmailDriver } from "../types";

export function createResendDriver(config: { apiKey: string; from: string }): EmailDriver {
  const client = new Resend(config.apiKey);
  return {
    async send(message) {
      const { data, error } = await client.emails.send({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      // Chybová zpráva Resendu může obsahovat adresu: neposíláme ji dál, jen název chyby.
      if (error || !data) throw new Error(`resend: odeslání selhalo (${error?.name ?? "unknown"})`);
      return { id: data.id };
    },
  };
}
