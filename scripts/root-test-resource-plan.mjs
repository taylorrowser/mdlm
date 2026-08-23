import { safeLptEvidence } from "./root-test-safe-lpt-plan.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

export const ROOT_RESOURCE_LANE_COUNT = 3;
export const ROOT_RESOURCE_MIXED_ALLOWANCE_MS = 55_079;
export const ROOT_RESOURCE_MIXED_ALLOWANCE_PROVENANCE = Object.freeze({
  allowanceMs: ROOT_RESOURCE_MIXED_ALLOWANCE_MS,
  cohort: [
    "test/mdlm-assignment.test.ts",
    "test/proportional-distinct-context-phase-2-public.test.ts",
    "test/phase-1-hardening-routes.test.ts",
  ],
  disposition: "pass",
  observedSchedulerWallMs: 177_442,
  source: "/tmp/issue-203-mixed-overlap-evidence-ledger.md",
  status: 0,
});
export const ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS = 2_000;
export const ROOT_RESOURCE_ROOT_CEILING_MS = 590_000;
export const ROOT_RESOURCE_OUTER_DEADLINE_MS = 600_000;
export const ROOT_RESOURCE_REQUIRED_HEADROOM_MS = 10_000;
export const ROOT_RESOURCE_PHASE_1_CONTRACT_DELTA_MS = 3_600;

const SAFE_PARTITION_COMMIT = "3e0437b9204229eb94853d90345dc86861cc7a28";
const CLASS_SOURCE_COMMIT = "e4468ec6a432fdb975df0739a0070c85cbd7b807";
const SAFE_PARTITION_SOURCE = "/tmp/issue-203-safe-lpt-partition.log";
const HEAVY_CLASS_SOURCE = "/tmp/issue-203-split-policy-lane-heavy.log";
const FRAGILE_CLASS_SOURCE = "/tmp/issue-203-split-policy-lane-fragile.log";

export const ROOT_RESOURCE_RUN_PROVENANCE = Object.freeze({
  successful: [
    { commit: SAFE_PARTITION_COMMIT, disposition: "pass", source: SAFE_PARTITION_SOURCE, status: 0, selected: true },
    { commit: CLASS_SOURCE_COMMIT, disposition: "pass", source: HEAVY_CLASS_SOURCE, status: 0, selected: true },
    { commit: CLASS_SOURCE_COMMIT, disposition: "pass", source: FRAGILE_CLASS_SOURCE, status: 0, selected: true },
  ],
  authoritative: [
    {
      commit: SAFE_PARTITION_COMMIT,
      disposition: "failed",
      source: "/tmp/issue-203-authoritative.log",
      status: 1,
      wallMs: 276_743,
      selected: false,
      censoredBy: "phase-1 assertion failure after parent-term-observed without partial-before-timeout",
    },
    {
      commit: "c4f254b71a26658ba58f4b5872509d08806a9b4c",
      disposition: "failed-timeout",
      source: "/tmp/issue-203-authoritative-relaunch.log",
      status: 1,
      wallMs: 563_640,
      selected: false,
      censoredBy: "clean-onboarding 180000ms timeout under invalid four-resource admission",
    },
  ],
});

const safeRows = [
  ["test/evaluate-phase.test.ts", 25_070],
  ["test/evaluate-scoped-obligation.test.ts", 12_880],
  ["test/initial-product-intent-resolution.test.ts", 78_770],
  ["test/initial-product-intent-route.test.ts", 72_040],
  ["test/load-scenario-participation.test.ts", 70_510],
  ["test/mdlm-assignment-state.test.ts", 63_670],
  ["test/mdlm-clean-onboarding-transaction.test.ts", 52_690],
  ["test/mdlm-command-application.test.ts", 53_310],
  ["test/mdlm-init.test.ts", 54_880],
  ["test/mdlm-pilot-assessment.test.ts", 36_630],
  ["test/mdlm-process-expression.test.ts", 46_660],
  ["test/mdlm-repository-inspection.test.ts", 76_640],
  ["test/mdlm-schema.test.ts", 80_760],
  ["test/operator-outcome.test.ts", 56_190],
  ["test/phase-0-corrected-gate-route.test.ts", 151_630],
  ["test/phase-0-intent-candidate-currentness-route.test.ts", 72_920],
  ["test/phase-1-hardening-routes.test.ts", 108_380],
  ["test/phase-2-hardening-routes.test.ts", 64_700],
  ["test/selected-package-cache.test.ts", 67_830],
];

const heavyRows = [
  ["test/load-process-package.test.ts", 84_350, HEAVY_CLASS_SOURCE],
  ["test/mdlm-baseline-inspection.test.ts", 138_250, HEAVY_CLASS_SOURCE],
  ["test/mdlm-assignment.test.ts", 174_960, HEAVY_CLASS_SOURCE],
  ["test/proportional-distinct-context-phase-2-public.test.ts", 58_400, HEAVY_CLASS_SOURCE],
];

const fragileRows = [
  ["test/mdlm-clean-pilot-contract.test.ts", 78_310, FRAGILE_CLASS_SOURCE],
  ["test/mdlm-lifecycle.test.ts", 86_570, FRAGILE_CLASS_SOURCE],
  ["test/mdlm-process-migration.test.ts", 176_580, FRAGILE_CLASS_SOURCE],
  ["test/mdlm-review-assignment.test.ts", 179_040, FRAGILE_CLASS_SOURCE],
];

function successfulObservation(commit, source, elapsedMs, selected = true) {
  return Object.freeze({ commit, disposition: "pass", elapsedMs, selected, source, status: 0 });
}

const historicalSafeByFile = new Map(safeLptEvidence.map((entry) => [entry.file, entry]));
const historicalSafeRuns = [
  ["max2", "b2e60ac152b63cbb9be10b49b5dcf7515d46dabf", "/tmp/issue-203-child-policy-class-safe.log"],
  ["max3", "b2e60ac152b63cbb9be10b49b5dcf7515d46dabf", "/tmp/issue-203-safe-max3.log"],
  ["split", CLASS_SOURCE_COMMIT, "/tmp/issue-203-split-policy-lane-safe-restrictive.log"],
];

function historicalSafeObservations(file) {
  const row = historicalSafeByFile.get(file);
  return historicalSafeRuns.map(([run, commit, source]) => Object.freeze({
    commit,
    disposition: row[run].disposition,
    elapsedMs: row[run].disposition === "pass" ? row[run].successfulElapsedMs : null,
    selected: false,
    source,
    status: row[run].disposition === "pass" ? 0 : null,
  }));
}

function evidenceRow(file, resourceClass, elapsedMs, source, contractDeltaMs = 0, observations = []) {
  const selectedEvidence = successfulObservation(
    resourceClass === "safe" ? SAFE_PARTITION_COMMIT : CLASS_SOURCE_COMMIT,
    source,
    elapsedMs,
  );
  return Object.freeze({
    file,
    observations: Object.freeze([selectedEvidence, ...observations]),
    resourceClass,
    selectedEvidence,
    selectedEstimateMs: elapsedMs + contractDeltaMs,
    modeledContractDeltaMs: contractDeltaMs,
  });
}

export const rootResourceEvidence = Object.freeze([
  ...safeRows.map(([file, elapsedMs]) => evidenceRow(
    file,
    "safe",
    elapsedMs,
    SAFE_PARTITION_SOURCE,
    file === "test/phase-1-hardening-routes.test.ts" ? ROOT_RESOURCE_PHASE_1_CONTRACT_DELTA_MS : 0,
    historicalSafeObservations(file),
  )),
  ...heavyRows.map(([file, elapsedMs, source]) => evidenceRow(file, "heavy", elapsedMs, source)),
  ...fragileRows.map(([file, elapsedMs, source]) => evidenceRow(file, "fragile", elapsedMs, source)),
]);

function longestFirst(entries) {
  return [...entries].sort((left, right) =>
    right.selectedEstimateMs - left.selectedEstimateMs || left.file.localeCompare(right.file));
}

function placeLpt(entries, lanes) {
  for (const entry of longestFirst(entries)) {
    const lane = [...lanes]
      .sort((left, right) => left.totalMs - right.totalMs || left.id.localeCompare(right.id))[0];
    lane.tasks.push(entry);
    lane.totalMs += entry.selectedEstimateMs;
  }
}

function buildLptPlan(entries) {
  const lanes = Array.from({ length: ROOT_RESOURCE_LANE_COUNT }, (_, index) => ({
    id: `resource-lpt-${index + 1}`,
    tasks: [],
    totalMs: 0,
  }));
  const classRows = Object.groupBy(entries, (entry) => entry.resourceClass);

  // Heavy and fragile work cannot overlap. Put each class through the same two
  // lanes as an LPT barrier wave, then use all three lanes for safe work. This
  // avoids the alternating class heads and artificial serialization produced
  // by unconstrained global LPT while retaining fixed per-file lane order.
  placeLpt(classRows.fragile, lanes.slice(0, 2));
  placeLpt(classRows.heavy, lanes.slice(0, 2));
  placeLpt(classRows.safe, lanes);

  return lanes.map((lane) => Object.freeze({ ...lane, tasks: Object.freeze(lane.tasks) }));
}

export const rootResourcePlan = Object.freeze(buildLptPlan(rootResourceEvidence));

const assignments = new Map(rootResourcePlan.flatMap((lane) =>
  lane.tasks.map((entry, laneOrder) => [entry.file, Object.freeze({
    estimatedDurationMs: entry.selectedEstimateMs,
    resourceClass: entry.resourceClass,
    resourceOwner: true,
    scheduleLaneId: lane.id,
    laneOrder,
  })])));

export function rootResourceAssignment(file) {
  return assignments.get(file);
}

function precedingLaneTaskPending(candidate, pendingTasks) {
  return pendingTasks.some((pending) =>
    pending.resourceOwner === true
      && pending.scheduleLaneId === candidate.scheduleLaneId
      && pending.laneOrder < candidate.laneOrder);
}

function resourceClassOf(task) {
  if (task.resourceClass) return task.resourceClass;
  if (task.runtimeClass === "process-repository-heavy") return "heavy";
  if (task.runtimeClass === "repository-public-fragile") return "fragile";
  return "safe";
}

export function rootResourceTaskCanOverlap(left, right) {
  const classes = new Set([resourceClassOf(left), resourceClassOf(right)]);
  return !(classes.has("heavy") && classes.has("fragile"));
}

export function createRootResourceAdmissionPolicy() {
  return (candidate, { pendingTasks, runningTasks }) => {
    if (candidate.resourceOwner !== true) return true;
    if (!/^resource-lpt-[123]$/.test(candidate.scheduleLaneId)
      || !Number.isInteger(candidate.laneOrder)
      || candidate.laneOrder < 0) return false;
    if (runningTasks.filter((task) => task.resourceOwner === true).length >= ROOT_RESOURCE_LANE_COUNT) return false;
    if (runningTasks.some((task) => task.scheduleLaneId === candidate.scheduleLaneId)) return false;
    return !precedingLaneTaskPending(candidate, pendingTasks);
  };
}

const resourceSimulationTasks = rootResourceEvidence.map((entry) => ({
  id: entry.file,
  runtimeClass: `resource-${entry.resourceClass}`,
  weight: 1,
  ...rootResourceAssignment(entry.file),
})).sort((left, right) =>
  right.estimatedDurationMs - left.estimatedDurationMs || left.id.localeCompare(right.id));

export const rootResourceSimulation = Object.freeze(simulateWeightedSchedule(resourceSimulationTasks, {
  capacity: ROOT_RESOURCE_LANE_COUNT,
  canAdmit: createRootResourceAdmissionPolicy(),
  canOverlap: rootResourceTaskCanOverlap,
  classConcurrencyLimits: {
    "resource-heavy": 2,
    "resource-fragile": 2,
    "resource-safe": 3,
  },
}));

export const ROOT_RESOURCE_TOTAL_WORK_MS = rootResourceEvidence
  .reduce((total, entry) => total + entry.selectedEstimateMs, 0);
export const ROOT_RESOURCE_IDEAL_LOWER_BOUND_MS = Math.ceil(
  ROOT_RESOURCE_TOTAL_WORK_MS / ROOT_RESOURCE_LANE_COUNT,
);
export const ROOT_RESOURCE_LPT_MAXIMUM_MS = Math.max(...rootResourcePlan.map((lane) => lane.totalMs));
export const ROOT_RESOURCE_COMPATIBLE_MAXIMUM_MS = rootResourceSimulation.wallMs;
export const ROOT_RESOURCE_RAW_TARGET_MS = ROOT_RESOURCE_ROOT_CEILING_MS
  - ROOT_RESOURCE_MIXED_ALLOWANCE_MS
  - ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS;
export const ROOT_RESOURCE_MINIMUM_AGGREGATE_CONTRACTION_MS = Math.max(
  0,
  ROOT_RESOURCE_TOTAL_WORK_MS - ROOT_RESOURCE_RAW_TARGET_MS * ROOT_RESOURCE_LANE_COUNT,
);
