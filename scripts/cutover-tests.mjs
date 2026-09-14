import { spawnSync } from "node:child_process";

const usage = `Usage: node scripts/cutover-tests.mjs <fast|cutover>

fast      check types, build mdlm, and exercise the tiny process and public contract
cutover   run fast, check mdlm-pi, then exercise the same journey from an npm install
`;

function run(command, args, environment = {}) {
  process.stdout.write(`TINY_TEST command=${[command, ...args].join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(), stdio: "inherit", env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.signal !== null) throw new Error(`Test command closed on ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  process.stdout.write(usage);
  process.exit(0);
}
if (args.length !== 1 || !["fast", "cutover"].includes(args[0])) {
  process.stderr.write(usage);
  process.exit(2);
}

run("npm", ["run", "typecheck"]);
run("npm", ["run", "typecheck:mdlm-pi"]);
run("npm", ["run", "build"]);
run("./node_modules/.bin/vitest", [
  "run", "--config", args[0] === "cutover" ? "vitest.cutover.config.ts" : "vitest.fast.config.ts",
]);
if (args[0] === "cutover") {
  run("npm", ["run", "build:mdlm-pi"]);
  run("npm", ["exec", "--workspace=mdlm-pi", "--", "vitest", "run",
    "--testTimeout=180000"]);
  run("./node_modules/.bin/vitest", ["run", "test/direct-lifecycle-public.test.ts"], {
    MDLM_DIRECT_INSTALLED: "1",
  });
}
