import { expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
} from "../src/index.js";
import { scenarioOutputExplanations } from "../src/evaluator.js";
import { compileDefinitionExpressions } from "../src/expression.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import {
  assignmentPayloadScaffold,
  assignmentPayloadSummary,
} from "../src/assignment.js";
import {
  type PreparedScenarioSubmission,
  submitPreparedResolverScenario,
} from "../src/scenario-execution.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

it("publishes a DWP completion in the input plan lineage", async () => {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;
  const processPackage = structuredClone(loaded.package);

  const processRef = "mdlm-bootstrap@0.96.0#dwp-completion-identity";
  const record = (
    type: string,
    id: string,
    payload: Record<string, unknown> = {},
    links: { type: string; target: string }[] = [],
  ) => lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef, scenario: "test-fixture@1" },
    storage: { editable: false, frozen: true },
  });
  const parent = record("STK", "STK-4510000001");
  const architecture = record("ASP", "ASP-4510000001");
  const strategy = record("VSP", "VSP-4510000001");
  const plan = record("DWP", "DWP-4510000001", {
    title: "Counter decomposition",
    rationale: "One work package covers the behavior.",
    stage: "planning",
    architecture_element: "AEL-4510000001",
    target_child_type: "SYS",
    behavioral_slice: "Define tab counting.",
    expected_coverage: ["The stakeholder behavior"],
    exclusions: [],
    dependencies: [],
    required_review_policy: "review-applicability@1",
  });
  const output = record("SYS", "SYS-4510000001");
  const simplificationReview = record("REV", "REV-4510000001");
  const records = [parent, architecture, strategy, plan, output, simplificationReview];
  const snapshot = {
    processRef,
    phaseId: "phase-2-system-definition",
    records,
    dependencyComparisons: [],
  };
  const scenario = processPackage.scenarios["complete-decomposition-work-package"]!;
  // Isolate identity materialization from the completion account's other selectors.
  // The output contract remains the real package Scenario contract.
  scenario.completion =
    "execution.integrity.contract_valid == true && completion.identity.id == plan.identity.id";
  expect(compileDefinitionExpressions(
    scenario,
    ".lifecycle/process/scenarios/complete-decomposition-work-package.yaml",
    {
      templates: processPackage.templates,
      types: processPackage.types,
      selectors: processPackage.selectors,
      states: processPackage.states,
      policies: processPackage.policies,
      scenarios: processPackage.scenarios,
      ...(processPackage.kernelCapabilities["exact-baseline@1"]?.type
        ? {
            exactBaselineType:
              processPackage.kernelCapabilities["exact-baseline@1"]!.type,
          }
        : {}),
    },
  )).toEqual([]);
  const focusedCompletion = scenario.completion as { source: string };
  const bound = (name: string, values: typeof records, cardinality: string) => ({
    name,
    contract: {
      types: values.length === 0 ? ["ICSP"] : [values[0]!.datum.type],
      cardinality,
      identity: "revision",
    },
    values: values.map(({ datum }) => ({
      identity: {
        id: datum.id,
        revision_id: datum.revision_id,
        type: datum.type,
        revision: datum.revision,
      },
      data: datum,
    })),
    checks: [],
  });
  const dwp = resolveType(processPackage, "DWP");
  expect(dwp.ok).toBe(true);
  if (!dwp.ok) return;
  const completionDefinition = (scenario.outputs as Record<string, unknown>[])
    .find((output) => output.name === "completion")!;
  const requiredPayload = completionDefinition.required_payload as Record<
    string,
    unknown
  >;
  expect(requiredPayload).toEqual({ stage: "completion" });
  const scaffold = assignmentPayloadScaffold(
    assignmentPayloadSummary(
      dwp.type.payloadSchema,
      dwp.type.kernelManagedPayloadPaths,
    ),
    { ...plan.datum.payload, ...requiredPayload },
    requiredPayload,
  );
  expect(scaffold).toMatchObject({
    stage: "completion",
    parent_coverage_status: null,
    deferred_questions: null,
    cross_group_dependencies: null,
    output_reviews_complete: null,
    simplification_disposition: null,
  });

  const packageIdentity = {
    reference: "mdlm-bootstrap@0.96.0",
    digest: await processPackageDigest(".lifecycle/process"),
    language: "mdlm-expression@1",
  };
  const prepared: PreparedScenarioSubmission = {
    dryRun: {
      executable: true as const,
      sideEffectFree: true as const,
      definition: {
        obligation: "decomposition-completion-required@2",
        scenario: "complete-decomposition-work-package@3",
      },
      authorization: {
        mode: "dispatchable-obligation" as const,
        obligation: "decomposition-completion-required@2:DWP-4510000001-r00001:test",
      },
      obligation: {
        instance: "decomposition-completion-required@2:DWP-4510000001-r00001:test",
        subject: plan.datum.revision_id,
        status: "ready" as const,
        dispatchable: true as const,
      },
      invocations: [{ inputs: [
        bound("plan", [plan], "one"),
        bound("parents", [parent], "one-or-more"),
        bound("outputs", [output], "one-or-more"),
        bound("architecture", [architecture], "one"),
        bound("interfaces", [], "zero-or-more"),
        bound("verification_strategy", [strategy], "one"),
        bound("simplification_reviews", [simplificationReview], "one-or-more"),
      ] }],
      prompt: {
        reference: "prompts/complete-decomposition-work-package.md@1",
        path: ".lifecycle/process/prompts/complete-decomposition-work-package.md",
        digest: `sha256:${"5".repeat(64)}`,
        content: "Complete the exact DWP plan.",
        skills: [],
      },
      policies: [],
      prohibitedInputs: [],
      expectedOutputs: scenarioOutputExplanations(scenario),
      completion: {
        expression: focusedCompletion.source,
        status: "pending-output" as const,
        genericChecks: [],
      },
    },
    evaluation: evaluateLifecycle(processPackage, snapshot),
    scenario,
    snapshot,
    publishMutation: async (_root, _package, _expected, data, executionId) => {
      published.push(...data);
      return {
        ok: true as const,
        value: {
          created: data.map((datum) => ({
            id: datum.id,
            revisionId: datum.revision_id,
            type: datum.type,
            path: `.lifecycle/data/.transactions/${executionId}/${datum.type}.md`,
          })),
          executionPath: `.lifecycle/data/.transactions/${executionId}/execution.json`,
        },
        diagnostics: [],
      };
    },
  };
  const links = [
    { type: "derived-from", target: plan.datum.revision_id },
    { type: "decomposes", target: parent.datum.revision_id },
    { type: "produces", target: output.datum.revision_id },
    { type: "allocated-to", target: architecture.datum.revision_id },
    { type: "verified-under", target: strategy.datum.revision_id },
    { type: "justifies", target: simplificationReview.datum.revision_id },
  ];
  const proposal = (payload: Record<string, unknown>) => ({
    outputs: [{
      name: "completion",
      invocation: 0,
      lifecycleDatum: {
        type: "DWP",
        payload,
        links,
        body: "The completion accounts for the exact plan.\n",
      },
    }],
    completionEvidence: { summary: "The exact plan is complete." },
  });
  const response = (assignment: string, payload: Record<string, unknown>) => ({
    scenarioReference: "complete-decomposition-work-package@3",
    obligationInstance: "decomposition-completion-required@2:DWP-4510000001-r00001:test",
    proposal: proposal(payload),
    assignment,
    responseDigest: `sha256:${"4".repeat(64)}`,
    suppliedAuthorities: [],
    suppliedDelegations: [],
    loadedSkillRefs: [],
  });
  const published: typeof records[number]["datum"][] = [];
  const omitted = await submitPreparedResolverScenario(
    "/tmp/mdlm-dwp-completion-identity",
    processPackage,
    packageIdentity,
    response("451-dwp-completion-omitted-fields", {
      ...plan.datum.payload,
      stage: "completion",
    }),
    prepared,
  );
  expect(omitted.ok).toBe(false);
  if (!omitted.ok) {
    const diagnostic = JSON.stringify(omitted.diagnostics);
    for (const field of [
      "parent_coverage_status",
      "deferred_questions",
      "cross_group_dependencies",
      "output_reviews_complete",
      "simplification_disposition",
    ]) expect(diagnostic).toContain(field);
    expect(diagnostic).not.toContain("scenario-completion-failed");
  }

  const submitted = await submitPreparedResolverScenario(
    "/tmp/mdlm-dwp-completion-identity",
    processPackage,
    packageIdentity,
    response("451-dwp-completion-identity", {
      ...plan.datum.payload,
      stage: "completion",
      parent_coverage_status: "complete",
      deferred_questions: [],
      cross_group_dependencies: [],
      output_reviews_complete: true,
      simplification_disposition: "retained",
    }),
    prepared,
  );

  expect(submitted.ok, submitted.ok ? "" : JSON.stringify(submitted.diagnostics)).toBe(true);
  expect(published).toEqual([expect.objectContaining({
    id: plan.datum.id,
    revision: 2,
    revision_id: `${plan.datum.id}-r00002`,
    type: "DWP",
  })]);
});
