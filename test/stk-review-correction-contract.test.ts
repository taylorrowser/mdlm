import { beforeAll, expect, it } from "vitest";
import {
  evaluateLifecycle,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.93.0#sha256:test";
let processPackage: ProcessPackage;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return lifecycleRecord(type, id, payload, {
    createdBy: { scenario: "fixture@1", process_ref: processRef },
    storage: { editable: false, frozen: true },
    links,
  });
}

beforeAll(async () => {
  processPackage = await canonicalProcessPackage();
});

it("binds the STK product parent into its Review correction scaffold", async () => {
  const product = record("PSP", "PSP-8K035RQ2MZ", {
    title: "Starts-with-a CLI",
    rationale: "Provide one exact lowercase ASCII prefix classification.",
    problem: "A command-line user needs a deterministic prefix answer.",
    users: ["command-line user"],
    goals: ["Classify one positional argument."],
    non_goals: ["Accept additional inputs."],
    success_measures: ["The exact yes or no response is observable."],
  });
  const subject = record("STK", "STK-CXGK5NPEME", {
    title: "Single positional argument",
    rationale: "The product has one command-line input.",
    statement: "starts-with-a shall accept exactly one positional argument.",
    verification_intent: "Observe one accepted positional argument.",
    stakeholder: "command-line user",
    priority: "must",
    system_context: "command-line-classification",
  }, [{ type: "derived-from", target: product.datum.id }]);
  const context = record("BSL", "BSL-NEM2KY01CG", {
    title: "Review context for the positional argument requirement",
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [product.datum.revision_id, subject.datum.revision_id],
    evidence: [],
  });
  const review = record("REV", "REV-2FQ59HPA3F", {
    title: "Review of single positional argument requirement",
    review_kind: "phase-0-foundation",
    rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    findings: [{
      id: "F-001",
      severity: "blocking",
      criterion: "Verification covers the exact-arity boundary.",
      evidence: "The verification intent omits rejected argument counts.",
      material_consequence: "Verification could pass for invalid arity.",
      summary: "Observe rejected argument counts.",
    }],
    correction_authority: "package-evidence",
    outcome: "fail",
  }, [
    { type: "reviews", target: subject.datum.revision_id },
    { type: "contextualizes", target: context.datum.revision_id },
  ]);
  const snapshot = {
    processRef,
    phaseId: "phase-0-wayfinding",
    records: [product, subject, context, review],
    dependencyComparisons: [],
  };

  const evaluation = evaluateLifecycle(processPackage, snapshot);
  expect(evaluation.diagnostics).toEqual([]);
  const correction = evaluation.obligations.find((candidate) =>
    candidate.obligation === "stakeholder-requirement-review-correction-required" &&
    candidate.subject === subject.datum.revision_id
  );
  expect(correction).toEqual(expect.objectContaining({
    status: "ready",
    dispatchable: true,
    actionableResolver: "revise-stakeholder-requirement-after-review@1",
  }));
  expect(correction).toBeDefined();

  const prepared = await dryRunResolverScenario(
    processPackage,
    snapshot,
    "revise-stakeholder-requirement-after-review@1",
    correction!.id,
    [],
    evaluation,
  );
  expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
  if (!prepared.ok) return;

  const invocation = prepared.value.invocations[0]!;
  expect(invocation.inputs.find((input) => input.name === "product_specification")
    ?.values.map((value) => value.identity.id)).toEqual(["PSP-8K035RQ2MZ"]);
  expect(prepared.value.expectedOutputs).toEqual([
    expect.objectContaining({
      name: "replacement",
      types: ["STK"],
      requiredLinks: expect.arrayContaining([
        { link: "derived-from", target: { input: "product_specification" } },
        { link: "corrects-review", target: { input: "failed_reviews" } },
      ]),
    }),
  ]);
});
