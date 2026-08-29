import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessPackage,
} from "../src/index.js";
import {
  evaluateProcessDefinition,
  evaluateScenarioParticipation,
} from "../src/evaluator.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import {
  submitPreparedResolverScenario,
  type ScenarioProposal,
} from "../src/scenario-execution.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");
const processRef = "mdlm-bootstrap@0.74.0#sha256:phase-0-route-evidence";
const revisionId = (id: string, revision = 1) =>
  `${id}-r${String(revision).padStart(5, "0")}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    revision?: number;
    links?: Array<{ type: string; target: string }>;
    scenario?: string;
  } = {},
): LifecycleRecord {
  const result = frozenLifecycleRecord(processRef, type, id, payload, {
    links: options.links ?? [],
    ...(options.scenario ? { scenario: options.scenario } : {}),
  });
  result.datum.revision = options.revision ?? 1;
  result.datum.revision_id = revisionId(id, options.revision ?? 1);
  return result;
}

function contextFor(subject: LifecycleRecord, id: string): LifecycleRecord {
  const directSupportTypes = new Set([
    "STK",
    "ASP",
    "ICSP",
    "DWP",
    "SYS",
    "VSP",
    "PAS",
  ]);
  const exactTarget = (target: string) =>
    /-r[0-9]{5}$/.test(target) ? target : `${target}-r00001`;
  const support = directSupportTypes.has(subject.datum.type)
    ? subject.datum.links.map((link) => exactTarget(link.target))
    : subject.datum.type === "DEC" &&
        subject.datum.payload.kind === "pilot-expansion"
      ? subject.datum.links.map((link) => exactTarget(link.target))
      : subject.datum.type === "BSL" &&
          subject.datum.payload.role === "candidate"
        ? (subject.datum.payload.definition_members as string[])
        : [];
  return record("BSL", id, {
    title: `Exact Review Context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      ...new Set([subject.datum.revision_id, ...support]),
    ].sort(),
    evidence: [],
  }, { scenario: "create-review-context@1" });
}

function reviewFor(
  subject: LifecycleRecord,
  id: string,
  outcome: "pass" | "fail",
  options: {
    contextId?: string;
    correctionAuthority?: "stakeholder" | "package-evidence";
    reviewKind?: "contextual" | "simplification-product-definition";
  } = {},
): [LifecycleRecord, LifecycleRecord] {
  const context = contextFor(
    subject,
    options.contextId ?? id.replace("REV", "BSL"),
  );
  const reviewKind = options.reviewKind ?? "contextual";
  const review = record(
    "REV",
    id,
    {
      title: `${outcome === "pass" ? "Passing" : "Failed"} Review of ${subject.datum.revision_id}`,
      review_kind: reviewKind,
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      ...(reviewKind === "simplification-product-definition"
        ? outcome === "fail"
          ? {
              simplification: {
                target: subject.datum.revision_id,
                findings: [
                  {
                    id: "F-001",
                    severity: "blocking",
                    criterion:
                      "A failed contextual Review must identify a concrete defect in the exact Phase 0 Revision.",
                    evidence:
                      "The Review rejects the exact subject Revision in its kernel-frozen Phase 0 context.",
                    material_consequence:
                      "The rejected Revision cannot satisfy its foundation Review obligation.",
                    summary: "The exact product definition remains unnecessarily broad.",
                  },
                ],
              },
            }
          : {}
        : {
            findings:
              outcome === "fail"
                ? [
                    {
                      id: "F-001",
                      target: subject.datum.revision_id,
                      relationship: "primary",
                      severity: "blocking",
                      criterion:
                        "Product-definition simplification must remove or justify scope broader than the accepted intent.",
                      evidence:
                        "The Review observes that the exact candidate contains an unnecessarily broad product definition.",
                      material_consequence:
                        "Accepting the candidate would preserve avoidable scope and downstream artifact expansion.",
                      summary: "Correct the exact reviewed Revision.",
                    },
                  ]
                : [],
          }),
      ...(outcome === "fail"
        ? {
            correction_authority:
              options.correctionAuthority ?? "package-evidence",
          }
        : {}),
      outcome,
    },
    {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: subject.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
      ...(reviewKind === "simplification-product-definition" && outcome === "fail"
        ? [{ type: "blocks", target: subject.datum.revision_id }]
        : []),
    ],
  },
  );
  return [context, review];
}

function phase0Foundation() {
  const map = record("MAP", "MAP-1030000001", {
    title: "Exact Phase 0 frontier",
    purpose: "Bound one complete intent candidate.",
    frontier: ["One operator-visible outcome"],
  }, { scenario: "establish-initial-wayfinding-map@1" });
  const product = record("PSP", "PSP-1030000001", {
    title: "Exact Phase 0 product",
    rationale: "Define the bounded operator outcome.",
    problem: "The operator needs one deterministic outcome.",
    users: ["operator"],
    goals: ["deterministic outcome"],
    non_goals: ["implementation architecture"],
    success_measures: ["the outcome is independently reviewable"],
  }, { scenario: "compile-psp@2" });
  const requirement = record(
    "STK",
    "STK-1030000001",
    {
      title: "Deterministic operator outcome",
      rationale: "The exact product intent requires an observable commitment.",
      statement: "The product shall expose one deterministic operator outcome.",
      verification_intent: "Observe the exact public outcome.",
      stakeholder: "operator",
      priority: "must",
      system_context: "product",
    },
    {
    scenario: "draft-stakeholder-requirements@2",
    links: [{ type: "derived-from", target: product.datum.id }],
  },
  );
  const members = [map, product, requirement];
  const reviews = members.flatMap((member, index) => reviewFor(
    member,
    `REV-103000000${index + 1}`,
    "pass",
    { contextId: `BSL-103000000${index + 1}` },
  ));
  return { map, product, requirement, members, reviews };
}

function intentCandidate(
  foundation: ReturnType<typeof phase0Foundation>,
  options: {
    revision?: number;
    links?: Array<{ type: string; target: string }>;
  } = {},
): LifecycleRecord {
  const memberRevisions = new Set(
    foundation.members.map((member) => member.datum.revision_id),
  );
  const memberReviewIds = foundation.reviews
    .filter((item) =>
      item.datum.type === "REV" && item.datum.links.some((link) =>
        link.type === "reviews" && memberRevisions.has(link.target)
      )
    )
    .map((item) => item.datum.revision_id);
  return record("BSL", "BSL-1030000004", {
    title: "Exact Phase 0 intent candidate",
    kind: "intent-level-candidate",
    role: "candidate",
    scope: "product-intent",
    group: "DEFAULT",
    definition_members: foundation.members.map((member) => member.datum.revision_id),
    evidence: memberReviewIds,
  }, {
    ...(options.revision === undefined ? {} : { revision: options.revision }),
    scenario: options.revision && options.revision > 1
      ? "revise-intent-candidate-after-review@3"
      : "create-phase-0-intent-candidate@1",
    ...(options.links === undefined ? {} : { links: options.links }),
  });
}

function passingSimplification(
  candidate: LifecycleRecord,
  id = "REV-1030000004",
): [LifecycleRecord, LifecycleRecord] {
  const context = record("BSL", id.replace("REV", "BSL"), {
    title: "Exact candidate simplification context",
    kind: "review-context",
    role: "review-context",
    scope: candidate.datum.revision_id,
    group: "DEFAULT",
    definition_members: [candidate.datum.revision_id],
    evidence: [],
  }, { scenario: "create-review-context@1" });
  const review = record(
    "REV",
    id,
    {
      title: "Passing candidate-centered simplification Review",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      outcome: "pass",
    },
    {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: candidate.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
  },
  );
  return [context, review];
}

function gateRejection(
  candidate: LifecycleRecord,
  blocker: LifecycleRecord,
): LifecycleRecord[] {
  const rejection = record("DEC", "DEC-1030000001", {
    title: "Reviewed Phase 0 gate rejection",
    rationale: "The exact blocker must be corrected before returning to this gate.",
    kind: "gate-signoff",
    gate_outcome: "reject",
    gate_rejection: {
      findings: [{ id: "G-001", summary: "Correct the exact implicated requirement." }],
    },
    decision: "Reject this exact candidate and correct its blocker.",
    alternatives: ["Approve without correction"],
    effective_scope: candidate.datum.revision_id,
  }, {
    scenario: "record-gate-signoff@3",
    links: [
      { type: "justifies", target: candidate.datum.revision_id },
      { type: "blocks", target: blocker.datum.revision_id },
    ],
  });
  const [context, review] = reviewFor(
    rejection,
    "REV-1030000005",
    "pass",
    { contextId: "BSL-1030000006" },
  );
  context.datum.payload.definition_members = [
    rejection.datum.revision_id,
    candidate.datum.revision_id,
    revisionId("REV-1030000004"),
  ].sort();
  return [rejection, context, review];
}

function snapshot(records: LifecycleRecord[], phaseId = "phase-0-wayfinding"): LifecycleSnapshot {
  return { processRef, phaseId, records, dependencyComparisons: [] };
}

function obligation(
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
  name: string,
  subject?: string,
  phaseId = "phase-0-wayfinding",
) {
  return evaluateLifecycle(processPackage, snapshot(records, phaseId)).obligations.find(
    (item) => item.obligation === name && (subject === undefined || item.subject === subject),
  );
}

describe("Phase 0 missing hardening routes", () => {
  let processPackage: ProcessPackage;
  beforeAll(async () => {
    const loaded = await loadProcessPackage(bootstrapPackage);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("binds the superseded candidate and causal failed Review into its replacement Review packet", () => {
    const foundation = phase0Foundation();
    const originalCandidate = intentCandidate(foundation);
    const originalDecision = record("DEC", "DEC-1030000091", {
      title: "Original product boundary",
      rationale: "The first boundary was independently rejected.",
      kind: "scope",
      decision: "Retain the original product boundary.",
      alternatives: ["Use the corrected boundary"],
      effective_scope: foundation.product.datum.revision_id,
    }, { scenario: "resolve-question@2" });
    const [originalDecisionContext, failedReview] = reviewFor(
      originalDecision,
      "REV-1030000091",
      "fail",
      { contextId: "BSL-1030000091" },
    );
    const correctedDecision = record("DEC", originalDecision.datum.id, {
      ...originalDecision.datum.payload,
      title: "Corrected product boundary",
    }, {
      revision: 2,
      scenario: "revise-question-decision-after-review@1",
      links: [{ type: "corrects-review", target: failedReview.datum.revision_id }],
    });
    const [correctedDecisionContext, correctedDecisionReview] = reviewFor(
      correctedDecision,
      "REV-1030000092",
      "pass",
      { contextId: "BSL-1030000092" },
    );
    const correctedProduct = record(
      "PSP",
      foundation.product.datum.id,
      { ...foundation.product.datum.payload },
      {
        revision: 2,
        scenario: "revise-foundation-after-review@5",
        links: [{
          type: "incorporates-answer",
          target: correctedDecision.datum.revision_id,
        }],
      },
    );
    const replacementCandidate = intentCandidate({
      ...foundation,
      product: correctedProduct,
      members: foundation.members.map((member) =>
        member.datum.id === correctedProduct.datum.id ? correctedProduct : member
      ),
    }, {
      revision: 2,
      links: [{ type: "supersedes", target: originalCandidate.datum.revision_id }],
    });
    const replacementContext = contextFor(replacementCandidate, "BSL-1030000093");
    replacementContext.datum.payload.definition_members = [
      ...(replacementContext.datum.payload.definition_members as string[]),
      correctedDecision.datum.revision_id,
    ].sort();
    const packetMembers = evaluateProcessDefinition(
      processPackage,
      snapshot([
        ...foundation.members,
        ...foundation.reviews,
        originalDecision,
        originalDecisionContext,
        failedReview,
        correctedDecision,
        correctedDecisionContext,
        correctedDecisionReview,
        correctedProduct,
        originalCandidate,
        replacementCandidate,
        replacementContext,
      ]),
      "selector",
      "review-assignment-context-members-for@1",
      { subject: replacementCandidate.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;

    const packetMemberIds = packetMembers.map((member) => member.identity.revision_id);
    expect(packetMemberIds).toEqual(expect.arrayContaining([
      originalCandidate.datum.revision_id,
      failedReview.datum.revision_id,
    ]));
    expect(packetMemberIds).not.toContain(correctedDecisionReview.datum.revision_id);
  });

  it("binds only the exact superseded candidate to a third-revision Review packet", () => {
    const foundation = phase0Foundation();
    const originalCandidate = intentCandidate(foundation);
    const secondCandidate = intentCandidate(foundation, {
      revision: 2,
      links: [{ type: "supersedes", target: originalCandidate.datum.revision_id }],
    });
    const thirdCandidate = intentCandidate(foundation, {
      revision: 3,
      links: [{ type: "supersedes", target: secondCandidate.datum.revision_id }],
    });
    const thirdContext = contextFor(thirdCandidate, "BSL-1030000094");
    const packetMembers = evaluateProcessDefinition(
      processPackage,
      snapshot([
        ...foundation.members,
        ...foundation.reviews,
        originalCandidate,
        secondCandidate,
        thirdCandidate,
        thirdContext,
      ]),
      "selector",
      "review-assignment-context-members-for@1",
      { subject: thirdCandidate.datum.revision_id },
    ).result as Array<{ identity: { id: string; revision_id: string } }>;

    expect(packetMembers
      .filter((member) => member.identity.id === thirdCandidate.datum.id)
      .map((member) => member.identity.revision_id)).toEqual([
        secondCandidate.datum.revision_id,
      ]);
  });

  it("prepares the exact PSP parent in both STK Review context Assignments", async () => {
    const foundation = phase0Foundation();
    const records = [
      ...foundation.members,
      ...foundation.reviews.slice(0, 4),
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "current-product-specifications-for-requirement@1",
      { requirement: foundation.requirement.datum.revision_id },
    ).result).toEqual([{ key: foundation.product.datum.id }]);
    const contextRoute = obligation(
      processPackage,
      records,
      "review-context-required",
      foundation.requirement.datum.revision_id,
    );
    expect(contextRoute).toBeDefined();
    const preparedContext = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "create-review-context@1",
      contextRoute!.id,
      [],
    );
    expect(preparedContext.ok, JSON.stringify(preparedContext.diagnostics)).toBe(true);
    if (!preparedContext.ok) return;
    expect(preparedContext.value.invocations[0]!.inputs.find((input) =>
      input.name === "context_members"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      foundation.product.datum.revision_id,
    ]);

    const context = record(
      "BSL",
      "BSL-1030000091",
      {
        title: "Exact current STK Review Context",
        kind: "review-context",
        role: "review-context",
        scope: foundation.requirement.datum.revision_id,
        group: "DEFAULT",
        definition_members: [
          foundation.requirement.datum.revision_id,
          foundation.product.datum.revision_id,
        ],
        evidence: [],
      },
      { scenario: "create-review-context@1" },
    );
    const reviewRecords = [...records, context];
    const reviewRoute = obligation(
      processPackage,
      reviewRecords,
      "passing-review-required",
      foundation.requirement.datum.revision_id,
    );
    expect(reviewRoute).toBeDefined();
    const preparedReview = await dryRunResolverScenario(
      processPackage,
      snapshot(reviewRecords),
      "review-datum-in-context@2",
      reviewRoute!.id,
      [],
    );
    expect(preparedReview.ok, JSON.stringify(preparedReview.diagnostics)).toBe(true);
    if (!preparedReview.ok) return;
    const suppliedParents = preparedReview.value.invocations[0]!.inputs.find(
      (input) => input.name === "context_members",
    )?.values;
    expect(suppliedParents?.map((value) => value.identity.revision_id)).toEqual([
      foundation.product.datum.revision_id,
    ]);
    expect(suppliedParents?.[0]?.data.payload).toEqual(expect.objectContaining({
      title: "Exact Phase 0 product",
      problem: "The operator needs one deterministic outcome.",
    }));
  });

  it("supplies only latest exact Stable-linked Questions to Phase 0 candidate authoring", async () => {
    const foundation = phase0Foundation();
    foundation.map.datum.links = [{
      type: "indexes",
      target: "QST-1030000010",
    }];
    const linked = record("QST", "QST-1030000010", {
      title: "Resolved product intent",
      kind: "intent",
      question: "What exact product intent governs this foundation?",
      state: "answered",
      blocking_impact: "The product intent would otherwise remain ambiguous.",
    }, { scenario: "resolve-question@2" });
    const latestLinked = record("QST", linked.datum.id, {
      ...linked.datum.payload,
      title: "Latest resolved product intent",
    }, { revision: 2, scenario: "resolve-question@2" });
    const unrelated = record("QST", "QST-1030000011", {
      title: "Unrelated resolved question",
      kind: "intent",
      question: "What unrelated intent is out of scope?",
      state: "answered",
      blocking_impact: "No impact on this foundation.",
    }, { scenario: "resolve-question@2" });
    const mapReviewContext = foundation.reviews.find((item) =>
      item.datum.type === "BSL" &&
      item.datum.payload.scope === foundation.map.datum.revision_id
    )!;
    mapReviewContext.datum.payload.definition_members = [
      foundation.map.datum.revision_id,
      latestLinked.datum.revision_id,
    ];
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      linked,
      latestLinked,
      unrelated,
    ];
    const route = obligation(
      processPackage,
      records,
      "intent-candidate-required",
    );
    expect(route).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "create-phase-0-intent-candidate@1",
    }));
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "create-phase-0-intent-candidate@1",
      route!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs
      .find((input) => input.name === "stable_link_targets")!.values
      .map((value) => value.identity.revision_id)).toEqual([
        latestLinked.datum.revision_id,
      ]);
  });

  it("creates only a complete reviewed Phase 0 intent candidate and then yields fresh candidate Review work", async () => {
    const foundation = phase0Foundation();
    const records = [...foundation.members, ...foundation.reviews];
    expect(obligation(
      processPackage,
      records,
      "intent-candidate-required",
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-phase-0-intent-candidate@1",
    }));

    const incomplete = intentCandidate(foundation);
    incomplete.datum.payload.definition_members = foundation.members.slice(0, 2)
      .map((member) => member.datum.revision_id);
    expect(obligation(
      processPackage,
      [...records, incomplete],
      "intent-candidate-required",
    )?.satisfied).toBe(false);

    const candidate = intentCandidate(foundation);
    const complete = evaluateLifecycle(processPackage, snapshot([...records, candidate]));
    expect(complete.obligations.find((item) =>
      item.obligation === "intent-candidate-required"
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(candidate.datum.payload).toMatchObject({
      definition_members: foundation.members.map((member) => member.datum.revision_id),
      evidence: foundation.reviews
        .filter((item) => item.datum.type === "REV")
        .map((item) => item.datum.revision_id),
    });
    const contextRoute = complete.looseEnds.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === candidate.datum.revision_id
    );
    expect(contextRoute).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "create-review-context@1",
    }));
    const expectedContextSupport = foundation.members
      .map((member) => member.datum.revision_id)
      .sort();
    const expectedAssignmentSupport = [
      ...expectedContextSupport,
      ...foundation.reviews
        .filter((item) => item.datum.type === "REV")
        .map((review) => review.datum.revision_id),
    ].sort();
    const preparedContext = await dryRunResolverScenario(
      processPackage,
      snapshot([...records, candidate]),
      "create-review-context@1",
      contextRoute!.id,
      [],
    );
    expect(preparedContext.ok, JSON.stringify(preparedContext.diagnostics)).toBe(true);
    if (!preparedContext.ok) return;
    expect(preparedContext.value.invocations[0]!.inputs
      .find((input) => input.name === "context_members")!.values
      .map((value) => value.identity.revision_id)).toEqual(expectedContextSupport);

    const context = record("BSL", "BSL-1030000091", {
      title: "Evidence-complete candidate Review Context",
      kind: "review-context",
      role: "review-context",
      scope: candidate.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        candidate.datum.revision_id,
        ...expectedContextSupport,
      ].sort(),
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const reviewRecords = [...records, candidate, context];
    const reviewRoute = obligation(
      processPackage,
      reviewRecords,
      "passing-review-required",
      candidate.datum.revision_id,
    );
    const preparedReview = await dryRunResolverScenario(
      processPackage,
      snapshot(reviewRecords),
      "review-datum-in-context@2",
      reviewRoute!.id,
      [],
    );
    expect(preparedReview.ok, JSON.stringify(preparedReview.diagnostics)).toBe(true);
    if (!preparedReview.ok) return;
    expect(preparedReview.value.invocations[0]!.inputs
      .find((input) => input.name === "context_members")!.values
      .map((value) => value.identity.revision_id)).toEqual(
        expectedAssignmentSupport,
      );
    const suppliedReviews = preparedReview.value.invocations[0]!.inputs
      .find((input) => input.name === "context_members")!.values
      .filter((value) => value.identity.type === "REV");
    expect(suppliedReviews).toHaveLength(3);
    expect(suppliedReviews.every((value) => value.data.payload.outcome === "pass"))
      .toBe(true);
  });

  it("supplies complete passing member Reviews when correcting a candidate that omitted them", async () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    candidate.datum.payload.evidence = [];
    const context = record("BSL", "BSL-1030000092", {
      title: "Exact failed candidate Review Context",
      kind: "review-context",
      role: "review-context",
      scope: candidate.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        candidate.datum.revision_id,
        ...foundation.members.map((member) => member.datum.revision_id),
      ],
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const failed = record(
      "REV",
      "REV-1030000092",
      {
        title: "Failed candidate evidence Review",
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        simplification: {
          target: candidate.datum.revision_id,
          findings: [
            {
              id: "F-001",
              severity: "blocking",
              criterion:
                "A corrected candidate must include passing Reviews for every exact definition member.",
              evidence:
                "The candidate correction omits one member Review required by its complete frozen definition set.",
              material_consequence:
                "The candidate cannot establish that every member is independently usable.",
              summary: "The candidate omits complete member Review evidence.",
            },
          ],
        },
        correction_authority: "package-evidence",
        outcome: "fail",
      },
      {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: candidate.datum.revision_id },
        { type: "contextualizes", target: context.datum.revision_id },
        { type: "blocks", target: candidate.datum.revision_id },
      ],
    },
    );
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      context,
      failed,
    ];
    const correction = obligation(
      processPackage,
      records,
      "intent-candidate-review-correction-required",
      candidate.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-intent-candidate-after-review@3",
    }));
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "revise-intent-candidate-after-review@3",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const memberReviewIds = foundation.reviews
      .filter((item) => item.datum.type === "REV")
      .map((item) => item.datum.revision_id);
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "member_reviews"
    )?.values.map((value) => value.identity.revision_id)).toEqual(
      memberReviewIds,
    );

    const replacement = intentCandidate(foundation, {
      revision: 2,
      links: [
        { type: "supersedes", target: candidate.datum.revision_id },
        { type: "corrects-review", target: failed.datum.revision_id },
      ],
    });
    const completionResult = (evidence: string[]) => {
      replacement.datum.payload.evidence = evidence;
      return evaluateProcessDefinition(
        processPackage,
        snapshot([...records, replacement]),
        "selector",
        "complete-superseding-intent-candidates-for@1",
        { candidate: candidate.datum.revision_id },
      ).result;
    };
    expect(completionResult([])).toEqual([]);
    expect(completionResult([...memberReviewIds, failed.datum.revision_id])).toEqual([]);
    expect(completionResult(memberReviewIds)).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: replacement.datum.revision_id,
      }) }),
    ]);
  });

  it("routes an initial failed foundation Review to the first autonomous correction with exact evidence", async () => {
    const subject = phase0Foundation().requirement;
    const [context, failed] = reviewFor(subject, "REV-1030000010", "fail");
    const records = [subject, context, failed];
    const correction = obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      subject.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(correction).not.toHaveProperty("participation");
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "revise-foundation-after-review@5",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "failed_reviews"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      failed.datum.revision_id,
    ]);
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "prior_failed_reviews"
    )?.values).toEqual([]);
  });

  it("keeps the second autonomous foundation correction dispatchable after the first replacement fails fresh Review", async () => {
    const original = phase0Foundation().requirement;
    const [context1, failure1] = reviewFor(original, "REV-1030000011", "fail");
    const replacement = record("STK", original.datum.id, {
      ...original.datum.payload,
      title: "First exact corrected requirement",
    }, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: "PSP-1030000001" },
        { type: "corrects-review", target: failure1.datum.revision_id },
      ],
    });
    const [context2, failure2] = reviewFor(replacement, "REV-1030000012", "fail");
    const records = [original, context1, failure1, replacement, context2, failure2];
    const correction = obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      replacement.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      original.datum.revision_id,
    )).toBeUndefined();
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "revise-foundation-after-review@5",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const inputs = prepared.value.invocations[0]!.inputs;
    expect(inputs.find((input) => input.name === "prior_failed_reviews")?.values.map(
      (value) => value.identity.revision_id,
    )).toEqual([failure1.datum.revision_id]);
    expect(inputs.find((input) => input.name === "failed_reviews")?.values.map(
      (value) => value.identity.revision_id,
    )).toEqual([failure2.datum.revision_id]);
  });

  it("exhausts foundation correction after the second replacement and permits no third autonomous cycle", async () => {
    const original = phase0Foundation().requirement;
    const [context1, failure1] = reviewFor(original, "REV-1030000013", "fail");
    const first = record("STK", original.datum.id, original.datum.payload, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: "PSP-1030000001" },
        { type: "corrects-review", target: failure1.datum.revision_id },
      ],
    });
    const [context2, failure2] = reviewFor(first, "REV-1030000014", "fail");
    const second = record("STK", original.datum.id, original.datum.payload, {
      revision: 3,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: "PSP-1030000001" },
        { type: "corrects-review", target: failure1.datum.revision_id },
        { type: "corrects-review", target: failure2.datum.revision_id },
      ],
    });
    const beforeFinalFailure = [original, context1, failure1, first, context2, failure2, second];
    expect(obligation(
      processPackage,
      beforeFinalFailure,
      "review-context-required",
      second.datum.revision_id,
    )).toEqual(expect.objectContaining({ status: "ready" }));
    const [context3, failure3] = reviewFor(second, "REV-1030000015", "fail");
    const records = [...beforeFinalFailure, context3, failure3];
    expect(obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      second.datum.revision_id,
    )).toBeUndefined();
    const escalation = obligation(
      processPackage,
      records,
      "foundation-review-escalation-required",
      second.datum.revision_id,
    );
    expect(escalation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "escalate-foundation-review-correction@3",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    expect(escalation).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "escalate-foundation-review-correction@3",
      escalation!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.prompt.skills.map((skill) => skill.reference)).toEqual([
      "skills/lifecycle-data.md@1",
      "skills/clarification-protocol.md@1",
      "skills/requirement-writing.md@1",
      "skills/author-preflight.md@2",
    ]);
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "lineage"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      original.datum.revision_id,
      first.datum.revision_id,
      second.datum.revision_id,
    ]);

  });

  it("routes a stakeholder-owned foundation failure immediately to attended escalation without spending an autonomous cycle", async () => {
    const subject = phase0Foundation().requirement;
    const [context, failed] = reviewFor(subject, "REV-1030000016", "fail", {
      correctionAuthority: "stakeholder",
    });
    const records = [subject, context, failed];
    expect(obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      subject.datum.revision_id,
    )).toBeUndefined();
    const escalation = obligation(
      processPackage,
      records,
      "foundation-review-escalation-required",
      subject.datum.revision_id,
    );
    expect(escalation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "escalate-foundation-review-correction@3",
      explanation: expect.stringMatching(/stakeholder attention.*immediately/i),
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(escalation).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "escalate-foundation-review-correction@3",
      escalation!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.expectedOutputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "decision",
        types: ["DEC"],
        cardinality: "one",
      }),
    ]));
  });


  it("makes existing STK Review evidence stale when its stable PSP parent advances", () => {
    const foundation = phase0Foundation();
    const revisedProduct = record("PSP", foundation.product.datum.id, {
      ...foundation.product.datum.payload,
      title: "Revised exact Phase 0 product",
    }, { revision: 2, scenario: "compile-psp@2" });
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      revisedProduct,
    ];
    expect(obligation(
      processPackage,
      records,
      "stakeholder-requirements-required",
      revisedProduct.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "create-review-context@1",
      blockedBy: [expect.stringMatching(/^passing-review-required@2:/)],
    }));
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "passing-reviews-for@1",
      { subject: foundation.requirement.datum.revision_id },
    ).result).toEqual([]);
    expect(obligation(
      processPackage,
      records,
      "review-context-required",
      foundation.requirement.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: null,
      eventualResolver: "create-review-context@1",
      explanation: expect.stringMatching(/passing independent Review.*current PSP/i),
    }));

    const [productContext, productReview] = reviewFor(
      revisedProduct,
      "REV-1030000023",
      "pass",
      { contextId: "BSL-1030000023" },
    );
    const afterProductReview = [...records, productContext, productReview];
    expect(obligation(
      processPackage,
      afterProductReview,
      "stakeholder-requirements-required",
      revisedProduct.datum.revision_id,
    )?.satisfied).toBe(true);
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(afterProductReview),
      "selector",
      "passing-reviews-for@1",
      { subject: foundation.requirement.datum.revision_id },
    ).result).toEqual([]);
    expect(obligation(
      processPackage,
      afterProductReview,
      "passing-review-required",
      foundation.requirement.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
  });

  it("excludes unrelated Decisions from corrected foundation Review Context support", () => {
    const original = record("PSP", "PSP-1030000021", {
      title: "Original bounded product",
      rationale: "Preserve the exact correction comparison.",
      problem: "One product ambiguity remains.",
      users: ["operator"],
      goals: ["resolve one ambiguity"],
      non_goals: ["unrelated behavior"],
      success_measures: ["one exact outcome is reviewable"],
    });
    const [, failed] = reviewFor(original, "REV-1030000021", "fail", {
      correctionAuthority: "stakeholder",
    });
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: "Corrected bounded product",
    }, {
      revision: 2,
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "corrects-review", target: failed.datum.revision_id }],
    });
    const decision = record("DEC", "DEC-1030000021", {
      title: "Exact correction authority",
      rationale: "The stakeholder selected the bounded correction.",
      kind: "scope",
      decision: "Bound the correction.",
      alternatives: ["defer it", "retain broader behavior"],
      effective_scope: corrected.datum.revision_id,
      scope_correction: {
        disposition: "bound",
        options: {
          bounded: "Correct one ambiguity.",
          defer_or_remove: "Remove the unsupported behavior.",
          retain: "Retain broader behavior with explicit need.",
        },
        necessity: "The bounded behavior alone satisfies the product goal.",
      },
    }, {
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const unrelated = record("DEC", "DEC-1030000022", {
      title: "Unrelated scope Decision",
      rationale: "Exercise exact causal exclusion.",
      kind: "scope",
      decision: "Decide unrelated scope.",
      alternatives: ["Leave unrelated scope open"],
      effective_scope: corrected.datum.revision_id,
    }, {
      scenario: "record-consequential-decision@1",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const selectedResult = evaluateProcessDefinition(
      processPackage,
      snapshot([original, failed, corrected, decision, unrelated]),
      "selector",
      "review-context-members-for@1",
      { subject: corrected.datum.revision_id },
    ).result;
    expect(Array.isArray(selectedResult)).toBe(true);
    if (!Array.isArray(selectedResult)) return;
    const selected = selectedResult.map(
      (item: { identity: { revision_id: string } }) => item.identity.revision_id,
    );
    expect(selected).toEqual(expect.arrayContaining([
      original.datum.revision_id,
      failed.datum.revision_id,
      decision.datum.revision_id,
    ]));
    expect(selected).not.toContain(unrelated.datum.revision_id);
  });

  it("carries correction authority into candidate Review and blocks gate readiness when that authority lacks a passing Review", () => {
    const foundation = phase0Foundation();
    const original = foundation.product;
    const [originalContext, failedCorrectionReview] = reviewFor(
      original,
      "REV-1030000030",
      "fail",
      { correctionAuthority: "stakeholder" },
    );
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: "Retained bounded product scope",
    }, {
      revision: 2,
      scenario: "escalate-foundation-review-correction@3",
      links: [{
        type: "corrects-review",
        target: failedCorrectionReview.datum.revision_id,
      }],
    });
    const authority = record("DEC", "DEC-1030000030", {
      title: "Retain the bounded product scope",
      rationale: "The stakeholder accepts the exact retained behavior.",
      kind: "scope",
      decision: "Retain the bounded behavior.",
      alternatives: ["Bound it further", "Defer or remove it"],
      effective_scope: corrected.datum.revision_id,
      scope_correction: {
        disposition: "retain",
        options: {
          bounded: "Bound the behavior further.",
          defer_or_remove: "Remove it until exact need is established.",
          retain: "Retain the exact behavior with stakeholder authority.",
        },
        necessity: "The stakeholder requires this exact bounded behavior.",
      },
    }, {
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const unrelatedAuthority = record("DEC", "DEC-1030000039", {
      title: "Unrelated scope Decision",
      rationale: "This Decision must not enter candidate correction support.",
      kind: "scope",
      decision: "Change unrelated scope.",
      alternatives: ["Leave unrelated scope unchanged"],
      effective_scope: corrected.datum.revision_id,
    }, {
      scenario: "record-consequential-decision@1",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const correctedContext = record("BSL", "BSL-1030000031", {
      title: "Exact corrected PSP Review Context",
      kind: "review-context",
      role: "review-context",
      scope: corrected.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        corrected.datum.revision_id,
        original.datum.revision_id,
        failedCorrectionReview.datum.revision_id,
        authority.datum.revision_id,
      ].sort(),
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const correctedReview = record("REV", "REV-1030000031", {
      title: "Passing corrected PSP Review",
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [],
      outcome: "pass",
    }, {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: corrected.datum.revision_id },
        { type: "contextualizes", target: correctedContext.datum.revision_id },
      ],
    });
    const members = [foundation.map, corrected, foundation.requirement];
    const candidate = record("BSL", "BSL-1030000030", {
      title: "Corrected intent candidate",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "product-intent",
      group: "DEFAULT",
      definition_members: members.map((member) => member.datum.revision_id),
      evidence: [
        foundation.reviews[1]!.datum.revision_id,
        correctedReview.datum.revision_id,
        foundation.reviews[5]!.datum.revision_id,
      ],
    }, { scenario: "create-phase-0-intent-candidate@1" });
    const [candidateContext, candidateReview] = passingSimplification(
      candidate,
      "REV-1030000032",
    );
    const [authorityContext, failedAuthorityReview] = reviewFor(
      authority,
      "REV-1030000033",
      "fail",
    );
    const records = [
      foundation.map,
      foundation.reviews[0]!,
      foundation.reviews[1]!,
      foundation.requirement,
      foundation.reviews[4]!,
      foundation.reviews[5]!,
      original,
      originalContext,
      failedCorrectionReview,
      corrected,
      authority,
      unrelatedAuthority,
      correctedContext,
      correctedReview,
      candidate,
      candidateContext,
      candidateReview,
      authorityContext,
      failedAuthorityReview,
    ];

    const candidateSupport = evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "review-context-members-for@1",
      { subject: candidate.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(candidateSupport.map((item) => item.identity.revision_id)).toEqual(
      expect.arrayContaining([
        original.datum.revision_id,
        failedCorrectionReview.datum.revision_id,
        authority.datum.revision_id,
        corrected.datum.revision_id,
      ]),
    );
    expect(candidateSupport.map((item) => item.identity.revision_id)).not
      .toContain(unrelatedAuthority.datum.revision_id);

    const change = record("CHG", "CHG-1030000030", {
      title: "Bounded change carrying corrected intent forward",
      rationale: "Prove change authority is additional to correction authority.",
      scope: "accepted product intent",
      planned_changes: ["carry the reviewed correction forward"],
      implementation_order: "intent then review",
      closure_criteria: ["the changed candidate preserves exact authority"],
    }, { scenario: "analyze-change-impact@2" });
    const changedCandidate = record("BSL", "BSL-1030000038", {
      ...candidate.datum.payload,
      title: "Changed candidate preserving foundation correction authority",
    }, {
      scenario: "create-stakeholder-change-candidate@1",
      links: [{ type: "changed-under", target: change.datum.revision_id }],
    });
    const changedCandidateSupport = evaluateProcessDefinition(
      processPackage,
      snapshot([...records, change, changedCandidate]),
      "selector",
      "review-context-members-for@1",
      { subject: changedCandidate.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(changedCandidateSupport.map((item) =>
      item.identity.revision_id
    )).toEqual(expect.arrayContaining([
      change.datum.revision_id,
      original.datum.revision_id,
      failedCorrectionReview.datum.revision_id,
      authority.datum.revision_id,
      corrected.datum.revision_id,
    ]));
    expect(changedCandidateSupport.map((item) =>
      item.identity.revision_id
    )).not.toContain(unrelatedAuthority.datum.revision_id);
    const changedCandidateAssignmentSupport = evaluateProcessDefinition(
      processPackage,
      snapshot([...records, change, changedCandidate]),
      "selector",
      "review-assignment-context-members-for@1",
      { subject: changedCandidate.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(changedCandidateAssignmentSupport).toEqual(changedCandidateSupport);

    const authoritySupport = evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "review-context-members-for@1",
      { subject: authority.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(authoritySupport.map((item) => item.identity.revision_id)).toEqual(
      expect.arrayContaining([
        failedCorrectionReview.datum.revision_id,
        corrected.datum.revision_id,
      ]),
    );

    expect(obligation(
      processPackage,
      records,
      "candidate-gate-signoff",
      candidate.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      blockedBy: [expect.stringMatching(/^passing-review-required@2:/)],
    }));
    expect(obligation(
      processPackage,
      records,
      "foundation-correction-decision-review-correction-required",
      authority.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver:
        "revise-foundation-correction-decision-after-review@1",
    }));

    const unframedPayload = structuredClone(authority.datum.payload);
    delete unframedPayload.scope_correction;
    const unframedReplacement = record("DEC", authority.datum.id, {
      ...unframedPayload,
      rationale: "This replacement improperly omits the correction disposition.",
    }, {
      revision: 2,
      scenario: "revise-foundation-correction-decision-after-review@1",
      links: [
        { type: "justifies", target: corrected.datum.revision_id },
        { type: "corrects-review", target: failedAuthorityReview.datum.revision_id },
      ],
    });
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot([...records, unframedReplacement]),
      "selector",
      "valid-foundation-correction-decision-replacements-for@1",
      { decision: authority.datum.revision_id },
    ).result).toEqual([]);

    const changedDispositionReplacement = record("DEC", authority.datum.id, {
      ...authority.datum.payload,
      rationale: "This replacement improperly changes retained authority to bounded authority.",
      scope_correction: {
        ...authority.datum.payload.scope_correction as Record<string, unknown>,
        disposition: "bound",
      },
    }, {
      revision: 2,
      scenario: "revise-foundation-correction-decision-after-review@1",
      links: [
        { type: "justifies", target: corrected.datum.revision_id },
        { type: "corrects-review", target: failedAuthorityReview.datum.revision_id },
      ],
    });
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot([...records, changedDispositionReplacement]),
      "selector",
      "valid-foundation-correction-decision-replacements-for@1",
      { decision: authority.datum.revision_id },
    ).result).toEqual([]);

    const replacementAuthority = record("DEC", authority.datum.id, {
      ...authority.datum.payload,
      rationale: "Renewed stakeholder authority addresses the exact failed Review.",
    }, {
      revision: 2,
      scenario: "revise-foundation-correction-decision-after-review@1",
      links: [
        { type: "justifies", target: corrected.datum.revision_id },
        { type: "corrects-review", target: failedAuthorityReview.datum.revision_id },
      ],
    });
    const replacementRecords = [...records, replacementAuthority];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(replacementRecords),
      "selector",
      "foundation-correction-decisions-for@1",
      { replacement: corrected.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: replacementAuthority.datum.revision_id,
      }) }),
    ]);
    const replacementSupport = evaluateProcessDefinition(
      processPackage,
      snapshot(replacementRecords),
      "selector",
      "review-context-members-for@1",
      { subject: replacementAuthority.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(replacementSupport.map((item) => item.identity.revision_id)).toEqual(
      expect.arrayContaining([
        authority.datum.revision_id,
        failedAuthorityReview.datum.revision_id,
        corrected.datum.revision_id,
      ]),
    );
    const [replacementContext, replacementReview] = reviewFor(
      replacementAuthority,
      "REV-1030000033",
      "pass",
      { contextId: "BSL-1030000034" },
    );
    replacementContext.datum.payload.definition_members = [
      replacementAuthority.datum.revision_id,
      ...replacementSupport.map((item) => item.identity.revision_id),
    ].sort();
    const reviewedReplacementRecords = [
      ...replacementRecords,
      replacementContext,
      replacementReview,
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(reviewedReplacementRecords),
      "selector",
      "candidate-correction-authorities-requiring-review@1",
      { candidate: candidate.datum.revision_id },
    ).result).toEqual([]);
  });

  it("blocks Phase 0 gate readiness until candidate-correction authority passes exact Review", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    candidate.datum.created_by.scenario =
      "revise-intent-candidate-after-review@3";
    const authority = record("DEC", "DEC-1030000061", {
      title: "Authorize the exact corrected candidate",
      rationale: "The stakeholder chose the bounded correction.",
      kind: "scope",
      decision: "Accept only the exact corrected candidate.",
      alternatives: ["Revise the candidate again"],
      effective_scope: candidate.datum.revision_id,
    }, {
      scenario: "revise-intent-candidate-after-review@3",
      links: [{ type: "justifies", target: candidate.datum.revision_id }],
    });
    const [candidateContext, candidateReview] = passingSimplification(
      candidate,
      "REV-1030000061",
    );
    candidateContext.datum.payload.definition_members = [
      candidate.datum.revision_id,
      ...foundation.members.map((member) => member.datum.revision_id),
      authority.datum.revision_id,
    ].sort();
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      authority,
      candidateContext,
      candidateReview,
    ];

    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "candidate-correction-authorities-requiring-review@1",
      { candidate: candidate.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: authority.datum.revision_id,
      }) }),
    ]);
    expect(obligation(
      processPackage,
      records,
      "candidate-gate-signoff",
      candidate.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      blockedBy: [expect.stringMatching(/^passing-review-required@2:/)],
    }));

    const support = evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "review-context-members-for@1",
      { subject: authority.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(support.map((item) => item.identity.revision_id)).toEqual(
      [
        candidate.datum.revision_id,
        ...foundation.members.map((member) => member.datum.revision_id),
        ...foundation.reviews.map((review) => review.datum.revision_id),
      ].sort(),
    );
    const [authorityContext, authorityReview] = reviewFor(
      authority,
      "REV-1030000062",
      "pass",
      { contextId: "BSL-1030000062" },
    );
    authorityContext.datum.payload.definition_members = [
      authority.datum.revision_id,
      ...support.map((item) => item.identity.revision_id),
    ].sort();
    const reviewedRecords = [...records, authorityContext, authorityReview];

    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(reviewedRecords),
      "selector",
      "candidate-correction-authorities-requiring-review@1",
      { candidate: candidate.datum.revision_id },
    ).result).toEqual([]);
    expect(obligation(
      processPackage,
      reviewedRecords,
      "candidate-gate-signoff",
      candidate.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@3",
    }));
  });

  it("rejects no-op candidate authority replacement and keeps a substantive same-lineage correction reviewable", async () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    candidate.datum.created_by.scenario =
      "revise-intent-candidate-after-review@3";
    const authority = record("DEC", "DEC-1030000063", {
      title: "Authorize the exact corrected candidate",
      rationale: "The stakeholder chose the bounded correction.",
      kind: "scope",
      decision: "Accept only the exact corrected candidate.",
      alternatives: ["Revise the candidate again"],
      effective_scope: candidate.datum.revision_id,
    }, {
      scenario: "revise-intent-candidate-after-review@3",
      links: [{ type: "justifies", target: candidate.datum.revision_id }],
    });
    const baseRecords = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      authority,
    ];
    const support = evaluateProcessDefinition(
      processPackage,
      snapshot(baseRecords),
      "selector",
      "review-context-members-for@1",
      { subject: authority.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    const [authorityContext, failedAuthorityReview] = reviewFor(
      authority,
      "REV-1030000063",
      "fail",
      {
        contextId: "BSL-1030000063",
        correctionAuthority: "stakeholder",
      },
    );
    authorityContext.datum.payload.definition_members = [
      authority.datum.revision_id,
      ...support.map((item) => item.identity.revision_id),
    ].sort();
    const failedRecords = [
      ...baseRecords,
      authorityContext,
      failedAuthorityReview,
    ];
    const correction = obligation(
      processPackage,
      failedRecords,
      "candidate-correction-decision-review-correction-required",
      authority.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver:
        "revise-candidate-correction-decision-after-review@1",
    }));
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(failedRecords),
      "revise-candidate-correction-decision-after-review@1",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);

    const replacementOptions = {
      revision: 2,
      scenario: "revise-candidate-correction-decision-after-review@1",
      links: [
        { type: "justifies", target: candidate.datum.revision_id },
        {
          type: "corrects-review",
          target: failedAuthorityReview.datum.revision_id,
        },
      ],
    };
    const noOp = record("DEC", authority.datum.id, {
      ...authority.datum.payload,
      title: "Retitled but unchanged candidate authority",
    }, replacementOptions);
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot([...failedRecords, noOp]),
      "selector",
      "valid-candidate-correction-decision-replacements-for@1",
      { decision: authority.datum.revision_id },
    ).result).toEqual([]);

    const replacement = record("DEC", authority.datum.id, {
      ...authority.datum.payload,
      rationale:
        "Renewed stakeholder authority addresses the exact failed Review.",
    }, replacementOptions);
    const replacementRecords = [...failedRecords, replacement];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(replacementRecords),
      "selector",
      "valid-candidate-correction-decision-replacements-for@1",
      { decision: authority.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: replacement.datum.revision_id,
      }) }),
    ]);

    const replacementSupport = evaluateProcessDefinition(
      processPackage,
      snapshot(replacementRecords),
      "selector",
      "review-context-members-for@1",
      { subject: replacement.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(replacementSupport.map((item) => item.identity.revision_id)).toEqual(
      [
        authority.datum.revision_id,
        failedAuthorityReview.datum.revision_id,
        candidate.datum.revision_id,
        ...foundation.members.map((member) => member.datum.revision_id),
        ...foundation.reviews.map((review) => review.datum.revision_id),
      ].sort(),
    );
    const [replacementContext, replacementReview] = reviewFor(
      replacement,
      "REV-1030000064",
      "pass",
      { contextId: "BSL-1030000064" },
    );
    replacementContext.datum.payload.definition_members = [
      replacement.datum.revision_id,
      ...replacementSupport.map((item) => item.identity.revision_id),
    ].sort();
    const reviewedReplacementRecords = [
      ...replacementRecords,
      replacementContext,
      replacementReview,
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(reviewedReplacementRecords),
      "selector",
      "candidate-correction-decisions-for@1",
      { replacement: candidate.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: replacement.datum.revision_id,
      }) }),
    ]);
    expect(obligation(
      processPackage,
      reviewedReplacementRecords,
      "candidate-correction-decision-review-correction-required",
      authority.datum.revision_id,
    )).toBeUndefined();
  });

  it("requires an exact reactivation condition only for defer-or-remove scope correction", () => {
    const resolved = resolveType(processPackage, "DEC");
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    formatsPlugin.default(ajv);
    const validate = ajv.compile(resolved.type.payloadSchema);
    const payload = (disposition: "bound" | "defer-or-remove" | "retain") => ({
      title: `Structured ${disposition} correction`,
      rationale: "Exercise the exact structured scope contract.",
      kind: "scope",
      decision: `Select ${disposition}.`,
      alternatives: ["Select another exact disposition"],
      effective_scope: "PSP-1030000024-r00002",
      scope_correction: {
        disposition,
        options: {
          bounded: "Correct only the exact ambiguity.",
          defer_or_remove: "Remove unsupported behavior until needed.",
          retain: "Retain broader behavior only with explicit need.",
        },
        necessity: "The selected option is the minimum authorized outcome.",
      },
    });
    expect(validate(payload("bound"))).toBe(true);
    expect(validate(payload("retain"))).toBe(true);
    expect(validate(payload("defer-or-remove"))).toBe(false);
    expect(validate({
      ...payload("defer-or-remove"),
      scope_correction: {
        ...payload("defer-or-remove").scope_correction,
        reactivation_condition:
          "Reconsider only when an accepted stakeholder outcome requires the deferred behavior.",
      },
    })).toBe(true);
  });

  it.each([
    {
      suffix: "26",
      disposition: "defer-or-remove" as const,
      replacementBody:
        "Remove the optional behavior until the recorded stakeholder condition becomes true.\n",
      reactivationCondition:
        "Reconsider only when an accepted stakeholder outcome requires the deferred behavior.",
    },
  ])("allows reviewed $disposition correction authority to proceed to STK work", ({
    suffix,
    disposition,
    replacementBody,
    reactivationCondition,
  }) => {
    const original = record("PSP", `PSP-10300000${suffix}`, {
      title: "Product requiring exact correction authority",
      rationale: "Exercise a non-bounded stakeholder disposition.",
      problem: "One optional behavior has unsettled scope.",
      users: ["operator"],
      goals: ["publish only authorized behavior"],
      non_goals: ["infer stakeholder authority"],
      success_measures: ["the exact disposition passes independent Review"],
    });
    const [failedContext, failed] = reviewFor(
      original,
      `REV-10300000${suffix}`,
      "fail",
      { correctionAuthority: "stakeholder" },
    );
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: `${disposition} corrected product`,
    }, {
      revision: 2,
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "corrects-review", target: failed.datum.revision_id }],
    });
    corrected.datum.body = replacementBody;
    const decision = record("DEC", `DEC-10300000${suffix}`, {
      title: `${disposition} correction authority`,
      rationale: "The stakeholder compared all exact correction outcomes.",
      kind: "scope",
      decision: `Select ${disposition} for the exact corrected PSP.`,
      alternatives: ["Bound the behavior", "Select the other exact disposition"],
      effective_scope: corrected.datum.revision_id,
      scope_correction: {
        disposition,
        options: {
          bounded: "Correct only the exact ambiguity.",
          defer_or_remove: "Remove unsupported behavior until needed.",
          retain: "Retain broader behavior only with explicit need.",
        },
        necessity:
          "The selected outcome is the minimum stakeholder-authorized behavior.",
        ...(reactivationCondition
          ? { reactivation_condition: reactivationCondition }
          : {}),
      },
    }, {
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const comparativeContext = record("BSL", `BSL-10300000${suffix}`, {
      title: `Comparative Review Context for ${corrected.datum.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: corrected.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        original.datum.revision_id,
        failed.datum.revision_id,
        corrected.datum.revision_id,
        decision.datum.revision_id,
      ].sort(),
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const correctedReview = record("REV", `REV-20300000${suffix}`, {
      title: `Passing comparative Review of ${corrected.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [],
      outcome: "pass",
    }, {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: corrected.datum.revision_id },
        { type: "contextualizes", target: comparativeContext.datum.revision_id },
      ],
    });
    const [decisionContext, decisionReview] = reviewFor(
      decision,
      `REV-30300000${suffix}`,
      "pass",
      { contextId: `BSL-20300000${suffix}` },
    );
    const records = [
      original,
      failedContext,
      failed,
      corrected,
      decision,
      comparativeContext,
      correctedReview,
      decisionContext,
      decisionReview,
    ];
    expect(obligation(
      processPackage,
      records,
      "stakeholder-requirements-required",
      corrected.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "draft-stakeholder-requirements@2",
    }));
  });

  it("keeps an ordinary bounded autonomous clarification eligible for normal Review and STK fan-out", () => {
    const original = record("PSP", "PSP-1030000027", {
      title: "Ordinary bounded ambiguous product",
      rationale: "One local observable ambiguity needs correction.",
      problem: "Success and failure output overlap.",
      users: ["operator"],
      goals: ["clarify the one overlapping outcome"],
      non_goals: ["numeric limits", "machine representation", "rendering machinery"],
      success_measures: ["each outcome is unambiguous"],
    });
    const [failedContext, failed] = reviewFor(
      original,
      "REV-1030000027",
      "fail",
    );
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: "Locally clarified bounded product",
    }, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [{ type: "corrects-review", target: failed.datum.revision_id }],
    });
    const comparativeContext = record("BSL", "BSL-1030000027", {
      title: `Comparative Review Context for ${corrected.datum.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: corrected.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        original.datum.revision_id,
        failed.datum.revision_id,
        corrected.datum.revision_id,
      ].sort(),
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const correctedReview = record("REV", "REV-2030000027", {
      title: `Passing bounded Review of ${corrected.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [],
      outcome: "pass",
    }, {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: corrected.datum.revision_id },
        { type: "contextualizes", target: comparativeContext.datum.revision_id },
      ],
    });
    expect(obligation(
      processPackage,
      [
        original,
        failedContext,
        failed,
        corrected,
        comparativeContext,
        correctedReview,
      ],
      "stakeholder-requirements-required",
      corrected.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "draft-stakeholder-requirements@2",
    }));
  });

  it("returns a passing candidate-centered simplification Review to attended Phase 0 gate sign-off", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    const simplification = passingSimplification(candidate);
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      ...simplification,
    ];
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "valid-product-simplification-reviews@1",
      { review: simplification[1].datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: candidate.datum.revision_id,
      }) }),
    ]);
    expect(evaluation.obligations.some((item) =>
      [
        "foundation-review-correction-required",
        "intent-candidate-review-correction-required",
      ].includes(item.obligation)
    )).toBe(false);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@3",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    for (const member of foundation.members) {
      expect(evaluation.artifacts[member.datum.revision_id]?.states.validity).toBe("valid");
    }
  });


  it("satisfies an empirical QST obligation with a same-lineage answer and no Decision", () => {
    const scenario = processPackage.scenarios["resolve-question"]!;
    expect(scenario.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "decision",
        types: ["DEC"],
        cardinality: "zero-or-one",
      }),
      expect.objectContaining({
        name: "updated_question",
        types: ["QST"],
        cardinality: "one",
      }),
    ]));
    expect(scenario.authority_evidence).toEqual({
      output: "decision",
      type: "DEC",
    });
    expect((scenario.completion as { source: string }).source).toContain(
      '(question.payload.kind == "empirical"\n  && updated_question.payload.state == "answered")\n  || decision != null',
    );
    expect(scenario.resolves).toEqual(["open-question-resolution"]);

    const source = record("QST", "QST-1030000099", {
      title: "Empirical package answer",
      kind: "empirical",
      question: "Does the exact evidence establish the bounded result?",
      state: "open",
      blocking_impact: "The bounded result remains unknown.",
      evidence_available: true,
    }, { scenario: "freeze-source-boundary@1" });
    const boundary = record("BSL", "BSL-1030000099", {
      title: "Empirical answer source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: source.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [source.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const answered = record("QST", source.datum.id, {
      ...source.datum.payload,
      state: "answered",
    }, { revision: 2, scenario: "resolve-question@2" });
    const completed = evaluateLifecycle(
      processPackage,
      snapshot([source, boundary, answered]),
    );
    expect(completed.obligations.some((item) =>
      item.obligation === "open-question-resolution" && !item.satisfied
    )).toBe(false);
    expect(completed.looseEnds.some((item) =>
      item.subject === source.datum.revision_id
    )).toBe(false);
    expect([source, boundary, answered].some((item) =>
      item.datum.type === "DEC"
    )).toBe(false);
  });

  it("rejects a Question Decision that also resolves the historical QST Revision", async () => {
    const question = record("QST", "QST-1030000098", {
      title: "Available empirical answer",
      kind: "empirical",
      question: "Does the bounded evidence support the current answer?",
      state: "open",
      blocking_impact: "The bounded result remains unknown.",
      evidence_available: true,
    });
    const boundary = record("BSL", "BSL-1030000098", {
      title: "Empirical answer source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: question.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [question.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const records = [question, boundary];
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    const resolution = evaluation.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === question.datum.revision_id
    );
    expect(resolution).toEqual(expect.objectContaining({
      dispatchable: true,
      actionableResolver: "resolve-question@2",
    }));
    if (!resolution) return;
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "resolve-question@2",
      resolution.id,
      [],
      evaluation,
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const proposal: ScenarioProposal = {
      outputs: [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Bounded empirical answer",
            rationale: "The supplied evidence supports the current answer.",
            kind: "scope",
            decision: "The bounded evidence supports the current answer.",
            alternatives: ["Defer the answer"],
            effective_scope: "$proposal.answered.revision_id",
          },
          links: [
            { type: "resolves", target: question.datum.revision_id },
            { type: "resolves", target: "$proposal.answered.revision_id" },
          ],
          body: "The current answered Question carries the exact evidence.\n",
        },
      }, {
        localId: "answered",
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: question.datum.id,
          type: "QST",
          payload: { ...question.datum.payload, state: "answered" },
          links: [],
          body: "The bounded empirical Question is answered.\n",
        },
      }],
      completionEvidence: { summary: "Resolved the bounded empirical Question." },
    };
    let publicationCalls = 0;
    const submit = (candidate: ScenarioProposal, digestCharacter: string) =>
      submitPreparedResolverScenario(
        "/unused",
        processPackage,
        {
          reference: "mdlm-bootstrap@0.80.0",
          digest: "sha256:test",
          language: "mdlm-expression@1",
        },
        {
        scenarioReference: "resolve-question@2",
        obligationInstance: resolution.id,
        proposal: candidate,
        assignment: "33000000-0000-4000-8000-000000000330",
        responseDigest: `sha256:${digestCharacter.repeat(64)}`,
        suppliedAuthorities: [],
        suppliedDelegations: [],
        loadedSkillRefs: prepared.value.prompt.skills.map((skill) => skill.reference),
        },
        {
          dryRun: prepared.value,
          evaluation,
          scenario: processPackage.scenarios["resolve-question"]!,
          snapshot: snapshot(records),
          publishMutation: async (_root, _package, _expected, data) => {
            publicationCalls += 1;
            return {
              ok: true as const,
              value: {
                executionPath: ".lifecycle/data/.transactions/test/execution.json",
                created: data.map((datum) => ({
                  id: datum.id,
                  revisionId: datum.revision_id,
                  type: datum.type,
                  path: `.lifecycle/data/${datum.type}/${datum.id}/r00001.md`,
                })),
              },
              diagnostics: [],
            };
          },
        },
      );
    const submitted = await submit(proposal, "3");
    expect(submitted).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "scenario-completion-failed" })],
    });
    expect(publicationCalls).toBe(0);

    const currentOnly = structuredClone(proposal);
    currentOnly.outputs[0]!.lifecycleDatum.links = [
      { type: "resolves", target: "$proposal.answered.revision_id" },
    ];
    const accepted = await submit(currentOnly, "4");
    expect(accepted.ok, accepted.ok ? "" : JSON.stringify(accepted.diagnostics)).toBe(true);
    expect(publicationCalls).toBe(1);
  });

  it("resolves a source-bounded prototype Question only with the exact ART bounded DEC and same-lineage answer", async () => {
    const question = record("QST", "QST-1030000001", {
      title: "Bounded prototype question",
      kind: "empirical",
      question: "Does the exact prototype support the declared outcome?",
      state: "open",
      blocking_impact: "The bounded outcome remains unknown.",
      resolution_evidence: "prototype",
      prototype_evidence: {
        repository_ref: `git:${"a".repeat(40)}`,
        supported_behavior: ["declared outcome"],
        unsupported_behavior: ["all other outcomes"],
        finding_if_supported: "supported",
        finding_if_not_supported: "not-supported",
      },
    }, { scenario: "freeze-source-boundary@1" });
    const boundary = record("BSL", "BSL-1030000007", {
      title: "Exact prototype Question source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: question.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [question.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const records = [question, boundary];
    const route = obligation(
      processPackage,
      records,
      "prototype-question-resolution",
      question.datum.revision_id,
    );
    expect(route).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "resolve-question-with-prototype@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "autonomous",
          authority: "evidence-authority",
        }),
      })],
    }));
    expect(route).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "resolve-question-with-prototype@2",
      route!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);

    const prototype = record("ART", "ART-1030000001", {
      title: "Exact bounded prototype",
      kind: "prototype",
      repository_ref: `git:${"a".repeat(40)}`,
      supported_behavior: ["declared outcome"],
      unsupported_behavior: ["all other outcomes"],
    }, {
      scenario: "resolve-question-with-prototype@2",
      links: [{ type: "derived-from", target: question.datum.revision_id }],
    });
    const answered = record("QST", question.datum.id, {
      ...question.datum.payload,
      state: "answered",
    }, { revision: 2, scenario: "resolve-question-with-prototype@2" });
    const finding = record("DEC", "DEC-1030000002", {
      title: "Bounded prototype finding",
      rationale: "The exact repository evidence supports one predeclared finding.",
      kind: "decision",
      decision: "supported",
      alternatives: ["not-supported"],
      effective_scope: `git:${"a".repeat(40)}`,
    }, {
      scenario: "resolve-question-with-prototype@2",
      links: [
        { type: "resolves", target: question.datum.revision_id },
        { type: "justifies", target: prototype.datum.revision_id },
      ],
    });
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    formatsPlugin.default(ajv);
    for (const output of [prototype, finding, answered]) {
      const resolved = resolveType(processPackage, output.datum.type);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(ajv.compile(resolved.type.payloadSchema)(output.datum.payload)).toBe(true);
      }
    }
    const completed = evaluateLifecycle(
      processPackage,
      snapshot([...records, prototype, finding, answered]),
    );
    expect(completed.obligations.some((item) =>
      item.obligation === "prototype-question-resolution" && !item.satisfied
    )).toBe(false);
    expect(completed.looseEnds.some((item) =>
      item.subject === question.datum.revision_id
    )).toBe(false);
  });

  it("keeps a source-bounded unavailable-evidence Question unchanged and attended-delegable for a deliberate fresh allocation", () => {
    const question = record("QST", "QST-1030000002", {
      title: "Unavailable empirical evidence",
      kind: "empirical",
      question: "Can the evidence provider establish the exact outcome?",
      state: "open",
      blocking_impact: "The evidence is currently unavailable.",
      evidence_available: false,
    }, { scenario: "resolve-question@2" });
    const boundary = record("BSL", "BSL-1030000008", {
      title: "Unavailable evidence source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: question.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [question.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const records = [question, boundary];
    const before = structuredClone(records);
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === question.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "resolve-question@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "evidence-provider",
          delegationAllowed: true,
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(records).toEqual(before);
    expect(records.filter((item) => item.datum.type !== "QST" && item.datum.type !== "BSL"))
      .toEqual([]);
  });


  it("keeps a preferential answer unsatisfied until its exact scoped Decision passes fresh Review", () => {
    const source = record("QST", "QST-1030000003", {
      title: "Preferential export question",
      kind: "preferential",
      question: "Which exact export should remain?",
      state: "open",
      blocking_impact: "The product scope depends on the answer.",
    }, { scenario: "resolve-question@2" });
    const boundary = record("BSL", "BSL-1030000009", {
      title: "Preferential source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: source.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [source.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const answered = record("QST", source.datum.id, {
      ...source.datum.payload,
      state: "answered",
    }, { revision: 2, scenario: "resolve-question@2" });
    const decision = record("DEC", "DEC-1030000003", {
      title: "Exact preferential scope Decision",
      rationale: "The stakeholder selected the smallest sufficient export.",
      kind: "scope",
      decision: "Retain CSV only.",
      alternatives: ["Retain every export"],
      effective_scope: answered.datum.revision_id,
    }, {
      scenario: "resolve-question@2",
      links: [
        { type: "resolves", target: source.datum.revision_id },
        { type: "resolves", target: answered.datum.revision_id },
      ],
    });
    const beforeReview = [source, boundary, answered, decision];
    expect(obligation(
      processPackage,
      beforeReview,
      "open-question-resolution",
      answered.datum.revision_id,
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
    const selectedBefore = evaluateProcessDefinition(
      processPackage,
      snapshot(beforeReview),
      "selector",
      "applicable-question-answers-for@1",
      { question: answered.datum.revision_id },
    );
    expect(selectedBefore.result).toEqual([]);

    const [context, review] = reviewFor(decision, "REV-1030000017", "pass", {
      contextId: "BSL-1030000010",
    });
    context.datum.payload.definition_members = [
      decision.datum.revision_id,
      answered.datum.revision_id,
    ].sort();
    const afterReview = [...beforeReview, context, review];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(afterReview),
      "selector",
      "applicable-question-answers-for@1",
      { question: answered.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: decision.datum.revision_id,
      }) }),
    ]);
    expect(evaluateLifecycle(processPackage, snapshot(afterReview)).obligations.some(
      (item) => item.obligation === "open-question-resolution" && !item.satisfied,
    )).toBe(false);
  });

  it("routes a failed change-disposition Review to immediate attended same-lineage correction", async () => {
    const problem = record("PRB", "PRB-1030000001", {
      title: "Exact change problem",
      rationale: "Preserve the observed change trigger.",
      observation: "The accepted requirement needs a bounded change.",
      expected: "The exact accepted behavior remains coherent.",
      severity: "major",
    });
    const change = record("CHG", "CHG-1030000001", {
      title: "Exact bounded change",
      rationale: "Correct one accepted requirement.",
      scope: "one accepted requirement",
      planned_changes: ["replace the exact requirement"],
      implementation_order: "requirements -> context -> reviews -> baselines -> verification",
      closure_criteria: ["fresh exact evidence passes"],
    }, {
      scenario: "analyze-change-impact@2",
      links: [{ type: "derived-from", target: problem.datum.revision_id }],
    });
    const decision = record("DEC", "DEC-1030000004", {
      title: "Failed change disposition",
      rationale: "Exercise renewed attended judgment.",
      kind: "change-approval",
      change_disposition: "reject",
      decision: "Reject the current change plan.",
      alternatives: ["Approve the current plan"],
      effective_scope: change.datum.revision_id,
    }, {
      scenario: "approve-change-request@3",
      links: [{ type: "justifies", target: change.datum.revision_id }],
    });
    const [context, failed] = reviewFor(decision, "REV-1030000018", "fail", {
      contextId: "BSL-1030000011",
    });
    const records = [problem, change, decision, context, failed];
    const correction = obligation(
      processPackage,
      records,
      "change-disposition-review-correction-required",
      decision.datum.revision_id,
      "phase-7-change-control",
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-change-disposition-after-review@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records, "phase-7-change-control"),
      "revise-change-disposition-after-review@1",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const inputs = prepared.value.invocations[0]!.inputs;
    expect(inputs.find((input) => input.name === "decision")?.values[0]?.identity.revision_id)
      .toBe(decision.datum.revision_id);
    expect(inputs.find((input) => input.name === "change")?.values[0]?.identity.revision_id)
      .toBe(change.datum.revision_id);
    expect(inputs.find((input) => input.name === "target")?.values[0]?.identity.revision_id)
      .toBe(change.datum.revision_id);
    expect(inputs.find((input) => input.name === "failed_reviews")?.values[0]?.identity.revision_id)
      .toBe(failed.datum.revision_id);
  });

  it("keeps corrected gate Decision Review Context exact to its lineage, failure, candidate, and current Review", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    const [candidateContext, candidateReview] = passingSimplification(candidate);
    const gate = record("DEC", "DEC-1030000065", {
      title: "Approve the exact Phase 0 candidate",
      rationale: "The candidate passed simplification Review.",
      kind: "gate-signoff",
      decision: "Approve the candidate.",
      alternatives: ["Reject the candidate"],
      effective_scope: candidate.datum.revision_id,
      gate_outcome: "approve",
    }, {
      scenario: "record-gate-signoff@3",
      links: [{ type: "justifies", target: candidate.datum.revision_id }],
    });
    const [gateContext, failedGateReview] = reviewFor(
      gate,
      "REV-1030000065",
      "fail",
      {
        contextId: "BSL-1030000065",
        correctionAuthority: "stakeholder",
      },
    );
    gateContext.datum.payload.definition_members = [
      gate.datum.revision_id,
      candidate.datum.revision_id,
      candidateReview.datum.revision_id,
    ].sort();
    const correctedGate = record("DEC", gate.datum.id, {
      ...gate.datum.payload,
      rationale: "The corrected Decision addresses the exact failed Review.",
    }, {
      revision: 2,
      scenario: "revise-gate-signoff-after-review@2",
      links: [
        { type: "justifies", target: candidate.datum.revision_id },
        {
          type: "corrects-review",
          target: failedGateReview.datum.revision_id,
        },
      ],
    });
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      candidateContext,
      candidateReview,
      gate,
      gateContext,
      failedGateReview,
      correctedGate,
    ];

    const selected = evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "review-context-members-for@1",
      { subject: correctedGate.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(selected.map((item) => item.identity.revision_id)).toEqual([
      gate.datum.revision_id,
      failedGateReview.datum.revision_id,
      candidate.datum.revision_id,
      candidateReview.datum.revision_id,
    ].sort());
  });

  it("keeps an insufficiently contextualized Phase 0 gate rejection blocked for fresh Review", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    const simplification = passingSimplification(candidate);
    const rejection = gateRejection(candidate, foundation.requirement);
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      ...simplification,
      ...rejection,
    ];
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluation.phase?.gate.evaluations[0]).toEqual(expect.objectContaining({
      complete: false,
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === rejection[0]!.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "create-review-context@1",
    }));
    expect(evaluation.terminalOutcome?.outcome).not.toBe("process-dead-end");
  });

});
