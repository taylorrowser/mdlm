import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { parse } from "yaml";

type RouteEvidence = {
  kind: "public-executable-test" | "package-fixture";
  file: string;
  test: string;
  case?: string;
};

type CoverageSection = {
  section: string;
  routes: Array<{ route: string; evidence: RouteEvidence }>;
};

type CoverageManifest = {
  contract: "mdlm-phase-hardening-coverage@2";
  matrix: string;
  publicProcessSeam: string;
  sections: CoverageSection[];
  cleanPilot: {
    report: string;
    executableEvidence: string[];
    requiredObservations: Record<string, string[]>;
  };
};

const projectRoot = process.cwd();
const matrixPath = path.join(projectRoot, "docs/phase-hardening-matrix.md");
const coveragePath = path.join(projectRoot, "docs/phase-hardening-coverage.yaml");
const suitesPath = path.join(projectRoot, "vitest.suites.mjs");

type MatrixRow = {
  route: string;
  evidence: string;
  processRoute: string;
  outcome: string;
  reuse: string;
};

function registeredTests(file: string, source: string) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const registrations: Array<{ title: string; cases: Set<string> }> = [];
  const stringConstants = new Map<string, string>();
  const collectConstants = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      stringConstants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, collectConstants);
  };
  collectConstants(sourceFile);
  const literal = (node: ts.Node | undefined) => {
    if (!node) return undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    return ts.isIdentifier(node) ? stringConstants.get(node.text) : undefined;
  };
  const tableCases = (node: ts.Node | undefined) => {
    const cases = new Set<string>();
    const visit = (candidate: ts.Node) => {
      const value = literal(candidate);
      if (value !== undefined) cases.add(value);
      ts.forEachChild(candidate, visit);
    };
    if (node) visit(node);
    return cases;
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const title = literal(node.arguments[0]);
      if (
        title &&
        ts.isCallExpression(node.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        ["it", "test"].includes(node.expression.expression.expression.getText(sourceFile)) &&
        node.expression.expression.name.text === "each"
      ) {
        registrations.push({
          title,
          cases: tableCases(node.expression.arguments[0]),
        });
      } else if (
        title &&
        ts.isIdentifier(node.expression) &&
        ["it", "test"].includes(node.expression.text)
      ) {
        registrations.push({ title, cases: new Set() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return registrations;
}

function matrixRows(markdown: string) {
  const routes = new Map<string, MatrixRow[]>();
  let section: string | undefined;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      section = line.slice(3);
      continue;
    }
    if (!section || !line.startsWith("| ") || line.startsWith("| ---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Route" || cells[0] === "Expected result") continue;
    if (cells.length >= 3) {
      const sectionRoutes = routes.get(section) ?? [];
      sectionRoutes.push({
        route: cells[0]!,
        evidence: cells[1]!,
        processRoute: cells[2]!,
        outcome: cells[3]!,
        reuse: cells[4]!,
      });
      routes.set(section, sectionRoutes);
    }
  }
  return routes;
}

describe("reusable Phase-hardening proof matrix", () => {
  it("binds every distinct route to registered executable evidence", async () => {
    const [markdown, source, suites] = await Promise.all([
      fs.readFile(matrixPath, "utf8"),
      fs.readFile(coveragePath, "utf8"),
      fs.readFile(suitesPath, "utf8"),
    ]);
    const manifest = parse(source) as CoverageManifest;
    expect(manifest.contract).toBe("mdlm-phase-hardening-coverage@2");
    expect(manifest.matrix).toBe("docs/phase-hardening-matrix.md");
    expect(manifest.publicProcessSeam).toBe(
      "mdlm init -> mdlm next -> mdlm scenario prepare -> mdlm scenario submit",
    );

    const definitionReferences = new Set<string>();
    for (const directory of [
      "obligations",
      "phases",
      "policies",
      "profiles",
      "scenarios",
      "selectors",
      "states",
    ]) {
      const root = path.join(projectRoot, ".lifecycle/process", directory);
      for (const file of await fs.readdir(root)) {
        if (!file.endsWith(".yaml")) continue;
        const definition = parse(await fs.readFile(path.join(root, file), "utf8")) as {
          id?: string;
          version?: number;
        };
        if (definition.id && definition.version) {
          definitionReferences.add(`${definition.id}@${definition.version}`);
        }
      }
    }

    const routes = matrixRows(markdown);
    const coverage = new Map(manifest.sections.map((entry) => [entry.section, entry]));
    expect([...coverage.keys()].sort()).toEqual([...routes.keys()].sort());

    for (const [section, sectionRows] of routes) {
      expect(sectionRows.length, section).toBeGreaterThan(0);
      const sectionRoutes = sectionRows.map(({ route }) => route);
      const routeEvidence = coverage.get(section)!.routes;
      expect(routeEvidence.map(({ route }) => route), section).toEqual(sectionRoutes);
      expect(new Set(sectionRoutes).size, section).toBe(sectionRoutes.length);
      for (const row of sectionRows) {
        expect(row.evidence, `${section}: ${row.route}: evidence`).not.toBe("");
        if (section !== "Transport and liveness invariants") {
          const references = [...row.processRoute.matchAll(
            /`([a-z][a-z0-9-]*@[1-9][0-9]*)`/g,
          )].map((match) => match[1]!);
          expect(
            references.length,
            `${section}: ${row.route}: exact package reference`,
          ).toBeGreaterThan(0);
          for (const reference of references) {
            expect(
              definitionReferences,
              `${section}: ${row.route}: ${reference}`,
            ).toContain(reference);
          }
          expect(row.outcome, `${section}: ${row.route}: next outcome`).not.toBe("");
          expect(row.reuse, `${section}: ${row.route}: budget/reuse`).not.toBe("");
        }
      }
      for (const { route, evidence } of routeEvidence) {
        expect(evidence.kind, `${section}: ${route}`).toMatch(
          /^(?:public-executable-test|package-fixture)$/,
        );
        expect(suites, `${section}: ${route}: ${evidence.file}`)
          .toContain(`"${evidence.file}"`);
        const testSource = await fs.readFile(
          path.join(projectRoot, evidence.file),
          "utf8",
        );
        const registration = registeredTests(evidence.file, testSource).find(
          ({ title }) => title === evidence.test,
        );
        expect(
          registration,
          `${route}: executable test declaration '${evidence.test}'`,
        ).toBeDefined();
        if (evidence.case) {
          expect(
            registration!.cases,
            `${route}: parameterized case '${evidence.case}'`,
          ).toContain(evidence.case);
        } else {
          expect(
            registration!.cases.size,
            `${route}: parameterized evidence requires an exact case`,
          ).toBe(0);
        }
      }
    }
  });

  it("keeps the clean pilot acceptance observations auditable", async () => {
    const [coverageSource, suites] = await Promise.all([
      fs.readFile(coveragePath, "utf8"),
      fs.readFile(suitesPath, "utf8"),
    ]);
    const manifest = parse(coverageSource) as CoverageManifest;
    expect(manifest.cleanPilot.report).toBe("docs/clean-pilot-103.md");
    await expect(fs.access(path.join(projectRoot, manifest.cleanPilot.report))).resolves
      .toBeUndefined();

    const required = [
      "attended-product-wayfinding",
      "fresh-delegated-review",
      "lifecycle-correction",
      "correction-escalation",
      "consolidated-checkpoint",
      "gate-rejection-return",
      "shared-requirement-impact",
      "formal-change",
      "doctor-commit-clean-state",
      "explicit-terminal-outcome",
    ];
    expect(Object.keys(manifest.cleanPilot.requiredObservations).sort()).toEqual(
      required.sort(),
    );
    for (const [observation, evidence] of Object.entries(
      manifest.cleanPilot.requiredObservations,
    )) {
      expect(evidence.length, observation).toBeGreaterThan(0);
      for (const testPath of evidence) {
        expect(manifest.cleanPilot.executableEvidence, observation).toContain(testPath);
        expect(suites, `${observation}: ${testPath}`).toContain(`"${testPath}"`);
      }
    }
  });
});
