import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessPackage,
} from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { reviewedGateFixture } from "./helpers/lifecycle-scenarios.js";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    frozen?: boolean;
    scenario?: string;
    links?: { type: string; target: string }[];
    revision?: number;
  } = {},
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    ...(options.revision ? { revision: options.revision } : {}),
    ...(options.links ? { links: options.links } : {}),
    createdBy: {
      process_ref: "git:phase-gate",
      ...(options.scenario ? { scenario: options.scenario } : {}),
    },
    storage: {
      editable: options.frozen === false,
      frozen: options.frozen !== false,
    },
  });
}

function candidate(id: string, scope: string): LifecycleRecord {
  return {
    datum: {
      id,
      revision: 1,
      revision_id: `${id}-r00001`,
      type: "SNP",
      payload: {
        title: `${scope} candidate`,
        kind: "intent-level-candidate",
        role: "candidate",
        scope,
        group: "DEFAULT",
        definition_members: [],
        evidence: [],
      },
      links: [],
      created_by: { process_ref: "git:phase-candidates" },
      body: "",
    },
    storage: { editable: false, frozen: true },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

describe("phase evaluation", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("explains failed entry and missing candidates with expression and Selector evidence", () => {
    const result = evaluateLifecycle(processPackage, {
      processRef: "git:phase-evidence",
      phaseId: "phase-2-system-definition",
      records: [],
      dependencyComparisons: [],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.phase).toEqual({
      id: "phase-2-system-definition",
      version: 3,
      entry: {
        satisfied: false,
        explanation: "The package-defined phase entry expression is not satisfied.",
        evidence: {
          source:
            'process.integrity.package_valid == true && exists("signed-off-candidates-of-kind@1",\n  {baseline_kind: "intent-level-candidate"})',
          result: false,
          selectors: expect.arrayContaining([
            {
              selector: "signed-off-candidates-of-kind@1",
              arguments: { baseline_kind: "intent-level-candidate" },
              result: [],
            },
          ]),
        },
      },
      candidateSelection: {
        explanation:
          "The package-defined candidate selection expression returned no exact entities.",
        entities: [],
        evidence: {
          source:
            'select("candidate-baselines-of-kind@1",\n  {baseline_kind: "level-candidate"})',
          result: [],
          selectors: expect.arrayContaining([
            {
              selector: "candidate-baselines-of-kind@1",
              arguments: { baseline_kind: "level-candidate" },
              result: [],
            },
          ]),
        },
      },
      gate: { required: true, evaluations: [] },
    });
  });

  it("evaluates the gate for one exact candidate with package expression, Policy, Selector, and blocker evidence", () => {
    const member = record("PSP", "PSP-7K3M9Q2D8F", {
      title: "Product intent",
      rationale: "Define the intended outcome.",
      problem: "Users need an evaluated gate.",
      users: ["maintainer"],
      desired_outcomes: ["Gate evidence is exact."],
      success_measures: ["Gate evaluation is deterministic."],
      scope: {in: ["gate evaluation"], out: ["scenario execution"]},
      constraints: ["Keep process meaning declarative."],
      assumptions: ["The package is valid."],
      risks: ["Evidence could bind the wrong candidate."],
    });
    const exactCandidate = record(
      "BSL",
      "BSL-7K3M9Q2D8F",
      {
        title: "Intent candidate",
        kind: "intent-level-candidate",
        role: "candidate",
        scope: "intent",
        group: "DEFAULT",
        definition_members: [member.datum.revision_id],
        evidence: [],
      },
      { scenario: "create-candidate-baseline@1" },
    );

    const result = evaluateLifecycle(processPackage, {
      processRef: "git:phase-gate",
      phaseId: "phase-0-wayfinding",
      records: [exactCandidate, member],
      dependencyComparisons: [],
    });

    const candidateIdentity = {
      identity: {
        id: exactCandidate.datum.id,
        revision_id: exactCandidate.datum.revision_id,
        type: "BSL",
        revision: 1,
      },
    };
    const memberIdentity = {
      identity: {
        id: member.datum.id,
        revision_id: member.datum.revision_id,
        type: "PSP",
        revision: 1,
      },
    };
    expect(result.diagnostics).toEqual([]);
    expect(result.phase?.gate).toEqual({
      required: true,
      evaluations: [
        {
          candidate: candidateIdentity,
          complete: false,
          explanation:
            "The package-defined gate completion expression is not satisfied for this exact candidate.",
          obligationInstance:
            `candidate-gate-signoff@2:${exactCandidate.datum.revision_id}:git:phase-gate`,
          status: "blocked",
          eventualResolver: "record-gate-signoff@2",
          actionableResolver: "create-review-context@1",
          dispatchable: false,
          blockedBy: [
            `candidate-members-reviewed@2:${exactCandidate.datum.revision_id}:git:phase-gate`,
            `passing-review-required@2:${exactCandidate.datum.revision_id}:git:phase-gate`,
          ],
          blockerChains: expect.arrayContaining([
            [
              `candidate-members-reviewed@2:${exactCandidate.datum.revision_id}:git:phase-gate`,
              `passing-review-required@2:${member.datum.revision_id}:git:phase-gate`,
              `review-context-required@2:${member.datum.revision_id}:git:phase-gate`,
            ],
            [
              `passing-review-required@2:${exactCandidate.datum.revision_id}:git:phase-gate`,
              `review-context-required@2:${exactCandidate.datum.revision_id}:git:phase-gate`,
            ],
          ]),
          unresolvedBindings: [],
          evidence: {
            source:
              'none("candidate-members-missing-review@1", {candidate: candidate}) && exists("passing-reviews-for@1", {subject: candidate}) && none("open-blocking-questions@1", {}) && exists("applicable-gate-signoffs-for@1", {candidate: candidate})',
            result: false,
            selectors: expect.arrayContaining([
              {
                selector: "candidate-members-missing-review@1",
                arguments: { candidate: candidateIdentity },
                result: [memberIdentity],
              },
              {
                selector: "review-required-members-for@1",
                arguments: { candidate: candidateIdentity },
                result: [memberIdentity],
              },
            ]),
            policies: [
              {
                policy: "review-applicability@1",
                arguments: { subject: memberIdentity },
                result: {
                  required: true,
                  rubric_ref: "policies/rubrics/bootstrap-review.md@1",
                },
              },
            ],
          },
        },
      ],
    });
  });

  it("blocks duplicate sign-off, completes after review, and reevaluates a changed exact candidate without rewriting prior evidence", () => {
    const {
      candidate: firstCandidate,
      candidateContext,
      candidateReview,
      signoff,
      signoffContext,
      signoffReview,
      beforeSignoffReview: beforeReviewRecords,
    } = reviewedGateFixture("git:exact-gate");

    const beforeReview = evaluateLifecycle(processPackage, {
      processRef: "git:exact-gate",
      phaseId: "phase-0-wayfinding",
      records: beforeReviewRecords,
      dependencyComparisons: [],
    });
    const blockedGate = beforeReview.phase?.gate.evaluations[0];
    expect(blockedGate).toEqual(expect.objectContaining({
      complete: false,
      status: "blocked",
      eventualResolver: "record-gate-signoff@2",
      actionableResolver: "review-datum-in-context@2",
      dispatchable: false,
      blockedBy: [
        `passing-review-required@2:${signoff.datum.revision_id}:git:exact-gate`,
      ],
    }));

    const reviewed = evaluateLifecycle(processPackage, {
      processRef: "git:exact-gate",
      phaseId: "phase-0-wayfinding",
      records: [...beforeReviewRecords, signoffReview],
      dependencyComparisons: [],
    });
    const completedGate = reviewed.phase?.gate.evaluations[0];
    expect(completedGate).toEqual(expect.objectContaining({
      candidate: {
        identity: {
          id: firstCandidate.datum.id,
          revision_id: firstCandidate.datum.revision_id,
          type: "BSL",
          revision: 1,
        },
      },
      complete: true,
      status: "satisfied",
      actionableResolver: null,
      dispatchable: false,
      blockedBy: [],
      blockerChains: [],
    }));
    expect(completedGate?.evidence.selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: "applicable-gate-signoffs-for@1",
          result: [{
            identity: {
              id: signoff.datum.id,
              revision_id: signoff.datum.revision_id,
              type: "DEC",
              revision: 1,
            },
          }],
        }),
      ]),
    );

    const preservedCompletedGate = structuredClone(completedGate);
    const changedCandidate = record(
      "BSL",
      firstCandidate.datum.id,
      {
        ...firstCandidate.datum.payload,
        title: "Changed intent candidate",
      },
      { revision: 2 },
    );
    const changed = evaluateLifecycle(processPackage, {
      processRef: "git:exact-gate",
      phaseId: "phase-0-wayfinding",
      records: [
        changedCandidate,
        candidateContext,
        candidateReview,
        signoff,
        signoffContext,
        signoffReview,
      ],
      dependencyComparisons: [],
    });

    expect(changed.phase?.gate.evaluations).toEqual([
      expect.objectContaining({
        candidate: {
          identity: {
            id: changedCandidate.datum.id,
            revision_id: changedCandidate.datum.revision_id,
            type: "BSL",
            revision: 2,
          },
        },
        complete: false,
      }),
    ]);
    expect(completedGate).toEqual(preservedCompletedGate);
  });

  it("returns exact package-typed candidates in declared order without mutating the snapshot", async () => {
    const loaded = await loadProcessPackage(
      await renamedBaselineProcessPackage(),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const zebra = candidate("SNP-7K3M9Q2D8F", "zebra");
    const alpha = candidate("SNP-4K3M9Q2D8F", "alpha");
    const snapshot: LifecycleSnapshot = {
      processRef: "git:phase-candidates",
      phaseId: "phase-0-wayfinding",
      records: [zebra, alpha],
      dependencyComparisons: [],
    };
    const beforeEvaluation = structuredClone(snapshot);

    const first = evaluateLifecycle(loaded.package, snapshot);
    const second = evaluateLifecycle(loaded.package, {
      ...snapshot,
      records: [alpha, zebra],
    });

    const expectedCandidates = [
      {
        identity: {
          id: alpha.datum.id,
          revision_id: alpha.datum.revision_id,
          type: "SNP",
          revision: 1,
        },
      },
      {
        identity: {
          id: zebra.datum.id,
          revision_id: zebra.datum.revision_id,
          type: "SNP",
          revision: 1,
        },
      },
    ];
    expect(first.diagnostics).toEqual([]);
    expect(first.phase?.entry.satisfied).toBe(true);
    expect(first.phase?.candidateSelection.entities).toEqual(
      expectedCandidates,
    );
    expect(first.phase?.candidateSelection.evidence.selectors).toEqual(
      expect.arrayContaining([
        {
          selector: "candidate-baselines-of-kind@1",
          arguments: { baseline_kind: "intent-level-candidate" },
          result: expectedCandidates,
        },
      ]),
    );
    expect(second.phase).toEqual(first.phase);
    expect(snapshot).toEqual(beforeEvaluation);
  });
});
