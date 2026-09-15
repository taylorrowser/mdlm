import path from "node:path";
import { beforeAll, expect, test } from "vitest";
import { loadProcessPackage, type ProcessPackage } from "../src/index.js";
import { compileExpressionValue } from "../src/expression.js";
import { evaluateExpressionValue, type DatumEnvelope, type LifecycleSnapshot } from "../src/evaluator.js";

let pkg: ProcessPackage;
beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/iterative"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  pkg = loaded.package;
});
const ref = "fixture@1#exact";
const datum = (id: string, revision = 1, links: DatumEnvelope["links"] = [], payload = {}): DatumEnvelope => ({id, type: id.split("-")[0]!, revision, revision_id: `${id}-r${String(revision).padStart(5, "0")}`, links, payload, created_by: {process_ref: ref}, body: "Package eligibility fixture"});
const link = (type: string, target: DatumEnvelope) => ({type, target: target.revision_id});
function fixture(consecutive = false) {
  const need = datum("REQ-need"), leaf = datum("REQ-leaf");
  const group = datum("DCP-group", 1, [link("parent", need), link("child", leaf)]);
  const graph = [link("contains", need), link("contains", leaf), link("decomposition", group)];
  const reviewed = datum("RQS-set", 1, graph);
  const baseline = consecutive ? datum("RQS-set", 2, graph) : reviewed;
  const imp = datum("IMP-product", 1, [link("implements", baseline)]);
  const accepted = datum("ACC-baseline", 1, [link("confirms", baseline), link("accepts", imp)], {decision: "accept"});
  const change = datum("CHG-change", 1, [link("baseline", accepted), link("changes", need)]);
  const approval = datum("REV-approval", 1, [link("reviews", change)], {outcome: "pass"});
  const pass = datum("REV-requirements", 1, [link("reviews", reviewed)], {outcome: "pass"});
  const candidate = datum("RQS-set", baseline.revision + 1, [...graph, link("changes-under", change)]);
  const data = [need, leaf, group, reviewed, ...(consecutive ? [baseline] : []), imp, accepted, change, approval, pass, candidate];
  return {data, need, leaf, group, reviewed, baseline, imp, accepted, change, approval, pass, candidate};
}
function evaluate(data: DatumEnvelope[], expression: unknown, subject?: string, invalid?: string) {
  const snapshot: LifecycleSnapshot = {processRef: ref, dependencyComparisons: [], records: data.map(d => ({datum: d, storage: {editable: false, frozen: true}, integrity: {parseable: true, schema_valid: true, identity_valid: true, references_valid: true, hash_valid: true, transaction_valid: d.revision_id !== invalid}}))};
  const compiled = typeof expression === "string" ? compileExpressionValue(expression, pkg, subject ? {subject: "entity"} : {}) : {expression, diagnostics: []};
  expect(compiled.diagnostics).toEqual([]);
  return evaluateExpressionValue(pkg, snapshot, compiled.expression, subject ? {subject} : {});
}
function eligible(f: ReturnType<typeof fixture>, action: string, invalid?: string) {
  return evaluate(f.data, pkg.actions[action]!.when, f.candidate.revision_id, invalid);
}
for (const consecutive of [false, true]) test(`unchanged accepted graph reuses the exact earlier review${consecutive ? " across consecutive maintenance" : ""}`, () => {
  const f = fixture(consecutive);
  expect(eligible(f, "rebind-product")).toBe(true);
  expect(eligible(f, "review-requirements")).toBe(false);
  expect(evaluate(f.data, (pkg.manifest.terminal as {when: unknown}).when)).toBe(false);
  const nextImp = datum(f.imp.id, 2, [link("implements", f.candidate)]);
  const result = datum("RES-result", 1, [link("executes", nextImp), link("verifies", f.candidate)], {outcome: "pass"});
  const review = datum("REV-implementation", 1, [link("reviews", nextImp)], {outcome: "pass"});
  const acceptance = datum("ACC-next", 1, [link("accepts", nextImp), link("confirms", f.candidate)], {decision: "accept"});
  f.data.push(nextImp, result, review, acceptance);
  expect(evaluate(f.data, (pkg.manifest.terminal as {when: unknown}).when)).toBe(true);
  for (const required of [result, review, acceptance]) expect(evaluate(f.data.filter(d => d !== required), (pkg.manifest.terminal as {when: unknown}).when)).toBe(false);
});

const negatives: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
  ["changed requirement revision", f => { const next = {...f.leaf, revision: 2, revision_id: `${f.leaf.id}-r00002`}; f.data.push(next); f.candidate.links = f.candidate.links.map(l => l.target === f.leaf.revision_id ? link(l.type, next) : l); }],
  ["changed decomposition revision with identical requirements", f => { const next = {...f.group, revision: 2, revision_id: `${f.group.id}-r00002`}; f.data.push(next); f.candidate.links = f.candidate.links.map(l => l.target === f.group.revision_id ? link(l.type, next) : l); }],
  ["missing baseline", f => { f.change.links = f.change.links.filter(l => l.type !== "baseline"); }],
  ["rejected baseline", f => { f.accepted.payload.decision = "reject"; }],
  ["unrelated graph approval", f => { const foreign = datum("RQS-foreign", 1, f.reviewed.links); f.data.push(foreign); f.pass.links = [link("reviews", foreign)]; }],
  ["missing approval", f => { f.data = f.data.filter(d => d !== f.approval); }],
  ["failed change", f => { f.data.push(datum("REV-change-fail", 1, [link("reviews", f.change)], {outcome: "fail"})); }],
  ["failed source review", f => { f.data.push(datum("REV-source-fail", 1, [link("reviews", f.reviewed)], {outcome: "fail"})); }],
  ["failed accepted baseline", f => { f.data.push(datum("REV-baseline-fail", 1, [link("reviews", f.baseline)], {outcome: "fail"})); }],
  ["failed current selection", f => { f.data.push(datum("REV-current-fail", 1, [link("reviews", f.candidate)], {outcome: "fail"})); }],
  ["review newer than accepted baseline", f => { const later = datum("RQS-set", 3, f.reviewed.links); f.data.push(later); f.pass.links = [link("reviews", later)]; f.candidate.revision = 4; f.candidate.revision_id = "RQS-set-r00004"; }],
];
for (const [name, mutate] of negatives) test(`${name} cannot reuse requirements review`, () => {
  const f = fixture(true); mutate(f);
  expect(eligible(f, "rebind-product")).toBe(false);
  if (name !== "failed current selection") expect(eligible(f, "review-requirements")).toBe(true);
});
for (const invalid of ["pass", "approval", "accepted", "baseline"] as const) test(`untrusted ${invalid} cannot authorize reuse`, () => {
  const f = fixture(true);
  expect(eligible(f, "rebind-product", f[invalid].revision_id)).toBe(false);
});
test("initial requirements still require a fresh review", () => {
  const f = fixture(); f.data = [f.need, f.leaf, f.group, f.reviewed];
  expect(evaluate(f.data, pkg.actions["review-requirements"]!.when, f.reviewed.revision_id)).toBe(true);
  expect(evaluate(f.data, pkg.actions["implement-product"]!.when, f.reviewed.revision_id)).toBe(false);
});
