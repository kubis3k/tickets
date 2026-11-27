import Link from "next/link";
import { MemberRow } from "@/components/platform/member-controls";
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
import { cs } from "@/lib/i18n/cs";
import { listUsersWithMemberships } from "@/lib/orgs/members";
import { changeMemberRoleAction, removeMemberAction } from "../actions";

export default async function PlatformUsersPage() {
  await requirePlatformAdmin();
  const users = await listUsersWithMemberships(getDb());
  const t = cs.platform;

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.usersTitle}</h1>
      {users.length === 0 ? (
        <p className="text-muted-foreground">{t.noUsers}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colEmail}</TableHead>
              <TableHead>{t.colOrganizations}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="align-top">
                <TableCell>
                  {u.email}
                  {u.isPlatformAdmin ? (
                    <span className="bg-muted ml-2 rounded px-1.5 py-0.5 text-xs">
                      {t.platformAdminBadge}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {u.memberships.length === 0 ? (
                    <span className="text-muted-foreground">{t.noMemberships}</span>
                  ) : (
                    <ul className="space-y-2">
                      {u.memberships.map((m) => (
                        <li key={m.orgId} className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/admin/platform/organizations/${m.orgId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {m.orgName}
                          </Link>
                          <MemberRow
                            orgId={m.orgId}
                            userId={u.id}
                            role={m.role}
                            changeRole={changeMemberRoleAction}
                            remove={removeMemberAction}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
