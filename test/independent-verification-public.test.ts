import { spawnSync, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("independent verification reports complete requirements, failures, stale evidence and recovery through the CLI", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-independent-public-"));
  const repository = path.join(root,"lifecycle"), product = path.join(root,"product"), verifier = path.join(root,"verifier"), registry = path.join(root,"registry");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(),"dist/mdlm.js");
  const commands: unknown[] = []; let outcome = "failed";
  const cli = (args: string[], exit = 0, manager = false) => {
    const argv = executable.endsWith(".js") ? [process.execPath, [executable,...args,"--json"]] as const : [executable,[...args,"--json"]] as const;
    const result = spawnSync(argv[0],argv[1],{cwd:args[0]==="init"?root:repository,encoding:"utf8",timeout:90_000,maxBuffer:32*1024*1024,env:{...process.env,MDLM_REVIEW_REGISTRY:registry,MDLM_REVIEW_REGISTRAR:manager?"1":"0"}});
    commands.push({args,status:result.status,stdout:result.stdout,stderr:result.stderr});
    expect(result.status,result.stdout+result.stderr).toBe(exit);return JSON.parse(result.stdout);
  };
  const git = (cwd: string, ...args: string[]) => execFileSync("git",["-C",cwd,...args],{encoding:"utf8"}).trim();
  const commit = (cwd: string) => {git(cwd,"add",".");git(cwd,"-c","commit.gpgSign=false","commit","--no-verify","--allow-empty","-qm","Fixture evidence");return git(cwd,"rev-parse","HEAD");};
  const init = async (cwd:string) => {await fs.mkdir(cwd);git(cwd,"init","-q");git(cwd,"config","user.name","Fixture");git(cwd,"config","user.email","fixture@example.invalid");};
  const datum = (id:string) => cli(["show",id]).lifecycleDatum.datum;
  const guidance = (action:string,subject?:string) => cli(["expectations","show",action,...(subject?[subject]:[])]);
  const submit = async (g:any, operation:string,candidates:any[],evidence?:any,review=false,expectedExit=0) => {
    const proposal = {operation,action:g.action,package:g.package,snapshot:g.snapshot,...(g.subject?{subject:g.subject}:{}),inputs:g.inputs,candidates,...(evidence?{evidence}:{})};
    const file=path.join(root,`${operation}.json`);await fs.writeFile(file,JSON.stringify(proposal));
    if(review)cli(["review","register",file,file],0,true);
    const result=cli(["proposal","submit",file,...(evidence?.authority?["--authority","stakeholder"]:[])],expectedExit);
    if(!expectedExit)commit(repository);return result;
  };
  const review = async (action:string,subject:string,operation:string) => {
    const g=guidance(action,subject), context=cli(["review","context",action,subject]);
    const c=g.candidates[0];c.payload={...c.payload,title:"Independent fixture review",outcome:"pass",findings:"Fixture review authorizes the explicitly enumerated evidence only"};
    if(action==="review-verification") {
      expect(context.sources).toEqual([]);
      expect(context.verifierSources[0].files.some((f:any)=>f.path==="verify.py")).toBe(true);
      c.payload.coverage_assessments=datum(subject).payload.coverage.map((a:any)=>({target:a.target,disposition:"adequate",rationale:"Cases cover the bounded count, empty input and public error obligations"}));
    }
    if(action==="review-requirements") {
      const graph=context.requirementGraphs[0];
      c.payload.requirement_assessments=graph.requirements.map((r:any)=>({requirement:r.revision_id,disposition:"valid",rationale:"Necessary bounded observable behavior"}));
      c.payload.decomposition_assessments=graph.groups.map((d:any)=>({group:d.revision_id,children:d.links.filter((l:any)=>l.type==="child").map((l:any)=>({requirement:l.target,disposition:"valid",rationale:"Necessary behavior"})),disposition:"adequate",membership_action:"none",rationale:"Count and empty cases collectively establish the stakeholder need"}));
    }
    if(action==="review-implementation") c.payload.coverage_assessments=context.requirementGraphs[0].requirements.map((r:any)=>({target:r.revision_id,disposition:"adequate",rationale:"The selected cases collectively cover all obligations, including the stakeholder outcome"}));
    return submit(g,operation,[c],undefined,true);
  };
  try {
    cli(["init",repository,"--process","iterative"]);await fs.mkdir(registry);await init(product);await init(verifier);
    const framing=guidance("frame-experiment"), exp=framing.candidates[0];
    exp.payload={...exp.payload,title:"Count CLI",criterion:"Count all arguments",question:"Can a public CLI count supplied items?",approach:"Use a minimal counter",constraints:"No persistence",allowance_minutes:5,scope_cut:"No interactive mode"};
    const expId=(await submit(framing,"frame",[exp])).revisions[0];
    const g=guidance("draft-requirements");
    const req=(localId:string,payload:any)=>({localId,type:"REQ",payload:{title:localId,publication:"recorded",...payload},links:[],body:""});
    const published=await submit(g,"requirements",[
      req("need",{kind:"stakeholder",statement:"The user shall obtain the number of supplied arguments",rationale:"Count supplied items"}),
      req("count",{kind:"software",ears:{pattern:"ubiquitous",system:"The CLI",response:"print the number of arguments as a decimal integer followed by a newline and exit zero"}}),
      req("empty",{kind:"software",ears:{pattern:"event",event:"no arguments are supplied",system:"The CLI",response:"print zero followed by a newline and exit zero"}}),
      {localId:"decomposition",type:"DCP",payload:{title:"Counting obligations",publication:"recorded"},links:[{type:"parent",target:"$need"},{type:"child",target:"$count"},{type:"child",target:"$empty"}],body:""},g.candidates.find((c:any)=>c.type==="RQS")]);
    const set=published.revisions.find((id:string)=>id.startsWith("RQS-"));
    const refs=published.revisions.filter((id:string)=>id.startsWith("REQ-"));
    const byTitle=Object.fromEntries(refs.map((id:string)=>[datum(id).payload.title,id]));
    const authoring=cli(["verification","context",set]);
    expect(authoring.requirements).toHaveLength(3);expect(JSON.stringify(authoring)).not.toContain("source_commit");
    const exported=cli(["verification","context",set,"--output",path.join(root,"requirements-only.json")]);
    expect(exported.authoringContext).toBe(authoring.authoringContext);
    await review("review-requirements",set,"review-requirements");
    const image="python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a";
    const script=`import json,os,subprocess\nfrom pathlib import Path\nrows=[]\nfor case,args,expected in [('empty',[],'0\\n'),('count',['a','b','c'],'3\\n')]:\n r=subprocess.run(['python3',os.environ['MDLM_PRODUCT_DIR']+'/app.py',*args],capture_output=True,text=True)\n rows.append({'case_id':case,'outcome':'pass' if r.returncode==0 and r.stdout==expected else 'fail','actual_results':[repr(r.stdout),'exit '+str(r.returncode)],'evidence_refs':[]})\nPath(os.environ['MDLM_EVIDENCE_DIR']+'/results.json').write_text(json.dumps({'contract':'mdlm-verification-results@1','cases':rows}))\nraise SystemExit(0 if all(r['outcome']=='pass' for r in rows) else 1)\n`;
    await fs.writeFile(path.join(verifier,"verify.py"),script);const verifierCommit=commit(verifier);
    const plan=guidance("plan-verification",set), vfy=plan.candidates[0];
    const cases=[{id:"empty",targets:[byTitle.need,byTitle.count,byTitle.empty],preconditions:["Fresh process with no stored state"],actions:["Invoke the CLI with no arguments"],expected_results:["stdout is 0 newline, exit zero"],coverage_rationale:"Zero boundary and visible count"},{id:"count",targets:[byTitle.need,byTitle.count],preconditions:["Fresh process with no stored state"],actions:["Invoke the CLI with a b c"],expected_results:["stdout is 3 newline, exit zero"],coverage_rationale:"Multiple supplied arguments"}];
    vfy.payload={...vfy.payload,title:"Public count contract",method:"CLI black-box test",objective:"Verify exact observable count",cases,coverage:refs.map((target:string)=>({target,obligations:["Observable count and successful completion"],case_ids:cases.filter(c=>c.targets.includes(target)).map(c=>c.id),rationale:"Boundary and ordinary invocation establish the bounded counting behavior"})),repository_path:verifier,source_commit:verifierCommit,verification_image:image,verification_script:"verify.py",verification_command:["python3","verify.py"],results_path:"results.json",authoring_subject:set,authoring_context:authoring.authoringContext};
    vfy.links=refs.map((target:string)=>({type:"verifies",target}));const activity=(await submit(plan,"plan",[vfy])).revisions[0];
    await fs.writeFile(path.join(product,"app.py"),"import sys\nprint(len(sys.argv)-1)\n");const source=commit(product);
    const implementation=guidance("implement-product",set), imp=implementation.candidates[0];
    imp.payload={...imp.payload,title:"Count product",repository_path:product,source_commit:source,command:["python3","app.py"],file_roles:{"app.py":"production"},source_ranges:[{path:"app.py",name:"count",start:1,end:2,requirements:[datum(byTitle.count).id,datum(byTitle.empty).id]}]};imp.links.push({type:"verification",target:activity});
    let productId=(await submit(implementation,"implementation",[imp])).revisions.find((id:string)=>id.startsWith("IMP-"));
    const execute=async(op:string,id:string,activityId=activity) => {const execution=cli(["execution","run",id,op,"--activity",activityId]);const g=guidance("execute-verification",id),c=g.candidates[0];c.payload={...c.payload,title:"Verification result",assessment:"Captured assertions compared public output to independently specified expectations",correction_target:execution.value.receipt.result.outcome==="pass"?"none":"implementation"};c.links.push({type:"evaluates",target:activityId});await submit(g,`${op}-result`,[c],{receipt:execution.value.evidence});return execution;};
    const first=await execute("pass",productId);
    expect(first.value.receipt.result.caseResults).toHaveLength(2);
    const beforeReview=cli(["verification","status",productId]);expect(beforeReview.complete).toBe(false);expect(beforeReview.requirements.every((r:any)=>r.overall==="awaiting-review")).toBe(true);
    await review("review-verification",activity,"review-coverage");
    expect(cli(["verification","status",productId]).requirements[0].overall).toBe("awaiting-coverage-review");
    const settled=cli(["execution","run",productId,"pass","--activity",activity]);expect(settled.value.evidence).toBe(first.value.evidence);
    const rerun=await execute("pass-fresh",productId);
    const oldGuidance=guidance("execute-verification",productId),oldCandidate=oldGuidance.candidates[0];oldCandidate.payload={...oldCandidate.payload,assessment:"Attempt to reuse older evidence",correction_target:"none"};oldCandidate.links.push({type:"evaluates",target:activity});
    const staleReceipt=await submit(oldGuidance,"old-receipt",[oldCandidate],{receipt:first.value.evidence},false,1);expect(JSON.stringify(staleReceipt)).toContain("fresh execution");
    expect(rerun.value.evidence).not.toBe(first.value.evidence);
    const evidenceDirectory=path.join(root,"exported-evidence");const exportedEvidence=cli(["execution","export","pass-fresh",evidenceDirectory]);expect(exportedEvidence.files.some((f:any)=>f.path==="report.json")).toBe(true);expect(JSON.parse(await fs.readFile(path.join(evidenceDirectory,"report.json"),"utf8")).cases).toHaveLength(2);
    await review("review-implementation",productId,"review-implementation");
    expect(cli(["verification","status",productId]).complete).toBe(true);
    const accepting=guidance("accept-product",productId),acc=accepting.candidates[0];acc.payload={...acc.payload,title:"Accept count",decision:"accept",rationale:"Independent public cases and coverage reviewed"};await submit(accepting,"accept",[acc],{authority:["stakeholder"]});
    // Keep formal acceptance intact. A new provisional product tests implementation substitution and mismatch without rewriting its oracle.
    const criterionContext=cli(["verification","context",expId]);
    const pg=guidance("plan-criterion-verification",expId),pc=pg.candidates[0];pc.payload={...vfy.payload,authoring_subject:expId,authoring_context:criterionContext.authoringContext,cases:cases.map(c=>({...c,targets:[expId]})),coverage:[{target:expId,obligations:["Count supplied arguments"],case_ids:["empty","count"],rationale:"Boundary and ordinary invocation"}]};pc.links=[{type:"verifies",target:expId}];let provisionalActivity=(await submit(pg,"criterion-plan",[pc])).revisions[0];
    const trial=async(op:string,sourceCommit:string,previous?:string) => {const tg=guidance(previous?"revise-prototype":"prepare-prototype",previous??expId),tc=tg.candidates[0];tc.payload={...tc.payload,title:"Counter trial",repository_path:product,source_commit:sourceCommit,command:["python3","app.py"]};tc.links.push({type:"verification",target:provisionalActivity});return (await submit(tg,op,[tc])).revisions[0];};
    let trialId=await trial("trial",source);
    const runTrial=async(op:string,id:string) => {const result=cli(["execution","run",id,op,"--activity",provisionalActivity]);const g=guidance("execute-criterion-verification",id),c=g.candidates[0];c.payload={...c.payload,title:"Verification result",assessment:"Exact public observations retained",correction_target:result.value.receipt.result.outcome==="pass"?"none":"implementation"};c.links.push({type:"evaluates",target:provisionalActivity});await submit(g,`${op}-result`,[c],{receipt:result.value.evidence});return result;};
    await runTrial("trial-pass",trialId);expect(cli(["verification","status",trialId]).requirements[0].overall).toBe("observed-pass");
    // Deliberately omit a declared row, then repair the verifier while keeping product source fixed.
    await fs.writeFile(path.join(verifier,"verify.py"),script.replace("'cases':rows", "'cases':rows[:1]"));const incompleteCommit=commit(verifier);
    const revisePlan=async(op:string,commitId:string) => {const g=guidance("revise-verification",provisionalActivity),c=g.candidates[0];c.payload={...datum(provisionalActivity).payload,source_commit:commitId};c.links=datum(provisionalActivity).links;provisionalActivity=(await submit(g,op,[c])).revisions[0];};
    const selectPlan=async(op:string) => {const g=guidance("update-criterion-verification-selection",trialId),c=g.candidates[0];c.payload=datum(trialId).payload;c.links=c.links.filter((l:any)=>l.type!=="verification");c.links.push({type:"verification",target:provisionalActivity});trialId=(await submit(g,op,[c])).revisions[0];};
    await revisePlan("incomplete-plan",incompleteCommit);await selectPlan("select-incomplete");
    expect(cli(["verification","status",trialId]).requirements[0].overall).toBe("stale");
    await runTrial("trial-incomplete",trialId);const incomplete=cli(["verification","status",trialId]);expect(incomplete.requirements[0].overall).toBe("error");expect(incomplete.requirements[0].activities[0].cases.some((c:any)=>c.outcome==="not-run")).toBe(true);
    await fs.writeFile(path.join(verifier,"verify.py"),script);await revisePlan("repaired-plan",commit(verifier));await selectPlan("select-repaired");await runTrial("trial-repaired",trialId);expect(cli(["verification","status",trialId]).requirements[0].overall).toBe("observed-pass");
    const og=guidance("observe-prototype",trialId),oc=og.candidates[0];oc.payload={...oc.payload,title:"Working count",assessment:"Public checks passed",observation_origin:"scripted",interaction_observation:"Both CLI invocations matched",limitations:"Small bounded fixture",recommendation:"nominate",next_action:"Ask stakeholder for next comparison"};const observation=(await submit(og,"observe-trial",[oc])).revisions[0];
    const fg=guidance("record-feedback",observation),fc=fg.candidates[0];fc.payload={...fc.payload,title:"Compare changed implementation",action:"revise-prototype",feedback:"Try the next implementation and retain the same contract",source:"Fixture stakeholder"};const feedback=(await submit(fg,"feedback",[fc],{authority:["stakeholder"]})).revisions[0];
    await fs.writeFile(path.join(product,"app.py"),"import sys\nprint(len(sys.argv))\n");const wrong=commit(product);
    // New trial lineage is valid experimental work; exact product binding makes prior evidence stale.
    const tg=guidance("revise-prototype",feedback),tc=tg.candidates[0];tc.payload={...tc.payload,title:"Deliberate wrong counter",repository_path:product,source_commit:wrong,command:["python3","app.py"]};tc.links.push({type:"verification",target:provisionalActivity});trialId=(await submit(tg,"wrong-trial",[tc])).revisions[0];
    expect(cli(["verification","status",trialId]).requirements[0].overall).toBe("stale");await runTrial("trial-fail",trialId);expect(cli(["verification","status",trialId]).requirements[0].overall).toBe("failing");
    outcome="passed";
  } finally {
    const evidenceFile=path.join(root,"outcome.json");await fs.writeFile(evidenceFile,JSON.stringify({outcome,executable,repository,product,verifier,commands},null,2));process.stdout.write(`INDEPENDENT_VERIFICATION_EVIDENCE ${evidenceFile}\n`);
  }
},180_000);
