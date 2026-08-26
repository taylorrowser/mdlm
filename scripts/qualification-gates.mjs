import {
  rootTestManifest,
  rootTestQualificationManifest,
} from "../vitest.suites.mjs";

export const QUALIFICATION_GATES = Object.freeze({
  PR: "pr",
  RELEASE: "release",
});
export const PR_QUALIFICATION_BUDGET_MS = 600_000;
export const RELEASE_QUALIFICATION_BUDGET_MS = 2_400_000;

const validGates = new Set(Object.values(QUALIFICATION_GATES));
const rootManifestFiles = new Set(rootTestManifest.map((entry) => entry.file));

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

export function qualificationManifestErrors(
  discoveredFiles,
  manifest = rootTestQualificationManifest,
) {
  const classifiedFiles = manifest.map((entry) => entry.file);
  const errors = [];
  for (const file of duplicates(classifiedFiles)) {
    errors.push(`Root qualification file is classified more than once: ${file}`);
  }
  for (const file of difference(discoveredFiles, classifiedFiles)) {
    errors.push(`Unclassified root qualification file: ${file}`);
  }
  for (const file of difference(classifiedFiles, discoveredFiles)) {
    errors.push(`Stale root qualification classification: ${file}`);
  }
  for (const entry of manifest) {
    if (!validGates.has(entry.qualificationGate)) {
      errors.push(`Invalid root qualification gate ${entry.qualificationGate}: ${entry.file}`);
    }
  }
  return errors;
}

export function additionalRootTestFilesForChangedPaths(changedPaths) {
  const gateByFile = new Map(
    rootTestQualificationManifest.map((entry) => [entry.file, entry.qualificationGate]),
  );
  return [...new Set(changedPaths.filter(
    (file) => gateByFile.get(file) === QUALIFICATION_GATES.RELEASE,
  ))].sort();
}

export function rootTestFilesForGate(gate, additionalRootTestFiles = []) {
  if (!validGates.has(gate)) throw new TypeError(`Unknown qualification gate: ${gate}`);
  for (const file of additionalRootTestFiles) {
    if (!rootManifestFiles.has(file)) throw new TypeError(`Unknown root qualification test: ${file}`);
  }
  const selected = rootTestManifest
    .filter((entry) => gate === QUALIFICATION_GATES.RELEASE
      || entry.qualificationGate === QUALIFICATION_GATES.PR)
    .map((entry) => entry.file);
  return [...new Set([...selected, ...additionalRootTestFiles])];
}

export function parseQualificationArguments(arguments_) {
  let gate = QUALIFICATION_GATES.PR;
  let gateWasSpecified = false;
  const additionalRootTestFiles = [];
  for (const argument of arguments_) {
    if (argument.startsWith("--gate=")) {
      if (gateWasSpecified) {
        throw new TypeError("Qualification gate may be specified only once");
      }
      gate = argument.slice("--gate=".length);
      gateWasSpecified = true;
    } else if (argument.startsWith("--root-test=")) {
      additionalRootTestFiles.push(argument.slice("--root-test=".length));
    } else {
      throw new TypeError(`Unknown qualification argument: ${argument}`);
    }
  }
  if (!validGates.has(gate)) throw new TypeError(`Unknown qualification gate: ${gate}`);
  if (gate !== QUALIFICATION_GATES.PR && additionalRootTestFiles.length > 0) {
    throw new TypeError("Diff-focused root tests are valid only for the PR gate");
  }
  rootTestFilesForGate(gate, additionalRootTestFiles);
  return { gate, additionalRootTestFiles: [...new Set(additionalRootTestFiles)] };
}

export function qualificationBudgetMs(gate) {
  if (gate === QUALIFICATION_GATES.PR) return PR_QUALIFICATION_BUDGET_MS;
  if (gate === QUALIFICATION_GATES.RELEASE) return RELEASE_QUALIFICATION_BUDGET_MS;
  throw new TypeError(`Unknown qualification gate: ${gate}`);
}
