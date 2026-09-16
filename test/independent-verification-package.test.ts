import {readFile} from "node:fs/promises";
import path from "node:path";
import {test, expect} from "vitest";
import {parse} from "yaml";
import { Ajv2020 } from "ajv/dist/2020.js";

const definition = async (name: string) => parse(await readFile(path.join(process.cwd(), ".lifecycle/iterative", name), "utf8"));

test("verification activities require explicit intentions and allow shared cases across targets", async () => {
  const vfy = await definition("types/VFY.yaml");
  const validate = new Ajv2020({strict: false}).compile(vfy.payload_schema);
  const targets = ["REQ-ABC-r00001", "REQ-DEF-r00001"];
  const candidate = {publication:"recorded",method:"browser demonstration and replay",objective:"Complete a scored hand",cases:[{id:"hand",targets,preconditions:["A new game"],actions:["Record the hand"],expected_results:["Scores match the requirements"],coverage_rationale:"The workflow establishes both visible obligations"}],coverage:targets.map(target=>({target,obligations:["Display the specified score"],case_ids:["hand"],rationale:"The shared workflow exercises this obligation"})),repository_path:"/verification",source_commit:"a".repeat(40),verification_image:`sha256:${"b".repeat(64)}`,verification_command:["node","verify.mjs"],verification_script:"verify.mjs",results_path:"results.json",authoring_subject:"RQS-ABC-r00001",authoring_context:`sha256:${"c".repeat(64)}`};
  expect(validate(candidate), JSON.stringify(validate.errors)).toBe(true);
  const missingExpected = structuredClone(candidate) as Record<string,any>;
  delete missingExpected.cases[0].expected_results;
  expect(validate(missingExpected)).toBe(false);
  const missingCoverage = structuredClone(candidate) as Record<string,any>;
  missingCoverage.coverage=[];
  expect(validate(missingCoverage)).toBe(false);
});

test("fresh iterative results retain incomplete outcomes and separate verification from product source", async () => {
  const imp = await definition("types/IMP.yaml");
  const res = await definition("types/RES.yaml");
  const observation = await definition("actions/observe-prototype.yaml");
  expect(imp.payload_schema.required).not.toContain("verification_script");
  expect(imp.outgoing_links.find((l:any)=>l.id==="verification").cardinality.minimum).toBe(1);
  expect(res.payload_schema.properties.case_results.items.properties.outcome.enum).toContain("skipped");
  expect(res.kernel_managed_payload_paths).toEqual(expect.arrayContaining(["case_results","artifacts","outcome","receipt"]));
  expect(observation.links.OBS["uses-evidence"]).toBe("results");
});
