# Rozhodnutí
(append-only, nejnovější dole)
- [2026-11-26] [prep] Systém se staví od nuly, starý GateUP se vypíná, nic se nemigruje — špatná architektura starého kódu
- [2026-11-26] [prep] Uživatelé: 3Lwave/Northevents + partneři na pozvánku, žádná veřejná registrace — nejde o otevřený SaaS
- [2026-11-26] [prep] Stripe Connect Express, direct charges, application_fee, manuální payout po akci — peníze neprocházejí účtem GEP (riziko ČNB)
- [2026-11-26] [prep] Provize z ceny po slevě (vzor Eventlook 5 %), GEP vystaví po akci jednu provizní fakturu „uhrazeno ze vstupného"
- [2026-11-26] [prep] Doklad za vstupenky vystavuje pořadatel, sazba DPH per kategorie (default 12 %)
- [2026-11-26] [prep] Resend místo Gmailu — limity odesílání Gmailu nestačí na 5 000+ lístků
- [2026-11-26] [prep] Nákup bez registrace, zákaznický účet volitelný (magic link)
- [2026-11-26] [prep] Per akce: jméno na vstupence, 18+ potvrzení, převod vstupenky — každé zvlášť přepínatelné
- [2026-11-26] [prep] Jen čeština ve v1, texty v lib/i18n
- [2026-11-26] [prep] Doména tickets.3lwave.cz, název produktu se vybere před spuštěním (lib/config/brand.ts)
- [2026-11-26] [prep] Jediný platform admin (Luigi). Northevents = samostatná organizace po založení s.r.o.
- [2026-11-26] [prep] Každá fáze = PR, review agent + ruční test v preview, merge jen člověk
- [2026-11-27] [F0] Plán fáze 0 (8 úkolů) schválen automaticky — běh bez dozoru (flow §2)
- [2026-11-27] [F0] Bez `src/`, `app/` a `lib/` v rootu — kopíruje zadání
- [2026-11-27] [F0] `users.id` = `auth.users.id`; admin přístup jen přes `users` + `memberships`/`platform_admins` — jedna identita, zákazníci v auth nedostanou admin
- [2026-11-27] [F0] Vlastní `invitations` s hashem tokenu a Resend, ne `inviteUserByEmail` — OTP platí max 24 h, zadání chce 7 dní a Resend
- [2026-11-27] [F0] Signups vypnuté v Supabase a účty jen přes `admin.createUser` — žádná veřejná registrace
- [2026-11-27] [F0] RLS = SELECT politiky pro `authenticated`, `anon` deny, Drizzle RLS obchází — RLS je pojistka (SPEC §9)
- [2026-11-27] [F0] Middleware kontroluje jen přihlášení, role pro `/scan` hlídá guard v layoutu — odchylka od PHASE_0, middleware není bezpečnostní hranice
- [2026-11-27] [F0] Nové tabulky mimo SPEC §5: `invitations`, `door_assignments`, `invoice_sequences`, `jobs`; do `audit_log` přidány `id` a `organization_id` — SPEC §2/§4/§9 je potřebují
- [2026-11-27] [F0] Procenta jako integer bps (`fee_bps`, `vat_rate_bps`, `fee_override_bps`) — žádné desetinné hodnoty v penězích
- [2026-11-27] [F0] Testy DB přes PGlite, e2e jen s env a lokálně, v CI ne — env a DB agentům nejsou dostupné
- [2026-11-27] [F0] Ne-člen org dostane 404 místo 403 — nejde zjišťovat, jaké organizace existují
- [2026-11-27] [F0] Zapomenuté heslo řeší magic link, vlastní reset se nedělá — menší rozsah
- [2026-11-27] [F0] Vercel Preview zatím sdílí Supabase DB s produkcí — před spuštěním přijatelné, ve Fázi 7 se oddělí
- [2026-11-27] [F0] Práce ve worktree branchi, push do `origin/phase-0` — lokální `phase-0` je checkoutnutá v jiném worktree

# Odloženo
- [po v1] box office, virtuální fronta, sedadla, Wallet passy, BilanxFlow napojení, EN jazyk
- [F3] serverové zakládání zákaznických auth účtů — signups jsou vypnuté
- [F3/F4] uložení privátního Ed25519 klíče akce — mimo F0
- [F5] šifrované uložení CAPI tokenu per org — mimo F0
