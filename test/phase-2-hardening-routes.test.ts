import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyOperatorOutcome,
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type OperatorWorkFacts,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { finalizeExactBaselineScenarioOutput } from "../src/exact-baseline-repository.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import {
  publishScenarioMutation,
  readRepositoryData,
} from "../src/lifecycle-repository.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import {
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
} from "./helpers/assignment-submission.js";
import { mdlm, selectProcessPackageFixture } from "./helpers/mdlm.js";
import { copiedProcessPackage } from "./helpers/process-package.js";

type Snapshot = {
  processRef: string;
  phaseId: string;
  records: LifecycleRecord[];
  dependencyComparisons: [];
};

const fixtureRoot = path.join(process.cwd(), "test/fixtures/phase-hardening");
const plan = "DWP-0REPRTPMN0-r00001";
const definitionMembers = [
  "ASP-0REPRTARCH-r00001",
  plan,
  "ICSP-0REPRT1CSP-r00001",
  "SYS-0EXPRTREQ0-r00001",
];
const currentDwpContext = "BSL-A8S7MK45TQ-r00001";
const currentDwpReview = "REV-0DWPREV001-r00001";

async function fixture(name: string): Promise<Snapshot> {
  return JSON.parse(await fs.readFile(path.join(fixtureRoot, name), "utf8"));
}

function withoutRecordAndDependents(
  snapshot: Snapshot,
  revisionId: string,
): Snapshot {
  const removed = new Set([revisionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of snapshot.records) {
      if (removed.has(record.datum.revision_id)) continue;
      if (record.datum.links.some((link) => removed.has(link.target))) {
        removed.add(record.datum.revision_id);
        changed = true;
      }
    }
  }
  return {
    ...structuredClone(snapshot),
    records: snapshot.records.filter(
      (record) => !removed.has(record.datum.revision_id),
    ),
  };
}

function obligation(
  processPackage: ProcessPackage,
  snapshot: Snapshot,
  name: string,
  subject?: string,
) {
  return evaluateLifecycle(processPackage, snapshot).obligations.find(
    (item) =>
      item.obligation === name &&
      (subject === undefined || item.subject === subject),
  );
}

function failedSimplification(
  snapshot: Snapshot,
  correctionSet: "subject" | "definition-consistency",
  options: { removeSystem?: boolean; malformedBlockers?: boolean } = {},
): Snapshot {
  const result = structuredClone(snapshot);
  const review = result.records.find(
    (record) => record.datum.revision_id === "REV-0ARCSMP100-r00001",
  );
  if (!review)
    throw new Error("missing retained late semantic simplification Review");
  const blockers =
    correctionSet === "subject"
    ? ["SYS-0EXPRTREQ0-r00001"]
    : options.malformedBlockers
    ? definitionMembers.slice(0, -1)
    : definitionMembers;
  review.datum.payload.outcome = "fail";
  review.datum.payload.correction_authority = "package-evidence";
  review.datum.payload.definition_simplification = {
    primary_target:
      correctionSet === "subject" ? "SYS-0EXPRTREQ0-r00001" : plan,
    correction_set: correctionSet,
    primary_findings: [
      {
        id: "F-001",
        severity: "blocking",
        criterion: "Late Phase 2 simplification must identify an exact removable member or complete definition-consistency correction set.",
        evidence:
          "The Review rejects the exact Phase 2 definition scope represented by its blockers.",
        material_consequence:
          "The decomposition cannot complete while the semantic simplification defect remains.",
        summary: "Correct the exact declared scope.",
      },
    ],
    ...(options.removeSystem
      ? {
          scope_reduction: { rationale: "Remove the sole current SYS output." },
        }
      : {}),
  };
  review.datum.links.push(
    ...blockers.map((target) => ({ type: "blocks", target })),
  );
  if (options.removeSystem) {
    review.datum.links.push({
      type: "removes",
      target: "SYS-0EXPRTREQ0-r00001",
    });
  }
  return result;
}

function operatorOutcome(processPackage: ProcessPackage, snapshot: Snapshot) {
  const result = evaluateLifecycle(processPackage, snapshot);
  const phase = result.phase
    ? `${result.phase.id}@${result.phase.version}`
    : "";
  const work: OperatorWorkFacts[] = result.looseEnds.map((item) => ({
    kind: "obligation",
    phase,
    instance: item.id,
    definition: item.obligation,
    subject: item.subject,
    scenario: item.actionableResolver ?? item.eventualResolver,
    dispatchable: item.dispatchable,
    authorityRequirements: (item.participation ?? []).map((participation) => ({
      policy: participation.policy,
      authorityRequirement: participation.authorityRequirement,
      attentionSchedule: participation.attentionSchedule,
    })),
    explanation: item.explanation,
    status: item.status,
    blockedBy: item.blockedBy,
    blockerChains: item.blockerChains,
    unresolvedBindings: item.unresolvedBindings,
  }));
  return classifyOperatorOutcome(work, result.terminalOutcome);
}

function expectReady(
  processPackage: ProcessPackage,
  snapshot: Snapshot,
  name: string,
  resolver: string,
  subject?: string,
) {
  expect(obligation(processPackage, snapshot, name, subject)).toEqual(
    expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: resolver,
    }),
  );
}

describe("Phase 2 hardening routes from synthetic evaluator snapshots", () => {
  let processPackage: ProcessPackage;
  let completionReady: Snapshot;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
    completionReady = await fixture("phase2-completion-ready.json");
    const currentRef = completionReady.processRef;
    const retainedContext = completionReady.records.find(
      (record) => record.datum.revision_id === "BSL-A8S7MK45TQ-r00001",
    );
    const retainedReview = completionReady.records.find(
      (record) => record.datum.revision_id === "REV-EFXYWYJQ9S-r00001",
    );
    if (!retainedContext || !retainedReview) {
      throw new Error("missing synthetic DWP Review state");
    }
    const review = structuredClone(retainedReview);
    review.datum.id = "REV-0DWPREV001";
    review.datum.revision_id = currentDwpReview;
    review.datum.payload.review_kind = "simplification-product-definition";
    delete review.datum.payload.findings;
    review.datum.links = review.datum.links.map((link) =>
      link.type === "contextualizes"
        ? { ...link, target: currentDwpContext }
        : link,
    );
    review.datum.created_by.process_ref = currentRef;
    completionReady.records.push(review);
  });

  it("derives decomposition planning when the exact planning DWP and its dependent evidence are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, plan),
      "decomposition-planning-required",
      "define-decomposition-work-package@3",
      "STK-HJGTM8026G-r00001",
    );
  });

  it("supplies exact ASP and ICSP support to a planning DWP Review before SYS execution", () => {
    const snapshot = withoutRecordAndDependents(
      completionReady,
      "SYS-0EXPRTREQ0-r00001",
    );
    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "review-context-members-for@1",
      { subject: plan },
    );

    expect(
      (selected.result as Array<{ identity: { revision_id: string } }>).map(
        (item) => item.identity.revision_id,
      ),
    ).toEqual([
      "ASP-0REPRTARCH-r00001",
      "ICSP-0REPRT1CSP-r00001",
      "STK-HJGTM8026G-r00001",
      "VSP-KBQHB74Z6S-r00001",
    ]);
  });

  it("adds only the exact current SYS output to planning-DWP Review support", () => {
    const selected = evaluateProcessDefinition(
      processPackage,
      completionReady,
      "selector",
      "review-context-members-for@1",
      { subject: plan },
    );

    expect(
      (selected.result as Array<{ identity: { revision_id: string } }>).map(
        (item) => item.identity.revision_id,
      ),
    ).toEqual([
      "ASP-0REPRTARCH-r00001",
      "ICSP-0REPRT1CSP-r00001",
      "STK-HJGTM8026G-r00001",
      "SYS-0EXPRTREQ0-r00001",
      "VSP-KBQHB74Z6S-r00001",
    ]);
  });

  it("prepares every exact frozen context member in a Phase 2 SYS Review Assignment", async () => {
    const snapshot = withoutRecordAndDependents(
      completionReady,
      "REV-61T420FHN5-r00001",
    );
    const reviewWork = obligation(
      processPackage,
      snapshot,
      "decomposition-output-reviews-required",
      plan,
    );
    expect(reviewWork).toEqual(
      expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@2",
      }),
    );

    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "review-datum-in-context@2",
      reviewWork!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;

    const invocation = prepared.value.invocations[0]!;
    const revisionIds = (name: string) =>
      invocation.inputs
        .find((input) => input.name === name)!
        .values.map((value) => value.identity.revision_id);
    expect(revisionIds("subject")).toEqual(["SYS-0EXPRTREQ0-r00001"]);
    expect(revisionIds("review_context")).toEqual([
      "BSL-R6SFPZ4R31-r00001",
    ]);
    expect(revisionIds("context_members")).toEqual([
      "ASP-0REPRTARCH-r00001",
      plan,
      "ICSP-0REPRT1CSP-r00001",
      "STK-HJGTM8026G-r00001",
    ]);
  });

  it("declares every optional DWP link family as exact preserved correction input", async () => {
    const scenario = await fs.readFile(
      path.join(
        process.cwd(),
        ".lifecycle/process/scenarios/replan-stale-decomposition-work-package.yaml",
      ),
      "utf8",
    );
    for (const selector of [
      "all-cited-reviews-by-correction@1",
      "changes-changed-under-subject@1",
      "planning-revisions-for-completion@1",
      "completion-outputs-for@1",
      "completion-simplification-evidence-for@1",
    ]) {
      expect(scenario.match(new RegExp(selector.replace("@", "@"), "g")))
        .toHaveLength(2);
    }
  });

  it("accepts a same-lineage architecture whose unrelated element metadata changed before current interface work", () => {
    const snapshot = structuredClone(completionReady);
    const architecture = snapshot.records.find(
      (record) => record.datum.revision_id === "ASP-0REPRTARCH-r00001",
    );
    if (!architecture) throw new Error("missing exact architecture support");
    const newerArchitecture = structuredClone(architecture);
    newerArchitecture.datum.revision = 2;
    newerArchitecture.datum.revision_id = "ASP-0REPRTARCH-r00002";
    newerArchitecture.datum.created_by.process_ref = snapshot.processRef;
    const architectureElements = newerArchitecture.datum.payload.elements as
      Array<Record<string, unknown>>;
    newerArchitecture.datum.payload.elements = [
      {
        ...architectureElements[0],
        title: "Revised unrelated report core",
      },
      ...architectureElements.slice(1),
    ];
    snapshot.records.push(newerArchitecture);

    const compatibleArchitecture = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "replacement-architectures-for-stale-plan@1",
      { plan },
    );
    expect(
      (
        compatibleArchitecture.result as Array<{
          identity: { revision_id: string };
        }>
      ).map((item) => item.identity.revision_id),
    ).toEqual(["ASP-0REPRTARCH-r00002"]);
    expect(
      obligation(processPackage, snapshot, "review-context-required", plan),
    ).toBeUndefined();
    expectReady(
      processPackage,
      snapshot,
      "interface-control-specification-required",
      "define-interface-control-specification@2",
      "ASP-0REPRTARCH-r00002",
    );

    newerArchitecture.datum.payload.elements = architectureElements.filter(
      (element) => element.id !== "AEL-0EXPRTAP00",
    );
    const missingBoundElement = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "replacement-architectures-for-stale-plan@1",
      { plan },
    );
    expect(missingBoundElement.result).toEqual([]);
  });

  it("replans instead of dispatching an impossible DWP Review Context when exact interface support is superseded", () => {
    const snapshot = structuredClone(completionReady);
    const interfaceRevision = snapshot.records.find(
      (record) => record.datum.revision_id === "ICSP-0REPRT1CSP-r00001",
    );
    if (!interfaceRevision) throw new Error("missing exact interface support");
    const newerInterface = structuredClone(interfaceRevision);
    newerInterface.datum.revision = 2;
    newerInterface.datum.revision_id = "ICSP-0REPRT1CSP-r00002";
    newerInterface.datum.created_by.process_ref = snapshot.processRef;
    snapshot.records.push(newerInterface);

    expect(
      obligation(processPackage, snapshot, "review-context-required", plan),
    ).toBeUndefined();
    expectReady(
      processPackage,
      snapshot,
      "stale-decomposition-plan-correction-required",
      "replan-stale-decomposition-work-package@1",
      plan,
    );
    expect(
      obligation(
      processPackage,
      snapshot,
      "decomposition-planning-required",
      "STK-HJGTM8026G-r00001",
      ),
    ).toEqual(expect.objectContaining({ status: "blocked" }));
  });

  it("routes a completed DWP lineage through exact shared-SYS consumer reevaluation instead of stale planning correction", async () => {
    const snapshot = await fixture("shared-consumer-a-ready.json");
    const completion = snapshot.records.find(
      (record) => record.datum.revision_id === "DWP-1020000001-r00001",
    );
    if (!completion) throw new Error("missing completed shared-SYS consumer");
    const planning = structuredClone(completion);
    planning.datum.payload.stage = "planning";
    completion.datum.revision = 2;
    completion.datum.revision_id = "DWP-1020000001-r00002";
    snapshot.records.push(planning);

    expect(
      obligation(
        processPackage,
        snapshot,
        "stale-decomposition-plan-correction-required",
        planning.datum.revision_id,
      ),
    ).toBeUndefined();
    expectReady(
      processPackage,
      snapshot,
      "shared-system-consumer-reevaluation-required",
      "reevaluate-shared-system-consumer@1",
      completion.datum.revision_id,
    );

    const consumed = snapshot.records.find(
      (record) => record.datum.revision_id === "SYS-1020000001-r00001",
    );
    if (!consumed) throw new Error("missing consumed SYS requirement");
    consumed.integrity.hash_valid = false;
    snapshot.records = snapshot.records.filter(
      (record) => record.datum.revision_id !== "SYS-1020000001-r00002",
    );
    expect(
      obligation(
        processPackage,
        snapshot,
        "shared-system-consumer-reevaluation-required",
        completion.datum.revision_id,
      ),
    ).toEqual(
      expect.objectContaining({ status: "blocked", dispatchable: false }),
    );
  });

  it("keeps multi-parent shared-SYS correction dispatchable when several exact lineages advance", () => {
    const snapshot = structuredClone(completionReady);
    const planningDwp = snapshot.records.find(
      (record) => record.datum.revision_id === plan,
    );
    const sourceSystem = snapshot.records.find(
      (record) => record.datum.revision_id === "SYS-0EXPRTREQ0-r00001",
    );
    if (!planningDwp || !sourceSystem) {
      throw new Error("missing planning DWP or SYS fixture");
    }
    for (const stableId of ["SYS-0PARENTREQ", "SYS-0EXTRAREQ0"]) {
      const parent = structuredClone(sourceSystem);
      parent.datum.id = stableId;
      parent.datum.revision_id = `${stableId}-r00001`;
      parent.datum.links = parent.datum.links.filter(
        (link) => link.type === "derived-from",
      );
      const replacement = structuredClone(parent);
      replacement.datum.revision = 2;
      replacement.datum.revision_id = `${stableId}-r00002`;
      planningDwp.datum.links.push({
        type: "decomposes",
        target: parent.datum.revision_id,
      });
      snapshot.records.push(parent, replacement);
    }
    expectReady(
      processPackage,
      snapshot,
      "shared-system-consumer-reevaluation-required",
      "reevaluate-shared-system-consumer@1",
      plan,
    );
    expect(
      obligation(
        processPackage,
        snapshot,
        "stale-decomposition-plan-correction-required",
        plan,
      ),
    ).toEqual(expect.objectContaining({ status: "blocked", dispatchable: false }));
  });

  it("keeps completion-DWP Review eligibility outside planning-support replanning", async () => {
    const snapshot = await fixture("phase2-acceptance-ready.json");
    const completion = snapshot.records.find(
      (record) =>
        record.datum.type === "DWP" &&
        record.datum.payload.stage === "completion",
    );
    const interfaceRevision = snapshot.records.find(
      (record) => record.datum.type === "ICSP",
    );
    if (!completion || !interfaceRevision) {
      throw new Error("missing exact completion-DWP evidence");
    }
    const newerInterface = structuredClone(interfaceRevision);
    newerInterface.datum.revision += 1;
    newerInterface.datum.revision_id = `${newerInterface.datum.id}-r${String(
      newerInterface.datum.revision,
    ).padStart(5, "0")}`;
    snapshot.records.push(newerInterface);

    expect(
      obligation(
      processPackage,
      snapshot,
        "passing-review-required",
      completion.datum.revision_id,
      ),
    ).toBeDefined();
  });

  it("prepares and completes every planning-DWP product-definition outcome with exact support", async () => {
    const repository = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-phase2-dwp-review-"),
    );
    const processRoot = await copiedProcessPackage(
      "mdlm-phase2-dwp-review-process-",
    );
    try {
      const phase0Path = path.join(
        processRoot,
        "phases/phase-0-wayfinding.yaml",
      );
      const phase2Path = path.join(
        processRoot,
        "phases/phase-2-system-definition.yaml",
      );
      const reviewSubjectsPath = path.join(
        processRoot,
        "selectors/review-required-revisions.yaml",
      );
      await fs.writeFile(
        phase0Path,
        (await fs.readFile(phase0Path, "utf8")).replace(
          "order: 0",
          "order: 10",
        ),
      );
      await fs.writeFile(
        phase2Path,
        (await fs.readFile(phase2Path, "utf8"))
          .replace("order: 2", "order: 0")
          .replace(
            /entry: >-[\s\S]*?attention_checkpoints:/,
            "entry: 'process.integrity.package_valid == true'\nattention_checkpoints:",
          )
          .replace(
            /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
            "scenarios:\n  - create-review-context@1\n  - review-datum-in-context@2\n  - revise-phase-2-subject-after-review@1\n  - reevaluate-shared-system-consumer@1\n  - replan-stale-decomposition-work-package@1\n  - define-decomposition-work-package@3\n  - record-gate-signoff@3\n" +
              "obligations:\n  - review-context-required@2\n  - passing-review-required@2\n  - phase-2-review-correction-required@1\n  - shared-system-consumer-reevaluation-required@1\n  - stale-decomposition-plan-correction-required@1\n  - decomposition-planning-required@1\noutputs:",
          ),
      );
      await fs.writeFile(
        reviewSubjectsPath,
        (await fs.readFile(reviewSubjectsPath, "utf8")).replace(
          'policy("review-applicability@1", {subject: subject}).required == true',
          '(subject.identity.type == "ICSP"\n' +
            '      || (subject.identity.type == "DWP"\n' +
            '        && every("interfaces-for-decomposition@1", {plan: subject}, interface =>\n' +
            '          exists("passing-reviews-for@1", {subject: interface}))))\n' +
            '    && policy("review-applicability@1", {subject: subject}).required == true',
        ),
      );
      await selectProcessPackageFixture(repository, processRoot);
      const loaded = await loadProcessPackage(processRoot);
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
      const fixtureProcessRef = `mdlm-bootstrap@0.74.0#${await processPackageDigest(processRoot)}`;

      const wanted = new Set([plan, "SYS-0EXPRTREQ0-r00001"]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of completionReady.records) {
          if (!wanted.has(item.datum.revision_id)) continue;
          for (const link of item.datum.links) {
            const target = completionReady.records.find(
              (candidate) =>
                candidate.datum.revision_id === link.target ||
                candidate.datum.id === link.target,
            );
            if (target && !wanted.has(target.datum.revision_id)) {
              wanted.add(target.datum.revision_id);
              changed = true;
            }
          }
        }
      }
      const records = structuredClone(
        completionReady.records.filter(
          (item) =>
            wanted.has(item.datum.revision_id) &&
            !["BSL", "REV", "DEC"].includes(item.datum.type),
        ),
      );
      const planRecord = records.find(
        (item) => item.datum.revision_id === plan,
      );
      const outputRecord = records.find(
        (item) => item.datum.revision_id === "SYS-0EXPRTREQ0-r00001",
      );
      if (!planRecord || !outputRecord) {
        throw new Error("missing planning DWP or SYS output fixture");
      }
      const parentSystem = structuredClone(outputRecord);
      parentSystem.datum.id = "SYS-0PARENTREQ";
      parentSystem.datum.revision_id = "SYS-0PARENTREQ-r00001";
      parentSystem.datum.links = parentSystem.datum.links.filter(
        (link) => link.type === "derived-from",
      );
      planRecord.datum.links.push({
        type: "decomposes",
        target: parentSystem.datum.revision_id,
      });
      records.push(parentSystem);
      for (const item of records) {
        item.datum.created_by.process_ref = fixtureProcessRef;
      }
      const basePublication = await publishScenarioMutation(
        repository,
        loaded.package,
        [],
        records.map((item) => item.datum),
        "phase-2-dwp-review-base",
        { contract: "phase-2-dwp-review-fixture@1" },
      );
      if (!basePublication.ok) {
        throw new Error(JSON.stringify(basePublication.diagnostics));
      }

      const sourceContext = structuredClone(
        completionReady.records.find(
          (item) => item.datum.revision_id === "BSL-A8S7MK45TQ-r00001",
        )!.datum,
      );
      sourceContext.created_by.process_ref = fixtureProcessRef;
      sourceContext.payload.definition_members = [
        "ASP-0REPRTARCH-r00001",
        plan,
        "ICSP-0REPRT1CSP-r00001",
        "STK-HJGTM8026G-r00001",
        "SYS-0EXPRTREQ0-r00001",
        "SYS-0PARENTREQ-r00001",
        "VSP-KBQHB74Z6S-r00001",
      ];
      sourceContext.payload.evidence = [];
      delete sourceContext.payload.snapshot;
      const finalized = await finalizeExactBaselineScenarioOutput(
        repository,
        loaded.package,
        fixtureProcessRef,
        sourceContext,
      );
      if (!finalized.ok) throw new Error(JSON.stringify(finalized.diagnostics));
      const contextPublication = await publishScenarioMutation(
        repository,
        loaded.package,
        records.map((item) => item.datum),
        [finalized.value.output.datum],
        "phase-2-dwp-review-context",
        { contract: "phase-2-dwp-review-fixture@1" },
        [finalized.value.output],
      );
      if (!contextPublication.ok) {
        throw new Error(JSON.stringify(contextPublication.diagnostics));
      }

      const sourceInterfaceContext = structuredClone(
        completionReady.records.find(
          (item) => item.datum.revision_id === "BSL-8FCRE7AAWX-r00001",
        )!.datum,
      );
      sourceInterfaceContext.created_by.process_ref = fixtureProcessRef;
      sourceInterfaceContext.payload.definition_members = [
        "ICSP-0REPRT1CSP-r00001",
        "ASP-0REPRTARCH-r00001",
      ];
      sourceInterfaceContext.payload.evidence = [];
      delete sourceInterfaceContext.payload.snapshot;
      const finalizedInterfaceContext =
        await finalizeExactBaselineScenarioOutput(
        repository,
        loaded.package,
        fixtureProcessRef,
        sourceInterfaceContext,
      );
      if (!finalizedInterfaceContext.ok) {
        throw new Error(JSON.stringify(finalizedInterfaceContext.diagnostics));
      }
      const existing = await readRepositoryData(repository, loaded.package);
      if (!existing.ok) throw new Error(JSON.stringify(existing.diagnostics));
      const interfaceContextPublication = await publishScenarioMutation(
        repository,
        loaded.package,
        existing.value.map((item) => item.lifecycleDatum.datum),
        [finalizedInterfaceContext.value.output.datum],
        "phase-2-interface-review-context",
        { contract: "phase-2-dwp-review-fixture@1" },
        [finalizedInterfaceContext.value.output],
      );
      if (!interfaceContextPublication.ok) {
        throw new Error(
          JSON.stringify(interfaceContextPublication.diagnostics),
        );
      }

      const baseInterfaceReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      const baseInterfaceReviewSubmission = await submitAssignment(
        repository,
        baseInterfaceReview,
        [
          {
            localId: "review",
            name: "review",
            invocation: 0,
            lifecycleDatum: {
              type: "REV",
              payload: {
                title: "Review ICSP-0REPRT1CSP-r00001",
                review_kind: "contextual",
                rubric_ref: "policies/rubrics/bootstrap-review.md@3",
                findings: [],
                outcome: "pass",
              },
              links: [
                {
                  type: "reviews",
                  target: "ICSP-0REPRT1CSP-r00001",
                },
                {
                  type: "contextualizes",
                  target: inputRevision(baseInterfaceReview, "review_context"),
                },
              ],
              body: "The exact interface passed contextual Review.\n",
            },
          },
        ],
      );
      expect(
        baseInterfaceReviewSubmission.status,
        `${baseInterfaceReviewSubmission.stderr}${baseInterfaceReviewSubmission.stdout}`,
      ).toBe(0);

      for (const outcome of ["pass", "fail", "cancelled"] as const) {
        const outcomeRepository = path.join(
          path.dirname(repository),
          `mdlm-phase2-dwp-review-${outcome}`,
        );
        await fs.cp(repository, outcomeRepository, { recursive: true });
        try {
          const prepared = await prepareNextAssignment(
            outcomeRepository,
            "review-datum-in-context@2",
          );
          expect(inputRevision(prepared, "subject")).toBe(plan);
          expect(inputRevisions(prepared, "context_members")).toEqual([
            "ASP-0REPRTARCH-r00001",
            "ICSP-0REPRT1CSP-r00001",
            "STK-HJGTM8026G-r00001",
            "SYS-0EXPRTREQ0-r00001",
            "SYS-0PARENTREQ-r00001",
            "VSP-KBQHB74Z6S-r00001",
          ]);
          const contextRevision = inputRevision(prepared, "review_context");
          const submitted = await submitAssignment(outcomeRepository, prepared, [
            {
              localId: "review",
              name: "review",
              invocation: 0,
              lifecycleDatum: {
                type: "REV",
                payload: {
                  title: `Review ${plan}`,
                  review_kind: "simplification-product-definition",
                  rubric_ref: "policies/rubrics/bootstrap-review.md@3",
                  outcome,
                  ...(outcome === "fail"
                    ? {
                        correction_authority: "package-evidence",
                        simplification: {
                          target: plan,
                          findings: [
                            {
                              id: "F-001",
                              severity: "blocking",
                              criterion:
                                "A planning-DWP product-definition Review must assess the exact plan and all current ASP, ICSP, STK, SYS, and VSP support.",
                              evidence:
                                "The failed Review identifies a blocker in the exact generated planning-DWP context.",
                              material_consequence:
                                "The plan cannot execute until the cited product-definition defect is corrected.",
                              summary:
                                "Clarify the exact decomposition boundary.",
                            },
                          ],
                        },
                      }
                    : {}),
                  ...(outcome === "cancelled"
                    ? {
                      cancellation_reason:
                        "The exact packet cannot support a bounded judgment.",
                    }
                    : {}),
                },
                links: [
                  { type: "reviews", target: plan },
                  { type: "contextualizes", target: contextRevision },
                  ...(outcome === "fail"
                    ? [{ type: "blocks", target: plan }]
                    : []),
                ],
                body: `The exact planning DWP received a canonical ${outcome} judgment.\n`,
              },
            },
          ]);
          expect(
            submitted.status,
            `${submitted.stderr}${submitted.stdout}`,
          ).toBe(0);
          const stored = await readRepositoryData(
            outcomeRepository,
            loaded.package,
          );
          if (!stored.ok) throw new Error(JSON.stringify(stored.diagnostics));
          expect(
            stored.value.some(
              (item) =>
                item.lifecycleDatum.datum.type === "REV" &&
                item.lifecycleDatum.datum.payload.outcome === outcome &&
                item.lifecycleDatum.datum.links.some(
                  (link) => link.type === "reviews" && link.target === plan,
                ),
            ),
          ).toBe(true);
        } finally {
          await fs.rm(outcomeRepository, { recursive: true, force: true });
        }
      }
    } finally {
      await Promise.all([
        fs.rm(repository, { recursive: true, force: true }),
        fs.rm(path.dirname(processRoot), { recursive: true, force: true }),
      ]);
    }
  }, 180_000);

  it("derives SYS execution when the exact output and its dependent Review are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, "SYS-0EXPRTREQ0-r00001"),
      "decomposition-execution-required",
      "execute-decomposition-work-package@2",
      plan,
    );
  });

  it("derives architecture definition when the exact ASP and its dependent evidence are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, "ASP-0REPRTARCH-r00001"),
      "system-architecture-required",
      "define-system-architecture@3",
      "STK-HJGTM8026G-r00001",
    );
  });

  it("derives interface definition when the exact ICSP and its dependent evidence are absent", () => {
    expectReady(
      processPackage,
      withoutRecordAndDependents(completionReady, "ICSP-0REPRT1CSP-r00001"),
      "interface-control-specification-required",
      "define-interface-control-specification@2",
      "ASP-0REPRTARCH-r00001",
    );
  });

  it("returns the earliest exact definition context to architecture and interface simplification Review", () => {
    const snapshot = withoutRecordAndDependents(
      completionReady,
      "REV-0ARCSMP100-r00001",
    );
    expect(
      obligation(
        processPackage,
        snapshot,
        "architecture-interface-simplification-required",
        plan,
      ),
    ).toEqual(
      expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "simplify-architecture-and-interfaces@2",
      }),
    );
  });

  it("instantiates one architecture-wide simplification boundary for sibling plans", () => {
    const snapshot = withoutRecordAndDependents(
      completionReady,
      "REV-0ARCSMP100-r00001",
    );
    const sourcePlan = snapshot.records.find(
      (record) => record.datum.revision_id === plan,
    );
    const sourceOutput = snapshot.records.find(
      (record) => record.datum.revision_id === "SYS-0EXPRTREQ0-r00001",
    );
    if (!sourcePlan || !sourceOutput)
      throw new Error("missing Phase 2 fixture records");
    const siblingPlan = structuredClone(sourcePlan);
    siblingPlan.datum.id = "DWP-0SBLNG0000";
    siblingPlan.datum.revision_id = "DWP-0SBLNG0000-r00001";
    siblingPlan.datum.payload.title = "Sibling architecture slice";
    const siblingOutput = structuredClone(sourceOutput);
    siblingOutput.datum.id = "SYS-0SBLNG0000";
    siblingOutput.datum.revision_id = "SYS-0SBLNG0000-r00001";
    siblingOutput.datum.links = siblingOutput.datum.links.map((link) =>
      link.type === "decomposes"
        ? { ...link, target: siblingPlan.datum.revision_id }
        : link,
    );
    snapshot.records.push(siblingPlan, siblingOutput);

    const simplification = evaluateLifecycle(
      processPackage,
      snapshot,
    ).obligations.filter(
      (item) =>
        item.obligation === "architecture-interface-simplification-required",
    );
    expect(simplification).toHaveLength(1);
    expect(simplification[0]?.subject).toBe(plan);
  });

  it("accepts a canonical passing planning-DWP product-definition Review", () => {
    const selected = evaluateProcessDefinition(
      processPackage,
      completionReady,
      "selector",
      "passing-reviews-for@1",
      { subject: plan },
    );
    expect(
      (selected.result as Array<{ identity: { revision_id: string } }>).map(
        (item) => item.identity.revision_id,
      ),
    ).toEqual([currentDwpReview, "REV-EFXYWYJQ9S-r00001"]);
  });

  it("accepts only canonical planning-DWP product-definition outcomes and blockers", () => {
    const selectedReviewIds = (snapshot: Snapshot) =>
      (
        evaluateProcessDefinition(
        processPackage,
        snapshot,
        "selector",
        "valid-dwp-product-simplification-reviews@1",
        { review: currentDwpReview },
        ).result as Array<{ identity: { revision_id: string } }>
      ).map((item) => item.identity.revision_id);
    const canonical = (outcome: "pass" | "fail" | "cancelled") => {
      const snapshot = structuredClone(completionReady);
      const review = snapshot.records.find(
        (record) => record.datum.revision_id === currentDwpReview,
      );
      if (!review) throw new Error("missing retained planning DWP Review");
      review.datum.payload.review_kind = "simplification-product-definition";
      review.datum.payload.outcome = outcome;
      delete review.datum.payload.findings;
      if (outcome === "fail") {
        review.datum.payload.simplification = {
          target: plan,
          findings: [
            {
              id: "F-001",
              severity: "blocking",
              criterion:
                "A canonical planning-DWP failure must identify blockers that are present in the exact Review Context.",
              evidence:
                "The Review blocker names an exact context member with a concrete definition defect.",
              material_consequence:
                "Correction could otherwise alter a datum the independent reviewer did not assess.",
              summary: "Clarify the exact decomposition boundary.",
            },
          ],
        };
        review.datum.links.push({ type: "blocks", target: plan });
      } else if (outcome === "cancelled") {
        review.datum.payload.cancellation_reason =
          "The exact packet cannot support a bounded judgment.";
      }
      return { snapshot, review };
    };

    for (const outcome of ["pass", "fail", "cancelled"] as const) {
      expect(selectedReviewIds(canonical(outcome).snapshot)).toEqual([plan]);
    }

    const reasonlessCancellation = canonical("cancelled");
    delete reasonlessCancellation.review.datum.payload.cancellation_reason;
    expect(selectedReviewIds(reasonlessCancellation.snapshot)).toEqual([]);

    const extraBlocker = canonical("fail");
    extraBlocker.review.datum.links.push({
      type: "blocks",
      target: "ASP-0REPRTARCH-r00001",
    });
    expect(selectedReviewIds(extraBlocker.snapshot)).toEqual([]);

    const wrongTarget = canonical("fail");
    wrongTarget.review.datum.payload.simplification = {
      target: "ASP-0REPRTARCH-r00001",
      findings: [
        {
          id: "F-001",
          severity: "blocking",
          criterion: "A planning-DWP blocker must preserve exact every-and-only Review causality.",
          evidence:
            "The Review includes a blocker outside the exact subject-support context.",
          material_consequence:
            "Using the malformed blocker would route unrelated correction work.",
          summary: "Wrong exact target.",
        },
      ],
    };
    expect(selectedReviewIds(wrongTarget.snapshot)).toEqual([]);
  });

  it("does not recognize DWP Review evidence attached to invalid support", () => {
    const selectedReviewIds = (snapshot: Snapshot) =>
      (
        evaluateProcessDefinition(
        processPackage,
        snapshot,
        "selector",
        "passing-reviews-for@1",
        { subject: plan },
        ).result as Array<{ identity: { revision_id: string } }>
      ).map((item) => item.identity.revision_id);
    const invalid = () => {
      const snapshot = structuredClone(completionReady);
      const context = snapshot.records.find(
        (record) => record.datum.revision_id === currentDwpContext,
      );
      if (!context) throw new Error("missing current planning DWP context");
      return {
        snapshot,
        context,
        payload: context.datum.payload as {
          definition_members: string[];
          evidence: string[];
        },
      };
    };

    const augmented = invalid();
    augmented.payload.definition_members.push("QST-3RYPAB0KQZ-r00001");
    expect(selectedReviewIds(augmented.snapshot)).not.toContain(
      currentDwpReview,
    );
    const incomplete = invalid();
    incomplete.payload.definition_members =
      incomplete.payload.definition_members.filter(
        (revision) => revision !== "ICSP-0REPRT1CSP-r00001",
      );
    expect(selectedReviewIds(incomplete.snapshot)).not.toContain(
      currentDwpReview,
    );
    const evidenceBearing = invalid();
    evidenceBearing.payload.evidence = ["BSL-R6SFPZ4R31-r00001"];
    expect(selectedReviewIds(evidenceBearing.snapshot)).not.toContain(
      currentDwpReview,
    );
    const composed = invalid();
    composed.context.datum.links.push({
      type: "composes",
      target: "BSL-R6SFPZ4R31-r00001",
    });
    expect(selectedReviewIds(composed.snapshot)).not.toContain(
      currentDwpReview,
    );
    const stale = invalid();
    const architecture = stale.snapshot.records.find(
      (record) => record.datum.revision_id === "ASP-0REPRTARCH-r00001",
    );
    if (!architecture) throw new Error("missing architecture support");
    const newerArchitecture = structuredClone(architecture);
    newerArchitecture.datum.revision = 2;
    newerArchitecture.datum.revision_id = "ASP-0REPRTARCH-r00002";
    stale.snapshot.records.push(newerArchitecture);
    expect(selectedReviewIds(stale.snapshot)).not.toContain(currentDwpReview);

    const supersededOutput = invalid();
    const output = supersededOutput.snapshot.records.find(
      (record) => record.datum.revision_id === "SYS-0EXPRTREQ0-r00001",
    );
    if (!output) throw new Error("missing decomposition output support");
    const detachedOutput = structuredClone(output);
    detachedOutput.datum.revision = 2;
    detachedOutput.datum.revision_id = "SYS-0EXPRTREQ0-r00002";
    detachedOutput.datum.links = detachedOutput.datum.links.filter(
      (link) => link.type !== "decomposes",
    );
    supersededOutput.snapshot.records.push(detachedOutput);
    expect(selectedReviewIds(supersededOutput.snapshot)).not.toContain(
      currentDwpReview,
    );
    expect(
      obligation(
      processPackage,
      supersededOutput.snapshot,
      "review-context-required",
      plan,
      ),
    ).toBeUndefined();
    expectReady(
      processPackage,
      supersededOutput.snapshot,
      "stale-decomposition-plan-correction-required",
      "replan-stale-decomposition-work-package@1",
      plan,
    );

    const invalidOutput = invalid();
    const invalidSystem = invalidOutput.snapshot.records.find(
      (record) => record.datum.revision_id === "SYS-0EXPRTREQ0-r00001",
    );
    if (!invalidSystem) throw new Error("missing decomposition output support");
    invalidSystem.integrity.hash_valid = false;
    expect(selectedReviewIds(invalidOutput.snapshot)).not.toContain(
      currentDwpReview,
    );
    expect(
      obligation(
      processPackage,
      invalidOutput.snapshot,
      "review-context-required",
      plan,
      ),
    ).toBeUndefined();
    expectReady(
      processPackage,
      invalidOutput.snapshot,
      "stale-decomposition-plan-correction-required",
      "replan-stale-decomposition-work-package@1",
      plan,
    );

    const invalidConsumed = invalid();
    const invalidConsumedPlan = invalidConsumed.snapshot.records.find(
      (record) => record.datum.revision_id === plan,
    );
    const consumedSource = invalidConsumed.snapshot.records.find(
      (record) => record.datum.revision_id === "SYS-0EXPRTREQ0-r00001",
    );
    if (!invalidConsumedPlan || !consumedSource) {
      throw new Error("missing consumed-parent support fixture");
    }
    const invalidParent = structuredClone(consumedSource);
    invalidParent.datum.id = "SYS-0BADPARENT";
    invalidParent.datum.revision_id = "SYS-0BADPARENT-r00001";
    invalidParent.datum.links = invalidParent.datum.links.filter(
      (link) => link.type === "derived-from",
    );
    invalidParent.integrity.hash_valid = false;
    invalidConsumedPlan.datum.links.push({
      type: "decomposes",
      target: invalidParent.datum.revision_id,
    });
    invalidConsumed.payload.definition_members.push(
      invalidParent.datum.revision_id,
    );
    invalidConsumed.snapshot.records.push(invalidParent);
    expect(selectedReviewIds(invalidConsumed.snapshot)).not.toContain(
      currentDwpReview,
    );
    expect(
      obligation(
      processPackage,
      invalidConsumed.snapshot,
      "review-context-required",
      plan,
      ),
    ).toBeUndefined();
    expect(
      obligation(
        processPackage,
        invalidConsumed.snapshot,
        "stale-decomposition-plan-correction-required",
        plan,
      ),
    ).toEqual(
      expect.objectContaining({ status: "blocked", dispatchable: false }),
    );
    const foreign = invalid();
    foreign.context.datum.created_by.process_ref =
      "foreign-process@1.0.0#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(selectedReviewIds(foreign.snapshot)).not.toContain(currentDwpReview);
  });

  it("rejects a non-product-definition planning-DWP Review", () => {
    const snapshot = structuredClone(completionReady);
    const review = snapshot.records.find(
      (record) => record.datum.revision_id === currentDwpReview,
    );
    if (!review) throw new Error("missing retained DWP Review");
    review.datum.payload.review_kind = "contextual";

    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "passing-reviews-for@1",
      { subject: plan },
    );
    expect(
      (selected.result as Array<{ identity: { revision_id: string } }>).map(
        (item) => item.identity.revision_id,
      ),
    ).not.toContain(currentDwpReview);
  });

  it("accepts the retained passing architecture and interface simplification Review without correction work", () => {
    expect(
      obligation(
      processPackage,
      completionReady,
      "architecture-interface-simplification-required",
      plan,
      ),
    ).toEqual(
      expect.objectContaining({ satisfied: true, status: "satisfied" }),
    );
  });

  it("derives one exact SYS simplification correction from several subject Findings", () => {
    expectReady(
      processPackage,
      failedSimplification(completionReady, "subject"),
      "phase-2-simplification-correction-required",
      "revise-phase-2-subject-after-simplification@1",
      plan,
    );
  });

  it("derives one atomic correction for the exact Phase 2 definition-consistency set", () => {
    expectReady(
      processPackage,
      failedSimplification(completionReady, "definition-consistency"),
      "phase-2-definition-consistency-correction-required",
      "revise-phase-2-definition-set-after-simplification@1",
      plan,
    );
  });

  it("derives exact definition-consistency correction when scope reduction removes a proper SYS subset", () => {
    const snapshot = structuredClone(completionReady);
    const retainedSystem = "SYS-0EXPRTREQ0-r00001";
    const removedSystem = "SYS-0PRNTREQ00-r00001";
    const originalSystem = snapshot.records.find(
      (record) => record.datum.revision_id === retainedSystem,
    );
    const context = snapshot.records.find(
      (record) => record.datum.revision_id === "BSL-FMKW2W7Z71-r00001",
    );
    const review = snapshot.records.find(
      (record) => record.datum.revision_id === "REV-0ARCSMP100-r00001",
    );
    if (!originalSystem || !context || !review) {
      throw new Error("missing retained Phase 2 scope-reduction evidence");
    }

    const removableSystem = structuredClone(originalSystem);
    removableSystem.datum.id = "SYS-0PRNTREQ00";
    removableSystem.datum.revision_id = removedSystem;
    removableSystem.datum.payload = {
      ...removableSystem.datum.payload,
      title: "Print one completed report",
      rationale: "Printing duplicates the retained controlled export behavior.",
      statement: "The system shall print one completed report.",
      verification_intent: "Observe one printed completed report.",
    };
    snapshot.records.push(removableSystem);

    const contextPayload = context.datum.payload as {
      definition_members: string[];
    };
    contextPayload.definition_members.push(removedSystem);
    review.datum.payload.outcome = "fail";
    review.datum.payload.correction_authority = "package-evidence";
    review.datum.payload.definition_simplification = {
      primary_target: plan,
      correction_set: "definition-consistency",
      primary_findings: [
        {
          id: "F-001",
          severity: "blocking",
          criterion: "Scope reduction may remove SYS output only when the complete definition set remains consistent and covered.",
          evidence:
            "The Review observes that removing the proper SYS subset leaves the declared Phase 2 definition inconsistent.",
          material_consequence:
            "The reduced output set would omit required system behavior or traceability.",
          summary:
            "Keep export behavior while removing the duplicate print output.",
        },
      ],
      scope_reduction: {
        rationale:
          "The print output duplicates export and is unnecessary; export remains required.",
      },
    };
    const exactBlockers = [
      "ASP-0REPRTARCH-r00001",
      plan,
      "ICSP-0REPRT1CSP-r00001",
      retainedSystem,
      removedSystem,
    ];
    review.datum.links.push(
      ...exactBlockers.map((target) => ({ type: "blocks", target })),
      { type: "removes", target: removedSystem },
    );

    const selectedIds = (
      selector: string,
      argumentsValue: Record<string, unknown>,
    ) =>
      (
        evaluateProcessDefinition(
        processPackage,
        snapshot,
        "selector",
        selector,
        argumentsValue,
        ).result as Array<{ identity: { revision_id: string } }>
      ).map((item) => item.identity.revision_id);
    const currentSystems = selectedIds("decomposition-outputs-for@1", { plan });
    const removedSystems = selectedIds("phase-2-removed-outputs-for-review@1", {
      review: "REV-0ARCSMP100-r00001",
    });

    expect(currentSystems).toEqual([retainedSystem, removedSystem]);
    expect(removedSystems).toEqual([removedSystem]);
    expect(removedSystems.length).toBeLessThan(currentSystems.length);
    expect(
      currentSystems.filter((system) => !removedSystems.includes(system)),
    ).toEqual([retainedSystem]);
    expect(
      selectedIds("phase-2-simplification-blockers-for-review@1", {
        review: "REV-0ARCSMP100-r00001",
      }),
    ).toEqual(exactBlockers);
    const simplification = review.datum.payload.definition_simplification as {
      scope_reduction: { rationale: string };
    };
    expect(simplification.scope_reduction).toEqual({
      rationale:
        "The print output duplicates export and is unnecessary; export remains required.",
    });
    expect(
      selectedIds("valid-phase-2-simplification-review@1", {
        review: "REV-0ARCSMP100-r00001",
        plan,
      }),
    ).toEqual(["REV-0ARCSMP100-r00001"]);

    const corrections = evaluateLifecycle(
      processPackage,
      snapshot,
    ).obligations.filter(
      (item) =>
        item.obligation ===
          "phase-2-definition-consistency-correction-required" &&
        item.subject === plan,
    );
    expect(corrections).toEqual([
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver:
          "revise-phase-2-definition-set-after-simplification@1",
      }),
    ]);
  });

  it("rejects an incomplete definition-consistency blocker set as invalid correction evidence", () => {
    const snapshot = failedSimplification(
      completionReady,
      "definition-consistency",
      {
      malformedBlockers: true,
      },
    );
    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "valid-phase-2-simplification-review@1",
      { review: "REV-0ARCSMP100-r00001", plan },
    );
    expect(selected.result).toEqual([]);
    expect(
      obligation(
      processPackage,
      snapshot,
      "phase-2-definition-consistency-correction-required",
      plan,
      ),
    ).toEqual(
      expect.objectContaining({
      satisfied: true,
      status: "satisfied",
      dispatchable: false,
      actionableResolver: null,
      }),
    );
    expect(
      obligation(
        processPackage,
        snapshot,
        "decomposition-simplification-required",
        plan,
      ),
    ).toBeUndefined();
  });

  it("rejects complete removal of the current SYS set instead of fabricating correction work", () => {
    const snapshot = failedSimplification(
      completionReady,
      "definition-consistency",
      {
      removeSystem: true,
      },
    );
    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot,
      "selector",
      "valid-phase-2-simplification-review@1",
      { review: "REV-0ARCSMP100-r00001", plan },
    );
    expect(selected.result).toEqual([]);
    expect(
      obligation(
      processPackage,
      snapshot,
      "phase-2-definition-consistency-correction-required",
      plan,
      ),
    ).toEqual(
      expect.objectContaining({
      satisfied: true,
      status: "satisfied",
      dispatchable: false,
      actionableResolver: null,
      }),
    );
    expect(
      obligation(
        processPackage,
        snapshot,
        "decomposition-simplification-required",
        plan,
      ),
    ).toBeUndefined();
  });

  it("derives exact DWP completion from the retained completion predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-completion-ready.json"),
      "decomposition-completion-required",
      "complete-decomposition-work-package@2",
    );
  });

  it("derives exact decomposition-group candidate creation from its retained predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-group-ready.json"),
      "decomposition-group-candidate-required",
      "create-decomposition-group-candidate@1",
    );
  });

  it("derives exact system-level candidate creation from its retained predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-level-ready.json"),
      "system-level-candidate-required",
      "create-system-level-candidate@1",
    );
  });

  it("derives autonomous candidate correction from an exact failed candidate Review", async () => {
    const snapshot = await fixture("phase2-acceptance-ready.json");
    const review = snapshot.records.find(
      (record) => record.datum.revision_id === "REV-F14GRW3HTF-r00001",
    );
    if (!review) throw new Error("missing retained candidate Review");
    review.datum.payload.outcome = "fail";
    review.datum.payload.correction_authority = "package-evidence";
    review.datum.payload.findings = [
      {
        id: "F-001",
        target: "BSL-2YPGCAM8D1-r00002",
        relationship: "primary",
        severity: "blocking",
        criterion: "A failed system candidate Review must be corrected by an exact superseding candidate Revision.",
        evidence:
          "The Review rejects the current candidate against its frozen Phase 2 definition context.",
        material_consequence:
          "The rejected candidate cannot authorize system-level progression.",
        summary: "Correct the exact reviewed candidate.",
      },
    ];
    expectReady(
      processPackage,
      snapshot,
      "phase-2-candidate-correction-required",
      "revise-phase-2-candidate-after-review@1",
      "BSL-2YPGCAM8D1-r00002",
    );
  });

  it("derives autonomous candidate correction from an exact reviewed gate rejection", async () => {
    const snapshot = withoutRecordAndDependents(
      await fixture("phase2-acceptance-ready.json"),
      "BSL-2YPGCAM8D1-r00002",
    );
    expectReady(
      processPackage,
      snapshot,
      "phase-2-candidate-correction-required",
      "revise-phase-2-candidate-after-review@1",
      "BSL-2YPGCAM8D1-r00001",
    );
    expect(
      obligation(
      processPackage,
      snapshot,
      "candidate-gate-signoff",
      "BSL-2YPGCAM8D1-r00001",
      ),
    ).toEqual(
      expect.objectContaining({
      status: "blocked",
      actionableResolver: "revise-phase-2-candidate-after-review@1",
      }),
    );
  });

  it("returns a corrected and independently reviewed candidate to the same attended gate", async () => {
    const snapshot = withoutRecordAndDependents(
      await fixture("phase2-acceptance-ready.json"),
      "DEC-0Y97CFVCGX-r00001",
    );
    const gate = obligation(
      processPackage,
      snapshot,
      "candidate-gate-signoff",
      "BSL-2YPGCAM8D1-r00002",
    );
    expect(gate).toEqual(
      expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@3",
        participation: [
          expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
          }),
        ],
      }),
    );
  });

  it("derives exact Phase 2 acceptance from its reviewed accepted-candidate predecessor", async () => {
    expectReady(
      processPackage,
      await fixture("phase2-acceptance-ready.json"),
      "system-acceptance-required",
      "accept-phase-2-system@1",
    );
  });

  it("proves complete authorized progression into pilot assessment", async () => {
    const evaluation = evaluateLifecycle(
      processPackage,
      await fixture("phase2-progression-complete.json"),
    );
    expect(evaluation.phase?.progression).toEqual(
      expect.objectContaining({
      nextPhase: "phase-2-pilot-assessment",
      ready: true,
      authorized: true,
      complete: true,
      }),
    );
  });

  it("derives the first exact pilot observation after complete Phase 2 progression", async () => {
    const snapshot = await fixture("phase2-progression-complete.json");
    snapshot.phaseId = "phase-2-pilot-assessment";
    expectReady(
      processPackage,
      snapshot,
      "pilot-observation-required",
      "record-pilot-observation@2",
      "BSL-2YPGCAM8D1-r00002",
    );
  });
});
