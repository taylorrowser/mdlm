import { expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "git:issue-594";

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

it("blocks sibling formal runs after a reported Phase 6 product failure", async () => {
  const loaded = await loadProcessPackage(".lifecycle/process");
  expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;

  const failedImplementation = record("VAI", "VAI-5940000001", {
    title: "Failed formal implementation",
    kind: "formal",
  }, "implement-verification-activity@1");
  const siblingImplementation = record("VAI", "VAI-5940000002", {
    title: "Sibling formal implementation",
    kind: "formal",
  }, "implement-verification-activity@1");
  const failingResult = record("RES", "RES-5940000001", {
    title: "Completed formal failure",
    claim: {
      kind: "formal",
      scope: "requirement",
      outcome: "fail",
      formal_evidence_eligible: true,
    },
    assessment_state: "recorded",
  }, "execute-formal-verification-run@1");
  const failingRun = record("RUN", "RUN-5940000001", {
    title: "Completed formal run",
    kind: "formal",
    execution_state: "completed",
  }, "execute-formal-verification-run@1", [{
    type: "produces",
    target: failingResult.datum.revision_id,
  }]);
  const problem = record("PRB", "PRB-5940000001", {
    title: "Reported formal failure",
    disposition: "open",
  }, "report-problem@1", [{
    type: "reports",
    target: failingResult.datum.revision_id,
  }]);
  const evaluation = evaluateLifecycle(loaded.package, {
    processRef,
    phaseId: "phase-6-verification",
    records: [
      failedImplementation,
      siblingImplementation,
      failingRun,
      failingResult,
      problem,
    ],
    dependencyComparisons: [],
  });
  const siblingRun = evaluation.obligations.find((item) =>
    item.obligation === "formal-verification-run-required" &&
    item.subject === siblingImplementation.datum.revision_id
  );

  expect(evaluation.terminalOutcome?.outcome).toBe("profile-boundary-reached");
  expect(siblingRun).toEqual(expect.objectContaining({
    status: "blocked",
    dispatchable: false,
    explanation:
      "The reported formal product failure reaches this profile's explicit Phase 6 boundary before any sibling execution can start.",
  }));
  expect(evaluation.looseEnds.filter((item) =>
    ["review-context-required", "passing-review-required"].includes(
      item.obligation,
    )
  )).toEqual([]);
});
