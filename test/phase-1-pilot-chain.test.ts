import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import type { LifecycleRecord, LifecycleSnapshot } from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.123.0#sha256:pilot-chain-regression";

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  scenario: string,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  const value = lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef, scenario },
    storage: { editable: false, frozen: true },
  });
  value.integrity.scenario_execution_valid = true;
  return value;
}

describe("Phase 1 pilot chain", () => {
  let repository: string | undefined;

  afterEach(async () => {
    if (repository) await fs.rm(repository, { recursive: true, force: true });
  });

  it("uses one pilot activity and target for a strategy's complete requirement set", async () => {
    repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-chain-"));
    const initialized = await executeCommandApplication(
      ["init", ".", "--json"],
      repository,
    );
    expect(initialized.exitCode, initialized.output).toBe(0);

    const product = record("PSP", "PSP-4460000001", { title: "Product" }, "compile-psp@3");
    const requirements = [1, 2, 3, 4].map((number) =>
      record(
        "STK",
        `STK-446000000${number}`,
        { title: `Requirement ${number}` },
        "draft-stakeholder-requirements@2",
        [{ type: "derived-from", target: product.datum.id }],
      )
    );
    const acceptedIntent = record(
      "BSL",
      "BSL-4460000001",
      {
        title: "Accepted product intent",
        kind: "intent-approved",
        role: "accepted",
        scope: "product",
        group: "DEFAULT",
        definition_members: [
          product.datum.revision_id,
          ...requirements.map((requirement) => requirement.datum.revision_id),
        ],
        evidence: [],
      },
      "accept-phase-0-intent@1",
    );
    const strategy = record(
      "VSP",
      "VSP-4460000001",
      {
        title: "Shared pilot strategy",
        level: "stakeholder",
        independence: { boundary: "black-box" },
        environment_profile: {
          id: "local-cli",
          capabilities: {
            controllability: ["process"],
            observability: ["stdio", "exit-status"],
            external_services: [],
            timing: "bounded",
          },
        },
      },
      "define-verification-strategy@1",
      requirements.flatMap((requirement) => [
        { type: "governs", target: requirement.datum.id },
        { type: "governs-revision", target: requirement.datum.revision_id },
      ]),
    );
    const activity = record(
      "VER",
      "VER-4460000001",
      {
        title: "Shared pilot activity",
        kind: "pilot",
        claim: {
          kind: "pilot",
          scope: "verification-design",
          formal_evidence_eligible: false,
        },
        expected_success_activity: "Run the good control.",
        expected_discrimination_activity: "Run the bad control.",
      },
      "write-verification-activity@2",
      [
        ...requirements.flatMap((requirement) => [
          { type: "verifies", target: requirement.datum.id },
          { type: "verifies-revision", target: requirement.datum.revision_id },
        ]),
        { type: "governed-by", target: strategy.datum.revision_id },
        { type: "derived-from", target: product.datum.revision_id },
      ],
    );
    const environment = record(
      "ENV",
      "ENV-4460000001",
      {
        title: "Qualified local environment",
        strategy_revision: strategy.datum.revision_id,
        profile_id: "local-cli",
        capabilities: {
          controllability: ["process"],
          observability: ["stdio", "exit-status"],
          external_services: [],
          timing: "bounded",
        },
      },
      "realize-verification-environment@1",
      [{ type: "realizes", target: strategy.datum.revision_id }],
    );
    const qualificationActivity = record(
      "VER",
      "VER-4460000002",
      { title: "Environment qualification", kind: "qualification" },
      "write-qualification-activity@1",
      [
        { type: "governed-by", target: strategy.datum.revision_id },
        { type: "qualifies", target: environment.datum.revision_id },
      ],
    );
    const qualificationImplementation = record(
      "VAI",
      "VAI-4460000001",
      {
        title: "Environment qualification procedure",
        kind: "qualification",
        independence_mode: "source-blind",
      },
      "implement-verification-activity@1",
      [
        { type: "realizes", target: qualificationActivity.datum.revision_id },
        { type: "uses", target: environment.datum.revision_id },
        { type: "targets", target: environment.datum.revision_id },
      ],
    );
    const qualificationResult = record(
      "RES",
      "RES-4460000001",
      {
        title: "Passing environment qualification",
        claim: {
          kind: "qualification",
          scope: "environment-capability",
          outcome: "pass",
          formal_evidence_eligible: false,
        },
      },
      "execute-verification-run@2",
      [{ type: "assessed-in", target: environment.datum.revision_id }],
    );
    const qualificationRun = record(
      "RUN",
      "RUN-4460000001",
      {
        title: "Completed environment qualification",
        kind: "qualification",
        execution_state: "completed",
      },
      "execute-verification-run@2",
      [
        { type: "executes", target: qualificationImplementation.datum.revision_id },
        { type: "uses", target: environment.datum.revision_id },
        { type: "targets", target: environment.datum.revision_id },
        { type: "produces", target: qualificationResult.datum.revision_id },
      ],
    );
    const activityContext = record(
      "BSL",
      "BSL-4460000002",
      {
        title: "Pilot activity review context",
        kind: "review-context",
        role: "review-context",
        scope: activity.datum.revision_id,
        group: "DEFAULT",
        definition_members: [
          activity.datum.revision_id,
          product.datum.revision_id,
          ...requirements.map((requirement) => requirement.datum.revision_id),
          strategy.datum.revision_id,
        ],
        evidence: [],
      },
      "review-phase-1-assurance@1",
    );
    const activityReview = record(
      "REV",
      "REV-4460000001",
      {
        title: "Passing pilot activity review",
        review_kind: "phase-1-assurance",
        outcome: "pass",
        reviewer: "independent-reviewer",
        summary: "The shared activity covers every governed requirement.",
        findings: [],
        rubric_ref: "rubrics/contextual-review.md@1",
        correction_authority: "independent-reviewer",
      },
      "review-phase-1-assurance@1",
      [
        { type: "reviews", target: activity.datum.revision_id },
        { type: "contextualizes", target: activityContext.datum.revision_id },
      ],
    );
    const environmentContext = record(
      "BSL",
      "BSL-4460000003",
      {
        title: "Environment review context",
        kind: "review-context",
        role: "review-context",
        scope: environment.datum.revision_id,
        group: "DEFAULT",
        definition_members: [
          environment.datum.revision_id,
          strategy.datum.revision_id,
        ],
        evidence: [
          qualificationActivity.datum.revision_id,
          qualificationImplementation.datum.revision_id,
          qualificationRun.datum.revision_id,
          qualificationResult.datum.revision_id,
        ],
      },
      "review-phase-1-assurance@1",
    );
    const environmentReview = record(
      "REV",
      "REV-4460000002",
      {
        title: "Passing environment review",
        review_kind: "phase-1-assurance",
        outcome: "pass",
        reviewer: "independent-reviewer",
        summary: "The environment qualification evidence passes.",
        findings: [],
        rubric_ref: "rubrics/contextual-review.md@1",
        correction_authority: "independent-reviewer",
      },
      "review-phase-1-assurance@1",
      [
        { type: "reviews", target: environment.datum.revision_id },
        { type: "contextualizes", target: environmentContext.datum.revision_id },
      ],
    );
    const target = record(
      "ART",
      "ART-4460000001",
      {
        title: "Shared good and bad controls",
        kind: "prototype",
        prototype_controls: {
          activity_ref: activity.datum.revision_id,
          known_good: { expected_verification_outcome: "pass" },
          known_bad: { expected_verification_outcome: "fail" },
        },
      },
      "build-representative-level-pilot-control-prototype@1",
      requirements.map((requirement) => ({
        type: "derived-from",
        target: requirement.datum.revision_id,
      })),
    );

    async function looseEnds(name: string, records: LifecycleRecord[]) {
      const snapshot: LifecycleSnapshot = {
        processRef,
        phaseId: "phase-1-product-assurance",
        records,
        dependencyComparisons: [],
      };
      const snapshotPath = path.join(repository!, `${name}.yaml`);
      await fs.writeFile(snapshotPath, stringify(snapshot));
      const execution = await executeCommandApplication(
        ["loose-ends", "--snapshot", snapshotPath, "--json"],
        repository!,
      );
      expect(execution.exitCode, execution.output).toBe(0);
      return JSON.parse(execution.output).looseEnds.items as Array<{
        id: string;
        obligation: string;
        subject: string;
        blockedBy: string[];
        status: string;
        actionableResolver?: string;
      }>;
    }

    const planning = await looseEnds(
      "planning",
      [product, ...requirements, acceptedIntent, strategy],
    );
    expect(planning.filter((item) =>
      item.obligation === "pilot-verification-activity-required"
    ), JSON.stringify(planning, null, 2)).toEqual([
      expect.objectContaining({ subject: strategy.datum.revision_id }),
    ]);

    const assuredWithoutTarget = await looseEnds(
      "assured-without-target",
      [
        product,
        ...requirements,
        acceptedIntent,
        strategy,
        activity,
        environment,
        qualificationActivity,
        qualificationImplementation,
        qualificationResult,
        qualificationRun,
        activityContext,
        activityReview,
        environmentContext,
        environmentReview,
      ],
    );
    expect(assuredWithoutTarget.find((item) =>
      item.obligation === "pilot-verification-implementation-required"
    )).toEqual(expect.objectContaining({
      subject: activity.datum.revision_id,
      blockedBy: [
        `representative-level-pilot-target-required@1:${activity.datum.revision_id}:${processRef}`,
      ],
    }));

    const prototyped = await looseEnds(
      "prototyped",
      [product, ...requirements, acceptedIntent, strategy, activity, target],
    );
    expect(prototyped.filter((item) =>
      item.obligation === "pilot-verification-activity-required" ||
      item.obligation === "representative-level-pilot-target-required"
    )).toEqual([]);

    const implementation = record(
      "VAI",
      "VAI-4460000002",
      {
        title: "Witnessed pilot procedure",
        kind: "pilot",
        independence_mode: "source-blind",
        prototype_control_bindings: {
          activity_ref: activity.datum.revision_id,
          known_good: { argv: ["good"] },
          known_bad: { argv: ["bad"] },
        },
      },
      "implement-verification-activity@1",
      [
        { type: "realizes", target: activity.datum.revision_id },
        { type: "uses", target: environment.datum.revision_id },
        { type: "targets", target: target.datum.revision_id },
      ],
    );
    const implementationContext = record("BSL", "BSL-4460000004", {
      title: "Pilot implementation review context",
      kind: "review-context", role: "review-context",
      scope: implementation.datum.revision_id, group: "DEFAULT",
      definition_members: [
        implementation.datum.revision_id,
        activity.datum.revision_id,
        environment.datum.revision_id,
        target.datum.revision_id,
      ].sort(),
      evidence: [],
    }, "review-phase-1-assurance@1");
    const implementationReview = record("REV", "REV-4460000003", {
      title: "Passing pilot implementation review",
      review_kind: "phase-1-assurance", outcome: "pass",
    }, "review-phase-1-assurance@1", [
      { type: "reviews", target: implementation.datum.revision_id },
      { type: "contextualizes", target: implementationContext.datum.revision_id },
    ]);
    const result = (assessmentState: string, suffix: string) => record(
      "RES",
      `RES-446000000${suffix}`,
      {
        title: "Suitable witnessed pilot",
        claim: {
          kind: "pilot",
          scope: "verification-design",
          outcome: "suitable",
          formal_evidence_eligible: false,
        },
        assessment_state: assessmentState,
        observations: {
          expected_success_observed: true,
          expected_discrimination_observed: true,
        },
        control_judgments: {
          known_good: { observation_ref: "known_good", outcome: "pass" },
          known_bad: { observation_ref: "known_bad", outcome: "fail" },
        },
      },
      "execute-verification-run@2",
      [{ type: "assessed-in", target: environment.datum.revision_id }],
    );
    const run = (pilotResult: LifecycleRecord, suffix: string) => record(
      "RUN",
      `RUN-446000000${suffix}`,
      {
        title: "Completed witnessed pilot",
        kind: "pilot",
        execution_state: "completed",
        execution_target: { ref: target.datum.revision_id },
        activities_expected: ["known_good", "known_bad"],
        activities_invoked: ["known_good", "known_bad"],
        control_observations: {
          known_good: {
            artifact_ref: target.datum.revision_id,
            activity_ref: activity.datum.revision_id,
            argv: ["good"], timed_out: false, truncated: false,
          },
          known_bad: {
            artifact_ref: target.datum.revision_id,
            activity_ref: activity.datum.revision_id,
            argv: ["bad"], timed_out: false, truncated: false,
          },
        },
      },
      "execute-verification-run@2",
      [
        { type: "executes", target: implementation.datum.revision_id },
        { type: "uses", target: environment.datum.revision_id },
        { type: "targets", target: target.datum.revision_id },
        { type: "produces", target: pilotResult.datum.revision_id },
      ],
    );
    const common = [
      product, ...requirements, acceptedIntent, strategy, activity, environment,
      qualificationActivity, qualificationImplementation, qualificationResult,
      qualificationRun, activityContext, activityReview, environmentContext,
      environmentReview, target, implementation, implementationContext,
      implementationReview,
    ];
    const pendingResult = result("assessment-required", "2");
    const pendingRun = run(pendingResult, "2");
    const pending = await looseEnds(
      "pending-result-assessment",
      [...common, pendingResult, pendingRun],
    );
    expect(pending.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "awaiting-review",
      actionableResolver: "review-phase-1-assurance@1",
      blockedBy: [
        `pilot-result-assessment-required@1:${implementation.datum.revision_id}:${processRef}`,
      ],
    }));
    expect(pending.find((item) =>
      item.obligation === "pilot-result-assessment-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "awaiting-review",
      actionableResolver: "review-phase-1-assurance@1",
    }));

    const resultContext = record("BSL", "BSL-4460000005", {
      title: "Pilot result review context",
      kind: "review-context", role: "review-context",
      scope: pendingResult.datum.revision_id, group: "DEFAULT",
      definition_members: [
        pendingResult.datum.revision_id, pendingRun.datum.revision_id,
        implementation.datum.revision_id, activity.datum.revision_id,
        environment.datum.revision_id, target.datum.revision_id,
      ].sort(),
      evidence: [],
    }, "review-phase-1-assurance@1");
    const resultReview = record("REV", "REV-4460000004", {
      title: "Passing pilot result assessment",
      review_kind: "phase-1-assurance", outcome: "pass",
    }, "review-phase-1-assurance@1", [
      { type: "reviews", target: pendingResult.datum.revision_id },
      { type: "contextualizes", target: resultContext.datum.revision_id },
    ]);
    const reviewed = await looseEnds("reviewed-result", [
      ...common, pendingResult, pendingRun, resultContext, resultReview,
    ]);
    expect(reviewed.some((item) =>
      item.subject === implementation.datum.revision_id &&
      ["verification-run-required", "pilot-result-assessment-required"]
        .includes(item.obligation)
    )).toBe(false);

    for (const [assessmentState, suffix] of [["recorded", "3"], ["accepted", "4"]] as const) {
      const completedResult = result(assessmentState, suffix);
      const complete = await looseEnds(
        `${assessmentState}-result`,
        [...common, completedResult, run(completedResult, suffix)],
      );
      expect(complete.some((item) =>
        item.subject === implementation.datum.revision_id &&
        ["verification-run-required", "pilot-result-assessment-required"]
          .includes(item.obligation)
      )).toBe(false);
    }
  });
});
