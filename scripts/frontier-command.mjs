import { execFileSync, spawnSync } from "node:child_process";
import { isTransientInfrastructureFailure } from "./frontier-loop-core.mjs";

function sleep(milliseconds) {
  execFileSync(process.execPath, ["-e", `setTimeout(() => {}, ${milliseconds})`]);
}

export function commandResult(command, args, options = {}) {
  const maximumAttempts = options.maximumAttempts ?? (command === "gh" ? 5 : 1);
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: { ...process.env, ...options.environment },
      maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024,
      timeout: options.timeout ?? Number(process.env.MDLM_FRONTIER_COMMAND_TIMEOUT_MS ?? 30 * 60_000),
    });
    if (result.error) throw new Error(`${command}: ${result.error.message}`);
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.status === 0 || !isTransientInfrastructureFailure(new Error(detail)) || attempt === maximumAttempts) return result;
    options.onRetry?.({ attempt, maximumAttempts, command, args });
    sleep(attempt * 2_000);
  }
  throw new Error(`${command} retry loop ended unexpectedly`);
}

export function commandOutput(command, args, options = {}) {
  const result = commandResult(command, args, options);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout.trim();
}
