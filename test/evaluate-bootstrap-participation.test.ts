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
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { reviewedGateFixture } from "./helpers/lifecycle-scenarios.js";
import { req } from "./helpers/req.js";

const processRef = "mdlm-bootstrap@0.39.0#sha256:test";

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
      scope: "participation",
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
        status: "ready",
        dispatchable: true,
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
        status: "ready",
        dispatchable: true,
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
    const afterReview = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [source, deferred, decision, review],
      dependencyComparisons: [],
    });
    expect(afterReview.obligations.some((item) =>
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
      actionableResolver: "resolve-question@2",
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

  it("keeps a reviewed gate rejection from satisfying approval", () => {
    const fixture = reviewedGateFixture(processRef);
    fixture.signoff.datum.payload.gate_outcome = "reject";
    fixture.signoff.datum.payload.decision = "Reject and revise the candidate.";

    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: fixture.records,
      dependencyComparisons: [],
    });

    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === fixture.candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "blocked",
      dispatchable: false,
    }));
    expect(evaluation.phase?.gate.evaluations[0]).toEqual(
      expect.objectContaining({ complete: false }),
    );
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
        `candidate-gate-signoff@2:${fixture.candidate.datum.revision_id}:${snapshotProcessRef}`;

      const attempted = req(
        temporaryRoot,
        "scenario",
        "dry-run",
        "record-gate-signoff@2",
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
