import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

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

export type AssignmentOutcome = {
  contract: "mdlm-next@2";
  outcome: "assignment";
  assignment: { id: string; packet: AssignmentPacket };
} & JsonObject;

export type MdlmNext = AssignmentOutcome | ({
  contract: "mdlm-next@2";
  outcome: "attention-required";
  assignment: { id: string; packet: AssignmentPacket };
} & JsonObject);
export type MdlmTerminalOutcome = ({
  contract: "mdlm-next@2";
  outcome: "profile-boundary-reached" | "lifecycle-complete" | "process-dead-end" | "invalid";
} & JsonObject);
export type MdlmOperatorOutcome = MdlmNext | MdlmTerminalOutcome;

export type AssignmentPacket = {
  contract: "mdlm-assignment-packet@3";
  assignment: JsonObject & { id: string };
  package: JsonObject;
  repository: JsonObject;
  scenario: JsonObject & { reference: string };
  responseSchema: JsonObject;
} & JsonObject;

export interface PreparedAssignmentSubmission {
  response: JsonObject;
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

export type AssignmentSubmission = JsonObject & {
  contract: "mdlm-submission-outcome@1";
  outcome: "accepted" | "rejected" | "settlement-required";
  assignment: { id: string };
};

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

  async next(): Promise<MdlmOperatorOutcome> {
    const result = await this.#invoke(["next", "--json"]);
    return parseNext(result.output);
  }

  prepareSubmission(response: JsonObject): PreparedAssignmentSubmission {
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    return { response, source, digest };
  }

  async submit(
    response: PreparedAssignmentSubmission,
    authority?: string,
    observer?: SubmissionAttemptObserver,
  ): Promise<AssignmentSubmission> {
    const digest = `sha256:${createHash("sha256").update(response.source).digest("hex")}`;
    if (digest !== response.digest) {
      throw new MdlmClientError("Prepared Assignment response digest does not match its exact source");
    }
    const result = await this.#invoke(
      ["scenario", "submit", "-", ...(authority === undefined ? [] : ["--authority", authority]), "--json"],
      response.source,
      observer,
    );
    return parseSubmission(result.output);
  }

  async settlement(identity: string): Promise<AssignmentSubmission> {
    const result = await this.#invoke(["scenario", "settlement", identity, "--json"]);
    return parseSubmission(result.output);
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

function parseNext(output: JsonObject): MdlmOperatorOutcome {
  expectLiteral(output, "contract", "mdlm-next@2");
  const outcome = expectString(output, "outcome");
  assertOperatorOutcome(outcome, output);
  if (outcome === "assignment" || outcome === "attention-required") {
    const assignment = expectObject(output, "assignment");
    const assignmentId = expectString(assignment, "id");
    const packet = parsePacket(expectObject(assignment, "packet"));
    if (packet.assignment.id !== assignmentId) {
      throw contractError("Assignment packet identity differs from its outcome", output);
    }
    if (!isDeepStrictEqual(packet.package, expectObject(output, "package")) ||
        !isDeepStrictEqual(packet.repository, expectObject(output, "repository"))) {
      throw contractError("Assignment packet boundary differs from its outcome", output);
    }
  }
  return output as MdlmOperatorOutcome;
}

function parsePacket(output: JsonObject): AssignmentPacket {
  expectLiteral(output, "contract", "mdlm-assignment-packet@3");
  expectString(expectObject(output, "assignment"), "id");
  expectObject(output, "package");
  expectObject(output, "repository");
  const scenario = expectObject(output, "scenario");
  expectString(scenario, "reference");
  expectObject(scenario, "prompt");
  expectArray(scenario, "skills");
  expectArray(output, "exactInputs");
  expectObject(output, "schemas");
  expectArray(output, "outputs");
  expectObject(output, "responseSchema");
  const scaffold = expectObject(output, "responseScaffold");
  expectLiteral(scaffold, "contract", "mdlm-assignment-response@2");
  if (expectString(scaffold, "assignment") !== expectString(expectObject(output, "assignment"), "id")) {
    throw contractError("Response scaffold names a different Assignment", output);
  }
  return output as AssignmentPacket;
}

function parseSubmission(output: JsonObject): AssignmentSubmission {
  expectLiteral(output, "contract", "mdlm-submission-outcome@1");
  expectString(expectObject(output, "assignment"), "id");
  const outcome = expectString(output, "outcome");
  if (!["accepted", "rejected", "settlement-required"].includes(outcome)) {
    throw contractError(`Unsupported submission outcome '${outcome}'`, output);
  }
  expectString(output, "responseDigest");
  if (outcome === "accepted" || outcome === "settlement-required") {
    const settlement = expectObject(output, "settlement");
    expectString(settlement, "assignment");
    expectString(settlement, "execution");
  }
  if (outcome === "accepted") expectObject(output, "receipt");
  if (outcome === "rejected") {
    if (!Array.isArray(output.diagnostics)) {
      throw contractError("Expected rejected diagnostics to be an array", output);
    }
    expectLiteral(output, "retryable", true);
    expectLiteral(output, "correctionConsumed", false);
  }
  if (outcome === "settlement-required") {
    const orchestration = expectObject(output, "orchestration");
    expectLiteral(orchestration, "action", "inspect-settlement");
    expectLiteral(orchestration, "replay", false);
  }
  return output as AssignmentSubmission;
}

function assertOperatorOutcome(outcome: string, output: JsonObject): void {
  if (![
    "assignment",
    "attention-required",
    "profile-boundary-reached",
    "lifecycle-complete",
    "process-dead-end",
    "invalid",
  ].includes(outcome)) {
    throw contractError(`Unsupported MDLM outcome '${outcome}'`, output);
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectObject(parent: JsonObject, key: string): JsonObject {
  const value = parent[key];
  if (!isObject(value)) throw contractError(`Expected '${key}' to be an object`, parent);
  return value;
}

function expectString(parent: JsonObject, key: string): string {
  const value = parent[key];
  if (typeof value !== "string") throw contractError(`Expected '${key}' to be a string`, parent);
  return value;
}

function expectArray(parent: JsonObject, key: string): JsonValue[] {
  const value = parent[key];
  if (!Array.isArray(value)) throw contractError(`Expected '${key}' to be an array`, parent);
  return value;
}

function expectLiteral(parent: JsonObject, key: string, expected: string | boolean): void {
  if (parent[key] !== expected) {
    throw contractError(`Expected '${key}' to equal ${JSON.stringify(expected)}`, parent);
  }
}

function contractError(message: string, output: JsonObject): MdlmClientError {
  return new MdlmClientError(`Invalid MDLM command contract: ${message}`, output);
}
