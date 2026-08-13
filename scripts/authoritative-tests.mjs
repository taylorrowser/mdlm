import { spawnSync } from "node:child_process";

const commands = [
  [process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"]],
  [process.execPath, ["scripts/verify-test-suites.mjs"]],
  [process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.fast.config.ts"]],
  [process.execPath, ["--test", "scripts/frontier-loop-tests.mjs"]],
];

for (const [command, arguments_] of commands) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
