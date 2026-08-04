import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LifecycleRecord, LifecycleSnapshot } from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { exactContextWaiverFor, reviewedGateFixture } from "./helpers/lifecycle-scenarios.js";
import { req, selectBootstrapProcessPackage } from "./helpers/req.js";

const prototypeSnapshot = path.join(
  process.cwd(),
  "examples/psp-to-sys-snapshot.yaml",
);

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    links?: { type: string; target: string }[];
    scenario?: string;
  } = {},
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    ...(options.links ? { links: options.links } : {}),
    createdBy: {
      process_ref: "git:req-lifecycle",
      ...(options.scenario ? { scenario: options.scenario } : {}),
    },
    storage: { editable: false, frozen: true },
  });
}

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
  const subject = record("PSP", "PSP-7K3M9Q2D8F", {
    title: "Waived context subject",
    rationale: "Exercise exact waiver reporting.",
    problem: "A context is temporarily disproportionate.",
    users: ["maintainer"],
    goals: ["Preserve waiver evidence."],
    non_goals: [],
    success_measures: ["The exact waiver remains visible."],
  });
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
        version: 2,
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
    expect(human.stdout).toContain("Phase: phase-2-system-definition@2");
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
        eventualResolver: "review-datum-in-context@1",
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
        phase: "phase-2-system-definition@2",
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
      phase: "phase-2-system-definition@2",
      item: null,
    });
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
        actionableResolver: "review-datum-in-context@1",
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
  });
});
