import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { installProportionalPhaseTwoReadyFixture } from
  "./helpers/proportional-phase-2-ready-fixture.js";
import { runZeroInterfacePhaseTwoRoute } from
  "./helpers/proportional-phase-2-routes.js";

const CONTENDED_PHASE_TWO_TEST_TIMEOUT_MS = 510_000;
const fixtureRoot = path.join(
  process.cwd(),
  "test/fixtures/proportional-phase-2-ready",
);

it(
  "publishes one zero-interface SYS from the exact publicly captured DWP",
  runZeroInterfacePhaseTwoRoute,
  CONTENDED_PHASE_TWO_TEST_TIMEOUT_MS,
);

it("rejects a proportional checkpoint whose compressed digest changed", async () => {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-proportional-fixture-mutation-"),
  );
  try {
    const copiedFixture = path.join(parent, "fixture");
    await fs.cp(fixtureRoot, copiedFixture, { recursive: true });
    const manifestPath = path.join(copiedFixture, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.compressedSha256 = "0".repeat(64);
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await expect(installProportionalPhaseTwoReadyFixture(
      path.join(parent, "repository"),
      copiedFixture,
    )).rejects.toThrow("compressed digest mismatch");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

it("installs frozen isolated proportional checkpoint clones", async () => {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-proportional-fixture-clones-"),
  );
  try {
    const firstRepository = path.join(parent, "first");
    const secondRepository = path.join(parent, "second");
    const first = await installProportionalPhaseTwoReadyFixture(firstRepository);
    const second = await installProportionalPhaseTwoReadyFixture(secondRepository);

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);

    const descriptor = ".lifecycle/repository.json";
    const secondSource = await fs.readFile(
      path.join(secondRepository, descriptor),
      "utf8",
    );
    await fs.appendFile(path.join(firstRepository, descriptor), "\n");
    expect(await fs.readFile(path.join(secondRepository, descriptor), "utf8"))
      .toBe(secondSource);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
