"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { cs } from "@/lib/i18n/cs";
import { inviteMemberAction, revokeInvitationAction } from "@/lib/invitations/actions";
import { INVITE_ROLES } from "@/lib/invitations/types";
import { createOrganization, updateOrganization } from "@/lib/orgs/organizations";
import { changeMemberRole, removeMember } from "@/lib/orgs/members";
import { stringEntries, type MutationResult, type OrgFormState } from "@/lib/orgs/state";
import { orgFieldErrors, orgFormSchema, orgUpdateFormSchema } from "@/lib/validation/org";

const e = cs.platform.errors;
const idSchema = z.uuid();
const memberSchema = z.object({ orgId: z.uuid(), userId: z.uuid() });
const roleSchema = memberSchema.extend({ role: z.enum(INVITE_ROLES) });

const PLATFORM_PATH = "/admin/platform";

function refreshOrg(orgId: string): void {
  revalidatePath(PLATFORM_PATH);
  revalidatePath(`${PLATFORM_PATH}/users`);
  revalidatePath(`${PLATFORM_PATH}/organizations/${orgId}`);
}

export async function createOrganizationAction(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const user = await requirePlatformAdmin();
  const parsed = orgFormSchema.safeParse(stringEntries(formData));
  const values = stringEntries(formData);
  if (!parsed.success) {
    return { error: e.invalidInput, fieldErrors: orgFieldErrors(parsed.error), values };
  }

  const result = await getDb().transaction((tx) => createOrganization(tx, parsed.data, user.id));
  if (!result.ok) return { error: e.slugTaken, fieldErrors: { slug: e.slugTaken }, values };

  revalidatePath(PLATFORM_PATH);
  redirect(`${PLATFORM_PATH}/organizations/${result.id}`);
}

export async function updateOrganizationAction(
  orgId: string,
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const user = await requirePlatformAdmin();
  const id = idSchema.safeParse(orgId);
  const parsed = orgUpdateFormSchema.safeParse(stringEntries(formData));
  if (!id.success) return { error: e.notFound };
  const values = stringEntries(formData);
  if (!parsed.success) {
    return { error: e.invalidInput, fieldErrors: orgFieldErrors(parsed.error), values };
  }

  const result = await getDb().transaction((tx) =>
    updateOrganization(tx, id.data, parsed.data, user.id),
  );
  if (!result.ok) return { error: e.notFound };

  refreshOrg(id.data);
  return { ok: true, message: result.changed ? cs.platform.saved : cs.platform.noChanges };
}

export async function changeMemberRoleAction(input: {
  orgId: string;
  userId: string;
  role: string;
}): Promise<MutationResult> {
  const actor = await requirePlatformAdmin();
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: e.invalidInput };

  const result = await getDb().transaction((tx) =>
    changeMemberRole(tx, { ...parsed.data, actorId: actor.id }),
  );
  if (!result.ok) {
    return { ok: false, error: result.reason === "last_owner" ? e.lastOwner : e.notMember };
  }
  refreshOrg(parsed.data.orgId);
  return { ok: true, message: cs.platform.roleChanged };
}

export async function removeMemberAction(input: {
  orgId: string;
  userId: string;
}): Promise<MutationResult> {
  const actor = await requirePlatformAdmin();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: e.invalidInput };

  const result = await getDb().transaction((tx) =>
    removeMember(tx, { ...parsed.data, actorId: actor.id }),
  );
  if (!result.ok) {
    return { ok: false, error: result.reason === "last_owner" ? e.lastOwner : e.notMember };
  }
  refreshOrg(parsed.data.orgId);
  return { ok: true, message: cs.platform.removed };
}

/** Pozvání: platform admin projde owner guardem v `inviteMemberAction`, ta řeší validaci, audit i e-mail. */
export async function inviteToOrganizationAction(
  orgId: string,
  formData: FormData,
): Promise<MutationResult> {
  await requirePlatformAdmin();
  const id = idSchema.safeParse(orgId);
  if (!id.success) return { ok: false, error: e.notFound };

  const result = await inviteMemberAction(id.data, formData);
  refreshOrg(id.data);
  return result.ok ? result : { ok: false, error: result.error };
}

export async function revokeOrganizationInvitationAction(
  orgId: string,
  invitationId: string,
): Promise<MutationResult> {
  await requirePlatformAdmin();
  const id = idSchema.safeParse(orgId);
  if (!id.success) return { ok: false, error: e.notFound };

  const result = await revokeInvitationAction(id.data, invitationId);
  refreshOrg(id.data);
  return result.ok ? result : { ok: false, error: result.error };
}
