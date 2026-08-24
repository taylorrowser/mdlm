import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { processPackageDigest } from "../../src/process-package-digest.js";

/** Restore and verify the exact pre-fix package bytes used by immutable fixtures. */
export async function restoreHistoricalFixtureProcessPackage(
  processRoot: string,
  expectedDigest: string,
): Promise<void> {
  const stagingRoot = await fs.mkdtemp(
    path.join(path.dirname(processRoot), ".historical-package-"),
  );
  const stagedPackage = path.join(stagingRoot, "package");
  const preservedPackage = path.join(stagingRoot, "preserved");
  let retainStagingRoot = false;
  try {
    await fs.cp(processRoot, stagedPackage, { recursive: true });
    const selectorPath = path.join(
      stagedPackage,
      "selectors/review-assignment-context-members-for.yaml",
    );
    await fs.rm(selectorPath);

    const manifestPath = path.join(stagedPackage, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    const restoredManifest = manifest.replace(
      "    - review-assignment-context-members-for\n",
      "",
    );
    if (restoredManifest === manifest) {
      throw new Error("Historical fixture manifest selector is absent");
    }
    await fs.writeFile(manifestPath, restoredManifest);

    const obligationPath = path.join(
      stagedPackage,
      "obligations/passing-review-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    const restoredObligation = obligation.replace(
      "select(\"review-assignment-context-members-for@1\", {subject: subject})",
      "select(\"review-context-members-for@1\", {subject: subject})",
    );
    if (restoredObligation === obligation) {
      throw new Error("Historical fixture Assignment selector is absent");
    }
    await fs.writeFile(obligationPath, restoredObligation);

    const restoredDigest = await processPackageDigest(stagedPackage);
    if (restoredDigest !== expectedDigest) {
      throw new Error(
        `Restored Process Package digest '${restoredDigest}' does not match '${expectedDigest}'`,
      );
    }

    await fs.rename(processRoot, preservedPackage);
    try {
      await fs.rename(stagedPackage, processRoot);
    } catch (installationError) {
      try {
        await fs.rename(preservedPackage, processRoot);
      } catch (rollbackError) {
        retainStagingRoot = true;
        throw new AggregateError(
          [installationError, rollbackError],
          `Historical Process Package installation and rollback failed; preserved package retained at '${preservedPackage}'`,
        );
      }
      throw installationError;
    }
  } finally {
    if (!retainStagingRoot) {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
  }
}

export async function ensureFixtureProcessPackage(
  repository: string,
  expected: { reference: string; digest: string },
  fixtureDescription: string,
): Promise<string> {
  const selectionPath = path.join(repository, ".lifecycle/process-selection.json");
  const selection = JSON.parse(await fs.readFile(selectionPath, "utf8")) as {
    package?: { reference?: string; digest?: string; path?: string };
  };
  const lifecycleRoot = path.resolve(repository, ".lifecycle");
  const packageRoot = typeof selection.package?.path === "string"
    ? path.resolve(repository, selection.package.path)
    : undefined;
  if (packageRoot && !packageRoot.startsWith(`${lifecycleRoot}${path.sep}`)) {
    throw new Error(`Selected Process Package path escapes .lifecycle for ${fixtureDescription}`);
  }
  if (
    packageRoot &&
    await processPackageDigest(packageRoot) !== selection.package?.digest
  ) {
    throw new Error(`Installed Process Package drift before ${fixtureDescription}`);
  }
  if (
    packageRoot &&
    selection.package?.reference === expected.reference &&
    selection.package.digest !== expected.digest
  ) {
    await restoreHistoricalFixtureProcessPackage(packageRoot, expected.digest);
    selection.package.digest = expected.digest;
    await fs.writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
    const descriptorPath = path.join(repository, ".lifecycle/repository.json");
    const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8")) as {
      package?: { digest?: string };
    };
    if (descriptor.package) {
      descriptor.package.digest = expected.digest;
      await fs.writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    }
  }
  if (
    selection.package?.reference !== expected.reference ||
    selection.package.digest !== expected.digest ||
    !packageRoot
  ) {
    throw new Error(`Selected Process Package mismatch for ${fixtureDescription}`);
  }
  if (await processPackageDigest(packageRoot) !== expected.digest) {
    throw new Error(`Installed Process Package digest mismatch for ${fixtureDescription}`);
  }
  return packageRoot;
}

export async function copiedProcessPackage(
  prefix = "mdlm-process-",
): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

const phase0FoundationObligations = [
  "initial-wayfinding-map-required",
  "product-specification-required",
  "stakeholder-requirements-required",
  "intent-candidate-required",
  "foundation-review-correction-required",
  "intent-candidate-review-correction-required",
  "gate-signoff-review-correction-required",
];

export async function suppressPhase0FoundationObligations(
  processRoot: string,
): Promise<void> {
  for (const obligation of phase0FoundationObligations) {
    const obligationPath = path.join(
      processRoot,
      `obligations/${obligation}.yaml`,
    );
    const source = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      source.replace(
        "phases: [phase-0-wayfinding]",
        "phases: [phase-1-product-assurance]",
      ),
    );
  }
  const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  let phase = await fs.readFile(phasePath, "utf8");
  for (const obligation of phase0FoundationObligations) {
    phase = phase.replace(`  - ${obligation}@1\n`, "");
  }
  await fs.writeFile(phasePath, phase);
}

export async function distinctProgressionProcessPackage(
  prefix = "mdlm-distinct-progression-",
): Promise<string> {
  const processRoot = await copiedProcessPackage(prefix);
  await suppressPhase0FoundationObligations(processRoot);
  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(
    manifestPath,
    manifest.replace("id: mdlm-bootstrap", "id: mdlm-distinct-progression"),
  );
  const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase = await fs.readFile(phasePath, "utf8");
  await fs.writeFile(
    phasePath,
    phase.replace(
      /    condition: >-[\s\S]*?    policy_ref: phase-progression-participation@1/,
      `    condition: >-\n      every("candidate-baselines-of-kind@1",\n        {baseline_kind: "intent-level-candidate"}, candidate =>\n          exists("applicable-disposition-decisions-for@1",\n            {subject: candidate, decision_kind: "scope"}))\n    policy_ref: phase-progression-participation@1`,
    ).replace(
      "    scenario: record-gate-signoff@3\n    subjects:",
      "    scenario: record-consequential-decision@1\n    subjects:",
    ).replace(
      "    evidence_selector: applicable-gate-signoffs-for@1",
      "    evidence_selector: applicable-disposition-decisions-for@1",
    ),
  );
  return processRoot;
}

export async function renamedBaselineProcessPackage(
  prefix = "mdlm-process-",
): Promise<string> {
  const processRoot = await copiedProcessPackage(prefix);
  const replaceInYamlFiles = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await replaceInYamlFiles(entryPath);
      else if (entry.name.endsWith(".yaml")) {
        const source = await fs.readFile(entryPath, "utf8");
        await fs.writeFile(entryPath, source.replaceAll("BSL", "SNP"));
      }
    }
  };
  await replaceInYamlFiles(processRoot);
  return processRoot;
}
