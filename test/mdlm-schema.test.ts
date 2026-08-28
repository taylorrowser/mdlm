import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import {
  loadProcessPackage,
  resolveType,
  type ProcessPackage,
} from "../src/index.js";
import {
  packageSummary,
  processSelection,
  type PackageSummary,
} from "../src/repository-contract.js";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";

async function applicationMdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

async function arrangeSelectedPackage(
  repository: string,
  sourceRoot: string,
  summary: PackageSummary,
): Promise<void> {
  const lifecycleRoot = path.join(repository, ".lifecycle");
  const installedRoot = path.join(
    lifecycleRoot,
    "packages",
    summary.reference,
  );
  await fs.mkdir(path.dirname(installedRoot), { recursive: true });
  await fs.cp(sourceRoot, installedRoot, { recursive: true });
  await fs.writeFile(
    path.join(lifecycleRoot, "process-selection.json"),
    `${JSON.stringify(processSelection(summary), null, 2)}\n`,
  );
}

describe("mdlm schema", () => {
  const temporaryRoots: string[] = [];
  let currentPackage: ProcessPackage;
  let currentSummary: PackageSummary;
  let publicRepository: string;

  async function temporaryRepository(prefix: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    temporaryRoots.push(root);
    return root;
  }

  beforeAll(async () => {
    const currentRoot = path.join(process.cwd(), ".lifecycle/process");
    const loaded = await loadProcessPackage(currentRoot);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    currentPackage = deepFreeze(loaded.package);
    currentSummary = deepFreeze(await packageSummary(currentPackage, currentRoot));
    publicRepository = await temporaryRepository("mdlm-schema-public-");
    await arrangeSelectedPackage(publicRepository, currentRoot, currentSummary);
  });

  afterAll(async () => {
    await Promise.all(
      temporaryRoots.map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("projects one effective lifecycle type from the exact selected Process Package", async () => {
    const result = await applicationMdlm(publicRepository, "schema", "STK", "--json");

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "schema",
      package: {
        id: "mdlm-bootstrap",
        version: "0.75.0",
        reference: "mdlm-bootstrap@0.75.0",
        language: "mdlm-expression@1",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      selected: true,
      schema: {
        definition: "STK@5",
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
            "system_context",
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
            system_context: {
              type: "string",
              pattern: "^[a-z][a-z0-9-]{0,62}$",
              description: expect.stringContaining("trust-context routing key"),
            },
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
          id: "corrects-gate-rejection",
          description: expect.stringContaining("gate rejection"),
          targets: [{ kind: "datum", types: ["DEC"], identity: "revision" }],
          cardinality: { minimum: 0, maximum: "many" },
          freeze_resolution: "already-exact",
          inverse_label: "corrected-by-gate-rejection",
        }, {
          id: "changed-under",
          description: expect.stringContaining("Change Request"),
          targets: [{ kind: "datum", types: ["CHG"], identity: "revision" }],
          cardinality: { minimum: 0, maximum: 1 },
          freeze_resolution: "already-exact",
          inverse_label: "changed-requirement",
        }, {
          id: "incorporates-answer",
          description: expect.stringContaining("reviewed product-answer Decisions"),
          targets: [{ kind: "datum", types: ["DEC"], identity: "revision" }],
          cardinality: { minimum: 0, maximum: "many" },
          freeze_resolution: "already-exact",
          inverse_label: "incorporated-by-stakeholder-requirement",
        }, {
          id: "derived-from",
          description: expect.stringContaining("Product specification intent"),
          targets: [{ kind: "datum", types: ["PSP"], identity: "stable" }],
          cardinality: { minimum: 1, maximum: 1 },
          freeze_resolution: "exact-revision",
          inverse_label: "derives",
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

  it("requires an explicit correction-authority classification for every failed Review", () => {
    const resolved = resolveType(currentPackage, "REV");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(`${resolved.type.id}@${resolved.type.version}`).toBe("REV@7");
    expect(resolved.type.payloadSchema.properties.correction_authority)
      .toEqual(expect.objectContaining({
        enum: ["stakeholder", "package-evidence"],
      }));
    expect(
      (resolved.type.payloadSchema.allOf as Array<Record<string, unknown>>)[0]
        ?.allOf,
    ).toContainEqual({
      if: {
        properties: { outcome: { const: "fail" } },
        required: ["outcome"],
      },
      then: { required: ["correction_authority"] },
      else: { not: { required: ["correction_authority"] } },
    });
  });

  it("reports the Kernel Capability binding for any package-defined type ID", async () => {
    const processRoot = await renamedBaselineProcessPackage("mdlm-schema-neutral-");
    temporaryRoots.push(path.dirname(processRoot));
    const loaded = await loadProcessPackage(processRoot);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    const renamedPackage = deepFreeze(loaded.package);
    const renamedSummary = deepFreeze(
      await packageSummary(renamedPackage, processRoot),
    );
    const repository = await temporaryRepository("mdlm-schema-neutral-repository-");
    await arrangeSelectedPackage(repository, processRoot, renamedSummary);

    const result = await applicationMdlm(repository, "schema", "SNP", "--json");

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).schema).toEqual(expect.objectContaining({
      definition: "SNP@4",
      kernelCapabilityBindings: [{
        reference: "exact-baseline@1",
        binding: { type: "SNP" },
      }],
    }));
  });

  it("renders the same effective type evidence for a human", async () => {
    const resolved = resolveType(currentPackage, "STK");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const human = await applicationMdlm(publicRepository, "schema", "STK");

    expect(human.status, human.stderr).toBe(0);
    for (const evidence of [
      `Process Package: ${currentSummary.reference}`,
      `Expression Language: ${currentSummary.language}`,
      `Digest: ${currentSummary.digest}`,
      `Lifecycle Type: ${resolved.type.id}@${resolved.type.version}`,
      `Name: ${resolved.type.name}`,
      `Description: ${resolved.type.description}`,
      `Template Chain: ${resolved.type.templateChain.join(" → ")}`,
      `Effective Envelope: ${JSON.stringify(resolved.type.envelopeSchema)}`,
      `Flattened Payload Schema: ${JSON.stringify(resolved.type.payloadSchema)}`,
      `Source-owned Link Contracts: ${JSON.stringify(resolved.type.outgoingLinks)}`,
      `Lifecycle Behavior: ${JSON.stringify(resolved.type.lifecycle)}`,
      "Kernel Capability Bindings: none",
    ]) {
      expect(human.stdout).toContain(evidence);
    }
  });

  it("returns a typed diagnostic for an unknown lifecycle type", async () => {
    const result = await applicationMdlm(
      publicRepository,
      "schema",
      "UNKNOWN",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "schema",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.75.0",
      }),
      selected: true,
      diagnostics: [{
        code: "unknown-type",
        path: "types.UNKNOWN",
        message: "Unknown lifecycle type 'UNKNOWN'",
      }],
    });
  });

  it("returns a typed diagnostic when no Process Package is selected", async () => {
    const repository = await temporaryRepository("mdlm-schema-unselected-");
    const result = await applicationMdlm(repository, "schema", "STK", "--json");

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "schema",
      selected: false,
      diagnostics: [{
        code: "process-package-not-selected",
        message:
          "No Process Package is selected; initialize a repository with 'mdlm init <destination>'",
      }],
    });
  });

  it("returns selected-package diagnostics instead of inspecting an invalid package", async () => {
    const repository = await temporaryRepository("mdlm-schema-invalid-");
    await arrangeSelectedPackage(
      repository,
      path.join(process.cwd(), ".lifecycle/process"),
      currentSummary,
    );
    const selectedType = path.join(
      repository,
      ".lifecycle/packages/mdlm-bootstrap@0.75.0/types/STK.yaml",
    );
    await fs.appendFile(selectedType, "unexpected_private_field: true\n");

    const result = await applicationMdlm(repository, "schema", "STK", "--json");

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

  it("rejects a schema-valid selected package whose exact bytes are no longer current", async () => {
    const repository = await temporaryRepository("mdlm-schema-stale-");
    await arrangeSelectedPackage(
      repository,
      path.join(process.cwd(), ".lifecycle/process"),
      currentSummary,
    );
    const selectedType = path.join(
      repository,
      ".lifecycle/packages/mdlm-bootstrap@0.75.0/types/STK.yaml",
    );
    await fs.writeFile(
      selectedType,
      (await fs.readFile(selectedType, "utf8")).replace(
        "description: Singular stakeholder-visible",
        "description: Exact singular stakeholder-visible",
      ),
    );

    const result = await applicationMdlm(repository, "schema", "STK", "--json");

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "schema",
      selected: true,
      diagnostics: [expect.objectContaining({
        code: "process-package-selection-mismatch",
        path: expect.stringContaining(
          ".lifecycle/packages/mdlm-bootstrap@0.75.0",
        ),
        message: expect.stringContaining(
          "no longer matches its exact recorded version, language, and digest",
        ),
      })],
    });
  });
});
