import { describe, expect, it } from "vitest";
import { isInviteNext, loginUrl, safeNext } from "./redirect";

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

describe("isInviteNext", () => {
  it("propustí přijetí pozvánky", () => {
    expect(isInviteNext("/invite/abc")).toBe(true);
    expect(isInviteNext("/invite/abc?x=1")).toBe(true);
  });

  it.each([
    "/invite/../admin",
    "/invite/%2e%2e/admin",
    "/invite/%2E%2E/admin/platform",
    "/invite/./../admin",
    "/admin",
    "/invite",
    "//evil.com/invite/x",
    "https://evil.com/invite/x",
    "/\\invite/x",
    "",
    null,
    undefined,
  ])("odmítne %j", (value) => {
    expect(isInviteNext(value)).toBe(false);
  });
});
