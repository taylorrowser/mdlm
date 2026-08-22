import { spawnSync } from "node:child_process";
import { rootVitestSuites } from "../vitest.suites.mjs";

function run(arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runAll(commands) {
  for (const arguments_ of commands) {
    const status = run(arguments_);
    if (status !== 0) return status;
  }
  return 0;
}

let status = runAll([
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  ["./node_modules/typescript/bin/tsc", "-p", "packages/mdlm-pi/tsconfig.build.json"],
  ["scripts/verify-test-suites.mjs"],
]);

if (status === 0) {
  for (const suite of rootVitestSuites) {
    status = run([
      "./node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.fast.config.ts",
      `--maxWorkers=${suite.maxWorkers}`,
      ...suite.files,
    ]);
    if (status !== 0) break;
  }
}

if (status === 0) {
  status = runAll([
    [
      "./node_modules/vitest/vitest.mjs",
      "run",
      "--root",
      "packages/mdlm-pi",
      "--testTimeout=30000",
    ],
    ["--test", "scripts/frontier-loop-tests.mjs"],
  ]);
}

process.exitCode = status;
