import path from "node:path";
import { expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";

it("allows an intent candidate when the exact stable-link target set is empty", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;

  const scenario = loaded.package.scenarios["create-phase-0-intent-candidate"]!;
  const stableLinkTargets = (scenario.inputs as Array<Record<string, unknown>>)
    .find((input) => input.name === "stable_link_targets");
  expect(stableLinkTargets).toMatchObject({
    cardinality: "zero-or-more",
  });
  expect(stableLinkTargets).not.toHaveProperty("conditions");

  const obligation = loaded.package.obligations["intent-candidate-required"]!;
  expect((obligation.resolve_with as {
    inputs: { stable_link_targets: { source: string } };
  }).inputs.stable_link_targets.source).toBe(
    'select("phase-0-foundation-stable-link-targets@1", {})',
  );
});
