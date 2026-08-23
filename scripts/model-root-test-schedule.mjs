import { execFileSync } from "node:child_process";
import {
  FOCUSED_VITEST_STARTUP_MS,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestTasks,
  rootTestManifest,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

const ROOT_ELIGIBILITY_MS = 540_000;
const OUTER_DEADLINE_MS = 600_000;
const REQUIRED_NON_ROOT_AND_GATE_RESERVE_MS = 60_000;
const ORCHESTRATION_ALLOWANCE_MS = 2_000;
const CONSERVATIVE_RESERVE_MS = 20_000;
const REPRESENTATIVE_PREDICTED_MS = 144_100;
const REPRESENTATIVE_OBSERVED_WALL_MS = 131_170;
const REPRESENTATIVE_TEST_WORK_MS = 204_762;
const REPRESENTATIVE_CONTENTION_MULTIPLIER = Math.max(
  1,
  REPRESENTATIVE_OBSERVED_WALL_MS / REPRESENTATIVE_PREDICTED_MS,
);
const HEAVY_PAIR_FOCUSED_PARALLEL_FLOOR_MS = Math.max(122_363, 116_198);
const HEAVY_PAIR_OBSERVED_SCHEDULER_WALL_MS = 178_958;
const HEAVY_PAIR_OBSERVED_WRAPPER_WALL_MS = 180_229;
const HEAVY_PAIR_TEST_WORK_MS = 312_590;
const HEAVY_PAIR_CONTENTION_MULTIPLIER = Math.max(
  1,
  HEAVY_PAIR_OBSERVED_SCHEDULER_WALL_MS / HEAVY_PAIR_FOCUSED_PARALLEL_FLOOR_MS,
);
const HEAVY_PAIR_CONTENTION_ALLOWANCE_MS = Math.max(
  0,
  HEAVY_PAIR_OBSERVED_SCHEDULER_WALL_MS - HEAVY_PAIR_FOCUSED_PARALLEL_FLOOR_MS,
);

const tasks = createRootTestTasks().map((task) => ({
  ...task,
  estimatedDurationMs: Math.ceil(task.estimatedDurationMs * REPRESENTATIVE_CONTENTION_MULTIPLIER),
}));
const simulation = simulateWeightedSchedule(tasks, {
  capacity: ROOT_TEST_TOKEN_CAPACITY,
  canOverlap: rootTestTasksCanOverlap,
});
const criticalContributors = rootTestManifest
  .filter((entry) => ["process-repository-heavy", "repository-public-sensitive"].includes(entry.runtimeClass))
  .sort((left, right) => right.measuredDurationMs - left.measuredDurationMs || left.file.localeCompare(right.file))
  .slice(0, 10);
// The simulator overlaps the selected assignment and proportional tasks at zero
// cost. Replace that prediction with their exact-current measured grouped wall.
const modeledRootMs = simulation.wallMs
  + HEAVY_PAIR_CONTENTION_ALLOWANCE_MS
  + ORCHESTRATION_ALLOWANCE_MS
  + CONSERVATIVE_RESERVE_MS;
const availableAfterRootMs = OUTER_DEADLINE_MS - modeledRootMs;
const eligible = modeledRootMs <= ROOT_ELIGIBILITY_MS
  && availableAfterRootMs >= REQUIRED_NON_ROOT_AND_GATE_RESERVE_MS;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const clean = git("status", "--short").length === 0;
console.log(`commit=${git("rev-parse", "HEAD")} tree=${clean ? git("rev-parse", "HEAD^{tree}") : "DIRTY"} clean=${clean}`);
console.log(`root_files=${rootTestManifest.length} tasks=${tasks.length} token_capacity=${ROOT_TEST_TOKEN_CAPACITY}`);
console.log(`focused_startup_ms=${FOCUSED_VITEST_STARTUP_MS} orchestration_allowance_ms=${ORCHESTRATION_ALLOWANCE_MS} conservative_reserve_ms=${CONSERVATIVE_RESERVE_MS}`);
console.log(`representative_predicted_ms=${REPRESENTATIVE_PREDICTED_MS} representative_observed_wall_ms=${REPRESENTATIVE_OBSERVED_WALL_MS} representative_test_work_ms=${REPRESENTATIVE_TEST_WORK_MS}`);
console.log(`representative_work_per_wall=${(REPRESENTATIVE_TEST_WORK_MS / REPRESENTATIVE_OBSERVED_WALL_MS).toFixed(3)} representative_contention_multiplier=${REPRESENTATIVE_CONTENTION_MULTIPLIER.toFixed(3)}`);
console.log(`heavy_pair_focused_parallel_floor_ms=${HEAVY_PAIR_FOCUSED_PARALLEL_FLOOR_MS} heavy_pair_observed_scheduler_wall_ms=${HEAVY_PAIR_OBSERVED_SCHEDULER_WALL_MS} heavy_pair_observed_wrapper_wall_ms=${HEAVY_PAIR_OBSERVED_WRAPPER_WALL_MS} heavy_pair_test_work_ms=${HEAVY_PAIR_TEST_WORK_MS}`);
console.log(`heavy_pair_contention_multiplier=${HEAVY_PAIR_CONTENTION_MULTIPLIER.toFixed(3)} heavy_pair_contention_allowance_ms=${HEAVY_PAIR_CONTENTION_ALLOWANCE_MS}`);
console.log(`simulated_schedule_ms=${simulation.wallMs} modeled_root_ms=${modeledRootMs}`);
console.log(`root_eligibility_ms=${ROOT_ELIGIBILITY_MS} root_margin_ms=${ROOT_ELIGIBILITY_MS - modeledRootMs}`);
console.log(`outer_deadline_ms=${OUTER_DEADLINE_MS} outer_margin_ms=${availableAfterRootMs} available_after_root_ms=${availableAfterRootMs} required_non_root_and_gate_reserve_ms=${REQUIRED_NON_ROOT_AND_GATE_RESERVE_MS}`);
console.log(`maximum_active_weight=${simulation.maximumActiveWeight}`);
for (const [index, entry] of criticalContributors.entries()) {
  console.log(`critical_resource_contributor_rank=${index + 1} task=${entry.file} class=${entry.runtimeClass} duration_ms=${entry.measuredDurationMs}`);
}
for (const launch of simulation.launches) {
  console.log(`launch_at_ms=${launch.atMs} task=${launch.taskId} active_weight=${launch.activeWeight}`);
}
console.log(`claim=${eligible ? "GO_ELIGIBLE_FOR_ONE_REPRESENTATIVE" : "NO_GO_MODEL_BLOCKER"}`);
if (!eligible) process.exitCode = 2;
