import path from "node:path";
import {beforeAll, expect, test} from "vitest";
import {loadProcessPackage, type ProcessPackage} from "../src/index.js";
import {compileExpressionValue} from "../src/expression.js";
import {evaluateExpressionValue, type DatumEnvelope, type LifecycleSnapshot} from "../src/evaluator.js";

let pkg: ProcessPackage;
beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/iterative"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  pkg = loaded.package;
});
const datum = (id: string, revision = 1, links: DatumEnvelope["links"] = [], payload = {}): DatumEnvelope => ({id, type: id.split("-")[0]!, revision, revision_id: `${id}-r${String(revision).padStart(5, "0")}`, links, payload, created_by: {process_ref: "fixture@1#exact"}, body: "Refinement eligibility fixture"});
const link = (type: string, target: DatumEnvelope) => ({type, target: target.revision_id});
function fixture() {
  const req = datum("REQ-count"), set = datum("RQS-selection", 1, [link("contains", req)]);
  const review = datum("REV-requirements", 1, [link("reviews", set)], {outcome: "pass"});
  return {data: [req, set, review], req, set, review};
}
function evaluate(data: DatumEnvelope[], value: unknown, subject: DatumEnvelope) {
  const snapshot: LifecycleSnapshot = {processRef: "fixture@1#exact", dependencyComparisons: [], records: data.map(d => ({datum: d, storage: {editable: false, frozen: true}, integrity: {parseable: true, schema_valid: true, identity_valid: true, references_valid: true, hash_valid: true, transaction_valid: true}}))};
  const compiled = typeof value === "string" ? compileExpressionValue(value, pkg, {subject: "entity"}) : {expression: value, diagnostics: []};
  expect(compiled.diagnostics).toEqual([]);
  return evaluateExpressionValue(pkg, snapshot, compiled.expression, {subject: subject.revision_id});
}
function eligible(data: DatumEnvelope[], subject: DatumEnvelope) {
  const action = pkg.actions["refine-requirements"]!;
  const subjects = evaluate(data, action.subjects, subject) as any[];
  return subjects.some(d => d.identity.revision_id === subject.revision_id) && evaluate(data, action.when, subject);
}

test("reviewed unaccepted requirements can refine with no failure, including after implementation", () => {
  const f = fixture();
  expect(pkg.actions["refine-requirements"]?.authority).toEqual({kind: "stakeholder", name: "stakeholder"});
  expect(eligible(f.data, f.set)).toBe(true);
  const imp = datum("IMP-product", 1, [link("implements", f.set)]);
  f.data.push(imp);
  expect(eligible(f.data, f.set)).toBe(true);
  f.data.push(datum("ACC-rejection", 1, [link("accepts", imp), link("confirms", f.set)], {decision: "reject"}));
  expect(eligible(f.data, f.set)).toBe(true);
  const activity = datum("VFY-activity", 1, [link("verifies", f.req)]);
  f.data.push(activity, datum("REV-coverage", 1, [link("reviews", activity)], {outcome: "fail", coverage_assessments: [{target: f.req.revision_id, disposition: "needs-change", rationale: "Public observations cannot prove private storage absence"}]}));
  expect(eligible(f.data, f.set)).toBe(true);
  expect(evaluate(f.data, pkg.actions["correct-requirements-after-review"]!.when, f.set)).toBe(false);
});

test("accepted lineage cannot refine even when only an earlier selection was accepted", () => {
  const f = fixture();
  const imp = datum("IMP-product", 1, [link("implements", f.set)]);
  f.data.push(imp, datum("ACC-baseline", 1, [link("accepts", imp), link("confirms", f.set)], {decision: "accept"}));
  expect(eligible(f.data, f.set)).toBe(false);
  const successor = datum(f.set.id, 2, f.set.links);
  f.data.push(successor);
  expect(eligible(f.data, successor)).toBe(false);
});

test("change-bound selection cannot refine and superseded selection is not offered", () => {
  const f = fixture();
  const change = datum("CHG-approved");
  const successor = datum(f.set.id, 2, [...f.set.links, link("changes-under", change)]);
  f.data.push(change, datum("REV-approval", 1, [link("reviews", change)], {outcome: "pass"}), successor);
  expect(eligible(f.data, successor)).toBe(false);
  expect(eligible(f.data, f.set)).toBe(false);
});
