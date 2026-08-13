import { defineConfig } from "vitest/config";
import { testFiles } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: testFiles,
    // The bounded suite excludes hour-scale aggregate journeys. Four workers
    // keep retained CLI contracts within the authoritative process budget after
    // contracting duplicated public setup from the longest transaction files.
    maxWorkers: 4,
    testTimeout: 45_000,
  },
});
