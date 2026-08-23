import { rootTestManifest } from "../vitest.suites.mjs";

export { rootTestManifest };
// These are abstract admission tokens. Repository process contention is owned
// independently by ROOT_TEST_CONCURRENCY_GROUPS, not inferred from CPU cores.
export const ROOT_TEST_TOKEN_CAPACITY = 4;
export const ROOT_TEST_CLASS_CONCURRENCY_LIMITS = Object.freeze({
  "process-repository-heavy": 2,
  "repository-public-three-way-safe": 3,
  "repository-public-fragile": 2,
});
export const ROOT_TEST_CONCURRENCY_GROUPS = Object.freeze({
  "focused-repository-processes": Object.freeze({
    limit: 3,
    runtimeClasses: Object.freeze([
      "process-repository-heavy",
      "repository-public-three-way-safe",
      "repository-public-fragile",
    ]),
  }),
});
export const ROOT_TEST_SCHEDULING_POLICIES = Object.freeze({
  CALIBRATED_THREE_PROCESS: "calibrated-three-process",
});
export const ROOT_TEST_SCHEDULING_POLICY = ROOT_TEST_SCHEDULING_POLICIES.CALIBRATED_THREE_PROCESS;
export const CHEAP_BATCH_COUNT = 2;
export const MAX_CHEAP_FILES_PER_BATCH = 9;
export const FOCUSED_VITEST_STARTUP_MS = 1_250;

export function rootTestTasksCanOverlap(left, right) {
  const classes = new Set([left.runtimeClass, right.runtimeClass]);
  return !(classes.has("process-repository-heavy") && classes.has("repository-public-fragile"));
}

export function createRootTestAdmissionPolicy(policy) {
  if (!Object.values(ROOT_TEST_SCHEDULING_POLICIES).includes(policy)) {
    throw new TypeError(`Unknown root test scheduling policy: ${policy}`);
  }
  return () => true;
}

function createCheapBatches(entries) {
  const batches = Array.from({ length: CHEAP_BATCH_COUNT }, (_, index) => ({
    id: `cheap-in-process-${index + 1}`,
    runtimeClass: "cheap-in-process",
    weight: 1,
    files: [],
    estimatedDurationMs: FOCUSED_VITEST_STARTUP_MS,
  }));
  const longestFirst = [...entries].sort((left, right) =>
    right.measuredDurationMs - left.measuredDurationMs || left.file.localeCompare(right.file));
  for (const entry of longestFirst) {
    const available = batches
      .filter((batch) => batch.files.length < MAX_CHEAP_FILES_PER_BATCH)
      .sort((left, right) =>
        left.estimatedDurationMs - right.estimatedDurationMs || left.id.localeCompare(right.id));
    const batch = available[0];
    if (!batch) throw new Error("Cheap test files exceed the bounded batch capacity");
    batch.files.push(entry.file);
    batch.estimatedDurationMs += Math.max(0, entry.measuredDurationMs - FOCUSED_VITEST_STARTUP_MS);
  }
  return batches.sort((left, right) => right.estimatedDurationMs - left.estimatedDurationMs);
}

export function createRootTestTasks(policy = ROOT_TEST_SCHEDULING_POLICY) {
  if (!Object.values(ROOT_TEST_SCHEDULING_POLICIES).includes(policy)) {
    throw new TypeError(`Unknown root test scheduling policy: ${policy}`);
  }
  const focused = rootTestManifest
    .filter((entry) => entry.runtimeClass !== "cheap-in-process")
    .map((entry) => ({
      id: entry.file,
      runtimeClass: entry.runtimeClass,
      weight: entry.weight,
      files: [entry.file],
      estimatedDurationMs: entry.measuredDurationMs,
    }))
    .sort((left, right) =>
      right.estimatedDurationMs - left.estimatedDurationMs || left.id.localeCompare(right.id));
  const cheap = createCheapBatches(
    rootTestManifest.filter((entry) => entry.runtimeClass === "cheap-in-process"),
  );
  return [...focused, ...cheap];
}
