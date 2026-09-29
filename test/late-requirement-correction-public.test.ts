import {spawnSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("a late implementation requirement finding reaches corrected current evidence", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-late-requirement-"));
  const root = path.join(directory, "journey");
  const evidenceFile = path.join(`${root}-evidence`, "result.json");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/direct-lifecycle-walkthrough.mjs"),
    "--process", "iterative", "--late-requirement-correction", "--executable", executable, "--root", root],
  {encoding: "utf8", timeout: 300_000, maxBuffer: 30 * 1024 * 1024});
  process.stdout.write(`LATE_CORRECTION_EVIDENCE ${evidenceFile}\n`);
  const evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8"));
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(evidence.ok).toBe(true);
  expect(evidence.lateRequirementCorrection).toBe(true);
  expect(evidence.terminal.outcome).toBe("profile-boundary-reached");
  const proof = JSON.parse(await fs.readFile(path.join(`${root}-evidence`, "late-correction-proof.json"), "utf8"));
  expect(proof.acceptance).toBeTruthy();
}, 330_000);
