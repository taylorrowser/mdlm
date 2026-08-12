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

async function launchFromStandardInput() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { command, args, cwd, environment, timeout, terminationGrace } = JSON.parse(input);
  const child = spawn(command, args, {
    cwd,
    env: environment,
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  });

  let childOutcome;
  let resolveChild;
  const childClosed = new Promise((resolve) => { resolveChild = resolve; });
  child.once("error", (error) => {
    childOutcome = { status: 1, signal: null, startupError: error.message };
    resolveChild();
  });
  child.once("close", (status, signal) => {
    childOutcome = { status, signal, startupError: null };
    resolveChild();
  });

  let timeoutHandle;
  const timeoutReached = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeout);
  });
  const timerResult = await Promise.race([
    childClosed.then(() => "closed"),
    timeoutReached,
  ]);
  if (timerResult === "closed") {
    clearTimeout(timeoutHandle);
    if (child.pid) await terminateRemainingGroup(child.pid, terminationGrace);
    if (childOutcome.startupError) process.stderr.write(`FRONTIER_PROCESS_START_FAILED: ${childOutcome.startupError}\n`);
    process.exitCode = childOutcome.status ?? 1;
    return;
  }

  await terminateRemainingGroup(child.pid, terminationGrace);
  await childClosed;
  process.stderr.write(`FRONTIER_PROCESS_TIMEOUT: command exceeded ${timeout}ms; process group terminated\n`);
  process.exitCode = timeoutExitStatus;
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
