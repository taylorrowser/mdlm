import { installedProcessPackageRoot } from "../src/installed-process-package.js";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {expect, test} from "vitest";
import {parse} from "yaml";
import {Ajv2020} from "ajv/dist/2020.js";

const validator = async () => {
  const req = parse(await readFile(path.join(installedProcessPackageRoot("iterative"), "types/REQ.yaml"), "utf8"));
  return new Ajv2020({strict: false}).compile(req.payload_schema);
};
const stakeholder = {publication: "recorded", kind: "stakeholder", statement: "Staff see the seat count"};
const software = {publication: "recorded", kind: "software", ears: {pattern: "ubiquitous", system: "The seat service", response: "report the seat count"}};

test("stakeholder requirements carry neither level nor component", async () => {
  const validate = await validator();
  expect(validate(stakeholder), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({...stakeholder, level: "system"})).toBe(false);
  expect(validate({...stakeholder, component: "seat service"})).toBe(false);
});

test("high-level and low-level requirements name their component", async () => {
  const validate = await validator();
  for (const level of ["high-level", "low-level"]) {
    expect(validate({...software, level})).toBe(false);
    expect(validate({...software, level, component: "seat service"}), JSON.stringify(validate.errors)).toBe(true);
  }
  expect(validate({...software, level: "component", component: "seat service"})).toBe(false);
});

test("system requirements name no component and unlevelled software stays valid", async () => {
  const validate = await validator();
  expect(validate({...software, level: "system"}), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({...software, level: "system", component: "seat service"})).toBe(false);
  expect(validate(software), JSON.stringify(validate.errors)).toBe(true);
});
