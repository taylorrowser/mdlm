import { rootTestManifest } from "../vitest.suites.mjs";

export { rootTestManifest };
export const ROOT_TEST_TOKEN_CAPACITY = 4;
export const CHEAP_BATCH_COUNT = 2;
export const MAX_CHEAP_FILES_PER_BATCH = 9;
export const FOCUSED_VITEST_STARTUP_MS = 1_250;

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

export function createRootTestTasks() {
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
