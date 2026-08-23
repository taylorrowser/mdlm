import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const timeoutExitStatus = 124;

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForGroupExit(pid) {
  while (groupExists(pid)) await delay(20);
}

async function terminateRemainingGroup(pid, terminationGrace) {
  if (!groupExists(pid)) return;
  signalGroup(pid, "SIGTERM");
  await delay(terminationGrace);
  if (groupExists(pid)) signalGroup(pid, "SIGKILL");
  await waitForGroupExit(pid);
}

export function launchInProcessGroup(command, args, options = {}) {
  if (!("darwin" === process.platform || "linux" === process.platform)) {
    throw new Error(`Process-group execution is unsupported on ${process.platform}`);
  }
  const terminationGrace = options.terminationGrace ?? 2_000;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.environment },
    detached: true,
    stdio: options.stdio ?? ["ignore", "inherit", "inherit"],
  });

  let settled = false;
  let resolveChild;
  const childClosed = new Promise((resolve) => { resolveChild = resolve; });
  const settle = (outcome) => {
    if (settled) return;
    settled = true;
    resolveChild(outcome);
  };
  child.once("error", (error) => {
    settle({ status: 1, signal: null, startupError: error.message });
  });
  child.once("close", (status, signal) => {
    settle({ status, signal, startupError: null });
  });

  let termination;
  const terminate = async () => {
    termination ??= (async () => {
      if (child.pid) await terminateRemainingGroup(child.pid, terminationGrace);
      await childClosed;
    })();
    await termination;
  };
  const completion = (async () => {
    const outcome = await childClosed;
    await terminate();
    return outcome;
  })();

  return { completion, pid: child.pid, terminate };
}

async function launchFromStandardInput() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { command, args, cwd, environment, timeout, terminationGrace } = JSON.parse(input);
  let notifySignal;
  const signalReached = new Promise((resolve) => { notifySignal = resolve; });
  const onTerm = () => notifySignal("SIGTERM");
  const onInterrupt = () => notifySignal("SIGINT");
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInterrupt);
  const launched = launchInProcessGroup(command, args, {
    cwd,
    environment,
    terminationGrace,
  });

  let timeoutHandle;
  const timeoutReached = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeout);
  });
  const result = await Promise.race([
    launched.completion.then(() => "closed"),
    timeoutReached,
    signalReached,
  ]);
  clearTimeout(timeoutHandle);

  if (result === "closed") {
    process.removeListener("SIGTERM", onTerm);
    process.removeListener("SIGINT", onInterrupt);
    const childOutcome = await launched.completion;
    if (childOutcome.startupError) process.stderr.write(`FRONTIER_PROCESS_START_FAILED: ${childOutcome.startupError}\n`);
    process.exitCode = childOutcome.status ?? 1;
    return;
  }

  // Keep both handlers installed through cleanup so repeated signals cannot
  // restore default termination and orphan the detached child group.
  await launched.terminate();
  process.removeListener("SIGTERM", onTerm);
  process.removeListener("SIGINT", onInterrupt);
  if (result === "timeout") {
    process.stderr.write(`FRONTIER_PROCESS_TIMEOUT: command exceeded ${timeout}ms; process group terminated\n`);
    process.exitCode = timeoutExitStatus;
    return;
  }

  process.kill(process.pid, result);
}

export function runInProcessGroup(command, args, options = {}) {
  if (!(["darwin", "linux"].includes(process.platform))) {
    throw new Error(`Process-group execution is unsupported on ${process.platform}`);
  }
  const timeout = options.timeout ?? 2 * 60 * 60_000;
  const terminationGrace = options.terminationGrace ?? 2_000;
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--launch"], {
    cwd: options.cwd,
    env: process.env,
    encoding: options.encoding ?? "utf8",
    input: JSON.stringify({
      command,
      args,
      cwd: options.cwd,
      environment: { ...process.env, ...options.environment },
      timeout,
      terminationGrace,
    }),
    maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024,
    stdio: options.stdio ? ["pipe", options.stdio[1], options.stdio[2]] : undefined,
  });
  return {
    ...result,
    timedOut: result.status === timeoutExitStatus,
  };
}

if (process.argv[2] === "--launch") {
  launchFromStandardInput().catch((error) => {
    process.stderr.write(`FRONTIER_PROCESS_RUNNER_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
