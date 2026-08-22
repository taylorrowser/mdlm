import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { processPackageDigest } from "../src/process-package-digest.js";
import { initializeBundledRepository } from "../src/repository-initialization.js";
import { selectedPackage } from "../src/selected-package.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

async function initializedRepository(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-selected-cache-"));
  temporaryRoots.push(parent);
  const repository = path.join(parent, "repository");
  const initialized = await initializeBundledRepository(repository);
  expect(initialized.ok).toBe(true);
  return repository;
}

async function copyRepository(source: string): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-selected-cache-"));
  temporaryRoots.push(parent);
  const repository = path.join(parent, "repository");
  await fs.cp(source, repository, { recursive: true });
  return repository;
}

describe("selected Process Package cache", () => {
  it("isolates callers and package roots", async () => {
    const firstRoot = await initializedRepository();
    const secondRoot = await copyRepository(firstRoot);
    const first = await selectedPackage(firstRoot);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    first.processPackage.manifest.id = "caller-mutation";

    const firstAgain = await selectedPackage(firstRoot);
    const second = await selectedPackage(secondRoot);
    expect(firstAgain.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!firstAgain.ok || !second.ok) return;
    expect(firstAgain.processPackage.manifest.id).toBe("mdlm-bootstrap");
    expect(second.processPackage.root).not.toBe(firstAgain.processPackage.root);
  });

  it("separates historical-authoring compatibility from current validation", async () => {
    const repository = await initializedRepository();
    const descriptorPath = path.join(repository, ".lifecycle/process-selection.json");
    const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8")) as {
      package: { path: string; digest: string };
    };
    const packageRoot = path.resolve(repository, descriptor.package.path);
    await fs.rm(path.join(packageRoot, "prompts/compile-psp.md"));
    descriptor.package.digest = await processPackageDigest(packageRoot);
    await fs.writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);

    const historical = await selectedPackage(repository, {
      compatibility: "historical-authoring",
    });
    expect(historical.ok).toBe(true);

    const current = await selectedPackage(repository);
    expect(current.ok).toBe(false);
    if (current.ok) return;
    expect(current.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "prompt-read" }),
    ]));
  });
});
