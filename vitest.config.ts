import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Public CLI tests repeatedly load the complete declarative Process Package in
    // child processes. Cap that process-heavy integration concurrency at two so
    // contention does not make deterministic public transactions miss their timeout budgets.
    maxWorkers: 2,
    testTimeout: 15_000,
  },
});
