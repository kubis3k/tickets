import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const allowed = join("lib", "config", "brand.ts");
// Tento test sám obsahuje zakázané řetězce jako literály, proto se vynechá.
const self = join("test", "static", "brand.test.ts");
const forbidden = ["GlobaalTicket", "tickets.3lwave.cz"];
// Kořenové konfigurační soubory také nesmí nést název ani doménu.
const rootFiles = [
  "proxy.ts",
  "instrumentation.ts",
  "next.config.ts",
  "playwright.config.ts",
  "drizzle.config.ts",
];
const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".md", ".json"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([...exts].some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

describe("branding jen z lib/config/brand.ts", () => {
  const files = ["app", "lib", "components", "e2e", "test", "scripts"]
    .filter((d) => existsSync(join(root, d)))
    .flatMap((d) => walk(join(root, d)))
    .concat(rootFiles.map((f) => join(root, f)).filter((f) => existsSync(f)))
    .filter((f) => relative(root, f) !== self);

  it("najde zdrojové soubory", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(forbidden)("řetězec %s je jen v brand.ts", (needle) => {
    const offenders = files
      .filter((f) => relative(root, f) !== allowed)
      .filter((f) => readFileSync(f, "utf8").includes(needle))
      .map((f) => relative(root, f).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });
});
