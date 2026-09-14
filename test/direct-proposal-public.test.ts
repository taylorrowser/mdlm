import {spawnSync} from "node:child_process";
import {expect, it} from "vitest";
it("publishes direct observations with read-only guidance, exact evidence, conflicts and recoverable settlement", () => {
  const result = spawnSync(process.execPath, ["scripts/direct-proposal-walkthrough.mjs"], {encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024});
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).ok).toBe(true);
}, 180_000);
