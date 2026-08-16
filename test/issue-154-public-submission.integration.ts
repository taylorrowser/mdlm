import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { mdlmWithInput } from "./helpers/mdlm.js";

it("canonically replans the authenticated stale-support calculator DWP", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-154-submission-"));
  const repository = path.join(root, "repository");
  const fixtures = path.join(process.cwd(), "test/fixtures/phase-hardening");
  const bundle = path.join(fixtures, "calculator-stale-dwp-ready-0.66.0.bundle");
  const fixtureHead = "30934296abcae2d81e339d57e8ca312794382db7";
  try {
    expect(createHash("sha256").update(await fs.readFile(bundle)).digest("hex"))
      .toBe("150deb01c9478799ef4386f42ebc1d86bfb79897d2bff37d0a3fe686f719e1d7");
    const cloned = spawnSync("git", ["clone", "--quiet", bundle, repository], { encoding: "utf8" });
    expect(cloned.status, `${cloned.stderr}${cloned.stdout}`).toBe(0);
    const checkedOut = spawnSync("git", ["-C", repository, "checkout", "--quiet", fixtureHead], { encoding: "utf8" });
    expect(checkedOut.status, `${checkedOut.stderr}${checkedOut.stdout}`).toBe(0);
    expect(spawnSync("git", ["-C", repository, "diff", "--quiet", "c8c76418732271acef9ba448271cae5002bbecc6..HEAD", "--", ".lifecycle/data"]).status).toBe(0);
    const lease = path.join(fixtures, "calculator-stale-dwp-ready-work/active-assignment.json");
    const leaseBytes = await fs.readFile(lease);
    expect(createHash("sha256").update(leaseBytes).digest("hex"))
      .toBe("37f410cffbd6f07935eba4e6a6ca467e4e2a77cb4c46a10953c3e6bb36b1af92");
    await fs.mkdir(path.join(repository, ".lifecycle/work"), { recursive: true });
    await fs.copyFile(lease, path.join(repository, ".lifecycle/work/active-assignment.json"));
    const responsePath = path.join(fixtures, "calculator-stale-dwp-replan-response.json");
    const responseBytes = await fs.readFile(responsePath);
    expect(createHash("sha256").update(responseBytes).digest("hex"))
      .toBe("639e383bf77b42278b26eb293316f5c0a2b6bf5a7640427157d3dd0dca572ed8");
    const response = JSON.parse(responseBytes.toString("utf8"));
    expect(response.proposal.outputs[0]).toMatchObject({
      lifecycleDatum: {
        id: "DWP-F7N6WQPHQ4",
        links: expect.arrayContaining([
          { type: "governed-by", target: "ICSP-JTJ9ZWD6MR-r00002" },
        ]),
      },
    });
    const submitted = mdlmWithInput(repository, `${JSON.stringify(response)}\n`, "scenario", "submit");
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      ok: true,
      execution: {
        status: "completed",
        outputs: [expect.objectContaining({ lifecycleDatum: expect.objectContaining({
          id: "DWP-F7N6WQPHQ4",
          revisionId: "DWP-F7N6WQPHQ4-r00002",
        }) })],
      },
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 300_000);
