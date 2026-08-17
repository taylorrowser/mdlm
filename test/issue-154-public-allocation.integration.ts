import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { mdlm } from "./helpers/mdlm.js";

it("returns the authenticated stale-DWP Assignment through public next", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-154-allocation-"));
  const repository = path.join(root, "repository");
  const fixtures = path.join(process.cwd(), "test/fixtures/phase-hardening");
  const bundle = path.join(fixtures, "calculator-stale-dwp-ready-0.66.0.bundle");
  try {
    expect(createHash("sha256").update(await fs.readFile(bundle)).digest("hex"))
      .toBe("150deb01c9478799ef4386f42ebc1d86bfb79897d2bff37d0a3fe686f719e1d7");
    const cloned = spawnSync("git", ["clone", "--quiet", bundle, repository], { encoding: "utf8" });
    expect(cloned.status, `${cloned.stderr}${cloned.stdout}`).toBe(0);
    const checkedOut = spawnSync("git", ["-C", repository, "checkout", "--quiet", "30934296abcae2d81e339d57e8ca312794382db7"], { encoding: "utf8" });
    expect(checkedOut.status, `${checkedOut.stderr}${checkedOut.stdout}`).toBe(0);
    const allocated = mdlm(repository, "next", "--json");
    expect(allocated.status, `${allocated.stderr}${allocated.stdout}`).toBe(0);
    const assignment = JSON.parse(allocated.stdout).assignment.id as string;
    const generatedLease = JSON.parse(
      await fs.readFile(
        path.join(repository, ".lifecycle/work/active-assignment.json"),
        "utf8",
      ),
    );
    expect(generatedLease).toMatchObject({
      id: assignment,
      scenario: "replan-stale-decomposition-work-package@1",
      obligation: { subject: "DWP-F7N6WQPHQ4-r00001" },
      bindings: [{ inputs: [
        { name: "prior_plan", values: ["DWP-F7N6WQPHQ4-r00001"] },
        { name: "parents", values: ["STK-BN9AVKRQE9-r00001"] },
        { name: "retained_requirements", values: [] },
        { name: "architecture", values: ["ASP-9W1TXS1A1H-r00001"] },
        { name: "interfaces", values: ["ICSP-JTJ9ZWD6MR-r00002"] },
        { name: "verification_strategy", values: ["VSP-HG5ZJJZZD3-r00001"] },
      ] }],
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 300_000);
