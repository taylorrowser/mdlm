import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.74.0#sha256:test";
let processPackage: ProcessPackage;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    revision?: number;
    links?: { type: string; target: string }[];
    scenario: string;
  },
): LifecycleRecord {
  const result = lifecycleRecord(type, id, payload, {
    ...(options.revision === undefined ? {} : { revision: options.revision }),
    ...(options.links === undefined ? {} : { links: options.links }),
    createdBy: {
      process_ref: processRef,
      scenario: options.scenario,
    },
    storage: { editable: false, frozen: true },
  });
  result.integrity.scenario_execution_valid = true;
  return result;
}

function routeFixture() {
  const source = record("QST", "QST-7K3M9Q2D8F", {
    title: "Which result should this work produce?",
    kind: "preferential",
    intent_scope: "product",
    state: "open",
  }, { scenario: "establish-initial-wayfinding-map@2" });
  const boundary = record("BSL", "BSL-7K3M9Q2D8E", {
    title: "Exact initial product-intent source boundary",
    kind: "source-boundary",
    role: "source-boundary",
    scope: source.datum.revision_id,
    group: "SAME-LINEAGE",
    definition_members: [source.datum.revision_id],
    evidence: [],
  }, { scenario: "freeze-source-boundary@1" });
  const answered = record("QST", source.datum.id, {
    ...source.datum.payload,
    title: "A title with no product-intent naming convention",
    state: "answered",
    attended_answer: "Produce one reviewable deterministic result.",
  }, {
    revision: 2,
    scenario: "resolve-question@2",
  });
  const decision = record("DEC", "DEC-7K3M9Q2D8F", {
    title: "Choose the bounded result",
    rationale: "The stakeholder selected the minimum sufficient result.",
    kind: "scope",
    decision: "Produce one reviewable deterministic result.",
    alternatives: ["Produce no result"],
    effective_scope: answered.datum.revision_id,
  }, {
    links: [
      { type: "resolves", target: source.datum.revision_id },
      { type: "resolves", target: answered.datum.revision_id },
    ],
    scenario: "resolve-question@2",
  });
  const context = reviewContext(
    decision,
    source,
    boundary,
    answered,
    "BSL-7K3M9Q2D8F",
  );
  const review = passingReview(decision, context, "REV-7K3M9Q2D8F");
  return { source, boundary, answered, decision, context, review };
}

function reviewContext(
  decision: LifecycleRecord,
  source: LifecycleRecord,
  boundary: LifecycleRecord,
  answered: LifecycleRecord,
  id: string,
  revision = 1,
): LifecycleRecord {
  return record("BSL", id, {
    title: "Exact Question Decision Review Context",
    kind: "review-context",
    role: "review-context",
    scope: decision.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      decision.datum.revision_id,
      source.datum.revision_id,
      boundary.datum.revision_id,
      answered.datum.revision_id,
    ].sort(),
    evidence: [],
  }, {
    revision,
    scenario: "create-review-context@1",
  });
}

function passingReview(
  decision: LifecycleRecord,
  context: LifecycleRecord,
  id: string,
): LifecycleRecord {
  return record("REV", id, {
    title: "Passing Question Decision Review",
    review_kind: "contextual",
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    summary: "The exact Decision answers the exact Question under stakeholder authority.",
    findings: [],
    outcome: "pass",
  }, {
    links: [
      { type: "reviews", target: decision.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
    scenario: "review-datum-in-context@2",
  });
}

function selectedBy(
  records: LifecycleRecord[],
  selector: string,
  arguments_: Record<string, unknown> = {},
): string[] {
  const evaluation = evaluateProcessDefinition(
    processPackage,
    {
      processRef,
      phaseId: "phase-0-wayfinding",
      records,
      dependencyComparisons: [],
    },
    "selector",
    selector,
    arguments_,
  );
  return (evaluation.result as Array<{ identity: { revision_id: string } }>)
    .map((item) => item.identity.revision_id);
}

function selected(records: LifecycleRecord[]): string[] {
  const evaluation = evaluateProcessDefinition(
    processPackage,
    {
      processRef,
      phaseId: "phase-0-wayfinding",
      records,
      dependencyComparisons: [],
    },
    "selector",
    "applicable-initial-product-intent-decisions@1",
    {},
  );
  return (evaluation.result as Array<{ identity: { revision_id: string } }>)
    .map((item) => item.identity.revision_id);
}

describe("initial product-intent authority selectors", () => {
  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
  });

  it("includes the current exact Question indexed by a MAP in its Review Context", () => {
    const question = record("QST", "QST-2K7M9Q4D8F", {
      title: "Choose the product",
      kind: "preferential",
      intent_scope: "product",
      question: "What product should this repository build?",
      state: "open",
      blocking_impact: "PSP compilation waits for the stakeholder answer.",
    }, { scenario: "establish-initial-wayfinding-map@2" });
    const answered = record("QST", question.datum.id, {
      ...question.datum.payload,
      state: "answered",
      attended_answer: "Build one ASCII caret-count CLI.",
    }, {
      revision: 2,
      scenario: "resolve-question@2",
    });
    const map = record("MAP", "MAP-2K7M9Q4D8F", {
      title: "Initial product frontier",
      purpose: "Track the one unresolved product choice.",
      frontier: ["Product intent is preferential and blocks PSP compilation."],
    }, {
      links: [{ type: "indexes", target: question.datum.id }],
      scenario: "establish-initial-wayfinding-map@2",
    });

    expect(selectedBy(
      [map, question, answered],
      "review-context-members-for@1",
      { subject: map.datum.revision_id },
    )).toEqual([answered.datum.revision_id]);
  });

  it("keeps optional Question work hidden until initial product intent passes Review", () => {
    const fixture = routeFixture();
    const optional = record("QST", "QST-4J6NW2H8DV", {
      title: "Optional empirical clarification",
      kind: "empirical",
      question: "Is an optional implementation detail known?",
      state: "open",
      blocking_impact: "The optional detail can be resolved after product intent.",
      evidence_available: true,
    }, { scenario: "establish-initial-wayfinding-map@2" });
    const gatedSelectors = [
      "current-open-question-sources-ready-for-resolution@1",
      "general-open-questions-ready-for-resolution@1",
    ];

    for (const selector of gatedSelectors) {
      expect(selectedBy([fixture.source, optional], selector)).toEqual([
        fixture.source.datum.revision_id,
      ]);
      expect(selectedBy([...Object.values(fixture), optional], selector)).toEqual([
        optional.datum.revision_id,
      ]);
    }
  });

  it("keeps a causal product Question at its declared Phase 0 checkpoint", () => {
    const product = record("PSP", "PSP-5C8N2R7J4W", {
      title: "Checkpointed product",
      rationale: "Exercise exact attended timing.",
      problem: "One product detail remains preferential.",
      users: ["operator"],
      goals: ["retain checkpoint timing"],
      non_goals: ["immediate interruption"],
      success_measures: ["the Question appears at the Phase 0 gate"],
    }, { scenario: "compile-psp@3" });
    const question = record("QST", "QST-5C8N2R7J4W", {
      title: "Checkpointed product choice",
      kind: "preferential",
      intent_scope: "product",
      question: "Which bounded output choice should the candidate retain?",
      state: "open",
      blocking_impact: "The final candidate gate depends on this choice.",
      attention_checkpoint: "phase-0-gate",
      consolidation_group: "phase-0-stakeholder-questions",
    }, {
      links: [{ type: "blocks", target: product.datum.id }],
      scenario: "compile-psp@3",
    });
    const records = [product, question];

    expect(selectedBy(records, "open-blocking-questions@1")).toEqual([]);
    expect(selectedBy(records, "open-phase-0-gate-product-questions@1"))
      .toEqual([question.datum.revision_id]);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-0-wayfinding",
        records,
        dependencyComparisons: [],
      },
      "policy",
      "question-participation@1",
      {
        question: question.datum.revision_id,
        selected_phase: { id: "phase-0-wayfinding" },
      },
    ).result).toEqual(expect.objectContaining({
      authority_mode: "attended",
      attention_timing: "checkpoint",
      attention_checkpoint: "phase-0-gate",
    }));

    const answered = record("QST", question.datum.id, {
      ...question.datum.payload,
      state: "answered",
      attended_answer: "Retain one bounded output.",
    }, {
      revision: 2,
      links: question.datum.links,
      scenario: "resolve-question@2",
    });
    const answer = record("DEC", "DEC-5C8N2R7J4W", {
      title: "Choose the checkpointed product output",
      rationale: "The stakeholder supplied the exact bounded choice.",
      kind: "scope",
      decision: "Retain one bounded output.",
      alternatives: ["Retain two outputs"],
      effective_scope: answered.datum.revision_id,
    }, {
      links: [
        { type: "resolves", target: question.datum.revision_id },
        { type: "resolves", target: answered.datum.revision_id },
      ],
      scenario: "resolve-question@2",
    });
    const candidate = record("BSL", "BSL-5C8N2R7J4W", {
      title: "Candidate awaiting exact answer Review",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "phase-0-product-intent",
      group: "DEFAULT",
      definition_members: [product.datum.revision_id],
      evidence: [],
    }, { scenario: "create-phase-0-intent-candidate@1" });
    const awaitingReview = [product, question, answered, answer, candidate];

    expect(selectedBy(
      awaitingReview,
      "open-phase-0-gate-product-questions@1",
    )).toEqual([answered.datum.revision_id]);
    expect(selectedBy(
      awaitingReview,
      "gate-authorization-candidates@1",
    )).toEqual([]);
  });

  it("selects authority by exact product-scoped Question structure rather than title", () => {
    const fixture = routeFixture();
    expect(selected(Object.values(fixture))).toEqual([
      fixture.decision.datum.revision_id,
    ]);

    fixture.answered.datum.payload.intent_scope = undefined;
    expect(selected(Object.values(fixture))).toEqual([]);
  });

  it("rejects a Decision when its answered Question lineage is no longer current", () => {
    const fixture = routeFixture();
    const newerAnswer = record("QST", fixture.answered.datum.id, {
      ...fixture.answered.datum.payload,
      attended_answer: "A later corrected answer.",
    }, {
      revision: 3,
      scenario: "resolve-question@2",
    });

    expect(selected([...Object.values(fixture), newerAnswer])).toEqual([]);
  });

  it("excludes an intent candidate after reviewed product intent changes its foundation", () => {
    const fixture = routeFixture();
    const product = record("PSP", "PSP-6H4K8P2T9M", {
      title: "Bounded temperature converter",
      rationale: "Define one command-line conversion product.",
      problem: "Convert one supplied temperature.",
      users: ["operator"],
      goals: ["convert supported temperatures"],
      non_goals: ["general conversion framework"],
      success_measures: ["the command returns one deterministic result"],
    }, { scenario: "compile-psp@3" });
    const affected = record("STK", "STK-6H4K8P2T9M", {
      title: "Accepted conversion",
      rationale: "The operator needs one supported conversion.",
      statement: "The product shall convert one supported temperature.",
      verification_intent: "Observe one supported conversion.",
      stakeholder: "operator",
      priority: "must",
      system_context: "conversion",
    }, {
      links: [{ type: "derived-from", target: product.datum.id }],
      scenario: "draft-stakeholder-requirements@2",
    });
    const unaffected = record("STK", "STK-6H4K8P2T9N", {
      title: "Invalid invocation",
      rationale: "The operator needs explicit failure behavior.",
      statement: "The product shall reject an invalid invocation.",
      verification_intent: "Observe one invalid invocation.",
      stakeholder: "operator",
      priority: "must",
      system_context: "conversion",
    }, {
      links: [{ type: "derived-from", target: product.datum.id }],
      scenario: "draft-stakeholder-requirements@2",
    });
    const impact = [
      { type: "blocks", target: product.datum.id },
      { type: "blocks", target: affected.datum.id },
    ];
    fixture.source.datum.links = impact;
    fixture.answered.datum.links = impact;
    fixture.context.datum.payload.definition_members = [
      ...fixture.context.datum.payload.definition_members as string[],
      product.datum.revision_id,
      affected.datum.revision_id,
    ].sort();
    const candidate = record("BSL", "BSL-6H4K8P2T9M", {
      title: "Temperature intent candidate before checkpoint answers",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "product-intent",
      group: "DEFAULT",
      definition_members: [
        product.datum.revision_id,
        affected.datum.revision_id,
        unaffected.datum.revision_id,
      ],
      evidence: [],
    }, { scenario: "create-phase-0-intent-candidate@1" });
    const records = [
      product,
      affected,
      unaffected,
      candidate,
      ...Object.values(fixture),
    ];

    expect(selectedBy(
      records,
      "question-blocked-targets-for-decision@1",
      { decision: fixture.decision.datum.revision_id },
    ).sort()).toEqual([
      product.datum.revision_id,
      affected.datum.revision_id,
    ].sort());
    expect(selectedBy(
      records,
      "review-context-members-for@1",
      { subject: fixture.decision.datum.revision_id },
    )).toEqual(expect.arrayContaining([
      fixture.answered.datum.revision_id,
      product.datum.revision_id,
      affected.datum.revision_id,
    ]));
    expect(selectedBy(records, "gate-authorization-candidates@1")).toEqual([]);
    expect(selectedBy(records, "failed-phase-0-foundation-revisions@2").sort())
      .toEqual([
        product.datum.revision_id,
        affected.datum.revision_id,
      ].sort());
    for (const subject of [product, affected]) {
      expect(selectedBy(
        records,
        "applicable-product-answer-decisions-for-foundation-subject@1",
        { subject: subject.datum.revision_id },
      )).toEqual([fixture.decision.datum.revision_id]);
    }
    expect(selectedBy(
      records,
      "applicable-product-answer-decisions-for-foundation-subject@1",
      { subject: unaffected.datum.revision_id },
    )).toEqual([]);

    const lifecycle = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records,
      dependencyComparisons: [],
    });
    for (const subject of [product, affected]) {
      expect(lifecycle.obligations.find((item) =>
        item.obligation === "foundation-review-correction-required" &&
        item.subject === subject.datum.revision_id
      )).toEqual(expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "revise-foundation-after-review@5",
      }));
    }
    expect(lifecycle.obligations.find((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === unaffected.datum.revision_id
    )).toBeUndefined();
    expect(lifecycle.obligations.find((item) =>
      item.obligation === "intent-candidate-review-correction-required" &&
      item.subject === candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
    }));
  });

  it("stales a corrected foundation Revision for a later Question on the same stable lineage", () => {
    const product = record("PSP", "PSP-8D4K6M2Q9T", {
      title: "Corrected bounded product",
      rationale: "Exercise repeated stable-identity product choices.",
      problem: "One product choice was incorporated before another arrived.",
      users: ["operator"],
      goals: ["retain current answered intent"],
      non_goals: ["parallel authority kinds"],
      success_measures: ["each later answer stales the same lineage"],
    }, { scenario: "compile-psp@3" });
    const firstSource = record("QST", "QST-8D4K6M2Q9T", {
      title: "First product choice",
      kind: "preferential",
      intent_scope: "product",
      question: "Which first bounded choice applies?",
      state: "open",
    }, {
      links: [{ type: "blocks", target: product.datum.revision_id }],
      scenario: "compile-psp@3",
    });
    const firstBoundary = record("BSL", "BSL-8D4K6M2Q9T", {
      title: "First Question source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: firstSource.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [firstSource.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    const firstQuestion = record("QST", firstSource.datum.id, {
      ...firstSource.datum.payload,
      state: "answered",
      attended_answer: "Apply the first bounded choice.",
    }, {
      revision: 2,
      links: firstSource.datum.links,
      scenario: "resolve-question@2",
    });
    const firstDecision = record("DEC", "DEC-8D4K6M2Q9T", {
      title: "First product answer",
      rationale: "The first choice was attended.",
      kind: "scope",
      decision: "Apply the first bounded choice.",
      alternatives: ["Defer the first choice"],
      effective_scope: firstQuestion.datum.revision_id,
    }, {
      links: [
        { type: "resolves", target: firstSource.datum.revision_id },
        { type: "resolves", target: firstQuestion.datum.revision_id },
      ],
      scenario: "resolve-question@2",
    });
    const firstContext = reviewContext(
      firstDecision,
      firstSource,
      firstBoundary,
      firstQuestion,
      "BSL-8D4K6M2Q9W",
    );
    firstContext.datum.payload.definition_members = [
      ...firstContext.datum.payload.definition_members as string[],
      product.datum.revision_id,
    ].sort();
    const firstReview = passingReview(
      firstDecision,
      firstContext,
      "REV-8D4K6M2Q9T",
    );
    const correctedProduct = record("PSP", product.datum.id, {
      ...product.datum.payload,
      title: "Product after the first answer",
    }, {
      revision: 2,
      links: [{
        type: "incorporates-answer",
        target: firstDecision.datum.revision_id,
      }],
      scenario: "revise-foundation-after-review@5",
    });
    const secondSource = record("QST", "QST-8D4K6M2Q9U", {
      title: "Later product choice",
      kind: "preferential",
      intent_scope: "product",
      question: "Which later bounded choice applies?",
      state: "open",
    }, {
      links: [{ type: "blocks", target: product.datum.revision_id }],
      scenario: "draft-stakeholder-requirements@2",
    });
    const secondBoundary = record("BSL", "BSL-8D4K6M2Q9U", {
      title: "Later Question source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: secondSource.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [secondSource.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    const secondQuestion = record("QST", secondSource.datum.id, {
      ...secondSource.datum.payload,
      state: "answered",
      attended_answer: "Apply the later bounded choice.",
    }, {
      revision: 2,
      links: secondSource.datum.links,
      scenario: "resolve-question@2",
    });
    const secondDecision = record("DEC", "DEC-8D4K6M2Q9U", {
      title: "Later product answer",
      rationale: "The later choice was attended.",
      kind: "scope",
      decision: "Apply the later bounded choice.",
      alternatives: ["Keep only the first choice"],
      effective_scope: secondQuestion.datum.revision_id,
    }, {
      links: [
        { type: "resolves", target: secondSource.datum.revision_id },
        { type: "resolves", target: secondQuestion.datum.revision_id },
      ],
      scenario: "resolve-question@2",
    });
    const secondContext = reviewContext(
      secondDecision,
      secondSource,
      secondBoundary,
      secondQuestion,
      "BSL-8D4K6M2Q9V",
    );
    secondContext.datum.payload.definition_members = [
      ...secondContext.datum.payload.definition_members as string[],
      correctedProduct.datum.revision_id,
    ].sort();
    const secondReview = passingReview(
      secondDecision,
      secondContext,
      "REV-8D4K6M2Q9U",
    );
    const records = [
      product,
      firstSource,
      firstBoundary,
      firstQuestion,
      firstDecision,
      firstContext,
      firstReview,
      correctedProduct,
      secondSource,
      secondBoundary,
      secondQuestion,
      secondDecision,
      secondContext,
      secondReview,
    ];

    expect(selectedBy(
      records,
      "unincorporated-product-questions-for-foundation-subject@1",
      { subject: correctedProduct.datum.revision_id },
    )).toEqual([secondQuestion.datum.revision_id]);
    expect(selectedBy(
      records,
      "applicable-product-answer-decisions-for-foundation-subject@1",
      { subject: correctedProduct.datum.revision_id },
    )).toEqual([secondDecision.datum.revision_id]);

    const candidate = record("BSL", "BSL-8D4K6M2Q9X", {
      title: "Candidate incorporating the first product answer",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "phase-0-product-intent",
      group: "DEFAULT",
      definition_members: [correctedProduct.datum.revision_id],
      evidence: [],
    }, { scenario: "create-phase-0-intent-candidate@1" });
    const candidateContext = record("BSL", "BSL-8D4K6M2Q9Y", {
      title: "Candidate Review Context",
      kind: "review-context",
      role: "review-context",
      scope: candidate.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        candidate.datum.revision_id,
        correctedProduct.datum.revision_id,
        product.datum.revision_id,
        firstQuestion.datum.revision_id,
        firstDecision.datum.revision_id,
        firstReview.datum.revision_id,
        firstContext.datum.revision_id,
      ],
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const candidateReview = record("REV", "REV-8D4K6M2Q9X", {
      title: "Passing candidate Review",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      summary: "The corrected candidate is bounded and keeps exact authority.",
      outcome: "pass",
    }, {
      links: [
        { type: "reviews", target: candidate.datum.revision_id },
        { type: "contextualizes", target: candidateContext.datum.revision_id },
      ],
      scenario: "review-datum-in-context@2",
    });
    const gate = record("DEC", "DEC-8D4K6M2Q9X", {
      title: "Approve the corrected candidate",
      rationale: "The candidate preserves the exact reviewed answer.",
      kind: "gate-signoff",
      decision: "Approve the corrected candidate.",
      alternatives: ["Reject the candidate"],
      effective_scope: candidate.datum.revision_id,
      gate_outcome: "approve",
    }, {
      links: [{ type: "justifies", target: candidate.datum.revision_id }],
      scenario: "record-gate-signoff@3",
    });
    const authorityAndCorrection = [
      correctedProduct.datum.revision_id,
      product.datum.revision_id,
      firstQuestion.datum.revision_id,
      firstDecision.datum.revision_id,
      firstReview.datum.revision_id,
      firstContext.datum.revision_id,
    ];
    const candidateRecords = [
      ...records,
      candidate,
      candidateContext,
      candidateReview,
      gate,
    ];

    expect(selectedBy(
      candidateRecords,
      "candidate-product-answer-review-support@1",
      { candidate: candidate.datum.revision_id },
    ).sort()).toEqual([...authorityAndCorrection].sort());
    expect(selectedBy(
      candidateRecords,
      "review-context-members-for@1",
      { subject: candidate.datum.revision_id },
    )).toEqual(expect.arrayContaining(authorityAndCorrection));
    expect(selectedBy(
      candidateRecords,
      "review-context-members-for@1",
      { subject: candidate.datum.revision_id },
    )).not.toEqual(expect.arrayContaining([
      secondQuestion.datum.revision_id,
      secondDecision.datum.revision_id,
    ]));
    expect(selectedBy(
      candidateRecords,
      "review-context-members-for@1",
      { subject: gate.datum.revision_id },
    )).toEqual(expect.arrayContaining([
      candidate.datum.revision_id,
      candidateReview.datum.revision_id,
      ...authorityAndCorrection,
    ]));
  });

  it("accepts only the current same-lineage correction Decision with its own passing Review", () => {
    const fixture = routeFixture();
    fixture.review.datum.payload.outcome = "fail";
    const replacement = record("DEC", fixture.decision.datum.id, {
      ...fixture.decision.datum.payload,
      rationale: "The stakeholder renewed the exact answer after Review.",
    }, {
      revision: 2,
      links: [
        { type: "resolves", target: fixture.answered.datum.revision_id },
        { type: "corrects-review", target: fixture.review.datum.revision_id },
      ],
      scenario: "revise-question-decision-after-review@1",
    });
    const replacementContext = reviewContext(
      replacement,
      fixture.source,
      fixture.boundary,
      fixture.answered,
      "BSL-7K3M9Q2D8G",
    );
    replacementContext.datum.payload.definition_members = [
      replacement.datum.revision_id,
      fixture.source.datum.revision_id,
      fixture.boundary.datum.revision_id,
      fixture.decision.datum.revision_id,
      fixture.answered.datum.revision_id,
      fixture.review.datum.revision_id,
    ].sort();
    const replacementReview = passingReview(
      replacement,
      replacementContext,
      "REV-7K3M9Q2D8G",
    );

    const records = [
      ...Object.values(fixture),
      replacement,
      replacementContext,
      replacementReview,
    ];
    expect(selected(records)).toEqual([replacement.datum.revision_id]);
    expect(selectedBy(
      records,
      "review-context-members-for@1",
      { subject: replacement.datum.revision_id },
    ).sort()).toEqual([
      fixture.source.datum.revision_id,
      fixture.boundary.datum.revision_id,
      fixture.answered.datum.revision_id,
      fixture.decision.datum.revision_id,
      fixture.review.datum.revision_id,
    ].sort());
  });

  it("rejects a passing Review that cites a stale exact Review Context", () => {
    const fixture = routeFixture();
    const newerContext = reviewContext(
      fixture.decision,
      fixture.source,
      fixture.boundary,
      fixture.answered,
      fixture.context.datum.id,
      2,
    );
    const records = [...Object.values(fixture), newerContext];
    expect(selected(records)).toEqual([]);

    const freshReview = passingReview(
      fixture.decision,
      newerContext,
      "REV-7K3M9Q2D8G",
    );
    expect(selected([...records, freshReview])).toEqual([
      fixture.decision.datum.revision_id,
    ]);
  });
});
