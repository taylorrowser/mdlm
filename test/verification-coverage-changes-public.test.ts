import {execFileSync, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("review export compares removed cases with surviving exact targets without rejecting replacements", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-coverage-changes-"));
  const repository = path.join(root, "lifecycle"), verifier = path.join(root, "verifier");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const evidenceFile = process.env.MDLM_COVERAGE_CHANGES_EVIDENCE ?? path.join(os.tmpdir(), "mdlm-coverage-changes-evidence", `${path.basename(root)}.json`);
  const commands: unknown[] = [], identities: Record<string, unknown> = {};
  let outcome = "failed";
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  const commit = (cwd: string) => {
    git(cwd, "add", ".");
    git(cwd, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Coverage fixture");
    return git(cwd, "rev-parse", "HEAD");
  };
  const cli = (args: string[]) => {
    const result = spawnSync(process.execPath, [executable, ...args, "--json"], {cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024});
    commands.push({args, exit: result.status, stdout: result.stdout, stderr: result.stderr});
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const guidance = (action: string, subject?: string) => cli(["expectations", "show", action, ...(subject ? [subject] : [])]);
  const datum = (id: string) => cli(["show", id]).lifecycleDatum.datum;
  const submit = async (g: any, operation: string, candidates: any[], authority = false) => {
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: g.action, package: g.package, snapshot: g.snapshot, ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates, ...(authority ? {evidence: {authority: ["stakeholder"]}} : {})}));
    const result = cli(["proposal", "submit", file, ...(authority ? ["--authority", "stakeholder"] : [])]);
    expect(result.outcome).toBe("accepted");
    commit(repository);
    return result.revisions as string[];
  };
  const reviewContext = async (activity: string, name: string) => {
    const file = path.join(root, `${name}.json`);
    cli(["review", "context", "review-verification", activity, "--output", file]);
    return JSON.parse(await fs.readFile(file, "utf8"));
  };
  try {
    identities.sourceCommit = git(process.cwd(), "rev-parse", "HEAD");
    identities.sourceDiff = git(process.cwd(), "diff", "HEAD");
    identities.executableSha256 = createHash("sha256").update(await fs.readFile(executable)).digest("hex");
    cli(["init", repository, "--process", "iterative"]);
    await fs.mkdir(verifier); git(verifier, "init", "-q");
    await fs.writeFile(path.join(verifier, "verify.js"), "// Independent public verification fixture.\n");
    const oldCommit = commit(verifier);
    const frame = guidance("frame-experiment");
    identities.package = frame.package;
    frame.candidates[0].payload = {...frame.candidates[0].payload, title: "Hold service", criterion: "Observe saved expiry", question: "Can holds expire?", approach: "Public requests", constraints: "No source access", allowance_minutes: 5, scope_cut: "No persistence implementation"};
    await submit(frame, "frame", frame.candidates);
    const draft = guidance("draft-requirements");
    const req = (localId: string, response: string) => ({localId, type: "REQ", payload: {title: localId, publication: "recorded", kind: "software", ears: {pattern: "ubiquitous", system: "The service", response}}, links: [], body: ""});
    const initial = await submit(draft, "requirements", [
      {localId: "need", type: "REQ", payload: {title: "need", publication: "recorded", kind: "stakeholder", statement: "The holder shall manage a hold", rationale: "Public hold behavior"}, links: [], body: ""},
      req("saved", "retain the saved expiry"), req("client", "show the hold status"), req("extension", "extend a hold"),
      {localId: "group", type: "DCP", payload: {title: "Hold behavior", publication: "recorded"}, links: [{type: "parent", target: "$need"}, ...["saved", "client", "extension"].map(id => ({type: "child", target: `$${id}`}))], body: ""},
      draft.candidates.find((c: any) => c.type === "RQS"),
    ]);
    const set = initial.find(id => id.startsWith("RQS-"))!;
    const requirements = initial.filter(id => id.startsWith("REQ-")).map(datum);
    const saved = requirements.find(r => r.payload.title === "saved"), client = requirements.find(r => r.payload.title === "client"), extension = requirements.find(r => r.payload.title === "extension");
    const group = datum(initial.find(id => id.startsWith("DCP-"))!);
    const oldAuthoring = cli(["verification", "context", set]);
    const verificationCase = (id: string, targets: string[]) => ({id, targets, preconditions: ["A hold exists"], actions: ["Observe the public hold"], expected_results: ["Its required state is visible"], coverage_rationale: "Observes the declared behavior"});
    const mixed = verificationCase("mixed", [extension.revision_id, saved.revision_id, client.revision_id]);
    const retired = verificationCase("retired-only", [extension.revision_id]);
    const planActivity = async (action: string, subject: string, operation: string, selection: string, authoring: any, cases: any[], sourceCommit: string) => {
      const g = guidance(action, subject), c = g.candidates[0];
      const targets = [...new Set<string>(cases.flatMap(c => c.targets))];
      c.payload = {...c.payload, title: "Hold observations", method: "Public API checks", objective: "Observe hold behavior", authoring_subject: selection, authoring_context: authoring.authoringContext, repository_path: verifier, source_commit: sourceCommit, verification_image: "node@sha256:" + "b".repeat(64), verification_command: ["node", "verify.js"], verification_script: "verify.js", results_path: "results.json", cases, coverage: targets.map(target => ({target, obligations: ["Observe public state"], case_ids: cases.filter(c => c.targets.includes(target)).map(c => c.id), rationale: "Public checks address this target"}))};
      c.links = targets.map(target => ({type: "verifies", target}));
      return (await submit(g, operation, [c]))[0]!;
    };
    const first = await planActivity("plan-verification", set, "plan", set, oldAuthoring, [mixed, retired, verificationCase("historical-only", [saved.revision_id])], oldCommit);
    expect(await reviewContext(first, "first-context")).not.toHaveProperty("verificationCoverageChanges");
    const predecessor = await planActivity("revise-verification", first, "prior-revision", set, oldAuthoring, [retired, mixed], oldCommit);
    const refine = guidance("refine-requirements", set), nextSet = refine.candidates.find((c: any) => c.type === "RQS");
    nextSet.links = [{type: "retires", target: extension.revision_id}];
    const revised = await submit(refine, "refine", [
      {localId: "client", type: "REQ", predecessor: client.revision_id, payload: {...client.payload, ears: {...client.payload.ears, response: "show hold status without extension"}}, links: [], body: ""},
      {localId: "group", type: "DCP", predecessor: group.revision_id, payload: group.payload, links: group.links.filter((l: any) => l.target !== extension.revision_id).map((l: any) => l.target === client.revision_id ? {...l, target: "$client"} : l), body: ""},
      nextSet,
    ], true);
    const currentSet = revised.find(id => id.startsWith("RQS-"))!, currentClient = revised.find(id => id.startsWith("REQ-"))!;
    const authoring = cli(["verification", "context", currentSet]);
    await fs.writeFile(path.join(verifier, "verify.js"), "// Replacement checks observe saved expiry through public requests.\n");
    const currentCommit = commit(verifier);
    // Client coverage can move to another activity. An empty local replacement list is advisory only.
    const current = await planActivity("revise-verification", predecessor, "replace", currentSet, authoring, [verificationCase("replacement", [saved.revision_id])], currentCommit);
    const context = await reviewContext(current, "changed-context");
    const comparison = context.verificationCoverageChanges;
    expect(comparison).toMatchObject({
      predecessor: {activity: predecessor, authoringSubject: set, repositoryPath: verifier, sourceCommit: oldCommit},
      current: {activity: current, authoringSubject: currentSet, repositoryPath: verifier, sourceCommit: currentCommit},
      removedCases: [{caseId: "mixed", oldTargets: [...mixed.targets].sort(), retiredTargets: [extension.revision_id], survivingTargets: [
        {previousRequirement: saved.revision_id, currentRequirement: saved.revision_id, currentCaseIds: ["replacement"]},
        {previousRequirement: client.revision_id, currentRequirement: currentClient, currentCaseIds: []},
      ].sort((a, b) => a.previousRequirement.localeCompare(b.previousRequirement))}],
    });
    expect(comparison.removedCases).toHaveLength(1);
    expect(comparison.advisory).toContain("Changed coverage for review");
    expect(comparison.advisory).toContain("not proof of missing coverage or adequacy");
    expect(comparison.advisory).toContain("empty comparison");
    expect(comparison.advisory).toContain("unchanged case IDs");
    expect(context.sources).toEqual([]);
    expect(context.lineage.predecessors.map((d: any) => d.revision_id)).toEqual([first, predecessor]);
    expect(context.verifierSources[0].sourceCommit).toBe(currentCommit);
    expect((await reviewContext(current, "repeated-context")).verificationCoverageChanges).toEqual(comparison);
    const {snapshot: _beforeSnapshot, ...beforeIntent} = authoring;
    const {snapshot: _afterSnapshot, ...afterIntent} = cli(["verification", "context", currentSet]);
    expect(afterIntent).toEqual(beforeIntent);
    expect(JSON.stringify(authoring)).not.toMatch(/source_commit|repository_path|verificationCoverageChanges/);
    // A later revision with the same IDs compares only its immediate predecessor.
    const unchanged = await planActivity("revise-verification", current, "unchanged", currentSet, authoring, [verificationCase("replacement", [saved.revision_id])], currentCommit);
    expect((await reviewContext(unchanged, "unchanged-context")).verificationCoverageChanges.removedCases).toEqual([]);
    Object.assign(identities, {set, currentSet, first, predecessor, current, unchanged, oldCommit, currentCommit});
    outcome = "passed";
  } finally {
    await fs.mkdir(path.dirname(evidenceFile), {recursive: true});
    await fs.writeFile(evidenceFile, JSON.stringify({outcome, repository, executable, identities, commands}, null, 2));
    process.stdout.write(`COVERAGE_CHANGES_EVIDENCE ${evidenceFile}\n`);
  }
}, 90_000);
