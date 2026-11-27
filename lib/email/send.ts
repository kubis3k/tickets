import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { getEmailDriver } from "./drivers";
import type { EmailDriver } from "./types";

export type SendEmailInput = { to: string; subject: string; react: ReactElement };

/**
 * Vyrenderuje šablonu a odešle ji přes aktivní driver.
 * Nelogujeme příjemce, odkazy ani obsah: jen id odeslané zprávy.
 */
export async function sendEmail(
  input: SendEmailInput,
  driver: EmailDriver = getEmailDriver(),
): Promise<{ id: string }> {
  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });
  const result = await driver.send({ to: input.to, subject: input.subject, html, text });
  console.info("email sent", result.id);
  return result;
}
