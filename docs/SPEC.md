# GlobaalTicket v2 — specifikace

> Pracovní název. Finální značka se vybere před spuštěním. Název, logo a doména se nastavují v jednom configu, nikde nejsou natvrdo v kódu.
> Doména: `tickets.3lwave.cz`

## 1. Rozsah

- Ticketing pro akce 3Lwave/Northevents a **partnerů na pozvánku** (BlackoutShows apod.).
- Žádná veřejná registrace. Organizace a účty zakládá jen platform admin (GEP).
- Kapacita: akce **5 000+ lidí**, včetně špiček při spuštění prodeje.
- Začínáme s čistou databází, ze starého GateUP se nic nemigruje.

### v1 (MVP)
1. Akce, kategorie vstupenek, cenové vlny, promo kódy
2. Checkout přes Stripe Connect, rezervace kapacity s TTL
3. E-mail s QR vstupenkami (PDF + Apple/Google Wallet později)
4. Automatický daňový doklad ke každé objednávce
5. Check-in přes PWA scanner s offline režimem
6. Marketing: Meta Pixel + CAPI (deduplikace), UTM atribuce, e-maily k opuštěnému košíku
7. Admin: organizace, uživatelé, role, přehled prodejů, export

8. **Zákaznický účet volitelně**: nákup bez registrace (stačí e-mail), účet je nabídnutý po nákupu nebo dostupný přes „Moje vstupenky". Přihlášení magic linkem. Objednávky se k účtu připojí podle ověřeného e-mailu, i ty starší.
9. **Nastavení per akce** (každé zvlášť zapnout/vypnout):
   - jméno na každé vstupence (povinné při nákupu)
   - potvrzení 18+ v košíku (checkbox, uloží se k objednávce)
   - převod vstupenky na jinou osobu (zákazník zadá jméno a e-mail nového držitele, starý QR se zneplatní a nový přijde e-mailem; uzávěrka převodů X hodin před akcí)
10. Jazyk: jen čeština, ale texty v `lib/i18n` kvůli pozdější EN

### Mimo v1
Box office (prodej na místě), virtuální fronta, sedadla/mapa sálu, refund self-service, Wallet passy, napojení na BilanxFlow.

---

## 2. Stack

| Vrstva | Volba | Proč |
|---|---|---|
| App | Next.js (App Router) + TypeScript | Jeden repozitář pro storefront, admin i scanner |
| DB | Postgres (Supabase) | Transakce a row-level locking pro hlídání kapacity |
| ORM | Drizzle | Typově bezpečné, čisté migrace, raw SQL tam, kde je potřeba |
| Auth | Supabase Auth (magic link + heslo) | Jen pozvaní uživatelé |
| Platby | Stripe Connect (**Express accounts, direct charges**) | Peníze jdou rovnou partnerovi |
| E-mail | **Resend** | Gmail má denní limity odesílání. Na 5 000 vstupenek za den nestačí |
| PDF | `@react-pdf/renderer` | Vstupenky + doklady |
| Hosting | Vercel | |
| Storage | Supabase Storage | PDF dokladů a vstupenek |
| Jobs | Vercel Cron + tabulka `jobs` (nebo Inngest) | Expirace rezervací, opuštěné košíky, CAPI retry |

---

## 3. Peníze — Stripe Connect

- Každá organizace (i 3Lwave/GEP sám) = **connected account** (Express). Onboarding přes Stripe Account Link z adminu.
- **Direct charges** na účet partnera. Obchodníkem (merchant of record) je partner, poplatky Stripe jdou za ním.
- Platformní poplatek = `application_fee_amount` a strhává se automaticky. Výchozí je **% z ceny vstupenky po slevě** (vzor: Eventlook 5 %). Nastavuje se per organizace, lze přepsat per akce.
- Zákazník platí jen cenu vstupenky, poplatek nese pořadatel.
- **Výplata až po akci:** connected accounts mají `payouts.schedule.interval = manual`. Peníze leží na Stripe účtu partnera (ne na účtu GEP). Platforma spustí payout automaticky X dní po konci akce (výchozí 2 pracovní dny). Pokud se akce zruší, refundy jdou z nevyplaceného zůstatku.
- Refund: admin/pořadatel z adminu, `refund_application_fee` konfigurovatelné.
- Webhooky: `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `payout.paid`, `payout.failed`. Musí být idempotentní (tabulka `stripe_events`).

**Vyúčtování akce (vzor Eventlook):** Po skončení akce GEP vystaví pořadateli **jednu fakturu za provizi (21 % DPH) za celou akci**, s poznámkou „uhrazeno ze vstupného" (provize je stržená přes `application_fee`, nic se nedoplácí). Faktura má dvě části:
1. **Provize**: řádky po kombinaci kategorie × vlna × promo kód (počet ks, provize za ks, základ, DPH, celkem).
2. **Přehled** (informativní): tržba ze vstupného po stejných řádcích, sazba 12 %, součty, provize, zaokrouhlení a **částka k vyplacení**.

Číslo faktury, DUZP = den vystavení, období = od první do poslední objednávky. Faktura se generuje automaticky a pořadatel ji najde v adminu. Pořadatel vidí stejné vyúčtování průběžně, ještě před koncem akce.

---

## 4. Daňové doklady

- Doklad vystavuje **organizace, která akci pořádá**, ne GEP.
- Organizace má v profilu: název, IČO, DIČ, adresu, `vat_payer: boolean` a číselnou řadu.
- Plátce DPH: zjednodušený nebo plný daňový doklad (plný, pokud zákazník vyplní IČO/DIČ). Neplátce: příjmový doklad bez DPH.
- Sazba DPH **per kategorie vstupenky** (default 12 %, vstupné na kulturní akce). Sazbu si každá organizace ověří sama, systém ji jen přebírá.
- Číslování: sekvence per organizace per rok, bez děr (generuje se v DB transakci).
- Dobropis při refundu.
- PDF se ukládá do storage a posílá se v e-mailu s vstupenkami.

---

## 5. Datový model (hlavní tabulky)

```
organizations        id, slug, name, legal_name, ico, dic, address, vat_payer,
                     stripe_account_id, stripe_charges_enabled, fee_percent, fee_fixed,
                     branding (logo, colors), invoice_series_prefix
users                id, email, name                       (admin/staff/door účty)
customers            id, auth_user_id (nullable), email, name, phone, marketing_consent,
                     created_at                            (zákazníci, i bez účtu)
ticket_transfers     id, ticket_id, from_customer_id, to_email, to_name, old_code,
                     new_code, created_at
memberships          user_id, organization_id, role (owner | staff | door)
platform_admins      user_id
venues               id, organization_id, name, address, capacity
events               id, organization_id, venue_id, slug, name, starts_at, ends_at,
                     doors_at, status (draft|published|sold_out|ended|cancelled),
                     total_capacity, cover_image, description, fee_override,
                     require_holder_names, require_age_18, allow_transfers,
                     transfer_cutoff_hours
ticket_types         id, event_id, name, description, vat_rate, total_capacity,
                     max_per_order, sort
price_waves          id, ticket_type_id, price, starts_at, ends_at, capacity (nullable),
                     sold_count
promo_codes          id, event_id, code, type (percent|fixed), value, max_uses,
                     used_count, valid_from, valid_to, ticket_type_ids[]
inventory            ticket_type_id PK, capacity, sold, reserved   ← jediný zdroj pravdy
reservations         id, event_id, session_id, items jsonb, expires_at, status
orders               id, organization_id, event_id, customer_id, email, name, company_ico/dic,
                     age_confirmed_at,
                     subtotal, discount, total, currency, status, stripe_session_id,
                     stripe_payment_intent, application_fee, utm jsonb, fbp, fbc,
                     client_ip, user_agent, created_at, paid_at
order_items          id, order_id, ticket_type_id, price_wave_id, unit_price, qty, vat_rate
tickets              id, order_id, ticket_type_id, holder_name, code (krátký), 
                     status (valid|checked_in|void), checked_in_at, checked_in_by, device_id
invoices             id, organization_id, order_id, number, type (invoice|credit_note),
                     pdf_path, issued_at, totals jsonb
checkins             id, ticket_id, device_id, scanned_at, result (ok|duplicate|invalid|void),
                     synced_at
abandoned_checkouts  id, reservation_id, email, recovered_order_id, emails_sent, last_sent_at
settlements          id, event_id, organization_id, gross, fee_base, fee_vat, payout_amount,
                     rounding, commission_invoice_id, stripe_payout_id, status
                     (open|closed|paid_out), payout_due_at
stripe_events        id (Stripe event id), type, processed_at
audit_log            actor, action, entity, entity_id, diff, at
```

---

## 6. Kapacita a souběh (kritické)

- Rezervace kapacity **atomicky v jedné SQL operaci**:
  ```sql
  UPDATE inventory SET reserved = reserved + $n
  WHERE ticket_type_id = $id AND sold + reserved + $n <= capacity
  RETURNING *;
  ```
  0 řádků = vyprodáno. Žádné „přečti, spočítej, zapiš" v aplikaci.
- Rezervace platí **10 minut** (Stripe Checkout `expires_at` ≥ 30 min, takže při expiraci rezervace se session ruší přes `checkout.sessions.expire`).
- Cron každou minutu uvolní expirované rezervace.
- Po zaplacení: `reserved -= n, sold += n` ve stejné transakci, ve které vzniknou order a tickets.
- Pokud platba dorazí po expiraci a kapacita už není: automatický refund a e-mail.
- Cenová vlna se přepíná podle data **nebo** podle vyprodání kapacity vlny, podle toho, co nastane dřív.
- Zátěžový test (k6): 5 000 souběžných pokusů o nákup na 1 000 vstupenek. Prodá se přesně 1 000, ani o jednu víc.

---

## 7. QR a check-in

- QR obsahuje **podepsaný token** `ticketId.eventId.sig` (Ed25519). Scanner ověří podpis offline pomocí veřejného klíče akce.
- Scanner = PWA na `/scan`, login rolí `door`, výběr akce.
- Před akcí si stáhne seznam ID vstupenek a jejich stav do IndexedDB.
- Online: každý sken jde na server (server je zdroj pravdy kvůli duplicitám mezi zařízeními).
- Offline: ověří se podpis a lokální stav, sken se zařadí do fronty a po obnovení spojení se synchronizuje. Konflikty (dvě zařízení naskenují stejný lístek) se zobrazí v adminu.
- UI: celoobrazovkově zelená / červená / oranžová (duplicita, ukáže čas a zařízení prvního skenu), vibrace a zvuk.
- Ruční vyhledání podle jména nebo e-mailu.
- Live počítadlo odbavených / prodaných.

---

## 8. Marketing tracking

- **UTM + fbclid/gclid** se uloží při prvním vstupu (cookie na 30 dní, model first-touch + last-touch) a přenesou se na objednávku.
- **Meta Pixel** na frontendu: `ViewContent`, `InitiateCheckout`, `Purchase`.
- **Meta CAPI** ze serveru se stejným `event_id` kvůli deduplikaci. Posílá hashovaný e-mail, `fbp`, `fbc`, IP a UA. Pixel ID a CAPI token se nastavují **per organizace**.
- Consent banner (cookies). Bez souhlasu se Pixel nenačte, CAPI jen v rámci oprávněného zájmu dle nastavení (ověří se právně).
- **Opuštěný košík:** když zákazník zadá e-mail a nezaplatí do 1 h, odejde e-mail s odkazem na obnovení. Druhý e-mail po 24 h, jen pokud je akce dostupná a zákazník dal marketingový souhlas.
- Admin report: prodeje podle `utm_source/campaign`, konverzní funnel.

---

## 9. Role a oprávnění

| Role | Smí |
|---|---|
| platform_admin | Vše, zakládá organizace a uživatele, nastavuje poplatky |
| owner | Akce, ceny, promo, reporty, refundy, uživatelé své organizace, Stripe onboarding |
| staff | Akce, reporty, bez refundů a nastavení |
| door | Jen scanner pro přiřazené akce |

Vynucuje se na serveru (a navíc Supabase RLS jako pojistka).

---

## 10. Storefront

- `/` výpis akcí, `/{org-slug}/{event-slug}` stránka akce, `/checkout`, `/order/{id}` (stažení vstupenek a dokladu).
- Mobile-first, rychlé (SSG/ISR pro stránky akcí, dynamická je jen dostupnost).
- OG obrázky pro sdílení.
- Branding organizace (logo, barva) na stránce akce.

---

## 11. Fáze

| # | Fáze | Hotovo když |
|---|---|---|
| 0 | Scaffold, DB, auth, role, admin organizací a uživatelů | Admin založí partnera a pozve ownera |
| 1 | Stripe Connect onboarding + akce, kategorie, vlny, promo | Owner napojí Stripe a vytvoří akci |
| 2 | Storefront + rezervace + checkout + webhooky | Testovací nákup projde, kapacita sedí pod zátěží |
| 3 | Vstupenky (QR, PDF, e-mail) + daňové doklady | Zákazník dostane e-mail s lístky a dokladem |
| 4 | Scanner PWA (online + offline) | Odbavení 500 lístků offline a sync bez chyb |
| 5 | Tracking (Pixel, CAPI, UTM, opuštěný košík) | Eventy v Meta Events Manager s deduplikací |
| 6 | Reporty, exporty, vyúčtování akce + faktura za provizi, automatický payout po akci, audit log | Vyúčtování sedí na haléř s objednávkami |
| 7 | Hardening: zátěžový test, rate limiting, monitoring (Sentry), zálohy | k6 test projde |

---

## 12. Workflow vývoje

- Každá fáze = vlastní branch a **Pull Request**. Nic se nepushuje přímo do `main`.
- CI (lint, typecheck, testy) musí být zelené.
- **Review agent** projde každý PR podle checklistu: oprávnění v každé server action, validace vstupů, práce s penězi (haléře, zaokrouhlení), souběh u kapacity, žádné tajné klíče v kódu.
- Majitel (Luigi) proklikne Vercel preview podle testovacího scénáře, který agent přiloží k PR, a teprve pak merge.
- Stripe běží v test mode až do konce Fáze 7.
- Starý GateUP se vypne. Nová DB, nový Supabase projekt (region EU), nic se nesdílí.

## 13. Otevřené otázky

- [ ] Finální název a doména
- [ ] Výše platformního poplatku
- [ ] Právní kontrola: obchodní podmínky, GDPR, cookie consent pro CAPI
- [ ] Refund policy (kdo rozhoduje, lhůty)
