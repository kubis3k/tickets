import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { formatBps, formatHalere } from "@/lib/money/format";
import { listOrganizations } from "@/lib/orgs/organizations";

export default async function PlatformOrganizationsPage() {
  await requirePlatformAdmin();
  const orgs = await listOrganizations(getDb());
  const t = cs.platform;

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.organizationsTitle}</h1>
        <Button asChild>
          <Link href="/admin/platform/organizations/new">{t.newOrganization}</Link>
        </Button>
      </div>
      {orgs.length === 0 ? (
        <p className="text-muted-foreground">{t.noOrganizations}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colName}</TableHead>
              <TableHead>{t.colSlug}</TableHead>
              <TableHead>{t.colIco}</TableHead>
              <TableHead>{t.colVatPayer}</TableHead>
              <TableHead>{t.colFee}</TableHead>
              <TableHead>{t.colMembers}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <Link
                    href={`/admin/platform/organizations/${org.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {org.name}
                  </Link>
                </TableCell>
                <TableCell>{org.slug}</TableCell>
                <TableCell>{org.ico ?? "–"}</TableCell>
                <TableCell>{org.vatPayer ? t.yes : t.no}</TableCell>
                <TableCell>
                  {formatBps(org.feeBps)}
                  {org.feeFixed > 0 ? ` + ${formatHalere(org.feeFixed)}` : ""}
                </TableCell>
                <TableCell>{org.memberCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
