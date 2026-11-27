import type { orgRole } from "@/lib/db/schema/enums";

export type InviteRole = (typeof orgRole.enumValues)[number];
export const INVITE_ROLES = ["owner", "staff", "door"] as const satisfies readonly InviteRole[];
