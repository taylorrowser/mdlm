import { defineConfig } from "vitest/config";
import { fastTests } from "./vitest.suites.mjs";

export default defineConfig({
  test: {
    include: fastTests,
    maxWorkers: 2,
    testTimeout: 45_000,
  },
});
