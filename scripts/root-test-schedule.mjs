import { rootTestManifest } from "../vitest.suites.mjs";
import {
  safeLptAssignmentFor,
  safeLptEvidence,
} from "./root-test-safe-lpt-plan.mjs";

export { rootTestManifest };
export const ROOT_TEST_TOKEN_CAPACITY = 4;
export const ROOT_TEST_CLASS_CONCURRENCY_LIMITS = Object.freeze({
  "process-repository-heavy": 1,
  "repository-public-fragile": 1,
  "process-repository-safe": 3,
  "canonical-evaluator-safe": 3,
  "canonical-fixture-filler": 1,
  "cheap-in-process": 1,
});
export const SAFE_RUNTIME_CLASSES = Object.freeze([
  "process-repository-safe",
  "canonical-evaluator-safe",
]);
const safeRuntimeClasses = new Set(SAFE_RUNTIME_CLASSES);
export const ROOT_TEST_SCHEDULING_POLICIES = Object.freeze({
  SAFE_LPT_WITH_BACKGROUND: "safe-lpt-with-background",
});
export const ROOT_TEST_SCHEDULING_POLICY =
  ROOT_TEST_SCHEDULING_POLICIES.SAFE_LPT_WITH_BACKGROUND;
export const CHEAP_BATCH_COUNT = 2;
export const MAX_CHEAP_FILES_PER_BATCH = 9;
export const FOCUSED_VITEST_STARTUP_MS = 1_250;

function isSafeTask(task) {
  return safeRuntimeClasses.has(task.runtimeClass);
}

export function rootTestTasksCanOverlap(left, right) {
  const classes = new Set([left.runtimeClass, right.runtimeClass]);
  // Safe LPT work may use any of its three lanes beside the single background
  // lane. The retained repository exclusion is between heavy and fragile work.
  return !(classes.has("process-repository-heavy")
    && classes.has("repository-public-fragile"));
}

export function createRootTestAdmissionPolicy(policy) {
  if (!Object.values(ROOT_TEST_SCHEDULING_POLICIES).includes(policy)) {
    throw new TypeError(`Unknown root test scheduling policy: ${policy}`);
  }
  return (candidate, { pendingTasks, runningTasks }) => {
    if (!isSafeTask(candidate)) {
      return !runningTasks.some((task) => !isSafeTask(task));
    }
    if (!candidate.scheduleLaneId || !Number.isInteger(candidate.laneOrder)) return false;
    const sameLane = (task) => task.scheduleLaneId === candidate.scheduleLaneId;
    return !runningTasks.some(sameLane)
      && !pendingTasks.some((task) =>
        sameLane(task) && task.laneOrder < candidate.laneOrder);
  };
}

function createCheapBatches(entries) {
  const batches = Array.from({ length: CHEAP_BATCH_COUNT }, (_, index) => ({
    id: `cheap-in-process-${index + 1}`,
    runtimeClass: "cheap-in-process",
    weight: 1,
    files: [],
    estimatedDurationMs: FOCUSED_VITEST_STARTUP_MS,
    scheduleLaneId: "background",
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
  return batches.sort((left, right) =>
    right.estimatedDurationMs - left.estimatedDurationMs || left.id.localeCompare(right.id));
}

export function createRootTestTasks(policy = ROOT_TEST_SCHEDULING_POLICY) {
  if (!Object.values(ROOT_TEST_SCHEDULING_POLICIES).includes(policy)) {
    throw new TypeError(`Unknown root test scheduling policy: ${policy}`);
  }
  const safeFiles = new Set(safeLptEvidence.map((entry) => entry.file));
  const focused = rootTestManifest
    .filter((entry) => entry.runtimeClass !== "cheap-in-process")
    .map((entry) => {
      const assignment = safeLptAssignmentFor(entry.file);
      if (safeFiles.has(entry.file) !== Boolean(assignment)) {
        throw new Error(`Safe LPT assignment mismatch for ${entry.file}`);
      }
      return {
        id: entry.file,
        runtimeClass: entry.runtimeClass,
        weight: entry.weight,
        files: [entry.file],
        estimatedDurationMs: assignment?.estimatedDurationMs ?? entry.measuredDurationMs,
        estimateKind: assignment?.estimateKind ?? "exact-head-focused-model",
        laneOrder: assignment?.laneOrder,
        scheduleLaneId: assignment?.scheduleLaneId ?? "background",
      };
    })
    .sort((left, right) =>
      right.estimatedDurationMs - left.estimatedDurationMs || left.id.localeCompare(right.id));
  const cheap = createCheapBatches(
    rootTestManifest.filter((entry) => entry.runtimeClass === "cheap-in-process"),
  );
  return [...focused, ...cheap];
}

export function createRootTestTasksForClass(
  runtimeClass,
  policy = ROOT_TEST_SCHEDULING_POLICY,
) {
  const resolvedClass = runtimeClass === "canonical-filler"
    ? "canonical-fixture-filler"
    : runtimeClass;
  return createRootTestTasks(policy)
    .filter((task) => task.runtimeClass === resolvedClass);
}

export function createSafeLptTasks(policy = ROOT_TEST_SCHEDULING_POLICY) {
  return createRootTestTasks(policy).filter(isSafeTask);
}
