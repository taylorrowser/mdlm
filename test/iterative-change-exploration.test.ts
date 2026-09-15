import path from 'node:path';
import {beforeAll, expect, test} from 'vitest';
import {loadProcessPackage, type ProcessPackage} from '../src/index.js';
import {compileExpressionValue} from '../src/expression.js';
import {evaluateExpressionValue, type DatumEnvelope, type LifecycleSnapshot} from '../src/evaluator.js';
let pkg: ProcessPackage;
beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), '.lifecycle/iterative'));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  pkg = loaded.package;
});
const datum = (id: string, links: DatumEnvelope['links'] = [], payload = {}, revision = 1): DatumEnvelope => ({id, type: id.split('-')[0]!, revision, revision_id: `${id}-r${String(revision).padStart(5, '0')}`, links, payload, created_by: {process_ref: 'fixture@1#exact'}, body: 'Eligibility fixture'});
const link = (type: string, d: DatumEnvelope) => ({type, target: d.revision_id});
function fixture(recommendation = 'keep', feedback?: string) {
  const exp = datum('EXP-brief');
  const req = datum('REQ-need', [link('informed-by', exp)]);
  const set = datum('RQS-set', [link('contains', req)]);
  const imp = datum('IMP-product', [link('implements', set)]);
  const acc = datum('ACC-product', [link('accepts', imp), link('confirms', set)], {decision: 'accept'});
  const trial = datum('TRY-first', [link('explores', exp)]);
  const obs = datum('OBS-first', [link('observes', trial), link('against', exp)], {recommendation});
  const data = [exp, req, set, imp, acc, trial, obs,
    datum('RES-pass', [link('executes', imp), link('verifies', set)], {outcome: 'pass'}),
    datum('REV-set', [link('reviews', set)], {outcome: 'pass'}),
    datum('REV-imp', [link('reviews', imp)], {outcome: 'pass'})];
  if (feedback) data.push(datum('FDB-first', [link('responds-to', obs)], {action: feedback}));
  return {data, exp, req, set, imp, acc, trial, obs};
}
function evaluate(data: DatumEnvelope[], value: unknown, subject?: DatumEnvelope) {
  const snapshot: LifecycleSnapshot = {processRef: 'fixture@1#exact', dependencyComparisons: [], records: data.map(d => ({datum: d, storage: {editable: false, frozen: true}, integrity: {parseable: true, schema_valid: true, identity_valid: true, references_valid: true, hash_valid: true, transaction_valid: true}}))};
  const compiled = typeof value === 'string' ? compileExpressionValue(value, pkg, subject ? {subject: 'entity'} : {}) : {expression: value, diagnostics: []};
  expect(compiled.diagnostics).toEqual([]);
  return evaluateExpressionValue(pkg, snapshot, compiled.expression, subject ? {subject: subject.revision_id} : {});
}
const terminal = (data: DatumEnvelope[]) => evaluate(data, (pkg.manifest.terminal as {when: unknown}).when);
for (const [recommendation, feedback, closed] of [['keep', undefined, true], ['drop', undefined, true], ['nominate', 'stop', true], ['nominate', undefined, false], ['nominate', 'revise-criteria', false], ['revise', undefined, false]] as const) {
  test(`explore-change respects ${recommendation}/${feedback ?? 'no feedback'}`, () => {
    const f = fixture(recommendation, feedback);
    expect(evaluate(f.data, pkg.actions['explore-change']!.when, f.imp)).toBe(closed);
    expect(terminal(f.data)).toBe(true); // Initial exploration stays outside formal scope.
    const compared = {...f.exp, links: [link('compares-to', f.acc)]};
    expect(terminal(f.data.map(d => d === f.exp ? compared : d))).toBe(closed);
  });
}
test('new comparison requires accepted current scope and a completed trial', () => {
  const f = fixture();
  expect(evaluate(f.data.filter(d => d !== f.obs), pkg.actions['explore-change']!.when, f.imp)).toBe(false);
  expect(evaluate(f.data.filter(d => d !== f.acc), pkg.actions['explore-change']!.when, f.imp)).toBe(false);
});
test('comparison criteria revision retains baseline and removes old trials and feedback from current work', () => {
  const f = fixture();
  const next = datum(f.exp.id, [link('compares-to', f.acc)], {}, 2);
  f.data.push(next);
  expect(terminal(f.data)).toBe(false);
  expect(evaluate(f.data, pkg.actions['prepare-prototype']!.when, next)).toBe(true);
  const trial = datum('TRY-candidate', [link('explores', next)]);
  const obs = datum('OBS-candidate', [link('observes', trial), link('against', next)], {recommendation: 'nominate'});
  const feedback = datum('FDB-candidate', [link('responds-to', obs)], {action: 'revise-criteria'});
  f.data.push(trial, obs, feedback);
  const action = pkg.actions['revise-experiment-from-feedback']!;
  expect(evaluate(f.data, action.when, feedback)).toBe(true);
  const baseline = evaluate(f.data, action.inputs!.baseline, feedback) as any[];
  expect(baseline.map(d => d.identity.revision_id)).toEqual([f.acc.revision_id]);
  expect(action.links?.EXP?.['compares-to']).toBe('baseline');
  const revised = datum(next.id, [link('compares-to', f.acc), link('responds-to', feedback)], {}, 3);
  f.data.push(revised);
  expect(evaluate(f.data, 'none("current-trials@2", {})')).toBe(true);
  expect(evaluate(f.data, 'none("criteria-feedback@1", {})')).toBe(true);
  expect(f.req.links).toEqual([link('informed-by', f.exp)]);
  const second = datum('TRY-second', [link('explores', revised)]);
  f.data.push(second, datum('OBS-second', [link('observes', second), link('against', revised)], {recommendation: 'drop'}));
  expect(terminal(f.data)).toBe(true);
});
