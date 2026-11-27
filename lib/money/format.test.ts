import { describe, expect, it } from "vitest";
import { formatBps, formatBpsInput, formatHalere, formatHalereInput } from "./format";
import { parseCzkToHalere, parsePercentToBps } from "./parse";

const N = " ";

describe("formatHalere", () => {
  it.each([
    [59900, `599,00${N}Kč`],
    [0, `0,00${N}Kč`],
    [1, `0,01${N}Kč`],
    [123456, `1${N}234,56${N}Kč`],
    [-250, `-2,50${N}Kč`],
  ])("%i → %s", (input, expected) => {
    expect(formatHalere(input)).toBe(expected);
  });

  it("odmítne ne-integer", () => {
    expect(() => formatHalere(1.5)).toThrow(RangeError);
    expect(() => formatHalere(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatBps", () => {
  it.each([
    [500, `5${N}%`],
    [550, `5,5${N}%`],
    [525, `5,25${N}%`],
    [0, `0${N}%`],
    [10000, `100${N}%`],
    [1, `0,01${N}%`],
  ])("%i → %s", (input, expected) => {
    expect(formatBps(input)).toBe(expected);
  });
});

describe("hodnoty pro input jsou zpětně parsovatelné", () => {
  it("halere round-trip", () => {
    for (const h of [0, 1, 10, 99, 100, 1250, 123456, 2_147_483_647]) {
      expect(parseCzkToHalere(formatHalereInput(h))).toBe(h);
    }
  });
  it("bps round-trip", () => {
    for (const b of [0, 1, 10, 500, 525, 550, 9999, 10000]) {
      expect(parsePercentToBps(formatBpsInput(b))).toBe(b);
    }
  });
});
