import { defineConfig } from "vitest/config";
import { testFiles } from "./vitest.suites.mjs";
export default defineConfig({test:{include:testFiles,maxWorkers:1,testTimeout:90_000}});
