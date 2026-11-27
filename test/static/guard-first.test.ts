import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", "coverage"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const PUBLIC_MARKER = /\/\/\s*public:\s*\S/;
const MAX_PUBLIC = 5;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function hasUseServer(sf: ts.SourceFile): boolean {
  for (const st of sf.statements) {
    if (
      ts.isExpressionStatement(st) &&
      ts.isStringLiteral(st.expression) &&
      st.expression.text === "use server"
    ) {
      return true;
    }
    if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) return false;
  }
  return false;
}

type Entry = { name: string; node: ts.Node; body: ts.ConciseBody | undefined };

function exportedFunctions(sf: ts.SourceFile): Entry[] {
  const out: Entry[] = [];
  const isExported = (n: ts.Node) =>
    ts.canHaveModifiers(n) &&
    (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && isExported(st) && st.name) {
      out.push({ name: st.name.text, node: st, body: st.body });
    } else if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (
          ts.isIdentifier(d.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          out.push({ name: d.name.text, node: st, body: init.body });
        }
      }
    }
  }
  return out;
}

function isPublic(sf: ts.SourceFile, node: ts.Node): boolean {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  return ranges.some((r) => PUBLIC_MARKER.test(sf.text.slice(r.pos, r.end)));
}

/** První statement musí být `await require*(...)` (případně `const x = await require*(...)`). */
export function startsWithGuard(body: ts.ConciseBody | undefined): boolean {
  if (!body || !ts.isBlock(body)) return false;
  const first = body.statements[0];
  if (!first) return false;
  let expr: ts.Expression | undefined;
  if (ts.isExpressionStatement(first)) expr = first.expression;
  else if (ts.isVariableStatement(first)) {
    expr = first.declarationList.declarations[0]?.initializer;
  }
  if (!expr || !ts.isAwaitExpression(expr)) return false;
  const call = expr.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    /^require[A-Z]/.test(call.expression.text)
  );
}

type Checked = { file: string; name: string; ok: boolean; isPublic: boolean };

function collect(): { checked: Checked[]; publicMarkers: number } {
  const files = ["app", "lib", "components", "scripts"]
    .map((d) => join(root, d))
    .filter(existsSync)
    .flatMap((d) => walk(d));
  const checked: Checked[] = [];
  let publicMarkers = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file).split("\\").join("/");
    const isRoute = /(^|\/)route\.ts$/.test(rel) && rel.startsWith("app/");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const serverFile = hasUseServer(sf);
    if (!isRoute && !serverFile) continue;
    publicMarkers += text.split("\n").filter((l) => PUBLIC_MARKER.test(l)).length;
    for (const fn of exportedFunctions(sf)) {
      if (isRoute && !HTTP_METHODS.has(fn.name)) continue;
      checked.push({
        file: rel,
        name: fn.name,
        ok: startsWithGuard(fn.body),
        isPublic: isPublic(sf, fn.node),
      });
    }
  }
  return { checked, publicMarkers };
}

describe("guard-first: server actions a route handlery", () => {
  const { checked, publicMarkers } = collect();

  it("najde aspoň známé endpointy", () => {
    const names = checked.map((c) => `${c.file}#${c.name}`);
    expect(names).toContain("lib/auth/actions.ts#signOut");
    expect(names).toContain("app/api/health/route.ts#GET");
    expect(names).toContain("app/auth/callback/route.ts#GET");
  });

  it("každá exportovaná funkce začíná await require*(), nebo má // public: <důvod>", () => {
    const bad = checked.filter((c) => !c.ok && !c.isPublic).map((c) => `${c.file}#${c.name}`);
    expect(bad).toEqual([]);
  });

  it("výjimka // public: se nedá přidat na funkci, která guard stejně volá, a je malý seznam", () => {
    expect(publicMarkers).toBeLessThanOrEqual(MAX_PUBLIC);
    expect(checked.filter((c) => c.isPublic).length).toBeLessThanOrEqual(MAX_PUBLIC);
  });

  it("startsWithGuard rozlišuje správně (samotestování)", () => {
    const parse = (src: string) => {
      const sf = ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true);
      return exportedFunctions(sf)[0]?.body;
    };
    expect(startsWithGuard(parse("export async function a(){ await requireX(); foo(); }"))).toBe(
      true,
    );
    expect(
      startsWithGuard(parse("export async function a(){ const u = await requireX(1); }")),
    ).toBe(true);
    expect(startsWithGuard(parse("export async function a(){ foo(); await requireX(); }"))).toBe(
      false,
    );
    expect(startsWithGuard(parse("export async function a(){ requireX(); }"))).toBe(false);
    expect(startsWithGuard(parse("export const a = async () => { await requireX(); };"))).toBe(
      true,
    );
    expect(startsWithGuard(parse("export const a = async () => foo();"))).toBe(false);
  });
});
