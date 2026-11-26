---
description: Flow orchestrace pro GlobaalTicket — mozek rozloží úkol, určí tier (kritické zóny = T4), přiřadí subagenty a modely a vede je přes sdílený stav.
---

# FLOW MODE — GlobaalTicket

Úkol: $ARGUMENTS

Jednáš jako **Mozek (orchestrátor)**. Postupuj přesně takto.

## 0. Obnov kontext (POVINNÉ, před čímkoli jiným)
1. Přečti `.claude/state/flow-state.md`. Neexistuje-li, vytvoř ho ze šablony v §4.
2. Přečti `docs/DECISIONS.md` (neexistuje-li, vytvoř ho ze šablony v §5).
3. Zjisti aktuální fázi (`flow-state` → „fáze") a znej rozsah z `docs/phases/PHASE_<N>.md`.
   Pro detail sahej do `docs/SPEC.md` **jen do relevantní sekce**, ne celý soubor pokaždé.
4. Pokud checkpoint ukazuje rozdělanou práci, NAVAŽ na ni.

## 1. Triáž

### 1a. Kritické zóny → T4 vždy
Dotkne-li se úkol čehokoli z tohoto seznamu, tier je **T4**, bez ohledu na velikost:
peníze (Stripe, ceny, slevy, provize, payout, refund) · kapacita a rezervace · tvorba objednávek/vstupenek ·
doklady, DPH, číselné řady, vyúčtování · auth, role, guardy, middleware, RLS · webhooky · DB migrace ·
podpisy QR a check-in.

### 1b. Ostatní
| Tier | Kritérium | Tým | Modely |
|---|---|---|---|
| T0 | 1 soubor, <20 řádků, jasné | main | — |
| T1 | 1–3 soubory, známý kód | coder (+ critic) | sonnet (+ sonnet) |
| T2 | více souborů, průzkum | scout → coder → tester → critic | haiku → sonnet → sonnet → sonnet |
| T3 | nová feature / neznámý kód | scout → architect → coder → tester → critic → scribe | haiku → opus → sonnet → sonnet → sonnet → haiku |
| T4 | kritická zóna | scout → architect (**plán schválit před kódem**) → coder → tester → critic + `money-auditor` / `security-auditor` → scribe | auditoři a architect na opus |

Napiš jednou větou: tier + důvod (u T4 jmenuj zónu). Eskalace za běhu jen s důkazem, oznam ji.

### 1c. Výběr auditora u T4
- peníze, kapacita, doklady, vyúčtování → `money-auditor`
- auth, role, RLS, webhooky, secrets, QR podpisy → `security-auditor`
- webhook Stripe nebo checkout → **oba** (paralelně)

## 2. Pravidla orchestrace
- Každý subagent dostane: (a) JEDEN cíl, (b) výřez z flow-state, (c) relevantní odkaz do SPEC (`docs/SPEC.md §N`), (d) instrukci vrátit blok k zápisu do stavu.
- Nikdy nepředávej celou historii konverzace ani obsah souborů. Jen cesty a soubor:řádek.
- Nezávislé věci paralelně (např. `critic` + `money-auditor`), závislé sériově.
- Tvrzení bez důkazu (soubor:řádek, diff, výstup testu) nech ověřit.
- **Smyčka oprav:** auditor/critic vrátí FIX NEEDED → coder opraví jen nálezy → znovu jen ten auditor, který nález dal. Max 3 kola, pak zastav a napiš uživateli blokér.
- U T4 architect **nejdřív** vrátí plán. Plán ukaž uživateli v 5–10 řádcích. Pokud uživatel neodpoví (běh bez dozoru), pokračuj a zapiš do DECISIONS „plán schválen automaticky".
- Na konci každého běhu `scribe`.

## 2b. Dynamické modely
Frontmatter je default. Při každém spawnu rozhodni override parametrem `model`:
- downgrade: mechanická práce (přejmenování, boilerplate, config, i18n texty) → coder na `haiku`
- upgrade: souběh, kryptografie (QR podpisy), výpočty DPH/zaokrouhlení → coder na `opus`
- auditoři a `pr-reviewer` **nikdy pod opus**
Oznam jednou větou („coder → haiku (i18n texty)").
Je-li nastavená env `CLAUDE_CODE_SUBAGENT_MODEL`, dynamika nefunguje. Upozorni uživatele.

## 2c. Šetření tokenů (tvrdá pravidla)
1. Do stavu ani mezi agenty nevkládej obsah souborů, jen cesty a jednořádková shrnutí.
2. Drobné související kroky slučuj do jednoho spawnu.
3. Co je v Mapě poznání, znovu negrepuj.
4. Vyžaduj limity řádků z promptů agentů.
5. Neměň za běhu definice agentů ani hlavičku flow-state (cache).
6. SPEC čti po sekcích.

## 3. Git
- Pracuj jen na branchi aktuální fáze (`phase-<N>`), nikdy na `main`.
- Commit po každém dokončeném kroku plánu, který prošel testy. Conventional Commits.
- Nikdy `git push --force`, nikdy merge do `main`.

## 4. Šablona `.claude/state/flow-state.md`
```markdown
# FLOW STATE — GlobaalTicket
## Projekt
- fáze: 0
- branch: phase-0
## Aktuální úkol
- cíl: …
- tier: …
- zóna (T4): …
- status: running | blocked | review | done
## Checkpoint
- poslední dokončený krok: …
- rozpracovaný soubor + řádek: …
- další krok: …
## Plán (aktivní)
1. …
## Invarianty (aktivní)
- …
## Mapa poznání
- <soubor>: <1 řádek>
## Hotové úkoly
- [datum] cíl → výsledek
## Otevřené otázky / blokery
- …
```

## 5. Šablona `docs/DECISIONS.md`
```markdown
# Rozhodnutí
(append-only, nejnovější dole)
- [datum] [fáze] rozhodnutí — důvod
# Odloženo
- [fáze kam patří] co — proč odloženo
```

## 6. Ukončení běhu
Checkpoint přesně (soubor, řádek, další krok). Krátké shrnutí uživateli: co hotovo, testy, co dál, blokery.
