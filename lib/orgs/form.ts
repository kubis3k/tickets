import { formatBpsInput, formatHalereInput } from "@/lib/money/format";
import type { Organization } from "./organizations";

export type OrgFormValues = {
  slug: string;
  name: string;
  legalName: string;
  ico: string;
  dic: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  vatPayer: boolean;
  invoicePrefix: string;
  feePercent: string;
  feeFixedCzk: string;
  payoutDelayDays: string;
  logoUrl: string;
  primaryColor: string;
  metaPixelId: string;
};

export const EMPTY_ORG_FORM: OrgFormValues = {
  slug: "",
  name: "",
  legalName: "",
  ico: "",
  dic: "",
  street: "",
  city: "",
  zip: "",
  country: "CZ",
  vatPayer: false,
  invoicePrefix: "",
  feePercent: "5",
  feeFixedCzk: "0,00",
  payoutDelayDays: "2",
  logoUrl: "",
  primaryColor: "",
  metaPixelId: "",
};

/** Řádek organizace → výchozí hodnoty formuláře (bps → %, haléře → Kč jako text). */
export function orgToFormValues(org: Organization): OrgFormValues {
  return {
    slug: org.slug,
    name: org.name,
    legalName: org.legalName ?? "",
    ico: org.ico ?? "",
    dic: org.dic ?? "",
    street: org.street ?? "",
    city: org.city ?? "",
    zip: org.zip ?? "",
    country: org.country,
    vatPayer: org.vatPayer,
    invoicePrefix: org.invoicePrefix ?? "",
    feePercent: formatBpsInput(org.feeBps),
    feeFixedCzk: formatHalereInput(org.feeFixed),
    payoutDelayDays: String(org.payoutDelayDays),
    logoUrl: org.logoUrl ?? "",
    primaryColor: org.primaryColor ?? "",
    metaPixelId: org.metaPixelId ?? "",
  };
}
