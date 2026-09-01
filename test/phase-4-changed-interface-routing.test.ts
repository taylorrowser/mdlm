import { expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";
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

  const evaluation = evaluateLifecycle(loaded.package, {
    processRef,
    phaseId: "phase-4-design-definition",
    records: [component, strategy, plan, design, reviewContext, review],
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
});
