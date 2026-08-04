import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";

const processRoot = path.resolve(".lifecycle/process");
let processPackage: ProcessPackage;

beforeAll(async () => {
  const loaded = await loadProcessPackage(processRoot);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  processPackage = loaded.package;
});

function revision(
  id: string,
  number: number,
  title: string,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return {
    datum: {
      id,
      revision: number,
      revision_id: `${id}-r${String(number).padStart(5, "0")}`,
      type: "PSP",
      payload: {
        title,
        rationale: "Preserve intent",
        problem: "Intent is lost",
        users: ["owner"],
        goals: ["traceability"],
        non_goals: [],
        success_measures: ["reviewed intent"],
      },
      links,
      created_by: { process_ref: "git:current" },
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

function evaluate(
  records: LifecycleRecord[],
  dependencyComparisons: Parameters<typeof evaluateLifecycle>[1]["dependencyComparisons"],
  selectedPackage = processPackage,
) {
  return evaluateLifecycle(selectedPackage, {
    processRef: "git:current",
    phaseId: "phase-0-wayfinding",
    records,
    dependencyComparisons,
  });
}

describe("dependency change records", () => {
  it("returns an ordered versioned content record and a package-derived Stale explanation", () => {
    const before = revision("PSP-7K3M9Q2D8F", 1, "Before");
    const after = revision("PSP-7K3M9Q2D8F", 2, "After");

    const result = evaluate([after, before], [
      {
        subjectRevision: after.datum.revision_id,
        beforeRevision: before.datum.revision_id,
        afterRevision: after.datum.revision_id,
      },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.dependencyChanges).toEqual([
      {
        record_version: "dependency-change@1",
        kind: "content-change",
        subject_revision: after.datum.revision_id,
        before_revision: before.datum.revision_id,
        after_revision: after.datum.revision_id,
        path: "payload.title",
        before_present: true,
        after_present: true,
        before: "Before",
        after: "After",
      },
    ]);
    expect(result.artifacts[after.datum.revision_id]).toEqual(
      expect.objectContaining({
        states: expect.objectContaining({ validity: "stale" }),
        stateExplanations: expect.objectContaining({
          validity:
            "At least one package-classified dependency change requires reassessment.",
        }),
      }),
    );
  });

  it("returns deterministic outbound-link and stable-resolution records", () => {
    const stableTarget = "PSP-X4N7AB2W6J";
    const before = revision("PSP-7K3M9Q2D8F", 1, "Same", [
      { type: "justifies", target: stableTarget },
      { type: "derived-from", target: "PSP-1111111111" },
    ]);
    const after = revision("PSP-7K3M9Q2D8F", 2, "Same", [
      { type: "justifies", target: stableTarget },
      { type: "derived-from", target: "PSP-2222222222" },
    ]);

    const result = evaluate([before, after], [
      {
        subjectRevision: after.datum.revision_id,
        beforeRevision: before.datum.revision_id,
        afterRevision: after.datum.revision_id,
        beforeStableLinkResolutions: [
          {
            link: "justifies",
            stableTarget,
            targetRevision: `${stableTarget}-r00001`,
          },
        ],
        afterStableLinkResolutions: [
          {
            link: "justifies",
            stableTarget,
            targetRevision: `${stableTarget}-r00002`,
          },
        ],
      },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.dependencyChanges).toEqual([
      {
        record_version: "dependency-change@1",
        kind: "outbound-link-change",
        subject_revision: after.datum.revision_id,
        before_revision: before.datum.revision_id,
        after_revision: after.datum.revision_id,
        link_type: "derived-from",
        before_targets: ["PSP-1111111111"],
        after_targets: ["PSP-2222222222"],
      },
      {
        record_version: "dependency-change@1",
        kind: "stable-link-resolution-change",
        subject_revision: after.datum.revision_id,
        before_revision: before.datum.revision_id,
        after_revision: after.datum.revision_id,
        link_type: "justifies",
        stable_target: stableTarget,
        before_target_revision: `${stableTarget}-r00001`,
        after_target_revision: `${stableTarget}-r00002`,
      },
    ]);
  });

  it("lets package expressions decide which typed records imply Staleness", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const copiedRoot = path.join(temporaryRoot, "process");
    await fs.cp(processRoot, copiedRoot, { recursive: true });
    const selectorPath = path.join(
      copiedRoot,
      "selectors/staleness-relevant-dependency-changes-for.yaml",
    );
    const selector = await fs.readFile(selectorPath, "utf8");
    await fs.writeFile(
      selectorPath,
      selector.replace(
        '["content-change", "outbound-link-change", "stable-link-resolution-change"]',
        '["outbound-link-change", "stable-link-resolution-change"]',
      ),
    );
    const loaded = await loadProcessPackage(copiedRoot);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const before = revision("PSP-7K3M9Q2D8F", 1, "Before");
    const after = revision("PSP-7K3M9Q2D8F", 2, "After");

    const result = evaluate(
      [before, after],
      [{
        subjectRevision: after.datum.revision_id,
        beforeRevision: before.datum.revision_id,
        afterRevision: after.datum.revision_id,
      }],
      loaded.package,
    );

    expect(result.dependencyChanges).toHaveLength(1);
    expect(result.artifacts[after.datum.revision_id]?.states.validity).toBe(
      "valid",
    );
  });

  it("fails an unsupported comparison explicitly instead of preserving evidence silently", () => {
    const after = revision("PSP-7K3M9Q2D8F", 2, "After");

    const result = evaluate([after], [
      {
        subjectRevision: after.datum.revision_id,
        beforeRevision: "PSP-7K3M9Q2D8F-r00001",
        afterRevision: after.datum.revision_id,
      },
    ]);

    expect(result.dependencyChanges).toEqual([]);
    expect(result.artifacts).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-dependency-comparison",
        path: "dependencyComparisons[0].beforeRevision",
        message:
          "Dependency comparison references unavailable Revision 'PSP-7K3M9Q2D8F-r00001'",
      }),
    ]);
  });
});
