import {expect, test} from "vitest";
import {assignmentChangeContext} from "../src/assignment.js";
import type {DatumEnvelope} from "../src/index.js";
import type {RequirementTraceBinding} from "../src/requirement-trace.js";
const binding: RequirementTraceBinding = {type: "RQS", requirement_type: "REQ", implementation_type: "IMP", scope_type: "SCP", decomposition_type: "DCP", change_type: "CHG", acceptance_type: "ACC", review_type: "REV"};
function datum(id: string, links: Record<string, string[]> = {}, payload: Record<string, unknown> = {}): DatumEnvelope {
  return {id, type: id.split("-")[0]!, revision: 1, revision_id: id, links: Object.entries(links).flatMap(([type, targets]) => targets.map(target => ({type, target}))), payload, body: "", created_by: {process_ref: "test"}};
}
function fixture() {
  return ["old", "current"].flatMap(name => [
    datum(`REQ-${name}`, {}, {kind: "stakeholder"}), datum(`REQ-${name}-leaf`, {}, {kind: "software"}),
    datum(`DCP-${name}`, {parent: [`REQ-${name}`], child: [`REQ-${name}-leaf`]}),
    datum(`RQS-${name}`, {contains: [`REQ-${name}`, `REQ-${name}-leaf`], decomposition: [`DCP-${name}`], ...(name === "current" ? {"changes-under": ["CHG-Z-old"]} : {})}),
    datum(`IMP-${name}`, {implements: [`RQS-${name}`]}), datum(`RES-${name}`),
    datum(`SCP-${name}`, {"belongs-to": [`IMP-${name}`], implements: [`REQ-${name}-leaf`]}, {path: `${name}.py`, name: "behavior", role: "production"}),
    datum(`ACC-${name}`, {confirms: [`RQS-${name}`], accepts: [`IMP-${name}`], "uses-evidence": [`RES-${name}`], ...(name === "current" ? {"changes-under": ["CHG-Z-old"]} : {})}, {decision: "accept"}),
    datum(name === "current" ? "CHG-A-current" : "CHG-Z-old", {baseline: [`ACC-${name}`], changes: [`REQ-${name}`]}, {reason: name}),
  ]).sort((a,b) => a.revision_id.localeCompare(b.revision_id));
}
test("the second approval binds impact and graph context to its exact change, regardless of history order", () => {
  const data = fixture();
  for (const ordered of [data, [...data].reverse()]) {
    const input = new Set(["CHG-A-current"]);
    expect(assignmentChangeContext(ordered, binding, input)).toEqual({
      baselineRequirements: ["RQS-current"],
      prospectiveChange: {change: "CHG-A-current", baseline: "ACC-current", request: {reason: "current"}, requirements: ["REQ-current", "REQ-current-leaf"], groups: ["DCP-current"], implementation: "IMP-current", result: "RES-current", sourceScopes: ["SCP-current"], scopes: [{revision: "SCP-current", payload: {path: "current.py", name: "behavior", role: "production"}, links: [{type: "belongs-to", target: "IMP-current"}, {type: "implements", target: "REQ-current-leaf"}]}]},
    });
    expect([...input]).toEqual(["CHG-A-current"]);
  }
});
test("supporting current selection supplies one change, while baseline history and ambiguous support supply none", () => {
  const data = fixture();
  data.push(datum("RQS-next", {"changes-under": ["CHG-A-current"]}), datum("IMP-next", {implements: ["RQS-next"], "changes-under": ["CHG-A-current"]}));
  for (const inputs of [["RQS-next"], ["IMP-next"]]) expect(assignmentChangeContext(data, binding, new Set(inputs)).prospectiveChange?.change).toBe("CHG-A-current");
  for (const inputs of [[], ["ACC-current"], ["RQS-next", "RQS-current"]]) expect(assignmentChangeContext(data, binding, new Set(inputs))).toEqual({baselineRequirements: [], prospectiveChange: undefined});
  expect(assignmentChangeContext(data, binding, new Set(["CHG-Z-old"])).prospectiveChange?.change).toBe("CHG-Z-old");
});
