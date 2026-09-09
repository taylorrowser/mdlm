import { expect, test } from "vitest";
import { resolveType, type DatumEnvelope, type LifecycleRecord, type ProcessPackage } from "../src/index.js";
import { renderPayloadViews, validatePayloadCollections, validatePayloadCollectionDefinitions } from "../src/payload-collections.js";

// A package-neutral fixture. The tiny requirement graph no longer uses payload rows.
const string = { type: "string" };
const strings = { type: "array", items: string };
const pkg: ProcessPackage = {
  root: ".", manifest: { id: "collection-fixture", version: "1.0.0" },
  kernelCapabilities: {}, envelopeSchema: {}, templates: {},
  types: {
    SET: {
      kind: "type-definition", id: "SET", version: 1,
      payload_schema: { properties: {
        groups: { type: "array", items: { properties: { id: string } } },
        entries: { type: "array", items: { properties: { id: string, role: string, group_ids: strings, parents: strings, label: string } } },
      } },
      payload_collections: [
        { path: "groups", key: "id" },
        { path: "entries", key: "id", references: [
          { field: "group_ids", target: "groups", key: "id", covered: true, coverage_where: { field: "role", equals: "primary" } },
          { field: "parents", target: "entries", key: "id", acyclic: true },
        ] },
      ],
      payload_views: [{ title: "Entries", path: "entries", columns: [
        { title: "ID", fragments: [{ field: "id" }] },
        { title: "Description", fragments: [{ field: "label", prefix: "Item: ", suffix: "." }] },
      ] }],
    },
    EVD: {
      kind: "type-definition", id: "EVD", version: 1,
      payload_schema: { properties: { mappings: { type: "array", items: { properties: { entry_id: string } } } } },
      outgoing_links: [{ id: "maps", targets: [{ kind: "datum", types: ["SET"], identity: "revision" }], cardinality: { minimum: 1, maximum: 1 } }],
      payload_collections: [{ path: "mappings", references: [{ field: "entry_id", target: "entries", key: "id", link: "maps", covered: true }] }],
    },
  },
  policies: {}, states: {}, selectors: {}, obligations: {}, scenarios: {}, phases: {}, profiles: {}, aliases: {}, primitives: {},
};
function type(id: string, process = pkg) {
  const resolved = resolveType(process, id);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
  return resolved.type;
}
function selection(): DatumEnvelope {
  return { id: "SET-0000000001", revision_id: "SET-0000000001-r00001", revision: 1, type: "SET", links: [], body: "", created_by: { process_ref: "test" },
    payload: { groups: [{ id: "G1" }], entries: [{ id: "E1", role: "primary", group_ids: ["G1"], parents: [], label: "First" }] } };
}
const entries = (datum: DatumEnvelope) => datum.payload.entries as Record<string, any>[];
const record = (datum: DatumEnvelope) => ({ datum, storage: { editable: false, frozen: true }, integrity: {} }) as LifecycleRecord;

test("generic collections enforce keys, references, cycles and contributor coverage", () => {
  expect(validatePayloadCollections(type("SET"), selection(), [])).toEqual([]);
  const mutations: [string, (d: DatumEnvelope) => void][] = [
    ["Duplicate local key", (d) => entries(d).push({ ...entries(d)[0] })],
    ["Unknown reference", (d) => { entries(d)[0]!.group_ids = ["missing"]; }],
    ["Unknown reference", (d) => { entries(d)[0]!.parents = ["missing"]; }],
    ["cycle", (d) => { entries(d)[0]!.parents = ["E1"]; }],
    ["No declared mapping", (d) => { entries(d)[0]!.role = "secondary"; }],
  ];
  for (const [message, mutate] of mutations) {
    const datum = selection(); mutate(datum);
    expect(validatePayloadCollections(type("SET"), datum, []).some((d) => d.message.includes(message))).toBe(true);
  }
});

test("generic linked coverage uses the exact revision and allows multiple mappings", () => {
  const original = selection();
  const newer = structuredClone(original); newer.revision = 2; newer.revision_id = "SET-0000000001-r00002"; entries(newer)[0]!.id = "E2";
  const evidence: DatumEnvelope = { ...original, type: "EVD", links: [{ type: "maps", target: original.revision_id }], payload: { mappings: [{ entry_id: "E1" }, { entry_id: "E1" }] } };
  expect(validatePayloadCollections(type("EVD"), evidence, [record(newer), record(original)])).toEqual([]);
  evidence.payload.mappings = [{ entry_id: "E2" }];
  const diagnostics = validatePayloadCollections(type("EVD"), evidence, [record(newer), record(original)]);
  expect(diagnostics.some((d) => d.message.includes("Unknown reference 'E2'"))).toBe(true);
  expect(diagnostics.some((d) => d.message.includes("No declared mapping covers 'E1'"))).toBe(true);
});

test("generic views derive rows and bad declaration fields fail validation", () => {
  expect(renderPayloadViews(type("SET"), selection().payload)[0]!.rows).toEqual([["E1", "Item: First."]]);
  expect(validatePayloadCollectionDefinitions(pkg, (id) => type(id))).toEqual([]);
  const bad = structuredClone(pkg);
  (bad.types.SET!.payload_collections as any[])[1].references[0].field = "typo";
  expect(validatePayloadCollectionDefinitions(bad, (id) => type(id, bad)).some((d) => d.message.includes("typo"))).toBe(true);
});
