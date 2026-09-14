import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Bootstrap uses supported execution Assignments. The measured authoring interval does not.
const root = mkdtempSync(path.join(tmpdir(), 'mdlm-direct-observation-'));
const executable = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/mdlm.js');
const captures = [];
const lifecycle = path.join(root, 'lifecycle');
const other = path.join(root, 'bootstrap-other');
const source = path.join(root, 'product');
let stage = 'bootstrap';
function run(file, args, cwd, input) {
  const r = spawnSync(file,args,{cwd,input,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
  if (r.error) throw r.error;
  return r;
}
function git(args,cwd=lifecycle) {const r=run('git',args,cwd); assert.equal(r.status,0,r.stderr); return r.stdout.trim();}
function cli(args, value, cwd=lifecycle, expected=0) {
  const input = value === undefined ? undefined : JSON.stringify(value);
  const r=run(process.execPath,[executable,...args,'--json'],cwd,input);
  captures.push({stage,args,cwd,input,status:r.status,stdout:r.stdout,stderr:r.stderr});
  writeFileSync(path.join(root,'commands.json'),JSON.stringify(captures,null,2)+'\n');
  assert.equal(r.status,expected,r.stdout+r.stderr);
  return JSON.parse(r.stdout);
}
function commit(cwd,message) {git(['add','.lifecycle/data'],cwd);git(['-c','commit.gpgSign=false','commit','--quiet','--no-verify','-m',message],cwd);}
function names(cwd) {return cli(['list'],undefined,cwd).data.map(d=>d.lifecycleDatum.datum);}
try {
  mkdirSync(source);
  git(['init','--quiet'],source); git(['config','user.name','Direct observation fixture'],source);git(['config','user.email','fixture@localhost'],source);
  writeFileSync(path.join(source,'verify.py'),"print('PASS: bounded evidence fixture')\n");
  git(['add','verify.py'],source);git(['-c','commit.gpgSign=false','commit','--quiet','--no-verify','-m','Fixture verification'],source);
  const sourceCommit=git(['rev-parse','HEAD'],source);
  const receipts=[];
  for (const [index,cwd] of [lifecycle,other].entries()) {
    cli(['init',cwd,'--process','exploratory'],undefined,root);
    for (let step=0;step<2;step++) {
      const next=cli(['next'],undefined,cwd); const values=next.assignment.packet.authorValuesScaffold;
      values.completionEvidence={summary:'Supported fixture bootstrap'};
      values.outputs[0].body='Seeded fixture, not a user experience claim.';
      values.outputs[0].payload=step===0 ? {title:`Experiment ${index}`,criterion:'Print a deterministic fixture result',question:'Can observations publish directly?',approach:'Seed a tiny committed verifier',constraints:'No user acceptance',allowance_minutes:10,scope_cut:'Direct observation authoring only'} : {title:`Prototype ${index}`,repository_path:source,source_commit:sourceCommit,command:['python3','verify.py'],verification_image:'python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a',verification_command:['python3','verify.py'],verification_script:'verify.py'};
      cli(['assignment','submit-proposal','-'],values,cwd);commit(cwd,'Bootstrap exact inputs');
    }
    cli(['next'],undefined,cwd);
    const result=cli(['assignment','run'],undefined,cwd).value;
    assert.equal(result.receipt.result.outcome,'pass');receipts.push(result);
  }
  // Combine independently authenticated bootstrap records and receipt refs into one disposable fixture.
  for (const entry of readdirSync(path.join(other,'.lifecycle/data/.transactions'))) cpSync(path.join(other,'.lifecycle/data/.transactions',entry),path.join(lifecycle,'.lifecycle/data/.transactions',entry),{recursive:true,errorOnExist:true,force:false});
  git(['fetch','--quiet',other,'+refs/mdlm/verification/*:refs/mdlm/verification/*']);
  // End the bootstrap authoring allocation; no old Assignment remains required by the new route.
  const work=path.join(lifecycle,'.lifecycle/work');
  for (const entry of readdirSync(work)) if (entry.includes('assignment')) rmSync(path.join(work,entry),{recursive:true,force:true});
  commit(lifecycle,'Combine two independent bootstrap subjects');
  cli(['doctor']);
  const bootstrapData=names(lifecycle);
  stage='direct-authoring';
  const before=git(['status','--porcelain']);
  const gaps=cli(['expectations']);assert.equal(gaps.items.length,2);
  const selected=gaps.items[1].subject;
  const guidance=cli(['expectations','show',selected]);
  assert.match(guidance.prompt.content,/Do not run or claim an Assignment/);
  assert.equal(guidance.payloadSchema.properties.recommendation.const,'keep');
  assert.equal(guidance.context.trial.revision_id,selected);assert.equal(guidance.evidence.length,1);
  assert.equal(git(['status','--porcelain']),before);
  function proposal(g,operation) {return {operation,package:g.package,snapshot:g.snapshot,evidence:g.evidence[0],datum:{...g.candidate,payload:{...g.candidate.payload,title:'Direct observation',assessment:'The authenticated verifier printed its expected fixture result.',observation_origin:'scripted',interaction_observation:'No user or agent interactive product session.',limitations:'Only a deterministic fixture; not product acceptance.',recommendation:'keep',next_action:'Inspect the authoring mechanism.'},body:'Published directly without workflow Assignment.'}};}
  const candidate=proposal(guidance,'first-observation');
  const firstGuidance=cli(['expectations','show',gaps.items[0].subject]);
  const wrong={...candidate,operation:'wrong-evidence',evidence:firstGuidance.evidence[0]};
  cli(['proposal','submit','-'],wrong,lifecycle,1);assert.equal(cli(['expectations']).items.length,2);
  const accepted=cli(['proposal','submit','-'],candidate);assert.equal(accepted.outcome,'accepted');
  const shown=cli(['show',accepted.revision]);assert.ok(JSON.stringify(shown).includes('direct-proposal@1'));
  assert.equal(cli(['expectations']).items.length,1);
  // Simulate a lost successful response at the caller: discard it and recover by durable operation identity.
  assert.equal(cli(['proposal','settlement',candidate.operation]).revision,accepted.revision);
  assert.equal(cli(['proposal','submit','-'],candidate).revision,accepted.revision);
  cli(['proposal','submit','-'],{...candidate,datum:{...candidate.datum,body:'Changed bytes'}},lifecycle,1);
  cli(['proposal','submit','-'],proposal(firstGuidance,'stale-observation'),lifecycle,1);
  const fresh=cli(['expectations','show',gaps.items[0].subject]);
  const secondCandidate=proposal(fresh,'second-observation');
  // Drop the CLI response channel after submission, then recover solely through settlement.
  const lost=spawnSync(process.execPath,[executable,'proposal','submit','-','--json'],{cwd:lifecycle,input:JSON.stringify(secondCandidate),encoding:'utf8',stdio:['pipe','ignore','pipe'],timeout:90000});
  captures.push({stage,args:['proposal','submit','-'],cwd:lifecycle,input:JSON.stringify(secondCandidate),status:lost.status,stdout:null,stderr:lost.stderr,response:'intentionally discarded at caller'});
  writeFileSync(path.join(root,'commands.json'),JSON.stringify(captures,null,2)+'\n');
  assert.equal(lost.status,0,lost.stderr);
  const second=cli(['proposal','settlement','second-observation']);assert.equal(second.outcome,'accepted');
  assert.equal(cli(['expectations']).items.length,0);
  cli(['doctor']);
  const data=names(lifecycle);assert.equal(data.filter(d=>d.type==='OBS').length,2);
  for (const old of bootstrapData) assert.deepEqual(data.find(d=>d.revision_id===old.revision_id),old);
  assert.ok(captures.filter(c=>c.stage==='direct-authoring').every(c=>!['assignment','next','scenario'].includes(c.args[0])));
  writeFileSync(path.join(root,'result.json'),JSON.stringify({ok:true,root,lifecycle,source,sourceCommit,receipts:receipts.map(r=>r.oid),observations:[accepted.revision,second.revision],bootstrapCommands:captures.filter(c=>c.stage==='bootstrap').length,authoringCommands:captures.filter(c=>c.stage==='direct-authoring').length,scope:'Actual Docker bootstrap; direct authoring with real storage, read-only guidance, wrong receipt, stale snapshot and nonduplicate settlement checks. No user acceptance.'},null,2)+'\n');
  console.log(JSON.stringify({ok:true,root,lifecycle,result:path.join(root,'result.json')},null,2));
} catch(error) {writeFileSync(path.join(root,'failure.txt'),String(error.stack||error));console.error(root,error);process.exitCode=1;}
