import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface MdlmCommand {
  program: string;
  arguments?: readonly string[];
}

export interface MdlmClientOptions {
  repository: string;
  command?: MdlmCommand;
  timeoutMs?: number;
  maxOutputBytes?: number;
  attemptDirectory?: string;
}

export interface PreparedProposal {
  proposal: JsonObject;
  source: string;
  digest: `sha256:${string}`;
}

export interface SubmissionProcess {
  id: string;
  pid: number;
  stdoutPath: string;
  stderrPath: string;
}

export interface SubmissionAttemptObserver {
  started(process: SubmissionProcess): Promise<void>;
}

export class MdlmClientError extends Error {
  constructor(
    message: string,
    readonly details?: JsonObject,
  ) {
    super(message);
    this.name = "MdlmClientError";
  }
}

interface InvocationResult {
  exitCode: number;
  output: JsonObject;
}

/**
 * Process adapter for MDLM's public, versioned JSON command contracts.
 *
 * The controller never needs to know about subprocess framing, exit-code
 * conventions, output bounds, or contract-version checks.
 */
export class MdlmClient {
  readonly #repository: string;
  readonly #command: Required<MdlmCommand>;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;
  readonly #attemptDirectory: string | undefined;
  readonly #activeTerminators = new Set<() => void>();

  constructor(options: MdlmClientOptions) {
    this.#repository = options.repository;
    this.#command = {
      program: options.command?.program ?? "mdlm",
      arguments: [...(options.command?.arguments ?? [])],
    };
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxOutputBytes = options.maxOutputBytes ?? 10 * 1024 * 1024;
    this.#attemptDirectory = options.attemptDirectory;
  }

  abort(): void {
    for (const terminate of this.#activeTerminators) terminate();
  }

  identity(): JsonObject {
    return {
      repository: this.#repository,
      command: {
        program: this.#command.program,
        arguments: [...this.#command.arguments],
      },
    };
  }

  async discover(): Promise<JsonObject> {
    return this.#read(["expectations", "--json"]);
  }

  async guidance(action: string, subject?: string): Promise<JsonObject> {
    return this.#read(["expectations", "show", action, ...(subject ? [subject] : []), "--json"]);
  }

  prepareSubmission(proposal: JsonObject): PreparedProposal {
    const source = `${JSON.stringify(proposal)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    return { proposal, source, digest };
  }

  async submit(proposal: PreparedProposal, authority?: string): Promise<JsonObject> {
    const digest = `sha256:${createHash("sha256").update(proposal.source).digest("hex")}`;
    if (digest !== proposal.digest) throw new MdlmClientError("Prepared proposal digest does not match its exact source");
    const result = await this.#invoke(
      ["proposal", "submit", "-", ...(authority ? ["--authority", authority] : []), "--json"], proposal.source,
    );
    return result.output;
  }

  async settlement(operation: string): Promise<JsonObject> {
    return this.#read(["proposal", "settlement", operation, "--json"]);
  }

  async execute(subject: string, operation: string): Promise<JsonObject> {
    return this.#read(["execution", "run", subject, operation, "--json"]);
  }

  async executionSettlement(operation: string): Promise<JsonObject> {
    return this.#read(["execution", "settlement", operation, "--json"]);
  }

  async #read(args: string[]): Promise<JsonObject> {
    const result = await this.#invoke(args);
    if (result.exitCode !== 0) throw new MdlmClientError("MDLM command failed", result.output);
    return result.output;
  }

  async #invoke(
    arguments_: readonly string[],
    standardInput?: string,
    observer?: SubmissionAttemptObserver,
  ): Promise<InvocationResult> {
    const durable = observer === undefined
      ? undefined
      : await this.#prepareAttemptFiles();
    const child = spawn(
      this.#command.program,
      [...this.#command.arguments, ...arguments_],
      {
        cwd: this.#repository,
        detached: process.platform !== "win32",
        stdio: [
          standardInput === undefined ? "ignore" : "pipe",
          "pipe",
          "pipe",
        ],
      },
    );

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let failure: Error | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const terminate = () => {
      if (child.pid === undefined || child.killed) return;
      try {
        if (process.platform === "win32") child.kill("SIGTERM");
        else process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      forceKillTimer = setTimeout(() => {
        if (child.pid === undefined || child.exitCode !== null) return;
        try {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, 1_000);
      forceKillTimer.unref();
    };

    const timeout = setTimeout(() => {
      failure = new MdlmClientError(
        `MDLM command exceeded ${this.#timeoutMs}ms`,
        { arguments: [...arguments_] },
      );
      terminate();
    }, this.#timeoutMs);
    timeout.unref();

    this.#activeTerminators.add(terminate);
    let durableWrites = Promise.resolve();
    const collect = (
      target: Buffer[],
      file: Awaited<ReturnType<typeof open>> | undefined,
    ) => (chunk: Buffer) => {
      const previousBytes = outputBytes;
      outputBytes += chunk.byteLength;
      const retained = previousBytes >= this.#maxOutputBytes
        ? Buffer.alloc(0)
        : chunk.subarray(0, this.#maxOutputBytes - previousBytes);
      if (retained.byteLength > 0) {
        if (file === undefined) target.push(retained);
        else durableWrites = durableWrites.then(async () => { await file.write(retained); });
      }
      if (outputBytes > this.#maxOutputBytes && failure === undefined) {
        failure = new MdlmClientError(
          `MDLM command exceeded ${this.#maxOutputBytes} output bytes`,
          { arguments: [...arguments_] },
        );
        terminate();
      }
    };
    child.stdout?.on("data", collect(stdout, durable?.stdout));
    child.stderr?.on("data", collect(stderr, durable?.stderr));

    const completed = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });

    let observerError: unknown;
    if (durable !== undefined) {
      if (child.pid === undefined) {
        terminate();
        observerError = new MdlmClientError("MDLM child process did not expose a PID");
      } else {
        try {
          await observer!.started({
            id: durable.id,
            pid: child.pid,
            stdoutPath: durable.stdoutPath,
            stderrPath: durable.stderrPath,
          });
        } catch (error) {
          observerError = error;
          terminate();
        }
      }
    }

    if (standardInput !== undefined && observerError === undefined) {
      child.stdin?.end(standardInput);
    } else if (observerError !== undefined) {
      child.stdin?.destroy();
    }

    let exitCode: number;
    try {
      exitCode = await completed;
    } catch (error) {
      throw new MdlmClientError(
        `Could not start MDLM command: ${error instanceof Error ? error.message : String(error)}`,
        { arguments: [...arguments_] },
      );
    } finally {
      clearTimeout(timeout);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      this.#activeTerminators.delete(terminate);
      if (durable !== undefined) {
        await durableWrites;
        await Promise.all([durable.stdout.sync(), durable.stderr.sync()]);
        await Promise.all([durable.stdout.close(), durable.stderr.close()]);
      }
    }
    if (observerError !== undefined) throw observerError;

    if (durable !== undefined) {
      const [durableStdout, durableStderr] = await Promise.all([
        readFile(durable.stdoutPath),
        readFile(durable.stderrPath),
      ]);
      stdout.push(durableStdout);
      stderr.push(durableStderr);
      outputBytes = durableStdout.byteLength + durableStderr.byteLength;
      if (outputBytes > this.#maxOutputBytes && failure === undefined) {
        failure = new MdlmClientError(
          `MDLM command exceeded ${this.#maxOutputBytes} output bytes`,
          { arguments: [...arguments_] },
        );
      }
    }
    if (failure !== undefined) throw failure;

    const outputText = Buffer.concat(stdout).toString("utf8");
    let output: unknown;
    try {
      output = JSON.parse(outputText);
    } catch {
      throw new MdlmClientError("MDLM command did not return one JSON document", {
        arguments: [...arguments_],
        exitCode,
        stdout: outputText,
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    }
    if (!isObject(output)) {
      throw new MdlmClientError("MDLM command returned a non-object JSON document", {
        arguments: [...arguments_],
        exitCode,
      });
    }
    return { exitCode, output };
  }

  async #prepareAttemptFiles(): Promise<{
    id: string;
    stdoutPath: string;
    stderrPath: string;
    stdout: Awaited<ReturnType<typeof open>>;
    stderr: Awaited<ReturnType<typeof open>>;
  }> {
    if (this.#attemptDirectory === undefined) {
      throw new MdlmClientError("Durable submission attempts require an attempt directory");
    }
    await mkdir(this.#attemptDirectory, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const stdoutPath = path.join(this.#attemptDirectory, `${id}.stdout`);
    const stderrPath = path.join(this.#attemptDirectory, `${id}.stderr`);
    const stdout = await open(stdoutPath, "wx", 0o600);
    try {
      const stderr = await open(stderrPath, "wx", 0o600);
      return { id, stdoutPath, stderrPath, stdout, stderr };
    } catch (error) {
      await stdout.close();
      throw error;
    }
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
