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
      "escalate-intent-candidate-review-correction": {
        output: "decision",
        type: "DEC",
      },
      "implement-verification-activity": { output: "authorization", type: "DEC" },
      "record-consequential-decision": { output: "decision", type: "DEC" },
      "record-gate-signoff": { output: "decision", type: "DEC" },
      "resolve-question": { output: "decision", type: "DEC" },
      "resolve-question-with-prototype": { output: "finding", type: "DEC" },
      "review-datum-in-context": { output: "review", type: "REV" },
      "revise-question-decision-after-review": { output: "replacement", type: "DEC" },
      "revise-gate-signoff-after-review": {
        output: "replacement",
        type: "DEC",
      },
      "simplify-architecture-and-interfaces": { output: "review", type: "REV" },
      "simplify-product-definition": { output: "review", type: "REV" },
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

  it("routes blocking product simplification findings to exact foundation correction", () => {
    const map = lifecycleDatum("MAP", "MAP-7K3M9Q2D8F", {
      title: "Small product frontier",
      purpose: "Retain only necessary product intent.",
      frontier: ["Challenge one stakeholder commitment"],
    });
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
    const foundation = [map, product, requirement];
    const reviews = foundation.map((subject, index) => lifecycleDatum(
      "REV",
      `REV-7K3M9Q2D8${["F", "G", "H"][index]}`,
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
    const context = lifecycleDatum("BSL", "BSL-7K3M9Q2D8F", {
      title: "Exact product simplification context",
      kind: "review-context",
      role: "review-context",
      scope: "phase-0-wayfinding@4",
      group: "DEFAULT",
      definition_members: foundation.map((subject) => subject.datum.revision_id),
      evidence: [],
    }, { frozen: true, scenario: "prepare-product-simplification-context@1" });
    const failedSimplification = lifecycleDatum("REV", "REV-7K3M9Q2D8J", {
      title: "Failed product simplification Review",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [{
        id: "F-001",
        target: requirement.datum.revision_id,
        relationship: "primary",
        severity: "blocking",
        summary: "The commitment retains unnecessary internal scope.",
      }],
      outcome: "fail",
    }, {
      frozen: true,
      links: [
        { type: "reviews", target: context.datum.revision_id },
        { type: "contextualizes", target: context.datum.revision_id },
        { type: "blocks", target: requirement.datum.revision_id },
      ],
      scenario: "simplify-product-definition@1",
    });

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [...foundation, ...reviews, context, failedSimplification],
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) =>
      item.obligation === "product-simplification-required"
    )).toEqual(expect.objectContaining({
      status: "failed",
      dispatchable: false,
      actionableResolver: "revise-foundation-after-review@5",
    }));
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
      [map.datum.revision_id, product.datum.revision_id].includes(item.subject)
    )).toBe(false);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "intent-candidate-required"
    )).toEqual(expect.objectContaining({ status: "blocked", dispatchable: false }));
  });

  it("routes a candidate-level Phase 0 rejection to causal candidate replacement", async () => {
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
    const simplificationContext = lifecycleDatum("BSL", "BSL-4K3M9Q2D8M", {
      title: "Exact Phase 0 product simplification context",
      kind: "review-context",
      role: "review-context",
      scope: "phase-0-wayfinding@4",
      group: "DEFAULT",
      definition_members: foundation.map((member) => member.datum.revision_id),
      evidence: [],
    }, { frozen: true });
    const simplificationReview = lifecycleDatum("REV", "REV-4K3M9Q2D8M", {
      title: "Passing product simplification Review",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [],
      outcome: "pass",
    }, {
      frozen: true,
      links: [
        { type: "reviews", target: simplificationContext.datum.revision_id },
        { type: "contextualizes", target: simplificationContext.datum.revision_id },
      ],
      scenario: "simplify-product-definition@1",
    });
    fixture.candidate.datum.payload.evidence = [simplificationReview.datum.revision_id];
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

    const snapshot = {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [
        ...fixture.records,
        ...foundation,
        ...passingReviews,
        simplificationContext,
        simplificationReview,
      ],
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const correction = evaluation.obligations.find((item) =>
      item.obligation === "intent-candidate-review-correction-required" &&
      item.subject === fixture.candidate.datum.revision_id
    );

    expect(correction).toEqual(expect.objectContaining({
      satisfied: false,
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-intent-candidate-after-review@3",
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
    expect(prepared.value.invocations[0]?.inputs).toContainEqual(
      expect.objectContaining({
        name: "simplification_reviews",
        values: [expect.objectContaining({
          identity: expect.objectContaining({
            revision_id: simplificationReview.datum.revision_id,
          }),
        })],
      }),
    );
  });

  it("routes a failed gate Decision Review to causal attended correction", () => {
    const fixture = reviewedGateFixture(processRef);
    fixture.signoffReview.datum.payload.outcome = "fail";
    fixture.signoffReview.datum.payload.findings = [{
      id: "F-001",
      target: fixture.signoff.datum.revision_id,
      relationship: "primary",
      severity: "blocking",
      summary: "The gate rationale does not distinguish approval from rejection.",
    }];

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: fixture.records,
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) =>
      item.obligation === "gate-signoff-review-correction-required" &&
      item.subject === fixture.signoff.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-gate-signoff-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: null,
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
