import { promises as fs } from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluateLifecycle, loadProcessPackage, resolveType, type ProcessPackage } from "../src/index.js";
import { evaluateScenarioParticipation } from "../src/evaluator.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";

const processRef = "mdlm-bootstrap@0.70.0#sha256:hardening-contracts";
const rev = (id: string, revision = 1) => `${id}-r${String(revision).padStart(5, "0")}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: Array<{ type: string; target: string }> = [],
  scenario?: string,
  revision = 1,
) {
  const result = frozenLifecycleRecord(processRef, type, id, payload, {
    links,
    ...(scenario ? { scenario } : {}),
  });
  result.datum.revision = revision;
  result.datum.revision_id = rev(id, revision);
  return result;
}

function requirement(title: string) {
  return {
    title,
    rationale: "Exact bounded requirement.",
    statement: title,
    verification_intent: "Inspect exact behavior.",
  };
}

function passingReview(subject: ReturnType<typeof record>, id: string) {
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
      : [];
  const context = record(
    "BSL",
    id.replace("REV", "BSL"),
    {
      title: `Exact context for ${subject.datum.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: subject.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        ...new Set([subject.datum.revision_id, ...support]),
      ].sort(),
      evidence: [],
    },
    [],
    "create-review-context@1",
  );
  const review = record(
    "REV",
    id,
    {
      title: `Passing ${subject.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@2",
      findings: [],
      outcome: "pass",
    },
    [
      { type: "reviews", target: subject.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
    "review-datum-in-context@2",
  );
  return { context, review };
}

describe("Phase-hardening domain route contracts", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("derives exact Phase 0 Review work from a published product specification", () => {
    const product = record("PSP", "PSP-HARDEN0001", {
      title: "Bounded product",
      rationale: "Discover exact Review work.",
      problem: "Intent needs independent judgment.",
      users: ["operator"],
      goals: ["preserve exact intent"],
      non_goals: [],
      success_measures: ["review is dispatchable"],
    }, [], "compile-psp@2");
    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-0-wayfinding",
      records: [product],
      dependencyComparisons: [],
    });
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "review-context-required" && item.subject === product.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-review-context@1",
    }));
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "passing-review-required" && item.subject === product.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
  });

  it("derives Phase 1 work, delegated VAI execution, correction, and multiplicity boundaries", () => {
    const psp = record("PSP", "PSP-HARDENP100", {
      title: "Phase 1 product", rationale: "Exercise package assurance.", problem: "Malformed input must be rejected.",
      users: ["operator"], goals: ["exact assurance"], non_goals: [], success_measures: ["discriminating evidence"],
    }, [], "compile-psp@2");
    const stk = record(
      "STK",
      "STK-HARDENP100",
      {
        ...requirement("Reject malformed commands"),
        stakeholder: "operator",
        priority: "must",
        system_context: "product",
      },
      [{ type: "derived-from", target: psp.datum.id }],
      "draft-stakeholder-requirements@2",
    );
    const baseSnapshot = { processRef, phaseId: "phase-1-product-assurance", records: [psp, stk], dependencyComparisons: [] };
    expect(evaluateLifecycle(processPackage, baseSnapshot).looseEnds.find((item) =>
      item.obligation === "verification-strategy-required"
    )).toEqual(expect.objectContaining({
      status: "ready", dispatchable: true, actionableResolver: "define-verification-strategy@1",
    }));

    const capabilities = { controllability: ["invoke command"], observability: ["capture bytes"], external_services: [], timing: "bounded" };
    const strategy = record("VSP", "VSP-HARDENP100", {
      title: "Public command strategy", rationale: "Exercise the exact command boundary.", level: "stakeholder",
      permitted_methods: ["demonstration"],
      independence: { boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"] },
      evidence_policy: "Retain exact observations.", assessment_policy: "Require discrimination.",
      environment_profile: { id: "public-command", purpose: "Exercise commands.", capabilities },
    }, [{ type: "governs", target: stk.datum.id }, { type: "governs-revision", target: stk.datum.revision_id }], "define-verification-strategy@1");
    const strategyReview = passingReview(strategy, "REV-HARDENP100");
    const planned = evaluateLifecycle(processPackage, {
      ...baseSnapshot,
      records: [psp, stk, strategy, strategyReview.context, strategyReview.review],
    });
    expect(planned.looseEnds).toEqual(expect.arrayContaining([
      expect.objectContaining({ obligation: "environment-assurance-required", actionableResolver: "realize-verification-environment@1" }),
      expect.objectContaining({ obligation: "pilot-verification-activity-required", actionableResolver: "write-verification-activity@2" }),
    ]));

    const activity = record("VER", "VER-HARDENP100", {
      title: "Pilot command activity", rationale: "Discriminate malformed input.", kind: "pilot", method: "demonstration", assessment_mode: "witnessed",
      claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false },
      acceptance_criteria: ["success and rejection differ"], evidence_requirements: ["exact bytes"],
      expected_success_activity: "Invoke valid input.", expected_discrimination_activity: "Invoke malformed input.",
    }, [
      { type: "verifies", target: stk.datum.id }, { type: "verifies-revision", target: stk.datum.revision_id },
      { type: "governed-by", target: strategy.datum.revision_id },
    ], "write-verification-activity@2");
    const targetPayload = {
      title: "Exact command target", kind: "prototype", repository_ref: `git:${"b".repeat(40)}`,
      supported_behavior: ["valid input"], unsupported_behavior: ["malformed input"],
      public_interface: {
        repository_locator: "file:///fixture", working_directory: "fresh-temporary-directory",
        command: [
          { literal: "node" }, { checkout_path: "bin/fixture.mjs" },
          { parameter: { name: "input", encoding: "exact UTF-8", case_tokens: {
            normal: { value: "ok" }, "raw-malformed": { raw: { encoding: "utf-8", value: "" } },
            "omitted-argument": { omitted: true }, "extra-argument": { value: "ok" },
          } } },
          { extra_argument: { raw: { encoding: "utf-8", value: "extra" } } },
        ],
        argument_cases: [
          { id: "normal", kind: "normal", expected_observation: { classification: "success", exit_status: 0, stdout: { encoding: "base64", bytes: "b2sK" }, stderr: { encoding: "base64", bytes: "" } } },
          { id: "raw-malformed", kind: "raw-malformed", expected_observation: { classification: "automatic-rejection", exit_status: 2, stdout: { encoding: "base64", bytes: "" }, stderr: { encoding: "base64", bytes: "ZXJyb3IK" } } },
          { id: "omitted", kind: "omitted-argument", expected_observation: { classification: "automatic-rejection", exit_status: 2, stdout: { encoding: "base64", bytes: "" }, stderr: { encoding: "base64", bytes: "cmVxdWlyZWQK" } } },
          { id: "extra", kind: "extra-argument", expected_observation: { classification: "automatic-rejection", exit_status: 2, stdout: { encoding: "base64", bytes: "" }, stderr: { encoding: "base64", bytes: "ZXh0cmEK" } } },
        ],
      },
    };
    const target = record("ART", "ART-HARDENP100", targetPayload, [{ type: "derived-from", target: stk.datum.revision_id }], "register-pilot-target@1");
    const targetWork = evaluateLifecycle(processPackage, { ...baseSnapshot, records: [psp, stk, strategy, strategyReview.context, strategyReview.review, activity] });
    expect(targetWork.looseEnds.find((item) => item.obligation === "pilot-target-required")).toEqual(expect.objectContaining({
      status: "ready", actionableResolver: "register-pilot-target@1",
    }));

    const environment = record("ENV", "ENV-HARDENP100", {
      title: "Qualified environment", rationale: "Reproduce exact commands.",
      strategy_revision: strategy.datum.revision_id, profile_id: "public-command", capabilities,
      reproducibility: { environment_ref: "container:phase-1", configuration_digest: `sha256:${"d".repeat(64)}`, reconstruction: "Restore the exact fixture." },
    }, [{ type: "realizes", target: strategy.datum.revision_id }], "realize-verification-environment@1");
    expect(evaluateScenarioParticipation(
      processPackage,
      { ...baseSnapshot, records: [psp, stk, strategy, strategyReview.context, strategyReview.review, activity, environment, target] },
      "implement-verification-activity@1",
      [{ activity: activity.datum.revision_id, environment: environment.datum.revision_id, execution_target: target.datum.revision_id }],
    )).toEqual([expect.objectContaining({
      authorityRequirement: expect.objectContaining({ mode: "delegated", authority: "independent-verification-implementer" }),
      attentionSchedule: expect.objectContaining({ timing: "none" }),
    })]);

    const implementation = record("VAI", "VAI-HARDENP100", {
      title: "Source-blind pilot", rationale: "Retain bounded execution semantics.", kind: "pilot",
      implementation_ref: `git:${"c".repeat(40)}`, independence_mode: "source-blind",
      authoring_input_refs: [activity.datum.revision_id, target.datum.revision_id],
      prohibited_inputs_observed: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"],
      activity_bindings: [activity.datum.revision_id], target_behavior: { supported: ["valid input"], intentionally_unsupported: ["malformed input"] },
      execution_procedure: {
        deadlines_ms: { checkout: 30000, environment_check: 20000, product_case: 5000 }, deadline_scope: "infrastructure-safety-only",
        timeout: { termination: "process-group-sigterm-then-sigkill", force_after_ms: 1000, reaping: "all-descendants", capture_partial_raw_observation: true },
        cleanup: "guaranteed", aggregation: "continue-through-all-cases",
      },
    }, [
      { type: "realizes", target: activity.datum.revision_id },
      { type: "uses", target: environment.datum.revision_id },
      { type: "targets", target: target.datum.revision_id },
    ], "implement-verification-activity@1");
    const runWork = evaluateLifecycle(processPackage, { ...baseSnapshot, records: [psp, stk, strategy, strategyReview.context, strategyReview.review, activity, environment, target, implementation] });
    expect(runWork.looseEnds.find((item) =>
      item.obligation === "verification-run-required" && item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({ eventualResolver: "execute-verification-run@1" }));

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    formatsPlugin.default(ajv);
    const art = resolveType(processPackage, "ART");
    const vai = resolveType(processPackage, "VAI");
    expect(art.ok && ajv.compile(art.type.payloadSchema)(targetPayload)).toBe(true);
    expect(vai.ok && ajv.compile(vai.type.payloadSchema)(implementation.datum.payload)).toBe(true);
    const malformedImplementation = structuredClone(implementation.datum.payload) as Record<string, any>;
    malformedImplementation.execution_procedure.timeout.reaping = "child-only";
    expect(vai.ok && ajv.compile(vai.type.payloadSchema)(malformedImplementation)).toBe(false);
    expect(
      implementation.datum.payload.execution_procedure as Record<string, unknown>,
    ).toMatchObject({
      timeout: { termination: "process-group-sigterm-then-sigkill", reaping: "all-descendants", capture_partial_raw_observation: true },
      cleanup: "guaranteed", aggregation: "continue-through-all-cases",
    });

    const failedImplementationReview = record(
      "REV",
      "REV-HARDENVAI1",
      {
        title: "Failed VAI Review",
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@2",
        findings: [{
          id: "F-001",
          target: implementation.datum.revision_id,
          relationship: "primary",
          severity: "blocking",
          summary: "Preserve process cleanup.",
          criterion: "A pilot VAI must terminate and reap the complete process group.",
          evidence: "The reviewed procedure specifies child-only reaping after timeout.",
          material_consequence: "Descendant processes can survive and contaminate later cases.",
        }],
        outcome: "fail",
      },
      [{ type: "reviews", target: implementation.datum.revision_id }],
      "review-datum-in-context@2",
    );
    const correctionSnapshot = {
      ...baseSnapshot,
      records: [psp, stk, strategy, strategyReview.context, strategyReview.review, activity, environment, target, implementation, failedImplementationReview],
    };
    expect(evaluateLifecycle(processPackage, correctionSnapshot).looseEnds.find((item) =>
      item.obligation === "pilot-vai-review-correction-required" && item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      eventualResolver: "revise-pilot-vai-after-review@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous", authority: "package-evidence" }),
      })],
    }));

    const competingStrategy = record("VSP", "VSP-HARDENP101", { ...strategy.datum.payload, title: "Competing strategy" }, [
      { type: "governs", target: stk.datum.id }, { type: "governs-revision", target: stk.datum.revision_id },
    ], "define-verification-strategy@1");
    expect(evaluateLifecycle(processPackage, { ...baseSnapshot, records: [psp, stk, strategy, competingStrategy] }).terminalOutcome)
      .toEqual(expect.objectContaining({ outcome: "profile-boundary-reached" }));
    const competingEnvironment = record("ENV", "ENV-HARDENP101", { ...environment.datum.payload, title: "Competing environment" }, [
      { type: "realizes", target: strategy.datum.revision_id },
    ], "realize-verification-environment@1");
    expect(evaluateLifecycle(processPackage, { ...baseSnapshot, records: [psp, stk, strategy, environment, competingEnvironment] }).terminalOutcome)
      .toEqual(expect.objectContaining({ outcome: "profile-boundary-reached" }));
    const competingTarget = record("ART", "ART-HARDENP101", { ...targetPayload, title: "Competing target", repository_ref: `git:${"e".repeat(40)}` }, [
      { type: "derived-from", target: stk.datum.revision_id },
    ], "register-pilot-target@1");
    expect(evaluateLifecycle(processPackage, { ...baseSnapshot, records: [psp, stk, strategy, activity, target, competingTarget] }).terminalOutcome)
      .toEqual(expect.objectContaining({ outcome: "profile-boundary-reached" }));
  });

  it("evaluates exact Phase 2 completion, candidate, acceptance, and progression snapshots", async () => {
    const transitions = [
      ["phase2-completion-ready.json", "decomposition-completion-required", "complete-decomposition-work-package@2"],
      ["phase2-group-ready.json", "decomposition-group-candidate-required", "create-decomposition-group-candidate@1"],
      ["phase2-level-ready.json", "system-level-candidate-required", "create-system-level-candidate@1"],
      ["phase2-acceptance-ready.json", "system-acceptance-required", "accept-phase-2-system@1"],
    ] as const;
    for (const [fixture, obligation, resolver] of transitions) {
      const snapshot = JSON.parse(await fs.readFile(
        path.join(process.cwd(), "test/fixtures/phase-hardening", fixture),
        "utf8",
      ));
      const evaluation = evaluateLifecycle(processPackage, snapshot);
      expect(evaluation.looseEnds.find((item) => item.obligation === obligation), fixture)
        .toEqual(expect.objectContaining({
          status: "ready",
          dispatchable: true,
          actionableResolver: resolver,
        }));
    }
    const completeSnapshot = JSON.parse(await fs.readFile(
      path.join(process.cwd(), "test/fixtures/phase-hardening/phase2-progression-complete.json"),
      "utf8",
    ));
    const complete = evaluateLifecycle(processPackage, completeSnapshot);
    expect(complete.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-2-pilot-assessment",
      ready: true,
      authorized: true,
      complete: true,
    }));
  }, 30_000);

  it("evaluates PAS correction authority and reviewed expansion outcomes", () => {
    const assessmentPayload = (recommendation: "proceed" | "change" | "stop") => ({
      title: "Pilot assessment",
      rationale: "Measure exact pilot evidence.",
      pilot_scope: "phase-0-through-2",
      measurements: {
        review: { contexts: 1, completed_reviews: 1, findings: 0, quality_improved: true, volume_assessment: "acceptable" },
        agent_effort: { tracer_issues: 1, implementation_commits: 1, implementation_commit_refs: [`git:${"a".repeat(40)}`], effort_assessment: "acceptable" },
        evidence_reuse: { eligible: 1, reused: 1, stale: 0, explanation_checks: 1, explanations_correct: true },
        loose_ends: { sampled: 1, actionable: 1, useful: true, assessment: "Exact work remained actionable." },
        gate_ceremony: { gates: 1, signoffs: 1, decision_reviews: 1, proportionate: true },
        environment_profiles: { profiles_assessed: 1, sufficient: true },
        verification_discrimination: { supported_successes: 1, unsupported_rejections: 1, discriminates: true },
        scope_reduction: { proposed_items: 2, removed_items: 1, retained_items: 1, demonstrated: true },
      },
      recommendation,
      limitations: [],
    });
    const assessment = record("PAS", "PAS-HARDEN0001", assessmentPayload("proceed"), [{ type: "measures", target: "BSL-HARDENPAS1-r00001" }], "assess-phase-0-2-pilot@1");
    const failedReview = (subject: ReturnType<typeof record>, id: string) =>
      record(
        "REV",
        id,
        {
          title: `Failed ${subject.datum.revision_id}`,
          review_kind: "contextual",
          rubric_ref: "policies/rubrics/bootstrap-review.md@2",
          findings: [{
            id: "F-001",
            target: subject.datum.revision_id,
            relationship: "primary",
            severity: "blocking",
            summary: "Correct the assessment.",
            criterion: "A Pilot Assessment must report exact measured evidence for its recommendation.",
            evidence: "The reviewed assessment recommendation is unsupported by its recorded measurements.",
            material_consequence: "Stakeholders cannot safely authorize expansion from this assessment.",
          }],
          outcome: "fail",
        },
        [{ type: "reviews", target: subject.datum.revision_id }],
        "review-datum-in-context@2",
      );
    const firstFailure = failedReview(assessment, "REV-HARDEN0001");
    const second = record("PAS", assessment.datum.id, { ...assessment.datum.payload }, [
      { type: "corrects-review", target: firstFailure.datum.revision_id },
    ], "revise-pilot-assessment-after-review@2", 2);
    const secondFailure = failedReview(second, "REV-HARDEN0002");
    const third = record("PAS", assessment.datum.id, { ...assessment.datum.payload }, [
      { type: "corrects-review", target: secondFailure.datum.revision_id },
    ], "revise-pilot-assessment-after-review@2", 3);
    const thirdFailure = failedReview(third, "REV-HARDEN0003");
    const firstSnapshot = {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [assessment, firstFailure],
      dependencyComparisons: [],
    };
    expect(evaluateScenarioParticipation(
      processPackage,
      firstSnapshot,
      "revise-pilot-assessment-after-review@2",
      [{ assessment: assessment.datum.revision_id }],
    )).toEqual([expect.objectContaining({
      authorityRequirement: expect.objectContaining({ mode: "autonomous", authority: "package-evidence" }),
      attentionSchedule: expect.objectContaining({ timing: "none" }),
    })]);
    const secondSnapshot = {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [assessment, firstFailure, second, secondFailure],
      dependencyComparisons: [],
    };
    expect(evaluateScenarioParticipation(
      processPackage,
      secondSnapshot,
      "revise-pilot-assessment-after-review@2",
      [{ assessment: second.datum.revision_id }],
    )).toEqual([expect.objectContaining({
      authorityRequirement: expect.objectContaining({ mode: "autonomous", authority: "package-evidence" }),
    })]);
    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [assessment, firstFailure, second, secondFailure, third, thirdFailure],
      dependencyComparisons: [],
    });
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-assessment-review-correction-required" &&
      item.subject === third.datum.revision_id
    )).toEqual(expect.objectContaining({
      eventualResolver: "revise-pilot-assessment-after-review@2",
      unresolvedBindings: ["context"],
    }));
    const snapshot = {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [assessment, firstFailure, second, secondFailure, third, thirdFailure],
      dependencyComparisons: [],
    };
    expect(evaluateScenarioParticipation(
      processPackage,
      snapshot,
      "revise-pilot-assessment-after-review@2",
      [{ assessment: third.datum.revision_id }],
    )).toEqual([
      expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      }),
    ]);

    for (const recommendation of ["proceed", "change", "stop"] as const) {
      const currentAssessment = record(
        "PAS",
        `PAS-HARDEN${recommendation.toUpperCase()}`,
        assessmentPayload(recommendation),
        [{ type: "measures", target: "BSL-HARDENPAS1-r00001" }],
        "assess-phase-0-2-pilot@1",
      );
      const assessmentReview = passingReview(currentAssessment, `REV-HARDEN${recommendation.toUpperCase()}A`);
      const beforeDecision = evaluateLifecycle(processPackage, {
        processRef,
        phaseId: "phase-2-pilot-assessment",
        records: [currentAssessment, assessmentReview.context, assessmentReview.review],
        dependencyComparisons: [],
      });
      expect(beforeDecision.looseEnds.find((item) =>
        item.obligation === "pilot-expansion-decision-required"
      )).toEqual(expect.objectContaining({
        status: "ready",
        actionableResolver: "decide-pilot-expansion@2",
        participation: [expect.objectContaining({
          authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
        })],
      }));
      const decision = record("DEC", `DEC-HARDEN${recommendation.toUpperCase()}`, {
        title: `${recommendation} Decision`,
        rationale: "Adopt the exact reviewed recommendation.",
        kind: "pilot-expansion",
        decision: recommendation,
        alternatives: ["proceed", "change", "stop"].filter((item) => item !== recommendation),
        effective_scope: "Phase 3–6 Example Process Package expansion",
      }, [
        { type: "justifies", target: currentAssessment.datum.revision_id },
        { type: "relies-on-review", target: assessmentReview.review.datum.revision_id },
      ], "decide-pilot-expansion@2");
      const decisionReview = passingReview(decision, `REV-HARDEN${recommendation.toUpperCase()}D`);
      const resultingPhase = recommendation === "change"
        ? "phase-7-change-control"
        : "phase-2-pilot-assessment";
      const terminal = evaluateLifecycle(processPackage, {
        processRef,
        phaseId: resultingPhase,
        records: [
          currentAssessment,
          assessmentReview.context,
          assessmentReview.review,
          decision,
          decisionReview.context,
          decisionReview.review,
        ],
        dependencyComparisons: [],
      });
      if (recommendation === "stop") {
        expect(terminal.terminalOutcome?.outcome).toBe("lifecycle-complete");
      } else {
        expect(terminal.terminalOutcome?.outcome).toBe("profile-boundary-reached");
      }
    }

    const reviewedAssessment = record("PAS", "PAS-HARDENDEC1", assessmentPayload("change"), [
      { type: "measures", target: "BSL-HARDENPAS1-r00001" },
    ], "assess-phase-0-2-pilot@1");
    const reviewedAssessmentReview = passingReview(reviewedAssessment, "REV-HARDENDECA");
    const failedDecision = record("DEC", "DEC-HARDENFAIL", {
      title: "Failed expansion Decision",
      rationale: "Exercise renewed judgment.",
      kind: "pilot-expansion",
      decision: "change",
      alternatives: ["proceed", "stop"],
      effective_scope: "Phase 3–6 Example Process Package expansion",
    }, [
      { type: "justifies", target: reviewedAssessment.datum.revision_id },
      { type: "relies-on-review", target: reviewedAssessmentReview.review.datum.revision_id },
    ], "decide-pilot-expansion@2");
    const failedDecisionReview = failedReview(failedDecision, "REV-HARDENDECF");
    const failedDecisionEvaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-2-pilot-assessment",
      records: [
        reviewedAssessment,
        reviewedAssessmentReview.context,
        reviewedAssessmentReview.review,
        failedDecision,
        failedDecisionReview,
      ],
      dependencyComparisons: [],
    });
    expect(failedDecisionEvaluation.looseEnds.find((item) =>
      item.obligation === "pilot-expansion-decision-review-correction-required"
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "revise-pilot-expansion-decision-after-review@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "attended", authority: "stakeholder" }),
      })],
    }));
  });

  it("evaluates accepted change and shared-consumer transitions with selective reuse", async () => {
    const system = record("SYS", "SYS-HARDEN0001", requirement("Shared export"));
    const other = record("SYS", "SYS-HARDEN0002", requirement("Unrelated title"));
    const consumerPayload = { title: "Consumer", rationale: "Exact coverage.", stage: "completion", architecture_element: "AEL-HARDEN001", target_child_type: "SYS", behavioral_slice: "shared", expected_coverage: ["shared"], exclusions: [], dependencies: [], required_review_policy: "review-applicability@1", parent_coverage_status: "complete", deferred_questions: [], cross_group_dependencies: [], output_reviews_complete: true, simplification_disposition: "retained" };
    const consumerA = record("DWP", "DWP-HARDEN0001", consumerPayload, [{ type: "decomposes", target: system.datum.revision_id }]);
    const consumerB = record("DWP", "DWP-HARDEN0002", consumerPayload, [{ type: "decomposes", target: system.datum.revision_id }]);
    const affected = record("VER", "VER-HARDEN0001", { title: "Affected", rationale: "Exact evidence.", kind: "pilot", method: "test", assessment_mode: "automatic", claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false }, acceptance_criteria: ["observable"], evidence_requirements: ["exact"], expected_success_activity: "success", expected_discrimination_activity: "reject" }, [{ type: "verifies", target: system.datum.id }, { type: "verifies-revision", target: system.datum.revision_id }]);
    const unrelated = record("VER", "VER-HARDEN0002", { ...affected.datum.payload, title: "Unrelated" }, [{ type: "verifies", target: other.datum.id }, { type: "verifies-revision", target: other.datum.revision_id }]);
    const accepted = record("BSL", "BSL-HARDEN0001", { title: "Accepted", kind: "level-accepted", role: "accepted", scope: "SYSTEM", group: "DEFAULT", definition_members: [system.datum.revision_id, other.datum.revision_id, consumerA.datum.revision_id, consumerB.datum.revision_id], evidence: [affected.datum.revision_id, unrelated.datum.revision_id] });
    const change = record("CHG", "CHG-HARDEN0001", { title: "Change shared SYS", rationale: "Bound impact.", scope: "shared SYS", planned_changes: ["replace"], implementation_order: "requirements -> context -> reviews -> baselines -> verification", closure_criteria: ["both consumers fresh"] }, [{ type: "impacts", target: system.datum.revision_id }, { type: "impacts", target: accepted.datum.revision_id }], "analyze-change-impact@2");
    const replacement = record("SYS", system.datum.id, requirement("Shared export with rejection"), [{ type: "changed-under", target: change.datum.revision_id }], "revise-requirement-under-change@3", 2);
    const evaluation = evaluateLifecycle(processPackage, { processRef, phaseId: "phase-7-change-control", records: [system, replacement, other, consumerA, consumerB, affected, unrelated, accepted, change], dependencyComparisons: [] });
    expect(evaluation.looseEnds.filter((item) => item.obligation === "shared-system-consumer-reevaluation-required").map((item) => item.subject)).toEqual([
      consumerA.datum.revision_id,
      consumerB.datum.revision_id,
    ]);
    expect(evaluation.artifacts[affected.datum.revision_id]?.states.validity).toBe("stale");
    expect(evaluation.artifacts[unrelated.datum.revision_id]?.states.validity).toBe("valid");
    const sharedTransitions = [
      ["shared-consumer-a-ready.json", "shared-system-consumer-reevaluation-required", "reevaluate-shared-system-consumer@1", "DWP-1020000001-r00001"],
      ["shared-consumer-b-ready.json", "shared-system-consumer-reevaluation-required", "reevaluate-shared-system-consumer@1", "DWP-1020000002-r00001"],
      ["shared-candidate-ready.json", "stakeholder-change-candidate-required", "create-stakeholder-change-candidate@1", undefined],
      ["shared-closure-ready.json", "change-closure-required", "close-change-request@4", undefined],
    ] as const;
    for (const [fixture, obligation, resolver, subject] of sharedTransitions) {
      const snapshot = JSON.parse(await fs.readFile(
        path.join(process.cwd(), "test/fixtures/phase-hardening", fixture),
        "utf8",
      ));
      const transition = evaluateLifecycle(processPackage, snapshot);
      expect(transition.looseEnds.find((item) =>
        item.obligation === obligation && (subject === undefined || item.subject === subject)
      ), fixture).toEqual(expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: resolver,
      }));
    }
    const closedSharedSnapshot = JSON.parse(await fs.readFile(
      path.join(process.cwd(), "test/fixtures/phase-hardening/shared-closed.json"),
      "utf8",
    ));
    const sharedRecords = closedSharedSnapshot.records as Array<{
      datum: {
        id: string;
        revision_id: string;
        type: string;
        payload: Record<string, unknown>;
      };
    }>;
    expect(sharedRecords.filter((item) => item.datum.type === "DWP" && [
      "DWP-1020000001", "DWP-1020000002",
    ].includes(item.datum.id)).map((item) => item.datum.revision_id).sort()).toEqual([
      "DWP-1020000001-r00001", "DWP-1020000001-r00002",
      "DWP-1020000002-r00001", "DWP-1020000002-r00002",
    ]);
    expect(sharedRecords.find((item) =>
      item.datum.type === "BSL" && item.datum.payload.title === "Selective shared SYS replacement candidate"
    )?.datum.payload.definition_members).toEqual([
      "SYS-1020000001-r00002",
      "DWP-1020000001-r00002",
      "DWP-1020000002-r00002",
      "SYS-1020000002-r00001",
    ]);

    const transitions = [
      ["change-impact-ready.json", "change-impact-required", "analyze-change-impact@2"],
      ["change-approval-ready.json", "change-approval-required", "approve-change-request@3"],
      ["change-replacement-ready.json", "change-revision-required", "revise-requirement-under-change@3"],
      ["change-candidate-ready.json", "stakeholder-change-candidate-required", "create-stakeholder-change-candidate@1"],
      ["change-closure-ready.json", "change-closure-required", "close-change-request@4"],
    ] as const;
    for (const [fixture, obligation, resolver] of transitions) {
      const snapshot = JSON.parse(await fs.readFile(
        path.join(process.cwd(), "test/fixtures/phase-hardening", fixture),
        "utf8",
      ));
      const transition = evaluateLifecycle(processPackage, snapshot);
      expect(transition.looseEnds.find((item) => item.obligation === obligation), fixture)
        .toEqual(expect.objectContaining({
          status: "ready",
          dispatchable: true,
          actionableResolver: resolver,
        }));
    }
    const closedSnapshot = JSON.parse(await fs.readFile(
      path.join(process.cwd(), "test/fixtures/phase-hardening/change-closed.json"),
      "utf8",
    ));
    const pilotEvidence = record("BSL", "BSL-HARDENCHG1", {
      title: "Exact change assessment evidence",
      kind: "phase-2-complete",
      role: "evidence",
      scope: "phase-0-through-2",
      group: "DEFAULT",
      definition_members: [],
      evidence: [],
    });
    const pilotAssessment = record("PAS", "PAS-HARDENCHG1", {
      title: "Reviewed change assessment", rationale: "Enter bounded change control.",
      pilot_scope: "phase-0-through-2", measurements: {}, recommendation: "change", limitations: [],
    }, [{ type: "measures", target: "BSL-HARDENCHG1-r00001" }], "assess-phase-0-2-pilot@1");
    const pilotAssessmentReview = passingReview(pilotAssessment, "REV-HARDENCHGA");
    pilotAssessmentReview.context.datum.payload.definition_members = [
      pilotAssessment.datum.revision_id,
      pilotEvidence.datum.revision_id,
    ];
    const expansionDecision = record("DEC", "DEC-HARDENCHG1", {
      title: "Enter change control", rationale: "Adopt the reviewed recommendation.",
      kind: "pilot-expansion", decision: "change", alternatives: ["proceed", "stop"],
      effective_scope: "Phase 3–6 Example Process Package expansion",
    }, [
      { type: "justifies", target: pilotAssessment.datum.revision_id },
      { type: "relies-on-review", target: pilotAssessmentReview.review.datum.revision_id },
    ], "decide-pilot-expansion@2");
    const expansionDecisionReview = passingReview(expansionDecision, "REV-HARDENCHGD");
    expansionDecisionReview.context.datum.payload.definition_members = [
      expansionDecision.datum.revision_id,
      pilotAssessment.datum.revision_id,
      pilotAssessmentReview.review.datum.revision_id,
    ];
    const appended = [
      pilotEvidence,
      pilotAssessment,
      pilotAssessmentReview.context,
      pilotAssessmentReview.review,
      expansionDecision,
      expansionDecisionReview.context,
      expansionDecisionReview.review,
    ];
    for (const item of appended) {
      item.datum.created_by.process_ref = closedSnapshot.processRef;
    }
    closedSnapshot.records.push(
      pilotEvidence,
      pilotAssessment,
      pilotAssessmentReview.context,
      pilotAssessmentReview.review,
      expansionDecision,
      expansionDecisionReview.context,
      expansionDecisionReview.review,
    );
    const closed = evaluateLifecycle(processPackage, closedSnapshot);
    expect(closed.terminalOutcome).toEqual(expect.objectContaining({
      outcome: "profile-boundary-reached",
    }));
    expect(closed.looseEnds.filter((item) => [
      "change-impact-required",
      "change-approval-required",
      "change-revision-required",
      "stakeholder-change-candidate-required",
      "change-closure-required",
    ].includes(item.obligation))).toEqual([]);
  });
});
