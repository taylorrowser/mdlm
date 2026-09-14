import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = mkdtempSync(path.join(tmpdir(), 'mdlm-direct-execution-'));
const executable = process.env.MDLM_EXECUTABLE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/mdlm.js');
const captures = [];
const lifecycle = path.join(root, 'lifecycle');
const source = path.join(root, 'product');
let stage = 'bootstrap';
function run(file, args, cwd, input, discard = false) {
  const r = spawnSync(file,args,{cwd,input,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,...(discard ? {stdio:['pipe','ignore','pipe']} : {})});
  captures.push({stage,file,args,cwd,input,status:r.status,stdout:r.stdout,stderr:r.stderr,...(discard ? {response:'intentionally discarded at caller'} : {})});
  writeFileSync(path.join(root,'commands.json'),JSON.stringify(captures,null,2)+'\n');
  if (r.error) throw r.error;
  return r;
}
function git(args,cwd=lifecycle) {const r=run('git',args,cwd); assert.equal(r.status,0,r.stderr); return r.stdout.trim();}
function cli(args, value, expected=0, cwd=lifecycle, discard=false) {
  const r=run(process.execPath,[executable,...args,'--json'],cwd,value === undefined ? undefined : JSON.stringify(value),discard);
  assert.equal(r.status,expected,r.stdout+r.stderr);
  return discard ? undefined : JSON.parse(r.stdout);
}
function commit(message) {git(['add','.lifecycle/data']);git(['-c','commit.gpgSign=false','commit','--quiet','--no-verify','-m',message]);}
function data() {return cli(['list']).data.map(d=>d.lifecycleDatum.datum);}
function proposal(g,operation,evidence,recommendation) {return {operation,package:g.package,snapshot:g.snapshot,evidence,datum:{...g.candidate,payload:{...g.candidate.payload,title:'Direct observation',assessment:recommendation==='revise' ? 'The exact script printed a passing fixture result. Test a failing revision next.' : 'The revised script reported assertion failure. Preserve that result and stop this engineering fixture.',observation_origin:'scripted',interaction_observation:'No user or agent interactive product session.',limitations:'Execution mechanics only; this is not product acceptance.',recommendation,next_action:recommendation==='revise'?'Try a failure.':'Stop after the captured failure.'},body:'Published directly without workflow Assignment.'}};}
try {
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], root);
  assert.equal(docker.status, 0, "Docker access is required before lifecycle initialization. On this host use sg docker. " + docker.stderr);
  mkdirSync(source);
  git(['init','--quiet'],source);git(['config','user.name','Direct execution fixture'],source);git(['config','user.email','fixture@localhost'],source);
  cli(['init',lifecycle,'--process','exploratory'],undefined,0,root);
  const receipts=[],observations=[],sourceCommits=[];
  let firstDatum;
  for (let iteration=0;iteration<2;iteration++) {
    stage='bootstrap';
    writeFileSync(path.join(source,'verify.py'),iteration === 0 ? "print('PASS: bounded fixture')\n" : "import sys\nprint('FAIL: intentional assertion mismatch')\nsys.exit(1)\n");
    git(['add','verify.py'],source);git(['-c','commit.gpgSign=false','commit','--quiet','--no-verify','-m',`Fixture ${iteration}`],source);
    const sourceCommit=git(['rev-parse','HEAD'],source);sourceCommits.push(sourceCommit);
    for (let step=0;step<2;step++) {
      const next=cli(['next']);assert.equal(next.outcome,'assignment');
      const values=next.assignment.packet.authorValuesScaffold;
      values.completionEvidence={summary:'Ordinary public fixture bootstrap'};
      values.outputs[0].body='Engineering fixture, not a user experience claim.';
      values.outputs[0].payload=step===0 ? {title:`Experiment ${iteration}`,criterion:'Capture the exact bounded script outcome',question:'Can execution and observations work without Assignments?',approach:'Run a committed fixture script',constraints:'No user acceptance',allowance_minutes:10,scope_cut:'Execution and observation only'} : {title:`Prototype ${iteration}`,repository_path:source,source_commit:sourceCommit,command:['python3','verify.py'],verification_image:'python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a',verification_command:['python3','verify.py'],verification_script:'verify.py'};
      assert.equal(cli(['assignment','submit-proposal','-'],values).outcome,'accepted');commit('Publish exact inputs');
    }
    const next=cli(['next']);assert.equal(next.outcome,'direct-work-available');assert.equal(next.subjects.length,1);assert.equal(next.assignment,undefined);
    assert.equal(cli(['status']).currentOutcome.outcome,'direct-work-available');
    stage='direct-execute-observe';
    const before=git(['status','--porcelain']);
    const g=cli(['expectations','show',next.subjects[0]]);
    assert.equal(g.evidence.length,0);assert.equal(git(['status','--porcelain']),before);
    const operation=`execute-${iteration}`;
    assert.equal(cli(['execution','settlement',operation]).value.state,'not-started');
    cli(['execution','run',g.subject,operation],undefined,0,lifecycle,true);
    const settled=cli(['execution','settlement',operation]).value;
    const repeated=cli(['execution','run',g.subject,operation]).value;
    assert.deepEqual(repeated,settled);assert.equal(settled.receipt.attempt,1);
    assert.equal(settled.receipt.binding.assignment,undefined);assert.equal(settled.receipt.binding.operation,operation);
    assert.equal(settled.receipt.result.outcome,iteration===0?'pass':'fail');
    assert.equal(settled.receipt.result.sourceCommit,sourceCommit);
    const refsBefore=git(['for-each-ref','--format=%(refname) %(objectname)','refs/mdlm/execution']);
    assert.deepEqual(cli(['execution','settlement',operation]).value,settled);
    assert.equal(git(['for-each-ref','--format=%(refname) %(objectname)','refs/mdlm/execution']),refsBefore);
    const fresh=cli(['expectations','show',g.subject]);assert.deepEqual(fresh.evidence,[settled.evidence]);
    assert.equal(git(['status','--porcelain']),before);
    const candidate=proposal(fresh,`observe-${iteration}`,settled.evidence,iteration===0?'revise':'drop');
    if (iteration===1) {
      cli(['execution','run',g.subject,'execute-0'],undefined,1);
      assert.deepEqual(cli(['execution','settlement','execute-0']).value,receipts[0]);
      cli(['proposal','submit','-'],{...candidate,operation:'wrong-receipt',evidence:receipts[0].evidence},1);
      cli(['proposal','submit','-'],proposal(fresh,'failed-keep',settled.evidence,'keep'),1);
    }
    cli(['proposal','submit','-'],candidate,0,lifecycle,true);
    const accepted=cli(['proposal','settlement',candidate.operation]);assert.equal(accepted.outcome,'accepted');
    assert.deepEqual(cli(['proposal','submit','-'],candidate),{...accepted,command:'proposal.submit'});
    cli(['proposal','submit','-'],{...candidate,datum:{...candidate.datum,body:'Changed bytes'}},1);
    const published=data().find(d=>d.revision_id===accepted.revision);
    assert.equal(published.payload.outcome,settled.receipt.result.outcome);assert.equal(published.payload.receipt,settled.evidence);
    assert.deepEqual(published.links,g.candidate.links);
    if (firstDatum) assert.deepEqual(data().find(d=>d.revision_id===firstDatum.revision_id),firstDatum);
    else firstDatum=published;
    receipts.push(settled);observations.push(published);
    assert.equal(cli(['expectations']).items.length,0);cli(['doctor']);commit('Publish direct observation');
  }
  stage='closure';
  assert.equal(cli(['next']).outcome,'profile-boundary-reached');
  assert.equal(git(['for-each-ref','--format=%(refname)','refs/mdlm/verification']),'');
  assert.ok(captures.filter(c=>c.stage==='direct-execute-observe' && c.file===process.execPath).every(c=>!['assignment','next','scenario'].includes(c.args[1])));
  writeFileSync(path.join(root,'result.json'),JSON.stringify({ok:true,root,lifecycle,source,sourceCommits,receipts,observations,scope:'Ordinary bootstrap, direct pass/revise then fail/drop, exact binding rejection and completed operation recovery. No user acceptance.'},null,2)+'\n');
  console.log(JSON.stringify({ok:true,root,lifecycle,result:path.join(root,'result.json')},null,2));
} catch(error) {writeFileSync(path.join(root,'failure.txt'),String(error.stack||error));console.error(root,error);process.exitCode=1;}
