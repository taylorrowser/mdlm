import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROCESS_REPOSITORY_TEST_TIMEOUT_MS } from "../scripts/root-test-observation-policy.mjs";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessPackage,
} from "../src/index.js";
import {
  activeLifecycleEvaluation,
  looseEndsProjection,
  phaseStatusProjection,
} from "../src/lifecycle-inspection.js";
import { executeCommandApplication } from "../src/command-application.js";
import {
  acceptedIntentForReviewedGate,
  exactContextWaiverFor,
  frozenLifecycleRecord,
  reviewedGateFixture,
} from "./helpers/lifecycle-scenarios.js";


const prototypeSnapshot = path.join(
  process.cwd(),
  "examples/psp-to-sys-snapshot.yaml",
);

async function applicationMdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
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
  const subject = frozenLifecycleRecord(
    "git:mdlm-lifecycle",
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
  const { waiver, context, review } = exactContextWaiverFor(
    subject,
    "git:mdlm-lifecycle",
  );
  return [subject, waiver, context, review];
}

describe("mdlm lifecycle status and next work", () => {
  let repositoryRoot: string;
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-lifecycle-"));
    const initialized = await applicationMdlm(
      repositoryRoot,
      "init",
      ".",
      "--json",
    );
    expect(initialized.status, initialized.stdout).toBe(0);
    const descriptor = JSON.parse(await fs.readFile(
      path.join(repositoryRoot, ".lifecycle/repository.json"),
      "utf8",
    )) as { package: { reference: string } };
    const loaded = await loadProcessPackage(path.join(
      repositoryRoot,
      ".lifecycle/packages",
      descriptor.package.reference,
    ));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = deepFreeze(loaded.package);
  });

  afterAll(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("shows phase entry, candidates, Obligation summary, gate evidence, and exact blockers", async () => {
    const result = await applicationMdlm(
      repositoryRoot,
      "phase",
      "status",
      "phase-2-system-definition",
      "--snapshot",
      prototypeSnapshot,
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        ok: true,
        command: "phase.status",
        phaseStatus: expect.objectContaining({
          id: "phase-2-system-definition",
          version: 9,
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
      }),
    );

    const human = await applicationMdlm(
      repositoryRoot,
      "phase",
      "status",
      "phase-2-system-definition",
      "--snapshot",
      prototypeSnapshot,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain("Phase: phase-2-system-definition@9");
    expect(human.stdout).toContain("Entry Satisfied: false");
    expect(human.stdout).toContain("Candidates: none");
    expect(human.stdout).toContain("Obligations: total=6");
    expect(human.stdout).toContain("Gate Required: true");
    expect(human.stdout).toContain("Phase Blockers:");
  });

  it("routes one architecture per coherent context through the command application", async () => {
    const processRef = "mdlm-bootstrap@0.71.0#sha256:grouped-cli-regression";
    const groupedSnapshot = async (
      name: string,
      contexts: string[],
      withFirstArchitecture = false,
    ): Promise<string> => {
      const product = frozenLifecycleRecord(
        processRef,
        "PSP",
        "PSP-0CLIGROUP0",
        {
          title: "Grouped CLI product",
          rationale: "Exercise public proportional routing.",
        },
      );
      const requirements = contexts.map((context, index) =>
        frozenLifecycleRecord(
          processRef,
          "STK",
          `STK-0CLIGRP10${index}`,
          {
            title: `${context} commitment ${index}`,
            rationale: "Keep multiplicity tied to a material context.",
            statement: `${context} shall expose behavior ${index}.`,
            verification_intent: `Observe ${context} behavior ${index}.`,
            stakeholder: "operator",
            priority: "must",
            system_context: context,
          },
          {
            links: [{ type: "derived-from", target: product.datum.id }],
          },
        ),
      );
      const architecture = frozenLifecycleRecord(
        processRef,
        "ASP",
        "ASP-0CLIGRPA00",
        {
          title: "First coherent-context architecture",
          rationale: "One architecture governs the complete first context.",
        },
        {
          links: requirements
            .filter((_, index) => contexts[index] === contexts[0])
            .map((requirement) => ({
              type: "governs",
              target: requirement.datum.revision_id,
            })),
        },
      );
      const accepted = frozenLifecycleRecord(
        processRef,
        "BSL",
        `BSL-0CLIGRP10${contexts.length}`,
        {
          title: "Accepted grouped CLI intent",
          kind: "intent-approved",
          role: "accepted",
          scope: name,
          group: "DEFAULT",
          definition_members: [
            product.datum.revision_id,
            ...requirements.map((requirement) => requirement.datum.revision_id),
          ],
          evidence: [],
        },
        { scenario: "accept-phase-0-intent@1" },
      );
      return writeSnapshot(repositoryRoot, name, {
        processRef,
        phaseId: "phase-2-system-definition",
        records: [
          product,
          ...requirements,
          accepted,
          ...(withFirstArchitecture ? [architecture] : []),
        ],
        dependencyComparisons: [],
      });
    };
    const architectureWork = async (snapshotPath: string) => {
      const result = await applicationMdlm(
        repositoryRoot,
        "loose-ends",
        "--snapshot",
        snapshotPath,
        "--json",
      );
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items.filter(
        (item: { obligation: string; status: string }) =>
          item.obligation === "system-architecture-required" &&
          item.status === "ready",
      );
    };

    const simpleBefore = await groupedSnapshot(
      "one-context-before",
      ["product", "product"],
    );
    expect(await architectureWork(simpleBefore)).toEqual([
      expect.objectContaining({
        actionableResolver: "define-system-architecture@3",
        dispatchable: true,
      }),
    ]);
    const simple = await groupedSnapshot(
      "one-context",
      ["product", "product"],
      true,
    );
    expect(await architectureWork(simple)).toEqual([]);

    const separatedBefore = await groupedSnapshot(
      "two-contexts-before",
      ["client", "service"],
    );
    expect(await architectureWork(separatedBefore)).toHaveLength(2);
    const separated = await groupedSnapshot(
      "two-contexts",
      ["client", "service"],
      true,
    );
    expect(await architectureWork(separated)).toEqual([
      expect.objectContaining({
        actionableResolver: "define-system-architecture@3",
        dispatchable: true,
      }),
    ]);
  });

  it("reports ready and blocked Loose Ends without collapsing resolver, Dispatchability, output, or waiver dimensions", async () => {
    const result = await applicationMdlm(
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

    const human = await applicationMdlm(
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

  it("preserves blocked gate evidence", async () => {
    const gateFixture = reviewedGateFixture("git:mdlm-lifecycle");
    const blockedGate = phaseStatusProjection(evaluateLifecycle(processPackage, {
      processRef: "git:mdlm-lifecycle",
      phaseId: "phase-0-wayfinding",
      records: gateFixture.beforeSignoffReview,
      dependencyComparisons: [],
    }));
    expect(blockedGate?.gate.evaluations).toEqual([
      expect.objectContaining({
        complete: false,
        status: "blocked",
        dispatchable: false,
        actionableResolver: "review-datum-in-context@2",
        blockedBy: [
          "passing-review-required@2:DEC-4K3M9Q2D8F-r00001:git:mdlm-lifecycle",
        ],
      }),
    ]);
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("preserves reviewed gate evidence and progression", async () => {
    const gateFixture = reviewedGateFixture("git:mdlm-lifecycle");
    const acceptedIntent = acceptedIntentForReviewedGate(
      "git:mdlm-lifecycle",
      gateFixture,
    );
    const gateSnapshotValue: LifecycleSnapshot = {
      processRef: "git:mdlm-lifecycle",
      phaseId: "phase-0-wayfinding",
      records: [...gateFixture.records, acceptedIntent],
      dependencyComparisons: [],
    };
    const gateSnapshot = await writeSnapshot(
      repositoryRoot,
      "reviewed-gate",
      gateSnapshotValue,
    );
    const gate = phaseStatusProjection(
      evaluateLifecycle(processPackage, gateSnapshotValue),
    );
    expect(gate?.gate.evaluations).toEqual([
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
    const humanGate = await applicationMdlm(
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

    const activePhase = phaseStatusProjection(
      activeLifecycleEvaluation(processPackage, gateSnapshotValue),
    );
    expect(activePhase).toEqual(
      expect.objectContaining({
        id: "phase-1-product-assurance",
        progression: expect.objectContaining({
          nextPhase: "phase-2-system-definition",
          complete: false,
        }),
      }),
    );
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("preserves exact waiver evidence", async () => {
    const waiverSnapshotValue: LifecycleSnapshot = {
      processRef: "git:mdlm-lifecycle",
      phaseId: "phase-0-wayfinding",
      records: waivedRecords(),
      dependencyComparisons: [],
    };
    const waiverSnapshot = await writeSnapshot(
      repositoryRoot,
      "waived",
      waiverSnapshotValue,
    );
    const waiver = looseEndsProjection(
      evaluateLifecycle(processPackage, waiverSnapshotValue),
    );
    expect(waiver?.waiverSuppressed).toEqual([
      expect.objectContaining({
        id: "review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:mdlm-lifecycle",
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
    const humanWaiver = await applicationMdlm(
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
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);
});
