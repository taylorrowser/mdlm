import { defineConfig } from "vitest/config";
import { testFiles } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: testFiles,
    // The bounded suite excludes hour-scale aggregate journeys. Three workers
    // improve throughput for its shorter isolated CLI contracts without the
    // contention that required the former two-worker journey cap.
    maxWorkers: 3,
    testTimeout: 45_000,
  },
});
