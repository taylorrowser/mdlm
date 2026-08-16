import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/issue-154-public-allocation.integration.ts"],
    testTimeout: 300_000,
  },
});
