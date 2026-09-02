import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const gateScript = join(projectRoot, "scripts", "release-candidate-gate.mjs");
const temporaryDirectories: string[] = [];

function command(cwd: string, executable: string, args: string[]) {
  return execFileSync(executable, args, { cwd, encoding: "utf8" }).trim();
}

function makeDetachedCandidate() {
  const root = mkdtempSync(join(tmpdir(), "mdlm-release-candidate-"));
  temporaryDirectories.push(root);
  const candidate = join(root, "candidate");
  mkdirSync(candidate);
  mkdirSync(join(candidate, "src"));
  mkdirSync(join(candidate, "fixture-dependency"));
  writeFileSync(join(candidate, ".gitignore"), "node_modules/\n");
  writeFileSync(join(candidate, "fixture-dependency", "package.json"), JSON.stringify({
    name: "fixture-dependency",
    version: "1.0.0",
    type: "module",
    exports: "./index.js",
  }));
  writeFileSync(join(candidate, "fixture-dependency", "index.js"), "export const ready = true;\n");
  writeFileSync(join(candidate, "src", "index.ts"), [
    'import { ready } from "fixture-dependency";',
    'if (!ready) throw new Error("fixture dependency unavailable");',
    "export { ready };",
    "",
  ].join("\n"));
  writeFileSync(join(candidate, "package.json"), JSON.stringify({
    name: "candidate-fixture",
    private: true,
    type: "module",
    dependencies: { "fixture-dependency": "file:./fixture-dependency" },
    scripts: {
      "test:release": "node -e \"require('node:fs').writeFileSync('../test-release-started', '')\"",
    },
  }, null, 2));
  command(candidate, "npm", ["install", "--package-lock-only", "--ignore-scripts"]);
  rmSync(join(candidate, "node_modules"), { recursive: true, force: true });
  command(candidate, "git", ["init", "--quiet"]);
  command(candidate, "git", ["config", "user.email", "test@example.com"]);
  command(candidate, "git", ["config", "user.name", "Test"]);
  command(candidate, "git", ["add", "."]);
  command(candidate, "git", ["commit", "--quiet", "-m", "fixture"]);
  const commit = command(candidate, "git", ["rev-parse", "HEAD"]);
  const tree = command(candidate, "git", ["rev-parse", "HEAD^{tree}"]);
  command(candidate, "git", ["checkout", "--quiet", "--detach", commit]);
  return { root, candidate, commit, tree };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("prepares a fresh detached candidate before an authoritative attempt can exist", () => {
  const fixture = makeDetachedCandidate();
  const evidence = join(fixture.root, "prepared.json");
  const attempt = join(fixture.root, "attempts", "attempt-001");
  const testReleaseStarted = join(fixture.root, "test-release-started");
  mkdirSync(join(fixture.root, "attempts"));

  const failedNpmDirectory = join(fixture.root, "failed-npm");
  mkdirSync(failedNpmDirectory);
  const failedNpm = join(failedNpmDirectory, "npm");
  writeFileSync(failedNpm, "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$NPM_CALLS\"\nexit 42\n");
  chmodSync(failedNpm, 0o755);
  const calls = join(fixture.root, "npm-calls.txt");
  const prepareArgs = [
    gateScript,
    "prepare",
    "--worktree", fixture.candidate,
    "--commit", fixture.commit,
    "--tree", fixture.tree,
    "--evidence", evidence,
  ];
  const failedPreparation = spawnSync(process.execPath, prepareArgs, {
    encoding: "utf8",
    env: { ...process.env, PATH: `${failedNpmDirectory}:${process.env.PATH}`, NPM_CALLS: calls },
  });
  expect(failedPreparation.status).not.toBe(0);
  expect(readFileSync(calls, "utf8")).toBe("ci\n");
  expect(existsSync(evidence)).toBe(false);
  expect(existsSync(attempt)).toBe(false);
  expect(existsSync(testReleaseStarted)).toBe(false);

  const unpreparedStart = spawnSync(process.execPath, [
    gateScript,
    "start",
    "--worktree", fixture.candidate,
    "--commit", fixture.commit,
    "--tree", fixture.tree,
    "--evidence", evidence,
    "--attempt-dir", attempt,
  ], { encoding: "utf8" });
  expect(unpreparedStart.status).not.toBe(0);
  expect(existsSync(attempt)).toBe(false);
  expect(existsSync(testReleaseStarted)).toBe(false);

  execFileSync(process.execPath, prepareArgs, { encoding: "utf8" });
  expect(existsSync(join(fixture.candidate, "node_modules", "fixture-dependency"))).toBe(true);
  const prepared = JSON.parse(readFileSync(evidence, "utf8"));
  expect(prepared).toMatchObject({
    contract: "mdlm-release-candidate-preparation@1",
    commit: fixture.commit,
    tree: fixture.tree,
    install: { command: "npm", arguments: ["ci"] },
    importProof: { entrypoint: "src/index.ts", result: "pass" },
  });

  prepared.tree = "0".repeat(40);
  writeFileSync(evidence, `${JSON.stringify(prepared, null, 2)}\n`);
  const mismatchedStart = spawnSync(process.execPath, [
    gateScript,
    "start",
    "--worktree", fixture.candidate,
    "--commit", fixture.commit,
    "--tree", fixture.tree,
    "--evidence", evidence,
    "--attempt-dir", attempt,
  ], { encoding: "utf8" });
  expect(mismatchedStart.status).not.toBe(0);
  expect(existsSync(attempt)).toBe(false);
  expect(existsSync(testReleaseStarted)).toBe(false);
});
