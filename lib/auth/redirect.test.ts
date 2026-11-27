import { describe, expect, it } from "vitest";
import { loginUrl, safeNext } from "./redirect";

describe("safeNext", () => {
  it.each([
    "//evil.com",
    "https://evil.com",
    "http://evil.com/admin",
    "/\\evil.com",
    "/\\\\evil.com",
    "javascript:alert(1)",
    "admin",
    "/%0d%0a" + "\r\nx",
    "/ad\tmin",
    "",
  ])("odmítne %j", (value) => {
    expect(safeNext(value)).toBe("/admin");
  });

  it("odmítne null, undefined a příliš dlouhou hodnotu", () => {
    expect(safeNext(null)).toBe("/admin");
    expect(safeNext(undefined)).toBe("/admin");
    expect(safeNext("/" + "a".repeat(3000))).toBe("/admin");
  });

  it("propustí relativní cestu včetně query", () => {
    expect(safeNext("/admin/x?y=1")).toBe("/admin/x?y=1");
    expect(safeNext("/scan")).toBe("/scan");
  });

  it("respektuje vlastní fallback", () => {
    expect(safeNext("//evil.com", "/")).toBe("/");
  });
});

describe("loginUrl", () => {
  it("přidá zakódovaný next", () => {
    expect(loginUrl("/admin/a?b=1")).toBe("/login?next=%2Fadmin%2Fa%3Fb%3D1");
  });
  it("bez platného next vrátí holý /login", () => {
    expect(loginUrl("//evil.com")).toBe("/login");
    expect(loginUrl(null)).toBe("/login");
  });
});
