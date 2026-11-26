# GlobaalTicket (pracovní název)

Ticketingový systém pro 3Lwave / Northevents a partnery. `tickets.3lwave.cz`

- Specifikace: [`docs/SPEC.md`](docs/SPEC.md)
- Rozhodnutí: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Fáze: [`docs/phases/`](docs/phases/)
- Pravidla pro Claude Code + flow systém: [`CLAUDE.md`](CLAUDE.md)

## Vývoj s Claude Code
```
claude
/phase 0
```
Každý úkol jde přes `/flow <úkol>`, každá fáze přes `/phase <N>`. Merge do `main` dělá jen člověk po proklikání Vercel preview.

Dashboard spotřeby tokenů: `python3 tools/flow-dash.py` → http://localhost:8377
