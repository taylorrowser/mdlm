import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { reviewedGateFixture } from "./helpers/lifecycle-scenarios.js";
import { req } from "./helpers/req.js";

const processRef = "mdlm-bootstrap@0.52.0#sha256:test";

function lifecycleDatum(
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
    createdBy: {
      scenario: options.scenario ?? "compile-psp@2",
      process_ref: processRef,
    },
    storage: {
      editable: !options.frozen,
      frozen: options.frozen ?? false,
    },
    ...(options.links ? { links: options.links } : {}),
  });
}

function question(
  id: string,
  title: string,
  kind: "empirical" | "preferential",
  options: {
    blocks?: string;
    prototype?: boolean;
    evidenceAvailable?: boolean;
    resolutionDisposition?: "answer" | "defer" | "cancel";
    attentionCheckpoint?: "phase-0-gate" | "phase-2-system-gate";
    consolidationGroup?:
      | "phase-0-stakeholder-questions"
      | "phase-2-system-stakeholder-questions";
  } = {},
): LifecycleRecord {
  return lifecycleDatum("QST", id, {
    title,
    kind,
    question: `${title}?`,
    state: "open",
    blocking_impact: options.blocks
      ? "Dependent work cannot proceed without this answer."
      : "No current lifecycle datum is blocked.",
    ...(options.evidenceAvailable === undefined
      ? {}
      : { evidence_available: options.evidenceAvailable }),
    ...(options.resolutionDisposition
      ? { resolution_disposition: options.resolutionDisposition }
      : {}),
    ...(options.attentionCheckpoint
      ? { attention_checkpoint: options.attentionCheckpoint }
      : {}),
    ...(options.consolidationGroup
      ? { consolidation_group: options.consolidationGroup }
      : {}),
    ...(options.prototype
      ? {
          resolution_evidence: "prototype",
          prototype_evidence: {
            repository_ref: "git:0123456789abcdef0123456789abcdef01234567",
            supported_behavior: ["The bounded behavior is observed."],
            unsupported_behavior: ["No conclusion beyond the bound."],
            finding_if_supported: "supported",
            finding_if_not_supported: "not-supported",
          },
        }
      : {}),
  }, {
    ...(options.prototype ? { frozen: true } : {}),
    ...(options.blocks
      ? { links: [{ type: "blocks", target: options.blocks }] }
      : {}),
  });
}

function projectedParticipation(
  policy: string,
  mode: "autonomous" | "delegated" | "attended",
  authority: string,
  delegationAllowed: boolean,
  timing: "none" | "immediate" | "checkpoint",
  checkpoint: string | null,
  consolidationGroup: string | null,
  transactionBatching: string,
) {
  return [{
    policy,
    authorityRequirement: {
      mode,
      authority,
      delegationAllowed,
    },
    attentionSchedule: {
      timing,
      checkpoint,
      consolidationGroup,
    },
    transactionBatching,
  }];
}

describe("bootstrap Scenario participation Policies", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("names exact Lifecycle Data evidence for every package-defined participation boundary", () => {
    expect(Object.fromEntries(
      Object.entries(processPackage.scenarios)
        .filter(([, scenario]) => scenario.participation !== undefined)
        .map(([id, scenario]) => [id, scenario.authority_evidence]),
    )).toEqual({
      "approve-change-request": { output: "approval", type: "DEC" },
      "decide-pilot-expansion": { output: "decision", type: "DEC" },
      "escalate-foundation-review-correction": {
        output: "decision",
        type: "DEC",
      },
      "implement-verification-activity": { output: "authorization", type: "DEC" },
      "record-consequential-decision": { output: "decision", type: "DEC" },
      "record-gate-signoff": { output: "decision", type: "DEC" },
      "resolve-question": { output: "decision", type: "DEC" },
      "resolve-question-with-prototype": { output: "finding", type: "DEC" },
      "review-datum-in-context": { output: "review", type: "REV" },
      "revise-gate-signoff-after-review": {
        output: "replacement",
        type: "DEC",
      },
      "revise-intent-candidate-after-review": {
        output: "decision",
        type: "DEC",
      },
      "revise-question-decision-after-review": {
        output: "replacement",
        type: "DEC",
      },
      "simplify-architecture-and-interfaces": { output: "review", type: "REV" },
      "simplify-requirement-set": { output: "review", type: "REV" },
    });
  });

  it("derives Review delegation and Question authority from exact Scenario inputs", () => {
    const target = lifecycleDatum("PSP", "PSP-7K3M9Q2D8F", {
      title: "Participation target",
      rationale: "Make blocking explicit.",
      problem: "Authority must remain declarative.",
      users: ["operator"],
      goals: ["project authority"],
      non_goals: [],
      success_measures: ["participation is machine-readable"],
    });
    const reviewContext = lifecycleDatum("BSL", "BSL-X4N7AB2W6J", {
      title: "Exact review context",
      kind: "review-context",
      role: "review-context",
      scope: target.datum.revision_id,
      group: "DEFAULT",
      definition_members: [target.datum.revision_id],
      evidence: [],
    }, { frozen: true, scenario: "create-review-context@1" });
    const empirical = question(
      "QST-8ZT5KQ3P9M",
      "Evidence can decide this",
      "empirical",
      { evidenceAvailable: true },
    );
    const empiricalDeferral = question(
      "QST-8ZT5KQ3P9V",
      "Evidence work needs consequential deferral",
      "empirical",
      { evidenceAvailable: true, resolutionDisposition: "defer" },
    );
    const insufficientEmpirical = question(
      "QST-8ZT5KQ3P9S",
      "Evidence is still missing",
      "empirical",
    );
    const prototype = question(
      "QST-8ZT5KQ3P9N",
      "The bounded prototype can decide this",
      "empirical",
      { prototype: true },
    );
    const blockingEmpirical = question(
      "QST-8ZT5KQ3P9T",
      "Available evidence resolves a blocking empirical question",
      "empirical",
      {
        evidenceAvailable: true,
        blocks: target.datum.id,
      },
    );
    const blockingPreference = question(
      "QST-8ZT5KQ3P9P",
      "Stakeholder preference blocks the target",
      "preferential",
      { blocks: target.datum.id },
    );
    const checkpointPreference = question(
      "QST-8ZT5KQ3P9Q",
      "Stakeholder preference can wait for the gate",
      "preferential",
      {
        attentionCheckpoint: "phase-0-gate",
        consolidationGroup: "phase-0-stakeholder-questions",
      },
    );
    const unconsolidatedPreference = question(
      "QST-8ZT5KQ3P9R",
      "This preference has no compatible checkpoint declaration",
      "preferential",
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [
        target,
        reviewContext,
        empirical,
        empiricalDeferral,
        insufficientEmpirical,
        prototype,
        blockingEmpirical,
        blockingPreference,
        checkpointPreference,
        unconsolidatedPreference,
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.phase?.attentionCheckpoints).toEqual([
      expect.objectContaining({
        id: "phase-0-gate",
        active: false,
        evidence: expect.objectContaining({
          source: expect.stringContaining("candidate-baselines-of-kind@1"),
          result: false,
        }),
      }),
    ]);
    const obligationFor = (obligation: string, subject: LifecycleRecord) =>
      evaluation.obligations.find((item) =>
        item.obligation === obligation &&
        item.subject === subject.datum.revision_id
      );

    expect(obligationFor("passing-review-required", target)?.participation)
      .toEqual(projectedParticipation(
        "contextual-review-participation@1",
        "delegated",
        "independent-reviewer",
        true,
        "none",
        null,
        null,
        "coherent-batch",
      ));
    expect(obligationFor("open-question-resolution", empirical)?.participation)
      .toEqual(projectedParticipation(
        "question-participation@1",
        "autonomous",
        "evidence-authority",
        false,
        "none",
        null,
        null,
        "single",
      ));
    expect(obligationFor(
      "open-question-resolution",
      empiricalDeferral,
    )?.participation).toEqual(projectedParticipation(
      "question-participation@1",
      "attended",
      "stakeholder",
      false,
      "immediate",
      null,
      null,
      "single",
    ));
    expect(obligationFor(
      "open-question-resolution",
      blockingEmpirical,
    )?.participation).toEqual(projectedParticipation(
      "question-participation@1",
      "autonomous",
      "evidence-authority",
      false,
      "immediate",
      null,
      null,
      "single",
    ));
    expect(obligationFor(
      "open-question-resolution",
      insufficientEmpirical,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      participation: projectedParticipation(
        "question-participation@1",
        "attended",
        "evidence-provider",
        true,
        "immediate",
        null,
        null,
        "single",
      ),
    }));
    expect(obligationFor("prototype-question-resolution", prototype)?.participation)
      .toEqual(projectedParticipation(
        "question-participation@1",
        "autonomous",
        "evidence-authority",
        false,
        "none",
        null,
        null,
        "single",
      ));
    expect(obligationFor("open-question-resolution", blockingPreference))
      .toEqual(expect.objectContaining({
        status: "blocked",
        dispatchable: false,
        actionableResolver: "freeze-source-boundary@1",
        participation: projectedParticipation(
          "question-participation@1",
          "attended",
          "stakeholder",
          false,
          "immediate",
          null,
          null,
          "single",
        ),
      }));
    expect(obligationFor("open-question-resolution", checkpointPreference))
      .toEqual(expect.objectContaining({
        status: "blocked",
        dispatchable: false,
        actionableResolver: "freeze-source-boundary@1",
        satisfied: false,
        participation: projectedParticipation(
          "question-participation@1",
          "attended",
          "stakeholder",
          false,
          "checkpoint",
          "phase-0-gate",
          "phase-0-stakeholder-questions",
          "single",
        ),
      }));

    expect(obligationFor(
      "open-question-resolution",
      unconsolidatedPreference,
    )?.participation).toEqual(projectedParticipation(
      "question-participation@1",
      "attended",
      "stakeholder",
      false,
      "immediate",
      null,
      null,
      "single",
    ));

    const phaseOne = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: [checkpointPreference],
      dependencyComparisons: [],
    });
    expect(phaseOne.diagnostics).toEqual([]);
    expect(phaseOne.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === checkpointPreference.datum.revision_id
    )?.participation).toEqual(projectedParticipation(
      "question-participation@1",
      "attended",
      "stakeholder",
      false,
      "immediate",
      null,
      null,
      "single",
    ));

    const undeclaredPackage = structuredClone(processPackage);
    undeclaredPackage.phases["phase-0-wayfinding"]!.attention_checkpoints = [];
    const undeclared = evaluateLifecycle(undeclaredPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [checkpointPreference],
      dependencyComparisons: [],
    });
    expect(undeclared.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-checkpoint-undeclared",
        path: "phases.phase-0-wayfinding.attention_checkpoints",
      }),
    ]));
  });

  it("keeps deferred question work unsatisfied until its exact scoped DEC passes Review", () => {
    const source = question(
      "QST-8ZT5KQ3P9W",
      "Can this question be deferred",
      "empirical",
      { resolutionDisposition: "defer" },
    );
    const deferred = structuredClone(source);
    deferred.datum.revision = 2;
    deferred.datum.revision_id = `${source.datum.id}-r00002`;
    deferred.datum.payload.state = "deferred";
    deferred.datum.payload.reactivation_condition =
      "Reactivate when the named evidence becomes available.";
    const decision = lifecycleDatum("DEC", "DEC-8ZT5KQ3P9W", {
      title: "Defer one exact question",
      rationale: "The stakeholder authorized a bounded reactivation condition.",
      kind: "deferral",
      decision: "Defer until the named evidence becomes available.",
      alternatives: ["Answer without evidence"],
      effective_scope: deferred.datum.revision_id,
    }, {
      frozen: true,
      links: [
        { type: "resolves", target: source.datum.revision_id },
        { type: "resolves", target: deferred.datum.revision_id },
      ],
      scenario: "resolve-question@2",
    });
    const beforeReview = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [source, deferred, decision],
      dependencyComparisons: [],
    });
    expect(beforeReview.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === deferred.datum.revision_id
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "blocked",
      blockedBy: [expect.stringContaining(`:${decision.datum.revision_id}:`)],
    }));

    const review = lifecycleDatum("REV", "REV-8ZT5KQ3P9W", {
      title: "Deferral review",
      review_kind: "independent",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      summary: "The exact deferral is bounded.",
      findings: [],
      outcome: "pass",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: decision.datum.revision_id }],
      scenario: "review-datum-in-context@2",
    });
    const unboundedDeferral = structuredClone(deferred);
    delete unboundedDeferral.datum.payload.reactivation_condition;
    const afterReview = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [source, unboundedDeferral, decision, review],
      dependencyComparisons: [],
    });
    expect(afterReview.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === deferred.datum.revision_id
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "blocked",
    }));

    const withReactivation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [source, deferred, decision, review],
      dependencyComparisons: [],
    });
    expect(withReactivation.obligations.some((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === deferred.datum.revision_id
    )).toBe(false);
  });

  it("requires exact stakeholder authority and blocks the gate on an immediate question", () => {
    const fixture = reviewedGateFixture(processRef);
    const blocker = question(
      "QST-4K3M9Q2D8J",
      "Stakeholder preference blocks the reviewed candidate",
      "preferential",
      { blocks: fixture.candidate.datum.id },
    );

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [
        fixture.candidate,
        fixture.candidateContext,
        fixture.candidateReview,
        blocker,
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "freeze-source-boundary@1",
      participation: projectedParticipation(
        "gate-signoff-participation@1",
        "attended",
        "stakeholder",
        false,
        "immediate",
        null,
        null,
        "single",
      ),
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === blocker.datum.revision_id
    )?.participation).toEqual(projectedParticipation(
      "question-participation@1",
      "attended",
      "stakeholder",
      false,
      "immediate",
      null,
      null,
      "single",
    ));
    expect(
      processPackage.scenarios["record-gate-signoff"]?.prohibited_inputs,
    ).toContain("implied approval");
  });

  it("routes a reviewed gate rejection to its exact implicated member", () => {
    const fixture = reviewedGateFixture(processRef);
    const member = lifecycleDatum("STK", "STK-4K3M9Q2D8F", {
      title: "Rejected requirement",
      rationale: "The gate found this exact draft ambiguous.",
      statement: "The product shall export a report.",
      verification_intent: "Observe an export.",
      stakeholder: "report author",
      priority: "must",
    });
    fixture.candidate.datum.payload.definition_members = [
      member.datum.revision_id,
    ];
    fixture.candidateContext.datum.payload.definition_members = [
      fixture.candidate.datum.revision_id,
      member.datum.revision_id,
    ];
    fixture.signoff.datum.payload.gate_outcome = "reject";
    fixture.signoff.datum.payload.decision = "Reject and revise the implicated requirement.";
    fixture.signoff.datum.payload.gate_rejection = {
      findings: [{
        id: "G-001",
        summary: "The rejected requirement does not define the exported content.",
      }],
    };
    fixture.signoff.datum.links.push({
      type: "blocks",
      target: member.datum.revision_id,
    });

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [...fixture.records, member],
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === member.datum.revision_id
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "blocked",
      dispatchable: false,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(evaluation.phase?.gate.evaluations[0]).toEqual(
      expect.objectContaining({ complete: false }),
    );
  });

  it("carries a later gate rejection through exhausted foundation escalation", async () => {
    const fixture = reviewedGateFixture(processRef);
    const original = lifecycleDatum("STK", "STK-6K3M9Q2D8F", {
      title: "Initially ambiguous requirement",
      rationale: "The correction history is deliberately exhausted.",
      statement: "The product shall expose an outcome.",
      verification_intent: "Observe an outcome.",
      stakeholder: "operator",
      priority: "must",
    });
    const failedReview = (
      subject: LifecycleRecord,
      id: string,
    ) => lifecycleDatum("REV", id, {
      title: `Failed Review of ${subject.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{
        id: "F-001",
        target: subject.datum.revision_id,
        relationship: "primary",
        severity: "blocking",
        summary: "The exact outcome remains ambiguous.",
      }],
      outcome: "fail",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: subject.datum.revision_id }],
      scenario: "review-datum-in-context@2",
    });
    const firstFailure = failedReview(original, "REV-6K3M9Q2D8F");
    const firstReplacement = structuredClone(original);
    firstReplacement.datum.revision = 2;
    firstReplacement.datum.revision_id = `${original.datum.id}-r00002`;
    firstReplacement.datum.links = [{
      type: "corrects-review",
      target: firstFailure.datum.revision_id,
    }];
    const secondFailure = failedReview(firstReplacement, "REV-6K3M9Q2D8G");
    const current = structuredClone(original);
    current.datum.revision = 3;
    current.datum.revision_id = `${original.datum.id}-r00003`;
    current.datum.links = [firstFailure, secondFailure].map((review) => ({
      type: "corrects-review",
      target: review.datum.revision_id,
    }));
    const currentReview = lifecycleDatum("REV", "REV-6K3M9Q2D8H", {
      title: `Passing Review of ${current.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [],
      outcome: "pass",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: current.datum.revision_id }],
      scenario: "review-datum-in-context@2",
    });
    fixture.candidate.datum.payload.definition_members = [
      current.datum.revision_id,
    ];
    fixture.candidateContext.datum.payload.definition_members = [
      fixture.candidate.datum.revision_id,
      current.datum.revision_id,
    ];
    fixture.signoff.datum.payload.gate_outcome = "reject";
    fixture.signoff.datum.payload.decision =
      "Reject the corrected requirement after its autonomous budget is exhausted.";
    fixture.signoff.datum.payload.gate_rejection = {
      findings: [{
        id: "G-001",
        summary: "The final outcome still needs stakeholder correction.",
      }],
    };
    fixture.signoff.datum.links.push({
      type: "blocks",
      target: current.datum.revision_id,
    });

    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [
        ...fixture.records,
        original,
        firstFailure,
        firstReplacement,
        secondFailure,
        current,
        currentReview,
      ],
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const escalation = evaluation.obligations.find((item) =>
      item.obligation === "foundation-review-escalation-required" &&
      item.subject === current.datum.revision_id
    );
    expect(escalation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "escalate-foundation-review-correction@2",
    }));
    expect(escalation).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "escalate-foundation-review-correction@2",
      escalation!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs.find(
      (input) => input.name === "gate_rejections",
    )?.values).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: fixture.signoff.datum.revision_id,
        }),
      }),
    ]);
    expect(
      processPackage.scenarios["escalate-foundation-review-correction"]!
        .outputs,
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "replacement",
        required_links: expect.arrayContaining([
          {
            link: "corrects-gate-rejection",
            target: { input: "gate_rejections" },
          },
        ]),
      }),
    ]));
  });

  it("preserves both autonomous foundation cycles after an attended correction", async () => {
    const original = lifecycleDatum("STK", "STK-9K3M9Q2D8F", {
      title: "Stakeholder-owned requirement",
      rationale: "The first correction requires stakeholder judgment.",
      statement: "The product shall expose one stakeholder outcome.",
      verification_intent: "Observe the stakeholder outcome.",
      stakeholder: "operator",
      priority: "must",
    });
    const failedReview = (
      subject: LifecycleRecord,
      id: string,
      correctionAuthority?: "stakeholder",
    ) => lifecycleDatum("REV", id, {
      title: `Failed Review of ${subject.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{
        id: "F-001",
        target: subject.datum.revision_id,
        relationship: "primary",
        severity: "blocking",
        summary: "The exact observable outcome remains ambiguous.",
      }],
      ...(correctionAuthority
        ? { correction_authority: correctionAuthority }
        : {}),
      outcome: "fail",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: subject.datum.revision_id }],
      scenario: "review-datum-in-context@2",
    });
    const stakeholderFailure = failedReview(
      original,
      "REV-9K3M9Q2D8F",
      "stakeholder",
    );
    const attended = structuredClone(original);
    attended.datum.revision = 2;
    attended.datum.revision_id = `${original.datum.id}-r00002`;
    attended.datum.links = [{
      type: "corrects-review",
      target: stakeholderFailure.datum.revision_id,
    }];
    const authorityDecision = lifecycleDatum("DEC", "DEC-9K3M9Q2D8F", {
      title: "Attended foundation correction authority",
      rationale: "The stakeholder authorized this exact intent correction.",
      kind: "scope",
      decision: "Authorize the exact attended replacement.",
      alternatives: ["Retain the failed requirement"],
      effective_scope: attended.datum.revision_id,
    }, {
      frozen: true,
      links: [{ type: "justifies", target: attended.datum.revision_id }],
      scenario: "escalate-foundation-review-correction@2",
    });
    const attendedFailure = failedReview(attended, "REV-9K3M9Q2D8G");
    const firstAutonomous = structuredClone(original);
    firstAutonomous.datum.revision = 3;
    firstAutonomous.datum.revision_id = `${original.datum.id}-r00003`;
    firstAutonomous.datum.links = [stakeholderFailure, attendedFailure].map(
      (review) => ({
        type: "corrects-review",
        target: review.datum.revision_id,
      }),
    );
    const firstAutonomousFailure = failedReview(
      firstAutonomous,
      "REV-9K3M9Q2D8H",
    );
    const secondAutonomous = structuredClone(original);
    secondAutonomous.datum.revision = 4;
    secondAutonomous.datum.revision_id = `${original.datum.id}-r00004`;
    secondAutonomous.datum.links = [
      stakeholderFailure,
      attendedFailure,
      firstAutonomousFailure,
    ].map((review) => ({
      type: "corrects-review",
      target: review.datum.revision_id,
    }));
    const secondAutonomousFailure = failedReview(
      secondAutonomous,
      "REV-9K3M9Q2D8J",
    );
    const baseRecords = [
      original,
      stakeholderFailure,
      attended,
      authorityDecision,
      attendedFailure,
    ];
    const evaluate = (records: LifecycleRecord[]) => evaluateLifecycle(
      processPackage,
      {
        processRef,
        phaseId: "phase-0-wayfinding",
        records,
        dependencyComparisons: [],
      },
    );
    const correctionFor = (
      evaluation: ReturnType<typeof evaluateLifecycle>,
      subject: LifecycleRecord,
    ) => evaluation.obligations.find((item) =>
      item.subject === subject.datum.revision_id &&
      (item.obligation === "foundation-review-correction-required" ||
        item.obligation === "foundation-review-escalation-required")
    );

    expect(correctionFor(evaluate(baseRecords), attended)).toEqual(
      expect.objectContaining({
        obligation: "foundation-review-correction-required",
        actionableResolver: "revise-foundation-after-review@5",
      }),
    );
    const afterFirstAutonomous = [
      ...baseRecords,
      firstAutonomous,
      firstAutonomousFailure,
    ];
    expect(correctionFor(
      evaluate(afterFirstAutonomous),
      firstAutonomous,
    )).toEqual(expect.objectContaining({
      obligation: "foundation-review-correction-required",
      actionableResolver: "revise-foundation-after-review@5",
    }));

    const exhaustedRecords = [
      ...afterFirstAutonomous,
      secondAutonomous,
      secondAutonomousFailure,
    ];
    const exhausted = evaluate(exhaustedRecords);
    const escalation = correctionFor(exhausted, secondAutonomous);
    expect(escalation).toEqual(expect.objectContaining({
      obligation: "foundation-review-escalation-required",
      actionableResolver: "escalate-foundation-review-correction@2",
    }));
    expect(exhausted.obligations.some((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === secondAutonomous.datum.revision_id
    )).toBe(false);
    expect(escalation).toBeDefined();

    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: exhaustedRecords,
      dependencyComparisons: [],
    };
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "escalate-foundation-review-correction@2",
      escalation!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const input = (name: string) => prepared.value.invocations[0]!.inputs.find(
      (candidate) => candidate.name === name,
    )?.values.map((value) => value.identity.revision_id);
    expect(input("lineage")).toEqual([
      original.datum.revision_id,
      attended.datum.revision_id,
      firstAutonomous.datum.revision_id,
      secondAutonomous.datum.revision_id,
    ]);
    expect([
      ...input("prior_failed_reviews") ?? [],
      ...input("failed_reviews") ?? [],
    ].sort()).toEqual([
      stakeholderFailure,
      attendedFailure,
      firstAutonomousFailure,
      secondAutonomousFailure,
    ].map((review) => review.datum.revision_id).sort());
  });

  it("ignores candidate-only simplification Reviews of ordinary foundation subjects", () => {
    const map = lifecycleDatum("MAP", "MAP-7K3M9Q2D8J", {
      title: "Reviewed frontier",
      purpose: "Keep ordinary foundation Review authority exact.",
      frontier: ["One exact product question"],
    });
    const product = lifecycleDatum("PSP", "PSP-7K3M9Q2D8J", {
      title: "Different product definition",
      rationale: "The redirected blocker must remain unrelated to the MAP Review.",
      problem: "Review authority could otherwise cross exact subjects.",
      users: ["operator"],
      goals: ["Keep correction causality exact"],
      non_goals: [],
      success_measures: ["No redirected correction is derived"],
    });
    const context = lifecycleDatum("BSL", "BSL-7K3M9Q2D8J", {
      title: "MAP review context",
      kind: "review-context",
      role: "review-context",
      scope: map.datum.revision_id,
      group: "phase-0-wayfinding",
      definition_members: [map.datum.revision_id],
      evidence: [],
    }, { frozen: true, scenario: "create-review-context@1" });
    const redirectedReview = lifecycleDatum("REV", "REV-7K3M9Q2D8J", {
      title: "Mis-scoped product simplification Review",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      simplification: {
        target: product.datum.revision_id,
        findings: [{
          id: "F-001",
          severity: "blocking",
          summary: "This finding exceeds the exact MAP Review Assignment.",
        }],
      },
      outcome: "fail",
    }, {
      frozen: true,
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: map.datum.revision_id },
        { type: "contextualizes", target: context.datum.revision_id },
        { type: "blocks", target: product.datum.revision_id },
      ],
    });

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [map, product, context, redirectedReview],
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.some((item) =>
      item.obligation === "foundation-review-correction-required" &&
      [map.datum.revision_id, product.datum.revision_id].includes(item.subject)
    )).toBe(false);
  });

  it("routes blocking candidate simplification findings to the exact member correction", () => {
    const fixture = reviewedGateFixture(processRef);
    const product = lifecycleDatum("PSP", "PSP-7K3M9Q2D8F", {
      title: "Small product",
      rationale: "One user outcome is sufficient.",
      problem: "The current outcome is not portable.",
      users: ["operator"],
      goals: ["Export one outcome"],
      non_goals: ["General integration platform"],
      success_measures: ["One outcome exports"],
    });
    const requirement = lifecycleDatum("STK", "STK-7K3M9Q2D8F", {
      title: "Overbroad export",
      rationale: "The initial commitment retains unnecessary scope.",
      statement: "The product shall export every internal representation.",
      verification_intent: "Observe all internal representations.",
      stakeholder: "operator",
      priority: "must",
    }, { links: [{ type: "derived-from", target: product.datum.id }] });
    const foundation = [product, requirement];
    fixture.candidate.datum.payload.definition_members = foundation.map(
      (subject) => subject.datum.revision_id,
    );
    fixture.candidateContext.datum.payload.definition_members = [
      fixture.candidate.datum.revision_id,
      ...foundation.map((subject) => subject.datum.revision_id),
    ];
    fixture.candidateReview.datum.payload.outcome = "fail";
    delete fixture.candidateReview.datum.payload.findings;
    fixture.candidateReview.datum.payload.simplification = {
      target: fixture.candidate.datum.revision_id,
      findings: [{
        id: "F-001",
        severity: "blocking",
        summary: "The commitment retains unnecessary internal scope.",
      }],
    };
    fixture.candidateReview.datum.links.push({
      type: "blocks",
      target: requirement.datum.revision_id,
    });
    const memberReviews = foundation.map((subject, index) => lifecycleDatum(
      "REV",
      `REV-7K3M9Q2D8${index === 0 ? "F" : "G"}`,
      {
        title: `Passing Review of ${subject.datum.revision_id}`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      },
      {
        frozen: true,
        links: [{ type: "reviews", target: subject.datum.revision_id }],
        scenario: "review-datum-in-context@2",
      },
    ));

    const records = [
      fixture.candidate,
      fixture.candidateContext,
      fixture.candidateReview,
      ...foundation,
      ...memberReviews,
    ];
    const hasRequirementCorrection = (evaluation: ReturnType<typeof evaluateLifecycle>) =>
      evaluation.obligations.some((item) =>
        item.obligation === "foundation-review-correction-required" &&
        item.subject === requirement.datum.revision_id
      );
    const evaluate = () => evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records,
      dependencyComparisons: [],
    });

    expect(hasRequirementCorrection(evaluate())).toBe(false);

    (fixture.candidateReview.datum.payload.simplification as Record<string, unknown>)
      .target = requirement.datum.revision_id;
    fixture.candidateReview.datum.links = fixture.candidateReview.datum.links.filter(
      (link) => link.type !== "blocks",
    );
    expect(hasRequirementCorrection(evaluate())).toBe(false);

    const outside = lifecycleDatum("MAP", "MAP-7K3M9Q2D8F", {
      title: "Unrelated frontier",
      purpose: "Remain outside the exact intent candidate.",
      frontier: ["Unrelated work"],
    });
    records.push(outside);
    (fixture.candidateReview.datum.payload.simplification as Record<string, unknown>)
      .target = outside.datum.revision_id;
    fixture.candidateReview.datum.links.push({
      type: "blocks",
      target: outside.datum.revision_id,
    });
    expect(evaluate().obligations.some((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === outside.datum.revision_id
    )).toBe(false);

    fixture.candidateReview.datum.payload.outcome = "pass";
    delete fixture.candidateReview.datum.payload.simplification;
    expect(evaluate().phase?.gate.evaluations[0]?.complete).toBe(false);

    fixture.candidateReview.datum.payload.outcome = "fail";
    fixture.candidateReview.datum.payload.simplification = {
      target: requirement.datum.revision_id,
      findings: [{
        id: "F-001",
        severity: "blocking",
        summary: "The commitment retains unnecessary internal scope.",
      }],
    };
    fixture.candidateReview.datum.links = fixture.candidateReview.datum.links.filter(
      (link) => link.type !== "blocks",
    );
    fixture.candidateReview.datum.links.push({
      type: "blocks",
      target: requirement.datum.revision_id,
    });
    const evaluation = evaluate();

    expect(evaluation.obligations.find((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === requirement.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(evaluation.obligations.some((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === product.datum.revision_id
    )).toBe(false);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "intent-candidate-review-correction-required" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "revise-foundation-after-review@5",
    }));
  });

  it("attends stakeholder-owned candidate simplification without consuming its autonomous budget", () => {
    const fixture = reviewedGateFixture(processRef);
    const map = lifecycleDatum("MAP", "MAP-8K3M9Q2D8K", {
      title: "Reviewed exact frontier",
      purpose: "Keep candidate correction fully bound.",
      frontier: ["One bounded candidate"],
    });
    const mapReview = lifecycleDatum("REV", "REV-8K3M9Q2D8K", {
      title: "Passing frontier Review",
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [],
      outcome: "pass",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: map.datum.revision_id }],
    });
    fixture.candidate.datum.payload.definition_members = [map.datum.revision_id];
    fixture.candidateContext.datum.payload.definition_members = [
      fixture.candidate.datum.revision_id,
      map.datum.revision_id,
    ];
    fixture.candidateReview.datum.payload.outcome = "fail";
    fixture.candidateReview.datum.payload.correction_authority = "stakeholder";
    fixture.candidateReview.datum.payload.simplification = {
      target: fixture.candidate.datum.revision_id,
      findings: [{
        id: "F-001",
        severity: "blocking",
        summary: "The candidate changes stakeholder-owned intent.",
      }],
    };
    fixture.candidateReview.datum.links.push({
      type: "blocks",
      target: fixture.candidate.datum.revision_id,
    });
    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [
        map,
        mapReview,
        fixture.candidate,
        fixture.candidateContext,
        fixture.candidateReview,
      ],
      dependencyComparisons: [],
    };
    const correction = (subject: LifecycleRecord) =>
      evaluateLifecycle(processPackage, snapshot).obligations.find((item) =>
        item.obligation === "intent-candidate-review-correction-required" &&
        item.subject === subject.datum.revision_id
      );

    expect(correction(fixture.candidate)).toEqual(expect.objectContaining({
      status: "ready",
      explanation: expect.stringMatching(/stakeholder-owned/i),
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));

    const attendedReplacement = structuredClone(fixture.candidate);
    attendedReplacement.datum.revision = 2;
    attendedReplacement.datum.revision_id = `${fixture.candidate.datum.id}-r00002`;
    attendedReplacement.datum.links = [
      { type: "supersedes", target: fixture.candidate.datum.revision_id },
      { type: "corrects-review", target: fixture.candidateReview.datum.revision_id },
    ];
    const authorityDecision = lifecycleDatum("DEC", "DEC-8K3M9Q2D8K", {
      title: "Stakeholder candidate correction authority",
      rationale: "The attended correction preserves stakeholder-owned intent.",
      kind: "scope",
      decision: "Authorize this exact attended candidate correction.",
      alternatives: ["Retain the failed candidate"],
      effective_scope: attendedReplacement.datum.revision_id,
    }, {
      frozen: true,
      links: [{ type: "justifies", target: attendedReplacement.datum.revision_id }],
    });
    const replacementContext = structuredClone(fixture.candidateContext);
    replacementContext.datum.id = "BSL-8K3M9Q2D8K";
    replacementContext.datum.revision_id = "BSL-8K3M9Q2D8K-r00001";
    replacementContext.datum.payload.scope = attendedReplacement.datum.revision_id;
    replacementContext.datum.payload.definition_members = [
      attendedReplacement.datum.revision_id,
      map.datum.revision_id,
    ];
    const nextFailure = lifecycleDatum("REV", "REV-8K3M9Q2D8M", {
      title: "Failed simplification after attended correction",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      simplification: {
        target: attendedReplacement.datum.revision_id,
        findings: [{
          id: "F-002",
          severity: "blocking",
          summary: "The corrected candidate still retains package-bounded excess.",
        }],
      },
      outcome: "fail",
    }, {
      frozen: true,
      links: [
        { type: "reviews", target: attendedReplacement.datum.revision_id },
        { type: "contextualizes", target: replacementContext.datum.revision_id },
        { type: "blocks", target: attendedReplacement.datum.revision_id },
      ],
      scenario: "review-datum-in-context@2",
    });
    snapshot.records.push(
      attendedReplacement,
      authorityDecision,
      replacementContext,
      nextFailure,
    );

    expect(correction(attendedReplacement)).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "autonomous",
          authority: "package-evidence",
        }),
        attentionSchedule: expect.objectContaining({ timing: "none" }),
      })],
    }));
  });

  it("escalates an exhausted candidate lineage through the same correction interface", async () => {
    const first = reviewedGateFixture(processRef).candidate;
    const map = lifecycleDatum("MAP", "MAP-8K3M9Q2D8F", {
      title: "Reviewed exact frontier",
      purpose: "Keep the candidate correction Assignment fully bound.",
      frontier: ["One bounded candidate"],
    });
    const mapReview = lifecycleDatum("REV", "REV-8K3M9Q2D8J", {
      title: "Passing frontier Review",
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [],
      outcome: "pass",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: map.datum.revision_id }],
    });
    first.datum.payload.definition_members = [map.datum.revision_id];
    const replacement = structuredClone(first);
    replacement.datum.revision = 2;
    replacement.datum.revision_id = `${first.datum.id}-r00002`;
    replacement.datum.links = [
      { type: "supersedes", target: first.datum.revision_id },
      { type: "corrects-review", target: "REV-8K3M9Q2D8F-r00001" },
    ];
    const current = structuredClone(first);
    current.datum.revision = 3;
    current.datum.revision_id = `${first.datum.id}-r00003`;
    current.datum.links = [
      { type: "supersedes", target: replacement.datum.revision_id },
      { type: "corrects-review", target: "REV-8K3M9Q2D8F-r00001" },
      { type: "corrects-review", target: "REV-8K3M9Q2D8G-r00001" },
    ];
    const failedReview = (subject: LifecycleRecord, id: string) =>
      lifecycleDatum("REV", id, {
        title: `Failed simplification of ${subject.datum.revision_id}`,
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        simplification: {
          target: subject.datum.revision_id,
          findings: [{
            id: "F-001",
            severity: "blocking",
            summary: "The exact candidate remains unnecessarily broad.",
          }],
        },
        outcome: "fail",
      }, {
        frozen: true,
        links: [
          { type: "reviews", target: subject.datum.revision_id },
          { type: "blocks", target: subject.datum.revision_id },
        ],
        scenario: "review-datum-in-context@2",
      });
    const reviews = [
      failedReview(first, "REV-8K3M9Q2D8F"),
      failedReview(replacement, "REV-8K3M9Q2D8G"),
      failedReview(current, "REV-8K3M9Q2D8H"),
    ];

    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [map, mapReview, first, replacement, current, ...reviews],
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const correction = evaluation.obligations.find((item) =>
      item.obligation === "intent-candidate-review-correction-required" &&
      item.subject === current.datum.revision_id
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-intent-candidate-after-review@3",
      explanation: expect.stringMatching(/stakeholder escalation/i),
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "revise-intent-candidate-after-review@3",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const inputs = prepared.value.invocations[0]!.inputs;
    expect(inputs.find((input) => input.name === "lineage")?.values).toHaveLength(3);
    expect(inputs.find((input) => input.name === "prior_failed_reviews")?.values)
      .toHaveLength(2);
    expect(inputs.find((input) => input.name === "failed_reviews")?.values)
      .toEqual([expect.objectContaining({
        identity: expect.objectContaining({ revision_id: reviews[2]!.datum.revision_id }),
      })]);
  });

  it("routes a failed Question Decision through exact attended correction", async () => {
    const answered = lifecycleDatum("QST", "QST-7K3M9Q2D8F", {
      title: "Export preference",
      kind: "preferential",
      question: "Which export should remain?",
      state: "answered",
      blocking_impact: "The answer controls exact product scope.",
    }, { frozen: true });
    const decision = lifecycleDatum("DEC", "DEC-7K3M9Q2D8F", {
      title: "Retain one export",
      rationale: "The stakeholder chose the smallest sufficient export.",
      kind: "scope",
      decision: "Retain CSV only.",
      alternatives: ["Retain every format"],
      effective_scope: answered.datum.revision_id,
    }, {
      frozen: true,
      links: [{ type: "resolves", target: answered.datum.revision_id }],
    });
    const failedReview = lifecycleDatum("REV", "REV-7K3M9Q2D8H", {
      title: "Failed scope Decision Review",
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{
        id: "F-001",
        target: decision.datum.revision_id,
        relationship: "primary",
        severity: "blocking",
        summary: "The rationale does not preserve the stakeholder constraint.",
      }],
      outcome: "fail",
    }, {
      frozen: true,
      links: [{ type: "reviews", target: decision.datum.revision_id }],
    });

    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [answered, decision, failedReview],
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const correction = evaluation.obligations.find((item) =>
      item.obligation === "question-decision-review-correction-required" &&
      item.subject === decision.datum.revision_id
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-question-decision-after-review@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "revise-question-decision-after-review@1",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "lineage", values: [expect.any(Object)] }),
      expect.objectContaining({ name: "prior_failed_reviews", values: [] }),
      expect.objectContaining({ name: "failed_reviews", values: [expect.any(Object)] }),
    ]));
  });

  it("routes a failed gate Decision Review through exact attended correction", async () => {
    const fixture = reviewedGateFixture(processRef);
    fixture.signoffReview.datum.payload.outcome = "fail";
    fixture.signoffReview.datum.payload.findings = [{
      id: "F-001",
      target: fixture.signoff.datum.revision_id,
      relationship: "primary",
      severity: "blocking",
      summary: "The gate rationale is incomplete.",
    }];
    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: fixture.records,
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const correction = evaluation.obligations.find((item) =>
      item.obligation === "gate-signoff-review-correction-required" &&
      item.subject === fixture.signoff.datum.revision_id
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-gate-signoff-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "revise-gate-signoff-after-review@2",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "lineage", values: [expect.any(Object)] }),
      expect.objectContaining({ name: "prior_failed_reviews", values: [] }),
      expect.objectContaining({ name: "failed_reviews", values: [expect.any(Object)] }),
    ]));
  });

  it("requires accepted intent before reviewed gate evidence progresses Phase 0", () => {
    const fixture = reviewedGateFixture(processRef);
    const beforeAcceptance = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: fixture.records,
      dependencyComparisons: [],
    });
    expect(beforeAcceptance.phase?.progression).toEqual(expect.objectContaining({
      gateComplete: true,
      ready: false,
      authorized: false,
      complete: false,
    }));
    const accepted = lifecycleDatum("BSL", "BSL-7K3M9Q2D8F", {
      title: "Accepted exact intent",
      kind: "intent-approved",
      role: "accepted",
      scope: fixture.candidate.datum.payload.scope,
      group: fixture.candidate.datum.payload.group,
      definition_members: [],
      evidence: [
        fixture.candidateReview.datum.revision_id,
        fixture.signoff.datum.revision_id,
        fixture.signoffReview.datum.revision_id,
      ],
    }, {
      frozen: true,
      links: [{ type: "promotes", target: fixture.candidate.datum.revision_id }],
      scenario: "accept-phase-0-intent@1",
    });
    const afterAcceptance = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [...fixture.records, accepted],
      dependencyComparisons: [],
    });
    expect(afterAcceptance.phase?.progression).toEqual(expect.objectContaining({
      gateComplete: true,
      ready: true,
      authorized: true,
      complete: true,
    }));
  });

  it("routes a candidate-level Phase 0 rejection to causal candidate replacement", () => {
    const fixture = reviewedGateFixture(processRef);
    const map = lifecycleDatum("MAP", "MAP-4K3M9Q2D8F", {
      title: "Current map",
      purpose: "Bound the exact intent frontier.",
      frontier: ["One product commitment"],
    });
    const product = lifecycleDatum("PSP", "PSP-4K3M9Q2D8F", {
      title: "Current product",
      rationale: "Define the exact product intent.",
      problem: "The operator route is ambiguous.",
      users: ["operator"],
      goals: ["Deterministic outcomes"],
      non_goals: ["Implementation detail"],
      success_measures: ["Exact command results"],
    });
    const requirement = lifecycleDatum("STK", "STK-4K3M9Q2D8F", {
      title: "Current requirement",
      rationale: "The operator needs an exact outcome.",
      statement: "MDLM shall report one exact outcome.",
      verification_intent: "Observe the public command result.",
      stakeholder: "operator",
      priority: "must",
    }, { links: [{ type: "derived-from", target: product.datum.id }] });
    const foundation = [map, product, requirement];
    fixture.candidate.datum.payload.definition_members = foundation.map(
      (member) => member.datum.revision_id,
    );
    fixture.candidateContext.datum.payload.definition_members = [
      fixture.candidate.datum.revision_id,
      ...foundation.map((member) => member.datum.revision_id),
    ];
    const reviewIds = [
      "REV-4K3M9Q2D8H",
      "REV-4K3M9Q2D8J",
      "REV-4K3M9Q2D8K",
    ];
    const passingReviews = foundation.map((subject, index) =>
      lifecycleDatum("REV", reviewIds[index]!, {
        title: `Passing Review of ${subject.datum.revision_id}`,
        review_kind: "independent",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      }, {
        frozen: true,
        links: [{ type: "reviews", target: subject.datum.revision_id }],
        scenario: "review-datum-in-context@2",
      })
    );
    fixture.signoff.datum.payload.gate_outcome = "reject";
    fixture.signoff.datum.payload.decision = "Reject and replace the exact candidate.";
    fixture.signoff.datum.payload.gate_rejection = {
      findings: [{
        id: "G-001",
        summary: "The candidate evidence boundary needs correction.",
      }],
    };
    fixture.signoff.datum.links.push({
      type: "blocks",
      target: fixture.candidate.datum.revision_id,
    });

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [...fixture.records, ...foundation, ...passingReviews],
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) =>
      item.obligation === "intent-candidate-review-correction-required" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-intent-candidate-after-review@3",
    }));
  });

  it("does not accept an equal-sized but different rejection citation set", () => {
    const fixture = reviewedGateFixture(processRef);
    const firstMember = lifecycleDatum("STK", "STK-4K3M9Q2D8F", {
      title: "First rejected requirement",
      rationale: "The first finding applies to this exact draft.",
      statement: "The product shall export a report.",
      verification_intent: "Observe an export.",
      stakeholder: "report author",
      priority: "must",
    });
    const secondMember = lifecycleDatum("STK", "STK-4K3M9Q2D8G", {
      title: "Second rejected requirement",
      rationale: "The second finding applies to this exact draft.",
      statement: "The product shall retain a report.",
      verification_intent: "Observe retention.",
      stakeholder: "report author",
      priority: "must",
    });
    fixture.candidate.datum.payload.definition_members = [
      firstMember.datum.revision_id,
      secondMember.datum.revision_id,
    ];
    fixture.candidateContext.datum.payload.definition_members = [
      fixture.candidate.datum.revision_id,
      firstMember.datum.revision_id,
      secondMember.datum.revision_id,
    ];
    fixture.signoff.datum.payload.gate_outcome = "reject";
    fixture.signoff.datum.payload.decision = "Reject the first exact member.";
    fixture.signoff.datum.payload.gate_rejection = {
      findings: [{
        id: "G-001",
        summary: "The first member needs an exact correction.",
      }],
    };
    fixture.signoff.datum.links.push({
      type: "blocks",
      target: firstMember.datum.revision_id,
    });
    const secondRejection = structuredClone(fixture.signoff);
    secondRejection.datum.id = "DEC-4K3M9Q2D8G";
    secondRejection.datum.revision_id = "DEC-4K3M9Q2D8G-r00001";
    secondRejection.datum.payload.decision = "Reject the second exact member.";
    secondRejection.datum.payload.gate_rejection = {
      findings: [{
        id: "G-002",
        summary: "The second member needs an exact correction.",
      }],
    };
    secondRejection.datum.links = [
      { type: "justifies", target: fixture.candidate.datum.revision_id },
      { type: "blocks", target: secondMember.datum.revision_id },
    ];
    const secondRejectionReview = structuredClone(fixture.signoffReview);
    secondRejectionReview.datum.id = "REV-4K3M9Q2D8H";
    secondRejectionReview.datum.revision_id = "REV-4K3M9Q2D8H-r00001";
    secondRejectionReview.datum.links = [{
      type: "reviews",
      target: secondRejection.datum.revision_id,
    }];
    const replacementFor = (
      member: LifecycleRecord,
      citedRejection: LifecycleRecord,
    ) => {
      const replacement = structuredClone(member);
      replacement.datum.revision = 2;
      replacement.datum.revision_id = `${member.datum.id}-r00002`;
      replacement.datum.links.push({
        type: "corrects-gate-rejection",
        target: citedRejection.datum.revision_id,
      });
      return replacement;
    };
    const firstReplacement = replacementFor(firstMember, secondRejection);
    const secondReplacement = replacementFor(secondMember, secondRejection);
    const passingReviewFor = (subject: LifecycleRecord, id: string) =>
      lifecycleDatum("REV", id, {
        title: `Passing Review of ${subject.datum.revision_id}`,
        review_kind: "independent",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      }, {
        frozen: true,
        links: [{ type: "reviews", target: subject.datum.revision_id }],
        scenario: "review-datum-in-context@2",
      });

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [
        ...fixture.records,
        firstMember,
        secondMember,
        secondRejection,
        secondRejectionReview,
        firstReplacement,
        secondReplacement,
        passingReviewFor(firstReplacement, "REV-4K3M9Q2D8J"),
        passingReviewFor(secondReplacement, "REV-4K3M9Q2D8K"),
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) =>
      item.obligation === "intent-candidate-review-correction-required" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
    }));
  });

  it("rejects implied approval before gate sign-off reaches the adapter", async () => {
    const snapshotProcessRef = "git:participation";
    const fixture = reviewedGateFixture(snapshotProcessRef);
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-bootstrap-participation-"),
    );
    try {
      const initialized = req(
        temporaryRoot,
        "init",
        "--process",
        path.join(process.cwd(), ".lifecycle/process"),
        "--json",
      );
      expect(initialized.status, initialized.stderr).toBe(0);
      const snapshotPath = path.join(temporaryRoot, "gate-snapshot.yaml");
      await fs.writeFile(snapshotPath, stringify({
        processRef: snapshotProcessRef,
        phaseId: "phase-0-wayfinding",
        records: [
          fixture.candidate,
          fixture.candidateContext,
          fixture.candidateReview,
        ],
        dependencyComparisons: [],
      }));
      const obligation =
        `candidate-gate-signoff@3:${fixture.candidate.datum.revision_id}:${snapshotProcessRef}`;

      const attempted = req(
        temporaryRoot,
        "scenario",
        "dry-run",
        "record-gate-signoff@3",
        "--obligation",
        obligation,
        "--snapshot",
        snapshotPath,
        "--input",
        "implied approval=yes",
        "--json",
      );

      expect(attempted.status).toBe(1);
      expect(JSON.parse(attempted.stdout).diagnostics).toEqual([
        expect.objectContaining({ code: "prohibited-scenario-input" }),
      ]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
