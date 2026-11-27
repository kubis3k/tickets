# GlobaalTicket (pracovní název)

Ticketingový systém pro 3Lwave / Northevents a partnery na pozvánku: prodej vstupenek přes Stripe Connect, QR check-in, daňové doklady, Meta CAPI. Název a doména produktu žijí jen v `lib/config/brand.ts` (název ještě není finální). Produkční doména je `tickets.3lwave.cz`.

Aktuálně je hotová **fáze 0 (Foundation)**: přihlášení, role, organizace, pozvánky, admin. Storefront, platby a scanner přijdou v dalších fázích.

- Specifikace (závazná): [`docs/SPEC.md`](docs/SPEC.md)
- Rozhodnutí: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Zadání fází: [`docs/phases/`](docs/phases/)
- Pravidla pro Claude Code a flow systém: [`CLAUDE.md`](CLAUDE.md)

## Stack

Next.js (App Router) · TypeScript strict · Supabase (Postgres + Auth) · Drizzle ORM · Tailwind + shadcn/ui · Zod · Resend + React Email · Vitest (+ PGlite) · Playwright · Vercel · pnpm

## Požadavky

- Node.js 24+
- pnpm 11 (`corepack enable`, verze je v `packageManager`)
- Supabase projekt (region `eu-west-1`), účet Resend

## Lokální spuštění

```
pnpm install
cp .env.example .env.local     # doplň hodnoty, soubor NIKDY necommituj
pnpm db:migrate                # schéma + RLS do Supabase (viz Migrace; nejdřív ověř, že schéma `public` je prázdné)
pnpm db:seed                   # platform admin + organizace 3Lwave (viz Seed)
pnpm dev                       # http://localhost:3000
```

Další příkazy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm format`. Build bez env (CI): `SKIP_ENV_VALIDATION=1 pnpm build`. `SKIP_ENV_VALIDATION` se v produkčním runtime ignoruje.

## Proměnné prostředí

Hodnoty patří jen do `.env.local` a do Vercelu. Validace (Zod) běží při startu, chyba vypíše jen názvy proměnných.

| Název | K čemu | Kde vzít |
|---|---|---|
| `DATABASE_URL` | runtime připojení k DB (pooler, port 6543) | Supabase → Connect → Transaction pooler |
| `DIRECT_URL` | migrace a seed (přímé spojení, port 5432) | Supabase → Connect → Direct connection |
| `NEXT_PUBLIC_SUPABASE_URL` | adresa Supabase projektu | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | veřejný klíč pro prohlížeč a SSR | Supabase → Project Settings → API (anon / publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin API (vytváření účtů), obchází RLS, jen server | Supabase → Project Settings → API (service role / secret) |
| `NEXT_PUBLIC_APP_URL` | veřejná adresa aplikace (odkazy v e-mailech, redirecty) | `http://localhost:3000`, na Vercelu adresa nasazení |
| `RESEND_API_KEY` | odesílání e-mailů | Resend → API Keys |
| `EMAIL_FROM` | odesílatel, např. `Název <noreply@vase-domena.cz>` | adresa z ověřené domény v Resendu |
| `EMAIL_DRIVER` | `resend` (výchozí) nebo `outbox` (soubory do `.e2e-outbox/`, jen lokálně a e2e, v produkci zakázáno) | nastav sám |
| `PLATFORM_ADMIN_EMAIL` | e-mail jediného platform admina | tvůj e-mail |
| `SEED_ADMIN_PASSWORD` | volitelné heslo admina při prvním seedu (bez něj se přihlašuješ magic linkem) | vymysli, min. 10 znaků |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | přihlášení admina v e2e, jen lokálně; výchozí je `PLATFORM_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | volitelné |
| `SKIP_ENV_VALIDATION` | `1` přeskočí validaci (build v CI), v produkci se ignoruje | jen CI |

## Supabase setup

1. Projekt v regionu `eu-west-1`. Z Connect si zkopíruj `DATABASE_URL` (Transaction pooler, port 6543) a `DIRECT_URL` (Direct connection, port 5432).
2. **Authentication → Sign In / Providers → Email**: povol Email, **vypni „Allow new users to sign up"** (registrace jen přes pozvánku; účty vznikají přes `admin.createUser`). Heslo i magic link zůstávají zapnuté.
3. **Authentication → URL Configuration**:
   - Site URL: adresa produkce.
   - Redirect URLs (povol i s query, proto `**`):
     - `http://localhost:3000/auth/callback**`
     - `https://<produkční doména>/auth/callback**`
     - preview: `https://*-<team-slug>.vercel.app/auth/callback**` (vzor omezený na tým)
   - **Nikdy `https://*.vercel.app/**`**: kdokoli by si na Vercelu postavil vlastní aplikaci a převzal účet přes magic link.
4. **Authentication → SMTP Settings → Custom SMTP** (e-maily z Supabase Auth, tedy magic link, jdou přes Resend): host `smtp.resend.com`, port `465`, uživatel `resend`, heslo = `RESEND_API_KEY`, odesílatel z ověřené domény.
5. **Authentication → Email Templates → Magic Link**: odkaz musí být přesně

   ```
   <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Přihlásit se</a>
   ```

   Proč právě takto (ověřeno s kódem): aplikace posílá `emailRedirectTo = <APP_URL>/auth/callback?next=<cesta>` (`app/login/actions.ts`), takže `{{ .RedirectTo }}` už obsahuje `?` a další parametry se připojují přes `&`. `app/auth/callback/route.ts` přijme `token_hash` + `type` (`email` nebo `magiclink`) a **nic nespotřebuje**, jen přesměruje na `/auth/confirm`. Přihlášení proběhne až po kliknutí na tlačítko (POST `/auth/confirm/verify`), takže e-mailové skenery odkaz nespotřebují. Šablona `{{ .ConfirmationURL }}` (PKCE `code`) také funguje, ale pak musí být odkaz otevřen ve stejném prohlížeči, kde byl vyžádán. Šablony Invite a Confirm signup se nepoužívají (pozvánky posílá aplikace sama přes Resend, platí 7 dní).

## Migrace

Před prvním `pnpm db:migrate` ověř, že schéma `public` v Supabase je prázdné (žádné tabulky z dřívějška). Migrace 0001 jinak skončí chybou kontroly RLS.

```
pnpm db:migrate     # drizzle-kit migrate, používá DIRECT_URL
pnpm db:check       # konzistence migrací (běží i v CI)
pnpm db:generate    # po změně schématu v lib/db/schema/*
```

- `drizzle/0000_init.sql` – všechny tabulky ze SPEC §5 (+ invitations, door_assignments, invoice_sequences, jobs).
- `drizzle/0001_rls.sql` – ručně psané RLS politiky a funkce `app.*` (pojistka; primární kontrola je v aplikaci). Nové RLS helper funkce potřebují explicitní `GRANT`.

`drizzle.config.ts` si `DIRECT_URL` načte z `.env.local` (nebo z proměnných procesu).

## Seed

```
pnpm db:seed
```

Spouští se přes `tsx --conditions=react-server` (kvůli importu `server-only` modulů mimo Next) a vyžaduje kompletní `.env.local` (stejná validace jako aplikace). Načte `.env.local`, zajistí auth účet admina (`PLATFORM_ADMIN_EMAIL`; vytvoří ho, pokud neexistuje, s heslem `SEED_ADMIN_PASSWORD`, je-li nastaveno) a idempotentně založí: řádek v `users`, `platform_admins`, organizaci „3Lwave" (Globaal Elevate Production s.r.o., IČO 24972070, DIČ CZ24972070, plátce DPH, prefix `3LW`, provize 5 %), místo konání, ukázkovou akci (draft), typ vstupenky (DPH 12 %, kapacita 500), cenovou vlnu 599 Kč a `inventory`. Opakované spuštění nic nepřidá ani nepřepíše. Adresa organizace je placeholder, uprav ji v adminu. Admin není členem organizace 3Lwave (platform admin vidí všechny organizace). Heslo se nikam nevypisuje; k účtu, který už existuje, se heslo nenastavuje.

## Resend

1. Přidej a ověř doménu (DNS záznamy SPF a DKIM podle Resendu, volitelně DMARC).
2. `EMAIL_FROM` musí patřit do ověřené domény.
3. `RESEND_API_KEY` vytvoř s oprávněním Sending access. Stejný klíč slouží jako SMTP heslo v Supabase.

## Vercel

- Nastav všechny proměnné z tabulky pro **Production i Preview** (`E2E_*` a `SKIP_ENV_VALIDATION` ne). `EMAIL_DRIVER` nenastavuj (výchozí `resend`); `outbox` je v produkci zakázán.
- `NEXT_PUBLIC_APP_URL` se zapéká při buildu. Pro preview větve `phase-0` nastav env „Preview (branch phase-0)" na alias `https://<projekt>-git-phase-0-<team>.vercel.app` PŘED buildem a ten alias přidej do Supabase Redirect URLs. Jinak budou odkazy v e-mailech mířit jinam.
- Preview validuje env při startu: chybějící proměnná = pád aplikace.
- Preview zatím sdílí Supabase DB s produkcí (viz DECISIONS).
- Merge do `main` dělá jen člověk po proklikání preview.

## Testy

- **Unit / integrační (Vitest):** `pnpm test`. DB testy běží v PGlite (in-memory Postgres) nad skutečnými migracemi včetně RLS, nepotřebují Supabase ani env.
- **E2E (Playwright):** jen lokálně, v CI neběží.
  1. `.env.local` má vyplněné Supabase proměnné, `PLATFORM_ADMIN_EMAIL` a `SEED_ADMIN_PASSWORD` (nebo `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`), admin existuje s heslem (seed).
  2. `E2E=1 pnpm e2e` (PowerShell: `$env:E2E=1; pnpm e2e`). Playwright sám spustí `pnpm dev` s `EMAIL_DRIVER=outbox`; e-maily skončí v `.e2e-outbox/` (není v gitu).
  3. S `EMAIL_DRIVER=outbox` (nastavuje ho Playwright) není potřeba `RESEND_API_KEY` ani `EMAIL_FROM`.
  4. Pokud už dev server běží, musí běžet s `EMAIL_DRIVER=outbox`, jinak test e-mail s pozvánkou nenajde (a odešel by skutečný e-mail).
  5. Test `e2e/invite-flow.spec.ts`: admin založí organizaci → pozve ownera (`e2e+<čas>@example.com`) → odkaz z outboxu → owner v čistém prohlížeči nastaví heslo a vidí svou organizaci → `/admin/3lwave` vrátí 404.
  6. **E2E spouštěj jen proti lokálnímu/testovacímu Supabase projektu, nikdy proti produkci.** `NEXT_PUBLIC_APP_URL` v prostředí testu musí být localhost, jinak test selže ještě před během. Port lze změnit přes `E2E_PORT` (výchozí 3000).
  6. **Úklid se nedělá** (service role klíč smí být jen v `env.ts` a `supabase-admin.ts`). Po každém běhu zůstává: organizace se slugem `e2e-<čas>`, uživatel `e2e+<čas>@example.com` (auth účet i řádek `users`), členství a audit. Smaž je ručně: organizaci v Platform adminu nebo SQL (`delete from organizations where slug like 'e2e-%'`, navázané řádky podle FK), uživatele v Supabase → Authentication → Users (filtr `e2e+`) a řádky `users` s tímto e-mailem. Heslo ownera je náhodné a nikde se neukládá.

## Struktura repa

```
app/(storefront)   veřejný web (placeholder)
app/(admin)/admin  admin: /admin/platform (platform admin), /admin/[orgSlug] (organizace)
app/(scanner)/scan scanner (další fáze)
app/api            route handlery (health, později webhooky)
app/auth, login, invite   přihlášení, magic link, přijetí pozvánky
components         UI (shadcn) a komponenty adminu
lib/auth           Supabase klienti, session, guardy (requirePlatformAdmin, requireOrgRole, requireDoor)
lib/db             Drizzle klient a schéma (lib/db/schema/*)
lib/orgs, invitations, audit, email, money, validation, seed   business logika
lib/config         brand.ts, validace env
lib/i18n/cs.ts     všechny texty UI
drizzle            migrace
scripts/seed.ts    seed
test, e2e          testovací infrastruktura (PGlite), Playwright
docs               SPEC, DECISIONS, zadání fází
```

Pravidla: každá server action začíná guardem a pak Zod validací, peníze jsou `integer` v haléřích přes `lib/money`, dotazy na data organizace filtrují `organization_id`, texty jen z `lib/i18n/cs.ts`, branding jen z `lib/config/brand.ts`.

## Vývoj s Claude Code

```
claude
/phase 0
```

Každý úkol jde přes `/flow <úkol>`, celá fáze přes `/phase <N>` (detail v [`CLAUDE.md`](CLAUDE.md)). Dashboard spotřeby tokenů: `python3 tools/flow-dash.py` → http://localhost:8377
