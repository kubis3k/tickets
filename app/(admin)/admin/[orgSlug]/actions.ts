"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgRoleBySlug } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { cs } from "@/lib/i18n/cs";
import { inviteMemberAction, revokeInvitationAction } from "@/lib/invitations/actions";
import { INVITE_ROLES } from "@/lib/invitations/types";
import { changeMemberRole, removeMember } from "@/lib/orgs/members";
import { updateOrgOwnerSettings } from "@/lib/orgs/org-admin";
import { stringEntries, type MutationResult, type OrgFormState } from "@/lib/orgs/state";
import { orgFieldErrors } from "@/lib/validation/org";
import { orgOwnerSettingsSchema } from "@/lib/validation/org-owner";
import { inviteMemberSchema } from "@/lib/validation/invitations";

const e = cs.orgAdmin.errors;
const memberSchema = z.object({ userId: z.uuid() });
const roleSchema = memberSchema.extend({ role: z.enum(INVITE_ROLES) });
const invitationIdSchema = z.uuid();

// Všechny akce: `orgId` bere z guardu (slug z URL → organizace, kde je volající owner), nikdy z formuláře.

export async function updateOrgSettingsAction(
  slug: string,
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const { user, org } = await requireOrgRoleBySlug(slug, ["owner"]);
  const values = stringEntries(formData);
  const parsed = orgOwnerSettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: e.invalidInput, fieldErrors: orgFieldErrors(parsed.error), values };
  }

  const result = await getDb().transaction((tx) =>
    updateOrgOwnerSettings(tx, org.id, parsed.data, user.id),
  );
  if (!result.ok) return { error: e.notFound };

  revalidatePath(`/admin/${org.slug}`, "layout");
  return { ok: true, message: result.changed ? cs.platform.saved : cs.platform.noChanges };
}

export async function changeMemberRoleAction(
  slug: string,
  input: { userId: string; role: string },
): Promise<MutationResult> {
  const { user, org } = await requireOrgRoleBySlug(slug, ["owner"]);
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: e.invalidInput };

  const result = await getDb().transaction((tx) =>
    changeMemberRole(tx, { orgId: org.id, ...parsed.data, actorId: user.id }),
  );
  if (!result.ok) {
    return { ok: false, error: result.reason === "last_owner" ? e.lastOwner : e.notMember };
  }
  revalidatePath(`/admin/${org.slug}/members`);
  // Owner, který si sám sníží roli, už na správu členů nemá nárok.
  if (parsed.data.userId === user.id && parsed.data.role !== "owner") {
    redirect(`/admin/${org.slug}`);
  }
  return { ok: true, message: cs.platform.roleChanged };
}

export async function removeMemberAction(
  slug: string,
  input: { userId: string },
): Promise<MutationResult> {
  const { user, org } = await requireOrgRoleBySlug(slug, ["owner"]);
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: e.invalidInput };

  const result = await getDb().transaction((tx) =>
    removeMember(tx, { orgId: org.id, userId: parsed.data.userId, actorId: user.id }),
  );
  if (!result.ok) {
    return { ok: false, error: result.reason === "last_owner" ? e.lastOwner : e.notMember };
  }
  revalidatePath(`/admin/${org.slug}/members`);
  if (parsed.data.userId === user.id) redirect("/admin");
  return { ok: true, message: cs.platform.removed };
}

export async function inviteToOrgAction(slug: string, formData: FormData): Promise<MutationResult> {
  const { org } = await requireOrgRoleBySlug(slug, ["owner"]);
  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: e.invalidInput };

  const result = await inviteMemberAction(org.id, formData);
  return result.ok ? result : { ok: false, error: result.error };
}

export async function revokeOrgInvitationAction(
  slug: string,
  invitationId: string,
): Promise<MutationResult> {
  const { org } = await requireOrgRoleBySlug(slug, ["owner"]);
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) return { ok: false, error: e.invalidInput };

  const result = await revokeInvitationAction(org.id, parsed.data);
  return result.ok ? result : { ok: false, error: result.error };
}
