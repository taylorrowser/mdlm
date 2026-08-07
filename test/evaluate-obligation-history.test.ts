import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

function psp(revision = 1): LifecycleRecord {
  return lifecycleRecord(
    "PSP",
    "PSP-7K3M9Q2D8F",
    {
      title: revision === 1 ? "Lifecycle manager" : "Revised lifecycle manager",
      rationale: "Preserve intent",
      problem: "Intent is lost",
      users: ["owner"],
      goals: ["traceability"],
      non_goals: [],
      success_measures: ["reviewed intent"],
    },
    {
      revision,
      createdBy: {
        scenario: "compile-psp@2",
        prompt_ref: "prompts/compile-psp.md@2",
        process_ref: "git:current",
        loaded_skill_refs: [],
        policy_refs: ["review-applicability@1"],
      },
      storage: { editable: true, frozen: false },
    },
  );
}

function reviewContextFor(subject: LifecycleRecord): LifecycleRecord {
  return lifecycleRecord(
    "BSL",
    "BSL-X4N7AB2W6J",
    {
      title: "PSP review context",
      kind: "review-context",
      role: "review-context",
      scope: subject.datum.revision_id,
      group: "DEFAULT",
      definition_members: [subject.datum.revision_id],
      evidence: [],
    },
    {
      createdBy: {
        scenario: "create-review-context@1",
        prompt_ref: "prompts/create-review-context.md@1",
        process_ref: "git:current",
        loaded_skill_refs: [],
        policy_refs: ["review-applicability@1"],
      },
      storage: { editable: false, frozen: true },
    },
  );
}

describe("evaluateLifecycle Obligation history", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("retains an earlier exact explanation while evaluating a revised subject", () => {
    const original = psp();
    const historicalSnapshot = {
      snapshotRef: "git:before-psp-revision",
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [original],
      dependencyComparisons: [],
    };
    const earlier = evaluateLifecycle(processPackage, historicalSnapshot);
    const earlierContext = earlier.obligations.find(
      (item) => item.obligation === "review-context-required",
    );
    expect(earlierContext).toEqual(expect.objectContaining({
      id: "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:current",
      subject: "PSP-7K3M9Q2D8F-r00001",
      status: "ready",
    }));

    const revised = psp(2);
    const current = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [original, reviewContextFor(original), revised],
      dependencyComparisons: [],
      historicalSnapshots: [historicalSnapshot],
    });

    expect(current.obligationHistory).toEqual([{
      snapshotRef: "git:before-psp-revision",
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      instances: earlier.obligations,
      diagnostics: [],
    }]);
    expect(
      current.obligationHistory[0]?.instances.find(
        (item) => item.id === earlierContext?.id,
      ),
    ).toEqual(earlierContext);
    expect(
      current.obligations.find((item) => item.id === earlierContext?.id),
    ).toBeUndefined();
    expect(
      current.looseEnds.find(
        (item) =>
          item.id ===
            "review-context-required@2:PSP-7K3M9Q2D8F-r00002:git:current",
      ),
    ).toEqual(expect.objectContaining({ status: "ready" }));
    expect(
      current.obligationHistory[0]?.instances.every(
        (item) => !item.id.endsWith("r00002:git:current"),
      ),
    ).toBe(true);
  });
});
