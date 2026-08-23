import { spawnSync } from "node:child_process";
import {
  FOCUSED_VITEST_STARTUP_MS,
  ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  ROOT_TEST_SCHEDULING_POLICIES,
  ROOT_TEST_SCHEDULING_POLICY,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasks,
  rootTestManifest,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

const ROOT_ELIGIBILITY_MS = 590_000;
const OUTER_DEADLINE_MS = 600_000;
const REQUIRED_OUTER_HEADROOM_MS = 10_000;
const ORCHESTRATION_ALLOWANCE_MS = 2_000;
const CONSERVATIVE_RESERVE_MS = 20_000;
const HEAVY_PAIR_CONTENTION_ALLOWANCE_MS = 56_595;
const THREE_WAY_CONTENTION_ALLOWANCE_MS = 41_689;
const MIXED_PREDICTED_MS = 117_151;
const MIXED_OBSERVED_SCHEDULER_WALL_MS = 122_735;
const MIXED_OBSERVED_WRAPPER_WALL_MS = 122_898;
const MIXED_TEST_WORK_MS = 161_680;
const MIXED_CONTENTION_ALLOWANCE_MS = MIXED_OBSERVED_SCHEDULER_WALL_MS - MIXED_PREDICTED_MS;
const MIXED_CONTENTION_MULTIPLIER = MIXED_OBSERVED_SCHEDULER_WALL_MS / MIXED_PREDICTED_MS;

function git(...arguments_) {
  const result = spawnSync("git", arguments_, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

function countOverlapWindows(tasks, simulation, predicate) {
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

function simulatePolicy(policy) {
  const tasks = createRootTestTasks(policy);
  const simulation = simulateWeightedSchedule(tasks, {
    capacity: ROOT_TEST_TOKEN_CAPACITY,
    canAdmit: createRootTestAdmissionPolicy(policy),
    canOverlap: rootTestTasksCanOverlap,
    classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  });
  const isHeavy = (task) => task.runtimeClass === "process-repository-heavy";
  const isSafe = (task) => task.runtimeClass === "repository-public-three-way-safe";
  const heavyPairWindows = countOverlapWindows(tasks, simulation,
    (active) => active.filter(isHeavy).length >= 2);
  const mixedWindows = countOverlapWindows(tasks, simulation,
    (active) => active.some(isHeavy) && active.some(isSafe));
  const threeWayWindows = countOverlapWindows(tasks, simulation,
    (active) => active.filter(isSafe).length >= 3);
  const heavyPairAllowanceMs = heavyPairWindows > 0 ? HEAVY_PAIR_CONTENTION_ALLOWANCE_MS : 0;
  const mixedAllowanceMs = mixedWindows * MIXED_CONTENTION_ALLOWANCE_MS;
  const threeWayAllowanceMs = threeWayWindows > 0 ? THREE_WAY_CONTENTION_ALLOWANCE_MS : 0;
  const modeledRootMs = simulation.wallMs
    + heavyPairAllowanceMs
    + mixedAllowanceMs
    + threeWayAllowanceMs
    + ORCHESTRATION_ALLOWANCE_MS
    + CONSERVATIVE_RESERVE_MS;
  return {
    heavyPairAllowanceMs,
    heavyPairWindows,
    mixedAllowanceMs,
    mixedWindows,
    modeledRootMs,
    policy,
    simulation,
    tasks,
    threeWayAllowanceMs,
    threeWayWindows,
  };
}

const status = git("status", "--short");
const identity = status === "" ? git("rev-parse", "HEAD^{tree}") : "DIRTY";
const results = Object.values(ROOT_TEST_SCHEDULING_POLICIES).map(simulatePolicy);
const selected = results.reduce((best, result) => result.modeledRootMs < best.modeledRootMs ? result : best);
if (selected.policy !== ROOT_TEST_SCHEDULING_POLICY) {
  throw new Error(`Runtime policy ${ROOT_TEST_SCHEDULING_POLICY} does not match modeled winner ${selected.policy}`);
}
const rootMarginMs = ROOT_ELIGIBILITY_MS - selected.modeledRootMs;
const outerMarginMs = OUTER_DEADLINE_MS - selected.modeledRootMs;
const headroomMarginMs = outerMarginMs - REQUIRED_OUTER_HEADROOM_MS;
const eligible = rootMarginMs >= 0 && headroomMarginMs >= 0;

process.stdout.write(`commit=${git("rev-parse", "HEAD")} tree=${identity} clean=${status === ""}\n`);
process.stdout.write(`root_files=${rootTestManifest.length} tasks=${selected.tasks.length} token_capacity=${ROOT_TEST_TOKEN_CAPACITY} class_concurrency_limits=${JSON.stringify(ROOT_TEST_CLASS_CONCURRENCY_LIMITS)}\n`);
process.stdout.write(`focused_startup_ms=${FOCUSED_VITEST_STARTUP_MS} orchestration_allowance_ms=${ORCHESTRATION_ALLOWANCE_MS} conservative_reserve_ms=${CONSERVATIVE_RESERVE_MS}\n`);
process.stdout.write(`mixed_predicted_ms=${MIXED_PREDICTED_MS} mixed_observed_scheduler_wall_ms=${MIXED_OBSERVED_SCHEDULER_WALL_MS} mixed_observed_wrapper_wall_ms=${MIXED_OBSERVED_WRAPPER_WALL_MS} mixed_test_work_ms=${MIXED_TEST_WORK_MS}\n`);
process.stdout.write(`mixed_contention_multiplier=${MIXED_CONTENTION_MULTIPLIER.toFixed(6)} mixed_contention_allowance_ms=${MIXED_CONTENTION_ALLOWANCE_MS}\n`);
for (const result of results) {
  process.stdout.write(`policy=${result.policy} simulated_schedule_ms=${result.simulation.wallMs} heavy_pair_windows=${result.heavyPairWindows} heavy_pair_allowance_ms=${result.heavyPairAllowanceMs} mixed_windows=${result.mixedWindows} mixed_allowance_ms=${result.mixedAllowanceMs} three_way_windows=${result.threeWayWindows} three_way_allowance_ms=${result.threeWayAllowanceMs} modeled_root_ms=${result.modeledRootMs}\n`);
}
process.stdout.write(`selected_policy=${selected.policy} modeled_root_ms=${selected.modeledRootMs}\n`);
process.stdout.write(`root_eligibility_ms=${ROOT_ELIGIBILITY_MS} root_margin_ms=${rootMarginMs}\n`);
process.stdout.write(`outer_deadline_ms=${OUTER_DEADLINE_MS} outer_margin_ms=${outerMarginMs} required_outer_headroom_ms=${REQUIRED_OUTER_HEADROOM_MS} headroom_margin_ms=${headroomMarginMs}\n`);
process.stdout.write(`maximum_active_weight=${selected.simulation.maximumActiveWeight}\n`);
selected.simulation.launches.forEach((launch) => {
  process.stdout.write(`launch_at_ms=${launch.atMs} task=${launch.taskId} active_weight=${launch.activeWeight}\n`);
});
process.stdout.write(`claim=${eligible ? "GO_MODEL_QUALIFIED" : "NO_GO_MODEL_BLOCKER"}\n`);
process.exitCode = eligible ? 0 : 2;
