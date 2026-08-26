import { readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mdlmPiTestFiles,
  rootVitestSuites,
  testFiles,
} from "../vitest.suites.mjs";
import {
  ROOT_TEST_TOKEN_CAPACITY,
  rootTestManifest,
} from "./root-test-schedule.mjs";
import { verifyRootTestObservationPolicy } from "./root-test-observation-policy.mjs";
import {
  QUALIFICATION_GATES,
  qualificationManifestErrors,
  rootTestFilesForGate,
} from "./qualification-gates.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function collectTestFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        files.push(relative(repositoryRoot, absolute).split(sep).join("/"));
      }
    }
  };
  visit(resolve(repositoryRoot, root));
  return files.sort();
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

const rootDiscovered = collectTestFiles("test");
const classified = rootVitestSuites.flatMap((suite) => suite.files);
const suiteIds = rootVitestSuites.map((suite) => suite.id);
const mdlmPiDiscovered = collectTestFiles("packages/mdlm-pi/test");
const errors = qualificationManifestErrors(rootDiscovered, rootTestManifest);

if (rootDiscovered.length !== 47) {
  errors.push(`Expected exactly 47 root Vitest files, found ${rootDiscovered.length}`);
}
if (rootVitestSuites.length === 0) {
  errors.push("No root Vitest resource classes are declared");
}
for (const suite of rootVitestSuites) {
  if (suite.files.length === 0) {
    errors.push(`Root Vitest resource class is empty: ${suite.id}`);
  }
  if (!Number.isInteger(suite.weight) || suite.weight <= 0 || suite.weight > ROOT_TEST_TOKEN_CAPACITY) {
    errors.push(`Root Vitest resource class has an invalid token weight: ${suite.id}`);
  }
  if (suite.files.some((file) => rootTestManifest.find((entry) => entry.file === file)?.weight !== suite.weight)) {
    errors.push(`Root Vitest resource class has inconsistent file weights: ${suite.id}`);
  }
}
for (const id of duplicates(suiteIds)) {
  errors.push(`Duplicate root Vitest resource class id: ${id}`);
}
for (const file of duplicates(classified)) {
  errors.push(`Root Vitest file is classified more than once: ${file}`);
}
for (const file of difference(rootDiscovered, classified)) {
  errors.push(`Unclassified root Vitest file: ${file}`);
}
for (const file of difference(classified, rootDiscovered)) {
  errors.push(`Stale root Vitest classification: ${file}`);
}
if (classified.length !== 47) {
  errors.push(`Expected exactly 47 classified root Vitest entries, found ${classified.length}`);
}
if (JSON.stringify([...testFiles].sort()) !== JSON.stringify([...classified].sort())) {
  errors.push("The complete testFiles export differs from resource-class membership");
}
for (const file of duplicates(mdlmPiTestFiles)) {
  errors.push(`Duplicate mdlm-pi Vitest entry: ${file}`);
}
for (const file of difference(mdlmPiDiscovered, mdlmPiTestFiles)) {
  errors.push(`Unclassified mdlm-pi Vitest file: ${file}`);
}
for (const file of difference(mdlmPiTestFiles, mdlmPiDiscovered)) {
  errors.push(`Stale mdlm-pi Vitest entry: ${file}`);
}
try {
  verifyRootTestObservationPolicy(repositoryRoot);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

const classSummary = rootVitestSuites
  .map((suite) => `${suite.id}=${suite.files.length}@weight${suite.weight}`)
  .join(", ");
const prCount = rootTestFilesForGate(QUALIFICATION_GATES.PR).length;
const releaseCount = rootTestFilesForGate(QUALIFICATION_GATES.RELEASE).length;
console.log(
  `Verified ${rootDiscovered.length + mdlmPiDiscovered.length} Vitest files; root gates: pr=${prCount}, release=${releaseCount}; root classes: ${classSummary}.`,
);
