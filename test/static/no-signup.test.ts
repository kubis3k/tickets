import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", "coverage"]);
const SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY";
const SERVICE_KEY_ALLOWED = new Set([
  "lib/config/env.ts",
  "lib/config/env.test.ts",
  "lib/auth/supabase-admin.ts",
  "test/static/no-signup.test.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(root, f).split("\\").join("/");
const isTest = (f: string) => /\.test\.tsx?$/.test(f);

const allFiles = ["app", "lib", "components", "scripts", "test", "e2e"]
  .map((d) => join(root, d))
  .filter(existsSync)
  .flatMap((d) => walk(d));
const rootFiles = ["proxy.ts", "middleware.ts", "instrumentation.ts", "drizzle.config.ts"]
  .map((f) => join(root, f))
  .filter(existsSync);
const sourceFiles = [...allFiles, ...rootFiles];
const appLib = allFiles.filter((f) => /^(app|lib)\//.test(rel(f)) && !isTest(f));

/** Text volání od `name(` po odpovídající `)`. */
function callBodies(text: string, name: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(`${name}(`, from);
    if (idx < 0) return out;
    let depth = 0;
    let i = idx + name.length;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    out.push(text.slice(idx, i + 1));
    from = idx + name.length;
  }
}

describe("žádná veřejná registrace", () => {
  it("prohledává zdrojové soubory", () => {
    expect(appLib.length).toBeGreaterThan(5);
  });

  it("v app/ a lib/ není auth.signUp ani .signUp(", () => {
    const hits = appLib.filter((f) => /auth\.signUp|\.signUp\s*\(/.test(readFileSync(f, "utf8")));
    expect(hits.map(rel)).toEqual([]);
  });

  it("každé signInWithOtp má shouldCreateUser: false", () => {
    const calls = appLib.flatMap((f) =>
      callBodies(readFileSync(f, "utf8"), "signInWithOtp").map((body) => ({ f: rel(f), body })),
    );
    expect(calls.length).toBeGreaterThan(0);
    const bad = calls.filter((c) => !/shouldCreateUser:\s*false/.test(c.body));
    expect(bad.map((c) => c.f)).toEqual([]);
  });
});

describe("service role klíč", () => {
  it("je referencován jen v env.ts a supabase-admin.ts (a testech env)", () => {
    const hits = sourceFiles
      .filter((f) => readFileSync(f, "utf8").includes(SERVICE_KEY))
      .map(rel)
      .filter((f) => !SERVICE_KEY_ALLOWED.has(f));
    expect(hits).toEqual([]);
  });

  it("supabase-admin.ts je server-only a nepersistuje session", () => {
    const text = readFileSync(join(root, "lib/auth/supabase-admin.ts"), "utf8");
    expect(text).toContain('import "server-only"');
    expect(text).toMatch(/persistSession:\s*false/);
    expect(text).toMatch(/autoRefreshToken:\s*false/);
  });
});
