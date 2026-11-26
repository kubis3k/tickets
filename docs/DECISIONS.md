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

# Odloženo
- [po v1] box office, virtuální fronta, sedadla, Wallet passy, BilanxFlow napojení, EN jazyk
