import { describe, expect, it } from "vitest";
import { cs } from "@/lib/i18n/cs";
import {
  orgFieldErrors,
  orgFormSchema,
  orgInputSchema,
  orgUpdateFormSchema,
  orgUpdateSchema,
  RESERVED_SLUGS,
  slugSchema,
} from "./org";

const base = {
  slug: "moje-org",
  name: "Moje org",
  vatPayer: false,
  feeBps: 500,
  feeFixed: 0,
  payoutDelayDays: 2,
};

describe("slug", () => {
  it.each(["abc", "a1-b2", "moje-org", "a".repeat(50)])("přijme %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });
  it.each(["ab", "-abc", "abc-", "ABC", "a b c", "a_b", "á-bc", "a".repeat(51), ""])(
    "odmítne %j",
    (s) => {
      expect(slugSchema.safeParse(s).success).toBe(false);
    },
  );
  it.each(RESERVED_SLUGS)("rezervovaný %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false);
  });
});

describe("orgInputSchema", () => {
  it("minimální vstup projde, prázdná pole → null, země CZ", () => {
    const r = orgInputSchema.parse({ ...base, ico: "", dic: "  ", logoUrl: "" });
    expect(r.ico).toBeNull();
    expect(r.dic).toBeNull();
    expect(r.logoUrl).toBeNull();
    expect(r.country).toBe("CZ");
  });

  it("fee_bps hranice 0–10000, jen integer", () => {
    const ok = (feeBps: number) => orgInputSchema.safeParse({ ...base, feeBps }).success;
    expect(ok(0)).toBe(true);
    expect(ok(10000)).toBe(true);
    expect(ok(-1)).toBe(false);
    expect(ok(10001)).toBe(false);
    expect(ok(5.5)).toBe(false);
  });

  it("fee_fixed je nezáporný integer", () => {
    const ok = (feeFixed: number) => orgInputSchema.safeParse({ ...base, feeFixed }).success;
    expect(ok(0)).toBe(true);
    expect(ok(250)).toBe(true);
    expect(ok(-1)).toBe(false);
    expect(ok(2.5)).toBe(false);
    expect(ok(100_000)).toBe(true);
    expect(ok(100_001)).toBe(false);
    expect(ok(2_147_483_648)).toBe(false);
  });

  it("fee_fixed nad stropem vrací hlášku o stropu", () => {
    const r = orgInputSchema.safeParse({ ...base, feeFixed: 100_001 });
    expect(r.success).toBe(false);
    if (!r.success) expect(orgFieldErrors(r.error).feeFixedCzk).toBe(cs.platform.validation.feeFixedMax);
  });

  it("plátce DPH vyžaduje DIČ (create i update)", () => {
    for (const schema of [orgInputSchema, orgUpdateSchema]) {
      const bad = schema.safeParse({ ...base, vatPayer: true });
      expect(bad.success).toBe(false);
      if (!bad.success) expect(bad.error.issues.map((i) => i.path.join("."))).toEqual(["dic"]);
      expect(schema.safeParse({ ...base, vatPayer: true, dic: "CZ12345678" }).success).toBe(true);
      expect(schema.safeParse({ ...base, vatPayer: false }).success).toBe(true);
    }
  });

  it("IČO přesně 8 číslic, DIČ CZ + 8–10 číslic", () => {
    const ok = (extra: object) => orgInputSchema.safeParse({ ...base, ...extra }).success;
    expect(ok({ ico: "12345678" })).toBe(true);
    expect(ok({ ico: "1234567" })).toBe(false);
    expect(ok({ ico: "123456789" })).toBe(false);
    expect(ok({ ico: "1234567a" })).toBe(false);
    expect(ok({ dic: "CZ12345678" })).toBe(true);
    expect(ok({ dic: "CZ1234567890" })).toBe(true);
    expect(ok({ dic: "CZ12345678901" })).toBe(false);
    expect(ok({ dic: "12345678" })).toBe(false);
  });

  it("prefix řady: uppercase A-Z0-9, 1–10", () => {
    expect(orgInputSchema.parse({ ...base, invoicePrefix: "ab1" }).invoicePrefix).toBe("AB1");
    expect(orgInputSchema.safeParse({ ...base, invoicePrefix: "A".repeat(11) }).success).toBe(false);
    expect(orgInputSchema.safeParse({ ...base, invoicePrefix: "A-1" }).success).toBe(false);
  });

  it("branding: jen https a #RRGGBB", () => {
    const ok = (extra: object) => orgInputSchema.safeParse({ ...base, ...extra }).success;
    expect(ok({ logoUrl: "https://x.cz/l.png" })).toBe(true);
    expect(ok({ logoUrl: "http://x.cz/l.png" })).toBe(false);
    expect(ok({ logoUrl: "javascript:alert(1)" })).toBe(false);
    expect(ok({ primaryColor: "#aBc123" })).toBe(true);
    expect(ok({ primaryColor: "#abc" })).toBe(false);
  });
});

describe("orgFormSchema (formulář: %, Kč)", () => {
  const form = {
    slug: "moje-org",
    name: "Moje org",
    feePercent: "5,5",
    feeFixedCzk: "2,50",
    payoutDelayDays: "2",
    vatPayer: "on",
    dic: "CZ12345678",
  };

  it("převede % na bps a Kč na haléře", () => {
    const r = orgFormSchema.parse(form);
    expect(r).toMatchObject({ feeBps: 550, feeFixed: 250, payoutDelayDays: 2, vatPayer: true });
  });

  it("prázdný fixní poplatek = 0, nezaškrtnuté DPH = false", () => {
    const r = orgFormSchema.parse({ ...form, feeFixedCzk: "", vatPayer: undefined });
    expect(r).toMatchObject({ feeFixed: 0, vatPayer: false });
  });

  it("plátce DPH bez DIČ vrací chybu pod polem dic", () => {
    const r = orgUpdateFormSchema.safeParse({ ...form, dic: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(orgFieldErrors(r.error))).toEqual(["dic"]);
  });

  it("neplatné hodnoty vrací chyby pod názvy polí formuláře", () => {
    const r = orgFormSchema.safeParse({ ...form, feePercent: "101", feeFixedCzk: "1,234", slug: "api" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(orgFieldErrors(r.error)).sort()).toEqual([
        "feeFixedCzk",
        "feePercent",
        "slug",
      ]);
    }
  });

  it("update schéma slug ignoruje (nelze měnit)", () => {
    const r = orgUpdateFormSchema.parse({ ...form, slug: "jiny" });
    expect("slug" in (r as object)).toBe(false);
  });
});
