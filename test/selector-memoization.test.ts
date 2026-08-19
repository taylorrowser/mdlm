import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";

const processRef = "mdlm-bootstrap@0.70.0#sha256:selector-memoization";

function draftProduct(): LifecycleRecord {
  return {
    datum: {
      id: "PSP-MEMO000001",
      revision: 1,
      revision_id: "PSP-MEMO000001-r00001",
      type: "PSP",
      payload: {
        title: "Selector memoization",
        rationale: "Equivalent queries should be stable within one snapshot.",
        problem: "Repeated selector scans make lifecycle evaluation superlinear.",
        users: ["operator"],
        goals: ["evaluate one exact snapshot efficiently"],
        non_goals: [],
        success_measures: ["equivalent selector invocations execute once"],
      },
      links: [],
      created_by: { process_ref: processRef, scenario: "compile-psp@2" },
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

describe("LifecycleEvaluator Selector memoization", () => {
  it("evaluates each equivalent Selector query once per exact snapshot", async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));

    const queryReads = new Map<string, number>();
    for (const definition of Object.values(loaded.package.selectors)) {
      const query = definition.query;
      Object.defineProperty(definition, "query", {
        configurable: true,
        get() {
          queryReads.set(definition.id, (queryReads.get(definition.id) ?? 0) + 1);
          return query;
        },
      });
    }

    const evaluation = evaluateLifecycle(loaded.package, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [draftProduct()],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      queryReads.get("newer-revisions-for"),
      "one expression-index read plus one equivalent exact-subject query",
    ).toBe(2);
    expect(
      evaluation.phase?.candidateSelection.evidence.selectors,
      "phase evidence remains explicit rather than disappearing behind the cache",
    ).toEqual(expect.any(Array));
  });
});
