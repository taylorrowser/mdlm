import { execFileSync, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("maintenance summary retains shared checks, missing execution and exact historical selection", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-maintenance-summary-"));
  const repository = path.join(root, "lifecycle"), product = path.join(root, "product");
  const verifier = path.join(root, "verifier"), registry = path.join(root, "reviews");
  const executable = path.join(process.cwd(), "dist/mdlm.js");
  const commands: unknown[] = [];
  let outcome = "failed";
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  const commit = (cwd: string) => {
    git(cwd, "add", ".");
    git(cwd, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Summary fixture");
    return git(cwd, "rev-parse", "HEAD");
  };
  const run = (args: string[], exit = 0, manager = false) => {
    const result = spawnSync(process.execPath, [executable, ...args], {
      cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 30_000,
      env: {...process.env, MDLM_REVIEW_REGISTRY: registry, MDLM_REVIEW_REGISTRAR: manager ? "1" : "0"},
    });
    commands.push({args, exit: result.status, stdout: result.stdout, stderr: result.stderr});
    expect(result.status, result.stdout + result.stderr).toBe(exit);
    return result.stdout;
  };
  const cli = (args: string[], manager = false) => JSON.parse(run([...args, "--json"], 0, manager));
  const guidance = (action: string, subject?: string) => cli(["expectations", "show", action, ...(subject ? [subject] : [])]);
  const submit = async (g: any, operation: string, candidates: any[], authority = false, review = false) => {
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: g.action, package: g.package, snapshot: g.snapshot,
      ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates,
      ...(authority ? {evidence: {authority: ["stakeholder"]}} : {})}));
    if (review) cli(["review", "register", file, file], true);
    const published = cli(["proposal", "submit", file, ...(authority ? ["--authority", "stakeholder"] : [])]);
    commit(repository);
    return published.revisions as string[];
  };
  try {
    cli(["init", repository, "--process", "iterative"]);
    await fs.mkdir(registry);
    for (const cwd of [product, verifier]) { await fs.mkdir(cwd); git(cwd, "init", "-q"); }
    const frame = guidance("frame-experiment"), exp = frame.candidates[0];
    exp.payload = {...exp.payload, title: "Counter", criterion: "Count items including empty input", question: "Can callers obtain counts?", approach: "One command", constraints: "No stored data", allowance_minutes: 5, scope_cut: "Count only"};
    await submit(frame, "frame", [exp]);
    const draft = guidance("draft-requirements");
    const requirement = (localId: string, payload: object) => ({localId, type: "REQ", payload: {title: localId, publication: "recorded", ...payload}, links: [], body: ""});
    const revisions = await submit(draft, "requirements", [
      requirement("need", {kind: "stakeholder", statement: "The caller shall obtain counts"}),
      requirement("ordinary", {kind: "software", ears: {pattern: "ubiquitous", system: "The counter", response: "print the item count"}}),
      requirement("empty", {kind: "software", ears: {pattern: "event", event: "no items are supplied", system: "The counter", response: "print zero"}}),
      {localId: "group", type: "DCP", payload: {title: "Counting", publication: "recorded"}, links: [{type: "parent", target: "$need"}, {type: "child", target: "$ordinary"}, {type: "child", target: "$empty"}], body: ""},
      draft.candidates.find((c: any) => c.type === "RQS"),
    ]);
    const set = revisions.find(id => id.startsWith("RQS-"))!;
    const context = cli(["verification", "context", set]);
    const byTitle = Object.fromEntries(context.requirements.map((r: any) => [r.payload.title, r]));
    const requested = byTitle.ordinary.revision_id, shared = byTitle.empty.revision_id;
    const review = guidance("review-requirements", set), r = review.candidates[0];
    const graph = cli(["review", "context", "review-requirements", set]).requirementGraphs[0];
    r.payload = {...r.payload, title: "Fixture review", outcome: "pass", findings: "Bounded count requirements",
      requirement_assessments: graph.assessment.requirements.map((requirement: string) => ({requirement, disposition: "valid", rationale: "Necessary behavior"})),
      decomposition_assessments: graph.assessment.groups.map((g: any) => ({group: g.revision, children: g.children.map((requirement: string) => ({requirement, disposition: "valid", rationale: "Necessary behavior"})), disposition: "adequate", membership_action: "none", rationale: "Covers count and empty input"}))};
    await submit(review, "review", [r], false, true);
    await fs.writeFile(path.join(verifier, "verify.py"), "# Public count expectations; this summary fixture does not execute them.\n");
    const plan = guidance("plan-verification", set), activity = plan.candidates[0];
    const cases = [
      {id: "ordinary-count", targets: [requested, byTitle.need.revision_id]},
      {id: "empty-count", targets: [shared, byTitle.need.revision_id]},
    ].map(c => ({...c, preconditions: ["Fresh process"], actions: ["Invoke the counter"], expected_results: ["The requested count is printed"], coverage_rationale: "Checks the public count"}));
    activity.payload = {...activity.payload, title: "Count checks", method: "Public command", objective: "Count items", cases,
      coverage: context.requirements.map((row: any) => ({target: row.revision_id, obligations: ["Print the requested count"], case_ids: cases.filter(c => c.targets.includes(row.revision_id)).map(c => c.id), rationale: "Exercises the requirement"})),
      repository_path: verifier, source_commit: commit(verifier), verification_image: "python@sha256:" + "a".repeat(64),
      verification_command: ["python3", "verify.py"], verification_script: "verify.py", results_path: "results.json",
      authoring_subject: set, authoring_context: context.authoringContext};
    activity.links = context.requirements.map((row: any) => ({type: "verifies", target: row.revision_id}));
    const activityId = (await submit(plan, "plan", [activity]))[0]!;
    await fs.writeFile(path.join(product, "app.py"), "import sys\nprint(len(sys.argv)-1)\n");
    const source = commit(product), implement = guidance("implement-product", set), imp = implement.candidates[0];
    imp.payload = {...imp.payload, title: "Counter", repository_path: product, source_commit: source, command: ["python3", "app.py"],
      file_roles: {"app.py": "production"}, source_ranges: [{path: "app.py", name: "Shared counting", start: 1, end: 2, requirements: [requested.split("-r")[0], shared.split("-r")[0]]}]};
    imp.links.push({type: "verification", target: activityId});
    const implementation = (await submit(implement, "implement", [imp])).find(id => id.startsWith("IMP-"))!;
    const refine = guidance("refine-requirements", set);
    const next = {localId: "ordinary", type: "REQ", predecessor: requested,
      payload: {...byTitle.ordinary.payload, ears: {...byTitle.ordinary.payload.ears, response: "print the count as a decimal integer"}}, links: [], body: ""};
    const refined = await submit(refine, "refine", [next, refine.candidates.find((c: any) => c.type === "RQS")], true);
    const successor = refined.find(id => id.startsWith("REQ-"))!;

    const args = ["trace", "impact", requested, "--implementation", implementation];
    const before = [git(repository, "status", "--porcelain"), git(repository, "show-ref")];
    const ordinary = run(args), json = run([...args, "--json"]);
    expect(ordinary).toBe(json);
    expect(JSON.parse(json)).not.toHaveProperty("summary");
    const summary = run([...args, "--summary"]);
    expect(summary).toContain(`implementation="${implementation}" selection="${set}" source_commit="${source}"`);
    expect(summary).toContain(`Shared responsibilities: [{"requirement":"${shared}"`);
    expect(summary).toContain(successor);
    expect(summary).toContain("requires-reassessment");
    expect(summary).toContain("Historical passing evidence does not verify a successor.");
    expect(summary).toContain("Shared responsibilities do not mark other requirements changed");
    const section = (id: string) => summary.split(`${id} [`)[1]!.split("\n\n")[0]!;
    const association = (id: string) => {
      const ref = /Requirement-specific activity associations: (A\d+)/.exec(section(id))![1]!;
      return summary.split("\n").find(line => line.startsWith(`${ref}: `))!;
    };
    expect(association(requested)).toContain('"id":"ordinary-count","outcome":"not-run"');
    expect(association(requested)).not.toContain('"id":"empty-count"');
    expect(association(shared)).toContain('"id":"empty-count","outcome":"not-run"');
    expect(association(shared)).not.toContain('"id":"ordinary-count"');
    expect(association(shared)).toContain('resultOutcome="not-run"');
    expect(summary).not.toContain(`${byTitle.need.revision_id} [related by recorded scope]`);
    expect(summary).toContain('execution="not-run"');
    expect(JSON.parse(run([...args, "--summary", "--json"], 1)).diagnostics[0].code).toBe("trace-summary-arguments-invalid");
    expect([git(repository, "status", "--porcelain"), git(repository, "show-ref")]).toEqual(before);
    outcome = "passed";
  } finally {
    await fs.writeFile(path.join(root, "outcome.json"), JSON.stringify({outcome, executable, repository, commands}, null, 2));
    process.stdout.write(`MAINTENANCE_SUMMARY_EVIDENCE ${path.join(root, "outcome.json")}\n`);
  }
}, 60_000);
