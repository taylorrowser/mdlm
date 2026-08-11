import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  loadProcessPackage,
  type ExactTypedEntity,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const ids = {
  parent: "STK-0EXACTPAR0",
  plan: "DWP-0EXACTDWP0",
  output: "SYS-0EXACTOUT0",
  architecture: "ASP-0EXACTARC0",
  firstInterface: "ICSP-0EXACTIC01",
  secondInterface: "ICSP-0EXACTIC02",
  strategy: "VSP-0EXACTVSP0",
};
const revision = (id: string, number = 1) =>
  `${id}-r${String(number).padStart(5, "0")}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  revisionNumber: number,
  links: Array<{ type: string; target: string }> = [],
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    revision: revisionNumber,
    links,
    createdBy: {
      scenario: type === "DWP"
        ? revisionNumber === 1
          ? "define-decomposition-work-package@2"
          : "complete-decomposition-work-package@2"
        : "test-fixture@1",
      prompt_ref: "prompts/test-fixture.md@1",
      process_ref: "git:current",
      loaded_skill_refs: [],
      policy_refs: [],
    },
    storage: { editable: false, frozen: true },
  });
}

function records(options: {
  completionParent?: string;
  outputParent?: string;
} = {}): LifecycleRecord[] {
  const exactParent = revision(ids.parent);
  const substitutedParent = revision(ids.parent, 2);
  const plan = revision(ids.plan);
  const output = revision(ids.output);
  const architecture = revision(ids.architecture);
  const interfaces = [revision(ids.firstInterface), revision(ids.secondInterface)];
  const strategy = revision(ids.strategy);

  return [
    record("STK", ids.parent, {}, 1),
    record("STK", ids.parent, {}, 2),
    record("ASP", ids.architecture, {}, 1),
    record("ICSP", ids.firstInterface, {}, 1),
    record("ICSP", ids.secondInterface, {}, 1),
    record("VSP", ids.strategy, {}, 1),
    record("DWP", ids.plan, { stage: "planning" }, 1, [
      { type: "decomposes", target: exactParent },
      { type: "allocated-to", target: architecture },
      ...interfaces.map((target) => ({ type: "governed-by", target })),
      { type: "verified-under", target: strategy },
    ]),
    record("SYS", ids.output, {}, 1, [
      { type: "derived-from", target: options.outputParent ?? exactParent },
      { type: "decomposes", target: plan },
    ]),
    record("DWP", ids.plan, {
      stage: "completion",
      parent_coverage_status: "complete",
      output_reviews_complete: true,
    }, 2, [
      { type: "decomposes", target: options.completionParent ?? exactParent },
      { type: "derived-from", target: plan },
      { type: "allocated-to", target: architecture },
      ...interfaces.map((target) => ({ type: "governed-by", target })),
      { type: "verified-under", target: strategy },
      { type: "produces", target: output },
    ]),
  ];
}

function selectedRevisionIds(
  processPackage: ProcessPackage,
  selector: string,
  snapshotRecords: LifecycleRecord[],
  argumentsValue: Record<string, string>,
): string[] {
  const evaluation = evaluateProcessDefinition(
    processPackage,
    {
      processRef: "git:current",
      phaseId: "phase-2-system-definition",
      records: snapshotRecords,
      dependencyComparisons: [],
    },
    "selector",
    selector,
    argumentsValue,
  );
  return (evaluation.result as ExactTypedEntity[]).map(
    (result) => result.identity.revision_id,
  );
}

describe("exact DWP parent Revision matching", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("rejects same-lineage parent substitutions from completion coverage", () => {
    const selector = "valid-decomposition-completions-for-plan@1";
    const argumentsValue = { plan: revision(ids.plan) };

    expect(selectedRevisionIds(processPackage, selector, records(), argumentsValue))
      .toEqual([revision(ids.plan, 2)]);
    expect(selectedRevisionIds(processPackage, selector, records({
      completionParent: revision(ids.parent, 2),
    }), argumentsValue)).toEqual([]);
    expect(selectedRevisionIds(processPackage, selector, records({
      outputParent: revision(ids.parent, 2),
    }), argumentsValue)).toEqual([]);
  });

  it("rejects same-lineage parent substitutions from DWP Review correction validation", () => {
    const selector = "valid-phase-2-dwp-review-correction@1";
    const argumentsValue = { replacement: revision(ids.plan, 2) };

    expect(selectedRevisionIds(processPackage, selector, records(), argumentsValue))
      .toEqual([revision(ids.plan, 2)]);
    expect(selectedRevisionIds(processPackage, selector, records({
      completionParent: revision(ids.parent, 2),
      outputParent: revision(ids.parent, 2),
    }), argumentsValue)).toEqual([]);
  });
});
