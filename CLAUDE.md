# GlobaalTicket — instrukce pro Claude Code

Ticketingový systém pro 3Lwave/Northevents a partnery na pozvánku. Prodej vstupenek přes Stripe Connect, QR check-in, daňové doklady, Meta CAPI.
**Specifikace: `docs/SPEC.md`. Je závazná.** Zadání aktuální fáze: `docs/phases/PHASE_<N>.md`.

---

## 1. FLOW SYSTEM JE POVINNÝ

**Každý úkol v tomto repozitáři se dělá přes `/flow <úkol>`.** Bez výjimky, i když je triviální (T0 se pak udělá v hlavní session, ale stav se stejně zapíše).
Celou fázi spouštěj přes `/phase <N>`, který flow řídí od začátku až po Pull Request.

Proč: `.claude/state/flow-state.md` je jediná paměť projektu mezi sessions. Úkol mimo flow = ztracený kontext a opakovaný průzkum.

### Na začátku KAŽDÉ session
1. Přečti `.claude/state/flow-state.md` (checkpoint), `docs/DECISIONS.md` a aktuální `docs/phases/PHASE_<N>.md`.
2. Navaž přesně na checkpoint. Neprozkoumávej znovu, co je v Mapě poznání.

### Tým (`.claude/agents/`)
| Agent | Role | Model | Zapisuje? |
|---|---|---|---|
| `scout` | Průzkum codebase, fakta se soubor:řádek | haiku | ne |
| `architect` | Plán, rozhodnutí, rozklad na kroky | opus | ne |
| `coder` | Implementace + testy | sonnet | ano |
| `tester` | Unit/e2e/zátěžové testy, testovací scénář pro člověka | sonnet | jen testy |
| `critic` | Obecné review diffu | sonnet | ne |
| `money-auditor` | Stripe Connect, haléře, DPH, doklady, vyúčtování, kapacita | opus | ne |
| `security-auditor` | Auth, role, izolace organizací, RLS, secrets, webhooky | opus | ne |
| `pr-reviewer` | Finální review celé fáze před merge | opus | ne |
| `scribe` | Údržba flow-state, DECISIONS, checkpoint | haiku | jen stav |

### Triáž (detail v `.claude/commands/flow.md`)
| Tier | Kdy | Tým |
|---|---|---|
| T0 | 1 soubor, <20 řádků, mimo kritické zóny | main |
| T1 | 1–3 soubory, známý kód | coder (+ critic) |
| T2 | více souborů, potřeba průzkumu | scout → coder → tester → critic |
| T3 | nová feature | scout → architect → coder → tester → critic → scribe |
| T4 | **kritická zóna** (viz níže) | jako T3 + architect schvaluje plán před kódem + `money-auditor` a/nebo `security-auditor` |

### Kritické zóny = automaticky T4
Jakákoli změna, která se dotkne:
- **peněz**: `lib/payments/**`, Stripe, `application_fee`, payouty, refundy, ceny, slevy, provize
- **kapacity**: `lib/inventory/**`, rezervace, tvorba objednávek a vstupenek
- **dokladů**: `lib/invoices/**`, DPH, číselné řady, vyúčtování (`settlements`)
- **přístupů**: `lib/auth/**`, role, guardy, middleware, RLS politiky
- **webhooků**: `app/api/webhooks/**`
- **DB migrací**: `drizzle/**`
- **QR podpisů a check-inu**: `lib/tickets/signing*`, `app/(scanner)/**`

Tier se nesmí snížit „protože je to malá změna". Jednořádková změna v zaokrouhlení DPH je T4.

---

## 2. NEPORUŠITELNÁ PRAVIDLA

**Peníze**
- Částky jsou vždy `integer` v haléřích. Žádné `float`, `number` s desetinnou čárkou, `toFixed` pro výpočty.
- Zaokrouhlení je deterministické, na jednom místě (`lib/money`) a pokryté testy.
- Součet řádků dokladu = celková částka, na haléř přesně.

**Kapacita**
- Rezervace kapacity jedním atomickým SQL `UPDATE … WHERE sold + reserved + n <= capacity`. Nikdy ne „přečti, spočítej, zapiš" v aplikaci.
- Objednávka, vstupenky a přesun `reserved → sold` proběhnou v jedné transakci.
- Webhooky jsou idempotentní (`stripe_events`).

**Přístupy**
- Každá server action a route handler: **první řádek = guard** (`requirePlatformAdmin` / `requireOrgRole` / `requireDoor`), druhý = Zod validace.
- Žádný dotaz bez filtru na `organization_id` tam, kde data patří organizaci.
- Žádná veřejná registrace admin účtů.

**Secrets**
- Nikdy nečti, nevypisuj ani necommituj `.env*`. Hodnoty znáš jen jako názvy proměnných z `.env.example`.
- Žádné tokeny, connection stringy ani osobní údaje zákazníků v logu.

**Rozsah**
- Dělej jen to, co patří do aktuální fáze. Co patří jinam, zapiš do `docs/DECISIONS.md` → „Odloženo".
- Branding (název, doména, logo) jen z `lib/config/brand.ts`. Název produktu ještě není finální.

---

## 3. WORKFLOW FÁZE

1. `/phase <N>` → branch `phase-<N>` z aktuálního `main`
2. Flow T3/T4 podle zadání fáze, průběžné commity (Conventional Commits, česky nebo anglicky, ale konzistentně)
3. `tester` doplní testy a napíše **testovací scénář pro člověka**
4. `pr-reviewer` projde celý diff fáze. Při REQUEST CHANGES → coder opraví → znovu review
5. Pull Request do `main`: popis, scénář pro člověka, verdikt reviewera, odložené věci
6. **Merge dělá jen člověk** (Luigi) po proklikání Vercel preview. Nikdy nemerguj sám, nikdy nepushuj do `main`.

### Definition of Done (každá fáze)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené, e2e pro hlavní scénář fáze
- [ ] `pr-reviewer` = APPROVE
- [ ] `docs/DECISIONS.md` aktualizované
- [ ] `flow-state.md` má checkpoint „fáze N hotová, další: fáze N+1"
- [ ] PR obsahuje testovací scénář pro člověka

---

## 4. Příkazy

```
pnpm dev            # lokální vývoj
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest
pnpm e2e            # Playwright
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # drizzle-kit migrate (DIRECT_URL)
pnpm db:seed        # seed
python3 tools/flow-dash.py   # dashboard spotřeby tokenů → http://localhost:8377
```
(Fáze 0 tyto skripty vytváří. Dokud neexistují, nespouštěj je.)

---

## 5. Měření tokenů
Hooky v `.claude/settings.json` po každé odpovědi zapisují spotřebu do `.claude/state/token-log/` (necommituje se). `tools/flow-dash.py` ukazuje cenu flow vs. běžných promptů, cache hit rate a podíl subagentů. Pokud je nastavená env `CLAUDE_CODE_SUBAGENT_MODEL`, vypíná dynamické přepínání modelů. Hook na to upozorní.
