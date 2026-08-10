import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  req,
  selectBootstrapProcessPackage,
  selectProcessPackage,
} from "./helpers/req.js";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";

describe("req schema", () => {
  let repositoryRoot: string;
  const externalRoots: string[] = [];

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-schema-"));
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(repositoryRoot, { recursive: true, force: true }),
      ...externalRoots.splice(0).map((root) =>
        fs.rm(root, { recursive: true, force: true })
      ),
    ]);
  });

  it("projects one effective lifecycle type from the exact selected Process Package", () => {
    selectBootstrapProcessPackage(repositoryRoot);

    const result = req(repositoryRoot, "schema", "STK", "--json");

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "schema",
      package: {
        id: "mdlm-bootstrap",
        version: "0.52.0",
        reference: "mdlm-bootstrap@0.52.0",
        language: "mdlm-expression@1",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      selected: true,
      schema: {
        definition: "STK@4",
        name: "Stakeholder Requirement",
        description: expect.stringContaining("stakeholder-visible"),
        templateChain: [
          "titled-datum@1",
          "rationale-bearing@1",
          "requirement@2",
        ],
        effectiveEnvelope: expect.objectContaining({
          $id: "https://mdlm.dev/kernel/process-interface/v1/datum-envelope.schema.json",
          required: [
            "id",
            "revision",
            "revision_id",
            "type",
            "payload",
            "links",
            "created_by",
            "body",
          ],
        }),
        flattenedPayloadSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          additionalProperties: false,
          required: [
            "priority",
            "rationale",
            "stakeholder",
            "statement",
            "title",
            "verification_intent",
          ],
          properties: {
            title: { type: "string", minLength: 1 },
            rationale: { type: "string", minLength: 1 },
            statement: { type: "string", minLength: 1 },
            verification_intent: { type: "string", minLength: 1 },
            stakeholder: { type: "string", minLength: 1 },
            priority: { enum: ["must", "should", "could"] },
          },
        },
        sourceOwnedLinkContracts: [{
          id: "corrects-review",
          description: expect.stringContaining("failed Reviews"),
          targets: [{ kind: "datum", types: ["REV"], identity: "revision" }],
          cardinality: { minimum: 0, maximum: "many" },
          freeze_resolution: "already-exact",
          inverse_label: "corrected-by",
        }, {
          id: "changed-under",
          description: expect.stringContaining("Change Request"),
          targets: [{ kind: "datum", types: ["CHG"], identity: "revision" }],
          cardinality: { minimum: 0, maximum: 1 },
          freeze_resolution: "already-exact",
          inverse_label: "changed-requirement",
        }, {
          id: "derived-from",
          description: expect.stringContaining("Product specification intent"),
          targets: [{ kind: "datum", types: ["PSP"], identity: "stable" }],
          cardinality: { minimum: 1, maximum: 1 },
          freeze_resolution: "exact-revision",
          inverse_label: "derives",
        }, {
          id: "corrects-gate-rejection",
          description: expect.stringContaining("gate rejection"),
          targets: [{ kind: "datum", types: ["DEC"], identity: "revision" }],
          cardinality: { minimum: 0, maximum: "many" },
          freeze_resolution: "already-exact",
          inverse_label: "corrected-after-gate-rejection",
        }],
        lifecycleBehavior: {
          authorship: "authored",
          freeze_when: "baseline-frozen",
        },
        kernelCapabilityBindings: [],
      },
      diagnostics: [],
    });
  });

  it("reports the Kernel Capability binding for any package-defined type ID", async () => {
    const processRoot = await renamedBaselineProcessPackage("mdlm-schema-neutral-");
    externalRoots.push(path.dirname(processRoot));
    selectProcessPackage(
      repositoryRoot,
      processRoot,
      "mdlm-bootstrap@0.52.0",
    );

    const result = req(repositoryRoot, "schema", "SNP", "--json");

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).schema).toEqual(expect.objectContaining({
      definition: "SNP@4",
      kernelCapabilityBindings: [{
        reference: "exact-baseline@1",
        binding: { type: "SNP" },
      }],
    }));
  });

  it("renders the same effective type evidence for a human", () => {
    selectBootstrapProcessPackage(repositoryRoot);
    const machine = req(repositoryRoot, "schema", "STK", "--json");
    expect(machine.status, machine.stderr).toBe(0);
    const output = JSON.parse(machine.stdout);

    const human = req(repositoryRoot, "schema", "STK");

    expect(human.status, human.stderr).toBe(0);
    for (const evidence of [
      `Process Package: ${output.package.reference}`,
      `Expression Language: ${output.package.language}`,
      `Digest: ${output.package.digest}`,
      `Lifecycle Type: ${output.schema.definition}`,
      `Name: ${output.schema.name}`,
      `Description: ${output.schema.description}`,
      `Template Chain: ${output.schema.templateChain.join(" → ")}`,
      `Effective Envelope: ${JSON.stringify(output.schema.effectiveEnvelope)}`,
      `Flattened Payload Schema: ${JSON.stringify(output.schema.flattenedPayloadSchema)}`,
      `Source-owned Link Contracts: ${JSON.stringify(output.schema.sourceOwnedLinkContracts)}`,
      `Lifecycle Behavior: ${JSON.stringify(output.schema.lifecycleBehavior)}`,
      "Kernel Capability Bindings: none",
    ]) {
      expect(human.stdout).toContain(evidence);
    }
  });

  it("returns a typed diagnostic for an unknown lifecycle type", () => {
    selectBootstrapProcessPackage(repositoryRoot);

    const result = req(repositoryRoot, "schema", "UNKNOWN", "--json");

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "schema",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.52.0",
      }),
      selected: true,
      diagnostics: [{
        code: "unknown-type",
        path: "types.UNKNOWN",
        message: "Unknown lifecycle type 'UNKNOWN'",
      }],
    });
  });

  it("returns a typed diagnostic when no Process Package is selected", () => {
    const result = req(repositoryRoot, "schema", "STK", "--json");

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "schema",
      selected: false,
      diagnostics: [{
        code: "process-package-not-selected",
        message:
          "No Process Package is selected; run 'mdlm process use <package@version>'",
      }],
    });
  });

  it("returns selected-package diagnostics instead of inspecting an invalid package", async () => {
    selectBootstrapProcessPackage(repositoryRoot);
    const selectedType = path.join(
      repositoryRoot,
      ".lifecycle/packages/mdlm-bootstrap@0.52.0/types/STK.yaml",
    );
    await fs.appendFile(selectedType, "unexpected_private_field: true\n");

    const result = req(repositoryRoot, "schema", "STK", "--json");

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "schema",
      selected: true,
      diagnostics: [expect.objectContaining({
        code: "meta-schema",
        path: expect.stringContaining("types/STK.yaml"),
      })],
    });
  });
});
