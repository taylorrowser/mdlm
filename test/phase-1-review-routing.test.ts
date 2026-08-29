import { beforeAll, describe, expect, it } from "vitest";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import {
  evaluateLifecycle,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "git:phase-1-review-routing";

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

function phase1Records(): {
  records: LifecycleRecord[];
  strategy: LifecycleRecord;
  activity: LifecycleRecord;
} {
  const product = record("PSP", "PSP-23456789AB", {
    title: "Product intent",
  }, "compile-psp@3");
  const requirement = record("STK", "STK-23456789AB", {
    title: "Count bytes",
  }, "draft-stakeholder-requirements@2", [
    { type: "derived-from", target: product.datum.id },
  ]);
  const acceptedIntent = record("BSL", "BSL-23456789AB", {
    title: "Accepted intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "product",
    group: "DEFAULT",
    definition_members: [
      product.datum.revision_id,
      requirement.datum.revision_id,
    ],
    evidence: [],
  }, "accept-phase-0-intent@1");
  const strategy = record("VSP", "VSP-23456789AB", {
    title: "Pilot strategy",
    level: "stakeholder",
    independence: { boundary: "black-box" },
  }, "define-verification-strategy@1", [
    { type: "governs", target: requirement.datum.id },
    { type: "governs-revision", target: requirement.datum.revision_id },
  ]);
  const activity = record("VER", "VER-23456789AB", {
    title: "Pilot activity",
    kind: "pilot",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      formal_evidence_eligible: false,
    },
    expected_success_activity: "Run the passing control.",
    expected_discrimination_activity: "Run the failing control.",
  }, "write-verification-activity@2", [
    { type: "verifies", target: requirement.datum.id },
    { type: "verifies-revision", target: requirement.datum.revision_id },
    { type: "governed-by", target: strategy.datum.revision_id },
    { type: "derived-from", target: product.datum.revision_id },
  ]);
  return {
    records: [product, requirement, acceptedIntent, strategy, activity],
    strategy,
    activity,
  };
}

describe("Phase 1 review routing", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
  });

  it("routes a new VSP to Review before pilot activity authoring", async () => {
    const fixture = phase1Records();
    const snapshot = {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: fixture.records.filter((record) => record !== fixture.activity),
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const activity = evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-verification-activity-required"
    );

    expect(activity).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      actionableResolver: "review-phase-1-assurance@1",
      blockedBy: [
        `phase-1-assurance-review-required@1:${fixture.strategy.datum.revision_id}:${processRef}`,
      ],
    }));
    const attempted = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "write-verification-activity@2",
      activity!.id,
      [],
      evaluation,
    );
    expect(attempted).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "obligation-not-dispatchable",
      })],
    });
  });

  it("routes an accepted pilot VER to Review before prototype construction", async () => {
    const fixture = phase1Records();
    const snapshot = {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: fixture.records,
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const target = evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-target-required"
    );

    const attempted = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "build-pilot-control-prototype@1",
      target!.id,
      [],
      evaluation,
    );
    expect(attempted).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "obligation-not-dispatchable",
      })],
    });

    expect(target).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      actionableResolver: "review-phase-1-assurance@1",
      blockedBy: [
        `phase-1-assurance-review-required@1:${fixture.activity.datum.revision_id}:${processRef}`,
      ],
    }));
    expect(evaluation.looseEnds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "phase-1-assurance-review-required",
        subject: fixture.activity.datum.revision_id,
        dispatchable: true,
        actionableResolver: "review-phase-1-assurance@1",
      }),
    ]));

  });

  it("uses the active Phase 1 Review obligation at every pure assurance gate", () => {
    for (const obligationId of [
      "pilot-verification-activity-required",
      "pilot-target-required",
      "environment-assurance-required",
      "pilot-verification-implementation-required",
      "verification-run-required",
    ]) {
      const declaration = JSON.stringify(processPackage.obligations[obligationId]);
      expect(declaration).toContain("phase-1-assurance-review-required@1");
      expect(declaration).not.toContain("passing-review-required@2");
    }
  });
});
