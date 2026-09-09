import { expect, test } from "vitest";
import type { DatumEnvelope } from "../src/index.js";
import { inspectRequirementTrace, compareImplementationScopes } from "../src/requirement-trace-inspection.js";
const binding = { type: "RQS", requirement_type: "REQ", implementation_type: "IMP", scope_type: "SCP" };
const link = (type: string, target: string) => ({ type, target });
function datum(id: string, type: string, payload: Record<string, unknown>, links: DatumEnvelope["links"] = [], revision = 1): DatumEnvelope {
  return { id, type, revision, revision_id: `${id}-r${revision}`, payload, links, body: "", created_by: { process_ref: "test" } };
}
function fixture() {
  const root = datum("need", "REQ", { kind: "stakeholder" });
  const list = datum("list", "REQ", { kind: "software" }, [link("decomposes", root.revision_id)]);
  const store = datum("store", "REQ", { kind: "software" }, [link("decomposes", list.revision_id)]);
  const invalid = datum("invalid", "REQ", { kind: "software" }, [link("decomposes", root.revision_id)]);
  const set = datum("set", "RQS", {}, [root, list, store, invalid].map(d => link("contains", d.revision_id)));
  const imp = datum("imp", "IMP", { source_commit: "old" }, [link("implements", set.revision_id)]);
  const scope = (id: string, target: string[], role = "production", inherited = false) => datum(id, "SCP", { path: role === "verification" ? "verify.py" : "tasks.py", name: id, role, blob: "blob1", source_commit: "old", ranges: [{ start: id === "only-invalid" ? 9 : 2, end: id === "only-invalid" ? 12 : 8 }], inherited }, [link("belongs-to", imp.revision_id), ...target.map(t => link(role === "verification" ? "verifies" : "implements", t))]);
  return [root, list, store, invalid, set, imp, scope("shared", [store.revision_id, invalid.revision_id], "production", true), scope("check", [store.revision_id], "verification"), scope("only-invalid", [invalid.revision_id])];
}
test("line explanation preserves exact scope inheritance and all ancestor paths", () => {
  const result = inspectRequirementTrace(fixture(), binding, "imp-r1", { kind: "why", path: "tasks.py", line: 3 });
  expect(result.diagnostics).toEqual([]);
  expect(result.scopes).toHaveLength(1);
  expect(result.scopes[0]!.inherited).toBe(true);
  expect(result.scopes[0]!.reasons.map(r => r.path)).toEqual([["store-r1", "list-r1", "need-r1"], ["invalid-r1", "need-r1"]]);
  expect(inspectRequirementTrace(fixture(), binding, "imp-r1", { kind: "why", path: "tasks.py", line: 20 }).diagnostics[0]!.code).toBe("trace-line-unattributed");
});
test("impact follows descendants, includes verifier and explains shared targets without sibling flood", () => {
  const result = inspectRequirementTrace(fixture(), binding, "imp-r1", { kind: "impact", requirement: "list" });
  expect(result.scopes.map(s => s.name)).toEqual(["shared", "check"]);
  expect(result.scopes[0]!.reasons[0]!.path).toEqual(["list-r1", "store-r1"]);
  expect(result.scopes[0]!.otherRequirements.map(r => r.requirement)).toEqual(["invalid-r1"]);
});
test("new parent revisions mark historical descendants for reassessment without rebinding", () => {
  const data = fixture();
  data.push(datum("list", "REQ", { kind: "software", title: "new" }, [link("decomposes", "need-r1")], 2));
  const result = inspectRequirementTrace(data, binding, "imp-r1", { kind: "impact", requirement: "list-r2" });
  expect(result.resolvedRequirement).toBe("list-r1");
  expect(result.revisionAlternatives).toEqual([{ id: "list", selected: "list-r1", latest: "list-r2" }]);
  expect(result.reassessment.map(r => r.requirement)).toEqual(["list-r1", "store-r1"]);
  expect(result.scopes[0]!.reasons[0]!.path).toEqual(["list-r1", "store-r1"]);
  expect(inspectRequirementTrace(data, binding, "imp", { kind: "impact", requirement: "list" }).diagnostics[0]!.code).toBe("trace-implementation-selection");
});
test("scope comparison distinguishes moved ranges, changed links and inherited candidates from exact changed lines", () => {
  const data = fixture(), imp2 = datum("imp", "IMP", { source_commit: "new" }, [link("implements", "set-r1")], 2);
  const changed = datum("new-scope", "SCP", { ...data[6]!.payload, blob: "blob2", ranges: [{ start: 3, end: 9 }] }, [link("belongs-to", imp2.revision_id), link("implements", "store-r1")]);
  data.push(imp2, changed);
  const result = compareImplementationScopes(data, binding, "imp-r1", "imp-r2");
  expect(result.diagnostics).toEqual([]);
  expect(result.differences[0]!.status).toBe("changed");
  expect(result.differences[0]!.reasons).toEqual(["file blob changed; inspect scope", "effective ranges changed", "requirement links changed"]);
  expect(result.differences[0]!.defaultAttributionCandidate).toBe(true);
  expect(result.differences.filter(d => d.status === "deleted")).toHaveLength(2);
  expect(result.exactAddedLinesKnown).toBe(false);
});


test("why distinguishes authenticated blank exemptions from missing source attribution", () => {
  const data = fixture();
  data[5]!.payload.source_inventory = [{ path: "tasks.py", lineCount: 15, blankRanges: [{ start: 13, end: 14 }] }];
  const why = (line: number, path = "tasks.py") => inspectRequirementTrace(data, binding, "imp-r1", { kind: "why", path, line });
  expect(why(13)).toMatchObject({ diagnostics: [], scopes: [], lineStatus: "blank-line-exempt" });
  expect(why(3)).toMatchObject({ diagnostics: [], lineStatus: "mapped" });
  for (const result of [why(15), why(16), why(13, "missing.py"), why(0)]) {
    expect(result.diagnostics).not.toEqual([]);
    expect(result.lineStatus).toBeNull();
  }
});
