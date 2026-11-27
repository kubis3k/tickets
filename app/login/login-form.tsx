"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginFormState } from "@/lib/auth/login-state";
import { cs } from "@/lib/i18n/cs";
import { sendMagicLinkAction, signInWithPasswordAction } from "./actions";

const initial: LoginFormState = {};

export function LoginForm({ next }: { next: string }) {
  const [pwState, pwAction, pwPending] = useActionState(signInWithPasswordAction, initial);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLinkAction, initial);

  return (
    <div className="space-y-8">
      <form action={pwAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="pw-email">{cs.auth.email}</Label>
          <Input id="pw-email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-password">{cs.auth.password}</Label>
          <Input
            id="pw-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {pwState.error ? (
          <p role="alert" className="text-destructive text-sm">
            {pwState.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pwPending}>
          {cs.auth.signIn}
        </Button>
      </form>

      <form action={mlAction} className="space-y-4 border-t pt-6">
        <input type="hidden" name="next" value={next} />
        <p className="text-muted-foreground text-sm">{cs.auth.magicLinkHint}</p>
        <div className="space-y-2">
          <Label htmlFor="ml-email">{cs.auth.email}</Label>
          <Input id="ml-email" name="email" type="email" autoComplete="email" required />
        </div>
        {mlState.error ? (
          <p role="alert" className="text-destructive text-sm">
            {mlState.error}
          </p>
        ) : null}
        {mlState.message ? (
          <p role="status" className="text-sm">
            {mlState.message}
          </p>
        ) : null}
        <Button type="submit" variant="outline" className="w-full" disabled={mlPending}>
          {cs.auth.sendMagicLink}
        </Button>
      </form>
    </div>
  );
}
