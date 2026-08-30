import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const REPOSITORY_ROOT = process.cwd();
const PROCESS_ROOT = ".lifecycle/process";
const FIXTURE_ROOT = path.join(
  REPOSITORY_ROOT,
  "test/fixtures/canonical-process-package",
);
const FIXTURE_PARENT = path.dirname(FIXTURE_ROOT);
const FIXTURE_BACKUP = path.join(FIXTURE_PARENT, ".canonical-process-package.backup");
const FIXTURE_STAGE_PREFIX = ".canonical-process-package.refresh-";
const MANIFEST_PATH = path.join(FIXTURE_ROOT, "manifest.json");
const ARCHIVE_NAME = "process-package.json.gz";
const ARCHIVE_PATH = path.join(FIXTURE_ROOT, ARCHIVE_NAME);
const BUFFER_LIMIT = 64 * 1024 * 1024;
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
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      specifier.endsWith(".js") &&
      context.parentURL?.includes("/src/")
    ) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

function fail(message) {
  throw new Error(`Canonical Process Package fixture: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(arguments_) {
  return execFileSync("git", arguments_, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: BUFFER_LIMIT,
  }).trim();
}

function gitSucceeds(arguments_) {
  try {
    execFileSync("git", arguments_, {
      cwd: REPOSITORY_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

async function filePaths(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filePaths(root, entryPath);
    return entry.isFile() ? [path.relative(root, entryPath)] : [];
  }));
  return nested.flat().sort();
}

async function packageDigest(root) {
  const resolvedRoot = path.resolve(root);
  const paths = await filePaths(resolvedRoot);
  const hash = createHash("sha256");
  for (let index = 0; index < paths.length; index += 32) {
    const batch = paths.slice(index, index + 32);
    const contents = await Promise.all(batch.map((relativePath) =>
      fs.readFile(path.join(resolvedRoot, relativePath))
    ));
    for (const [offset, relativePath] of batch.entries()) {
      const content = contents[offset];
      hash.update(relativePath);
      hash.update("\0");
      hash.update(String(content.byteLength));
      hash.update("\0");
      hash.update(content);
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

function canonicalizeSourcePaths(value, sourceRoot) {
  if (typeof value === "string") {
    if (value === sourceRoot || value.startsWith(`${sourceRoot}${path.sep}`)) {
      return `${PROCESS_ROOT}${value.slice(sourceRoot.length)}`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSourcePaths(item, sourceRoot));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      canonicalizeSourcePaths(item, sourceRoot),
    ]));
  }
  return value;
}

async function sourceProcessPackage(root) {
  const sourceModule = pathToFileURL(path.join(REPOSITORY_ROOT, "src/index.ts")).href;
  const { loadProcessPackage } = await import(sourceModule);
  const loaded = await loadProcessPackage(root);
  if (!loaded.ok) {
    fail(loaded.diagnostics.map(({ message }) => message).join("; "));
  }
  return canonicalizeSourcePaths(loaded.package, path.resolve(root));
}

function gzip(content) {
  return execFileSync("gzip", ["-n", "-9", "-c"], {
    input: content,
    maxBuffer: BUFFER_LIMIT,
  });
}

function definitionCount(processPackage) {
  return DEFINITION_GROUPS.reduce((count, group) => {
    const definitions = processPackage[group];
    if (typeof definitions !== "object" || definitions === null || Array.isArray(definitions)) {
      fail(`serialized package group ${group} is invalid`);
    }
    return count + Object.keys(definitions).length;
  }, 0);
}

function validateManifest(value) {
  const manifest = value;
  if (
    typeof manifest !== "object" || manifest === null ||
    manifest.contract !== "mdlm-canonical-process-package-fixture@1" ||
    manifest.schemaVersion !== 1 ||
    manifest.artifact?.archive !== ARCHIVE_NAME ||
    manifest.artifact?.compression !== "gzip -n -9" ||
    !/^[a-f0-9]{64}$/.test(manifest.artifact?.compressedSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(manifest.artifact?.contentSha256 ?? "") ||
    manifest.artifact?.gzipHeaderMtime !== 0 ||
    manifest.processPackage?.root !== PROCESS_ROOT ||
    !/^[a-z][a-z0-9-]*@[0-9]+\.[0-9]+\.[0-9]+$/.test(
      manifest.processPackage?.reference ?? "",
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest.processPackage?.digest ?? "") ||
    !Number.isInteger(manifest.processPackage?.definitionCount) ||
    manifest.processPackage.definitionCount < 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.provenance?.sourceCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(manifest.provenance?.sourceTree ?? "") ||
    typeof manifest.provenance?.captureCommand !== "string" ||
    manifest.provenance.captureCommand === ""
  ) {
    fail("manifest is invalid");
  }
  return manifest;
}

async function readManifest() {
  return validateManifest(JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")));
}

async function pathExists(candidate) {
  try {
    await fs.stat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function recoverFixturePublication() {
  const fixtureExists = await pathExists(FIXTURE_ROOT);
  const backupExists = await pathExists(FIXTURE_BACKUP);
  if (!fixtureExists && backupExists) {
    await fs.rename(FIXTURE_BACKUP, FIXTURE_ROOT);
  } else if (fixtureExists && backupExists) {
    await fs.rm(FIXTURE_BACKUP, { recursive: true, force: true });
  }
  const entries = await fs.readdir(FIXTURE_PARENT, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(FIXTURE_STAGE_PREFIX))
    .map((entry) => fs.rm(path.join(FIXTURE_PARENT, entry.name), {
      recursive: true,
      force: true,
    })));
}

async function provenancePackage(manifest) {
  const sourceCommit = git([
    "rev-parse",
    "--verify",
    `${manifest.provenance.sourceCommit}^{commit}`,
  ]);
  if (sourceCommit !== manifest.provenance.sourceCommit) {
    fail("source commit does not resolve exactly");
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", sourceCommit, "HEAD"])) {
    fail("source commit is not reachable from HEAD; run `npm run process-fixture:refresh`");
  }
  const sourceTree = git(["rev-parse", "--verify", `${sourceCommit}^{tree}`]);
  if (sourceTree !== manifest.provenance.sourceTree) {
    fail("source tree does not belong to source commit");
  }

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-fixture-"));
  try {
    const sourceArchive = execFileSync(
      "git",
      ["archive", "--format=tar", sourceCommit, "--", PROCESS_ROOT],
      { cwd: REPOSITORY_ROOT, maxBuffer: BUFFER_LIMIT },
    );
    execFileSync("tar", ["-x", "-C", temporaryRoot], {
      input: sourceArchive,
      maxBuffer: BUFFER_LIMIT,
    });
    const sourceRoot = path.join(temporaryRoot, PROCESS_ROOT);
    return {
      digest: await packageDigest(sourceRoot),
      processPackage: await sourceProcessPackage(sourceRoot),
    };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function checkpointProcessPackage(processPackage) {
  const status = git([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    PROCESS_ROOT,
  ]);
  if (status === "") return undefined;

  const reference = `${processPackage.manifest.id}@${processPackage.manifest.version}`;
  execFileSync("git", ["add", "--all", "--", PROCESS_ROOT], {
    cwd: REPOSITORY_ROOT,
    stdio: "ignore",
  });
  execFileSync(
    "git",
    [
      "commit",
      "--only",
      "--message",
      `chore(process): checkpoint ${reference} fixture source`,
      "--",
      PROCESS_ROOT,
    ],
    { cwd: REPOSITORY_ROOT, stdio: "ignore" },
  );
  const sourceCommit = git(["rev-parse", "HEAD"]);
  process.stdout.write(`PROCESS_FIXTURE_SOURCE_CHECKPOINT commit=${sourceCommit}\n`);
  return {
    sourceCommit,
    sourceTree: git(["rev-parse", `${sourceCommit}^{tree}`]),
  };
}

function validateSerializedPackage(content, manifest) {
  const processPackage = JSON.parse(content.toString("utf8"));
  const reference = `${processPackage.manifest?.id}@${processPackage.manifest?.version}`;
  if (processPackage.root !== PROCESS_ROOT || reference !== manifest.processPackage.reference) {
    fail("serialized package identity does not match the manifest");
  }
  if (definitionCount(processPackage) !== manifest.processPackage.definitionCount) {
    fail("serialized package definition count does not match the manifest");
  }
  return processPackage;
}

function requireExactSerialization(actual, expected, label) {
  if (actual === expected) return;
  let offset = 0;
  while (offset < actual.length && offset < expected.length && actual[offset] === expected[offset]) {
    offset += 1;
  }
  fail(`${label} at serialized byte ${offset}`);
}

async function checkFixture() {
  await recoverFixturePublication();
  const manifest = await readManifest();
  const currentDigest = await packageDigest(PROCESS_ROOT);
  if (currentDigest !== manifest.processPackage.digest) {
    fail("source digest drift; run `npm run process-fixture:refresh`");
  }

  const archive = await fs.readFile(ARCHIVE_PATH);
  if (sha256(archive) !== manifest.artifact.compressedSha256) {
    fail("compressed archive digest mismatch");
  }
  if (archive.length < 8 || archive.readUInt32LE(4) !== 0) {
    fail("gzip header timestamp is not zero");
  }
  const content = gunzipSync(archive);
  if (sha256(content) !== manifest.artifact.contentSha256) {
    fail("uncompressed archive digest mismatch");
  }
  if (!gzip(content).equals(archive)) {
    fail("archive does not match declared deterministic compression");
  }
  validateSerializedPackage(content, manifest);

  const currentPackage = await sourceProcessPackage(PROCESS_ROOT);
  requireExactSerialization(
    JSON.stringify(currentPackage),
    content.toString("utf8"),
    "serialized archive differs from the current source package",
  );
  const provenance = await provenancePackage(manifest);
  if (provenance.digest !== manifest.processPackage.digest) {
    fail("provenance source package digest mismatch");
  }
  requireExactSerialization(
    JSON.stringify(provenance.processPackage),
    content.toString("utf8"),
    "serialized archive differs from the provenance source package",
  );
  process.stdout.write(
    `PROCESS_FIXTURE_OK package=${manifest.processPackage.reference} digest=${currentDigest}\n`,
  );
}

async function buildFixture(processPackage, previousManifest, knownProvenance) {
  const digest = await packageDigest(PROCESS_ROOT);
  let sourceCommit;
  let sourceTree;
  if (knownProvenance) {
    sourceCommit = knownProvenance.sourceCommit;
    sourceTree = knownProvenance.sourceTree;
  } else if (
    previousManifest.processPackage.digest === digest &&
    gitSucceeds([
      "merge-base",
      "--is-ancestor",
      previousManifest.provenance.sourceCommit,
      "HEAD",
    ]) &&
    (await provenancePackage(previousManifest)).digest === digest
  ) {
    sourceCommit = previousManifest.provenance.sourceCommit;
    sourceTree = previousManifest.provenance.sourceTree;
  } else {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", PROCESS_ROOT], {
      cwd: REPOSITORY_ROOT,
    });
    sourceCommit = git(["rev-parse", "HEAD"]);
    sourceTree = git(["rev-parse", `${sourceCommit}^{tree}`]);
  }

  const content = Buffer.from(JSON.stringify(processPackage));
  const archive = gzip(content);
  const reference = `${processPackage.manifest.id}@${processPackage.manifest.version}`;
  const manifest = {
    contract: "mdlm-canonical-process-package-fixture@1",
    schemaVersion: 1,
    artifact: {
      archive: ARCHIVE_NAME,
      compression: "gzip -n -9",
      compressedSha256: sha256(archive),
      contentSha256: sha256(content),
      gzipHeaderMtime: 0,
    },
    processPackage: {
      root: PROCESS_ROOT,
      reference,
      digest,
      definitionCount: definitionCount(processPackage),
    },
    provenance: {
      sourceCommit,
      sourceTree,
      captureCommand: "npm run process-fixture:refresh",
    },
  };
  return {
    archive,
    manifest: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  };
}

async function validateGeneratedFixture(fixture) {
  const manifest = validateManifest(JSON.parse(fixture.manifest.toString("utf8")));
  if (sha256(fixture.archive) !== manifest.artifact.compressedSha256) {
    fail("generated compressed archive digest mismatch");
  }
  if (fixture.archive.length < 8 || fixture.archive.readUInt32LE(4) !== 0) {
    fail("generated gzip header timestamp is not zero");
  }
  const content = gunzipSync(fixture.archive);
  if (sha256(content) !== manifest.artifact.contentSha256) {
    fail("generated uncompressed archive digest mismatch");
  }
  if (!gzip(content).equals(fixture.archive)) {
    fail("generated archive is not deterministic");
  }
  validateSerializedPackage(content, manifest);
  const provenance = await provenancePackage(manifest);
  if (provenance.digest !== manifest.processPackage.digest) {
    fail("generated provenance source package digest mismatch");
  }
  requireExactSerialization(
    JSON.stringify(provenance.processPackage),
    content.toString("utf8"),
    "generated archive differs from the provenance source package",
  );
}

async function publishFixture(fixture) {
  await recoverFixturePublication();
  const stage = path.join(FIXTURE_PARENT, `${FIXTURE_STAGE_PREFIX}${process.pid}`);
  await fs.mkdir(stage, { recursive: false });
  try {
    await fs.writeFile(path.join(stage, ARCHIVE_NAME), fixture.archive, { flag: "wx" });
    await fs.writeFile(path.join(stage, "manifest.json"), fixture.manifest, { flag: "wx" });
    await fs.rename(FIXTURE_ROOT, FIXTURE_BACKUP);
    try {
      await fs.rename(stage, FIXTURE_ROOT);
    } catch (error) {
      await fs.rename(FIXTURE_BACKUP, FIXTURE_ROOT);
      throw error;
    }
    await fs.rm(FIXTURE_BACKUP, { recursive: true, force: true });
  } catch (error) {
    if (!await pathExists(FIXTURE_ROOT) && await pathExists(FIXTURE_BACKUP)) {
      await fs.rename(FIXTURE_BACKUP, FIXTURE_ROOT);
    }
    throw error;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

async function refreshFixture() {
  await recoverFixturePublication();
  const previousManifest = await readManifest();
  const processPackage = await sourceProcessPackage(PROCESS_ROOT);
  const checkpoint = checkpointProcessPackage(processPackage);
  const first = await buildFixture(processPackage, previousManifest, checkpoint);
  await validateGeneratedFixture(first);
  const generatedManifest = validateManifest(JSON.parse(first.manifest.toString("utf8")));
  const second = await buildFixture(
    processPackage,
    generatedManifest,
    generatedManifest.provenance,
  );
  if (!first.archive.equals(second.archive) || !first.manifest.equals(second.manifest)) {
    fail("refresh is not idempotent");
  }
  await publishFixture(first);
  const [publishedArchive, publishedManifest] = await Promise.all([
    fs.readFile(ARCHIVE_PATH),
    fs.readFile(MANIFEST_PATH),
  ]);
  if (!first.archive.equals(publishedArchive) || !first.manifest.equals(publishedManifest)) {
    fail("published fixture differs from the validated fixture");
  }
  process.stdout.write(
    `PROCESS_FIXTURE_OK package=${generatedManifest.processPackage.reference} ` +
    `digest=${generatedManifest.processPackage.digest}\n`,
  );
  process.stdout.write("PROCESS_FIXTURE_REFRESHED\n");
}

function printHelp() {
  process.stdout.write(
    "Usage: node scripts/process-fixture.mjs <check|refresh>\n\n" +
    "  check    Verify the canonical fixture and its reachable source commit.\n" +
    "  refresh  Commit only dirty .lifecycle/process files as a source checkpoint,\n" +
    "           then refresh the canonical fixture from that exact commit. Other\n" +
    "           staged and unstaged files are left unchanged. Do not amend the\n" +
    "           source checkpoint; commit the refreshed fixture after it.\n",
  );
}

const command = process.argv[2];
try {
  if (command === "--help" || command === "help" || process.argv.includes("--help")) {
    printHelp();
  } else if (command === "check") await checkFixture();
  else if (command === "refresh") await refreshFixture();
  else fail("expected `check` or `refresh`");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
