import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";

export type InviteEmailProps = {
  orgName: string;
  role: keyof typeof cs.roles;
  inviteUrl: string;
  expiresAt: Date;
};

export function formatCzDate(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "long",
    timeZone: "Europe/Prague",
  }).format(date);
}

export function Invite({ orgName, role, inviteUrl, expiresAt }: InviteEmailProps) {
  const t = cs.email.invite;
  return (
    <Html lang="cs">
      <Head />
      <Preview>{t.preview(orgName)}</Preview>
      <Body style={{ backgroundColor: brand.colors.accent, fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: 520, margin: "24px auto", padding: 24, background: "#fff" }}>
          <Text style={{ color: "#666", fontSize: 13, margin: 0 }}>{brand.name}</Text>
          <Heading as="h1" style={{ fontSize: 22 }}>
            {t.heading}
          </Heading>
          <Text>{t.body(orgName, cs.roles[role])}</Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={inviteUrl}
              style={{
                backgroundColor: brand.colors.primary,
                color: brand.colors.primaryForeground,
                padding: "12px 20px",
                borderRadius: 6,
              }}
            >
              {t.cta}
            </Button>
          </Section>
          <Text>{t.validUntil(formatCzDate(expiresAt))}</Text>
          <Text style={{ fontSize: 13, color: "#666" }}>
            {t.fallback} <Link href={inviteUrl}>{inviteUrl}</Link>
          </Text>
          <Text style={{ fontSize: 13, color: "#666" }}>{t.ignore}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default Invite;
