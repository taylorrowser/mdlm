import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateDefinitionGraph } from "../src/definition-graph.js";
import { loadProcessPackage } from "../src/index.js";
import type {
  ProcessPackage,
  VersionedDefinition,
} from "../src/index.js";
import {
  participationResult,
  validateParticipationPolicy,
} from "../src/participation.js";
import { participationProcessPackage } from "./helpers/participation-process.js";

const temporaryRoots: string[] = [];
let validPackage: ProcessPackage;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as Record<string, unknown>;
}

function clonedPolicy(id: string): VersionedDefinition {
  const policy = validPackage.policies[id];
  if (!policy) throw new Error(`Missing Policy '${id}'`);
  return structuredClone(policy);
}

function graphDiagnostics(
  mutate: (definitions: ProcessPackage) => void,
) {
  const definitions = structuredClone(validPackage);
  mutate(definitions);
  return validateDefinitionGraph(definitions.manifest, definitions);
}

beforeAll(async () => {
  const processRoot = await participationProcessPackage();
  temporaryRoots.push(path.dirname(processRoot));
  const loaded = await loadProcessPackage(processRoot);
  expect(
    loaded.ok,
    loaded.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"),
  ).toBe(true);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  validPackage = loaded.package;
});

afterAll(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Scenario participation Policy validation", () => {
  it("declares the blocking links required by question resolution and gate rejection", async () => {
    const loaded = await loadProcessPackage(".lifecycle/process");
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!loaded.ok) return;

    expect(loaded.package.scenarios["resolve-question"]?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "blocked_targets",
          cardinality: "zero-or-more",
          identity: "stable",
        }),
      ]),
    );
    expect(loaded.package.obligations["open-question-resolution"]?.resolve_with)
      .toMatchObject({
        inputs: {
          blocked_targets: expect.objectContaining({
            source:
              'select("blocked-targets-for-question@1", {question: question})',
          }),
        },
      });
    expect(loaded.package.scenarios["resolve-question"]?.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "updated_question",
          required_links: [
            { link: "blocks", target: { input: "blocked_targets" } },
          ],
        }),
      ]),
    );
    expect(loaded.package.scenarios["resolve-question"]?.completion).toEqual(
      expect.objectContaining({
        source: expect.stringMatching(
          /question\.payload\.kind != "preferential"[\s\S]*!present\(decision\)/,
        ),
      }),
    );
    expect(loaded.package.types.QST?.payload_schema).toEqual(
      expect.objectContaining({
        allOf: expect.arrayContaining([
          expect.objectContaining({
            if: expect.objectContaining({
              properties: expect.objectContaining({
                kind: { const: "preferential" },
              }),
            }),
          }),
        ]),
      }),
    );
    expect(loaded.package.scenarios["record-gate-signoff"]?.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "questions",
          required_links: [
            { link: "blocks", target: { input: "candidate" } },
          ],
        }),
      ]),
    );
  });

  it("accepts a versioned Policy with exact Scenario input arguments and the standard result", () => {
    expect(validPackage.scenarios["resolve-question"]?.participation)
      .toEqual(expect.objectContaining({
        policy_ref: "question-participation@1",
        arguments: expect.objectContaining({
          question: expect.any(Object),
          selected_phase: expect.any(Object),
        }),
      }));

    const policy = clonedPolicy("question-participation");
    expect(validateParticipationPolicy(policy, "policies.question-participation"))
      .toEqual([]);
    expect(participationResult(policy.default)).toEqual({
      authorityRequirement: {
        mode: "attended",
        authority: "stakeholder",
        delegationAllowed: false,
      },
      attentionSchedule: {
        timing: "checkpoint",
        checkpoint: "phase-0-gate",
        consolidationGroup: "phase-0-stakeholder-questions",
      },
    });
  });

  it("keeps authority mode, delegation allowance, and attention timing independent", () => {
    const policy = clonedPolicy("process-participation");
    object(policy.default).delegation_allowed = true;

    expect(validateParticipationPolicy(policy, "policies.process-participation"))
      .toEqual([]);
  });

  it.each([
    {
      name: "missing exact authority evidence",
      mutate: (definitions: ProcessPackage) => {
        delete definitions.scenarios["resolve-question"]?.authority_evidence;
      },
      diagnostic: {
        code: "scenario-authority-evidence-required",
        path: "scenarios.resolve-question.authority_evidence",
        message: "Scenario 'resolve-question@2' must name the Lifecycle Data output that records non-autonomous authority",
      },
    },
    {
      name: "authority evidence that is not a declared output",
      mutate: (definitions: ProcessPackage) => {
        definitions.scenarios["resolve-question"]!.authority_evidence = {
          output: "missing",
          type: "DEC",
        };
      },
      diagnostic: {
        code: "scenario-authority-evidence-output",
        path: "scenarios.resolve-question.authority_evidence",
        message: "Scenario 'resolve-question@2' authority evidence must name a declared output and one of its Lifecycle Data types",
      },
    },
    {
      name: "an unknown Policy reference",
      mutate: (definitions: ProcessPackage) => {
        object(definitions.scenarios["resolve-question"]!.participation)
          .policy_ref = "missing-participation@1";
      },
      diagnostic: {
        code: "unknown-reference",
        path: "scenarios.resolve-question.participation.policy_ref",
        message: "Unknown Participation Policy reference 'missing-participation@1'",
      },
    },
    {
      name: "missing Policy parameters",
      mutate: (definitions: ProcessPackage) => {
        const participation = object(
          definitions.scenarios["resolve-question"]!.participation,
        );
        const argumentsValue = object(participation.arguments);
        argumentsValue.unexpected = argumentsValue.question;
        delete argumentsValue.question;
      },
      diagnostic: {
        code: "participation-policy-arguments",
        path: "scenarios.resolve-question.participation.arguments",
        message: "Scenario 'resolve-question' participation arguments must exactly match Policy 'question-participation@1'; missing: question; unknown: unexpected",
      },
    },
  ])("rejects $name", ({ mutate, diagnostic }) => {
    expect(graphDiagnostics(mutate)).toEqual([diagnostic]);
  });

  it.each([
    {
      name: "an argument with the wrong typed expression",
      mutate: (source: string) =>
        source.replace(
          "    question: question",
          `    question: '\"not-an-entity\"'`,
        ),
      code: "expression-result-type",
    },
    {
      name: "a many-valued input bound to a singular parameter",
      mutate: (source: string) =>
        source.replace("    cardinality: one", "    cardinality: one-or-more"),
      code: "expression-result-type",
    },
    {
      name: "an optional input bound to a required parameter",
      mutate: (source: string) =>
        source.replace("    cardinality: one", "    cardinality: zero-or-one"),
      code: "participation-policy-argument-type",
    },
    {
      name: "an input whose identity kind is not exact enough",
      mutate: (source: string) =>
        source.replace("    identity: revision", "    identity: either"),
      code: "participation-policy-argument-type",
    },
  ])("rejects $name", async ({ mutate, code }) => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const scenarioPath = path.join(
      processRoot,
      "scenarios/resolve-question.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      mutate(await fs.readFile(scenarioPath, "utf8")),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  it("rejects an unknown payload path used as an exact required-link target", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const scenarioPath = path.join(
      processRoot,
      "scenarios/record-consequential-decision.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "path: waiver.instance",
        "path: waiver.instnce",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown-required-link-payload-path" }),
    ]));
  });

  it("rejects a payload-supplied required link outside source cardinality", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const typePath = path.join(processRoot, "types/DEC.yaml");
    await fs.writeFile(
      typePath,
      (await fs.readFile(typePath, "utf8")).replace(
        "  - id: waives\n    description: Exact computed obligation instance suppressed by this structured waiver.",
        "  - id: waives\n    description: Exact computed obligation instance suppressed by this structured waiver.\n    cardinality: {minimum: 2, maximum: many}",
      ).replace(
        "    cardinality: {minimum: 0, maximum: many}\n    freeze_resolution: not-applicable",
        "    freeze_resolution: not-applicable",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "impossible-required-link-cardinality" }),
    ]));
  });

  it("rejects participation that depends on execution context", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "{name: selected_process, kind: process}",
        "{name: selected_process, kind: execution}",
      ),
    );
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "    selected_process: process",
        "    selected_process: execution",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-execution-binding-forbidden",
      }),
    ]));
  });

  it("rejects undeclared lifecycle types in participation parameters", () => {
    const diagnostics = graphDiagnostics((definitions) => {
      const parameters = definitions.policies["question-participation"]!
        .parameters as Array<Record<string, unknown>>;
      parameters[0]!.types = ["ZZZ"];
    });

    expect(diagnostics).toEqual(expect.arrayContaining([{
      code: "unknown-participation-policy-type",
      path: "policies.question-participation.parameters[0].types[0]",
      message: "Participation Policy 'question-participation@1' references undeclared lifecycle type 'ZZZ'",
    }]));
  });

  it("rejects duplicate participation Policy parameter names", () => {
    const diagnostics = graphDiagnostics((definitions) => {
      const parameters = definitions.policies["question-participation"]!
        .parameters as Array<Record<string, unknown>>;
      parameters.push({
        name: "question",
        kind: "scalar",
        scalar_type: "string",
      });
    });

    expect(diagnostics).toEqual(expect.arrayContaining([{
      code: "participation-policy-parameters",
      path: "policies.question-participation.parameters",
      message: "Participation Policy 'question-participation@1' has duplicate parameter names",
    }]));
  });

  it("rejects an unknown payload path on a typed Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "question.payload.kind",
        "question.payload.knd",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "expression-unknown-path" }),
    ]));
  });

  it("rejects lifecycle types on a contextual Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "{name: selected_process, kind: process}",
        "{name: selected_process, kind: process, types: [QST]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
    ]));
  });

  it("rejects lifecycle types on a scalar Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "{name: selected_process, kind: process}",
        "{name: selected_process, kind: scalar, scalar_type: string, types: [QST]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
    ]));
  });

  it("rejects a non-integer expression for an integer Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8"))
        .replace(
          "{name: selected_process, kind: process}",
          "{name: selected_process, kind: scalar, scalar_type: integer}",
        )
        .replace(
          "selected_process.integrity.package_valid == true",
          "selected_process == 1",
        ),
    );
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "    selected_process: process",
        "    selected_process: '1.5'",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "expression-result-type" }),
    ]));
  });

  it("rejects a participation argument with an indirect execution dependency", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const manifestPath = path.join(processRoot, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "baseline-participation]",
        "baseline-participation, execution-helper]",
      ),
    );
    await fs.writeFile(
      path.join(processRoot, "policies/execution-helper.yaml"),
      `kind: policy-definition
id: execution-helper
version: 1
description: Invalid helper whose answer is unavailable before execution.
parameters:
  - {name: selected_process, kind: process}
result_schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  additionalProperties: false
  required: [allowed]
  properties:
    allowed: {type: boolean}
default: {allowed: false}
rules:
  - priority: 100
    when: 'execution.integrity.contract_valid == true'
    result: {allowed: true}
`,
    );
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8"))
        .replace(
          "{name: selected_process, kind: process}",
          "{name: selected_process, kind: scalar, scalar_type: boolean}",
        )
        .replace(
          "selected_process.integrity.package_valid == true",
          "selected_process == true",
        ),
    );
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "    selected_process: process",
        `    selected_process: 'policy("execution-helper@1", {selected_process: process}).allowed'`,
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-execution-binding-forbidden",
      }),
    ]));
  });

  it("rejects a participation Policy that transitively depends on execution", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "selected_process.integrity.package_valid == true",
        "execution.integrity.contract_valid == true",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-execution-binding-forbidden",
      }),
    ]));
  });

  it("rejects a Revision argument for a baseline-only Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    const source = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      source.replace(
        "{name: question, kind: revision, types: [QST]}",
        "{name: question, kind: baseline, types: [QST]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-policy-argument-type",
      }),
    ]));
  });

  it("rejects an invalid Authority Requirement or Attention Schedule result", () => {
    const policy = clonedPolicy("question-participation");
    object(policy.default).attention_checkpoint = null;

    expect(validateParticipationPolicy(policy, "policies.question-participation"))
      .toEqual([{
        code: "participation-policy-result",
        path: "policies.question-participation.default",
        message: "Participation Policy 'question-participation@1' has an invalid Authority Requirement or Attention Schedule result",
      }]);
  });

  it("rejects results that violate additional declared Policy constraints", () => {
    const policy = clonedPolicy("question-participation");
    const schema = object(policy.result_schema);
    const properties = object(schema.properties);
    object(properties.authority).enum = ["stakeholder"];

    expect(validateParticipationPolicy(policy, "policies.question-participation"))
      .toEqual([
        {
          code: "participation-policy-result",
          path: "policies.question-participation.rules[0].result",
          message: "Participation Policy 'question-participation@1' has an invalid Authority Requirement or Attention Schedule result",
        },
        {
          code: "participation-policy-result",
          path: "policies.question-participation.rules[1].result",
          message: "Participation Policy 'question-participation@1' has an invalid Authority Requirement or Attention Schedule result",
        },
      ]);
  });

  it("rejects a Policy without the standardized participation result", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    const source = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      source.replace(
        "    consolidation_group: {type: [string, 'null']}",
        "    consolidation_group: {type: string}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "participation-policy-result-schema" }),
    ]));
  });
});
