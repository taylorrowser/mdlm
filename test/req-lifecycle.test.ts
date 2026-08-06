import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LifecycleRecord, LifecycleSnapshot } from "../src/index.js";
import {
  exactContextWaiverFor,
  frozenLifecycleRecord,
  reviewedGateFixture,
} from "./helpers/lifecycle-scenarios.js";
import { distinctProgressionProcessPackage } from "./helpers/process-package.js";
import { req, selectBootstrapProcessPackage } from "./helpers/req.js";

const prototypeSnapshot = path.join(
  process.cwd(),
  "examples/psp-to-sys-snapshot.yaml",
);

async function writeSnapshot(
  repositoryRoot: string,
  name: string,
  snapshot: LifecycleSnapshot,
): Promise<string> {
  const snapshotPath = path.join(repositoryRoot, `${name}.yaml`);
  await fs.writeFile(snapshotPath, stringify(snapshot));
  return snapshotPath;
}

function waivedRecords(): LifecycleRecord[] {
  const subject = frozenLifecycleRecord(
    "git:req-lifecycle",
    "PSP",
    "PSP-7K3M9Q2D8F",
    {
      title: "Waived context subject",
      rationale: "Exercise exact waiver reporting.",
      problem: "A context is temporarily disproportionate.",
      users: ["maintainer"],
      goals: ["Preserve waiver evidence."],
      non_goals: [],
      success_measures: ["The exact waiver remains visible."],
    },
  );
  const { waiver, review } = exactContextWaiverFor(
    subject,
    "git:req-lifecycle",
  );
  return [subject, waiver, review];
}

describe("req lifecycle status and next work", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-req-lifecycle-"));
    selectBootstrapProcessPackage(repositoryRoot);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("shows phase entry, candidates, Obligation summary, gate evidence, and exact blockers", () => {
    const result = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-2-system-definition",
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "phase.status",
      phaseStatus: expect.objectContaining({
        id: "phase-2-system-definition",
        version: 3,
        entry: expect.objectContaining({ satisfied: false }),
        candidateSelection: expect.objectContaining({ entities: [] }),
        obligations: {
          total: 6,
          satisfied: 0,
          looseEnds: 6,
          waived: 0,
          byStatus: {
            blocked: expect.objectContaining({ count: 3 }),
            ready: expect.objectContaining({ count: 3 }),
          },
        },
        gate: { required: true, evaluations: [] },
        blockers: expect.objectContaining({
          instanceIds: expect.arrayContaining([
            "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype",
          ]),
        }),
      }),
      diagnostics: [],
    }));

    const human = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-2-system-definition",
      "--snapshot",
      prototypeSnapshot,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain("Phase: phase-2-system-definition@3");
    expect(human.stdout).toContain("Entry Satisfied: false");
    expect(human.stdout).toContain("Candidates: none");
    expect(human.stdout).toContain("Obligations: total=6");
    expect(human.stdout).toContain("Gate Required: true");
    expect(human.stdout).toContain("Phase Blockers:");
  });

  it("reports ready and blocked Loose Ends without collapsing resolver, Dispatchability, output, or waiver dimensions", () => {
    const result = req(
      repositoryRoot,
      "loose-ends",
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.command).toBe("loose-ends");
    expect(output.looseEnds.items).toHaveLength(6);
    expect(output.looseEnds.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype",
        subject: "PSP-7K3M9Q2D8F-r00001",
        status: "ready",
        blockedBy: [],
        eventualResolver: "create-review-context@1",
        actionableResolver: "create-review-context@1",
        dispatchable: true,
        resolver: expect.objectContaining({
          expectedOutputs: expect.arrayContaining([
            expect.objectContaining({
              types: ["BSL"],
              cardinality: "one",
            }),
          ]),
        }),
        waiver: expect.objectContaining({
          result: expect.objectContaining({ applicable: false, evidence: [] }),
        }),
      }),
      expect.objectContaining({
        subject: "PSP-7K3M9Q2D8F-r00001",
        status: "blocked",
        blockedBy: [
          "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype",
        ],
        eventualResolver: "review-datum-in-context@2",
        actionableResolver: "create-review-context@1",
        dispatchable: false,
      }),
    ]));
    expect(output.looseEnds.waiverSuppressed).toEqual([]);

    const human = req(
      repositoryRoot,
      "loose-ends",
      "--snapshot",
      prototypeSnapshot,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain("Status: ready");
    expect(human.stdout).toContain("Dispatchable: true");
    expect(human.stdout).toContain("Eventual Resolver: create-review-context@1");
    expect(human.stdout).toContain("Actionable Resolver: create-review-context@1");
    expect(human.stdout).toContain("Expected Outputs:");
    expect(human.stdout).toContain("Waiver Applicable: false");
    expect(human.stdout).toContain("Status: blocked");
  });

  it("returns only the next Dispatchable Loose End", async () => {
    const result = req(
      repositoryRoot,
      "next",
      "--phase",
      "phase-2-system-definition",
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual(expect.objectContaining({
      ok: true,
      command: "next",
      next: {
        phase: "phase-2-system-definition@3",
        item: expect.objectContaining({
          id: "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype",
          dispatchable: true,
          actionableResolver: "create-review-context@1",
        }),
      },
      diagnostics: [],
    }));
    expect(output.next.item.blockedBy).toEqual([]);

    const emptySnapshot = await writeSnapshot(repositoryRoot, "no-work", {
      processRef: "git:req-lifecycle",
      phaseId: "phase-2-system-definition",
      records: [],
      dependencyComparisons: [],
    });
    const none = req(
      repositoryRoot,
      "next",
      "--snapshot",
      emptySnapshot,
      "--json",
    );
    expect(none.status, none.stderr).toBe(0);
    expect(JSON.parse(none.stdout).next).toEqual({
      phase: "phase-2-system-definition@3",
      item: null,
    });
  });

  it("projects a distinct progression authorization as next work with its exact subject", async () => {
    const processRoot = await distinctProgressionProcessPackage();
    const installed = req(
      repositoryRoot,
      "process",
      "install",
      processRoot,
      "--json",
    );
    expect(installed.status, `${installed.stderr}${installed.stdout}`).toBe(0);
    const selected = req(
      repositoryRoot,
      "process",
      "use",
      "mdlm-distinct-progression@0.35.0",
      "--json",
    );
    expect(selected.status, selected.stderr).toBe(0);
    const fixture = reviewedGateFixture("git:distinct-next");
    const snapshot = await writeSnapshot(repositoryRoot, "distinct-next", {
      processRef: "git:distinct-next",
      phaseId: "phase-0-wayfinding",
      records: fixture.records,
      dependencyComparisons: [],
    });

    const next = req(
      repositoryRoot,
      "next",
      "--phase",
      "phase-0-wayfinding",
      "--snapshot",
      snapshot,
      "--json",
    );

    expect(next.status, next.stderr).toBe(0);
    expect(JSON.parse(next.stdout).next.item).toEqual(expect.objectContaining({
      kind: "phase-progression",
      nextPhase: "phase-1-product-assurance",
      status: "awaiting-authority",
      dispatchable: true,
      scenario: "record-consequential-decision@1",
      subjects: [{
        identity: {
          id: fixture.candidate.datum.id,
          revision_id: fixture.candidate.datum.revision_id,
          type: "BSL",
          revision: 1,
        },
      }],
      authority: expect.objectContaining({
        attentionRequired: true,
        authorityRequirement: expect.objectContaining({
          authority: "stakeholder",
        }),
      }),
    }));
  });

  it("preserves blocked and reviewed gate evidence and exact waiver evidence", async () => {
    const gateFixture = reviewedGateFixture("git:req-lifecycle");
    const blockedGateSnapshot = await writeSnapshot(repositoryRoot, "blocked-gate", {
      processRef: "git:req-lifecycle",
      phaseId: "phase-0-wayfinding",
      records: gateFixture.beforeSignoffReview,
      dependencyComparisons: [],
    });
    const blockedGate = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-0-wayfinding",
      "--snapshot",
      blockedGateSnapshot,
      "--json",
    );
    expect(blockedGate.status, blockedGate.stderr).toBe(0);
    expect(JSON.parse(blockedGate.stdout).phaseStatus.gate.evaluations).toEqual([
      expect.objectContaining({
        complete: false,
        status: "blocked",
        dispatchable: false,
        actionableResolver: "review-datum-in-context@2",
        blockedBy: [
          "passing-review-required@2:DEC-4K3M9Q2D8F-r00001:git:req-lifecycle",
        ],
      }),
    ]);

    const gateSnapshot = await writeSnapshot(repositoryRoot, "reviewed-gate", {
      processRef: "git:req-lifecycle",
      phaseId: "phase-0-wayfinding",
      records: gateFixture.records,
      dependencyComparisons: [],
    });
    const gate = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-0-wayfinding",
      "--snapshot",
      gateSnapshot,
      "--json",
    );
    expect(gate.status, gate.stderr).toBe(0);
    expect(JSON.parse(gate.stdout).phaseStatus.gate.evaluations).toEqual([
      expect.objectContaining({
        complete: true,
        status: "satisfied",
        dispatchable: false,
        blockedBy: [],
        obligation: expect.objectContaining({
          subject: "BSL-4K3M9Q2D8F-r00001",
          resolver: expect.objectContaining({
            expectedOutputs: expect.any(Array),
          }),
          waiver: expect.objectContaining({
            result: expect.objectContaining({ applicable: false }),
          }),
        }),
      }),
    ]);
    const humanGate = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-0-wayfinding",
      "--snapshot",
      gateSnapshot,
    );
    expect(humanGate.status, humanGate.stderr).toBe(0);
    expect(humanGate.stdout).toContain("Gate Complete: true");
    expect(humanGate.stdout).toContain("Gate Dispatchable: false");
    expect(humanGate.stdout).toContain("Gate Completion Expression:");
    expect(humanGate.stdout).toContain("Gate Expected Outputs:");
    expect(humanGate.stdout).toContain("Gate Waiver Applicable: false");
    expect(humanGate.stdout).toContain("Progression Complete: true");
    expect(humanGate.stdout).toContain(
      `Progression Evidence: ${gateFixture.signoff.datum.revision_id}`,
    );

    const activePhase = req(
      repositoryRoot,
      "phase",
      "status",
      "--snapshot",
      gateSnapshot,
      "--json",
    );
    expect(activePhase.status, activePhase.stderr).toBe(0);
    expect(JSON.parse(activePhase.stdout).phaseStatus).toEqual(
      expect.objectContaining({
        id: "phase-1-product-assurance",
        progression: expect.objectContaining({
          nextPhase: "phase-2-pilot-assessment",
          complete: false,
        }),
      }),
    );

    const waiverSnapshot = await writeSnapshot(repositoryRoot, "waived", {
      processRef: "git:req-lifecycle",
      phaseId: "phase-0-wayfinding",
      records: waivedRecords(),
      dependencyComparisons: [],
    });
    const waiver = req(
      repositoryRoot,
      "loose-ends",
      "--snapshot",
      waiverSnapshot,
      "--json",
    );
    expect(waiver.status, waiver.stderr).toBe(0);
    expect(JSON.parse(waiver.stdout).looseEnds.waiverSuppressed).toEqual([
      expect.objectContaining({
        id: "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:req-lifecycle",
        satisfied: false,
        status: "waived",
        dispatchable: false,
        waiver: {
          policy: "waiver-applicability@1",
          result: expect.objectContaining({
            applicable: true,
            scope: "this-revision",
            evidence: [{
              identity: expect.objectContaining({
                revision_id: "DEC-8ZT5KQ3P9M-r00001",
              }),
            }],
          }),
        },
      }),
    ]);
    const humanWaiver = req(
      repositoryRoot,
      "loose-ends",
      "--snapshot",
      waiverSnapshot,
    );
    expect(humanWaiver.status, humanWaiver.stderr).toBe(0);
    expect(humanWaiver.stdout).toContain("Waiver-Suppressed Obligation 1");
    expect(humanWaiver.stdout).toContain("Satisfied: false");
    expect(humanWaiver.stdout).toContain("Status: waived");
    expect(humanWaiver.stdout).toContain("Dispatchable: false");
    expect(humanWaiver.stdout).toContain("Waiver Applicable: true");
    expect(humanWaiver.stdout).toContain(
      "Waiver Evidence: DEC-8ZT5KQ3P9M-r00001",
    );
  });
});
