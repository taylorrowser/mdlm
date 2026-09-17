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
const datum = (id: string, links: DatumEnvelope["links"] = [], payload = {}, revision = 1): DatumEnvelope => ({id, type: id.split("-")[0]!, revision, revision_id: `${id}-r${String(revision).padStart(5, "0")}`, links, payload, created_by: {process_ref: "fixture@1#exact"}, body: "Correction eligibility"});
const link = (type: string, d: DatumEnvelope) => ({type, target: d.revision_id});
function evaluate(data: DatumEnvelope[], expression: unknown, subject: DatumEnvelope) {
  const snapshot: LifecycleSnapshot = {processRef: "fixture@1#exact", dependencyComparisons: [], records: data.map(d => ({datum: d, storage: {editable: false, frozen: true}, integrity: {parseable: true, schema_valid: true, identity_valid: true, references_valid: true, hash_valid: true, transaction_valid: true}}))};
  const compiled = typeof expression === "string" ? compileExpressionValue(expression, pkg, {subject: "entity"}) : {expression, diagnostics: []};
  expect(compiled.diagnostics).toEqual([]);
  return evaluateExpressionValue(pkg, snapshot, compiled.expression, {subject: subject.revision_id});
}

test("an observation without a revise recommendation does not request correction", () => {
  const exp = datum("EXP-brief"), trial = datum("TRY-product", [link("explores", exp)]);
  const obs = datum("OBS-run", [link("against", exp), link("observes", trial)], {recommendation: "keep"});
  for (const action of ["correct-prototype", "revise-experiment"]) {
    expect(pkg.actions[action]).toBeDefined();
    expect(evaluate([exp, trial, obs], pkg.actions[action]!.when as string, exp)).toBe(false);
  }
});

test("a successor consumes revise observations even when the successor uses the verification-selection route", () => {
  const exp = datum("EXP-brief"), trial = datum("TRY-product", [link("explores", exp)]);
  const obs = datum("OBS-run", [link("against", exp), link("observes", trial)], {recommendation: "revise"});
  const data = [exp, trial, obs];
  for (const action of ["correct-prototype", "revise-experiment"]) {
    expect(pkg.actions[action]).toBeDefined();
    expect(evaluate(data, pkg.actions[action]!.when as string, exp)).toBe(true);
  }
  data.push(datum(trial.id, trial.links, {}, 2));
  for (const action of ["correct-prototype", "revise-experiment"])
    expect(evaluate(data, pkg.actions[action]!.when as string, exp)).toBe(false);
});

test("a changed experiment removes its previous correction subject", () => {
  const exp = datum("EXP-brief"), trial = datum("TRY-product", [link("explores", exp)]);
  const obs = datum("OBS-run", [link("against", exp), link("observes", trial)], {recommendation: "revise"});
  const revised = datum(exp.id, [], {}, 2);
  expect(pkg.actions["correct-prototype"]).toBeDefined();
  const subjects = evaluate([exp, revised, trial, obs], pkg.actions["correct-prototype"]!.subjects as string, exp) as any[];
  expect(subjects.map(d => d.identity.revision_id)).toEqual([revised.revision_id]);
  expect(evaluate([exp, revised, trial, obs], pkg.actions["correct-prototype"]!.when as string, revised)).toBe(false);
});
