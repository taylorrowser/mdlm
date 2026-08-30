import { expect } from "vitest";
import { loadProcessPackage } from "../../src/index.js";
import {
  evaluateLifecycle,
  scenarioOutputExplanations,
} from "../../src/evaluator.js";
import { processPackageDigest } from "../../src/process-package-digest.js";
import { submitPreparedResolverScenario } from "../../src/scenario-execution.js";
import { lifecycleRecord } from "./lifecycle-record.js";

export async function runPhaseTwoSimplificationReviewBinding() {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(
    true,
  );
  if (!loaded.ok) return;

  const processRef = "mdlm-bootstrap@0.104.0#phase-2-simplification-binding";
  const record = (
    type: string,
    id: string,
    payload: Record<string, unknown>,
    links: { type: string; target: string }[] = [],
    scenario = "test-fixture@1",
  ) =>
    lifecycleRecord(type, id, payload, {
      links,
      createdBy: { process_ref: processRef, scenario },
      storage: { editable: false, frozen: true },
    });
  const architecture = record("ASP", "ASP-5000000001", {
    title: "One system boundary",
    rationale: "One responsibility covers the behavior.",
    level: "system",
    elements: [
      {
        id: "AEL-5000000001",
        alias: "SYSTEM",
        title: "System",
        responsibilities: ["Provide the behavior."],
      },
    ],
    internal_interactions: [],
    controlled_boundaries: [],
    constraints: [],
    nominated_risks: [],
  });
  const plan = record(
    "DWP",
    "DWP-5000000001",
    {
      title: "One decomposition plan",
      rationale: "One work package is sufficient.",
      stage: "planning",
      architecture_element: "AEL-5000000001",
      target_child_type: "SYS",
      behavioral_slice: "Provide the behavior.",
      expected_coverage: ["The behavior"],
      exclusions: [],
      dependencies: [],
      required_review_policy: "review-applicability@1",
    },
    [{ type: "allocated-to", target: architecture.datum.revision_id }],
  );
  const system = record(
    "SYS",
    "SYS-5000000001",
    {
      title: "System behavior",
      rationale: "One statement covers the behavior.",
      statement: "The system shall provide the behavior.",
      verification_intent: "Observe the behavior.",
      architecture_allocation: {
        architecture_revision: architecture.datum.revision_id,
        element: "AEL-5000000001",
      },
    },
    [
      { type: "decomposes", target: plan.datum.revision_id },
      { type: "allocated-to", target: architecture.datum.revision_id },
    ],
  );
  const definitionMembers = [architecture, plan, system];
  const frozenSnapshot = {
    frozen_at: "2026-08-30T00:00:00.000Z",
    member_hashes: {},
    resolved_links: {},
    process_provenance: {
      process_ref: processRef,
      manifest_hash: `sha256:${"7".repeat(64)}`,
      asset_refs: ["mdlm-bootstrap@0.104.0"],
    },
  };
  const context = record(
    "BSL",
    "BSL-5000000001",
    {
      title: "Exact Phase 2 definition context",
      kind: "review-context",
      role: "review-context",
      scope: plan.datum.revision_id,
      group: "DEFAULT",
      definition_members: definitionMembers.map(
        (member) => member.datum.revision_id,
      ),
      evidence: [],
      snapshot: frozenSnapshot,
    },
    [],
    "create-phase-2-definition-review-context@1",
  );
  const wrongContext = record("BSL", "BSL-5000000002", {
    title: "Different review context",
    kind: "review-context",
    role: "review-context",
    scope: system.datum.revision_id,
    group: "DEFAULT",
    definition_members: [system.datum.revision_id],
    evidence: [],
    snapshot: frozenSnapshot,
  });
  const records = [...definitionMembers, context, wrongContext];
  const snapshot = {
    processRef,
    phaseId: "phase-2-system-definition",
    records,
    dependencyComparisons: [],
  };
  const scenario =
    loaded.package.scenarios["simplify-architecture-and-interfaces"]!;
  const bound = (
    name: string,
    values: typeof records,
    cardinality: string,
  ) => ({
    name,
    contract: {
      types: [...new Set(values.map((value) => value.datum.type))],
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
  const submit = async (reviewContext: typeof context) => {
    const published: unknown[] = [];
    const result = await submitPreparedResolverScenario(
      "/tmp/mdlm-phase-2-simplification-review-binding",
      loaded.package,
      {
        reference: "mdlm-bootstrap@0.104.0",
        digest: await processPackageDigest(".lifecycle/process"),
        language: "mdlm-expression@1",
      },
      {
        scenarioReference: "simplify-architecture-and-interfaces@2",
        obligationInstance:
          "architecture-interface-simplification-required@1:test",
        proposal: {
          outputs: [
            {
              name: "review",
              invocation: 0,
              lifecycleDatum: {
                type: "REV",
                payload: {
                  title: "Simplify the exact definition",
                  review_kind: "simplification-architecture-interfaces",
                  reviewer: "independent-reviewer",
                  summary: "The definition is already minimal.",
                  rubric_ref: "policies/rubrics/bootstrap-review.md@3",
                  outcome: "pass",
                },
                links: [
                  { type: "reviews", target: reviewContext.datum.revision_id },
                  {
                    type: "contextualizes",
                    target: reviewContext.datum.revision_id,
                  },
                ],
                body: "The exact definition contains no removable behavior.\n",
              },
            },
          ],
          completionEvidence: { summary: "Reviewed the exact definition." },
        },
        assignment: `phase-2-simplification-${reviewContext.datum.id}`,
        responseDigest: `sha256:${"5".repeat(64)}`,
        suppliedAuthorities: [],
        suppliedDelegations: [],
        loadedSkillRefs: [],
      },
      {
        dryRun: {
          executable: true,
          sideEffectFree: true,
          definition: {
            obligation: "architecture-interface-simplification-required@1",
            scenario: "simplify-architecture-and-interfaces@2",
          },
          authorization: {
            mode: "dispatchable-obligation",
            obligation: "architecture-interface-simplification-required@1:test",
          },
          obligation: {
            instance: "architecture-interface-simplification-required@1:test",
            subject: plan.datum.revision_id,
            status: "ready",
            dispatchable: true,
          },
          invocations: [
            {
              inputs: [
                bound("plan", [plan], "one"),
                bound("subject_context", [context], "one"),
                bound("definition_members", definitionMembers, "one-or-more"),
              ],
            },
          ],
          prompt: {
            reference: "prompts/simplify-architecture-and-interfaces.md@1",
            path: ".lifecycle/process/prompts/simplify-architecture-and-interfaces.md",
            digest: `sha256:${"6".repeat(64)}`,
            content: "Review the exact Phase 2 definition.",
            skills: [],
          },
          policies: [],
          prohibitedInputs: [],
          expectedOutputs: scenarioOutputExplanations(scenario),
          completion: {
            expression: (scenario.completion as { source: string }).source,
            status: "pending-output",
            genericChecks: [],
          },
        },
        evaluation: evaluateLifecycle(loaded.package, snapshot),
        scenario,
        snapshot,
        publishMutation: async (
          _root,
          _package,
          _expected,
          data,
          executionId,
        ) => {
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
      },
    );
    return { result, published };
  };

  const accepted = await submit(context);
  expect(
    accepted.result.ok,
    accepted.result.ok ? "" : JSON.stringify(accepted.result.diagnostics),
  ).toBe(true);
  expect(accepted.published).toHaveLength(1);

  const wrong = await submit(wrongContext);
  expect(wrong.result.ok).toBe(false);
  expect(wrong.published).toEqual([]);
}
