import { runInProcessGroup } from "./frontier-process-group.mjs";

const budgetMs = Number(process.env.MDLM_TEST_BUDGET_MS ?? 5 * 60_000);
const result = runInProcessGroup(
  process.execPath,
  ["./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.fast.config.ts"],
  {
    cwd: process.cwd(),
    timeout: budgetMs,
    terminationGrace: 2_000,
    stdio: ["ignore", "inherit", "inherit"],
  },
);

if (result.timedOut) {
  process.stderr.write(
    `Authoritative test budget exceeded ${budgetMs}ms; terminate redundant reconstruction or move route permutations to package/evaluator seams.\n`,
  );
}
process.exitCode = result.status ?? 1;
