import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { gunzipSync } from "node:zlib";

const repositoryRoot = process.cwd();
const temporaryParent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-fixture-test-"));
const worktree = path.join(temporaryParent, "worktree");
const refreshWorktree = path.join(temporaryParent, "refresh-worktree");

function git(cwd, ...arguments_) {
  return execFileSync("git", arguments_, { cwd, encoding: "utf8" }).trimEnd();
}

function runFixture(cwd, command) {
  return spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-transform-types",
      path.join(repositoryRoot, "scripts/process-fixture.mjs"),
      command,
    ],
    { cwd, encoding: "utf8" },
  );
}

after(async () => {
  for (const candidate of [worktree, refreshWorktree]) {
    spawnSync("git", ["worktree", "remove", "--force", candidate], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  }
  await fs.rm(temporaryParent, { recursive: true, force: true });
});

test("rejects coordinated archive and manifest semantic drift", async () => {
  execFileSync("git", ["worktree", "add", "--detach", worktree, "HEAD"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  await fs.symlink(path.join(repositoryRoot, "node_modules"), path.join(worktree, "node_modules"));

  const fixtureRoot = path.join(worktree, "test/fixtures/canonical-process-package");
  const manifestPath = path.join(fixtureRoot, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const archivePath = path.join(fixtureRoot, manifest.artifact.archive);
  const processPackage = JSON.parse(gunzipSync(await fs.readFile(archivePath)).toString("utf8"));
  processPackage.manifest.description = `${processPackage.manifest.description} tampered`;
  const content = Buffer.from(JSON.stringify(processPackage));
  const archive = execFileSync("gzip", ["-n", "-9", "-c"], { input: content });
  manifest.artifact.compressedSha256 = createHash("sha256").update(archive).digest("hex");
  manifest.artifact.contentSha256 = createHash("sha256").update(content).digest("hex");
  await fs.writeFile(archivePath, archive);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runFixture(worktree, "check");
  if (result.status === 0) {
    throw new Error("Coordinated archive and manifest drift passed the fixture check");
  }
  if (!result.stderr.includes("serialized archive differs from the current source package")) {
    throw new Error(`Unexpected fixture-check failure: ${result.stderr}`);
  }
});

test("refresh checkpoints package source without committing unrelated work", async () => {
  execFileSync("git", ["worktree", "add", "--detach", refreshWorktree, "HEAD"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  await fs.symlink(
    path.join(repositoryRoot, "node_modules"),
    path.join(refreshWorktree, "node_modules"),
  );

  const initialHead = git(refreshWorktree, "rev-parse", "HEAD");
  await fs.chmod(path.join(refreshWorktree, ".lifecycle/process/manifest.yaml"), 0o755);
  await fs.writeFile(path.join(refreshWorktree, "unrelated-staged.txt"), "staged\n");
  git(refreshWorktree, "add", "unrelated-staged.txt");
  await fs.appendFile(path.join(refreshWorktree, "README.md"), "\nUnstaged proof.\n");

  const startedAt = performance.now();
  const result = runFixture(refreshWorktree, "refresh");
  const durationMs = performance.now() - startedAt;
  assert.equal(result.status, 0, `Fixture refresh failed: ${result.stderr}${result.stdout}`);
  assert.ok(durationMs < 10_000, `Fixture refresh took ${Math.round(durationMs)}ms`);

  const sourceCommit = git(refreshWorktree, "rev-parse", "HEAD");
  const sourceTree = git(refreshWorktree, "rev-parse", "HEAD:.lifecycle/process");
  assert.equal(git(refreshWorktree, "rev-parse", "HEAD^"), initialHead);
  const committedPaths = git(
    refreshWorktree,
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "HEAD",
  ).split("\n");
  assert.ok(committedPaths.includes(".lifecycle/process/manifest.yaml"));
  assert.ok(committedPaths.every((candidate) => candidate.startsWith(".lifecycle/process/")));

  const status = git(refreshWorktree, "status", "--short");
  for (const expected of [
    " M README.md",
    "A  unrelated-staged.txt",
    " M test/fixtures/canonical-process-package/manifest.json",
  ]) {
    if (!status.includes(expected)) {
      assert.fail(`Missing preserved status '${expected}':\n${status}`);
    }
  }
  if (status.includes(".lifecycle/process/")) {
    throw new Error(`Package source remained dirty after checkpoint:\n${status}`);
  }

  const manifest = JSON.parse(await fs.readFile(
    path.join(refreshWorktree, "test/fixtures/canonical-process-package/manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.provenance.sourceTree, sourceTree);
  if (!result.stdout.includes("PROCESS_FIXTURE_OK")) {
    throw new Error(`Refresh did not check its output: ${result.stdout}`);
  }

  git(
    refreshWorktree,
    "commit",
    "--only",
    "--message",
    "test: retain fixture with rewritten source history",
    "--",
    "test/fixtures/canonical-process-package",
  );
  const fixtureTree = git(refreshWorktree, "rev-parse", "HEAD^{tree}");
  const rewrittenHead = git(
    refreshWorktree,
    "commit-tree",
    fixtureTree,
    "-p",
    initialHead,
    "-m",
    "rewritten fixture history",
  ).trim();
  git(refreshWorktree, "update-ref", "HEAD", rewrittenHead);
  const rewritten = runFixture(refreshWorktree, "check");
  assert.equal(rewritten.status, 0, `Rewritten source history failed: ${rewritten.stderr}`);

  await fs.appendFile(
    path.join(refreshWorktree, ".lifecycle/process/manifest.yaml"),
    "\n# tampered package source\n",
  );
  const tampered = runFixture(refreshWorktree, "check");
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /source digest drift/);
});
