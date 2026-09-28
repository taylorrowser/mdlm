import {spawnSync, execFileSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

// Drafts one requirement set through the compiled CLI and returns the published REQ payloads.
const draft = async (root: string, name: string, requirements: (req: typeof reqCandidate) => unknown[]) => {
  const repository = path.join(root, name);
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const cli = (...args: string[]) => {
    const argv = executable.endsWith(".js") ? [process.execPath, [executable, ...args, "--json"]] as const : [executable, [...args, "--json"]] as const;
    const result = spawnSync(argv[0], argv[1], {cwd: args[0] === "init" ? root : repository, encoding: "utf8", timeout: 30_000, maxBuffer: 10 * 1024 * 1024});
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const submit = async (guidance: any, operation: string, candidates: unknown[]) => {
    const file = path.join(root, `${name}-${operation}.json`);
    await fs.writeFile(file, JSON.stringify({operation, action: guidance.action, package: guidance.package, snapshot: guidance.snapshot, ...(guidance.subject ? {subject: guidance.subject} : {}), inputs: guidance.inputs, candidates}));
    const result = cli("proposal", "submit", file);
    expect(result.outcome).toBe("accepted");
    execFileSync("git", ["-C", repository, "add", "."]);
    execFileSync("git", ["-C", repository, "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", operation]);
    return result;
  };
  expect(cli("init", repository, "--process", "iterative").ok).toBe(true);
  const framing = cli("expectations", "show", "frame-experiment");
  const exp = framing.candidates[0];
  exp.payload = {...exp.payload, title: "Seat count", criterion: "Staff see the seat count", question: "Which behavior is retained?", approach: "Prototype", constraints: "None", allowance_minutes: 5, scope_cut: "No history"};
  await submit(framing, "frame", [exp]);
  const guidance = cli("expectations", "show", "draft-requirements");
  const published = await submit(guidance, "requirements", [...requirements(reqCandidate), guidance.candidates.find((c: any) => c.type === "RQS")]);
  return published.revisions.filter((id: string) => id.startsWith("REQ-")).map((id: string) => cli("show", id).lifecycleDatum.datum.payload);
};
const reqCandidate = (localId: string, payload: object) => ({localId, type: "REQ", payload: {title: localId, publication: "recorded", ...payload}, links: [], body: ""});
const group = (localId: string, parent: string, children: string[]) => ({localId, type: "DCP", payload: {title: localId, publication: "recorded"}, links: [{type: "parent", target: `$${parent}`}, ...children.map(child => ({type: "child", target: `$${child}`}))], body: ""});
const ears = (system: string, response: string) => ({pattern: "ubiquitous", system, response});

test("iterative drafts a levelled two-component set and an unlevelled one-component set", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-requirement-levels-"));
  const levelled = await draft(root, "two-component", req => [
    req("need", {kind: "stakeholder", statement: "Staff see the current seat count"}),
    req("product", {kind: "software", level: "system", ears: ears("The seat product", "show staff the seat count the service stores"), rationale: "Architecture: seat service and staff client joined by an internal HTTP agreement; levels used"}),
    req("service", {kind: "software", level: "high-level", component: "seat service", ears: ears("The seat service", "return the stored seat count for a count request")}),
    req("client", {kind: "software", level: "high-level", component: "staff client", ears: ears("The staff client", "print the seat count returned by the seat service")}),
    req("runtime", {kind: "software", level: "low-level", component: "seat service", ears: ears("The seat service", "keep the seat count in one JSON file written atomically")}),
    group("need-group", "need", ["product"]),
    group("product-group", "product", ["service", "client"]),
    group("service-group", "service", ["runtime"]),
  ]);
  expect(levelled.map((p: any) => [p.title, p.level, p.component])).toEqual(expect.arrayContaining([
    ["need", undefined, undefined], ["product", "system", undefined], ["service", "high-level", "seat service"],
    ["client", "high-level", "staff client"], ["runtime", "low-level", "seat service"],
  ]));
  const plain = await draft(root, "one-component", req => [
    req("need", {kind: "stakeholder", statement: "Staff see the current seat count"}),
    req("count", {kind: "software", ears: ears("The seat counter", "print the stored seat count")}),
    group("need-group", "need", ["count"]),
  ]);
  expect(plain.every((p: any) => p.level === undefined && p.component === undefined)).toBe(true);
  await fs.rm(root, {recursive: true, force: true});
}, 90_000);
