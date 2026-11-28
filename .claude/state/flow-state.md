# FLOW STATE — GlobaalTicket
## Projekt
- fáze: 0
- branch: worktree `claude/globaalticket-orchestration-85a806` → push do `origin/phase-0` (lokální phase-0 drží jiný worktree)
## Aktuální úkol
- cíl: fáze 0, úkol 6 Platform admin
- tier: T4
- zóna (T4): peníze (lib/money) + přístupy (guardy, admin)
- status: přerušen limitem API; coder pokračuje; NECOMMITNUTO
## Checkpoint
- poslední dokončený krok: úkol 5 (audit + e-mail + pozvánky) hotový, security OK; opravy 34aecf8 (přijetí pozvánky s auth účtem bez users řádku, cleanup při chybě, requireAuthSession); předtím 0e79158, 852cb16, 3d1f2c4, 7f0ac74. Testy: 343 zelených.
- rozpracovaný soubor + řádek: úkol 6, nezacommitováno: `app/(admin)/admin/platform/**`, `components/platform/**`, `lib/orgs/**`, `lib/money/**`, `lib/validation/org.ts`. Řádek nebyl předán: před pokračováním spustit `git status` a `git diff --stat`, dokončit rozpracované soubory a ověřit `pnpm lint && pnpm typecheck && pnpm test`.
- nesouvisející nezacommitované změny (nepatří do úkolu 6, necommitovat s ním): `.claude/hooks/token_tracker.py`, `tools/flow-dash.py`, `lib/i18n/cs.ts`
- další krok: dokončit úkol 6 (coder) → commit → audit úkolu 6 (security-auditor + money-auditor) → úkol 7 Org admin (včetně zpevnění `isInviteNext` v `app/auth/confirm/verify/route.ts` přes normalizaci URL + test výjimky)
## Plán (aktivní)
1. [x] Scaffold (T2): Next/TS strict/Tailwind/shadcn/ESLint/Prettier/Vitest/Playwright, route groups, brand.ts, i18n/cs.ts, env.ts (Zod) + instrumentation, .env.example, CI
2. [x] Schéma DB (T4 sec+money): lib/db/schema/* vše ze SPEC §5 + invitations, door_assignments, invoice_sequences, jobs; drizzle/0000; PGlite test
3. [x] RLS (T4 sec): drizzle/0001_rls.sql custom, app.is_platform_admin/is_org_member, test/sql/auth-stub.sql, PGlite asUser
4. [x] Auth jádro (T4 sec): lib/auth/supabase-*, session, guards, proxy/middleware, /login, /auth/callback, AST test guard-first
5. [x] Audit + e-mail + pozvánky (T4 sec): lib/audit/record.ts, lib/email (resend|outbox), lib/invitations, app/invite/[token]
6. [~] Platform admin (T4 sec+money): app/(admin)/admin/platform/**, lib/orgs, lib/validation/org.ts (rozpracováno, necommit)
7. [ ] Org admin (T4 sec): app/(admin)/admin/[orgSlug]/** + přepínač, members, last-owner invariant
8. [ ] Seed + e2e + README (T4 sec): scripts/seed.ts idempotentní, e2e/invite-flow.spec.ts (outbox), README
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
- lib/db/schema/* (9 souborů: index, enums, _helpers, auth, identity, events, orders, billing, system): 28 tabulek, složené FK (event_id, organization_id) → events(id, organization_id)
- drizzle/0000_init.sql + drizzle/0001_rls.sql: 0001 je custom, app.* funkce SECURITY DEFINER
- lib/db/types.ts: AnyDb / AnyTx (typy pro Drizzle transakce a DB v guardech a service vrstvě)
- test/db/pglite.ts: PGlite testová DB, helper asUser pro RLS testy
- lib/auth/guards.ts: createGuards (DI); requireAuthenticated / requirePlatformAdmin / requireAnyMembership / requireOrgRole / requireOrgRoleBySlug / requireDoor / requireAuthSession
- proxy.ts: Next 16, kontroluje jen přihlášení (role hlídá guard)
- test/static/guard-first.test.ts: AST test guard-first, max 6 výjimek `// public:`
- app/auth/confirm/verify/route.ts: POST potvrzení magic linku; `isInviteNext` k zpevnění v úkolu 7
- lib/invitations/* (tokens, create, accept, revoke, lookup, state, actions; invitations.test.ts): token_hash, atomický claim, 7 dní
- lib/email/* (send.ts, types.ts, email.test.ts): transport resend | outbox
- lib/audit/record.ts: zápis audit_log řádku (ve stejné tx jako mutace)
- lib/money/ (untracked, úkol 6): zaokrouhlení a částky, jediné místo pro výpočty
## Hotové úkoly
- [2026-11-26] příprava repozitáře → hotovo
- [2026-11-27] rozpad fáze 0 (architect) → plán 8 úkolů
- [2026-11-27] úkol 1 Scaffold → hotovo (commity v rozsahu 871bf9b..34aecf8)
- [2026-11-27] úkol 2 Schéma DB → 2 kola audit money + security OK (commity v rozsahu 871bf9b..34aecf8)
- [2026-11-27] úkol 3 RLS → APPROVE, opravy default ACL jen pro postgres (852cb16)
- [2026-11-27] úkol 4 Auth jádro → proxy, guardy, login heslo + magic link, callback + /auth/confirm POST; opravy 3d1f2c4, 7f0ac74
- [2026-11-27] úkol 5 Audit + e-mail + pozvánky → security OK; 0e79158, opravy 34aecf8
## Otevřené otázky / blokery
- finální název produktu (brand config), výše provize, refund policy, obchodní podmínky
- úkol 6 přerušen limitem API: po obnovení ověřit stav rozpracovaných souborů (viz Checkpoint)
