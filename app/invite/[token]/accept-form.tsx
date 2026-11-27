"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cs } from "@/lib/i18n/cs";
import type { InviteFormState } from "@/lib/invitations/state";
import { acceptInviteAction } from "./actions";

const initial: InviteFormState = {};

export function AcceptForm({
  token,
  needsPassword,
  loginHref,
}: {
  token: string;
  needsPassword: boolean;
  loginHref: string;
}) {
  const [state, action, pending] = useActionState(acceptInviteAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {needsPassword ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{cs.invitations.setPasswordHint}</p>
          <Label htmlFor="invite-password">{cs.invitations.password}</Label>
          <Input
            id="invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={72}
            required
          />
          <p className="text-muted-foreground text-xs">{cs.invitations.passwordMin}</p>
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}{" "}
          {state.loginHref ? (
            <Link href={state.loginHref} className="underline">
              {cs.invitations.signInToAccept}
            </Link>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {needsPassword ? cs.invitations.createAndAccept : cs.invitations.accept}
      </Button>
      {needsPassword ? (
        <p className="text-muted-foreground text-center text-sm">
          {cs.invitations.haveAccount}{" "}
          <Link href={loginHref} className="underline">
            {cs.invitations.signInLink}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
