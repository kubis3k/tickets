export const cs = {
  common: {
    appDescription: "Prodej vstupenek, check-in a vyúčtování pro pořadatele.",
  },
  storefront: {
    tagline: "Prodej vstupenek připravujeme.",
  },
  admin: {
    title: "Administrace",
    placeholder: "Administrace bude doplněna v dalších krocích fáze 0.",
    noOrganizationTitle: "Nemáte přístup k žádné organizaci",
    noOrganizationText:
      "Váš účet zatím není členem žádné organizace. Požádejte správce o pozvánku.",
  },
  auth: {
    loginTitle: "Přihlášení",
    email: "E-mail",
    password: "Heslo",
    signIn: "Přihlásit se",
    signOut: "Odhlásit se",
    magicLinkHint: "Nebo si nechte poslat přihlašovací odkaz e-mailem.",
    sendMagicLink: "Poslat přihlašovací odkaz",
    magicLinkSent: "Pokud je e-mail registrovaný, poslali jsme na něj přihlašovací odkaz.",
    invalidCredentials: "Neplatné přihlašovací údaje",
    invalidEmail: "Zadejte platný e-mail",
    callbackError: "Přihlášení se nezdařilo. Zkuste to prosím znovu.",
    forbiddenTitle: "Přístup odepřen",
    forbiddenText: "K této části nemáte oprávnění.",
    backToAdmin: "Zpět do administrace",
  },
  scanner: {
    title: "Skener vstupenek",
    placeholder: "Skener bude doplněn v pozdější fázi.",
  },
} as const;
