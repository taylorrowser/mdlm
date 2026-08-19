import { beforeAll, describe, expect, it } from "vitest";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { evaluateLifecycle, loadProcessPackage, type ExactTypedEntity, type LifecycleRecord, type ProcessPackage } from "../src/index.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";

const processRoot = ".lifecycle/process";
const processRef = "mdlm-bootstrap@0.70.0#sha256:shared-system";
let processPackage: ProcessPackage;
const rev = (id: string, n = 1) => `${id}-r${String(n).padStart(5, "0")}`;
const ids = { sys: "SYS-1020000001", other: "SYS-1020000002", a: "DWP-1020000001", b: "DWP-1020000002", verification: "VER-1020000001", otherVerification: "VER-1020000002", candidate: "BSL-1020000001", accepted: "BSL-1020000002", problem: "PRB-1020000001", source: "ART-1020000001", change: "CHG-1020000001" };

function record(type: string, id: string, payload: Record<string, unknown>, links: {type: string; target: string}[] = [], scenario?: string, revisionNumber = 1): LifecycleRecord {
  const base = frozenLifecycleRecord(processRef, type, id, payload, {links, ...(scenario ? {scenario} : {})});
  return revisionNumber === 1 ? base : {
    ...base,
    datum: {
      ...base.datum,
      revision: revisionNumber,
      revision_id: rev(id, revisionNumber),
    },
  };
}
const requirement = (title: string) => ({title, rationale: "One shared lineage.", statement: title, verification_intent: "Inspect exact behavior."});
const dwp = (title: string) => ({title, rationale: "Separate exact consumer coverage.", stage: "completion", architecture_element: "AEL-1020000000", target_child_type: "SYS", behavioral_slice: title, expected_coverage: [title], exclusions: [], dependencies: [], required_review_policy: "review-applicability@1", parent_coverage_status: "complete", deferred_questions: [], cross_group_dependencies: [], output_reviews_complete: true, simplification_disposition: "retained"});
const verification = (title: string) => ({title, rationale: "Exact evidence dependency.", kind: "pilot", method: "test", assessment_mode: "automatic", claim: {kind: "pilot", scope: "verification-design", formal_evidence_eligible: false}, acceptance_criteria: ["observable"], evidence_requirements: ["exact"], expected_success_activity: "success", expected_discrimination_activity: "reject"});

beforeAll(async () => { const loaded = await loadProcessPackage(processRoot); if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics)); processPackage = loaded.package; });

describe("shared accepted SYS package behavior", () => {
  it("selects only the current Revision of each accepted consumer Stable Datum lineage", () => {
    const system = record("SYS", ids.sys, requirement("Shared export"));
    const consumerA1 = record("DWP", ids.a, dwp("API coverage"), [{type: "decomposes", target: system.datum.revision_id}]);
    const consumerB1 = record("DWP", ids.b, dwp("CLI coverage"), [{type: "decomposes", target: system.datum.revision_id}]);
    const accepted = record("BSL", ids.accepted, {title: "Accepted system", kind: "level-accepted", role: "accepted", scope: "SYSTEM", group: "DEFAULT", definition_members: [system.datum.revision_id, consumerA1.datum.revision_id, consumerB1.datum.revision_id], evidence: []});
    const change = record("CHG", ids.change, {title: "Change shared SYS", rationale: "Bound current consumers.", scope: "One shared SYS", planned_changes: ["change"], implementation_order: "requirements -> context -> reviews -> baselines -> verification", closure_criteria: ["both current consumers"]}, [{type: "impacts", target: system.datum.revision_id}, {type: "impacts", target: accepted.datum.revision_id}]);
    const changedLinks = [{type: "decomposes", target: rev(ids.sys, 2)}, {type: "changed-under", target: change.datum.revision_id}];
    const consumerA2 = record("DWP", ids.a, dwp("API coverage"), changedLinks, "reevaluate-shared-system-consumer@1", 2);
    const consumerA3 = record("DWP", ids.a, dwp("API coverage"), [...changedLinks, {type: "corrects-review", target: "REV-1020000009-r00001"}], "revise-stakeholder-change-after-review@2", 3);
    const snapshot = {processRef, phaseId: "phase-7-change-control", records: [system, consumerA1, consumerA2, consumerA3, consumerB1, accepted, change], dependencyComparisons: []};

    const selected = evaluateProcessDefinition(processPackage, snapshot, "selector", "shared-system-consumers-for-change@1", {change: change.datum.revision_id});
    expect((selected.result as ExactTypedEntity[]).map((item) => item.identity.revision_id)).toEqual([
      consumerA3.datum.revision_id,
      consumerB1.datum.revision_id,
    ]);
    const updated = evaluateProcessDefinition(processPackage, snapshot, "selector", "updated-shared-system-consumers-for-change@1", {change: change.datum.revision_id});
    expect((updated.result as ExactTypedEntity[]).map((item) => item.identity.revision_id)).toEqual([
      consumerA3.datum.revision_id,
    ]);
  });

  it("exposes both exact consumers and preserves unrelated evidence after same-lineage replacement", () => {
    const system = record("SYS", ids.sys, requirement("Shared export"), [], "derive-system-requirements@1");
    const other = record("SYS", ids.other, requirement("Unrelated title"));
    const consumerA = record("DWP", ids.a, dwp("API coverage"), [{type: "decomposes", target: system.datum.revision_id}], "complete-decomposition-work-package@2");
    const consumerB = record("DWP", ids.b, dwp("CLI coverage"), [{type: "decomposes", target: system.datum.revision_id}], "complete-decomposition-work-package@2");
    const affectedVerification = record("VER", ids.verification, verification("Shared verification"), [{type: "verifies", target: ids.sys}, {type: "verifies-revision", target: system.datum.revision_id}]);
    const unrelatedVerification = record("VER", ids.otherVerification, verification("Title verification"), [{type: "verifies", target: ids.other}, {type: "verifies-revision", target: other.datum.revision_id}]);
    const candidate = record("BSL", ids.candidate, {title: "System candidate", kind: "level-candidate", role: "candidate", scope: "SYSTEM", group: "DEFAULT", definition_members: [system.datum.revision_id, other.datum.revision_id, consumerA.datum.revision_id, consumerB.datum.revision_id], evidence: [affectedVerification.datum.revision_id, unrelatedVerification.datum.revision_id]}, [], "create-system-level-candidate@1");
    const accepted = record("BSL", ids.accepted, {title: "Accepted system", kind: "level-accepted", role: "accepted", scope: "SYSTEM", group: "DEFAULT", definition_members: [system.datum.revision_id, other.datum.revision_id, consumerA.datum.revision_id, consumerB.datum.revision_id], evidence: [candidate.datum.revision_id, affectedVerification.datum.revision_id, unrelatedVerification.datum.revision_id]}, [{type: "promotes", target: candidate.datum.revision_id}], "accept-phase-2-system@1");
    const source = record("ART", ids.source, {title: "Observation", kind: "prototype", repository_ref: `git:${"a".repeat(40)}`, supported_behavior: ["shared"], unsupported_behavior: ["malformed"]});
    const problem = record("PRB", ids.problem, {title: "Shared change", rationale: "Reevaluate both.", condition: "Changed behavior", severity: "major", disposition: "open", evidence_refs: [source.datum.revision_id]}, [{type: "reports", target: source.datum.revision_id}]);
    const change = record("CHG", ids.change, {title: "Change shared SYS", rationale: "Bound complete impact.", scope: "One shared SYS", planned_changes: ["change"], implementation_order: "requirements -> context -> reviews -> baselines -> verification", closure_criteria: ["both consumers fresh"]}, [{type: "derived-from", target: problem.datum.revision_id}, {type: "impacts", target: system.datum.revision_id}, {type: "impacts", target: accepted.datum.revision_id}], "analyze-change-impact@2");
    const replacement: LifecycleRecord = {...record("SYS", ids.sys, requirement("Shared export with rejection"), [{type: "changed-under", target: change.datum.revision_id}], "revise-requirement-under-change@3"), datum: {...record("SYS", ids.sys, requirement("Shared export with rejection")).datum, revision: 2, revision_id: rev(ids.sys, 2), links: [{type: "changed-under", target: change.datum.revision_id}], created_by: {process_ref: processRef, scenario: "revise-requirement-under-change@3"}}};

    const result = evaluateLifecycle(processPackage, {processRef, phaseId: "phase-7-change-control", records: [system, replacement, other, consumerA, consumerB, affectedVerification, unrelatedVerification, candidate, accepted, source, problem, change], dependencyComparisons: []});
    expect(result.obligations.map((item) => `${item.obligation}:${item.subject}`), JSON.stringify(result.diagnostics)).toEqual(expect.arrayContaining([
      `shared-system-consumer-reevaluation-required:${consumerA.datum.revision_id}`,
      `shared-system-consumer-reevaluation-required:${consumerB.datum.revision_id}`,
    ]));
    expect(result.artifacts[affectedVerification.datum.revision_id]?.states.validity).toBe("stale");
    expect(result.artifacts[unrelatedVerification.datum.revision_id]?.states.validity).toBe("valid");
    expect(result.artifacts[consumerA.datum.revision_id]?.states.validity).toBe("stale");
    expect(result.artifacts[consumerB.datum.revision_id]?.states.validity).toBe("stale");
    expect(result.artifacts[change.datum.revision_id]?.states.validity).toBe("valid");
  });
});
