import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
  ROOT_TEST_SCHEDULING_POLICY,
  ROOT_TEST_TOKEN_CAPACITY,
  createRootTestAdmissionPolicy,
  createRootTestTasksForGate,
  rootTestManifest,
  rootTestTasksCanOverlap,
} from "./root-test-schedule.mjs";
import { parseQualificationArguments } from "./qualification-gates.mjs";
import {
  WeightedScheduleTaskError,
  launchProcessGroupTask,
  runWeightedSchedule,
} from "./weighted-token-scheduler.mjs";
import {
  formatTestCostReport,
  readTestCostFragments,
  writeTestCostReport,
} from "./test-cost-report.mjs";

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

async function runRootTests({ gate, additionalRootTestFiles }) {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const costRoot = mkdtempSync(path.join(os.tmpdir(), "mdlm-test-cost-"));
  const reportPath = path.resolve(
    process.env.MDLM_TEST_COST_REPORT
      ?? `artifacts/test-cost/${gate}-${startedAt.replaceAll(":", "-")}-${process.pid}.md`,
  );
  const cancellation = new AbortController();
  const cancel = (signal) => cancellation.abort(new Error(`Authoritative runner received ${signal}`));
  const onTerm = () => cancel("SIGTERM");
  const onInterrupt = () => cancel("SIGINT");
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInterrupt);

  try {
    const tasks = createRootTestTasksForGate(gate, additionalRootTestFiles);
    await runWeightedSchedule(tasks, {
      capacity: ROOT_TEST_TOKEN_CAPACITY,
      canAdmit: createRootTestAdmissionPolicy(ROOT_TEST_SCHEDULING_POLICY),
      canOverlap: rootTestTasksCanOverlap,
      classConcurrencyLimits: ROOT_TEST_CLASS_CONCURRENCY_LIMITS,
      signal: cancellation.signal,
      launch: (task) => launchProcessGroupTask({
        ...task,
        environment: {
          ...task.environment,
          MDLM_TEST_COST_FRAGMENT_ROOT: costRoot,
        },
        command: process.execPath,
        args: [
          "./node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "vitest.fast.config.ts",
          "--maxWorkers=1",
          "--reporter=default",
          "--reporter=./scripts/root-test-cost-reporter.mjs",
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
    const selectedFileCount = createRootTestTasksForGate(gate, additionalRootTestFiles)
      .flatMap((task) => task.files).length;
    const fragmentPaths = readdirSync(costRoot)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => path.join(costRoot, entry));
    try {
      const entries = readTestCostFragments(fragmentPaths, rootTestManifest);
      writeTestCostReport(reportPath, formatTestCostReport({
        gate,
        startedAt,
        elapsedMs: Date.now() - startedAtMs,
        entries,
        selectedFileCount,
      }));
      process.stdout.write(`ROOT_TEST_COST_REPORT path=${reportPath} files=${entries.length}/${selectedFileCount}\n`);
    } catch (error) {
      process.stderr.write(`ROOT_TEST_COST_REPORT_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      rmSync(costRoot, { recursive: true, force: true });
    }
  }
}

const qualification = parseQualificationArguments(process.argv.slice(2));
process.stdout.write(
  `QUALIFICATION_GATE gate=${qualification.gate} additional_root_tests=${qualification.additionalRootTestFiles.length}\n`,
);

let status = runAll([
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  ["./node_modules/typescript/bin/tsc", "-p", "packages/mdlm-pi/tsconfig.build.json"],
  ["scripts/verify-test-suites.mjs"],
]);

if (status === 0) status = await runRootTests(qualification);

if (status === 0) {
  status = runAll([
    [
      "./node_modules/vitest/vitest.mjs",
      "run",
      "--root",
      "packages/mdlm-pi",
      "--testTimeout=180000",
    ],
    ["--test", "scripts/frontier-loop-tests.mjs"],
    ["--test", "scripts/weighted-token-scheduler-tests.mjs"],
    ["--test", "scripts/qualification-gate-tests.mjs"],
  ]);
}

process.exitCode = status;
