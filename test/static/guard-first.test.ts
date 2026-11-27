import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Statická pojistka: server actions a route handlery nesmí obejít guard.
 * - v `'use server'` souborech a `app/** /route.ts` je KAŽDÝ export přímá async funkce/arrow
 *   (žádné `export { x }`, `export default wrap(...)`, `export const x = wrap(...)`, re-exporty)
 * - inline `"use server"` v tělech funkcí kdekoli v app/lib/components/scripts se kontroluje stejně
 * - první statement je `await <guard>(...)`, kde <guard> je export `lib/auth/guards.ts`
 *   importovaný z toho modulu
 * - výjimka: `// public: <důvod>` bezprostředně nad funkcí (jen z guardu, ne z tvaru exportu)
 */

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", "coverage"]);
const PUBLIC_MARKER = /\/\/\s*public:\s*\S/;
const MAX_PUBLIC = 6;
const ROUTE_CONFIG_EXPORTS = new Set(["dynamic", "runtime", "revalidate"]);
/** Exporty guards.ts, které nejsou guardy. */
const NOT_GUARDS = new Set(["createGuards", "PATHNAME_HEADER"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function parse(rel: string, text: string): ts.SourceFile {
  const kind = rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
}

function hasModifier(n: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);
}

function isDirective(st: ts.Statement, text: string): boolean {
  return (
    ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === text
  );
}

/** `'use server'` v direktivním prologu souboru. */
function hasFileUseServer(sf: ts.SourceFile): boolean {
  for (const st of sf.statements) {
    if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) return false;
    if (isDirective(st, "use server")) return true;
  }
  return false;
}

type FnLike =
  ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function isFnLike(n: ts.Node): n is FnLike {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

function hasInlineUseServer(fn: FnLike): boolean {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  for (const st of body.statements) {
    if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) return false;
    if (isDirective(st, "use server")) return true;
  }
  return false;
}

function hasPublicComment(sf: ts.SourceFile, node: ts.Node): boolean {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  return ranges.some((r) => PUBLIC_MARKER.test(sf.text.slice(r.pos, r.end)));
}

/** Komentář `// public:` nad funkcí, nad jejím příkazem (`export const x = …`) nebo nad přiřazením. */
function isPublic(sf: ts.SourceFile, node: ts.Node): boolean {
  let n: ts.Node | undefined = node;
  for (let i = 0; i < 4 && n && !ts.isSourceFile(n) && !ts.isBlock(n); i++) {
    if (hasPublicComment(sf, n)) return true;
    n = n.parent;
  }
  return false;
}

/** Lokální jméno → importované jméno, jen pro importy z `lib/auth/guards`. */
function guardImports(rel: string, sf: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const fromGuards =
      spec === "@/lib/auth/guards" ||
      (spec === "./guards" && dirname(rel) === "lib/auth") ||
      /^(\.\.\/)+(lib\/)?auth\/guards$/.test(spec);
    const clause = st.importClause;
    if (!fromGuards || !clause || clause.isTypeOnly) continue;
    const bindings = clause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      if (el.isTypeOnly) continue;
      map.set(el.name.text, (el.propertyName ?? el.name).text);
    }
  }
  return map;
}

/** První statement: `await <guard>(...)` nebo `const x = await <guard>(...)`. */
function startsWithGuard(
  body: ts.ConciseBody | undefined,
  imports: ReadonlyMap<string, string>,
  allow: ReadonlySet<string>,
): boolean {
  if (!body || !ts.isBlock(body)) return false;
  // direktivy ("use server") před prvním příkazem se přeskočí
  const first = body.statements.find(
    (st) => !(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)),
  );
  if (!first) return false;
  let expr: ts.Expression | undefined;
  if (ts.isExpressionStatement(first)) expr = first.expression;
  else if (ts.isVariableStatement(first)) {
    expr = first.declarationList.declarations[0]?.initializer;
  }
  if (!expr || !ts.isAwaitExpression(expr)) return false;
  const call = expr.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
  const imported = imports.get(call.expression.text);
  return imported !== undefined && allow.has(imported);
}

type Analysis = {
  /** Kontrolované akce (`soubor#jméno`). */
  actions: string[];
  violations: string[];
  /** Akce s výjimkou `// public:`. */
  publics: string[];
  /** Počet `// public:` komentářů v souboru s akcemi. */
  markers: number;
};

export function analyzeSource(rel: string, text: string, allow: ReadonlySet<string>): Analysis {
  const sf = parse(rel, text);
  const result: Analysis = { actions: [], violations: [], publics: [], markers: 0 };
  const isRoute = /(^|\/)route\.ts$/.test(rel) && rel.startsWith("app/");
  const serverFile = hasFileUseServer(sf);
  const imports = guardImports(rel, sf);

  const checkFn = (label: string, fn: FnLike, exemptNode: ts.Node) => {
    const id = `${rel}#${label}`;
    result.actions.push(id);
    const isAsync = hasModifier(fn, ts.SyntaxKind.AsyncKeyword);
    if (!isAsync) result.violations.push(`${id}: není async funkce`);
    const pub = isPublic(sf, exemptNode);
    if (pub) result.publics.push(id);
    else if (!startsWithGuard(fn.body, imports, allow)) {
      result.violations.push(`${id}: první statement není await <guard z lib/auth/guards>(…)`);
    }
  };
  const shape = (what: string) => result.violations.push(`${rel}: ${what}`);

  if (isRoute || serverFile) {
    for (const st of sf.statements) {
      const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
      if (ts.isFunctionDeclaration(st) && exported) {
        const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
        checkFn(isDefault ? "default" : (st.name?.text ?? "default"), st, st);
      } else if (ts.isVariableStatement(st) && exported) {
        for (const d of st.declarationList.declarations) {
          const name = ts.isIdentifier(d.name) ? d.name.text : "<destructuring>";
          const init = d.initializer;
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            checkFn(name, init, st);
          } else if (isRoute && ROUTE_CONFIG_EXPORTS.has(name)) {
            continue;
          } else {
            shape(`export "${name}" není přímá async funkce/arrow (obalení, konstanta?)`);
          }
        }
      } else if (ts.isExportAssignment(st)) {
        const e = st.expression;
        if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) checkFn("default", e, st);
        else shape("export default není přímá async funkce/arrow");
      } else if (ts.isExportDeclaration(st)) {
        const clause = st.exportClause;
        const typeOnly =
          st.isTypeOnly ||
          (clause !== undefined &&
            ts.isNamedExports(clause) &&
            clause.elements.every((el) => el.isTypeOnly));
        if (!typeOnly)
          shape("`export { … }` / `export * from` je zakázáno (export přímo u funkce)");
      } else if (
        exported &&
        (ts.isClassDeclaration(st) || ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st))
      ) {
        shape("export třídy/enumu/namespace je zakázán");
      }
      // exportované typy a interface jsou v pořádku
    }
  }

  if (!serverFile) {
    const visit = (n: ts.Node) => {
      if (isFnLike(n) && hasInlineUseServer(n)) {
        const name = n.name && ts.isIdentifier(n.name) ? n.name.text : undefined;
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        checkFn(`inline:${name ?? `<anonymous>@${line}`}`, n, n);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  if (result.actions.length > 0 || result.violations.length > 0) {
    result.markers = text.split("\n").filter((l) => PUBLIC_MARKER.test(l)).length;
  }
  return result;
}

/** Jména exportovaných hodnot z `lib/auth/guards.ts` (AST), bez továrny a konstant. */
export function loadGuardAllowlist(text: string): Set<string> {
  const sf = parse("lib/auth/guards.ts", text);
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!hasModifier(st, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(st) && st.name) names.add(st.name.text);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
      }
    }
  }
  for (const n of NOT_GUARDS) names.delete(n);
  return names;
}

function collect() {
  const allow = loadGuardAllowlist(readFileSync(join(root, "lib/auth/guards.ts"), "utf8"));
  const files = ["app", "lib", "components", "scripts"]
    .map((d) => join(root, d))
    .filter(existsSync)
    .flatMap((d) => walk(d));
  const total: Analysis = { actions: [], violations: [], publics: [], markers: 0 };
  for (const file of files) {
    const rel = relative(root, file).split("\\").join("/");
    const a = analyzeSource(rel, readFileSync(file, "utf8"), allow);
    total.actions.push(...a.actions);
    total.violations.push(...a.violations);
    total.publics.push(...a.publics);
    total.markers += a.markers;
  }
  return { allow, ...total };
}

describe("guard-first: server actions a route handlery", () => {
  const found = collect();

  it("allowlist guardů se načte z AST guards.ts", () => {
    expect([...found.allow].sort()).toEqual([
      "requireAnyMembership",
      "requireAuthSession",
      "requireAuthenticated",
      "requireDoor",
      "requireOrgRole",
      "requireOrgRoleBySlug",
      "requirePlatformAdmin",
    ]);
  });

  it("najde aspoň známé endpointy", () => {
    expect(found.actions).toContain("lib/auth/actions.ts#signOut");
    expect(found.actions).toContain("app/api/health/route.ts#GET");
    expect(found.actions).toContain("app/auth/callback/route.ts#GET");
    expect(found.actions).toContain("app/auth/confirm/verify/route.ts#POST");
  });

  it("každý export je přímá async funkce a začíná await <guard>(), nebo má // public: <důvod>", () => {
    expect(found.violations).toEqual([]);
  });

  it(`výjimek // public: je nejvýš ${MAX_PUBLIC}`, () => {
    const list = found.publics.map((p) => `  - ${p}`).join("\n");
    expect(found.markers, `Výjimky // public: (max ${MAX_PUBLIC}):\n${list}`).toBeLessThanOrEqual(
      MAX_PUBLIC,
    );
    expect(
      found.publics.length,
      `Výjimky // public: (max ${MAX_PUBLIC}):\n${list}`,
    ).toBeLessThanOrEqual(MAX_PUBLIC);
  });
});

describe("guard-first: samotestování na in-memory zdrojích", () => {
  const allow = new Set(["requireAuthenticated", "requireOrgRole"]);
  const IMPORT = `import { requireAuthenticated } from "@/lib/auth/guards";\n`;
  const run = (rel: string, src: string) => analyzeSource(rel, src, allow);
  const SA = "lib/x/actions.ts";
  const useServer = `"use server";\n${IMPORT}`;

  it("správné vzory projdou", () => {
    expect(
      run(SA, `${useServer}export async function a(){ await requireAuthenticated(); foo(); }`)
        .violations,
    ).toEqual([]);
    expect(
      run(SA, `${useServer}export async function a(){ const u = await requireAuthenticated(); }`)
        .violations,
    ).toEqual([]);
    expect(
      run(SA, `${useServer}export const a = async () => { await requireAuthenticated(); };`)
        .violations,
    ).toEqual([]);
    expect(
      run(
        SA,
        `${useServer}export default async function () { await requireAuthenticated(); }\nexport type T = string;\nexport interface I {}\nexport type { U } from "./u";\nexport { type V } from "./v";`,
      ).violations,
    ).toEqual([]);
    expect(
      run(
        "app/x/route.ts",
        `${IMPORT}export const dynamic = "force-dynamic";\nexport const revalidate = 0;\nexport async function GET(){ await requireAuthenticated(); }`,
      ).violations,
    ).toEqual([]);
    expect(
      run(
        "components/x.tsx",
        `${IMPORT}export function C(){ async function act(){ "use server"; await requireAuthenticated(); } return <form action={act} />; }`,
      ).violations,
    ).toEqual([]);
  });

  it("guard není první statement / chybí await / není async", () => {
    const v = (body: string) => run(SA, `${useServer}${body}`).violations;
    expect(v("export async function a(){ foo(); await requireAuthenticated(); }")).toHaveLength(1);
    expect(v("export async function a(){ requireAuthenticated(); }")).toHaveLength(1);
    expect(v("export const a = async () => foo();")).toHaveLength(1);
    expect(v("export function a(){ return 1; }")).not.toHaveLength(0);
  });

  it("obcházecí vzor: export { x }", () => {
    const a = run(
      SA,
      `${useServer}async function a(){ await requireAuthenticated(); }\nexport { a };`,
    );
    expect(a.violations).toHaveLength(1);
    expect(run(SA, `${useServer}export * from "./other";`).violations).toHaveLength(1);
    expect(run(SA, `${useServer}export { b } from "./other";`).violations).toHaveLength(1);
  });

  it("obcházecí vzor: export default", () => {
    expect(
      run(SA, `${useServer}async function a(){ await requireAuthenticated(); }\nexport default a;`)
        .violations,
    ).toHaveLength(1);
    expect(
      run(SA, `${useServer}export default wrap(async () => { await requireAuthenticated(); });`)
        .violations,
    ).toHaveLength(1);
    expect(
      run(SA, `${useServer}export default async function () { foo(); }`).violations,
    ).toHaveLength(1);
  });

  it("obcházecí vzor: export const x = wrap(...)", () => {
    expect(
      run(SA, `${useServer}export const a = wrap(async () => { await requireAuthenticated(); });`)
        .violations,
    ).toHaveLength(1);
    expect(
      run("app/x/route.ts", `${IMPORT}export const GET = wrap(async () => {});`).violations,
    ).toHaveLength(1);
    expect(run("app/x/route.ts", `export const foo = 1;`).violations).toHaveLength(1);
  });

  it("obcházecí vzor: inline use server bez guardu", () => {
    expect(
      run(
        "app/x/page.tsx",
        `export default function P(){ async function act(){ "use server"; save(); } return null; }`,
      ).violations,
    ).toHaveLength(1);
    expect(
      run("lib/x/y.ts", `export const make = () => async () => { "use server"; save(); };`)
        .violations,
    ).toHaveLength(1);
  });

  it("obcházecí vzor: volání mimo allowlist (requireNothing, lokální falešný guard)", () => {
    expect(
      run(
        SA,
        `"use server";\nimport { requireNothing } from "@/lib/auth/guards";\nexport async function a(){ await requireNothing(); }`,
      ).violations,
    ).toHaveLength(1);
    expect(
      run(
        SA,
        `"use server";\nasync function requireAuthenticated(){}\nexport async function a(){ await requireAuthenticated(); }`,
      ).violations,
    ).toHaveLength(1);
    expect(
      run(
        SA,
        `"use server";\nimport { requireAuthenticated } from "./my-guards";\nexport async function a(){ await requireAuthenticated(); }`,
      ).violations,
    ).toHaveLength(1);
  });

  it("alias importu guardu je povolen, namespace import ne", () => {
    expect(
      run(
        SA,
        `"use server";\nimport { requireOrgRole as guard } from "@/lib/auth/guards";\nexport async function a(){ await guard("o", []); }`,
      ).violations,
    ).toEqual([]);
    expect(
      run(
        SA,
        `"use server";\nimport * as g from "@/lib/auth/guards";\nexport async function a(){ await g.requireAuthenticated(); }`,
      ).violations,
    ).toHaveLength(1);
  });

  it("// public: vyjme jen z guardu, ne z tvaru exportu, a je započítáno", () => {
    const ok = run(
      SA,
      `"use server";\n// public: login před identitou\nexport async function a(){ foo(); }`,
    );
    expect(ok.violations).toEqual([]);
    expect(ok.publics).toEqual([`${SA}#a`]);
    expect(ok.markers).toBe(1);
    const inline = run(
      "app/x/page.tsx",
      `export function P(){\n  // public: anonymní formulář\n  async function act(){ "use server"; save(); }\n  return null; }`,
    );
    expect(inline.violations).toEqual([]);
    expect(inline.publics).toHaveLength(1);
    const wrapped = run(SA, `"use server";\n// public: x\nexport const a = wrap(async () => {});`);
    expect(wrapped.violations).toHaveLength(1);
  });

  it("allowlist se čte z AST (ne regexem ^require)", () => {
    const names = loadGuardAllowlist(
      `export const PATHNAME_HEADER = "x";\nexport function createGuards(){}\nexport const requireFoo = g.f;\nexport const checkBar = g.b;\nconst requireHidden = 1;\nexport type T = 1;`,
    );
    expect([...names].sort()).toEqual(["checkBar", "requireFoo"]);
  });
});
