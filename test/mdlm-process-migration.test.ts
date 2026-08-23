import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mdlm,
  selectProcessPackageFixture,
  stageProcessPackageFixture,
} from "./helpers/mdlm.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

// Twice the slower successful exact max-2 case is 2 * 34,753 = 69,506 ms.
// Round up to 70,000 ms; this also clears the 30,316 and 30,571 ms failed observations.
const CONTENDED_PROCESS_MIGRATION_TEST_TIMEOUT_MS = 70_000;

async function packageCopy(
  parent: string,
  name: string,
  version: string,
  packageId = "mdlm-bootstrap",
): Promise<string> {
  const root = path.join(parent, name);
  await fs.cp(bootstrapPackage, root, { recursive: true });
  const manifestPath = path.join(root, "manifest.yaml");
  await fs.writeFile(
    manifestPath,
    (await fs.readFile(manifestPath, "utf8"))
      .replace("id: mdlm-bootstrap", `id: ${packageId}`)
      .replace("version: 0.74.0", `version: ${version}`),
  );
  return root;
}

async function contractBytes(repository: string): Promise<string> {
  return JSON.stringify(
    await Promise.all(
      [
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ].map(
        async (relativePath) => [
        relativePath,
        await fs.readFile(path.join(repository, relativePath), "utf8"),
      ],
      ),
    ),
  );
}

describe("mdlm Process Package migration integrity", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-migration-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("rejects incompatible and byte-changed packages without changing exact contract bytes", async () => {
    const previousRoot = await packageCopy(parent, "previous", "0.40.0");
    await selectProcessPackageFixture(repository, previousRoot);
    const changedPackageRepository = path.join(parent, "changed-package-repository");
    await fs.cp(repository, changedPackageRepository, { recursive: true });

    const incompatibleRoot = await packageCopy(
      parent,
      "incompatible",
      "0.58.0",
    );
    const manifestPath = path.join(incompatibleRoot, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "media_type: text/markdown",
        "media_type: text/plain",
      ),
    );
    const incompatibleReference = await stageProcessPackageFixture(
      repository,
      incompatibleRoot,
    );
    const beforeIncompatible = await contractBytes(repository);
    const incompatible = mdlm(
      repository,
      "process",
      "migrate",
      incompatibleReference,
      "--json",
    );
    expect(incompatible.status).toBe(1);
    expect(JSON.parse(incompatible.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "repository-contract-incompatible" }),
    );
    expect(await contractBytes(repository)).toBe(beforeIncompatible);

    const changedReference = await stageProcessPackageFixture(
      changedPackageRepository,
      bootstrapPackage,
    );
    const targetObligation = path.join(
      changedPackageRepository,
      ".lifecycle/packages",
      changedReference,
      "obligations/review-context-required.yaml",
    );
    await fs.appendFile(targetObligation, "unexpected: true\n");
    const beforeChanged = await contractBytes(changedPackageRepository);
    const changed = mdlm(
      changedPackageRepository,
      "process",
      "migrate",
      changedReference,
      "--json",
    );
    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "meta-schema" }),
      ]),
    );
    expect(await contractBytes(changedPackageRepository)).toBe(beforeChanged);
  }, CONTENDED_PROCESS_MIGRATION_TEST_TIMEOUT_MS);

  it("rejects migration from a synthetic package when the target requires a fresh repository", async () => {
    const previousRoot = await packageCopy(
      parent,
      "synthetic-source",
      "99.0.0",
      "synthetic-source",
    );
    await selectProcessPackageFixture(repository, previousRoot);
    const targetReference = await stageProcessPackageFixture(
      repository,
      bootstrapPackage,
    );
    const before = await contractBytes(repository);

    const migrated = mdlm(
      repository,
      "process",
      "migrate",
      targetReference,
      "--json",
    );

    expect(migrated.status).toBe(1);
    expect(JSON.parse(migrated.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "fresh-repository-required" }),
    );
    expect(await contractBytes(repository)).toBe(before);
  }, CONTENDED_PROCESS_MIGRATION_TEST_TIMEOUT_MS);

});
