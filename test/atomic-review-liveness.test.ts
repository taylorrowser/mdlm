import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { deriveOperatorOutcome } from "../src/assignment.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { scenarioOutputContractDiagnostics } from "../src/scenario-execution.js";
import type {
  LifecycleRecord,
  LifecycleSnapshot,
  ProcessPackage,
} from "../src/index.js";
import { loadProcessPackage } from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.81.0#sha256:atomic-review-replay";
let processPackage: ProcessPackage;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  scenario: string,
  links: { type: string; target: string }[] = [],
  revision = 1,
): LifecycleRecord {
  const value = lifecycleRecord(type, id, payload, {
    revision,
    links,
    createdBy: { process_ref: processRef, scenario },
    storage: { editable: false, frozen: true },
  });
  value.integrity.scenario_execution_valid = true;
  return value;
}

function atomicReview(
  subject: LifecycleRecord,
  suffix: string,
  support: LifecycleRecord[] = [],
): [LifecycleRecord, LifecycleRecord] {
  const context = record("BSL", `BSL-${suffix}`, {
    title: `Review context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      subject.datum.revision_id,
      ...support.map((item) => item.datum.revision_id),
    ].sort(),
    evidence: [],
  }, "review-phase-0-foundation@1");
  const review = record("REV", `REV-${suffix}`, {
    title: `Review of ${subject.datum.revision_id}`,
    review_kind: "phase-0-foundation",
    outcome: "pass",
    reviewer: "independent-reviewer",
    summary: "The exact subject is supported by its frozen context.",
    findings: [],
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    correction_authority: "author",
  }, "review-phase-0-foundation@1", [
    { type: "reviews", target: subject.datum.revision_id },
    { type: "contextualizes", target: context.datum.revision_id },
  ]);
  return [context, review];
}

function snapshot(records: LifecycleRecord[]): LifecycleSnapshot {
  return {
    processRef,
    phaseId: "phase-0-wayfinding",
    records,
    dependencyComparisons: [],
  };
}

function work(records: LifecycleRecord[]) {
  const result = deriveOperatorOutcome(snapshot(records), processPackage);
  expect(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) return [];
  return result.value.work;
}

function selected(
  records: LifecycleRecord[],
  selector: string,
  arguments_: Record<string, unknown>,
): string[] {
  const evaluation = evaluateProcessDefinition(
    processPackage,
    snapshot(records),
    "selector",
    selector,
    arguments_,
  );
  return (evaluation.result as Array<{ identity: { revision_id: string } }>)
    .map((item) => item.identity.revision_id);
}

describe("atomic Phase 0 Review liveness", () => {
  beforeAll(async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    processPackage = loaded.package;
  });

  it("requires newly authored Phase 0 questions to start open", () => {
    for (const scenarioId of ["compile-psp", "draft-stakeholder-requirements"]) {
      const questions = (processPackage.scenarios[scenarioId]!.outputs as Array<{
        name: string;
        required_payload?: Record<string, unknown>;
      }>).find((output) => output.name === "questions");
      expect(questions?.required_payload).toMatchObject({
        intent_scope: "product",
        state: "open",
      });
      expect(scenarioOutputContractDiagnostics(
        processPackage.scenarios[scenarioId]!,
        [{ inputs: [] }],
        [{
          name: "questions",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: { intent_scope: "product", state: "answered" },
            links: [],
            body: "Answered without the required Decision.",
          },
        }],
      )).toEqual(expect.arrayContaining([expect.objectContaining({
        code: "scenario-output-required-payload-invalid",
        path: "outputs.questions.payload.state",
      })]));
    }
  });

  it("recognizes the atomic context and routes the next consequential Decision", () => {
    const map = record("MAP", "MAP-ATOMIC1", {
      title: "Initial wayfinding map",
      purpose: "Bound one product choice.",
      frontier: ["product-intent"],
    }, "establish-initial-wayfinding-map@2");
    const mapReview = atomicReview(map, "MAPCTX1");
    const question = record("QST", "QST-ATOMIC1", {
      title: "Choose the product",
      kind: "preferential",
      intent_scope: "product",
      question: "What product should this repository build?",
      state: "open",
      blocking_impact: "The product specification waits for an answer.",
    }, "establish-initial-wayfinding-map@2");
    const boundary = record("BSL", "BSL-BOUND1", {
      title: "Initial product source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: question.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [question.datum.revision_id],
      evidence: [],
    }, "freeze-source-boundary@1");
    const answered = record("QST", question.datum.id, {
      ...question.datum.payload,
      state: "answered",
      attended_answer: "Build one bounded command.",
    }, "resolve-question@2", [], 2);
    const decision = record("DEC", "DEC-ATOMIC1", {
      title: "Choose the product boundary",
      kind: "scope",
      decision: "Build one bounded command.",
      rationale: "The attended answer selected one product.",
      effective_scope: answered.datum.revision_id,
    }, "resolve-question@2", [
      { type: "resolves", target: question.datum.revision_id },
      { type: "resolves", target: answered.datum.revision_id },
    ]);

    const mapRecords = [map, ...mapReview, question, boundary, answered, decision];
    expect(selected(mapRecords, "valid-review-contexts-for@1", {
      subject: map.datum.revision_id,
    })).toEqual([mapReview[0].datum.revision_id]);
    expect(selected(mapRecords, "current-exact-review-contexts-cited-by@1", {
      review: mapReview[1].datum.revision_id,
      subject: map.datum.revision_id,
    })).toEqual([mapReview[0].datum.revision_id]);
    expect(selected(mapRecords, "passing-reviews-for@1", {
      subject: map.datum.revision_id,
    })).toEqual([mapReview[1].datum.revision_id]);

    const afterMapReview = work(mapRecords);
    expect(afterMapReview).not.toContainEqual(expect.objectContaining({
      subject: map.datum.revision_id,
      scenario: "review-phase-0-foundation@1",
    }));
    expect(afterMapReview).toContainEqual(expect.objectContaining({
      subject: decision.datum.revision_id,
      scenario: "review-phase-0-foundation@1",
      dispatchable: true,
    }));

    const decisionReview = atomicReview(
      decision,
      "DECCTX1",
      [question, boundary, answered],
    );
    const completeRecords = [
      map,
      ...mapReview,
      question,
      boundary,
      answered,
      decision,
      ...decisionReview,
    ];
    expect(selected(
      completeRecords,
      "applicable-product-answer-reviews-for-decision@1",
      { decision: decision.datum.revision_id },
    )).toEqual([decisionReview[1].datum.revision_id]);

    const afterDecisionReview = work(completeRecords);
    expect(afterDecisionReview).not.toContainEqual(expect.objectContaining({
      scenario: "review-phase-0-foundation@1",
      dispatchable: true,
    }));
  });
});
