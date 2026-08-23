import { rootTestManifest } from "../vitest.suites.mjs";
import {
  createRootResourceAdmissionPolicy,
  rootResourceAssignment,
  rootResourceTaskCanOverlap,
} from "./root-test-resource-plan.mjs";

export { rootTestManifest };
export const ROOT_TEST_TOKEN_CAPACITY = 4;
export const ROOT_TEST_CLASS_CONCURRENCY_LIMITS = Object.freeze({
  "process-repository-heavy": 2,
  "repository-public-fragile": 2,
  "process-repository-safe": 3,
  "canonical-evaluator-safe": 3,
  "canonical-fixture-filler": 1,
  "cheap-in-process": 1,
});
export const ROOT_TEST_SCHEDULING_POLICIES = Object.freeze({
  GLOBAL_RESOURCE_LPT: "global-resource-lpt",
});
export const ROOT_TEST_SCHEDULING_POLICY =
  ROOT_TEST_SCHEDULING_POLICIES.GLOBAL_RESOURCE_LPT;
export const CHEAP_BATCH_COUNT = 2;
export const MAX_CHEAP_FILES_PER_BATCH = 9;
export const FOCUSED_VITEST_STARTUP_MS = 1_250;

export function rootTestTasksCanOverlap(left, right) {
  return rootResourceTaskCanOverlap(left, right);
}

export function createRootTestAdmissionPolicy(policy) {
  if (!Object.values(ROOT_TEST_SCHEDULING_POLICIES).includes(policy)) {
    throw new TypeError(`Unknown root test scheduling policy: ${policy}`);
  }
  return createRootResourceAdmissionPolicy();
}

function createCheapBatches(entries) {
  const batches = Array.from({ length: CHEAP_BATCH_COUNT }, (_, index) => ({
    id: `cheap-in-process-${index + 1}`,
    runtimeClass: "cheap-in-process",
    weight: 1,
    files: [],
    estimatedDurationMs: FOCUSED_VITEST_STARTUP_MS,
    scheduleLaneId: "fourth-token",
    resourceOwner: false,
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
  const focused = rootTestManifest
    .filter((entry) => entry.runtimeClass !== "cheap-in-process")
    .map((entry) => {
      const assignment = rootResourceAssignment(entry.file);
      return {
        id: entry.file,
        runtimeClass: entry.runtimeClass,
        weight: entry.weight,
        files: [entry.file],
        estimatedDurationMs: assignment?.estimatedDurationMs ?? entry.measuredDurationMs,
        estimateKind: assignment ? "selected-successful-resource-observation" : "exact-head-focused-model",
        laneOrder: assignment?.laneOrder,
        scheduleLaneId: assignment?.scheduleLaneId ?? "fourth-token",
        resourceClass: assignment?.resourceClass,
        resourceOwner: assignment?.resourceOwner ?? false,
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

export function createResourceLptTasks(policy = ROOT_TEST_SCHEDULING_POLICY) {
  return createRootTestTasks(policy).filter((task) => task.resourceOwner === true);
}
