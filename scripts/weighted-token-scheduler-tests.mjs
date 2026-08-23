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
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasks,
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

test("the root manifest classifies all 47 files once with bounded weights and cheap batches", async () => {
  const discovered = (await readdir(new URL("../test", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => `test/${entry.name}`)
    .sort();
  const declared = rootTestManifest.map((entry) => entry.file);

  assert.equal(ROOT_TEST_TOKEN_CAPACITY, 4);
  assert.deepEqual(ROOT_TEST_CLASS_CONCURRENCY_LIMITS, {
    "process-repository-heavy": 2,
    "repository-public-three-way-safe": 2,
  });
  assert.equal(rootTestManifest.length, 47);
  assert.equal(new Set(declared).size, 47);
  assert.deepEqual([...declared].sort(), discovered);
  for (const entry of rootTestManifest) {
    assert.equal(Number.isInteger(entry.weight) && entry.weight > 0 && entry.weight <= ROOT_TEST_TOKEN_CAPACITY, true);
    assert.equal(Number.isInteger(entry.measuredDurationMs) && entry.measuredDurationMs > 0, true);
    assert.match(entry.runtimeClass, /^(process-repository-heavy|repository-public-fragile|repository-public-three-way-safe|canonical-fixture-filler|cheap-in-process)$/);
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(rootTestManifest, (entry) => entry.runtimeClass))
      .map(([runtimeClass, entries]) => [runtimeClass, `${entries.length}@${entries[0].weight}`])),
    {
      "process-repository-heavy": "4@2",
      "repository-public-fragile": "4@2",
      "repository-public-three-way-safe": "19@1",
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
    { runtimeClass: "repository-public-three-way-safe" },
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

test("exact-current three-way outcomes remain calibrated without using failed timings", () => {
  assert.deepEqual(
    rootTestManifest
      .filter((entry) => entry.runtimeClass === "repository-public-three-way-safe")
      .map(({ file, measuredDurationMs }) => [file, measuredDurationMs]),
    [
      ["test/evaluate-phase.test.ts", 8_883],
      ["test/evaluate-scoped-obligation.test.ts", 8_019],
      ["test/initial-product-intent-resolution.test.ts", 36_894],
      ["test/initial-product-intent-route.test.ts", 46_607],
      ["test/load-scenario-participation.test.ts", 70_789],
      ["test/mdlm-assignment-state.test.ts", 57_581],
      ["test/mdlm-clean-onboarding-transaction.test.ts", 58_206],
      ["test/mdlm-command-application.test.ts", 63_686],
      ["test/mdlm-init.test.ts", 55_478],
      ["test/mdlm-pilot-assessment.test.ts", 15_950],
      ["test/mdlm-process-expression.test.ts", 47_352],
      ["test/mdlm-repository-inspection.test.ts", 25_853],
      ["test/mdlm-schema.test.ts", 33_817],
      ["test/operator-outcome.test.ts", 51_114],
      ["test/phase-0-corrected-gate-route.test.ts", 85_291],
      ["test/phase-0-intent-candidate-currentness-route.test.ts", 72_074],
      ["test/phase-1-hardening-routes.test.ts", 101_498],
      ["test/phase-2-hardening-routes.test.ts", 59_745],
      ["test/selected-package-cache.test.ts", 29_228],
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

test("exact-current heavy, bounded-safe, and mixed observations select the lower honest policy", () => {
  assert.deepEqual(
    rootTestManifest
      .filter((entry) => entry.runtimeClass === "process-repository-heavy")
      .map(({ file, measuredDurationMs }) => [file, measuredDurationMs]),
    [
      ["test/load-process-package.test.ts", 66_137],
      ["test/mdlm-baseline-inspection.test.ts", 62_087],
      ["test/mdlm-assignment.test.ts", 117_151],
      ["test/proportional-distinct-context-phase-2-public.test.ts", 27_558],
    ],
  );

  const model = spawnSync(process.execPath, ["scripts/model-root-test-schedule.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(model.status, 0, model.stderr);
  assert.match(model.stdout, /mixed_predicted_ms=117151 mixed_observed_scheduler_wall_ms=122735 mixed_observed_wrapper_wall_ms=122898 mixed_test_work_ms=161680/);
  assert.match(model.stdout, /mixed_contention_multiplier=1\.047665 mixed_contention_allowance_ms=5584/);
  assert.match(model.stdout, /policy=heavy-pair-first simulated_schedule_ms=593335 heavy_pair_windows=1 heavy_pair_allowance_ms=56595 mixed_windows=1 mixed_allowance_ms=5584 three_way_windows=0 three_way_allowance_ms=0 modeled_root_ms=677514/);
  assert.match(model.stdout, /policy=one-heavy-while-safe simulated_schedule_ms=467966 heavy_pair_windows=0 heavy_pair_allowance_ms=0 mixed_windows=2 mixed_allowance_ms=11168 three_way_windows=0 three_way_allowance_ms=0 modeled_root_ms=501134/);
  assert.match(model.stdout, /selected_policy=one-heavy-while-safe modeled_root_ms=501134/);
  assert.match(model.stdout, /root_eligibility_ms=540000 root_margin_ms=38866/);
  assert.match(model.stdout, /outer_deadline_ms=600000 outer_margin_ms=98866 required_outer_headroom_ms=60000 headroom_margin_ms=38866/);
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

test("one-heavy safe fill admission is shared by deterministic simulation and runtime", async () => {
  const tasks = [
    { id: "heavy-a", runtimeClass: "process-repository-heavy", weight: 2, estimatedDurationMs: 10 },
    { id: "heavy-b", runtimeClass: "process-repository-heavy", weight: 2, estimatedDurationMs: 5 },
    { id: "safe-a", runtimeClass: "repository-public-three-way-safe", weight: 1, estimatedDurationMs: 4 },
    { id: "safe-b", runtimeClass: "repository-public-three-way-safe", weight: 1, estimatedDurationMs: 6 },
    { id: "safe-c", runtimeClass: "repository-public-three-way-safe", weight: 1, estimatedDurationMs: 3 },
  ];
  const canAdmit = createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICIES.ONE_HEAVY_WHILE_SAFE);
  const options = {
    capacity: 4,
    canAdmit,
    canOverlap: rootTestTasksCanOverlap,
    classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  };
  const simulation = simulateWeightedSchedule(tasks, options);
  assert.deepEqual(simulation.launches.map(({ atMs, taskId, activeWeight }) => [atMs, taskId, activeWeight]), [
    [0, "heavy-a", 2],
    [0, "safe-a", 3],
    [0, "safe-b", 4],
    [4, "safe-c", 4],
    [7, "heavy-b", 4],
  ]);
  assert.equal(simulation.wallMs, 12);
  assert.equal(simulation.maximumActiveWeight, 4);

  const controlled = controlledLauncher();
  const scheduled = runWeightedSchedule(tasks, { ...options, launch: controlled.launch });
  await waitFor(() => controlled.events.length === 3, "one heavy and two safe tasks did not launch");
  assert.deepEqual(controlled.events, ["heavy-a", "safe-a", "safe-b"]);
  controlled.controls.get("safe-a").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 4, "safe work did not backfill beside heavy work");
  assert.deepEqual(controlled.events, ["heavy-a", "safe-a", "safe-b", "safe-c"]);
  controlled.controls.get("safe-b").completion.resolve({ status: 0, signal: null });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(controlled.events, ["heavy-a", "safe-a", "safe-b", "safe-c"]);
  controlled.controls.get("safe-c").completion.resolve({ status: 0, signal: null });
  await waitFor(() => controlled.events.length === 5, "second heavy did not launch after safe work drained");
  assert.deepEqual(controlled.events, ["heavy-a", "safe-a", "safe-b", "safe-c", "heavy-b"]);
  controlled.controls.get("heavy-a").completion.resolve({ status: 0, signal: null });
  controlled.controls.get("heavy-b").completion.resolve({ status: 0, signal: null });
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
