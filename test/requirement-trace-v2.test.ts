import { inspectRequirementTrace } from "../src/requirement-trace-inspection.js";
import { expect, test } from "vitest";
import type { DatumEnvelope } from "../src/index.js";
import { selectedRequirementGraph, type RequirementTraceBinding } from "../src/requirement-trace.js";

const binding: RequirementTraceBinding = {
  type: "RQS", requirement_type: "REQ", implementation_type: "IMP", scope_type: "SCP", decomposition_type: "DCP",
};
function datum(type: string, number: number, revision = 1): DatumEnvelope {
  const id = `${type}-${String(number).padStart(10, "0")}`;
  return { id, type, revision, revision_id: `${id}-r${String(revision).padStart(5, "0")}`, payload: {}, links: [], created_by: { process_ref: "test" }, body: "" };
}
function requirement(number: number, kind = "software", revision = 1): DatumEnvelope {
  return { ...datum("REQ", number, revision), payload: { kind } };
}
function group(number: number, parent: DatumEnvelope, children: DatumEnvelope[], revision = 1): DatumEnvelope {
  return { ...datum("DCP", number, revision), links: [
    { type: "parent", target: parent.revision_id },
    ...children.map(child => ({ type: "child", target: child.revision_id })),
  ] };
}
function selection(requirements: DatumEnvelope[], groups: DatumEnvelope[]): DatumEnvelope {
  return { ...datum("RQS", 1), links: [
    ...requirements.map(req => ({ type: "contains", target: req.revision_id })),
    ...groups.map(dcp => ({ type: "decomposition", target: dcp.revision_id })),
  ] };
}
function fixture() {
  const root = requirement(1, "stakeholder"), middle = requirement(2), leaf = requirement(3);
  const upper = group(1, root, [middle]), lower = group(2, middle, [leaf]);
  const requirements = [root, middle, leaf], groups = [upper, lower];
  return { root, middle, leaf, upper, lower, requirements, groups, set: selection(requirements, groups), data: [...requirements, ...groups] };
}

test("historical selection retains exact requirements and groups after later revisions", () => {
  const f = fixture();
  const revisedRoot = requirement(1, "stakeholder", 2), revisedUpper = group(1, revisedRoot, [f.middle], 2);
  const data = [...f.data, revisedRoot, revisedUpper];
  const graph = selectedRequirementGraph(data, f.set, binding);
  expect(graph.diagnostics).toEqual([]);
  expect(graph.requirements).toEqual(f.requirements);
  expect(graph.groups).toEqual(f.groups);
  expect([...graph.leaves]).toEqual([f.leaf.revision_id]);
  expect(graph.parents.get(f.middle.revision_id)).toEqual([f.root.revision_id]);
  expect(selectedRequirementGraph(data, f.set, binding, true).diagnostics.map(d => d.code)).toContain("trace-selection-stale");
});

test("parent clarification selects unchanged children and deeper groups without revision cascades", () => {
  const f = fixture();
  const revisedRoot = requirement(1, "stakeholder", 2), revisedUpper = group(1, revisedRoot, [f.middle], 2);
  const set = selection([revisedRoot, f.middle, f.leaf], [revisedUpper, f.lower]);
  const graph = selectedRequirementGraph([...f.data, revisedRoot, revisedUpper], set, binding, true);
  expect(graph.diagnostics).toEqual([]);
  expect(graph.requirements).toEqual([revisedRoot, f.middle, f.leaf]);
  expect(graph.groups).toEqual([revisedUpper, f.lower]);
  expect(graph.parents.get(f.middle.revision_id)).toEqual([revisedRoot.revision_id]);
  expect(graph.parents.get(f.leaf.revision_id)).toEqual([f.middle.revision_id]);
});

test("shared child revision binds both exact parent groups while parents remain unchanged", () => {
  const f = fixture(), sibling = requirement(4), revisedLeaf = requirement(3, "software", 2);
  const upper = group(1, f.root, [f.middle, sibling], 2);
  const first = group(2, f.middle, [revisedLeaf], 2), second = group(3, sibling, [revisedLeaf]);
  const set = selection([f.root, f.middle, revisedLeaf, sibling], [upper, first, second]);
  const graph = selectedRequirementGraph([...f.data, sibling, revisedLeaf, upper, first, second], set, binding, true);
  expect(graph.diagnostics).toEqual([]);
  expect(graph.parents.get(revisedLeaf.revision_id)).toEqual([f.middle.revision_id, sibling.revision_id]);
  expect([...graph.leaves]).toEqual([revisedLeaf.revision_id]);
  expect(graph.groups).toEqual([upper, first, second]);
});

test("an explicit empty software group leaves its parent eligible for implementation", () => {
  const root = requirement(1, "stakeholder"), leaf = requirement(2);
  const groups = [group(1, root, [leaf]), group(2, leaf, [])];
  const graph = selectedRequirementGraph([root, leaf, ...groups], selection([root, leaf], groups), binding, true);
  expect(graph.diagnostics).toEqual([]);
  expect(graph.groups).toEqual(groups);
  expect([...graph.leaves]).toEqual([leaf.revision_id]);
});

test.each([
  ["duplicate parent groups", "trace-group-duplicate", (f: ReturnType<typeof fixture>) => {
    const duplicate = group(3, f.root, [f.middle]);
    f.data.push(duplicate); f.set.links.push({ type: "decomposition", target: duplicate.revision_id });
  }],
  ["duplicate children", "trace-decomposition-duplicate", (f: ReturnType<typeof fixture>) => {
    f.upper.links.push({ type: "child", target: f.middle.revision_id });
  }],
  ["cycle", "trace-decomposition-cycle", (f: ReturnType<typeof fixture>) => {
    const cycle = group(3, f.leaf, [f.middle]);
    f.data.push(cycle); f.set.links.push({ type: "decomposition", target: cycle.revision_id });
  }],
  ["child outside selected revisions", "trace-decomposition-outside-selection", (f: ReturnType<typeof fixture>) => {
    const other = requirement(3, "software", 2);
    f.data.push(other); f.lower.links[1]!.target = other.revision_id;
  }],
  ["parent outside selected revisions", "trace-decomposition-outside-selection", (f: ReturnType<typeof fixture>) => {
    const other = requirement(1, "stakeholder", 2);
    f.data.push(other); f.upper.links[0]!.target = other.revision_id;
  }],
  ["multiple group parents", "trace-group-parent", (f: ReturnType<typeof fixture>) => {
    f.lower.links.push({ type: "parent", target: f.root.revision_id });
  }],
  ["competing requirement edges", "trace-competing-decomposition", (f: ReturnType<typeof fixture>) => {
    f.middle.links.push({ type: "decomposes", target: f.root.revision_id });
  }],
] as const)("rejects %s", (_name, code, mutate) => {
  const f = fixture();
  mutate(f);
  expect(selectedRequirementGraph(f.data, f.set, binding).diagnostics.map(d => d.code)).toContain(code);
});


test("line explanations and prospective impact traverse only selected group links", () => {
  const f = fixture();
  const implementation = {...datum("IMP", 1), links: [{type: "implements", target: f.set.revision_id}]};
  const scope = {...datum("SCP", 1), payload: {path: "counter.py", name: "count", role: "production", ranges: [{start: 1, end: 3}]}, links: [{type: "belongs-to", target: implementation.revision_id}, {type: "implements", target: f.leaf.revision_id}]};
  const data = [...f.data, f.set, implementation, scope];
  const why = inspectRequirementTrace(data, binding, implementation.revision_id, {kind: "why", path: "counter.py", line: 2});
  expect(why.diagnostics).toEqual([]);
  expect(why.scopes[0]?.reasons[0]?.path).toEqual([f.leaf.revision_id, f.middle.revision_id, f.root.revision_id]);
  const impact = inspectRequirementTrace(data, binding, implementation.revision_id, {kind: "impact", requirement: f.root.id});
  expect(impact.scopes[0]?.reasons[0]?.path).toEqual([f.root.revision_id, f.middle.revision_id, f.leaf.revision_id]);
});
