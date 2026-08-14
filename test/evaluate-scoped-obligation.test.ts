import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type ProcessPackage,
} from "../src/index.js";
import {
  copiedProcessPackage,
  suppressPhase0FoundationObligations,
} from "./helpers/process-package.js";

const PROCESS_REF =
  "mdlm-bootstrap@0.59.0#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function scopedProcessPackage(
  scope: "phase" | "process" = "phase",
): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-scoped-obligation-");
  await suppressPhase0FoundationObligations(processRoot);
  const scopeCondition = scope === "phase"
    ? "required_scope.id == phase.id"
    : "required_scope.current_ref == process.current_ref";
  await fs.writeFile(
    path.join(processRoot, "selectors/wayfinding-maps.yaml"),
    `kind: selector-definition
id: wayfinding-maps
version: 1
description: Exact wayfinding map Revisions.
parameters: []
result_kind: revision
query:
  from: {collection: revisions, types: [MAP]}
  as: map
  where: 'true'
  distinct: true
  order_by: [identity.revision_id]
`,
  );
  await fs.writeFile(
    path.join(processRoot, "policies/scalar-string-policy.yaml"),
    `kind: policy-definition
id: scalar-string-policy
version: 1
description: Preserve strings that happen to match scoped subject identities.
parameters:
  - {name: value, kind: scalar, scalar_type: string}
result_schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  additionalProperties: false
  required: [matches]
  properties:
    matches: {type: boolean}
default: {matches: false}
rules:
  - priority: 100
    when: 'value == "phase-0-wayfinding@4"'
    result: {matches: true}
`,
  );
  await fs.writeFile(
    path.join(processRoot, "obligations/initial-map-required.yaml"),
    `kind: obligation-definition
id: initial-map-required
version: 1
description: The exact current ${scope === "phase" ? "Phase" : "Process"} requires an initial wayfinding map.
phases: [phase-0-wayfinding]
for_each: '[${scope}]'
subject_as: required_scope
satisfied_when: >-
  ${scopeCondition}
  && exists("wayfinding-maps@1", {})
status_rules:
  - status: ready
    priority: 100
    when: '${scopeCondition}'
    reason: The current ${scope === "phase" ? "Phase" : "Process"} requires its initial map.
default_status: blocked
resolve_with:
  scenario: chart-wayfinding-map@1
  inputs: {}
waiver_policy_ref: waiver-applicability@1
`,
  );

  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(
    manifestPath,
    manifest
      .replace(
        "  policies: [",
        "  policies: [scalar-string-policy, ",
      )
      .replace("  selectors:\n", "  selectors:\n    - wayfinding-maps\n")
      .replace(
        "  obligations:\n",
        "  obligations:\n    - initial-map-required\n",
      ),
  );

  const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase = await fs.readFile(phasePath, "utf8");
  await fs.writeFile(
    phasePath,
    phase.replace(
      "obligations:\n",
      "obligations:\n  - initial-map-required@1\n",
    ),
  );

  const scenarioPath = path.join(
    processRoot,
    "scenarios/chart-wayfinding-map.yaml",
  );
  const scenario = await fs.readFile(scenarioPath, "utf8");
  await fs.writeFile(
    scenarioPath,
    scenario
      .replace("initiation: explicit\n", "")
      .replace(
        "phases: [phase-0-wayfinding]",
        "phases: [phase-1-product-assurance, phase-0-wayfinding]",
      )
      .replace("resolves: []", "resolves: [initial-map-required]"),
  );
  return processRoot;
}

describe("evaluateLifecycle scoped Obligations", () => {
  let processRoot: string;
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    processRoot = await scopedProcessPackage();
    const loaded = await loadProcessPackage(processRoot);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  afterAll(async () => {
    await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
  });

  it("discovers required Phase work without a preexisting Lifecycle Datum", () => {
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: PROCESS_REF,
      phaseId: "phase-0-wayfinding",
      records: [],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.looseEnds).toEqual([
      expect.objectContaining({
        id: `initial-map-required@1:phase-0-wayfinding@4:${PROCESS_REF}`,
        obligation: "initial-map-required",
        subject: "phase-0-wayfinding@4",
        status: "ready",
        eventualResolver: "chart-wayfinding-map@1",
        actionableResolver: "chart-wayfinding-map@1",
        dispatchable: true,
        blockedBy: [],
        unresolvedBindings: [],
      }),
    ]);
  });

});
