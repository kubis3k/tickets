---
description: Spustí nebo naváže na celou fázi projektu (docs/phases/PHASE_<N>.md) přes flow — od branch až po Pull Request s testovacím scénářem.
---

# PHASE MODE

Fáze: $ARGUMENTS

1. **Kontext:** Přečti `.claude/state/flow-state.md`, `docs/DECISIONS.md` a `docs/phases/PHASE_$ARGUMENTS.md`.
   Pokud soubor fáze neexistuje, zastav a napiš uživateli, že zadání fáze chybí.
2. **Branch:** Pokud neexistuje `phase-$ARGUMENTS`, vytvoř ji z aktuálního `main`. Jinak se na ni přepni a navaž na checkpoint.
3. **Rozpad:** Spusť `architect` (opus): rozloží zadání fáze na pořadí úkolů, ke každému tier (kritické zóny = T4) a akceptační kritérium. Zapiš do flow-state jako Plán.
4. **Provedení:** Každý úkol z plánu proveď jako samostatný `/flow` běh (podle `.claude/commands/flow.md`). Po každém úkolu checkpoint a commit.
5. **Testy:** `tester` doplní chybějící testy pro celou fázi a napíše testovací scénář pro člověka (`docs/phases/PHASE_$ARGUMENTS_TEST.md`).
6. **Finální review:** `pr-reviewer` nad celým diffem `main...phase-$ARGUMENTS`. Při REQUEST CHANGES → opravy přes flow → znovu review (max 3 kola, pak blokér uživateli).
7. **PR:** Push branche a otevři Pull Request do `main` (`gh pr create`). Popis obsahuje:
   - shrnutí fáze
   - testovací scénář pro člověka (zkopíruj z PHASE_N_TEST.md)
   - verdikt `pr-reviewer`
   - odložené věci z DECISIONS
   - potřebné env proměnné / ruční kroky (Supabase, Stripe, Vercel, DNS)
8. **Konec:** `scribe` → checkpoint „fáze $ARGUMENTS hotová v PR #…, čeká na merge člověkem; další: fáze N+1". **Nemerguj.**
