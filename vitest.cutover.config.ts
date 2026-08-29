import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/cutover-corpus.test.ts",
      "test/operator-outcome.test.ts",
      "test/operator-contract-v2.test.ts",
      "test/operator-fault-gate.test.ts",
      "test/process-package-cutover.test.ts",
      "test/atomic-review-submit.test.ts",
    ],
    maxWorkers: 4,
    testTimeout: 45_000,
  },
});
