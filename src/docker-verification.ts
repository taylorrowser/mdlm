import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface DockerVerificationInput {
  repositoryPath: string;
  sourceCommit: string;
  image: string;
  command: string[];
  scriptPath: string;
  timeoutMs?: number;
}

export interface VerificationSourceIdentity {
  sourceCommit: string;
  sourceTree: string;
  scriptSha256: string;
}

export interface DockerVerificationResult {
  sourceCommit: string;
  sourceTree: string | null;
  scriptSha256: string | null;
  image: string;
  imageDigest: string | null;
  imageId: string | null;
  command: string[];
  scriptPath: string;
  stdoutBase64: string;
  stderrBase64: string;
  exitCode: number | null;
  outcome: "pass" | "fail" | "error";
  started: boolean;
  phase: "source" | "environment" | "execution";
  diagnostic?: string;
  startedAt: string;
  finishedAt: string;
}

interface CommandResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
  problem?: string;
}

// Docker control messages are never substituted for the verification script's
// streams. This helper also bounds a script that hangs or emits endless output.
function execute(file: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let problem: string | undefined;
    const stop = (reason: string): void => {
      problem ??= reason;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("Execution timed out."), timeoutMs);
    const collect = (target: Buffer[], chunk: Buffer): void => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) stop("Execution output exceeded 16 MiB; capture is incomplete.");
      else target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.on("error", (error) => { problem ??= error.message; });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (signal) problem ??= `Execution terminated by ${signal}.`;
      resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode,
        ...(problem === undefined ? {} : { problem }) });
    });
  });
}

async function checked(file: string, args: string[], timeoutMs = 30_000): Promise<Buffer> {
  const result = await execute(file, args, timeoutMs);
  if (result.problem || result.exitCode !== 0) {
    throw new Error(result.problem ?? `${file} failed: ${result.stderr.toString("utf8").trim()}`);
  }
  return result.stdout;
}

/** Authenticate committed bytes without consulting the product working tree. */
export async function authenticateVerificationSource(
  input: Pick<DockerVerificationInput, "repositoryPath" | "sourceCommit" | "scriptPath">,
): Promise<VerificationSourceIdentity> {
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit)) throw new Error("Verification source must name a full Git commit.");
  if (!input.scriptPath || input.scriptPath.startsWith("/") || input.scriptPath.includes("\\")
    || input.scriptPath.split("/").some((part) => !part || part === "." || part === "..")
    || input.scriptPath.includes("\0")) {
    throw new Error("Verification script must be a relative path within the committed product.");
  }
  const git = (args: string[]): Promise<Buffer> => checked("git", ["-C", input.repositoryPath, ...args]);
  const sourceCommit = (await git(["rev-parse", "--verify", `${input.sourceCommit}^{commit}`])).toString("utf8").trim();
  if (sourceCommit !== input.sourceCommit) throw new Error("Verification source identity changed.");
  const sourceTree = (await git(["rev-parse", `${sourceCommit}^{tree}`])).toString("utf8").trim();
  const entry = (await git(["ls-tree", "-z", sourceCommit, "--", input.scriptPath])).toString("utf8");
  const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(entry);
  if (!match || match[3] !== input.scriptPath) throw new Error("Verification script must be a committed regular file.");
  const script = await git(["cat-file", "blob", match[2]!]);
  return { sourceCommit, sourceTree, scriptSha256: createHash("sha256").update(script).digest("hex") };
}

/** Run one exact script in one disposable Docker container. Assignment receipts
 * and retry policy belong to the caller; this function never retries execution. */
export async function executeDockerVerification(input: DockerVerificationInput): Promise<DockerVerificationResult> {
  const result: DockerVerificationResult = {
    sourceCommit: input.sourceCommit, sourceTree: null, scriptSha256: null,
    image: input.image, imageDigest: null, imageId: null,
    command: Array.isArray(input.command) ? [...input.command] : [], scriptPath: input.scriptPath,
    stdoutBase64: "", stderrBase64: "", exitCode: null, outcome: "error", started: false,
    phase: "source",
    startedAt: new Date().toISOString(), finishedAt: "",
  };
  let directory: string | undefined;
  const container = `mdlm-verification-${randomUUID()}`;
  let containerAttempted = false;
  let containerCreated = false;
  try {
    const imageMatch = /^[^\s@]+@sha256:([a-f0-9]{64})$/.exec(input.image);
    if (!imageMatch) throw new Error("Verification image must be pinned with @sha256:<64 lowercase hex digits>.");
    result.imageDigest = `sha256:${imageMatch[1]}`;
    if (!Array.isArray(input.command) || input.command.length === 0
      || input.command.some((part) => typeof part !== "string" || part.includes("\0")) || !input.command[0]) {
      throw new Error("Verification command must be a nonempty argv array.");
    }
    const timeoutMs = input.timeoutMs ?? 60_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error("Verification timeout must be between 1 and 300000 milliseconds.");
    const source = await authenticateVerificationSource(input);
    Object.assign(result, source);
    directory = await mkdtemp(join(tmpdir(), "mdlm-verification-"));
    const archive = await checked("git", ["-C", input.repositoryPath, "archive", "--format=tar", source.sourceCommit]);
    const archivePath = join(directory, "source.tar");
    await writeFile(archivePath, archive);
    const snapshot = join(directory, "source");
    await mkdir(snapshot);
    await checked("tar", ["-xf", archivePath, "-C", snapshot, "--no-same-owner"]);
    await chmod(snapshot, 0o755);
    const archivedScriptHash = createHash("sha256").update(await readFile(join(snapshot, input.scriptPath))).digest("hex");
    if (archivedScriptHash !== source.scriptSha256) throw new Error("Git archive changed the verification script bytes.");

    result.phase = "environment";
    containerAttempted = true;
    await checked("docker", ["create", "--name", container, "--network", "none", "--read-only",
      "--user", "65534:65534", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--pids-limit", "128", "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
      "--mount", `type=bind,source=${snapshot},target=/workspace,readonly`,
      "--workdir", "/workspace", "--entrypoint", input.command[0], input.image, ...input.command.slice(1)], timeoutMs);
    containerCreated = true;
    result.imageId = (await checked("docker", ["inspect", "--format", "{{.Image}}", container])).toString("utf8").trim();

    // Start detached: an unsuccessful start is an environment error. Logs from
    // this container, rather than Docker's own diagnostics, are the raw streams.
    await checked("docker", ["start", container], timeoutMs);
    result.started = true;
    result.phase = "execution";
    const wait = await execute("docker", ["wait", container], timeoutMs);
    if (wait.problem || wait.exitCode !== 0) {
      result.diagnostic = wait.problem ?? `Docker wait failed: ${wait.stderr.toString("utf8").trim()}`;
      await checked("docker", ["kill", container]).catch(() => undefined);
    }
    const logs = await execute("docker", ["logs", container], 30_000);
    result.stdoutBase64 = logs.stdout.toString("base64");
    result.stderrBase64 = logs.stderr.toString("base64");
    if (logs.problem || logs.exitCode !== 0) result.diagnostic ??= logs.problem ?? "Docker log capture failed.";
    const state = JSON.parse((await checked("docker", ["inspect", "--format", "{{json .State}}", container])).toString("utf8")) as {
      Running: boolean; ExitCode: number; Error: string; OOMKilled: boolean;
    };
    if (!state.Running && Number.isInteger(state.ExitCode)) result.exitCode = state.ExitCode;
    if (state.Error || state.OOMKilled || state.Running) result.diagnostic ??= state.Error || "Container did not finish normally.";
    if (!result.diagnostic) {
      result.outcome = result.exitCode === 0 ? "pass" : result.exitCode === 1 ? "fail" : "error";
      if (result.outcome === "error") result.diagnostic = `Verification script exited with ${result.exitCode}; only 0 (pass) and 1 (assertion failure) are valid script outcomes.`;
    }
  } catch (error) {
    result.outcome = "error";
    result.diagnostic = error instanceof Error ? error.message : String(error);
  } finally {
    // Attempt by name even when create timed out after the daemon accepted it.
    if (containerAttempted) {
      const cleanup = await execute("docker", ["rm", "--force", "--volumes", container], 30_000);
      if (containerCreated && (cleanup.problem || cleanup.exitCode !== 0)) {
        result.outcome = "error";
        result.diagnostic = `${result.diagnostic ? `${result.diagnostic} ` : ""}Container cleanup failed: ${cleanup.problem ?? cleanup.stderr.toString("utf8").trim()}`;
      }
    }
    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
        result.outcome = "error";
        result.diagnostic = `${result.diagnostic ? `${result.diagnostic} ` : ""}Snapshot cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      });
    }
    result.finishedAt = new Date().toISOString();
  }
  return result;
}
