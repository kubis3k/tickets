import { z } from "zod";
import { INVITE_ROLES } from "@/lib/invitations/types";

const email = z.string().trim().toLowerCase().pipe(z.email().max(320));

export const inviteMemberSchema = z.object({
  email,
  role: z.enum(INVITE_ROLES),
});

export const revokeInvitationSchema = z.object({
  invitationId: z.uuid(),
});

/** Token = 32 B v base64url (43 znaků). */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Min. 10 znaků; horní mez 72 odpovídá limitu bcryptu v Supabase Auth. */
export const inviteAcceptSchema = z.object({
  token: inviteTokenSchema,
  password: z.string().min(10).max(72).optional(),
});
