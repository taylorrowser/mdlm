import { defineConfig } from "vitest/config";
import { testFiles } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: testFiles,
    // Two long public routes occupy separate workers while the remaining suite
    // advances in parallel; four workers keep the complete gate bounded.
    maxWorkers: 4,
    setupFiles: ["./test/setup-root-observation-limits.ts"],
    testTimeout: 45_000,
  },
});
