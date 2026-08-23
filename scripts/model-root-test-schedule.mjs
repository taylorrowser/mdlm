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
  ROOT_RESOURCE_COMPATIBLE_MAXIMUM_MS,
  ROOT_RESOURCE_IDEAL_LOWER_BOUND_MS,
  ROOT_RESOURCE_LPT_MAXIMUM_MS,
  ROOT_RESOURCE_MINIMUM_AGGREGATE_CONTRACTION_MS,
  ROOT_RESOURCE_MIXED_ALLOWANCE_MS,
  ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS,
  ROOT_RESOURCE_OUTER_DEADLINE_MS,
  ROOT_RESOURCE_RAW_TARGET_MS,
  ROOT_RESOURCE_REQUIRED_HEADROOM_MS,
  ROOT_RESOURCE_ROOT_CEILING_MS,
  ROOT_RESOURCE_TOTAL_WORK_MS,
  rootResourcePlan,
} from "./root-test-resource-plan.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

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
const resourceTasks = tasks.filter((task) => task.resourceOwner === true);
const fourthTokenTasks = tasks.filter((task) => task.resourceOwner !== true);
const fourthTokenWorkMs = fourthTokenTasks
  .reduce((total, task) => total + task.estimatedDurationMs, 0);
const predictedScheduleMs = Math.max(simulation.wallMs, ROOT_RESOURCE_COMPATIBLE_MAXIMUM_MS);
const modeledRootMs = predictedScheduleMs
  + ROOT_RESOURCE_MIXED_ALLOWANCE_MS
  + ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS;
const rootMarginMs = ROOT_RESOURCE_ROOT_CEILING_MS - modeledRootMs;
const outerMarginMs = ROOT_RESOURCE_OUTER_DEADLINE_MS - modeledRootMs;
const headroomMarginMs = outerMarginMs - ROOT_RESOURCE_REQUIRED_HEADROOM_MS;
const eligible = rootMarginMs >= 0 && headroomMarginMs >= 0;

const scheduledFiles = tasks.flatMap((task) => task.files);
if (scheduledFiles.length !== rootTestManifest.length
  || new Set(scheduledFiles).size !== rootTestManifest.length) {
  throw new Error("Modeled schedule must cover every root file exactly once");
}
if (resourceTasks.length !== 27 || new Set(resourceTasks.flatMap((task) => task.files)).size !== 27) {
  throw new Error("Modeled schedule must cover all 27 resource files exactly once");
}
if (resourceTasks.some((task) => !/^resource-lpt-[123]$/.test(task.scheduleLaneId))) {
  throw new Error("Every resource task must use one of the three fixed resource lanes");
}

const status = git("status", "--short");
const identity = status === "" ? git("rev-parse", "HEAD^{tree}") : "DIRTY";
process.stdout.write(`commit=${git("rev-parse", "HEAD")} tree=${identity} clean=${status === ""}\n`);
process.stdout.write(`root_files=${rootTestManifest.length} tasks=${tasks.length} resource_tasks=${resourceTasks.length} fourth_token_tasks=${fourthTokenTasks.length} token_capacity=${ROOT_TEST_TOKEN_CAPACITY} class_concurrency_limits=${JSON.stringify(ROOT_TEST_CLASS_CONCURRENCY_LIMITS)}\n`);
process.stdout.write(`resource_total_work_ms=${ROOT_RESOURCE_TOTAL_WORK_MS} resource_lower_bound_ms=${ROOT_RESOURCE_IDEAL_LOWER_BOUND_MS} resource_lpt_maximum_ms=${ROOT_RESOURCE_LPT_MAXIMUM_MS} resource_compatible_maximum_ms=${ROOT_RESOURCE_COMPATIBLE_MAXIMUM_MS}\n`);
process.stdout.write(`raw_target_ms=${ROOT_RESOURCE_RAW_TARGET_MS} minimum_aggregate_contraction_ms=${ROOT_RESOURCE_MINIMUM_AGGREGATE_CONTRACTION_MS}\n`);
for (const lane of rootResourcePlan) {
  process.stdout.write(`resource_lane=${lane.id} predicted_ms=${lane.totalMs} files=${lane.tasks.length} tasks=${lane.tasks.map((task) => task.file).join(",")}\n`);
}
process.stdout.write(`policy=${ROOT_TEST_SCHEDULING_POLICY} simulated_schedule_ms=${simulation.wallMs} fourth_token_work_ms=${fourthTokenWorkMs} mixed_allowance_ms=${ROOT_RESOURCE_MIXED_ALLOWANCE_MS} orchestration_allowance_ms=${ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS} modeled_root_ms=${modeledRootMs}\n`);
process.stdout.write(`root_eligibility_ms=${ROOT_RESOURCE_ROOT_CEILING_MS} root_margin_ms=${rootMarginMs}\n`);
process.stdout.write(`outer_deadline_ms=${ROOT_RESOURCE_OUTER_DEADLINE_MS} outer_margin_ms=${outerMarginMs} required_outer_headroom_ms=${ROOT_RESOURCE_REQUIRED_HEADROOM_MS} headroom_margin_ms=${headroomMarginMs}\n`);
process.stdout.write(`maximum_active_weight=${simulation.maximumActiveWeight}\n`);
simulation.launches.forEach((launch) => {
  process.stdout.write(`launch_at_ms=${launch.atMs} task=${launch.taskId} active_weight=${launch.activeWeight}\n`);
});
process.stdout.write(`claim=${eligible ? "GO_MODEL_QUALIFIED" : "NO_GO_MODEL_BLOCKER"}\n`);
process.exitCode = eligible ? 0 : 2;
