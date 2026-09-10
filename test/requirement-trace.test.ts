import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import type { DatumEnvelope } from "../src/index.js";
import { latestRequirements, selectedRequirementGraph, deriveImplementationScopes, type RequirementTraceBinding } from "../src/requirement-trace.js";
const binding: RequirementTraceBinding = {type: "RQS", requirement_type: "REQ", implementation_type: "IMP", scope_type: "SCP"};
function datum(id: string, kind = "software", parents: string[] = [], revision = 1): DatumEnvelope {
  return {id, revision, revision_id: `${id}-r${String(revision).padStart(5, "0")}`, type: "REQ", payload: {kind}, links: parents.map((target) => ({type: "decomposes", target})), created_by: {process_ref: "test"}, body: ""};
}
function fixture() {
  const root = datum("REQ-0000000001", "stakeholder");
  const middle = datum("REQ-0000000002", "software", [root.revision_id]);
  const leaf = datum("REQ-0000000003", "software", [middle.revision_id]);
  const set = {...datum("RQS-0000000001"), type: "RQS", links: [root, middle, leaf].map((r) => ({type: "contains", target: r.revision_id}))};
  return {root, middle, leaf, set, data: [root, middle, leaf, set]};
}
test("normal decomposition selects software leaves and preserves several levels", () => {
  const {data, set, leaf} = fixture();
  const graph = selectedRequirementGraph(data, set, binding, true);
  expect(graph.diagnostics).toEqual([]);
  expect([...graph.leaves]).toEqual([leaf.revision_id]);
});
test("cannot turn a parent into a code leaf by omitting its child", () => {
  const {data, set, leaf} = fixture();
  set.links = set.links.filter((l) => l.target !== leaf.revision_id);
  expect(selectedRequirementGraph(data, set, binding, true).diagnostics.map((d) => d.code)).toContain("trace-selection-stale");
});
test("new parent revision leaves historical graph intact but blocks current reuse", () => {
  const {data, set, root} = fixture();
  data.push(datum(root.id, "stakeholder", [], 2));
  expect(selectedRequirementGraph(data, set, binding).diagnostics).toEqual([]);
  expect(selectedRequirementGraph(data, set, binding, true).diagnostics.map((d) => d.code)).toContain("trace-selection-stale");
});
test("leaf-only changes preserve exact parents and siblings; parent changes require reaffirmation", () => {
  const root = datum("REQ-0000000001", "stakeholder");
  const children = Array.from({length: 6}, (_, i) => datum(`REQ-000000000${i + 2}`, "software", [root.revision_id]));
  const unchanged = JSON.stringify([root, ...children.slice(2)]);
  const revised = children.slice(0, 2).map(child => ({
    ...datum(child.id, "software", [root.revision_id], 2),
    payload: {...child.payload, source: "completion-change.md"},
  }));
  const data = [root, ...children, ...revised];
  const set = {...datum("RQS-0000000001"), type: "RQS", links: latestRequirements(data, binding).map(r => ({type: "contains", target: r.revision_id}))};
  const graph = selectedRequirementGraph(data, set, binding, true);
  expect(graph.diagnostics).toEqual([]);
  expect(graph.requirements).toEqual([root, ...revised, ...children.slice(2)]);
  expect(JSON.stringify([root, ...children.slice(2)])).toBe(unchanged);
  expect(graph.requirements.filter(r => r.revision === 2).map(r => r.payload.source)).toEqual(["completion-change.md", "completion-change.md"]);

  data.push({...datum(root.id, "stakeholder", [], 2), payload: {...root.payload, source: "completion-change.md"}});
  set.links = latestRequirements(data, binding).map(r => ({type: "contains", target: r.revision_id}));
  const codes = selectedRequirementGraph(data, set, binding, true).diagnostics.map(d => d.code);
  expect(codes.filter(code => code === "trace-decomposition-outside-selection")).toHaveLength(6);
  expect(codes).toContain("trace-stakeholder-unreachable");
});
test("rejects cyclic and broken exact decomposition before publication", () => {
  const {data, set, root, leaf} = fixture();
  root.payload.kind = "software";
  root.links = [{type: "decomposes", target: leaf.revision_id}];
  expect(selectedRequirementGraph(data, set, binding).diagnostics.map((d) => d.code)).toContain("trace-decomposition-cycle");
  leaf.links = [{type: "decomposes", target: "REQ-missing-r00001"}];
  expect(selectedRequirementGraph(data, set, binding).diagnostics.map((d) => d.code)).toContain("trace-decomposition-outside-selection");
});

test("a second stakeholder need cannot be left without software decomposition", () => {
  const {data, set} = fixture();
  const missing = datum("REQ-0000000004", "stakeholder");
  data.push(missing); set.links.push({type: "contains", target: missing.revision_id});
  expect(selectedRequirementGraph(data, set, binding, true).diagnostics.map((d) => d.code)).toContain("trace-stakeholder-uncovered");
});

test("committed inventory cannot omit a file or leave a software leaf without implementation and verification", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-trace-source-"));
  const {data, set, root, leaf} = fixture();
  const git = (...args: string[]) => execFileSync("git", args, {cwd: rootPath, encoding: "utf8"}).trim();
  try {
    git("init", "-q");
    await fs.writeFile(path.join(rootPath, "product.py"), `# mdlm:begin main implements ${leaf.id}\nprint(1)\n# mdlm:end main\n`);
    await fs.writeFile(path.join(rootPath, "verify.py"), `# mdlm:begin check verifies ${leaf.id}\nassert True\n# mdlm:end check\n`);
    await fs.writeFile(path.join(rootPath, "README.md"), "Example product\n");
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@localhost", "-c", "commit.gpgSign=false", "commit", "-qm", "Source");
    const implementation = {...datum("IMP-0000000001"), type: "IMP", payload: {repository_path: rootPath, source_commit: git("rev-parse", "HEAD"), file_roles: {"product.py": "production", "verify.py": "verification"} as Record<string, string>}, links: [{type: "implements", target: set.revision_id}]};
    let result = await deriveImplementationScopes(implementation, [...data, implementation], binding);
    expect(result.diagnostics.map((d) => d.code)).toContain("trace-source-role-missing");
    implementation.payload.file_roles["README.md"] = "documentation";
    result = await deriveImplementationScopes(implementation, [...data, implementation], binding);
    expect(result.diagnostics).toEqual([]);
    expect(result.inventory).toHaveLength(3);
    expect(result.scopes).toHaveLength(2);
    const uncovered = datum("REQ-0000000005", "software", [root.revision_id]);
    data.push(uncovered); set.links.push({type: "contains", target: uncovered.revision_id});
    result = await deriveImplementationScopes(implementation, [...data, implementation], binding);
    expect(result.diagnostics.filter((d) => d.code === "trace-requirement-uncovered")).toHaveLength(2);
  } finally { await fs.rm(rootPath, {recursive: true, force: true}); }
});
