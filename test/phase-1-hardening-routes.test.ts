import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyOperatorOutcome,
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleRecord,
  type OperatorWorkFacts,
  type ProcessPackage,
} from "../src/index.js";
import {
  evaluateProcessDefinition,
  evaluateScenarioParticipation,
} from "../src/evaluator.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import {
  publishScenarioMutation,
  readRepositoryData,
} from "../src/lifecycle-repository.js";
import { finalizeExactBaselineScenarioOutput } from "../src/exact-baseline-repository.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import {
  directoryDigest,
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";
import { mdlm, selectProcessPackageFixture } from "./helpers/mdlm.js";
import { copiedProcessPackage } from "./helpers/process-package.js";

const processRef = "mdlm-bootstrap@0.71.0#sha256:phase-1-route-evidence";
const revision = (id: string, number = 1) =>
  `${id}-r${String(number).padStart(5, "0")}`;

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
  result.datum.revision_id = revision(id, options.revision ?? 1);
  return result;
}

function failedReview(
  subject: LifecycleRecord,
  id: string,
  options: {
    stakeholderOwned?: boolean;
    blockedTarget?: string;
    summary?: string;
  } = {},
): [LifecycleRecord, LifecycleRecord] {
  const context = record("BSL", id.replace("REV", "BSL"), {
    title: `Exact context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [subject.datum.revision_id],
    evidence: [],
  }, { scenario: "create-review-context@1" });
  const target = options.blockedTarget ?? subject.datum.revision_id;
  const review = record(
    "REV",
    id,
    {
      title: `Failed Review of ${subject.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [
        {
          id: "F-001",
          target,
          relationship: "primary",
          severity: "blocking",
          criterion: "A failed assurance Review must cite an exact defect in the current VSP, ENV, ART, VAI, VER, or evidence Revision.",
          evidence:
            "The Review rejects the exact current assurance subject in its complete frozen context.",
          material_consequence:
            "Pilot assurance cannot rely on the rejected subject until a corrected Revision passes.",
          summary: options.summary ?? "Correct the exact reviewed assurance artifact.",
        },
      ],
      correction_authority: options.stakeholderOwned
        ? "stakeholder"
        : "package-evidence",
      outcome: "fail",
    },
    {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: subject.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
  },
  );
  return [context, review];
}

function strategy(number: number, corrects?: string): LifecycleRecord {
  return record("VSP", "VSP-0HARDENP10", {
    title: `Verification strategy ${number}`,
    rationale: "Exercise the exact public boundary.",
    level: "stakeholder",
    permitted_methods: ["demonstration"],
    independence: {
      boundary: "black-box",
      prohibited_inputs: [
        "product source code",
        "product unit tests",
        "private implementation details",
        "uncontrolled implementation shortcuts",
      ],
    },
    evidence_policy: "Retain exact observations.",
    assessment_policy: "Require success and malformed-input discrimination.",
    environment_profile: {
      id: "public-command",
      purpose: "Exercise public commands.",
      capabilities: {
        controllability: ["invoke command"],
        observability: ["capture bytes"],
        external_services: [],
        timing: "bounded",
      },
    },
  }, {
    revision: number,
    scenario: number === 1
      ? "define-verification-strategy@1"
      : "revise-verification-strategy-after-review@2",
    links: [
      { type: "governs", target: "STK-0HARDENP10" },
      { type: "governs-revision", target: "STK-0HARDENP10-r00001" },
      ...(corrects ? [{ type: "corrects-review", target: corrects }] : []),
    ],
  });
}

function foundation(): LifecycleRecord[] {
  const product = record("PSP", "PSP-0HARDENP10", {
    title: "Phase 1 product",
    rationale: "Bound exact public assurance.",
    kind: "software",
  });
  const requirement = record("STK", "STK-0HARDENP10", {
    title: "Public command requirement",
    rationale: "The supported command returns deterministic output.",
    requirement: "The public command shall return deterministic output.",
    fit_criterion: "The exact bytes match the expected fixture.",
    source: "accepted intent",
    priority: "must",
  }, {
    links: [{ type: "derived-from", target: product.datum.id }],
  });
  const acceptedIntent = record("BSL", "BSL-0HARDP10A", {
    title: "Accepted Phase 0 intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "phase-0-wayfinding",
    group: "DEFAULT",
    definition_members: [
      product.datum.revision_id,
      requirement.datum.revision_id,
    ],
    evidence: [],
  }, { scenario: "accept-phase-0-intent@1" });
  return [product, requirement, acceptedIntent];
}

function environment(number = 1, corrects?: string): LifecycleRecord {
  return record("ENV", "ENV-0HARDENP10", {
    title: number === 1
      ? "Public verification environment"
      : `Public verification environment ${number}`,
    rationale: "Reproduce exact command evidence.",
    strategy_revision: "VSP-0HARDENP10-r00001",
    profile_id: "public-command",
    capabilities: {
      controllability: ["invoke command"],
      observability: ["capture bytes"],
      external_services: [],
      timing: "bounded",
    },
    reproducibility: {
      environment_ref: number === 1
        ? "container:phase-1"
        : `container:phase-1-${number}`,
      configuration_digest: `sha256:${(number === 1 ? "d" : String(number)).repeat(64)}`,
      reconstruction: "Restore the exact fixture.",
    },
  }, {
    revision: number,
    scenario: number === 1
      ? "realize-verification-environment@1"
      : "revise-environment-assurance-after-review@2",
    links: [
      { type: "realizes", target: "VSP-0HARDENP10-r00001" },
      ...(corrects ? [{ type: "corrects-review", target: corrects }] : []),
    ],
  });
}

function passingReview(
  subject: LifecycleRecord,
  id: string,
  options: {
    definitions?: LifecycleRecord[];
    evidence?: LifecycleRecord[];
  } = {},
): [LifecycleRecord, LifecycleRecord] {
  const definitions = options.definitions ?? [
    subject,
    ...(subject.datum.type === "VSP" ? [foundation()[1]!] : []),
  ];
  const evidence = options.evidence ?? [];
  const context = record("BSL", id.replace("REV", "BSL"), {
    title: `Exact context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: definitions.map((item) => item.datum.revision_id),
    evidence: evidence.map((item) => item.datum.revision_id),
  }, { scenario: "create-review-context@1" });
  const review = record(
    "REV",
    id,
    {
      title: `Passing Review of ${subject.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [],
      outcome: "pass",
    },
    {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: subject.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
  },
  );
  return [context, review];
}

function qualificationEvidence(
  currentStrategy: LifecycleRecord,
  currentEnvironment: LifecycleRecord,
) {
  const activity = record("VER", "VER-0HARDQUAL1", {
    title: "Environment capability qualification",
    rationale: "Qualify the exact strategy profile.",
    kind: "qualification",
    method: "demonstration",
    assessment_mode: "automatic",
    claim: {
      kind: "qualification",
      scope: "environment-capability",
      formal_evidence_eligible: false,
    },
    acceptance_criteria: ["The declared command capability is available."],
    evidence_requirements: ["Retain exact qualification bytes."],
    expected_success_activity: "Invoke the declared capability.",
    expected_discrimination_activity: "Reject an unavailable capability.",
  }, {
    scenario: "realize-verification-environment@1",
    links: [
      { type: "governed-by", target: currentStrategy.datum.revision_id },
      { type: "qualifies", target: currentEnvironment.datum.revision_id },
    ],
  });
  const implementation = record("VAI", "VAI-0HARDQUAL1", {
    title: "Environment qualification procedure",
    rationale: "Execute the exact profile qualification.",
    kind: "qualification",
    implementation_ref: `procedure:sha256:${"a".repeat(64)}`,
    independence_mode: "environment-capability",
    authoring_input_refs: [activity.datum.revision_id],
    prohibited_inputs_observed: [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ],
    activity_bindings: [activity.datum.revision_id],
    target_behavior: {
      supported: ["invoke command"],
      intentionally_unsupported: ["undeclared capability"],
    },
  }, {
    scenario: "realize-verification-environment@1",
    links: [
      { type: "realizes", target: activity.datum.revision_id },
      { type: "uses", target: currentEnvironment.datum.revision_id },
      { type: "targets", target: currentEnvironment.datum.revision_id },
    ],
  });
  const result = record("RES", "RES-0HARDQUAL1", {
    title: "Passing environment qualification",
    claim: {
      kind: "qualification",
      scope: "environment-capability",
      outcome: "pass",
      formal_evidence_eligible: false,
    },
    assessment_state: "accepted",
    observations: {
      expected_success_observed: true,
      expected_discrimination_observed: true,
      details: "The exact profile succeeded and rejected an unavailable capability.",
    },
    evidence_refs: ["observation:qualification:exact-bytes"],
    assessor_ref: "runner:phase-1-qualification",
  }, {
    scenario: "execute-verification-run@1",
    links: [{ type: "assessed-in", target: currentEnvironment.datum.revision_id }],
  });
  const run = record("RUN", "RUN-0HARDQUAL1", {
    title: "Environment qualification run",
    kind: "qualification",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    execution_state: "completed",
    execution_target: {
      kind: "environment",
      ref: currentEnvironment.datum.revision_id,
    },
    runner_ref: "runner:phase-1-qualification",
    configuration_refs: [currentEnvironment.datum.revision_id],
    activities_expected: [activity.datum.revision_id],
    activities_invoked: [activity.datum.revision_id],
    evidence_locations: ["observation:qualification:exact-bytes"],
  }, {
    scenario: "execute-verification-run@1",
    links: [
      { type: "executes", target: implementation.datum.revision_id },
      { type: "uses", target: currentEnvironment.datum.revision_id },
      { type: "targets", target: currentEnvironment.datum.revision_id },
      { type: "produces", target: result.datum.revision_id },
    ],
  });
  return { activity, implementation, run, result };
}

function pilotActivity(number = 1, corrects?: string): LifecycleRecord {
  return record("VER", "VER-0HARDPILOT", {
    title: number === 1
      ? "Source-independent pilot command activity"
      : `Source-independent pilot command activity ${number}`,
    rationale: "Discriminate supported and malformed public commands.",
    kind: "pilot",
    method: "demonstration",
    assessment_mode: "witnessed",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      formal_evidence_eligible: false,
    },
    acceptance_criteria: ["Success and every malformed case differ."],
    evidence_requirements: ["Retain exact exit status and output bytes."],
    expected_success_activity: "Invoke the normal command case.",
    expected_discrimination_activity: "Invoke every malformed command case.",
  }, {
    revision: number,
    scenario: number === 1
      ? "write-verification-activity@2"
      : "revise-pilot-verification-activity-after-review@3",
    links: [
      { type: "verifies", target: "STK-0HARDENP10" },
      { type: "verifies-revision", target: "STK-0HARDENP10-r00001" },
      { type: "governed-by", target: "VSP-0HARDENP10-r00001" },
      { type: "derived-from", target: "PSP-0HARDENP10-r00001" },
      ...(corrects ? [{ type: "corrects-review", target: corrects }] : []),
    ],
  });
}

function targetPayload(): Record<string, unknown> {
  return {
    title: "Boundary-complete public command target",
    kind: "prototype",
    repository_ref: `git:${"b".repeat(40)}`,
    supported_behavior: ["valid input"],
    unsupported_behavior: ["malformed input"],
    evidence_refs: ["fixture:public-command:v1"],
    public_interface: {
      repository_locator: "file:///phase-1-public-command-fixture",
      working_directory: "fresh-temporary-directory",
      command: [
        { literal: "node" },
        { checkout_path: "bin/public-command.mjs" },
        {
          parameter: {
            name: "input",
            encoding: "exact UTF-8",
            case_tokens: {
              normal: { value: "ok" },
              "raw-malformed": { raw: { encoding: "utf-8", value: "" } },
              "omitted-argument": { omitted: true },
              "extra-argument": { value: "ok" },
            },
          },
        },
        { extra_argument: { raw: { encoding: "utf-8", value: "extra" } } },
      ],
      argument_cases: [
        {
          id: "normal",
          kind: "normal",
          expected_observation: {
            classification: "success",
            exit_status: 0,
            stdout: { encoding: "base64", bytes: "b2sK" },
            stderr: { encoding: "base64", bytes: "" },
          },
        },
        {
          id: "raw-malformed",
          kind: "raw-malformed",
          expected_observation: {
            classification: "automatic-rejection",
            exit_status: 2,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "bWFsZm9ybWVkCg==" },
          },
        },
        {
          id: "omitted",
          kind: "omitted-argument",
          expected_observation: {
            classification: "automatic-rejection",
            exit_status: 2,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "cmVxdWlyZWQK" },
          },
        },
        {
          id: "extra",
          kind: "extra-argument",
          expected_observation: {
            classification: "automatic-rejection",
            exit_status: 2,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "ZXh0cmEK" },
          },
        },
      ],
    },
  };
}

function target(id = "ART-0HARDENP10"): LifecycleRecord {
  return record("ART", id, targetPayload(), {
    scenario: "register-pilot-target@1",
    links: [{ type: "derived-from", target: "STK-0HARDENP10-r00001" }],
  });
}

function pilotImplementation(
  number = 1,
  corrects: string[] = [],
): LifecycleRecord {
  return record("VAI", "VAI-0HARDPILOT", {
    title: `Source-blind pilot procedure ${number}`,
    rationale: "Execute every exact public command case without product source.",
    kind: "pilot",
    implementation_ref: `git:${(number === 1 ? "c" : "d").repeat(40)}`,
    independence_mode: "source-blind",
    authoring_input_refs: [
      "VER-0HARDPILOT-r00001",
      "ART-0HARDENP10-r00001",
    ],
    prohibited_inputs_observed: [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ],
    activity_bindings: ["VER-0HARDPILOT-r00001"],
    target_behavior: {
      supported: ["valid input"],
      intentionally_unsupported: ["malformed input"],
    },
    execution_procedure: {
      deadlines_ms: { checkout: 30000, environment_check: 20000, product_case: 5000 },
      deadline_scope: "infrastructure-safety-only",
      timeout: {
        termination: "process-group-sigterm-then-sigkill",
        force_after_ms: 1000,
        reaping: "all-descendants",
        capture_partial_raw_observation: true,
      },
      cleanup: "guaranteed",
      aggregation: "continue-through-all-cases",
    },
  }, {
    revision: number,
    scenario: number === 1
      ? "implement-verification-activity@1"
      : "revise-pilot-vai-after-review@1",
    links: [
      { type: "realizes", target: "VER-0HARDPILOT-r00001" },
      { type: "uses", target: "ENV-0HARDENP10-r00001" },
      { type: "targets", target: "ART-0HARDENP10-r00001" },
      ...corrects.map((review) => ({ type: "corrects-review", target: review })),
    ],
  });
}

function implementationAuthorization(
  implementation: LifecycleRecord,
  id: string,
): LifecycleRecord {
  const scenario = implementation.datum.created_by.scenario;
  if (typeof scenario !== "string") throw new Error("implementation scenario is required");
  return record("DEC", id, {
    title: `Authorization for ${implementation.datum.revision_id}`,
    rationale: "Record exact package-delegated implementation authority.",
    kind: "decision",
    decision: "Authorize the exact source-independent procedure.",
    alternatives: ["Do not authorize."],
    effective_scope: implementation.datum.revision_id,
  }, {
    scenario,
    links: [{ type: "justifies", target: implementation.datum.revision_id }],
  });
}

function correctedPilotImplementationFixture() {
  const currentStrategy = strategy(1);
  const strategyReview = passingReview(currentStrategy, "REV-0HARDVAI0");
  const currentEnvironment = environment();
  const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
  const environmentReview = passingReview(currentEnvironment, "REV-0HARDVAI1", {
    definitions: [currentEnvironment, currentStrategy],
    evidence: [
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
    ],
  });
  const activity = pilotActivity();
  const activityReview = passingReview(activity, "REV-0HARDVAI2", {
    definitions: [activity, foundation()[0]!, foundation()[1]!, currentStrategy],
  });
  const exactTarget = target();
  const first = pilotImplementation();
  const firstAuthorization = implementationAuthorization(first, "DEC-0HARDVAI1");
  const failed = failedReview(first, "REV-0HARDVAI3", {
    summary:
      "The activity binding lacks an exact reproducible mode-producing observation.",
  });
  const priorExecution = pilotRun(first, { idSuffix: "OLDVAI" });
  const replacement = pilotImplementation(2, [failed[1].datum.revision_id]);
  replacement.datum.payload.activity_bindings = [
    ...(replacement.datum.payload.activity_bindings as string[]),
    "Correct the failed Review by adding an exact reproducible mode-producing observation.",
  ];
  const replacementAuthorization = implementationAuthorization(
    replacement,
    "DEC-0HARDVAI2",
  );
  const freshReview = passingReview(replacement, "REV-0HARDVAI4");
  return {
    currentStrategy,
    strategyReview,
    currentEnvironment,
    qualification,
    environmentReview,
    activity,
    activityReview,
    exactTarget,
    first,
    firstAuthorization,
    failed,
    priorExecution,
    replacement,
    replacementAuthorization,
    freshReview,
  };
}

function pilotRun(
  implementation: LifecycleRecord,
  options: { timeout?: boolean; noProductExercise?: boolean; idSuffix?: string } = {},
): { run: LifecycleRecord; result: LifecycleRecord } {
  const suffix = options.idSuffix ?? "PILOT1";
  const evidence = options.noProductExercise
    ? ["setup:containment-unavailable", "case:all:not-launched"]
    : [
      "case:normal:exit-0:stdout-b2sK",
      options.timeout
        ? "case:raw-malformed:timeout:partial-stderr-bWFs"
        : "case:raw-malformed:exit-2:stderr-bWFsZm9ybWVkCg==",
      "case:omitted-argument:exit-2:stderr-cmVxdWlyZWQK",
      "case:extra-argument:exit-2:stderr-ZXh0cmEK",
    ];
  const inconclusive = options.timeout || options.noProductExercise;
  const result = record("RES", `RES-0HARD${suffix}`, {
    title: options.noProductExercise
      ? "Setup-failure pilot result"
      : options.timeout ? "Aggregated timeout pilot result" : "Complete pilot result",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      outcome: inconclusive ? "inconclusive" : "suitable",
      formal_evidence_eligible: false,
    },
    assessment_state: inconclusive ? "assessment-required" : "accepted",
    observations: {
      expected_success_observed: !options.noProductExercise,
      expected_discrimination_observed: !inconclusive,
      details: options.noProductExercise
        ? "Mandatory containment setup failed before product launch; every target case was recorded as not launched."
        : options.timeout
          ? "The raw-malformed case timed out after partial raw observation; its process group received SIGTERM then SIGKILL, all descendants were reaped, and normal, omitted, and extra cases still ran."
          : "Normal, raw-malformed, omitted-argument, and extra-argument observations were aggregated exactly.",
    },
    evidence_refs: evidence,
    assessor_ref: "runner:phase-1-public-command",
  }, {
    scenario: "execute-verification-run@1",
    links: [{ type: "assessed-in", target: "ENV-0HARDENP10-r00001" }],
  });
  const run = record("RUN", `RUN-0HARD${suffix}`, {
    title: options.noProductExercise
      ? "Completed setup-failure procedure"
      : options.timeout ? "Continue-through-timeout pilot run" : "Complete public command run",
    kind: "pilot",
    started_at: "2026-01-01T00:01:00.000Z",
    completed_at: "2026-01-01T00:01:06.000Z",
    execution_state: "completed",
    execution_target: { kind: "prototype", ref: "ART-0HARDENP10-r00001" },
    runner_ref: "runner:phase-1-public-command",
    configuration_refs: ["ENV-0HARDENP10-r00001"],
    activities_expected: ["normal", "raw-malformed", "omitted-argument", "extra-argument"],
    activities_invoked: options.noProductExercise
      ? ["setup-check"]
      : ["normal", "raw-malformed", "omitted-argument", "extra-argument"],
    evidence_locations: evidence,
  }, {
    scenario: "execute-verification-run@1",
    links: [
      { type: "executes", target: implementation.datum.revision_id },
      { type: "uses", target: "ENV-0HARDENP10-r00001" },
      { type: "targets", target: "ART-0HARDENP10-r00001" },
      { type: "produces", target: result.datum.revision_id },
    ],
  });
  return { run, result };
}

function validatePayload(
  processPackage: ProcessPackage,
  type: string,
  payload: Record<string, unknown>,
): boolean {
  const resolved = resolveType(processPackage, type);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  formatsPlugin.default(ajv);
  return ajv.compile(resolved.type.payloadSchema)(payload) === true;
}

function operatorOutcome(
  result: ReturnType<typeof evaluateLifecycle>,
) {
  const phase = result.phase ? `${result.phase.id}@${result.phase.version}` : "";
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

function phase1Evaluation(
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
) {
  return evaluateLifecycle(processPackage, {
    processRef,
    phaseId: "phase-1-product-assurance",
    records: [...foundation(), ...records],
    dependencyComparisons: [],
  });
}

function correction(
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
  obligationName: string,
  subject: string,
) {
  return evaluateLifecycle(processPackage, {
    processRef,
    phaseId: "phase-1-product-assurance",
    records: [...foundation(), ...records],
    dependencyComparisons: [],
  }).obligations.find((item) =>
    item.obligation === obligationName && item.subject === subject
  );
}

function repositorySafeRecords(records: LifecycleRecord[]): LifecycleRecord[] {
  const stableIds = [...new Set(records.map((item) => item.datum.id))];
  const replacements = new Map(stableIds.map((id, index) => {
    const type = records.find((item) => item.datum.id === id)!.datum.type;
    return [id, `${type}-${String(index + 1).padStart(10, "0")}`];
  }));
  for (const item of records) {
    replacements.set(
      item.datum.revision_id,
      `${replacements.get(item.datum.id)}-r${String(item.datum.revision).padStart(5, "0")}`,
    );
  }
  const strings = [...replacements.entries()].sort((left, right) =>
    right[0].length - left[0].length
  );
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") {
      return strings.reduce(
        (result, [from, to]) => result.replaceAll(from, to),
        value,
      );
    }
    if (Array.isArray(value)) return value.map(replace);
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key,
        replace(child),
      ]));
    }
    return value;
  };
  const safeRecords = replace(records) as LifecycleRecord[];
  for (const item of safeRecords) {
    const scenario = item.datum.created_by.scenario;
    if (!scenario) throw new Error(`missing repository Scenario for ${item.datum.revision_id}`);
    item.datum.created_by = {
      ...item.datum.created_by,
      process_ref: item.datum.created_by.process_ref.split("#")[0]!,
      scenario,
      prompt_ref: item.datum.created_by.prompt_ref ?? "prompts/phase-1-route-test.md@1",
      loaded_skill_refs: item.datum.created_by.loaded_skill_refs ?? [],
      policy_refs: item.datum.created_by.policy_refs ?? [],
    };
  }
  return safeRecords;
}

describe("Phase 1 hardening route evidence", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("proves Phase 1 VSP creation and exposes its fresh independent Review route", () => {
    const currentStrategy = strategy(1);
    expect(validatePayload(processPackage, "VSP", currentStrategy.datum.payload)).toBe(true);

    const before = phase1Evaluation(processPackage, []);
    expect(before.obligations.find((item) =>
      item.obligation === "verification-strategy-required"
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "define-verification-strategy@1",
    }));

    const after = phase1Evaluation(processPackage, [currentStrategy]);
    expect(after.obligations.find((item) =>
      item.obligation === "verification-strategy-required"
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(after.obligations.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === currentStrategy.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-review-context@1",
    }));
    expect(currentStrategy.datum.links).toEqual([
      { type: "governs", target: "STK-0HARDENP10" },
      { type: "governs-revision", target: "STK-0HARDENP10-r00001" },
    ]);

    const malformed = structuredClone(currentStrategy.datum.payload);
    delete malformed.environment_profile;
    expect(validatePayload(processPackage, "VSP", malformed)).toBe(false);
    expect(phase1Evaluation(processPackage, []).obligations.find((item) =>
      item.obligation === "verification-strategy-required"
    )).toEqual(expect.objectContaining({ status: "ready" }));
  });

  it("proves Phase 1 ENV qualification and supplies its exact Review evidence", async () => {
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDENV0");
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const incompleteRecords = [
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
    ];
    const incomplete = phase1Evaluation(processPackage, incompleteRecords);
    expect(incomplete.obligations.find((item) =>
      item.obligation === "environment-assurance-required" &&
      item.subject === currentStrategy.datum.revision_id
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(incomplete.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === qualification.implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
    }));
    expect(incomplete.obligations.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === currentEnvironment.datum.revision_id
    )).toEqual(expect.objectContaining({ status: "blocked" }));

    const complete = phase1Evaluation(processPackage, [
      ...incompleteRecords,
      qualification.run,
      qualification.result,
    ]);
    expect(complete.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === qualification.implementation.datum.revision_id
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(complete.obligations.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === currentEnvironment.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "create-review-context@1",
    }));
    const reviewMembers = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...foundation(),
          ...incompleteRecords,
          qualification.run,
          qualification.result,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "review-context-members-for@1",
      { subject: currentEnvironment.datum.revision_id },
    );
    const expectedReviewMembers = [
      qualification.result.datum.revision_id,
      qualification.run.datum.revision_id,
      qualification.implementation.datum.revision_id,
      qualification.activity.datum.revision_id,
      currentStrategy.datum.revision_id,
    ];
    expect((reviewMembers.result as Array<{ identity: { revision_id: string } }>)
      .map((item) => item.identity.revision_id)).toEqual(expectedReviewMembers);

    const [exactContext] = passingReview(currentEnvironment, "REV-0HARDENV1", {
      definitions: [currentEnvironment, currentStrategy],
      evidence: [
        qualification.activity,
        qualification.implementation,
        qualification.run,
        qualification.result,
      ],
    });
    const contextRecords = [
      ...foundation(),
      ...incompleteRecords,
      qualification.run,
      qualification.result,
    ];
    const matchingContext = (
      context: LifecycleRecord,
      additionalRecords: LifecycleRecord[] = [],
    ) => evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...contextRecords, ...additionalRecords, context],
        dependencyComparisons: [],
      },
      "selector",
      "environment-assurance-context-matches@1",
      {
        environment: currentEnvironment.datum.revision_id,
        context: context.datum.revision_id,
      },
    ).result;
    expect(matchingContext(exactContext)).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: exactContext.datum.revision_id,
        }),
      }),
    ]);

    const unrelatedBaseline = record("BSL", "BSL-0UNRELATED2", {
      title: "Unrelated composed baseline",
      kind: "intent-level-candidate",
      role: "candidate",
      scope: "unrelated",
      group: "DEFAULT",
      definition_members: [],
      evidence: [],
    });
    const contextWithComposition = record("BSL", "BSL-0HARDENV5", {
      title: `Exact context for ${currentEnvironment.datum.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: currentEnvironment.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        currentEnvironment.datum.revision_id,
        currentStrategy.datum.revision_id,
      ],
      evidence: [
        qualification.activity.datum.revision_id,
        qualification.implementation.datum.revision_id,
        qualification.run.datum.revision_id,
        qualification.result.datum.revision_id,
      ],
    }, {
      scenario: "create-review-context@1",
      links: [{
        type: "composes",
        target: unrelatedBaseline.datum.revision_id,
      }],
    });
    expect(matchingContext(contextWithComposition, [unrelatedBaseline])).toEqual([]);

    const recordsWithContext = [
      ...incompleteRecords,
      qualification.run,
      qualification.result,
      exactContext,
    ];
    const reviewRoute = phase1Evaluation(processPackage, recordsWithContext).obligations.find(
      (item) => item.obligation === "passing-review-required" &&
        item.subject === currentEnvironment.datum.revision_id,
    );
    expect(reviewRoute).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: true,
      actionableResolver: "review-datum-in-context@2",
    }));
    const preparedReview = await dryRunResolverScenario(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...recordsWithContext],
        dependencyComparisons: [],
      },
      "review-datum-in-context@2",
      reviewRoute!.id,
      [],
    );
    expect(preparedReview.ok, JSON.stringify(preparedReview.diagnostics)).toBe(true);
    if (!preparedReview.ok) return;
    expect(preparedReview.value.invocations[0]!.inputs.find((input) =>
      input.name === "context_members"
    )?.values.map((value) => value.identity.revision_id)).toEqual(
      expectedReviewMembers,
    );

    const [contextWithUnrelatedEvidence] = passingReview(
      currentEnvironment,
      "REV-0HARDENV2",
      {
        definitions: [currentEnvironment, currentStrategy],
        evidence: [
          qualification.activity,
          qualification.implementation,
          qualification.run,
          qualification.result,
          strategyReview[1],
        ],
      },
    );
    expect(matchingContext(contextWithUnrelatedEvidence)).toEqual([]);

    const [contextWithUnrelatedDefinition] = passingReview(
      currentEnvironment,
      "REV-0HARDENV3",
      {
        definitions: [currentEnvironment, currentStrategy, strategyReview[0]],
        evidence: [
          qualification.activity,
          qualification.implementation,
          qualification.run,
          qualification.result,
        ],
      },
    );
    expect(matchingContext(contextWithUnrelatedDefinition)).toEqual([]);

    expect(complete.obligations.find((item) =>
      item.obligation === "pilot-verification-activity-required"
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "write-verification-activity@2",
    }));
  });

  it("supplies the exact parent PSP to pilot activity authoring", async () => {
    const acceptedFoundation = foundation();
    const product = acceptedFoundation[0]!;
    const requirement = acceptedFoundation[1]!;
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDVERP");
    const records = [
      ...acceptedFoundation,
      currentStrategy,
      ...strategyReview,
    ];
    const route = phase1Evaluation(processPackage, records).obligations.find(
      (item) => item.obligation === "pilot-verification-activity-required",
    );
    expect(route).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "write-verification-activity@2",
    }));

    const prepared = await dryRunResolverScenario(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records,
        dependencyComparisons: [],
      },
      "write-verification-activity@2",
      route!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs.find(
      (input) => input.name === "intent_support",
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      product!.datum.revision_id,
    ]);
  });

  it("prepares and submits pilot activity authoring with exact intent support through the public CLI", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-intent-support-"));
    const processRoot = await copiedProcessPackage("mdlm-phase1-intent-support-process-");
    try {
      const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
      const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
      await fs.writeFile(
        phase0Path,
        (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
      );
      let phase1 = await fs.readFile(phase1Path, "utf8");
      phase1 = phase1.replace("order: 1", "order: 0").replace(
        /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
        "scenarios:\n  - write-verification-activity@2\n  - execute-verification-run@1\nobligations:\n  - pilot-verification-activity-required@2\noutputs:",
      );
      await fs.writeFile(phase1Path, phase1);
      const activityObligationPath = path.join(
        processRoot,
        "obligations/pilot-verification-activity-required.yaml",
      );
      await fs.writeFile(
        activityObligationPath,
        (await fs.readFile(activityObligationPath, "utf8")).replace(
          /  - status: awaiting-review[\s\S]*?  - status: blocked/,
          "  - status: blocked",
        ),
      );
      await selectProcessPackageFixture(repository, processRoot);
      const loadedFixture = await loadProcessPackage(processRoot);
      if (!loadedFixture.ok) throw new Error(JSON.stringify(loadedFixture.diagnostics));

      const product = record("PSP", "PSP-0HARDENP10", {
        title: "Two-argument temperature converter",
        rationale: "Define the closed public command boundary.",
        problem: "Convert between an exact supported unit pair.",
        users: ["operator"],
        goals: ["accept exactly two arguments", "support only Celsius and Fahrenheit"],
        non_goals: ["other units", "additional arguments"],
        success_measures: ["supported conversions succeed and all other unit/count cases reject"],
      }, { scenario: "compile-psp@2" });
      const requirement = record("STK", "STK-0HARDENP10", {
        title: "Reject unsupported command forms",
        rationale: "Discriminate the closed public boundary.",
        statement: "The command shall reject wrong argument counts and unsupported units.",
        verification_intent: "Observe exact rejection for values outside the parent PSP boundary.",
        stakeholder: "operator",
        priority: "must",
        system_context: "product",
      }, {
        scenario: "draft-stakeholder-requirements@2",
        links: [{ type: "derived-from", target: product.datum.id }],
      });
      const currentStrategy = strategy(1);
      const acceptedIntent = record("BSL", "BSL-0HARDP110", {
        title: "Accepted exact temperature-converter intent",
        kind: "intent-approved",
        role: "accepted",
        scope: "phase-0-wayfinding",
        group: "DEFAULT",
        definition_members: [
          product.datum.revision_id,
          requirement.datum.revision_id,
        ],
        evidence: [],
      }, { scenario: "accept-phase-0-intent@1" });
      const fixtureRecords = repositorySafeRecords([
        product,
        requirement,
        currentStrategy,
        acceptedIntent,
      ]);
      const fixtureProcessRef = `mdlm-bootstrap@0.71.0#${await processPackageDigest(processRoot)}`;
      for (const item of fixtureRecords) {
        item.datum.created_by.process_ref = fixtureProcessRef;
      }
      const sourceRecords = fixtureRecords.slice(0, 3);
      const [sourceAcceptedIntent] = fixtureRecords.slice(3);
      const seeded = await publishScenarioMutation(
        repository,
        loadedFixture.package,
        [],
        sourceRecords.map((item) => item.datum),
        "phase-1-intent-support-fixture",
        { contract: "phase-1-intent-support-fixture@1" },
      );
      expect(seeded.ok, JSON.stringify(seeded.diagnostics)).toBe(true);
      const finalizedAcceptedIntent = await finalizeExactBaselineScenarioOutput(
        repository,
        loadedFixture.package,
        fixtureProcessRef,
        sourceAcceptedIntent!.datum,
      );
      expect(
        finalizedAcceptedIntent.ok,
        JSON.stringify(finalizedAcceptedIntent.diagnostics),
      ).toBe(true);
      if (!finalizedAcceptedIntent.ok) return;
      const acceptedIntentPublished = await publishScenarioMutation(
        repository,
        loadedFixture.package,
        sourceRecords.map((item) => item.datum),
        [finalizedAcceptedIntent.value.output.datum],
        "accept-phase-0-intent@1",
        { contract: "phase-1-intent-support-fixture@1" },
        [finalizedAcceptedIntent.value.output],
      );
      expect(
        acceptedIntentPublished.ok,
        JSON.stringify(acceptedIntentPublished.diagnostics),
      ).toBe(true);

      const prepared = prepareNextAssignment(
        repository,
        "write-verification-activity@2",
      );
      expect(inputRevisions(prepared, "intent_support")).toEqual([
        sourceRecords[0]!.datum.revision_id,
      ]);
      const requirementInput = prepared.packet.exactInputs[0]!.inputs.find(
        (input: { name: string }) => input.name === "requirement",
      )!.values[0]!.identity;
      const strategyRevision = inputRevision(prepared, "strategy");
      const submitted = submitAssignment(repository, prepared, [{
        localId: "activity",
        name: "activity",
        invocation: 0,
        lifecycleDatum: {
          type: "VER",
          payload: {
            title: "Exact supported and unsupported temperature command cases",
            rationale: "Exercise the accepted two-argument and closed-unit boundary.",
            kind: "pilot",
            method: "demonstration",
            assessment_mode: "witnessed",
            claim: {
              kind: "pilot",
              scope: "verification-design",
              formal_evidence_eligible: false,
            },
            acceptance_criteria: ["A supported two-argument conversion succeeds and wrong-count or unsupported-unit cases reject."],
            evidence_requirements: ["Retain exact exit status and output bytes for every case."],
            expected_success_activity: "Invoke one two-argument Celsius-to-Fahrenheit conversion.",
            expected_discrimination_activity: "Invoke wrong-count and unsupported-unit cases.",
          },
          links: [
            { type: "verifies", target: requirementInput.id },
            { type: "verifies-revision", target: requirementInput.revision_id },
            { type: "governed-by", target: strategyRevision },
            { type: "derived-from", target: sourceRecords[0]!.datum.revision_id },
          ],
          body: "Exercise only behavior stated by the exact STK and parent PSP.\n",
        },
      }]);
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      const stored = await readRepositoryData(repository, loadedFixture.package);
      if (!stored.ok) throw new Error(JSON.stringify(stored.diagnostics));
      const activity = stored.value.map((item) => item.lifecycleDatum).find(
        (record) => record.datum.type === "VER",
      );
      expect(activity?.datum.links).toContainEqual({
        type: "derived-from",
        target: sourceRecords[0]!.datum.revision_id,
      });
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(processRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("proves Phase 1 pilot VER publication with exact Stable Datum, Revision, strategy links, and Review support", () => {
    const acceptedFoundation = foundation();
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDVER0");
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const activity = pilotActivity();
    expect(validatePayload(processPackage, "VER", activity.datum.payload)).toBe(true);

    const evaluation = phase1Evaluation(processPackage, [
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      activity,
    ]);
    expect(activity.datum.links).toEqual([
      { type: "verifies", target: "STK-0HARDENP10" },
      { type: "verifies-revision", target: "STK-0HARDENP10-r00001" },
      { type: "governed-by", target: currentStrategy.datum.revision_id },
      { type: "derived-from", target: "PSP-0HARDENP10-r00001" },
    ]);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "pilot-verification-activity-required"
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));

    const unrelatedProduct = record("PSP", "PSP-0HARDENP11", {
      title: "Unrelated accepted product",
      rationale: "Prove candidate co-membership is not parentage.",
      kind: "software",
    }, { scenario: "compile-psp@2" });
    const acceptedWithUnrelatedProduct = record(
      "BSL",
      acceptedFoundation[2]!.datum.id,
      {
        ...acceptedFoundation[2]!.datum.payload,
        definition_members: [
          ...(acceptedFoundation[2]!.datum.payload.definition_members as string[]),
          unrelatedProduct.datum.revision_id,
        ],
      },
      { scenario: "accept-phase-0-intent@1" },
    );
    const exactParentSupport = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          acceptedFoundation[0]!,
          acceptedFoundation[1]!,
          unrelatedProduct,
          acceptedWithUnrelatedProduct,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "pilot-intent-support-for-requirement@1",
      { requirement: acceptedFoundation[1]!.datum.revision_id },
    );
    expect((exactParentSupport.result as Array<{
      identity: { revision_id: string };
    }>).map((item) => item.identity.revision_id)).toEqual([
      acceptedFoundation[0]!.datum.revision_id,
    ]);

    const advancedProduct = record(
      "PSP",
      acceptedFoundation[0]!.datum.id,
      { ...acceptedFoundation[0]!.datum.payload },
      { revision: 2, scenario: "compile-psp@2" },
    );
    const unreviewedIntentSupport = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...acceptedFoundation, advancedProduct],
        dependencyComparisons: [],
      },
      "selector",
      "pilot-intent-support-for-requirement@1",
      { requirement: acceptedFoundation[1]!.datum.revision_id },
    );
    expect((unreviewedIntentSupport.result as Array<{
      identity: { revision_id: string };
    }>).map((item) => item.identity.revision_id)).toEqual([
      acceptedFoundation[0]!.datum.revision_id,
    ]);

    const advancedAcceptedIntent = record(
      "BSL",
      acceptedFoundation[2]!.datum.id,
      {
        ...acceptedFoundation[2]!.datum.payload,
        definition_members: [
          advancedProduct.datum.revision_id,
          acceptedFoundation[1]!.datum.revision_id,
        ],
      },
      { revision: 2, scenario: "accept-phase-0-intent@1" },
    );
    const acceptedIntentSupport = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...acceptedFoundation,
          advancedProduct,
          advancedAcceptedIntent,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "pilot-intent-support-for-requirement@1",
      { requirement: acceptedFoundation[1]!.datum.revision_id },
    );
    expect((acceptedIntentSupport.result as Array<{
      identity: { revision_id: string };
    }>).map((item) => item.identity.revision_id)).toEqual([
      advancedProduct.datum.revision_id,
    ]);

    const staleActivitySelection = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...acceptedFoundation,
          advancedProduct,
          advancedAcceptedIntent,
          currentStrategy,
          activity,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "pilot-verification-activities-for-requirement@1",
      { requirement: acceptedFoundation[1]!.datum.revision_id },
    );
    expect(staleActivitySelection.result).toEqual([]);

    expect(evaluation.obligations.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === activity.datum.revision_id
    )).toEqual(expect.objectContaining({ status: "ready" }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "pilot-verification-implementation-required" &&
      item.subject === activity.datum.revision_id
    )).toEqual(expect.objectContaining({ status: "awaiting-review" }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "pilot-target-required"
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "register-pilot-target@1",
    }));

    const reviewMembers = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...acceptedFoundation, currentStrategy, ...strategyReview, activity],
        dependencyComparisons: [],
      },
      "selector",
      "review-context-members-for@1",
      { subject: activity.datum.revision_id },
    );
    expect((reviewMembers.result as Array<{ identity: { revision_id: string } }>)
      .map((item) => item.identity.revision_id)).toEqual([
        "PSP-0HARDENP10-r00001",
        "STK-0HARDENP10-r00001",
        currentStrategy.datum.revision_id,
      ]);

    const supportedProduct = acceptedFoundation[0]!;
    const supportedRequirement = acceptedFoundation[1]!;
    const [exactContext] = passingReview(activity, "REV-0HARDVER1", {
      definitions: [activity, supportedProduct, supportedRequirement, currentStrategy],
    });
    const recordsWithExactContext = [
      currentStrategy,
      ...strategyReview,
      activity,
      exactContext,
    ];
    const reviewRoute = phase1Evaluation(processPackage, recordsWithExactContext)
      .obligations.find((item) =>
        item.obligation === "passing-review-required" &&
        item.subject === activity.datum.revision_id
      );
    expect(reviewRoute).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: true,
      actionableResolver: "review-datum-in-context@2",
      id: expect.any(String),
    }));
    const [contextWithUnrelatedDefinition] = passingReview(
      activity,
      "REV-0HARDVER2",
      {
        definitions: [
          activity,
          supportedProduct,
          supportedRequirement,
          currentStrategy,
          strategyReview[0]!,
        ],
      },
    );
    const invalidExtraContext = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...foundation(),
          currentStrategy,
          ...strategyReview,
          activity,
          contextWithUnrelatedDefinition,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "valid-review-contexts-for@1",
      { subject: activity.datum.revision_id },
    );
    expect(invalidExtraContext.result).toEqual([]);

    const [contextWithUnrelatedComposition] = passingReview(
      activity,
      "REV-0HARDVER5",
      {
        definitions: [
          activity,
          supportedProduct,
          supportedRequirement,
          currentStrategy,
        ],
      },
    );
    contextWithUnrelatedComposition.datum.links.push({
      type: "composes",
      target: strategyReview[0]!.datum.revision_id,
    });
    const invalidComposedContext = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...foundation(),
          currentStrategy,
          ...strategyReview,
          activity,
          contextWithUnrelatedComposition,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "valid-review-contexts-for@1",
      { subject: activity.datum.revision_id },
    );
    expect(invalidComposedContext.result).toEqual([]);

    const malformed = pilotActivity();
    malformed.datum.links = malformed.datum.links.map((link) =>
      link.type === "verifies-revision"
        ? { ...link, target: "STK-0HARDENP10-r00002" }
        : link,
    );
    const selected = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...foundation(),
          currentStrategy,
          ...strategyReview,
          malformed,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "current-pilot-verification-activities@1",
      {},
    );
    expect(selected.result).toEqual([]);
  });

  it("proves a Phase 1 passing independent Review and exposes downstream assurance", () => {
    const currentStrategy = strategy(1);
    const [context, review] = passingReview(currentStrategy, "REV-0HARDPASS1");
    const before = phase1Evaluation(processPackage, [currentStrategy, context]);
    expect(evaluateScenarioParticipation(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), currentStrategy, context],
        dependencyComparisons: [],
      },
      "review-datum-in-context@2",
      [{
        subject: currentStrategy.datum.revision_id,
        review_context: context.datum.revision_id,
        context_members: [],
      }],
    )).toEqual([expect.objectContaining({
      authorityRequirement: expect.objectContaining({
        mode: "delegated",
        authority: "independent-reviewer",
      }),
      attentionSchedule: expect.objectContaining({ timing: "none" }),
    })]);
    expect(before.obligations.find((item) =>
      item.obligation === "environment-assurance-required"
    )).toEqual(expect.objectContaining({ status: "awaiting-review" }));

    const after = phase1Evaluation(processPackage, [currentStrategy, context, review]);
    expect(after.obligations.find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === currentStrategy.datum.revision_id
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(after.obligations.find((item) =>
      item.obligation === "environment-assurance-required"
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "realize-verification-environment@1",
    }));
    expect(review.datum.links).toEqual([
      { type: "reviews", target: currentStrategy.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ]);
  });

  it("proves the first VSP correction is an autonomous exact causal replacement", () => {
    const first = strategy(1);
    const failed = failedReview(first, "REV-0HARDVSP11");
    expect(correction(
      processPackage,
      [first, ...failed],
      "verification-strategy-review-correction-required",
      first.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "revise-verification-strategy-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "autonomous",
          authority: "package-evidence",
        }),
        attentionSchedule: expect.objectContaining({ timing: "none" }),
      })],
    }));

    const replacement = strategy(2, failed[1].datum.revision_id);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), first, ...failed, replacement],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-verification-strategy-revisions-for@1",
      { strategy: first.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: replacement.datum.revision_id }),
      }),
    ]);
    expect(replacement.datum.links).toContainEqual({
      type: "corrects-review",
      target: failed[1].datum.revision_id,
    });
  });

  it("proves the second VSP correction retains its distinct autonomous budget slot", () => {
    const first = strategy(1);
    const firstFailed = failedReview(first, "REV-0HARDVSP21");
    const second = strategy(2, firstFailed[1].datum.revision_id);
    const secondFailed = failedReview(second, "REV-0HARDVSP22");
    const beforeSecondCorrection = [first, ...firstFailed, second, ...secondFailed];
    expect(correction(
      processPackage,
      beforeSecondCorrection,
      "verification-strategy-review-correction-required",
      second.datum.revision_id,
    )).toEqual(expect.objectContaining({
      actionableResolver: "revise-verification-strategy-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
        attentionSchedule: expect.objectContaining({ timing: "none" }),
      })],
    }));

    const third = strategy(3, secondFailed[1].datum.revision_id);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...beforeSecondCorrection, third],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-verification-strategy-revisions-for@1",
      { strategy: second.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: third.datum.revision_id }),
      }),
    ]);
  });

  it("routes an exhausted VSP correction budget to immediate attended escalation", () => {
    const first = strategy(1);
    const firstFailed = failedReview(first, "REV-0HARDVSPE1");
    const second = strategy(2, firstFailed[1].datum.revision_id);
    const secondFailed = failedReview(second, "REV-0HARDVSPE2");
    const third = strategy(3, secondFailed[1].datum.revision_id);
    const thirdFailed = failedReview(third, "REV-0HARDVSPE3");
    expect(correction(
      processPackage,
      [first, ...firstFailed, second, ...secondFailed, third, ...thirdFailed],
      "verification-strategy-review-correction-required",
      third.datum.revision_id,
    )).toEqual(expect.objectContaining({
      actionableResolver: "revise-verification-strategy-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("proves ordinary ENV correction rebuilds the exact qualification boundary", () => {
    const currentStrategy = strategy(1);
    const first = environment(1);
    const failed = failedReview(first, "REV-0HARDENV1");
    expect(correction(
      processPackage,
      [currentStrategy, first, ...failed],
      "environment-review-correction-required",
      first.datum.revision_id,
    )).toEqual(expect.objectContaining({
      actionableResolver: "revise-environment-assurance-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
      })],
    }));

    const replacement = environment(2, failed[1].datum.revision_id);
    const rebuilt = qualificationEvidence(currentStrategy, replacement);
    const records = [
      currentStrategy,
      first,
      ...failed,
      replacement,
      rebuilt.activity,
      rebuilt.implementation,
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-environment-revisions-for@1",
      { environment: first.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: replacement.datum.revision_id }),
      }),
    ]);
    expect(rebuilt.activity.datum.links).toContainEqual({
      type: "qualifies",
      target: replacement.datum.revision_id,
    });
    expect(rebuilt.implementation.datum.links).toEqual(expect.arrayContaining([
      { type: "realizes", target: rebuilt.activity.datum.revision_id },
      { type: "uses", target: replacement.datum.revision_id },
      { type: "targets", target: replacement.datum.revision_id },
    ]));
    const profile = currentStrategy.datum.payload.environment_profile as {
      id: string;
      capabilities: Record<string, unknown>;
    };
    expect(replacement.datum.payload).toEqual(expect.objectContaining({
      strategy_revision: currentStrategy.datum.revision_id,
      profile_id: profile.id,
      capabilities: profile.capabilities,
    }));
  });

  it("routes an exhausted ENV correction budget to immediate attended escalation", () => {
    const currentStrategy = strategy(1);
    const first = environment(1);
    const firstFailed = failedReview(first, "REV-0HARDENVE1");
    const second = environment(2, firstFailed[1].datum.revision_id);
    const secondFailed = failedReview(second, "REV-0HARDENVE2");
    const third = environment(3, secondFailed[1].datum.revision_id);
    const thirdFailed = failedReview(third, "REV-0HARDENVE3");
    expect(correction(
      processPackage,
      [
        currentStrategy,
        first,
        ...firstFailed,
        second,
        ...secondFailed,
        third,
        ...thirdFailed,
      ],
      "environment-review-correction-required",
      third.datum.revision_id,
    )).toEqual(expect.objectContaining({
      actionableResolver: "revise-environment-assurance-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("routes stakeholder-owned ENV Review failure to immediate attended correction", () => {
    const currentStrategy = strategy(1);
    const currentEnvironment = environment();
    const review = failedReview(currentEnvironment, "REV-0HARDENVS1", {
      stakeholderOwned: true,
    });
    expect(correction(
      processPackage,
      [currentStrategy, currentEnvironment, ...review],
      "environment-review-correction-required",
      currentEnvironment.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-environment-assurance-after-review@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("proves ordinary pilot VER correction preserves the exact ENV", () => {
    const currentStrategy = strategy(1);
    const currentEnvironment = environment(1);
    const first = pilotActivity(1);
    const failed = failedReview(first, "REV-0HARDPVE1");
    const exactEnvironment = structuredClone(currentEnvironment);
    expect(correction(
      processPackage,
      [currentStrategy, currentEnvironment, first, ...failed],
      "pilot-verification-activity-review-correction-required",
      first.datum.revision_id,
    )).toEqual(expect.objectContaining({
      actionableResolver: "revise-pilot-verification-activity-after-review@3",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
      })],
    }));

    const replacement = pilotActivity(2, failed[1].datum.revision_id);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...foundation(),
          currentStrategy,
          currentEnvironment,
          first,
          ...failed,
          replacement,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-pilot-verification-activity-revisions-for@1",
      { activity: first.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: replacement.datum.revision_id }),
      }),
    ]);
    expect(currentEnvironment).toEqual(exactEnvironment);
    expect(replacement.datum.links).toContainEqual({
      type: "derived-from",
      target: "PSP-0HARDENP10-r00001",
    });
    expect(replacement.datum.links).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "uses" }),
    ]));
  });

  it("routes an exhausted pilot VER correction budget to immediate attended escalation", () => {
    const currentStrategy = strategy(1);
    const first = pilotActivity(1);
    const firstFailed = failedReview(first, "REV-0HARDPVEE1");
    const second = pilotActivity(2, firstFailed[1].datum.revision_id);
    const secondFailed = failedReview(second, "REV-0HARDPVEE2");
    const third = pilotActivity(3, secondFailed[1].datum.revision_id);
    const thirdFailed = failedReview(third, "REV-0HARDPVEE3");
    expect(correction(
      processPackage,
      [
        currentStrategy,
        first,
        ...firstFailed,
        second,
        ...secondFailed,
        third,
        ...thirdFailed,
      ],
      "pilot-verification-activity-review-correction-required",
      third.datum.revision_id,
    )).toEqual(expect.objectContaining({
      actionableResolver: "revise-pilot-verification-activity-after-review@3",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("rejects a malformed VSP replacement that does not cite the exact failed Review", () => {
    const first = strategy(1);
    const review = failedReview(first, "REV-0HARDENBAD");
    const malformedReplacement = strategy(2);
    const selected = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), first, ...review, malformedReplacement],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-verification-strategy-revisions-for@1",
      { strategy: first.datum.revision_id },
    );
    expect(selected.result).toEqual([]);
  });

  it("proves the Phase 1 multiple ENV boundary without selection or mutation", () => {
    const currentStrategy = strategy(1);
    const firstEnvironment = environment();
    const secondEnvironment = record("ENV", "ENV-0HARDENP11", {
      ...firstEnvironment.datum.payload,
      title: "Competing exact environment",
    }, {
      scenario: "realize-verification-environment@1",
      links: [{ type: "realizes", target: currentStrategy.datum.revision_id }],
    });
    const records = [currentStrategy, firstEnvironment, secondEnvironment];
    const exactState = structuredClone(records);
    const evaluation = phase1Evaluation(processPackage, records);
    expect(evaluation.terminalOutcome).toEqual(
      expect.objectContaining({
        outcome: "profile-boundary-reached",
        explanation: expect.stringMatching(/multiple applicable/i),
        evidence: expect.objectContaining({
          profile: "bootstrap@35",
          condition: expect.objectContaining({ result: true }),
        }),
      }),
    );
    expect(evaluation.terminalOutcome?.outcome).not.toBe("process-dead-end");
    expect(records).toEqual(exactState);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "complete-environment-assurance-for-strategy@1",
      { strategy: currentStrategy.datum.revision_id },
    ).result).toEqual([]);
  });

  it("proves the Phase 1 multiple pilot target boundary without selection or mutation", () => {
    const currentStrategy = strategy(1);
    const activity = pilotActivity();
    const firstTarget = target();
    const secondTarget = target("ART-0HARDENP11");
    const records = [currentStrategy, activity, firstTarget, secondTarget];
    const exactState = structuredClone(records);
    const evaluation = phase1Evaluation(processPackage, records);
    expect(evaluation.terminalOutcome).toEqual(
      expect.objectContaining({
        outcome: "profile-boundary-reached",
        explanation: expect.stringMatching(/multiple applicable/i),
        evidence: expect.objectContaining({
          profile: "bootstrap@35",
          condition: expect.objectContaining({ result: true }),
        }),
      }),
    );
    expect(evaluation.terminalOutcome?.outcome).not.toBe("process-dead-end");
    expect(records).toEqual(exactState);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "current-pilot-targets-for-requirement@1",
      { requirement: "STK-0HARDENP10-r00001" },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: firstTarget.datum.revision_id }),
      }),
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: secondTarget.datum.revision_id }),
      }),
    ]);
  });

  it("proves Phase 1 target registration against the target schema and advances to VAI work", () => {
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDTGT0");
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const environmentReview = passingReview(currentEnvironment, "REV-0HARDTGT1", {
      definitions: [currentEnvironment, currentStrategy],
      evidence: [
        qualification.activity,
        qualification.implementation,
        qualification.run,
        qualification.result,
      ],
    });
    const activity = pilotActivity();
    const activityReview = passingReview(activity, "REV-0HARDTGT2", {
      definitions: [activity, foundation()[0]!, foundation()[1]!, currentStrategy],
    });
    const exactTarget = target();
    expect(validatePayload(processPackage, "ART", exactTarget.datum.payload)).toBe(true);
    expect(exactTarget.datum.links).toEqual([
      { type: "derived-from", target: "STK-0HARDENP10-r00001" },
    ]);

    const records = [
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...environmentReview,
      activity,
      ...activityReview,
      exactTarget,
    ];
    const evaluation = phase1Evaluation(processPackage, records);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "pilot-target-required"
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "pilot-verification-implementation-required" &&
      item.subject === activity.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "implement-verification-activity@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "delegated",
          authority: "independent-verification-implementer",
        }),
      })],
    }));
  });

  it("delegates source-independent VAI implementation and yields fresh Review before run work", () => {
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDVAI0");
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const environmentReview = passingReview(currentEnvironment, "REV-0HARDVAI1", {
      definitions: [currentEnvironment, currentStrategy],
      evidence: [
        qualification.activity,
        qualification.implementation,
        qualification.run,
        qualification.result,
      ],
    });
    const activity = pilotActivity();
    const activityReview = passingReview(activity, "REV-0HARDVAI2", {
      definitions: [activity, foundation()[0]!, foundation()[1]!, currentStrategy],
    });
    const exactTarget = target();
    const records = [
      ...foundation(),
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...environmentReview,
      activity,
      ...activityReview,
      exactTarget,
    ];
    expect(evaluateScenarioParticipation(
      processPackage,
      { processRef, phaseId: "phase-1-product-assurance", records, dependencyComparisons: [] },
      "implement-verification-activity@1",
      [{
        activity: activity.datum.revision_id,
        environment: currentEnvironment.datum.revision_id,
        execution_target: exactTarget.datum.revision_id,
      }],
    )).toEqual([expect.objectContaining({
      authorityRequirement: expect.objectContaining({
        mode: "delegated",
        authority: "independent-verification-implementer",
      }),
      attentionSchedule: expect.objectContaining({ timing: "none" }),
    })]);

    const implementation = pilotImplementation();
    expect(validatePayload(processPackage, "VAI", implementation.datum.payload)).toBe(true);
    expect(implementation.datum.payload).toEqual(expect.objectContaining({
      independence_mode: "source-blind",
      prohibited_inputs_observed: expect.arrayContaining([
        "product source code",
        "product unit tests",
        "private implementation details",
      ]),
    }));
    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: [...records, implementation],
      dependencyComparisons: [],
    });
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "create-review-context@1",
    }));
    expect(evaluation.looseEnds.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      eventualResolver: "execute-verification-run@1",
    }));
  });

  it("executes and repository-validates exact RUN and RES outputs through the package Scenario", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-run-"));
    const processRoot = await copiedProcessPackage("mdlm-phase1-run-process-");
    try {
      const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
      const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
      await fs.writeFile(
        phase0Path,
        (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
      );
      let phase1 = await fs.readFile(phase1Path, "utf8");
      phase1 = phase1.replace("order: 1", "order: 0").replace(
        /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
        "scenarios:\n  - execute-verification-run@1\nobligations:\n  - verification-run-required@1\noutputs:",
      );
      await fs.writeFile(phase1Path, phase1);
      const obligationsRoot = path.join(processRoot, "obligations");
      for (const entry of await fs.readdir(obligationsRoot)) {
        if (entry === "verification-run-required.yaml" || !entry.endsWith(".yaml")) {
          continue;
        }
        const obligationPath = path.join(obligationsRoot, entry);
        const source = await fs.readFile(obligationPath, "utf8");
        await fs.writeFile(
          obligationPath,
          source
            .replace(
              "phases: [phase-1-product-assurance]",
              "phases: [phase-7-change-control]",
            )
            .replace("phase-1-product-assurance, ", "")
            .replace(", phase-1-product-assurance", ""),
        );
      }
      const profilePath = path.join(processRoot, "profiles/bootstrap.yaml");
      const profile = await fs.readFile(profilePath, "utf8");
      await fs.writeFile(
        profilePath,
        profile.replace(
          /  profile_boundary:\n    condition: >-[\s\S]*?\n    explanation:/,
          `  profile_boundary:\n    condition: >-\n      exists("verification-implementations-requiring-run@1", {})\n      && every("verification-implementations-requiring-run@1", {}, implementation =>\n        exists("completed-runs-for-implementation@1",\n          {implementation: implementation}))\n    explanation:`,
        ),
      );
      await selectProcessPackageFixture(repository, processRoot);
      const loadedFixture = await loadProcessPackage(processRoot);
      if (!loadedFixture.ok) throw new Error(JSON.stringify(loadedFixture.diagnostics));
      const fixturePackage = loadedFixture.package;

      const repositoryProduct = record("PSP", "PSP-0HARDENP10", {
        title: "Phase 1 product",
        rationale: "Bound exact public assurance.",
        problem: "Public commands require exact assurance.",
        users: ["operator"],
        goals: ["deterministic public behavior"],
        non_goals: ["private implementation assurance"],
        success_measures: ["all exact public cases discriminate"],
      }, { scenario: "compile-psp@2" });
      const repositoryRequirement = record(
        "STK",
        "STK-0HARDENP10",
        {
          title: "Public command requirement",
          rationale: "The supported command returns deterministic output.",
          statement: "The public command shall return deterministic output.",
          verification_intent: "Observe exact success and malformed rejection bytes.",
          stakeholder: "operator",
          priority: "must",
          system_context: "product",
        },
        {
        scenario: "draft-stakeholder-requirements@2",
        links: [{ type: "derived-from", target: repositoryProduct.datum.id }],
      },
      );
      const currentStrategy = strategy(1);
      const currentEnvironment = environment();
      const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
      const sourceRecords = repositorySafeRecords([
        repositoryProduct,
        repositoryRequirement,
        currentStrategy,
        currentEnvironment,
        qualification.activity,
        qualification.implementation,
      ]);
      const seeded = await publishScenarioMutation(
        repository,
        fixturePackage,
        [],
        sourceRecords.map((item) => item.datum),
        "phase-1-run-fixture",
        { contract: "phase-1-run-fixture@1" },
      );
      expect(seeded.ok, JSON.stringify(seeded.diagnostics)).toBe(true);

      const prepared = prepareNextAssignment(repository);
      expect({
        scenario: prepared.packet.scenario.reference,
        phase: prepared.outcome.phase,
        obligation: prepared.packet.obligation?.definition,
        enabledObligations: fixturePackage.phases["phase-1-product-assurance"]?.obligations,
      }).toEqual({
        scenario: "execute-verification-run@1",
        phase: "phase-1-product-assurance@5",
        obligation: "verification-run-required@1",
        enabledObligations: ["verification-run-required@1"],
      });
      const implementation = inputRevision(prepared, "implementation");
      const activity = inputRevision(prepared, "activity");
      const environmentRevision = inputRevision(prepared, "environment");
      const executionTarget = inputRevision(prepared, "execution_target");
      expect(executionTarget).toBe(environmentRevision);

      const evidence = [
        "case:normal:exit-0:stdout-b2sK:stderr-",
        "case:raw-malformed:exit-2:stdout-:stderr-bWFsZm9ybWVkCg==",
        "case:omitted-argument:exit-2:stdout-:stderr-cmVxdWlyZWQK",
        "case:extra-argument:exit-2:stdout-:stderr-ZXh0cmEK",
      ];
      const outputs: ProposedOutput[] = [{
        localId: "run",
        name: "run",
        invocation: 0,
        lifecycleDatum: {
          type: "RUN",
          payload: {
            title: "Observed exact qualification command run",
            kind: "qualification",
            started_at: "2026-01-01T00:01:00.000Z",
            completed_at: "2026-01-01T00:01:01.000Z",
            execution_state: "completed",
            execution_target: { kind: "environment", ref: executionTarget },
            runner_ref: "runner:phase-1-public-command",
            configuration_refs: [environmentRevision],
            activities_expected: [activity],
            activities_invoked: [activity],
            evidence_locations: evidence,
          },
          links: [
            { type: "executes", target: implementation },
            { type: "uses", target: environmentRevision },
            { type: "targets", target: executionTarget },
            { type: "produces", target: "$proposal.result.revision_id" },
          ],
          body: "Observed every exact qualification command case.\n",
        },
      }, {
        localId: "result",
        name: "result",
        invocation: 0,
        lifecycleDatum: {
          type: "RES",
          payload: {
            title: "Observed exact qualification result",
            claim: {
              kind: "qualification",
              scope: "environment-capability",
              outcome: "pass",
              formal_evidence_eligible: false,
            },
            assessment_state: "accepted",
            observations: {
              expected_success_observed: true,
              expected_discrimination_observed: true,
              details: "The exact normal and malformed cases produced distinct observations.",
            },
            evidence_refs: evidence,
            assessor_ref: "runner:phase-1-public-command",
          },
          links: [{ type: "assessed-in", target: environmentRevision }],
          body: "Assessed the observations from every exact command case.\n",
        },
      }];
      const dataRoot = path.join(repository, ".lifecycle/data");
      const beforeInvalid = await directoryDigest(dataRoot);
      const invalid = submitAssignment(repository, prepared, outputs.slice(0, 1));
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-output-cardinality-invalid" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      const executed = submitAssignment(repository, prepared, outputs);
      expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
      const execution = JSON.parse(executed.stdout).execution;
      expect(execution).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "execute-verification-run@1" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
        outputs: [
          expect.objectContaining({ name: "run", lifecycleDatum: expect.objectContaining({ type: "RUN" }) }),
          expect.objectContaining({ name: "result", lifecycleDatum: expect.objectContaining({ type: "RES" }) }),
        ],
      }));
      const doctor = mdlm(repository, "doctor", "--json");
      expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
      const listed = mdlm(repository, "list", "--json");
      expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
      const published = JSON.parse(listed.stdout).data.map(
        (item: { lifecycleDatum: { datum: LifecycleRecord["datum"] } }) =>
          item.lifecycleDatum.datum,
      ) as LifecycleRecord["datum"][];
      const run = published.find((item) =>
        item.revision_id === execution.outputs[0].lifecycleDatum.revisionId
      );
      const result = published.find((item) =>
        item.revision_id === execution.outputs[1].lifecycleDatum.revisionId
      );
      expect(run?.payload.activities_invoked).toEqual([activity]);
      expect(run?.links).toContainEqual({
        type: "produces",
        target: result?.revision_id,
      });
      expect(result?.payload.claim).toEqual(expect.objectContaining({ outcome: "pass" }));

      const next = mdlm(repository, "next");
      expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
      expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
        outcome: "profile-boundary-reached",
        phase: "phase-1-product-assurance@5",
        evidence: expect.objectContaining({
          condition: expect.objectContaining({ result: true }),
        }),
      }));
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, 60_000);

  it("proves Phase 1 malformed command matrix rejection for every required coverage class atomically", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-malformed-target-"));
    try {
      await selectProcessPackageFixture(repository, processPackage.root);
      const before = await readRepositoryData(repository, processPackage);
      expect(before.ok, JSON.stringify(before.diagnostics)).toBe(true);
      if (!before.ok) return;
      const expectedData = before.value.map((item) => item.lifecycleDatum.datum);

      for (const omittedKind of [
      "normal",
      "extra-argument",
      "omitted-argument",
      "raw-malformed",
    ]) {
    const valid = targetPayload();
    expect(validatePayload(processPackage, "ART", valid)).toBe(true);
    const malformed = structuredClone(valid) as Record<string, any>;
    const cases = malformed.public_interface.argument_cases as Array<{
      id: string;
      kind: string;
      expected_observation: Record<string, unknown>;
    }>;
    const omittedIndex = cases.findIndex((item) => item.kind === omittedKind);
    const retained = cases.find((item) => item.kind !== omittedKind);
    if (omittedIndex < 0 || !retained) throw new Error(`missing command case ${omittedKind}`);
    cases[omittedIndex] = {
      ...structuredClone(retained),
      id: `${retained.id}-duplicate`,
    };
    expect(cases).toHaveLength(4);
    expect(validatePayload(processPackage, "ART", malformed)).toBe(false);

        const malformedTarget = target(`ART-0HARDMTRX${omittedKind.length}`);
        malformedTarget.datum.payload = malformed;
        const publication = await publishScenarioMutation(
          repository,
          processPackage,
          expectedData,
          [...expectedData, malformedTarget.datum],
          `malformed-target-${omittedKind}`,
          { contract: "register-pilot-target@1" },
        );
        expect(publication.ok).toBe(false);
        expect(publication.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "datum-payload" }),
        ]));
        const after = await readRepositoryData(repository, processPackage);
        expect(after).toEqual(before);
      }
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
    }
  }, 45_000);

  it("proves Phase 1 VAI correction, fresh Review, and refusal of prior RUN and RES reuse", () => {
    const {
      currentStrategy,
      strategyReview,
      currentEnvironment,
      qualification,
      environmentReview,
      activity,
      activityReview,
      exactTarget,
      first,
      firstAuthorization,
      failed,
      priorExecution,
      replacement,
      replacementAuthorization,
      freshReview,
    } = correctedPilotImplementationFixture();
    const correctedBeforeReview = [
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...environmentReview,
      activity,
      ...activityReview,
      exactTarget,
      first,
      firstAuthorization,
      ...failed,
      replacement,
      replacementAuthorization,
      freshReview[0],
    ];
    const correctedEvaluation = phase1Evaluation(processPackage, correctedBeforeReview);
    expect(correctedEvaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === first.datum.revision_id
    )).toBeUndefined();
    expect(correctedEvaluation.obligations.find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === replacement.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: true,
      actionableResolver: "review-datum-in-context@2",
    }));
    expect(correctedEvaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === replacement.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      actionableResolver: "review-datum-in-context@2",
    }));

    const records = [
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...environmentReview,
      activity,
      ...activityReview,
      exactTarget,
      first,
      firstAuthorization,
      ...failed,
      priorExecution.run,
      priorExecution.result,
      replacement,
      replacementAuthorization,
      ...freshReview,
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-pilot-verification-implementation-revisions-for@1",
      { implementation: first.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: replacement.datum.revision_id }),
      }),
    ]);
    expect(replacement.datum.payload.activity_bindings).not.toEqual(
      first.datum.payload.activity_bindings,
    );
    replacement.datum.links.push({
      type: "corrects-review",
      target: freshReview[1].datum.revision_id,
    });
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-pilot-verification-implementation-revisions-for@1",
      { implementation: first.datum.revision_id },
    ).result).toEqual([]);
    freshReview[1].integrity.hash_valid = false;
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-pilot-verification-implementation-revisions-for@1",
      { implementation: first.datum.revision_id },
    ).result).toEqual([]);
    freshReview[1].integrity.hash_valid = true;
    replacement.datum.links.pop();
    expect(replacement.datum.links).toEqual(expect.arrayContaining([
      { type: "realizes", target: activity.datum.revision_id },
      { type: "uses", target: currentEnvironment.datum.revision_id },
      { type: "targets", target: exactTarget.datum.revision_id },
      { type: "corrects-review", target: failed[1].datum.revision_id },
    ]));
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "completed-runs-for-implementation@1",
      { implementation: replacement.datum.revision_id },
    ).result).toEqual([]);
    const reviewedEvaluation = phase1Evaluation(processPackage, records);
    expect(reviewedEvaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === first.datum.revision_id
    )).toBeUndefined();
    expect(reviewedEvaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === replacement.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
    }));

    const replacementExecution = pilotRun(replacement, { idSuffix: "NEWVAI" });
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [
          ...foundation(),
          ...records,
          replacementExecution.run,
          replacementExecution.result,
        ],
        dependencyComparisons: [],
      },
      "selector",
      "completed-runs-for-implementation@1",
      { implementation: replacement.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: replacementExecution.run.datum.revision_id,
        }),
      }),
    ]);
  });

  it("allocates Review of corrected VAI r2 instead of a run for failed superseded r1", async () => {
    const repository = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-phase1-vai-correction-"),
    );
    const processRoot = await copiedProcessPackage(
      "mdlm-phase1-vai-correction-process-",
    );
    try {
      const phase0Path = path.join(
        processRoot,
        "phases/phase-0-wayfinding.yaml",
      );
      const phase1Path = path.join(
        processRoot,
        "phases/phase-1-product-assurance.yaml",
      );
      const implementationObligationPath = path.join(
        processRoot,
        "obligations/pilot-verification-implementation-required.yaml",
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
        phase1Path,
        (await fs.readFile(phase1Path, "utf8"))
          .replace("order: 1", "order: 0")
          .replace(
            /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
            "scenarios:\n  - review-datum-in-context@2\n  - execute-verification-run@1\n" +
              "obligations:\n  - passing-review-required@2\n  - verification-run-required@1\noutputs:",
          ),
      );
      await fs.writeFile(
        implementationObligationPath,
        (await fs.readFile(implementationObligationPath, "utf8")).replace(
          "satisfied_when: 'exists(\"complete-pilot-implementations-for-activity@1\", {activity: activity})'",
          "satisfied_when: 'true'",
        ),
      );
      await fs.writeFile(
        reviewSubjectsPath,
        (await fs.readFile(reviewSubjectsPath, "utf8")).replace(
          "types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS]",
          "types: [VSP, ENV, VER, VAI]",
        ),
      );
      await selectProcessPackageFixture(repository, processRoot);
      const loadedFixture = await loadProcessPackage(processRoot);
      if (!loadedFixture.ok)
        throw new Error(JSON.stringify(loadedFixture.diagnostics));

      const product = record(
        "PSP",
        "PSP-0HARDENP10",
        {
          title: "Phase 1 product",
          rationale: "Bound exact public assurance.",
          problem: "Public commands require exact assurance.",
          users: ["operator"],
          goals: ["deterministic public behavior"],
          non_goals: ["private implementation assurance"],
          success_measures: ["all exact public cases discriminate"],
        },
        { scenario: "compile-psp@2" },
      );
      const requirement = record(
        "STK",
        "STK-0HARDENP10",
        {
          title: "Public command requirement",
          rationale: "The supported command returns deterministic output.",
          statement: "The public command shall return deterministic output.",
          verification_intent:
            "Observe exact success and malformed rejection bytes.",
          stakeholder: "operator",
          priority: "must",
          system_context: "product",
        },
        {
          scenario: "draft-stakeholder-requirements@2",
          links: [{ type: "derived-from", target: product.datum.id }],
        },
      );
      const {
        currentStrategy,
        strategyReview,
        currentEnvironment,
        qualification,
        environmentReview,
        activity,
        activityReview,
        exactTarget,
        first,
        failed,
        replacement,
        freshReview,
      } = correctedPilotImplementationFixture();
      const replacementContext = freshReview[0];
      const sourceRecords = repositorySafeRecords([
        product,
        requirement,
        currentStrategy,
        ...strategyReview,
        currentEnvironment,
        qualification.activity,
        qualification.implementation,
        qualification.run,
        qualification.result,
        ...environmentReview,
        activity,
        ...activityReview,
        exactTarget,
        first,
        ...failed,
        replacement,
        replacementContext,
      ]);
      const fixtureProcessRef = `mdlm-bootstrap@0.71.0#${await processPackageDigest(processRoot)}`;
      for (const item of sourceRecords) {
        item.datum.created_by.process_ref = fixtureProcessRef;
      }
      const replacementRevision = sourceRecords.find(
        (item) => item.datum.type === "VAI" && item.datum.revision === 2,
      )!.datum.revision_id;
      const pilotActivityRevision = sourceRecords.find(
        (item) => item.datum.type === "VER" && item.datum.payload.kind === "pilot",
      )!.datum.revision_id;
      const productRevision = sourceRecords.find(
        (item) => item.datum.type === "PSP",
      )!.datum.revision_id;
      const requirementRevision = sourceRecords.find(
        (item) => item.datum.type === "STK",
      )!.datum.revision_id;
      const environmentRevision = sourceRecords.find(
        (item) => item.datum.type === "ENV",
      )!.datum.revision_id;
      const strategyRevision = sourceRecords.find(
        (item) => item.datum.type === "VSP",
      )!.datum.revision_id;
      const baseRecords = sourceRecords.filter(
        (item) =>
          item.datum.type !== "BSL" &&
          item.datum.type !== "REV" &&
          item.datum.revision_id !== replacementRevision &&
          !item.datum.links.some((link) => link.target === replacementRevision),
      );
      const initialContexts = sourceRecords.filter(
        (item) =>
          item.datum.type === "BSL" &&
          item.datum.payload.scope !== replacementRevision,
      );
      const pilotContext = initialContexts.find(
        (item) => item.datum.payload.scope === pilotActivityRevision,
      )!;
      const pilotReviewRepository = await fs.mkdtemp(
        path.join(os.tmpdir(), "mdlm-phase1-ver-review-"),
      );
      const pilotReviewProcessParent = await fs.mkdtemp(
        path.join(os.tmpdir(), "mdlm-phase1-ver-review-process-"),
      );
      const pilotReviewProcessRoot = path.join(
        pilotReviewProcessParent,
        "process",
      );
      await fs.cp(processRoot, pilotReviewProcessRoot, { recursive: true });
      const pilotReviewSubjectsPath = path.join(
        pilotReviewProcessRoot,
        "selectors/review-required-revisions.yaml",
      );
      try {
        await fs.writeFile(
          pilotReviewSubjectsPath,
          (await fs.readFile(pilotReviewSubjectsPath, "utf8")).replace(
            "types: [VSP, ENV, VER, VAI]",
            "types: [ENV, VER]",
          ),
        );
        await selectProcessPackageFixture(
          pilotReviewRepository,
          pilotReviewProcessRoot,
        );
        const pilotReviewPackage = await loadProcessPackage(
          pilotReviewProcessRoot,
        );
        if (!pilotReviewPackage.ok) {
          throw new Error(JSON.stringify(pilotReviewPackage.diagnostics));
        }
        const pilotReviewProcessRef = `mdlm-bootstrap@0.71.0#${await processPackageDigest(pilotReviewProcessRoot)}`;
        const pilotReviewRecords = structuredClone(baseRecords);
        for (const item of pilotReviewRecords) {
          item.datum.created_by.process_ref = pilotReviewProcessRef;
        }
        const basePublication = await publishScenarioMutation(
          pilotReviewRepository,
          pilotReviewPackage.package,
          [],
          pilotReviewRecords.map((item) => item.datum),
          "phase-1-ver-review-base",
          { contract: "phase-1-ver-review-fixture@1" },
        );
        if (!basePublication.ok) {
          throw new Error(JSON.stringify(basePublication.diagnostics));
        }
        const environmentContext = initialContexts.find(
          (item) => item.datum.payload.scope === environmentRevision,
        )!;
        const finalizedContexts = [];
        for (const sourceContext of [environmentContext, pilotContext]) {
          const exactContext = structuredClone(sourceContext.datum);
          exactContext.created_by.process_ref = pilotReviewProcessRef;
          const finalized = await finalizeExactBaselineScenarioOutput(
            pilotReviewRepository,
            pilotReviewPackage.package,
            pilotReviewProcessRef,
            exactContext,
          );
          if (!finalized.ok) {
            throw new Error(JSON.stringify(finalized.diagnostics));
          }
          finalizedContexts.push(finalized.value.output);
        }
        const contextPublication = await publishScenarioMutation(
          pilotReviewRepository,
          pilotReviewPackage.package,
          pilotReviewRecords.map((item) => item.datum),
          finalizedContexts.map((item) => item.datum),
          "phase-1-ver-review-contexts",
          { contract: "phase-1-ver-review-fixture@1" },
          finalizedContexts,
        );
        if (!contextPublication.ok) {
          throw new Error(JSON.stringify(contextPublication.diagnostics));
        }
        const preparedEnvironmentReview = prepareNextAssignment(
          pilotReviewRepository,
          "review-datum-in-context@2",
        );
        expect(inputRevision(preparedEnvironmentReview, "subject")).toBe(
          environmentRevision,
        );
        const environmentReviewRecord = sourceRecords.find(
          (item) =>
            item.datum.type === "REV" &&
            item.datum.links.some(
              (link) =>
                link.type === "reviews" && link.target === environmentRevision,
            ),
        )!;
        const environmentReviewSubmission = submitAssignment(
          pilotReviewRepository,
          preparedEnvironmentReview,
          [
            {
              localId: "review",
              name: "review",
              invocation: 0,
              lifecycleDatum: {
                type: "REV",
                payload: environmentReviewRecord.datum.payload,
                links: environmentReviewRecord.datum.links,
                body: environmentReviewRecord.datum.body,
              },
            },
          ],
        );
        expect(
          environmentReviewSubmission.status,
          `${environmentReviewSubmission.stderr}${environmentReviewSubmission.stdout}`,
        ).toBe(0);
        const preparedPilotReview = prepareNextAssignment(
          pilotReviewRepository,
          "review-datum-in-context@2",
        );
        expect(inputRevision(preparedPilotReview, "subject")).toBe(
          pilotActivityRevision,
        );
        expect(inputRevisions(preparedPilotReview, "context_members")).toEqual([
          productRevision,
          requirementRevision,
          strategyRevision,
        ]);
        expect(
          preparedPilotReview.packet.allowedProjections.inputSchemas.map(
            (schema: { type: string }) => schema.type,
          ),
        ).toEqual(["BSL", "PSP", "STK", "VER", "VSP"]);
        const projectedVerSchema =
          preparedPilotReview.packet.allowedProjections.inputSchemas.find(
            (schema: { type: string }) => schema.type === "VER",
          );
        expect(projectedVerSchema).toEqual(
          expect.objectContaining({
            envelope: expect.objectContaining({ type: "object" }),
            payload: expect.objectContaining({
              required: expect.arrayContaining([
                "claim",
                "acceptance_criteria",
                "evidence_requirements",
              ]),
            }),
            outgoingLinks: expect.arrayContaining([
              expect.objectContaining({ id: "governed-by" }),
              expect.objectContaining({ id: "verifies-revision" }),
            ]),
          }),
        );
      } finally {
        await Promise.all([
          fs.rm(pilotReviewRepository, { recursive: true, force: true }),
          fs.rm(pilotReviewProcessParent, { recursive: true, force: true }),
        ]);
      }
      const reviews = sourceRecords.filter((item) => item.datum.type === "REV");
      const replacementRecords = sourceRecords.filter(
        (item) =>
          item.datum.revision_id === replacementRevision ||
          (item.datum.type !== "BSL" &&
            item.datum.type !== "REV" &&
            item.datum.links.some(
              (link) => link.target === replacementRevision,
            )),
      );
      const replacementContextRecord = sourceRecords.find(
        (item) =>
          item.datum.type === "BSL" &&
          item.datum.payload.scope === replacementRevision,
      )!;
      let stored: LifecycleRecord["datum"][] = [];
      const publishFixtureRecords = async (
        records: LifecycleRecord["datum"][],
        executionId: string,
        finalized: Array<{
          capability: "exact-baseline@1";
          datum: LifecycleRecord["datum"];
        }> = [],
      ) => {
        const publication = await publishScenarioMutation(
          repository,
          loadedFixture.package,
          stored,
          records,
          executionId,
          { contract: "phase-1-vai-correction-fixture@1" },
          finalized,
        );
        if (!publication.ok)
          throw new Error(JSON.stringify(publication.diagnostics));
        stored = [...stored, ...records];
      };
      await publishFixtureRecords(
        baseRecords.map((item) => item.datum),
        "phase-1-vai-correction-base",
      );
      const finalizedInitialContexts = [];
      for (const context of initialContexts) {
        const contextReview = reviews.find((review) =>
          review.datum.links.some(
            (link) =>
              link.type === "contextualizes" &&
              link.target === context.datum.revision_id,
          ),
        );
        const subjectRevision = contextReview?.datum.links.find(
          (link) => link.type === "reviews",
        )?.target;
        const subjectRecord = sourceRecords.find(
          (item) => item.datum.revision_id === subjectRevision,
        );
        if (subjectRecord?.datum.type === "VAI") {
          context.datum.payload.definition_members = [subjectRevision];
          context.datum.payload.evidence = [];
          delete context.datum.payload.snapshot;
        } else if (subjectRecord?.datum.type === "VSP") {
          const governedRequirement = subjectRecord.datum.links.find(
            (link) => link.type === "governs-revision",
          )?.target;
          context.datum.payload.definition_members = [
            subjectRevision,
            ...(governedRequirement ? [governedRequirement] : []),
          ];
          context.datum.payload.evidence = [];
          delete context.datum.payload.snapshot;
        }
        const finalized = await finalizeExactBaselineScenarioOutput(
          repository,
          loadedFixture.package,
          fixtureProcessRef,
          context.datum,
        );
        if (!finalized.ok)
          throw new Error(JSON.stringify(finalized.diagnostics));
        finalizedInitialContexts.push(finalized.value.output);
      }
      await publishFixtureRecords(
        finalizedInitialContexts.map((item) => item.datum),
        "phase-1-vai-correction-contexts",
        finalizedInitialContexts,
      );
      const pendingReviews = [...reviews];
      let failedReviewRevision: string | undefined;
      while (pendingReviews.length > 0) {
        const prepared = prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
        const subject = inputRevision(prepared, "subject");
        const reviewIndex = pendingReviews.findIndex((item) =>
          item.datum.links.some((link) =>
            link.type === "reviews" && link.target === subject
          )
        );
        expect(reviewIndex).toBeGreaterThanOrEqual(0);
        const review = pendingReviews.splice(reviewIndex, 1)[0]!;
        const submitted = submitAssignment(repository, prepared, [{
          localId: "review",
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: review.datum.payload,
            links: review.datum.links,
            body: review.datum.body,
          },
        }]);
        expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
        if (review.datum.payload.outcome === "fail") {
          failedReviewRevision = JSON.parse(submitted.stdout).execution.outputs[0]
            .lifecycleDatum.revisionId;
          break;
        }
      }
      expect(failedReviewRevision).toMatch(/^REV-.*-r00001$/);
      const replacementRecord = replacementRecords.find(
        (item) => item.datum.type === "VAI",
      )!;
      const authorizationRecord = implementationAuthorization(
        replacementRecord,
        "DEC-0HARDVAICORRECTION",
      );
      const correctionLink = replacementRecord.datum.links.find(
        (link) => link.type === "corrects-review",
      )!;
      correctionLink.target = failedReviewRevision!;
      const preparedCorrection = prepareNextAssignment(
        repository,
        "revise-pilot-vai-after-review@1",
      );
      expect(inputRevision(preparedCorrection, "implementation")).not.toBe(
        replacementRevision,
      );
      expect(inputRevisions(preparedCorrection, "failed_reviews")).toEqual([
        failedReviewRevision,
      ]);
      const correctionSubmission = submitAssignment(
        repository,
        preparedCorrection,
        [
          {
            localId: "replacement",
            name: "replacement",
            invocation: 0,
            lifecycleDatum: {
              id: replacementRecord.datum.id,
              type: "VAI",
              payload: replacementRecord.datum.payload,
              links: replacementRecord.datum.links,
              body: replacementRecord.datum.body,
            },
          },
          {
            localId: "authorization",
            name: "authorization",
            invocation: 0,
            lifecycleDatum: {
              type: "DEC",
              payload: {
                ...authorizationRecord.datum.payload,
                effective_scope: replacementRevision,
              },
              links: [{
                type: "justifies",
                target: "$proposal.replacement.revision_id",
              }],
              body: authorizationRecord.datum.body,
            },
          },
        ],
      );
      expect(
        correctionSubmission.status,
        `${correctionSubmission.stderr}${correctionSubmission.stdout}`,
      ).toBe(0);
      expect(
        JSON.parse(correctionSubmission.stdout).execution.outputs.find(
          (output: { name: string }) => output.name === "replacement",
        ).lifecycleDatum.revisionId,
      ).toBe(replacementRevision);
      const afterReviews = await readRepositoryData(repository, loadedFixture.package);
      if (!afterReviews.ok) throw new Error(JSON.stringify(afterReviews.diagnostics));
      stored = afterReviews.value.map((item) => item.lifecycleDatum.datum);
      replacementContextRecord.datum.payload.definition_members = [
        replacementRevision,
      ];
      replacementContextRecord.datum.payload.evidence = [];
      delete replacementContextRecord.datum.payload.snapshot;
      const finalizedReplacementContext =
        await finalizeExactBaselineScenarioOutput(
          repository,
          loadedFixture.package,
          fixtureProcessRef,
          replacementContextRecord.datum,
        );
      if (!finalizedReplacementContext.ok) {
        throw new Error(
          JSON.stringify(finalizedReplacementContext.diagnostics),
        );
      }
      await publishFixtureRecords(
        [finalizedReplacementContext.value.output.datum],
        "phase-1-vai-correction-r2-context",
        [finalizedReplacementContext.value.output],
      );

      const firstRevision = sourceRecords.find(
        (item) =>
          item.datum.type === "VAI" &&
          item.datum.revision === 1 &&
          item.datum.payload.kind === "pilot",
      )!.datum.revision_id;
      const looseEnds = mdlm(repository, "loose-ends", "--json");
      expect(looseEnds.status, `${looseEnds.stderr}${looseEnds.stdout}`).toBe(
        0,
      );
      const items = JSON.parse(looseEnds.stdout).looseEnds.items as Array<{
        obligation: string;
        subject: string;
        dispatchable: boolean;
      }>;
      expect(
        items.find(
          (item) =>
            item.obligation === "verification-run-required" &&
            item.subject === firstRevision,
        ),
      ).toBeUndefined();

      const prepared = prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
      expect(inputRevision(prepared, "subject")).toBe(replacementRevision);
      expect(prepared.packet.obligation.instance).toContain(
        replacementRevision,
      );
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, 120_000);

  it("keeps a completed setup-failure run without treating it as exercised pilot evidence", () => {
    const currentStrategy = strategy(1);
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const activity = pilotActivity();
    const implementation = pilotImplementation();
    const setupFailure = pilotRun(implementation, {
      noProductExercise: true,
      idSuffix: "SETUP1",
    });
    expect(validatePayload(processPackage, "RUN", setupFailure.run.datum.payload)).toBe(true);
    expect(validatePayload(processPackage, "RES", setupFailure.result.datum.payload)).toBe(true);
    const records = [
      ...foundation(),
      currentStrategy,
      ...passingReview(currentStrategy, "REV-0HARDSETU0"),
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...passingReview(currentEnvironment, "REV-0HARDSETU1", {
        definitions: [currentEnvironment, currentStrategy],
        evidence: [qualification.activity, qualification.implementation, qualification.run, qualification.result],
      }),
      activity,
      ...passingReview(activity, "REV-0HARDSETU2", {
        definitions: [activity, foundation()[0]!, foundation()[1]!, currentStrategy],
      }),
      target(),
      implementation,
      implementationAuthorization(implementation, "DEC-0HARDSETU1"),
      ...passingReview(implementation, "REV-0HARDSETU3"),
      setupFailure.run,
      setupFailure.result,
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      { processRef, phaseId: "phase-1-product-assurance", records, dependencyComparisons: [] },
      "selector",
      "completed-runs-for-implementation@1",
      { implementation: implementation.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: setupFailure.run.datum.revision_id }),
      }),
    ]);

    const evaluation = phase1Evaluation(processPackage, records);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      satisfied: false,
      actionableResolver: "execute-verification-run@1",
    }));
    expect(evaluation.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-2-system-definition",
      ready: false,
      complete: false,
    }));

    const exercised = pilotRun(implementation, { idSuffix: "SETUP2" });
    const completedEvaluation = phase1Evaluation(processPackage, [
      ...records,
      exercised.run,
      exercised.result,
    ]);
    expect(completedEvaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "satisfied",
      satisfied: true,
    }));
    expect(completedEvaluation.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-2-system-definition",
      ready: true,
    }));
  });

  it("retries after a durable all-not-launched run and progresses only after exercised evidence through the public CLI", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-no-exercise-"));
    const processRoot = await copiedProcessPackage("mdlm-phase1-no-exercise-process-");
    try {
      const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
      const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
      await fs.writeFile(
        phase0Path,
        (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
      );
      let phase1 = await fs.readFile(phase1Path, "utf8");
      phase1 = phase1.replace("order: 1", "order: 0").replace(
        /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
        "scenarios:\n  - execute-verification-run@1\nobligations:\n  - verification-run-required@1\noutputs:",
      );
      await fs.writeFile(phase1Path, phase1);
      const runObligationPath = path.join(
        processRoot,
        "obligations/verification-run-required.yaml",
      );
      await fs.writeFile(
        runObligationPath,
        (await fs.readFile(runObligationPath, "utf8")).replace(
          /status_rules:[\s\S]*?default_status:/,
          `status_rules:\n  - status: ready\n    priority: 100\n    when: 'implementation.payload.kind in ["qualification", "pilot"]'\n    reason: The isolated public route permits a bounded execution.\ndefault_status:`,
        ),
      );
      const profilePath = path.join(processRoot, "profiles/bootstrap.yaml");
      await fs.writeFile(
        profilePath,
        (await fs.readFile(profilePath, "utf8")).replace(
          /  profile_boundary:\n    condition: >-[\s\S]*?\n    explanation:/,
          `  profile_boundary:\n    condition: >-\n      exists("verification-implementations-requiring-run@1", {})\n      && every("verification-implementations-requiring-run@1", {}, implementation =>\n        implementation.payload.kind != "pilot"\n        || exists("exercised-pilot-runs-for-implementation@1",\n          {implementation: implementation}))\n    explanation:`,
        ),
      );
      await selectProcessPackageFixture(repository, processRoot);
      const loadedFixture = await loadProcessPackage(processRoot);
      if (!loadedFixture.ok) throw new Error(JSON.stringify(loadedFixture.diagnostics));

      const product = record("PSP", "PSP-0HARDENP10", {
        title: "Bounded pilot product",
        rationale: "Provide exact intent for the pilot route.",
        problem: "Discriminate supported and unsupported public commands.",
        users: ["operator"],
        goals: ["exercise supported and unsupported behavior"],
        non_goals: ["source inspection"],
        success_measures: ["both behavior classes are observed"],
      }, { scenario: "compile-psp@2" });
      const requirement = record("STK", "STK-0HARDENP10", {
        title: "Public command discrimination",
        rationale: "Require observed public behavior.",
        statement: "The public command shall distinguish supported and unsupported cases.",
        verification_intent: "Observe both behavior classes.",
        stakeholder: "operator",
        priority: "must",
        system_context: "product",
      }, {
        scenario: "draft-stakeholder-requirements@2",
        links: [{ type: "derived-from", target: product.datum.id }],
      });
      const sourceRecords = repositorySafeRecords([
        product,
        requirement,
        strategy(1),
        environment(),
        pilotActivity(),
        target(),
        pilotImplementation(),
      ]);
      const seeded = await publishScenarioMutation(
        repository,
        loadedFixture.package,
        [],
        sourceRecords.map((item) => item.datum),
        "phase-1-no-exercise-fixture",
        { contract: "phase-1-no-exercise-fixture@1" },
      );
      expect(seeded.ok, JSON.stringify(seeded.diagnostics)).toBe(true);

      const first = prepareNextAssignment(repository, "execute-verification-run@1");
      const implementation = inputRevision(first, "implementation");
      const activity = inputRevision(first, "activity");
      const environmentRevision = inputRevision(first, "environment");
      const executionTarget = inputRevision(first, "execution_target");
      const proposal = (
        suitable: boolean,
        evidence: string[],
      ): ProposedOutput[] => [{
        localId: "run",
        name: "run",
        invocation: 0,
        lifecycleDatum: {
          type: "RUN",
          payload: {
            title: suitable ? "Exercised pilot run" : "Completed setup-failure procedure",
            kind: "pilot",
            started_at: suitable ? "2026-01-01T00:02:00.000Z" : "2026-01-01T00:01:00.000Z",
            completed_at: suitable ? "2026-01-01T00:02:01.000Z" : "2026-01-01T00:01:01.000Z",
            execution_state: "completed",
            execution_target: { kind: "prototype", ref: executionTarget },
            runner_ref: "runner:phase-1-public-command",
            configuration_refs: [environmentRevision],
            activities_expected: [activity],
            activities_invoked: [activity],
            evidence_locations: evidence,
          },
          links: [
            { type: "executes", target: implementation },
            { type: "uses", target: environmentRevision },
            { type: "targets", target: executionTarget },
            { type: "produces", target: "$proposal.result.revision_id" },
          ],
          body: suitable
            ? "The product launched and both behavior classes were exercised.\n"
            : "Mandatory setup failed before product launch; every target case was not launched.\n",
        },
      }, {
        localId: "result",
        name: "result",
        invocation: 0,
        lifecycleDatum: {
          type: "RES",
          payload: {
            title: suitable ? "Suitable exercised pilot result" : "Inconclusive setup-failure result",
            claim: {
              kind: "pilot",
              scope: "verification-design",
              outcome: suitable ? "suitable" : "inconclusive",
              formal_evidence_eligible: false,
            },
            assessment_state: suitable ? "accepted" : "assessment-required",
            observations: {
              expected_success_observed: suitable,
              expected_discrimination_observed: suitable,
              details: suitable
                ? "Supported behavior succeeded and intentionally unsupported behavior rejected."
                : "No product process launched and every target case was not launched.",
            },
            evidence_refs: evidence,
            assessor_ref: "runner:phase-1-public-command",
          },
          links: [{ type: "assessed-in", target: environmentRevision }],
          body: suitable
            ? "Both declared behavior classes were observed.\n"
            : "This is durable setup-failure evidence, not pilot success.\n",
        },
      }];

      const noExerciseEvidence = ["setup:containment-unavailable", "case:all:not-launched"];
      const inconclusive = submitAssignment(
        repository,
        first,
        proposal(false, noExerciseEvidence),
      );
      expect(inconclusive.status, `${inconclusive.stderr}${inconclusive.stdout}`).toBe(0);
      const retry = prepareNextAssignment(repository, "execute-verification-run@1");
      expect(inputRevision(retry, "implementation")).toBe(implementation);
      expect(retry.packet.prompt).toEqual(expect.objectContaining({
        reference: "prompts/execute-verification-run.md@2",
        content: expect.stringContaining(
          "A completed RUN means the bounded runner procedure completed",
        ),
      }));

      const exercisedEvidence = ["case:supported:exit-0", "case:unsupported:exit-2"];
      const exercised = submitAssignment(
        repository,
        retry,
        proposal(true, exercisedEvidence),
      );
      expect(exercised.status, `${exercised.stderr}${exercised.stdout}`).toBe(0);
      const stored = await readRepositoryData(repository, loadedFixture.package);
      if (!stored.ok) throw new Error(JSON.stringify(stored.diagnostics));
      const repositoryRecords = stored.value.map((item) => item.lifecycleDatum);
      const fixtureProcessRef = `mdlm-bootstrap@0.71.0#${await processPackageDigest(processRoot)}`;
      const evaluation = evaluateLifecycle(loadedFixture.package, {
        processRef: fixtureProcessRef,
        phaseId: "phase-1-product-assurance",
        records: repositoryRecords,
        dependencyComparisons: [],
      });
      expect(evaluateProcessDefinition(
        loadedFixture.package,
        {
          processRef: fixtureProcessRef,
          phaseId: "phase-1-product-assurance",
          records: repositoryRecords,
          dependencyComparisons: [],
        },
        "selector",
        "exercised-pilot-runs-for-implementation@1",
        { implementation },
      ).result).toHaveLength(1);
      expect(evaluation.obligations.find((item) =>
        item.obligation === "verification-run-required" &&
        item.subject === implementation
      )).toEqual(expect.objectContaining({
        status: "satisfied",
        satisfied: true,
      }));
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, 60_000);

  it("executes timeout cleanup and continues aggregation with the subsequent case", () => {
    if (!["darwin", "linux"].includes(process.platform)) return;
    const runner = path.join(process.cwd(), "scripts/frontier-process-group.mjs");
    const stubbornGroup = `
const { spawn } = require("node:child_process");
process.on("SIGTERM", () => process.stdout.write("parent-term-observed\\n"));
const descendant = spawn(process.execPath, ["-e", ${JSON.stringify(`
process.on("SIGTERM", () => process.stdout.write("descendant-term-observed\\n"));
process.stdout.write("descendant-ready pid=" + process.pid + "\\n");
setInterval(() => {}, 1000);
`)}], { stdio: ["ignore", "pipe", "inherit"] });
descendant.stdout.once("data", (chunk) => {
  process.stdout.write("partial-before-timeout parent=" + process.pid + " " + chunk);
});
descendant.stdout.pipe(process.stdout, { end: false });
setInterval(() => {}, 1000);
`;
    const runCase = (source: string, timeout: number, terminationGrace: number) =>
      spawnSync(process.execPath, [runner, "--launch"], {
        encoding: "utf8",
        input: JSON.stringify({
          command: process.execPath,
          args: ["-e", source],
          cwd: process.cwd(),
          environment: process.env,
          timeout,
          terminationGrace,
        }),
      });

    const aggregated = [
      runCase(stubbornGroup, 300, 100),
      runCase('process.stdout.write("subsequent-case-succeeded\\n")', 1_000, 100),
    ];
    expect(aggregated[0]).toEqual(expect.objectContaining({ status: 124 }));
    expect(aggregated[0]!.stdout).toContain("partial-before-timeout");
    expect(aggregated[0]!.stdout).toContain("parent-term-observed");
    expect(aggregated[0]!.stdout).toContain("descendant-term-observed");
    expect(aggregated[0]!.stderr).toContain("FRONTIER_PROCESS_TIMEOUT");
    const pids = [...new Set(
      [...aggregated[0]!.stdout.matchAll(/(?:parent|pid)=(\d+)/g)]
        .map((match) => Number(match[1])),
    )];
    expect(pids).toHaveLength(2);
    for (const pid of pids) {
      expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    }
    expect(aggregated[1]).toEqual(expect.objectContaining({ status: 0 }));
    expect(aggregated[1]!.stdout).toBe("subsequent-case-succeeded\n");
    expect(aggregated.map((item) => item.status)).toEqual([124, 0]);

    const acceptedFoundation = foundation();
    const currentStrategy = strategy(1);
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const activity = pilotActivity();
    const implementation = pilotImplementation();
    const timeoutExecution = pilotRun(implementation, { timeout: true, idSuffix: "TIME01" });
    expect(validatePayload(processPackage, "RUN", timeoutExecution.run.datum.payload)).toBe(true);
    expect(validatePayload(processPackage, "RES", timeoutExecution.result.datum.payload)).toBe(true);
    const records = [
      ...acceptedFoundation,
      currentStrategy,
      ...passingReview(currentStrategy, "REV-0HARDTIME0"),
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...passingReview(currentEnvironment, "REV-0HARDTIME1", {
        definitions: [currentEnvironment, currentStrategy],
        evidence: [qualification.activity, qualification.implementation, qualification.run, qualification.result],
      }),
      activity,
      ...passingReview(activity, "REV-0HARDTIME2", {
        definitions: [
          activity,
          acceptedFoundation[0]!,
          acceptedFoundation[1]!,
          currentStrategy,
        ],
      }),
      target(),
      implementation,
      implementationAuthorization(implementation, "DEC-0HARDTIME1"),
      ...passingReview(implementation, "REV-0HARDTIME3"),
      timeoutExecution.run,
      timeoutExecution.result,
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      { processRef, phaseId: "phase-1-product-assurance", records, dependencyComparisons: [] },
      "selector",
      "completed-runs-for-implementation@1",
      { implementation: implementation.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: timeoutExecution.run.datum.revision_id }),
      }),
    ]);
    const timeoutEvaluation = phase1Evaluation(processPackage, records);
    expect(timeoutEvaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === implementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      satisfied: false,
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
    }));
    expect(timeoutEvaluation.phase?.progression).toEqual(expect.objectContaining({
      nextPhase: "phase-2-system-definition",
      ready: false,
      authorized: false,
      complete: false,
    }));
  }, 5_000);
});
