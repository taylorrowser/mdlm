import { execFileSync } from "node:child_process";
import {
  FOCUSED_VITEST_STARTUP_MS,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestTasks,
  rootTestManifest,
} from "./root-test-schedule.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

const ROOT_ELIGIBILITY_MS = 540_000;
const OUTER_DEADLINE_MS = 600_000;
const REQUIRED_NON_ROOT_AND_GATE_RESERVE_MS = 90_000;
const ORCHESTRATION_ALLOWANCE_MS = 2_000;
const CONSERVATIVE_RESERVE_MS = 20_000;

const tasks = createRootTestTasks();
const simulation = simulateWeightedSchedule(tasks, { capacity: ROOT_TEST_TOKEN_CAPACITY });
const modeledRootMs = simulation.wallMs + ORCHESTRATION_ALLOWANCE_MS + CONSERVATIVE_RESERVE_MS;
const availableAfterRootMs = OUTER_DEADLINE_MS - modeledRootMs;
const eligible = modeledRootMs <= ROOT_ELIGIBILITY_MS
  && availableAfterRootMs >= REQUIRED_NON_ROOT_AND_GATE_RESERVE_MS;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const clean = git("status", "--short").length === 0;
console.log(`commit=${git("rev-parse", "HEAD")} tree=${clean ? git("rev-parse", "HEAD^{tree}") : "DIRTY"} clean=${clean}`);
console.log(`root_files=${rootTestManifest.length} tasks=${tasks.length} token_capacity=${ROOT_TEST_TOKEN_CAPACITY}`);
console.log(`focused_startup_ms=${FOCUSED_VITEST_STARTUP_MS} orchestration_allowance_ms=${ORCHESTRATION_ALLOWANCE_MS} conservative_reserve_ms=${CONSERVATIVE_RESERVE_MS}`);
console.log(`simulated_schedule_ms=${simulation.wallMs} modeled_root_ms=${modeledRootMs}`);
console.log(`root_eligibility_ms=${ROOT_ELIGIBILITY_MS} root_margin_ms=${ROOT_ELIGIBILITY_MS - modeledRootMs}`);
console.log(`outer_deadline_ms=${OUTER_DEADLINE_MS} available_after_root_ms=${availableAfterRootMs} required_non_root_and_gate_reserve_ms=${REQUIRED_NON_ROOT_AND_GATE_RESERVE_MS}`);
console.log(`maximum_active_weight=${simulation.maximumActiveWeight}`);
for (const launch of simulation.launches) {
  console.log(`launch_at_ms=${launch.atMs} task=${launch.taskId} active_weight=${launch.activeWeight}`);
}
console.log(`claim=${eligible ? "GO_ELIGIBLE_FOR_ONE_REPRESENTATIVE" : "NO_GO_MODEL_BLOCKER"}`);
if (!eligible) process.exitCode = 2;
