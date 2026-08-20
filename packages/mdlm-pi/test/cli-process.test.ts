import { execFile, spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(projectRoot, "packages/mdlm-pi/dist/cli.js");
const temporaryRoots: string[] = [];

beforeAll(async () => {
  await executeFile("npm", ["run", "build:mdlm-pi"], { cwd: projectRoot });
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("mdlm-pi run process boundary", () => {
  it("runs MDLM in the target repository when invoked from another cwd", async () => {
    const fixture = await processFixture();
    const result = await executeFile(process.execPath, [
      cli,
      "run",
      fixture.repository,
      "--mdlm",
      fixture.mdlm,
    ], { cwd: fixture.invocationDirectory });

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "lifecycle-complete",
    });
    expect(await commandLog(fixture.log)).toEqual([{
      cwd: await realpath(fixture.repository),
      arguments: ["status", "--json"],
    }]);
  });

  it("allows only one writer for a repository across separate operator processes", async () => {
    const fixture = await processFixture({ blockStatus: true });
    const alias = path.join(path.dirname(fixture.repository), "repository-alias");
    await symlink(fixture.repository, alias);
    const first = spawn(process.execPath, [
      cli,
      "run",
      fixture.repository,
      "--mdlm",
      fixture.mdlm,
    ], {
      cwd: fixture.invocationDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForFile(fixture.ready, first);

    const contender = await executeFileResult(process.execPath, [
      cli,
      "run",
      alias,
      "--mdlm",
      fixture.mdlm,
    ], fixture.invocationDirectory);

    expect(contender.status).toBe(5);
    expect(contender.stderr).toContain("Another mdlm-pi run owns");
    expect(await commandLog(fixture.log)).toHaveLength(1);

    await writeFile(fixture.release, "release\n");
    const owner = await collect(first);
    expect(owner.status).toBe(0);
    expect(JSON.parse(owner.stdout)).toMatchObject({ status: "lifecycle-complete" });
  });
});

async function processFixture(options: { blockStatus?: boolean } = {}): Promise<{
  repository: string;
  invocationDirectory: string;
  mdlm: string;
  log: string;
  ready: string;
  release: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-process-"));
  temporaryRoots.push(root);
  const repository = path.join(root, "repository");
  const invocationDirectory = path.join(root, "invocation");
  const log = path.join(root, "commands.jsonl");
  const ready = path.join(root, "ready");
  const release = path.join(root, "release");
  const mdlm = path.join(root, "fake-mdlm.mjs");
  await mkdir(repository);
  await mkdir(invocationDirectory);
  await executeFile("git", ["init", "--quiet"], { cwd: repository });
  await executeFile("git", ["config", "user.name", "MDLM Pi Test"], { cwd: repository });
  await executeFile("git", ["config", "user.email", "mdlm-pi@localhost"], { cwd: repository });
  await writeFile(path.join(repository, "README.md"), "fixture\n");
  await executeFile("git", ["add", "README.md"], { cwd: repository });
  await executeFile("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
  await writeFile(mdlm, `#!/usr/bin/env node
import { appendFile, access, writeFile } from "node:fs/promises";
const log = ${JSON.stringify(log)};
const ready = ${JSON.stringify(ready)};
const release = ${JSON.stringify(release)};
await appendFile(log, JSON.stringify({ cwd: process.cwd(), arguments: process.argv.slice(2) }) + "\\n");
if (${JSON.stringify(options.blockStatus === true)}) {
  await writeFile(ready, "ready\\n");
  while (true) {
    try { await access(release); break; } catch { await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
}
process.stdout.write(JSON.stringify({
  contract: "mdlm-status@1",
  command: "status",
  ok: true,
  currentOutcome: { outcome: "lifecycle-complete", explanation: "fixture complete" },
  recentTransaction: { available: false },
}));
`);
  await chmod(mdlm, 0o755);
  return { repository, invocationDirectory, mdlm, log, ready, release };
}

async function commandLog(log: string): Promise<unknown[]> {
  const source = await readFile(log, "utf8");
  return source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function waitForFile(file: string, child: ChildProcess): Promise<void> {
  for (let attempts = 0; attempts < 300; attempts += 1) {
    try {
      await readFile(file);
      return;
    } catch {
      if (child.exitCode !== null) throw new Error(`Owner exited before acquiring the run lock: ${child.exitCode}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  child.kill("SIGTERM");
  throw new Error("Timed out waiting for the owner process");
}

async function executeFileResult(
  program: string,
  arguments_: string[],
  cwd: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(program, arguments_, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    void collect(child).then(resolve, reject);
  });
}

async function collect(child: ChildProcess): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}
