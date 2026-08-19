import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

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
  outcome: "attention-required" | "profile-boundary-reached" | "lifecycle-complete" | "process-dead-end" | "invalid";
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
  scenario: JsonObject & { reference: string };
  responseSchema: JsonObject;
} & JsonObject;

export interface PreparedAssignmentSubmission {
  response: JsonObject;
  source: string;
  digest: `sha256:${string}`;
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

  constructor(options: MdlmClientOptions) {
    this.#repository = options.repository;
    this.#command = {
      program: options.command?.program ?? "mdlm",
      arguments: [...(options.command?.arguments ?? [])],
    };
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxOutputBytes = options.maxOutputBytes ?? 10 * 1024 * 1024;
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

  async submit(response: PreparedAssignmentSubmission): Promise<AssignmentSubmission> {
    const digest = `sha256:${createHash("sha256").update(response.source).digest("hex")}`;
    if (digest !== response.digest) {
      throw new MdlmClientError("Prepared Assignment response digest does not match its exact source");
    }
    const result = await this.#invoke(
      ["scenario", "submit", "-", "--json"],
      response.source,
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

  async #invoke(arguments_: readonly string[], standardInput?: string): Promise<InvocationResult> {
    const child = spawn(
      this.#command.program,
      [...this.#command.arguments, ...arguments_],
      {
        cwd: this.#repository,
        detached: process.platform !== "win32",
        stdio: [standardInput === undefined ? "ignore" : "pipe", "pipe", "pipe"],
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

    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > this.#maxOutputBytes && failure === undefined) {
        failure = new MdlmClientError(
          `MDLM command exceeded ${this.#maxOutputBytes} output bytes`,
          { arguments: [...arguments_] },
        );
        terminate();
        return;
      }
      target.push(chunk);
    };
    child.stdout?.on("data", collect(stdout));
    child.stderr?.on("data", collect(stderr));

    const completed = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });

    if (standardInput !== undefined) child.stdin?.end(standardInput);

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
}

function parseStatus(output: JsonObject): MdlmStatus {
  expectLiteral(output, "command", "status");
  expectLiteral(output, "contract", "mdlm-status@1");
  expectBoolean(output, "ok");
  const currentOutcome = expectObject(output, "currentOutcome");
  expectString(currentOutcome, "outcome");
  const recentTransaction = expectObject(output, "recentTransaction");
  expectBoolean(recentTransaction, "available");
  return output as MdlmStatus;
}

function parseNext(output: JsonObject): MdlmNext {
  expectLiteral(output, "command", "next");
  expectLiteral(output, "contract", "mdlm-next@1");
  expectBoolean(output, "ok");
  const outcome = expectString(output, "outcome");
  const outcomes = new Set([
    "assignment",
    "attention-required",
    "profile-boundary-reached",
    "lifecycle-complete",
    "process-dead-end",
    "invalid",
  ]);
  if (!outcomes.has(outcome)) {
    throw contractError(`Unsupported MDLM outcome '${outcome}'`, output);
  }
  if (outcome === "assignment") {
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
  return output as AssignmentSubmission;
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
