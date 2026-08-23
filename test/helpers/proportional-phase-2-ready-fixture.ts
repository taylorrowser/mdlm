import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { processPackageDigest } from "../../src/process-package-digest.js";

interface RepositoryEntry {
  path: string;
  source: string;
}

interface FixtureManifest {
  contract: "mdlm-proportional-phase-2-ready-fixture@1";
  archive: string;
  compressedSha256: string;
  contentSha256: string;
  entryCount: number;
  transactionCount: number;
  gzipHeaderMtime: number;
  repositoryTree: string;
  processPackage: { reference: string; digest: string };
  checkpoint: {
    description: string;
    requirement: string;
    architecture: string;
    plan: string;
  };
  provenance: {
    sourceCommit: string;
    sourceTree: string;
    route: string;
    captureLog: string;
    captureResult: string;
    compression: "gzip -n -9";
  };
}

export interface ProportionalPhaseTwoCheckpoint {
  requirement: string;
  architecture: string;
  plan: string;
}

const fixtureRoot = path.join(
  process.cwd(),
  "test/fixtures/proportional-phase-2-ready",
);
// Every install revalidates the archive bytes. Once those exact bytes have also
// passed the installed-package digest check, later isolated clones need not
// repeat that expensive derivation.
let canonicalInstalledPackageDigestVerified = false;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function exactGitObject(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function exactRevision(value: unknown, type: string): value is string {
  return typeof value === "string" &&
    new RegExp(`^${type}-[A-Z0-9]+-r[0-9]{5}$`).test(value);
}

async function readManifest(sourceRoot: string): Promise<FixtureManifest> {
  const value = JSON.parse(await fs.readFile(
    path.join(sourceRoot, "manifest.json"),
    "utf8",
  )) as Partial<FixtureManifest>;
  const checkpoint = value.checkpoint;
  const provenance = value.provenance;
  if (
    value.contract !== "mdlm-proportional-phase-2-ready-fixture@1" ||
    typeof value.archive !== "string" || value.archive === "" ||
    !exactSha256(value.compressedSha256) ||
    !exactSha256(value.contentSha256) ||
    !Number.isInteger(value.entryCount) || value.entryCount! < 1 ||
    !Number.isInteger(value.transactionCount) || value.transactionCount! < 1 ||
    value.gzipHeaderMtime !== 0 ||
    !exactGitObject(value.repositoryTree) ||
    typeof value.processPackage?.reference !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.processPackage.digest) ||
    typeof checkpoint !== "object" || checkpoint === null ||
    typeof checkpoint.description !== "string" || checkpoint.description === "" ||
    !exactRevision(checkpoint.requirement, "STK") ||
    !exactRevision(checkpoint.architecture, "ASP") ||
    !exactRevision(checkpoint.plan, "DWP") ||
    typeof provenance !== "object" || provenance === null ||
    !exactGitObject(provenance.sourceCommit) ||
    !exactGitObject(provenance.sourceTree) ||
    typeof provenance.route !== "string" || provenance.route === "" ||
    typeof provenance.captureLog !== "string" || provenance.captureLog === "" ||
    typeof provenance.captureResult !== "string" ||
    provenance.captureResult === "" ||
    provenance.compression !== "gzip -n -9"
  ) {
    throw new Error("Invalid proportional Phase 2 fixture manifest");
  }
  return value as FixtureManifest;
}

function repositoryEntries(value: unknown): RepositoryEntry[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) =>
      typeof entry !== "object" || entry === null ||
      typeof (entry as RepositoryEntry).path !== "string" ||
      typeof (entry as RepositoryEntry).source !== "string"
    )
  ) {
    throw new Error("Invalid proportional Phase 2 repository archive");
  }
  const entries = value as RepositoryEntry[];
  const paths = entries.map((entry) => entry.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((entry, index) => index > 0 && paths[index - 1]! > entry)
  ) {
    throw new Error("Proportional Phase 2 fixture paths must be unique and sorted");
  }
  if (
    paths.some((entry) =>
      !entry.startsWith(".lifecycle/") ||
      entry.includes("\\") ||
      entry.split("/").includes("..") ||
      entry.endsWith("/") ||
      entry === ".lifecycle/work/active-assignment.json"
    )
  ) {
    throw new Error("Proportional Phase 2 fixture contains an unconfined path");
  }
  return entries;
}

function validateTransactions(
  entries: RepositoryEntry[],
  manifest: FixtureManifest,
): void {
  const transactions = new Map<string, RepositoryEntry[]>();
  for (const entry of entries) {
    if (!entry.path.startsWith(".lifecycle/data/")) continue;
    if (entry.path === ".lifecycle/data/.gitkeep" && entry.source === "") continue;
    const match = /^\.lifecycle\/data\/\.transactions\/([^/]+)\/(.+)$/.exec(
      entry.path,
    );
    if (!match) {
      throw new Error(`Fixture Lifecycle Data is not transaction-owned: ${entry.path}`);
    }
    const owned = transactions.get(match[1]!) ?? [];
    owned.push(entry);
    transactions.set(match[1]!, owned);
  }
  if (transactions.size !== manifest.transactionCount) {
    throw new Error("Proportional Phase 2 fixture transaction count mismatch");
  }

  const processRef =
    `${manifest.processPackage.reference}#${manifest.processPackage.digest}`;
  const capturedRevisions = new Set<string>();
  for (const [transaction, owned] of transactions) {
    const executionEntry = owned.find((entry) =>
      entry.path ===
        `.lifecycle/data/.transactions/${transaction}/execution.json`
    );
    if (!executionEntry) {
      throw new Error(`Fixture transaction '${transaction}' lacks execution.json`);
    }
    let execution: Record<string, unknown>;
    try {
      execution = JSON.parse(executionEntry.source) as Record<string, unknown>;
    } catch {
      throw new Error(`Fixture transaction '${transaction}' has invalid execution JSON`);
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
      throw new Error(`Fixture transaction '${transaction}' has invalid provenance`);
    }
    const revisions = new Set(execution.outputs.map((output) => {
      const lifecycleDatum = (output as Record<string, unknown>).lifecycleDatum as
        Record<string, unknown> | undefined;
      return lifecycleDatum?.revisionId;
    }));
    for (const entry of owned.filter((candidate) => candidate.path.endsWith(".md"))) {
      const revision = /(?:^|\n)revision_id: ([^\n]+)(?:\n|$)/.exec(
        entry.source,
      )?.[1];
      if (!revision || !revisions.has(revision)) {
        throw new Error(
          `Fixture transaction '${transaction}' does not own '${entry.path}'`,
        );
      }
      if (!entry.source.includes(processRef)) {
        throw new Error(`Fixture Revision '${revision}' lacks exact Process Package provenance`);
      }
      capturedRevisions.add(revision);
    }
  }
  for (const revision of [
    manifest.checkpoint.requirement,
    manifest.checkpoint.architecture,
    manifest.checkpoint.plan,
  ]) {
    if (!capturedRevisions.has(revision)) {
      throw new Error(`Fixture checkpoint Revision '${revision}' is absent`);
    }
  }
}

function runGit(repository: string, arguments_: string[], environment = {}): string {
  const result = spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) {
    throw new Error(
      `Could not install proportional Phase 2 Git foundation: ${result.stderr}${result.stdout}`,
    );
  }
  return result.stdout.trim();
}

export async function installProportionalPhaseTwoReadyFixture(
  repository: string,
  sourceRoot = fixtureRoot,
): Promise<Readonly<ProportionalPhaseTwoCheckpoint>> {
  const manifest = await readManifest(sourceRoot);
  const archivePath = path.resolve(sourceRoot, manifest.archive);
  if (!archivePath.startsWith(`${path.resolve(sourceRoot)}${path.sep}`)) {
    throw new Error("Proportional Phase 2 archive escapes the fixture root");
  }
  const archive = await fs.readFile(archivePath);
  if (sha256(archive) !== manifest.compressedSha256) {
    throw new Error("Proportional Phase 2 fixture compressed digest mismatch");
  }
  if (
    archive.length < 8 ||
    archive.readUInt32LE(4) !== manifest.gzipHeaderMtime
  ) {
    throw new Error("Proportional Phase 2 fixture has a non-deterministic gzip header");
  }
  const content = gunzipSync(archive);
  if (sha256(content) !== manifest.contentSha256) {
    throw new Error("Proportional Phase 2 fixture content digest mismatch");
  }
  const entries = repositoryEntries(JSON.parse(content.toString("utf8")));
  if (entries.length !== manifest.entryCount) {
    throw new Error("Proportional Phase 2 fixture entry count mismatch");
  }
  validateTransactions(entries, manifest);

  await fs.mkdir(repository, { recursive: false });
  const repositoryRoot = path.resolve(repository);
  for (const entry of entries) {
    const target = path.resolve(repositoryRoot, entry.path);
    if (!target.startsWith(`${repositoryRoot}${path.sep}.lifecycle${path.sep}`)) {
      throw new Error(`Fixture target escapes the repository: ${entry.path}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.source, { flag: "wx" });
  }

  const selection = JSON.parse(await fs.readFile(
    path.join(repository, ".lifecycle/process-selection.json"),
    "utf8",
  )) as { package?: { reference?: string; digest?: string; path?: string } };
  const descriptor = JSON.parse(await fs.readFile(
    path.join(repository, ".lifecycle/repository.json"),
    "utf8",
  )) as { package?: { reference?: string; digest?: string } };
  if (
    selection.package?.reference !== manifest.processPackage.reference ||
    selection.package.digest !== manifest.processPackage.digest ||
    typeof selection.package.path !== "string" ||
    descriptor.package?.reference !== manifest.processPackage.reference ||
    descriptor.package.digest !== manifest.processPackage.digest
  ) {
    throw new Error("Proportional Phase 2 fixture Process Package selection mismatch");
  }
  const packageRoot = path.resolve(repository, selection.package.path);
  const lifecycleRoot = path.resolve(repository, ".lifecycle");
  if (!packageRoot.startsWith(`${lifecycleRoot}${path.sep}`)) {
    throw new Error("Proportional Phase 2 selected Process Package escapes .lifecycle");
  }
  const canonicalSource = path.resolve(sourceRoot) === path.resolve(fixtureRoot);
  if (!canonicalSource || !canonicalInstalledPackageDigestVerified) {
    if (await processPackageDigest(packageRoot) !== manifest.processPackage.digest) {
      throw new Error("Proportional Phase 2 installed Process Package digest mismatch");
    }
    if (canonicalSource) canonicalInstalledPackageDigestVerified = true;
  }

  runGit(repository, ["init", "--quiet"]);
  runGit(repository, ["add", ".lifecycle"]);
  if (runGit(repository, ["write-tree"]) !== manifest.repositoryTree) {
    throw new Error("Proportional Phase 2 fixture repository tree mismatch");
  }
  const fixedGitEnvironment = {
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  runGit(repository, [
    "-c",
    "user.name=MDLM Test",
    "-c",
    "user.email=mdlm-test@localhost",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    "Install verified proportional Phase 2 checkpoint",
  ], fixedGitEnvironment);

  return Object.freeze({
    requirement: manifest.checkpoint.requirement,
    architecture: manifest.checkpoint.architecture,
    plan: manifest.checkpoint.plan,
  });
}
