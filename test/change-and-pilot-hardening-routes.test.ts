import { promises as fs } from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyOperatorOutcome,
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleEvaluation,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type OperatorWorkFacts,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";

type Snapshot = LifecycleSnapshot & { dependencyComparisons: [] };

const fixtureRoot = path.join(process.cwd(), "test/fixtures/phase-hardening");
const changeId = "CHG-YSYT05KE22-r00001";
const sharedChangeId = "CHG-1TGXYWDZ3T-r00001";
const acceptedStakeholder = "STK-1010000001-r00001";
const acceptedStakeholderBaseline = "BSL-1010000000-r00001";
const sharedSystem = "SYS-1020000001-r00001";
const replacementSharedSystem = "SYS-1020000001-r00002";
const sharedAcceptedBaseline = "BSL-1020000007-r00001";
const consumerA = "DWP-1020000001-r00001";
const consumerB = "DWP-1020000002-r00001";
const levelCandidate = "BSL-2YPGCAM8D1-r00002";

let processPackage: ProcessPackage;
const ajv = new Ajv2020({ allErrors: true, strict: false });
formatsPlugin.default(ajv);

async function fixture(name: string): Promise<Snapshot> {
  return JSON.parse(await fs.readFile(path.join(fixtureRoot, name), "utf8"));
}

function record(
  processRef: string,
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: Array<{ type: string; target: string }> = [],
  scenario?: string,
  revision = 1,
): LifecycleRecord {
  const result = frozenLifecycleRecord(processRef, type, id, payload, {
    links,
    ...(scenario ? { scenario } : {}),
  });
  result.datum.revision = revision;
  result.datum.revision_id = `${id}-r${String(revision).padStart(5, "0")}`;
  return result;
}

function findRecord(snapshot: Snapshot, revisionId: string): LifecycleRecord {
  const found = snapshot.records.find((item) => item.datum.revision_id === revisionId);
  if (!found) throw new Error(`missing retained record ${revisionId}`);
  return found;
}

function selected(
  snapshot: Snapshot,
  definition: string,
  args: Record<string, unknown> = {},
): string[] {
  const result = evaluateProcessDefinition(
    processPackage,
    snapshot,
    "selector",
    definition,
    args,
  );
  expect(result.result, definition).toBeDefined();
  return (result.result as Array<{ identity: { revision_id: string } }>).map(
    (item) => item.identity.revision_id,
  );
}

function evaluation(snapshot: Snapshot): LifecycleEvaluation {
  const result = evaluateLifecycle(processPackage, snapshot);
  expect(result.diagnostics).toEqual([]);
  return result;
}

function obligation(
  result: LifecycleEvaluation,
  name: string,
  subject?: string,
) {
  return result.obligations.find((item) =>
    item.obligation === name && (subject === undefined || item.subject === subject)
  );
}

function expectReady(
  snapshot: Snapshot,
  name: string,
  resolver: string,
  subject?: string,
) {
  const result = evaluation(snapshot);
  expect(obligation(result, name, subject)).toEqual(expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: resolver,
  }));
  return result;
}

function operatorOutcome(result: LifecycleEvaluation) {
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

function expectSchema(recordToValidate: LifecycleRecord) {
  const resolved = resolveType(processPackage, recordToValidate.datum.type);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
  expect(
    ajv.compile(resolved.type.payloadSchema)(recordToValidate.datum.payload),
    JSON.stringify(ajv.errors),
  ).toBe(true);
}

function passingReview(
  processRef: string,
  id: string,
  subject: LifecycleRecord,
  context: LifecycleRecord,
): LifecycleRecord {
  return record(processRef, "REV", id, {
    title: `Passing Review of ${subject.datum.revision_id}`,
    review_kind: "contextual",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    findings: [],
    outcome: "pass",
  }, [
    { type: "reviews", target: subject.datum.revision_id },
    { type: "contextualizes", target: context.datum.revision_id },
  ], "review-datum-in-context@2");
}

function failedReview(
  processRef: string,
  id: string,
  subject: LifecycleRecord,
  context: LifecycleRecord,
  correctionAuthority?: "stakeholder",
): LifecycleRecord {
  return record(processRef, "REV", id, {
    title: `Failed Review of ${subject.datum.revision_id}`,
    review_kind: "contextual",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    findings: [{
      id: "F-001",
      target: subject.datum.revision_id,
      relationship: "primary",
      severity: "blocking",
      summary: "Correct the exact reviewed subject.",
    }],
    ...(correctionAuthority ? { correction_authority: correctionAuthority } : {}),
    outcome: "fail",
  }, [
    { type: "reviews", target: subject.datum.revision_id },
    { type: "contextualizes", target: context.datum.revision_id },
  ], "review-datum-in-context@2");
}

function reviewContext(
  processRef: string,
  id: string,
  subject: LifecycleRecord,
  members: string[] = [subject.datum.revision_id],
): LifecycleRecord {
  return record(processRef, "BSL", id, {
    title: `Review Context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: members,
    evidence: [],
  }, [], "create-review-context@1");
}

const measurements = {
  review: { contexts: 1, completed_reviews: 1, findings: 0, quality_improved: true, volume_assessment: "acceptable" },
  agent_effort: { tracer_issues: 1, implementation_commits: 1, implementation_commit_refs: [`git:${"a".repeat(40)}`], effort_assessment: "acceptable" },
  evidence_reuse: { eligible: 1, reused: 1, stale: 0, explanation_checks: 1, explanations_correct: true },
  loose_ends: { sampled: 1, actionable: 1, useful: true, assessment: "Every sampled loose end was actionable." },
  gate_ceremony: { gates: 1, signoffs: 1, decision_reviews: 1, proportionate: true },
  environment_profiles: { profiles_assessed: 1, sufficient: true },
  verification_discrimination: { supported_successes: 1, unsupported_rejections: 1, discriminates: true },
  scope_reduction: { proposed_items: 2, removed_items: 1, retained_items: 1, demonstrated: true },
} as const;

function observation(processRef: string): LifecycleRecord {
  const availability = Object.fromEntries(Object.keys(measurements).map((key) => [key, "observed"]));
  return record(processRef, "DEC", "DEC-1030000001", {
    title: "Exact Phase 0–2 pilot observation",
    rationale: "Retain every durable measurement source.",
    kind: "pilot-observation",
    decision: "The complete candidate has exact durable pilot evidence.",
    alternatives: ["Record unavailable evidence."],
    effective_scope: "Phase 0–2 pilot evidence boundary",
    pilot_observation: { availability, ...measurements },
  }, [{ type: "justifies", target: levelCandidate }], "record-pilot-observation@2");
}

function assessmentContext(
  processRef: string,
  observationRecord: LifecycleRecord,
  id = "BSL-1030000001",
  members: string[] = [levelCandidate],
  evidence: string[] = [observationRecord.datum.revision_id],
): LifecycleRecord {
  return record(processRef, "BSL", id, {
    title: "Exact complete pilot-assessment context",
    kind: "pilot-assessment-context",
    role: "review-context",
    scope: "Phase 0–2 pilot evidence boundary",
    group: "DEFAULT",
    definition_members: members,
    evidence,
  }, [], "prepare-pilot-assessment-context@1");
}

function assessment(
  processRef: string,
  context: LifecycleRecord,
  recommendation: "proceed" | "change" | "stop" = "change",
  revision = 1,
  links: Array<{ type: string; target: string }> = [],
): LifecycleRecord {
  return record(processRef, "PAS", "PAS-1030000001", {
    title: `Pilot assessment recommending ${recommendation}`,
    rationale: "Measure the exact frozen evidence boundary.",
    pilot_scope: "phase-0-through-2",
    measurements,
    recommendation,
    limitations: [],
  }, [
    { type: "measures", target: context.datum.revision_id },
    ...links,
  ], revision === 1 ? "assess-phase-0-2-pilot@1" : "revise-pilot-assessment-after-review@2", revision);
}

async function pilotSnapshot(
  recommendation: "proceed" | "change" | "stop" = "change",
): Promise<{
  snapshot: Snapshot;
  observation: LifecycleRecord;
  context: LifecycleRecord;
  assessment: LifecycleRecord;
  assessmentContext: LifecycleRecord;
}> {
  const snapshot = await fixture("phase2-progression-complete.json");
  snapshot.phaseId = "phase-2-pilot-assessment";
  const observationRecord = observation(snapshot.processRef);
  const context = assessmentContext(snapshot.processRef, observationRecord);
  const assessmentRecord = assessment(snapshot.processRef, context, recommendation);
  const assessmentReviewContext = reviewContext(
    snapshot.processRef,
    "BSL-1030000002",
    assessmentRecord,
  );
  snapshot.records.push(observationRecord, context, assessmentRecord, assessmentReviewContext);
  return {
    snapshot,
    observation: observationRecord,
    context,
    assessment: assessmentRecord,
    assessmentContext: assessmentReviewContext,
  };
}

function expansionDecision(
  processRef: string,
  assessmentRecord: LifecycleRecord,
  assessmentReview: LifecycleRecord,
  recommendation: "proceed" | "change" | "stop",
): LifecycleRecord {
  return record(processRef, "DEC", "DEC-1030000002", {
    title: `${recommendation} pilot expansion Decision`,
    rationale: "Adopt the exact independently reviewed PAS recommendation.",
    kind: "pilot-expansion",
    decision: recommendation,
    alternatives: ["proceed", "change", "stop"].filter((item) => item !== recommendation),
    effective_scope: "Phase 3–6 Example Process Package expansion",
  }, [
    { type: "justifies", target: assessmentRecord.datum.revision_id },
    { type: "relies-on-review", target: assessmentReview.datum.revision_id },
  ], "decide-pilot-expansion@2");
}

function expansionAuthority(
  processRef: string,
  recommendation: "proceed" | "change" | "stop",
): LifecycleRecord[] {
  // Phase 7 consumes only the already-reviewed expansion authority. Keep this
  // retained terminal chain disjoint from change candidate/context membership.
  const context = record(processRef, "BSL", "BSL-1030000010", {
    title: "Retained pilot evidence boundary",
    kind: "pilot-assessment-context",
    role: "review-context",
    scope: "Phase 0–2 pilot evidence boundary",
    group: "DEFAULT",
    definition_members: [],
    evidence: [],
  });
  const pas = assessment(processRef, context, recommendation);
  pas.datum.links[0] = { type: "measures", target: "BSL-1030000099-r00001" };
  const pasReview = record(processRef, "REV", "REV-1030000011", {
    title: "Passing retained PAS Review",
    review_kind: "contextual",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    findings: [],
    outcome: "pass",
  }, [{ type: "reviews", target: pas.datum.revision_id }], "review-datum-in-context@2");
  const decision = expansionDecision(processRef, pas, pasReview, recommendation);
  const decisionReview = record(processRef, "REV", "REV-1030000012", {
    title: "Passing retained expansion Decision Review",
    review_kind: "contextual",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    findings: [],
    outcome: "pass",
  }, [{ type: "reviews", target: decision.datum.revision_id }], "review-datum-in-context@2");
  return [pas, pasReview, decision, decisionReview];
}

async function dispositionSnapshot(
  disposition: "reject" | "defer" | "cancel",
): Promise<{ snapshot: Snapshot; decision: LifecycleRecord; review: LifecycleRecord }> {
  const snapshot = await fixture("change-approval-ready.json");
  const change = findRecord(snapshot, changeId);
  const decision = record(snapshot.processRef, "DEC", "DEC-1030000003", {
    title: `${disposition} exact accepted stakeholder change`,
    rationale: "Dispose only this exact reviewed Change Request.",
    kind: "change-approval",
    change_disposition: disposition,
    ...(disposition === "defer"
      ? { change_reactivation_condition: "New exact stakeholder evidence becomes available." }
      : {}),
    decision: disposition,
    alternatives: ["approve"],
    effective_scope: change.datum.revision_id,
  }, [{ type: "justifies", target: change.datum.revision_id }], "approve-change-request@3");
  const context = reviewContext(snapshot.processRef, "BSL-1030000003", decision);
  const review = passingReview(snapshot.processRef, "REV-1030000003", decision, context);
  snapshot.records.push(decision, context, review, ...expansionAuthority(snapshot.processRef, "change"));
  return { snapshot, decision, review };
}

async function draftSharedSnapshot(): Promise<Snapshot> {
  const snapshot = await fixture("shared-consumer-a-ready.json");
  snapshot.phaseId = "phase-2-system-definition";
  snapshot.records = snapshot.records.filter((item) => ![
    sharedChangeId,
    sharedAcceptedBaseline,
    "DEC-KEVJNTTEE7-r00001",
  ].includes(item.datum.revision_id));
  const replacement = findRecord(snapshot, replacementSharedSystem);
  replacement.datum.links = replacement.datum.links.filter((link) => link.type !== "changed-under");
  replacement.datum.created_by = {
    process_ref: snapshot.processRef,
    scenario: "revise-phase-2-subject-after-review@1",
  };
  for (const item of snapshot.records) {
    item.datum.links = item.datum.links.filter((link) => link.target !== sharedChangeId);
  }
  return snapshot;
}

beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  processPackage = loaded.package;
});

describe("accepted stakeholder change hardening routes", () => {
  it("routes a failed draft stakeholder requirement Review to autonomous correction", async () => {
    const snapshot = await fixture("change-impact-ready.json");
    snapshot.phaseId = "phase-0-wayfinding";
    const failed = findRecord(snapshot, "REV-1010000000-r00001");
    failed.datum.payload.outcome = "fail";
    failed.datum.payload.findings = [{
      id: "F-001",
      target: "STK-1010000003-r00001",
      relationship: "primary",
      severity: "blocking",
      summary: "Correct the draft stakeholder requirement.",
    }];
    const result = expectReady(
      snapshot,
      "foundation-review-correction-required",
      "revise-foundation-after-review@5",
      "STK-1010000003-r00001",
    );
    expect(obligation(result, "foundation-review-correction-required", "STK-1010000003-r00001")?.participation)
      .toBeUndefined();
    expect(operatorOutcome(result).kind).toBe("assignment");
    expect(findRecord(snapshot, acceptedStakeholderBaseline).datum.payload.definition_members)
      .toContain(acceptedStakeholder);
    expect(findRecord(snapshot, failed.datum.revision_id).datum.links)
      .toContainEqual({ type: "reviews", target: "STK-1010000003-r00001" });
  });

  it("accepts change impact only against the exact accepted stakeholder baseline", async () => {
    const exact = await fixture("change-approval-ready.json");
    expect(selected(exact, "valid-stakeholder-change-impact@2", { change: changeId }))
      .toEqual([changeId]);
    expect(selected(exact, "accepted-intent-baselines-for-change@1", { change: changeId }))
      .toEqual([acceptedStakeholderBaseline]);
    expect(selected(exact, "impacted-requirements-for-change@3", { change: changeId }))
      .toEqual([acceptedStakeholder]);

    const substituted = structuredClone(exact);
    const malformed = findRecord(substituted, changeId);
    malformed.datum.links = malformed.datum.links.map((link) =>
      link.type === "impacts" && link.target === acceptedStakeholder
        ? { ...link, target: "STK-1010000003-r00001" }
        : link.type === "impacts" && link.target === acceptedStakeholderBaseline
        ? { ...link, target: "BSL-1010000004-r00001" }
        : link
    );
    expect(selected(substituted, "valid-stakeholder-change-impact@2", { change: changeId }))
      .toEqual([]);
    expect(selected(substituted, "accepted-intent-baselines-for-change@1", { change: changeId }))
      .toEqual([]);
  });

  it("derives change-impact analysis for the exact accepted stakeholder boundary", async () => {
    const snapshot = await fixture("change-impact-ready.json");
    const result = expectReady(snapshot, "change-impact-required", "analyze-change-impact@2");
    const route = obligation(result, "change-impact-required");
    expect(route?.resolver.expectedOutputs).toEqual([
      expect.objectContaining({
        name: "change",
        types: ["CHG"],
        requiredLinks: [{ link: "derived-from", target: { input: "problem" } }],
      }),
    ]);
    expect(operatorOutcome(result).kind).toBe("assignment");
    expect(findRecord(snapshot, acceptedStakeholderBaseline).datum.payload.definition_members)
      .toEqual(expect.arrayContaining([acceptedStakeholder, "STK-1010000002-r00001"]));
  });

  it("routes a failed stakeholder change Review through autonomous CHG correction", async () => {
    const snapshot = await fixture("change-approval-ready.json");
    const change = findRecord(snapshot, changeId);
    const review = findRecord(snapshot, "REV-C4PG9BPTGZ-r00001");
    review.datum.payload.outcome = "fail";
    review.datum.payload.findings = [{
      id: "F-001",
      target: changeId,
      relationship: "primary",
      severity: "blocking",
      summary: "Correct the bounded impact.",
    }];
    const result = expectReady(
      snapshot,
      "stakeholder-change-review-correction-required",
      "revise-stakeholder-change-after-review@2",
      changeId,
    );
    expect(obligation(result, "stakeholder-change-review-correction-required", changeId))
      .toEqual(expect.objectContaining({
        participation: [expect.objectContaining({
          policy: "stakeholder-change-correction-participation@2",
          authorityRequirement: expect.objectContaining({
            mode: "autonomous",
            authority: "package-evidence",
          }),
        })],
      }));
    expect(review.datum.links).toContainEqual({ type: "reviews", target: change.datum.revision_id });
    expect(selected(snapshot, "review-correction-history-for@1", {
      subject: changeId,
      view: "autonomous-corrections",
    })).toEqual([]);
  });

  it("turns a reviewed approved change disposition into requirement revision work", async () => {
    const snapshot = await fixture("change-replacement-ready.json");
    const result = expectReady(snapshot, "change-revision-required", "revise-requirement-under-change@3", changeId);
    const approval = findRecord(snapshot, "DEC-G7GAHE6SEX-r00001");
    expect(approval.datum.payload).toMatchObject({ kind: "change-approval", change_disposition: "approve" });
    expect(selected(snapshot, "change-approval-decisions-for@2", { change: changeId }))
      .toEqual([approval.datum.revision_id]);
    expect(operatorOutcome(result).kind).toBe("assignment");
  });

  it("terminates only a rejected stakeholder change after exact Decision Review", async () => {
    const { snapshot, decision, review } = await dispositionSnapshot("reject");
    const result = evaluation(snapshot);
    expect(selected(snapshot, "terminal-change-disposition-decisions-for@1", { change: changeId }))
      .toEqual([decision.datum.revision_id]);
    expect(review.datum.links).toContainEqual({ type: "reviews", target: decision.datum.revision_id });
    expect(result.terminalOutcome?.outcome).toBe("profile-boundary-reached");
    expect(obligation(result, "change-revision-required", changeId)).toEqual(expect.objectContaining({ satisfied: true }));
  });

  it("terminates only a deferred stakeholder change after exact Decision Review", async () => {
    const { snapshot, decision, review } = await dispositionSnapshot("defer");
    const result = evaluation(snapshot);
    expect(decision.datum.payload.change_reactivation_condition).toBe(
      "New exact stakeholder evidence becomes available.",
    );
    expect(selected(snapshot, "passing-reviews-for@1", { subject: decision.datum.revision_id }))
      .toEqual([review.datum.revision_id]);
    expect(result.terminalOutcome?.outcome).toBe("profile-boundary-reached");
    expect(obligation(result, "change-closure-required", changeId)).toEqual(expect.objectContaining({ satisfied: true }));
  });

  it("terminates only a cancelled stakeholder change after exact Decision Review", async () => {
    const { snapshot, decision, review } = await dispositionSnapshot("cancel");
    const result = evaluation(snapshot);
    expect(selected(snapshot, "terminal-change-disposition-decisions-for@1", { change: changeId }))
      .toEqual([decision.datum.revision_id]);
    expect(review.datum.payload.outcome).toBe("pass");
    expect(result.terminalOutcome?.outcome).toBe("profile-boundary-reached");
    expect(result.looseEnds.filter((item) => item.subject === changeId && item.dispatchable)).toEqual([]);
  });

  it("publishes an approved same-lineage stakeholder requirement replacement", async () => {
    const snapshot = await fixture("change-candidate-ready.json");
    const replacement = findRecord(snapshot, "STK-1010000001-r00002");
    const result = evaluation(snapshot);
    expect(replacement.datum.id).toBe("STK-1010000001");
    expect(replacement.datum.links).toContainEqual({ type: "changed-under", target: changeId });
    expect(selected(snapshot, "revised-requirements-for-change@3", { change: changeId }))
      .toEqual([replacement.datum.revision_id]);
    expect(result.artifacts["VER-1010000001-r00001"]?.states.validity).toBe("stale");
    expect(result.artifacts["VER-1010000002-r00001"]?.states.validity).toBe("valid");
    expect(operatorOutcome(result).kind).toBe("assignment");
  });

  it("creates a selective stakeholder-change candidate from exact fresh and reusable evidence", async () => {
    const ready = await fixture("change-candidate-ready.json");
    expectReady(ready, "stakeholder-change-candidate-required", "create-stakeholder-change-candidate@1", changeId);
    const closureReady = await fixture("change-closure-ready.json");
    const candidate = findRecord(closureReady, "BSL-9ZHQCYWAPA-r00001");
    expect(evaluation(closureReady).artifacts[candidate.datum.revision_id]?.states.validity).toBe("valid");
    expect(candidate.datum.payload.definition_members).toEqual([
      "STK-1010000001-r00002",
      "PSP-1010000000-r00001",
      "STK-1010000002-r00001",
    ]);
    expect(candidate.datum.payload.definition_members).not.toContain(acceptedStakeholder);
    expect(candidate.datum.payload.evidence).toEqual(expect.arrayContaining([
      "REV-1BZGFF90QE-r00001",
      "VER-1010000002-r00001",
    ]));
  });

  it("closes an accepted stakeholder change only after exact closure evidence is evaluated", async () => {
    const ready = await fixture("change-closure-ready.json");
    expectReady(ready, "change-closure-required", "close-change-request@4", changeId);
    const closed = await fixture("change-closed.json");
    closed.records.push(...expansionAuthority(closed.processRef, "change"));
    const result = evaluation(closed);
    const closure = findRecord(closed, "DEC-WC1GMGYB0E-r00001");
    expect(closure.datum.links).toEqual(expect.arrayContaining([
      { type: "closes-with", target: "BSL-9ZHQCYWAPA-r00001" },
      { type: "closes-with", target: "REV-E59GBW27P6-r00001" },
    ]));
    expect(obligation(result, "change-closure-required", changeId)).toEqual(expect.objectContaining({ satisfied: true }));
    expect(result.terminalOutcome?.outcome).toBe("profile-boundary-reached");
    expect(result.looseEnds.filter((item) => item.subject === changeId && item.dispatchable)).toEqual([]);
  });
});

describe("shared SYS change hardening routes", () => {
  it("publishes a same-lineage draft shared-SYS replacement without accepted-change authority", async () => {
    const snapshot = await draftSharedSnapshot();
    const replacement = findRecord(snapshot, replacementSharedSystem);
    const result = evaluation(snapshot);
    expect(replacement.datum.id).toBe("SYS-1020000001");
    expect(replacement.datum.links.some((link) => link.type === "changed-under")).toBe(false);
    expect(snapshot.records.some((item) => item.datum.revision_id === sharedAcceptedBaseline)).toBe(false);
    expect(selected(snapshot, "outdated-shared-system-consumers@2")).toEqual([consumerA, consumerB]);
    expect(result.artifacts["VER-1020000002-r00001"]?.states.validity).toBe("valid");
    expect(obligation(result, "shared-system-consumer-reevaluation-required", consumerA))
      .toEqual(expect.objectContaining({ status: "ready" }));
    expect(obligation(result, "shared-system-consumer-reevaluation-required", consumerB))
      .toEqual(expect.objectContaining({ status: "ready" }));
  });

  it("reevaluates both draft shared-SYS consumers serially", async () => {
    const first = await draftSharedSnapshot();
    const firstResult = expectReady(first, "shared-system-consumer-reevaluation-required", "reevaluate-shared-system-consumer@1", consumerA);
    expect(operatorOutcome(firstResult).kind).toBe("assignment");

    const retainedReplacement = findRecord(await fixture("shared-consumer-b-ready.json"), "DWP-1020000001-r00002");
    retainedReplacement.datum.links = retainedReplacement.datum.links.filter((link) => link.type !== "changed-under");
    retainedReplacement.datum.created_by = {
      process_ref: first.processRef,
      scenario: "reevaluate-shared-system-consumer@1",
    };
    first.records.push(retainedReplacement);
    const secondResult = expectReady(first, "shared-system-consumer-reevaluation-required", "reevaluate-shared-system-consumer@1", consumerB);
    expect(selected(first, "outdated-shared-system-consumers@2")).toEqual([consumerB]);
    expect(operatorOutcome(secondResult).kind).toBe("assignment");
  });

  it("requires complete accepted shared-SYS impact before attended approval", async () => {
    const complete = await fixture("shared-consumer-a-ready.json");
    expect(selected(complete, "valid-stakeholder-change-impact@2", { change: sharedChangeId }))
      .toEqual([sharedChangeId]);
    expect(selected(complete, "accepted-intent-baselines-for-change@1", { change: sharedChangeId }))
      .toEqual([sharedAcceptedBaseline]);
    expect(selected(complete, "shared-system-consumers-for-change@1", { change: sharedChangeId }))
      .toEqual([consumerA, consumerB]);

    const incomplete = structuredClone(complete);
    const malformed = findRecord(incomplete, sharedChangeId);
    malformed.datum.links = malformed.datum.links.filter((link) => link.target !== sharedAcceptedBaseline);
    expect(selected(incomplete, "valid-stakeholder-change-impact@2", { change: sharedChangeId }))
      .toEqual([]);
    expect(selected(incomplete, "accepted-intent-baselines-for-change@1", { change: sharedChangeId }))
      .toEqual([]);
  });

  it("publishes an approved accepted shared-SYS replacement under exact CHG authority", async () => {
    const snapshot = await fixture("shared-consumer-a-ready.json");
    const replacement = findRecord(snapshot, replacementSharedSystem);
    const approval = findRecord(snapshot, "DEC-KEVJNTTEE7-r00001");
    const result = evaluation(snapshot);
    expect(replacement.datum.id).toBe("SYS-1020000001");
    expect(replacement.datum.links).toContainEqual({ type: "changed-under", target: sharedChangeId });
    expect(approval.datum.payload).toMatchObject({ kind: "change-approval", change_disposition: "approve" });
    expect(selected(snapshot, "passing-reviews-for@1", { subject: approval.datum.revision_id }))
      .toEqual(["REV-YHSTMD74YS-r00001"]);
    expect(operatorOutcome(result).kind).toBe("assignment");
  });

  it("reevaluates both accepted shared-SYS consumers serially", async () => {
    const first = await fixture("shared-consumer-a-ready.json");
    const firstResult = expectReady(first, "shared-system-consumer-reevaluation-required", "reevaluate-shared-system-consumer@1", consumerA);
    expect(operatorOutcome(firstResult).kind).toBe("assignment");

    const second = await fixture("shared-consumer-b-ready.json");
    const secondResult = expectReady(second, "shared-system-consumer-reevaluation-required", "reevaluate-shared-system-consumer@1", consumerB);
    expect(selected(second, "outdated-shared-system-consumers@2")).toEqual([consumerB]);
    expect(operatorOutcome(secondResult).kind).toBe("assignment");

    const reviewed = await fixture("shared-candidate-ready.json");
    expect(selected(reviewed, "updated-shared-system-consumers-for-change@1", { change: sharedChangeId }))
      .toEqual(["DWP-1020000001-r00002", "DWP-1020000002-r00002"]);
    for (const revisionId of ["DWP-1020000001-r00002", "DWP-1020000002-r00002"]) {
      expect(selected(reviewed, "valid-review-contexts-for@1", { subject: revisionId })).toHaveLength(1);
      expect(selected(reviewed, "passing-reviews-for@1", { subject: revisionId })).toHaveLength(1);
    }
  });

  it("creates the exact selective candidate after shared-SYS consumer reevaluation", async () => {
    const ready = await fixture("shared-candidate-ready.json");
    expectReady(ready, "stakeholder-change-candidate-required", "create-stakeholder-change-candidate@1", sharedChangeId);
    const closureReady = await fixture("shared-closure-ready.json");
    const candidate = findRecord(closureReady, "BSL-TVP0T8KH0Q-r00001");
    const result = evaluation(closureReady);
    expect(candidate.datum.payload.definition_members).toEqual([
      replacementSharedSystem,
      "DWP-1020000001-r00002",
      "DWP-1020000002-r00002",
      "SYS-1020000002-r00001",
    ]);
    expect(candidate.datum.payload.definition_members).not.toContain(sharedSystem);
    expect(candidate.datum.payload.evidence).toContain("VER-1020000002-r00001");
    expect(result.artifacts[candidate.datum.revision_id]?.states.validity).toBe("valid");
  });

  it("closes an accepted shared-SYS change only after both consumers and evidence are fresh", async () => {
    const ready = await fixture("shared-closure-ready.json");
    expectReady(ready, "change-closure-required", "close-change-request@4", sharedChangeId);
    expect(selected(ready, "updated-shared-system-consumers-for-change@1", { change: sharedChangeId }))
      .toEqual(["DWP-1020000001-r00002", "DWP-1020000002-r00002"]);

    const closed = await fixture("shared-closed.json");
    closed.records.push(...expansionAuthority(closed.processRef, "change"));
    const result = evaluation(closed);
    const closure = findRecord(closed, "DEC-GSXMQX37R7-r00001");
    expect(closure.datum.links).toEqual(expect.arrayContaining([
      { type: "closes-with", target: "BSL-EYHTA67F2M-r00001" },
      { type: "closes-with", target: "BSL-PTQX7GGNFD-r00001" },
      { type: "closes-with", target: "BSL-TVP0T8KH0Q-r00001" },
      { type: "closes-with", target: "REV-7YN4F2HF0X-r00001" },
      { type: "closes-with", target: "REV-D3WS6EBKPZ-r00001" },
    ]));
    expect(obligation(result, "change-closure-required", sharedChangeId)).toEqual(expect.objectContaining({ satisfied: true }));
    expect(result.terminalOutcome?.outcome).toBe("profile-boundary-reached");
  });
});

describe("pilot assessment hardening routes", () => {
  it("freezes an exact complete pilot-assessment context", async () => {
    const base = await fixture("phase2-progression-complete.json");
    base.phaseId = "phase-2-pilot-assessment";
    const observed = observation(base.processRef);
    base.records.push(observed);
    expectReady(base, "pilot-assessment-context-required", "prepare-pilot-assessment-context@1");

    const exact = assessmentContext(base.processRef, observed);
    const complete = structuredClone(base);
    complete.records.push(exact);
    expectSchema(exact);
    expect(selected(complete, "complete-pilot-assessment-contexts@1")).toEqual([exact.datum.revision_id]);
    expectReady(complete, "pilot-assessment-required", "assess-phase-0-2-pilot@1", exact.datum.revision_id);

    const missing = structuredClone(base);
    missing.records.push(assessmentContext(base.processRef, observed, "BSL-1030000004", [], []));
    expect(selected(missing, "complete-pilot-assessment-contexts@1")).toEqual([]);
    const extra = structuredClone(base);
    extra.records.push(assessmentContext(
      base.processRef,
      observed,
      "BSL-1030000005",
      [levelCandidate, "BSL-KA32H9PX28-r00001"],
    ));
    expect(selected(extra, "complete-pilot-assessment-contexts@1")).toEqual([]);
  });

  it("derives PAS publication from the exact frozen pilot-assessment context", async () => {
    const base = await fixture("phase2-progression-complete.json");
    base.phaseId = "phase-2-pilot-assessment";
    const observed = observation(base.processRef);
    const context = assessmentContext(base.processRef, observed);
    base.records.push(observed, context);
    const result = expectReady(base, "pilot-assessment-required", "assess-phase-0-2-pilot@1", context.datum.revision_id);
    expect(operatorOutcome(result).kind).toBe("assignment");

    const pas = assessment(base.processRef, context);
    expectSchema(pas);
    base.records.push(pas);
    expect(pas.datum.links).toContainEqual({ type: "measures", target: context.datum.revision_id });
    expect(selected(base, "pilot-assessments-for-context@1", { context: context.datum.revision_id }))
      .toEqual([pas.datum.revision_id]);
    expect(evaluation(base).looseEnds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "review-context-required",
        subject: pas.datum.revision_id,
        actionableResolver: "create-review-context@1",
      }),
    ]));
  });

  it("routes a passing independent PAS Review to attended expansion decision work", async () => {
    const pilot = await pilotSnapshot("change");
    const review = passingReview(
      pilot.snapshot.processRef,
      "REV-1030000001",
      pilot.assessment,
      pilot.assessmentContext,
    );
    pilot.snapshot.records.push(review);
    const result = expectReady(
      pilot.snapshot,
      "pilot-expansion-decision-required",
      "decide-pilot-expansion@2",
      pilot.assessment.datum.revision_id,
    );
    expect(selected(pilot.snapshot, "valid-review-contexts-for@1", { subject: pilot.assessment.datum.revision_id }))
      .toEqual([pilot.assessmentContext.datum.revision_id]);
    expect(selected(pilot.snapshot, "passing-reviews-for@1", { subject: pilot.assessment.datum.revision_id }))
      .toEqual([review.datum.revision_id]);
    expect(operatorOutcome(result)).toEqual(expect.objectContaining({
      kind: "attention-required",
      authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
    }));
  });

  it("derives the first autonomous PAS correction from exact failed Review evidence", async () => {
    const pilot = await pilotSnapshot();
    const failed = failedReview(
      pilot.snapshot.processRef,
      "REV-1030000001",
      pilot.assessment,
      pilot.assessmentContext,
    );
    pilot.snapshot.records.push(failed);
    const result = expectReady(
      pilot.snapshot,
      "pilot-assessment-review-correction-required",
      "revise-pilot-assessment-after-review@2",
      pilot.assessment.datum.revision_id,
    );
    const route = obligation(result, "pilot-assessment-review-correction-required", pilot.assessment.datum.revision_id);
    expect(route).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous", authority: "package-evidence" }),
      })],
    }));
    expect(failed.datum.links).toContainEqual({ type: "reviews", target: pilot.assessment.datum.revision_id });
    expect(pilot.assessment.datum.links).toContainEqual({ type: "measures", target: pilot.context.datum.revision_id });
    expect(operatorOutcome(result).kind).toBe("assignment");
  });

  it("derives the second autonomous PAS correction from fresh failed replacement evidence", async () => {
    const pilot = await pilotSnapshot();
    const firstFailure = failedReview(pilot.snapshot.processRef, "REV-1030000001", pilot.assessment, pilot.assessmentContext);
    const second = assessment(
      pilot.snapshot.processRef,
      pilot.context,
      "change",
      2,
      [{ type: "corrects-review", target: firstFailure.datum.revision_id }],
    );
    const secondContext = reviewContext(pilot.snapshot.processRef, "BSL-1030000003", second);
    const secondFailure = failedReview(pilot.snapshot.processRef, "REV-1030000002", second, secondContext);
    pilot.snapshot.records.push(firstFailure, second, secondContext, secondFailure);
    const result = expectReady(
      pilot.snapshot,
      "pilot-assessment-review-correction-required",
      "revise-pilot-assessment-after-review@2",
      second.datum.revision_id,
    );
    expect(obligation(result, "pilot-assessment-review-correction-required", second.datum.revision_id))
      .toEqual(expect.objectContaining({
        participation: [expect.objectContaining({
          authorityRequirement: expect.objectContaining({ mode: "autonomous", authority: "package-evidence" }),
        })],
      }));
    expect(second.datum.links).toEqual(expect.arrayContaining([
      { type: "measures", target: pilot.context.datum.revision_id },
      { type: "corrects-review", target: firstFailure.datum.revision_id },
    ]));
    expect(selected(pilot.snapshot, "review-correction-history-for@1", {
      subject: second.datum.revision_id,
      view: "autonomous-corrections",
    })).toContain(second.datum.revision_id);
  });

  it("routes stakeholder-owned PAS failure to immediate attended correction", async () => {
    const pilot = await pilotSnapshot();
    const failed = failedReview(
      pilot.snapshot.processRef,
      "REV-1030000001",
      pilot.assessment,
      pilot.assessmentContext,
      "stakeholder",
    );
    pilot.snapshot.records.push(failed);
    const result = expectReady(
      pilot.snapshot,
      "pilot-assessment-review-correction-required",
      "revise-pilot-assessment-after-review@2",
      pilot.assessment.datum.revision_id,
    );
    expect(selected(pilot.snapshot, "review-correction-history-for@1", {
      subject: pilot.assessment.datum.revision_id,
      view: "autonomous-corrections",
    })).toEqual([]);
    expect(operatorOutcome(result)).toEqual(expect.objectContaining({
      kind: "attention-required",
      authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
    }));
  });

  it("escalates an exhausted PAS correction lineage to attended correction", async () => {
    const pilot = await pilotSnapshot();
    const firstFailure = failedReview(pilot.snapshot.processRef, "REV-1030000001", pilot.assessment, pilot.assessmentContext);
    const second = assessment(pilot.snapshot.processRef, pilot.context, "change", 2, [
      { type: "corrects-review", target: firstFailure.datum.revision_id },
    ]);
    const secondContext = reviewContext(pilot.snapshot.processRef, "BSL-1030000003", second);
    const secondFailure = failedReview(pilot.snapshot.processRef, "REV-1030000002", second, secondContext);
    const third = assessment(pilot.snapshot.processRef, pilot.context, "change", 3, [
      { type: "corrects-review", target: secondFailure.datum.revision_id },
    ]);
    const thirdContext = reviewContext(pilot.snapshot.processRef, "BSL-1030000004", third);
    const thirdFailure = failedReview(pilot.snapshot.processRef, "REV-1030000003", third, thirdContext);
    pilot.snapshot.records.push(firstFailure, second, secondContext, secondFailure, third, thirdContext, thirdFailure);
    const result = expectReady(
      pilot.snapshot,
      "pilot-assessment-review-correction-required",
      "revise-pilot-assessment-after-review@2",
      third.datum.revision_id,
    );
    expect(selected(pilot.snapshot, "review-correction-history-for@1", {
      subject: third.datum.revision_id,
      view: "autonomous-corrections",
    })).toEqual([second.datum.revision_id, third.datum.revision_id]);
    expect(second.datum.links).toContainEqual({ type: "corrects-review", target: firstFailure.datum.revision_id });
    expect(third.datum.links).toContainEqual({ type: "corrects-review", target: secondFailure.datum.revision_id });
    expect(operatorOutcome(result)).toEqual(expect.objectContaining({
      kind: "attention-required",
      work: expect.objectContaining({ subject: third.datum.revision_id }),
      authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
    }));
  });
});

describe("expansion Decision and terminal hardening routes", () => {
  it("routes an unreviewed expansion Decision to fresh delegated Review", async () => {
    const pilot = await pilotSnapshot("proceed");
    const pasReview = passingReview(pilot.snapshot.processRef, "REV-1030000001", pilot.assessment, pilot.assessmentContext);
    const decision = expansionDecision(pilot.snapshot.processRef, pilot.assessment, pasReview, "proceed");
    const context = reviewContext(pilot.snapshot.processRef, "BSL-1030000003", decision);
    pilot.snapshot.records.push(pasReview, decision, context);
    const result = evaluation(pilot.snapshot);
    expect(result.terminalOutcome).toBeNull();
    expect(obligation(result, "passing-review-required", decision.datum.revision_id))
      .toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@2",
        participation: [expect.objectContaining({
          authorityRequirement: expect.objectContaining({ mode: "delegated", authority: "independent-reviewer" }),
        })],
      }));
    expect(operatorOutcome(result).kind).toBe("assignment");
  });

  it("routes a failed expansion Decision Review to exact attended correction", async () => {
    const pilot = await pilotSnapshot("change");
    const pasReview = passingReview(pilot.snapshot.processRef, "REV-1030000001", pilot.assessment, pilot.assessmentContext);
    const decision = expansionDecision(pilot.snapshot.processRef, pilot.assessment, pasReview, "change");
    const context = reviewContext(pilot.snapshot.processRef, "BSL-1030000003", decision);
    const failed = failedReview(pilot.snapshot.processRef, "REV-1030000002", decision, context);
    pilot.snapshot.records.push(pasReview, decision, context, failed);
    const result = expectReady(
      pilot.snapshot,
      "pilot-expansion-decision-review-correction-required",
      "revise-pilot-expansion-decision-after-review@1",
      pilot.assessment.datum.revision_id,
    );
    expect(failed.datum.links).toContainEqual({ type: "reviews", target: decision.datum.revision_id });
    expect(operatorOutcome(result)).toEqual(expect.objectContaining({
      kind: "attention-required",
      authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
    }));
  });

  it("returns Profile Boundary Reached from an exact reviewed proceed expansion Decision", async () => {
    const pilot = await pilotSnapshot("proceed");
    const pasReview = passingReview(pilot.snapshot.processRef, "REV-1030000001", pilot.assessment, pilot.assessmentContext);
    const decision = expansionDecision(pilot.snapshot.processRef, pilot.assessment, pasReview, "proceed");
    const context = reviewContext(pilot.snapshot.processRef, "BSL-1030000003", decision);
    const decisionReview = passingReview(pilot.snapshot.processRef, "REV-1030000002", decision, context);
    pilot.snapshot.records.push(pasReview, decision, context, decisionReview);
    const result = evaluation(pilot.snapshot);
    expect(selected(pilot.snapshot, "pilot-expansion-decisions-for@1", { assessment: pilot.assessment.datum.revision_id }))
      .toEqual([decision.datum.revision_id]);
    expect(operatorOutcome(result).kind).toBe("profile-boundary-reached");
  });

  it("returns Profile Boundary Reached for reviewed change without explicit CHG work", async () => {
    const reviewed = await pilotSnapshot("change");
    const pasReview = passingReview(
      reviewed.snapshot.processRef,
      "REV-1030000001",
      reviewed.assessment,
      reviewed.assessmentContext,
    );
    const decision = expansionDecision(
      reviewed.snapshot.processRef,
      reviewed.assessment,
      pasReview,
      "change",
    );
    const decisionContext = reviewContext(reviewed.snapshot.processRef, "BSL-1030000003", decision);
    const decisionReview = passingReview(
      reviewed.snapshot.processRef,
      "REV-1030000002",
      decision,
      decisionContext,
    );
    reviewed.snapshot.phaseId = "phase-7-change-control";
    reviewed.snapshot.records.push(pasReview, decision, decisionContext, decisionReview);
    const boundary = evaluation(reviewed.snapshot);
    expect(boundary.terminalOutcome?.outcome).toBe("profile-boundary-reached");
    expect(boundary.looseEnds.filter((item) => [
      "change-impact-required",
      "change-approval-required",
      "change-revision-required",
      "stakeholder-change-candidate-required",
      "change-closure-required",
    ].includes(item.obligation))).toEqual([]);

    const acceptedChange = await fixture("change-impact-ready.json");
    acceptedChange.records.push(...expansionAuthority(acceptedChange.processRef, "change"));
    const result = expectReady(acceptedChange, "change-impact-required", "analyze-change-impact@2");
    expect(result.phase?.id).toBe("phase-7-change-control");
    expect(operatorOutcome(result).kind).toBe("assignment");
    expect(operatorOutcome(result).kind).not.toBe("process-dead-end");
  });

  it("returns Lifecycle Complete from an exact reviewed stop expansion Decision", async () => {
    const pilot = await pilotSnapshot("stop");
    const pasReview = passingReview(pilot.snapshot.processRef, "REV-1030000001", pilot.assessment, pilot.assessmentContext);
    const decision = expansionDecision(pilot.snapshot.processRef, pilot.assessment, pasReview, "stop");
    const context = reviewContext(pilot.snapshot.processRef, "BSL-1030000003", decision);
    const decisionReview = passingReview(pilot.snapshot.processRef, "REV-1030000002", decision, context);
    pilot.snapshot.records.push(pasReview, decision, context, decisionReview);
    expectSchema(decision);
    expectSchema(decisionReview);
    const result = evaluation(pilot.snapshot);
    expect(selected(pilot.snapshot, "passing-reviews-for@1", { subject: pilot.assessment.datum.revision_id }))
      .toEqual([pasReview.datum.revision_id]);
    expect(selected(pilot.snapshot, "passing-reviews-for@1", { subject: decision.datum.revision_id }))
      .toEqual([decisionReview.datum.revision_id]);
    expect(decision.datum.links).toEqual(expect.arrayContaining([
      { type: "justifies", target: pilot.assessment.datum.revision_id },
      { type: "relies-on-review", target: pasReview.datum.revision_id },
    ]));
    expect(operatorOutcome(result).kind).toBe("lifecycle-complete");
    expect(operatorOutcome(result).kind).not.toBe("process-dead-end");
  });
});
