// Retained only to interpret the superseded 590-second safe-LPT evidence.
// Launch eligibility comes from root-test-resource-plan.mjs.
export const SAFE_LPT_LANE_COUNT = 3;
export const SAFE_LPT_ROOT_CEILING_MS = 590_000;
export const SAFE_LPT_MAX2_COMMIT = "b2e60ac152b63cbb9be10b49b5dcf7515d46dabf";
export const SAFE_LPT_MAX3_COMMIT = SAFE_LPT_MAX2_COMMIT;
export const SAFE_LPT_SPLIT_COMMIT = "e4468ec6a432fdb975df0739a0070c85cbd7b807";
// The Phase 1 test-owned cleanup contract increased from 300 + 100 ms to
// 3,000 + 1,000 ms. Preserve the historical observations below and model the
// exact 3,600 ms increase separately rather than relabeling it as measured.
export const SAFE_LPT_PHASE_1_CLEANUP_CONTRACT_DELTA_MS = 3_600;
export const SAFE_LPT_RUN_PROVENANCE = Object.freeze({
  max2: Object.freeze({
    commit: SAFE_LPT_MAX2_COMMIT,
    eventLog: "/tmp/issue-203-child-policy-class-safe.log",
    result: "/tmp/issue-203-child-policy-class-safe.json",
    status: 124,
    timedOut: true,
    wrapperWallMs: 592_067,
  }),
  max3: Object.freeze({
    commit: SAFE_LPT_MAX3_COMMIT,
    eventLog: "/tmp/issue-203-safe-max3.log",
    result: "/tmp/issue-203-safe-max3.json",
    status: 124,
    timedOut: true,
    wrapperWallMs: 592_250,
  }),
  restrictiveSplit: Object.freeze({
    commit: SAFE_LPT_SPLIT_COMMIT,
    eventLog: "/tmp/issue-203-split-policy-lane-safe-restrictive.log",
    result: "/tmp/issue-203-split-policy-lane-safe-restrictive.json",
    status: 124,
    timedOut: true,
    wrapperWallMs: 592_210,
  }),
  lightSplit: Object.freeze({
    commit: SAFE_LPT_SPLIT_COMMIT,
    eventLog: "/tmp/issue-203-split-policy-lane-safe-light.log",
    result: "/tmp/issue-203-split-policy-lane-safe-light.json",
    status: 1,
    timedOut: false,
    wrapperWallMs: 22_166,
  }),
});

const laneIds = Object.freeze(
  Array.from({ length: SAFE_LPT_LANE_COUNT }, (_, index) => `safe-lpt-${index + 1}`),
);

// Safe test sources are byte-identical between the max-2/max-3 commit and the
// planning commit (`git diff b2e60ac..e4468ec -- test` is empty). A pass
// duration is successful Vitest elapsed time from the named immutable run.
// Canceled, failed, and unadmitted outcomes are retained as status evidence
// only and never become successful timing inputs.
const evidence = [
  ["test/phase-0-corrected-gate-route.test.ts", "process-repository-safe", "process/repository", 85_291, ["pass", 79_880], ["pass", 125_060], ["pass", 177_060]],
  ["test/phase-0-intent-candidate-currentness-route.test.ts", "process-repository-safe", "process/repository", 72_074, ["pass", 88_280], ["pass", 88_340], ["pass", 137_270]],
  ["test/load-scenario-participation.test.ts", "canonical-evaluator-safe", "canonical/evaluator", 70_789, ["pass", 112_360], ["pass", 183_740], ["canceled", null]],
  ["test/mdlm-command-application.test.ts", "process-repository-safe", "process/repository", 63_686, ["pass", 94_310], ["pass", 127_930], ["pass", 94_080]],
  ["test/mdlm-clean-onboarding-transaction.test.ts", "process-repository-safe", "process/repository", 58_206, ["pass", 90_230], ["pass", 125_440], ["pass", 92_150]],
  ["test/mdlm-assignment-state.test.ts", "process-repository-safe", "process/repository", 57_581, ["pass", 121_500], ["pass", 159_940], ["pass", 126_480]],
  ["test/mdlm-init.test.ts", "process-repository-safe", "process/repository", 55_478, ["pass", 91_840], ["pass", 125_550], ["pass", 94_240]],
  ["test/operator-outcome.test.ts", "process-repository-safe", "process/repository", 51_114, ["pass", 96_190], ["pass", 133_670], ["canceled", null]],
  ["test/mdlm-process-expression.test.ts", "process-repository-safe", "process/repository", 47_352, ["pass", 83_700], ["pass", 126_460], ["canceled", null]],
  ["test/initial-product-intent-route.test.ts", "process-repository-safe", "process/repository", 46_607, ["canceled", null], ["canceled", null], ["unadmitted", null]],
  ["test/initial-product-intent-resolution.test.ts", "process-repository-safe", "process/repository", 36_894, ["canceled", null], ["canceled", null], ["unadmitted", null]],
  ["test/mdlm-schema.test.ts", "process-repository-safe", "process/repository", 33_817, ["unadmitted", null], ["canceled", null], ["unadmitted", null]],
  ["test/selected-package-cache.test.ts", "process-repository-safe", "process/repository", 29_228, ["unadmitted", null], ["unadmitted", null], ["unadmitted", null]],
  ["test/mdlm-repository-inspection.test.ts", "process-repository-safe", "process/repository", 25_853, ["unadmitted", null], ["unadmitted", null], ["unadmitted", null]],
  ["test/mdlm-pilot-assessment.test.ts", "process-repository-safe", "process/repository", 15_950, ["unadmitted", null], ["unadmitted", null], ["unadmitted", null]],
  ["test/evaluate-phase.test.ts", "canonical-evaluator-safe", "canonical/evaluator", 8_883, ["unadmitted", null], ["unadmitted", null], ["canceled", null]],
  ["test/evaluate-scoped-obligation.test.ts", "canonical-evaluator-safe", "canonical/evaluator", 8_019, ["unadmitted", null], ["unadmitted", null], ["failed-hook-timeout", null]],
];

function outcome([disposition, successfulElapsedMs]) {
  const unadmitted = disposition === "unadmitted";
  return Object.freeze({
    admitted: !unadmitted,
    canceled: disposition === "canceled",
    completed: disposition === "pass" || disposition === "failed-hook-timeout",
    disposition,
    launched: !unadmitted,
    successfulElapsedMs,
  });
}

export const safeLptEvidence = Object.freeze(evidence.map(([
  file,
  runtimeClass,
  resourceOwnership,
  focusedModelFallbackMs,
  max2,
  max3,
  split,
]) => {
  const selectedBaseEstimateMs = max3[0] === "pass" ? max3[1] : focusedModelFallbackMs;
  const modeledContractDeltaMs = 0;
  return Object.freeze({
    file,
    runtimeClass,
    resourceOwnership,
    focusedModelFallbackMs,
    max2: outcome(max2),
    max3: outcome(max3),
    split: outcome(split),
    selectedBaseEstimateMs,
    modeledContractDeltaMs,
    selectedEstimateMs: selectedBaseEstimateMs + modeledContractDeltaMs,
    estimateKind: modeledContractDeltaMs > 0
      ? "observed-success-max3-plus-intentional-contract-delta"
      : max3[0] === "pass"
        ? "observed-success-max3"
        : "exact-head-focused-model-fallback",
    compatibleLaneIds: laneIds,
  });
}));

function createLptPlan(rows) {
  const lanes = laneIds.map((id) => ({ id, tasks: [], totalMs: 0 }));
  const longestFirst = [...rows].sort((left, right) =>
    right.selectedEstimateMs - left.selectedEstimateMs || left.file.localeCompare(right.file));
  for (const row of longestFirst) {
    const lane = lanes
      .filter((candidate) => row.compatibleLaneIds.includes(candidate.id))
      .sort((left, right) => left.totalMs - right.totalMs || left.id.localeCompare(right.id))[0];
    if (!lane) throw new Error(`Safe LPT task ${row.file} has no compatible lane`);
    lane.tasks.push(row);
    lane.totalMs += row.selectedEstimateMs;
  }
  return Object.freeze(lanes.map((lane) => Object.freeze({
    id: lane.id,
    totalMs: lane.totalMs,
    tasks: Object.freeze(lane.tasks),
  })));
}

export const safeLptPlan = createLptPlan(safeLptEvidence);
export const SAFE_LPT_TOTAL_WORK_MS = safeLptEvidence
  .reduce((total, entry) => total + entry.selectedEstimateMs, 0);
export const SAFE_LPT_IDEAL_LOWER_BOUND_MS = Math.ceil(
  SAFE_LPT_TOTAL_WORK_MS / SAFE_LPT_LANE_COUNT,
);
export const SAFE_LPT_PREDICTED_MAXIMUM_MS = Math.max(
  ...safeLptPlan.map((lane) => lane.totalMs),
);

const assignments = new Map(safeLptPlan.flatMap((lane) =>
  lane.tasks.map((entry, laneOrder) => [entry.file, Object.freeze({
    estimateKind: entry.estimateKind,
    estimatedDurationMs: entry.selectedEstimateMs,
    laneOrder,
    scheduleLaneId: lane.id,
  })])));

export function safeLptAssignmentFor(file) {
  return assignments.get(file);
}

if (safeLptEvidence.length !== 19 || assignments.size !== 19) {
  throw new Error("Safe LPT evidence and plan must cover exactly 19 unique files");
}
if (SAFE_LPT_PREDICTED_MAXIMUM_MS > SAFE_LPT_ROOT_CEILING_MS) {
  throw new Error(
    `Safe LPT predicted maximum ${SAFE_LPT_PREDICTED_MAXIMUM_MS} exceeds ${SAFE_LPT_ROOT_CEILING_MS}`,
  );
}
