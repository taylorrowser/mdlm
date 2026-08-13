import { defineConfig } from "vitest/config";
import { testFiles } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: testFiles,
    // Reserve one logical CPU for the CLI and Git subprocesses spawned by tests;
    // four Vitest workers contend with those children and make cold runs unstable.
    maxWorkers: 3,
    testTimeout: 45_000,
  },
});
