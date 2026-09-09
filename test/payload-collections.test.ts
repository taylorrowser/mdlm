import path from "node:path";
import { beforeAll, expect, test } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { loadProcessPackage, resolveType, type DatumEnvelope, type LifecycleRecord, type ProcessPackage, type ResolvedType } from "../src/index.js";
import { renderPayloadViews, validatePayloadCollections, validatePayloadCollectionDefinitions } from "../src/payload-collections.js";

let pkg: ProcessPackage;
let reqType: ResolvedType;
let impType: ResolvedType;
beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  pkg = loaded.package;
  const req = resolveType(pkg, "REQ"), imp = resolveType(pkg, "IMP");
  if (!req.ok || !imp.ok) throw new Error("Unresolved types");
  reqType = req.type; impType = imp.type;
});
function requirements(): DatumEnvelope {
  return { id: "REQ-0000000001", revision_id: "REQ-0000000001-r00001", revision: 1, type: "REQ", links: [], body: "", created_by: { process_ref: "test" },
    payload: { title: "Tasks", publication: "recorded", intent: "Keep tasks", source: "stakeholder request", outcomes: [{ id: "O1", statement: "Keep unfinished tasks" }], commitments: [
      { id: "R1", level: "software", outcome_ids: ["O1"], parent_ids: [], ears: { pattern: "event", event: "the user adds a task", system: "the task CLI", response: "persist the task" } },
    ] } };
}
function record(datum: DatumEnvelope): LifecycleRecord {
  return { datum, storage: { editable: false, frozen: true }, integrity: {} } as LifecycleRecord;
}
const rows = (datum: DatumEnvelope) => datum.payload.commitments as Record<string, any>[];

test("EARS schema rejects missing or incompatible guards and allows all patterns", () => {
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(reqType.payloadSchema);
  const datum = requirements();
  for (const ears of [
    { pattern: "ubiquitous" }, { pattern: "event", event: "a request arrives" },
    { pattern: "state", state: "offline" }, { pattern: "optional", feature: "storage is configured" },
    { pattern: "unwanted", unwanted: "storage is malformed" },
    { pattern: "complex", state: "offline", event: "a request arrives" },
  ]) {
    rows(datum)[0]!.ears = { ...ears, system: "the product", response: "respond" };
    expect(validate(datum.payload), JSON.stringify(validate.errors)).toBe(true);
  }
  for (const ears of [{ pattern: "event" }, { pattern: "ubiquitous", event: "request" }, { pattern: "complex", state: "offline" }, { pattern: "complex", event: "request", unwanted: "error" }]) {
    rows(datum)[0]!.ears = { ...ears, system: "the product", response: "respond" };
    expect(validate(datum.payload)).toBe(false);
  }
});

test("local references reject missing outcomes, missing parents, uncovered outcomes and cycles", () => {
  const mutations: [string, (datum: DatumEnvelope) => void][] = [
    ["Unknown reference", (d) => { rows(d)[0]!.outcome_ids = ["missing"]; }],
    ["Unknown reference", (d) => { rows(d)[0]!.parent_ids = ["missing"]; }],
    ["No declared mapping", (d) => { (d.payload.outcomes as unknown[]).push({ id: "O2", statement: "Other outcome" }); }],
    ["cycle", (d) => { rows(d).push({ ...rows(d)[0], id: "R2", level: "allocated", allocation: "storage", parent_ids: ["R3"] }, { ...rows(d)[0], id: "R3", level: "allocated", allocation: "storage", parent_ids: ["R2"] }); }],
  ];
  expect(validatePayloadCollections(reqType, requirements(), [])).toEqual([]);
  for (const [message, mutate] of mutations) {
    const datum = requirements(); mutate(datum);
    expect(validatePayloadCollections(reqType, datum, []).some((d) => d.message.includes(message))).toBe(true);
  }
});

test("each outcome requires software coverage, even when an allocated child cites it", () => {
  const datum = requirements();
  (datum.payload.outcomes as unknown[]).push({ id: "O2", statement: "Second stakeholder outcome" });
  rows(datum).push({ id: "R2", level: "allocated", allocation: "storage", outcome_ids: ["O2"], parent_ids: ["R1"], ears: { pattern: "ubiquitous", system: "storage", response: "retain data" } });
  const validate = new Ajv2020({ strict: false }).compile(reqType.payloadSchema);
  expect(validate(datum.payload)).toBe(true);
  expect(validatePayloadCollections(reqType, datum, []).some((d) => d.message.includes("No declared mapping covers 'O2'"))).toBe(true);
  rows(datum).push({ ...rows(datum)[0], id: "R3", outcome_ids: ["O2"] });
  expect(validatePayloadCollections(reqType, datum, [])).toEqual([]);
  rows(datum)[1]!.outcome_ids = ["missing"];
  expect(validatePayloadCollections(reqType, datum, []).some((d) => d.message.includes("Unknown reference 'missing'"))).toBe(true);
});

test("coverage resolves only the exact linked requirement revision and permits several evidence rows", () => {
  const original = requirements();
  const newer = structuredClone(original); newer.revision = 2; newer.revision_id = "REQ-0000000001-r00002"; rows(newer)[0]!.id = "R2";
  const implementation: DatumEnvelope = { ...original, type: "IMP", links: [{ type: "implements", target: original.revision_id }], payload: { verification_coverage: [{ commitment_id: "R1", method: "test", file: "verify.py", locator: "add" }, { commitment_id: "R1", method: "inspection", file: "tasks.py", locator: "save" }] } };
  expect(validatePayloadCollections(impType, implementation, [record(newer), record(original)])).toEqual([]);
  (implementation.payload.verification_coverage as any[])[0].commitment_id = "R2";
  expect(validatePayloadCollections(impType, implementation, [record(newer), record(original)]).some((d) => d.message.includes("Unknown reference 'R2'"))).toBe(true);
  implementation.payload.verification_coverage = [];
  expect(validatePayloadCollections(impType, implementation, [record(original)]).some((d) => d.message.includes("No declared mapping"))).toBe(true);
});

test("views derive EARS and evidence rows from fields without a second authored sentence", () => {
  const datum = requirements();
  const expected = [
    [{ pattern: "ubiquitous" }, "the product shall respond."],
    [{ pattern: "event", event: "a request arrives" }, "When a request arrives, the product shall respond."],
    [{ pattern: "state", state: "offline" }, "While offline, the product shall respond."],
    [{ pattern: "optional", feature: "storage is configured" }, "Where storage is configured, the product shall respond."],
    [{ pattern: "unwanted", unwanted: "storage is malformed" }, "If storage is malformed, then the product shall respond."],
    [{ pattern: "complex", state: "offline", event: "a request arrives" }, "While offline, When a request arrives, the product shall respond."],
  ] as const;
  for (const [ears, sentence] of expected) {
    rows(datum)[0]!.ears = { ...ears, system: "the product", response: "respond" };
    expect(renderPayloadViews(reqType, datum.payload)[1]!.rows[0]!.at(-1)).toBe(sentence);
  }
  expect(renderPayloadViews(impType, { verification_coverage: [{ commitment_id: "R1", method: "test", file: "verify.py", locator: "add" }] })[0]!.rows).toEqual([["R1", "test", "verify.py", "add"]]);
});

test("invalid declaration paths fail package contract checking", () => {
  const bad = structuredClone(pkg);
  (bad.types.REQ!.payload_collections as any[])[1].references[0].field = "typo";
  expect(validatePayloadCollectionDefinitions(bad, (id) => { const resolved = resolveType(bad, id); return resolved.ok ? resolved.type : undefined; }).some((d) => d.message.includes("typo"))).toBe(true);
});
