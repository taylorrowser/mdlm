import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect, test} from 'vitest';

test('independent review recovery preserves FAIL and reaches ordinary membership correction', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mdlm-review-recovery-'));
  const lifecycle = path.join(root, 'lifecycle'), registry = path.join(root, 'registry');
  mkdirSync(registry);
  const executable = path.join(process.cwd(), 'dist/mdlm.js');
  const trace: unknown[] = [];
  const cli = (args: string[], input?: unknown, registrar = false, status = 0) => {
    const result = spawnSync(process.execPath, [executable, ...args, '--json'], {cwd: lifecycleExists ? lifecycle : root, encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input), env: {...process.env, MDLM_REVIEW_REGISTRY: registry, MDLM_REVIEW_REGISTRAR: registrar ? '1' : ''}});
    trace.push({args, input, status: result.status, stdout: result.stdout, stderr: result.stderr});
    writeFileSync(path.join(root, 'trace.json'), JSON.stringify(trace, null, 2));
    expect(result.status, result.stdout + result.stderr).toBe(status);
    return JSON.parse(result.stdout);
  };
  let lifecycleExists = false, sequence = 0;
  cli(['init', lifecycle, '--process', 'iterative']); lifecycleExists = true;
  const link = (type: string, target: string) => ({type, target});
  const candidate = (localId: string, type: string, payload: object, links: object[] = [], predecessor?: string) => ({localId, type, payload: {publication: 'recorded', ...(type === 'RQS' ? {} : {title: localId}), ...payload}, links, body: '', ...(predecessor ? {predecessor} : {})});
  const show = (id: string) => cli(['show', id]).lifecycleDatum.datum;
  const prepare = (action: string, subject: string | undefined, candidates: unknown[]) => {
    const g = cli(['expectations', 'show', action, ...(subject ? [subject] : [])]);
    const proposal = {operation: `recovery-${++sequence}`, action: g.action, package: g.package, snapshot: g.snapshot, subject: g.subject, inputs: g.inputs, candidates};
    const file = path.join(root, `${proposal.operation}.json`); writeFileSync(file, JSON.stringify(proposal));
    return {g, proposal, file};
  };
  const submit = (action: string, subject: string | undefined, candidates: unknown[]) => {
    const p = prepare(action, subject, candidates);
    if (p.g.authority) {
      const verdict = path.join(root, `${p.proposal.operation}-verdict.json`); writeFileSync(verdict, JSON.stringify({candidates}));
      expect(cli(['proposal', 'submit', p.file], undefined, false, 1).ok).toBe(false);
      cli(['review', 'register', p.file, verdict], undefined, true);
    }
    const result = cli(['proposal', 'submit', p.file]);
    expect(cli(['proposal', 'settlement', p.proposal.operation]).revisions).toEqual(result.revisions);
    expect(cli(['proposal', 'submit', p.file]).revisions).toEqual(result.revisions);
    return result.revisions.map(show);
  };
  const experiment = submit('frame-experiment', undefined, [candidate('experiment', 'EXP', {criterion: 'Report command status and count.', question: 'Can independent review redistribute bundled duties?', approach: 'Requirements-only fixture.', constraints: 'No execution or user acceptance.', allowance_minutes: 10, scope_cut: 'One decomposition.'})])[0];
  const initial = submit('draft-requirements' , undefined, [
    candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Report command status and count.'}, [link('informed-by', experiment.revision_id)]),
    candidate('bundled', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The tool', response: 'print status and count'}}),
    candidate('peer', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The tool', response: 'report invalid arguments'}}),
    candidate('group', 'DCP', {}, [link('parent', '$need'), link('child', '$bundled'), link('child', '$peer')]), candidate('set', 'RQS', {}),
  ]);
  const byTitle = (title: string) => initial.find((d: any) => d.payload.title === title);
  const need = byTitle('need'), bundled = byTitle('bundled'), peer = byTitle('peer');
  const group = initial.find((d: any) => d.type === 'DCP'), set = initial.find((d: any) => d.type === 'RQS');
  const assessments = (membership: string) => ({outcome: 'fail', findings: 'Split the bundled child duties; substantive finding remains sound.', requirement_assessments: [need, bundled, peer].map(d => ({requirement: d.revision_id, disposition: d === bundled ? 'needs-change' : 'valid', rationale: 'Independent fixture assessment.'})), decomposition_assessments: [{group: group.revision_id, disposition: 'needs-change', membership_action: membership, rationale: 'Redistribute status and count to immediate children.', children: [bundled, peer].map(d => ({requirement: d.revision_id, disposition: d === bundled ? 'needs-change' : 'valid', rationale: 'Retain peer, split bundled duty.'}))}]});
  const original = submit('review-requirements', set.revision_id, [candidate('wrong-review', 'REV', assessments('none'), [link('reviews', set.revision_id)])])[0];
  expect(cli(['review', 'context', 'correct-requirements-review', set.revision_id]).requirementGraphs.find((g: any) => g.selection === set.revision_id).assessment.correction).toEqual({requirements: [bundled.revision_id], groups: []});
  expect(cli(['expectations']).optional.some((i: any) => i.action.startsWith('correct-requirements-review@') && i.subject === set.revision_id)).toBe(true);
  const corrected = candidate('corrected-review', 'REV', {...assessments('revise-membership'), correction_reason: 'Independent reviewer acknowledges membership_action=none was mistaken.'}, [link('reviews', set.revision_id), link('supersedes', original.revision_id)]);
  const pending = prepare('correct-requirements-review', set.revision_id, [corrected]);
  const verdict = path.join(root, 'author-verdict.json'); writeFileSync(verdict, JSON.stringify({candidates: [corrected]}));
  expect(cli(['review', 'register', pending.file, verdict], undefined, false, 1).ok).toBe(false);
  const recovery = submit('correct-requirements-review', set.revision_id, [corrected])[0];
  const g = cli(['expectations', 'show', 'correct-requirements-after-review', set.revision_id]);
  expect(g.inputs.failure).toEqual([recovery.revision_id]);
  expect(cli(['review', 'context', 'correct-requirements-review', set.revision_id]).requirementGraphs.find((g: any) => g.selection === set.revision_id).assessment.correction).toEqual({requirements: [bundled.revision_id], groups: [group.revision_id]});
  const outputs = submit('correct-requirements-after-review', set.revision_id, [
    candidate('status', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The tool', response: 'print status'}}, [], bundled.revision_id),
    candidate('count', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The tool', response: 'print count'}}),
    candidate('group', 'DCP', {}, [link('parent', need.revision_id), link('child', '$status'), link('child', '$count'), link('child', peer.revision_id)], group.revision_id),
    candidate('set', 'RQS', {}, [link('corrects', recovery.revision_id)], set.revision_id),
  ]);
  const next = outputs.find((d: any) => d.type === 'RQS');
  expect(cli(['expectations', 'show', 'correct-requirements-review', set.revision_id], undefined, false, 1).ok).toBe(false);
  expect(cli(['expectations']).items.some((i: any) => i.action.startsWith('review-requirements@') && i.subject === next.revision_id)).toBe(true);
  expect(show(original.revision_id)).toEqual(original);
  expect(show(peer.revision_id)).toEqual(peer);
  expect(show(need.revision_id)).toEqual(need);
  expect(cli(['doctor']).ok).toBe(true);
  writeFileSync(path.join(root, 'proof.json'), JSON.stringify({original, recovery, next, unchanged: [need, peer], trace: path.join(root, 'trace.json')}, null, 2));
  process.stdout.write(`REVIEW_RECOVERY_EVIDENCE ${root}\n`);
}, 120_000);
