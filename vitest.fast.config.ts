import { defineConfig } from "vitest/config";
import { rootTestManifest } from "./vitest.suites.mjs";
export default defineConfig({test:{
  include:rootTestManifest.filter(row=>row.qualificationGate === "pr").map(row=>row.file),
  maxWorkers:2,testTimeout:45_000,
}});
