import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(320));

export const passwordLoginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  next: z.string().max(2048).optional(),
});

export const magicLinkSchema = z.object({
  email,
  next: z.string().max(2048).optional(),
});

/** `type` z odkazu v e-mailu; povolené jen přihlašovací typy. */
export const callbackSchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  token_hash: z.string().min(1).max(2048).optional(),
  type: z.enum(["email", "magiclink"]).optional(),
  next: z.string().max(2048).optional(),
});
