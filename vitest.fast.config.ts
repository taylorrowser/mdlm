import { defineConfig } from "vitest/config";
import { testFiles } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: testFiles,
    // The bounded suite excludes hour-scale aggregate journeys. Four workers
    // keep the retained isolated CLI contracts below the authoritative budget;
    // three underutilizes available process parallelism and exceeds that budget.
    maxWorkers: 4,
    testTimeout: 45_000,
  },
});
