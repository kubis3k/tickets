import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Invariant: každá admin mutace = 1 audit řádek ve stejné transakci.
 * Statická pojistka: každá funkce v app/lib, která zapisuje do tabulky ze schématu
 * (`.insert|update|delete(<tabulka>)`), musí volat `recordAudit(` ve stejném těle.
 * Výjimky (nejsou admin mutace) jsou explicitní a krátké.
 */
const root = process.cwd();

/** Soubory, které smí zapisovat bez auditu, s důvodem. */
const EXEMPT: Record<string, string> = {
  "lib/audit/record.ts": "samotný zápis auditu",
  "lib/seed/seed.ts": "seed skript, ne admin mutace (spouští operátor)",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

type Finding = { file: string; fn: string; mutations: number; audits: number };

export function analyze(rel: string, text: string): Finding[] {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const schemaNames = new Set<string>();
  sf.forEachChild((n) => {
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      n.moduleSpecifier.text.startsWith("@/lib/db/schema") &&
      n.importClause?.namedBindings &&
      ts.isNamedImports(n.importClause.namedBindings)
    ) {
      for (const el of n.importClause.namedBindings.elements) schemaNames.add(el.name.text);
    }
  });

  const findings: Finding[] = [];
  const countIn = (body: ts.Node): { mutations: number; audits: number } => {
    let mutations = 0;
    let audits = 0;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        if (ts.isIdentifier(callee) && callee.text === "recordAudit") audits++;
        if (
          ts.isPropertyAccessExpression(callee) &&
          ["insert", "update", "delete"].includes(callee.name.text)
        ) {
          const arg = n.arguments[0];
          if (arg && ts.isIdentifier(arg) && schemaNames.has(arg.text)) mutations++;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
    return { mutations, audits };
  };

  const handle = (name: string, node: ts.Node | undefined): void => {
    if (!node) return;
    const { mutations, audits } = countIn(node);
    if (mutations > 0) findings.push({ file: rel, fn: name, mutations, audits });
  };

  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name) handle(n.name.text, n.body);
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) handle(d.name.text, d.initializer);
      }
    }
  });
  return findings;
}

describe("audit log: každá mutace v adminu má audit ve stejné funkci", () => {
  const files = ["app", "lib", "components", "scripts"]
    .filter((d) => existsSync(join(root, d)))
    .flatMap((d) => walk(join(root, d)))
    .map((f) => relative(root, f).split("\\").join("/"));
  const findings = files
    .filter((f) => !(f in EXEMPT))
    .flatMap((f) => analyze(f, readFileSync(join(root, f), "utf8")));

  it("najde známé mutační funkce (test není prázdný)", () => {
    const names = findings.map((f) => f.fn);
    for (const n of [
      "createOrganization",
      "updateOrganization",
      "updateOrgOwnerSettings",
      "changeMemberRole",
      "removeMember",
      "createInvitation",
      "acceptInvitation",
      "revokeInvitation",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("každá funkce s mutací volá recordAudit (zápis jinde = nutno doplnit audit nebo EXEMPT s důvodem)", () => {
    const bad = findings
      .filter((f) => f.audits === 0)
      .map((f) => `${f.file}#${f.fn} (${f.mutations} mutací, 0 auditů)`);
    expect(bad).toEqual([]);
  });

  it("zápisy do audit_log vedou jen přes recordAudit (žádný přímý insert jinde)", () => {
    const offenders = files
      .filter((f) => f !== "lib/audit/record.ts")
      .filter((f) =>
        /\.(insert|update|delete)\(\s*auditLog\b/.test(readFileSync(join(root, f), "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("výjimky z auditu jsou jen známé soubory", () => {
    expect(Object.keys(EXEMPT).sort()).toEqual(["lib/audit/record.ts", "lib/seed/seed.ts"]);
  });
});
