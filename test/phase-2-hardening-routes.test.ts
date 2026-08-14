import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyOperatorOutcome,
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type OperatorWorkFacts,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";

type Snapshot = {
  processRef: string;
  phaseId: string;
  records: LifecycleRecord[];
  dependencyComparisons: [];
};

const fixtureRoot = path.join(process.cwd(), "test/fixtures/phase-hardening");
const plan = "DWP-0REPRTPMN0-r00001";
const definitionMembers = [
  "ASP-0REPRTARCH-r00001",
  plan,
  "ICSP-0REPRT1CSP-r00001",
  "SYS-0EXPRTREQ0-r00001",
];

async function fixture(name: string): Promise<Snapshot> {
  return JSON.parse(await fs.readFile(path.join(fixtureRoot, name), "utf8"));
}

function withoutRecordAndDependents(snapshot: Snapshot, revisionId: string): Snapshot {
  const removed = new Set([revisionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of snapshot.records) {
      if (removed.has(record.datum.revision_id)) continue;
      if (record.datum.links.some((link) => removed.has(link.target))) {
        removed.add(record.datum.revision_id);
        changed = true;
      }
    }
  }
  return {
    ...structuredClone(snapshot),
    records: snapshot.records.filter((record) => !removed.has(record.datum.revision_id)),
  };
}

function obligation(
  processPackage: ProcessPackage,
  snapshot: Snapshot,
  name: string,
  subject?: string,
) {
  return evaluateLifecycle(processPackage, snapshot).obligations.find((item) =>
    item.obligation === name && (subject === undefined || item.subject === subject)
  );
}

function failedSimplification(
  snapshot: Snapshot,
  correctionSet: "subject" | "definition-consistency",
  options: { removeSystem?: boolean; malformedBlockers?: boolean } = {},
): Snapshot {
  const result = structuredClone(snapshot);
  const review = result.records.find((record) =>
    record.datum.revision_id === "REV-0REQSMP100-r00001"
  );
  if (!review) throw new Error("missing retained requirement simplification Review");
  const blockers = correctionSet === "subject"
    ? ["SYS-0EXPRTREQ0-r00001"]
    : options.malformedBlockers
    ? definitionMembers.slice(0, -1)
    : definitionMembers;
  review.datum.payload.outcome = "fail";
  review.datum.payload.definition_simplification = {
    primary_target: correctionSet === "subject" ? "SYS-0EXPRTREQ0-r00001" : plan,
    correction_set: correctionSet,
    primary_findings: [{ id: "F-001", severity: "blocking", summary: "Correct the exact declared scope." }],
    ...(options.removeSystem
      ? { scope_reduction: { rationale: "Remove the sole current SYS output." } }
      : {}),
  };
  review.datum.links.push(...blockers.map((target) => ({ type: "blocks", target })));
  if (options.removeSystem) {
    review.datum.links.push({ type: "removes", target: "SYS-0EXPRTREQ0-r00001" });
  }
  return result;
}

function operatorOutcome(processPackage: ProcessPackage, snapshot: Snapshot) {
  const result = evaluateLifecycle(processPackage, snapshot);
  const phase = result.phase ? `${result.phase.id}@${result.phase.version}` : "";
  const work: OperatorWorkFacts[] = result.looseEnds.map((item) => ({
    kind: "obligation",
    phase,
    instance: item.id,
    definition: item.obligation,
    subject: item.subject,
    scenario: item.actionableResolver ?? item.eventualResolver,
    dispatchable: item.dispatchable,
    authorityRequirements: (item.participation ?? []).map((participation) => ({
      policy: participation.policy,
      authorityRequirement: participation.authorityRequirement,
      attentionSchedule: participation.attentionSchedule,
    })),
    explanation: item.explanation,
    status: item.status,
    blockedBy: item.blockedBy,
    blockerChains: item.blockerChains,
    unresolvedBindings: item.unresolvedBindings,
  }));
  return classifyOperatorOutcome(work, result.terminalOutcome);
}

function expectReady(
  processPackage: ProcessPackage,
  snapshot: Snapshot,
  name: string,
  resolver: string,
  subject?: string,
) {
  expect(obligation(processPackage, snapshot, name, subject)).toEqual(expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: resolver,
  }));
}

describe("Phase 2 hardening routes from retained exact lifecycle evidence", () => {
  let processPackage: ProcessPackage;
  let completionReady: Snapshot;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
    completionReady = await fixture("phase2-completion-ready.json");
  });

  it("derives decomposition planning when the exact planning DWP and its dependent evidence are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, plan),
      "decomposition-planning-required",
      "define-decomposition-work-package@2",
      "STK-HJGTM8026G-r00001",
    );
  });

  it("derives SYS execution when the exact output and its dependent Review are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, "SYS-0EXPRTREQ0-r00001"),
      "decomposition-execution-required",
      "execute-decomposition-work-package@2",
      plan,
    );
  });

  it("derives architecture definition when the exact ASP and its dependent evidence are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, "ASP-0REPRTARCH-r00001"),
      "system-architecture-required",
      "define-system-architecture@2",
      "STK-HJGTM8026G-r00001",
    );
  });

  it("derives interface definition when the exact ICSP and its dependent evidence are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, "ICSP-0REPRT1CSP-r00001"),
      "interface-control-specification-required",
      "define-interface-control-specification@2",
      "ASP-0REPRTARCH-r00001",
    );
  });

  it("returns the earliest exact definition context to requirement simplification Review", () => {
    const snapshot = withoutRecordAndDependents(completionReady, "REV-0REQSMP100-r00001");
    expect(obligation(processPackage, snapshot, "decomposition-simplification-required", plan))
      .toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "simplify-requirement-set@2",
      }));
  });

  it("returns the earliest exact definition context to architecture and interface simplification Review", () => {
    const snapshot = withoutRecordAndDependents(completionReady, "REV-0ARCSMP100-r00001");
    expect(obligation(processPackage, snapshot, "architecture-interface-simplification-required", plan))
      .toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "simplify-architecture-and-interfaces@2",
      }));
  });

  it("accepts the retained passing requirement simplification Review without correction work", () => {
    expect(obligation(
      processPackage,
      completionReady,
      "decomposition-simplification-required",
      plan,
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
  });

  it("accepts the retained passing architecture and interface simplification Review without correction work", () => {
    expect(obligation(
      processPackage,
      completionReady,
      "architecture-interface-simplification-required",
      plan,
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
  });

  it("derives one exact SYS simplification correction from several subject Findings", () => {
    expectReady(
      processPackage,
      failedSimplification(completionReady, "subject"),
      "phase-2-simplification-correction-required",
      "revise-phase-2-subject-after-simplification@1",
      plan,
    );
  });

  it("derives one atomic correction for the exact Phase 2 definition-consistency set", () => {
    expectReady(
      processPackage,
      failedSimplification(completionReady, "definition-consistency"),
      "phase-2-definition-consistency-correction-required",
      "revise-phase-2-definition-set-after-simplification@1",
      plan,
    );
  });

  it("derives exact definition-consistency correction when scope reduction removes a proper SYS subset", () => {
    const snapshot = structuredClone(completionReady);
    const retainedSystem = "SYS-0EXPRTREQ0-r00001";
    const removedSystem = "SYS-0PRNTREQ00-r00001";
    const originalSystem = snapshot.records.find((record) =>
      record.datum.revision_id === retainedSystem
    );
    const context = snapshot.records.find((record) =>
      record.datum.revision_id === "BSL-FMKW2W7Z71-r00001"
    );
    const review = snapshot.records.find((record) =>
      record.datum.revision_id === "REV-0REQSMP100-r00001"
    );
    if (!originalSystem || !context || !review) {
      throw new Error("missing retained Phase 2 scope-reduction evidence");
    }

    const removableSystem = structuredClone(originalSystem);
    removableSystem.datum.id = "SYS-0PRNTREQ00";
    removableSystem.datum.revision_id = removedSystem;
    removableSystem.datum.payload = {
      ...removableSystem.datum.payload,
      title: "Print one completed report",
      rationale: "Printing duplicates the retained controlled export behavior.",
      statement: "The system shall print one completed report.",
      verification_intent: "Observe one printed completed report.",
    };
    snapshot.records.push(removableSystem);

    const contextPayload = context.datum.payload as { definition_members: string[] };
    contextPayload.definition_members.push(removedSystem);
    review.datum.payload.outcome = "fail";
    review.datum.payload.definition_simplification = {
      primary_target: plan,
      correction_set: "definition-consistency",
      primary_findings: [{
        id: "F-001",
        severity: "blocking",
        summary: "Keep export behavior while removing the duplicate print output.",
      }],
      scope_reduction: {
        rationale: "The print output duplicates export and is unnecessary; export remains required.",
      },
    };
    const exactBlockers = [
      "ASP-0REPRTARCH-r00001",
      plan,
      "ICSP-0REPRT1CSP-r00001",
      retainedSystem,
      removedSystem,
    ];
    review.datum.links.push(
      ...exactBlockers.map((target) => ({ type: "blocks", target })),
      { type: "removes", target: removedSystem },
    );

    const selectedIds = (selector: string, argumentsValue: Record<string, unknown>) =>
      (evaluateProcessDefinition(
        processPackage,
        snapshot,
        "selector",
        selector,
        argumentsValue,
      ).result as Array<{ identity: { revision_id: string } }>).map((item) =>
        item.identity.revision_id
      );
    const currentSystems = selectedIds("decomposition-outputs-for@1", { plan });
    const removedSystems = selectedIds("phase-2-removed-outputs-for-review@1", {
      review: "REV-0REQSMP100-r00001",
    });

    expect(currentSystems).toEqual([retainedSystem, removedSystem]);
    expect(removedSystems).toEqual([removedSystem]);
    expect(removedSystems.length).toBeLessThan(currentSystems.length);
    expect(currentSystems.filter((system) => !removedSystems.includes(system))).toEqual([
      retainedSystem,
    ]);
    expect(selectedIds("phase-2-simplification-blockers-for-review@1", {
      review: "REV-0REQSMP100-r00001",
    })).toEqual(exactBlockers);
    const simplification = review.datum.payload.definition_simplification as {
      scope_reduction: { rationale: string };
    };
    expect(simplification.scope_reduction).toEqual({
      rationale: "The print output duplicates export and is unnecessary; export remains required.",
    });
    expect(selectedIds("valid-phase-2-simplification-review@1", {
      review: "REV-0REQSMP100-r00001",
      plan,
    })).toEqual(["REV-0REQSMP100-r00001"]);

    const corrections = evaluateLifecycle(processPackage, snapshot).obligations.filter((item) =>
      item.obligation === "phase-2-definition-consistency-correction-required"
      && item.subject === plan
    );
    expect(corrections).toEqual([
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "revise-phase-2-definition-set-after-simplification@1",
      }),
    ]);
  });

  it("rejects an incomplete definition-consistency blocker set as invalid correction evidence", () => {
    const snapshot = failedSimplification(completionReady, "definition-consistency", {
      malformedBlockers: true,
    });
    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "valid-phase-2-simplification-review@1",
      { review: "REV-0REQSMP100-r00001", plan },
    );
    expect(selected.result).toEqual([]);
    expect(obligation(
      processPackage,
      snapshot,
      "phase-2-definition-consistency-correction-required",
      plan,
    )).toEqual(expect.objectContaining({
      satisfied: true,
      status: "satisfied",
      dispatchable: false,
      actionableResolver: null,
    }));
    expect(obligation(processPackage, snapshot, "decomposition-simplification-required", plan))
      .toEqual(expect.objectContaining({
        status: "awaiting-review",
        actionableResolver: "simplify-requirement-set@2",
      }));
    expect(operatorOutcome(processPackage, snapshot)).toEqual(expect.objectContaining({
      kind: "assignment",
      work: expect.objectContaining({
        definition: "decomposition-simplification-required",
        scenario: "simplify-requirement-set@2",
      }),
    }));
  });

  it("rejects complete removal of the current SYS set instead of fabricating correction work", () => {
    const snapshot = failedSimplification(completionReady, "definition-consistency", {
      removeSystem: true,
    });
    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "valid-phase-2-simplification-review@1",
      { review: "REV-0REQSMP100-r00001", plan },
    );
    expect(selected.result).toEqual([]);
    expect(obligation(
      processPackage,
      snapshot,
      "phase-2-definition-consistency-correction-required",
      plan,
    )).toEqual(expect.objectContaining({
      satisfied: true,
      status: "satisfied",
      dispatchable: false,
      actionableResolver: null,
    }));
    expect(obligation(processPackage, snapshot, "decomposition-simplification-required", plan))
      .toEqual(expect.objectContaining({ status: "awaiting-review" }));
    expect(operatorOutcome(processPackage, snapshot)).toEqual(expect.objectContaining({
      kind: "assignment",
      work: expect.objectContaining({
        definition: "decomposition-simplification-required",
        scenario: "simplify-requirement-set@2",
      }),
    }));
  });

  it("derives exact DWP completion from the retained completion predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-completion-ready.json"),
      "decomposition-completion-required",
      "complete-decomposition-work-package@2",
    );
  });

  it("derives exact decomposition-group candidate creation from its retained predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-group-ready.json"),
      "decomposition-group-candidate-required",
      "create-decomposition-group-candidate@1",
    );
  });

  it("derives exact system-level candidate creation from its retained predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-level-ready.json"),
      "system-level-candidate-required",
      "create-system-level-candidate@1",
    );
  });

  it("derives autonomous candidate correction from an exact failed candidate Review", async () => {
    const snapshot = await fixture("phase2-acceptance-ready.json");
    const review = snapshot.records.find((record) =>
      record.datum.revision_id === "REV-F14GRW3HTF-r00001"
    );
    if (!review) throw new Error("missing retained candidate Review");
    review.datum.payload.outcome = "fail";
    review.datum.payload.findings = [{
      id: "F-001",
      target: "BSL-2YPGCAM8D1-r00002",
      relationship: "primary",
      severity: "blocking",
      summary: "Correct the exact reviewed candidate.",
    }];
    expectReady(
      processPackage,
      snapshot,
      "phase-2-candidate-correction-required",
      "revise-phase-2-candidate-after-review@1",
      "BSL-2YPGCAM8D1-r00002",
    );
  });

  it("derives autonomous candidate correction from an exact reviewed gate rejection", async () => {
    const snapshot = withoutRecordAndDependents(
      await fixture("phase2-acceptance-ready.json"),
      "BSL-2YPGCAM8D1-r00002",
    );
    expectReady(
      processPackage,
      snapshot,
      "phase-2-candidate-correction-required",
      "revise-phase-2-candidate-after-review@1",
      "BSL-2YPGCAM8D1-r00001",
    );
    expect(obligation(
      processPackage,
      snapshot,
      "candidate-gate-signoff",
      "BSL-2YPGCAM8D1-r00001",
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "revise-phase-2-candidate-after-review@1",
    }));
  });

  it("returns a corrected and independently reviewed candidate to the same attended gate", async () => {
    const snapshot = withoutRecordAndDependents(
      await fixture("phase2-acceptance-ready.json"),
      "DEC-0Y97CFVCGX-r00001",
    );
    const gate = obligation(
      processPackage,
      snapshot,
      "candidate-gate-signoff",
      "BSL-2YPGCAM8D1-r00002",
    );
    expect(gate).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@3",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
  });

  it("derives exact Phase 2 acceptance from its reviewed accepted-candidate predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-acceptance-ready.json"),
      "system-acceptance-required",
      "accept-phase-2-system@1",
    );
  });

  it("proves complete authorized progression into pilot assessment", async () => {
    const evaluation = evaluateLifecycle(
      processPackage,
      await fixture("phase2-progression-complete.json"),
    );
    expect(evaluation.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-2-pilot-assessment",
      ready: true,
      authorized: true,
      complete: true,
    }));
  });

  it("derives the first exact pilot observation after complete Phase 2 progression", async () => {
    const snapshot = await fixture("phase2-progression-complete.json");
    snapshot.phaseId = "phase-2-pilot-assessment";
    expectReady(
      processPackage,
      snapshot,
      "pilot-observation-required",
      "record-pilot-observation@2",
      "BSL-2YPGCAM8D1-r00002",
    );
  });
});
