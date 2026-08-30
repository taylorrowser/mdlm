import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { exactContextWaiverFor } from "./helpers/lifecycle-scenarios.js";

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    frozen?: boolean;
    links?: { type: string; target: string }[];
    scenario?: string;
  } = {},
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    ...(options.links ? { links: options.links } : {}),
    createdBy: {
      scenario: options.scenario ?? "compile-psp@2",
      prompt_ref: "prompts/compile-psp.md@2",
      process_ref: "git:current",
      loaded_skill_refs: [],
      policy_refs: ["review-applicability@1"],
    },
    storage: {
      editable: !options.frozen,
      frozen: options.frozen ?? false,
    },
  });
}

function expectNoReviewObligationsFor(
  evaluation: ReturnType<typeof evaluateLifecycle>,
  revisionId: string,
): void {
  expect(
    evaluation.obligations.filter(
      (item) =>
        item.subject === revisionId &&
        ["review-context-required", "passing-review-required"].includes(
          item.obligation,
        ),
    ),
  ).toEqual([]);
}

describe("evaluateLifecycle review flow", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
  });

  it("recognizes a passing review through computed backlinks", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const context = record(
      "BSL",
      "BSL-X4N7AB2W6J",
      {
        title: "PSP context",
        kind: "review-context",
        role: "review-context",
        scope: psp.datum.revision_id,
        group: "DEFAULT",
        definition_members: [psp.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const review = record(
      "REV",
      "REV-8ZT5KQ3P9M",
      {
        title: "PSP review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: psp.datum.revision_id },
          { type: "contextualizes", target: context.datum.revision_id },
        ],
      },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, context, review],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.looseEnds.filter((item) =>
        item.subject === psp.datum.revision_id &&
        ["review-context-required", "passing-review-required"].includes(
          item.obligation,
        )
      ),
    ).toEqual([]);
    expect(
      evaluation.obligations.find(
        (item) =>
          item.subject === psp.datum.revision_id &&
          item.obligation === "passing-review-required",
      ),
    ).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
  });

  it("rejects a current Review when its context omits currently required support", () => {
    const parent = record("PSP", "PSP-7M4R8T2V9K", {
      title: "Parent specification",
      rationale: "Own stakeholder scope.",
      problem: "Support must remain exact.",
      users: ["owner"],
      goals: ["exact contexts"],
      non_goals: [],
      success_measures: ["missing support invalidates reuse"],
    });
    const subject = record(
      "STK",
      "STK-7M4R8T2V9K",
      {
        title: "Supported requirement",
        statement: "The product shall retain its exact parent context.",
        verification_intent: "Inspect the generated context membership.",
        system_context: "product",
      },
      { links: [{ type: "derived-from", target: parent.datum.revision_id }] },
    );
    const incompleteContext = record(
      "BSL",
      "BSL-7M4R8T2V9K",
      {
        title: "Incomplete Review Context",
        kind: "review-context",
        role: "review-context",
        scope: subject.datum.revision_id,
        group: "DEFAULT",
        definition_members: [subject.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const review = record(
      "REV",
      "REV-7M4R8T2V9K",
      {
        title: "Review with incomplete support",
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: subject.datum.revision_id },
          { type: "contextualizes", target: incompleteContext.datum.revision_id },
        ],
      },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [parent, subject, incompleteContext, review],
      dependencyComparisons: [],
    });
    expect(
      evaluation.obligations.find(
        (item) =>
          item.subject === subject.datum.revision_id &&
          item.obligation === "passing-review-required",
      ),
    ).toEqual(expect.objectContaining({ satisfied: false }));
  });

  it("rejects passing Review reuse from an old package or superseded exact context", () => {
    const subject = record("PSP", "PSP-6M4R8T2V9K", {
      title: "Current reviewed subject",
      rationale: "Keep ordinary Review reuse exact.",
      problem: "Stale Review authority could be reused.",
      users: ["owner"],
      goals: ["current Review authority"],
      non_goals: [],
      success_measures: ["stale authority is rejected"],
    });
    const context = record("BSL", "BSL-6M4R8T2V9K", {
      title: "Current exact Review Context",
      kind: "review-context",
      role: "review-context",
      scope: subject.datum.revision_id,
      group: "DEFAULT",
      definition_members: [subject.datum.revision_id],
      evidence: [],
    }, { frozen: true, scenario: "create-review-context@1" });
    const review = record("REV", "REV-6M4R8T2V9K", {
      title: "Passing exact Review",
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [],
      outcome: "pass",
    }, {
      frozen: true,
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: subject.datum.revision_id },
        { type: "contextualizes", target: context.datum.revision_id },
      ],
    });

    const oldPackageReview = structuredClone(review);
    oldPackageReview.datum.created_by.process_ref = "git:old-package";
    const oldPackageEvaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [subject, context, oldPackageReview],
      dependencyComparisons: [],
    });
    expect(oldPackageEvaluation.obligations.find((item) =>
      item.subject === subject.datum.revision_id &&
      item.obligation === "passing-review-required"
    )).toEqual(expect.objectContaining({ satisfied: false }));

    const replacementContext = structuredClone(context);
    replacementContext.datum.revision = 2;
    replacementContext.datum.revision_id = `${context.datum.id}-r00002`;
    replacementContext.datum.payload.title = "Replacement exact Review Context";
    const staleContextEvaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [subject, context, replacementContext, review],
      dependencyComparisons: [],
    });
    expect(staleContextEvaluation.obligations.find((item) =>
      item.subject === subject.datum.revision_id &&
      item.obligation === "passing-review-required"
    )).toEqual(expect.objectContaining({ satisfied: false }));
  });

  it("keeps historical failed Reviews without requiring more work on replaced Revisions", () => {
    const original = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const originalContext = record(
      "BSL",
      "BSL-X4N7AB2W6J",
      {
        title: "Original PSP context",
        kind: "review-context",
        role: "review-context",
        scope: original.datum.revision_id,
        group: "DEFAULT",
        definition_members: [original.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const failedReview = record(
      "REV",
      "REV-8ZT5KQ3P9M",
      {
        title: "Original PSP review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [
          {
            severity: "blocking",
            criterion: "A failed historical Review must not create new correction work after its subject has an active replacement.",
            evidence:
              "The failed Review targets a superseded Revision whose corrected replacement is already current.",
            material_consequence:
              "Reopening the historical failure would duplicate correction work on an inactive subject.",
            summary: "Clarify the intended outcome.",
            disposition: "open",
          },
        ],
        correction_authority: "stakeholder",
        outcome: "fail",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: original.datum.revision_id },
          {
            type: "contextualizes",
            target: originalContext.datum.revision_id,
          },
        ],
      },
    );
    const replacement = structuredClone(original);
    replacement.datum.revision = 2;
    replacement.datum.revision_id = `${original.datum.id}-r00002`;
    replacement.datum.payload.title = "Clarified lifecycle manager";

    const beforeReplacementReview = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [original, originalContext, failedReview, replacement],
      dependencyComparisons: [],
    });

    expect(beforeReplacementReview.diagnostics).toEqual([]);
    expect(
      beforeReplacementReview.artifacts[original.datum.revision_id],
    ).toBeDefined();
    expect(
      beforeReplacementReview.artifacts[failedReview.datum.revision_id],
    ).toBeDefined();
    expectNoReviewObligationsFor(
      beforeReplacementReview,
      original.datum.revision_id,
    );
    expect(
      beforeReplacementReview.looseEnds.find(
        (item) =>
          item.subject === replacement.datum.revision_id &&
          item.obligation === "review-context-required",
      ),
    ).toEqual(expect.objectContaining({ status: "ready" }));

    const replacementContext = record(
      "BSL",
      "BSL-4F6H8JK2MN",
      {
        title: "Replacement PSP context",
        kind: "review-context",
        role: "review-context",
        scope: replacement.datum.revision_id,
        group: "DEFAULT",
        definition_members: [replacement.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const passingReview = record(
      "REV",
      "REV-2BC4DF6GHJ",
      {
        title: "Replacement PSP review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: replacement.datum.revision_id },
          {
            type: "contextualizes",
            target: replacementContext.datum.revision_id,
          },
        ],
      },
    );

    const afterReplacementReview = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [
        original,
        originalContext,
        failedReview,
        replacement,
        replacementContext,
        passingReview,
      ],
      dependencyComparisons: [],
    });

    expect(afterReplacementReview.diagnostics).toEqual([]);
    expect(
      afterReplacementReview.artifacts[original.datum.revision_id],
    ).toBeDefined();
    expect(
      afterReplacementReview.artifacts[failedReview.datum.revision_id],
    ).toBeDefined();
    expectNoReviewObligationsFor(
      afterReplacementReview,
      original.datum.revision_id,
    );
    expect(
      afterReplacementReview.obligations.find(
        (item) =>
          item.subject === replacement.datum.revision_id &&
          item.obligation === "passing-review-required",
      ),
    ).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(
      afterReplacementReview.looseEnds.filter((item) =>
        item.subject === replacement.datum.revision_id &&
        ["review-context-required", "passing-review-required"].includes(
          item.obligation,
        )
      ),
    ).toEqual([]);
  });

  it("does not treat a generic justification as a waiver of an exact Obligation Instance", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const genericDecision = record(
      "DEC",
      "DEC-X4N7AB2W6J",
      {
        title: "Review rationale",
        rationale: "Review will happen later.",
        kind: "decision",
        decision: "Continue without a context for now.",
        alternatives: ["Create the context now."],
        effective_scope: psp.datum.revision_id,
      },
      {
        frozen: true,
        links: [
          { type: "justifies", target: psp.datum.revision_id },
        ],
      },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, genericDecision],
      dependencyComparisons: [],
    });
    const looseEnd = evaluation.looseEnds.find(
      (item) =>
        item.obligation === "review-context-required" &&
        item.subject === psp.datum.revision_id,
    );

    expect(looseEnd).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      dispatchable: true,
      waiver: {
        policy: "waiver-applicability@1",
        result: {
          permitted: false,
          approvalRequired: true,
          applicable: false,
          scope: null,
          evidence: [],
        },
      },
    }));
  });

  it("keeps invalid waiver evidence visible without satisfying the Loose End", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const { obligationInstance, waiver } = exactContextWaiverFor(psp, "git:current");

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, waiver],
      dependencyComparisons: [],
    });
    const looseEnd = evaluation.looseEnds.find(
      (item) => item.id === obligationInstance,
    );

    expect(looseEnd).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      waiver: {
        policy: "waiver-applicability@1",
        result: {
          permitted: false,
          approvalRequired: true,
          applicable: false,
          scope: null,
          evidence: [{
            identity: {
              id: waiver.datum.id,
              revision_id: waiver.datum.revision_id,
              type: "DEC",
              revision: 1,
            },
          }],
        },
      },
    }));
  });

  it("suppresses work only when an exact structured waiver is applicable", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const { obligationInstance, waiver, context, review } = exactContextWaiverFor(psp, "git:current");

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, waiver, context, review],
      dependencyComparisons: [],
    });
    const waived = evaluation.obligations.find(
      (item) => item.id === obligationInstance,
    );

    expect(waived).toEqual(expect.objectContaining({
      satisfied: false,
      status: "waived",
      dispatchable: false,
      actionableResolver: null,
      waiver: {
        policy: "waiver-applicability@1",
        result: {
          permitted: true,
          approvalRequired: true,
          applicable: true,
          scope: "this-revision",
          evidence: [{
            identity: {
              id: waiver.datum.id,
              revision_id: waiver.datum.revision_id,
              type: "DEC",
              revision: 1,
            },
          }],
        },
      },
    }));
    expect(evaluation.looseEnds.some((item) => item.id === obligationInstance))
      .toBe(false);
  });

  it("rejects a waiver whose payload names a different Obligation Instance than its exact link", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const { obligationInstance, waiver, context, review } = exactContextWaiverFor(
      psp,
      "git:current",
    );
    (waiver.datum.payload.waiver as Record<string, unknown>).instance =
      `passing-review-required@2:${psp.datum.revision_id}:git:current`;

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, waiver, context, review],
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) => item.id === obligationInstance))
      .toEqual(expect.objectContaining({
        status: "ready",
        waiver: {
          policy: "waiver-applicability@1",
          result: expect.objectContaining({ applicable: false }),
        },
      }));
  });

  it("does not carry an exact waiver onto its replacement Revision", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const revisedPsp = structuredClone(psp);
    revisedPsp.datum.revision = 2;
    revisedPsp.datum.revision_id = `${psp.datum.id}-r00002`;
    revisedPsp.datum.payload.title = "Revised lifecycle manager";
    const { obligationInstance, waiver, context, review } = exactContextWaiverFor(psp, "git:current");

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, revisedPsp, waiver, context, review],
      dependencyComparisons: [],
    });
    expect(
      evaluation.obligations.find((item) => item.id === obligationInstance),
    ).toBeUndefined();
    expect(
      evaluation.looseEnds.find(
        (item) =>
          item.subject === revisedPsp.datum.revision_id &&
          item.obligation === "review-context-required",
      ),
    ).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      waiver: {
        policy: "waiver-applicability@1",
        result: expect.objectContaining({
          permitted: false,
          applicable: false,
          scope: null,
          evidence: [],
        }),
      },
    }));
  });

  it("derives candidate readiness from member reviews instead of a kernel-specific fact", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const context = record(
      "BSL",
      "BSL-X4N7AB2W6J",
      {
        title: "PSP context",
        kind: "review-context",
        role: "review-context",
        scope: psp.datum.revision_id,
        group: "DEFAULT",
        definition_members: [psp.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const review = record(
      "REV",
      "REV-8ZT5KQ3P9M",
      {
        title: "PSP review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: psp.datum.revision_id },
          { type: "contextualizes", target: context.datum.revision_id },
        ],
      },
    );
    const candidate = record(
      "BSL",
      "BSL-4F6H8JK2MN",
      {
        title: "Intent candidate",
        kind: "intent-level-candidate",
        role: "candidate",
        scope: "product",
        group: "DEFAULT",
        definition_members: [psp.datum.revision_id],
        evidence: [review.datum.revision_id],
      },
      { frozen: true, scenario: "create-candidate-baseline@1" },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, context, review, candidate],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.artifacts[psp.datum.revision_id]?.states.maturity).toBe(
      "candidate",
    );
    expect(
      evaluation.obligations.find(
        (item) =>
          item.subject === candidate.datum.revision_id &&
          item.obligation === "candidate-members-reviewed",
      ),
    ).toEqual(expect.objectContaining({ satisfied: true }));
    expect(
      evaluation.looseEnds.find(
        (item) =>
          item.subject === candidate.datum.revision_id &&
          item.obligation === "candidate-gate-signoff",
      ),
    ).toEqual(
      expect.objectContaining({
        status: "blocked",
        explanation: expect.stringContaining("Candidate reviews"),
      }),
    );
  });

  it("routes a failed intent-candidate Review to an exact superseding-candidate Resolver", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Reviewed product intent",
      rationale: "Preserve exact intent",
      problem: "Intent is otherwise ambiguous",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const pspContext = record("BSL", "BSL-X4N7AB2W6J", {
      title: "PSP context",
      kind: "review-context",
      role: "review-context",
      scope: psp.datum.revision_id,
      group: "DEFAULT",
      definition_members: [psp.datum.revision_id],
      evidence: [],
    }, { frozen: true, scenario: "create-review-context@1" });
    const pspReview = record(
      "REV",
      "REV-8ZT5KQ3P9M",
      {
        title: "Passing PSP Review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
      frozen: true,
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: psp.datum.revision_id },
        { type: "contextualizes", target: pspContext.datum.revision_id },
      ],
    },
    );
    const candidate = record("BSL", "BSL-4F6H8JK2MN", {
      title: "Failed intent candidate",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "product",
      group: "DEFAULT",
      definition_members: [psp.datum.revision_id],
      evidence: [pspReview.datum.revision_id],
    }, { frozen: true, scenario: "create-candidate-baseline@1" });
    const candidateContext = record("BSL", "BSL-6F8H2JK4MN", {
      title: "Candidate context",
      kind: "review-context",
      role: "review-context",
      scope: candidate.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        candidate.datum.revision_id,
        psp.datum.revision_id,
      ],
      evidence: [],
    }, { frozen: true, scenario: "create-review-context@1" });
    const passingCandidateReview = record(
      "REV",
      "REV-1BC3DF5GHK",
      {
        title: "Earlier passing candidate Review",
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        outcome: "pass",
      },
      {
      frozen: true,
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: candidate.datum.revision_id },
        { type: "contextualizes", target: candidateContext.datum.revision_id },
      ],
    },
    );
    const failedReview = record(
      "REV",
      "REV-2BC4DF6GHJ",
      {
        title: "Failed candidate Review",
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        simplification: {
          target: candidate.datum.revision_id,
          findings: [
            {
              id: "F-001",
              severity: "blocking",
              criterion:
                "A failed intent-candidate Review must be corrected by an exact superseding candidate Revision.",
              evidence:
                "The current intent candidate has a primary blocking Review finding in its frozen context.",
              material_consequence:
                "The candidate cannot authorize accepted intent until superseded by a corrected candidate.",
              summary: "The candidate retains unnecessary product scope.",
            },
          ],
        },
        correction_authority: "package-evidence",
        outcome: "fail",
      },
      {
      frozen: true,
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: candidate.datum.revision_id },
        { type: "contextualizes", target: candidateContext.datum.revision_id },
        { type: "blocks", target: candidate.datum.revision_id },
      ],
    },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [
        psp,
        pspContext,
        pspReview,
        candidate,
        candidateContext,
        passingCandidateReview,
        failedReview,
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.looseEnds).toContainEqual(expect.objectContaining({
      obligation: "intent-candidate-review-correction-required",
      subject: candidate.datum.revision_id,
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-intent-candidate-after-review@3",
    }));
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "failed",
      dispatchable: false,
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
    }));
  });

  it("derives staleness and process drift from primitive values and relations", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    psp.datum.created_by.process_ref = "git:older-process";

    const revised = structuredClone(psp);
    revised.datum.revision = 2;
    revised.datum.revision_id = `${psp.datum.id}-r00002`;
    revised.datum.payload.title = "Revised lifecycle manager";
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, revised],
      dependencyComparisons: [
        {
          subjectRevision: revised.datum.revision_id,
          beforeRevision: psp.datum.revision_id,
          afterRevision: revised.datum.revision_id,
        },
      ],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.artifacts[revised.datum.revision_id]?.states.validity).toBe(
      "stale",
    );
    expect(
      evaluation.artifacts[revised.datum.revision_id]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("does not dispatch a duplicate gate interview while a sign-off decision awaits review", () => {
    const psp = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    });
    const pspContext = record(
      "BSL",
      "BSL-X4N7AB2W6J",
      {
        title: "PSP context",
        kind: "review-context",
        role: "review-context",
        scope: psp.datum.revision_id,
        group: "DEFAULT",
        definition_members: [psp.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const pspReview = record(
      "REV",
      "REV-8ZT5KQ3P9M",
      {
        title: "PSP review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: psp.datum.revision_id },
          { type: "contextualizes", target: pspContext.datum.revision_id },
        ],
      },
    );
    const candidate = record(
      "BSL",
      "BSL-4F6H8JK2MN",
      {
        title: "Intent candidate",
        kind: "intent-level-candidate",
        role: "candidate",
        scope: "product",
        group: "DEFAULT",
        definition_members: [psp.datum.revision_id],
        evidence: [pspReview.datum.revision_id],
      },
      { frozen: true, scenario: "create-candidate-baseline@1" },
    );
    const candidateContext = record(
      "BSL",
      "BSL-9PQR3ST5VW",
      {
        title: "Candidate context",
        kind: "review-context",
        role: "review-context",
        scope: candidate.datum.revision_id,
        group: "DEFAULT",
        definition_members: [candidate.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );
    const candidateReview = record(
      "REV",
      "REV-2BC4DF6GHJ",
      {
        title: "Candidate review",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@2",
        links: [
          { type: "reviews", target: candidate.datum.revision_id },
          {
            type: "contextualizes",
            target: candidateContext.datum.revision_id,
          },
        ],
      },
    );
    const signoff = record(
      "DEC",
      "DEC-7KLM9NP2QR",
      {
        title: "Intent gate sign-off",
        rationale: "The exact candidate reflects intended scope.",
        kind: "gate-signoff",
        gate_outcome: "approve",
        decision: "Approve for downstream work.",
        alternatives: ["revise candidate"],
        effective_scope: candidate.datum.revision_id,
      },
      {
        frozen: false,
        scenario: "record-gate-signoff@3",
        links: [
          { type: "justifies", target: candidate.datum.revision_id },
        ],
      },
    );
    const signoffContext = record(
      "BSL",
      "BSL-5KLM9NP2QR",
      {
        title: "Gate sign-off review context",
        kind: "review-context",
        role: "review-context",
        scope: signoff.datum.revision_id,
        group: "DEFAULT",
        definition_members: [signoff.datum.revision_id],
        evidence: [],
      },
      { frozen: true, scenario: "create-review-context@1" },
    );

    const records = [
      psp,
      pspContext,
      pspReview,
      candidate,
      candidateContext,
      candidateReview,
      signoff,
      signoffContext,
    ];
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records,
      dependencyComparisons: [],
    });

    const gate = evaluation.looseEnds.find(
      (item) =>
        item.subject === candidate.datum.revision_id &&
        item.obligation === "candidate-gate-signoff",
    );
    expect(gate).toEqual(
      expect.objectContaining({
        status: "blocked",
        eventualResolver: "record-gate-signoff@3",
        actionableResolver: "create-review-context@1",
        dispatchable: false,
        blockedBy: [
          `passing-review-required@2:${signoff.datum.revision_id}:git:current`,
        ],
        blockerChains: [[
          `passing-review-required@2:${signoff.datum.revision_id}:git:current`,
          `review-context-required@2:${signoff.datum.revision_id}:git:current`,
        ]],
        unresolvedBindings: [],
        explanation: expect.stringContaining("sign-off decision awaits review"),
      }),
    );
    expect(
      evaluation.looseEnds.find(
        (item) =>
          item.subject === signoff.datum.revision_id &&
          item.obligation === "passing-review-required",
      ),
    ).toEqual(expect.objectContaining({
      status: "blocked",
      eventualResolver: "review-datum-in-context@2",
      actionableResolver: "create-review-context@1",
      dispatchable: false,
      blockedBy: [
        `review-context-required@2:${signoff.datum.revision_id}:git:current`,
      ],
      blockerChains: [[
        `review-context-required@2:${signoff.datum.revision_id}:git:current`,
      ]],
      unresolvedBindings: ["review_context"],
    }));

    const reordered = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [...records].reverse(),
      dependencyComparisons: [],
    });
    const reorderedGate = reordered.looseEnds.find(
      (item) => item.id === gate?.id,
    );
    expect(reorderedGate).toEqual(gate);
  });

  it("projects autonomous correction for failed current VSP and pilot VER Reviews", () => {
    const psp = record("PSP", "PSP-1111111111", { title: "Product" });
    const requirement = record(
      "STK",
      "STK-2222222222",
      { title: "Requirement" },
      { links: [{ type: "derived-from", target: psp.datum.id }] },
    );
    const strategy = record(
      "VSP",
      "VSP-3333333333",
      {
        title: "Strategy",
        level: "stakeholder",
        independence: { boundary: "black-box" },
      },
      {
        links: [
          { type: "governs", target: requirement.datum.id },
          { type: "governs-revision", target: requirement.datum.revision_id },
        ],
      },
    );
    const activity = record(
      "VER",
      "VER-4444444444",
      {
        title: "Pilot activity",
        kind: "pilot",
        claim: {
          kind: "pilot",
          scope: "verification-design",
          formal_evidence_eligible: false,
        },
      },
      {
        links: [
          { type: "verifies", target: requirement.datum.id },
          { type: "verifies-revision", target: requirement.datum.revision_id },
          { type: "governed-by", target: strategy.datum.revision_id },
          { type: "derived-from", target: psp.datum.revision_id },
        ],
      },
    );
    const contextualReview = (
      subject: LifecycleRecord,
      contextId: string,
      reviewId: string,
      outcome: "pass" | "fail" = "fail",
    ) => {
      const context = record(
        "BSL",
        contextId,
        {
          title: "Exact context",
          kind: "review-context",
          role: "review-context",
          scope: subject.datum.revision_id,
          group: "DEFAULT",
          definition_members: [subject.datum.revision_id],
          evidence: [],
        },
        { frozen: true, scenario: "create-review-context@1" },
      );
      const review = record(
        "REV",
        reviewId,
        {
          title: "Failed Review",
          review_kind: "contextual",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          findings: outcome === "fail"
            ? [
                {
                  id: "F-001",
                  target: subject.datum.revision_id,
                  relationship: "primary",
                  severity: "blocking",
                  criterion:
                    "Current VSP and pilot VER Revisions with primary blockers require exact autonomous correction routes.",
                  evidence:
                    "The Reviews reject the current strategy and verification evidence Revisions, not historical replacements.",
                  material_consequence:
                    "Assurance cannot proceed using rejected current verification definitions.",
                  summary: "Correction required",
                },
              ]
            : [],
          ...(outcome === "fail"
            ? { correction_authority: "package-evidence" }
            : {}),
          outcome,
        },
        {
          frozen: true,
          scenario: "review-datum-in-context@2",
          links: [
            { type: "reviews", target: subject.datum.revision_id },
            { type: "contextualizes", target: context.datum.revision_id },
          ],
        },
      );
      return [context, review];
    };
    const acceptedIntent = record(
      "BSL",
      "BSL-9999999991",
      {
        title: "Accepted exact intent",
        kind: "intent-approved",
        role: "accepted",
        scope: "phase-0-wayfinding",
        group: "DEFAULT",
        definition_members: [
          psp.datum.revision_id,
          requirement.datum.revision_id,
        ],
        evidence: [],
      },
      { frozen: true, scenario: "accept-phase-0-intent@1" },
    );
    const strategyReview = contextualReview(
      strategy,
      "BSL-5555555555",
      "REV-6666666666",
    );
    const activityReview = contextualReview(
      activity,
      "BSL-7777777777",
      "REV-8888888888",
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:phase-1-correction",
      phaseId: "phase-1-product-assurance",
      records: [
        psp,
        acceptedIntent,
        requirement,
        strategy,
        activity,
        ...strategyReview,
        ...activityReview,
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.looseEnds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "verification-strategy-review-correction-required",
        subject: strategy.datum.revision_id,
        status: "ready",
        dispatchable: true,
        actionableResolver: "revise-verification-strategy-after-review@2",
        participation: [expect.objectContaining({
          authorityRequirement: expect.objectContaining({
            mode: "autonomous",
            authority: "package-evidence",
          }),
          attentionSchedule: expect.objectContaining({ timing: "none" }),
        })],
      }),
      expect.objectContaining({
        obligation: "pilot-verification-activity-review-correction-required",
        subject: activity.datum.revision_id,
        status: "ready",
        dispatchable: true,
        actionableResolver: "revise-pilot-verification-activity-after-review@3",
        participation: [expect.objectContaining({
          authorityRequirement: expect.objectContaining({
            mode: "autonomous",
            authority: "package-evidence",
          }),
          attentionSchedule: expect.objectContaining({ timing: "none" }),
        })],
      }),
    ]));
  });

  it("declares ambiguous Phase 1 assurance evidence as an intentional profile boundary", () => {
    const product = record("PSP", "PSP-2A3B4C5D6E", { title: "Product" });
    const requirement = record(
      "STK",
      "STK-2A3B4C5D6E",
      { title: "Requirement" },
      { links: [{ type: "derived-from", target: product.datum.id }] },
    );
    const strategy = (id: string) => record(
      "VSP",
      id,
      {
        title: "Competing strategy",
        level: "stakeholder",
        independence: { boundary: "black-box" },
      },
      {
        links: [
          { type: "governs", target: requirement.datum.id },
          { type: "governs-revision", target: requirement.datum.revision_id },
        ],
      },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:phase-1-ambiguity",
      phaseId: "phase-1-product-assurance",
      records: [
        product,
        requirement,
        strategy("VSP-2A3B4C5D6E"),
        strategy("VSP-2A3B4C5D6F"),
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.terminalOutcome).toEqual(expect.objectContaining({
      outcome: "profile-boundary-reached",
      explanation: expect.stringMatching(/multiple applicable/i),
      evidence: expect.objectContaining({
        condition: expect.objectContaining({ result: true }),
      }),
    }));
  });
});
