# FLOW STATE — GlobaalTicket
## Projekt
- fáze: 0
- branch: worktree `claude/globaalticket-orchestration-85a806` → push do `origin/phase-0` (lokální phase-0 drží jiný worktree)
## Aktuální úkol
- cíl: fáze 0, úkol 1 Scaffold
- tier: T2
- zóna (T4): —
- status: running
## Checkpoint
- poslední dokončený krok: architect rozložil fázi 0 (plán níže)
- rozpracovaný soubor + řádek: —
- další krok: úkol 1 Scaffold (coder)
## Plán (aktivní)
1. Scaffold (T2): Next/TS strict/Tailwind/shadcn/ESLint/Prettier/Vitest/Playwright, route groups, brand.ts, i18n/cs.ts, env.ts (Zod) + instrumentation, .env.example, CI
2. Schéma DB (T4 sec+money): lib/db/schema/* vše ze SPEC §5 + invitations, door_assignments, invoice_sequences, jobs; drizzle/0000; PGlite test
3. RLS (T4 sec): drizzle/0001_rls.sql custom, app.is_platform_admin/is_org_member, test/sql/auth-stub.sql, PGlite asUser
4. Auth jádro (T4 sec): lib/auth/supabase-*, session, guards, proxy/middleware, /login, /auth/callback, AST test guard-first
5. Audit + e-mail + pozvánky (T4 sec): lib/audit/record.ts, lib/email (resend|outbox), lib/invitations, app/invite/[token]
6. Platform admin (T4 sec+money): app/(admin)/admin/platform/**, lib/orgs, lib/validation/org.ts
7. Org admin (T4 sec): app/(admin)/admin/[orgSlug]/** + přepínač, members, last-owner invariant
8. Seed + e2e + README (T4 sec): scripts/seed.ts idempotentní, e2e/invite-flow.spec.ts (outbox), README
## Invarianty (aktivní)
- každá tabulka public má RLS; anon 0 řádků; člen A nevidí B
- server action / route handler: první příkaz require*, druhý Zod
- účet bez řádku v users neprojde guardem; ne-člen → notFound
- pozvánka: jen hash tokenu, 7 dní, souběžný accept = 1 úspěch
- org má vždy ≥1 ownera; admin mutace = 1 audit řádek ve stejné tx
- žádné auth.signUp, OTP shouldCreateUser:false, service role jen v env.ts + supabase-admin.ts
- peníze integer haléře, procenta integer bps
## Mapa poznání
- docs/SPEC.md: závazná specifikace (§3 Stripe, §4 doklady, §5 schéma, §6 kapacita, §7 QR, §8 tracking, §9 role, §11 fáze, §12 workflow)
- docs/phases/PHASE_0.md: zadání fáze 0 (scaffold, DB, auth, role, admin)
- CLAUDE.md: pravidla projektu a flow
- prostředí: Node 24, pnpm 11, `gh` chybí, `python3` wrapper v ~/bin rozbitý (použij `py`)
## Hotové úkoly
- [2026-11-26] příprava repozitáře → hotovo
- [2026-11-27] rozpad fáze 0 (architect) → plán 8 úkolů
## Otevřené otázky / blokery
- finální název produktu (brand config), výše provize, refund policy, obchodní podmínky
