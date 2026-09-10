import {expect, test} from "vitest";
import type {DatumEnvelope} from "../src/index.js";
import {assessRequirements, validateChangeDatum} from "../src/change-assessment.js";
import type {RequirementTraceBinding} from "../src/requirement-trace.js";
const binding: RequirementTraceBinding = {type: "RQS", requirement_type: "REQ", implementation_type: "IMP", scope_type: "SCP", decomposition_type: "DCP", change_type: "CHG", acceptance_type: "ACC", review_type: "REV"};
function d(id: string, links: Record<string, string[]> = {}, payload: Record<string, unknown> = {}, revision = 1): DatumEnvelope {
  return {id, type: id.split("-")[0]!, revision, revision_id: `${id}-r${revision}`, links: Object.entries(links).flatMap(([type, values]) => values.map(target => ({type, target}))), payload, body: "", created_by: {process_ref: "test"}};
}
const id = (x: DatumEnvelope) => x.revision_id;
function fixture() {
  const root = d("REQ-root", {}, {kind: "stakeholder"});
  const parent = d("REQ-parent", {}, {kind: "software"});
  const leaf = d("REQ-leaf", {}, {kind: "software"});
  const peer = d("REQ-peer", {}, {kind: "software"});
  const top = d("DCP-top", {parent: [id(root)], child: [id(parent), id(peer)]});
  const bottom = d("DCP-bottom", {parent: [id(parent)], child: [id(leaf)]});
  const set = d("RQS-set", {contains: [root, parent, leaf, peer].map(id), decomposition: [top, bottom].map(id)});
  const data = [root, parent, leaf, peer, top, bottom, set];
  const initial = assessRequirements(data, binding, set);
  const review = d("REV-initial", {reviews: [id(set)]}, {
    outcome: "pass", requirement_assessments: initial.requirements.map(requirement => ({requirement, disposition: "valid", rationale: "Correct."})),
    decomposition_assessments: initial.groups.map(g => ({group: g.revision, children: g.children.map(requirement => ({requirement, disposition: "valid", rationale: "Fits."})), disposition: "adequate", membership_action: "none", rationale: "Complete."})),
  });
  const imp = d("IMP-product", {implements: [id(set)]});
  const scope = d("SCP-leaf", {"belongs-to": [id(imp)], implements: [id(leaf)]}, {path: "tasks.py", name: "complete", role: "production"});
  const acc = d("ACC-first", {confirms: [id(set)], accepts: [id(imp)]}, {decision: "accept"});
  return {root, parent, leaf, peer, top, bottom, set, review, imp, scope, acc, data};
}
function baseline(f: ReturnType<typeof fixture>) { f.data.push(f.review, f.imp, f.scope, f.acc); }
function request(f: ReturnType<typeof fixture>, target: DatumEnvelope) {
  const change = d("CHG-first", {baseline: [id(f.acc)], changes: [id(target)]});
  f.data.push(change, d("REV-approval", {reviews: [id(change)]}, {outcome: "pass"}));
  return change;
}
function replace(f: ReturnType<typeof fixture>, change: DatumEnvelope, original: DatumEnvelope) {
  const revision = {...original, revision: 2, revision_id: `${original.id}-r2`, links: [...original.links, {type: "changes-under", target: id(change)}]};
  const groups = [f.top, f.bottom].map(g => g.links.some(l => l.target === id(original)) ? {...g, revision: 2, revision_id: `${g.id}-r2`, links: [...g.links.map(l => ({...l, target: l.target === id(original) ? id(revision) : l.target})), {type: "changes-under", target: id(change)}]} : g);
  const set = d("RQS-set", {contains: [f.root, f.parent, f.leaf, f.peer].map(r => r === original ? id(revision) : id(r)), decomposition: groups.map(id), "changes-under": [id(change)]}, {}, 2);
  f.data.push(revision, ...groups.filter(g => g.revision === 2), set);
  return {revision, groups, set};
}
test("initial review requires statements and each whole decomposition, independently", () => {
  const f = fixture();
  expect(validateChangeDatum(f.data, binding, f.review)).toEqual([]);
  f.review.payload.decomposition_assessments = [];
  expect(validateChangeDatum(f.data, binding, f.review).map(d => d.code)).toContain("change-review-coverage");
});
test("parent clarification requires its new group but preserves exact deeper evidence", () => {
  const f = fixture(); baseline(f);
  const change = request(f, f.root);
  const candidate = replace(f, change, f.root);
  const work = assessRequirements(f.data, binding, candidate.set);
  expect(work.requirements).toEqual([id(candidate.revision)]);
  expect(work.groups.map(g => g.revision)).toEqual(["DCP-top-r2"]);
  expect(work.groups[0]!.children).toEqual([id(f.parent), id(f.peer)]);
  expect(work.sourceScopes).toEqual([]);
  expect(validateChangeDatum(f.data, binding, candidate.set)).toEqual([]);
  expect(validateChangeDatum(f.data, binding, f.review)).toEqual([]);
});
test("leaf change affects parent group and directly linked code, not ancestors or siblings", () => {
  const f = fixture(); baseline(f);
  const change = request(f, f.leaf);
  const candidate = replace(f, change, f.leaf);
  const work = assessRequirements(f.data, binding, candidate.set);
  expect(work.requirements).toEqual([id(candidate.revision)]);
  expect(work.groups.map(g => g.revision)).toEqual(["DCP-bottom-r2"]);
  expect(work.sourceScopes).toEqual([id(f.scope)]);
  expect(work.allowedRequirements).toEqual([id(f.leaf)]);
  expect(validateChangeDatum(f.data, binding, candidate.revision)).toEqual([]);
  expect(validateChangeDatum(f.data, binding, candidate.set)).toEqual([]);
});
test("valid children can leave a group incomplete and create membership correction", () => {
  const f = fixture();
  f.review.payload.outcome = "fail";
  const groups = f.review.payload.decomposition_assessments as Record<string, unknown>[];
  groups[0]!.disposition = "needs-change"; groups[0]!.membership_action = "revise-membership";
  expect(validateChangeDatum(f.data, binding, f.review)).toEqual([]);
  f.data.push(f.review);
  expect(assessRequirements(f.data, binding, f.set).correction).toEqual({requirements: [], groups: [id(f.top)]});
  f.review.payload.outcome = "pass";
  expect(validateChangeDatum(f.data, binding, f.review).map(d => d.code)).toContain("change-review-pass");
});
test("draft edits are free but accepted stable requirements require approved bounded authority", () => {
  const f = fixture();
  const revised = {...f.leaf, revision: 2, revision_id: "REQ-leaf-r2"};
  expect(validateChangeDatum(f.data, binding, revised)).toEqual([]);
  baseline(f);
  expect(validateChangeDatum(f.data, binding, revised).map(d => d.code)).toContain("change-approval-required");
  const change = request(f, f.peer);
  revised.links = [{type: "changes-under", target: id(change)}];
  expect(validateChangeDatum(f.data, binding, revised).map(d => d.code)).toContain("change-outside-scope");
});
test("approval does not allow skipping the descendant review frontier", () => {
  const f = fixture(); baseline(f);
  const change = request(f, f.root);
  const candidate = replace(f, change, f.leaf);
  expect(validateChangeDatum(f.data, binding, candidate.set).map(d => d.code)).toContain("change-frontier");
});
test("one active approval blocks a second request on the same accepted baseline", () => {
  const f = fixture(); baseline(f); request(f, f.leaf);
  const change = d("CHG-second", {baseline: [id(f.acc)], changes: [id(f.peer)]}); f.data.push(change);
  const approval = d("REV-second", {reviews: [id(change)]}, {outcome: "pass"});
  expect(validateChangeDatum(f.data, binding, approval).map(d => d.code)).toContain("change-already-active");
});
test("shared child has distinct assessment coverage in each exact parent group", () => {
  const f = fixture();
  f.top.links.push({type: "child", target: id(f.leaf)});
  const work = assessRequirements(f.data, binding, f.set);
  f.review.payload.decomposition_assessments = work.groups.map(g => ({group: g.revision, disposition: "adequate", membership_action: "none", rationale: "Fits.", children: g.children.map(requirement => ({requirement, disposition: "valid", rationale: "Fits."}))}));
  expect(validateChangeDatum(f.data, binding, f.review)).toEqual([]);
  const assessments = f.review.payload.decomposition_assessments as {group: string; children: {requirement: string}[]}[];
  assessments[1]!.children = [];
  expect(validateChangeDatum(f.data, binding, f.review).map(d => d.code)).toContain("change-review-coverage");
});
test("retiring a baselined leaf retains its direct source impact and forbids reinstatement", () => {
  const f = fixture(); baseline(f);
  const change = request(f, f.leaf);
  const empty = d(f.bottom.id, {parent: [id(f.parent)], "changes-under": [id(change)]}, {}, 2);
  const set = d(f.set.id, {contains: [f.root, f.parent, f.peer].map(id), decomposition: [id(f.top), id(empty)], retires: [id(f.leaf)], "changes-under": [id(change)]}, {}, 2);
  f.data.push(empty, set);
  expect(assessRequirements(f.data, binding, set).sourceScopes).toEqual([id(f.scope)]);
  const restored = d(f.set.id, {contains: [f.root, f.parent, f.leaf, f.peer].map(id), decomposition: [id(f.top), id(f.bottom)], "changes-under": [id(change)]}, {}, 3);
  expect(validateChangeDatum(f.data, binding, restored).map(d => d.code)).toContain("change-retirement-history");
});
test("new baseline implementation identities cannot bypass change authority", () => {
  const f = fixture(); baseline(f);
  const imp = d("IMP-other", {implements: [id(f.set)]});
  expect(validateChangeDatum(f.data, binding, imp).map(d => d.code)).toContain("change-approval-required");
});
test("accepted baseline referents validate themselves without demanding retrospective change authority", () => {
  const f = fixture(); baseline(f);
  for (const datum of [f.root, f.parent, f.leaf, f.top, f.bottom, f.set, f.imp, f.acc]) expect(validateChangeDatum(f.data, binding, datum), datum.revision_id).toEqual([]);
  const unauthorized = {...f.imp, revision: 2, revision_id: "IMP-product-r2"};
  expect(validateChangeDatum(f.data, binding, unauthorized).map(d => d.code)).toContain("change-approval-required");
});
test("accepted changed graph and historical amended requests retain exact reference resolution", () => {
  const f = fixture(); baseline(f);
  const change = request(f, f.root);
  const amendment = d(change.id, {baseline: [id(f.acc)], changes: [id(f.root), id(f.leaf)]}, {}, 2);
  f.data.push(amendment, d("REV-amendment", {reviews: [id(amendment)]}, {outcome: "pass"}));
  const candidate = replace(f, amendment, f.root);
  const acc = d("ACC-second", {confirms: [id(candidate.set)], "changes-under": [id(amendment)]}, {decision: "accept"}); f.data.push(acc);
  expect(validateChangeDatum(f.data, binding, candidate.set)).toEqual([]);
  expect(validateChangeDatum(f.data, binding, candidate.revision)).toEqual([]);
  expect(validateChangeDatum(f.data, binding, change)).toEqual([]);
  expect(validateChangeDatum(f.data, binding, amendment)).toEqual([]);
  const stale = d("CHG-unrelated", {baseline: [id(f.acc)], changes: [id(f.root)]});
  expect(validateChangeDatum(f.data, binding, stale).map(d => d.code)).toContain("change-baseline-stale");
});
test("retirement names the immediately selected revision rather than any old revision of its identity", () => {
  const f = fixture();
  const revised = {...f.leaf, revision: 2, revision_id: "REQ-leaf-r2"};
  const second = d(f.set.id, {contains: [id(f.root), id(f.parent), id(revised), id(f.peer)]}, {}, 2);
  f.data.push(revised, second);
  const retirement = d(f.set.id, {contains: [f.root, f.parent, f.peer].map(id), retires: [id(f.leaf)]}, {}, 3);
  expect(validateChangeDatum(f.data, binding, retirement).map(d => d.code)).toContain("change-retirement-stale");
  retirement.links = retirement.links.map(l => l.type === "retires" ? {...l, target: id(revised)} : l);
  expect(validateChangeDatum(f.data, binding, retirement)).toEqual([]);
});
