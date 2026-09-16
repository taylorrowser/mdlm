import { spawnSync, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { expect, test } from "vitest";
import { initializeRepositoryFromProcessPackage } from "../src/repository-initialization.js";

test("the kernel accepts the second eligible action without a first-item claim", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"mdlm-direct-selection-"));
  const fixture = path.join(root,"package"), repository = path.join(root,"lifecycle");
  try {
    // Custom package paths are not a CLI init feature. Use the existing package
    // initializer for this test fixture; every lifecycle operation is public CLI.
    await fs.cp(path.join(process.cwd(),".lifecycle/exploratory"),fixture,{recursive:true});
    const template = parse(await fs.readFile(path.join(fixture,"actions/frame-experiment.yaml"),"utf8"));
    await fs.rm(path.join(fixture,"actions"),{recursive:true});await fs.mkdir(path.join(fixture,"actions"));
    for (const [id,priority] of [["first-experiment",10],["second-experiment",20]] as const) {
      await fs.writeFile(path.join(fixture,"actions",`${id}.yaml`),stringify({...template,id,priority,when:"true"}));
    }
    const manifest = parse(await fs.readFile(path.join(fixture,"manifest.yaml"),"utf8"));
    manifest.id = "mdlm-selection-fixture";manifest.terminal.when = "false";
    await fs.writeFile(path.join(fixture,"manifest.yaml"),stringify(manifest));
    const initialized = await initializeRepositoryFromProcessPackage(repository,fixture);
    expect(initialized.ok,JSON.stringify(initialized)).toBe(true);
    const cli = (...args:string[]) => {
      const result = spawnSync(process.execPath,[path.join(process.cwd(),"dist/mdlm.js"),...args,"--json"],{cwd:repository,encoding:"utf8",timeout:30_000,maxBuffer:10*1024*1024});
      expect(result.status,result.stdout+result.stderr).toBe(0);return JSON.parse(result.stdout);
    };
    const git = (...args:string[])=>execFileSync("git",["-C",repository,...args],{encoding:"utf8"});
    const before = [git("status","--porcelain"),git("show-ref")];
    const available = cli("expectations");
    expect(available.items.map((item:{action:string})=>item.action)).toEqual(["first-experiment@1","second-experiment@1"]);
    const guidance = cli("expectations","show",available.items[1].action);
    expect([git("status","--porcelain"),git("show-ref")]).toEqual(before);
    const candidate = guidance.candidates[0];
    candidate.payload = {...candidate.payload,title:"Selected second experiment",criterion:"Count supplied arguments",question:"Can the agent choose any eligible action?",approach:"Publish the second available experiment",constraints:"No product acceptance",allowance_minutes:5,scope_cut:"No implementation"};
    candidate.body = "Only a package-selection fixture.";
    const proposal = {operation:"choose-second",action:guidance.action,package:guidance.package,snapshot:guidance.snapshot,inputs:guidance.inputs,candidates:[candidate]};
    const file = path.join(root,"proposal.json");await fs.writeFile(file,JSON.stringify(proposal));
    const submitted = cli("proposal","submit",file);
    expect(submitted.outcome).toBe("accepted");expect(submitted.revisions).toHaveLength(1);
    const {command: _submitCommand, ...accepted} = submitted;
    expect(cli("proposal","settlement",proposal.operation)).toMatchObject(accepted);
    expect(cli("expectations").items.map((item:{action:string})=>item.action)).toContain("first-experiment@1");
  } finally {await fs.rm(root,{recursive:true,force:true});}
},60_000);

test("saved review context provides exact handoff metadata without replacing exports", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-review-export-"));
  const repository = path.join(root, "lifecycle");
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "dist/mdlm.js"), ...args, "--json"], {cwd: repository, encoding: "utf8", timeout: 30_000});
    expect(result.error).toBeUndefined();
    return {status: result.status, source: result.stdout, value: JSON.parse(result.stdout)};
  };
  try {
    await fs.mkdir(repository);
    expect(cli("init", repository).status).toBe(0);
    const guidance = cli("expectations", "show", "draft-requirements@1").value;
    const candidates = [
      {localId: "need", type: "REQ", payload: {title: "Counting", publication: "recorded", kind: "stakeholder", statement: "The user shall receive a count", rationale: "Count supplied items"}, links: [], body: ""},
      {localId: "count", type: "REQ", payload: {title: "Count items", publication: "recorded", kind: "software", ears: {pattern: "ubiquitous", system: "The counter", response: "return the supplied item count"}}, links: [], body: ""},
      {localId: "group", type: "DCP", payload: {title: "Counting behavior", publication: "recorded"}, links: [{type: "parent", target: "$need"}, {type: "child", target: "$count"}], body: ""},
      guidance.candidates.find((candidate: {type: string}) => candidate.type === "RQS"),
    ];
    const proposal = {operation: "prepare-export", action: guidance.action, package: guidance.package, snapshot: guidance.snapshot, inputs: guidance.inputs, candidates};
    const proposalFile = path.join(root, "proposal.json");
    await fs.writeFile(proposalFile, JSON.stringify(proposal));
    const submitted = cli("proposal", "submit", proposalFile);
    expect(submitted.status, submitted.source).toBe(0);
    const subject = submitted.value.revisions.find((id: string) => id.startsWith("RQS-"));
    const action = cli("expectations").value.items.find((item: {subject?: string}) => item.subject === subject).action;
    const args = ["review", "context", action, subject];
    const ordinary = cli(...args);
    expect(ordinary.status, ordinary.source).toBe(0);
    const file = path.join(repository, "review-context.json");
    const exported = cli(...args, "--output", "review-context.json");
    expect(exported.status, exported.source).toBe(0);
    const bytes = await fs.readFile(file);
    expect(bytes.toString("utf8")).toBe(ordinary.source);
    const {createHash} = await import("node:crypto");
    expect(exported.value).toEqual({
      ok: true, command: "review.context", contract: "mdlm-review-export@1",
      export: {path: file, bytes: bytes.length, exportSha256: createHash("sha256").update(bytes).digest("hex")},
      action, subject, snapshot: ordinary.value.snapshot, package: ordinary.value.package, diagnostics: [],
    });
    const existing = cli(...args, "--output", file);
    expect(existing.status).toBe(1);
    expect(existing.value.ok).toBe(false);
    expect(existing.value).not.toHaveProperty("export");
    expect(await fs.readFile(file)).toEqual(bytes);
    const invalid = cli("review", "context", "unknown@1", "--output", "invalid.json");
    expect(invalid.status).toBe(1);
    await expect(fs.stat(path.join(repository, "invalid.json"))).rejects.toMatchObject({code: "ENOENT"});
    expect(cli(...args, "--output", path.join(root, "missing", "export.json")).status).toBe(1);
  } finally {await fs.rm(root, {recursive: true, force: true});}
}, 60_000);
