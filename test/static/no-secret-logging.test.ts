import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const DIRS = ["lib/email", "lib/invitations", "lib/audit", "app/invite"];
/** Co by se v logu objevit nesmělo (po odstranění řetězcových literálů). */
const SENSITIVE = /\b(token|link|url|to|email|html|text|msg|message|password|hash|invite\w*)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = DIRS.map((d) => join(root, d))
  .filter(existsSync)
  .flatMap((d) => walk(d));

describe("e-mail a pozvánky nelogují tajné ani osobní údaje", () => {
  it("prohledává soubory", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("žádné console.log/debug/trace a console.info/warn/error jen s nesensitivními argumenty", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const m = /console\.(\w+)\s*\((.*)/.exec(line);
        if (!m) return;
        const where = `${relative(root, file).split("\\").join("/")}:${i + 1}`;
        if (!["info", "warn", "error"].includes(m[1] as string)) offenders.push(where);
        const args = (m[2] ?? "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
        if (SENSITIVE.test(args)) offenders.push(where);
      });
    }
    expect(offenders).toEqual([]);
  });
});
