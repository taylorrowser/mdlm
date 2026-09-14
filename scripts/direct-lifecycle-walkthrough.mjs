import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const image = 'python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureAuthority = 'Operator-selected engineering fixture. Stakeholder decisions are scripted fixture inputs, not acceptance by the actual product user. Review registration exercises a separate manager transport and exact verdict binding; it does not claim human or model review independence.';

/** Ordinary public operations only. Preserve both repositories and external evidence on every outcome. */
export async function runDirectJourney({process: processName = 'tiny', executable = process.env.MDLM_DIRECT_EXECUTABLE ?? process.env.MDLM_EXECUTABLE, root}) {
  assert.ok(['tiny', 'exploratory'].includes(processName));
  assert.ok(path.isAbsolute(root), 'A fresh absolute root is required');
  assert.ok(executable && path.isAbsolute(executable), 'An exact absolute executable is required');
  assert.ok(!existsSync(root), 'Never replay a journey in an existing directory');
  const evidenceRoot = `${root}-evidence`;
  assert.ok(!existsSync(evidenceRoot), 'Evidence destination must be fresh');
  mkdirSync(evidenceRoot, {recursive: true});
  mkdirSync(root, {recursive: true});
  const lifecycle = path.join(root, 'lifecycle'), source = path.join(root, 'product');
  const registry = path.join(evidenceRoot, 'review-registry');
  mkdirSync(registry);
  const commands = [], publications = [], revisions = [], receipts = [], sourceCommits = [];
  const evidenceFile = path.join(evidenceRoot, 'result.json');
  let stage = 'preflight', terminal, caught;
  const save = (name, value) => writeFileSync(path.join(evidenceRoot, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx'});
  save('authority.json', {scope: fixtureAuthority, author: 'fixture-author', reviewer: 'fixture-reviewer', registrar: 'fixture-manager', stakeholder: 'engineering-fixture'});
  save('executable.json', {executable, sha256: digest(readFileSync(executable)), process: processName});
  function run(file, args, cwd = lifecycle, {input, env, expected = 0} = {}) {
    const index = commands.length + 1, prefix = String(index).padStart(4, '0');
    const record = {index, stage, file, args, cwd, input: input ?? null, environment: {MDLM_REVIEW_REGISTRY: registry, ...(env ?? {})}, startedAt: new Date().toISOString()};
    save(`${prefix}-request.json`, record);
    const result = spawnSync(file, args, {cwd, input, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, env: {...process.env, MDLM_REVIEW_REGISTRY: registry, MDLM_REVIEW_REGISTRAR: '', ...(env ?? {})}});
    Object.assign(record, {finishedAt: new Date().toISOString(), status: result.status, signal: result.signal, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message});
    save(`${prefix}-result.json`, record);
    commands.push(record);
    if (result.error) throw result.error;
    if (expected !== null) assert.equal(result.status, expected, `${file} ${args.join(' ')}\n${record.stdout}\n${record.stderr}`);
    return record;
  }
  const git = (args, cwd = lifecycle) => run('git', args, cwd).stdout.trim();
  function cli(args, value, options = {}) {
    const argv = executable.endsWith('.js') ? [process.execPath, [executable, ...args, '--json']] : [executable, [...args, '--json']];
    const result = run(argv[0], argv[1], options.cwd ?? lifecycle, {...options, input: value === undefined ? undefined : `${JSON.stringify(value)}\n`});
    return JSON.parse(result.stdout);
  }
  function commit(cwd, message) {
    git(['add', '.'], cwd);
    git(['-c', 'commit.gpgSign=false', 'commit', '--quiet', '--no-verify', '--allow-empty', '-m', message], cwd);
  }
  function data() { return cli(['list']).data.map(item => item.lifecycleDatum?.datum ?? item.datum ?? item); }
  function guidance(action, subject) {
    const before = git(['status', '--porcelain']);
    const result = cli(['expectations', 'show', `${action}@1`, ...(subject ? [subject] : [])]);
    assert.equal(git(['status', '--porcelain']), before, 'Guidance must be read-only');
    return result;
  }
  const candidate = (localId, type, payload, links = [], predecessor) => ({localId, type, ...(predecessor ? {predecessor} : {}), payload: {publication: 'recorded', ...(type === 'RQS' ? {} : {title: type === 'RES' ? 'Verification result' : localId}), ...payload}, links, body: `Engineering fixture: ${localId}. ${fixtureAuthority}`});
  const link = (type, target) => ({type, target});
  let sequence = 0;
  function submit(action, subject, candidates, evidence = {}) {
    stage = action;
    cli(['expectations']);
    const g = guidance(action, subject);
    const operation = `fixture-${processName}-${++sequence}-${action}`;
    const proposal = {operation, action: g.action, package: g.package, snapshot: g.snapshot, ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates, ...(Object.keys(evidence).length ? {evidence} : {})};
    if (g.authority?.kind === 'stakeholder') proposal.evidence = {...evidence, authority: [g.authority.name]};
    const proposalFile = path.join(evidenceRoot, `${operation}-proposal.json`);
    save(path.basename(proposalFile), proposal);
    if (g.authority?.kind === 'independent-review') {
      const context = cli(['review', 'context', g.action, g.subject]);
      save(`${operation}-review-context.json`, context);
      const verdictFile = path.join(evidenceRoot, `${operation}-reviewer-verdict.json`);
      save(path.basename(verdictFile), {candidates});
      const rejected = cli(['proposal', 'submit', proposalFile], undefined, {expected: 1});
      assert.equal(rejected.ok, false, 'Unregistered reviewer publication must fail');
      cli(['review', 'register', proposalFile, verdictFile], undefined, {env: {MDLM_REVIEW_REGISTRAR: '1'}});
    }
    const authorityArgs = g.authority?.kind === 'stakeholder' ? ['--authority', g.authority.name] : [];
    if (action === 'observe-prototype' && receipts.length > 1) {
      const before = data();
      assert.equal(cli(['proposal', 'submit', '-'], {...proposal, operation: 'mismatched-receipt', evidence: {receipt: receipts[0].evidence}}, {expected: 1}).ok, false);
      assert.deepEqual(data(), before, 'Mismatched evidence cannot publish data');
    }
    const result = cli(['proposal', 'submit', proposalFile, ...authorityArgs]);
    assert.equal(result.outcome, 'accepted');
    const settled = cli(['proposal', 'settlement', operation]);
    assert.equal(settled.outcome, 'accepted');
    assert.deepEqual(settled.revisions, result.revisions);
    const repeated = cli(['proposal', 'submit', proposalFile, ...authorityArgs]);
    assert.deepEqual(repeated.revisions, result.revisions, 'Completed proposal recovery must not duplicate records');
    if (sequence === 1) {
      const stale = cli(['proposal', 'submit', '-'], {...proposal, operation: 'stale-snapshot'}, {expected: 1});
      assert.equal(stale.ok, false);
    }
    publications.push({operation, action: g.action, transaction: result.transaction, revisions: result.revisions});
    revisions.push(...result.revisions);
    const records = data().filter(d => result.revisions.includes(d.revision_id));
    save(`${operation}-published.json`, records);
    commit(lifecycle, `Record ${action}`);
    return records;
  }
  function execute(implementation, expected) {
    stage = 'execution';
    const operation = `execute-${processName}-${receipts.length + 1}`;
    cli(['execution', 'run', implementation.revision_id, operation]);
    const settled = cli(['execution', 'settlement', operation]);
    const repeated = cli(['execution', 'settlement', operation]);
    assert.deepEqual(repeated.value, settled.value);
    assert.equal(settled.value.receipt.result.outcome, expected);
    assert.equal(settled.value.receipt.binding.assignment, undefined);
    assert.equal(settled.value.receipt.result.sourceCommit, implementation.payload.source_commit);
    receipts.push(settled.value);
    return settled.value.evidence;
  }
  function sourceVersion(leaf, extra, failure = false) {
    const runtime = `import sys\nprint(len(sys.argv) - 1)\n`;
    const verification = `import subprocess\nassert subprocess.check_output(['python3', 'count.py', 'red', 'blue'], text=True).strip() == '${failure ? '3' : '2'}'\n`;
    const region = (name, relation, target, code) => target ? `# mdlm:begin ${name} ${relation} ${target}\n${code}# mdlm:end ${name}\n` : code;
    writeFileSync(path.join(source, 'count.py'), region('count', 'implements', leaf, runtime) + (extra ? region('label', 'implements', extra, "print('items')\n") : ''));
    // The baseline checks the count independently of its separate label behavior.
    const checks = extra ? verification.replace('.strip()', '.splitlines()[0]') : verification;
    writeFileSync(path.join(source, 'verify.py'), region('checks', 'verifies', leaf, checks) + (extra ? region('label-check', 'verifies', extra, "assert subprocess.check_output(['python3', 'count.py'], text=True).splitlines()[1] == 'items'\n") : ''));
    commit(source, 'Record exact product and executable expectations');
    const sourceCommit = git(['rev-parse', 'HEAD'], source);
    sourceCommits.push(sourceCommit);
    return {repository_path: source, source_commit: sourceCommit, command: ['python3', 'count.py', 'red', 'blue'], verification_image: image, verification_command: ['python3', 'verify.py'], verification_script: 'verify.py'};
  }
  function reviewRequirements(set) {
    const all = data(), reqs = set.links.filter(l => l.type === 'contains').map(l => all.find(d => d.revision_id === l.target));
    const groups = set.links.filter(l => l.type === 'decomposition').map(l => all.find(d => d.revision_id === l.target));
    submit('review-requirements', set.revision_id, [candidate('requirements-review', 'REV', {
      outcome: 'pass', findings: 'The selected software behaviors jointly satisfy the fixture stakeholder statement; retirement removes the label and preserves counting.',
      requirement_assessments: reqs.map(d => ({requirement: d.revision_id, disposition: 'valid', rationale: 'Necessary within the selected stakeholder scope.'})),
      decomposition_assessments: groups.map(d => ({group: d.revision_id, disposition: 'adequate', membership_action: 'none', rationale: 'The immediate children cover the parent without an unused behavior.', children: d.links.filter(l => l.type === 'child').map(l => ({requirement: l.target, disposition: 'valid', rationale: 'This child contributes a selected behavior.'}))})),
    }, [link('reviews', set.revision_id)])]);
  }
  function finishProduct(set, implementation) {
    const receipt = execute(implementation, 'pass');
    const result = submit('execute-verification', implementation.revision_id, [candidate('verification', 'RES', {assessment: 'The committed Python assertions passed in the pinned container.', correction_target: 'none'}, [link('executes', implementation.revision_id), link('verifies', set.revision_id)])], {receipt}).find(d => d.type === 'RES');
    const scopes = data().filter(d => d.type === 'SCP' && d.links.some(l => l.type === 'belongs-to' && l.target === implementation.revision_id));
    submit('review-implementation', implementation.revision_id, [candidate('implementation-review', 'REV', {outcome: 'pass', findings: 'The committed counting program and independent subprocess assertions support the selected requirements. The receipt binds this exact source.', source_assessments: scopes.map(d => ({source_scope: d.revision_id, disposition: 'valid', rationale: 'This source region implements or verifies its linked software behavior.'}))}, [link('reviews', implementation.revision_id), link('uses-evidence', result.revision_id)])]);
    return submit('accept-product', implementation.revision_id, [candidate('fixture-acceptance', 'ACC', {decision: 'accept', rationale: fixtureAuthority}, [link('accepts', implementation.revision_id), link('uses-evidence', result.revision_id), link('confirms', set.revision_id)])]).find(d => d.type === 'ACC');
  }
  try {
    run('docker', ['version', '--format', '{{.Server.Version}}'], root);
    mkdirSync(source);
    git(['init', '--quiet'], source);
    git(['config', 'user.name', 'Direct lifecycle fixture'], source);
    git(['config', 'user.email', 'fixture@localhost'], source);
    cli(['init', lifecycle, '--process', processName], undefined, {cwd: root});
    git(['config', 'user.name', 'Direct lifecycle fixture']);
    git(['config', 'user.email', 'fixture@localhost']);
    if (processName === 'tiny') {
      const initial = submit('draft-requirements', undefined, [
        candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Count supplied command-line items and print an items label.'}),
        candidate('count', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The CLI', response: 'print the number of supplied command-line items on the first line'}}),
        candidate('label', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The CLI', response: 'print items on the second line'}}),
        candidate('decomposition', 'DCP', {}, [link('parent', '$need'), link('child', '$count'), link('child', '$label')]),
        candidate('requirements', 'RQS', {}),
      ]);
      const byTitle = title => initial.find(d => d.payload.title === title);
      const need = byTitle('need'), count = byTitle('count'), label = byTitle('label'), group = initial.find(d => d.type === 'DCP');
      const set = initial.find(d => d.type === 'RQS');
      reviewRequirements(set);
      const firstSource = sourceVersion(count.id, label.id);
      const imp = submit('implement-product', set.revision_id, [candidate('implementation', 'IMP', {...firstSource, file_roles: {'count.py': 'production', 'verify.py': 'verification'}}, [link('implements', set.revision_id)])]).find(d => d.type === 'IMP');
      const acceptance = finishProduct(set, imp);
      assert.equal(cli(['expectations']).outcome, 'lifecycle-complete');
      const change = submit('request-change', set.revision_id, [candidate('remove-label', 'CHG', {reason: 'The fixture stakeholder now wants only the count; the label adds unused output.', requested_outcome: 'Print only the item count. Retire the label requirement and remove its code and verification.'}, [link('baseline', acceptance.revision_id), link('changes', need.revision_id), link('changes', label.revision_id)])]).find(d => d.type === 'CHG');
      submit('approve-change', change.revision_id, [candidate('scope-approval', 'REV', {outcome: 'pass', findings: `Approve only label retirement and the corresponding stakeholder statement and decomposition. ${fixtureAuthority}`}, [link('reviews', change.revision_id)])]);
      const revised = submit('revise-requirements', change.revision_id, [
        candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Count supplied command-line items.'}, [], need.revision_id),
        candidate('decomposition', 'DCP', {}, [link('parent', '$need'), link('child', count.revision_id)], group.revision_id),
        candidate('requirements', 'RQS', {}, [link('retires', label.revision_id)], set.revision_id),
      ]);
      const nextSet = revised.find(d => d.type === 'RQS');
      reviewRequirements(nextSet);
      const secondSource = sourceVersion(count.id);
      const nextImp = submit('rebind-product', nextSet.revision_id, [candidate('implementation', 'IMP', {...secondSource, file_roles: {'count.py': 'production', 'verify.py': 'verification'}, impact_dispositions: []}, [link('implements', nextSet.revision_id)], imp.revision_id)]).find(d => d.type === 'IMP');
      finishProduct(nextSet, nextImp);
      assert.deepEqual(data().find(d => d.revision_id === label.revision_id), label, 'Retirement preserves the historical requirement');
    } else {
      const experiment = submit('frame-experiment', undefined, [candidate('count-experiment', 'EXP', {criterion: 'Count command-line arguments.', question: 'Can a small program and executable evidence survive nomination and feedback revision?', approach: 'Use a Python counter and subprocess assertion.', constraints: 'CLI only; no persistence or user acceptance claim.', allowance_minutes: 10, scope_cut: 'One count operation.'})]).find(d => d.type === 'EXP');
      const prototype = submit('prepare-prototype', experiment.revision_id, [candidate('counter-prototype', 'TRY', sourceVersion(), [link('explores', experiment.revision_id)])]).find(d => d.type === 'TRY');
      const observe = (trial, receipt, recommendation) => submit('observe-prototype', trial.revision_id, [candidate('counter-observation', 'OBS', {assessment: recommendation === 'nominate' ? 'The scripted counter passed its assertion; nominate for fixture feedback.' : 'The revised assertion intentionally expected three for two arguments and failed. Preserve the failure and stop.', observation_origin: 'scripted', interaction_observation: 'A subprocess invoked the counter; no interactive user session.', limitations: fixtureAuthority, recommendation, next_action: recommendation === 'nominate' ? 'Request explicit fixture stakeholder feedback.' : 'Drop this intentionally failing experiment.'}, [link('observes', trial.revision_id), link('against', experiment.revision_id)])], {receipt}).find(d => d.type === 'OBS');
      const nomination = observe(prototype, execute(prototype, 'pass'), 'nominate');
      const feedback = submit('record-feedback', nomination.revision_id, [candidate('fixture-feedback', 'FDB', {action: 'revise-prototype', feedback: 'Exercise a captured assertion failure in a revised trial, then stop this fixture.', source: fixtureAuthority}, [link('responds-to', nomination.revision_id)])]).find(d => d.type === 'FDB');
      const revised = submit('revise-prototype', feedback.revision_id, [candidate('counter-prototype', 'TRY', sourceVersion(undefined, undefined, true), [link('explores', experiment.revision_id), link('responds-to', feedback.revision_id)], prototype.revision_id)]).find(d => d.type === 'TRY');
      observe(revised, execute(revised, 'fail'), 'drop');
      assert.deepEqual(data().find(d => d.revision_id === prototype.revision_id), prototype, 'Revision preserves the original prototype');
    }
    stage = 'closure';
    terminal = cli(['expectations']);
    assert.equal(terminal.outcome, processName === 'tiny' ? 'lifecycle-complete' : 'profile-boundary-reached');
    cli(['doctor']);
  } catch (error) { caught = error; }
  finally {
    stage = 'capture-final-state';
    const capture = (file, args, cwd) => {
      try { return run(file, args, cwd, {expected: null}); } catch (error) { return {error: String(error)}; }
    };
    const gitState = Object.fromEntries([['lifecycle', lifecycle], ['source', source]].map(([name, cwd]) => [name, existsSync(cwd) ? {head: capture('git', ['rev-parse', 'HEAD'], cwd), tree: capture('git', ['rev-parse', 'HEAD^{tree}'], cwd), status: capture('git', ['status', '--porcelain'], cwd), refs: capture('git', ['for-each-ref', '--format=%(refname) %(objectname)'], cwd)} : null]));
    let lifecycleData;
    if (existsSync(lifecycle)) { try { lifecycleData = data(); } catch (error) { lifecycleData = {error: String(error)}; } }
    save('lifecycle-data.json', lifecycleData ?? []);
    const result = {ok: !caught, outcome: terminal?.outcome ?? 'failed', process: processName, root, lifecycle, source, evidenceFile, publications, revisions, receipts, sourceCommits, commands, terminal, gitState, scope: fixtureAuthority, error: caught ? {message: caught.message, stack: caught.stack} : undefined};
    save('result.json', result);
    if (caught) { caught.message += `\nPreserved journey evidence: ${evidenceFile}`; throw caught; }
    return result;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const executable = option('--executable') ?? process.env.MDLM_DIRECT_EXECUTABLE ?? process.env.MDLM_EXECUTABLE;
  runDirectJourney({process: option('--process') ?? 'tiny', executable, root: option('--root')}).then(result => console.log(JSON.stringify({ok: result.ok, outcome: result.outcome, publications: result.publications, receipts: result.receipts, commands: result.commands, evidenceFile: result.evidenceFile}))).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
