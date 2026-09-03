import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { loadProcessPackage, type ProcessPackage } from "../../src/index.js";
import { processPackageDigest } from "../../src/process-package-digest.js";

/**
 * The canonical Process Package fixture is the serialized form of
 * `.lifecycle/process` as the current loader produces it. It lives in an
 * ignored cache keyed by the digests of the package source and of the loader
 * source, so a change to either yields a new entry and nothing is committed.
 */
const CANONICAL_PROCESS_ROOT = ".lifecycle/process";
const LOADER_ROOT = "src";
const TRACKED_FIXTURE_ROOT = "test/fixtures/canonical-process-package";
export const CANONICAL_FIXTURE_CACHE_ROOT =
  "node_modules/.cache/mdlm-canonical-process-package";
const ARCHIVE_NAME = "process-package.json.gz";
const CONTRACT = "mdlm-canonical-process-package-fixture@2";
const CAPTURE_COMMAND = "node scripts/process-fixture.mjs build";
const COMMAND_BUFFER_LIMIT = 64 * 1024 * 1024;
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
  contract: typeof CONTRACT;
  schemaVersion: 2;
  artifact: {
    archive: string;
    compression: "gzip -n -9";
    compressedSha256: string;
    contentSha256: string;
    gzipHeaderMtime: 0;
  };
  processPackage: {
    root: typeof CANONICAL_PROCESS_ROOT;
    reference: string;
    digest: string;
    definitionCount: number;
  };
  provenance: {
    loaderDigest: string;
    cacheKey: string;
    captureCommand: string;
  };
};

export interface CanonicalProcessPackageFixtureOptions {
  /** Directory holding `manifest.json` and the archive. Defaults to the cache entry for the current source. */
  fixtureRoot?: string;
  /** Repository root holding `.lifecycle/process` and `src`. Defaults to the working directory. */
  repositoryRoot?: string;
}

interface FixtureKey {
  packageDigest: string;
  loaderDigest: string;
  cacheKey: string;
}

interface BuiltFixture {
  archive: Buffer;
  manifest: Buffer;
}

export interface CanonicalProcessPackageFixture {
  archive: Buffer;
  content: Buffer;
  manifest: FixtureManifest;
  processPackage: ProcessPackage;
}

export interface EnsuredCanonicalProcessPackageFixture {
  fixtureRoot: string;
  fixture: CanonicalProcessPackageFixture;
  built: boolean;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function gzip(content: Buffer): Buffer {
  return execFileSync("gzip", ["-n", "-9", "-c"], {
    input: content,
    maxBuffer: COMMAND_BUFFER_LIMIT,
  });
}

function fixtureManifest(value: unknown): FixtureManifest {
  const manifest = value as Partial<FixtureManifest> | null;
  const artifact = manifest?.artifact;
  const processPackage = manifest?.processPackage;
  const provenance = manifest?.provenance;
  if (
    typeof manifest !== "object" || manifest === null ||
    manifest.contract !== CONTRACT ||
    manifest.schemaVersion !== 2 ||
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
    !/^sha256:[a-f0-9]{64}$/.test(provenance.loaderDigest ?? "") ||
    !/^[a-f0-9]{64}$/.test(provenance.cacheKey ?? "") ||
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

function canonicalizeSourcePaths(value: unknown, sourceRoot: string): unknown {
  if (typeof value === "string") {
    if (value === sourceRoot || value.startsWith(`${sourceRoot}${path.sep}`)) {
      return `${CANONICAL_PROCESS_ROOT}${value.slice(sourceRoot.length)}`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSourcePaths(item, sourceRoot));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        canonicalizeSourcePaths(item, sourceRoot),
      ]),
    );
  }
  return value;
}

async function fixtureKey(repositoryRoot: string): Promise<FixtureKey> {
  const [packageDigest, loaderDigest] = await Promise.all([
    processPackageDigest(path.join(repositoryRoot, CANONICAL_PROCESS_ROOT)),
    processPackageDigest(path.join(repositoryRoot, LOADER_ROOT)),
  ]);
  return {
    packageDigest,
    loaderDigest,
    cacheKey: createHash("sha256")
      .update(`${packageDigest}\n${loaderDigest}\n`)
      .digest("hex"),
  };
}

async function loadSourcePackage(repositoryRoot: string): Promise<ProcessPackage> {
  const sourceRoot = path.join(repositoryRoot, CANONICAL_PROCESS_ROOT);
  const loaded = await loadProcessPackage(sourceRoot);
  if (!loaded.ok) {
    throw new Error(
      `Canonical Process Package failed to load: ${loaded.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return canonicalizeSourcePaths(
    loaded.package,
    path.resolve(sourceRoot),
  ) as ProcessPackage;
}

async function buildFixture(
  repositoryRoot: string,
  key: FixtureKey,
): Promise<BuiltFixture> {
  const processPackage = await loadSourcePackage(repositoryRoot);
  const content = Buffer.from(JSON.stringify(processPackage));
  const archive = gzip(content);
  if (
    archive.length < 8 || archive.readUInt32LE(4) !== 0 ||
    !gzip(content).equals(archive)
  ) {
    throw new Error("Canonical Process Package archive is not deterministic");
  }
  const manifest: FixtureManifest = {
    contract: CONTRACT,
    schemaVersion: 2,
    artifact: {
      archive: ARCHIVE_NAME,
      compression: "gzip -n -9",
      compressedSha256: sha256(archive),
      contentSha256: sha256(content),
      gzipHeaderMtime: 0,
    },
    processPackage: {
      root: CANONICAL_PROCESS_ROOT,
      reference: `${processPackage.manifest.id}@${processPackage.manifest.version}`,
      digest: key.packageDigest,
      definitionCount: definitionCount(processPackage),
    },
    provenance: {
      loaderDigest: key.loaderDigest,
      cacheKey: key.cacheKey,
      captureCommand: CAPTURE_COMMAND,
    },
  };
  return {
    archive,
    manifest: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  };
}

/** Publish atomically; a concurrent worker that wins the rename is accepted as-is. */
async function publishFixture(
  fixtureRoot: string,
  fixture: BuiltFixture,
): Promise<void> {
  await fs.mkdir(path.dirname(fixtureRoot), { recursive: true });
  const stage = `${fixtureRoot}.stage-${process.pid}-${Date.now()}`;
  await fs.mkdir(stage);
  try {
    await fs.writeFile(path.join(stage, ARCHIVE_NAME), fixture.archive, { flag: "wx" });
    await fs.writeFile(path.join(stage, "manifest.json"), fixture.manifest, { flag: "wx" });
    try {
      await fs.rename(stage, fixtureRoot);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY" && code !== "EPERM") throw error;
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

async function readFixture(fixtureRoot: string): Promise<CanonicalProcessPackageFixture> {
  const resolvedRoot = path.resolve(fixtureRoot);
  const manifest = fixtureManifest(JSON.parse(
    await fs.readFile(path.join(resolvedRoot, "manifest.json"), "utf8"),
  ));
  const archivePath = path.resolve(resolvedRoot, manifest.artifact.archive);
  if (!archivePath.startsWith(`${resolvedRoot}${path.sep}`)) {
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
  return {
    archive,
    content,
    manifest,
    processPackage: deepFreeze(processPackage),
  };
}

/** Where the cache entry for the current package and loader source lives. */
export async function canonicalProcessPackageFixtureRoot(
  repositoryRoot = process.cwd(),
): Promise<string> {
  const key = await fixtureKey(repositoryRoot);
  return path.join(repositoryRoot, CANONICAL_FIXTURE_CACHE_ROOT, key.cacheKey);
}

/** Read the cache entry for the current source, building it when missing or unreadable. */
export async function ensureCanonicalProcessPackageFixture(
  repositoryRoot = process.cwd(),
): Promise<EnsuredCanonicalProcessPackageFixture> {
  const key = await fixtureKey(repositoryRoot);
  const fixtureRoot = path.join(repositoryRoot, CANONICAL_FIXTURE_CACHE_ROOT, key.cacheKey);
  try {
    return { fixtureRoot, fixture: await readFixture(fixtureRoot), built: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  }
  await publishFixture(fixtureRoot, await buildFixture(repositoryRoot, key));
  return { fixtureRoot, fixture: await readFixture(fixtureRoot), built: true };
}

async function selectedFixture(
  options: CanonicalProcessPackageFixtureOptions,
): Promise<CanonicalProcessPackageFixture> {
  if (options.fixtureRoot !== undefined) return readFixture(options.fixtureRoot);
  return (await ensureCanonicalProcessPackageFixture(options.repositoryRoot)).fixture;
}

/** Load the exact immutable canonical package without repeating YAML/schema validation. */
export async function canonicalProcessPackage(
  options: CanonicalProcessPackageFixtureOptions = {},
): Promise<ProcessPackage> {
  return (await selectedFixture(options)).processPackage;
}

/**
 * Verify the deterministic archive bytes, the source and loader digests, and
 * the exact serialized semantics against one live load supplied by the caller.
 */
export async function verifyCanonicalProcessPackageFixture(
  liveProcessPackage: ProcessPackage,
  options: CanonicalProcessPackageFixtureOptions = {},
): Promise<{ processPackage: string; verified: true }> {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const fixture = await selectedFixture(options);
  if (!gzip(fixture.content).equals(fixture.archive)) {
    throw new Error("Declared compression does not reproduce canonical fixture archive");
  }
  const key = await fixtureKey(repositoryRoot);
  if (key.packageDigest !== fixture.manifest.processPackage.digest) {
    throw new Error("Source Process Package digest mismatch for canonical fixture");
  }
  if (key.loaderDigest !== fixture.manifest.provenance.loaderDigest) {
    throw new Error("Loader digest mismatch for canonical fixture");
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

/**
 * Repository check: fail when a generated fixture artifact is tracked, then
 * verify the cache entry for the current source against a fresh load.
 */
export async function checkCanonicalProcessPackageFixture(
  repositoryRoot = process.cwd(),
): Promise<EnsuredCanonicalProcessPackageFixture> {
  const tracked = execFileSync(
    "git",
    ["ls-files", "--", TRACKED_FIXTURE_ROOT, CANONICAL_FIXTURE_CACHE_ROOT],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: COMMAND_BUFFER_LIMIT },
  ).trim();
  if (tracked !== "") {
    throw new Error(
      `Generated canonical Process Package fixture is tracked: ${
        tracked.split("\n").join(", ")
      }`,
    );
  }
  const ensured = await ensureCanonicalProcessPackageFixture(repositoryRoot);
  await verifyCanonicalProcessPackageFixture(
    await loadSourcePackage(repositoryRoot),
    { repositoryRoot },
  );
  return ensured;
}
