#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const CONTRACT = "mdlm-release-candidate-preparation@2";
const usage = `Usage:
  node scripts/release-candidate-gate.mjs prepare --worktree PATH --commit SHA --tree SHA --evidence PATH
  node scripts/release-candidate-gate.mjs start --worktree PATH --commit SHA --tree SHA --evidence PATH --attempt-dir PATH
`;

function fail(message) {
  throw new Error(message);
}

function parseArguments(args) {
  const [action, ...rest] = args;
  if (!["prepare", "start"].includes(action)) fail(usage);
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const value = rest[index + 1];
    if (!option?.startsWith("--") || value === undefined) fail(usage);
    if (values.has(option)) fail(`Option may be specified only once: ${option}`);
    values.set(option, value);
  }
  const permitted = new Set([
    "--worktree",
    "--commit",
    "--tree",
    "--evidence",
    ...(action === "start" ? ["--attempt-dir"] : []),
  ]);
  for (const option of values.keys()) {
    if (!permitted.has(option)) fail(`Unknown option: ${option}`);
  }
  for (const option of permitted) {
    if (!values.has(option)) fail(`Missing required option: ${option}`);
  }
  return {
    action,
    worktree: values.get("--worktree"),
    commit: values.get("--commit"),
    tree: values.get("--tree"),
    evidence: values.get("--evidence"),
    attemptDir: values.get("--attempt-dir"),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
  if (result.error) throw result.error;
  if (result.signal !== null) fail(`${command} closed on ${result.signal}`);
  if (result.status !== 0) {
    const detail = typeof result.stderr === "string" ? result.stderr.trim() : "";
    fail(`${command} ${args.join(" ")} exited ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function git(worktree, args) {
  return run("git", ["-C", worktree, ...args]);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function authenticateIdentity(worktree, commit, tree) {
  const exactWorktree = realpathSync(worktree);
  if (git(exactWorktree, ["rev-parse", "HEAD"]) !== commit) {
    fail("Candidate HEAD does not match the pinned commit");
  }
  if (git(exactWorktree, ["rev-parse", "HEAD^{tree}"]) !== tree) {
    fail("Candidate tree does not match the pinned tree");
  }
  const branch = spawnSync("git", ["-C", exactWorktree, "symbolic-ref", "-q", "HEAD"], {
    encoding: "utf8",
  });
  if (branch.error) throw branch.error;
  if (branch.status === 0) fail("Candidate worktree must be detached");
  if (branch.status !== 1) fail("Could not authenticate detached candidate worktree");
  if (git(exactWorktree, ["status", "--porcelain"]) !== "") {
    fail("Candidate worktree must be clean");
  }
  return exactWorktree;
}

function proveImports(worktree) {
  const build = { command: "npm", arguments: ["run", "build"] };
  run(build.command, build.arguments, { cwd: worktree });
  const entrypoint = "dist/index.js";
  const proof = [
    'import { pathToFileURL } from "node:url";',
    `await import(pathToFileURL(${JSON.stringify(join(worktree, entrypoint))}).href);`,
  ].join("\n");
  run(process.execPath, [
    "--input-type=module",
    "--eval",
    proof,
  ], { cwd: worktree });
  return { build, entrypoint, result: "pass" };
}

function proveDependencyTree(worktree) {
  run("npm", ["ls", "--all"], { cwd: worktree });
  return { command: "npm", arguments: ["ls", "--all"], result: "pass" };
}

function expectedFiles(worktree) {
  return {
    packageJson: join(worktree, "package.json"),
    packageLock: join(worktree, "package-lock.json"),
  };
}

function prepare({ worktree, commit, tree, evidence }) {
  const exactWorktree = authenticateIdentity(worktree, commit, tree);
  const files = expectedFiles(exactWorktree);
  const packageJsonSha256 = sha256(files.packageJson);
  const packageLockSha256 = sha256(files.packageLock);
  const startedAt = new Date().toISOString();

  run("npm", ["ci"], { cwd: exactWorktree, stdio: "inherit" });
  const dependencyTreeProof = proveDependencyTree(exactWorktree);
  const importProof = proveImports(exactWorktree);
  authenticateIdentity(exactWorktree, commit, tree);
  if (sha256(files.packageJson) !== packageJsonSha256) fail("package.json changed during preparation");
  if (sha256(files.packageLock) !== packageLockSha256) fail("package-lock.json changed during preparation");

  const record = {
    contract: CONTRACT,
    preparedAt: new Date().toISOString(),
    startedAt,
    worktree: exactWorktree,
    commit,
    tree,
    packageJsonSha256,
    packageLockSha256,
    install: { command: "npm", arguments: ["ci"] },
    dependencyTreeProof,
    importProof,
  };
  mkdirSync(dirname(evidence), { recursive: true });
  writeFileSync(evidence, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function verifyPreparation({ worktree, commit, tree, evidence }) {
  const exactWorktree = authenticateIdentity(worktree, commit, tree);
  let record;
  try {
    record = JSON.parse(readFileSync(evidence, "utf8"));
  } catch (error) {
    fail(`Valid preparation evidence is required: ${error.message}`);
  }
  const files = expectedFiles(exactWorktree);
  const expected = {
    contract: CONTRACT,
    worktree: exactWorktree,
    commit,
    tree,
    packageJsonSha256: sha256(files.packageJson),
    packageLockSha256: sha256(files.packageLock),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record[field] !== value) fail(`Preparation evidence has mismatched ${field}`);
  }
  if (record.install?.command !== "npm" || JSON.stringify(record.install.arguments) !== '["ci"]') {
    fail("Preparation evidence does not prove exact lockfile installation");
  }
  if (record.importProof?.build?.command !== "npm"
    || JSON.stringify(record.importProof.build.arguments) !== '["run","build"]'
    || record.importProof.entrypoint !== "dist/index.js"
    || record.importProof.result !== "pass") {
    fail("Preparation evidence does not prove MDLM import resolution");
  }
  if (record.dependencyTreeProof?.command !== "npm"
    || JSON.stringify(record.dependencyTreeProof.arguments) !== '["ls","--all"]'
    || record.dependencyTreeProof.result !== "pass") {
    fail("Preparation evidence does not prove the complete dependency tree");
  }
  proveDependencyTree(exactWorktree);
  proveImports(exactWorktree);
  authenticateIdentity(exactWorktree, commit, tree);
  return exactWorktree;
}

function start(options) {
  const exactWorktree = verifyPreparation(options);
  mkdirSync(options.attemptDir);
  const timePath = join(options.attemptDir, "time.txt");
  const stdout = openSync(join(options.attemptDir, "stdout.log"), "wx");
  const stderr = openSync(join(options.attemptDir, "stderr.log"), "wx");
  const result = spawnSync("/usr/bin/time", [
    "-v",
    "-o", timePath,
    "timeout",
    "--signal=TERM",
    "--kill-after=30s",
    "2400s",
    "npm",
    "run",
    "test:release",
  ], {
    cwd: exactWorktree,
    stdio: ["ignore", stdout, stderr],
  });
  const status = result.status ?? 1;
  writeFileSync(join(options.attemptDir, "exit-code.txt"), `${status}\n`, { flag: "wx" });
  writeFileSync(join(options.attemptDir, "completed-at.txt"), `${new Date().toISOString()}\n`, { flag: "wx" });
  if (result.error) throw result.error;
  if (result.signal !== null) fail(`Release gate wrapper closed on ${result.signal}`);
  process.exit(status);
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.action === "prepare") prepare(options);
  else start(options);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
