# lib/email

- `send.ts` — `sendEmail({ to, subject, react })`; renderuje React Email a posílá přes driver.
- `drivers/resend.ts` — produkce (`RESEND_API_KEY`, `EMAIL_FROM`).
- `drivers/outbox.ts` — `EMAIL_DRIVER=outbox`: JSON soubory do `.e2e-outbox/` (e2e, lokálně; v produkci zakázáno).
- Nikdy nelogovat příjemce, odkaz ani token.
