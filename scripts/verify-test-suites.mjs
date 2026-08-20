import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve, sep } from "node:path";
import { testFiles } from "../vitest.suites.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const testRoots = [
  resolve(repositoryRoot, "test"),
  resolve(repositoryRoot, "packages/mdlm-pi/test"),
];

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts")
      ? [relative(repositoryRoot, path).split(sep).join("/")]
      : [];
  });
}

const discovered = testRoots.flatMap(discoverTests).sort();
const classified = [...testFiles].sort();
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

process.stdout.write(`Classified ${testFiles.length} authoritative test files.\n`);
