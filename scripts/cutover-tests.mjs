import { spawnSync } from "node:child_process";

const usage = `Usage: node scripts/cutover-tests.mjs <fast|cutover>

fast      typecheck both packages and run the bounded decision, package, and public-contract tests
cutover   run fast, build both packages, check the mdlm-pi contract, and run the installed journey
`;

function run(command, args) {
  process.stdout.write(`CUTOVER_TEST command=${[command, ...args].join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal !== null) {
    throw new Error(`Cutover test command closed on ${result.signal}`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fast() {
  run("npm", ["run", "process-fixture:check"]);
  run("npm", ["run", "typecheck"]);
  run("npm", ["run", "typecheck:mdlm-pi"]);
  run("./node_modules/.bin/vitest", [
    "run",
    "--config",
    "vitest.cutover.config.ts",
    "test/cutover-corpus.test.ts",
    "test/operator-outcome.test.ts",
    "test/operator-contract-v2.test.ts",
    "test/operator-fault-gate.test.ts",
    "test/process-package-cutover.test.ts",
    "test/atomic-review-submit.test.ts",
    "-t",
    "bounded cutover evidence|package-neutral Operator Outcome classification|operator contract v2 fixtures|focused v2 fault-injection gate|simplified Process Package contract|atomic Review submission",
  ]);
}

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  process.stdout.write(usage);
  process.exit(0);
}
if (args.length !== 1 || !["fast", "cutover"].includes(args[0])) {
  process.stderr.write(usage);
  process.exit(2);
}

fast();
if (args[0] === "cutover") {
  run("npm", ["run", "build"]);
  run("npm", ["run", "build:mdlm-pi"]);
  run("npm", [
    "exec",
    "--workspace=mdlm-pi",
    "--",
    "vitest",
    "run",
    "--testTimeout=180000",
    "test/mdlm-client-v2.test.ts",
    "test/operator-loop.test.ts",
  ]);
  run("./node_modules/.bin/vitest", [
    "run",
    "test/installed-cutover-journey.test.ts",
  ]);
}
