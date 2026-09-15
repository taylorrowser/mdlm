import { spawnSync, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("iterative init preserves exploration while fresh requirements retain optional exact origins", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-iterative-public-"));
  const repository = path.join(root, "lifecycle");
  const commands: unknown[] = [];
  let outcome = "failed";
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const cli = (...args: string[]) => {
    const argv = executable.endsWith(".js") ? [process.execPath, [executable, ...args, "--json"]] as const : [executable, [...args, "--json"]] as const;
    const result = spawnSync(argv[0], argv[1], {cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 30_000, maxBuffer: 10 * 1024 * 1024});
    commands.push({args, status: result.status, stdout: result.stdout, stderr: result.stderr});
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const commit = () => {
    execFileSync("git", ["-C", repository, "add", "."]);
    execFileSync("git", ["-C", repository, "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Record fixture publication"]);
  };
  const submit = async (guidance: any, operation: string, candidates: unknown[]) => {
    const proposal = {operation, action: guidance.action, package: guidance.package, snapshot: guidance.snapshot, inputs: guidance.inputs, candidates};
    const file = path.join(root, `${operation}.json`);
    await fs.writeFile(file, JSON.stringify(proposal));
    const result = cli("proposal", "submit", file);
    expect(result.outcome).toBe("accepted");
    commit();
    return result;
  };
  try {
    expect(cli("init", repository, "--process", "iterative").ok).toBe(true);
    const initial = cli("expectations");
    expect(initial.items.map((i: any) => i.action)).toContain("frame-experiment@1");
    const framing = cli("expectations", "show", "frame-experiment@1");
    const exp = framing.candidates[0];
    exp.payload = {...exp.payload, title: "Count supplied items", criterion: "Report the supplied item count", question: "Which behavior should be retained?", approach: "Prototype a counter", constraints: "Formatting remains provisional", allowance_minutes: 5, scope_cut: "No persistence"};
    const framed = await submit(framing, "iterative-frame", [exp]);
    const origin = framed.revisions[0];
    const original = cli("show", origin).lifecycleDatum.datum;
    const g = cli("expectations", "show", "draft-requirements@1");
    expect(g.inputs.experiment).toEqual([origin]);
    const req = (localId: string, payload: object, links: unknown[] = []) => ({localId, type: "REQ", payload: {title: localId, publication: "recorded", ...payload}, links, body: ""});
    const result = await submit(g, "iterative-requirements", [
      req("need", {kind: "stakeholder", statement: "The user shall receive the supplied item count", rationale: "Counting is the retained useful behavior"}, [{type: "informed-by", target: origin}]),
      req("count", {kind: "software", ears: {pattern: "ubiquitous", system: "The counter", response: "return the number of supplied items"}}, [{type: "informed-by", target: origin}]),
      req("empty", {kind: "software", ears: {pattern: "event", event: "no items are supplied", system: "The counter", response: "return zero"}, rationale: "Necessary empty-input boundary, without a separate design predecessor"}),
      {localId: "group", type: "DCP", payload: {title: "Counting behavior", publication: "recorded"}, links: [{type: "parent", target: "$need"}, {type: "child", target: "$count"}, {type: "child", target: "$empty"}], body: ""},
      g.candidates.find((c: any) => c.type === "RQS"),
    ]);
    const selection = result.revisions.find((id: string) => id.startsWith("RQS-"));
    const review = cli("review", "context", "review-requirements@2", selection);
    expect(review.requirementGraphs[0].selection).toBe(selection);
    expect(review.requirementGraphs[0].assessment.sourceScopes).toEqual([]);
    const requirements = review.requirementGraphs[0].requirements;
    expect(requirements).toHaveLength(3);
    expect(requirements.filter((r: any) => r.links.some((l: any) => l.type === "informed-by" && l.target === origin))).toHaveLength(2);
    expect(requirements.find((r: any) => r.payload.title === "empty").links).toEqual([]);
    expect(cli("show", origin).lifecycleDatum.datum).toEqual(original);
    const available = cli("expectations").items.map((i: any) => i.action);
    expect(available).toContain("prepare-prototype@1");
    expect(available).toContain("review-requirements@2");
    outcome = "passed";
  } finally {
    await fs.writeFile(path.join(root, "outcome.json"), JSON.stringify({outcome, executable, repository, commands}, null, 2));
    process.stdout.write(`ITERATIVE_PUBLIC_EVIDENCE ${path.join(root, "outcome.json")}\n`);
    // Preserve exact proposals, responses and lifecycle on either outcome for audit.
  }
}, 90_000);
