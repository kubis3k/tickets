import { notFound } from "next/navigation";
import { z } from "zod";
import {
  InviteForm,
  MemberRow,
  RevokeInvitationButton,
} from "@/components/platform/member-controls";
import { OrgForm } from "@/components/platform/org-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { formatCzDate } from "@/lib/email/templates/Invite";
import { cs } from "@/lib/i18n/cs";
import { orgToFormValues } from "@/lib/orgs/form";
import { listOrgInvitations, listOrgMembers } from "@/lib/orgs/members";
import { getOrganization } from "@/lib/orgs/organizations";
import {
  changeMemberRoleAction,
  inviteToOrganizationAction,
  removeMemberAction,
  revokeOrganizationInvitationAction,
  updateOrganizationAction,
} from "../../actions";

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();

  const db = getDb();
  const org = await getOrganization(db, parsed.data);
  if (!org) notFound();
  const [members, invitations] = await Promise.all([
    listOrgMembers(db, org.id),
    listOrgInvitations(db, org.id),
  ]);
  const t = cs.platform;

  return (
    <main className="space-y-8">
      <h1 className="text-2xl font-semibold">{t.editOrganizationTitle(org.name)}</h1>
      <OrgForm
        mode="edit"
        initial={orgToFormValues(org)}
        action={updateOrganizationAction.bind(null, org.id)}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.sectionMembers}</h2>
        {members.length === 0 ? (
          <p className="text-muted-foreground">{t.noMembers}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.colEmail}</TableHead>
                <TableHead>{t.colRole}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    <MemberRow
                      orgId={org.id}
                      userId={m.userId}
                      role={m.role}
                      changeRole={changeMemberRoleAction}
                      remove={removeMemberAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.sectionInvitations}</h2>
        {invitations.length === 0 ? (
          <p className="text-muted-foreground">{t.noInvitations}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.colEmail}</TableHead>
                <TableHead>{t.colRole}</TableHead>
                <TableHead>{t.colStatus}</TableHead>
                <TableHead>{t.colExpires}</TableHead>
                <TableHead>{t.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell>{cs.roles[inv.role]}</TableCell>
                  <TableCell>{inv.expired ? t.inviteExpired : t.inviteActive}</TableCell>
                  <TableCell>{formatCzDate(inv.expiresAt)}</TableCell>
                  <TableCell>
                    <RevokeInvitationButton
                      orgId={org.id}
                      invitationId={inv.id}
                      revoke={revokeOrganizationInvitationAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.sectionInvite}</h2>
        <InviteForm orgId={org.id} invite={inviteToOrganizationAction} />
      </section>
    </main>
  );
}
