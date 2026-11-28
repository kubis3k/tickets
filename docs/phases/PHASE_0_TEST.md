# Fáze 0: testovací scénář pro člověka (Vercel preview)

Pro: Luigi. Čas: asi 45 minut. Technické znalosti nejsou potřeba. Postupuj kroky shora dolů, každý krok má „Udělej" a „Očekávaný výsledek". Když se výsledek liší, zapiš číslo kroku, co jsi viděl, a pošli screenshot.

Potřebuješ: dva různé prohlížeče nebo běžné okno + anonymní okno, přístup do schránky platform admina a do druhé schránky, kam smí chodit pošta (reálný e-mail pro pozvání ownera, např. `jmeno+owner@tvuj-email.cz`, a třetí adresa pro staff, např. `jmeno+staff@tvuj-email.cz`).

## Předpoklady (připraví vývojář nebo ty podle README)

- [ ] Ve Vercelu (Preview) jsou nastavené všechny proměnné prostředí z tabulky v `README.md` (sekce „Proměnné prostředí"). `NEXT_PUBLIC_APP_URL` je adresa tohoto preview. `EMAIL_DRIVER` nastavený není.
- [ ] Proběhly databázové migrace (`pnpm db:migrate`) a seed (`pnpm db:seed`). Seed vytvořil platform admina (`PLATFORM_ADMIN_EMAIL`), případně s heslem `SEED_ADMIN_PASSWORD`, a organizaci 3Lwave.
- [ ] Supabase je nastavený podle README: vypnuté „Allow new users to sign up", Redirect URLs obsahují adresu preview (`/auth/callback**`), vlastní SMTP přes Resend, šablona Magic Link s odkazem `{{ .RedirectTo }}&token_hash=...`.
- [ ] Doména odesílatele je ověřená v Resendu.
- [ ] Adresa preview je: `________________` (vyplň, dál ji nazývám PREVIEW).

---

## 1. Přihlášení platform admina (heslo i magic link)

**1a. Heslem**
- Udělej: Otevři `PREVIEW/login`. Zadej e-mail platform admina a heslo ze seedu. Klikni „Přihlásit se".
- Očekávaný výsledek: Jsi přihlášený a skončíš v administraci (viz krok 2).
- Zkus rozbít: zadej špatné heslo. Má se objevit „Neplatné přihlašovací údaje" a žádná informace, zda e-mail existuje.

**1b. Magic linkem**
- Udělej: Odhlas se (tlačítko „Odhlásit se"). Na `PREVIEW/login` zadej e-mail platform admina a klikni „Poslat přihlašovací odkaz".
- Očekávaný výsledek: Hláška „Pokud je e-mail registrovaný, poslali jsme na něj přihlašovací odkaz." Do schránky do minuty přijde e-mail.
- Udělej: Klikni na odkaz v e-mailu. Otevře se stránka „Dokončení přihlášení". Klikni „Pokračovat v přihlášení".
- Očekávaný výsledek: Jsi přihlášený. (Přihlášení se dokončí až tlačítkem, aby odkaz „nespotřeboval" e-mailový skener.)

## 2. `/admin` přesměruje na `/admin/platform`

- Udělej: Jako přihlášený platform admin otevři `PREVIEW/admin`.
- Očekávaný výsledek: Adresa se změní na `PREVIEW/admin/platform`, nadpis „Správa platformy", záložky „Organizace" a „Uživatelé".

## 3. Seznam organizací obsahuje 3Lwave

- Udělej: Na `/admin/platform` projdi tabulku Organizace.
- Očekávaný výsledek: Řádek „3Lwave", slug `3lwave`, IČO `24972070`, Plátce DPH „ano", provize 5 %. Klikni na řádek: v detailu je DIČ `CZ24972070`, obchodní jméno Globaal Elevate Production s.r.o., prefix `3LW`.

## 4. Založení nové organizace, včetně validací

- Udělej: Klikni „Nová organizace". Nejdřív zkus každou chybu zvlášť (formulář nesmí uložit nic):
  1. Slug `a` nebo `Moje Org` → chyba u slugu („3–50 znaků, malá písmena, číslice a pomlčky").
  2. Zaškrtni „Plátce DPH", DIČ nech prázdné → „Plátce DPH musí mít vyplněné DIČ."
  3. DIČ `123` → „DIČ ve tvaru CZ a 8–10 číslic."
  4. IČO `123` → „IČO musí mít přesně 8 číslic."
  5. Provize (%) `101` → odmítnuto („Zadejte procenta 0–100…"). Zkus i `-1` a `5,555`.
  6. Fixní poplatek `1000,01` → „Fixní poplatek může být nejvýše 1 000 Kč." Hodnota `1000` je ještě OK.
  7. Slug `3lwave` (už existuje) → „Organizace s tímto slugem už existuje."
- Očekávaný výsledek u všech: červené hlášky u polí, organizace se nevytvoří, vyplněné hodnoty zůstanou ve formuláři.
- Udělej: Teď vyplň správně: slug `test-partner`, název `Testovací partner`, IČO `12345678`, nech Plátce DPH nezaškrtnutý, provize `5,5`, fixní poplatek `2,50`, výplata `2` dny, prefix `TST`. Klikni „Vytvořit organizaci".
- Očekávaný výsledek: Přesměrování na detail organizace „Organizace Testovací partner". V seznamu organizací je nový řádek s provizí 5,5 %.

## 5. Editace organizace

- Udělej: V detailu změň název na `Testovací partner 2`, fixní poplatek na `3`. Ulož.
- Očekávaný výsledek: „Změny byly uloženy." Po obnovení stránky (F5) hodnoty zůstaly. Slug nejde změnit.
- Udělej: Ulož znovu bez jakékoli změny.
- Očekávaný výsledek: „Nic se nezměnilo."

## 6. Pozvání ownera na reálný e-mail

- Udělej: V detailu organizace `Testovací partner 2`, sekce „Pozvat uživatele": e-mail `jmeno+owner@tvuj-email.cz`, role „vlastník". Klikni „Poslat pozvánku".
- Očekávaný výsledek: „Pozvánka byla odeslána." V sekci „Pozvánky" je řádek se stavem „aktivní" a datem „Platí do" přibližně za 7 dní.
- Udělej: Otevři schránku.
- Očekávaný výsledek: E-mail od Resendu (odesílatel z `EMAIL_FROM`), česky, předmět „Pozvánka do organizace Testovací partner 2 (…)". V textu je organizace, role „vlastník", tlačítko „Přijmout pozvánku" a věta „Pozvánka platí do …" s datem 7 dní dopředu.
- Zkus rozbít: pošli pozvánku znovu na stejnou adresu. Proběhne a stará pozvánka přestane platit (otevři ji v kroku 12).

## 7. Přijetí pozvánky v anonymním okně

- Udělej: Otevři **anonymní okno** (nikdo tam není přihlášený). Zkopíruj do něj odkaz z e-mailu.
- Očekávaný výsledek: Stránka „Pozvánka do organizace", text „Byli jste pozváni do organizace Testovací partner 2 s rolí vlastník." E-mail je zamaskovaný (např. `j***@…`).
- Udělej: Zadej heslo kratší než 10 znaků a odešli.
- Očekávaný výsledek: „Heslo musí mít alespoň 10 znaků." Účet nevznikne.
- Udělej: Zadej heslo s 10 a více znaky, klikni „Vytvořit účet a přijmout pozvánku".
- Očekávaný výsledek: Přesměrování na `PREVIEW/admin/test-partner`, nadpis „Přehled: Testovací partner 2" (placeholder). Jsi přihlášený jako owner.

## 8. Owner vidí jen svou organizaci

V anonymním okně (owner):
- Udělej: Podívej se do přepínače organizací nahoře.
- Očekávaný výsledek: Jen „Testovací partner 2". Žádná 3Lwave.
- Udělej: Otevři `PREVIEW/admin/3lwave`.
- Očekávaný výsledek: Stránka **404** (nenalezeno). Nesmí se ukázat žádná data 3Lwave.
- Udělej: Otevři `PREVIEW/admin/platform`.
- Očekávaný výsledek: Stránka **403** „Přístup odepřen".
- Udělej: Otevři `PREVIEW/admin/platform/organizations/` + libovolné ID (zkopíruj ID 3Lwave z adresy v okně admina).
- Očekávaný výsledek: 403.

## 9. Owner pozve staff, staff nevidí Nastavení ani Členy

- Udělej: Jako owner otevři „Členové", pozvi `jmeno+staff@tvuj-email.cz` s rolí „pracovník".
- Očekávaný výsledek: „Pozvánka byla odeslána", e-mail dorazí.
- Udělej: V novém anonymním okně (zavři to předchozí, nebo použij jiný prohlížeč) otevři odkaz, nastav heslo.
- Očekávaný výsledek: Staff skončí v `PREVIEW/admin/test-partner`. V navigaci je jen „Přehled", **chybí** „Nastavení" i „Členové".
- Udělej: Ručně otevři `PREVIEW/admin/test-partner/settings` a `PREVIEW/admin/test-partner/members`.
- Očekávaný výsledek: Obě stránky vrátí 403 „Přístup odepřen".

## 10. Nejde odebrat posledního ownera

- Udělej: V okně ownera otevři „Členové". Zkus (a) odebrat sám sebe, (b) změnit sobě roli na „pracovník".
- Očekávaný výsledek: Obojí odmítnuto hláškou „Organizace musí mít aspoň jednoho vlastníka." Owner zůstává ownerem.
- Udělej (volitelně): Pozvi druhého ownera, nech ho přijmout a pak původního ownera sníž na „pracovník".
- Očekávaný výsledek: Teď to projde, protože zůstává jiný owner. Tento uživatel je po změně přesměrován na přehled a ztratí přístup ke členům.

## 11. Zrušení pozvánky

- Udělej: Jako owner (nebo platform admin v detailu organizace) pozvi `jmeno+zruseno@tvuj-email.cz` jako „pracovník". V seznamu pozvánek klikni „Zrušit" a potvrď.
- Očekávaný výsledek: „Pozvánka byla zrušena." Řádek zmizí z aktivních.
- Udělej: Otevři v anonymním okně odkaz z e-mailu, který přišel před zrušením.
- Očekávaný výsledek: Stránka „Pozvánka není platná" (odkaz neplatný, použitý, zrušený nebo vypršelý). Účet nevznikne.

## 12. Opakované použití odkazu

- Udělej: Otevři znovu odkaz z kroku 7 (owner už pozvánku přijal), a také odkaz ze staré pozvánky nahrazené v kroku 6 (druhé pozvání na stejnou adresu).
- Očekávaný výsledek: Obojí „Pozvánka není platná". Nejde si přes ně vytvořit druhý účet ani se přihlásit.

## 13. Odhlášení a ochrana `/admin`

- Udělej: Klikni „Odhlásit se". Pak otevři `PREVIEW/admin` a `PREVIEW/admin/test-partner`.
- Očekávaný výsledek: Přesměrování na `PREVIEW/login` (v adrese je původní cíl). Po přihlášení tě to vrátí na požadovanou stránku (pokud na ni máš právo).
- Udělej: Stiskni v prohlížeči „Zpět".
- Očekávaný výsledek: Žádná data administrace se neukážou bez přihlášení.

## 14. `/scan` podle role

- Udělej: Odhlášený otevři `PREVIEW/scan`.
- Očekávaný výsledek: Přesměrování na login.
- Udělej: Přihlas se jako owner nebo staff a otevři `PREVIEW/scan`.
- Očekávaný výsledek: „Skener vstupenek" s textem „Skener bude doplněn v pozdější fázi." (skener je až v další fázi).
- Udělej: Přihlas se jako platform admin (není členem žádné organizace) a otevři `PREVIEW/scan`.
- Očekávaný výsledek: 403 „Přístup odepřen" (platform admin bez role v organizaci do skeneru nesmí).

## 15. Žádná veřejná registrace

- Udělej: Na `PREVIEW/login` zadej e-mail, který v systému není (např. `nikdo-takovy-12345@example.com`), a klikni „Poslat přihlašovací odkaz".
- Očekávaný výsledek: **Stejná hláška** jako u existujícího e-mailu („Pokud je e-mail registrovaný, poslali jsme na něj přihlašovací odkaz."). Do schránky (pokud ji máš) nepřijde nic. V Supabase (Authentication → Users) nevznikl nový uživatel.
- Udělej: Na loginu hledej odkaz „Registrovat se".
- Očekávaný výsledek: Žádný neexistuje. Zkus ručně `PREVIEW/signup` a `PREVIEW/register`: 404.
- Udělej: V Supabase otevři Authentication → Sign In / Providers → Email.
- Očekávaný výsledek: „Allow new users to sign up" je **vypnuté**.

---

## Co zkusit rozbít navíc

- V okně ownera změň v adrese `test-partner` na jiný slug (např. `neexistuje`): musí být 404, ne chyba serveru.
- Zadej do formulářů znaky `<script>alert(1)</script>` a velmi dlouhý text: nesmí se spustit skript, pole mají hlášku o délce.
- Rychle dvakrát po sobě klikni „Vytvořit organizaci" se stejným slugem: vznikne jen jedna organizace.
- Otevři odkaz pozvánky ve dvou záložkách a odešli obě současně: účet vznikne jen jednou, druhá záložka ukáže chybu.
- Přihlas se jako staff a v adrese zkus `/admin/platform`: 403.

## Známá omezení fáze 0

- Dashboard organizace, skener a storefront jsou jen placeholdery (platby, vstupenky a skener přijdou v dalších fázích).
- Platform admin není automaticky členem organizací. Do skeneru se dostane až s členstvím; organizace vidí a spravuje přes `/admin/platform`.
- Na Vercelu sdílí Preview stejnou databázi a Supabase jako produkce (viz `docs/DECISIONS.md`). Testovací organizace a účty se samy nemažou, smaž je ručně po testu.
- Seed organizace 3Lwave má placeholder adresu, uprav ji v adminu.
- E2E test (`pnpm e2e`) běží jen lokálně s `EMAIL_DRIVER=outbox`, v CI neběží.
- Změna role nebo odebrání člena se projeví hned na serveru, ale už otevřená stránka v okně dotčeného uživatele se aktualizuje až po obnovení.
- Přihlášení zákazníků (účty `customers`) není ve fázi 0, jen schéma.
- Audit log se zapisuje do databáze, ale zatím k němu není žádné rozhraní (prohlížej v Supabase, tabulka `audit_log`).
- Texty e-mailů a UI jsou jen česky.
