import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { ProcessPackage } from "../../src/index.js";
import { processPackageDigest } from "../../src/process-package-digest.js";

const DEFAULT_FIXTURE_ROOT = path.join(
  process.cwd(),
  "test/fixtures/canonical-process-package",
);
const CANONICAL_PROCESS_ROOT = ".lifecycle/process";
const DEFINITION_GROUPS = [
  "templates",
  "types",
  "policies",
  "states",
  "selectors",
  "obligations",
  "scenarios",
  "phases",
  "profiles",
  "aliases",
  "primitives",
] as const;

type FixtureManifest = {
  contract: "mdlm-canonical-process-package-fixture@1";
  schemaVersion: 1;
  artifact: {
    archive: string;
    compression: "gzip -n -9";
    compressedSha256: string;
    contentSha256: string;
    gzipHeaderMtime: 0;
  };
  processPackage: {
    root: ".lifecycle/process";
    reference: string;
    digest: string;
    definitionCount: number;
  };
  provenance: {
    sourceCommit: string;
    sourceTree: string;
    captureCommand: string;
  };
};

export interface CanonicalProcessPackageFixtureOptions {
  fixtureRoot?: string;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureManifest(value: unknown): FixtureManifest {
  const manifest = value as Partial<FixtureManifest> | null;
  const artifact = manifest?.artifact;
  const processPackage = manifest?.processPackage;
  const provenance = manifest?.provenance;
  if (
    typeof manifest !== "object" || manifest === null ||
    manifest.contract !== "mdlm-canonical-process-package-fixture@1" ||
    manifest.schemaVersion !== 1 ||
    typeof artifact !== "object" || artifact === null ||
    typeof artifact.archive !== "string" || artifact.archive === "" ||
    artifact.compression !== "gzip -n -9" ||
    !/^[a-f0-9]{64}$/.test(artifact.compressedSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(artifact.contentSha256 ?? "") ||
    artifact.gzipHeaderMtime !== 0 ||
    typeof processPackage !== "object" || processPackage === null ||
    processPackage.root !== CANONICAL_PROCESS_ROOT ||
    !/^[a-z][a-z0-9-]*@[0-9]+\.[0-9]+\.[0-9]+$/.test(
      processPackage.reference ?? "",
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(processPackage.digest ?? "") ||
    !Number.isInteger(processPackage.definitionCount) ||
    processPackage.definitionCount! < 1 ||
    typeof provenance !== "object" || provenance === null ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceTree ?? "") ||
    typeof provenance.captureCommand !== "string" ||
    provenance.captureCommand === ""
  ) {
    throw new Error("Invalid canonical Process Package fixture manifest");
  }
  return manifest as FixtureManifest;
}

function definitionCount(processPackage: ProcessPackage): number {
  return DEFINITION_GROUPS.reduce(
    (count, group) => count + Object.keys(processPackage[group]).length,
    0,
  );
}

function validatePackageShape(
  value: unknown,
  manifest: FixtureManifest,
): ProcessPackage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid serialized canonical Process Package");
  }
  const processPackage = value as Partial<ProcessPackage>;
  const reference = `${processPackage.manifest?.id}@${processPackage.manifest?.version}`;
  if (
    processPackage.root !== CANONICAL_PROCESS_ROOT ||
    reference !== manifest.processPackage.reference ||
    DEFINITION_GROUPS.some((group) =>
      typeof processPackage[group] !== "object" || processPackage[group] === null ||
      Array.isArray(processPackage[group])
    )
  ) {
    throw new Error("Serialized canonical Process Package identity or shape mismatch");
  }
  const typed = processPackage as ProcessPackage;
  if (definitionCount(typed) !== manifest.processPackage.definitionCount) {
    throw new Error("Serialized canonical Process Package definition-count mismatch");
  }
  return typed;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

async function readFixture(options: CanonicalProcessPackageFixtureOptions = {}): Promise<{
  manifest: FixtureManifest;
  processPackage: ProcessPackage;
}> {
  const fixtureRoot = path.resolve(options.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  const manifest = fixtureManifest(JSON.parse(
    await fs.readFile(path.join(fixtureRoot, "manifest.json"), "utf8"),
  ));
  const archivePath = path.resolve(fixtureRoot, manifest.artifact.archive);
  if (!archivePath.startsWith(`${fixtureRoot}${path.sep}`)) {
    throw new Error("Canonical Process Package fixture archive escapes its root");
  }
  const archive = await fs.readFile(archivePath);
  if (sha256(archive) !== manifest.artifact.compressedSha256) {
    throw new Error("Compressed digest mismatch for canonical Process Package fixture");
  }
  if (
    archive.length < 8 ||
    archive.readUInt32LE(4) !== manifest.artifact.gzipHeaderMtime
  ) {
    throw new Error("Non-deterministic canonical Process Package gzip header");
  }
  const content = gunzipSync(archive);
  if (sha256(content) !== manifest.artifact.contentSha256) {
    throw new Error("Content digest mismatch for canonical Process Package fixture");
  }
  const processPackage = validatePackageShape(
    JSON.parse(content.toString("utf8")),
    manifest,
  );
  return { manifest, processPackage: deepFreeze(processPackage) };
}

/** Load the exact immutable canonical package without repeating YAML/schema validation. */
export async function canonicalProcessPackage(
  options: CanonicalProcessPackageFixtureOptions = {},
): Promise<ProcessPackage> {
  return (await readFixture(options)).processPackage;
}

/**
 * Verify source bytes, identity, and exact serialized semantics against one live
 * load supplied by the dedicated loader owner.
 */
export async function verifyCanonicalProcessPackageFixture(
  liveProcessPackage: ProcessPackage,
  options: CanonicalProcessPackageFixtureOptions = {},
): Promise<{ processPackage: string; verified: true }> {
  const fixture = await readFixture(options);
  const sourceDigest = await processPackageDigest(CANONICAL_PROCESS_ROOT);
  if (sourceDigest !== fixture.manifest.processPackage.digest) {
    throw new Error("Source Process Package digest mismatch for canonical fixture");
  }
  const reference =
    `${liveProcessPackage.manifest.id}@${liveProcessPackage.manifest.version}`;
  if (reference !== fixture.manifest.processPackage.reference) {
    throw new Error("Source Process Package identity mismatch for canonical fixture");
  }
  if (JSON.stringify(liveProcessPackage) !== JSON.stringify(fixture.processPackage)) {
    throw new Error("Live and serialized canonical Process Packages differ");
  }
  return { processPackage: reference, verified: true };
}
