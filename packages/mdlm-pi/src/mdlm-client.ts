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

export interface MaterializedExecution {
  id: string;
  scenario: string;
  status: "completed";
}

export type AssignmentOutcome = {
  contract: "mdlm-next@1";
  ok: boolean;
  command: "next";
  outcome: "assignment";
  assignment: { id: string };
  materializedExecutions: MaterializedExecution[];
} & JsonObject;

export type MdlmNext = AssignmentOutcome | ({
  contract: "mdlm-next@1";
  ok: boolean;
  command: "next";
  outcome: "publication-required" | "attention-required" | "profile-boundary-reached" | "lifecycle-complete" | "process-dead-end" | "invalid";
  materializedExecutions: MaterializedExecution[];
} & JsonObject);

export type MdlmStatus = {
  contract: "mdlm-status@1";
  ok: boolean;
  command: "status";
  currentOutcome: JsonObject & { outcome: string };
  recentTransaction: JsonObject & { available: boolean };
} & JsonObject;

export type AssignmentState = ({
  contract: "mdlm-assignment-state@1";
  ok: boolean;
  command: "assignment.show";
  assignment: { id: string };
  selected: false;
} | {
  contract: "mdlm-assignment-state@1";
  ok: boolean;
  command: "assignment.show";
  assignment: { id: string };
  selected: true;
  package: JsonObject;
  repository: JsonObject;
  scenarioReference: string;
  disposition: "active" | "abandoned" | "exhausted" | "stale";
  retryAvailability: JsonObject;
  malformedResponses: JsonObject[];
  response?: JsonObject;
  terminalDiagnostics?: JsonObject[];
}) & JsonObject;

export type AssignmentPacket = {
  contract: "mdlm-assignment-packet@2";
  ok: true;
  command: "scenario.prepare";
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
  ok: boolean;
  command: "scenario.submit";
  contract: "mdlm-scenario-execution@4" | "mdlm-assignment-disposition@1";
};

export type DoctorResult = JsonObject & {
  ok: boolean;
  command: "doctor";
};

export type ScenarioExecution = JsonObject & {
  ok: true;
  command: "scenario.execution.show";
  execution: JsonObject & {
    contract: "mdlm-scenario-execution@4";
    id: string;
    status: string;
  };
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

  async status(): Promise<MdlmStatus> {
    const result = await this.#invoke(["status", "--json"]);
    return parseStatus(result.output);
  }

  async next(): Promise<MdlmNext> {
    const result = await this.#invoke(["next", "--json"]);
    return parseNext(result.output);
  }

  async assignment(assignmentId: string): Promise<AssignmentState> {
    const result = await this.#invoke([
      "assignment",
      "show",
      assignmentId,
      "--json",
    ]);
    return parseAssignmentState(result.output);
  }

  async prepare(assignmentId: string): Promise<AssignmentPacket> {
    const result = await this.#invoke([
      "scenario",
      "prepare",
      assignmentId,
      "--json",
    ]);
    if (result.exitCode !== 0) {
      throw new MdlmClientError("MDLM could not prepare the Assignment", result.output);
    }
    return parsePacket(result.output);
  }

  prepareSubmission(response: JsonObject): PreparedAssignmentSubmission {
    const source = `${JSON.stringify(response)}\n`;
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
    return { response, source, digest };
  }

  async submit(
    response: PreparedAssignmentSubmission,
    observer?: SubmissionAttemptObserver,
  ): Promise<AssignmentSubmission> {
    const digest = `sha256:${createHash("sha256").update(response.source).digest("hex")}`;
    if (digest !== response.digest) {
      throw new MdlmClientError("Prepared Assignment response digest does not match its exact source");
    }
    const result = await this.#invoke(
      ["scenario", "submit", "-", "--json"],
      response.source,
      observer,
    );
    return parseSubmission(result.output);
  }

  async doctor(): Promise<DoctorResult> {
    const result = await this.#invoke(["doctor", "--json"]);
    const output = result.output;
    expectLiteral(output, "command", "doctor");
    expectBoolean(output, "ok");
    return output as DoctorResult;
  }

  async execution(executionId: string): Promise<ScenarioExecution> {
    const result = await this.#invoke([
      "scenario",
      "execution",
      "show",
      executionId,
      "--json",
    ]);
    if (result.exitCode !== 0) {
      throw new MdlmClientError("MDLM could not inspect the Scenario execution", result.output);
    }
    const output = result.output;
    expectLiteral(output, "command", "scenario.execution.show");
    expectLiteral(output, "ok", true);
    const execution = expectObject(output, "execution");
    expectLiteral(execution, "contract", "mdlm-scenario-execution@4");
    expectString(execution, "id");
    expectString(execution, "status");
    return output as ScenarioExecution;
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

function parseStatus(output: JsonObject): MdlmStatus {
  expectLiteral(output, "command", "status");
  expectLiteral(output, "contract", "mdlm-status@1");
  expectBoolean(output, "ok");
  const currentOutcome = expectObject(output, "currentOutcome");
  const outcome = expectString(currentOutcome, "outcome");
  assertOperatorOutcome(outcome, output);
  if (outcome === "assignment" || outcome === "attention-required") {
    const assignment = expectObject(currentOutcome, "assignment");
    const allocation = expectString(assignment, "allocation");
    if (allocation !== "active" && allocation !== "not-allocated") {
      throw contractError(`Unsupported Assignment allocation '${allocation}'`, output);
    }
    if (allocation === "active" || assignment.id !== undefined) {
      expectString(assignment, "id");
    }
  }
  const recentTransaction = expectObject(output, "recentTransaction");
  const available = expectBoolean(recentTransaction, "available");
  if (available) expectString(recentTransaction, "id");
  return output as MdlmStatus;
}

function parseNext(output: JsonObject): MdlmNext {
  expectLiteral(output, "command", "next");
  expectLiteral(output, "contract", "mdlm-next@1");
  expectBoolean(output, "ok");
  const outcome = expectString(output, "outcome");
  assertNextOutcome(outcome, output);
  if (outcome === "assignment" || outcome === "attention-required") {
    expectString(expectObject(output, "assignment"), "id");
  }
  if (!Array.isArray(output.materializedExecutions)) {
    throw contractError("Expected 'materializedExecutions' to be an array", output);
  }
  for (const [index, item] of output.materializedExecutions.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw contractError(`Expected materializedExecutions[${index}] to be an object`, output);
    }
    const execution = item;
    expectString(execution, "id");
    expectString(execution, "scenario");
    expectLiteral(execution, "status", "completed");
  }
  return output as MdlmNext;
}

function parseAssignmentState(output: JsonObject): AssignmentState {
  expectLiteral(output, "command", "assignment.show");
  expectLiteral(output, "contract", "mdlm-assignment-state@1");
  expectBoolean(output, "ok");
  expectString(expectObject(output, "assignment"), "id");
  const selected = expectBoolean(output, "selected");
  if (selected) {
    expectObject(output, "package");
    expectObject(output, "repository");
    expectString(output, "scenarioReference");
    const disposition = expectString(output, "disposition");
    if (!["active", "abandoned", "exhausted", "stale"].includes(disposition)) {
      throw contractError(`Unsupported Assignment disposition '${disposition}'`, output);
    }
    expectObject(output, "retryAvailability");
    if (!Array.isArray(output.malformedResponses)) {
      throw contractError("Expected 'malformedResponses' to be an array", output);
    }
  }
  return output as AssignmentState;
}

function parsePacket(output: JsonObject): AssignmentPacket {
  expectLiteral(output, "command", "scenario.prepare");
  expectLiteral(output, "contract", "mdlm-assignment-packet@2");
  expectLiteral(output, "ok", true);
  expectString(expectObject(output, "assignment"), "id");
  expectObject(output, "package");
  expectObject(output, "repository");
  expectString(expectObject(output, "scenario"), "reference");
  expectObject(output, "responseSchema");
  return output as AssignmentPacket;
}

function parseSubmission(output: JsonObject): AssignmentSubmission {
  expectLiteral(output, "command", "scenario.submit");
  expectBoolean(output, "ok");
  const contract = expectString(output, "contract");
  if (contract !== "mdlm-scenario-execution@4" && contract !== "mdlm-assignment-disposition@1") {
    throw contractError(`Unsupported Scenario submission contract '${contract}'`, output);
  }
  if (contract === "mdlm-scenario-execution@4") {
    const execution = expectObject(output, "execution");
    expectLiteral(execution, "contract", "mdlm-scenario-execution@4");
    expectString(execution, "id");
    expectString(execution, "status");
  } else {
    expectString(expectObject(output, "assignment"), "id");
    const disposition = expectString(output, "disposition");
    if (!["correction-required", "abandoned", "exhausted", "stale"].includes(disposition)) {
      throw contractError(`Unsupported Assignment submission disposition '${disposition}'`, output);
    }
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

function assertNextOutcome(outcome: string, output: JsonObject): void {
  if (outcome !== "publication-required") assertOperatorOutcome(outcome, output);
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

function expectBoolean(parent: JsonObject, key: string): boolean {
  const value = parent[key];
  if (typeof value !== "boolean") throw contractError(`Expected '${key}' to be a boolean`, parent);
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
