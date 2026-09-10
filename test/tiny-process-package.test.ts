import path from "node:path";
import { promises as fs } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { expect, test } from "vitest";
import { loadProcessPackage } from "../src/index.js";

test("the tiny package keeps one batch review route with native requirement and source graphs", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics, null, 2)).toBe(true);
  if (!loaded.ok) return;
  expect(Object.keys(loaded.package.types).sort()).toEqual(["ACC", "CHG", "DCP", "IMP", "REQ", "RES", "REV", "RQS", "SCP"]);
  expect(loaded.package.kernelCapabilities["requirement-trace@2"]).toEqual({ type: "RQS", requirement_type: "REQ", implementation_type: "IMP", scope_type: "SCP", decomposition_type: "DCP", change_type: "CHG", acceptance_type: "ACC", review_type: "REV", result_type: "RES" });
  expect(Object.keys(loaded.package.phases)).toEqual(["phase-0-tiny-product"]);
});

test("a software statement requires its EARS guard while stakeholder statements use prose", async () => {
  const definition = parse(await fs.readFile(".lifecycle/process/types/REQ.yaml", "utf8"));
  const validate = new Ajv2020({ strict: false }).compile(definition.payload_schema);
  expect(validate({ publication: "recorded", kind: "stakeholder", statement: "Retain my tasks" })).toBe(true);
  const software = { publication: "recorded", kind: "software", ears: { pattern: "event", system: "the task CLI", response: "persist the added task" } };
  expect(validate(software)).toBe(false);
  expect(validate({ ...software, ears: { ...software.ears, event: "a task is added" } })).toBe(true);
});

test("stakeholder rejection is an explicit decision rather than an implicit acceptance", async () => {
  const definition = parse(await fs.readFile(".lifecycle/process/types/ACC.yaml", "utf8"));
  const scenario = parse(await fs.readFile(".lifecycle/process/scenarios/accept-product.yaml", "utf8"));
  const validate = new Ajv2020({ strict: false }).compile(definition.payload_schema);
  expect(validate({ publication: "recorded", decision: "reject", rationale: "Valid IDs crash" })).toBe(true);
  expect(validate({ publication: "recorded", rationale: "Valid IDs crash" })).toBe(false);
  expect(scenario.outputs[0].required_payload).not.toHaveProperty("decision");
});
