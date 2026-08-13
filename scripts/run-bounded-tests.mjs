import { spawn } from "node:child_process";

const budgetMs = Number(process.env.MDLM_TEST_BUDGET_MS ?? 5 * 60_000);
const child = spawn(
  process.execPath,
  ["./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.fast.config.ts"],
  { stdio: "inherit", detached: process.platform !== "win32" },
);

const timeout = setTimeout(() => {
  process.stderr.write(
    `Authoritative test budget exceeded ${budgetMs}ms; terminate redundant reconstruction or move route permutations to package/evaluator seams.\n`,
  );
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }
}, budgetMs);

timeout.unref();

child.once("error", (error) => {
  clearTimeout(timeout);
  throw error;
});

child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
