export type Brand = {
  readonly name: string;
  readonly domain: string;
  readonly logoPath: string;
  readonly colors: {
    readonly primary: string;
    readonly primaryForeground: string;
    readonly accent: string;
  };
};

/** Jediné místo, kde smí být název produktu a doména. Název ještě není finální. */
export const brand: Brand = {
  name: "GlobaalTicket",
  domain: "tickets.3lwave.cz",
  logoPath: "/logo.svg",
  colors: {
    primary: "#111111",
    primaryForeground: "#fafafa",
    accent: "#f5f5f5",
  },
};
