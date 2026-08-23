import { rootTestManifest } from "../vitest.suites.mjs";

export { rootTestManifest };
export const ROOT_TEST_TOKEN_CAPACITY = 4;
export const ROOT_TEST_CLASS_CONCURRENCY_LIMITS = Object.freeze({
  "process-repository-heavy": 2,
  "repository-public-three-way-safe": 2,
});
export const ROOT_TEST_SCHEDULING_POLICIES = Object.freeze({
  HEAVY_PAIR_FIRST: "heavy-pair-first",
  ONE_HEAVY_WHILE_SAFE: "one-heavy-while-safe",
});
export const ROOT_TEST_SCHEDULING_POLICY = ROOT_TEST_SCHEDULING_POLICIES.ONE_HEAVY_WHILE_SAFE;
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
  if (policy === ROOT_TEST_SCHEDULING_POLICIES.HEAVY_PAIR_FIRST) return () => true;
  return (candidate, { pendingTasks, runningTasks }) => {
    const isHeavy = (task) => task.runtimeClass === "process-repository-heavy";
    const isSafe = (task) => task.runtimeClass === "repository-public-three-way-safe";
    const safeWorkRemains = pendingTasks.some(isSafe) || runningTasks.some(isSafe);
    return !safeWorkRemains || !isHeavy(candidate) || !runningTasks.some(isHeavy);
  };
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
  const tasks = [...focused, ...cheap];
  if (policy !== ROOT_TEST_SCHEDULING_POLICIES.HEAVY_PAIR_FIRST) return tasks;
  return tasks.sort((left, right) => {
    const leftIsHeavy = left.runtimeClass === "process-repository-heavy";
    const rightIsHeavy = right.runtimeClass === "process-repository-heavy";
    return Number(rightIsHeavy) - Number(leftIsHeavy)
      || right.estimatedDurationMs - left.estimatedDurationMs
      || left.id.localeCompare(right.id);
  });
}
