# Fáze 0 — Foundation

Stavíš od nuly nový ticketingový systém. Celá specifikace je v `docs/SPEC.md`, přečti si ji celou, než začneš. **Tato úloha pokrývá jen Fázi 0.** Nic z dalších fází neimplementuj, jen pro ně připrav strukturu.

## Cíl
Funkční základ: platform admin se přihlásí, založí organizaci (partnera), pozve ownera e-mailem a owner se přihlásí do svého adminu. Žádná veřejná registrace.

## Stack (závazný)
- Next.js (App Router, latest stable), TypeScript strict, pnpm
- Supabase (Postgres + Auth), Drizzle ORM + drizzle-kit migrace
- Tailwind + shadcn/ui
- Zod pro veškerou validaci vstupů
- Vitest (unit) + Playwright (e2e)
- Resend pro e-maily (pozvánky), šablony v React Email
- Deploy na Vercel

## Infrastruktura
- Repo: `https://github.com/kubis3k/tickets` (branch `phase-0`, PR do `main`)
- Supabase: existující projekt v regionu `eu-west-1`. Connection string je v `.env.local` / Vercel env jako `DATABASE_URL` (pooler, port 6543 pro runtime) a `DIRECT_URL` (port 5432 pro migrace). **Nikdy ho nezapisuj do kódu, commitů ani logů.**
- Platform admin: jediný, e-mail z env `PLATFORM_ADMIN_EMAIL`. Seed ho založí.
- Seed organizace: „3Lwave" (provozovatel Globaal Elevate Production s.r.o., IČO 24972070, DIČ CZ24972070, plátce DPH). Northevents se založí později jako samostatná organizace přes admin.
- Doména: `tickets.3lwave.cz`

## Úkoly

1. **Scaffold**
   - Struktura: `app/(storefront)`, `app/(admin)/admin`, `app/(scanner)/scan`, `app/api`, `lib/db`, `lib/auth`, `lib/email`, `lib/config`
   - `lib/config/brand.ts`: název produktu, doména, logo, barvy. **Nikde v kódu nesmí být natvrdo název ani doména.**
   - `.env.example` se všemi proměnnými, validace env přes Zod při startu

2. **Databáze**
   - Drizzle schéma pro **všechny** tabulky ze SPEC §5 (i pro budoucí fáze, ať se schéma nepřepisuje). Peníze jako `integer` v haléřích, časy jako `timestamptz`, ID jako `uuid`.
   - Migrace + seed skript: 1 platform admin, 1 organizace „3Lwave" s ukázkovou akcí.
   - RLS politiky v Supabase podle členství v organizaci (pojistka, primární kontrola je v aplikaci).

3. **Auth a role**
   - Supabase Auth: magic link + heslo. Veřejná registrace **vypnutá** (jen invite).
   - `lib/auth/guards.ts`: `requirePlatformAdmin()`, `requireOrgRole(orgId, ['owner','staff'])`, `requireDoor(eventId)`. Používá se v každé server action a route handleru.
   - Middleware: `/admin/**` vyžaduje login, `/scan/**` vyžaduje roli door/owner/staff.

4. **Platform admin** (`/admin/platform`)
   - Seznam organizací, vytvoření a editace (fakturační údaje, `vat_payer`, prefix číselné řady, poplatky, branding).
   - Pozvání uživatele do organizace s rolí. Odejde e-mail přes Resend, pozvánka platí 7 dní.
   - Výpis uživatelů a změna nebo odebrání role.

5. **Org admin** (`/admin/[orgSlug]`)
   - Layout s přepínačem organizací (uživatel může být ve více).
   - Dashboard zatím jako placeholder, nastavení organizace (owner), správa členů (owner).

6. **Audit log**: každá změna v adminu se zapíše do `audit_log`.

7. **Kvalita**
   - ESLint + Prettier, `pnpm typecheck`, `pnpm test`, `pnpm e2e`
   - GitHub Actions CI: lint, typecheck, test
   - E2E test: admin založí organizaci → pozve ownera → owner přijme pozvánku → vidí svůj admin a cizí organizaci nevidí.

## Pravidla
- Žádné `any`. Žádná business logika v komponentách, patří do `lib/` nebo server actions.
- Každá server action validuje vstup Zodem a kontroluje oprávnění **jako první řádek**.
- Česká lokalizace UI (texty v `lib/i18n/cs.ts`, ať jde později přidat EN).
- Neimplementuj Stripe, checkout, vstupenky ani scanner. To jsou další fáze.
- Když narazíš na nejasnost ve SPEC, rozhodni rozumně, zapiš rozhodnutí do `DECISIONS.md` a pokračuj.

- Zákaznické účty (`customers`) jsou oddělené od admin účtů (`users`). Ve Fázi 0 jen schéma, přihlášení zákazníků přijde ve Fázi 3.
- Pracuj na branchi `phase-0`, výsledek odevzdej jako Pull Request do `main` (viz docs/SPEC.md §12).

## Výstup
- Pull Request se zeleným CI
- V popisu PR: **testovací scénář pro člověka** (krok za krokem, co proklikat ve Vercel preview a co má být výsledkem)
- `README.md`: lokální spuštění, Supabase setup, env proměnné, seed
- `DECISIONS.md`
- Krátké shrnutí: co je hotové, co ne, rizika pro Fázi 1
