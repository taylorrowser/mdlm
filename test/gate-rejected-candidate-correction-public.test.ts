import { expect, it } from "vitest";
import { evaluateLifecycle, loadProcessPackage, type LifecycleRecord } from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = `mdlm-bootstrap@0.144.0#sha256:${"6".repeat(64)}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  scenario: string,
  links: { type: string; target: string }[] = [],
  revision = 1,
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    revision,
    links,
    createdBy: { process_ref: processRef, scenario },
    storage: { editable: false, frozen: true },
  });
}

function context(id: string, subject: LifecycleRecord): LifecycleRecord {
  return record("BSL", id, {
    title: `Review context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [subject.datum.revision_id],
    evidence: [],
  }, "create-review-context@2");
}

function review(
  id: string,
  subject: LifecycleRecord,
  reviewContext: LifecycleRecord,
  outcome: "pass" | "fail",
): LifecycleRecord {
  return record("REV", id, {
    title: `${outcome} ${subject.datum.revision_id}`,
    review_kind: "contextual",
    reviewer: "independent-reviewer",
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    outcome,
    summary: `${subject.datum.revision_id} received an exact ${outcome} judgment.`,
    findings: [],
    ...(outcome === "fail" ? { correction_authority: "package-evidence" } : {}),
  }, "review-datum-in-context@3", [
    { type: "reviews", target: subject.datum.revision_id },
    { type: "contextualizes", target: reviewContext.datum.revision_id },
  ]);
}

it("routes a gate-rejected DES through same-lineage correction before candidate replacement", async () => {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;

  const component = record("CMP", "CMP-6750000001", { title: "Count stdin bytes" },
    "execute-lower-level-decomposition-work-package@1");
  const architecture = record("ASP", "ASP-6750000001", {
    title: "Single-process byte counter",
    level: "component",
  }, "define-component-architecture@1");
  const plan = record("DWP", "DWP-6750000001", {
    title: "Design the byte counter",
    stage: "planning",
    target_child_type: "DES",
  }, "define-decomposition-work-package@4", [
    { type: "allocated-to", target: architecture.datum.revision_id },
  ]);
  const rejectedDesign = record("DES", "DES-6750000001", {
    title: "Echo the input length",
    statement: "The design shall report the input length.",
    verification_intent: "Observe a reported length.",
  }, "execute-lower-level-decomposition-work-package@1", [
    { type: "derived-from", target: component.datum.revision_id },
    { type: "decomposes", target: plan.datum.revision_id },
    { type: "allocated-to", target: architecture.datum.revision_id },
  ]);
  const rejectedCandidate = record("BSL", "BSL-6750000001", {
    title: "Rejected Phase 4 candidate",
    kind: "level-candidate",
    role: "candidate",
    scope: "phase-4-design-definition",
    group: "DEFAULT",
    definition_members: [rejectedDesign.datum.revision_id],
    evidence: [],
  }, "create-definition-level-candidate@1");
  const rejection = record("DEC", "DEC-6750000001", {
    title: "Reject underspecified design",
    kind: "gate-signoff",
    gate_outcome: "reject",
    effective_scope: rejectedCandidate.datum.revision_id,
  }, "record-reviewed-gate-signoff@1", [
    { type: "justifies", target: rejectedCandidate.datum.revision_id },
    { type: "blocks", target: rejectedDesign.datum.revision_id },
  ]);
  const rejectionContext = context("BSL-6750000003", rejection);
  const rejectionReview = review("REV-6750000001", rejection, rejectionContext, "pass");
  const currentCandidate = record("BSL", "BSL-6750000002", {
    title: "Candidate that repeated the rejected DES",
    kind: "level-candidate",
    role: "candidate",
    scope: "phase-4-design-definition",
    group: "DEFAULT",
    definition_members: [rejectedDesign.datum.revision_id],
    evidence: [],
  }, "revise-phase-2-candidate-after-review@2");
  const candidateContext = context("BSL-6750000004", currentCandidate);
  const candidateReview = review("REV-6750000002", currentCandidate, candidateContext, "fail");
  const before = [
    component,
    plan,
    architecture,
    rejectedDesign,
    rejectedCandidate,
    rejection,
    rejectionContext,
    rejectionReview,
    currentCandidate,
    candidateContext,
    candidateReview,
  ];

  const routed = evaluateLifecycle(loaded.package, {
    processRef,
    phaseId: "phase-4-design-definition",
    records: before,
    dependencyComparisons: [],
  });
  expect(routed.diagnostics).toEqual([]);
  expect(routed.looseEnds).toContainEqual(expect.objectContaining({
    obligation: "gate-rejected-design-requirement-correction-required",
    subject: rejectedDesign.datum.revision_id,
    status: "ready",
    actionableResolver: "revise-gate-rejected-design-requirement@1",
    dispatchable: true,
  }));
  expect(routed.looseEnds).toContainEqual(expect.objectContaining({
    obligation: "phase-2-candidate-correction-required",
    subject: currentCandidate.datum.revision_id,
    status: "blocked",
    dispatchable: false,
  }));
  const correctionScenario = loaded.package.scenarios[
    "revise-gate-rejected-design-requirement"
  ] as unknown as { outputs: Record<string, unknown>[] };
  const correctionOutput = correctionScenario.outputs[0];
  expect(correctionOutput)
    .toMatchObject({ types: ["DES"], identity_from: { input: "design" } });

  const correctedDesign = record("DES", rejectedDesign.datum.id, {
    title: "Implementable stdin byte-count design",
    statement: "Reject arguments, count raw stdin bytes, and emit decimal digits followed by LF.",
    verification_intent: "Verify the argument gate, accumulator data flow, and exact output bytes.",
  }, "revise-gate-rejected-design-requirement@1", [
    { type: "corrects-gate-rejection", target: rejection.datum.revision_id },
    { type: "derived-from", target: component.datum.revision_id },
    { type: "decomposes", target: plan.datum.revision_id },
    { type: "allocated-to", target: architecture.datum.revision_id },
  ], 2);
  const designContext = context("BSL-6750000005", correctedDesign);
  const designReview = review("REV-6750000003", correctedDesign, designContext, "pass");
  const replacementCandidate = record("BSL", currentCandidate.datum.id, {
    title: "Corrected Phase 4 candidate",
    kind: "level-candidate",
    role: "candidate",
    scope: "phase-4-design-definition",
    group: "DEFAULT",
    definition_members: [correctedDesign.datum.revision_id],
    evidence: [designReview.datum.revision_id],
  }, "revise-phase-2-candidate-after-review@2", [
    { type: "supersedes", target: currentCandidate.datum.revision_id },
    { type: "corrects-review", target: candidateReview.datum.revision_id },
  ], 2);
  const after = evaluateLifecycle(loaded.package, {
    processRef,
    phaseId: "phase-4-design-definition",
    records: [...before, correctedDesign, designContext, designReview, replacementCandidate],
    dependencyComparisons: [],
  });
  expect(after.diagnostics).toEqual([]);
  expect(replacementCandidate.datum.payload.definition_members)
    .toEqual(["DES-6750000001-r00002"]);
  expect(replacementCandidate.datum.payload.definition_members)
    .not.toContain("DES-6750000001-r00001");
  expect(after.looseEnds).not.toContainEqual(expect.objectContaining({
    obligation: "gate-rejected-design-requirement-correction-required",
    subject: rejectedDesign.datum.revision_id,
  }));
  expect(after.looseEnds).not.toContainEqual(expect.objectContaining({
    obligation: "phase-2-candidate-correction-required",
    subject: currentCandidate.datum.revision_id,
  }));
});
