import { beforeAll, expect, it } from "vitest";
import {
  evaluateProcessDefinition,
  evaluateProcessExpressionResult,
} from "../src/evaluator.js";
import type { LifecycleRecord, ProcessPackage } from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = `mdlm-bootstrap@0.119.0#sha256:${"c".repeat(64)}`;

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

let processPackage: ProcessPackage;

beforeAll(async () => {
  processPackage = await canonicalProcessPackage();
});

it("validates the in-flight acceptance Decision before durable execution integrity", () => {
  const subject = record("BSL", "BSL-ACCEPT00001", {
    title: "Accepted product intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "focused-product",
    group: "DEFAULT",
    definition_members: [],
    evidence: [],
  }, "seed-accepted-product@1");
  const decision = record("DEC", "DEC-ACCEPT00001", {
    title: "Accept the verified product",
    rationale: "The exact evidence set is complete.",
    kind: "product-acceptance",
    decision: "approve",
    alternatives: ["Reject the product."],
    effective_scope: subject.datum.revision_id,
  }, "record-product-acceptance@1", [
    { type: "justifies", target: subject.datum.revision_id },
  ]);
  decision.integrity.scenario_execution_valid = false;
  const snapshot = {
    processRef,
    phaseId: "phase-6-verification",
    records: [subject, decision],
    dependencyComparisons: [],
    execution: { integrity: { contract_valid: true } },
  };

  expect(evaluateProcessExpressionResult(
    processPackage,
    snapshot,
    "record-product-acceptance@1#completion",
    {
      subject: subject.datum.revision_id,
      evidence: [],
      decision: decision.datum.revision_id,
    },
  )).toBe(true);

  expect(evaluateProcessDefinition(
    processPackage,
    snapshot,
    "selector",
    "recorded-product-acceptance-decisions-for@1",
    { subject: subject.datum.revision_id },
  ).result).toEqual([]);

  decision.integrity.scenario_execution_valid = true;
  expect(evaluateProcessDefinition(
    processPackage,
    snapshot,
    "selector",
    "recorded-product-acceptance-decisions-for@1",
    { subject: subject.datum.revision_id },
  ).result).toEqual([
    expect.objectContaining({
      identity: expect.objectContaining({ revision_id: decision.datum.revision_id }),
    }),
  ]);
});
