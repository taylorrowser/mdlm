import {spawnSync, execFileSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

// Expectations name the real next step: a failed activity review requires its correction.
test("expectations require correction of the exact activity after a failed adequacy review", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-route-expectations-"));
  const repository = path.join(root, "lifecycle"), verifier = path.join(root, "verifier"), registry = path.join(root, "registry");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const cli = (args: string[], manager = false) => {
    const result = spawnSync(executable.endsWith(".js") ? process.execPath : executable, [...(executable.endsWith(".js") ? [executable] : []), ...args, "--json"], {
      cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 30_000,
      env: {...process.env, MDLM_REVIEW_REGISTRY: registry, MDLM_REVIEW_REGISTRAR: manager ? "1" : "0"},
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  const commit = (cwd: string) => {
    git(cwd, "add", ".");
    git(cwd, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Route fixture");
    return git(cwd, "rev-parse", "HEAD");
  };
  const guidance = (action: string, subject?: string) => cli(["expectations", "show", action, ...(subject ? [subject] : [])]);
  const proposal = async (g: any, operation: string) => {
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: g.action, package: g.package, snapshot: g.snapshot, ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates: g.candidates}));
    return file;
  };
  const submit = (file: string) => { const result = cli(["proposal", "submit", file]); expect(result.outcome).toBe("accepted"); commit(repository); return result.revisions as string[]; };
  const listing = () => { const e = cli(["expectations"]); return {items: e.items.map((i: any) => [i.action.split("@")[0], i.subject]), optional: e.optional.map((i: any) => i.action.split("@")[0]), outcome: e.outcome}; };
  try {
    cli(["init", repository, "--process", "iterative"]);
    await fs.mkdir(verifier); await fs.mkdir(registry);
    git(verifier, "init", "-q");
    await fs.writeFile(path.join(verifier, "verify.py"), "raise SystemExit(0)\n");
    const sourceCommit = commit(verifier);
    const frame = guidance("frame-experiment");
    frame.candidates[0].payload = {...frame.candidates[0].payload, title: "Seat count", criterion: "Staff see the seat count", question: "Is the count useful?", approach: "Prototype", constraints: "None", allowance_minutes: 5, scope_cut: "One count"};
    const experiment = submit(await proposal(frame, "frame"))[0]!;

    const authoring = cli(["verification", "context", experiment]);
    const plan = guidance("plan-criterion-verification", experiment);
    plan.candidates[0].payload = {...plan.candidates[0].payload, title: "Count check", method: "CLI test", objective: "Observe the count", authoring_subject: experiment, authoring_context: authoring.authoringContext, repository_path: verifier, source_commit: sourceCommit, verification_image: "python@sha256:" + "b".repeat(64), verification_command: ["python3", "verify.py"], verification_script: "verify.py", results_path: "results.json", cases: [{id: "count", targets: [experiment], preconditions: ["Fresh start"], actions: ["Ask for the count"], expected_results: ["The count is shown"], coverage_rationale: "Observes the criterion"}], coverage: [{target: experiment, obligations: ["Show the count"], case_ids: ["count"], rationale: "The case observes the criterion"}]};
    plan.candidates[0].links = [{type: "verifies", target: experiment}];
    const activity = submit(await proposal(plan, "plan"))[0]!;
    const review = guidance("review-verification", activity);
    review.candidates[0].payload = {...review.candidates[0].payload, title: "Adequacy review", outcome: "fail", findings: "The case never states which count is expected", coverage_assessments: [{target: experiment, disposition: "needs-change", rationale: "Expected result is not observable"}]};
    const reviewFile = await proposal(review, "review");
    const verdict = path.join(root, "verdict.json");
    await fs.writeFile(verdict, JSON.stringify({candidates: review.candidates}));
    cli(["review", "register", reviewFile, verdict], true);
    submit(reviewFile);
    const failed = listing();
    process.stdout.write(`ROUTE_AFTER_FAILED_REVIEW ${JSON.stringify(failed)}\n`);
    expect(failed.items).toContainEqual(["correct-verification-after-review", activity]);
    expect(failed.outcome).toBe("work-available");
    const correction = guidance("correct-verification-after-review", activity);
    expect(correction.candidates[0].predecessor).toBe(activity);

  } finally { await fs.rm(root, {recursive: true, force: true}); }
}, 90_000);
