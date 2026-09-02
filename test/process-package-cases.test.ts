import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { testProcessPackage } from "../src/process-package-fixtures.js";

async function copyPackage(): Promise<{ temporaryRoot: string; root: string }> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-cases-"));
  const root = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });
  return { temporaryRoot, root };
}

async function rewriteYaml(
  filePath: string,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const value = parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  mutate(value);
  await fs.writeFile(filePath, stringify(value));
}

describe("Process Package semantic cases", () => {
  it("passes the two bundled cases in deterministic name order", async () => {
    const result = await testProcessPackage(".lifecycle/process");
    expect(result).toMatchObject({
      ok: true,
      value: {
        passed: 2,
        failed: 0,
        cases: [
          { name: "phase-4-admission", kind: "phase-admission", passed: true },
          {
            name: "scenario-output-discriminator",
            kind: "discriminated-output",
            passed: true,
          },
        ],
      },
    });
  });

  it("rejects a behavior-bearing package with no cases", async () => {
    const copied = await copyPackage();
    try {
      await fs.rm(path.join(copied.root, "cases"), { recursive: true });
      const result = await testProcessPackage(copied.root);
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [{ code: "process-cases-empty" }],
      });
    } finally {
      await fs.rm(copied.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("reports a mismatched case fact", async () => {
    const copied = await copyPackage();
    try {
      await rewriteYaml(
        path.join(copied.root, "cases/phase-4-admission/case.yaml"),
        (testCase) => {
          testCase.selector = "complete-phase-4-level-candidates@1";
        },
      );
      const result = await testProcessPackage(copied.root);
      expect(result).toMatchObject({
        ok: true,
        value: {
          passed: 1,
          failed: 1,
          cases: [
            {
              name: "phase-4-admission",
              diagnostics: [{ code: "process-case-phase-admission-mismatch" }],
            },
            { name: "scenario-output-discriminator", diagnostics: [] },
          ],
        },
      });
    } finally {
      await fs.rm(copied.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("reports the two observed declaration mismatches deterministically", async () => {
    const copied = await copyPackage();
    try {
      await rewriteYaml(
        path.join(copied.root, "phases/phase-4-design-definition.yaml"),
        (phase) => {
          const progression = phase.progression as Record<string, unknown>;
          progression.readiness = String(progression.readiness).replace(
            /\n\s*&& !every\("phase-5-entry-design-candidates@1"[\s\S]*?admitted != candidate\)\)/,
            ")",
          );
        },
      );
      await rewriteYaml(
        path.join(
          copied.root,
          "scenarios/execute-lower-level-decomposition-work-package.yaml",
        ),
        (scenario) => {
          const outputs = scenario.outputs as Record<string, unknown>[];
          const requirement = outputs[0]!;
          scenario.outputs = [
            {
              ...requirement,
              name: "component_requirements",
              types: ["CMP"],
              cardinality: "zero-or-more",
              type_from: undefined,
            },
            {
              ...requirement,
              name: "design_requirements",
              types: ["DES"],
              cardinality: "zero-or-more",
              type_from: undefined,
            },
            ...outputs.slice(1),
          ];
        },
      );

      const result = await testProcessPackage(copied.root);
      expect(result).toMatchObject({
        ok: true,
        value: {
          passed: 0,
          failed: 2,
          cases: [
            {
              name: "phase-4-admission",
              diagnostics: [{ code: "process-case-phase-admission-mismatch" }],
            },
            {
              name: "scenario-output-discriminator",
              diagnostics: [{ code: "process-case-discriminated-output-mismatch" }],
            },
          ],
        },
      });
    } finally {
      await fs.rm(copied.temporaryRoot, { recursive: true, force: true });
    }
  });
});
