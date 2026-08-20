import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.72.0#sha256:test";
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
    answer: "Produce one reviewable deterministic result.",
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
    const loaded = await loadProcessPackage(path.resolve(".lifecycle/process"));
    expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) throw new Error("Process Package failed to load");
    processPackage = loaded.package;
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
      answer: "A later corrected answer.",
    }, {
      revision: 3,
      scenario: "resolve-question@2",
    });

    expect(selected([...Object.values(fixture), newerAnswer])).toEqual([]);
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

    expect(selected([
      ...Object.values(fixture),
      replacement,
      replacementContext,
      replacementReview,
    ])).toEqual([replacement.datum.revision_id]);
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
