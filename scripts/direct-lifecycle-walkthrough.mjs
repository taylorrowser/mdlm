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
export async function runDirectJourney({process: processName = 'tiny', corrections = false, partialAcceptance = false, executable = process.env.MDLM_DIRECT_EXECUTABLE ?? process.env.MDLM_EXECUTABLE, root}) {
  assert.ok(['tiny', 'exploratory', 'iterative'].includes(processName));
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
  function exact(revision) { return cli(['show', revision]).lifecycleDatum.datum; }
  function guidance(action, subject) {
    const before = git(['status', '--porcelain']);
    const reference = processName === 'iterative' && ['review-requirements', 'rebind-product'].includes(action) ? `${action}@2` : `${action}@1`;
    const result = cli(['expectations', 'show', reference, ...(subject ? [subject] : [])]);
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
      assert.deepEqual(context.payloadSchemas, g.payloadSchemas, 'Review and guidance must advertise the same authorable output schemas');
      assert.deepEqual(context.sourceAssessmentTargets, g.sourceAssessmentTargets, 'Review and guidance must identify the same exact assessment targets');
      const verdictFile = path.join(evidenceRoot, `${operation}-reviewer-verdict.json`);
      save(path.basename(verdictFile), {candidates});
      const rejected = cli(['proposal', 'submit', proposalFile], undefined, {expected: 1});
      assert.equal(rejected.ok, false, 'Unregistered reviewer publication must fail');
      cli(['review', 'register', proposalFile, verdictFile], undefined, {env: {MDLM_REVIEW_REGISTRAR: '1'}});
    }
    const authorityArgs = g.authority?.kind === 'stakeholder' ? ['--authority', g.authority.name] : [];
    if (action === 'accept-product') {
      const before = cli(['expectations']);
      const conflicting = {...candidates[0], localId: 'conflicting-decision', payload: {...candidates[0].payload, decision: candidates[0].payload.decision === 'accept' ? 'reject' : 'accept'}};
      const rejected = cli(['proposal', 'submit', '-', ...authorityArgs], {...proposal, operation: `${operation}-multiple`, candidates: [...candidates, conflicting]}, {expected: 1});
      assert.equal(rejected.ok, false, 'One stakeholder operation cannot publish conflicting acceptance decisions');
      assert.equal(cli(['expectations']).snapshot, before.snapshot, 'Rejected batch cannot change lifecycle history');
      assert.equal(cli(['proposal', 'settlement', `${operation}-multiple`]).outcome, 'not-published');
    }
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
  function sourceVersion(leaf, extra, failure = false, {zeroBug = false, quoted, zeroCheck = false} = {}) {
    const runtime = `import sys\nprint(${zeroBug ? '(len(sys.argv) - 1) or 1' : 'len(sys.argv) - 1'})\n`;
    const verification = `import subprocess\nassert subprocess.check_output(['python3', 'count.py', 'red', 'blue'], text=True).strip() == '${failure ? '3' : '2'}'\n`;
    const region = (name, relation, target, code) => target ? `# mdlm:begin ${name} ${relation} ${target}\n${code}# mdlm:end ${name}\n` : code;
    writeFileSync(path.join(source, 'count.py'), region('count', 'implements', leaf, runtime) + (extra ? region('label', 'implements', extra, "print('items')\n") : ''));
    // The baseline checks the count independently of its separate label behavior.
    const checks = (extra ? verification.replace('.strip()', '.splitlines()[0]') : verification)
      + (quoted === undefined ? '' : `assert subprocess.check_output(['python3', 'count.py', 'red blue'], text=True).strip() == '${quoted}'\n`)
      + (zeroCheck ? `assert subprocess.check_output(['python3', 'count.py'], text=True).strip() == '0'\n` : '');
    writeFileSync(path.join(source, 'verify.py'), region('checks', 'verifies', leaf, checks) + (extra ? region('label-check', 'verifies', extra, "assert subprocess.check_output(['python3', 'count.py'], text=True).splitlines()[1] == 'items'\n") : ''));
    commit(source, 'Record exact product and executable expectations');
    const sourceCommit = git(['rev-parse', 'HEAD'], source);
    sourceCommits.push(sourceCommit);
    return {repository_path: source, source_commit: sourceCommit, command: ['python3', 'count.py', 'red', 'blue'], verification_image: image, verification_command: ['python3', 'verify.py'], verification_script: 'verify.py'};
  }
  function reviewRequirements(set, {failRequirement, findings} = {}) {
    const context = cli(['review', 'context', processName === 'iterative' ? 'review-requirements@2' : 'review-requirements@1', set.revision_id]);
    const graph = context.requirementGraphs.find(g => g.selection === set.revision_id);
    assert.ok(graph?.assessment, 'Review context must expose its exact required assessments');
    const assessment = graph.assessment;
    const reqs = graph.requirements.filter(d => assessment.requirements.includes(d.revision_id));
    const groups = graph.groups.filter(d => assessment.groups.some(g => g.revision === d.revision_id));
    const records = submit('review-requirements', set.revision_id, [candidate('requirements-review', 'REV', {
      outcome: failRequirement ? 'fail' : 'pass', findings: findings ?? 'The selected software behaviors jointly satisfy the fixture stakeholder statement; retirement removes the label and preserves counting.',
      requirement_assessments: reqs.map(d => ({requirement: d.revision_id, disposition: d.revision_id === failRequirement ? 'needs-change' : 'valid', rationale: d.revision_id === failRequirement ? findings : 'Necessary within the selected stakeholder scope.'})),
      decomposition_assessments: groups.map(d => ({group: d.revision_id, disposition: d.links.some(l => l.target === failRequirement) ? 'needs-change' : 'adequate', membership_action: 'none', rationale: failRequirement ? findings : 'The immediate children cover the parent without an unused behavior.', children: d.links.filter(l => l.type === 'child').map(l => ({requirement: l.target, disposition: l.target === failRequirement ? 'needs-change' : 'valid', rationale: l.target === failRequirement ? findings : 'This child contributes a selected behavior.'}))})),
    }, [link('reviews', set.revision_id)])]);
    return {...assessment, review: records.find(d => d.type === 'REV')};
  }
  function finishProduct(set, implementation, {decision = 'accept', rationale = fixtureAuthority, checkZero = false} = {}) {
    const receipt = execute(implementation, 'pass');
    const result = submit('execute-verification', implementation.revision_id, [candidate('verification', 'RES', {assessment: 'The committed Python assertions passed in the pinned container.', correction_target: 'none'}, [link('executes', implementation.revision_id), link('verifies', set.revision_id)])], {receipt}).find(d => d.type === 'RES');
    const reviewContext = cli(['review', 'context', 'review-implementation@1', implementation.revision_id]);
    if (implementation.payload.acceptance_scope === 'partial') {
      const sourceContext = reviewContext.sources.find(s => s.implementation === implementation.revision_id);
      assert.equal(sourceContext.acceptanceScope, 'partial');
      assert.ok(sourceContext.files.some(f => f.path === 'cli.py' && f.formal === false && f.content.includes('input(')));
    }
    const assessment = reviewContext.requirementGraphs.find(g => g.selection === set.revision_id)?.assessment;
    if (assessment?.change) assert.deepEqual(reviewContext.sourceAssessmentTargets?.sourceScopes, assessment.sourceScopes, 'Changed review must identify affected baseline revisions');
    const scopes = assessment?.change ? data().filter(d => assessment.sourceScopes.includes(d.revision_id)) : data().filter(d => d.type === 'SCP' && d.links.some(l => l.type === 'belongs-to' && l.target === implementation.revision_id));
    submit('review-implementation', implementation.revision_id, [candidate('implementation-review', 'REV', {outcome: 'pass', findings: 'The committed counting program and independent subprocess assertions support the selected requirements. The receipt binds this exact source.', source_assessments: scopes.map(d => ({source_scope: d.revision_id, disposition: 'valid', rationale: 'This source region implements or verifies its linked software behavior.'}))}, [link('reviews', implementation.revision_id), link('uses-evidence', result.revision_id)])]);
    if (checkZero) {
      const observed = run('python3', ['count.py'], source);
      assert.equal(observed.stdout.trim(), decision === 'reject' ? '1' : '0', 'Record actual zero-input behavior before the fixture stakeholder decision');
    }
    return submit('accept-product', implementation.revision_id, [candidate('fixture-acceptance', 'ACC', {decision, rationale}, [link('accepts', implementation.revision_id), link('uses-evidence', result.revision_id), link('confirms', set.revision_id)])]).find(d => d.type === 'ACC');
  }
  try {
    run('docker', ['version', '--format', '{{.Server.Version}}'], root);
    mkdirSync(source);
    git(['init', '--quiet'], source);
    git(['config', 'user.name', 'Direct lifecycle fixture'], source);
    git(['config', 'user.email', 'fixture@localhost'], source);
    cli(['init', lifecycle, ...(processName !== 'tiny' ? ['--process', processName] : [])], undefined, {cwd: root});
    git(['config', 'user.name', 'Direct lifecycle fixture']);
    git(['config', 'user.email', 'fixture@localhost']);
    if (partialAcceptance) {
      assert.equal(processName, 'iterative');
      submit('frame-experiment', undefined, [candidate('river', 'EXP', {criterion: 'Keep River scores through a useful CLI.', question: 'Can scoring be accepted while the CLI remains provisional in this repository?', approach: 'Accept a pure scorer, operate the provisional CLI, then formalize the CLI.', constraints: 'Session only, user formula retained.', allowance_minutes: 15, scope_cut: 'One scored hand.'})]);
      const initial = submit('draft-requirements', undefined, [
        candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Calculate River hand scores using the agreed bid and tricks formula.'}),
        candidate('score', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The scorer', response: 'return bid * 10 + 10 for an exact bid, otherwise abs(bid - taken) * -10'}}),
        candidate('decomposition', 'DCP', {}, [link('parent', '$need'), link('child', '$score')]),
        candidate('requirements', 'RQS', {}),
      ]);
      const need = initial.find(d => d.payload.title === 'need'), score = initial.find(d => d.payload.title === 'score');
      const group = initial.find(d => d.type === 'DCP'), set = initial.find(d => d.type === 'RQS');
      reviewRequirements(set);
      const region = (name, relation, target, code) => `# mdlm:begin ${name} ${relation} ${target}\n${code}# mdlm:end ${name}\n`;
      const scoring = 'def score(bid, taken):\n    return bid * 10 + 10 if bid == taken else abs(bid - taken) * -10\n';
      const checks = 'from scoring import score\nassert score(0, 0) == 10\nassert score(2, 2) == 30\nassert score(1, 3) == -20\n';
      const cliCode = 'from scoring import score\nprint(score(int(input("Bid: ")), int(input("Taken: "))))\n';
      writeFileSync(path.join(source, 'scoring.py'), region('score', 'implements', score.id, scoring));
      writeFileSync(path.join(source, 'verify.py'), region('score-checks', 'verifies', score.id, checks));
      writeFileSync(path.join(source, 'cli.py'), cliCode);
      commit(source, 'Working scorer and provisional CLI in one source repository');
      const sourceCommit = git(['rev-parse', 'HEAD'], source); sourceCommits.push(sourceCommit);
      const payload = {repository_path: source, source_commit: sourceCommit, command: ['python3', 'cli.py'], verification_image: image, verification_command: ['python3', 'verify.py'], verification_script: 'verify.py', file_roles: {'scoring.py': 'production', 'verify.py': 'verification', 'cli.py': 'production'}};
      const g = guidance('implement-product', set.revision_id);
      const rejected = cli(['proposal', 'submit', '-'], {operation: 'partial-as-whole', action: g.action, package: g.package, snapshot: g.snapshot, subject: g.subject, inputs: g.inputs, candidates: [candidate('whole', 'IMP', payload, [link('implements', set.revision_id)])]}, {expected: 1});
      assert.equal(rejected.ok, false, 'Whole-product claim cannot leave the provisional CLI untraced');
      const imp = submit('implement-product', set.revision_id, [candidate('partial', 'IMP', {...payload, acceptance_scope: 'partial', formal_files: ['scoring.py', 'verify.py']}, [link('implements', set.revision_id)])]).find(d => d.type === 'IMP');
      assert.deepEqual(imp.payload.source_inventory.map(f => [f.path, f.formal]), [['cli.py', false], ['scoring.py', true], ['verify.py', true]]);
      assert.ok(!data().some(d => d.type === 'SCP' && d.payload.path === 'cli.py'));
      assert.equal(run('python3', ['-B', 'cli.py'], source, {input: '2\n2\n'}).stdout, 'Bid: Taken: 30\n');
      assert.equal(cli(['trace', 'why', 'cli.py:1', '--implementation', imp.revision_id]).requirementTrace.lineStatus, 'provisional');
      const acceptance = finishProduct(set, imp, {rationale: `Accept only the scoring module and verifier at this commit. CLI behavior remains provisional. ${fixtureAuthority}`});
      // Exact acceptance is readable even when the corresponding review action has closed.
      assert.equal(exact(acceptance.revision_id).links.find(l => l.type === 'accepts').target, imp.revision_id);
      assert.deepEqual(receipts.at(-1).receipt.binding.formalFiles, ['scoring.py', 'verify.py']);
      assert.equal(cli(['expectations']).outcome, 'profile-boundary-reached');
      writeFileSync(path.join(source, 'cli.py'), cliCode.replace('Bid: ', 'Your bid: '));
      commit(source, 'Try a provisional prompt change without claiming renewed acceptance');
      sourceCommits.push(git(['rev-parse', 'HEAD'], source));
      assert.equal(run('python3', ['-B', 'cli.py'], source, {input: '1\n3\n'}).stdout, 'Your bid: Taken: -20\n');
      assert.equal(exact(imp.revision_id).payload.source_commit, sourceCommit, 'The old acceptance stays attached to its old commit');
      const change = submit('request-change', set.revision_id, [candidate('formalize-cli', 'CHG', {reason: 'The provisional command is useful; retain its minimum input and output behavior.', requested_outcome: 'Accept scoring through the CLI in the whole repository.'}, [link('baseline', acceptance.revision_id), link('changes', need.revision_id)])]).find(d => d.type === 'CHG');
      submit('approve-change', change.revision_id, [candidate('approval', 'REV', {outcome: 'pass', findings: `Approve minimal input/output scope while retaining the scoring formula. ${fixtureAuthority}`}, [link('reviews', change.revision_id)])]);
      const revised = submit('revise-requirements', change.revision_id, [
        candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Enter a bid and tricks taken at a CLI and receive the agreed River score.'}, [], need.revision_id),
        candidate('interaction', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The CLI', response: 'ask for integer bid and tricks taken and print the score returned by the scorer'}}),
        candidate('decomposition', 'DCP', {}, [link('parent', '$need'), link('child', score.revision_id), link('child', '$interaction')], group.revision_id),
        candidate('requirements', 'RQS', {}, [], set.revision_id),
      ]);
      const nextSet = revised.find(d => d.type === 'RQS'), interaction = revised.find(d => d.payload.title === 'interaction');
      const assessment = reviewRequirements(nextSet);
      writeFileSync(path.join(source, 'cli.py'), region('interaction', 'implements', interaction.id, cliCode));
      writeFileSync(path.join(source, 'verify.py'), region('score-checks', 'verifies', score.id, checks) + region('interaction-check', 'verifies', interaction.id, 'import subprocess\nassert subprocess.check_output(["python3", "cli.py"], input="2\n2\n", text=True).endswith("30\n")\n'.replace('input="2\n2\n"', 'input="2\\n2\\n"').replace('endswith("30\n")', 'endswith("30\\n")')));
      // Equivalent scorer refactor must still acquire fresh implementation evidence.
      writeFileSync(path.join(source, 'scoring.py'), region('score', 'implements', score.id, scoring.replace('bid * 10 + 10', '(bid + 1) * 10')));
      commit(source, 'Formalize the complete useful product with fresh source evidence');
      const wholeCommit = git(['rev-parse', 'HEAD'], source); sourceCommits.push(wholeCommit);
      const dispositions = assessment.sourceScopes.map(source_scope => ({source_scope, disposition: 'valid', rationale: 'The scoring contract and its attributed responsibilities remain valid; this revision adds the CLI scope.'}));
      const whole = submit('rebind-product', nextSet.revision_id, [candidate('whole', 'IMP', {...payload, source_commit: wholeCommit, acceptance_scope: 'whole-product', impact_dispositions: dispositions}, [link('implements', nextSet.revision_id)], imp.revision_id)]).find(d => d.type === 'IMP');
      assert.notEqual(cli(['expectations']).outcome, 'profile-boundary-reached', 'A changed source cannot inherit the old acceptance');
      assert.ok(whole.payload.source_inventory.every(f => f.formal !== false));
      assert.ok(data().some(d => d.type === 'SCP' && d.payload.path === 'cli.py' && d.links.some(l => l.target === whole.revision_id)));
      const verificationGuidance = guidance('execute-verification', whole.revision_id);
      const staleReceipt = cli(['proposal', 'submit', '-'], {operation: 'old-partial-receipt', action: verificationGuidance.action, package: verificationGuidance.package, snapshot: verificationGuidance.snapshot, subject: verificationGuidance.subject, inputs: verificationGuidance.inputs, candidates: [candidate('verification', 'RES', {assessment: 'Attempt to reuse old evidence.', correction_target: 'none'}, [link('executes', whole.revision_id), link('verifies', nextSet.revision_id)])], evidence: {receipt: receipts[0].evidence}}, {expected: 1});
      assert.equal(staleReceipt.ok, false, 'Old partial evidence cannot verify the new whole source');
      finishProduct(nextSet, whole);
      assert.equal(receipts.length, 2);
      assert.equal(receipts.at(-1).receipt.binding.formalFiles, undefined);
      assert.deepEqual(exact(acceptance.revision_id), acceptance);
    } else if (processName === 'iterative') {
      submit('frame-experiment', undefined, [candidate('maintenance-experiment', 'EXP', {criterion: 'Count supplied items.', question: 'Can unchanged accepted requirements retain their review during maintenance?', approach: 'Baseline a counter, then change only its implementation.', constraints: 'No new behavior.', allowance_minutes: 10, scope_cut: 'One implementation-only change.'})]);
      const initial = submit('draft-requirements', undefined, [
        candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Count supplied command-line items.'}),
        candidate('count', 'REQ', {kind: 'software', ears: {pattern: 'ubiquitous', system: 'The CLI', response: 'print the number of supplied command-line items'}}),
        candidate('decomposition', 'DCP', {}, [link('parent', '$need'), link('child', '$count')]),
        candidate('requirements', 'RQS', {}),
      ]);
      const need = initial.find(d => d.payload.title === 'need'), count = initial.find(d => d.payload.title === 'count');
      const set = initial.find(d => d.type === 'RQS');
      const originalReview = reviewRequirements(set).review;
      const imp = submit('implement-product', set.revision_id, [candidate('implementation', 'IMP', {...sourceVersion(count.id), file_roles: {'count.py': 'production', 'verify.py': 'verification'}}, [link('implements', set.revision_id)])]).find(d => d.type === 'IMP');
      const acceptance = finishProduct(set, imp);
      assert.equal(cli(['expectations']).outcome, 'profile-boundary-reached');
      const beforeMaintenance = publications.length;
      const change = submit('request-change', set.revision_id, [candidate('simplify-count', 'CHG', {reason: 'Simplify the implementation while retaining every accepted obligation.', requested_outcome: 'Use an explicit supplied-argument slice to count items with unchanged behavior.'}, [link('baseline', acceptance.revision_id), link('changes', need.revision_id)])]).find(d => d.type === 'CHG');
      submit('approve-change', change.revision_id, [candidate('maintenance-approval', 'REV', {outcome: 'pass', findings: `Approve implementation-only maintenance preserving the exact requirement graph. ${fixtureAuthority}`}, [link('reviews', change.revision_id)])]);
      const nextSet = submit('revise-requirements', change.revision_id, [candidate('requirements', 'RQS', {}, [], set.revision_id)]).find(d => d.type === 'RQS');
      for (const relation of ['contains', 'decomposition']) assert.deepEqual(nextSet.links.filter(l => l.type === relation), set.links.filter(l => l.type === relation));
      const available = cli(['expectations']);
      assert.ok(available.items.some(item => item.action === 'rebind-product@2' && item.subject === nextSet.revision_id));
      assert.ok(!available.items.some(item => item.action === 'review-requirements@2' && item.subject === nextSet.revision_id));
      assert.notEqual(available.outcome, 'profile-boundary-reached');
      writeFileSync(path.join(source, 'count.py'), readFileSync(path.join(source, 'count.py'), 'utf8').replace('len(sys.argv) - 1', 'len(sys.argv[1:])'));
      commit(source, 'Simplify implementation without changing requirements');
      const maintainedCommit = git(['rev-parse', 'HEAD'], source); sourceCommits.push(maintainedCommit);
      const maintained = submit('rebind-product', nextSet.revision_id, [candidate('implementation', 'IMP', {...imp.payload, source_commit: maintainedCommit, impact_dispositions: [], product_files: undefined, source_inventory: undefined, source_changes: undefined}, [link('implements', nextSet.revision_id)], imp.revision_id)]).find(d => d.type === 'IMP');
      assert.notEqual(maintained.revision_id, imp.revision_id);
      assert.notEqual(cli(['expectations']).outcome, 'profile-boundary-reached');
      const nextAcceptance = finishProduct(nextSet, maintained);
      assert.notEqual(nextAcceptance.revision_id, acceptance.revision_id);
      assert.deepEqual(exact(originalReview.revision_id), originalReview, 'Reuse must not replace the original review');
      assert.ok(!data().some(d => d.type === 'REV' && d.links.some(l => l.type === 'reviews' && l.target === nextSet.revision_id)), 'No new requirements review is published');
      assert.equal(publications.length - beforeMaintenance, 7, 'Maintenance retains fresh implementation, result, review and acceptance');
      assert.equal(receipts.length, 2, 'Both baseline and maintained source receive canonical execution');
    } else if (processName === 'tiny' && corrections) {
      const software = response => ({kind: 'software', ears: {pattern: 'ubiquitous', system: 'The CLI', response}});
      const initial = submit('draft-requirements', undefined, [
        candidate('need', 'REQ', {kind: 'stakeholder', statement: 'Tell me how many items I supplied as command-line arguments; the executable is not an item.'}),
        candidate('count', 'REQ', software('print the number of process arguments, including the executable')),
        candidate('decomposition', 'DCP', {}, [link('parent', '$need'), link('child', '$count')]),
        candidate('requirements', 'RQS', {}),
      ]);
      let requirement = initial.find(d => d.payload.title === 'count');
      let set = initial.find(d => d.type === 'RQS');
      const failedReview = reviewRequirements(set, {failRequirement: requirement.revision_id, findings: 'The software statement includes the executable, which directly contradicts the stakeholder. Count only supplied items. The existing decomposition remains sufficient.'}).review;
      const corrected = submit('correct-requirements-after-review', set.revision_id, [
        candidate('count', 'REQ', software('print the count of supplied command-line items on one line'), [], requirement.revision_id),
        candidate('requirements', 'RQS', {}, [link('corrects', failedReview.revision_id)], set.revision_id),
      ]);
      requirement = corrected.find(d => d.type === 'REQ'); set = corrected.find(d => d.type === 'RQS');
      reviewRequirements(set, {findings: 'The corrected statement excludes the executable and supports the stakeholder counting need. Quoted argument semantics remain an interpretation to check in use.'});
      const implementation = payload => ({...payload, file_roles: {'count.py': 'production', 'verify.py': 'verification'}});
      let imp = submit('implement-product', set.revision_id, [candidate('implementation', 'IMP', implementation(sourceVersion(requirement.id, undefined, false, {zeroBug: true, quoted: 2})), [link('implements', set.revision_id)])]).find(d => d.type === 'IMP');
      const failedReceipt = execute(imp, 'fail');
      const failedResult = submit('execute-verification', imp.revision_id, [candidate('verification', 'RES', {assessment: 'The two-argument count passed. The quoted red blue argument returned one while the script expected two by splitting its words. Stakeholder intention concerns supplied arguments, so clarify the expectation rather than changing correct quoted-argument behavior.', correction_target: 'requirements'}, [link('executes', imp.revision_id), link('verifies', set.revision_id)])], {receipt: failedReceipt}).find(d => d.type === 'RES');
      const clarified = submit('correct-expectations', failedResult.revision_id, [
        candidate('count', 'REQ', software('print the number of supplied command-line arguments on one line, counting each argument once even when its text contains spaces'), [], requirement.revision_id),
        candidate('requirements', 'RQS', {}, [link('corrects', failedResult.revision_id)], set.revision_id),
      ]);
      requirement = clarified.find(d => d.type === 'REQ'); set = clarified.find(d => d.type === 'RQS');
      reviewRequirements(set, {findings: 'Counting a quoted argument once clarifies the original stakeholder intention. This correction does not add a new feature or change the stakeholder statement.'});
      imp = submit('rebind-product', set.revision_id, [candidate('implementation', 'IMP', implementation(sourceVersion(requirement.id, undefined, false, {zeroBug: true, quoted: 1})), [link('implements', set.revision_id)], imp.revision_id)]).find(d => d.type === 'IMP');
      const rejected = finishProduct(set, imp, {decision: 'reject', checkZero: true, rationale: `Actual no-argument invocation printed one. The stakeholder supplied no items and needs zero. The script covered ordinary and quoted arguments but missed this defect. ${fixtureAuthority}`});
      const repaired = submit('correct-rejected-product', imp.revision_id, [candidate('implementation', 'IMP', implementation(sourceVersion(requirement.id, undefined, false, {quoted: 1, zeroCheck: true})), [link('implements', set.revision_id), link('corrects', rejected.revision_id)], imp.revision_id)]).find(d => d.type === 'IMP');
      finishProduct(set, repaired, {checkZero: true});
      assert.equal(exact(failedReview.revision_id).payload.outcome, 'fail');
      assert.equal(exact(failedResult.revision_id).payload.outcome, 'fail');
      assert.equal(exact(rejected.revision_id).payload.decision, 'reject');
    } else if (processName === 'tiny') {
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
      const reassessment = reviewRequirements(nextSet);
      const dispositions = reassessment.sourceScopes.map(source_scope => ({source_scope, disposition: 'removed', rationale: 'The approved change retires the label behavior and removes this label-only source region.'}));
      const secondSource = sourceVersion(count.id);
      const nextImp = submit('rebind-product', nextSet.revision_id, [candidate('implementation', 'IMP', {...secondSource, file_roles: {'count.py': 'production', 'verify.py': 'verification'}, impact_dispositions: dispositions}, [link('implements', nextSet.revision_id)], imp.revision_id)]).find(d => d.type === 'IMP');
      finishProduct(nextSet, nextImp);
      assert.deepEqual(exact(label.revision_id), label, 'Retirement preserves the historical requirement');
    } else {
      const experiment = submit('frame-experiment', undefined, [candidate('count-experiment', 'EXP', {criterion: 'Count command-line arguments.', question: 'Can a small program and executable evidence survive nomination and feedback revision?', approach: 'Use a Python counter and subprocess assertion.', constraints: 'CLI only; no persistence or user acceptance claim.', allowance_minutes: 10, scope_cut: 'One count operation.'})]).find(d => d.type === 'EXP');
      const prototype = submit('prepare-prototype', experiment.revision_id, [candidate('counter-prototype', 'TRY', sourceVersion(), [link('explores', experiment.revision_id)])]).find(d => d.type === 'TRY');
      const observe = (trial, receipt, recommendation) => submit('observe-prototype', trial.revision_id, [candidate('counter-observation', 'OBS', {assessment: recommendation === 'nominate' ? 'The scripted counter passed its assertion; nominate for fixture feedback.' : 'The revised assertion intentionally expected three for two arguments and failed. Preserve the failure and stop.', observation_origin: 'scripted', interaction_observation: 'A subprocess invoked the counter; no interactive user session.', limitations: fixtureAuthority, recommendation, next_action: recommendation === 'nominate' ? 'Request explicit fixture stakeholder feedback.' : 'Drop this intentionally failing experiment.'}, [link('observes', trial.revision_id), link('against', experiment.revision_id)])], {receipt}).find(d => d.type === 'OBS');
      const nomination = observe(prototype, execute(prototype, 'pass'), 'nominate');
      const feedback = submit('record-feedback', nomination.revision_id, [candidate('fixture-feedback', 'FDB', {action: 'revise-prototype', feedback: 'Exercise a captured assertion failure in a revised trial, then stop this fixture.', source: fixtureAuthority}, [link('responds-to', nomination.revision_id)])]).find(d => d.type === 'FDB');
      const revised = submit('revise-prototype', feedback.revision_id, [candidate('counter-prototype', 'TRY', sourceVersion(undefined, undefined, true), [link('explores', experiment.revision_id), link('responds-to', feedback.revision_id)], prototype.revision_id)]).find(d => d.type === 'TRY');
      observe(revised, execute(revised, 'fail'), 'drop');
      assert.deepEqual(exact(prototype.revision_id), prototype, 'Revision preserves the original prototype');
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
    const captureFailures = [];
    for (const [name, state] of Object.entries(gitState)) {
      if (!state) { captureFailures.push(`${name} repository is unavailable`); continue; }
      for (const [command, record] of Object.entries(state)) {
        if (record.status !== 0 || record.error || record.signal) captureFailures.push(`${name} ${command} capture failed`);
      }
      if (state.status.status === 0 && state.status.stdout.trim()) captureFailures.push(`${name} repository has uncommitted changes`);
    }
    let lifecycleData;
    if (existsSync(lifecycle)) { try { lifecycleData = [...new Set(revisions)].map(exact); } catch (error) { lifecycleData = {error: String(error)}; captureFailures.push(`Lifecycle data capture failed: ${error.message}`); } }
    save('lifecycle-data.json', lifecycleData ?? []);
    if (captureFailures.length && !caught) caught = new Error(`Final evidence is incomplete: ${captureFailures.join('; ')}`);
    const result = {ok: !caught, outcome: caught ? 'failed' : terminal?.outcome ?? 'failed', process: processName, corrections, root, lifecycle, source, evidenceFile, publications, revisions, receipts, sourceCommits, commands, terminal, gitState, captureFailures, scope: fixtureAuthority, error: caught ? {message: caught.message, stack: caught.stack} : undefined};
    save('result.json', result);
    if (caught) { caught.message += `\nPreserved journey evidence: ${evidenceFile}`; throw caught; }
    return result;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const executable = option('--executable') ?? process.env.MDLM_DIRECT_EXECUTABLE ?? process.env.MDLM_EXECUTABLE;
  runDirectJourney({process: option('--process') ?? 'tiny', corrections: args.includes('--corrections'), partialAcceptance: args.includes('--partial-acceptance'), executable, root: option('--root')}).then(result => console.log(JSON.stringify({ok: result.ok, outcome: result.outcome, publications: result.publications, receipts: result.receipts, commands: result.commands, evidenceFile: result.evidenceFile}))).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
