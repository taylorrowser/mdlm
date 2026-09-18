import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { expect, test } from "vitest";
import { initializeRepositoryFromProcessPackage } from "../src/repository-initialization.js";

test("proposal drafts preserve selected guidance, accept authored work and reject stale drafts", async () => {
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
    const revisionAction = {...template,id:"revise-selected",subjects:'select("current-experiments@1", {})',inputs:{subject:"subject"},revises:{EXP:"subject"},when:"true"};
    await fs.writeFile(path.join(fixture,"actions","revise-selected.yaml"),stringify(revisionAction));
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
    const file = path.join(root,"proposal.json"), staleFile = path.join(root,"stale.json");
    const draft = cli("proposal","draft","second-experiment","--operation","choose-second","--output",file);
    const bytes = await fs.readFile(file);
    const proposal = JSON.parse(bytes.toString("utf8"));
    expect(proposal).toEqual({operation:"choose-second",action:guidance.action,package:guidance.package,snapshot:guidance.snapshot,inputs:guidance.inputs,candidates:guidance.candidates});
    expect(draft).toMatchObject({contract:"mdlm-proposal-draft@1",operation:proposal.operation,action:guidance.action,package:guidance.package,snapshot:guidance.snapshot,inputs:guidance.inputs,export:{path:file,bytes:bytes.length,exportSha256:createHash("sha256").update(bytes).digest("hex")}});
    expect(draft.authoring.instruction).toContain("has not been validated");
    expect(draft.authoring.guidance).toEqual(["mdlm","expectations","show",guidance.action,"--json"]);
    expect([git("status","--porcelain"),git("show-ref")]).toEqual(before);
    const rejected = (...args:string[]) => {
      const result = spawnSync(process.execPath,[path.join(process.cwd(),"dist/mdlm.js"),...args,"--json"],{cwd:repository,encoding:"utf8",timeout:30_000});
      expect(result.status,result.stdout+result.stderr).toBe(1);return JSON.parse(result.stdout);
    };
    rejected("proposal","draft",guidance.action,"--operation","preserve-existing","--output",file);
    expect(await fs.readFile(file)).toEqual(bytes);
    const candidate = proposal.candidates[0];
    candidate.payload = {...candidate.payload,title:"Selected second experiment",criterion:"Count supplied arguments",question:"Can the agent choose any eligible action?",approach:"Publish the second available experiment",constraints:"No product acceptance",allowance_minutes:5,scope_cut:"No implementation"};
    candidate.body = "Only a package-selection fixture.";
    await fs.writeFile(file,JSON.stringify(proposal));
    await fs.writeFile(staleFile,JSON.stringify({...proposal,operation:"stale-second"}));
    const submitted = cli("proposal","submit",file);
    expect(submitted.outcome).toBe("accepted");expect(submitted.revisions).toHaveLength(1);
    const {command: _submitCommand, ...accepted} = submitted;
    expect(cli("proposal","settlement",proposal.operation)).toMatchObject(accepted);
    expect(cli("expectations").items.map((item:{action:string})=>item.action)).toContain("first-experiment@1");
    const published = [git("status","--porcelain"),git("show-ref")];
    expect(rejected("proposal","submit",staleFile).diagnostics[0].message).toMatch(/snapshot/i);
    expect(cli("proposal","settlement","stale-second").outcome).toBe("not-published");
    expect([git("status","--porcelain"),git("show-ref")]).toEqual(published);
    const subject = submitted.revisions[0];
    const revisionGuidance = cli("expectations","show","revise-selected",subject);
    const revisionFile = path.join(root,"revision.json");
    cli("proposal","draft","revise-selected",subject,"--operation","revise-selected","--output",revisionFile);
    const revisionProposal = JSON.parse(await fs.readFile(revisionFile,"utf8"));
    expect(revisionProposal.candidates).toEqual(revisionGuidance.candidates);
    expect(revisionProposal.candidates[0].predecessor).toBe(subject);
    expect(revisionProposal.subject).toBe(subject);
    expect(revisionProposal.inputs).toEqual({subject:[subject]});
    expect([git("status","--porcelain"),git("show-ref")]).toEqual(published);
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
    // A small package fixture publishes origins without running a prototype journey.
    // The requirements graph, transactions and exported review use the public CLI.
    const fixture = path.join(root, "package");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), fixture, {recursive: true});
    const requirement = parse(await fs.readFile(path.join(fixture, "types/REQ.yaml"), "utf8"));
    const originLink = (id: string, types: string[]) => ({id, description: id, targets: [{kind: "datum", types, identity: "revision"}], cardinality: {minimum: 0, maximum: "many"}, freeze_resolution: "already-exact", inverse_label: `incoming-${id}`});
    requirement.outgoing_links.push(originLink("informed-by", ["EXP", "OBS"]));
    await fs.writeFile(path.join(fixture, "types/REQ.yaml"), stringify(requirement));
    for (const type of ["EXP", "OBS", "TRY"]) {
      await fs.writeFile(path.join(fixture, `types/${type}.yaml`), stringify({
        kind: "type-definition", id: type, version: 1, name: type, description: "Review origin fixture", extends: "titled-datum@1",
        lifecycle: {authorship: "authored", freeze_when: "terminal-outcome", terminal_payload_field: "publication", terminal_values: ["recorded"]},
        payload_schema: {$schema: "https://json-schema.org/draft/2020-12/schema", type: "object", required: ["publication"], properties: {publication: {const: "recorded"}}},
        outgoing_links: [originLink("observes", ["TRY"]), originLink("against", ["EXP"])], kernel_managed_payload_paths: [],
      }));
    }
    const draftAction = parse(await fs.readFile(path.join(fixture, "actions/draft-requirements.yaml"), "utf8"));
    await fs.writeFile(path.join(fixture, "actions/seed-origin.yaml"), stringify({
      kind: "action-definition", id: "seed-origin", version: 1, capability: "experiment", prompt_ref: draftAction.prompt_ref, types: ["EXP", "OBS", "TRY"], inputs: {}, when: "true",
    }));
    const initialized = await initializeRepositoryFromProcessPackage(repository, fixture);
    expect(initialized.ok, JSON.stringify(initialized)).toBe(true);
    const seed = async (type: string, title: string, links: unknown[] = [], predecessor?: string) => {
      const guidance = cli("expectations", "show", "seed-origin").value;
      const file = path.join(root, `${title}.json`);
      await fs.writeFile(file, JSON.stringify({operation: title, action: guidance.action, package: guidance.package, snapshot: guidance.snapshot, inputs: guidance.inputs,
        candidates: [{localId: "origin", type, payload: {title, publication: "recorded"}, links, body: `Exact ${title} payload`, ...(predecessor ? {predecessor} : {})}]}));
      const submitted = cli("proposal", "submit", file);
      expect(submitted.status, submitted.source).toBe(0);
      return submitted.value.revisions[0] as string;
    };
    const exp1 = await seed("EXP", "first-intent");
    const exp2 = await seed("EXP", "revised-intent", [], exp1);
    const exp3 = await seed("EXP", "current-unselected-intent", [], exp2);
    const trial = await seed("TRY", "unselected-product", [{type: "against", target: exp3}]);
    const obs1 = await seed("OBS", "first-observation", [{type: "observes", target: trial}, {type: "against", target: exp3}]);
    const obs2 = await seed("OBS", "second-observation", [{type: "observes", target: trial}]);
    const origins = [exp1, exp2, obs1, obs2].map(id => cli("show", id).value.lifecycleDatum.datum);
    const guidance = cli("expectations", "show", "draft-requirements").value;
    const candidates = [
      {localId: "need", type: "REQ", payload: {title: "Counting", publication: "recorded", kind: "stakeholder", statement: "The user shall receive a count", rationale: "Count supplied items"}, links: [exp1, obs1].map(target => ({type: "informed-by", target})), body: ""},
      {localId: "count", type: "REQ", payload: {title: "Count items", publication: "recorded", kind: "software", ears: {pattern: "ubiquitous", system: "The counter", response: "return the supplied item count"}}, links: [exp1, exp2, obs2].map(target => ({type: "informed-by", target})), body: ""},
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
    const reviewGuidance = cli("expectations", "show", action, subject).value;
    const reviewDraft = cli("proposal", "draft", action, subject, "--operation", "draft-review", "--output", "review-draft.json");
    expect(reviewDraft.status, reviewDraft.source).toBe(0);
    const reviewProposal = JSON.parse(await fs.readFile(path.join(repository,"review-draft.json"),"utf8"));
    expect(reviewProposal).toEqual({operation:"draft-review",action,subject,package:reviewGuidance.package,snapshot:reviewGuidance.snapshot,inputs:reviewGuidance.inputs,candidates:reviewGuidance.candidates});
    expect(reviewProposal.candidates[0].links).not.toHaveLength(0);
    expect(reviewProposal).not.toHaveProperty("evidence");
    const args = ["review", "context", action, subject];
    const ordinary = cli(...args);
    expect(ordinary.status, ordinary.source).toBe(0);
    const file = path.join(repository, "review-context.json");
    const exported = cli(...args, "--output", "review-context.json");
    expect(exported.status, exported.source).toBe(0);
    const bytes = await fs.readFile(file);
    expect(bytes.toString("utf8")).toBe(ordinary.source);
    const saved = JSON.parse(bytes.toString("utf8"));
    expect(saved.records.filter((record: {type: string}) => ["EXP", "OBS"].includes(record.type))).toEqual(expect.arrayContaining(origins));
    expect(saved.records.map((record: {revision_id: string}) => record.revision_id).sort()).toEqual([subject, exp1, exp2, obs1, obs2].sort());
    expect(saved.sources).toEqual([]);
    expect(saved.sourceScopes).toEqual([]);
    expect(saved.verifierSources ?? []).toEqual([]);
    expect(saved.verificationReceipts).toEqual([]);
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
