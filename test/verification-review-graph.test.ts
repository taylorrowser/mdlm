import {execFileSync} from "node:child_process";
import {mkdtemp, writeFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";
import {loadProcessPackage, type DatumEnvelope} from "../src/index.js";
import {buildDirectReviewContext} from "../src/direct-review-context.js";
import {verificationAuthoringContext} from "../src/independent-verification.js";
import type {DirectContext} from "../src/direct-contract.js";

test("activity review includes its exact authoring graph without expanding verification targets or product access", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/iterative"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  const repository = await mkdtemp(path.join(os.tmpdir(), "mdlm-review-graph-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", repository, ...args], {encoding: "utf8"}).trim();
  const datum = (type: string, name: string): DatumEnvelope => ({id: `${type}-${name}`, revision: 1, revision_id: `${type}-${name}-r00001`, type, payload: {}, links: [], body: "Exact context", created_by: {process_ref: "fixture"}});
  try {
    git("init", "-q");
    await writeFile(path.join(repository, "verify.js"), "// Public assertions live here.\n");
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "Verifier");
    const parent = {...datum("REQ", "parent"), payload: {kind: "stakeholder", rationale: "Keep the website separate from the API"}};
    const child = {...datum("REQ", "child"), payload: {kind: "software"}};
    const group = {...datum("DCP", "group"), links: [{type: "parent", target: parent.revision_id}, {type: "child", target: child.revision_id}]};
    const set = {...datum("RQS", "set"), links: [parent, child].map(d => ({type: "contains", target: d.revision_id})).concat({type: "decomposition", target: group.revision_id})};
    const newerSet = {...set, revision: 2, revision_id: `${set.id}-r00002`};
    const unrelated = {...set, ...datum("RQS", "unrelated"), links: set.links};
    const criterion = datum("EXP", "criterion");
    const activity = {...datum("VFY", "activity"), payload: {repository_path: repository, source_commit: git("rev-parse", "HEAD"), authoring_subject: set.revision_id}, links: [{type: "verifies", target: child.revision_id}]};
    const context: DirectContext = {root: repository, pkg: loaded.package, package: {reference: "fixture@1", digest: "fixture", language: "fixture"}, snapshot: "exact", action: loaded.package.actions["review-verification"]!, subject: activity.revision_id, inputs: {activity: [activity.revision_id]}, data: [parent, child, group, set, newerSet, unrelated, criterion, activity]};
    const authoring = verificationAuthoringContext(context, set.revision_id);
    activity.payload = {...activity.payload, authoring_context: authoring.authoringContext} as typeof activity.payload;
    const original = JSON.stringify(context);
    const reviewed = await buildDirectReviewContext(context);
    expect(reviewed.requirementGraphs).toHaveLength(1);
    expect(reviewed.requirementGraphs[0]).toMatchObject({selection: set.revision_id, groups: [group], requirements: [{...parent, leaf: false}, {...child, leaf: true}]});
    expect(reviewed).toMatchObject({action: context.action, subject: context.subject, inputs: context.inputs, sources: [], sourceScopes: []});
    expect(reviewed.records.find(d => d.revision_id === activity.revision_id)).toEqual(activity);
    expect(reviewed.records.find(d => d.revision_id === activity.revision_id)!.links).toEqual([{type: "verifies", target: child.revision_id}]);
    expect(reviewed.verifierSources?.[0]?.files).toEqual([{path: "verify.js", blob: git("rev-parse", "HEAD:verify.js"), content: "// Public assertions live here.\n"}]);
    expect(JSON.stringify(context)).toBe(original);

    // A full activity and an already selected RQS still yield one graph.
    const full = {...activity, links: [parent, child].map(d => ({type: "verifies", target: d.revision_id}))};
    const duplicateSelection = await buildDirectReviewContext({...context, inputs: {...context.inputs, requirements: [set.revision_id]}, data: context.data.map(d => d === activity ? full : d)});
    expect(duplicateSelection.requirementGraphs).toHaveLength(1);
    expect(duplicateSelection.requirementGraphs).toEqual(reviewed.requirementGraphs);
    expect(duplicateSelection.records.find(d => d.revision_id === full.revision_id)).toEqual(full);

    const provisional = {...activity, payload: {...activity.payload, authoring_subject: criterion.revision_id}, links: [{type: "verifies", target: criterion.revision_id}]};
    const criterionReview = await buildDirectReviewContext({...context, data: context.data.map(d => d === activity ? provisional : d)});
    expect(criterionReview.requirementGraphs).toEqual([]);
    expect(criterionReview.sources).toEqual([]);
    expect(criterionReview.sourceScopes).toEqual([]);
    expect(criterionReview.verifierSources).toEqual(reviewed.verifierSources);
  } finally { await rm(repository, {recursive: true, force: true}); }
});
