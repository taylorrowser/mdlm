import { execFile, spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { MdlmClient } from "../src/mdlm-client.js";
import { RunJournal } from "../src/run-journal.js";

const executeFile = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(projectRoot, "packages/mdlm-pi/dist/cli.js");
const runLockStaleMs = 10_000;
const temporaryRoots: string[] = [];

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

  it("maps a complete typed Invalid status to stable exit 3", async () => {
    const fixture = await processFixture({ currentOutcome: {
      outcome: "invalid",
      diagnostics: [{ code: "INVALID", message: "fixture invalid" }],
    } });
    const result = await executeFileResult(process.execPath, [
      cli,
      "run",
      fixture.repository,
      "--mdlm",
      fixture.mdlm,
    ], fixture.invocationDirectory);

    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "invalid" });
    expect(result.stderr).toBe("");
  });

  it("retains exact MDLM diagnostics when Assignment preparation fails", async () => {
    const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";
    const prepareFailure = {
      contract: "mdlm-scenario-prepare-failure@1",
      command: "scenario.prepare",
      ok: false,
      assignment: { id: assignmentId },
      diagnostics: [{
        code: "ASSIGNMENT_REPOSITORY_CHANGED",
        message: "Assignment repository HEAD no longer matches the tracked state digest",
        details: {
          expectedHead: "base-commit",
          actualHead: "materialization-commit",
        },
      }],
    };
    const fixture = await processFixture({
      currentOutcome: {
        outcome: "assignment",
        assignment: { allocation: "active", id: assignmentId },
      },
      prepareFailure,
    });

    const result = await executeFileResult(process.execPath, [
      cli,
      "run",
      fixture.repository,
      "--mdlm",
      fixture.mdlm,
    ], fixture.invocationDirectory);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      status: "operational-failure",
      error: "MDLM could not prepare the Assignment",
      details: prepareFailure,
    });
  });

  it("stops foreground progress and its MDLM child when the terminal sends SIGHUP", async () => {
    const fixture = await processFixture({ blockStatus: true });
    const operator = spawn(process.execPath, [
      cli,
      "run",
      fixture.repository,
      "--mdlm",
      fixture.mdlm,
    ], {
      cwd: fixture.invocationDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForFile(fixture.ready, operator);

    operator.kill("SIGHUP");
    const stopped = await collect(operator);

    expect(stopped.status).toBe(129);
    expect(stopped.stdout).toContain('"status": "interrupted"');
  });

  it("recovers a killed controller while mdlm next is materializing one transaction", async () => {
    if (!["darwin", "linux"].includes(process.platform)) return;
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-next-recovery-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const invocationDirectory = path.join(root, "invocation");
    const fakeMdlm = path.join(root, "fake-next-mdlm.mjs");
    const ready = path.join(root, "next-ready");
    const materialized = path.join(root, "materialized");
    const nextInvocations = path.join(root, "next-invocations");
    const executionId = "f2ca1127-9fd3-4fb6-bdd1-fc54590b4ed0";
    const scenario = "package-neutral-materialization@1";
    const responseDigest = `sha256:${"b".repeat(64)}`;
    const outputPath = `.lifecycle/data/.transactions/${executionId}/datum.md`;
    await mkdir(repository);
    await mkdir(invocationDirectory);
    await executeFile("git", ["init", "--quiet"], { cwd: repository });
    await executeFile("git", ["config", "user.name", "MDLM Pi Test"], { cwd: repository });
    await executeFile("git", ["config", "user.email", "mdlm-pi@localhost"], { cwd: repository });
    await writeFile(path.join(repository, "README.md"), "fixture\n");
    await executeFile("git", ["add", "README.md"], { cwd: repository });
    await executeFile("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
    await writeFile(fakeMdlm, `#!/usr/bin/env node
import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
const ready = ${JSON.stringify(ready)};
const materialized = ${JSON.stringify(materialized)};
const nextInvocations = ${JSON.stringify(nextInvocations)};
const executionId = ${JSON.stringify(executionId)};
const scenario = ${JSON.stringify(scenario)};
const responseDigest = ${JSON.stringify(responseDigest)};
const outputPath = ${JSON.stringify(outputPath)};
const packageIdentity = {
  reference: "package-neutral@1",
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};
let hasMaterialization = false;
try { await access(materialized); hasMaterialization = true; } catch {}
const execution = {
  contract: "mdlm-scenario-execution@4", id: executionId, status: "completed",
  definition: { scenario }, response: { digest: responseDigest },
  outputs: [{ lifecycleDatum: { path: outputPath } }]
};
if (args[0] === "next") {
  await appendFile(nextInvocations, "next\\n");
  await mkdir(path.join(process.cwd(), path.dirname(outputPath)), { recursive: true });
  await writeFile(path.join(process.cwd(), outputPath), "materialized\\n");
  await writeFile(path.join(process.cwd(), path.dirname(outputPath), "execution.json"), JSON.stringify(execution) + "\\n");
  await writeFile(materialized, "materialized\\n");
  await writeFile(ready, String(process.pid));
  setInterval(() => {}, 1000);
} else if (args[0] === "status") {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-status@1", command: "status", ok: true,
    package: packageIdentity,
    currentOutcome: hasMaterialization
      ? { outcome: "lifecycle-complete" }
      : { outcome: "assignment", assignment: { allocation: "not-allocated" } },
    recentTransaction: hasMaterialization
      ? { available: true, id: executionId }
      : { available: false }
  }));
} else if (args[0] === "scenario" && args[1] === "execution") {
  process.stdout.write(JSON.stringify({
    command: "scenario.execution.show", ok: true, execution
  }));
} else if (args[0] === "doctor") {
  process.stdout.write(JSON.stringify({ command: "doctor", ok: true, diagnostics: [] }));
} else {
  process.stderr.write("unexpected args: " + JSON.stringify(args));
  process.exitCode = 2;
}
`);
    await chmod(fakeMdlm, 0o755);
    const operatorArguments = [
      cli,
      "run",
      repository,
      "--mdlm",
      fakeMdlm,
    ];
    const interrupted = spawn(process.execPath, operatorArguments, {
      cwd: invocationDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForFile(ready, interrupted);
    const nextPid = Number(await readFile(ready, "utf8"));
    interrupted.kill("SIGKILL");
    const killed = await collect(interrupted);
    expect(killed.status).toBeNull();
    await killProcessGroup(nextPid);

    const recovered = await runAfterStaleLock(
      process.execPath,
      operatorArguments,
      invocationDirectory,
    );

    expect(recovered.status).toBe(0);
    expect((await readFile(nextInvocations, "utf8")).trim().split("\n"))
      .toEqual(["next"]);
    expect((await executeFile("git", ["log", "-1", "--format=%s"], {
      cwd: repository,
    })).stdout.trim()).toBe(`mdlm: publish ${scenario} (${executionId})`);
    expect((await executeFile("git", ["rev-list", "--count", "HEAD"], {
      cwd: repository,
    })).stdout.trim()).toBe("2");
    expect((await executeFile("git", [
      "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD",
    ], { cwd: repository })).stdout.trim().split("\n").sort()).toEqual([
      outputPath,
      `.lifecycle/data/.transactions/${executionId}/execution.json`,
    ].sort());
    expect((await executeFile("git", ["show", `HEAD:${outputPath}`], {
      cwd: repository,
    })).stdout).toBe("materialized\n");
    expect((await executeFile("git", ["status", "--porcelain"], {
      cwd: repository,
    })).stdout).toBe("");
    expect(await new RunJournal(path.join(repository, ".git/mdlm-pi")).load())
      .toBeNull();
  }, 45_000);

  it("reconciles an interrupted live submit without invoking submission twice", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-submit-recovery-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const invocationDirectory = path.join(root, "invocation");
    const fakeMdlm = path.join(root, "fake-submit-mdlm.mjs");
    const ready = path.join(root, "submit-ready");
    const published = path.join(root, "published");
    const submissions = path.join(root, "submissions");
    const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";
    const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
    const scenario = "package-neutral-example@1";
    const packageIdentity = {
      reference: "package-neutral@1",
      digest: `sha256:${"a".repeat(64)}`,
    };
    const repositoryFingerprint = { head: "fixture", lifecycle: "sha256:lifecycle" };
    await mkdir(repository);
    await mkdir(invocationDirectory);
    await executeFile("git", ["init", "--quiet"], { cwd: repository });
    await executeFile("git", ["config", "user.name", "MDLM Pi Test"], { cwd: repository });
    await executeFile("git", ["config", "user.email", "mdlm-pi@localhost"], { cwd: repository });
    await writeFile(path.join(repository, "README.md"), "fixture\n");
    await executeFile("git", ["add", "README.md"], { cwd: repository });
    await executeFile("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
    const response = new MdlmClient({ repository }).prepareSubmission({
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: { outputs: [] },
    });
    const stateDirectory = path.join(repository, ".git/mdlm-pi");
    await new RunJournal(stateDirectory).captureSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: repositoryFingerprint,
      response,
    });
    const outputPath = `.lifecycle/data/.transactions/${executionId}/datum.md`;
    await writeFile(fakeMdlm, `#!/usr/bin/env node
import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
const published = ${JSON.stringify(published)};
const ready = ${JSON.stringify(ready)};
const submissions = ${JSON.stringify(submissions)};
const assignmentId = ${JSON.stringify(assignmentId)};
const executionId = ${JSON.stringify(executionId)};
const scenario = ${JSON.stringify(scenario)};
const digest = ${JSON.stringify(response.digest)};
const outputPath = ${JSON.stringify(outputPath)};
let hasPublication = false;
try { await access(published); hasPublication = true; } catch {}
const execution = {
  contract: "mdlm-scenario-execution@4", id: executionId, status: "completed",
  definition: { scenario }, response: { assignment: assignmentId, digest },
  outputs: [{ lifecycleDatum: { path: outputPath } }]
};
if (args[0] === "scenario" && args[1] === "submit") {
  for await (const _chunk of process.stdin) {}
  await appendFile(submissions, "submit\\n");
  await mkdir(path.join(process.cwd(), path.dirname(outputPath)), { recursive: true });
  await writeFile(path.join(process.cwd(), outputPath), "published\\n");
  await writeFile(path.join(process.cwd(), path.dirname(outputPath), "execution.json"), JSON.stringify(execution) + "\\n");
  await writeFile(published, "published\\n");
  await writeFile(ready, String(process.pid));
  setInterval(() => {}, 1000);
} else if (args[0] === "scenario" && args[1] === "prepare") {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-assignment-packet@2", command: "scenario.prepare", ok: true,
    assignment: { id: assignmentId }, package: ${JSON.stringify(packageIdentity)},
    repository: ${JSON.stringify(repositoryFingerprint)},
    scenario: { reference: scenario }, responseSchema: { type: "object" }
  }));
} else if (args[0] === "assignment") {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-assignment-state@1", command: "assignment.show", ok: true,
    assignment: { id: assignmentId }, selected: true,
    package: ${JSON.stringify(packageIdentity)}, repository: ${JSON.stringify(repositoryFingerprint)},
    scenarioReference: scenario, disposition: "active", retryAvailability: {}, malformedResponses: []
  }));
} else if (args[0] === "scenario" && args[1] === "execution") {
  process.stdout.write(JSON.stringify({
    command: "scenario.execution.show", ok: true, execution
  }));
} else if (args[0] === "doctor") {
  process.stdout.write(JSON.stringify({ command: "doctor", ok: true, diagnostics: [] }));
} else if (args[0] === "status") {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-status@1", command: "status", ok: true,
    currentOutcome: hasPublication
      ? { outcome: "lifecycle-complete" }
      : { outcome: "assignment", assignment: { allocation: "active", id: assignmentId } },
    recentTransaction: hasPublication
      ? { available: true, id: executionId }
      : { available: false }
  }));
} else {
  process.stderr.write("unexpected args: " + JSON.stringify(args));
  process.exitCode = 2;
}
`);
    await chmod(fakeMdlm, 0o755);
    const interrupted = spawn(process.execPath, [
      cli,
      "run",
      repository,
      "--mdlm",
      fakeMdlm,
    ], {
      cwd: invocationDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForFile(ready, interrupted);
    interrupted.kill("SIGHUP");
    expect((await collect(interrupted)).status).toBe(129);

    const recovered = await executeFileResult(process.execPath, [
      cli,
      "run",
      repository,
      "--mdlm",
      fakeMdlm,
    ], invocationDirectory);

    expect(recovered.status).toBe(0);
    expect((await readFile(submissions, "utf8")).trim().split("\n")).toEqual(["submit"]);
    expect((await executeFile("git", ["log", "-1", "--format=%s"], {
      cwd: repository,
    })).stdout.trim()).toBe(`mdlm: publish ${scenario} (${executionId})`);
    expect((await executeFile("git", ["status", "--porcelain"], {
      cwd: repository,
    })).stdout).toBe("");
    expect(await new RunJournal(stateDirectory).load()).toBeNull();
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

    const linkedWorktree = path.join(path.dirname(fixture.repository), "linked-worktree");
    await executeFile(
      "git",
      ["worktree", "add", "--quiet", "-b", "linked-contender", linkedWorktree],
      { cwd: fixture.repository },
    );
    const linkedContender = await executeFileResult(process.execPath, [
      cli,
      "run",
      linkedWorktree,
      "--mdlm",
      fixture.mdlm,
    ], fixture.invocationDirectory);
    expect(linkedContender.status).toBe(5);
    expect(linkedContender.stderr).toContain("Another mdlm-pi run owns");
    expect(await commandLog(fixture.log)).toHaveLength(1);

    await writeFile(fixture.release, "release\n");
    const owner = await collect(first);
    expect(owner.status).toBe(0);
    expect(JSON.parse(owner.stdout)).toMatchObject({ status: "lifecycle-complete" });
  });
});

async function processFixture(options: {
  blockStatus?: boolean;
  currentOutcome?: Record<string, unknown>;
  prepareFailure?: Record<string, unknown>;
} = {}): Promise<{
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
const args = process.argv.slice(2);
await appendFile(log, JSON.stringify({ cwd: process.cwd(), arguments: args }) + "\\n");
if (${JSON.stringify(options.blockStatus === true)}) {
  await writeFile(ready, "ready\\n");
  while (true) {
    try { await access(release); break; } catch { await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
}
const prepareFailure = ${JSON.stringify(options.prepareFailure ?? null)};
if (args[0] === "scenario" && args[1] === "prepare" && prepareFailure !== null) {
  process.stdout.write(JSON.stringify(prepareFailure));
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-status@1",
    command: "status",
    ok: true,
    currentOutcome: ${JSON.stringify(
      options.currentOutcome ?? { outcome: "lifecycle-complete", explanation: "fixture complete" },
    )},
    recentTransaction: { available: false },
  }));
}
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

async function killProcessGroup(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`Invalid process group leader: ${pid}`);
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
    return;
  }
  for (let attempts = 0; attempts < 100; attempts += 1) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Process group ${pid} survived SIGKILL`);
}

async function runAfterStaleLock(
  program: string,
  arguments_: string[],
  cwd: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const blocked = await executeFileResult(program, arguments_, cwd);
  if (blocked.status !== 5 || !blocked.stderr.includes("Another mdlm-pi run owns")) {
    throw new Error(
      `Killed controller did not leave a live owner lock: ${JSON.stringify(blocked)}`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, runLockStaleMs + 250));
  return await executeFileResult(program, arguments_, cwd);
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
