#!/usr/bin/env node
import path from "node:path";
import { GitPublisher } from "./git-publisher.js";
import { MdlmClient, MdlmClientError } from "./mdlm-client.js";
import { TerminalOperatorIO } from "./operator-io.js";
import { PiAssignmentRunner, type ThinkingLevel } from "./pi-assignment-runner.js";
import { RunController } from "./run-controller.js";
import { RunJournal } from "./run-journal.js";
import { RunLock } from "./run-lock.js";

const exitStatus = {
  operationalFailure: 1,
  processDeadEnd: 2,
  invalid: 3,
  assignmentStopped: 4,
  lockConflict: 5,
} as const;

async function main(arguments_: string[]): Promise<number> {
  const parsed = parseArguments(arguments_);
  if (parsed === null) {
    process.stderr.write("Usage: mdlm-pi run <repository> [--mdlm <executable>] [--provider <provider>] [--model <model>] [--thinking <level>]\n");
    return exitStatus.operationalFailure;
  }

  const repository = path.resolve(parsed.repository);
  const git = new GitPublisher({ repository });
  const stateDirectory = path.join(await git.gitDirectory(), "mdlm-pi");
  const ownerDirectory = path.join(await git.commonGitDirectory(), "mdlm-pi-owner");
  const lock = await RunLock.acquire(ownerDirectory);
  try {
    const io = new TerminalOperatorIO();
    const assignments = new PiAssignmentRunner({
      repository,
      assignmentTimeoutMs: environmentInteger(
        "MDLM_PI_ASSIGNMENT_TIMEOUT_MS",
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
    const interruption = new AbortController();
    let interruptedBy: NodeJS.Signals | undefined;
    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) {
      const handler = () => {
        interruptedBy = signal;
        interruption.abort();
        mdlm.abort();
        void assignments.dispose();
      };
      handlers.set(signal, handler);
      process.once(signal, handler);
    }
    try {
      const controller = new RunController({
        mdlm,
        assignments,
        io,
        git,
        journal: new RunJournal(stateDirectory),
        signal: interruption.signal,
      });
      try {
        const stopped = await controller.run();
        if (stopped.successful) return 0;
        if (stopped.status === "process-dead-end") return exitStatus.processDeadEnd;
        if (stopped.status === "invalid") return exitStatus.invalid;
        return exitStatus.assignmentStopped;
      } catch (error) {
        if (interruptedBy === undefined) throw error;
        io.stopped("interrupted", { signal: interruptedBy });
        return signalExitStatus(interruptedBy);
      }
    } finally {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
      mdlm.abort();
      await assignments.dispose();
    }
  } finally {
    await lock.release();
  }
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

function environmentInteger(name: string, fallback: number): number {
  const source = process.env[name];
  if (source === undefined) return fallback;
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const lockConflict = error instanceof Error && error.name === "RunLockError";
  process.stderr.write(`${JSON.stringify({
    status: lockConflict ? "lock-conflict" : "operational-failure",
    error: error instanceof Error ? error.message : String(error),
    ...(error instanceof MdlmClientError && error.details !== undefined
      ? { details: error.details }
      : {}),
  }, null, 2)}\n`);
  process.exitCode = lockConflict
    ? exitStatus.lockConflict
    : exitStatus.operationalFailure;
}
