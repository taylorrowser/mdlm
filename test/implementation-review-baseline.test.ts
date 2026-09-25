import {execFileSync} from "node:child_process";
import {mkdtemp, writeFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterAll, beforeAll, expect, test} from "vitest";
import {loadProcessPackage, type DatumEnvelope} from "../src/index.js";
import {buildDirectReviewContext} from "../src/direct-review-context.js";
import {sourceAssessmentTargets} from "../src/direct-guidance.js";
import type {DirectContext} from "../src/direct-contract.js";

const datum = (type: string, name: string, revision = 1): DatumEnvelope => ({id: `${type}-${name}`, revision, revision_id: `${type}-${name}-r${String(revision).padStart(5, "0")}`, type, payload: {}, links: [], body: "Exact fixture", created_by: {process_ref: "fixture"}});
const link = (type: string, target: DatumEnvelope) => ({type, target: target.revision_id});
let context: DirectContext, repository: string, accepted: DatumEnvelope, previous: DatumEnvelope, current: DatumEnvelope, set: DatumEnvelope, change: DatumEnvelope, acceptance: DatumEnvelope, oldScope: DatumEnvelope;
beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/iterative"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  repository = await mkdtemp(path.join(os.tmpdir(), "mdlm-review-baseline-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", repository, ...args], {encoding: "utf8"}).trim();
  git("init", "-q");
  const commit = async (content: string) => {
    await writeFile(path.join(repository, "app.js"), content);
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", content.trim());
    return git("rev-parse", "HEAD");
  };
  const a = await commit("export const answer = 'A';\n"), b = await commit("export const answer = 'B';\n");
  const oldRequirement = {...datum("REQ", "behavior"), payload: {kind: "software", statement: "A"}};
  const requirement = {...datum("REQ", "behavior", 2), payload: {kind: "software", statement: "B"}};
  const parent = {...datum("REQ", "purpose"), payload: {kind: "stakeholder", statement: "Provide the answer"}};
  const oldGroup = {...datum("DCP", "allocation"), links: [link("parent", parent), link("child", oldRequirement)]};
  const group = {...datum("DCP", "allocation", 2), links: [link("parent", parent), link("child", requirement)]};
  const oldSet = {...datum("RQS", "selection", 4), links: [link("contains", parent), link("contains", oldRequirement), link("decomposition", oldGroup)]};
  accepted = {...datum("IMP", "product", 4), payload: {repository_path: repository, source_commit: a, file_roles: {"app.js": "production"}}, links: [link("implements", oldSet)]};
  acceptance = {...datum("ACC", "baseline"), payload: {decision: "accept"}, links: [link("accepts", accepted), link("confirms", oldSet)]};
  change = {...datum("CHG", "request"), links: [link("baseline", acceptance), link("changes", oldRequirement)]};
  set = {...datum("RQS", "selection", 5), links: [link("contains", parent), link("contains", requirement), link("decomposition", group), link("changes-under", change)]};
  previous = {...datum("IMP", "product", 5), payload: {...accepted.payload, source_commit: b}, links: [link("implements", set), link("changes-under", change)]};
  current = {...datum("IMP", "product", 6), payload: {...previous.payload, source_changes: {baseline_implementation: previous.revision_id, files: []}}, links: previous.links};
  const scope = (implementation: DatumEnvelope, requirement: DatumEnvelope) => ({...datum("SCP", `scope${implementation.revision}`), payload: {path: "app.js", name: "answer", role: "production", blob: git("rev-parse", `${implementation.payload.source_commit}:app.js`), source_commit: implementation.payload.source_commit, ranges: [{start: 1, end: 1}]}, links: [link("belongs-to", implementation), link("implements", requirement)]});
  oldScope = scope(accepted, oldRequirement);
  // A newer, unrelated acceptance must never become this change's baseline.
  const laterAcceptance = {...datum("ACC", "later", 9), payload: {decision: "accept"}, links: [link("accepts", previous), link("confirms", set)]};
  context = {root: repository, pkg: loaded.package, package: {reference: "fixture@1", digest: "fixture", language: "fixture"}, snapshot: "exact", action: loaded.package.actions["review-implementation"]!, subject: current.revision_id, inputs: {subject: [current.revision_id], requirements: [set.revision_id]}, data: [parent, oldGroup, group, oldRequirement, requirement, oldSet, set, accepted, previous, current, acceptance, change, oldScope, scope(previous, requirement), scope(current, requirement), laterAcceptance]};
});
afterAll(async () => { await rm(repository, {recursive: true, force: true}); });

test("accepted A remains visible when the nearest B to B source comparison is empty", async () => {
  const original = JSON.stringify(context);
  const reviewed = await buildDirectReviewContext(context);
  expect(reviewed.sourceScopes[0]).toMatchObject({implementation: current.revision_id, changes: current.payload.source_changes, comparison: {before: previous.revision_id, after: current.revision_id, diagnostics: [], differences: []}, acceptedBaseline: {requirements: set, change, acceptance, implementation: accepted, scopes: [oldScope], source: {implementation: accepted.revision_id, sourceCommit: accepted.payload.source_commit, files: [{path: "app.js", content: "export const answer = 'A';\n", formal: true}]}, comparison: {before: accepted.revision_id, after: current.revision_id, diagnostics: [], differences: [{status: "changed"}]}}});
  expect(reviewed.sources).toHaveLength(1);
  expect(reviewed.sources[0]?.sourceCommit).toBe(current.payload.source_commit);
  expect(reviewed.sourceAssessmentTargets).toEqual(sourceAssessmentTargets(context));
  expect(reviewed.sourceAssessmentTargets?.sourceScopes).toEqual([oldScope.revision_id]);
  expect(reviewed).toMatchObject({action: context.action, subject: context.subject, inputs: context.inputs});
  expect(reviewed.records.map(d => d.revision_id)).toEqual(context.data.filter(d => Object.values(context.inputs).flat().includes(d.revision_id)).map(d => d.revision_id));
  expect(JSON.stringify(context)).toBe(original);
});

test("first baseline and non-review implementation contexts gain no acceptedBaseline", async () => {
  const first = {...context, subject: accepted.revision_id, inputs: {subject: [accepted.revision_id]}};
  expect((await buildDirectReviewContext(first)).sourceScopes[0]).not.toHaveProperty("acceptedBaseline");
  expect((await buildDirectReviewContext({...context, action: {...context.action, capability: "implementation"}})).sourceScopes[0]).not.toHaveProperty("acceptedBaseline");
});

test("missing or conflicting exact baseline references fail rather than selecting a later acceptance", async () => {
  for (const missing of [change, acceptance, accepted]) {
    await expect(buildDirectReviewContext({...context, data: context.data.filter(d => d !== missing)})).rejects.toThrow(/Accepted baseline/);
  }
  for (const owner of [current, set, change, acceptance]) {
    const relation = owner === current ? "implements" : owner === set ? "changes-under" : owner === change ? "baseline" : "accepts";
    const conflict = {...owner, links: [...owner.links, {type: relation, target: "conflicting-exact-revision"}]};
    await expect(buildDirectReviewContext({...context, data: context.data.map(d => d === owner ? conflict : d)})).rejects.toThrow(/Accepted baseline/);
  }
  await expect(buildDirectReviewContext({...context, data: context.data.map(d => d === acceptance ? {...d, payload: {decision: "reject"}} : d)})).rejects.toThrow(/Accepted baseline/);
});

test("activity review retains its graph and verifier while excluding available baseline product source", async () => {
  const verifier = await mkdtemp(path.join(os.tmpdir(), "mdlm-baseline-verifier-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", verifier, ...args], {encoding: "utf8"}).trim();
  try {
    git("init", "-q");
    await writeFile(path.join(verifier, "verify.js"), "// Requirement-derived public checks.\n");
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Verifier");
    const activity = {...datum("VFY", "activity"), payload: {repository_path: verifier, source_commit: git("rev-parse", "HEAD"), authoring_subject: set.revision_id}, links: [{type: "verifies", target: "REQ-behavior-r00002"}]};
    const reviewed = await buildDirectReviewContext({...context, subject: activity.revision_id, action: context.pkg.actions["review-verification"]!, inputs: {activity: [activity.revision_id]}, data: [...context.data, activity]});
    expect(reviewed.sources).toEqual([]);
    expect(reviewed.sourceScopes).toEqual([]);
    expect(reviewed.sourceAssessmentTargets).toBeUndefined();
    expect(reviewed.records.some(d => ["IMP", "SCP", "ACC", "CHG"].includes(d.type))).toBe(false);
    expect(reviewed.requirementGraphs.map(graph => graph.selection)).toEqual([set.revision_id]);
    expect(reviewed.verifierSources?.[0]?.files[0]?.content).toBe("// Requirement-derived public checks.\n");
    expect(JSON.stringify(reviewed)).not.toContain("export const answer");
  } finally { await rm(verifier, {recursive: true, force: true}); }
});
