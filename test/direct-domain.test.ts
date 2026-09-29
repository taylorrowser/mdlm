import path from "node:path";
import { expect, test } from "vitest";
import { loadProcessPackage, type DatumEnvelope } from "../src/index.js";
import { requirementAuthoringTargets } from "../src/direct-guidance.js";
import { validateChangeDatum } from "../src/change-assessment.js";
import { requirementTraceBinding } from "../src/requirement-trace.js";
import { finalizeDirectDomain } from "../src/direct-domain.js";
import type { DirectFinalizationContext } from "../src/direct-contract.js";

const datum = (type: string, n: number, revision = 1): DatumEnvelope => {
  const id = `${type}-${String(n).padStart(10, "0")}`;
  return {id, type, revision, revision_id: `${id}-r${String(revision).padStart(5,"0")}`, payload: {}, links: [], body: "Fixture", created_by: {process_ref: "test"}};
};
async function context(data: DatumEnvelope[], outputs: DatumEnvelope[]): Promise<DirectFinalizationContext> {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  const identity = {reference: "fixture@1", digest: "fixture", language: "fixture"};
  const action = {id: "requirements", version: 1, kind: "action-definition" as const, capability: "requirements" as const, types: ["REQ", "DCP", "RQS"], prompt_ref: "fixture"};
  return {root: ".", pkg: loaded.package, package: identity, snapshot: "fixture", data, action, inputs: {}, outputs,
    proposal: {operation: "domain-fixture", action: action.id, package: identity, snapshot: "fixture", candidates: []}};
}

test("atomic graph derives membership and revises group endpoints without revising unchanged children", async () => {
  const parent = {...datum("REQ",1), payload: {kind: "stakeholder"}};
  const child = {...datum("REQ",2), payload: {kind: "software"}};
  const group = {...datum("DCP",1), links: [{type: "parent", target: parent.revision_id}, {type: "child", target: child.revision_id}]};
  const set = datum("RQS",1);
  const input = [parent, child, group, set];
  const before = JSON.stringify(input);
  const initial = await finalizeDirectDomain(await context([], input));
  expect(JSON.stringify(input)).toBe(before);
  expect(initial.outputs.find(d => d.type === "RQS")?.links).toEqual(expect.arrayContaining([
    {type:"contains",target:child.revision_id}, {type:"decomposition",target:group.revision_id},
  ]));
  const revised = {...parent, revision:2, revision_id:`${parent.id}-r00002`, body:"Clarified stakeholder intention"};
  const nextSet = {...set, revision:2, revision_id:`${set.id}-r00002`};
  const next = await finalizeDirectDomain(await context(initial.outputs,[revised,nextSet]));
  expect(next.outputs.filter(d=>d.type === "REQ")).toEqual([revised]);
  expect(next.outputs.find(d=>d.type === "DCP")).toMatchObject({id:group.id,revision:2,links:expect.arrayContaining([
    {type:"parent",target:revised.revision_id},{type:"child",target:child.revision_id},
  ])});
  expect(initial.outputs.find(d=>d.type === "DCP")?.links[0]?.target).toBe(parent.revision_id);
});

test("authored source scopes and generated membership cannot bypass the deriving service", async () => {
  const set = datum("RQS",1);
  await expect(finalizeDirectDomain(await context([], [set,datum("SCP",1)]))).rejects.toThrow("trace-generated-output");
  set.links = [{type:"contains",target:"REQ-invented-r00001"}];
  await expect(finalizeDirectDomain(await context([], [set]))).rejects.toThrow("trace-generated-selection");
});

test("implementation requirement findings derive scope amendment through their exact selection", async () => {
  const parent = {...datum("REQ", 1), payload: {kind: "stakeholder"}};
  const child = {...datum("REQ", 2), payload: {kind: "software"}};
  const group = {...datum("DCP", 1), links: [{type: "parent", target: parent.revision_id}, {type: "child", target: child.revision_id}]};
  const set = {...datum("RQS", 1), links: [{type: "contains", target: parent.revision_id}, {type: "contains", target: child.revision_id}, {type: "decomposition", target: group.revision_id}]};
  const baselineProduct = {...datum("IMP", 1), links: [{type: "implements", target: set.revision_id}]};
  const baseline = {...datum("ACC", 1), payload: {decision: "accept"}, links: [{type: "confirms", target: set.revision_id}, {type: "accepts", target: baselineProduct.revision_id}]};
  const change = {...datum("CHG", 1), links: [{type: "baseline", target: baseline.revision_id}, {type: "changes", target: child.revision_id}]};
  const approval = {...datum("REV", 1), payload: {outcome: "pass"}, links: [{type: "reviews", target: change.revision_id}]};
  const current = {...set, revision: 2, revision_id: `${set.id}-r00002`, links: [...set.links, {type: "changes-under", target: change.revision_id}]};
  const product = {...datum("IMP", 1, 2), links: [{type: "implements", target: current.revision_id}, {type: "changes-under", target: change.revision_id}]};
  const data = [parent, child, group, set, baselineProduct, baseline, change, approval, current, product];
  for (const target of [parent, child]) {
    const review = {...datum("REV", 2), payload: {outcome: "fail", source_assessments: [], requirement_assessments: [{requirement: target.revision_id, disposition: "needs-change"}]}, links: [{type: "reviews", target: product.revision_id}]};
    const ctx = await context(data, [review]); ctx.action = {...ctx.action, capability: "review", types: ["REV"]};
    const finalized = await finalizeDirectDomain(ctx);
    expect(finalized.outputs[0]?.payload.scope_amendment_required).toBe(target === parent);
    expect(review.payload).not.toHaveProperty("scope_amendment_required");
  }
});


test("initial late implementation correction admits only the exact marked requirement", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/iterative"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  const parent = {...datum("REQ", 1), payload: {kind: "stakeholder"}};
  const marked = {...datum("REQ", 2), payload: {kind: "software"}};
  const peer = {...datum("REQ", 3), payload: {kind: "software"}};
  const group = {...datum("DCP", 1), links: [{type: "parent", target: parent.revision_id}, ...[marked, peer].map(r => ({type: "child", target: r.revision_id}))]};
  const set = {...datum("RQS", 1), links: [...[parent, marked, peer].map(r => ({type: "contains", target: r.revision_id})), {type: "decomposition", target: group.revision_id}]};
  const product = {...datum("IMP", 1), links: [{type: "implements", target: set.revision_id}]};
  const review = {...datum("REV", 1), payload: {outcome: "fail", requirement_assessments: [{requirement: marked.revision_id, disposition: "needs-change"}]}, links: [{type: "reviews", target: product.revision_id}]};
  const data = [parent, marked, peer, group, set, product, review];
  const revised = {...marked, revision: 2, revision_id: `${marked.id}-r00002`, body: "Require station acknowledgement."};
  const unmarked = {...peer, revision: 2, revision_id: `${peer.id}-r00002`, body: "Hide awaiting events."};
  const successor = {...datum("RQS", 1, 2), links: [{type: "corrects", target: review.revision_id}]};
  const ctx = await context(data, [revised, successor]);
  ctx.pkg = loaded.package; ctx.action = loaded.package.actions["correct-requirements-after-review"]!;
  ctx.subject = set.revision_id; ctx.inputs = {subject: [set.revision_id], failure: [review.revision_id]};
  const before = JSON.stringify(ctx);
  expect(requirementAuthoringTargets(ctx)).toMatchObject({selection: set.revision_id, failure: review.revision_id, frontier: {requirements: [marked.revision_id], groups: []}});
  const finalized = await finalizeDirectDomain(ctx);
  expect(finalized.outputs.find(d => d.type === "RQS")?.links).toEqual(expect.arrayContaining([{type: "contains", target: revised.revision_id}, {type: "contains", target: peer.revision_id}]));
  await expect(finalizeDirectDomain({...ctx, outputs: [revised, unmarked, successor]})).rejects.toThrow("change-frontier");
  expect(JSON.stringify(ctx)).toBe(before);
  // Ordinary initial refinement remains flexible; this limit belongs to the exact late failure.
  await expect(finalizeDirectDomain({...ctx, action: loaded.package.actions["refine-requirements"]!, inputs: {subject: [set.revision_id]}, outputs: [revised, unmarked, {...successor, links: []}]})).resolves.toBeDefined();
  const binding = requirementTraceBinding(loaded.package)!;
  const selected = finalized.outputs.find(d => d.type === "RQS")!;
  const successorProduct = {...datum("IMP", 1, 2), links: [{type: "implements", target: selected.revision_id}]};
  const acceptance = {...datum("ACC", 1), payload: {decision: "accept"}, links: [{type: "confirms", target: selected.revision_id}, {type: "accepts", target: successorProduct.revision_id}]};
  expect(validateChangeDatum([...data, ...finalized.outputs, successorProduct, acceptance], binding, selected)).toEqual([]);
});
