import { execFile, spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { GitPublisher } from "../src/git-publisher.js";
import { MdlmClient } from "../src/mdlm-client.js";
import { operationalFailureDocument } from "../src/operational-failure.js";
import { RunJournal } from "../src/run-journal.js";

const executeFile = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(projectRoot, "packages/mdlm-pi/dist/cli.js");
const runLockStaleMs = 10_000;
const ownerProcessReadyTimeoutMs = 15_000;
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

  it("preserves Invalid exit 3 and reevaluation state after materialization", async () => {
    const invalid = {
      outcome: "invalid",
      diagnostics: [{ code: "INVALID", message: "post-materialization invalid" }],
    };
    const fixture = await processFixture({ currentOutcome: invalid });
    const git = new GitPublisher({ repository: fixture.repository });
    const repository = await git.repositoryFingerprint();
    const journal = new RunJournal(path.join(await git.gitDirectory(), "mdlm-pi"));
    const packageIdentity = {
      reference: "package-neutral@1",
      digest: `sha256:${"a".repeat(64)}`,
      language: "mdlm-expression@1",
    };
    const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
    await journal.beginAdvancement({
      package: packageIdentity,
      repository,
      previousTransactionId: null,
    });
    await journal.recordAdvancementExecutions([{
      executionId,
      scenario: "automatic-materialization@1",
      responseDigest: `sha256:${"b".repeat(64)}`,
      outputPaths: [`.lifecycle/data/.transactions/${executionId}/datum.md`],
      blobs: [{
        path: `.lifecycle/data/.transactions/${executionId}/datum.md`,
        oid: "c".repeat(40),
      }],
    }]);
    await journal.completeAdvancementExecution(executionId, repository.head, repository);
    const expectedJournal = await journal.load();

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
    expect(await journal.load()).toEqual(expectedJournal);
  });

  it("emits the canonical operational-failure contract when Assignment preparation fails", async () => {
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
    expect(JSON.parse(result.stderr)).toEqual(operationalFailureDocument({
      code: "MDLM_CLIENT_ERROR",
      message: "MDLM could not prepare the Assignment",
    }));
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

  it("settles blocked attended input on SIGINT and releases run ownership", async () => {
    const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";
    const fixture = await processFixture({
      currentOutcome: {
        outcome: "attention-required",
        assignment: { allocation: "active", id: assignmentId },
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        },
      },
      prepareAssignmentId: assignmentId,
    });
    const arguments_ = [
      cli,
      "run",
      fixture.repository,
      "--mdlm",
      fixture.mdlm,
    ];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const operator = spawn(process.execPath, arguments_, {
        cwd: fixture.invocationDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stopped = collect(operator);
      await waitForOutput(
        operator,
        "Explicit conclusion from the named authority holder",
      );

      operator.kill("SIGINT");
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        operator.kill("SIGKILL");
      }, 2_000);
      const result = await stopped;
      clearTimeout(timeout);
      if (timedOut) {
        throw new Error(
          `SIGINT attempt ${attempt + 1} did not settle: ${JSON.stringify(result)}`,
        );
      }

      expect(result.status).toBe(130);
      expect(result.stdout).toContain('"status": "interrupted"');
      expect(result.stderr).toBe("");
    }
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
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  language: "mdlm-expression@1"
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
    const submittedResponse = path.join(root, "submitted-response.json");
    const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";
    const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
    const scenario = "package-neutral-example@1";
    const packageIdentity = {
      reference: "package-neutral@1",
      digest: `sha256:${"a".repeat(64)}`,
      language: "mdlm-expression@1",
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
      proposal: {
        outputs: [],
        completionEvidence: {
          conclusion: "Keep the attended conclusion byte-for-byte.\nSecond exact line.",
        },
        loadedSkillRefs: [],
        authoritySupplies: ["stakeholder"],
        standingDelegations: [],
      },
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
const submittedResponse = ${JSON.stringify(submittedResponse)};
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
  let responseSource = "";
  for await (const chunk of process.stdin) responseSource += chunk;
  await writeFile(submittedResponse, responseSource);
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
    expect(await readFile(submittedResponse, "utf8")).toBe(response.source);
    expect((await executeFile("git", ["log", "-1", "--format=%s"], {
      cwd: repository,
    })).stdout.trim()).toBe(`mdlm: publish ${scenario} (${executionId})`);
    expect((await executeFile("git", ["status", "--porcelain"], {
      cwd: repository,
    })).stdout).toBe("");
    expect(await new RunJournal(stateDirectory).load()).toBeNull();
  });

  it("clears a fresh repository journal after a real inability child completed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-real-inability-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const invocationDirectory = path.join(root, "invocation");
    const fakeMdlm = path.join(root, "fake-inability-mdlm.mjs");
    const submissions = path.join(root, "submissions");
    const assignmentId = "66651d50-75c9-42bd-baae-8dda04d367e1";
    const scenario = "package-neutral-inability@1";
    const packageIdentity = {
      reference: "package-neutral@1",
      digest: `sha256:${"a".repeat(64)}`,
      language: "mdlm-expression@1",
    };
    await mkdir(repository);
    await mkdir(invocationDirectory);
    await executeFile("git", ["init", "--quiet"], { cwd: repository });
    await executeFile("git", ["config", "user.name", "MDLM Pi Test"], { cwd: repository });
    await executeFile("git", ["config", "user.email", "mdlm-pi@localhost"], { cwd: repository });
    await writeFile(path.join(repository, "README.md"), "fixture\n");
    await executeFile("git", ["add", "README.md"], { cwd: repository });
    await executeFile("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
    const git = new GitPublisher({ repository });
    const repositoryFingerprint = await git.repositoryFingerprint();
    const stateDirectory = path.join(await git.gitDirectory(), "mdlm-pi");
    const journal = new RunJournal(stateDirectory);
    const client = new MdlmClient({
      repository,
      command: { program: fakeMdlm },
      attemptDirectory: path.join(stateDirectory, "attempts"),
    });
    const response = client.prepareSubmission({
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "unable",
      unable: {
        reason: "insufficient-declared-inputs",
        diagnostics: [{ code: "MISSING", message: "Required evidence is unavailable" }],
      },
    });
    const disposition = {
      ok: true,
      command: "scenario.submit",
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: assignmentId },
      disposition: "abandoned",
      orchestration: { action: "stop", automaticReplacement: false },
      unable: response.response.unable,
      diagnostics: [],
    };
    await writeFile(fakeMdlm, `#!/usr/bin/env node
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
const packageIdentity = ${JSON.stringify(packageIdentity)};
const disposition = ${JSON.stringify(disposition)};
if (args[0] === "scenario" && args[1] === "submit") {
  for await (const _chunk of process.stdin) {}
  await appendFile(${JSON.stringify(submissions)}, "submit\\n");
  process.stdout.write(JSON.stringify(disposition));
} else if (args[0] === "status") {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-status@1", command: "status", ok: true,
    package: packageIdentity,
    currentOutcome: { outcome: "assignment", assignment: { allocation: "not-allocated" } },
    recentTransaction: { available: false }
  }));
} else if (args[0] === "assignment") {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-assignment-state@1", command: "assignment.show", ok: true,
    assignment: { id: ${JSON.stringify(assignmentId)} }, selected: false
  }));
} else {
  process.stderr.write("unexpected args: " + JSON.stringify(args));
  process.exitCode = 2;
}
`);
    await chmod(fakeMdlm, 0o755);
    await journal.beginSubmission({
      assignmentId,
      scenario,
      package: packageIdentity,
      repository: { ...repositoryFingerprint },
      previousTransactionId: null,
      baseCommit: repositoryFingerprint.head,
      previousMalformedResponseDigests: [],
      response,
    });
    await expect(client.submit(response, {
      started: async (process) => { await journal.recordSubmissionProcess(process); },
    })).resolves.toEqual(disposition);
    expect(await journal.load()).toMatchObject({
      phase: "submitting",
      submission: { process: { stdoutPath: expect.any(String) } },
    });

    const recovered = await executeFileResult(process.execPath, [
      cli,
      "run",
      repository,
      "--mdlm",
      fakeMdlm,
    ], invocationDirectory);

    expect(recovered.status).toBe(4);
    expect(JSON.parse(recovered.stdout.slice(recovered.stdout.indexOf("{")))).toMatchObject({
      status: "assignment-abandoned",
      ...disposition,
    });
    expect(recovered.stderr).toBe("");
    expect((await readFile(submissions, "utf8")).trim().split("\n")).toEqual(["submit"]);
    expect(await journal.load()).toBeNull();
    expect((await executeFile("git", ["status", "--porcelain"], { cwd: repository })).stdout)
      .toBe("");
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
  prepareAssignmentId?: string;
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
  const repositoryFingerprint = await new GitPublisher({ repository }).repositoryFingerprint();
  const packageIdentity = {
    reference: "package-neutral@1",
    digest: `sha256:${"a".repeat(64)}`,
    language: "mdlm-expression@1",
  };
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
const prepareAssignmentId = ${JSON.stringify(options.prepareAssignmentId ?? null)};
if (args[0] === "scenario" && args[1] === "prepare" && prepareFailure !== null) {
  process.stdout.write(JSON.stringify(prepareFailure));
  process.exitCode = 1;
} else if (args[0] === "scenario" && args[1] === "prepare" && prepareAssignmentId !== null) {
  process.stdout.write(JSON.stringify({
    contract: "mdlm-assignment-packet@2",
    command: "scenario.prepare",
    ok: true,
    assignment: { id: prepareAssignmentId },
    package: ${JSON.stringify(packageIdentity)},
    repository: ${JSON.stringify(repositoryFingerprint)},
    scenario: { reference: "resolve-question@2" },
    prompt: { exact: "resolve it", skills: [] },
    responseSchema: { type: "object" }
  }));
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

async function waitForOutput(
  child: ChildProcess,
  expected: string,
): Promise<void> {
  const output = child.stdout;
  if (output === null) throw new Error("Child stdout is unavailable");
  output.setEncoding("utf8");
  await new Promise<void>((resolve, reject) => {
    let source = "";
    const timeout = setTimeout(() => finish(() => reject(
      new Error(`Timed out waiting for child output: ${expected}`),
    )), ownerProcessReadyTimeoutMs);
    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      output.removeListener("data", onData);
      child.removeListener("close", onClose);
      callback();
    };
    const onData = (chunk: string) => {
      source += chunk;
      if (source.includes(expected)) finish(resolve);
    };
    const onClose = (status: number | null) => finish(() => reject(
      new Error(`Child exited with ${status} before writing: ${expected}`),
    ));
    output.on("data", onData);
    child.on("close", onClose);
  });
}

async function commandLog(log: string): Promise<unknown[]> {
  const source = await readFile(log, "utf8");
  return source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function waitForFile(file: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + ownerProcessReadyTimeoutMs;
  while (Date.now() < deadline) {
    try {
      await readFile(file);
      return;
    } catch {
      if (child.exitCode !== null) throw new Error(`Owner exited before acquiring the run lock: ${child.exitCode}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  child.kill("SIGTERM");
  throw new Error(`Timed out after ${ownerProcessReadyTimeoutMs} ms waiting for the owner process`);
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
