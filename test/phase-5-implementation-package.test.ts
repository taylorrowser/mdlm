import { beforeAll, describe, expect, it } from "vitest";
import {
  compileAssignmentProjection,
  loadProcessPackage,
  publicAssignmentRenderer,
  type ProcessPackage,
} from "../src/index.js";

const record = (value: unknown): Record<string, any> =>
  value as Record<string, any>;

describe("lean Phase 5 Process Package", () => {
  let process: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(".lifecycle/process");
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!loaded.ok) throw new Error("Process Package did not load");
    process = loaded.package;
  });

  it("keeps product and source-blind formal implementation behind existing public seams", () => {
    expect(process.manifest.version).toBe("0.112.0");
    expect(record(process.profiles.bootstrap.enabled).phases).toContain(
      "phase-5-implementation",
    );
    expect(process.phases["phase-5-implementation"]).toBeDefined();

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
    expect(target.cardinality).toBe("zero-or-one");
    expect(record(record(formal.participation).arguments)).not.toHaveProperty(
      "execution_target",
    );
    expect(record(
      record(process.obligations["formal-verification-implementation-required"])
        .resolve_with,
    ).scenario).toBe("implement-verification-activity@1");
  });

  it("uses one sibling VAI context and gates the Phase 6 boundary on exact design acceptance", () => {
    const subjects = JSON.stringify(
      record(process.selectors["review-context-subjects"]).query.where,
    );
    expect(subjects).toContain("phase-5-formal-vai-review-anchor@1");

    const contextMembers = JSON.stringify(
      record(process.selectors["review-context-members-for"]).query.where,
    );
    expect(contextMembers).toContain(
      "phase-5-formal-vai-review-context-members-for@1",
    );

    const terminal = JSON.stringify(
      record(record(process.profiles.bootstrap.terminal_outcomes).profile_boundary)
        .condition,
    );
    expect(terminal).toContain("accepted-design-baselines@1");
    expect(process.obligations["design-acceptance-required"]).toBeDefined();
    expect(process.selectors["accepted-design-baselines-for-candidate"])
      .toBeDefined();
  });
});
