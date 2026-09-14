import path from "node:path";
import { expect, test } from "vitest";
import { loadProcessPackage, type DatumEnvelope } from "../src/index.js";
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
