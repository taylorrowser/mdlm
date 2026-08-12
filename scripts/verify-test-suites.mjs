import { readdirSync } from "node:fs";
import { fastTests, journeyTests } from "../vitest.suites.mjs";

const discovered = readdirSync(new URL("../test", import.meta.url))
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `test/${name}`)
  .sort();
const classified = [...fastTests, ...journeyTests].sort();
const duplicates = classified.filter((path, index) => classified.indexOf(path) !== index);
const missing = discovered.filter((path) => !classified.includes(path));
const unknown = classified.filter((path) => !discovered.includes(path));

if (duplicates.length || missing.length || unknown.length) {
  const details = [
    duplicates.length ? `duplicate: ${[...new Set(duplicates)].join(", ")}` : "",
    missing.length ? `unclassified: ${missing.join(", ")}` : "",
    unknown.length ? `missing file: ${unknown.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  throw new Error(`Test suite classification is incomplete:\n${details}`);
}

process.stdout.write(`Classified ${fastTests.length} fast and ${journeyTests.length} journey test files.\n`);
