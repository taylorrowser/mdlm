import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { gunzipSync } from "node:zlib";

const repositoryRoot = process.cwd();
const temporaryParent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-fixture-test-"));
const worktree = path.join(temporaryParent, "worktree");

after(async () => {
  spawnSync("git", ["worktree", "remove", "--force", worktree], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
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

  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-transform-types",
      path.join(repositoryRoot, "scripts/process-fixture.mjs"),
      "check",
    ],
    { cwd: worktree, encoding: "utf8" },
  );
  if (result.status === 0) {
    throw new Error("Coordinated archive and manifest drift passed the fixture check");
  }
  if (!result.stderr.includes("serialized archive differs from the current source package")) {
    throw new Error(`Unexpected fixture-check failure: ${result.stderr}`);
  }
});
