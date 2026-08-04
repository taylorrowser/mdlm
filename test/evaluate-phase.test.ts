import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessPackage,
} from "../src/index.js";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";

function candidate(id: string, scope: string): LifecycleRecord {
  return {
    datum: {
      id,
      revision: 1,
      revision_id: `${id}-r00001`,
      type: "SNP",
      payload: {
        title: `${scope} candidate`,
        kind: "intent-level-candidate",
        role: "candidate",
        scope,
        group: "DEFAULT",
        definition_members: [],
        evidence: [],
      },
      links: [],
      created_by: { process_ref: "git:phase-candidates" },
      body: "",
    },
    storage: { editable: false, frozen: true },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

describe("phase evaluation", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("explains failed entry and missing candidates with expression and Selector evidence", () => {
    const result = evaluateLifecycle(processPackage, {
      processRef: "git:phase-evidence",
      phaseId: "phase-2-system-definition",
      records: [],
      dependencyComparisons: [],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.phase).toEqual({
      id: "phase-2-system-definition",
      version: 2,
      entry: {
        satisfied: false,
        explanation: "The package-defined phase entry expression is not satisfied.",
        evidence: {
          source:
            'process.integrity.package_valid == true && exists("signed-off-candidates-of-kind@1",\n  {baseline_kind: "intent-level-candidate"})',
          result: false,
          selectors: expect.arrayContaining([
            {
              selector: "signed-off-candidates-of-kind@1",
              arguments: { baseline_kind: "intent-level-candidate" },
              result: [],
            },
          ]),
        },
      },
      candidateSelection: {
        explanation:
          "The package-defined candidate selection expression returned no exact entities.",
        entities: [],
        evidence: {
          source:
            'select("candidate-baselines-of-kind@1",\n  {baseline_kind: "level-candidate"})',
          result: [],
          selectors: expect.arrayContaining([
            {
              selector: "candidate-baselines-of-kind@1",
              arguments: { baseline_kind: "level-candidate" },
              result: [],
            },
          ]),
        },
      },
    });
  });

  it("returns exact package-typed candidates in declared order without mutating the snapshot", async () => {
    const loaded = await loadProcessPackage(
      await renamedBaselineProcessPackage(),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const zebra = candidate("SNP-7K3M9Q2D8F", "zebra");
    const alpha = candidate("SNP-4K3M9Q2D8F", "alpha");
    const snapshot: LifecycleSnapshot = {
      processRef: "git:phase-candidates",
      phaseId: "phase-0-wayfinding",
      records: [zebra, alpha],
      dependencyComparisons: [],
    };
    const beforeEvaluation = structuredClone(snapshot);

    const first = evaluateLifecycle(loaded.package, snapshot);
    const second = evaluateLifecycle(loaded.package, {
      ...snapshot,
      records: [alpha, zebra],
    });

    const expectedCandidates = [
      {
        identity: {
          id: alpha.datum.id,
          revision_id: alpha.datum.revision_id,
          type: "SNP",
          revision: 1,
        },
      },
      {
        identity: {
          id: zebra.datum.id,
          revision_id: zebra.datum.revision_id,
          type: "SNP",
          revision: 1,
        },
      },
    ];
    expect(first.diagnostics).toEqual([]);
    expect(first.phase?.entry.satisfied).toBe(true);
    expect(first.phase?.candidateSelection.entities).toEqual(
      expectedCandidates,
    );
    expect(first.phase?.candidateSelection.evidence.selectors).toEqual(
      expect.arrayContaining([
        {
          selector: "candidate-baselines-of-kind@1",
          arguments: { baseline_kind: "intent-level-candidate" },
          result: expectedCandidates,
        },
      ]),
    );
    expect(second.phase).toEqual(first.phase);
    expect(snapshot).toEqual(beforeEvaluation);
  });
});
