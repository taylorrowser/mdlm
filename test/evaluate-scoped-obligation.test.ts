import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type ProcessPackage,
} from "../src/index.js";
import { copiedProcessPackage } from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

const PROCESS_REF =
  "mdlm-bootstrap@0.33.0#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function scopedProcessPackage(
  scope: "phase" | "process" = "phase",
): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-scoped-obligation-");
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
    when: 'value == "phase-0-wayfinding@2"'
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
        id: `initial-map-required@1:phase-0-wayfinding@2:${PROCESS_REF}`,
        obligation: "initial-map-required",
        subject: "phase-0-wayfinding@2",
        status: "ready",
        eventualResolver: "chart-wayfinding-map@1",
        actionableResolver: "chart-wayfinding-map@1",
        dispatchable: true,
        blockedBy: [],
        unresolvedBindings: [],
      }),
    ]);
  });

  it("binds and authorizes the exact selected Process as an Obligation subject", async () => {
    const processScopedRoot = await scopedProcessPackage("process");
    const repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-process-obligation-repository-"),
    );
    try {
      const loaded = await loadProcessPackage(processScopedRoot);
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));

      const evaluation = evaluateLifecycle(loaded.package, {
        processRef: PROCESS_REF,
        phaseId: "phase-0-wayfinding",
        records: [],
        dependencyComparisons: [],
      });

      expect(evaluation.diagnostics).toEqual([]);
      expect(evaluation.looseEnds).toEqual([
        expect.objectContaining({
          id: `initial-map-required@1:process@phase-0-wayfinding@2:${PROCESS_REF}`,
          subject: "process@phase-0-wayfinding@2",
          dispatchable: true,
          actionableResolver: "chart-wayfinding-map@1",
        }),
      ]);

      const initialized = req(
        repositoryRoot,
        "init",
        "--process",
        processScopedRoot,
        "--json",
      );
      expect(initialized.status, initialized.stderr).toBe(0);
      const next = req(
        repositoryRoot,
        "next",
        "--phase",
        "phase-0-wayfinding",
        "--json",
      );
      expect(next.status, next.stderr).toBe(0);
      const item = JSON.parse(next.stdout).next.item;
      expect(item).toEqual(expect.objectContaining({
        subject: "process@phase-0-wayfinding@2",
        dispatchable: true,
      }));
      const dryRun = req(
        repositoryRoot,
        "scenario",
        "dry-run",
        "chart-wayfinding-map@1",
        "--obligation",
        item.id,
        "--json",
      );
      expect(dryRun.status, dryRun.stderr).toBe(0);
      expect(JSON.parse(dryRun.stdout).scenarioDryRun.authorization).toEqual({
        mode: "dispatchable-obligation",
        obligation: item.id,
      });
    } finally {
      await Promise.all([
        fs.rm(path.dirname(processScopedRoot), {
          recursive: true,
          force: true,
        }),
        fs.rm(repositoryRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it("authorizes and satisfies the initial Resolver through public req commands", async () => {
    const repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-phase-obligation-repository-"),
    );
    try {
      const initialized = req(
        repositoryRoot,
        "init",
        "--process",
        processRoot,
        "--json",
      );
      expect(initialized.status, initialized.stderr).toBe(0);

      const looseEndsResult = req(
        repositoryRoot,
        "loose-ends",
        "--phase",
        "phase-0-wayfinding",
        "--json",
      );
      expect(looseEndsResult.status, looseEndsResult.stderr).toBe(0);
      const looseEnds = JSON.parse(looseEndsResult.stdout).looseEnds.items;
      const initial = looseEnds.find(
        (item: { obligation: string }) =>
          item.obligation === "initial-map-required",
      );
      expect(initial).toEqual(expect.objectContaining({
        subject: "phase-0-wayfinding@2",
        dispatchable: true,
        actionableResolver: "chart-wayfinding-map@1",
      }));
      expect(initial.id).toMatch(
        /^initial-map-required@1:phase-0-wayfinding@2:mdlm-bootstrap@0\.33\.0#sha256:[a-f0-9]{64}$/,
      );

      const snapshotPath = path.join(repositoryRoot, "empty-snapshot.json");
      await fs.writeFile(
        snapshotPath,
        JSON.stringify({
          processRef: initial.id.replace(
            "initial-map-required@1:phase-0-wayfinding@2:",
            "",
          ),
          phaseId: "phase-0-wayfinding",
          records: [],
          dependencyComparisons: [],
        }),
      );
      const directlyEvaluated = req(
        repositoryRoot,
        "obligation",
        "evaluate",
        "initial-map-required@1",
        "--subject",
        "phase-0-wayfinding@2",
        "--snapshot",
        snapshotPath,
        "--json",
      );
      expect(directlyEvaluated.status, directlyEvaluated.stderr).toBe(0);
      expect(JSON.parse(directlyEvaluated.stdout).evaluation.result).toEqual(
        expect.objectContaining({ id: initial.id }),
      );
      const scalarPolicy = req(
        repositoryRoot,
        "policy",
        "evaluate",
        "scalar-string-policy@1",
        "--arg",
        "value=phase-0-wayfinding@2",
        "--snapshot",
        snapshotPath,
        "--json",
      );
      expect(scalarPolicy.status, scalarPolicy.stderr).toBe(0);
      expect(JSON.parse(scalarPolicy.stdout).evaluation.result).toEqual({
        matches: true,
      });

      const next = req(
        repositoryRoot,
        "next",
        "--phase",
        "phase-0-wayfinding",
        "--json",
      );
      expect(next.status, next.stderr).toBe(0);
      expect(JSON.parse(next.stdout).next.item).toEqual(
        expect.objectContaining({ id: initial.id }),
      );

      const dryRun = req(
        repositoryRoot,
        "scenario",
        "dry-run",
        "chart-wayfinding-map@1",
        "--obligation",
        initial.id,
        "--json",
      );
      expect(dryRun.status, dryRun.stderr).toBe(0);
      expect(JSON.parse(dryRun.stdout).scenarioDryRun).toEqual(
        expect.objectContaining({
          authorization: {
            mode: "dispatchable-obligation",
            obligation: initial.id,
          },
          obligation: expect.objectContaining({
            instance: initial.id,
            subject: "phase-0-wayfinding@2",
            dispatchable: true,
          }),
          invocations: [{ inputs: [] }],
        }),
      );

      const adapterPath = path.join(repositoryRoot, "adapter.mjs");
      const response = {
        outputs: [{
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            id: "MAP-0123456789",
            type: "MAP",
            payload: {
              title: "Initial wayfinding map",
              purpose: "Establish the initial lifecycle frontier.",
              frontier: ["Compile the product specification."],
            },
            links: [],
            body: "Initial package-discovered wayfinding map.\n",
          },
        }],
        completionEvidence: {
          summary: "The initial map establishes a non-empty frontier.",
        },
      };
      await fs.writeFile(
        adapterPath,
        `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write(${JSON.stringify(JSON.stringify(response))}));\n`,
        { mode: 0o755 },
      );

      const executed = req(
        repositoryRoot,
        "scenario",
        "execute",
        "chart-wayfinding-map@1",
        "--obligation",
        initial.id,
        "--adapter",
        adapterPath,
        "--json",
      );
      expect(executed.status, executed.stderr).toBe(0);
      expect(JSON.parse(executed.stdout).execution).toEqual(
        expect.objectContaining({ status: "completed" }),
      );

      const after = req(
        repositoryRoot,
        "loose-ends",
        "--phase",
        "phase-0-wayfinding",
        "--json",
      );
      expect(after.status, after.stderr).toBe(0);
      const remaining = JSON.parse(after.stdout).looseEnds.items;
      expect(
        remaining.some(
          (item: { obligation: string }) =>
            item.obligation === "initial-map-required",
        ),
      ).toBe(false);
      expect(remaining).toEqual(expect.arrayContaining([
        expect.objectContaining({
          obligation: "review-context-required",
          subject: "MAP-0123456789-r00001",
        }),
      ]));

      const linkedDecision = req(
        repositoryRoot,
        "new",
        "DEC",
        "--scenario",
        "compile-psp@1",
        "--set",
        "title=Scoped obligation link",
        "--set",
        "rationale=Exact scoped obligation targets remain graph-addressable",
        "--set",
        "kind=decision",
        "--set",
        "decision=Preserve the exact scoped target",
        "--set",
        'alternatives=["Omit the graph edge"]',
        "--set",
        "effective_scope=initial package outcome",
        "--link",
        `waives=${initial.id}`,
        "--json",
      );
      expect(linkedDecision.status, linkedDecision.stderr).toBe(0);
      const linkedDecisionRevision = JSON.parse(linkedDecision.stdout).created
        .revisionId;
      const baseline = req(
        repositoryRoot,
        "baseline",
        "create",
        "--type",
        "BSL",
        "--scenario",
        "create-review-context@1",
        "--set",
        "title=Scoped obligation target context",
        "--set",
        "kind=review-context",
        "--set",
        "role=review-context",
        "--set",
        "scope=scoped obligation graph",
        "--set",
        "group=DEFAULT",
        "--json",
      );
      expect(baseline.status, baseline.stderr).toBe(0);
      const baselineId = JSON.parse(baseline.stdout).created.id;
      const added = req(
        repositoryRoot,
        "baseline",
        "add",
        baselineId,
        linkedDecisionRevision,
        "--json",
      );
      expect(added.status, added.stderr).toBe(0);
      const frozen = req(
        repositoryRoot,
        "baseline",
        "freeze",
        baselineId,
        "--json",
      );
      expect(frozen.status, frozen.stderr).toBe(0);
    } finally {
      await fs.rm(repositoryRoot, { recursive: true, force: true });
    }
  }, 15_000);
});
