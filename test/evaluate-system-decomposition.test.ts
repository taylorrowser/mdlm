import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type ExactTypedEntity,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const ids = {
  parent: "STK-0EXACTPAR0",
  plan: "DWP-0EXACTDWP0",
  output: "SYS-0EXACTOUT0",
  architecture: "ASP-0EXACTARC0",
  firstInterface: "ICSP-0EXACTIC01",
  secondInterface: "ICSP-0EXACTIC02",
  strategy: "VSP-0EXACTVSP0",
};
const revision = (id: string, number = 1) =>
  `${id}-r${String(number).padStart(5, "0")}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  revisionNumber: number,
  links: Array<{ type: string; target: string }> = [],
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    revision: revisionNumber,
    links,
    createdBy: {
      scenario: type === "DWP"
        ? revisionNumber === 1
          ? "define-decomposition-work-package@2"
          : "complete-decomposition-work-package@2"
        : "test-fixture@1",
      prompt_ref: "prompts/test-fixture.md@1",
      process_ref: "git:current",
      loaded_skill_refs: [],
      policy_refs: [],
    },
    storage: { editable: false, frozen: true },
  });
}

function records(options: {
  completionParent?: string;
  outputParent?: string;
} = {}): LifecycleRecord[] {
  const exactParent = revision(ids.parent);
  const substitutedParent = revision(ids.parent, 2);
  const plan = revision(ids.plan);
  const output = revision(ids.output);
  const architecture = revision(ids.architecture);
  const interfaces = [revision(ids.firstInterface), revision(ids.secondInterface)];
  const strategy = revision(ids.strategy);

  return [
    record("STK", ids.parent, {}, 1),
    record("STK", ids.parent, {}, 2),
    record("ASP", ids.architecture, {}, 1),
    record("ICSP", ids.firstInterface, {}, 1),
    record("ICSP", ids.secondInterface, {}, 1),
    record("VSP", ids.strategy, {}, 1),
    record("DWP", ids.plan, { stage: "planning" }, 1, [
      { type: "decomposes", target: exactParent },
      { type: "allocated-to", target: architecture },
      ...interfaces.map((target) => ({ type: "governed-by", target })),
      { type: "verified-under", target: strategy },
    ]),
    record("SYS", ids.output, {}, 1, [
      { type: "derived-from", target: options.outputParent ?? exactParent },
      { type: "decomposes", target: plan },
    ]),
    record("DWP", ids.plan, {
      stage: "completion",
      parent_coverage_status: "complete",
      output_reviews_complete: true,
    }, 2, [
      { type: "decomposes", target: options.completionParent ?? exactParent },
      { type: "derived-from", target: plan },
      { type: "allocated-to", target: architecture },
      ...interfaces.map((target) => ({ type: "governed-by", target })),
      { type: "verified-under", target: strategy },
      { type: "produces", target: output },
    ]),
  ];
}

function selectedRevisionIds(
  processPackage: ProcessPackage,
  selector: string,
  snapshotRecords: LifecycleRecord[],
  argumentsValue: Record<string, string>,
): string[] {
  const evaluation = evaluateProcessDefinition(
    processPackage,
    {
      processRef: "git:current",
      phaseId: "phase-2-system-definition",
      records: snapshotRecords,
      dependencyComparisons: [],
    },
    "selector",
    selector,
    argumentsValue,
  );
  return (evaluation.result as ExactTypedEntity[]).map(
    (result) => result.identity.revision_id,
  );
}

describe("exact DWP parent Revision matching", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("rejects same-lineage parent substitutions from completion coverage", () => {
    const selector = "valid-decomposition-completions-for-plan@1";
    const argumentsValue = { plan: revision(ids.plan) };

    expect(selectedRevisionIds(processPackage, selector, records(), argumentsValue))
      .toEqual([revision(ids.plan, 2)]);
    expect(selectedRevisionIds(processPackage, selector, records({
      completionParent: revision(ids.parent, 2),
    }), argumentsValue)).toEqual([]);
    expect(selectedRevisionIds(processPackage, selector, records({
      outputParent: revision(ids.parent, 2),
    }), argumentsValue)).toEqual([]);
  });

  it("rejects same-lineage parent substitutions from DWP Review correction validation", () => {
    const selector = "valid-phase-2-dwp-review-correction@1";
    const argumentsValue = { replacement: revision(ids.plan, 2) };

    expect(selectedRevisionIds(processPackage, selector, records(), argumentsValue))
      .toEqual([revision(ids.plan, 2)]);
    expect(selectedRevisionIds(processPackage, selector, records({
      completionParent: revision(ids.parent, 2),
      outputParent: revision(ids.parent, 2),
    }), argumentsValue)).toEqual([]);
  });

  function expectExactCorrectionWork(
    type: string,
    id: string,
    revisionNumber: number,
    payload: Record<string, unknown>,
  ) {
    const subject = record(type, id, payload, revisionNumber);
    const planningDwp = type === "DWP" && payload.stage === "planning";
    const context = planningDwp
      ? record("BSL", "BSL-0CORRECT1", {
        kind: "review-context",
        role: "review-context",
        scope: subject.datum.revision_id,
        definition_members: [subject.datum.revision_id],
        evidence: [],
      }, 1)
      : undefined;
    const review = record("REV", "REV-0CORRECT1", {
      review_kind: planningDwp
        ? "simplification-product-definition"
        : "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{
        id: "F-001",
        target: subject.datum.revision_id,
        relationship: "primary",
        severity: "blocking",
        summary: "The exact Phase 2 subject requires local correction.",
      }],
      ...(planningDwp
        ? {
          simplification: {
            target: subject.datum.revision_id,
            findings: [{
              id: "F-001",
              severity: "blocking",
              summary: "The exact Phase 2 subject requires local correction.",
            }],
          },
        }
        : {}),
      outcome: "fail",
    }, 1, [
      { type: "reviews", target: subject.datum.revision_id },
      ...(planningDwp && context
        ? [
          { type: "contextualizes", target: context.datum.revision_id },
          { type: "blocks", target: subject.datum.revision_id },
        ]
        : []),
    ]);

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-2-system-definition",
      records: [subject, ...(context ? [context] : []), review],
      dependencyComparisons: [],
    });

    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "phase-2-review-correction-required" &&
      item.subject === subject.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-phase-2-subject-after-review@1",
      participation: [expect.objectContaining({
        policy: "phase-2-correction-participation@1",
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
        attentionSchedule: expect.objectContaining({ timing: "none" }),
      })],
    }));
  }

  it("derives exact correction work for a failed SYS Review", () => {
    expectExactCorrectionWork("SYS", "SYS-0CORRECT01", 1, {});
  });

  it("derives exact correction work for a failed ASP Review", () => {
    expectExactCorrectionWork("ASP", "ASP-0CORRECT01", 1, {});
  });

  it("derives exact correction work for a failed ICSP Review", () => {
    expectExactCorrectionWork("ICSP", "ICSP-0CORRECT1", 1, {});
  });

  it("derives exact correction work for a failed planning DWP Review", () => {
    expectExactCorrectionWork("DWP", "DWP-0CORPLAN01", 1, { stage: "planning" });
  });

  it("derives exact correction work for a failed completion DWP Review", () => {
    expectExactCorrectionWork("DWP", "DWP-0CORCOMP01", 2, { stage: "completion" });
  });

  it("derives attended Phase 2 correction after two autonomous replacements", () => {
    const stableId = "SYS-0COREXHA01";
    const first = record("SYS", stableId, {}, 1);
    const firstReview = record("REV", "REV-0COREXHA01", {
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{ id: "F-001", target: first.datum.revision_id, relationship: "primary", severity: "blocking", summary: "First failure." }],
      outcome: "fail",
    }, 1, [{ type: "reviews", target: first.datum.revision_id }]);
    const second = record("SYS", stableId, {}, 2, [
      { type: "corrects-review", target: firstReview.datum.revision_id },
    ]);
    const secondReview = record("REV", "REV-0COREXHA02", {
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{ id: "F-002", target: second.datum.revision_id, relationship: "primary", severity: "blocking", summary: "Second failure." }],
      outcome: "fail",
    }, 1, [{ type: "reviews", target: second.datum.revision_id }]);
    const third = record("SYS", stableId, {}, 3, [
      { type: "corrects-review", target: secondReview.datum.revision_id },
    ]);
    const thirdReview = record("REV", "REV-0COREXHA03", {
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{ id: "F-003", target: third.datum.revision_id, relationship: "primary", severity: "blocking", summary: "Third failure." }],
      outcome: "fail",
    }, 1, [{ type: "reviews", target: third.datum.revision_id }]);

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-2-system-definition",
      records: [first, firstReview, second, secondReview, third, thirdReview],
      dependencyComparisons: [],
    });

    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "phase-2-review-correction-required" &&
      item.subject === third.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-phase-2-subject-after-review@1",
      participation: [expect.objectContaining({
        policy: "phase-2-correction-participation@1",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("derives exact correction work for a collateral Finding target", () => {
    const primary = record("SYS", "SYS-0CORPRIM01", {}, 1);
    const collateral = record("ICSP", "ICSP-0CORCOLL1", {}, 1);
    const review = record("REV", "REV-0CORCOLL01", {
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{
        id: "F-001",
        target: collateral.datum.revision_id,
        relationship: "collateral",
        severity: "blocking",
        summary: "The exact collateral interface requires local correction.",
      }],
      outcome: "pass",
    }, 1, [
      { type: "reviews", target: primary.datum.revision_id },
      { type: "flags", target: collateral.datum.revision_id },
    ]);

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-2-system-definition",
      records: [primary, collateral, review],
      dependencyComparisons: [],
    });

    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "phase-2-review-correction-required" &&
      item.subject === collateral.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-phase-2-subject-after-review@1",
      participation: [expect.objectContaining({
        policy: "phase-2-correction-participation@1",
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
        attentionSchedule: expect.objectContaining({ timing: "none" }),
      })],
    }));
  });
});
