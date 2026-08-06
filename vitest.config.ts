import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Public req tests repeatedly load the complete declarative Process Package.
    // Parallel full-suite contention can exceed Vitest's 5 second unit-test default.
    testTimeout: 15_000,
  },
});
