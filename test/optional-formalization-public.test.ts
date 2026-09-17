import {execFileSync, spawnSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("stopped exploration can end before explicitly choosing formal requirements", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-optional-formalization-"));
  const repository = path.join(root, "lifecycle"), product = path.join(root, "product"), verifier = path.join(root, "verifier");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const evidenceFile = process.env.MDLM_FORMALIZATION_EVIDENCE ?? path.join(root, "outcome.json");
  const commands: unknown[] = [];
  let outcome = "failed";
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  const commit = (cwd: string) => {
    git(cwd, "add", ".");
    git(cwd, "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Fixture evidence");
    return git(cwd, "rev-parse", "HEAD");
  };
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [executable, ...args, "--json"], {cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024});
    commands.push({args, exit: result.status, stdout: result.stdout, stderr: result.stderr});
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const guidance = (action: string, subject?: string) => cli("expectations", "show", action, ...(subject ? [subject] : []));
  const datum = (id: string) => cli("show", id).lifecycleDatum.datum;
  const submit = async (g: any, operation: string, candidates: any[], evidence?: any) => {
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: g.action, package: g.package, snapshot: g.snapshot, ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates, ...(evidence ? {evidence} : {})}));
    const result = cli("proposal", "submit", file, ...(evidence?.authority ? ["--authority", "stakeholder"] : []));
    commit(repository);
    return result;
  };
  try {
    cli("init", repository, "--process", "iterative");
    expect(cli("expectations").outcome).toBe("work-available");
    for (const cwd of [product, verifier]) {
      await fs.mkdir(cwd); git(cwd, "init", "-q");
      git(cwd, "config", "user.name", "Fixture"); git(cwd, "config", "user.email", "fixture@example.invalid");
    }
    const framing = guidance("frame-experiment"), exp = framing.candidates[0];
    exp.payload = {...exp.payload, title: "Readiness experiment", criterion: "Print ready followed by a newline and exit zero", question: "Can this CLI report readiness?", approach: "One public invocation", constraints: "No persistent state", allowance_minutes: 5, scope_cut: "No interactive mode"};
    const experiment = (await submit(framing, "frame", [exp])).revisions[0];
    const context = cli("verification", "context", experiment);
    await fs.writeFile(path.join(verifier, "verify.py"), `import json,os,subprocess
from pathlib import Path
r=subprocess.run(['python3',os.environ['MDLM_PRODUCT_DIR']+'/app.py'],capture_output=True,text=True)
passed=r.returncode==0 and r.stdout=='ready\\n'
row={'case_id':'ready','outcome':'pass' if passed else 'fail','actual_results':[repr(r.stdout),'exit '+str(r.returncode)],'evidence_refs':[]}
Path(os.environ['MDLM_EVIDENCE_DIR']+'/results.json').write_text(json.dumps({'contract':'mdlm-verification-results@1','cases':[row]}))
raise SystemExit(0 if passed else 1)
`);
    const plan = guidance("plan-criterion-verification", experiment), vfy = plan.candidates[0];
    vfy.payload = {...vfy.payload, title: "Readiness check", method: "CLI test", objective: "Observe the public readiness signal", authoring_subject: experiment, authoring_context: context.authoringContext, repository_path: verifier, source_commit: commit(verifier), verification_image: "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a", verification_command: ["python3", "verify.py"], verification_script: "verify.py", results_path: "results.json", cases: [{id: "ready", targets: [experiment], preconditions: ["Fresh process"], actions: ["Invoke the CLI"], expected_results: ["stdout ready newline and exit zero"], coverage_rationale: "The complete bounded criterion"}], coverage: [{target: experiment, obligations: ["Readiness output and successful exit"], case_ids: ["ready"], rationale: "One invocation checks both observations"}]};
    vfy.links.push({type: "verifies", target: experiment});
    const activity = (await submit(plan, "plan", [vfy])).revisions[0];
    await fs.writeFile(path.join(product, "app.py"), "print('ready')\n");
    const preparing = guidance("prepare-prototype", experiment), trial = preparing.candidates[0];
    trial.payload = {...trial.payload, title: "Readiness CLI", repository_path: product, source_commit: commit(product), command: ["python3", "app.py"]};
    trial.links.push({type: "verification", target: activity});
    const prototype = (await submit(preparing, "prototype", [trial])).revisions[0];
    const execution = cli("execution", "run", prototype, "readiness", "--activity", activity);
    expect(execution.value.receipt.result.outcome).toBe("pass");
    const resultGuidance = guidance("execute-criterion-verification", prototype), result = resultGuidance.candidates[0];
    result.payload = {...result.payload, title: "Readiness observed", assessment: "Captured output matches the provisional criterion", correction_target: "none"};
    result.links.push({type: "evaluates", target: activity});
    const resultId = (await submit(resultGuidance, "result", [result], {receipt: execution.value.evidence})).revisions[0];
    const observing = guidance("observe-prototype", prototype), obs = observing.candidates[0];
    obs.payload = {...obs.payload, title: "Readiness nomination", assessment: "The provisional check passes", observation_origin: "scripted", interaction_observation: "ready newline and exit zero", limitations: "One scripted criterion, no formal acceptance", recommendation: "nominate", next_action: "Ask the stakeholder whether to continue"};
    const observation = (await submit(observing, "observe", [obs])).revisions[0];
    expect(cli("expectations").outcome).toBe("work-available");
    const feedback = guidance("record-feedback", observation), stop = feedback.candidates[0];
    stop.payload = {...stop.payload, title: "Finish exploration", action: "stop", feedback: "Finish this experiment without formalizing its behavior", source: "Fixture stakeholder"};
    const feedbackId = (await submit(feedback, "stop", [stop], {authority: ["stakeholder"]})).revisions[0];
    const stopped = cli("expectations");
    expect(stopped.items).toEqual([]);
    expect(stopped.outcome).toBe("profile-boundary-reached");
    expect(stopped.optional.map((item: any) => item.action.split("@")[0])).toContain("draft-requirements");
    const history = [experiment, activity, prototype, resultId, observation, feedbackId].map(datum);

    const file = path.join(root, "formalize.json");
    cli("proposal", "draft", "draft-requirements", "--operation", "formalize", "--output", file);
    const draft = JSON.parse(await fs.readFile(file, "utf8"));
    expect(draft.inputs.experiment).toEqual([experiment]);
    draft.candidates = [
      {localId: "need", type: "REQ", payload: {title: "Readiness need", publication: "recorded", kind: "stakeholder", statement: "The user shall receive a readiness signal", rationale: "Retain the useful observed behavior"}, links: [{type: "informed-by", target: observation}], body: ""},
      {localId: "signal", type: "REQ", payload: {title: "CLI signal", publication: "recorded", kind: "software", ears: {pattern: "ubiquitous", system: "The CLI", response: "print ready followed by a newline and exit zero"}}, links: [{type: "informed-by", target: experiment}], body: ""},
      {localId: "group", type: "DCP", payload: {title: "Readiness obligations", publication: "recorded"}, links: [{type: "parent", target: "$need"}, {type: "child", target: "$signal"}], body: ""},
      draft.candidates.find((candidate: any) => candidate.type === "RQS"),
    ];
    await fs.writeFile(file, JSON.stringify(draft));
    const formal = cli("proposal", "submit", file); commit(repository);
    const selection = formal.revisions.find((id: string) => id.startsWith("RQS-"));
    const next = cli("expectations");
    expect(next.outcome).toBe("work-available");
    expect(next.items.map((item: any) => ({action: item.action.split("@")[0], subject: item.subject}))).toContainEqual({action: "review-requirements", subject: selection});
    expect([...next.items, ...next.optional].map((item: any) => item.action.split("@")[0])).not.toContain("draft-requirements");
    const review = cli("review", "context", "review-requirements", selection);
    expect(review.requirementGraphs[0].requirements.flatMap((req: any) => req.links)).toEqual(expect.arrayContaining([{type: "informed-by", target: experiment}, {type: "informed-by", target: observation}]));
    expect(history.map((old: any) => datum(old.revision_id))).toEqual(history);
    outcome = "passed";
  } finally {
    await fs.writeFile(evidenceFile, JSON.stringify({outcome, executable, repository, product, verifier, commands}, null, 2));
    process.stdout.write(`OPTIONAL_FORMALIZATION_EVIDENCE ${evidenceFile}\n`);
  }
}, 120_000);
