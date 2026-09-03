import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import { validateDefinitionGraph } from "../src/definition-graph.js";
import {
  compileAssignmentProjection,
  loadProcessPackage,
  publicAssignmentRenderer,
  type ProcessPackage,
} from "../src/index.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import { validateScenarioContracts } from "../src/scenario-contract.js";
import {
  canonicalProcessPackage,
  verifyCanonicalProcessPackageFixture,
} from "./helpers/canonical-process-package-fixture.js";

const CONTENDED_SETUP_HOOK_TIMEOUT_MS = 20_000;
const CANONICAL_PROCESS_ROOT = ".lifecycle/process";

async function copiedProcessPackage(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

describe("canonical immutable ProcessPackage fixture", () => {
  let livePackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(CANONICAL_PROCESS_ROOT);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!loaded.ok) throw new Error("Canonical process package did not load");
    livePackage = loaded.package;
  }, CONTENDED_SETUP_HOOK_TIMEOUT_MS);

  it("is exact, recursively frozen, and isolated from mutable clones", async () => {
    const fixturePackage = await canonicalProcessPackage();
    await expect(verifyCanonicalProcessPackageFixture(livePackage)).resolves.toEqual({
      processPackage:
        `${livePackage.manifest.id}@${livePackage.manifest.version}`,
      verified: true,
    });
    expect(fixturePackage).toStrictEqual(livePackage);

    const assertFrozen = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const nested of Object.values(value)) assertFrozen(nested);
    };
    assertFrozen(fixturePackage);

    const mutable = structuredClone(fixturePackage);
    mutable.manifest.version = "mutated-test-clone";
    expect(fixturePackage.manifest.version).toBe(livePackage.manifest.version);
  });

  it("rejects artifact hash and package-digest drift", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-canonical-fixture-"));
    try {
      const fixtureRoot = path.join(temporaryRoot, "fixture");
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const manifestPath = path.join(fixtureRoot, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        artifact: { archive: string };
        processPackage: { digest: string };
      };
      const archivePath = path.join(fixtureRoot, manifest.artifact.archive);
      await fs.appendFile(archivePath, "drift");
      await expect(canonicalProcessPackage({ fixtureRoot })).rejects.toThrow(
        "Compressed digest mismatch",
      );

      await fs.rm(fixtureRoot, { recursive: true, force: true });
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const driftedManifest = JSON.parse(
        await fs.readFile(path.join(fixtureRoot, "manifest.json"), "utf8"),
      ) as { processPackage: { digest: string } };
      driftedManifest.processPackage.digest = `sha256:${"0".repeat(64)}`;
      await fs.writeFile(
        path.join(fixtureRoot, "manifest.json"),
        `${JSON.stringify(driftedManifest, null, 2)}\n`,
      );
      await expect(
        verifyCanonicalProcessPackageFixture(livePackage, { fixtureRoot }),
      ).rejects.toThrow("Source Process Package digest mismatch");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

});

describe("loadProcessPackage", () => {
  let validPackage: ProcessPackage;

  beforeAll(async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!result.ok) throw new Error("Bootstrap process package did not load");
    validPackage = result.package;
  }, CONTENDED_SETUP_HOOK_TIMEOUT_MS);

  function clonedValidPackage(): ProcessPackage {
    return structuredClone(validPackage);
  }

  function graphResult(processPackage: ProcessPackage) {
    const diagnostics = validateDefinitionGraph(
      processPackage.manifest,
      processPackage,
    );
    return { ok: diagnostics.length === 0, diagnostics };
  }

  it("states the exact pilot behavior-array copies required by completion", async () => {
    const [prototypePrompt, implementationPrompt] = await Promise.all([
      fs.readFile(
        path.join(
          process.cwd(),
          ".lifecycle/process/prompts/build-representative-level-pilot-control-prototype.md",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          ".lifecycle/process/prompts/implement-verification-activity.md",
        ),
        "utf8",
      ),
    ]);

    expect(prototypePrompt.replace(/\s+/g, " ")).toContain(
      "Set `supported_behavior` to a one-item array whose sole item copies the bound activity's `expected_success_activity` exactly. Set `unsupported_behavior` to a one-item array whose sole item copies the bound activity's `expected_discrimination_activity` exactly.",
    );
    expect(implementationPrompt.replace(/\s+/g, " ")).toContain(
      "Copy the supplied ART's `supported_behavior` array exactly into `target_behavior.supported`, and copy its `unsupported_behavior` array exactly into `target_behavior.intentionally_unsupported`. Do not paraphrase either array.",
    );
  });

  function scenarioContractResult(processPackage: ProcessPackage) {
    const diagnostics = validateScenarioContracts(processPackage);
    return { ok: diagnostics.length === 0, diagnostics };
  }

  it("states the exact suitable-pilot control judgment shape", async () => {
    const prompt = await fs.readFile(
      path.join(
        process.cwd(),
        ".lifecycle/process/prompts/execute-verification-run.md",
      ),
      "utf8",
    );

    expect(prompt.replace(/\s+/g, " ")).toContain(
      "For a suitable pilot, set `RES.payload.control_judgments` to exactly these entries: ```yaml known_good: {observation_ref: known_good, outcome: pass} known_bad: {observation_ref: known_bad, outcome: fail} ```",
    );
  });

  function record(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Expected definition field to be a record");
    }
    return value as Record<string, unknown>;
  }

  function records(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      throw new Error("Expected definition field to be an array");
    }
    return value.map(record);
  }

  it("keeps the lower-level strategy prompt aligned with each definition phase", async () => {
    const prompt = await fs.readFile(
      path.join(
        process.cwd(),
        ".lifecycle/process/prompts/define-lower-level-verification-strategy.md",
      ),
      "utf8",
    );
    const normalized = prompt.replace(/\s+/g, " ");

    expect(normalized).toContain("`system` in Phase 2 system definition");
    expect(normalized).toContain("`component` in Phase 3 component definition");
    expect(normalized).toContain("`design` in Phase 4 design definition");
  });

  it("binds scalar continuation outputs to their exact input lineages", () => {
    const bindings = [
      ["reevaluate-shared-system-consumer", "replacement_consumer", "consumer"],
      ["replan-stale-decomposition-work-package", "replacement_plan", "prior_plan"],
      ["resolve-question-with-prototype", "updated_question", "question"],
      ["revise-phase-2-subject-after-simplification", "replacement", "subject"],
      ["revise-pilot-assessment-after-review", "replacement", "assessment"],
      ["revise-pilot-expansion-decision-after-review", "replacement", "decision"],
      ["revise-pilot-vai-after-result", "replacement_environment", "environment"],
      ["revise-environment-after-failed-qualification", "replacement", "environment"],
    ] as const;

    for (const [scenarioId, outputName, inputName] of bindings) {
      const scenario = validPackage.scenarios[scenarioId]!;
      const output = records(scenario.outputs).find((item) =>
        item.name === outputName
      );
      expect(output?.identity_from, `${scenarioId}.${outputName}`).toEqual({
        input: inputName,
      });
    }
  });

  it("binds direct completion identity equalities to their exact inputs", () => {
    const bindings = [
      ["close-change-request", "closed_problem", "problem"],
      ["revise-candidate-correction-decision-after-review", "replacement", "decision"],
      ["revise-change-disposition-after-review", "replacement", "decision"],
      ["revise-foundation-correction-decision-after-review", "replacement", "decision"],
    ] as const;

    for (const [scenarioId, outputName, inputName] of bindings) {
      const scenario = validPackage.scenarios[scenarioId]!;
      const output = records(scenario.outputs).find((item) =>
        item.name === outputName
      );
      expect(output?.identity_from, `${scenarioId}.${outputName}`).toEqual({
        input: inputName,
      });
    }
  });

  it("rejects required payload references that cannot bind one exact input", () => {
    const scenario = structuredClone(
      validPackage.scenarios["create-definition-level-candidate"]!,
    );
    const output = records(scenario.outputs)[0]!;

    output.required_payload = { scope: "$input.missing.revision_id" };
    expect(validateScenarioContracts({
      obligations: validPackage.obligations,
      scenarios: { [scenario.id]: scenario },
      phases: validPackage.phases,
      types: validPackage.types,
      templates: validPackage.templates,
    })).toEqual(expect.arrayContaining([expect.objectContaining({
      code: "unknown-required-payload-input",
    })]));

    output.required_payload = { scope: "$input.evidence.revision_id" };
    expect(validateScenarioContracts({
      obligations: validPackage.obligations,
      scenarios: { [scenario.id]: scenario },
      phases: validPackage.phases,
      types: validPackage.types,
      templates: validPackage.templates,
    })).toEqual(expect.arrayContaining([expect.objectContaining({
      code: "incompatible-required-payload-input",
    })]));
  });

  it("rejects a Selector that no other declaration references", async () => {
    const processRoot = await copiedProcessPackage();
    try {
      const orphan = parse(await fs.readFile(
        path.join(processRoot, "selectors/open-questions.yaml"),
        "utf8",
      ));
      orphan.id = "orphan-questions";
      await fs.writeFile(
        path.join(processRoot, "selectors/orphan-questions.yaml"),
        stringify(orphan),
      );

      expect(await loadProcessPackage(processRoot)).toMatchObject({
        ok: false,
        diagnostics: [{
          code: "unreferenced-selector",
          path: "selectors/orphan-questions",
          message:
            "Selector 'orphan-questions' is not referenced by any other declaration",
        }],
      });
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });

  it("rejects a direct completion identity equality without its binding", async () => {
    const processRoot = await copiedProcessPackage();
    try {
      const scenarioPath = path.join(
        processRoot,
        "scenarios/close-change-request.yaml",
      );
      const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
      delete scenario.outputs[1].identity_from;
      await fs.writeFile(scenarioPath, stringify(scenario));

      expect(await loadProcessPackage(processRoot)).toMatchObject({
        ok: false,
        diagnostics: [{
          code: "scenario-output-identity-binding-mismatch",
          path: "scenarios.close-change-request.outputs[1].identity_from",
          message:
            "Scenario 'close-change-request' output 'closed_problem' requires identity_from input 'problem' to satisfy its direct completion identity equality",
        }],
      });
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });

  it("compiles complete support links for Phase 2 continuation Assignments", () => {
    const routes = [
      ["reevaluate-shared-system-consumer", "replacement_consumer", [
        ["decomposes", "parents"],
        ["decomposes", "replacement_requirements"],
        ["allocated-to", "architecture"],
        ["governed-by", "interfaces"],
        ["verified-under", "verification_strategy"],
        ["derived-from", "planning_source"],
        ["produces", "outputs"],
        ["justifies", "simplification_reviews"],
        ["corrects-review", "review_causes"],
        ["changed-under", "change_causes"],
      ]],
      ["replan-stale-decomposition-work-package", "replacement_plan", [
        ["decomposes", "subjects"],
        ["allocated-to", "architecture"],
        ["governed-by", "interfaces"],
        ["verified-under", "verification_strategy"],
        ["corrects-review", "review_causes"],
        ["changed-under", "change_causes"],
      ]],
      ["resolve-question-with-prototype", "updated_question", [
        ["blocks", "blocked_targets"],
      ]],
    ] as const;

    for (const [scenarioId, outputName, links] of routes) {
      const compiled = compileAssignmentProjection({
        scenario: validPackage.scenarios[scenarioId]!,
        renderer: publicAssignmentRenderer,
        source: `.lifecycle/process/scenarios/${scenarioId}.yaml`,
      });
      expect(compiled.ok, scenarioId).toBe(true);
      if (!compiled.ok) continue;
      const output = compiled.plan.outputs.find((item) =>
        item.output === outputName
      );
      expect(output?.links, scenarioId).toEqual(links.map(([link, input]) => ({
        link,
        target: { kind: "input", input },
      })));
    }

    const sharedConsumerResolver = record(
      validPackage.obligations["shared-system-consumer-reevaluation-required"]!
        .resolve_with,
    );
    const sharedConsumerInputs = record(sharedConsumerResolver.inputs);
    expect(record(sharedConsumerInputs.replacement_requirements).source).toBe(
      'select("system-requirements-after-consumer-reevaluation@1", {consumer: consumer})',
    );
    const prototypeInputs = record(record(
      validPackage.obligations["prototype-question-resolution"]!.resolve_with,
    ).inputs);
    expect(record(prototypeInputs.blocked_targets).source).toBe(
      'select("blocked-targets-for-question@1", {question: question})',
    );
  });

  it("rejects an unrenderable Assignment route at the package-loader seam", async () => {
    const processRoot = await copiedProcessPackage();
    try {
      const scenarioPath = path.join(
        processRoot,
        "scenarios/revise-requirement-under-change.yaml",
      );
      const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
      delete scenario.outputs[0].identity_from;
      await fs.writeFile(scenarioPath, stringify(scenario));

      expect(await loadProcessPackage(processRoot)).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({
          code: "missing-type-route",
          path: expect.stringMatching(
            /revise-requirement-under-change\.yaml#outputs\[0\]\.types$/,
          ),
        })]),
      });
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });

  it("rejects an output type route whose input payload path is not a string field", async () => {
    const processRoot = await copiedProcessPackage();
    try {
      const scenarioPath = path.join(
        processRoot,
        "scenarios/execute-lower-level-decomposition-work-package.yaml",
      );
      const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
      scenario.outputs[0].type_from.path = "missing_target_type";
      await fs.writeFile(scenarioPath, stringify(scenario));

      expect(await loadProcessPackage(processRoot)).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({
          code: "invalid-output-type-payload-path",
          path: expect.stringMatching(
            /execute-lower-level-decomposition-work-package\.outputs\[0\]\.type_from\.path$/,
          ),
        })]),
      });
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });

  it("recalculates a package digest after nested package bytes change", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-package-digest-"));
    try {
      const nested = path.join(root, "definitions");
      await fs.mkdir(nested);
      const definition = path.join(nested, "example.yaml");
      await fs.writeFile(definition, "value: one\n");
      const initial = await processPackageDigest(root);

      await fs.writeFile(definition, "value: two\n");

      expect(await processPackageDigest(root)).not.toBe(initial);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("isolates parsed documents and refreshes validators after schema bytes change", async () => {
    const processRoot = await copiedProcessPackage();
    try {
      const first = await loadProcessPackage(processRoot);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      first.package.manifest.version = "poisoned-by-caller";

      const second = await loadProcessPackage(processRoot);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.package.manifest.version).toBe(validPackage.manifest.version);

      const manifestSchemaPath = path.join(
        processRoot,
        "meta",
        "manifest.schema.json",
      );
      const manifestSchema = JSON.parse(
        await fs.readFile(manifestSchemaPath, "utf8"),
      ) as Record<string, unknown>;
      await fs.writeFile(
        manifestSchemaPath,
        `${JSON.stringify({ ...manifestSchema, not: {} }, null, 2)}\n`,
      );

      const changedSchema = await loadProcessPackage(processRoot);
      expect(changedSchema.ok).toBe(false);
      expect(changedSchema.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "meta-schema",
          path: expect.stringMatching(/manifest\.yaml$/),
        }),
      ]));
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });

  it("rejects review Policy argument mappings that do not cover the Policy", () => {
    const processPackage = clonedValidPackage();
    const scenario = processPackage.scenarios["review-datum-in-context"]!;
    const argumentsByName = record(scenario.review_policy_arguments);
    argumentsByName.other = argumentsByName.subject;
    delete argumentsByName.subject;

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "review-policy-arguments",
      path: "scenarios.review-datum-in-context.review_policy_arguments",
      message: expect.stringContaining("missing: subject; unknown: other"),
    }));
  });

  it("rejects review Policy arguments bound to a missing Scenario input", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("  subject: subject", "  subject: absent"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "expression-unknown-binding",
      path: expect.stringContaining(
        "review-datum-in-context.yaml#review_policy_arguments.subject",
      ),
    }));
  });

  it("rejects Review Policy arguments with incompatible parameter kinds", async () => {
    const processRoot = await copiedProcessPackage();
    const policyPath = path.join(
      processRoot,
      "policies/review-applicability.yaml",
    );
    const policy = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      policy.replace("kind: revision", "kind: stable-datum"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "review-policy-argument-type",
      path: expect.stringContaining(
        "review-datum-in-context.yaml#review_policy_arguments.subject",
      ),
    }));
  });

  it("rejects Review Policies with duplicate parameter names", () => {
    const processPackage = clonedValidPackage();
    const policy = processPackage.policies["review-applicability"]!;
    const parameters = records(policy.parameters);
    policy.parameters = [...parameters, { ...parameters[0] }];

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "policy-parameters",
      path: "policies.review-applicability.parameters",
    }));
  });

  it("rejects malformed and unresolved terminal outcome declarations", async () => {
    const malformedRoot = await copiedProcessPackage();
    const malformedPath = path.join(malformedRoot, "profiles/bootstrap.yaml");
    const malformed = await fs.readFile(malformedPath, "utf8");
    await fs.writeFile(
      malformedPath,
      malformed.replace(
        /    explanation: The selected profile[^\n]+/,
        "    explanation: ''",
      ),
    );
    const unresolvedRoot = await copiedProcessPackage();
    const unresolvedPath = path.join(unresolvedRoot, "profiles/bootstrap.yaml");
    const unresolved = await fs.readFile(unresolvedPath, "utf8");
    await fs.writeFile(
      unresolvedPath,
      unresolved.replace(
        'exists("all-pilot-assessments@1", {})',
        'exists("unknown-terminal-evidence@1", {})',
      ),
    );
    const [malformedResult, unresolvedResult] = await Promise.all([
      loadProcessPackage(malformedRoot),
      loadProcessPackage(unresolvedRoot),
    ]);

    expect(malformedResult).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "meta-schema",
        path: expect.stringContaining(
          "bootstrap.yaml/terminal_outcomes/profile_boundary/explanation",
        ),
      })]),
    }));
    expect(unresolvedResult).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "expression-unknown-selector",
        path: expect.stringContaining(
          "terminal_outcomes.profile_boundary.condition",
        ),
      })]),
    }));
  });

  it("rejects ambiguous terminal outcome declarations", () => {
    const processPackage = clonedValidPackage();
    const outcomes = record(
      processPackage.profiles.bootstrap!.terminal_outcomes,
    );
    const boundary = record(outcomes.profile_boundary);
    const complete = record(outcomes.lifecycle_complete);
    complete.condition = structuredClone(boundary.condition);

    const result = graphResult(processPackage);

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "ambiguous-terminal-outcomes",
        path: "profiles.bootstrap.terminal_outcomes",
      })],
    });
  });

  it("rejects ambiguous explicit-initiation and Resolver semantics", () => {
    const processPackage = clonedValidPackage();
    processPackage.scenarios["chart-wayfinding-map"]!.resolves = [
      "open-question-resolution",
    ];

    const result = scenarioContractResult(processPackage);

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "scenario-authorization-ambiguous",
        path: "scenarios.chart-wayfinding-map.initiation",
      })],
    });
  });

  it("rejects every legacy YAML expression-tree family", async () => {
    const legacyForms = {
      literal: "literal: true",
      var: "var: subject",
      path: "path: {var: subject, field: identity.type}",
      state: "state: {dimension: validity, subject: {var: subject}}",
      policy:
        "policy: {ref: review-applicability@1, arguments: {subject: {var: subject}}, field: required}",
      count:
        "count: {selector: review-required-revisions@1, arguments: {}}",
      compare:
        "compare: {left: {literal: true}, operator: eq, right: {literal: true}}",
      all: "all: [{present: {var: subject}}]",
      any: "any: [{present: {var: subject}}]",
      not: "not: {present: {var: subject}}",
      exists:
        "exists: {selector: review-required-revisions@1, arguments: {}}",
      none: "none: {selector: review-required-revisions@1, arguments: {}}",
      every:
        "every: {selector: review-required-revisions@1, arguments: {}, as: item, satisfies: {present: {var: item}}}",
      present: "present: {var: subject}",
    };
    const processRoot = await copiedProcessPackage();
    try {
      const statePath = path.join(
        processRoot,
        "states/relationship-overlays.yaml",
      );
      const state = await fs.readFile(statePath, "utf8");
      const legacyRules = Object.entries(legacyForms).map(
        ([family, source], index) => `  - value: process-drift
    priority: ${90 - index}
    when:
      ${source}
    explanation: Reject the legacy ${family} expression family.`,
      ).join("\n");
      await fs.writeFile(statePath, `${state.trimEnd()}\n${legacyRules}\n`);

      const result = await loadProcessPackage(processRoot);

      expect(result.ok).toBe(false);
      const expectedRuleIndexes = Object.keys(legacyForms).map(
        (_, index) => index + 3,
      );
      expect(result.diagnostics.filter((item) =>
        item.code === "legacy-expression-authoring"
      )).toEqual(expectedRuleIndexes.map((index) => expect.objectContaining({
        path: expect.stringContaining(
          `relationship-overlays.yaml#rules[${index}].when`,
        ),
        message:
          "Expression-bearing fields require mdlm-expression@1 textual source; legacy YAML expression trees are not accepted",
      })));
      expect(result.diagnostics.filter((item) =>
        item.code === "meta-schema" &&
        item.path?.includes("relationship-overlays.yaml/rules/")
      )).toEqual(expectedRuleIndexes.map((index) => expect.objectContaining({
        path: expect.stringContaining(
          `relationship-overlays.yaml/rules/${index}/when`,
        ),
        message: "must be string",
      })));
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects a legacy structural Selector invocation", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/candidate-gate-signoff.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace(
        "for_each: 'select(\"gate-authorization-candidates@1\", {})'",
        "for_each: {selector: gate-authorization-candidates@1, arguments: {}}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "legacy-expression-authoring",
          path: expect.stringContaining(
            "candidate-gate-signoff.yaml#for_each",
          ),
        }),
      ]),
    );
  });

  it("rejects a package that does not pin mdlm-expression@1", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    await fs.writeFile(
      manifestPath,
      manifest.replace("mdlm-expression@1", "mdlm-expression@2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "meta-schema",
          path: expect.stringContaining("manifest.yaml/language/expressions"),
          message: "must be equal to constant",
        }),
      ]),
    );
  });

  it("rejects mismatched Policy and unknown Resolver references in one package", () => {
    const processPackage = clonedValidPackage();
    processPackage.scenarios["compile-psp"]!.review_policy_ref =
      "review-applicability@2";
    record(
      processPackage.obligations["review-context-required"]!.resolve_with,
    ).scenario = "missing-scenario@1";
    processPackage.scenarios["create-review-context"]!.resolves = [
      "missing-obligation",
    ];

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "version-mismatch",
          path: "scenarios.compile-psp.review_policy_ref",
          message:
            "Reference 'review-applicability@2' resolves to review-applicability@1",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "obligations.review-context-required.resolve_with.scenario",
          message: "Unknown Scenario reference 'missing-scenario@1'",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "scenarios.create-review-context.resolves[0]",
          message: "Unknown Obligation reference 'missing-obligation'",
        }),
      ]),
    );
  });

  it("rejects an unknown Policy reference in a Scenario", () => {
    const processPackage = clonedValidPackage();
    processPackage.scenarios["compile-psp"]!.review_policy_ref =
      "missing-policy@1";

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "scenarios.compile-psp.review_policy_ref",
          message: "Unknown Policy reference 'missing-policy@1'",
        }),
      ]),
    );
  });

  it("rejects malformed Resolver inputs and Scenario contracts in one package", () => {
    const processPackage = clonedValidPackage();
    const resolver = record(
      processPackage.obligations["review-context-required"]!.resolve_with,
    );
    const resolverInputs = record(resolver.inputs);
    resolver.inputs = { surprise: resolverInputs.subject };
    const reviewInputs = records(
      processPackage.scenarios["review-datum-in-context"]!.inputs,
    );
    reviewInputs.find((input) => input.name === "subject")!.types = ["QST"];
    records(
      processPackage.scenarios["compile-psp"]!.outputs,
    )[0]!.types = ["XYZ"];

    const result = scenarioContractResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-missing",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
        }),
        expect.objectContaining({
          code: "resolver-input-undeclared",
          path: "obligations.review-context-required.resolve_with.inputs.surprise",
        }),
        expect.objectContaining({
          code: "impossible-required-link-target",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'reviews' from output type REV to input 'subject' of unsupported type QST",
        }),
        expect.objectContaining({
          code: "unknown-scenario-output-type",
          path: "scenarios.compile-psp.outputs[0].types[0]",
          message:
            "Scenario 'compile-psp' output 'product_specification' references undeclared lifecycle type 'XYZ'",
        }),
      ]),
    );
  });

  it("rejects incompatible Scenario contracts in one malformed package", () => {
    const processPackage = clonedValidPackage();
    const resolverScenario = processPackage.scenarios["create-review-context"]!;
    const resolverSubject = records(resolverScenario.inputs)
      .find((input) => input.name === "subject")!;
    resolverSubject.types = ["QST"];
    resolverSubject.identity = "stable";
    resolverSubject.cardinality = "one-or-more";
    resolverScenario.prohibited_inputs = ["subject"];
    const reviewInputs = records(
      processPackage.scenarios["review-datum-in-context"]!.inputs,
    );
    reviewInputs.find((input) => input.name === "review_context")!.cardinality =
      "zero-or-one";
    reviewInputs.find((input) => input.name === "subject")!.identity = "stable";

    const result = scenarioContractResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-type",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
        }),
        expect.objectContaining({
          code: "resolver-input-kind",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
        }),
        expect.objectContaining({
          code: "resolver-input-cardinality",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
        }),
        expect.objectContaining({
          code: "impossible-required-link-cardinality",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[1].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'contextualizes' with at least one target, but input 'review_context' may provide zero",
        }),
        expect.objectContaining({
          code: "impossible-required-link-identity",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'reviews' from output type REV to revision identity, but input 'subject' provides stable",
        }),
        expect.objectContaining({
          code: "prohibited-scenario-input",
          path: "scenarios.create-review-context.prohibited_inputs[0]",
          message:
            "Scenario 'create-review-context' declares input 'subject' as prohibited",
        }),
      ]),
    );
  });

  it("rejects a required link unavailable on the declared output type", () => {
    const processPackage = clonedValidPackage();
    records(
      processPackage.scenarios["review-datum-in-context"]!.outputs,
    )[0]!.types = ["DEC"];

    const result = scenarioContractResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impossible-required-link",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].link",
          message:
            "Scenario 'review-datum-in-context' output 'review' requires link 'reviews', but output type DEC does not declare it",
        }),
      ]),
    );
  });

  it("rejects a required output link to an undeclared Scenario value", () => {
    const processPackage = clonedValidPackage();
    const reviewOutput = records(
      processPackage.scenarios["review-datum-in-context"]!.outputs,
    )[0]!;
    const reviewsLink = records(reviewOutput.required_links)[0]!;
    record(reviewsLink.target).input = "missing";

    const result = scenarioContractResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-required-link-target",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' output 'review' requires link 'reviews' to undeclared input 'missing'",
        }),
      ]),
    );
  });

  it("rejects an unknown readiness Selector in a Phase checkpoint", async () => {
    const processRoot = await copiedProcessPackage();
    const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    await fs.writeFile(
      phasePath,
      phase.replace(
        '      exists("candidate-baselines-of-kind@1", {baseline_kind: "intent-level-candidate"})',
        '      exists("missing-checkpoint-selector@1", {})',
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-selector",
          path: expect.stringContaining("#attention_checkpoints[0].readiness"),
        }),
      ]),
    );
  });

  it("rejects malformed Phase and Obligation graph references", () => {
    const processPackage = clonedValidPackage();
    const phase = processPackage.phases["phase-0-wayfinding"]!;
    const obligations = [...(phase.obligations as unknown[])];
    obligations[8] = "missing-obligation@2";
    phase.obligations = obligations;
    const checkpoints = records(phase.attention_checkpoints);
    phase.attention_checkpoints = [
      ...checkpoints,
      { ...checkpoints[0], readiness: { source: "true" } },
    ];
    record(phase.gate).obligation = "missing-gate-obligation@2";
    const progression = record(phase.progression);
    progression.next_phase = "phase-9-missing";
    record(progression.authorization).evidence_selector =
      "missing-progression-evidence@1";

    const statusRules = records(
      processPackage.obligations["passing-review-required"]!.status_rules,
    );
    records(statusRules[1]!.blocked_by)[0]!.obligation =
      "missing-obligation@2";
    processPackage.obligations["review-context-required"]!.phases = [
      "phase-9-missing",
    ];

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "phases.phase-0-wayfinding.obligations[8]",
          message: "Unknown Obligation reference 'missing-obligation@2'",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path:
            "obligations.passing-review-required.status_rules[1].blocked_by[0].obligation",
          message: "Unknown Obligation reference 'missing-obligation@2'",
        }),
        expect.objectContaining({ code: "duplicate-attention-checkpoint" }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "phases.phase-0-wayfinding.gate.obligation",
          message: "Unknown Obligation reference 'missing-gate-obligation@2'",
        }),
        expect.objectContaining({
          code: "unknown-phase-reference",
          path: "phases.phase-0-wayfinding.progression.next_phase",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path:
            "phases.phase-0-wayfinding.progression.authorization.evidence_selector",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "obligations.review-context-required.phases[0]",
          message: "Unknown Phase reference 'phase-9-missing'",
        }),
      ]),
    );
  });

  it("rejects an obligation that references an unknown selector", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("review-context-subjects@1", "missing-selector@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-selector",
          path: expect.stringContaining(
            "review-context-required.yaml#for_each",
          ),
          line: 1,
          column: 8,
          message: "Unknown Selector 'missing-selector@1'",
        }),
      ]),
    );
  });

  it("rejects malformed inheritance and Selector dependencies in one package", async () => {
    const processRoot = await copiedProcessPackage();
    const templatePath = path.join(
      processRoot,
      "templates/requirement.yaml",
    );
    const template = await fs.readFile(templatePath, "utf8");
    const duplicateLink = `outgoing_links:
  - id: derived-from
    description: Generic inherited provenance.
    targets:
      - {kind: datum, types: [PSP], identity: stable}
    cardinality: {minimum: 1, maximum: 1}
    freeze_resolution: exact-revision
    inverse_label: derives
`;
    await fs.writeFile(
      templatePath,
      template.replace("outgoing_links:\n", duplicateLink),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: number, minimum: 1}",
      ),
    );
    const acceptedPath = path.join(
      processRoot,
      "selectors/newer-accepted-revisions-for.yaml",
    );
    const accepted = await fs.readFile(acceptedPath, "utf8");
    await fs.writeFile(
      acceptedPath,
      accepted.replace(
        "selector: newer-revisions-for@1",
        "selector: newer-editable-revisions-for@1",
      ),
    );
    const editablePath = path.join(
      processRoot,
      "selectors/newer-editable-revisions-for.yaml",
    );
    const editable = await fs.readFile(editablePath, "utf8");
    await fs.writeFile(
      editablePath,
      editable.replace(
        "selector: newer-revisions-for@1",
        "selector: newer-accepted-revisions-for@1",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate-inherited-link",
          path: "types.STK.outgoing_links",
          message:
            "Lifecycle type 'STK' redeclares inherited outgoing link 'derived-from'",
        }),
        expect.objectContaining({
          code: "incompatible-inherited-property",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.type",
          message:
            "Payload Template 'rationale-bearing' changes inherited property 'title' from type string to number",
        }),
        expect.objectContaining({
          code: "expression-dependency-cycle",
          path: "selector:newer-accepted-revisions-for",
          message:
            "Expression dependency cycle: Selector 'newer-accepted-revisions-for@1' -> Selector 'newer-editable-revisions-for@1' -> Selector 'newer-accepted-revisions-for@1'",
        }),
      ]),
    );
  });

  it("rejects inherited payload widening and unknown template extension", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace("minLength: 1", "minLength: 5"),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: string, minLength: 2}",
      ),
    );
    const typePath = path.join(processRoot, "types/STK.yaml");
    const typeDefinition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      typeDefinition.replace("requirement@2", "missing-template@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe-schema-widening",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.minLength",
          message:
            "Payload Template 'rationale-bearing' widens inherited constraint 'title.minLength' from 5 to 2",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          message: expect.stringContaining("missing-template@1"),
        }),
      ]),
    );
  });

  it("rejects removal of a required field from an inherited property schema", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace(
        "    title: {type: string, minLength: 1}",
        "    title:\n      type: object\n      required: [text]\n      properties:\n        text: {type: string, minLength: 1}",
      ),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title:\n      type: object\n      required: []\n      properties:\n        text: {type: string, minLength: 1}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "inherited-required-field-removed",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.required",
          message:
            "Payload Template 'rationale-bearing' removes inherited required fields from 'title': text",
        }),
      ]),
    );
  });

  it("rejects invalid and unsafe prompt and skill assets in one package", async () => {
    const processRoot = await copiedProcessPackage();
    const declarationPromptPath = path.join(
      processRoot,
      "prompts/escalate-foundation-review-correction.md",
    );
    await fs.writeFile(
      declarationPromptPath,
      (await fs.readFile(declarationPromptPath, "utf8")).replace(
        "skills/requirement-writing.md@1",
        "skills/not-declared.md@1",
      ),
    );
    const promptPath = path.join(
      processRoot,
      "prompts/chart-wayfinding-map.md",
    );
    const outsidePath = path.join(path.dirname(processRoot), "outside-prompt.md");
    await fs.writeFile(
      outsidePath,
      await fs.readFile(promptPath, "utf8"),
    );
    await fs.rm(promptPath);
    await fs.symlink(outsidePath, promptPath);
    const skillPath = path.join(processRoot, "skills/lifecycle-data.md");
    await fs.writeFile(
      skillPath,
      (await fs.readFile(skillPath, "utf8")).replace("version: 1", "version: 2"),
    );
    const duplicateSkillPromptPath = path.join(
      processRoot,
      "prompts/compile-psp.md",
    );
    await fs.appendFile(
      duplicateSkillPromptPath,
      "\nLoad `skills/lifecycle-data.md@1` again.\n",
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "skill-read",
      path: path.join(processRoot, "skills/not-declared.md"),
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-outside-package",
      path: promptPath,
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "skill-version-mismatch",
      path: skillPath,
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skills-invalid",
      path: duplicateSkillPromptPath,
    }));
  });

  it("rejects a template inheritance cycle before any type is resolved", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const templatePath = path.join(processRoot, "templates/titled-datum.yaml");
    const templateDefinition = await fs.readFile(templatePath, "utf8");
    await fs.writeFile(
      templatePath,
      templateDefinition.replace(
        "description: Payload fields",
        "extends: requirement@2\ndescription: Payload fields",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reference-cycle",
          path: "templates.rationale-bearing.extends",
          message:
            "The template inheritance graph contains a cycle: rationale-bearing -> titled-datum -> requirement -> rationale-bearing",
        }),
      ]),
    );
  });
});
