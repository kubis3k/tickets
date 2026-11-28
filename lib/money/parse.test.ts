import { describe, expect, it } from "vitest";
import { MAX_INT4, parseCzkToHalere, parsePercentToBps } from "./parse";

describe("parseCzkToHalere", () => {
  it.each([
    ["12,5", 1250],
    ["12.50", 1250],
    ["0,01", 1],
    ["0", 0],
    ["599", 59900],
    ["1 234,56", 123456],
    ["1 234,56", 123456],
    ["1 234 567", 123456700],
    ["  7,05 ", 705],
    ["19,99", 1999],
    ["0,10", 10],
  ])("%s → %i", (input, expected) => {
    expect(parseCzkToHalere(input)).toBe(expected);
  });

  it.each(["-1", "-0,50", "1,234", "12.345", "", " ", "abc", "1,", ",5", "12 Kč", "1 23", "1,2,3", "1e3"])(
    "odmítne %j",
    (input) => {
      expect(parseCzkToHalere(input)).toBeNull();
    },
  );

  it("odmítne přetečení integer", () => {
    expect(parseCzkToHalere("21474836,47")).toBe(MAX_INT4);
    expect(parseCzkToHalere("21474836,48")).toBeNull();
    expect(parseCzkToHalere("99999999999999")).toBeNull();
  });
});

describe("parsePercentToBps", () => {
  it.each([
    ["5", 500],
    ["5,5", 550],
    ["12.25", 1225],
    ["0", 0],
    ["100", 10000],
    ["0,01", 1],
  ])("%s → %i", (input, expected) => {
    expect(parsePercentToBps(input)).toBe(expected);
  });

  it.each(["100,01", "101", "-1", "5,555", "", "x"])("odmítne %j", (input) => {
    expect(parsePercentToBps(input)).toBeNull();
  });
});
