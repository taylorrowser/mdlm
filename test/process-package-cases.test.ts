import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  compileProcessConstraints,
  publicAssignmentRenderer,
  type ProcessConstraintCatalogs,
  type VersionedDefinition,
} from "../src/index.js";
import { mdlm } from "./helpers/mdlm.js";

type Node = Record<string, unknown>;

const position = { offset: 0, line: 1, column: 1 };
const span = { start: position, end: position };
const base = { valueType: "boolean", span };

function path(binding: string, ...segments: string[]): Node {
  return { kind: "path", binding, variable: binding, segments, valueType: "string", span };
}

function variable(binding: string): Node {
  return { kind: "variable", variable: binding, valueType: "entity", span };
}

function literal(value: unknown): Node {
  return {
    kind: "literal",
    value,
    valueType: typeof value === "boolean" ? "boolean" : "string",
    span,
  };
}

function object(properties: Record<string, Node> = {}): Node {
  return { kind: "object", properties, valueType: "object", span };
}

function selector(
  operation: "exists" | "select",
  reference: string,
): Node {
  return {
    kind: "selector",
    operation,
    reference,
    arguments: object(),
    ...base,
  };
}

function every(reference: string, binding: string, predicate: Node): Node {
  return {
    kind: "every",
    reference,
    arguments: object(),
    binding,
    predicate,
    ...base,
  };
}

function expression(root: Node, source: string): Node {
  return { kind: "mdlm-expression", source, root, span };
}

function equality(left: Node, right: Node): Node {
  return { kind: "comparison", operator: "eq", left, right, ...base };
}

function inequality(left: Node, right: Node): Node {
  return { kind: "comparison", operator: "ne", left, right, ...base };
}

function finiteMembership(binding: string, field: string): Node {
  return {
    kind: "comparison",
    operator: "in",
    left: path(binding, "payload", field),
    right: {
      kind: "array",
      elements: [literal("RED"), literal("BLUE")],
      valueType: "array",
      span,
    },
    ...base,
  };
}

function definition(
  kind: string,
  id: string,
  value: Record<string, unknown> = {},
): VersionedDefinition {
  return { kind, id, version: 1, ...value };
}

function packageNeutralCatalogs(): ProcessConstraintCatalogs {
  const sourceCandidates = "candidates@1";
  const admittedCandidates = "admitted@1";
  return {
    templates: {},
    types: Object.fromEntries(["PLAN", "RED", "BLUE"].map((id) => [
      id,
      definition("type-definition", id),
    ])),
    scenarios: {
      route: definition("scenario-definition", "route", {
        inputs: [{ name: "plan", types: ["PLAN"], cardinality: "one" }],
        outputs: [{
          name: "results",
          types: ["RED", "BLUE"],
          cardinality: "one-or-more",
          type_from: { input: "plan", path: "hue" },
          required_links: [],
        }],
        completion: expression(
          equality(
            path("result", "identity", "type"),
            path("plan", "payload", "hue"),
          ),
          "result identity type equals plan hue",
        ),
        resolves: ["work"],
        batching: "single",
      }),
    },
    obligations: {
      work: definition("obligation-definition", "work", {
        resolve_with: { scenario: "route@1", inputs: {} },
        status_rules: [{
          status: "ready",
          when: expression(
            finiteMembership("plan", "hue"),
            "plan hue is one of the finite values",
          ),
        }],
      }),
    },
    selectors: {
      candidates: definition("selector-definition", "candidates", {
        query: { from: { collection: "baselines" } },
      }),
      admitted: definition("selector-definition", "admitted", {
        query: { from: { selector: sourceCandidates, arguments: {} } },
      }),
    },
    phases: {
      source: definition("phase-definition", "source", {
        gate: {
          candidate_selector: expression(
            selector("select", sourceCandidates),
            "select source candidates",
          ),
        },
        progression: {
          next_phase: "next",
          readiness: expression(
            every(
              sourceCandidates,
              "candidate",
              {
                kind: "not",
                operand: every(
                  admittedCandidates,
                  "admitted",
                  inequality(variable("admitted"), variable("candidate")),
                ),
                ...base,
              },
            ),
            "every source candidate is admitted",
          ),
        },
      }),
      next: definition("phase-definition", "next", {
        entry: expression(
          selector("exists", admittedCandidates),
          "an admitted candidate exists",
        ),
      }),
    },
  };
}

function compile(catalogs: ProcessConstraintCatalogs) {
  return compileProcessConstraints({
    catalogs,
    renderer: publicAssignmentRenderer,
  });
}

describe("compiled Process Package constraints", () => {
  it.each([
    {
      name: "proves both supported declaration relationships",
      mutate: (_catalogs: ProcessConstraintCatalogs) => undefined,
      status: "proved",
      ok: true,
      codes: [],
    },
    {
      name: "rejects a split output that loses the finite route",
      mutate: (catalogs: ProcessConstraintCatalogs) => {
        catalogs.scenarios.route!.outputs = [
          { name: "red", types: ["RED"], cardinality: "one", required_links: [] },
          { name: "blue", types: ["BLUE"], cardinality: "one", required_links: [] },
        ];
      },
      status: "contradictory",
      ok: false,
      codes: ["process-constraint-discriminated-output"],
    },
    {
      name: "rejects progression that no longer admits its source candidate",
      mutate: (catalogs: ProcessConstraintCatalogs) => {
        const progression = catalogs.phases.source!.progression as Record<string, unknown>;
        progression.readiness = expression(
          every("candidates@1", "candidate", literal(true)),
          "source candidates have no admission proof",
        );
      },
      status: "contradictory",
      ok: false,
      codes: ["process-constraint-phase-admission"],
    },
    {
      name: "reports an opaque discriminator relationship as inconclusive",
      mutate: (catalogs: ProcessConstraintCatalogs) => {
        catalogs.scenarios.route!.completion = expression(
          selector("exists", "opaque-proof@1"),
          "opaque proof",
        );
      },
      status: "inconclusive",
      ok: true,
      codes: [],
    },
  ])("$name", ({ mutate, status, ok, codes }) => {
    const catalogs = packageNeutralCatalogs();
    mutate(catalogs);
    const first = compile(catalogs);
    const second = compile(structuredClone(catalogs));
    expect(first.ok).toBe(ok);
    expect(first.contract.status).toBe(status);
    expect(first.diagnostics.map((item) => item.code)).toEqual(codes);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    if (status === "inconclusive") {
      expect(first.contract.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "discriminated-output",
          status: "inconclusive",
          diagnostics: [expect.objectContaining({
            code: "process-constraint-inconclusive",
          })],
        }),
      ]));
    }
    if (status === "contradictory") {
      const contradiction = first.contract.checks.find((check) =>
        check.status === "contradictory"
      );
      expect(contradiction?.paths.length).toBeGreaterThanOrEqual(2);
      expect(contradiction?.fact).toBeTruthy();
    }
  });

  it("passes the public command with two declaration proofs", () => {
    const started = performance.now();
    const result = mdlm(
      process.cwd(),
      "process",
      "test",
      "--ref",
      ".lifecycle/process",
      "--json",
    );
    const durationMilliseconds = performance.now() - started;
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(durationMilliseconds).toBeLessThan(5_000);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      tests: expect.objectContaining({
        passed: 2,
        failed: 0,
        cases: [
          expect.objectContaining({ kind: "discriminated-output", status: "proved" }),
          expect.objectContaining({ kind: "phase-admission", status: "proved" }),
        ],
      }),
    }));
  });
});
