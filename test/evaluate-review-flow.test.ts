import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
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
      scenario: options.scenario ?? "compile-psp@1",
      prompt_ref: "prompts/compile-psp.md@1",
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

describe("evaluateLifecycle review flow", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
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
        scope: "PSP",
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
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@1",
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
      evaluation.looseEnds.filter((item) => item.subject === psp.datum.revision_id),
    ).toEqual([]);
    expect(
      evaluation.obligations.find(
        (item) =>
          item.subject === psp.datum.revision_id &&
          item.obligation === "passing-review-required",
      ),
    ).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
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
    const { obligationInstance, waiver, review } = exactContextWaiverFor(psp, "git:current");

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, waiver, review],
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

  it("expires an exact waiver when its subject is revised", () => {
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
    const { obligationInstance, waiver, review } = exactContextWaiverFor(psp, "git:current");

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [psp, revisedPsp, waiver, review],
      dependencyComparisons: [],
    });
    const expired = evaluation.looseEnds.find(
      (item) => item.id === obligationInstance,
    );

    expect(expired).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      waiver: {
        policy: "waiver-applicability@1",
        result: expect.objectContaining({
          permitted: false,
          applicable: false,
          scope: null,
          evidence: [{
            identity: expect.objectContaining({
              revision_id: waiver.datum.revision_id,
            }),
          }],
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
        scope: "PSP",
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
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@1",
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
        scope: "PSP",
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
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@1",
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
        scope: "candidate",
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
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        scenario: "review-datum-in-context@1",
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
        decision: "Approve for downstream work.",
        alternatives: ["revise candidate"],
        effective_scope: candidate.datum.revision_id,
      },
      {
        frozen: false,
        scenario: "record-gate-signoff@1",
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
        scope: "intent-gate",
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
        eventualResolver: "record-gate-signoff@1",
        actionableResolver: "review-datum-in-context@1",
        dispatchable: false,
        blockedBy: [
          `passing-review-required@2:${signoff.datum.revision_id}:git:current`,
        ],
        blockerChains: [[
          `passing-review-required@2:${signoff.datum.revision_id}:git:current`,
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
      status: "awaiting-review",
      eventualResolver: "review-datum-in-context@1",
      actionableResolver: "review-datum-in-context@1",
      dispatchable: true,
      unresolvedBindings: [],
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
});
