import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  WeightedScheduleAbortedError,
  WeightedScheduleTaskError,
  launchProcessGroupTask,
  runWeightedSchedule,
  simulateWeightedSchedule,
} from "./weighted-token-scheduler.mjs";
import {
  CHEAP_BATCH_COUNT,
  MAX_CHEAP_FILES_PER_BATCH,
  ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  ROOT_TEST_SCHEDULING_POLICIES,
  ROOT_TEST_SCHEDULING_POLICY,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasks,
  createRootTestTasksForClass,
  rootTestManifest,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import { runInProcessGroup } from "./frontier-process-group.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function controlledLauncher() {
  const controls = new Map();
  const events = [];
  const launch = (task) => {
    const completion = deferred();
    const control = {
      completion,
      terminateCalls: 0,
      async terminate() {
        control.terminateCalls += 1;
        completion.resolve({ status: null, signal: "SIGTERM" });
      },
    };
    controls.set(task.id, control);
    events.push(task.id);
    return { completion: completion.promise, terminate: () => control.terminate() };
  };
  return { controls, events, launch };
}

test("the global resource event table selects only successful evidence for all 26 owners", async () => {
  const {
    ROOT_RESOURCE_LANE_COUNT,
    ROOT_RESOURCE_MIXED_ALLOWANCE_MS,
    ROOT_RESOURCE_RUN_PROVENANCE,
    rootResourceEvidence,
    rootResourcePhases,
    rootResourcePlan,
  } = await import("./root-test-resource-plan.mjs");
  const resourceFiles = createRootTestTasks()
    .filter((task) => task.resourceOwner === true)
    .flatMap((task) => task.files)
    .sort();

  assert.equal(ROOT_RESOURCE_LANE_COUNT, 3);
  assert.equal(ROOT_RESOURCE_MIXED_ALLOWANCE_MS, 0);
  assert.equal(rootResourceEvidence.length, 26);
  assert.deepEqual(rootResourceEvidence.map((entry) => entry.file).sort(), resourceFiles);
  assert.equal(new Set(rootResourceEvidence.map((entry) => entry.file)).size, 26);
  assert.equal(rootResourceEvidence.every((entry) =>
    entry.selectedEvidence.disposition === "pass"
      && Number.isInteger(entry.selectedEvidence.elapsedMs)
      && entry.selectedEvidence.elapsedMs > 0), true);
  assert.equal(rootResourceEvidence.every((entry) =>
    entry.observations
      .filter((observation) => observation.disposition !== "pass")
      .every((observation) => observation.elapsedMs === null && observation.selected === false)), true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(rootResourceEvidence, (entry) => entry.resourceClass))
      .map(([resourceClass, entries]) => [resourceClass, entries.length])),
    { safe: 18, heavy: 4, fragile: 4 },
  );
  assert.equal(rootResourceEvidence
    .filter((entry) => entry.resourceClass === "safe")
    .reduce((total, entry) => total + entry.selectedEvidence.elapsedMs, 0), 1_311_072);
  assert.deepEqual(
    rootResourceEvidence
      .filter((entry) => entry.resourceClass !== "safe")
      .map((entry) => [entry.file, entry.selectedEvidence.elapsedMs, entry.selectedEvidence.source]),
    [
      ["test/load-process-package.test.ts", 127_620, "/tmp/issue-203-compatibility-production-partition.log"],
      ["test/mdlm-baseline-inspection.test.ts", 92_130, "/tmp/issue-203-compatibility-production-partition.log"],
      ["test/mdlm-assignment.test.ts", 205_020, "/tmp/issue-203-compatibility-production-partition.log"],
      ["test/proportional-distinct-context-phase-2-public.test.ts", 25_730, "/tmp/issue-203-compatibility-production-partition.log"],
      ["test/mdlm-clean-pilot-contract.test.ts", 28_026, "vitest.suites.mjs"],
      ["test/mdlm-lifecycle.test.ts", 51_180, "/tmp/issue-203-compatibility-production-partition.log"],
      ["test/mdlm-process-migration.test.ts", 176_100, "/tmp/issue-203-compatibility-production-partition.log"],
      ["test/mdlm-review-assignment.test.ts", 94_320, "/tmp/issue-203-compatibility-production-partition.log"],
    ],
  );
  assert.deepEqual(
    ROOT_RESOURCE_RUN_PROVENANCE.authoritative.map(({ commit, status, selected }) => [commit, status, selected]),
    [
      ["3e0437b9204229eb94853d90345dc86861cc7a28", 1, false],
      ["c4f254b71a26658ba58f4b5872509d08806a9b4c", 1, false],
      ["342a8ad35cee17cc6c7f37646f4c96639329d8d5", 124, false],
    ],
  );
  assert.equal(rootResourcePhases.length, 3);
  assert.equal(rootResourcePlan.length, 9);
  assert.equal(rootResourcePlan.flatMap((lane) => lane.tasks).length, 26);
  assert.equal(rootResourceEvidence
    .filter((entry) => entry.resourceClass !== "safe")
    .every((entry) => entry.observations.some((observation) =>
      observation.source.includes("split-policy-lane") && observation.selected === false)), true);
});

test("the phased policy selects schedule-matched focused observations and measured allowances", async () => {
  const {
    ROOT_RESOURCE_ASSIGNMENT_STATE_CONTRACTION,
    ROOT_RESOURCE_BARRIER_LOWER_BOUND_MS,
    ROOT_RESOURCE_CURRENT_HOST_VARIANCE_ALLOWANCE_MS,
    ROOT_RESOURCE_CURRENT_HOST_VARIANCE_ALLOWANCE_PROVENANCE,
    ROOT_RESOURCE_FRAGILE_ALLOWANCE_MS,
    ROOT_RESOURCE_FRAGILE_CALIBRATION,
    ROOT_RESOURCE_HEAVY_ALLOWANCE_MS,
    ROOT_RESOURCE_HEAVY_PHASE_CALIBRATION,
    ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS,
    ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_PROVENANCE,
    rootResourceEvidence,
    rootResourcePhases,
  } = await import("./root-test-resource-plan.mjs");

  assert.equal(ROOT_RESOURCE_CURRENT_HOST_VARIANCE_ALLOWANCE_MS, 1_200_000);
  assert.deepEqual(ROOT_RESOURCE_CURRENT_HOST_VARIANCE_ALLOWANCE_PROVENANCE, {
    allowanceMs: 1_200_000,
    attempts: [
      {
        launchedTasks: 27,
        source: "/tmp/issue-205-authoritative-root.log",
        status: 124,
        wallMs: 1_152_507,
      },
      {
        launchedTasks: 26,
        source: "/tmp/issue-205-authoritative-root-third.log",
        status: 124,
        wallMs: 1_152_517,
      },
      {
        completedPackageTests: 105,
        completedRootFiles: 47,
        launchedTasks: 32,
        source: "/tmp/issue-202-final2-authoritative-root.log",
        status: 124,
        wallMs: 2_002_518,
      },
    ],
    disposition: "censored current-host lower bound; allowance only, not selected successful timing",
  });
  assert.equal(ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_MS, 1_500);
  assert.deepEqual(ROOT_RESOURCE_ORCHESTRATION_ALLOWANCE_PROVENANCE, {
    allowanceMs: 1_500,
    largestSuccessfulOverheadMs: 1_271,
    roundingMs: 229,
    successfulCohorts: [
      {
        cohort: "heavy-pair",
        overheadMs: 1_271,
        schedulerWallMs: 178_958,
        source: "/tmp/issue-203-heavy-pair-exact-current.log",
        status: 0,
        wrapperSource: "/tmp/issue-203-heavy-pair-wrapper.mjs",
        wrapperWallMs: 180_229,
      },
      {
        cohort: "representative",
        overheadMs: 134,
        schedulerWallMs: 131_170,
        source: "/tmp/issue-203-token-calibration-representative.log",
        status: 0,
        wrapperSource: "/tmp/issue-203-run-token-calibration-wrapper.mjs",
        wrapperWallMs: 131_304,
      },
      {
        cohort: "three-process",
        overheadMs: 163,
        schedulerWallMs: 122_735,
        source: "/tmp/issue-203-final-three-process-cohort.log",
        status: 0,
        wrapperSource: "/tmp/issue-203-three-process-wrapper.mjs",
        wrapperWallMs: 122_898,
      },
      {
        cohort: "fragile",
        overheadMs: 157,
        schedulerWallMs: 104_892,
        source: "/tmp/issue-203-fragile-mixed-calibration.log",
        status: 0,
        wrapperSource: "/tmp/issue-203-run-fragile-mixed-calibration-wrapper.mjs",
        wrapperWallMs: 105_049,
      },
    ],
  });
  assert.deepEqual(ROOT_RESOURCE_ASSIGNMENT_STATE_CONTRACTION, {
    after: {
      disposition: "pass",
      source: "/tmp/issue-203-assignment-state-after.log",
      status: 0,
      wallMs: 44_059,
    },
    before: {
      disposition: "pass",
      source: "/tmp/issue-203-assignment-state-before.log",
      status: 0,
      wallMs: 44_689,
    },
    measuredContractionMs: 630,
  });
  assert.deepEqual(
    (({ modeledContractDeltaMs, selectedEstimateMs, selectedEvidence }) => ({
      modeledContractDeltaMs,
      selectedEstimateMs,
      selectedEvidenceMs: selectedEvidence.elapsedMs,
    }))(rootResourceEvidence.find((entry) => entry.file === "test/mdlm-assignment-state.test.ts")),
    {
      modeledContractDeltaMs: -630,
      selectedEstimateMs: 63_040,
      selectedEvidenceMs: 63_670,
    },
  );
  assert.equal(ROOT_RESOURCE_HEAVY_ALLOWANCE_MS, 0);
  assert.deepEqual(ROOT_RESOURCE_HEAVY_PHASE_CALIBRATION, {
    cohort: [
      "test/mdlm-assignment.test.ts",
      "test/proportional-distinct-context-phase-2-public.test.ts",
      "test/phase-1-hardening-routes.test.ts",
    ],
    contractDeltaMs: 0,
    calibratedPhaseWallMs: 230_750,
    disposition: "pass",
    observedSchedulerWallMs: 230_750,
    source: "/tmp/issue-203-compatibility-production-partition.log",
    status: 0,
  });
  assert.equal(ROOT_RESOURCE_FRAGILE_ALLOWANCE_MS, 0);
  assert.deepEqual(ROOT_RESOURCE_FRAGILE_CALIBRATION, {
    cohort: [
      "test/mdlm-review-assignment.test.ts",
      "test/phase-0-corrected-gate-route.test.ts",
      "test/phase-1-hardening-routes.test.ts",
    ],
    conservativeAllowanceMs: 0,
    conservativeMultiplier: 1,
    disposition: "pass",
    focusedParallelFloorMs: 105_098,
    observedSchedulerWallMs: 104_892,
    observedWrapperWallMs: 105_049,
    source: "/tmp/issue-203-fragile-mixed-calibration.md",
    status: 0,
  });
  assert.deepEqual(
    rootResourceEvidence
      .filter((entry) => entry.resourceClass === "heavy")
      .map((entry) => [entry.file, entry.selectedEstimateMs, entry.selectedEvidence.commit]),
    [
      ["test/load-process-package.test.ts", 127_620, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
      ["test/mdlm-baseline-inspection.test.ts", 92_130, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
      ["test/mdlm-assignment.test.ts", 205_020, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
      ["test/proportional-distinct-context-phase-2-public.test.ts", 25_730, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
    ],
  );
  assert.deepEqual(
    rootResourceEvidence
      .filter((entry) => entry.resourceClass === "fragile")
      .map((entry) => [entry.file, entry.selectedEstimateMs, entry.selectedEvidence.commit]),
    [
      ["test/mdlm-clean-pilot-contract.test.ts", 28_026, "af632593793368513247aed19b3f34996919340a"],
      ["test/mdlm-lifecycle.test.ts", 51_180, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
      ["test/mdlm-process-migration.test.ts", 176_100, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
      ["test/mdlm-review-assignment.test.ts", 94_320, "342a8ad35cee17cc6c7f37646f4c96639329d8d5"],
    ],
  );
  assert.deepEqual(rootResourcePhases.map((phase) => phase.id), [
    "two-heavy-plus-one-safe",
    "one-fragile-plus-two-safe",
    "three-safe-tail",
  ]);
  assert.deepEqual(rootResourcePhases.map((phase) => phase.totalMs), [230_750, 349_626, 261_570]);
  assert.deepEqual(
    rootResourcePhases[0].lanes.find((lane) => lane.role === "safe").tasks.map((entry) => entry.file),
    [
      "test/phase-1-hardening-routes.test.ts",
      "test/mdlm-pilot-assessment.test.ts",
      "test/evaluate-phase.test.ts",
    ],
  );
  assert.deepEqual(
    rootResourcePhases[2].lanes.map((lane) => lane.totalMs).sort((left, right) => left - right),
    [212_702, 260_630, 261_570],
  );
  assert.equal(Number.isInteger(ROOT_RESOURCE_BARRIER_LOWER_BOUND_MS), true);
});

test("the safe-LPT tail contract orders and overlaps the intent route compatibly", async () => {
  const {
    ROOT_RESOURCE_TAIL_COMPATIBILITY,
  } = await import("./root-test-resource-plan.mjs");
  const tasks = createRootTestTasks();
  const simulation = simulateWeightedSchedule(tasks, {
    capacity: ROOT_TEST_TOKEN_CAPACITY,
    canAdmit: createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICY),
    canOverlap: rootTestTasksCanOverlap,
    classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const intervalById = new Map(simulation.launches.map((launch) => [
    launch.taskId,
    {
      endMs: launch.atMs + taskById.get(launch.taskId).estimatedDurationMs,
      startMs: launch.atMs,
    },
  ]));
  const routeId = "test/initial-product-intent-route.test.ts";
  const assignmentId = "test/mdlm-assignment-state.test.ts";
  const cleanId = "test/mdlm-clean-onboarding-transaction.test.ts";
  const route = intervalById.get(routeId);
  const overlapsRoute = (taskId) => {
    const interval = intervalById.get(taskId);
    return interval.startMs < route.endMs && route.startMs < interval.endMs;
  };

  assert.deepEqual(ROOT_RESOURCE_TAIL_COMPATIBILITY, {
    source: "/tmp/issue-203-safe-lpt-partition.log",
    orderedLane: [assignmentId, cleanId, routeId],
    completesBeforeRoute: [
      assignmentId,
      cleanId,
      "test/mdlm-command-application.test.ts",
    ],
    overlapsRoute: [
      "test/mdlm-process-expression.test.ts",
      "test/phase-0-intent-candidate-currentness-route.test.ts",
    ],
  });
  assert.equal(taskById.get(assignmentId).scheduleLaneId, taskById.get(routeId).scheduleLaneId);
  assert.equal(taskById.get(cleanId).scheduleLaneId, taskById.get(routeId).scheduleLaneId);
  for (const taskId of ROOT_RESOURCE_TAIL_COMPATIBILITY.completesBeforeRoute) {
    assert.equal(intervalById.get(taskId).endMs <= route.startMs, true, taskId);
  }
  for (const taskId of ROOT_RESOURCE_TAIL_COMPATIBILITY.overlapsRoute) {
    assert.equal(overlapsRoute(taskId), true, taskId);
  }
});

test("production construction admits no fourth resource owner", () => {
  const tasks = createRootTestTasks();
  const resourceTasks = tasks.filter((task) => task.resourceOwner === true);
  const simulation = simulateWeightedSchedule(tasks, {
    capacity: ROOT_TEST_TOKEN_CAPACITY,
    canAdmit: createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICY),
    canOverlap: rootTestTasksCanOverlap,
    classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const resourceIntervals = simulation.launches
    .filter((launch) => taskById.get(launch.taskId).resourceOwner === true)
    .map((launch) => ({
      endMs: launch.atMs + taskById.get(launch.taskId).estimatedDurationMs,
      resourceClass: taskById.get(launch.taskId).resourceClass,
      startMs: launch.atMs,
    }));
  const eventTimes = resourceIntervals.flatMap((interval) => [interval.startMs, interval.endMs]);
  const maximumActiveResources = Math.max(...eventTimes.map((atMs) =>
    resourceIntervals.filter((interval) => interval.startMs <= atMs && atMs < interval.endMs).length));
  const incompatibleOverlap = resourceIntervals.some((left) => resourceIntervals.some((right) =>
    left.resourceClass === "heavy"
      && right.resourceClass === "fragile"
      && left.startMs < right.endMs
      && right.startMs < left.endMs));
  const activeClassMaximum = (resourceClass) => Math.max(...eventTimes.map((atMs) =>
    resourceIntervals.filter((interval) =>
      interval.resourceClass === resourceClass
        && interval.startMs <= atMs
        && atMs < interval.endMs).length));
  const launchesByPhase = Object.groupBy(
    simulation.launches.filter((launch) => taskById.get(launch.taskId).resourceOwner === true),
    (launch) => taskById.get(launch.taskId).schedulePhaseOrder,
  );
  const phaseWindows = Object.entries(launchesByPhase).map(([order, launches]) => ({
    order: Number(order),
    startMs: Math.min(...launches.map((launch) => launch.atMs)),
    endMs: Math.max(...launches.map((launch) =>
      launch.atMs + taskById.get(launch.taskId).estimatedDurationMs)),
  })).sort((left, right) => left.order - right.order);

  assert.equal(resourceTasks.length, 26);
  assert.equal(resourceTasks.every((task) =>
    ["two-heavy-plus-one-safe", "one-fragile-plus-two-safe", "three-safe-tail"]
      .includes(task.schedulePhaseId)), true);
  assert.equal(resourceTasks.every((task) => Number.isInteger(task.schedulePhaseOrder)), true);
  assert.equal(maximumActiveResources, 3);
  assert.equal(activeClassMaximum("heavy"), 2);
  assert.equal(activeClassMaximum("fragile"), 1);
  assert.equal(activeClassMaximum("safe"), 3);
  assert.equal(incompatibleOverlap, false);
  assert.deepEqual(phaseWindows.map((window) => window.order), [0, 1, 2]);
  assert.equal(phaseWindows.every((window, index) =>
    index === 0 || phaseWindows[index - 1].endMs <= window.startMs), true);
  assert.equal(resourceTasks.find((task) => task.id === "test/load-scenario-participation.test.ts")?.resourceOwner, true);
  assert.equal(tasks.find((task) => task.id === "test/evaluate-scoped-obligation.test.ts")?.resourceOwner, false);
  assert.equal(tasks.filter((task) => task.resourceOwner !== true).every((task) =>
    ["canonical-evaluator-safe", "canonical-fixture-filler", "cheap-in-process"].includes(task.runtimeClass)), true);
  assert.equal(simulation.maximumActiveWeight <= 4, true);
});

test("the root manifest classifies all 47 files once with bounded weights and cheap batches", async () => {
  const discovered = (await readdir(new URL("../test", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => `test/${entry.name}`)
    .sort();
  const declared = rootTestManifest.map((entry) => entry.file);

  assert.equal(ROOT_TEST_TOKEN_CAPACITY, 4);
  assert.deepEqual(ROOT_TEST_CLASS_CONCURRENCY_LIMITS, {
    "process-repository-heavy": 2,
    "repository-public-fragile": 1,
    "process-repository-safe": 3,
    "canonical-evaluator-safe": 3,
    "canonical-fixture-filler": 1,
    "cheap-in-process": 1,
  });
  assert.equal(rootTestManifest.length, 47);
  assert.equal(new Set(declared).size, 47);
  assert.deepEqual([...declared].sort(), discovered);
  for (const entry of rootTestManifest) {
    assert.equal(Number.isInteger(entry.weight) && entry.weight > 0 && entry.weight <= ROOT_TEST_TOKEN_CAPACITY, true);
    assert.equal(Number.isInteger(entry.measuredDurationMs) && entry.measuredDurationMs > 0, true);
    assert.match(entry.runtimeClass, /^(process-repository-heavy|repository-public-fragile|process-repository-safe|canonical-evaluator-safe|canonical-fixture-filler|cheap-in-process)$/);
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(rootTestManifest, (entry) => entry.runtimeClass))
      .map(([runtimeClass, entries]) => [runtimeClass, `${entries.length}@${entries[0].weight}`])),
    {
      "process-repository-heavy": "4@1",
      "repository-public-fragile": "4@1",
      "process-repository-safe": "16@1",
      "canonical-evaluator-safe": "3@1",
      "canonical-fixture-filler": "3@1",
      "cheap-in-process": "17@1",
    },
  );
  assert.deepEqual(
    rootTestManifest.filter((entry) => entry.runtimeClass === "canonical-fixture-filler").map((entry) => entry.file),
    [
      "test/dependency-changes.test.ts",
      "test/phase-0-hardening-routes.test.ts",
      "test/proportional-phase-2-public.test.ts",
    ],
  );
  assert.equal(rootTestTasksCanOverlap(
    { runtimeClass: "process-repository-heavy" },
    { runtimeClass: "repository-public-fragile" },
  ), false);
  assert.equal(rootTestTasksCanOverlap(
    { runtimeClass: "process-repository-heavy" },
    { runtimeClass: "process-repository-safe" },
  ), true);
  assert.equal(rootTestTasksCanOverlap(
    { runtimeClass: "process-repository-safe" },
    { runtimeClass: "canonical-evaluator-safe" },
  ), true);
  assert.equal(rootTestTasksCanOverlap(
    { runtimeClass: "process-repository-heavy" },
    { runtimeClass: "process-repository-heavy" },
  ), true);
  assert.equal(rootTestTasksCanOverlap(
    { runtimeClass: "process-repository-heavy" },
    { runtimeClass: "canonical-fixture-filler" },
  ), true);

  const tasks = createRootTestTasks();
  const scheduledFiles = tasks.flatMap((task) => task.files);
  const cheapBatches = tasks.filter((task) => task.runtimeClass === "cheap-in-process");
  assert.equal(cheapBatches.length, CHEAP_BATCH_COUNT);
  assert.equal(cheapBatches.every((task) => task.files.length <= MAX_CHEAP_FILES_PER_BATCH), true);
  assert.equal(tasks.filter((task) => task.runtimeClass !== "cheap-in-process").every((task) => task.files.length === 1), true);
  assert.deepEqual([...scheduledFiles].sort(), discovered);
  assert.equal(new Set(scheduledFiles).size, 47);
});

test("canonical filler aliases resolve through the production task path", () => {
  const expectedIds = [
    "test/dependency-changes.test.ts",
    "test/phase-0-hardening-routes.test.ts",
    "test/proportional-phase-2-public.test.ts",
  ];
  const canonical = createRootTestTasksForClass("canonical-fixture-filler");
  const acceptedAlias = createRootTestTasksForClass("canonical-filler");

  assert.deepEqual(canonical.map((task) => task.id).sort(), expectedIds);
  assert.deepEqual(acceptedAlias.map((task) => task.id).sort(), expectedIds);
  assert.deepEqual(acceptedAlias, canonical);
  assert.equal(canonical.every((task) => task.runtimeClass === "canonical-fixture-filler"), true);
  assert.deepEqual(createRootTestTasksForClass("canonical-fixture-fillers"), []);
});

test("exact-current safe ownership retains focused fallbacks without using failed timings", () => {
  assert.deepEqual(
    rootTestManifest
      .filter((entry) => entry.runtimeClass === "canonical-evaluator-safe")
      .map(({ file, weight, measuredDurationMs }) => [file, weight, measuredDurationMs]),
    [
      ["test/evaluate-phase.test.ts", 1, 8_883],
      ["test/evaluate-scoped-obligation.test.ts", 1, 8_019],
      ["test/load-scenario-participation.test.ts", 1, 53_552],
    ],
  );
  assert.deepEqual(
    rootTestManifest
      .filter((entry) => entry.runtimeClass === "process-repository-safe")
      .map(({ file, weight, measuredDurationMs }) => [file, weight, measuredDurationMs]),
    [
      ["test/initial-product-intent-resolution.test.ts", 1, 36_894],
      ["test/initial-product-intent-route.test.ts", 1, 46_607],
      ["test/mdlm-assignment-state.test.ts", 1, 44_059],
      ["test/mdlm-clean-onboarding-transaction.test.ts", 1, 58_206],
      ["test/mdlm-command-application.test.ts", 1, 63_686],
      ["test/mdlm-init.test.ts", 1, 55_478],
      ["test/mdlm-pilot-assessment.test.ts", 1, 15_950],
      ["test/mdlm-process-expression.test.ts", 1, 47_352],
      ["test/mdlm-repository-inspection.test.ts", 1, 25_853],
      ["test/mdlm-schema.test.ts", 1, 33_817],
      ["test/operator-outcome.test.ts", 1, 51_114],
      ["test/phase-0-corrected-gate-route.test.ts", 1, 85_291],
      ["test/phase-0-intent-candidate-currentness-route.test.ts", 1, 72_074],
      ["test/phase-1-hardening-routes.test.ts", 1, 105_098],
      ["test/phase-2-hardening-routes.test.ts", 1, 59_745],
      ["test/selected-package-cache.test.ts", 1, 22_915],
    ],
  );
  assert.deepEqual(
    rootTestManifest
      .filter((entry) => entry.runtimeClass === "repository-public-fragile")
      .map(({ file, measuredDurationMs }) => [file, measuredDurationMs]),
    [
      ["test/mdlm-clean-pilot-contract.test.ts", 28_026],
      ["test/mdlm-lifecycle.test.ts", 30_161],
      ["test/mdlm-process-migration.test.ts", 47_070],
      ["test/mdlm-review-assignment.test.ts", 43_815],
    ],
  );
});

test("the historical safe LPT table retains successful and censored evidence", async () => {
  const {
    SAFE_LPT_LANE_COUNT,
    SAFE_LPT_PHASE_1_CLEANUP_CONTRACT_DELTA_MS,
    SAFE_LPT_ROOT_CEILING_MS,
    safeLptEvidence,
    safeLptPlan,
  } = await import("./root-test-safe-lpt-plan.mjs");

  assert.equal(SAFE_LPT_LANE_COUNT, 3);
  assert.equal(SAFE_LPT_ROOT_CEILING_MS, 590_000);
  assert.equal(safeLptEvidence.length, 19);
  assert.equal(new Set(safeLptEvidence.map((entry) => entry.file)).size, 19);
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(
      safeLptEvidence,
      (entry) => entry.estimateKind,
    )).map(([kind, entries]) => [kind, entries.length])),
    {
      "observed-success-max3": 10,
      "observed-success-max3-plus-intentional-contract-delta": 1,
      "exact-head-focused-model-fallback": 8,
    },
  );
  assert.equal(SAFE_LPT_PHASE_1_CLEANUP_CONTRACT_DELTA_MS, 3_600);
  assert.deepEqual(
    (({ focusedModelFallbackMs, selectedBaseEstimateMs, modeledContractDeltaMs, selectedEstimateMs, estimateKind }) => ({
      focusedModelFallbackMs,
      selectedBaseEstimateMs,
      modeledContractDeltaMs,
      selectedEstimateMs,
      estimateKind,
    }))(safeLptEvidence.find((entry) => entry.file === "test/phase-1-hardening-routes.test.ts")),
    {
      focusedModelFallbackMs: 101_498,
      selectedBaseEstimateMs: 169_240,
      modeledContractDeltaMs: 3_600,
      selectedEstimateMs: 172_840,
      estimateKind: "observed-success-max3-plus-intentional-contract-delta",
    },
  );
  assert.deepEqual(
    ["max2", "max3", "split"].map((run) => [
      run,
      Object.fromEntries(Object.entries(Object.groupBy(
        safeLptEvidence,
        (entry) => entry[run].disposition,
      )).map(([disposition, entries]) => [disposition, entries.length])),
    ]),
    [
      ["max2", { pass: 11, canceled: 2, unadmitted: 6 }],
      ["max3", { pass: 11, canceled: 3, unadmitted: 5 }],
      ["split", { pass: 8, canceled: 4, unadmitted: 6, "failed-hook-timeout": 1 }],
    ],
  );
  assert.equal(safeLptEvidence.every((entry) => ["max2", "max3", "split"].every((run) =>
    entry[run].launched === entry[run].admitted
      && entry[run].canceled === (entry[run].disposition === "canceled")
      && entry[run].completed === ["pass", "failed-hook-timeout"].includes(entry[run].disposition))), true);
  assert.deepEqual(
    safeLptPlan.map((lane) => ({
      id: lane.id,
      totalMs: lane.totalMs,
      files: lane.tasks.map((entry) => entry.file),
    })),
    [
      {
        id: "safe-lpt-1",
        totalMs: 575_327,
        files: [
          "test/load-scenario-participation.test.ts",
          "test/mdlm-command-application.test.ts",
          "test/mdlm-init.test.ts",
          "test/phase-0-intent-candidate-currentness-route.test.ts",
          "test/mdlm-schema.test.ts",
          "test/mdlm-pilot-assessment.test.ts",
        ],
      },
      {
        id: "safe-lpt-2",
        totalMs: 583_883,
        files: [
          "test/phase-1-hardening-routes.test.ts",
          "test/operator-outcome.test.ts",
          "test/mdlm-process-expression.test.ts",
          "test/phase-0-corrected-gate-route.test.ts",
          "test/mdlm-repository-inspection.test.ts",
        ],
      },
      {
        id: "safe-lpt-3",
        totalMs: 580_361,
        files: [
          "test/phase-2-hardening-routes.test.ts",
          "test/mdlm-assignment-state.test.ts",
          "test/mdlm-clean-onboarding-transaction.test.ts",
          "test/initial-product-intent-route.test.ts",
          "test/initial-product-intent-resolution.test.ts",
          "test/selected-package-cache.test.ts",
          "test/evaluate-phase.test.ts",
          "test/evaluate-scoped-obligation.test.ts",
        ],
      },
    ],
  );
  assert.equal(Math.max(...safeLptPlan.map((lane) => lane.totalMs)) <= SAFE_LPT_ROOT_CEILING_MS, true);
});

test("the compatibility-aware successful-evidence model qualifies the calibrated schedule", () => {
  const model = spawnSync(process.execPath, ["scripts/model-root-test-schedule.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(model.status, 0, model.stderr);
  assert.match(model.stdout, /root_files=47 tasks=32 resource_tasks=26 fourth_token_tasks=6 token_capacity=4/);
  assert.match(model.stdout, /resource_total_work_ms=2110568 resource_lower_bound_ms=703523 barrier_lower_bound_ms=707190 resource_lpt_maximum_ms=841946 resource_compatible_maximum_ms=841946/);
  assert.match(model.stdout, /raw_target_ms=898500 minimum_aggregate_contraction_ms=0/);
  assert.match(model.stdout, /resource_phase=two-heavy-plus-one-safe order=0 predicted_ms=230750/);
  assert.match(model.stdout, /resource_phase_lane=two-heavy-plus-one-safe\/heavy-safe-1 role=safe predicted_ms=178150 files=3 tasks=test\/phase-1-hardening-routes.test.ts,test\/mdlm-pilot-assessment.test.ts,test\/evaluate-phase.test.ts/);
  assert.match(model.stdout, /resource_phase=one-fragile-plus-two-safe order=1 predicted_ms=349626/);
  assert.match(model.stdout, /resource_phase=three-safe-tail order=2 predicted_ms=261570/);
  assert.match(model.stdout, /policy=global-resource-lpt simulated_schedule_ms=841946 fourth_token_work_ms=98856 heavy_allowance_ms=0 fragile_allowance_ms=0 mixed_allowance_ms=0 orchestration_allowance_ms=1500 current_host_variance_allowance_ms=1200000 modeled_root_ms=2043446/);
  assert.match(model.stdout, /root_eligibility_ms=2100000 root_margin_ms=56554/);
  assert.match(model.stdout, /modeled_complete_gate_ms=2298446/);
  assert.match(model.stdout, /complete_gate_target_ms=2350000 complete_gate_margin_ms=51554/);
  assert.match(model.stdout, /outer_deadline_ms=2400000 outer_margin_ms=101554 required_outer_headroom_ms=50000 headroom_margin_ms=51554/);
  assert.match(model.stdout, /maximum_active_weight=4/);
  assert.match(model.stdout, /claim=GO_MODEL_QUALIFIED/);
});

test("the schedule simulator uses the same deterministic token and compatibility policy", () => {
  const simulation = simulateWeightedSchedule([
    { id: "heavy", runtimeClass: "heavy", weight: 2, estimatedDurationMs: 10 },
    { id: "sensitive", runtimeClass: "sensitive", weight: 2, estimatedDurationMs: 8 },
    { id: "filler", runtimeClass: "filler", weight: 1, estimatedDurationMs: 4 },
  ], {
    capacity: 4,
    canOverlap: (left, right) => !new Set([left.runtimeClass, right.runtimeClass]).has("heavy")
      || !new Set([left.runtimeClass, right.runtimeClass]).has("sensitive"),
  });
  assert.equal(simulation.wallMs, 18);
  assert.deepEqual(simulation.launches.map(({ atMs, taskId }) => [atMs, taskId]), [
    [0, "heavy"],
    [0, "filler"],
    [10, "sensitive"],
  ]);
  assert.equal(simulation.maximumActiveWeight, 3);
});

test("phased resource barriers and the fourth token share simulation and runtime admission", async () => {
  const resource = (resourceClass, runtimeClass, schedulePhaseId, schedulePhaseOrder, scheduleLaneId, laneOrder) => ({
    laneOrder,
    resourceClass,
    resourceOwner: true,
    runtimeClass,
    scheduleLaneId,
    schedulePhaseId,
    schedulePhaseOrder,
    weight: 1,
  });
  const tasks = [
    { id: "heavy-a", estimatedDurationMs: 10, ...resource("heavy", "process-repository-heavy", "two-heavy-plus-one-safe", 0, "heavy-1", 0) },
    { id: "heavy-b", estimatedDurationMs: 5, ...resource("heavy", "process-repository-heavy", "two-heavy-plus-one-safe", 0, "heavy-1", 1) },
    { id: "heavy-c", estimatedDurationMs: 8, ...resource("heavy", "process-repository-heavy", "two-heavy-plus-one-safe", 0, "heavy-2", 0) },
    { id: "safe-a", estimatedDurationMs: 7, ...resource("safe", "process-repository-safe", "two-heavy-plus-one-safe", 0, "heavy-safe-1", 0) },
    { id: "fragile", estimatedDurationMs: 6, ...resource("fragile", "repository-public-fragile", "one-fragile-plus-two-safe", 1, "fragile-1", 0) },
    { id: "safe-b", estimatedDurationMs: 4, ...resource("safe", "process-repository-safe", "one-fragile-plus-two-safe", 1, "fragile-safe-1", 0) },
    { id: "safe-c", estimatedDurationMs: 3, ...resource("safe", "process-repository-safe", "one-fragile-plus-two-safe", 1, "fragile-safe-2", 0) },
    { id: "tail", estimatedDurationMs: 2, ...resource("safe", "process-repository-safe", "three-safe-tail", 2, "safe-tail-1", 0) },
    { id: "fourth-a", resourceOwner: false, runtimeClass: "canonical-fixture-filler", weight: 1, estimatedDurationMs: 6, scheduleLaneId: "fourth-token" },
    { id: "fourth-b", resourceOwner: false, runtimeClass: "cheap-in-process", weight: 1, estimatedDurationMs: 4, scheduleLaneId: "fourth-token" },
  ];
  const canAdmit = createRootTestAdmissionPolicy(
    ROOT_TEST_SCHEDULING_POLICIES.GLOBAL_RESOURCE_LPT,
  );
  assert.equal(canAdmit(
    { ...tasks[0], schedulePhaseOrder: 1 },
    { pendingTasks: [], runningTasks: [] },
  ), false);
  assert.equal(canAdmit(
    { ...tasks[0], resourceClass: "safe" },
    { pendingTasks: [], runningTasks: [] },
  ), false);
  const options = {
    capacity: 4,
    canAdmit,
    canOverlap: rootTestTasksCanOverlap,
    classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  };
  const simulation = simulateWeightedSchedule(tasks, options);
  assert.deepEqual(simulation.launches.map(({ atMs, taskId, activeWeight }) => [atMs, taskId, activeWeight]), [
    [0, "heavy-a", 1],
    [0, "heavy-c", 2],
    [0, "safe-a", 3],
    [0, "fourth-a", 4],
    [6, "fourth-b", 4],
    [10, "heavy-b", 1],
    [15, "fragile", 1],
    [15, "safe-b", 2],
    [15, "safe-c", 3],
    [21, "tail", 1],
  ]);
  assert.equal(simulation.wallMs, 23);
  assert.equal(simulation.maximumActiveWeight, 4);

  const controlled = controlledLauncher();
  const scheduled = runWeightedSchedule(tasks, { ...options, launch: controlled.launch });
  await waitFor(() => controlled.events.length === 4, "heavy phase and filler did not launch");
  assert.deepEqual(controlled.events, ["heavy-a", "heavy-c", "safe-a", "fourth-a"]);
  controlled.controls.get("fourth-a").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 5, "fourth token did not advance");
  assert.equal(controlled.events.at(-1), "fourth-b");
  for (const id of ["heavy-a", "heavy-c", "safe-a", "fourth-b"]) {
    controlled.controls.get(id).completion.resolve({ status: 0, signal: null });
  }
  await waitFor(() => controlled.events.length === 6, "heavy lane did not advance before the barrier");
  assert.equal(controlled.events.at(-1), "heavy-b");
  controlled.controls.get("heavy-b").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 9, "fragile phase did not launch after the heavy barrier");
  assert.deepEqual(controlled.events.slice(6), ["fragile", "safe-b", "safe-c"]);
  for (const id of ["fragile", "safe-b", "safe-c"]) {
    controlled.controls.get(id).completion.resolve({ status: 0, signal: null });
  }
  await waitFor(() => controlled.events.length === 10, "safe tail did not launch after the fragile barrier");
  assert.equal(controlled.events.at(-1), "tail");
  controlled.controls.get("tail").completion.resolve({ status: 0, signal: null });
  await scheduled;
});

test("class concurrency limits are shared by deterministic simulation and runtime admission", async () => {
  const tasks = [
    { id: "safe-a", runtimeClass: "safe-sensitive", weight: 1, estimatedDurationMs: 10 },
    { id: "safe-b", runtimeClass: "safe-sensitive", weight: 1, estimatedDurationMs: 20 },
    { id: "safe-c", runtimeClass: "safe-sensitive", weight: 1, estimatedDurationMs: 30 },
    { id: "safe-d", runtimeClass: "safe-sensitive", weight: 1, estimatedDurationMs: 5 },
    { id: "filler", runtimeClass: "filler", weight: 1, estimatedDurationMs: 4 },
  ];
  const classConcurrencyLimits = { "safe-sensitive": 3 };
  const simulation = simulateWeightedSchedule(tasks, {
    capacity: 4,
    classConcurrencyLimits,
  });
  assert.deepEqual(simulation.launches.map(({ atMs, taskId }) => [atMs, taskId]), [
    [0, "safe-a"],
    [0, "safe-b"],
    [0, "safe-c"],
    [0, "filler"],
    [10, "safe-d"],
  ]);
  assert.equal(simulation.wallMs, 30);
  assert.equal(simulation.maximumActiveWeight, 4);

  const controlled = controlledLauncher();
  const activeSafe = new Set();
  let maximumActiveSafe = 0;
  const scheduled = runWeightedSchedule(tasks, {
    capacity: 4,
    classConcurrencyLimits,
    launch: controlled.launch,
    onEvent: (event) => {
      if (!event.taskId.startsWith("safe-")) return;
      if (event.type === "launch") activeSafe.add(event.taskId);
      if (event.type === "complete") activeSafe.delete(event.taskId);
      maximumActiveSafe = Math.max(maximumActiveSafe, activeSafe.size);
    },
  });

  await waitFor(() => controlled.events.length === 4, "three capped tasks and filler did not launch");
  assert.deepEqual(controlled.events, ["safe-a", "safe-b", "safe-c", "filler"]);
  controlled.controls.get("filler").completion.resolve({ status: 0, signal: null });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(controlled.events, ["safe-a", "safe-b", "safe-c", "filler"]);
  controlled.controls.get("safe-a").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 5, "waiting class member was starved");
  assert.deepEqual(controlled.events, ["safe-a", "safe-b", "safe-c", "filler", "safe-d"]);
  controlled.controls.get("safe-b").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("safe-c").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("safe-d").completion.resolve({ status: 0, signal: null });
  await scheduled;
  assert.equal(maximumActiveSafe, 3);
  assert.equal(new Set(controlled.events).size, tasks.length);
});

test("the four-token scheduler backfills deterministically without exceeding its budget", async () => {
  const controlled = controlledLauncher();
  const schedulerEvents = [];
  const scheduled = runWeightedSchedule([
    { id: "heavy", weight: 3 },
    { id: "medium-a", weight: 2 },
    { id: "medium-b", weight: 2 },
    { id: "cheap-a", weight: 1 },
    { id: "cheap-b", weight: 1 },
  ], {
    capacity: 4,
    launch: controlled.launch,
    onEvent: (event) => schedulerEvents.push(event),
  });

  await waitFor(() => controlled.events.length === 2, "initial heavy and cheap fill did not launch");
  assert.deepEqual(controlled.events, ["heavy", "cheap-a"]);
  controlled.controls.get("cheap-a").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 3, "second cheap fill did not backfill");
  assert.deepEqual(controlled.events, ["heavy", "cheap-a", "cheap-b"]);
  controlled.controls.get("cheap-b").completion.resolve({ status: 0, signal: null });
  await waitFor(
    () => schedulerEvents.some((event) => event.type === "complete" && event.taskId === "cheap-b"),
    "second cheap fill did not complete",
  );
  controlled.controls.get("heavy").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 5, "waiting medium work was starved");
  assert.deepEqual(controlled.events, ["heavy", "cheap-a", "cheap-b", "medium-a", "medium-b"]);
  controlled.controls.get("medium-a").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("medium-b").completion.resolve({ status: 0, signal: null });

  const result = await scheduled;
  assert.deepEqual(result.completedTaskIds, ["cheap-a", "cheap-b", "heavy", "medium-a", "medium-b"]);
  assert.equal(new Set(controlled.events).size, 5);
  assert.equal(Math.max(...schedulerEvents.map((event) => event.activeWeight)), 4);
});

test("class compatibility blocks a token-valid conflict while safe fill continues", async () => {
  const controlled = controlledLauncher();
  const scheduled = runWeightedSchedule([
    { id: "heavy", runtimeClass: "heavy", weight: 2 },
    { id: "sensitive", runtimeClass: "sensitive", weight: 2 },
    { id: "filler-a", runtimeClass: "filler", weight: 1 },
    { id: "filler-b", runtimeClass: "filler", weight: 1 },
  ], {
    capacity: 4,
    canOverlap: (left, right) => !new Set([left.runtimeClass, right.runtimeClass]).has("heavy")
      || !new Set([left.runtimeClass, right.runtimeClass]).has("sensitive"),
    launch: controlled.launch,
  });

  await waitFor(() => controlled.events.length === 3, "heavy with safe fill did not launch");
  assert.deepEqual(controlled.events, ["heavy", "filler-a", "filler-b"]);
  controlled.controls.get("filler-a").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("filler-b").completion.resolve({ status: 0, signal: null });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(controlled.events, ["heavy", "filler-a", "filler-b"]);
  controlled.controls.get("heavy").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 4, "sensitive task was starved");
  controlled.controls.get("sensitive").completion.resolve({ status: 0, signal: null });

  await scheduled;
  assert.deepEqual(controlled.events, ["heavy", "filler-a", "filler-b", "sensitive"]);
});

test("the scheduler rejects invalid token and class-limit declarations before launching", async () => {
  let launches = 0;
  await assert.rejects(
    runWeightedSchedule([{ id: "impossible", weight: 5 }], {
      capacity: 4,
      launch: () => {
        launches += 1;
        throw new Error("must not launch");
      },
    }),
    /weight.*capacity/i,
  );
  await assert.rejects(
    runWeightedSchedule([{ id: "duplicate", weight: 1 }, { id: "duplicate", weight: 1 }], {
      capacity: 4,
      launch: () => { throw new Error("must not launch"); },
    }),
    /duplicate/i,
  );
  await assert.rejects(
    runWeightedSchedule([{ id: "valid", runtimeClass: "safe", weight: 1 }], {
      capacity: 4,
      classConcurrencyLimits: { safe: 0 },
      launch: () => {
        launches += 1;
        throw new Error("must not launch");
      },
    }),
    /classConcurrencyLimits\.safe.*positive integer/,
  );
  assert.equal(launches, 0);
});

test("an outer cancellation stops launches and waits for every running task", async () => {
  const controlled = controlledLauncher();
  const cancellation = new AbortController();
  const scheduled = runWeightedSchedule([
    { id: "first", weight: 2 },
    { id: "second", weight: 2 },
    { id: "never-launched", weight: 1 },
  ], { capacity: 4, launch: controlled.launch, signal: cancellation.signal });

  await waitFor(() => controlled.events.length === 2, "initial tasks did not launch");
  cancellation.abort(new Error("outer deadline"));
  await assert.rejects(scheduled, WeightedScheduleAbortedError);
  assert.deepEqual(controlled.events, ["first", "second"]);
  assert.equal(controlled.controls.get("first").terminateCalls, 1);
  assert.equal(controlled.controls.get("second").terminateCalls, 1);
});

test("a settled peer failure is observed before successful capacity is backfilled", async () => {
  const controlled = controlledLauncher();
  const scheduled = runWeightedSchedule([
    { id: "success", weight: 2 },
    { id: "failure", weight: 2 },
    { id: "must-not-backfill", weight: 2 },
  ], { capacity: 4, launch: controlled.launch });

  await waitFor(() => controlled.events.length === 2, "initial peers did not launch");
  controlled.controls.get("success").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("failure").completion.resolve({ status: 9, signal: null });
  await assert.rejects(scheduled, (error) => error instanceof WeightedScheduleTaskError
    && error.taskId === "failure" && error.status === 9);
  assert.deepEqual(controlled.events, ["success", "failure"]);
});

test("simultaneous success releases are drained before deterministic backfill", async () => {
  const controlled = controlledLauncher();
  const scheduled = runWeightedSchedule([
    { id: "first", weight: 2 },
    { id: "second", weight: 2 },
    { id: "heavy-next", weight: 3 },
    { id: "medium-after", weight: 2 },
  ], { capacity: 4, launch: controlled.launch });

  await waitFor(() => controlled.events.length === 2, "initial peers did not launch");
  controlled.controls.get("first").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("second").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 3, "tied completions did not backfill");
  assert.deepEqual(controlled.events, ["first", "second", "heavy-next"]);
  controlled.controls.get("heavy-next").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 4, "medium did not follow heavy");
  controlled.controls.get("medium-after").completion.resolve({ status: 0, signal: null });
  await scheduled;
});

test("the first task failure stops launches, cancels peers, and waits for cleanup", async () => {
  const controlled = controlledLauncher();
  const scheduled = runWeightedSchedule([
    { id: "failure", weight: 2 },
    { id: "peer", weight: 2 },
    { id: "never-launched", weight: 1 },
  ], { capacity: 4, launch: controlled.launch });

  await waitFor(() => controlled.events.length === 2, "initial peers did not launch");
  controlled.controls.get("failure").completion.resolve({ status: 7, signal: null });

  await assert.rejects(
    scheduled,
    (error) => error instanceof WeightedScheduleTaskError
      && error.taskId === "failure"
      && error.status === 7,
  );
  assert.deepEqual(controlled.events, ["failure", "peer"]);
  assert.equal(controlled.controls.get("peer").terminateCalls, 1);
});

test("SIGTERM delivered to the process-group helper reaps its detached descendants", { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "mdlm-helper-signal-"));
  const identitiesPath = join(root, "identities.json");
  const helperPath = new URL("./frontier-process-group.mjs", import.meta.url).pathname;
  const source = `
    const { spawn } = require("node:child_process");
    const { writeFileSync } = require("node:fs");
    process.on("SIGTERM", () => {});
    const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
    writeFileSync(${JSON.stringify(identitiesPath)}, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
    setInterval(() => {}, 1000);
  `;

  try {
    const helper = spawn(process.execPath, [helperPath, "--launch"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    helper.stdin.end(JSON.stringify({
      command: process.execPath,
      args: ["-e", source],
      timeout: 8_000,
      terminationGrace: 100,
    }));
    await waitFor(() => existsSync(identitiesPath), "detached descendants did not start");
    helper.kill("SIGTERM");
    setTimeout(() => helper.kill("SIGINT"), 20);
    const [status, signal] = await once(helper, "close");
    assert.equal(status, null);
    assert.equal(signal, "SIGTERM");
    const identities = JSON.parse(await readFile(identitiesPath, "utf8"));
    for (const pid of [identities.child, identities.grandchild]) {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the outer process-group deadline reaps detached scheduler descendants", { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "mdlm-weighted-outer-"));
  const identitiesPath = join(root, "identities.json");
  const schedulerPath = join(root, "scheduler.mjs");
  const schedulerModule = new URL("./weighted-token-scheduler.mjs", import.meta.url).href;
  const childSource = `
    const { spawn } = require("node:child_process");
    const { writeFileSync } = require("node:fs");
    process.on("SIGTERM", () => {});
    const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
    writeFileSync(${JSON.stringify(identitiesPath)}, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
    setInterval(() => {}, 1000);
  `;
  const schedulerSource = `
    import { launchProcessGroupTask, runWeightedSchedule } from ${JSON.stringify(schedulerModule)};
    const cancellation = new AbortController();
    process.once("SIGTERM", () => cancellation.abort());
    try {
      await runWeightedSchedule([
        { id: "long-lived", weight: 4, command: process.execPath, args: ["-e", ${JSON.stringify(childSource)}] },
      ], {
        capacity: 4,
        signal: cancellation.signal,
        launch: (task) => launchProcessGroupTask(task, { stdio: "ignore", terminationGrace: 1_000 }),
      });
    } catch {}
  `;

  try {
    await writeFile(schedulerPath, schedulerSource);
    const result = runInProcessGroup(process.execPath, [schedulerPath], {
      timeout: 300,
      terminationGrace: 2_000,
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.status, 124);
    const identities = JSON.parse(await readFile(identitiesPath, "utf8"));
    for (const pid of [identities.child, identities.grandchild]) {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fail-fast process cancellation removes a task and its descendant", { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "mdlm-weighted-scheduler-"));
  const identitiesPath = join(root, "identities.json");
  const longLivedSource = `
    const { spawn } = require("node:child_process");
    const { writeFileSync } = require("node:fs");
    const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    writeFileSync(${JSON.stringify(identitiesPath)}, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
    setInterval(() => {}, 1000);
  `;
  const failingSource = `
    const { existsSync } = require("node:fs");
    const path = ${JSON.stringify(identitiesPath)};
    const deadline = Date.now() + 5000;
    const check = () => {
      if (existsSync(path)) process.exit(9);
      if (Date.now() >= deadline) process.exit(8);
      setTimeout(check, 10);
    };
    check();
  `;

  try {
    await assert.rejects(
      runWeightedSchedule([
        { id: "long-lived", weight: 2, command: process.execPath, args: ["-e", longLivedSource] },
        { id: "failure", weight: 2, command: process.execPath, args: ["-e", failingSource] },
      ], {
        capacity: 4,
        launch: (task) => launchProcessGroupTask(task, {
          terminationGrace: 100,
          stdio: "ignore",
        }),
      }),
      (error) => error instanceof WeightedScheduleTaskError
        && error.taskId === "failure"
        && error.status === 9,
    );

    const identities = JSON.parse(await readFile(identitiesPath, "utf8"));
    for (const pid of [identities.child, identities.grandchild]) {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
