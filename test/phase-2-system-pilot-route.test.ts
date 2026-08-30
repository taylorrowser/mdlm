import path from "node:path";
import { expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";

it("routes one deterministic Phase 2 SYS through the existing pilot evidence graph", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));

  const package_ = loaded.package;
  const representative = package_.selectors[
    "representative-system-requirements-for-level-candidate"
  ] as unknown as { query: { where: { source: string } } };
  expect(representative.query.where.source).toContain(
    'first("system-requirements-for-level-candidate@1", {candidate: candidate})',
  );

  const strategyType = package_.types.VSP as unknown as {
    outgoing_links: Array<{ id: string; targets: Array<{ types: string[] }> }>;
  };
  expect(strategyType.outgoing_links.find((link) => link.id === "governs")
    ?.targets[0]?.types).toEqual(["STK", "SYS"]);
  expect(strategyType.outgoing_links.find((link) => link.id === "governs-revision")
    ?.targets[0]?.types).toEqual(["STK", "SYS"]);

  const scenarios = [
    package_.scenarios["define-system-verification-strategy"],
    package_.scenarios["write-system-verification-activity"],
    package_.scenarios["build-system-pilot-control-prototype"],
  ] as unknown as Array<{
    inputs: Array<{ types: string[] }>;
    outputs: Array<{ types: string[] }>;
  }>;
  expect(scenarios.map((scenario) => scenario.inputs[0]!.types)).toEqual([
    ["SYS"], ["SYS"], ["SYS"],
  ]);
  expect(scenarios.map((scenario) => scenario.outputs[0]!.types)).toEqual([
    ["VSP"], ["VER"], ["ART"],
  ]);

  for (const id of [
    "realize-verification-environment",
    "implement-verification-activity",
    "execute-verification-run",
    "revise-pilot-vai-after-result",
  ]) {
    expect(package_.scenarios[id]!.phases).toContain("phase-2-system-definition");
  }

  const resultCorrection = package_.scenarios[
    "revise-pilot-vai-after-result"
  ] as unknown as {
    outputs: Array<{
      name: string;
      cardinality: string;
      identity_from?: { input: string };
    }>;
  };
  expect(resultCorrection.outputs.find((output) =>
    output.name === "replacement_target"
  )).toMatchObject({
    cardinality: "zero-or-one",
    identity_from: { input: "execution_target" },
  });

  const phase = package_.phases["phase-2-system-definition"] as unknown as {
    outputs: string[];
    gate: { completion: { source: string } };
  };
  expect(phase.outputs).toEqual(expect.arrayContaining([
    "VSP", "ENV", "VER", "VAI", "RUN", "RES", "ART",
  ]));
  expect(phase.gate.completion.source).toContain(
    "candidates-with-suitable-representative-pilot@1",
  );
  expect(Object.keys(package_.types)).not.toContain("PAS2");
});
