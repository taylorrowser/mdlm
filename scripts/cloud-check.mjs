#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/mdlm.js");
const smoke = mkdtempSync(join(tmpdir(), "mdlm-cloud-smoke-"));
let ready = false;
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd, encoding: "utf8", timeout: 60000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`CLI ${args.join(" ")} failed: ${result.error?.message ?? result.signal ?? result.status}\n${result.stderr}\n${result.stdout}`);
  }
  return result.stdout.trim();
}
try {
  const version = run(["--version"]);
  run(["release-notes"]);
  const product = join(smoke, "product");
  run(["init", product, "--process", "iterative"]);
  const selected = JSON.parse(run(["process", "show", "--json"], product));
  JSON.parse(run(["expectations", "--json"], product));
  console.log(JSON.stringify({ check: "cli-smoke", status: "pass", version, selectedProcess: selected.package }));
  ready = true;
} catch (error) {
  console.error(error.message);
  console.error(`Failed smoke workspace preserved at ${smoke}`);
  process.exitCode = 1;
} finally {
  if (ready) rmSync(smoke, { recursive: true, force: true });
}
const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
  encoding: "utf8", timeout: 15000,
});
const available = !docker.error && !docker.signal && docker.status === 0;
console.log(JSON.stringify({
  check: "docker-daemon", status: available ? "available" : "unavailable",
  serverVersion: available ? docker.stdout.trim() : undefined,
  reason: available ? undefined : docker.error?.code ?? docker.signal ?? `exit ${docker.status}`,
  actualProductVerification: "not-run",
  next: available
    ? "Run the selected verification method and exact image before claiming runtime support."
    : "Runtime-dependent checks remain not run; use an authorized Docker-capable environment.",
}));
