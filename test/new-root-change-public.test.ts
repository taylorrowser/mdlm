import {spawnSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, test} from "vitest";

test("approved new-root-only change publishes its branch and retains existing edit limits", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-new-root-change-"));
  const root = path.join(directory, "journey");
  const evidenceFile = path.join(`${root}-evidence`, "result.json");
  const executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/direct-lifecycle-walkthrough.mjs"),
    "--process", "iterative", "--new-root-change", "--executable", executable, "--root", root],
  {encoding: "utf8", timeout: 300_000, maxBuffer: 30 * 1024 * 1024});
  process.stdout.write(`NEW_ROOT_CHANGE_EVIDENCE ${evidenceFile}\n`);
  const evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8"));
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(evidence.ok).toBe(true);
  expect(evidence.newRootChange).toBe(true);
  const proof = JSON.parse(await fs.readFile(path.join(`${root}-evidence`, "new-root-proof.json"), "utf8"));
  expect(proof.rejected).toEqual(["unauthorized-root", "unauthorized-edit"]);
  expect(proof.terminal.items).toContainEqual(expect.objectContaining({action: expect.stringMatching(/^review-requirements@/), subject: proof.selection}));
  // The journey preserves commands, exact publications and both repositories on all outcomes.
}, 330_000);
