import { beforeAll, expect, it } from "vitest";
import {
  evaluateLifecycle,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.91.0#sha256:test";
let processPackage: ProcessPackage;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    createdBy: { scenario: "fixture@1", process_ref: processRef },
    storage: { editable: false, frozen: true },
    links,
  });
}

beforeAll(async () => {
  processPackage = await canonicalProcessPackage();
});

it("binds every open Phase 0 product Question into the MAP correction scaffold", async () => {
  const subject = record("MAP", "MAP-4D9F9CBPSP", {
    title: "Initial decision map",
    purpose: "Track the product-intent decision that blocks PSP compilation.",
    frontier: ["Product intent"],
  }, [{ type: "indexes", target: "QST-ZAZ38SZ9B3" }]);
  const reviewContext = record("BSL", "BSL-22RQWNV64J", {
    title: "Review context for the initial decision map",
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [subject.datum.revision_id],
    evidence: [],
  });
  const failedReview = record("REV", "REV-0P6FFMT0K9", {
    title: "Failed review of the initial decision map",
    review_kind: "contextual",
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    findings: [{
      id: "F-001",
      severity: "blocking",
      criterion: "The map indexes every open Phase 0 product Question.",
      evidence: "The new product Question is absent from the map.",
      material_consequence: "The stakeholder checkpoint cannot find the Question.",
      summary: "Index the open product Question.",
    }],
    outcome: "fail",
    correction_authority: "package-evidence",
  }, [
    { type: "reviews", target: subject.datum.revision_id },
    { type: "contextualizes", target: reviewContext.datum.revision_id },
  ]);
  const blockedProduct = record("PSP", "PSP-E06SN8QNT4", {
    title: "Exact blank-input CLI",
    rationale: "Define the bounded product whose open choice is tracked.",
    problem: "Blank input needs deterministic handling.",
    users: ["CLI users"],
    goals: ["Classify blank input."],
    non_goals: ["Broader text processing."],
    success_measures: ["The chosen blank-input behavior is observable."],
  });
  const openQuestion = record("QST", "QST-3PX8HMFPEY", {
    title: "Choose blank-input behavior",
    kind: "preferential",
    intent_scope: "product",
    question: "What should blank input produce?",
    state: "open",
    blocking_impact: "The Phase 0 product gate requires this choice.",
    attention_checkpoint: "phase-0-gate",
    consolidation_group: "phase-0-stakeholder-questions",
  }, [{ type: "blocks", target: blockedProduct.datum.id }]);
  const snapshot = {
    processRef,
    phaseId: "phase-0-wayfinding",
    records: [subject, reviewContext, failedReview, blockedProduct, openQuestion],
    dependencyComparisons: [],
  };

  const evaluation = evaluateLifecycle(processPackage, snapshot);
  expect(evaluation.diagnostics).toEqual([]);
  const correction = evaluation.obligations.find((candidate) =>
    candidate.obligation === "wayfinding-map-review-correction-required" &&
    candidate.subject === subject.datum.revision_id
  );
  expect(correction).toEqual(expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: "revise-wayfinding-map-after-review@1",
  }));
  expect(correction).toBeDefined();

  const prepared = await dryRunResolverScenario(
    processPackage,
    snapshot,
    "revise-wayfinding-map-after-review@1",
    correction!.id,
    [],
    evaluation,
  );
  expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
  if (!prepared.ok) return;

  const invocation = prepared.value.invocations[0]!;
  expect(invocation.inputs.find((input) => input.name === "open_product_questions")
    ?.values.map((value) => value.identity.revision_id)).toEqual([
      "QST-3PX8HMFPEY-r00001",
    ]);
  expect(prepared.value.expectedOutputs).toEqual([
    expect.objectContaining({
      name: "replacement",
      types: ["MAP"],
      requiredLinks: expect.arrayContaining([
        { link: "indexes", target: { input: "open_product_questions" } },
        { link: "corrects-review", target: { input: "failed_reviews" } },
      ]),
    }),
  ]);
});
