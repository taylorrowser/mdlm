import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";

async function processPackageWithTextualProcessDrift(
  expression = "subject.provenance.process_ref != process.current_ref",
): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-text-expression-"),
  );
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });

  const statePath = path.join(
    processRoot,
    "states/relationship-overlays.yaml",
  );
  const state = await fs.readFile(statePath, "utf8");
  await fs.writeFile(
    statePath,
    state.replace(
      "    when: 'subject.provenance.process_ref != process.current_ref'",
      `    when: '${expression}'`,
    ),
  );

  return processRoot;
}

function pspCreatedUnder(processRef: string): LifecycleRecord {
  return {
    datum: {
      id: "PSP-7K3M9Q2D8F",
      revision: 1,
      revision_id: "PSP-7K3M9Q2D8F-r00001",
      type: "PSP",
      payload: {
        title: "Lifecycle manager",
        rationale: "Preserve lifecycle intent.",
        problem: "Lifecycle intent is lost between sessions.",
        users: ["product owner"],
        goals: ["preserve intent"],
        non_goals: [],
        success_measures: ["traceable intent"],
      },
      links: [],
      created_by: { process_ref: processRef },
      body: "",
    },
    storage: { editable: true, frozen: false },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

describe("textual MDLM expressions", () => {
  it("loads and evaluates a textual comparison from a Process Package", async () => {
    const processRoot = await processPackageWithTextualProcessDrift();

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    ).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.package.manifest.language).toEqual({
      expressions: "mdlm-expression@1",
    });

    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:older-process")],
      dependencyChanges: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("evaluates typed entity paths, scalar literals, and bound variables", async () => {
    const pathPackage = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(
        'subject.identity.type == "PSP"',
      ),
    );
    const variablePackage = await loadProcessPackage(
      await processPackageWithTextualProcessDrift("subject == subject"),
    );

    expect(pathPackage.ok).toBe(true);
    expect(variablePackage.ok).toBe(true);
    if (!pathPackage.ok || !variablePackage.ok) return;

    for (const processPackage of [pathPackage.package, variablePackage.package]) {
      const evaluation = evaluateLifecycle(processPackage, {
        processRef: "git:current",
        phaseId: "phase-0-wayfinding",
        records: [pspCreatedUnder("git:current")],
        dependencyChanges: [],
      });

      expect(evaluation.diagnostics).toEqual([]);
      expect(
        evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
          "relationship-overlays"
        ],
      ).toEqual(["process-drift"]);
    }
  });

  it("rejects invalid syntax at package load with its source location", async () => {
    const source = "subject.provenance.process_ref ! process.current_ref";

    const loaded = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(source),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-syntax",
          path: expect.stringContaining(
            "relationship-overlays.yaml#rules[2].when",
          ),
          line: 1,
          column: 32,
          source,
          message: "Unexpected character '!'",
        }),
      ]),
    );
  });

  it("rejects an unknown expression binding at package load", async () => {
    const source =
      "candidate.provenance.process_ref != process.current_ref";

    const loaded = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(source),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-binding",
          line: 1,
          column: 1,
          source,
          message: "Unknown expression binding 'candidate'",
        }),
      ]),
    );
  });

  it("rejects incompatible comparison operands at package load", async () => {
    const source = "subject.provenance.process_ref != 42";

    const loaded = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(source),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-type",
          line: 1,
          column: 32,
          source,
          message: "Cannot compare string with number",
        }),
      ]),
    );
  });
});
