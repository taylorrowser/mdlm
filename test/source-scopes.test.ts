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
const defaultLine = `# mdlm:file runtime implements ${R1}`;
function entry(text: string, overrides: Partial<SourceEntry> = {}): SourceEntry {
  return { path: "tasks.py", blob: "committed-blob", mode: "100644", bytes: new TextEncoder().encode(text), role: "production", ...overrides };
}
function derive(text: string) { return deriveSourceScopes({ entries: [entry(text)], selectedRequirements }); }

test("file defaults and closed overrides partition every physical line at exact selected revisions", () => {
  const result = derive([
    "#!/usr/bin/env python3", defaultLine, "import json", "",
    `# mdlm:begin load-store implements ${R2}`, "def load():", "    return []", "# mdlm:end load-store",
    "", "print(load())", "",
  ].join("\r\n"));
  expect(result.diagnostics).toEqual([]);
  expect(result.inventory).toEqual([{ path: "tasks.py", blob: "committed-blob", mode: "100644", role: "production", lineCount: 10 }]);
  expect(result.scopes).toEqual([
    { name: "runtime", path: "tasks.py", blob: "committed-blob", role: "production", inherited: true,
      ranges: [{ start: 1, end: 4 }, { start: 9, end: 10 }], links: [{ type: "implements", target: "REQ-0000000001-r00002" }] },
    { name: "load-store", path: "tasks.py", blob: "committed-blob", role: "production", inherited: false,
      ranges: [{ start: 5, end: 8 }], links: [{ type: "implements", target: "REQ-0000000002-r00001" }] },
  ]);
  const grown = derive(`${defaultLine}\n# mdlm:begin load-store implements ${R2}\npass\n# mdlm:end load-store\nprint('new')`);
  expect(grown.scopes[0]!.ranges).toEqual([{ start: 1, end: 1 }, { start: 5, end: 5 }]);
  expect(grown.scopes[1]!.ranges).toEqual([{ start: 2, end: 4 }]);
});

test("malformed or ambiguous annotations prevent usable scopes", () => {
  for (const [text, code] of [
    ["print('unmapped')", "source-file-default"],
    [`${defaultLine}\n${defaultLine}`, "source-file-default"],
    [`${defaultLine}\n# mdlm:begin missing implements ${R2}\npass`, "source-region-end"],
    [`${defaultLine}\n# mdlm:end missing`, "source-region-end"],
    [`${defaultLine}\n# mdlm:begin outer implements ${R2}\n# mdlm:begin inner implements ${R1}\n# mdlm:end outer`, "source-region-overlap"],
    [`${defaultLine}\n# mdlm:begin runtime implements ${R2}\n# mdlm:end runtime`, "source-scope-name"],
    [`${defaultLine}\n# mdlm:begin empty implements`, "source-directive"],
    [`${defaultLine}\n# mdlm:unknown foo`, "source-directive"],
  ]) {
    const result = derive(text!);
    expect(result.diagnostics.map((d) => d.code), text).toContain(code);
    expect(result.scopes, text).toEqual([]);
  }
});

test("production targets are stable selected leaves and verification may also target higher requirements", () => {
  for (const target of ["REQ-missing", "REQ-0000000001-r00002", R3, R4, `${R1} ${R1}`]) {
    expect(derive(`# mdlm:file runtime implements ${target}`).diagnostics.length).toBeGreaterThan(0);
  }
  const verification = (targets: string) => deriveSourceScopes({
    entries: [entry(`# mdlm:file checks verifies ${targets}\nassert True\n`, { path: "verify.py", role: "verification" })], selectedRequirements,
  });
  expect(verification(`${R1} ${R3} ${R4}`).diagnostics).toEqual([]);
  expect(verification(`${R3} ${R4}`).diagnostics.map((d) => d.code)).toContain("source-scope-leaf");
  expect(derive(`# mdlm:file runtime verifies ${R1}`).diagnostics.map((d) => d.code)).toContain("source-scope-relation");
  expect(deriveSourceScopes({ entries: [entry(defaultLine)], selectedRequirements: [...selectedRequirements, selectedRequirements[0]!] }).diagnostics.map((d) => d.code)).toContain("source-requirement-selection");
});

test("the inventory includes empty source and unannotated documentation while unsupported entries fail explicitly", () => {
  const unclassified = entry("", { path: "unclassified.py" });
  delete unclassified.role;
  const entries = [
    entry("", { path: "empty.py" }),
    entry("Run python3 tasks.py.\n", { path: "README.md", role: "documentation" }),
    entry(defaultLine, { path: "build.py", role: "build" }),
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
  expect(result.inventory[0]!.lineCount).toBe(0);
  expect(result.inventory[1]!.lineCount).toBe(1);
  expect(result.scopes.map((scope) => scope.path)).toEqual(["build.py"]);
  expect(result.diagnostics.map((d) => d.path)).toEqual(entries.slice(3).map((row) => row.path));
  expect(result.inventory.at(-1)!.lineCount).toBeNull();
});

test("trailing line terminators do not add phantom lines and duplicate paths are rejected", () => {
  for (const [suffix, count] of [["", 1], ["\n", 1], ["\n\n", 2]] as const) {
    const result = derive(defaultLine + suffix);
    expect(result.diagnostics).toEqual([]);
    expect(result.inventory[0]!.lineCount).toBe(count);
    expect(result.scopes[0]!.ranges).toEqual([{ start: 1, end: count }]);
  }
  expect(deriveSourceScopes({ entries: [entry(defaultLine), entry(defaultLine)], selectedRequirements }).diagnostics.map((d) => d.code)).toContain("source-inventory");
});
