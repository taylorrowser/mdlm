import { expect, it } from "vitest";
import { lifecycleDatumDiagnostics } from "../src/lifecycle-repository.js";
import type { ProcessPackage, DatumEnvelope } from "../src/index.js";

it("names missing and unexpected schema fields in diagnostic paths", () => {
  const processPackage: ProcessPackage = {
    root: ".",
    manifest: { id: "schema-diagnostics", version: "1.0.0" },
    kernelCapabilities: {},
    envelopeSchema: {},
    templates: {},
    types: {
      REQ: {
        kind: "type-definition", id: "REQ", version: 1,
        payload_schema: {
          properties: {
            cases: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["stdout"],
                properties: { stdout: { type: "string" } },
              },
            },
          },
        },
      },
    },
    policies: {}, states: {}, selectors: {}, actions: {}, primitives: {},
  };
  const datum: DatumEnvelope = {
    id: "REQ-0000000001", revision_id: "REQ-0000000001-r00001", revision: 1,
    type: "REQ", links: [], body: "",
    created_by: {
      transaction: "mdlm-direct-transaction@1", prompt_ref: "author@1",
      process_ref: "schema-diagnostics@1.0.0", loaded_skill_refs: [], policy_refs: [],
    },
    payload: { cases: [{ "std/out~": "3\n" }, { stdout: 3 }] },
  };

  expect(lifecycleDatumDiagnostics(processPackage, datum, [])).toEqual([
    {
      code: "datum-payload", path: "payload/cases/0/stdout",
      message: "/cases/0 must have required property 'stdout'",
    },
    {
      code: "datum-payload", path: "payload/cases/0/std~1out~0",
      message: "/cases/0 must NOT have additional properties",
    },
    {
      code: "datum-payload", path: "payload/cases/1/stdout",
      message: "/cases/1/stdout must be string",
    },
  ]);
});
