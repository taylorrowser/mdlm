import { spawnSync } from "node:child_process";
import {
  ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  ROOT_TEST_SCHEDULING_POLICY,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasks,
  rootTestManifest,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import {
  SAFE_LPT_IDEAL_LOWER_BOUND_MS,
  SAFE_LPT_PREDICTED_MAXIMUM_MS,
  SAFE_LPT_ROOT_CEILING_MS,
  SAFE_LPT_TOTAL_WORK_MS,
  safeLptPlan,
} from "./root-test-safe-lpt-plan.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

const ROOT_ELIGIBILITY_MS = SAFE_LPT_ROOT_CEILING_MS;
const OUTER_DEADLINE_MS = 600_000;
const REQUIRED_OUTER_HEADROOM_MS = 10_000;
const ORCHESTRATION_ALLOWANCE_MS = 2_000;
// Max-3 successful elapsed values already include focused startup and
// three-process contention. Keep failed/censored values out rather than
// applying the former generic reserve a second time.
const ADDITIONAL_RESERVE_MS = 0;

function git(...arguments_) {
  const result = spawnSync("git", arguments_, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

const tasks = createRootTestTasks(ROOT_TEST_SCHEDULING_POLICY);
const simulation = simulateWeightedSchedule(tasks, {
  capacity: ROOT_TEST_TOKEN_CAPACITY,
  canAdmit: createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICY),
  canOverlap: rootTestTasksCanOverlap,
  classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
});
const backgroundTasks = tasks.filter((task) => task.scheduleLaneId === "background");
const backgroundWorkMs = backgroundTasks
  .reduce((total, task) => total + task.estimatedDurationMs, 0);
const modeledRootMs = simulation.wallMs + ORCHESTRATION_ALLOWANCE_MS + ADDITIONAL_RESERVE_MS;
const rootMarginMs = ROOT_ELIGIBILITY_MS - modeledRootMs;
const outerMarginMs = OUTER_DEADLINE_MS - modeledRootMs;
const headroomMarginMs = outerMarginMs - REQUIRED_OUTER_HEADROOM_MS;
const eligible = rootMarginMs >= 0 && headroomMarginMs >= 0;

const scheduledFiles = tasks.flatMap((task) => task.files);
if (scheduledFiles.length !== rootTestManifest.length
  || new Set(scheduledFiles).size !== rootTestManifest.length) {
  throw new Error("Modeled schedule must cover every root file exactly once");
}
if (SAFE_LPT_PREDICTED_MAXIMUM_MS > ROOT_ELIGIBILITY_MS) {
  throw new Error("Safe LPT plan exceeds the root eligibility ceiling");
}

const status = git("status", "--short");
const identity = status === "" ? git("rev-parse", "HEAD^{tree}") : "DIRTY";
process.stdout.write(`commit=${git("rev-parse", "HEAD")} tree=${identity} clean=${status === ""}\n`);
process.stdout.write(`root_files=${rootTestManifest.length} tasks=${tasks.length} token_capacity=${ROOT_TEST_TOKEN_CAPACITY} class_concurrency_limits=${JSON.stringify(ROOT_TEST_CLASS_CONCURRENCY_LIMITS)}\n`);
process.stdout.write(`safe_lpt_total_work_ms=${SAFE_LPT_TOTAL_WORK_MS} safe_lpt_lower_bound_ms=${SAFE_LPT_IDEAL_LOWER_BOUND_MS} safe_lpt_predicted_maximum_ms=${SAFE_LPT_PREDICTED_MAXIMUM_MS}\n`);
for (const lane of safeLptPlan) {
  process.stdout.write(`safe_lpt_lane=${lane.id} predicted_ms=${lane.totalMs} files=${lane.tasks.length} tasks=${lane.tasks.map((task) => task.file).join(",")}\n`);
}
process.stdout.write(`policy=${ROOT_TEST_SCHEDULING_POLICY} simulated_schedule_ms=${simulation.wallMs} background_work_ms=${backgroundWorkMs} orchestration_allowance_ms=${ORCHESTRATION_ALLOWANCE_MS} additional_reserve_ms=${ADDITIONAL_RESERVE_MS} modeled_root_ms=${modeledRootMs}\n`);
process.stdout.write(`root_eligibility_ms=${ROOT_ELIGIBILITY_MS} root_margin_ms=${rootMarginMs}\n`);
process.stdout.write(`outer_deadline_ms=${OUTER_DEADLINE_MS} outer_margin_ms=${outerMarginMs} required_outer_headroom_ms=${REQUIRED_OUTER_HEADROOM_MS} headroom_margin_ms=${headroomMarginMs}\n`);
process.stdout.write(`maximum_active_weight=${simulation.maximumActiveWeight}\n`);
simulation.launches.forEach((launch) => {
  process.stdout.write(`launch_at_ms=${launch.atMs} task=${launch.taskId} active_weight=${launch.activeWeight}\n`);
});
process.stdout.write(`claim=${eligible ? "GO_MODEL_QUALIFIED" : "NO_GO_MODEL_BLOCKER"}\n`);
process.exitCode = eligible ? 0 : 2;
