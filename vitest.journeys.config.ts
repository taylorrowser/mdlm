import { defineConfig } from "vitest/config";
import { journeyTests } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: journeyTests,
    maxWorkers: 1,
    testTimeout: 30 * 60_000,
  },
});
