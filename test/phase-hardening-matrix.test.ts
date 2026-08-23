import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";

type DefinitionKind = "obligations" | "phases" | "policies" | "scenarios" | "selectors";
type ExecutableEvidence = { file: string; test: string };
type MatrixRoute = {
  route: string;
  executable: ExecutableEvidence;
  evidence: { facts: string; links: string };
  selectors: string[];
  obligations: string[];
  participation: { mode: string; policies: string[]; authority: string };
  resolvers: string[];
  next: string[];
  budget: string;
  disposition: string;
  reuse: string;
  transport?: {
    lifecyclePublication: "none";
    leaseDisposition: "active" | "exhausted";
    orchestrationAction: "correct-response" | "stop";
    automaticReplacement: false;
  };
};
type MatrixRow = {
  id: string;
  phases: string[];
  routes: MatrixRoute[];
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
const participationModes = new Set([
  "autonomous",
  "package-delegated",
  "attended",
  "attended-immediate",
  "attended-checkpoint",
  "attended-delegable",
  "assignment-transport",
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

type RegisteredTest = { assertionCount: number; source: string };

function registeredTests(source: string, file: string): Map<string, RegisteredTest> {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const assertionHelpers = new Map<string, ts.FunctionDeclaration>();
  const collectAssertionHelpers = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) && node.name &&
      /^expect[A-Z]/.test(node.name.text)
    ) {
      assertionHelpers.set(node.name.text, node);
    }
    ts.forEachChild(node, collectAssertionHelpers);
  };
  collectAssertionHelpers(ast);
  const directBehavior = (roots: readonly ts.Node[]) => {
    let assertionCount = 0;
    const sources = roots.map((root) => root.getText(ast));
    const visitedHelpers = new Set<string>();
    const inspect = (candidate: ts.Node) => {
      if (ts.isCallExpression(candidate) && candidate.expression.getText(ast) === "expect") {
        assertionCount += 1;
      }
      if (
        ts.isCallExpression(candidate) && ts.isIdentifier(candidate.expression) &&
        assertionHelpers.has(candidate.expression.text) &&
        !visitedHelpers.has(candidate.expression.text)
      ) {
        visitedHelpers.add(candidate.expression.text);
        const helper = assertionHelpers.get(candidate.expression.text)!;
        sources.push(helper.getText(ast));
        inspect(helper);
      }
      ts.forEachChild(candidate, inspect);
    };
    for (const root of roots) inspect(root);
    return { assertionCount, source: sources.join("\n") };
  };
  const tests = new Map<string, RegisteredTest>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      if (/^(it|test)$/.test(callee.getText(ast))) {
        const title = node.arguments[0];
        if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
          tests.set(title.text, directBehavior(node.arguments));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return tests;
}

describe("Phase-hardening matrix", () => {
  it("uses only the declared Operator Outcome vocabulary", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    for (const row of matrix.rows) {
      for (const route of row.routes) {
        for (const outcome of route.next) {
          expect(
            operatorOutcomes,
            `${row.id}/${route.route}: ${outcome} is an Operator Outcome`,
          ).toContain(outcome);
        }
      }
    }
  });

  it("enumerates source-boundary publication with each exact successor outcome", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    const phases = [
      "phase-0-wayfinding@5",
      "phase-1-product-assurance@5",
      "phase-2-system-definition@9",
    ];
    const common = {
      selectors: [
        "current-open-question-sources@1",
        "source-boundaries-for@1",
        "source-boundary-evidence@1",
      ],
      obligations: ["source-boundary-required@1"],
      participation: { mode: "autonomous", policies: [], authority: "kernel-autonomous" },
      resolvers: ["freeze-source-boundary@1"],
    };

    expect(matrix.rows.find((row) => row.id === "attended-question-source-boundary"))
      .toMatchObject({
        phases,
        routes: [{
          ...common,
          route: "source boundary before attended resolution",
          executable: {
            file: "test/evaluate-bootstrap-participation.test.ts",
            test: "derives Review delegation and Question authority from exact Scenario inputs",
          },
          next: ["attention-required"],
        }],
      });
    expect(matrix.rows.find((row) => row.id === "autonomous-question-source-boundary"))
      .toMatchObject({
        phases,
        routes: [{
          ...common,
          route: "source boundary before autonomous resolution",
          executable: {
            file: "test/evaluate-bootstrap-participation.test.ts",
            test: "requires exact stakeholder authority and blocks the gate on an immediate question",
          },
          next: ["assignment"],
        }],
      });
  });

  it("keeps participation-incompatible question routes in distinct rows", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    const expectedRoutes = new Map([
      ["question-immediate-attention", "immediate blocking"],
      ["question-checkpoint-attention", "consolidated checkpoint"],
      ["empirical-question-answer", "empirical answer"],
      ["prototype-question-answer", "prototype answer"],
      ["question-inability", "unavailable evidence"],
      ["question-deferral", "defer"],
      ["question-cancellation", "cancel"],
      ["preferential-question-answer", "preferential answer"],
    ]);

    expect(matrix.rows.some((row) => row.id === "question-resolution")).toBe(false);
    for (const [rowId, route] of expectedRoutes) {
      expect(matrix.rows.find((row) => row.id === rowId)?.routes, rowId).toEqual([
        expect.objectContaining({ route }),
      ]);
    }
  });

  it("binds correction routes to their executable participation semantics", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;

    expect(matrix.rows.find((row) => row.id === "phase-0-foundation-correction")?.routes[0])
      .toMatchObject({
        route: "initial failure",
        participation: { mode: "autonomous", policies: [], authority: "kernel-autonomous" },
        resolvers: ["revise-foundation-after-review@5"],
        next: ["assignment"],
      });
    expect(matrix.rows.find((row) => row.id === "phase-2-candidate-gate-acceptance")
      ?.routes.find((route) => route.route === "reviewed rejection"))
      .toMatchObject({
        participation: {
          mode: "autonomous",
          policies: ["phase-2-correction-participation@1"],
          authority: "package-evidence",
        },
        resolvers: ["revise-phase-2-candidate-after-review@1"],
        next: ["assignment"],
      });
  });

  it("enumerates both malformed Assignment Response transitions without package execution", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    const row = matrix.rows.find((candidate) => candidate.id === "assignment-response-transport");
    const phases = [
      "phase-0-wayfinding@5",
      "phase-1-product-assurance@5",
      "phase-2-system-definition@9",
      "phase-2-pilot-assessment@3",
    ];

    expect(row?.phases).toEqual(phases);
    expect(row?.routes).toEqual([
      expect.objectContaining({
        route: "first malformed response",
        selectors: [],
        obligations: [],
        participation: {
          mode: "assignment-transport",
          policies: [],
          authority: "response-contract",
        },
        resolvers: [],
        next: ["assignment"],
        executable: {
          file: "test/mdlm-assignment.test.ts",
          test: "preserves the same Assignment for one malformed-response correction that can publish",
        },
        transport: {
          lifecyclePublication: "none",
          leaseDisposition: "active",
          orchestrationAction: "correct-response",
          automaticReplacement: false,
        },
      }),
      expect.objectContaining({
        route: "second malformed response",
        selectors: [],
        obligations: [],
        participation: {
          mode: "assignment-transport",
          policies: [],
          authority: "response-contract",
        },
        resolvers: [],
        next: ["assignment"],
        executable: {
          file: "test/mdlm-assignment.test.ts",
          test: "exhausts the Assignment on a second malformed response and reports the terminal disposition",
        },
        transport: {
          lifecyclePublication: "none",
          leaseDisposition: "exhausted",
          orchestrationAction: "stop",
          automaticReplacement: false,
        },
      }),
    ]);
  });

  it("binds every Phase 2 Review-correction route to its behavioral assertion", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    const row = matrix.rows.find((candidate) =>
      candidate.id === "phase-2-review-correction-and-ambiguity"
    );
    const expectedRoutes = new Set([
      "SYS",
      "ASP",
      "ICSP",
      "planning DWP",
      "completion DWP",
      "collateral Finding",
    ]);
    const correctionRoutes = (row?.routes ?? []).filter((route) =>
      expectedRoutes.has(route.route)
    );
    expect(new Set(correctionRoutes.map((route) => route.route))).toEqual(expectedRoutes);

    const exactTests = new Map([
      ["SYS", "derives exact correction work for a failed SYS Review"],
      ["ASP", "derives exact correction work for a failed ASP Review"],
      ["ICSP", "derives exact correction work for a failed ICSP Review"],
      ["planning DWP", "derives exact correction work for a failed planning DWP Review"],
      ["completion DWP", "derives exact correction work for a failed completion DWP Review"],
      ["collateral Finding", "derives exact correction work for a collateral Finding target"],
    ]);
    for (const route of correctionRoutes) {
      expect(route.executable).toEqual({
        file: "test/evaluate-system-decomposition.test.ts",
        test: exactTests.get(route.route),
      });
      expect(route.obligations).toEqual(["phase-2-review-correction-required@1"]);
      expect(route.resolvers).toEqual(["revise-phase-2-subject-after-review@1"]);
      expect(route.participation.policies).toContain("phase-2-correction-participation@1");
      expect(route.next).toEqual(["assignment"]);
    }
  });

  it("gives every outcome class exact package fields and retained executable evidence", async () => {
    const matrix = parse(await fs.readFile(matrixPath, "utf8")) as Matrix;
    expect(matrix.contract).toBe("mdlm-phase-hardening-matrix@1");
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(new Set(matrix.rows.map((row) => row.id)).size).toBe(matrix.rows.length);

    const processPackage = await canonicalProcessPackage();
    const testFiles = new Set(
      [...(await fs.readFile(path.join(projectRoot, "vitest.suites.mjs"), "utf8"))
        .matchAll(/"(test\/[^"]+\.test\.ts)"/g)]
        .map((match) => match[1]!),
    );
    const testsByFile = new Map<string, Map<string, RegisteredTest>>();
    const claimedEvidence = new Map<string, string>();
    const definitions = {
      obligations: await definitionReferences("obligations"),
      phases: await definitionReferences("phases"),
      policies: await definitionReferences("policies"),
      scenarios: await definitionReferences("scenarios"),
      selectors: await definitionReferences("selectors"),
    };
    for (const row of matrix.rows) {
      expect(Object.keys(row).sort(), `${row.id}: presentation-only row`).toEqual([
        "id",
        "phases",
        "routes",
      ]);
      expect(row.routes.length, `${row.id}: routes`).toBeGreaterThan(0);
      expect(new Set(row.routes.map((route) => route.route)).size, `${row.id}: unique routes`)
        .toBe(row.routes.length);
      for (const reference of row.phases) {
        expect(definitions.phases, `${row.id}: ${reference}`).toContain(reference);
      }

      for (const route of row.routes) {
        const label = `${row.id}/${route.route}`;
        expect(route.route, `${label}: exact route`).toEqual(expect.any(String));
        expect(route.evidence.facts, `${label}: evidence facts`).not.toBe("");
        expect(route.evidence.links, `${label}: evidence links`).not.toBe("");
        const assignmentTransport = route.participation.mode === "assignment-transport";
        if (assignmentTransport) {
          expect(route.selectors, `${label}: no Selector runs before contract acceptance`).toEqual([]);
          expect(route.obligations, `${label}: no Obligation is reevaluated before contract acceptance`).toEqual([]);
          expect(route.participation.policies, `${label}: no package participation runs`).toEqual([]);
          expect(route.resolvers, `${label}: no Resolver runs`).toEqual([]);
          expect(route.transport, `${label}: exact transport disposition`).toBeDefined();
        } else {
          expect(route.selectors.length, `${label}: Selectors`).toBeGreaterThan(0);
          expect(route.obligations.length, `${label}: Obligations`).toBeGreaterThan(0);
          expect(route.resolvers, `${label}: exact Resolver`).toHaveLength(1);
        }
        expect(participationModes, `${label}: exact participation mode`)
          .toContain(route.participation.mode);
        expect(route.participation.authority, `${label}: participation authority`).not.toBe("");
        expect(route.next, `${label}: exact next outcome`).toHaveLength(1);
        for (const outcome of route.next) {
          expect(operatorOutcomes, `${label}: ${outcome} is an Operator Outcome`).toContain(outcome);
        }
        expect(route.next, `${label}: expected route must stay live`).not.toContain("process-dead-end");
        expect(route.budget, `${label}: budget`).not.toBe("");
        expect(route.disposition, `${label}: disposition`).not.toBe("");
        expect(route.reuse, `${label}: reuse/invalidation`).not.toBe("");

        for (const reference of route.selectors) {
          expect(definitions.selectors, `${label}: ${reference}`).toContain(reference);
          const selector = processPackage.selectors[reference.split("@")[0]!];
          expect(selector?.query, `${label}: compiled Selector ${reference}`).toEqual(expect.any(Object));
        }
        for (const reference of route.obligations) {
          expect(definitions.obligations, `${label}: ${reference}`).toContain(reference);
          const obligation = processPackage.obligations[reference.split("@")[0]!];
          expect((obligation?.resolve_with as { scenario?: string })?.scenario, `${label}: Resolver binding`)
            .toBe(route.resolvers[0]);
        }
        for (const reference of route.participation.policies) {
          expect(definitions.policies, `${label}: ${reference}`).toContain(reference);
          expect(processPackage.policies[reference.split("@")[0]!]?.result_schema, `${label}: Policy result`)
            .toEqual(expect.any(Object));
        }
        for (const reference of route.resolvers) {
          expect(definitions.scenarios, `${label}: ${reference}`).toContain(reference);
          const scenario = processPackage.scenarios[reference.split("@")[0]!];
          expect(scenario?.outputs, `${label}: Resolver outputs`).toEqual(expect.any(Array));
          expect(scenario?.completion, `${label}: compiled Resolver completion`).toEqual(expect.any(Object));
          const declaredPolicy = (scenario?.participation as { policy_ref?: string } | undefined)
            ?.policy_ref;
          expect(route.participation.policies, `${label}: Resolver participation Policy`)
            .toEqual(declaredPolicy ? [declaredPolicy] : []);
        }

        expect(route.executable?.file, `${label}: evidence file`).toEqual(expect.any(String));
        expect(route.executable?.test, `${label}: evidence test`).toEqual(expect.any(String));
        expect(route.executable.test, `${label}: literal non-parameterized identity`).not.toContain("$");
        expect(route.executable.file, `${label}: matrix verifier cannot prove its own routes`)
          .not.toBe("test/phase-hardening-matrix.test.ts");
        const evidenceIdentity = `${route.executable.file}\u0000${route.executable.test}`;
        expect(claimedEvidence.get(evidenceIdentity), `${label}: evidence identity already proves another route`)
          .toBeUndefined();
        claimedEvidence.set(evidenceIdentity, label);
        expect(testFiles, `${label}: retained authoritative evidence`).toContain(route.executable.file);
        if (!testsByFile.has(route.executable.file)) {
          testsByFile.set(
            route.executable.file,
            registeredTests(
              await fs.readFile(path.join(projectRoot, route.executable.file), "utf8"),
              route.executable.file,
            ),
          );
        }
        const registered = testsByFile.get(route.executable.file)?.get(route.executable.test);
        expect(registered, `${label}: ${route.executable.test}`).toBeDefined();
        expect(registered?.assertionCount, `${label}: behavioral assertions`).toBeGreaterThan(0);
        expect(registered?.source, `${label}: evidence must not derive from matrix metadata`)
          .not.toMatch(/phase-hardening-matrix|MatrixRoute|route\.route/);
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
