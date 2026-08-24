import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import type { PreparedAssignment } from "./assignment-submission.js";

const executeFile = promisify(execFile);
import { processPackageDigest } from "../../src/process-package-digest.js";
import { restoreHistoricalFixtureProcessPackage } from "./process-package.js";

const fixtureNames = [
  "candidate-currentness",
  "candidate-publication",
  "corrected-gate",
  "corrected-gate-acceptance-ready",
  "corrected-gate-review-ready",
  "initial-intent-foundation",
  "resolved-initial-intent",
  "review-foundation",
] as const;

export type LifecycleDataFixture = typeof fixtureNames[number];

type FixtureEntry = { path: string; source: string };
type FixtureDefinition = {
  archive: string;
  compressedSha256: string;
  contentSha256: string;
  entryCount: number;
  gzipHeaderMtime: number;
  processPackage: { reference: string; digest: string };
  checkpoint: string;
  prepared?: {
    archive: string;
    compressedSha256: string;
    contentSha256: string;
    gzipHeaderMtime: number;
    scenario: string;
    sourceCommit: string;
    sourceTree: string;
    captureLog: string;
    captureResult: string;
    compression: "gzip -n -9";
  };
  provenance: {
    sourceCommit: string;
    sourceTree: string;
    route: string;
    captureLog?: string;
    captureResult?: string;
    compression?: "gzip -n -9";
  };
};
type FixtureManifest = {
  contract: "mdlm-lifecycle-data-fixtures@1";
  fixtures: Record<LifecycleDataFixture, FixtureDefinition>;
};

const fixtureRoot = path.join(process.cwd(), "test/fixtures/phase-0-route");

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
    throw new Error("Invalid Lifecycle Data fixture");
  }
  const entries = value as FixtureEntry[];
  const paths = entries.map((entry) => entry.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((entry, index) => index > 0 && paths[index - 1]! > entry)
  ) {
    throw new Error("Lifecycle Data fixture paths must be unique and sorted");
  }
  return entries;
}

function validateFixtureTransactions(entries: FixtureEntry[]): void {
  const transactions = new Map<string, FixtureEntry[]>();
  for (const entry of entries) {
    if (entry.path === ".gitkeep" && entry.source === "") continue;
    const match = /^\.transactions\/([^/]+)\/(.+)$/.exec(entry.path);
    if (!match) {
      throw new Error(`Lifecycle Data fixture path is not transaction-owned: ${entry.path}`);
    }
    const owned = transactions.get(match[1]!) ?? [];
    owned.push(entry);
    transactions.set(match[1]!, owned);
  }
  for (const [transaction, owned] of transactions) {
    const executionEntry = owned.find((entry) =>
      entry.path === `.transactions/${transaction}/execution.json`
    );
    if (!executionEntry) {
      throw new Error(`Lifecycle Data transaction '${transaction}' lacks execution.json`);
    }
    let execution: Record<string, unknown>;
    try {
      execution = JSON.parse(executionEntry.source) as Record<string, unknown>;
    } catch {
      throw new Error(`Lifecycle Data transaction '${transaction}' has invalid execution JSON`);
    }
    const response = execution.response as Record<string, unknown> | undefined;
    const completion = execution.completion as Record<string, unknown> | undefined;
    if (
      execution.contract !== "mdlm-scenario-execution@4" ||
      execution.id !== transaction ||
      execution.status !== "completed" ||
      response?.contract !== "mdlm-assignment-response@1" ||
      typeof response.assignment !== "string" ||
      typeof response.digest !== "string" ||
      completion?.contractValid !== true ||
      completion.expressionPassed !== true ||
      !Array.isArray(execution.outputs) || execution.outputs.length === 0
    ) {
      throw new Error(`Scenario Execution transaction '${transaction}' has invalid provenance`);
    }
    const revisions = new Set(execution.outputs.map((output) => {
      const datum = (output as Record<string, unknown>).lifecycleDatum as
        | Record<string, unknown>
        | undefined;
      return datum?.revisionId;
    }));
    for (const entry of owned.filter((candidate) => candidate.path.endsWith(".md"))) {
      const revision = /(?:^|\n)revision_id: ([^\n]+)(?:\n|$)/.exec(entry.source)?.[1];
      if (!revision || !revisions.has(revision)) {
        throw new Error(
          `Scenario Execution transaction '${transaction}' does not own '${entry.path}'`,
        );
      }
    }
  }
}

function fixtureDefinition(value: unknown): FixtureDefinition {
  const definition = value as Partial<FixtureDefinition> | null;
  const provenance = definition?.provenance;
  const prepared = definition?.prepared;
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
    (prepared !== undefined && (
      typeof prepared.archive !== "string" ||
      !/^[a-f0-9]{64}$/.test(prepared.compressedSha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(prepared.contentSha256 ?? "") ||
      prepared.gzipHeaderMtime !== 0 ||
      typeof prepared.scenario !== "string" || prepared.scenario === "" ||
      !/^[a-f0-9]{40}$/.test(prepared.sourceCommit ?? "") ||
      !/^[a-f0-9]{40}$/.test(prepared.sourceTree ?? "") ||
      typeof prepared.captureLog !== "string" || prepared.captureLog === "" ||
      typeof prepared.captureResult !== "string" || prepared.captureResult === "" ||
      prepared.compression !== "gzip -n -9"
    )) ||
    typeof provenance !== "object" || provenance === null ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceTree ?? "") ||
    typeof provenance.route !== "string" || provenance.route === "" ||
    (provenance.captureLog !== undefined &&
      (typeof provenance.captureLog !== "string" || provenance.captureLog === "")) ||
    (provenance.captureResult !== undefined &&
      (typeof provenance.captureResult !== "string" ||
        provenance.captureResult === "")) ||
    (provenance.compression !== undefined && provenance.compression !== "gzip -n -9")
  ) {
    throw new Error("Invalid Lifecycle Data fixture definition");
  }
  return definition as FixtureDefinition;
}

async function manifest(): Promise<FixtureManifest> {
  const value = JSON.parse(
    await fs.readFile(path.join(fixtureRoot, "manifest.json"), "utf8"),
  ) as Partial<FixtureManifest>;
  if (
    value.contract !== "mdlm-lifecycle-data-fixtures@1" ||
    typeof value.fixtures !== "object" || value.fixtures === null
  ) {
    throw new Error("Invalid Lifecycle Data fixture manifest");
  }
  const definitions = value.fixtures as Record<string, unknown>;
  if (JSON.stringify(Object.keys(definitions).sort()) !== JSON.stringify(fixtureNames)) {
    throw new Error("Lifecycle Data fixture manifest names do not match the helper");
  }
  return {
    contract: value.contract,
    fixtures: Object.fromEntries(fixtureNames.map((name) => [
      name,
      fixtureDefinition(definitions[name]),
    ])) as Record<LifecycleDataFixture, FixtureDefinition>,
  };
}

export async function installLifecycleDataFixture(
  repository: string,
  fixture: LifecycleDataFixture,
): Promise<void> {
  const definition = (await manifest()).fixtures[fixture];
  const archivePath = path.resolve(fixtureRoot, definition.archive);
  if (!archivePath.startsWith(`${path.resolve(fixtureRoot)}${path.sep}`)) {
    throw new Error(`Archive path escapes the fixture root for '${fixture}'`);
  }
  const archive = await fs.readFile(archivePath);
  if (sha256(archive) !== definition.compressedSha256) {
    throw new Error(`Compressed digest mismatch for fixture '${fixture}'`);
  }
  if (archive.length < 8 || archive.readUInt32LE(4) !== definition.gzipHeaderMtime) {
    throw new Error(`Non-deterministic gzip header for fixture '${fixture}'`);
  }
  const content = gunzipSync(archive);
  if (sha256(content) !== definition.contentSha256) {
    throw new Error(`Content digest mismatch for fixture '${fixture}'`);
  }
  const entries = fixtureEntries(JSON.parse(content.toString("utf8")));
  if (entries.length !== definition.entryCount) {
    throw new Error(`Entry-count mismatch for fixture '${fixture}'`);
  }
  validateFixtureTransactions(entries);

  const selectionPath = path.join(repository, ".lifecycle/process-selection.json");
  const selection = JSON.parse(await fs.readFile(selectionPath, "utf8")) as {
    package?: { reference?: string; digest?: string; path?: string };
  };
  const lifecycleRoot = path.resolve(repository, ".lifecycle");
  const packageRoot = typeof selection.package?.path === "string"
    ? path.resolve(repository, selection.package.path)
    : undefined;
  if (packageRoot && !packageRoot.startsWith(`${lifecycleRoot}${path.sep}`)) {
    throw new Error(`Selected Process Package path escapes .lifecycle for '${fixture}'`);
  }
  if (
    packageRoot &&
    await processPackageDigest(packageRoot) !== selection.package?.digest
  ) {
    throw new Error(`Installed Process Package drift before fixture '${fixture}'`);
  }
  if (
    packageRoot &&
    selection.package?.reference === definition.processPackage.reference &&
    selection.package.digest !== definition.processPackage.digest
  ) {
    await restoreHistoricalFixtureProcessPackage(
      packageRoot,
      definition.processPackage.digest,
    );
    if (await processPackageDigest(packageRoot) === definition.processPackage.digest) {
      selection.package.digest = definition.processPackage.digest;
      await fs.writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
      const descriptorPath = path.join(repository, ".lifecycle/repository.json");
      const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8")) as {
        package?: { digest?: string };
      };
      if (descriptor.package) {
        descriptor.package.digest = definition.processPackage.digest;
        await fs.writeFile(
          descriptorPath,
          `${JSON.stringify(descriptor, null, 2)}\n`,
        );
      }
    }
  }
  if (
    selection.package?.reference !== definition.processPackage.reference ||
    selection.package.digest !== definition.processPackage.digest ||
    !packageRoot
  ) {
    throw new Error(`Selected Process Package mismatch for fixture '${fixture}'`);
  }
  if (await processPackageDigest(packageRoot) !== definition.processPackage.digest) {
    throw new Error(`Installed Process Package digest mismatch for fixture '${fixture}'`);
  }
  const processRef =
    `${definition.processPackage.reference}#${definition.processPackage.digest}`;
  for (const entry of entries.filter((candidate) => candidate.path.endsWith(".md"))) {
    if (!entry.source.includes(processRef)) {
      throw new Error(`Lifecycle Datum '${entry.path}' lacks exact package provenance`);
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

export async function installPreparedLifecycleDataFixture(
  repository: string,
  fixture: LifecycleDataFixture,
): Promise<PreparedAssignment> {
  await installLifecycleDataFixture(repository, fixture);
  const definition = (await manifest()).fixtures[fixture];
  const preparedDefinition = definition.prepared;
  if (!preparedDefinition) {
    throw new Error(`Fixture '${fixture}' has no prepared Assignment`);
  }
  const archivePath = path.resolve(fixtureRoot, preparedDefinition.archive);
  if (!archivePath.startsWith(`${path.resolve(fixtureRoot)}${path.sep}`)) {
    throw new Error(`Prepared archive path escapes the fixture root for '${fixture}'`);
  }
  const archive = await fs.readFile(archivePath);
  if (sha256(archive) !== preparedDefinition.compressedSha256) {
    throw new Error(`Prepared archive digest mismatch for fixture '${fixture}'`);
  }
  if (
    archive.length < 8 ||
    archive.readUInt32LE(4) !== preparedDefinition.gzipHeaderMtime
  ) {
    throw new Error(`Non-deterministic prepared gzip header for fixture '${fixture}'`);
  }
  const content = gunzipSync(archive);
  if (sha256(content) !== preparedDefinition.contentSha256) {
    throw new Error(`Prepared content digest mismatch for fixture '${fixture}'`);
  }
  const prepared = JSON.parse(content.toString("utf8")) as {
    packet?: Record<string, any>;
    lease?: Record<string, any>;
  };
  if (
    prepared.lease?.contract !== "mdlm-assignment-lease@1" ||
    prepared.lease.disposition !== "active" ||
    typeof prepared.lease.id !== "string" ||
    prepared.lease.scenario !== preparedDefinition.scenario ||
    prepared.lease.package?.reference !== definition.processPackage.reference ||
    prepared.lease.package?.digest !== definition.processPackage.digest ||
    prepared.packet?.contract !== "mdlm-assignment-packet@2" ||
    prepared.packet.package?.reference !== definition.processPackage.reference ||
    prepared.packet.package?.digest !== definition.processPackage.digest ||
    prepared.packet.assignment?.id !== prepared.lease.id ||
    prepared.packet.scenario?.reference !== preparedDefinition.scenario
  ) {
    throw new Error(`Invalid prepared Assignment fixture '${fixture}'`);
  }

  const [{ stdout: headSource }, { stdout: stagedDiff }, { stdout: worktreeDiff }] =
    await Promise.all([
      executeFile("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }),
      executeFile(
        "git",
        ["diff", "--binary", "--no-ext-diff", "--cached", "HEAD", "--"],
        { cwd: repository, encoding: "utf8" },
      ),
      executeFile(
        "git",
        ["diff", "--binary", "--no-ext-diff", "--"],
        { cwd: repository, encoding: "utf8" },
      ),
    ]);
  const head = headSource.trim();
  const repositoryFingerprint = {
    head,
    trackedState: `sha256:${sha256(Buffer.from(
      `${head}\0staged\0${stagedDiff}\0worktree\0${worktreeDiff}`,
    ))}`,
  };
  prepared.lease.repository = repositoryFingerprint;
  prepared.packet.repository = repositoryFingerprint;
  const workRoot = path.join(repository, ".lifecycle/work");
  await fs.mkdir(workRoot, { recursive: true });
  await fs.writeFile(
    path.join(workRoot, "active-assignment.json"),
    `${JSON.stringify(prepared.lease, null, 2)}\n`,
  );
  return {
    outcome: { assignment: { id: prepared.lease.id } },
    packet: prepared.packet,
  };
}
