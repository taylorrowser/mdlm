import { installedProcessPackageRoot } from "../src/installed-process-package.js";
import path from "node:path";
import {beforeAll, expect, test} from "vitest";
import {loadProcessPackage, type DatumEnvelope, type ProcessPackage} from "../src/index.js";
import {verificationStatus} from "../src/independent-verification.js";
import {finalizeDirectDomain} from "../src/direct-domain.js";

let pkg: ProcessPackage;
beforeAll(async () => {
  const loaded = await loadProcessPackage(path.join(installedProcessPackageRoot("iterative")));
  expect(loaded.diagnostics).toEqual([]);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  pkg = loaded.package;
});
const datum = (type: string, name: string, payload: DatumEnvelope["payload"] = {}, links: DatumEnvelope["links"] = []): DatumEnvelope => ({id: `${type}-${name}`, revision: 1, revision_id: `${type}-${name}-r00001`, type, payload, links, body: "Formal postrun fixture", created_by: {process_ref: "fixture@1"}});
const link = (type: string, target: DatumEnvelope) => ({type, target: target.revision_id});
const identity = {reference: "fixture@1", digest: "fixture", language: "fixture"};
function fixture() {
  const req = datum("REQ", "uncertainty", {title: "Unconfirmed submission", statement: "The browser shall communicate an unknown storage outcome without acceptance or absence claims and give a useful next step"});
  const set = datum("RQS", "selection", {}, [link("contains", req)]);
  const activity = datum("VFY", "capture", {method: "formal collection and independent postrun inspection", objective: "Capture exact input and complete message; independent REV judges unknown storage outcome, absence of acceptance or stored-absence claims, and a useful next step", cases: [{id: "lost-reply", targets: [req.revision_id], preconditions: ["Fresh document with exact entered input"], actions: ["Submit and withhold the reply"], expected_results: ["Collection preserves full input and message observations; semantics remain for independent REV"], coverage_rationale: "Collection assertions followed by frozen whole-message criteria"}], coverage: [{target: req.revision_id, obligations: ["Whole message communicates unknown storage outcome without acceptance or stored-absence claims and gives a useful next step"], case_ids: ["lost-reply"], rationale: "Execution checks collection; independent REV judges the full message in stimulus context"}]}, [link("verifies", req)]);
  const product = datum("IMP", "product", {source_commit: "a".repeat(40)}, [link("implements", set), link("verification", activity)]);
  const adequacy = datum("REV", "method", {outcome: "pass", coverage_assessments: [{target: req.revision_id, disposition: "adequate", rationale: "Frozen criteria and complete observations support the combined method"}]}, [link("reviews", activity)]);
  const result = datum("RES", "collection", {outcome: "pass", case_results: [{case_id: "lost-reply", outcome: "pass", actual_results: ["Complete observations collected; semantic judgment remains pending"], evidence_refs: ["observations.json"]}]}, [link("executes", product), link("evaluates", activity)]);
  const data = [req, set, activity, product, adequacy, result];
  const judgment = (outcome: "pass" | "fail", rationale: string) => datum("REV", "interpretation", {outcome, findings: rationale, coverage_assessments: [{target: req.revision_id, disposition: outcome === "pass" ? "adequate" : "needs-change", rationale}]}, [link("reviews", product)]);
  const status = () => verificationStatus({pkg, package: identity, data}, product.revision_id);
  const accept = () => finalizeDirectDomain({root: process.cwd(), pkg, package: identity, snapshot: "fixture", data, action: pkg.actions["accept-product"]!, subject: product.revision_id, inputs: {}, proposal: {operation: "accept", action: "accept-product", package: identity, snapshot: "fixture", candidates: []}, outputs: [datum("ACC", "acceptance", {decision: "accept"}, [link("accepts", product), link("confirms", set)])]});
  return {data, req, result, judgment, status, accept};
}

test("formal collection PASS stays blocked until supported independent semantic review", async () => {
  const f = fixture();
  expect(f.status()).toMatchObject({complete: false, requirements: [{execution: "pass", collectiveCoverage: "awaiting-coverage-review", overall: "awaiting-coverage-review"}]});
  await expect(f.accept()).rejects.toThrow("Acceptance requires adequate independently reviewed coverage");
  f.data.push(f.judgment("pass", "observations.json preserves exact input and the complete message 'We could not confirm whether your request was saved. Check the board before deciding whether to submit again.' communicates unknown storage outcome without acceptance or stored-absence claims and gives a useful next step; exact method source associates it with the withheld reply"));
  expect(f.status()).toMatchObject({complete: true, requirements: [{overall: "verified"}]});
  await expect(f.accept()).resolves.toMatchObject({outputs: [{type: "ACC"}]});
});

test.each([
  {reason: "semantic violation", rationale: "Complete message 'Saved successfully. Write rejected.' contradicts the required uncertainty, observations.json"},
  {reason: "evidence gap", rationale: "Complete message or stimulus association is absent from retained observations; criterion remains incomplete"},
])("independent review blocks acceptance for $reason", async ({rationale}) => {
  const f = fixture();
  f.data.push(f.judgment("fail", rationale));
  expect(f.status()).toMatchObject({complete: false, requirements: [{execution: "pass", collectiveCoverage: "rejected", overall: "rejected"}]});
  await expect(f.accept()).rejects.toThrow("Acceptance requires adequate independently reviewed coverage");
});

test.each(["fail", "error", "skipped"])("independent PASS cannot override raw %s", async (outcome) => {
  const f = fixture();
  f.result.payload.outcome = outcome === "skipped" ? "error" : outcome;
  (f.result.payload.case_results as any[])[0].outcome = outcome;
  f.data.push(f.judgment("pass", "A prose judgment cannot erase the raw execution outcome"));
  expect(f.status().complete).toBe(false);
  await expect(f.accept()).rejects.toThrow("Acceptance requires adequate independently reviewed coverage");
});
