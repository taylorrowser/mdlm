import { spawnSync } from "node:child_process";
import {
  ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  ROOT_TEST_SCHEDULING_POLICY,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasks,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import {
  WeightedScheduleTaskError,
  launchProcessGroupTask,
  runWeightedSchedule,
} from "./weighted-token-scheduler.mjs";

function run(arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runAll(commands) {
  for (const arguments_ of commands) {
    const status = run(arguments_);
    if (status !== 0) return status;
  }
  return 0;
}

async function runRootTests() {
  const cancellation = new AbortController();
  const cancel = (signal) => cancellation.abort(new Error(`Authoritative runner received ${signal}`));
  const onTerm = () => cancel("SIGTERM");
  const onInterrupt = () => cancel("SIGINT");
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInterrupt);

  try {
    const tasks = createRootTestTasks();
    await runWeightedSchedule(tasks, {
      capacity: ROOT_TEST_TOKEN_CAPACITY,
      canAdmit: createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICY),
      canOverlap: rootTestTasksCanOverlap,
      classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
      signal: cancellation.signal,
      launch: (task) => launchProcessGroupTask({
        ...task,
        command: process.execPath,
        args: [
          "./node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "vitest.fast.config.ts",
          "--maxWorkers=1",
          ...task.files,
        ],
      }, {
        cwd: process.cwd(),
        stdio: ["ignore", "inherit", "inherit"],
        // Leave the outer wrapper's exact 2,000 ms grace enough time to
        // observe this runner's descendant cleanup before its final KILL.
        terminationGrace: 1_000,
      }),
      onEvent: (event) => {
        if (event.type === "launch") {
          process.stdout.write(`ROOT_TEST_SCHEDULE launch=${event.taskId} active_weight=${event.activeWeight}\n`);
        }
      },
    });
    return 0;
  } catch (error) {
    process.stderr.write(`ROOT_TEST_SCHEDULE_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    return error instanceof WeightedScheduleTaskError ? error.status ?? 1 : 1;
  } finally {
    process.removeListener("SIGTERM", onTerm);
    process.removeListener("SIGINT", onInterrupt);
  }
}

let status = runAll([
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  ["./node_modules/typescript/bin/tsc", "-p", "packages/mdlm-pi/tsconfig.build.json"],
  ["scripts/verify-test-suites.mjs"],
]);

if (status === 0) status = await runRootTests();

if (status === 0) {
  status = runAll([
    [
      "./node_modules/vitest/vitest.mjs",
      "run",
      "--root",
      "packages/mdlm-pi",
      "--testTimeout=30000",
    ],
    ["--test", "scripts/frontier-loop-tests.mjs"],
    ["--test", "scripts/weighted-token-scheduler-tests.mjs"],
  ]);
}

process.exitCode = status;
