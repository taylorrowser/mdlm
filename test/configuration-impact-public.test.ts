import {spawnSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("maintenance publishes generated configuration impact coordinates without weakening coverage", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-configuration-impact-"));
  const root = path.join(directory, "journey");
  const evidenceFile = path.join(`${root}-evidence`, "result.json");
  const executable = path.join(process.cwd(), "dist/mdlm.js");
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/direct-lifecycle-walkthrough.mjs"),
    "--process", "iterative", "--configuration-impact", "--executable", executable, "--root", root],
  {encoding: "utf8", timeout: 300_000, maxBuffer: 30 * 1024 * 1024});
  process.stdout.write(`CONFIGURATION_IMPACT_EVIDENCE ${evidenceFile}\n`);
  const evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8"));
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(evidence.ok).toBe(true);
  const proof = JSON.parse(await fs.readFile(path.join(`${root}-evidence`, "configuration-impact-proof.json"), "utf8"));
  expect(proof.mapping.candidate.role).toBe("configuration");
  expect(proof.rejected).toEqual(["wrong-configuration-role", "missing-configuration-target", "unsupported-impact-role"]);
  // Both outcomes retain exact proposals, CLI results, identities and repositories for audit.
}, 330_000);
