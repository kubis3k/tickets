export type RenderedEmail = { to: string; subject: string; html: string; text: string };

export interface EmailDriver {
  send(message: RenderedEmail): Promise<{ id: string }>;
}
