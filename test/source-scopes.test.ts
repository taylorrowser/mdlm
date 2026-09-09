import { expect, test } from "vitest";
import { deriveSourceScopes, type SourceEntry, type SelectedSourceRequirement } from "../src/source-scopes.js";

const selectedRequirements: SelectedSourceRequirement[] = [
  { stableId: "REQ-0000000001", revisionId: "REQ-0000000001-r00002", kind: "software", isLeaf: true },
  { stableId: "REQ-0000000002", revisionId: "REQ-0000000002-r00001", kind: "software", isLeaf: true },
  { stableId: "REQ-0000000003", revisionId: "REQ-0000000003-r00001", kind: "software", isLeaf: false },
  { stableId: "REQ-0000000004", revisionId: "REQ-0000000004-r00001", kind: "stakeholder", isLeaf: false },
];
const R1 = selectedRequirements[0]!.stableId;
const R2 = selectedRequirements[1]!.stableId;
const R3 = selectedRequirements[2]!.stableId;
const R4 = selectedRequirements[3]!.stableId;
const region = (targets = R1, name = "runtime", relation = "implements") => `# mdlm:begin ${name} ${relation} ${targets}\npass\n# mdlm:end ${name}`;
function entry(text: string, overrides: Partial<SourceEntry> = {}): SourceEntry {
  return { path: "tasks.py", blob: "committed-blob", mode: "100644", bytes: new TextEncoder().encode(text), role: "production", ...overrides };
}
function derive(text: string) { return deriveSourceScopes({ entries: [entry(text)], selectedRequirements }); }

test("explicit many-to-many regions cover content while committed blank gaps are exempt", () => {
  const result = derive([
    "", `# mdlm:begin runtime implements ${R1} ${R2}`, "import json", "", "# mdlm:end runtime", " ",
    `# mdlm:begin load-store implements ${R2}`, "def load():", "    return []", "# mdlm:end load-store", "", "",
  ].join("\r\n"));
  expect(result.diagnostics).toEqual([]);
  expect(result.inventory[0]).toMatchObject({ lineCount: 11, blankRanges: [{ start: 1, end: 1 }, { start: 6, end: 6 }, { start: 11, end: 11 }] });
  expect(result.scopes.map(scope => ({ name: scope.name, inherited: scope.inherited, ranges: scope.ranges, links: scope.links }))).toEqual([
    { name: "runtime", inherited: false, ranges: [{ start: 2, end: 5 }], links: [
      { type: "implements", target: "REQ-0000000001-r00002" }, { type: "implements", target: "REQ-0000000002-r00001" }] },
    { name: "load-store", inherited: false, ranges: [{ start: 7, end: 10 }], links: [{ type: "implements", target: "REQ-0000000002-r00001" }] },
  ]);
});

test("uncovered content and malformed or ambiguous annotations prevent usable scopes", () => {
  for (const text of ["print('unmapped')", "# comment", "import sys", "#!/usr/bin/env python3"]) {
    const result = derive(`${region()}\n\n${text}`);
    expect(result.diagnostics).toEqual([{ code: "source-line-unmapped", path: "tasks.py", line: 5,
      message: "Nonblank source must belong to an explicit mapped region." }]);
    expect(result.scopes).toEqual([]);
  }
  for (const [text, code] of [
    [`# mdlm:file runtime implements ${R1}`, "source-file-default"],
    [`# mdlm:begin missing implements ${R2}\npass`, "source-region-end"],
    ["# mdlm:end missing", "source-region-end"],
    [`# mdlm:begin outer implements ${R2}\n# mdlm:begin inner implements ${R1}\n# mdlm:end outer`, "source-region-overlap"],
    [`${region()}\n${region()}`, "source-scope-name"],
    ["# mdlm:begin empty implements", "source-directive"],
    ["# mdlm:unknown foo", "source-directive"],
  ]) {
    const result = derive(text!);
    expect(result.diagnostics.map(d => d.code), text).toContain(code);
    expect(result.scopes, text).toEqual([]);
  }
});

test("production targets are stable selected leaves and verification may also target higher requirements", () => {
  for (const target of ["REQ-missing", "REQ-0000000001-r00002", R3, R4, `${R1} ${R1}`]) {
    expect(derive(region(target)).diagnostics.length).toBeGreaterThan(0);
  }
  const verification = (targets: string) => deriveSourceScopes({
    entries: [entry(region(targets, "checks", "verifies"), { path: "verify.py", role: "verification" })], selectedRequirements,
  });
  expect(verification(`${R1} ${R3} ${R4}`).diagnostics).toEqual([]);
  expect(verification(`${R3} ${R4}`).diagnostics.map((d) => d.code)).toContain("source-scope-leaf");
  expect(derive(region(R1, "runtime", "verifies")).diagnostics.map((d) => d.code)).toContain("source-scope-relation");
  expect(deriveSourceScopes({ entries: [entry(region())], selectedRequirements: [...selectedRequirements, selectedRequirements[0]!] }).diagnostics.map((d) => d.code)).toContain("source-requirement-selection");
});

test("the inventory includes empty source and unannotated documentation while unsupported entries fail explicitly", () => {
  const unclassified = entry("", { path: "unclassified.py" });
  delete unclassified.role;
  const entries = [
    entry(" \n\t\n", { path: "empty.py" }),
    entry("Run python3 tasks.py.\n", { path: "README.md", role: "documentation" }),
    entry(region(), { path: "build.py", role: "build" }),
    unclassified,
    entry("console.log(1)", { path: "app.js" }),
    entry("print(1)", { path: "README.py", role: "documentation" }),
    entry("#!/bin/sh\necho hi", { path: "README.txt", role: "documentation" }),
    entry("Run it", { path: "executable.md", mode: "100755", role: "documentation" }),
    entry("DEBUG=true", { path: "settings.conf", role: "configuration" }),
    entry("tasks.py", { path: "link.py", mode: "120000" }),
    entry("", { path: "dependency", mode: "160000" }),
    entry("", { path: "binary.py", bytes: new Uint8Array([0xff]) }),
  ];
  const result = deriveSourceScopes({ entries, selectedRequirements });
  expect(result.inventory.map((row) => row.path)).toEqual(entries.map((row) => row.path));
  expect(result.inventory[0]!.lineCount).toBe(2);
  expect(result.inventory[0]!.blankRanges).toEqual([{ start: 1, end: 2 }]);
  expect(derive("").inventory[0]!.lineCount).toBe(0);
  expect(result.inventory[1]!.lineCount).toBe(1);
  expect(result.scopes.map((scope) => scope.path)).toEqual(["build.py"]);
  expect(result.diagnostics.map((d) => d.path)).toEqual(entries.slice(3).map((row) => row.path));
  expect(result.inventory.at(-1)!.lineCount).toBeNull();
});

test("trailing line terminators do not add phantom lines and duplicate paths are rejected", () => {
  for (const [suffix, count] of [["", 3], ["\n", 3], ["\n\n", 4]] as const) {
    const result = derive(region() + suffix);
    expect(result.diagnostics).toEqual([]);
    expect(result.inventory[0]!.lineCount).toBe(count);
    expect(result.scopes[0]!.ranges).toEqual([{ start: 1, end: 3 }]);
  }
  expect(deriveSourceScopes({ entries: [entry(region()), entry(region())], selectedRequirements }).diagnostics.map((d) => d.code)).toContain("source-inventory");
});
