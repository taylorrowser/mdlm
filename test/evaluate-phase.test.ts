import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessPackage,
} from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import {
  acceptedIntentForReviewedGate,
  frozenLifecycleRecord,
  reviewedGateFixture,
} from "./helpers/lifecycle-scenarios.js";
import {
  distinctProgressionProcessPackage,
  renamedBaselineProcessPackage,
} from "./helpers/process-package.js";

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
  const temporaryProcessParents = new Set<string>();

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
  });

  afterAll(async () => {
    await Promise.all([...temporaryProcessParents].map((parent) =>
      fs.rm(parent, { recursive: true, force: true })
    ));
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
      version: 9,
      attentionCheckpoints: [expect.objectContaining({
        id: "phase-2-system-gate",
        active: false,
        evidence: expect.objectContaining({ result: false }),
      })],
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
          source: 'select("complete-phase-2-level-candidates@1", {})',
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
      progression: expect.objectContaining({
        nextPhase: "phase-2-pilot-assessment",
        ready: false,
        authorized: false,
        complete: false,
      }),
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
            `candidate-gate-signoff@3:${exactCandidate.datum.revision_id}:git:phase-gate`,
          status: "blocked",
          eventualResolver: "record-gate-signoff@3",
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
              'none("candidate-members-missing-review@1", {candidate: candidate}) && exists("product-simplification-reviews-for@1",\n  {candidate: candidate, outcome: "pass"})\n&& none("failing-reviews-for@1", {subject: candidate}) && none("candidate-correction-authorities-requiring-review@1",\n  {candidate: candidate})\n&& none("open-blocking-questions@1", {}) && exists("applicable-gate-signoffs-for@1", {candidate: candidate})',
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
                  rubric_ref: "policies/rubrics/bootstrap-review.md@3",
                },
              },
            ],
          },
        },
      ],
    });
  });

  it("records each equivalent Selector call once in Phase gate evidence", () => {
    const fixture = reviewedGateFixture("git:selector-evidence");
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:selector-evidence",
      phaseId: "phase-0-wayfinding",
      records: fixture.beforeSignoffReview,
      dependencyComparisons: [],
    });
    const selectors = evaluation.phase?.gate.evaluations[0]?.evidence.selectors;
    expect(selectors?.length).toBeGreaterThan(0);
    const callKeys = selectors?.map((selector) =>
      JSON.stringify([selector.selector, selector.arguments])
    );
    expect(callKeys).toEqual([...new Set(callKeys)]);
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
      eventualResolver: "record-gate-signoff@3",
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

  it("projects accepted intent without requiring a second approval", () => {
    const fixture = reviewedGateFixture("git:phase-progression");
    const {
      signoff,
      signoffReview,
      beforeSignoffReview,
    } = fixture;

    const awaitingAuthorizationReview = evaluateLifecycle(processPackage, {
      processRef: "git:phase-progression",
      phaseId: "phase-0-wayfinding",
      records: beforeSignoffReview,
      dependencyComparisons: [],
    });
    expect(awaitingAuthorizationReview.phase?.progression).toEqual(
      expect.objectContaining({
        nextPhase: "phase-1-product-assurance",
        gateComplete: false,
        ready: false,
        authorized: false,
        complete: false,
        authority: expect.objectContaining({
          policy: "phase-progression-participation@1",
          scenario: "record-gate-signoff@3",
          evidenceSelector: "applicable-gate-signoffs-for@1",
          subjects: [expect.objectContaining({
            identity: expect.objectContaining({
              revision_id: "BSL-4K3M9Q2D8F-r00001",
            }),
          })],
          evidence: [],
          authorityRequirement: {
            mode: "attended",
            authority: "stakeholder",
            delegationAllowed: false,
          },
          attentionRequired: false,
        }),
      }),
    );

    const acceptedIntent = acceptedIntentForReviewedGate(
      "git:phase-progression",
      fixture,
    );
    const authorized = evaluateLifecycle(processPackage, {
      processRef: "git:phase-progression",
      phaseId: "phase-0-wayfinding",
      records: [...beforeSignoffReview, signoffReview, acceptedIntent],
      dependencyComparisons: [],
    });
    expect(authorized.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-1-product-assurance",
      gateComplete: true,
      ready: true,
      authorized: true,
      complete: true,
      authority: expect.objectContaining({
        evidence: [{
          identity: {
            id: signoff.datum.id,
            revision_id: signoff.datum.revision_id,
            type: "DEC",
            revision: 1,
          },
        }],
        attentionRequired: false,
      }),
    }));
  });

  it("does not let an assessment context bypass the autonomous exact pilot-evidence boundary", () => {
    const context = frozenLifecycleRecord(
      "git:autonomous-progression",
      "BSL",
      "BSL-6K3M9Q2D8F",
      {
        title: "Pilot assessment context",
        kind: "pilot-assessment-context",
        role: "review-context",
        scope: "phase-0-2-pilot",
        group: "DEFAULT",
        definition_members: [],
        evidence: [],
      },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:autonomous-progression",
      phaseId: "phase-1-product-assurance",
      records: [context],
      dependencyComparisons: [],
    });

    expect(evaluation.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-2-system-definition",
      ready: false,
      authorized: false,
      complete: false,
      authority: expect.objectContaining({
        authorityRequirement: {
          mode: "autonomous",
          authority: "package-evidence",
          delegationAllowed: false,
        },
        attentionRequired: false,
        evidence: [],
      }),
    }));
  });

  it("can require a separate exact reviewed progression Decision", async () => {
    const processRoot = await distinctProgressionProcessPackage();
    temporaryProcessParents.add(path.dirname(processRoot));
    const loaded = await loadProcessPackage(processRoot);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!loaded.ok) return;

    const fixture = reviewedGateFixture("git:distinct-progression");
    const progressionDecision = frozenLifecycleRecord(
      "git:distinct-progression",
      "DEC",
      "DEC-7K3M9Q2D8F",
      {
        title: "Enter product assurance",
        rationale: "Require authorization distinct from the intent gate.",
        kind: "scope",
        decision: "Enter Phase 1.",
        alternatives: ["Remain in Phase 0."],
        effective_scope: fixture.candidate.datum.revision_id,
      },
      { links: [{ type: "justifies", target: fixture.candidate.datum.revision_id }] },
    );
    const progressionContext = frozenLifecycleRecord(
      "git:distinct-progression",
      "BSL",
      "BSL-7K3M9Q2D8F",
      {
        title: "Progression review context",
        kind: "review-context",
        role: "review-context",
        scope: progressionDecision.datum.revision_id,
        group: "DEFAULT",
        definition_members: [progressionDecision.datum.revision_id],
        evidence: [],
      },
      { scenario: "create-review-context@1" },
    );
    const progressionReview = frozenLifecycleRecord(
      "git:distinct-progression",
      "REV",
      "REV-7K3M9Q2D8F",
      {
        title: "Progression Decision Review",
        review_kind: "independent",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        summary: "The distinct progression Decision passes Review.",
        findings: [],
        outcome: "pass",
      },
      {
        links: [
          { type: "reviews", target: progressionDecision.datum.revision_id },
          { type: "contextualizes", target: progressionContext.datum.revision_id },
        ],
      },
    );

    const acceptedIntent = acceptedIntentForReviewedGate(
      "git:distinct-progression",
      fixture,
    );
    const unreviewed = evaluateLifecycle(loaded.package, {
      processRef: "git:distinct-progression",
      phaseId: "phase-0-wayfinding",
      records: [
        ...fixture.records,
        acceptedIntent,
        progressionDecision,
        progressionContext,
      ],
      dependencyComparisons: [],
    });
    expect(unreviewed.phase?.progression).toEqual(expect.objectContaining({
      gateComplete: true,
      ready: true,
      authorized: false,
      complete: false,
    }));

    const reviewed = evaluateLifecycle(loaded.package, {
      processRef: "git:distinct-progression",
      phaseId: "phase-0-wayfinding",
      records: [
        ...fixture.records,
        acceptedIntent,
        progressionDecision,
        progressionContext,
        progressionReview,
      ],
      dependencyComparisons: [],
    });
    expect(reviewed.phase?.progression).toEqual(expect.objectContaining({
      authorized: true,
      complete: true,
      authority: expect.objectContaining({
        scenario: "record-consequential-decision@1",
        evidence: [{
          identity: {
            id: progressionDecision.datum.id,
            revision_id: progressionDecision.datum.revision_id,
            type: "DEC",
            revision: 1,
          },
        }],
      }),
    }));
  });

  it("returns exact package-typed candidates in declared order without mutating the snapshot", async () => {
    const processRoot = await renamedBaselineProcessPackage();
    temporaryProcessParents.add(path.dirname(processRoot));
    const loaded = await loadProcessPackage(processRoot);
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
