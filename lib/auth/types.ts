import type { orgRole } from "@/lib/db/schema/enums";

export type OrgRole = (typeof orgRole.enumValues)[number];
export type EffectiveRole = OrgRole | "platform_admin";

export type SessionUser = { readonly id: string; readonly email: string };
export type OrgRef = { readonly id: string; readonly slug: string; readonly name: string };
export type MembershipRef = OrgRef & { readonly role: OrgRole };
