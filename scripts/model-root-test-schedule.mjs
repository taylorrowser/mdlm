import { spawnSync } from "node:child_process";
import {
  FOCUSED_VITEST_STARTUP_MS,
  ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  ROOT_TEST_CONCURRENCY_GROUPS,
  ROOT_TEST_SCHEDULING_POLICY,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasks,
  rootTestManifest,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

const ROOT_ELIGIBILITY_MS = 540_000;
const OUTER_DEADLINE_MS = 600_000;
const REQUIRED_OUTER_HEADROOM_MS = 60_000;
const ORCHESTRATION_ALLOWANCE_MS = 2_000;
const CONSERVATIVE_RESERVE_MS = 20_000;
const HEAVY_PAIR_CONTENTION_ALLOWANCE_MS = 56_595;
const THREE_SAFE_CONTENTION_ALLOWANCE_MS = 41_689;
const ONE_HEAVY_MIXED_CONTENTION_ALLOWANCE_MS = 33_507;
const CALIBRATED_OBSERVED_SCHEDULER_WALL_MS = 177_442;
const CALIBRATED_OBSERVED_WRAPPER_WALL_MS = 177_601;
const CALIBRATED_TEST_WORK_MS = 443_350;
const CALIBRATED_FILES = [
  "test/mdlm-assignment.test.ts",
  "test/proportional-distinct-context-phase-2-public.test.ts",
  "test/phase-1-hardening-routes.test.ts",
];

function git(...arguments_) {
  const result = spawnSync("git", arguments_, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

function countShapeWindows(tasks, simulation, predicate) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const executions = simulation.launches.map((launch) => {
    const task = taskById.get(launch.taskId);
    return { ...task, startsAtMs: launch.atMs, completesAtMs: launch.atMs + task.estimatedDurationMs };
  });
  const boundaries = [...new Set(executions.flatMap((task) => [task.startsAtMs, task.completesAtMs]))]
    .sort((left, right) => left - right);
  let windows = 0;
  let activePreviously = false;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const nowMs = boundaries[index];
    const active = executions.filter((task) => task.startsAtMs <= nowMs && task.completesAtMs > nowMs);
    const activeNow = predicate(active);
    if (activeNow && !activePreviously) windows += 1;
    activePreviously = activeNow;
  }
  return windows;
}

const tasks = createRootTestTasks();
const simulation = simulateWeightedSchedule(tasks, {
  capacity: ROOT_TEST_TOKEN_CAPACITY,
  canAdmit: createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICY),
  canOverlap: rootTestTasksCanOverlap,
  classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  concurrencyGroups: ROOT_TEST_CONCURRENCY_GROUPS,
});
const calibratedDurations = tasks
  .filter((task) => CALIBRATED_FILES.includes(task.id))
  .map((task) => task.estimatedDurationMs);
if (calibratedDurations.length !== CALIBRATED_FILES.length) {
  throw new Error("Calibrated cohort does not match the root task inventory");
}
const calibratedFocusedFloorMs = Math.max(...calibratedDurations);
const calibratedContentionAllowanceMs = CALIBRATED_OBSERVED_SCHEDULER_WALL_MS - calibratedFocusedFloorMs;
if (calibratedContentionAllowanceMs < 0) {
  throw new Error("Calibrated contention allowance cannot be negative");
}
const count = (runtimeClass) => (active) => active.filter((task) => task.runtimeClass === runtimeClass).length;
const heavyCount = count("process-repository-heavy");
const safeCount = count("repository-public-three-way-safe");
const calibratedWindows = countShapeWindows(tasks, simulation,
  (active) => heavyCount(active) >= 2 && safeCount(active) >= 1);
const heavyPairOnlyWindows = countShapeWindows(tasks, simulation,
  (active) => heavyCount(active) >= 2 && safeCount(active) === 0);
const oneHeavyMixedWindows = countShapeWindows(tasks, simulation,
  (active) => heavyCount(active) === 1 && safeCount(active) >= 1);
const threeSafeOnlyWindows = countShapeWindows(tasks, simulation,
  (active) => heavyCount(active) === 0 && safeCount(active) >= 3);

// Each observation contributes at most one grouped allowance. The predicates
// are exclusive, so the old pair and mixed allowances are never stacked onto
// a calibrated two-heavy-plus-one-safe interval.
const calibratedAllowanceMs = calibratedWindows > 0 ? calibratedContentionAllowanceMs : 0;
const heavyPairOnlyAllowanceMs = heavyPairOnlyWindows > 0 ? HEAVY_PAIR_CONTENTION_ALLOWANCE_MS : 0;
const oneHeavyMixedAllowanceMs = oneHeavyMixedWindows > 0 ? ONE_HEAVY_MIXED_CONTENTION_ALLOWANCE_MS : 0;
const threeSafeOnlyAllowanceMs = threeSafeOnlyWindows > 0 ? THREE_SAFE_CONTENTION_ALLOWANCE_MS : 0;
const contentionAllowanceMs = calibratedAllowanceMs
  + heavyPairOnlyAllowanceMs
  + oneHeavyMixedAllowanceMs
  + threeSafeOnlyAllowanceMs;
const modeledRootMs = simulation.wallMs
  + contentionAllowanceMs
  + ORCHESTRATION_ALLOWANCE_MS
  + CONSERVATIVE_RESERVE_MS;
const status = git("status", "--short");
const identity = status === "" ? git("rev-parse", "HEAD^{tree}") : "DIRTY";
const rootMarginMs = ROOT_ELIGIBILITY_MS - modeledRootMs;
const outerMarginMs = OUTER_DEADLINE_MS - modeledRootMs;
const headroomMarginMs = outerMarginMs - REQUIRED_OUTER_HEADROOM_MS;
const eligible = rootMarginMs >= 0 && headroomMarginMs >= 0;

process.stdout.write(`commit=${git("rev-parse", "HEAD")} tree=${identity} clean=${status === ""}\n`);
process.stdout.write(`root_files=${rootTestManifest.length} tasks=${tasks.length} token_capacity=${ROOT_TEST_TOKEN_CAPACITY} class_concurrency_limits=${JSON.stringify(ROOT_TEST_CLASS_CONCURRENCY_LIMITS)} concurrency_groups=${JSON.stringify(ROOT_TEST_CONCURRENCY_GROUPS)}\n`);
process.stdout.write(`focused_startup_ms=${FOCUSED_VITEST_STARTUP_MS} orchestration_allowance_ms=${ORCHESTRATION_ALLOWANCE_MS} conservative_reserve_ms=${CONSERVATIVE_RESERVE_MS}\n`);
process.stdout.write(`calibrated_files=${CALIBRATED_FILES.join(",")} calibrated_focused_floor_ms=${calibratedFocusedFloorMs} calibrated_observed_scheduler_wall_ms=${CALIBRATED_OBSERVED_SCHEDULER_WALL_MS} calibrated_observed_wrapper_wall_ms=${CALIBRATED_OBSERVED_WRAPPER_WALL_MS} calibrated_test_work_ms=${CALIBRATED_TEST_WORK_MS} calibrated_contention_allowance_ms=${calibratedContentionAllowanceMs}\n`);
process.stdout.write(`policy=${ROOT_TEST_SCHEDULING_POLICY} simulated_schedule_ms=${simulation.wallMs} calibrated_windows=${calibratedWindows} calibrated_allowance_ms=${calibratedAllowanceMs} heavy_pair_only_windows=${heavyPairOnlyWindows} heavy_pair_only_allowance_ms=${heavyPairOnlyAllowanceMs} one_heavy_mixed_windows=${oneHeavyMixedWindows} one_heavy_mixed_allowance_ms=${oneHeavyMixedAllowanceMs} three_safe_only_windows=${threeSafeOnlyWindows} three_safe_only_allowance_ms=${threeSafeOnlyAllowanceMs} contention_allowance_ms=${contentionAllowanceMs} modeled_root_ms=${modeledRootMs}\n`);
process.stdout.write(`selected_policy=${ROOT_TEST_SCHEDULING_POLICY} modeled_root_ms=${modeledRootMs}\n`);
process.stdout.write(`root_eligibility_ms=${ROOT_ELIGIBILITY_MS} root_margin_ms=${rootMarginMs}\n`);
process.stdout.write(`outer_deadline_ms=${OUTER_DEADLINE_MS} outer_margin_ms=${outerMarginMs} required_outer_headroom_ms=${REQUIRED_OUTER_HEADROOM_MS} headroom_margin_ms=${headroomMarginMs}\n`);
process.stdout.write(`maximum_active_weight=${simulation.maximumActiveWeight}\n`);
simulation.launches.forEach((launch) => {
  process.stdout.write(`launch_at_ms=${launch.atMs} task=${launch.taskId} active_weight=${launch.activeWeight}\n`);
});
process.stdout.write(`claim=${eligible ? "GO_MODEL_QUALIFIED" : "NO_GO_MODEL_BLOCKER"}\n`);
process.exitCode = eligible ? 0 : 2;
