import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type DefinitionKind = "obligations" | "phases" | "policies" | "scenarios" | "selectors";
type ExecutableEvidence = { file: string; test: string };
type MatrixRoute = { route: string; executable: ExecutableEvidence };
type MatrixRow = {
  id: string;
  phases: string[];
  routes: MatrixRoute[];
  evidence: { facts: string; links: string };
  selectors: string[];
  obligations: string[];
  participation: { mode: string; policies: string[]; authority: string };
  resolvers: string[];
  next: string[];
  budget: string;
  disposition: string;
  reuse: string;
};

type Matrix = { contract: string; rows: MatrixRow[] };

const projectRoot = process.cwd();
const matrixPath = path.join(projectRoot, "docs/phase-hardening-matrix.yaml");
const operatorOutcomes = new Set([
  "assignment",
  "attention-required",
  "profile-boundary-reached",
  "lifecycle-complete",
  "process-dead-end",
  "invalid",
]);

async function definitionReferences(kind: DefinitionKind): Promise<Set<string>> {
  const references = new Set<string>();
  const root = path.join(projectRoot, ".lifecycle/process", kind);
  for (const file of await fs.readdir(root)) {
    if (!file.endsWith(".yaml")) continue;
    const definition = parse(await fs.readFile(path.join(root, file), "utf8")) as {
      id?: string;
      version?: number;
    };
    if (definition.id && definition.version) {
      references.add(`${definition.id}@${definition.version}`);
    }
  }
  return references;
}

function registeredTests(source: string, file: string): Set<string> {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      let callee = node.expression;
      if (ts.isCallExpression(callee)) callee = callee.expression;
      const text = callee.getText(ast);
      if (/^(it|test)(\.each)?$/.test(text)) {
        const title = node.arguments[0];
        if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
          names.add(title.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return names;
}

describe("Phase-hardening matrix", () => {
  it("uses only the declared Operator Outcome vocabulary", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    for (const row of matrix.rows) {
      for (const outcome of row.next) {
        expect(operatorOutcomes, `${row.id}: ${outcome} is an Operator Outcome`).toContain(outcome);
      }
    }
  });

  it("gives every outcome class exact package fields and registered executable evidence", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    expect(matrix.contract).toBe("mdlm-phase-hardening-matrix@1");
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(new Set(matrix.rows.map((row) => row.id)).size).toBe(matrix.rows.length);

    const definitions = {
      obligations: await definitionReferences("obligations"),
      phases: await definitionReferences("phases"),
      policies: await definitionReferences("policies"),
      scenarios: await definitionReferences("scenarios"),
      selectors: await definitionReferences("selectors"),
    };
    const testsByFile = new Map<string, Set<string>>();

    for (const row of matrix.rows) {
      const label = row.id;
      expect(row.routes.length, `${label}: routes`).toBeGreaterThan(0);
      expect(new Set(row.routes.map((route) => route.route)).size, `${label}: unique routes`)
        .toBe(row.routes.length);
      expect(row.evidence.facts, `${label}: evidence facts`).not.toBe("");
      expect(row.evidence.links, `${label}: evidence links`).not.toBe("");
      expect(row.selectors.length, `${label}: Selectors`).toBeGreaterThan(0);
      expect(row.obligations.length, `${label}: Obligations`).toBeGreaterThan(0);
      expect(row.participation.mode, `${label}: participation mode`).not.toBe("");
      expect(row.participation.authority, `${label}: participation authority`).not.toBe("");
      expect(row.resolvers.length, `${label}: Resolvers`).toBeGreaterThan(0);
      expect(row.next.length, `${label}: next outcomes`).toBeGreaterThan(0);
      for (const outcome of row.next) {
        expect(operatorOutcomes, `${label}: ${outcome} is an Operator Outcome`).toContain(outcome);
      }
      expect(row.next, `${label}: expected route must stay live`).not.toContain("process-dead-end");
      expect(row.budget, `${label}: budget`).not.toBe("");
      expect(row.disposition, `${label}: disposition`).not.toBe("");
      expect(row.reuse, `${label}: reuse/invalidation`).not.toBe("");

      for (const reference of row.phases) expect(definitions.phases, `${label}: ${reference}`).toContain(reference);
      for (const reference of row.selectors) expect(definitions.selectors, `${label}: ${reference}`).toContain(reference);
      for (const reference of row.obligations) expect(definitions.obligations, `${label}: ${reference}`).toContain(reference);
      for (const reference of row.participation.policies) expect(definitions.policies, `${label}: ${reference}`).toContain(reference);
      for (const reference of row.resolvers) expect(definitions.scenarios, `${label}: ${reference}`).toContain(reference);

      for (const route of row.routes) {
        expect(route.route, `${label}: exact route`).toEqual(expect.any(String));
        expect(route.executable?.file, `${label}/${route.route}: evidence file`).toEqual(expect.any(String));
        expect(route.executable?.test, `${label}/${route.route}: evidence test`).toEqual(expect.any(String));

        const evidencePath = path.join(projectRoot, route.executable.file);
        if (!testsByFile.has(route.executable.file)) {
          testsByFile.set(
            route.executable.file,
            registeredTests(await fs.readFile(evidencePath, "utf8"), route.executable.file),
          );
        }
        expect(testsByFile.get(route.executable.file), `${label}/${route.route}: ${route.executable.test}`)
          .toContain(route.executable.test);
      }
    }
  });

  it("remains a specification artifact with no runtime consumer", async () => {
    const sourceRoot = path.join(projectRoot, "src");
    const runtime = await Promise.all(
      (await fs.readdir(sourceRoot, { recursive: true }))
        .filter((file) => file.endsWith(".ts"))
        .map((file) => fs.readFile(path.join(sourceRoot, file), "utf8")),
    );
    expect(runtime.join("\n")).not.toContain("phase-hardening-matrix");
  });
});
