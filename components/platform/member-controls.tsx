"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cs } from "@/lib/i18n/cs";
import { INVITE_ROLES, type InviteRole } from "@/lib/invitations/types";
import type { MutationResult } from "@/lib/orgs/state";

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Feedback({ result }: { result: MutationResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm text-green-700">
      {result.message}
    </p>
  ) : (
    <p role="alert" className="text-destructive text-sm">
      {result.error}
    </p>
  );
}

type RoleActionInput = { orgId: string; userId: string; role: string };
type MemberActionInput = { orgId: string; userId: string };

export function MemberRow({
  orgId,
  userId,
  role,
  changeRole,
  remove,
}: {
  orgId: string;
  userId: string;
  role: InviteRole;
  changeRole: (input: RoleActionInput) => Promise<MutationResult>;
  remove: (input: MemberActionInput) => Promise<MutationResult>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<MutationResult | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={cs.platform.colRole}
        className={selectClass}
        value={role}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          start(async () => setResult(await changeRole({ orgId, userId, role: next })));
        }}
      >
        {INVITE_ROLES.map((r) => (
          <option key={r} value={r}>
            {cs.roles[r]}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(cs.platform.confirmRemove)) return;
          start(async () => setResult(await remove({ orgId, userId })));
        }}
      >
        {cs.platform.remove}
      </Button>
      <Feedback result={result} />
    </div>
  );
}

export function RevokeInvitationButton({
  orgId,
  invitationId,
  revoke,
}: {
  orgId: string;
  invitationId: string;
  revoke: (orgId: string, invitationId: string) => Promise<MutationResult>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<MutationResult | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(cs.platform.confirmRevoke)) return;
          start(async () => setResult(await revoke(orgId, invitationId)));
        }}
      >
        {cs.platform.revoke}
      </Button>
      <Feedback result={result} />
    </div>
  );
}

export function InviteForm({
  orgId,
  invite,
}: {
  orgId: string;
  invite: (orgId: string, formData: FormData) => Promise<MutationResult>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<MutationResult | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        start(async () => {
          const res = await invite(orgId, data);
          setResult(res);
          if (res.ok) form.reset();
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="invite-email">{cs.auth.email}</Label>
        <Input id="invite-email" name="email" type="email" required className="w-64" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-role">{cs.platform.colRole}</Label>
        <select id="invite-role" name="role" defaultValue="staff" className={selectClass}>
          {INVITE_ROLES.map((r) => (
            <option key={r} value={r}>
              {cs.roles[r]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {cs.platform.invite}
      </Button>
      <Feedback result={result} />
    </form>
  );
}
