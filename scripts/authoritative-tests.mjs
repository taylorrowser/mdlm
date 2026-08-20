import { spawnSync } from "node:child_process";

function run(arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

for (const arguments_ of [
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  ["./node_modules/typescript/bin/tsc", "-p", "packages/mdlm-pi/tsconfig.build.json"],
  ["scripts/verify-test-suites.mjs"],
  ["./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.fast.config.ts"],
  ["--test", "scripts/frontier-loop-tests.mjs"],
]) {
  const status = run(arguments_);
  if (status !== 0) {
    process.exitCode = status;
    break;
  }
}
