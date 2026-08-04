import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleRecord,
} from "../src/index.js";
import {
  copiedProcessPackage,
  renamedBaselineProcessPackage,
} from "./helpers/process-package.js";

async function processPackageExercisingBaselineRelations(): Promise<string> {
  const processRoot = await renamedBaselineProcessPackage();
  const selectorDefinitions = {
    "capability-bound-baselines.yaml": `kind: selector-definition
id: capability-bound-baselines
version: 1
description: Capability-bound exact baselines.
parameters: []
result_kind: baseline
query:
  from: {collection: baselines, types: [SNP]}
  as: baseline
  where: 'true'
  distinct: true
  order_by: [identity.revision_id]
`,
    "capability-members-for.yaml": `kind: selector-definition
id: capability-members-for
version: 1
description: Exact definition members.
parameters:
  - {name: baseline, kind: revision, types: [SNP]}
result_kind: revision
query:
  from: {relation: baseline-members, of: baseline, emit: entity}
  as: member
  distinct: true
  order_by: [identity.revision_id]
`,
    "capability-evidence-for.yaml": `kind: selector-definition
id: capability-evidence-for
version: 1
description: Exact supporting evidence.
parameters:
  - {name: baseline, kind: revision, types: [SNP]}
result_kind: revision
query:
  from: {relation: baseline-evidence, of: baseline, emit: entity}
  as: evidence
  distinct: true
  order_by: [identity.revision_id]
`,
    "capability-composed-for.yaml": `kind: selector-definition
id: capability-composed-for
version: 1
description: Exact composed baselines.
parameters:
  - {name: baseline, kind: revision, types: [SNP]}
result_kind: baseline
query:
  from: {relation: baseline-composed, of: baseline, emit: entity}
  as: composed
  distinct: true
  order_by: [identity.revision_id]
`,
  };
  await Promise.all(
    Object.entries(selectorDefinitions).map(([name, source]) =>
      fs.writeFile(path.join(processRoot, "selectors", name), source)
    ),
  );

  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(
    manifestPath,
    manifest.replace(
      "  selectors:\n",
      "  selectors:\n    - capability-bound-baselines\n    - capability-members-for\n    - capability-evidence-for\n    - capability-composed-for\n",
    ),
  );

  const statePath = path.join(
    processRoot,
    "states/relationship-overlays.yaml",
  );
  const state = await fs.readFile(statePath, "utf8");
  await fs.writeFile(
    statePath,
    state
      .replace(
        "values: [superseded, newer-draft-exists, process-drift]",
        "values: [superseded, newer-draft-exists, process-drift, bound-baseline, has-members, has-evidence, has-composition]",
      )
      .replace(
        "rules:\n",
        `rules:
  - value: bound-baseline
    priority: 700
    when: 'subject.identity.type == "SNP" && exists("capability-bound-baselines@1", {})'
    explanation: The package-defined type is in the capability collection.
  - value: has-members
    priority: 600
    when: 'subject.identity.type == "SNP" && exists("capability-members-for@1", {baseline: subject})'
    explanation: The exact baseline has definition members.
  - value: has-evidence
    priority: 500
    when: 'subject.identity.type == "SNP" && exists("capability-evidence-for@1", {baseline: subject})'
    explanation: The exact baseline has supporting evidence.
  - value: has-composition
    priority: 400
    when: 'subject.identity.type == "SNP" && exists("capability-composed-for@1", {baseline: subject})'
    explanation: The exact baseline composes another exact baseline.
`,
      ),
  );
  return processRoot;
}

function record(
  id: string,
  type: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return {
    datum: {
      id,
      revision: 1,
      revision_id: `${id}-r00001`,
      type,
      payload,
      links,
      created_by: { process_ref: "git:current" },
      body: "",
    },
    storage: { editable: false, frozen: true },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

describe("exact-baseline@1 Kernel Capability", () => {
  it("loads the bootstrap package through an explicit versioned binding", async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.package.kernelCapabilities).toEqual({
      "exact-baseline@1": { type: "BSL" },
    });
    const primitives = result.package.primitives[
      "mdlm-kernel-process-interface"
    ];
    expect(primitives?.collections).toEqual(["stable-data", "revisions"]);
    expect(primitives?.capability_surfaces).toMatchObject({
      "exact-baseline@1": {
        collections: ["baselines"],
        relations: expect.arrayContaining([
          expect.objectContaining({ id: "baseline-members" }),
          expect.objectContaining({ id: "baseline-evidence" }),
          expect.objectContaining({ id: "baseline-memberships" }),
          expect.objectContaining({ id: "baseline-composed" }),
        ]),
      },
    });
    const baseline = resolveType(result.package, "BSL");
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.type.kernelCapabilities).toEqual(["exact-baseline@1"]);
  });

  it("rejects an unknown capability version", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    await fs.writeFile(
      manifestPath,
      manifest.replace("exact-baseline@1", "exact-baseline@2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        code: "unknown-kernel-capability",
        path: "manifest.kernel_capabilities.exact-baseline@2.type",
        message: "Unknown Kernel Capability 'exact-baseline@2'",
      },
    ]);
  });

  it("uses a differently named bound type for baseline collections and membership", async () => {
    const processRoot = await renamedBaselineProcessPackage();
    const loaded = await loadProcessPackage(processRoot);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!loaded.ok) return;

    const subject = record("PSP-7K3M9Q2D8F", "PSP", {
      title: "Subject",
      rationale: "Required context",
      problem: "No context",
      users: ["author"],
      goals: ["review"],
      non_goals: [],
      success_measures: ["reviewed"],
    });
    const baseline = record("SNP-X4N7AB2W6J", "SNP", {
      title: "Exact review context",
      kind: "review-context",
      role: "review-context",
      scope: "subject review",
      group: "DEFAULT",
      definition_members: [subject.datum.revision_id],
      evidence: [],
    });

    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [subject, baseline],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts[subject.datum.revision_id]?.states.maturity,
    ).toBe("review-frozen");
  });

  it("supplies collection, membership, evidence, and composition relations to the bound type", async () => {
    const processRoot = await processPackageExercisingBaselineRelations();
    const loaded = await loadProcessPackage(processRoot);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!loaded.ok) return;

    const member = record("PSP-7K3M9Q2D8F", "PSP", {
      title: "Member",
      rationale: "Definition",
      problem: "No definition",
      users: ["author"],
      goals: ["define"],
      non_goals: [],
      success_measures: ["defined"],
    });
    const evidence = record("REV-8ZT5KQ3P9M", "REV", {
      title: "Evidence",
      outcome: "pass",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [],
    });
    const composed = record("SNP-9ZT5KQ3P8M", "SNP", {
      title: "Composed baseline",
      kind: "group-candidate",
      role: "candidate",
      scope: "group",
      group: "A",
      definition_members: [],
      evidence: [],
    });
    const baseline = record(
      "SNP-X4N7AB2W6J",
      "SNP",
      {
        title: "Exact baseline",
        kind: "level-candidate",
        role: "candidate",
        scope: "level",
        group: "DEFAULT",
        definition_members: [member.datum.revision_id],
        evidence: [evidence.datum.revision_id],
      },
      [{ type: "composes", target: composed.datum.revision_id }],
    );

    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [member, evidence, composed, baseline],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts[baseline.datum.revision_id]?.states[
        "relationship-overlays"
      ],
    ).toEqual([
      "bound-baseline",
      "has-members",
      "has-evidence",
      "has-composition",
    ]);
  });

  it("does not expose baseline collections or relations without the capability", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    await fs.writeFile(
      manifestPath,
      manifest.replace(
        "kernel_capabilities:\n  exact-baseline@1:\n    type: BSL\n",
        "",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "capability-required",
          path: expect.stringContaining(
            "selectors/baselines-containing-with-role.yaml#query.from.relation",
          ),
          message:
            "Relation 'baseline-memberships' requires Kernel Capability exact-baseline@1",
        }),
        expect.objectContaining({
          code: "capability-required",
          path: expect.stringContaining(
            "selectors/candidate-baselines.yaml#query.from.collection",
          ),
          message:
            "Collection 'baselines' requires Kernel Capability exact-baseline@1",
        }),
      ]),
    );
  });

  it("rejects a bound type missing a required capability payload field", async () => {
    const processRoot = await copiedProcessPackage();
    const typePath = path.join(processRoot, "types/BSL.yaml");
    const definition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      definition.replace("    evidence:\n      type: array", "    support:\n      type: array"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible-kernel-capability",
          path: "manifest.kernel_capabilities.exact-baseline@1.type",
          message:
            "Type 'BSL' bound to exact-baseline@1 must define capability payload fields: evidence",
        }),
      ]),
    );
  });

  it("rejects a bound type without the capability composition contract", async () => {
    const processRoot = await copiedProcessPackage();
    const typePath = path.join(processRoot, "types/BSL.yaml");
    const definition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      definition.replace("  - id: composes", "  - id: assembles"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible-kernel-capability",
          path: "types.BSL.outgoing_links",
          message:
            "Type 'BSL' bound to exact-baseline@1 must declare the 'composes' exact-revision link to BSL",
        }),
      ]),
    );
  });

  it("rejects an incompatible capability payload field schema", async () => {
    const processRoot = await copiedProcessPackage();
    const typePath = path.join(processRoot, "types/BSL.yaml");
    const definition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      definition.replace(
        "    evidence:\n      type: array\n      uniqueItems: true\n      items: {type: string, pattern: '^[A-Z]{3,8}-[0-9A-HJKMNP-TV-Z]{10,12}-r[0-9]{5}$'}",
        "    evidence: {type: string}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible-kernel-capability",
          path: "types.BSL.payload_schema.properties.evidence",
          message:
            "exact-baseline@1 requires 'evidence' to be an array of strings",
        }),
      ]),
    );
  });

  it("rejects a bound type missing a required managed payload path", async () => {
    const processRoot = await copiedProcessPackage();
    const typePath = path.join(processRoot, "types/BSL.yaml");
    const definition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      definition.replace(
        "kernel_managed_payload_paths: [definition_members, evidence, snapshot]",
        "kernel_managed_payload_paths: [definition_members, snapshot]",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible-kernel-capability",
          path: "manifest.kernel_capabilities.exact-baseline@1.type",
          message:
            "Type 'BSL' bound to exact-baseline@1 must declare kernel-managed payload paths: evidence",
        }),
      ]),
    );
  });
});
