import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginUrl } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { brand } from "@/lib/config/brand";
import { getDb } from "@/lib/db/client";
import { cs } from "@/lib/i18n/cs";
import { formatCzDate } from "@/lib/email/templates/Invite";
import { getInvitationByToken } from "@/lib/invitations/lookup";
import { inviteTokenSchema } from "@/lib/validation/invitations";
import { AcceptForm } from "./accept-form";
import { leaveInviteAction } from "./actions";

// Token je v URL: nesmí uniknout přes Referer ani do vyhledávačů.
export const metadata: Metadata = {
  title: cs.invitations.pageTitle,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <p className="text-muted-foreground text-sm">{brand.name}</p>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invitation = inviteTokenSchema.safeParse(token).success
    ? await getInvitationByToken(getDb(), token)
    : null;
  if (!invitation) {
    return (
      <Shell title={cs.invitations.invalidTitle}>
        <p className="text-sm">{cs.invitations.invalidText}</p>
      </Shell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const sessionEmail = data.user?.email?.trim().toLowerCase() ?? null;

  const summary = (
    <div className="space-y-1 text-sm">
      <p>{cs.invitations.intro(invitation.orgName, cs.roles[invitation.role])}</p>
      <p className="text-muted-foreground">{cs.invitations.forEmail(invitation.emailMasked)}</p>
      <p className="text-muted-foreground">
        {cs.invitations.validUntil(formatCzDate(invitation.expiresAt))}
      </p>
    </div>
  );

  if (sessionEmail !== null && sessionEmail !== invitation.email) {
    return (
      <Shell title={cs.invitations.emailMismatchTitle}>
        {summary}
        <p className="text-sm">{cs.invitations.emailMismatchText}</p>
        <form action={leaveInviteAction.bind(null, token)}>
          <Button type="submit" variant="outline" className="w-full">
            {cs.invitations.signOutAndContinue}
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title={cs.invitations.pageTitle}>
      {summary}
      <AcceptForm
        token={token}
        needsPassword={sessionEmail === null}
        loginHref={loginUrl(`/invite/${token}`)}
      />
    </Shell>
  );
}
