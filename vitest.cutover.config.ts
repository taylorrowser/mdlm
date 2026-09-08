import { defineConfig } from "vitest/config";

// The supported default process is tiny. Historical full-V tests outside this
// list do not describe that package and are not part of its qualification gate.
export default defineConfig({
  test: {
    include: [
      "test/tiny-process-package.test.ts",
      "test/tiny-process-journey.test.ts",
      "test/operator-contract-v2.test.ts",
      "test/operator-outcome-classification.test.ts",
      "test/release-candidate-gate.test.ts",
      "test/lifecycle-schema-diagnostics.test.ts",
      "test/array-expression.test.ts",
    ],
    maxWorkers: 1,
    testTimeout: 45_000,
  },
});
