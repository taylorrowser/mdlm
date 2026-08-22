import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { processPackageDigest } from "../../src/process-package-digest.js";

export type CurrentLifecycleDataFixture = "phase-1-vai-correction-ready";

type FixtureEntry = { path: string; source: string };
type FixtureDefinition = {
  archive: string;
  compressedSha256: string;
  contentSha256: string;
  entryCount: number;
  gzipHeaderMtime: number;
  processPackage: { reference: string; digest: string };
  checkpoint: string;
  provenance: {
    sourceCommit: string;
    sourceTree: string;
    route: string;
    captureLog: string;
    captureResult: string;
    compression: "gzip -n -9";
  };
};
type FixtureManifest = {
  contract: "mdlm-current-lifecycle-data-fixtures@1";
  fixtures: Record<CurrentLifecycleDataFixture, FixtureDefinition>;
};

const fixtureRoot = path.join(
  process.cwd(),
  "test/fixtures/phase-1-route",
);

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureEntries(value: unknown): FixtureEntry[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) =>
      typeof entry !== "object" || entry === null ||
      typeof (entry as FixtureEntry).path !== "string" ||
      typeof (entry as FixtureEntry).source !== "string"
    )
  ) {
    throw new Error("Invalid current Lifecycle Data fixture");
  }
  const entries = value as FixtureEntry[];
  const paths = entries.map((entry) => entry.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((entry, index) => index > 0 && paths[index - 1]! > entry)
  ) {
    throw new Error("Current Lifecycle Data fixture paths must be unique and sorted");
  }
  return entries;
}

function fixtureDefinition(value: unknown): FixtureDefinition {
  const definition = value as Partial<FixtureDefinition> | null;
  const provenance = definition?.provenance;
  if (
    typeof definition !== "object" || definition === null ||
    typeof definition.archive !== "string" ||
    !/^[a-f0-9]{64}$/.test(definition.compressedSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(definition.contentSha256 ?? "") ||
    !Number.isInteger(definition.entryCount) || definition.entryCount! < 1 ||
    definition.gzipHeaderMtime !== 0 ||
    typeof definition.processPackage?.reference !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(definition.processPackage.digest) ||
    typeof definition.checkpoint !== "string" || definition.checkpoint === "" ||
    typeof provenance !== "object" || provenance === null ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceTree ?? "") ||
    typeof provenance.route !== "string" || provenance.route === "" ||
    typeof provenance.captureLog !== "string" || provenance.captureLog === "" ||
    typeof provenance.captureResult !== "string" ||
    provenance.captureResult === "" ||
    provenance.compression !== "gzip -n -9"
  ) {
    throw new Error("Invalid current Lifecycle Data fixture definition");
  }
  return definition as FixtureDefinition;
}

async function manifest(): Promise<FixtureManifest> {
  const value = JSON.parse(
    await fs.readFile(path.join(fixtureRoot, "manifest.json"), "utf8"),
  ) as Partial<FixtureManifest>;
  if (
    value.contract !== "mdlm-current-lifecycle-data-fixtures@1" ||
    typeof value.fixtures !== "object" || value.fixtures === null
  ) {
    throw new Error("Invalid current Lifecycle Data fixture manifest");
  }
  return {
    contract: value.contract,
    fixtures: {
      "phase-1-vai-correction-ready": fixtureDefinition(
        value.fixtures["phase-1-vai-correction-ready"],
      ),
    },
  };
}

export async function installCurrentLifecycleDataFixture(
  repository: string,
  fixture: CurrentLifecycleDataFixture,
): Promise<void> {
  const definition = (await manifest()).fixtures[fixture];
  if (!definition) throw new Error(`Unknown current Lifecycle Data fixture '${fixture}'`);

  const archivePath = path.resolve(fixtureRoot, definition.archive);
  if (!archivePath.startsWith(`${path.resolve(fixtureRoot)}${path.sep}`)) {
    throw new Error(`Archive path escapes the fixture root for '${fixture}'`);
  }
  const archive = await fs.readFile(archivePath);
  if (sha256(archive) !== definition.compressedSha256) {
    throw new Error(`Compressed digest mismatch for current fixture '${fixture}'`);
  }
  if (archive.length < 8 || archive.readUInt32LE(4) !== definition.gzipHeaderMtime) {
    throw new Error(`Non-deterministic gzip header for current fixture '${fixture}'`);
  }

  const content = gunzipSync(archive);
  if (sha256(content) !== definition.contentSha256) {
    throw new Error(`Content digest mismatch for current fixture '${fixture}'`);
  }
  const entries = fixtureEntries(JSON.parse(content.toString("utf8")));
  if (entries.length !== definition.entryCount) {
    throw new Error(`Entry-count mismatch for current fixture '${fixture}'`);
  }

  const selection = JSON.parse(await fs.readFile(
    path.join(repository, ".lifecycle/process-selection.json"),
    "utf8",
  )) as {
    package?: { reference?: string; digest?: string; path?: string };
  };
  if (
    selection.package?.reference !== definition.processPackage.reference ||
    selection.package.digest !== definition.processPackage.digest ||
    typeof selection.package.path !== "string"
  ) {
    throw new Error(`Selected Process Package mismatch for current fixture '${fixture}'`);
  }
  const packageRoot = path.resolve(repository, selection.package.path);
  const lifecycleRoot = path.resolve(repository, ".lifecycle");
  if (!packageRoot.startsWith(`${lifecycleRoot}${path.sep}`)) {
    throw new Error(`Selected Process Package path escapes .lifecycle for '${fixture}'`);
  }
  if (await processPackageDigest(packageRoot) !== definition.processPackage.digest) {
    throw new Error(`Installed Process Package digest mismatch for '${fixture}'`);
  }

  const processRef =
    `${definition.processPackage.reference}#${definition.processPackage.digest}`;
  for (const entry of entries.filter((candidate) => candidate.path.endsWith(".md"))) {
    if (!entry.source.includes(processRef)) {
      throw new Error(
        `Lifecycle Datum '${entry.path}' lacks exact fixture Process Package provenance`,
      );
    }
  }

  const dataRoot = path.resolve(repository, ".lifecycle/data");
  const targets = entries.map((entry) => {
    const target = path.resolve(dataRoot, entry.path);
    if (!target.startsWith(`${dataRoot}${path.sep}`)) {
      throw new Error(`Lifecycle Data fixture path escapes its root: ${entry.path}`);
    }
    return { entry, target };
  });
  await fs.rm(dataRoot, { recursive: true, force: true });
  await fs.mkdir(dataRoot, { recursive: true });
  for (const { entry, target } of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.source, { flag: "wx" });
  }
}
