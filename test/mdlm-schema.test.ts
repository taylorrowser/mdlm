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
    const resolved = resolveType(currentPackage, "STK");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const result = await applicationMdlm(publicRepository, "schema", "STK", "--json");

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "schema",
      package: currentSummary,
      selected: true,
      schema: {
        definition: `${resolved.type.id}@${resolved.type.version}`,
        name: resolved.type.name,
        description: resolved.type.description,
        templateChain: resolved.type.templateChain,
        effectiveEnvelope: resolved.type.envelopeSchema,
        flattenedPayloadSchema: resolved.type.payloadSchema,
        sourceOwnedLinkContracts: resolved.type.outgoingLinks,
        lifecycleBehavior: resolved.type.lifecycle,
        kernelCapabilityBindings: [],
      },
      diagnostics: [],
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
      package: currentSummary,
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

});
