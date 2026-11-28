import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Kontrakt env: každá proměnná ze Zod schémat musí být v .env.example i v README.
 * (Čtou se jen názvy proměnných.) Validace při startu = instrumentation.ts volá obě getEnv.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), "utf8");

const schemaKeys = (src: string): string[] =>
  [...src.matchAll(/^\s{2,4}([A-Z][A-Z0-9_]+):\s*z\./gm)].map((m) => m[1] as string);

// Dodává Vercel sám, nenastavuje se ručně.
const PLATFORM_PROVIDED = new Set(["VERCEL_ENV"]);

describe("env kontrakt", () => {
  const server = schemaKeys(read("lib/config/env.ts"));
  const client = schemaKeys(read("lib/config/env.client.ts"));
  const all = [...server, ...client].filter((k) => !PLATFORM_PROVIDED.has(k));

  it("najde proměnné ve schématech", () => {
    expect(server).toContain("DATABASE_URL");
    expect(client).toContain("NEXT_PUBLIC_APP_URL");
  });

  it(".env.example existuje a obsahuje všechny proměnné ze schémat", () => {
    expect(existsSync(join(root, ".env.example"))).toBe(true);
    const names = new Set(
      [...read(".env.example").matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]),
    );
    expect(all.filter((k) => !names.has(k))).toEqual([]);
  });

  it(".env.example neobsahuje skutečně vypadající tajemství", () => {
    const text = read(".env.example");
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // JWT
    expect(text).not.toMatch(/re_[A-Za-z0-9]{20,}/); // Resend klíč
    expect(text).not.toMatch(/postgres(ql)?:\/\/[^:\s]+:(?!\s|<|\[|password|xxx|\*)[^@\s]{8,}@/i);
  });

  it("README dokumentuje všechny proměnné", () => {
    const readme = read("README.md");
    expect(all.filter((k) => !readme.includes(`\`${k}\``))).toEqual([]);
  });

  it("start aplikace validuje oba env (instrumentation.ts)", () => {
    const src = read("instrumentation.ts");
    expect(src).toMatch(/getServerEnv\(\)/);
    expect(src).toMatch(/getClientEnv\(\)/);
  });

  it(".env* soubory s hodnotami jsou v .gitignore", () => {
    const ignore = read(".gitignore");
    expect(ignore).toMatch(/^\.env\*?/m);
    expect(ignore).toMatch(/!\.env\.example/);
  });
});
