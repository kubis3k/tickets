export type InviteFormState = {
  readonly error?: string;
  /** Odkaz na přihlášení (když pro e-mail už existuje účet). */
  readonly loginHref?: string;
};
