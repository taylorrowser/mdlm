import { expect, it } from "vitest";
import {
  classifyOperatorOutcome,
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";
import { operatorWorkProjection } from "../src/assignment.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = `mdlm-bootstrap@0.114.0#sha256:${"a".repeat(64)}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  scenario: string,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef, scenario },
    storage: { editable: false, frozen: true },
  });
}

it("routes Phase 4 changed-interface work through design environment assurance", async () => {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;

  const component = record("CMP", "CMP-5730000001", {
    title: "Report one classification",
  }, "execute-lower-level-decomposition-work-package@1");
  const strategy = record("VSP", "VSP-5730000001", {
    title: "Design verification strategy",
    level: "design",
  }, "define-lower-level-verification-strategy@1", [
    { type: "governs", target: component.datum.id },
    { type: "governs-revision", target: component.datum.revision_id },
  ]);
  const plan = record("DWP", "DWP-5730000001", {
    title: "Changed interface design slice",
    stage: "planning",
    target_child_type: "DES",
  }, "define-decomposition-work-package@4", [
    { type: "decomposes", target: component.datum.revision_id },
    { type: "verified-under", target: strategy.datum.revision_id },
  ]);
  const design = record("DES", "DES-5730000001", {
    title: "Emit a changed classification contract",
    interface_effect: "changed",
  }, "execute-lower-level-decomposition-work-package@1", [
    { type: "derived-from", target: component.datum.revision_id },
    { type: "decomposes", target: plan.datum.revision_id },
  ]);
  const planContext = record("BSL", "BSL-5730000003", {
    title: "Review context for the changed-interface plan",
    kind: "review-context",
    role: "review-context",
    scope: plan.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      plan.datum.revision_id,
      strategy.datum.revision_id,
    ],
    evidence: [],
  }, "create-review-context@2");
  const reviewContext = record("BSL", "BSL-5730000001", {
    title: "Review context for the design strategy",
    kind: "review-context",
    role: "review-context",
    scope: strategy.datum.revision_id,
    group: "DEFAULT",
    definition_members: [strategy.datum.revision_id],
    evidence: [],
  }, "create-review-context@2");
  const review = record("REV", "REV-5730000001", {
    title: "Review the design strategy",
    review_kind: "contextual",
    outcome: "pass",
    findings: [],
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
  }, "review-datum-in-context@3", [
    { type: "reviews", target: strategy.datum.revision_id },
    { type: "contextualizes", target: reviewContext.datum.revision_id },
  ]);
  const activity = record("VER", "VER-5730000001", {
    title: "Exercise the changed classification contract",
    kind: "pilot",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      formal_evidence_eligible: false,
    },
  }, "write-representative-level-pilot-verification-activity@1", [
    { type: "verifies", target: design.datum.id },
    { type: "verifies-revision", target: design.datum.revision_id },
    { type: "governed-by", target: strategy.datum.revision_id },
  ]);
  const activityContext = record("BSL", "BSL-5730000002", {
    title: "Review context for the pilot activity",
    kind: "review-context",
    role: "review-context",
    scope: activity.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      activity.datum.revision_id,
      design.datum.revision_id,
      strategy.datum.revision_id,
    ],
    evidence: [],
  }, "create-review-context@2");
  const activityReview = record("REV", "REV-5730000002", {
    title: "Review the pilot activity",
    review_kind: "contextual",
    outcome: "pass",
    findings: [],
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
  }, "review-datum-in-context@3", [
    { type: "reviews", target: activity.datum.revision_id },
    { type: "contextualizes", target: activityContext.datum.revision_id },
  ]);
  const target = record("ART", "ART-5730000001", {
    title: "Disposable changed-interface controls",
    kind: "prototype",
    prototype_controls: { activity_ref: activity.datum.revision_id },
  }, "build-representative-level-pilot-control-prototype@1", [
    { type: "derived-from", target: design.datum.revision_id },
  ]);

  const evaluation = evaluateLifecycle(loaded.package, {
    processRef,
    phaseId: "phase-4-design-definition",
    records: [
      component,
      strategy,
      plan,
      design,
      planContext,
      reviewContext,
      review,
      activity,
      activityContext,
      activityReview,
      target,
    ],
    dependencyComparisons: [],
  });
  const assurance = evaluation.looseEnds.find((item) =>
    item.obligation === "environment-assurance-required" &&
    item.subject === strategy.datum.revision_id
  );

  expect(assurance).toEqual(expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: "realize-verification-environment@1",
  }));
  const next = classifyOperatorOutcome(
    operatorWorkProjection(evaluation, [
      component,
      strategy,
      plan,
      design,
      planContext,
      reviewContext,
      review,
      activity,
      activityContext,
      activityReview,
      target,
    ]),
    evaluation.terminalOutcome,
  );
  expect(next).toEqual(expect.objectContaining({
    kind: "assignment",
    work: expect.objectContaining({
      subject: strategy.datum.revision_id,
      scenario: "realize-verification-environment@1",
    }),
  }));
});

it("runs Phase 4 ENV qualification before materializing its Review Context", async () => {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;

  const environmentProfile = {
    id: "posix-stdin-pipe",
    capabilities: {
      controllability: ["chosen stdin bytes"],
      observability: ["complete stdout bytes", "exit status"],
      external_services: [],
      timing: "not assessed",
    },
  };
  const strategy = record("VSP", "VSP-1F1ARN14C0", {
    title: "Design verification strategy",
    level: "design",
    environment_profile: environmentProfile,
  }, "define-lower-level-verification-strategy@1");
  const environment = record("ENV", "ENV-CKPFBENDJT", {
    title: "posix-stdin-pipe design verification environment",
    strategy_revision: strategy.datum.revision_id,
    profile_id: "posix-stdin-pipe",
    capabilities: environmentProfile.capabilities,
  }, "realize-verification-environment@1", [
    { type: "realizes", target: strategy.datum.revision_id },
  ]);
  const qualificationActivity = record("VER", "VER-YKEH18CKR7", {
    title: "Qualification of the design environment capabilities",
    kind: "qualification",
    method: "test",
    assessment_mode: "automatic",
    claim: {
      kind: "qualification",
      scope: "environment-capability",
      formal_evidence_eligible: false,
    },
  }, "realize-verification-environment@1", [
    { type: "governed-by", target: strategy.datum.revision_id },
    { type: "qualifies", target: environment.datum.revision_id },
  ]);
  const qualificationImplementation = record("VAI", "VAI-J64DFD22ZM", {
    title: "Qualification implementation for the design environment",
    kind: "qualification",
    implementation_ref: `procedure:sha256:${"1".repeat(64)}`,
    independence_mode: "environment-capability",
  }, "realize-verification-environment@1", [
    { type: "realizes", target: qualificationActivity.datum.revision_id },
    { type: "uses", target: environment.datum.revision_id },
    { type: "targets", target: environment.datum.revision_id },
  ]);
  const postEnvironmentRecords = [
    strategy,
    environment,
    qualificationActivity,
    qualificationImplementation,
  ];
  const postEnvironment = evaluateLifecycle(loaded.package, {
    processRef,
    phaseId: "phase-4-design-definition",
    records: postEnvironmentRecords,
    dependencyComparisons: [],
  });
  const environmentContext = postEnvironment.looseEnds.find((item) =>
    item.obligation === "review-context-required" &&
    item.subject === environment.datum.revision_id
  );
  const qualificationRun = postEnvironment.looseEnds.find((item) =>
    item.obligation === "verification-run-required" &&
    item.subject === qualificationImplementation.datum.revision_id
  );

  expect(environmentContext).toEqual(expect.objectContaining({
    status: "blocked",
    dispatchable: false,
  }));
  expect(qualificationRun).toEqual(expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: "execute-verification-run@2",
  }));
});
