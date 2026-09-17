import {execFileSync, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("a failed prototype is corrected under the exact experiment and verifier, with fresh evidence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-prototype-correction-"));
  const repository = path.join(root, "lifecycle"), product = path.join(root, "product"), verifier = path.join(root, "verifier");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const evidenceFile = process.env.MDLM_PROTOTYPE_CORRECTION_EVIDENCE ?? path.join(os.tmpdir(), "mdlm-prototype-correction-evidence", `${path.basename(root)}.json`);
  const commands: unknown[] = [];
  const identities: Record<string, unknown> = {};
  let outcome = "failed";
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  const commit = (cwd: string) => {
    git(cwd, "add", ".");
    git(cwd, "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Fixture evidence");
    return git(cwd, "rev-parse", "HEAD");
  };
  const cli = (args: string[], expectedExit = 0) => {
    const started = new Date().toISOString();
    const result = spawnSync(process.execPath, [executable, ...args, "--json"], {cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024});
    commands.push({args, started, ended: new Date().toISOString(), exit: result.status, stdout: result.stdout, stderr: result.stderr});
    expect(result.status, result.stdout + result.stderr).toBe(expectedExit);
    return JSON.parse(result.stdout);
  };
  const guidance = (action: string, subject?: string) => cli(["expectations", "show", action, ...(subject ? [subject] : [])]);
  const datum = (id: string) => cli(["show", id]).lifecycleDatum.datum;
  const submit = async (g: any, operation: string, candidate: any, evidence?: any, expectedExit = 0) => {
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: g.action, package: g.package, snapshot: g.snapshot, ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates: [candidate], ...(evidence ? {evidence} : {})}));
    const result = cli(["proposal", "submit", file, ...(evidence?.authority ? ["--authority", "stakeholder"] : [])], expectedExit);
    if (!expectedExit) commit(repository);
    return result;
  };
  const actions = () => cli(["expectations"]).items.map((item: any) => item.action.split("@")[0]);
  try {
    identities.sourceCommit = git(process.cwd(), "rev-parse", "HEAD");
    identities.sourceTree = git(process.cwd(), "rev-parse", "HEAD^{tree}");
    identities.executableSha256 = createHash("sha256").update(await fs.readFile(executable)).digest("hex");
    cli(["init", repository, "--process", "iterative"]);
    for (const cwd of [product, verifier]) {
      await fs.mkdir(cwd); git(cwd, "init", "-q");
      git(cwd, "config", "user.name", "Fixture"); git(cwd, "config", "user.email", "fixture@example.invalid");
    }
    const framing = guidance("frame-experiment"), exp = framing.candidates[0];
    identities.package = framing.package;
    exp.payload = {...exp.payload, title: "Ready CLI", criterion: "Print ready followed by a newline and exit zero", question: "Can the command signal readiness?", approach: "A single CLI invocation", constraints: "No persistent state", allowance_minutes: 5, scope_cut: "No interactive mode"};
    const expId = (await submit(framing, "frame", exp)).revisions[0];
    const originalExp = datum(expId);
    const ig = guidance("record-interface"), ic = ig.candidates[0];
    ic.payload = {...ic.payload, title: "Readiness stdout", boundary: "external", endpoints: [{name: "CLI", owner: "Product", responsibility: "Emit readiness"}, {name: "Caller", owner: "User", responsibility: "Read stdout and exit code"}], interaction: "UTF-8 ready newline on stdout", failure_behavior: "Nonzero exit signals failure", compatibility: "One line", assumptions: "Command runs to completion"};
    const interfaceId = (await submit(ig, "interface", ic)).revisions[0];
    const context = cli(["verification", "context", expId]);
    const script = `import json,os,subprocess\nfrom pathlib import Path\nr=subprocess.run(['python3',os.environ['MDLM_PRODUCT_DIR']+'/app.py'],capture_output=True,text=True)\npassed=r.returncode==0 and r.stdout=='ready\\n'\nrow={'case_id':'ready','outcome':'pass' if passed else 'fail','actual_results':[repr(r.stdout),'exit '+str(r.returncode)],'evidence_refs':[]}\nPath(os.environ['MDLM_EVIDENCE_DIR']+'/results.json').write_text(json.dumps({'contract':'mdlm-verification-results@1','cases':[row]}))\nraise SystemExit(0 if passed else 1)\n`;
    await fs.writeFile(path.join(verifier, "verify.py"), script);
    const verifierCommit = commit(verifier);
    const pg = guidance("plan-criterion-verification", expId), pc = pg.candidates[0];
    pc.payload = {...pc.payload, title: "Independent readiness check", method: "CLI black-box check", objective: "Check the declared readiness output", cases: [{id: "ready", targets: [expId], preconditions: ["Fresh process"], actions: ["Invoke the CLI"], expected_results: ["stdout ready newline and exit zero"], coverage_rationale: "Directly checks the complete bounded criterion"}], coverage: [{target: expId, obligations: ["Readiness output and successful exit"], case_ids: ["ready"], rationale: "One invocation checks the complete criterion"}], repository_path: verifier, source_commit: verifierCommit, verification_image: "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a", verification_script: "verify.py", verification_command: ["python3", "verify.py"], results_path: "results.json", authoring_subject: expId, authoring_context: context.authoringContext};
    pc.links = [{type: "verifies", target: expId}];
    const activity = (await submit(pg, "plan", pc)).revisions[0], originalActivity = datum(activity);
    await fs.writeFile(path.join(product, "app.py"), "print('wrong')\n");
    const wrongSource = commit(product);
    const tg = guidance("prepare-prototype", expId), tc = tg.candidates[0];
    tc.payload = {...tc.payload, title: "Readiness trial", repository_path: product, source_commit: wrongSource, command: ["python3", "app.py"]};
    tc.links.push({type: "verification", target: activity}, {type: "uses-interface", target: interfaceId});
    const failedTrial = (await submit(tg, "trial", tc)).revisions[0];
    const run = async (id: string, op: string) => {
      const execution = cli(["execution", "run", id, op, "--activity", activity]);
      const g = guidance("execute-criterion-verification", id), c = g.candidates[0];
      c.payload = {...c.payload, assessment: "Captured output compared with unchanged independent criterion", correction_target: execution.value.receipt.result.outcome === "pass" ? "none" : "implementation"};
      c.links.push({type: "evaluates", target: activity});
      const resultId = (await submit(g, `${op}-result`, c, {receipt: execution.value.evidence})).revisions[0];
      return {execution, resultId};
    };
    const failed = await run(failedTrial, "failed-run");
    expect(failed.execution.value.receipt.result.outcome).toBe("fail");
    const originalResult = datum(failed.resultId);
    const og = guidance("observe-prototype", failedTrial), oc = og.candidates[0];
    oc.payload = {...oc.payload, title: "Wrong readiness output", assessment: "The product prints wrong, while intent and verifier require ready", observation_origin: "scripted", interaction_observation: "Captured wrong newline", limitations: "One bounded CLI criterion", recommendation: "nominate", next_action: "Correct product code under unchanged intent"};
    const rejectedNomination = await submit(og, "false-nomination", oc, undefined, 1);
    expect(JSON.stringify(rejectedNomination)).toContain("revise or drop");
    oc.payload.recommendation = "revise";
    const observation = (await submit(og, "failed-observation", oc)).revisions[0], originalObservation = datum(observation);
    expect(actions()).toEqual(expect.arrayContaining(["correct-prototype", "revise-experiment"]));
    expect(actions()).not.toContain("record-feedback");

    // A draft fixes every unchanged binding; only the product payload needs authoring.
    const draftFile = path.join(root, "correction.json");
    cli(["proposal", "draft", "correct-prototype", expId, "--operation", "correct", "--output", draftFile]);
    const draft = JSON.parse(await fs.readFile(draftFile, "utf8")), corrected = draft.candidates[0];
    expect(corrected.predecessor).toBe(failedTrial);
    expect(corrected.links).toEqual(expect.arrayContaining([{type: "explores", target: expId}, {type: "responds-to", target: observation}, {type: "verification", target: activity}, {type: "uses-interface", target: interfaceId}]));
    await fs.writeFile(path.join(product, "app.py"), "print('ready')\n");
    const correctedSource = commit(product);
    corrected.payload = {...tc.payload, source_commit: correctedSource};
    corrected.body = "Correct the product output. Intent, public interface and independent verifier remain unchanged.";
    await fs.writeFile(draftFile, JSON.stringify(draft));
    const correctedTrial = cli(["proposal", "submit", draftFile]).revisions[0]; commit(repository);
    expect(datum(correctedTrial).id).toBe(datum(failedTrial).id);
    expect(datum(correctedTrial).payload.source_commit).toBe(correctedSource);
    expect(correctedSource).not.toBe(wrongSource);
    const beforeRun = cli(["verification", "status", correctedTrial]);
    expect(beforeRun.complete).toBe(false);
    expect(beforeRun.requirements[0].overall).not.toBe("observed-pass");
    const remaining = actions();
    expect(remaining).not.toContain("correct-prototype");
    expect(remaining).not.toContain("revise-experiment");
    expect(remaining).not.toContain("observe-prototype");
    const stale = guidance("execute-criterion-verification", correctedTrial), staleCandidate = stale.candidates[0];
    staleCandidate.payload = {...staleCandidate.payload, assessment: "Old evidence cannot establish the correction", correction_target: "implementation"};
    staleCandidate.links.push({type: "evaluates", target: activity});
    const rejectedReceipt = await submit(stale, "old-result", staleCandidate, {receipt: failed.execution.value.evidence}, 1);
    expect(JSON.stringify(rejectedReceipt)).toMatch(/receipt.*(match|bind)|exact|fresh execution/i);
    expect(cli(["proposal", "settlement", "old-result"]).outcome).toBe("not-published");
    const passed = await run(correctedTrial, "corrected-run");
    expect(passed.execution.value.receipt.result.outcome).toBe("pass");
    expect(passed.execution.value.evidence).not.toBe(failed.execution.value.evidence);
    expect(cli(["verification", "status", correctedTrial]).complete).toBe(true);
    const good = guidance("observe-prototype", correctedTrial), goodCandidate = good.candidates[0];
    goodCandidate.payload = {...oc.payload, title: "Corrected readiness output", assessment: "The unchanged case passes on the corrected product", interaction_observation: "Captured ready newline", recommendation: "nominate", next_action: "Ask stakeholder for feedback"};
    const passingObservation = (await submit(good, "passing-observation", goodCandidate)).revisions[0];
    const feedback = guidance("record-feedback", passingObservation), fc = feedback.candidates[0];
    fc.payload = {...fc.payload, title: "Try a different readiness signal", action: "revise-criteria", feedback: "The correction works; next compare a different readiness signal", source: "Fixture stakeholder"};
    const feedbackId = (await submit(feedback, "feedback", fc, {authority: ["stakeholder"]})).revisions[0];
    expect(datum(expId)).toEqual(originalExp);
    expect(datum(activity)).toEqual(originalActivity);
    expect(datum(failed.resultId)).toEqual(originalResult);
    expect(datum(observation)).toEqual(originalObservation);
    expect(await fs.readFile(path.join(verifier, "verify.py"), "utf8")).toBe(script);
    expect(git(verifier, "rev-parse", "HEAD")).toBe(verifierCommit);
    expect(cli(["execution", "settlement", "failed-run"]).value.evidence).toBe(failed.execution.value.evidence);

    // Changing intent still needs independently applicable verification, even after a successful correction.
    const nextExp = guidance("revise-experiment-from-feedback", feedbackId), nextCandidate = nextExp.candidates[0];
    nextCandidate.payload = {...exp.payload, criterion: "Print a different readiness signal"};
    const otherExp = (await submit(nextExp, "other-experiment", nextCandidate)).revisions[0];
    const mismatch = guidance("prepare-prototype", otherExp), mismatchCandidate = mismatch.candidates[0];
    mismatchCandidate.payload = corrected.payload;
    mismatchCandidate.links.push({type: "verification", target: activity});
    expect(JSON.stringify(await submit(mismatch, "mismatched-intent", mismatchCandidate, undefined, 1))).toContain("exact intent");
    Object.assign(identities, {experiment: expId, activity, verifierCommit, failedTrial, correctedTrial, wrongSource, correctedSource, failedResult: failed.resultId, passedResult: passed.resultId, observation, passingObservation});
    outcome = "passed";
  } finally {
    await fs.mkdir(path.dirname(evidenceFile), {recursive: true});
    await fs.writeFile(evidenceFile, JSON.stringify({outcome, executable, repository, product, verifier, identities, commands}, null, 2));
    process.stdout.write(`PROTOTYPE_CORRECTION_EVIDENCE ${evidenceFile}\n`);
  }
}, 120_000);
