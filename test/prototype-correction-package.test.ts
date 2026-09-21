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

test("pre-trial amendment remains optional and retains exact origins and comparison", () => {
  const origin = datum("FDB-origin"), baseline = datum("ACC-baseline");
  const exp = datum("EXP-brief", [link("responds-to", origin), link("compares-to", baseline)]);
  const amendment = pkg.actions["amend-experiment"]!;
  expect(amendment.optional).toBe(true);
  expect(amendment.revises).toEqual({EXP: "subject"});
  expect(amendment.links).toEqual({EXP: {"responds-to": "origin", "compares-to": "baseline"}});
  expect(evaluate([origin, baseline, exp], amendment.when, exp)).toBe(true);
  for (const [input, expected] of [["origin", origin], ["baseline", baseline]] as const) {
    const selected = evaluate([origin, baseline, exp], amendment.inputs![input], exp) as any[];
    expect(selected.map(d => d.identity.revision_id)).toEqual([expected.revision_id]);
  }
  const trial = datum("TRY-product", [link("explores", exp)]);
  expect(evaluate([origin, baseline, exp, trial], amendment.when, exp)).toBe(false);
  const obs = datum("OBS-run", [link("against", exp), link("observes", trial)], {recommendation: "revise"});
  expect(evaluate([origin, baseline, exp, trial, obs], amendment.when, exp)).toBe(false);
  expect(evaluate([origin, baseline, exp, trial, obs], pkg.actions["revise-experiment"]!.when, exp)).toBe(true);

  const fromObservation = datum(exp.id, [link("responds-to", obs)], {}, 2);
  const observationOrigins = evaluate([obs, fromObservation], amendment.inputs!.origin, fromObservation) as any[];
  expect(observationOrigins.map(d => d.identity.revision_id)).toEqual([obs.revision_id]);
});

test("stop targets each current revise observation and closes only its branch", () => {
  const exp = datum("EXP-brief");
  const first = datum("TRY-first", [link("explores", exp)]), second = datum("TRY-second", [link("explores", exp)]);
  const firstObs = datum("OBS-first", [link("against", exp), link("observes", first)], {outcome: "fail", recommendation: "revise"});
  const secondObs = datum("OBS-second", [link("against", exp), link("observes", second)], {outcome: "error", recommendation: "revise"});
  const data = [exp, first, second, firstObs, secondObs];
  const stop = pkg.actions["stop-experiment"];
  expect(stop).toBeDefined();
  const subjects = () => (evaluate(data, stop!.subjects, exp) as any[]).map(d => d.identity.revision_id);
  const terminal = () => evaluate(data, (pkg.manifest.terminal as {when: unknown}).when, exp);
  expect(subjects()).toEqual([firstObs.revision_id, secondObs.revision_id]);
  expect(evaluate(data, stop!.inputs!.observation, secondObs)).toMatchObject({identity: {revision_id: secondObs.revision_id}});
  expect(terminal()).toBe(false);
  data.push(datum("FDB-first", [link("responds-to", firstObs)], {action: "stop"}));
  expect(subjects()).toEqual([secondObs.revision_id]);
  expect(terminal()).toBe(false);
  for (const action of ["correct-prototype", "revise-experiment"]) {
    expect(evaluate(data, pkg.actions[action]!.when, exp)).toBe(true);
    expect(evaluate(data, pkg.actions[action]!.inputs!.observation, exp)).toMatchObject({identity: {revision_id: secondObs.revision_id}});
  }
  data.push(datum("FDB-second", [link("responds-to", secondObs)], {action: "stop"}));
  expect(subjects()).toEqual([]);
  expect(terminal()).toBe(true);
  for (const action of ["correct-prototype", "revise-experiment"])
    expect(evaluate(data, pkg.actions[action]!.when, exp)).toBe(false);
  data.push(datum("TRY-unobserved", [link("explores", exp)]));
  expect(terminal()).toBe(false);
});

test("stop excludes superseded trials, superseded intent and non-revise observations", () => {
  const exp = datum("EXP-brief"), trial = datum("TRY-product", [link("explores", exp)]);
  const obs = datum("OBS-run", [link("against", exp), link("observes", trial)], {recommendation: "revise"});
  const stop = pkg.actions["stop-experiment"];
  expect(stop).toBeDefined();
  for (const extra of [datum(trial.id, trial.links, {}, 2), datum(exp.id, [], {}, 2)])
    expect(evaluate([exp, trial, obs, extra], stop!.subjects, exp)).toEqual([]);
  for (const recommendation of ["keep", "drop", "nominate"])
    expect(evaluate([exp, trial, {...obs, payload: {recommendation}}], stop!.subjects, exp)).toEqual([]);
});

test("stopping exploration retains formal corrections and an accepted comparison's exact history", () => {
  const exp = datum("EXP-brief"), trial = datum("TRY-product", [link("explores", exp)]);
  const obs = datum("OBS-run", [link("against", exp), link("observes", trial)], {outcome: "fail", recommendation: "revise"});
  const stop = datum("FDB-stop", [link("responds-to", obs)], {action: "stop"});
  const set = datum("RQS-formal"), fail = datum("REV-fail", [link("reviews", set)], {outcome: "fail", scope_amendment_required: false});
  const data = [exp, trial, obs, stop, set, fail];
  const terminal = (rows: DatumEnvelope[]) => evaluate(rows, (pkg.manifest.terminal as {when: unknown}).when, exp);
  expect(terminal(data)).toBe(false);
  expect(evaluate(data, pkg.actions["correct-requirements-after-review"]!.when, set)).toBe(true);
  const imp = datum("IMP-formal", [link("implements", set)], {source_commit: "accepted-source"});
  const activity = datum("VFY-formal", [link("verifies", set)]);
  imp.links.push(link("verification", activity));
  const acc = datum("ACC-formal", [link("accepts", imp), link("confirms", set)], {decision: "accept"});
  const comparison = {...exp, links: [link("compares-to", acc)]};
  const accepted = [comparison, trial, obs, stop, set, imp, activity, acc,
    datum("REV-set", [link("reviews", set)], {outcome: "pass"}),
    datum("REV-product", [link("reviews", imp)], {outcome: "pass"}),
    datum("REV-activity", [link("reviews", activity)], {outcome: "pass"}),
    datum("RES-formal", [link("executes", imp), link("evaluates", activity), link("verifies", set)], {outcome: "pass"})];
  const history = structuredClone(accepted);
  expect(terminal(accepted.filter(d => d !== stop))).toBe(false);
  expect(terminal(accepted)).toBe(true);
  expect(accepted).toEqual(history);
});
