import {execFileSync, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("stakeholder refinement preserves reviewed history and requires successor review", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-preacceptance-refinement-"));
  const repository = path.join(root, "lifecycle"), registry = path.join(root, "reviews");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const evidenceFile = process.env.MDLM_REFINEMENT_EVIDENCE ?? path.join(os.tmpdir(), "mdlm-refinement-evidence", `${path.basename(root)}.json`);
  const commands: unknown[] = [], identities: Record<string, unknown> = {};
  let outcome = "failed";
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  const commit = () => {
    git(repository, "add", ".");
    git(repository, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Preserve refinement fixture");
  };
  const cli = (args: string[], exit = 0, manager = false) => {
    const result = spawnSync(process.execPath, [executable, ...args, "--json"], {cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 30_000, maxBuffer: 10 * 1024 * 1024, env: {...process.env, MDLM_REVIEW_REGISTRY: registry, MDLM_REVIEW_REGISTRAR: manager ? "1" : "0"}});
    commands.push({args, exit: result.status, stdout: result.stdout, stderr: result.stderr});
    expect(result.status, result.stdout + result.stderr).toBe(exit);
    return JSON.parse(result.stdout);
  };
  const guidance = (action: string, subject?: string) => cli(["expectations", "show", action, ...(subject ? [subject] : [])]);
  const datum = (id: string) => cli(["show", id]).lifecycleDatum.datum;
  const submit = async (g: any, operation: string, candidates: any[], authority = false, review = false, exit = 0) => {
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: g.action, package: g.package, snapshot: g.snapshot, ...(g.subject ? {subject: g.subject} : {}), inputs: g.inputs, candidates, ...(authority ? {evidence: {authority: ["stakeholder"]}} : {})}));
    if (review) cli(["review", "register", file, file], 0, true);
    const result = cli(["proposal", "submit", file, ...(authority ? ["--authority", "stakeholder"] : [])], exit);
    if (!exit) { expect(result.outcome).toBe("accepted"); commit(); }
    return result;
  };
  const review = async (subject: string, operation: string) => {
    const g = guidance("review-requirements", subject), context = cli(["review", "context", "review-requirements", subject]);
    const graph = context.requirementGraphs[0], c = g.candidates[0];
    c.payload = {...c.payload, title: "Independent fixture review", outcome: "pass", findings: "The exact required statements and decomposition establish the clarified public behavior",
      requirement_assessments: graph.assessment.requirements.map((requirement: string) => ({requirement, disposition: "valid", rationale: "Necessary public behavior"})),
      decomposition_assessments: graph.assessment.groups.map((d: any) => ({group: d.revision, children: d.children.map((requirement: string) => ({requirement, disposition: "valid", rationale: "Child satisfies its exact parent"})), disposition: "adequate", membership_action: "none", rationale: "Selected children collectively establish the parent"}))};
    return {result: await submit(g, operation, [c], false, true), context};
  };
  try {
    identities.sourceCommit = git(process.cwd(), "rev-parse", "HEAD");
    identities.sourceTree = git(process.cwd(), "rev-parse", "HEAD^{tree}");
    identities.executableSha256 = createHash("sha256").update(await fs.readFile(executable)).digest("hex");
    cli(["init", repository, "--process", "iterative"]);
    await fs.mkdir(registry);
    const frame = guidance("frame-experiment"), exp = frame.candidates[0];
    identities.package = frame.package;
    exp.payload = {...exp.payload, title: "Count supplied items", criterion: "Report the supplied count", question: "Can callers score independent requests?", approach: "A stateless public command", constraints: "No saved histories", allowance_minutes: 5, scope_cut: "One request at a time"};
    await submit(frame, "frame", [exp]);
    const draft = guidance("draft-requirements");
    const req = (localId: string, payload: object) => ({localId, type: "REQ", payload: {title: localId, publication: "recorded", ...payload}, links: [], body: ""});
    const first = await submit(draft, "requirements", [
      req("need", {kind: "stakeholder", statement: "The caller shall receive an independent count for each supplied request", rationale: "The caller owns request history"}),
      req("count", {kind: "software", ears: {pattern: "ubiquitous", system: "The counter", response: "return the supplied item count without storing request data"}}),
      req("empty", {kind: "software", ears: {pattern: "event", event: "no items are supplied", system: "The counter", response: "return zero"}}),
      {localId: "group", type: "DCP", payload: {title: "Count behavior", publication: "recorded"}, links: [{type: "parent", target: "$need"}, {type: "child", target: "$count"}, {type: "child", target: "$empty"}], body: ""},
      draft.candidates.find((c: any) => c.type === "RQS"),
    ]);
    const set = first.revisions.find((id: string) => id.startsWith("RQS-"));
    const originalData = first.revisions.map(datum);
    const count = originalData.find((d: any) => d.type === "REQ" && d.payload.title === "count");
    const group = originalData.find((d: any) => d.type === "DCP");
    const passed = await review(set, "review-first");
    const priorReview = datum(passed.result.revisions[0]);
    const before = cli(["verification", "context", set]);
    expect(cli(["expectations"]).optional).toContainEqual(expect.objectContaining({action: expect.stringMatching(/^refine-requirements@/), subject: set}));
    const refine = guidance("refine-requirements", set);
    expect(refine.authority).toEqual({kind: "stakeholder", name: "stakeholder"});
    const nextSet = refine.candidates.find((c: any) => c.type === "RQS");
    expect(nextSet.predecessor).toBe(set);
    const nextCount = {localId: "count", type: "REQ", predecessor: count.revision_id, payload: {...count.payload, ears: {...count.payload.ears, response: "return the supplied item count independently of all earlier requests"}, rationale: "Stakeholder clarified that independent responses and caller-owned history are required; internal storage is not constrained"}, links: count.links, body: ""};
    const denied = await submit(refine, "missing-authority", [nextCount, nextSet], false, false, 1);
    expect(JSON.stringify(denied)).toContain("explicit authority");
    const refined = await submit(refine, "refine", [nextCount, nextSet], true);
    const successor = refined.revisions.find((id: string) => id.startsWith("RQS-"));
    const revisedCount = refined.revisions.find((id: string) => id.startsWith("REQ-"));
    const revisedGroup = datum(refined.revisions.find((id: string) => id.startsWith("DCP-")));
    expect(datum(successor).id).toBe(datum(set).id);
    expect(datum(revisedCount).id).toBe(count.id);
    expect(revisedGroup.id).toBe(group.id);
    expect(revisedGroup.links).toContainEqual({type: "child", target: revisedCount});
    for (const old of [...originalData, priorReview]) expect(datum(old.revision_id)).toEqual(old);
    const selected = datum(successor).links.filter((l: any) => l.type === "contains").map((l: any) => l.target);
    expect(selected).toEqual(expect.arrayContaining(originalData.filter((d: any) => d.type === "REQ" && d.id !== count.id).map((d: any) => d.revision_id)));
    expect(selected).not.toContain(count.revision_id);
    const expectations = cli(["expectations"]);
    expect(expectations.items).toContainEqual(expect.objectContaining({action: expect.stringMatching(/^review-requirements@/), subject: successor}));
    expect(expectations.items.some((i: any) => i.action.startsWith("implement-product@") && i.subject === successor)).toBe(false);
    expect(expectations.items.some((i: any) => i.action.startsWith("accept-product@"))).toBe(false);
    const after = cli(["verification", "context", successor]);
    expect(after.authoringContext).not.toBe(before.authoringContext);
    expect(after.requirements.map((r: any) => r.revision_id)).toEqual(expect.arrayContaining(selected));
    expect(cli(["verification", "context", set]).authoringContext).toBe(before.authoringContext);
    const secondReview = await review(successor, "review-successor");
    expect(secondReview.context.requirementGraphs[0].assessment.requirements).toEqual([revisedCount]);
    expect(secondReview.context.requirementGraphs[0].assessment.groups.map((g: any) => g.revision)).toEqual([revisedGroup.revision_id]);
    expect(cli(["expectations"]).items).toContainEqual(expect.objectContaining({action: expect.stringMatching(/^implement-product@/), subject: successor}));
    Object.assign(identities, {set, successor, priorReview: priorReview.revision_id, successorReview: secondReview.result.revisions[0]});
    outcome = "passed";
  } finally {
    await fs.mkdir(path.dirname(evidenceFile), {recursive: true});
    await fs.writeFile(evidenceFile, JSON.stringify({outcome, executable, repository, registry, identities, commands}, null, 2));
    process.stdout.write(`REFINEMENT_EVIDENCE ${evidenceFile}\n`);
  }
}, 90_000);
