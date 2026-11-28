# FLOW STATE — GlobaalTicket
## Projekt
- fáze: 0
- branch: worktree `claude/globaalticket-orchestration-85a806` → push do `origin/phase-0` (lokální phase-0 drží jiný worktree)
## Aktuální úkol
- cíl: fáze 0, PR fáze 0 (push do origin/phase-0, PR do main)
- tier: T4
- zóna (T4): peníze (lib/money, poplatky), přístupy (guardy, platform/org admin), migrace drizzle/0000–0001
- status: `done` (PR #1 otevřen, čeká na merge člověkem)
## Checkpoint
- fáze 0 hotová v PR #1 (https://github.com/kubis3k/tickets/pull/1, head `phase-0`), čeká na merge člověkem (Luigi po proklikání Vercel preview); další: fáze 1 (docs/phases/PHASE_1.md zatím neexistuje)
- popis PR: docs/phases/PHASE_0_PR.md; pr-reviewer APPROVE (doporučení aplikována v 5996887)
- poslední dokončený krok: úkol 8 (seed + e2e + README) po opravách 0c01c47; tester e3d5a9e (test/static/audit-coverage.test.ts, test/static/env-contract.test.ts, testy guardů actions, docs/phases/PHASE_0_TEST.md); 19 commitů v `git log --oneline main..HEAD`, poslední 0c01c47; 512 testů zelených
- audity: úkol 6 security APPROVE + money po opravách (strop fee_fixed 1000 Kč, plátce DPH vyžaduje DIČ); úkol 7 security APPROVE (dcad2df); úkol 8 security po opravách (redirect URL bez *.vercel.app, náhodné heslo v e2e, e2e jen proti localhostu)
- pr-reviewer: kód schválen, drobná doporučení se právě aplikují (ověř `git status` a zacommituj je do fáze 0)
- nezacommitované mimo fázi 0 (nepatří do PR, necommitovat s ním): `.claude/hooks/token_tracker.py`, `tools/flow-dash.py`
- další krok: čekat na merge PR #1 člověkem; případné připomínky z review opravit přes flow na branch `phase-0`; po merge začít fázi 1 (`/phase 1`, nejdřív musí existovat docs/phases/PHASE_1.md). Nemergovat, nepushovat do `main`.
## Plán (aktivní)
1. [x] Scaffold (T2): Next/TS strict/Tailwind/shadcn/ESLint/Prettier/Vitest/Playwright, brand.ts, i18n/cs.ts, env.ts (Zod), .env.example, CI
2. [x] Schéma DB (T4 sec+money): lib/db/schema/* dle SPEC §5 + invitations, door_assignments, invoice_sequences, jobs; drizzle/0000; PGlite test
3. [x] RLS (T4 sec): drizzle/0001_rls.sql, app.is_platform_admin/is_org_member, asUser testy
4. [x] Auth jádro (T4 sec): lib/auth/*, proxy.ts, /login, /auth/callback, AST test guard-first
5. [x] Audit + e-mail + pozvánky (T4 sec): lib/audit/record.ts, lib/email, lib/invitations, app/invite/[token]
6. [x] Platform admin (T4 sec+money): app/(admin)/admin/platform/**, lib/orgs/*, lib/money/{parse,format}, lib/validation/org.ts
7. [x] Org admin (T4 sec): app/(admin)/admin/[orgSlug]/**, přepínač organizací, members, last-owner invariant
8. [x] Seed + e2e + README (T4 sec): scripts/seed.ts + lib/seed/* idempotentní, e2e/invite-flow.spec.ts (outbox), README
9. [ ] PR fáze 0: push origin/phase-0, popis, scénář pro člověka, review APPROVE; merge jen člověk
## Invarianty (aktivní)
- každá tabulka public má RLS; anon 0 řádků; člen A nevidí B
- server action / route handler: první řádek require*, druhý Zod
- účet bez řádku v users neprojde guardem; ne-člen → notFound
- pozvánka: jen hash tokenu, 7 dní, souběžný accept = 1 úspěch
- org má vždy ≥1 ownera (SELECT … FOR UPDATE nad memberships); admin mutace = 1 audit řádek ve stejné tx
- žádné auth.signUp, OTP shouldCreateUser:false, service role jen v env.ts + supabase-admin.ts
- peníze integer haléře, procenta integer bps
## Mapa poznání
- docs/SPEC.md: závazná specifikace (§3 Stripe, §4 doklady, §5 schéma, §6 kapacita, §7 QR, §8 tracking, §9 role, §11 fáze, §12 workflow)
- docs/phases/PHASE_0.md: zadání fáze 0 (scaffold, DB, auth, role, admin)
- docs/phases/PHASE_0_TEST.md: testovací scénář fáze 0 pro člověka
- CLAUDE.md: pravidla projektu a flow
- prostředí: Node 24, pnpm 11, `gh` chybí, `python3` wrapper v ~/bin rozbitý (použij `py`)
- lib/db/schema/* (9 souborů: index, enums, _helpers, auth, identity, events, orders, billing, system): 28 tabulek, složené FK (event_id, organization_id) → events(id, organization_id)
- drizzle/0000_init.sql + drizzle/0001_rls.sql: 0001 je custom, app.* funkce SECURITY DEFINER
- lib/db/types.ts: AnyDb / AnyTx (typy pro Drizzle transakce a DB v guardech a service vrstvě)
- test/db/pglite.ts: PGlite testová DB, helper asUser pro RLS testy
- lib/auth/guards.ts: createGuards (DI); requireAuthenticated / requirePlatformAdmin / requireAnyMembership / requireOrgRole / requireOrgRoleBySlug / requireDoor / requireAuthSession
- proxy.ts: Next 16, kontroluje jen přihlášení (role hlídá guard)
- test/static/guard-first.test.ts: AST test guard-first, max 6 výjimek `// public:`
- test/static/audit-coverage.test.ts, env-contract.test.ts, no-signup.test.ts, no-secret-logging.test.ts, brand.test.ts: statické invarianty fáze 0
- app/auth/confirm/verify/route.ts: POST potvrzení magic linku, Origin povinný
- lib/invitations/* (tokens, create, accept, revoke, lookup, state, actions; invitations.test.ts): token_hash, atomický claim, 7 dní
- lib/email/* (send.ts, types.ts, email.test.ts): transport resend | outbox
- lib/audit/record.ts: zápis audit_log řádku (ve stejné tx jako mutace)
- lib/orgs/* (organizations, members, org-admin, form, state; testy): členství, FOR UPDATE invariant ownera
- lib/money/{parse,format}.ts: parsování Kč a procent bez float, formátování; zaokrouhlení jen v lib/money
- lib/validation/org.ts: Zod schémata organizací (strop fee_fixed 1000 Kč)
- app/(admin)/admin/platform/** + components/platform/*: platform admin (úkol 6)
- app/(admin)/admin/[orgSlug]/** : org admin, nastavení, členové, přepínač organizací (úkol 7)
- lib/seed/* + scripts/seed.ts: idempotentní seed, běží s `--conditions=react-server`
- e2e/invite-flow.spec.ts: e2e pozvánky přes outbox, jen localhost a testovací Supabase
## Hotové úkoly
- [2026-11-26] příprava repozitáře → hotovo
- [2026-11-27] rozpad fáze 0 (architect) → plán 8 úkolů
- [2026-11-27] úkol 1 Scaffold → hotovo (commity v rozsahu 871bf9b..34aecf8)
- [2026-11-27] úkol 2 Schéma DB → 2 kola audit money + security OK (commity v rozsahu 871bf9b..34aecf8)
- [2026-11-27] úkol 3 RLS → APPROVE, opravy default ACL jen pro postgres (852cb16)
- [2026-11-27] úkol 4 Auth jádro → proxy, guardy, login heslo + magic link, callback; opravy 3d1f2c4, 7f0ac74
- [2026-11-27] úkol 5 Audit + e-mail + pozvánky → security OK (0e79158, opravy 34aecf8)
- [2026-11-28] úkol 6 Platform admin → security APPROVE, money po opravách (strop fee_fixed 1000 Kč, plátce DPH vyžaduje DIČ) (commity viz `git log main..HEAD`)
- [2026-11-28] úkol 7 Org admin → security APPROVE, přepínač, members, last-owner invariant (dcad2df)
- [2026-11-28] úkol 8 Seed + e2e + README → security po opravách (redirect URL bez *.vercel.app, náhodné heslo v e2e, e2e jen localhost) (92a07b3, 0c01c47)
- [2026-11-28] tester → audit-coverage, env-contract, testy guardů, PHASE_0_TEST.md; 512 testů zelených (e3d5a9e)
- [2026-11-28] pr-reviewer → REQUEST CHANGES jen kvůli checkpointu; čeká na APPROVE po aktualizaci
## Otevřené otázky / blokery
- finální název produktu (brand config), výše provize, refund policy, obchodní podmínky
- rizika pro fázi 1:
  - globální REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC: nové SQL funkce potřebují explicitní GRANT
  - každá nová tabulka potřebuje RLS (test to kontroluje)
  - webhook Stripe bude potřebovat další výjimku `// public:` (limit 6 v guard-first testu)
  - poplatky do application_fee jen přes lib/money
  - Vercel preview a produkce sdílejí DB (oddělit až ve fázi 7)
