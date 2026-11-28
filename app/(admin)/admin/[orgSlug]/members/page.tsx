import {
  InviteForm,
  MemberRow,
  RevokeInvitationButton,
} from "@/components/org-admin/members-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOrgRoleBySlug } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { formatCzDate } from "@/lib/email/templates/Invite";
import { cs } from "@/lib/i18n/cs";
import { listOrgInvitations, listOrgMembers } from "@/lib/orgs/members";
import {
  changeMemberRoleAction,
  inviteToOrgAction,
  removeMemberAction,
  revokeOrgInvitationAction,
} from "../actions";

export default async function OrgMembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { org } = await requireOrgRoleBySlug((await params).orgSlug, ["owner"]);
  const db = getDb();
  const [members, invitations] = await Promise.all([
    listOrgMembers(db, org.id),
    listOrgInvitations(db, org.id),
  ]);
  const t = cs.platform;

  return (
    <main className="space-y-8">
      <h1 className="text-2xl font-semibold">{cs.orgAdmin.membersTitle}</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.sectionMembers}</h2>
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
                <TableCell>{m.name ? `${m.name} (${m.email})` : m.email}</TableCell>
                <TableCell>
                  <MemberRow
                    userId={m.userId}
                    role={m.role}
                    changeRole={changeMemberRoleAction.bind(null, org.slug)}
                    remove={removeMemberAction.bind(null, org.slug)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
                      invitationId={inv.id}
                      revoke={revokeOrgInvitationAction.bind(null, org.slug)}
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
        <InviteForm invite={inviteToOrgAction.bind(null, org.slug)} />
      </section>
    </main>
  );
}
