import { beforeAll, describe, expect, it } from "vitest";
import {
  compileAssignmentProjection,
  loadProcessPackage,
  publicAssignmentRenderer,
  type ProcessPackage,
} from "../src/index.js";

const record = (value: unknown): Record<string, any> =>
  value as Record<string, any>;

describe("lean Phase 5 and Phase 6 Process Package", () => {
  let process: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(".lifecycle/process");
    expect(loaded.ok, JSON.stringify(loaded.diagnostics, null, 2))
      .toBe(true);
    if (!loaded.ok) throw new Error("Process Package did not load");
    process = loaded.package;
  });

  it("keeps product and source-blind formal implementation behind existing public seams", () => {
    expect(process.manifest.version).toBe("0.119.0");
    expect(record(process.profiles.bootstrap!.enabled).phases).toContain(
      "phase-5-implementation",
    );
    expect(process.phases["phase-5-implementation"]).toBeDefined();
    expect(record(process.profiles.bootstrap!.enabled).phases).toContain(
      "phase-6-verification",
    );
    expect(process.phases["phase-6-verification"]).toBeDefined();

    const product = process.scenarios["implement-design-set"]!;
    const productProjection = compileAssignmentProjection({
      scenario: product,
      renderer: publicAssignmentRenderer,
      source: ".lifecycle/process/scenarios/implement-design-set.yaml",
    });
    expect(productProjection.ok).toBe(true);
    if (productProjection.ok) {
      expect(productProjection.plan.outputs[0]?.links).toEqual([
        { link: "realizes-candidate", target: { kind: "input", input: "candidate" } },
        { link: "implements", target: { kind: "input", input: "design_requirements" } },
      ]);
    }

    const formal = process.scenarios["implement-verification-activity"]!;
    const target = (formal.inputs as Record<string, any>[]).find(
      (input: Record<string, any>) => input.name === "execution_target",
    );
    expect(target!.cardinality).toBe("one");
    expect(record(record(formal.participation).arguments)).not.toHaveProperty(
      "execution_target",
    );
    expect(record(
      record(process.obligations["formal-verification-implementation-required"])
        .resolve_with,
    ).scenario).toBe("implement-verification-activity@1");
    expect(JSON.stringify(formal.completion)).toContain(
      "implementation.payload.authoring_input_refs",
    );
  });

  it("uses one sibling VAI context and continues exact design acceptance into Phase 6", () => {
    const subjects = JSON.stringify(
      record(process.selectors["review-context-subjects"]).query.where,
    );
    expect(subjects).toContain("phase-5-formal-vai-review-anchor@1");
    expect(subjects).toContain("revise-pilot-vai-after-review@3");

    const assignmentMembers = record(
      process.selectors["review-assignment-context-members-for"],
    );
    expect(record(record(assignmentMembers.query).from).types).toEqual(
      expect.arrayContaining(["CMP", "DES"]),
    );

    const contextMembers = JSON.stringify(
      record(process.selectors["review-context-members-for"]).query.where,
    );
    expect(contextMembers).toContain(
      "phase-5-formal-vai-review-context-members-for@1",
    );

    const correction = process.scenarios["revise-pilot-vai-after-review"]!;
    expect(JSON.stringify(correction.completion)).toContain(
      "replacement.payload.authoring_input_refs",
    );

    const terminal = JSON.stringify(
      record(record(process.profiles.bootstrap!.terminal_outcomes).profile_boundary)
        .condition,
    );
    expect(terminal).not.toContain("accepted-design-baselines@1");
    const lifecycleComplete = JSON.stringify(
      record(record(process.profiles.bootstrap!.terminal_outcomes).lifecycle_complete)
        .condition,
    );
    expect(lifecycleComplete).toContain(
      "applicable-product-acceptance-decisions-for@1",
    );
    expect(process.obligations["design-acceptance-required"]).toBeDefined();
    expect(process.selectors["accepted-design-baselines-for-candidate"])
      .toBeDefined();
    expect(process.obligations["verification-run-required"]).toBeDefined();
    expect(process.obligations["product-acceptance-required"]).toBeDefined();
  });
});
