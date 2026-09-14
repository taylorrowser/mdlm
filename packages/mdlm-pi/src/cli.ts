#!/usr/bin/env node
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MdlmClient, MdlmClientError } from "./mdlm-client.js";
import {
  TerminalOperatorIO,
  type AttendedInputMode,
} from "./operator-io.js";
import {
  PiWorkRunner,
  PiWorkRunnerError,
  type ThinkingLevel,
} from "./pi-work-runner.js";
import { operationalFailureDocument } from "./operational-failure.js";
import { RunController } from "./run-controller.js";
import { RunJournal } from "./run-journal.js";
import { RunLock } from "./run-lock.js";

const exitStatus = {
  operationalFailure: 1,
  processDeadEnd: 2,
  invalid: 3,
  workStopped: 4,
  lockConflict: 5,
} as const;

async function main(arguments_: string[]): Promise<number> {
  const parsed = parseArguments(arguments_);
  if (parsed === null) {
    throw new CliUsageError(
      "Usage: mdlm-pi run <repository> [--mdlm <executable>] [--provider <provider>] [--model <model>] [--thinking <level>]",
    );
  }

  const repository = path.resolve(parsed.repository);
  const { gitDirectory, commonGitDirectory } = await gitDirectories(repository);
  const stateDirectory = path.join(gitDirectory, "mdlm-pi");
  const ownerDirectory = path.join(commonGitDirectory, "mdlm-pi-owner");
  const lock = await RunLock.acquire(ownerDirectory);
  try {
    const interruption = new AbortController();
    const inputMode = attendedInputMode(process.env.MDLM_PI_ATTENDED_INPUT_MODE);
    const io = new TerminalOperatorIO({
      ...(inputMode === undefined ? {} : { mode: inputMode }),
      signal: interruption.signal,
    });
    const worker = new PiWorkRunner({
      repository,
      workTimeoutMs: environmentInteger(
        "MDLM_PI_WORK_TIMEOUT_MS",
        15 * 60_000,
      ),
      providerRetries: environmentInteger("MDLM_PI_PROVIDER_RETRIES", 2),
      ...(parsed.provider ? { provider: parsed.provider } : {}),
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.thinking ? { thinkingLevel: parsed.thinking } : {}),
      onText: (text) => process.stdout.write(text),
    });
    const mdlm = new MdlmClient({
      repository,
      command: { program: parsed.mdlm },
      timeoutMs: environmentInteger("MDLM_PI_COMMAND_TIMEOUT_MS", 30_000),
      attemptDirectory: path.join(stateDirectory, "attempts"),
    });
    let interruptedBy: NodeJS.Signals | undefined;
    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) {
      const handler = () => {
        interruptedBy = signal;
        interruption.abort();
        mdlm.abort();
        void worker.dispose();
      };
      handlers.set(signal, handler);
      process.once(signal, handler);
    }
    try {
      const controller = new RunController({
        mdlm,
        worker,
        io,
        journal: new RunJournal(stateDirectory),
        signal: interruption.signal,
      });
      try {
        const stopped = await controller.run();
        if (stopped.successful) return 0;
        if (stopped.status === "process-dead-end") return exitStatus.processDeadEnd;
        if (stopped.status === "invalid") return exitStatus.invalid;
        return exitStatus.workStopped;
      } catch (error) {
        if (interruptedBy === undefined) throw error;
        io.stopped("interrupted", { signal: interruptedBy });
        return signalExitStatus(interruptedBy);
      }
    } finally {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
      mdlm.abort();
      await worker.dispose();
    }
  } finally {
    await lock.release();
  }
}

async function gitDirectories(repository: string): Promise<{
  gitDirectory: string;
  commonGitDirectory: string;
}> {
  const run = promisify(execFile);
  const options = { cwd: repository, encoding: "utf8" as const };
  const [git, common] = await Promise.all([
    run("git", ["rev-parse", "--path-format=absolute", "--git-dir"], options),
    run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], options),
  ]);
  return {
    gitDirectory: git.stdout.trim(),
    commonGitDirectory: common.stdout.trim(),
  };
}

function parseArguments(arguments_: string[]): {
  repository: string;
  mdlm: string;
  provider?: string;
  model?: string;
  thinking?: ThinkingLevel;
} | null {
  if (arguments_[0] !== "run" || arguments_[1] === undefined) return null;
  const parsed: {
    repository: string;
    mdlm: string;
    provider?: string;
    model?: string;
    thinking?: ThinkingLevel;
  } = { repository: arguments_[1], mdlm: "mdlm" };
  for (let index = 2; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (value === undefined) return null;
    if (option === "--mdlm") parsed.mdlm = value;
    else if (option === "--provider") parsed.provider = value;
    else if (option === "--model") parsed.model = value;
    else if (option === "--thinking" && isThinkingLevel(value)) parsed.thinking = value;
    else return null;
  }
  return parsed;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value);
}

function signalExitStatus(signal: NodeJS.Signals): number {
  if (signal === "SIGHUP") return 129;
  if (signal === "SIGINT") return 130;
  return 143;
}

function attendedInputMode(value: string | undefined): AttendedInputMode | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    value === "legacy-eof"
    || value === "framed-v1"
    || value === "terminal-delimiter"
  ) {
    return value;
  }
  throw new Error(
    "MDLM_PI_ATTENDED_INPUT_MODE must be legacy-eof, framed-v1, or terminal-delimiter",
  );
}

function environmentInteger(name: string, fallback: number): number {
  const source = process.env[name];
  if (source === undefined) return fallback;
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

class CliUsageError extends Error {
  readonly code = "CLI_USAGE_INVALID";
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const lockConflict = error instanceof Error && error.name === "RunLockError";
  const code = error instanceof PiWorkRunnerError
    ? error.code
    : error instanceof CliUsageError
      ? error.code
      : error instanceof MdlmClientError
        ? "MDLM_CLIENT_ERROR"
        : "MDLM_PI_OPERATION_FAILED";
  const document = lockConflict
    ? {
        status: "lock-conflict",
        error: error instanceof Error ? error.message : String(error),
      }
    : operationalFailureDocument({
        code,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof PiWorkRunnerError && error.telemetry !== undefined
          ? { telemetry: error.telemetry }
          : {}),
      });
  process.stderr.write(`${JSON.stringify(document, null, 2)}\n`);
  process.exitCode = lockConflict
    ? exitStatus.lockConflict
    : exitStatus.operationalFailure;
}
