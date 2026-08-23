import { safeLptEvidence } from "./root-test-safe-lpt-plan.mjs";
import { simulateWeightedSchedule } from "./weighted-token-scheduler.mjs";

export const ROOT_RESOURCE_LANE_COUNT = 3;
export const ROOT_RESOURCE_HEAVY_ALLOWANCE_MS = 0;
export const ROOT_RESOURCE_FRAGILE_ALLOWANCE_MS = 0;
export const ROOT_RESOURCE_MIXED_ALLOWANCE_MS = 0;
export const ROOT_RESOURCE_HEAVY_PHASE_CALIBRATION = Object.freeze({
  cohort: [
    "test/mdlm-assignment.test.ts",
    "test/proportional-distinct-context-phase-2-public.test.ts",
    "test/phase-1-hardening-routes.test.ts",
  ],
  contractDeltaMs: 3_600,
  calibratedPhaseWallMs: 181_042,
  disposition: "pass",
  observedSchedulerWallMs: 177_442,
  source: "/tmp/issue-203-mixed-overlap-evidence-ledger.md",
  status: 0,
});
// Compatibility export for evidence readers. The observed wall calibrates the
// whole heavy phase; it is not an allowance to add to that phase.
export const ROOT_RESOURCE_HEAVY_ALLOWANCE_PROVENANCE = Object.freeze({
  ...ROOT_RESOURCE_HEAVY_PHASE_CALIBRATION,
  allowanceMs: 0,
});
export const ROOT_RESOURCE_FRAGILE_CALIBRATION = Object.freeze({
  cohort: [
    "test/mdlm-review-assignment.test.ts",
    "test/phase-0-corrected-gate-route.test.ts",
    "test/phase-1-hardening-routes.test.ts",
  ],
  conservativeAllowanceMs: ROOT_RESOURCE_FRAGILE_ALLOWANCE_MS,
  conservativeMultiplier: 1,
  disposition: "pass",
  focusedParallelFloorMs: 105_098,
  observedSchedulerWallMs: 104_892,
  observedWrapperWallMs: 105_049,
  source: "/tmp/issue-203-fragile-mixed-calibration.md",
  status: 0,
});
// Compatibility name retained for packet readers written against e1.
export const ROOT_RESOURCE_MIXED_ALLOWANCE_PROVENANCE =
  ROOT_RESOURCE_HEAVY_ALLOWANCE_PROVENANCE;
export const ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS = 2_000;
export const ROOT_RESOURCE_ROOT_CEILING_MS = 590_000;
export const ROOT_RESOURCE_OUTER_DEADLINE_MS = 600_000;
export const ROOT_RESOURCE_REQUIRED_HEADROOM_MS = 10_000;
export const ROOT_RESOURCE_PHASE_1_CONTRACT_DELTA_MS = 3_600;

const SAFE_PARTITION_COMMIT = "3e0437b9204229eb94853d90345dc86861cc7a28";
const CLASS_SOURCE_COMMIT = "e4468ec6a432fdb975df0739a0070c85cbd7b807";
const HEAVY_PAIR_FOCUSED_COMMIT = "b966de2d422d25c152985c368ec05e95006e388f";
const HEAVY_CONTRACT_FOCUSED_COMMIT = "a81a9ca51b0458a649eb9539844efa965cf01976";
const FRAGILE_FOCUSED_COMMIT = "af632593793368513247aed19b3f34996919340a";
const SAFE_PARTITION_SOURCE = "/tmp/issue-203-safe-lpt-partition.log";
const HEAVY_CLASS_SOURCE = "/tmp/issue-203-split-policy-lane-heavy.log";
const FRAGILE_CLASS_SOURCE = "/tmp/issue-203-split-policy-lane-fragile.log";
const FOCUSED_SOURCE = "vitest.suites.mjs";

export const ROOT_RESOURCE_RUN_PROVENANCE = Object.freeze({
  successful: [
    { commit: SAFE_PARTITION_COMMIT, disposition: "pass", source: SAFE_PARTITION_SOURCE, status: 0, selected: true },
    { commit: HEAVY_PAIR_FOCUSED_COMMIT, disposition: "pass", source: FOCUSED_SOURCE, status: 0, selected: true, resourceClass: "heavy" },
    { commit: HEAVY_CONTRACT_FOCUSED_COMMIT, disposition: "pass", source: FOCUSED_SOURCE, status: 0, selected: true, resourceClass: "heavy" },
    { commit: FRAGILE_FOCUSED_COMMIT, disposition: "pass", source: FOCUSED_SOURCE, status: 0, selected: true, resourceClass: "fragile" },
    { commit: CLASS_SOURCE_COMMIT, disposition: "pass", source: HEAVY_CLASS_SOURCE, status: 0, selected: false, reason: "unfavorable same-class contention observation" },
    { commit: CLASS_SOURCE_COMMIT, disposition: "pass", source: FRAGILE_CLASS_SOURCE, status: 0, selected: false, reason: "unfavorable same-class contention observation" },
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
  ["test/load-process-package.test.ts", 66_137, 84_350, HEAVY_PAIR_FOCUSED_COMMIT],
  ["test/mdlm-baseline-inspection.test.ts", 62_087, 138_250, HEAVY_PAIR_FOCUSED_COMMIT],
  ["test/mdlm-assignment.test.ts", 117_151, 174_960, HEAVY_CONTRACT_FOCUSED_COMMIT],
  ["test/proportional-distinct-context-phase-2-public.test.ts", 27_558, 58_400, HEAVY_CONTRACT_FOCUSED_COMMIT],
];

const fragileRows = [
  ["test/mdlm-clean-pilot-contract.test.ts", 28_026, 78_310, FRAGILE_FOCUSED_COMMIT],
  ["test/mdlm-lifecycle.test.ts", 30_161, 86_570, FRAGILE_FOCUSED_COMMIT],
  ["test/mdlm-process-migration.test.ts", 47_070, 176_580, FRAGILE_FOCUSED_COMMIT],
  ["test/mdlm-review-assignment.test.ts", 43_815, 179_040, FRAGILE_FOCUSED_COMMIT],
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

function evidenceRow(file, resourceClass, elapsedMs, source, contractDeltaMs = 0, observations = [], selectedCommit = SAFE_PARTITION_COMMIT) {
  const selectedEvidence = successfulObservation(
    selectedCommit,
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
  ...heavyRows.map(([file, elapsedMs, classElapsedMs, focusedCommit]) => evidenceRow(
    file,
    "heavy",
    elapsedMs,
    FOCUSED_SOURCE,
    0,
    [successfulObservation(CLASS_SOURCE_COMMIT, HEAVY_CLASS_SOURCE, classElapsedMs, false)],
    focusedCommit,
  )),
  ...fragileRows.map(([file, elapsedMs, classElapsedMs, focusedCommit]) => evidenceRow(
    file,
    "fragile",
    elapsedMs,
    FOCUSED_SOURCE,
    0,
    [successfulObservation(CLASS_SOURCE_COMMIT, FRAGILE_CLASS_SOURCE, classElapsedMs, false)],
    focusedCommit,
  )),
]);

function longestFirst(entries) {
  return [...entries].sort((left, right) =>
    right.selectedEstimateMs - left.selectedEstimateMs || left.file.localeCompare(right.file));
}

function phaseLane(id, role) {
  return { id, role, tasks: [], totalMs: 0 };
}

function placeLpt(entries, lanes) {
  for (const entry of longestFirst(entries)) {
    const lane = [...lanes]
      .sort((left, right) => left.totalMs - right.totalMs || left.id.localeCompare(right.id))[0];
    lane.tasks.push(entry);
    lane.totalMs += entry.selectedEstimateMs;
  }
}

function takeEntriesByFile(entries, files) {
  const byFile = new Map(entries.map((entry) => [entry.file, entry]));
  const selected = files.map((file) => {
    const entry = byFile.get(file);
    if (!entry) throw new Error(`Required phased resource task is absent: ${file}`);
    byFile.delete(file);
    return entry;
  });
  return { remaining: entries.filter((entry) => byFile.has(entry.file)), selected };
}

function placeExactMinimax(entries, lanes) {
  const rows = longestFirst(entries);
  const totals = lanes.map((lane) => lane.totalMs);
  const assignments = rows.map(() => -1);
  let bestMaximum = Number.POSITIVE_INFINITY;
  let bestAssignments;

  function search(index) {
    if (index === rows.length) {
      const maximum = Math.max(...totals);
      if (maximum < bestMaximum) {
        bestMaximum = maximum;
        bestAssignments = [...assignments];
      }
      return;
    }
    const entry = rows[index];
    const seenTotals = new Set();
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      if (seenTotals.has(totals[laneIndex])) continue;
      seenTotals.add(totals[laneIndex]);
      const nextTotal = totals[laneIndex] + entry.selectedEstimateMs;
      if (nextTotal >= bestMaximum) continue;
      totals[laneIndex] = nextTotal;
      assignments[index] = laneIndex;
      search(index + 1);
      totals[laneIndex] -= entry.selectedEstimateMs;
    }
  }

  search(0);
  if (!bestAssignments) throw new Error("Exact safe-tail partition made no progress");
  rows.forEach((entry, index) => {
    const lane = lanes[bestAssignments[index]];
    lane.tasks.push(entry);
    lane.totalMs += entry.selectedEstimateMs;
  });
}

function placeSafeWithinTarget(entries, lanes, targetMs) {
  const remaining = [];
  for (const entry of longestFirst(entries)) {
    const lane = [...lanes]
      .sort((left, right) => left.totalMs - right.totalMs || left.id.localeCompare(right.id))
      .find((candidate) => candidate.totalMs + entry.selectedEstimateMs <= targetMs);
    if (!lane) {
      remaining.push(entry);
      continue;
    }
    lane.tasks.push(entry);
    lane.totalMs += entry.selectedEstimateMs;
  }
  return remaining;
}

function freezePhase(id, order, lanes, calibratedMinimumMs = 0) {
  const frozenLanes = lanes.map((lane) => Object.freeze({
    ...lane,
    tasks: Object.freeze(lane.tasks),
  }));
  const laneMaximumMs = Math.max(...frozenLanes.map((lane) => lane.totalMs));
  return Object.freeze({
    calibratedMinimumMs,
    id,
    laneMaximumMs,
    lanes: Object.freeze(frozenLanes),
    order,
    totalMs: Math.max(laneMaximumMs, calibratedMinimumMs),
  });
}

function buildPhasedLptPlan(entries) {
  const rows = Object.groupBy(entries, (entry) => entry.resourceClass);
  let safe = longestFirst(rows.safe);

  const heavyLanes = [
    phaseLane("heavy-1", "heavy"),
    phaseLane("heavy-2", "heavy"),
    phaseLane("heavy-safe-1", "safe"),
  ];
  placeLpt(rows.heavy, heavyLanes.slice(0, 2));
  const heavySafe = takeEntriesByFile(safe, [
    "test/phase-1-hardening-routes.test.ts",
    "test/mdlm-pilot-assessment.test.ts",
    "test/evaluate-phase.test.ts",
  ]);
  safe = heavySafe.remaining;
  for (const entry of heavySafe.selected) {
    heavyLanes[2].tasks.push(entry);
    heavyLanes[2].totalMs += entry.selectedEstimateMs;
  }
  if (heavyLanes[2].totalMs > ROOT_RESOURCE_HEAVY_PHASE_CALIBRATION.calibratedPhaseWallMs) {
    throw new Error("Calibrated heavy safe lane exceeds the whole-phase bound");
  }

  const fragileLanes = [
    phaseLane("fragile-1", "fragile"),
    phaseLane("fragile-safe-1", "safe"),
    phaseLane("fragile-safe-2", "safe"),
  ];
  placeLpt(rows.fragile, fragileLanes.slice(0, 1));
  const fragileTargetMs = fragileLanes[0].totalMs;
  safe = placeSafeWithinTarget(safe, fragileLanes.slice(1), fragileTargetMs);

  const tailLanes = [
    phaseLane("safe-tail-1", "safe"),
    phaseLane("safe-tail-2", "safe"),
    phaseLane("safe-tail-3", "safe"),
  ];
  placeExactMinimax(safe, tailLanes);

  return Object.freeze([
    freezePhase(
      "two-heavy-plus-one-safe",
      0,
      heavyLanes,
      ROOT_RESOURCE_HEAVY_PHASE_CALIBRATION.calibratedPhaseWallMs,
    ),
    freezePhase("one-fragile-plus-two-safe", 1, fragileLanes),
    freezePhase("three-safe-tail", 2, tailLanes),
  ]);
}

export const rootResourcePhases = buildPhasedLptPlan(rootResourceEvidence);
export const rootResourcePlan = Object.freeze(rootResourcePhases.flatMap((phase) => phase.lanes));
const plannedEntries = rootResourcePlan.flatMap((lane) => lane.tasks);
if (plannedEntries.length !== rootResourceEvidence.length
  || new Set(plannedEntries.map((entry) => entry.file)).size !== rootResourceEvidence.length
  || rootResourceEvidence.some((entry) => !plannedEntries.includes(entry))) {
  throw new Error("Phased resource plan must assign every evidence row exactly once");
}
if (rootResourcePlan.some((lane) =>
  lane.tasks.some((entry) => entry.resourceClass !== lane.role))) {
  throw new Error("Phased resource plan assigned a task to an incompatible lane role");
}

const assignments = new Map(rootResourcePhases.flatMap((phase) =>
  phase.lanes.flatMap((lane) => lane.tasks.map((entry, laneOrder) => [entry.file, Object.freeze({
    estimatedDurationMs: entry.selectedEstimateMs,
    resourceClass: entry.resourceClass,
    resourceOwner: true,
    scheduleLaneId: lane.id,
    schedulePhaseId: phase.id,
    schedulePhaseOrder: phase.order,
    laneOrder,
  })]))));

export function rootResourceAssignment(file) {
  return assignments.get(file);
}

function precedingLaneTaskPending(candidate, pendingTasks) {
  return pendingTasks.some((pending) =>
    pending.resourceOwner === true
      && pending.scheduleLaneId === candidate.scheduleLaneId
      && pending.laneOrder < candidate.laneOrder);
}

function earlierPhasePending(candidate, tasks) {
  return tasks.some((task) =>
    task.resourceOwner === true && task.schedulePhaseOrder < candidate.schedulePhaseOrder);
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
  const phaseByLaneId = new Map(rootResourcePhases.flatMap((phase) =>
    phase.lanes.map((lane) => [lane.id, { id: phase.id, order: phase.order, role: lane.role }])));
  return (candidate, { pendingTasks, runningTasks }) => {
    if (candidate.resourceOwner !== true) return true;
    const plannedPhase = phaseByLaneId.get(candidate.scheduleLaneId);
    if (!plannedPhase
      || candidate.schedulePhaseId !== plannedPhase.id
      || candidate.schedulePhaseOrder !== plannedPhase.order
      || candidate.resourceClass !== plannedPhase.role
      || !Number.isInteger(candidate.schedulePhaseOrder)
      || !Number.isInteger(candidate.laneOrder)
      || candidate.laneOrder < 0) return false;
    if (runningTasks.filter((task) => task.resourceOwner === true).length >= ROOT_RESOURCE_LANE_COUNT) return false;
    if (earlierPhasePending(candidate, pendingTasks) || earlierPhasePending(candidate, runningTasks)) return false;
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
    "resource-fragile": 1,
    "resource-safe": 3,
  },
}));

export const ROOT_RESOURCE_TOTAL_WORK_MS = rootResourceEvidence
  .reduce((total, entry) => total + entry.selectedEstimateMs, 0);
const RESOURCE_SAFE_WORK_MS = rootResourceEvidence
  .filter((entry) => entry.resourceClass === "safe")
  .reduce((total, entry) => total + entry.selectedEstimateMs, 0);
const RESOURCE_HEAVY_WORK_MS = rootResourceEvidence
  .filter((entry) => entry.resourceClass === "heavy")
  .reduce((total, entry) => total + entry.selectedEstimateMs, 0);
const RESOURCE_FRAGILE_WORK_MS = rootResourceEvidence
  .filter((entry) => entry.resourceClass === "fragile")
  .reduce((total, entry) => total + entry.selectedEstimateMs, 0);
const RESOURCE_HEAVY_PHASE_FLOOR_MS = rootResourcePhases[0].totalMs;
const RESOURCE_FRAGILE_PHASE_FLOOR_MS = RESOURCE_FRAGILE_WORK_MS;
export const ROOT_RESOURCE_IDEAL_LOWER_BOUND_MS = Math.ceil(
  ROOT_RESOURCE_TOTAL_WORK_MS / ROOT_RESOURCE_LANE_COUNT,
);
export const ROOT_RESOURCE_BARRIER_LOWER_BOUND_MS = RESOURCE_HEAVY_PHASE_FLOOR_MS
  + RESOURCE_FRAGILE_PHASE_FLOOR_MS
  + Math.ceil(Math.max(
    0,
    RESOURCE_SAFE_WORK_MS
      - RESOURCE_HEAVY_PHASE_FLOOR_MS
      - 2 * RESOURCE_FRAGILE_PHASE_FLOOR_MS,
  ) / ROOT_RESOURCE_LANE_COUNT);
export const ROOT_RESOURCE_LPT_MAXIMUM_MS = rootResourcePhases
  .reduce((total, phase) => total + phase.totalMs, 0);
export const ROOT_RESOURCE_COMPATIBLE_MAXIMUM_MS = ROOT_RESOURCE_LPT_MAXIMUM_MS;
export const ROOT_RESOURCE_RAW_TARGET_MS = ROOT_RESOURCE_ROOT_CEILING_MS
  - ROOT_RESOURCE_MIXED_ALLOWANCE_MS
  - ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS;
export const ROOT_RESOURCE_MINIMUM_AGGREGATE_CONTRACTION_MS = Math.max(
  0,
  ROOT_RESOURCE_TOTAL_WORK_MS - ROOT_RESOURCE_RAW_TARGET_MS * ROOT_RESOURCE_LANE_COUNT,
);
