import { expect, it } from "vitest";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { submitPreparedResolverScenario } from "../src/scenario-execution.js";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";
import { compileDefinitionExpressions } from "../src/expression.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const digest = `sha256:${"4".repeat(64)}`;
const processRef = `mdlm-bootstrap@0.97.0#${digest}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  const value = lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef, scenario: "fixture@1" },
    storage: { editable: false, frozen: true },
  });
  value.integrity.scenario_execution_valid = true;
  return value;
}

it("publishes a pilot VER Review correction as the next Revision in the activity lineage", async () => {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;
  const processPackage = structuredClone(loaded.package);
  const scenario = processPackage.scenarios[
    "revise-pilot-verification-activity-after-review"
  ]!;
  scenario.completion =
    "execution.integrity.contract_valid == true && replacement.identity.id == activity.identity.id";
  expect(compileDefinitionExpressions(
    scenario,
    ".lifecycle/process/scenarios/revise-pilot-verification-activity-after-review.yaml",
    {
      templates: processPackage.templates,
      types: processPackage.types,
      selectors: processPackage.selectors,
      states: processPackage.states,
      policies: processPackage.policies,
      scenarios: processPackage.scenarios,
      ...(processPackage.kernelCapabilities["exact-baseline@1"]?.type
        ? { exactBaselineType: processPackage.kernelCapabilities["exact-baseline@1"]!.type }
        : {}),
    },
  )).toEqual([]);

  const product = record("PSP", "PSP-4680000001", { title: "Text predicate" });
  const requirement = record("STK", "STK-4680000001", {
    title: "Report the predicate result",
  }, [{ type: "derived-from", target: product.datum.id }]);
  const acceptedIntent = record("BSL", "BSL-4680000001", {
    title: "Accepted intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "product",
    group: "DEFAULT",
    definition_members: [product.datum.revision_id, requirement.datum.revision_id],
    evidence: [],
  });
  const strategy = record("VSP", "VSP-4680000001", {
    title: "Black-box pilot strategy",
    level: "stakeholder",
    independence: { boundary: "black-box" },
  }, [
    { type: "governs", target: requirement.datum.id },
    { type: "governs-revision", target: requirement.datum.revision_id },
  ]);
  const activity = record("VER", "VER-4680000001", {
    title: "Pilot predicate verification",
    rationale: "Exercise both predicate outcomes.",
    kind: "pilot",
    method: "test",
    assessment_mode: "automatic",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      formal_evidence_eligible: false,
    },
    acceptance_criteria: ["The expected output is observed."],
    evidence_requirements: ["Record exact command output."],
    expected_success_activity: "Run a conforming target.",
    expected_discrimination_activity: "Run an incorrect control.",
  }, [
    { type: "verifies", target: requirement.datum.id },
    { type: "verifies-revision", target: requirement.datum.revision_id },
    { type: "governed-by", target: strategy.datum.revision_id },
    { type: "derived-from", target: product.datum.revision_id },
  ]);
  const context = record("BSL", "BSL-4680000002", {
    title: "Pilot Review Context",
    kind: "review-context",
    role: "review-context",
    scope: activity.datum.revision_id,
    group: "DEFAULT",
    definition_members: [activity.datum.revision_id],
    evidence: [],
  });
  const failedReview = record("REV", "REV-4680000001", {
    title: "Pilot activity Review",
    review_kind: "phase-1-assurance",
    reviewer: "independent-reviewer",
    summary: "One acceptance condition exceeds the requirement.",
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    findings: [{
      id: "F-001",
      target: activity.datum.revision_id,
      relationship: "primary",
      severity: "blocking",
      summary: "Remove the extra condition.",
      criterion: "The activity must remain within its requirement.",
      evidence: "The activity adds an unstated condition.",
      material_consequence: "A conforming product could fail the pilot.",
    }],
    correction_authority: "package-evidence",
    outcome: "fail",
  }, [
    { type: "reviews", target: activity.datum.revision_id },
    { type: "contextualizes", target: context.datum.revision_id },
  ]);
  const records = [
    product,
    requirement,
    acceptedIntent,
    strategy,
    activity,
    context,
    failedReview,
  ];
  const snapshot = {
    processRef,
    phaseId: "phase-1-product-assurance",
    records,
    dependencyComparisons: [],
  };
  const evaluation = evaluateLifecycle(processPackage, snapshot);
  const correction = evaluation.looseEnds.find((candidate) =>
    candidate.obligation === "pilot-verification-activity-review-correction-required" &&
    candidate.subject === activity.datum.revision_id
  );
  expect(correction).toEqual(expect.objectContaining({
    dispatchable: true,
    actionableResolver: "revise-pilot-verification-activity-after-review@3",
  }));
  if (!correction) return;

  const prepared = await dryRunResolverScenario(
    processPackage,
    snapshot,
    "revise-pilot-verification-activity-after-review@3",
    correction.id,
    [],
    evaluation,
  );
  expect(prepared.ok, prepared.ok ? "" : JSON.stringify(prepared.diagnostics)).toBe(true);
  if (!prepared.ok) return;
  const published: LifecycleRecord["datum"][] = [];
  const submitted = await submitPreparedResolverScenario(
    "/tmp/mdlm-issue-468-pilot-ver-correction",
    processPackage,
    {
      reference: "mdlm-bootstrap@0.97.0",
      digest,
      language: "mdlm-expression@1",
    },
    {
      scenarioReference: "revise-pilot-verification-activity-after-review@3",
      obligationInstance: correction.id,
      proposal: {
        outputs: [{
          localId: "replacement",
          name: "replacement",
          invocation: 0,
          lifecycleDatum: {
            type: "VER",
            payload: {
              ...activity.datum.payload,
              acceptance_criteria: ["Only the required output is observed."],
            },
            links: [
              { type: "verifies", target: requirement.datum.id },
              { type: "verifies-revision", target: requirement.datum.revision_id },
              { type: "governed-by", target: strategy.datum.revision_id },
              { type: "derived-from", target: product.datum.revision_id },
              { type: "corrects-review", target: failedReview.datum.revision_id },
            ],
            body: "The corrected activity removes the extra condition.\n",
          },
        }],
        completionEvidence: { summary: "The bounded correction is complete." },
      },
      assignment: "issue-468-pilot-ver-correction",
      responseDigest: `sha256:${"5".repeat(64)}`,
      suppliedAuthorities: [],
      suppliedDelegations: [],
      loadedSkillRefs: prepared.value.prompt.skills.map((skill) => skill.reference),
    },
    {
      dryRun: prepared.value,
      evaluation,
      scenario,
      snapshot,
      publishMutation: async (_root, _package, _expected, data, executionId) => {
        published.push(...data);
        return {
          ok: true,
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

  expect(submitted.ok, submitted.ok ? "" : JSON.stringify(submitted.diagnostics)).toBe(true);
  expect(published).toEqual([expect.objectContaining({
    id: activity.datum.id,
    revision: 2,
    revision_id: `${activity.datum.id}-r00002`,
    type: "VER",
  })]);
});
