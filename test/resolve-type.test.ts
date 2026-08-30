import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { beforeAll, describe, expect, it } from "vitest";
import { loadProcessPackage, resolveType, type ProcessPackage } from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";

async function copiedProcessPackage(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-type-resolution-"),
  );
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

describe("resolveType", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
  });

  it("flattens the kernel envelope and requirement template chain for STK", () => {
    const result = resolveType(processPackage, "STK");

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.type.templateChain).toEqual([
      "titled-datum@1",
      "rationale-bearing@1",
      "requirement@2",
    ]);
    expect(result.type.payloadSchema.required).toEqual([
      "priority",
      "rationale",
      "stakeholder",
      "statement",
      "system_context",
      "title",
      "verification_intent",
    ]);
    expect(Object.keys(result.type.payloadSchema.properties).sort()).toEqual([
      "priority",
      "rationale",
      "stakeholder",
      "statement",
      "system_context",
      "title",
      "verification_intent",
    ]);
    expect(result.type.outgoingLinks).toEqual([
      expect.objectContaining({
        id: "corrects-review",
        targets: [
          expect.objectContaining({ types: ["REV"], identity: "revision" }),
        ],
      }),
      expect.objectContaining({
        id: "corrects-gate-rejection",
        targets: [
          expect.objectContaining({ types: ["DEC"], identity: "revision" }),
        ],
      }),
      expect.objectContaining({
        id: "changed-under",
        targets: [
          expect.objectContaining({ types: ["CHG"], identity: "revision" }),
        ],
      }),
      expect.objectContaining({
        id: "incorporates-answer",
        targets: [
          expect.objectContaining({ types: ["DEC"], identity: "revision" }),
        ],
      }),
      expect.objectContaining({
        id: "derived-from",
        targets: [
          expect.objectContaining({ types: ["PSP"], identity: "stable" }),
        ],
      }),
    ]);
    expect(result.type.envelopeSchema.$id).toBe(
      "https://mdlm.dev/kernel/process-interface/v1/datum-envelope.schema.json",
    );
  });

  it("requires exact findings for a gate rejection without changing approval", () => {
    const result = resolveType(processPackage, "DEC");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      result.type.payloadSchema,
    );
    const decision = {
      title: "Gate decision",
      rationale: "Bind one exact candidate judgment.",
      kind: "gate-signoff",
      decision: "Return the candidate for correction.",
      alternatives: ["Approve"],
      effective_scope: "BSL-7K3M9Q2D8F-r00001",
      gate_outcome: "reject",
    };

    expect(validate(decision)).toBe(false);
    expect(validate({
      ...decision,
      gate_rejection: {
        findings: [{
          id: "G-001",
          summary: "The exact draft member remains ambiguous.",
        }],
      },
    })).toBe(true);
    expect(validate({
      ...decision,
      gate_outcome: "approve",
      decision: "Approve the exact candidate.",
    })).toBe(true);
  });

  it("binds Phase 0 simplification failure to one exact structured target", () => {
    const result = resolveType(processPackage, "REV");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      result.type.payloadSchema,
    );
    const review = {
      title: "Product simplification",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      outcome: "pass",
    };

    expect(validate(review)).toBe(true);
    expect(
      validate({
        ...review,
        simplification: {
          target: "STK-7K3M9Q2D8F-r00001",
          findings: [
            {
              id: "F-001",
              severity: "blocking",
              criterion:
                "A blocking primary Finding must identify the exact unmet criterion for its STK target.",
              evidence:
                "The reviewed STK statement conflicts with the exact stakeholder commitment represented by its target.",
              material_consequence:
                "The STK cannot enter an accepted intent baseline while the contradiction remains.",
              summary: "Unnecessary scope remains.",
            },
          ],
        },
      }),
    ).toBe(false);
    expect(validate({ ...review, outcome: "fail" })).toBe(false);
    expect(
      validate({
        ...review,
        outcome: "fail",
        correction_authority: "package-evidence",
        simplification: {
          target: "STK-7K3M9Q2D8F-r00001",
          findings: [
            {
              id: "F-001",
              severity: "blocking",
              summary: "Unnecessary scope remains.",
              criterion:
                "Every scope element is necessary for the product commitment.",
              evidence: "The target duplicates an already stated commitment.",
              material_consequence:
                "Retaining it creates contradictory acceptance scope.",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("requires evidence-complete primary blockers while keeping non-blocking triage usable", () => {
    const result = resolveType(processPackage, "REV");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      result.type.payloadSchema,
    );
    const review = {
      title: "Contextual review",
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      outcome: "fail",
      findings: [
        {
          id: "F-001",
          target: "STK-7K3M9Q2D8F-r00001",
          relationship: "primary",
          severity: "blocking",
          summary: "The stated behavior has two materially different outcomes.",
        },
      ],
    };

    expect(validate(review)).toBe(false);
    const evidenceCompleteBlocker = {
      ...review.findings[0],
      criterion: "One input has one observable outcome.",
      evidence: "The same input permits success and rejection.",
      material_consequence: "A verifier cannot determine conformance.",
    };
    expect(validate({
      ...review,
      correction_authority: "package-evidence",
      findings: [evidenceCompleteBlocker],
    })).toBe(true);
    expect(
      validate({
        ...review,
        outcome: "pass",
        findings: [evidenceCompleteBlocker],
      }),
    ).toBe(false);
    expect(
      validate({
        ...review,
        outcome: "pass",
        findings: [
          {
            ...review.findings[0],
            severity: "needs-triage",
          },
        ],
      }),
    ).toBe(true);
    expect(
      validate({
        ...review,
        definition_simplification: {
          set_kind: "phase-2-definition-set",
          set_key: "group",
          complete: true,
          primary_subjects: ["STK-7K3M9Q2D8F-r00001"],
          collateral_findings: [{
            id: "F-002",
            severity: "blocking",
            summary: "The complete set has a material contradiction.",
          }],
        },
      }),
    ).toBe(false);
  });

  it("preserves package-authored conditional payload constraints", () => {
    const result = resolveType(processPackage, "QST");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      result.type.payloadSchema,
    );
    const payload = {
      title: "Deferred choice",
      kind: "preferential",
      question: "Which boundary should be selected?",
      state: "deferred",
      blocking_impact: "The boundary remains unresolved.",
    };

    expect(validate(payload)).toBe(false);
    expect(validate.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        keyword: "required",
        params: { missingProperty: "reactivation_condition" },
      }),
    ]));
    expect(validate({
      ...payload,
      reactivation_condition: "Reopen when the boundary evidence changes.",
    })).toBe(true);
  });

  it("requires portable executables for inline pilot controls and their bindings", async () => {
    const sourcePackage = await loadProcessPackage(".lifecycle/process");
    expect(sourcePackage.ok).toBe(true);
    if (!sourcePackage.ok) return;
    const artResult = resolveType(sourcePackage.package, "ART");
    const vaiResult = resolveType(sourcePackage.package, "VAI");
    expect(artResult.ok).toBe(true);
    expect(vaiResult.ok).toBe(true);
    if (!artResult.ok || !vaiResult.ok) return;

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const record = (value: unknown) => value as Record<string, unknown>;
    for (const [result, controlsName] of [
      [artResult, "prototype_controls"],
      [vaiResult, "prototype_control_bindings"],
    ] as const) {
      const controls = record(record(result.type.payloadSchema.properties)[controlsName]);
      for (const controlName of ["known_good", "known_bad"]) {
        const control = record(record(controls.properties)[controlName]);
        const argvSchema = record(record(control.properties).argv);
        const validate = ajv.compile(argvSchema);
        expect(validate(["node", "-e", "process.exit(0)"])).toBe(true);
        expect(validate(["/usr/bin/node", "-e", "process.exit(0)"])).toBe(false);
      }
    }
  });

  it("keeps pilot prototype controls out of qualification implementations", async () => {
    const sourcePackage = await loadProcessPackage(".lifecycle/process");
    expect(sourcePackage.ok).toBe(true);
    if (!sourcePackage.ok) return;
    const vaiResult = resolveType(sourcePackage.package, "VAI");
    expect(vaiResult.ok).toBe(true);
    if (!vaiResult.ok) return;

    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      vaiResult.type.payloadSchema,
    );
    const qualification = {
      title: "Qualification implementation",
      rationale: "Exercise the declared environment capability.",
      kind: "qualification",
      implementation_ref: `procedure:sha256:${"0".repeat(64)}`,
      independence_mode: "environment-capability",
      authoring_input_refs: ["VSP-123456789A-r00001"],
      prohibited_inputs_observed: [
        "product source code",
        "product unit tests",
        "private implementation details",
        "uncontrolled implementation shortcuts",
      ],
      activity_bindings: ["VER-123456789A-r00001"],
      target_behavior: {
        supported: ["declared environment capability"],
        intentionally_unsupported: ["undeclared environment capability"],
      },
    };
    expect(validate(qualification)).toBe(true);
    expect(validate({
      ...qualification,
      prototype_control_bindings: {
        activity_ref: "VER-123456789A-r00001",
        known_good: {
          argv: ["example-command", "valid"],
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: ["example-command"],
          expected_verification_outcome: "fail",
        },
      },
    })).toBe(false);
  });

  it("preserves additive fields while applying a supported constraint narrowing", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace(
        "    title: {type: string, minLength: 1}",
        "    title: {type: string, minLength: 1, enum: [alpha, beta, gamma]}",
      ),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: string, minLength: 5, maxLength: 80, enum: [alpha, beta]}",
      ),
    );
    const loaded = await loadProcessPackage(processRoot);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!loaded.ok) return;

    const result = resolveType(loaded.package, "STK");

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;
    expect(result.type.payloadSchema.properties.title).toEqual({
      type: "string",
      minLength: 5,
      maxLength: 80,
      enum: ["alpha", "beta"],
    });
    expect(result.type.payloadSchema.required).toEqual([
      "priority",
      "rationale",
      "stakeholder",
      "statement",
      "system_context",
      "title",
      "verification_intent",
    ]);
  });
});
