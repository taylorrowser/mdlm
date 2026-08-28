import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
import { PROCESS_REPOSITORY_TEST_TIMEOUT_MS } from "../scripts/root-test-observation-policy.mjs";
import {
  classifyOperatorOutcome,
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { operatorWorkProjection } from "../src/assignment.js";
import { executeCommandApplication } from "../src/command-application.js";
import {
  evaluateProcessDefinition,
  evaluateScenarioParticipation,
} from "../src/evaluator.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { finalizeExactBaselineScenarioOutput } from "../src/exact-baseline-repository.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import { loadRepositoryInspection } from "../src/repository-inspection.js";
import {
  scenarioOutputContractDiagnostics,
  type ScenarioExecution,
} from "../src/scenario-execution.js";
import {
  publishScenarioMutation,
  readRepositoryData,
} from "../src/lifecycle-repository.js";
import {
  directoryDigest,
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { installCurrentLifecycleDataFixture } from "./helpers/current-lifecycle-data-fixture.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";
import { initializeProcessPackageFixture } from "./helpers/mdlm.js";
import {
  copiedProcessPackage,
  restoreHistoricalFixtureProcessPackage,
} from "./helpers/process-package.js";

const processRef = "mdlm-bootstrap@0.71.0#sha256:phase-1-route-evidence";
// This test-owned deadline covers a Node parent and descendant starting under
// the measured four-process root cohort. It does not change a product deadline.
const CLEANUP_PROBE_TIMEOUT_MS = 3_000;
const CLEANUP_PROBE_TERMINATION_GRACE_MS = 1_000;
const CLEANUP_PROBE_PARTIAL_MARKER = "partial-before-timeout";
const revision = (id: string, number = 1) =>
  `${id}-r${String(number).padStart(5, "0")}`;

async function attendedQualificationCorrectionProcessPackage(): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-phase1-attended-env-correction-");
  const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
  await fs.writeFile(
    phase0Path,
    (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
  );
  await fs.writeFile(
    phase1Path,
    (await fs.readFile(phase1Path, "utf8")).replace("order: 1", "order: 0").replace(
      /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
      "scenarios:\n  - revise-environment-after-failed-qualification@1\n  - execute-verification-run@1\nobligations:\n  - environment-qualification-correction-required@1\noutputs:",
    ),
  );
  const obligationsRoot = path.join(processRoot, "obligations");
  for (const entry of await fs.readdir(obligationsRoot)) {
    if (
      entry === "environment-qualification-correction-required.yaml" ||
      !entry.endsWith(".yaml")
    ) continue;
    const obligationPath = path.join(obligationsRoot, entry);
    await fs.writeFile(
      obligationPath,
      (await fs.readFile(obligationPath, "utf8"))
        .replace("phases: [phase-1-product-assurance]", "phases: [phase-7-change-control]")
        .replace("phase-1-product-assurance, ", ""),
    );
  }
  return processRoot;
}

async function replacementEnvironmentReviewContextProcessPackage(): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-phase1-env-review-context-");
  const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
  await fs.writeFile(
    phase0Path,
    (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
  );
  await fs.writeFile(
    phase1Path,
    (await fs.readFile(phase1Path, "utf8")).replace("order: 1", "order: 0").replace(
      /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
      "scenarios:\n  - create-review-context@1\n  - execute-verification-run@1\nobligations:\n  - review-context-required@2\noutputs:",
    ),
  );
  const obligationsRoot = path.join(processRoot, "obligations");
  for (const entry of await fs.readdir(obligationsRoot)) {
    if (entry === "review-context-required.yaml" || !entry.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, entry);
    await fs.writeFile(
      obligationPath,
      (await fs.readFile(obligationPath, "utf8"))
        .replace("phases: [phase-1-product-assurance]", "phases: [phase-7-change-control]")
        .replace("phase-1-product-assurance, ", ""),
    );
  }
  const reviewContextPath = path.join(
    processRoot,
    "obligations/review-context-required.yaml",
  );
  await fs.writeFile(
    reviewContextPath,
    (await fs.readFile(reviewContextPath, "utf8")).replace(
      "for_each: 'select(\"review-required-revisions@1\", {})'",
      "for_each: 'select(\"environments-for-strategy@1\", {strategy: one(\"current-phase-1-verification-strategies@1\", {})})'",
    ),
  );
  return processRoot;
}

async function phase1RunProcessPackage(): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-phase1-run-process-");
  const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
  await fs.writeFile(
    phase0Path,
    (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
  );
  await fs.writeFile(
    phase1Path,
    (await fs.readFile(phase1Path, "utf8")).replace("order: 1", "order: 0").replace(
      /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
      "scenarios:\n  - execute-verification-run@1\nobligations:\n  - verification-run-required@1\noutputs:",
    ),
  );
  const obligationsRoot = path.join(processRoot, "obligations");
  for (const entry of await fs.readdir(obligationsRoot)) {
    if (entry === "verification-run-required.yaml" || !entry.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, entry);
    await fs.writeFile(
      obligationPath,
      (await fs.readFile(obligationPath, "utf8"))
        .replace("phases: [phase-1-product-assurance]", "phases: [phase-7-change-control]")
        .replace("phase-1-product-assurance, ", "")
        .replace(", phase-1-product-assurance", ""),
    );
  }
  const profilePath = path.join(processRoot, "profiles/bootstrap.yaml");
  await fs.writeFile(
    profilePath,
    (await fs.readFile(profilePath, "utf8")).replace(
      /  profile_boundary:\n    condition: >-[\s\S]*?\n    explanation:/,
      `  profile_boundary:\n    condition: >-\n      exists("verification-implementations-requiring-run@1", {})\n      && every("verification-implementations-requiring-run@1", {}, implementation =>\n        exists("completed-runs-for-implementation@1",\n          {implementation: implementation}))\n    explanation:`,
    ),
  );
  return processRoot;
}

async function phase1VaiCorrectionProcessPackage(
  reviewTypes: "[VSP, ENV, VER, VAI]" | "[ENV, VER]",
): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-phase1-vai-correction-process-");
  const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
  await fs.writeFile(
    phase0Path,
    (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
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
  const implementationObligationPath = path.join(
    processRoot,
    "obligations/pilot-verification-implementation-required.yaml",
  );
  await fs.writeFile(
    implementationObligationPath,
    (await fs.readFile(implementationObligationPath, "utf8")).replace(
      "satisfied_when: 'exists(\"complete-pilot-implementations-for-activity@1\", {activity: activity})'",
      "satisfied_when: 'true'",
    ),
  );
  const reviewSubjectsPath = path.join(
    processRoot,
    "selectors/review-required-revisions.yaml",
  );
  await fs.writeFile(
    reviewSubjectsPath,
    (await fs.readFile(reviewSubjectsPath, "utf8")).replace(
      "types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS]",
      `types: ${reviewTypes}`,
    ),
  );
  return processRoot;
}

async function phase1PilotRetryProcessPackage(): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-phase1-no-exercise-process-");
  const phase0Path = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
  const phase1Path = path.join(processRoot, "phases/phase-1-product-assurance.yaml");
  await fs.writeFile(
    phase0Path,
    (await fs.readFile(phase0Path, "utf8")).replace("order: 0", "order: 10"),
  );
  await fs.writeFile(
    phase1Path,
    (await fs.readFile(phase1Path, "utf8")).replace("order: 1", "order: 0").replace(
      /scenarios:\n(?:  - .+\n)+obligations:\n(?:  - .+\n)+outputs:/,
      "scenarios:\n  - execute-verification-run@1\nobligations:\n  - verification-run-required@1\noutputs:",
    ),
  );
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
  return processRoot;
}

async function scenarioExecutionRecords(repository: string): Promise<ScenarioExecution[]> {
  const transactionsRoot = path.join(repository, ".lifecycle/data/.transactions");
  const records: ScenarioExecution[] = [];
  for (const entry of await fs.readdir(transactionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = await fs.readFile(
      path.join(transactionsRoot, entry.name, "execution.json"),
      "utf8",
    );
    const execution = JSON.parse(source) as Partial<ScenarioExecution>;
    if (execution.contract === "mdlm-scenario-execution@4") {
      records.push(execution as ScenarioExecution);
    }
  }
  return records;
}


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

function environment(
  number = 1,
  corrects?: string,
  correctsQualificationResult?: string,
): LifecycleRecord {
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
      : correctsQualificationResult
        ? "revise-environment-after-failed-qualification@1"
        : "revise-environment-assurance-after-review@2",
    links: [
      { type: "realizes", target: "VSP-0HARDENP10-r00001" },
      ...(corrects ? [{ type: "corrects-review", target: corrects }] : []),
      ...(correctsQualificationResult
        ? [{ type: "corrects-qualification-result", target: correctsQualificationResult }]
        : []),
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
  options: { generation?: number; outcome?: "pass" | "fail" } = {},
) {
  const generation = options.generation ?? 1;
  const outcome = options.outcome ?? "pass";
  const assuranceScenario = currentEnvironment.datum.created_by.scenario;
  if (typeof assuranceScenario !== "string") {
    throw new Error("Qualification evidence requires an authored ENV Scenario");
  }
  const activity = record("VER", `VER-0HARDQUAL${generation}`, {
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
    scenario: assuranceScenario,
    links: [
      { type: "governed-by", target: currentStrategy.datum.revision_id },
      { type: "qualifies", target: currentEnvironment.datum.revision_id },
    ],
  });
  const implementation = record("VAI", `VAI-0HARDQUAL${generation}`, {
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
    scenario: assuranceScenario,
    links: [
      { type: "realizes", target: activity.datum.revision_id },
      { type: "uses", target: currentEnvironment.datum.revision_id },
      { type: "targets", target: currentEnvironment.datum.revision_id },
    ],
  });
  const result = record("RES", `RES-0HARDQUAL${generation}`, {
    title: `${outcome === "pass" ? "Passing" : "Failed"} environment qualification`,
    claim: {
      kind: "qualification",
      scope: "environment-capability",
      outcome,
      formal_evidence_eligible: false,
    },
    assessment_state: outcome === "pass" ? "accepted" : "rejected",
    observations: {
      expected_success_observed: outcome === "pass",
      expected_discrimination_observed: true,
      details: outcome === "pass"
        ? "The exact profile succeeded and rejected an unavailable capability."
        : "The declared command capability was unavailable in the exact environment.",
    },
    evidence_refs: ["observation:qualification:exact-bytes"],
    assessor_ref: "runner:phase-1-qualification",
  }, {
    scenario: "execute-verification-run@1",
    links: [{ type: "assessed-in", target: currentEnvironment.datum.revision_id }],
  });
  const run = record("RUN", `RUN-0HARDQUAL${generation}`, {
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
  id = "VAI-0HARDPILOT",
): LifecycleRecord {
  return record("VAI", id, {
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
  options: {
    timeout?: boolean;
    noProductExercise?: boolean;
    idSuffix?: string;
    assessmentState?: "accepted" | "recorded";
  } = {},
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
    assessment_state: inconclusive
      ? "assessment-required"
      : options.assessmentState ?? "accepted",
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

type PayloadValidator = (payload: unknown) => boolean;

const payloadValidatorSets = new WeakMap<
  ProcessPackage,
  { ajv: Ajv2020; validators: Map<string, PayloadValidator> }
>();

function validatePayload(
  processPackage: ProcessPackage,
  type: string,
  payload: Record<string, unknown>,
): boolean {
  let set = payloadValidatorSets.get(processPackage);
  if (!set) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    formatsPlugin.default(ajv);
    set = { ajv, validators: new Map() };
    payloadValidatorSets.set(processPackage, set);
  }
  let validator = set.validators.get(type);
  if (!validator) {
    const resolved = resolveType(processPackage, type);
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
    validator = set.ajv.compile(resolved.type.payloadSchema);
    set.validators.set(type, validator);
  }
  return validator(payload) === true;
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

function repositoryFoundation(): LifecycleRecord[] {
  const product = record("PSP", "PSP-0HARDENP10", {
    title: "Two-argument temperature converter",
    rationale: "Define the closed public command boundary.",
    problem: "Convert between an exact supported unit pair.",
    users: ["operator"],
    goals: ["accept exactly two arguments", "support only Celsius and Fahrenheit"],
    non_goals: ["other units", "additional arguments"],
    success_measures: [
      "supported conversions succeed and all other unit/count cases reject",
    ],
  }, { scenario: "compile-psp@2" });
  const requirement = record("STK", "STK-0HARDENP10", {
    title: "Reject unsupported command forms",
    rationale: "Discriminate the closed public boundary.",
    statement: "The command shall reject wrong argument counts and unsupported units.",
    verification_intent:
      "Observe exact rejection for values outside the parent PSP boundary.",
    stakeholder: "operator",
    priority: "must",
    system_context: "product",
  }, {
    scenario: "draft-stakeholder-requirements@2",
    links: [{ type: "derived-from", target: product.datum.id }],
  });
  return [product, requirement];
}

async function publishFixtureHistory(
  repository: string,
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
): Promise<void> {
  const published: Array<LifecycleRecord["datum"]> = [];
  let groupIndex = 0;
  for (let offset = 0; offset < records.length;) {
    const scenario = records[offset]!.datum.created_by.scenario;
    let end = offset + 1;
    while (
      end < records.length &&
      records[end]!.datum.created_by.scenario === scenario &&
      !records.slice(offset, end).some((item) =>
        item.datum.id === records[end]!.datum.id
      )
    ) end += 1;
    const group = records.slice(offset, end);
    for (const item of group) {
      const prior = published.findLast((candidate) =>
        candidate.id === item.datum.id
      );
      if (!prior) continue;
      const baseline = record("BSL", `BSL-${String(9000000000 + groupIndex).padStart(10, "0")}`, {
        title: `Freeze ${prior.revision_id} before replacement`,
        kind: "intent-approved",
        role: "accepted",
        scope: "phase-1-product-assurance",
        group: "DEFAULT",
        definition_members: [prior.revision_id],
        evidence: [],
      }, { scenario: "accept-phase-0-intent@1" });
      baseline.datum.created_by = {
        ...prior.created_by,
        scenario: "accept-phase-0-intent@1",
      };
      const finalized = await finalizeExactBaselineScenarioOutput(
        repository,
        processPackage,
        prior.created_by.process_ref,
        baseline.datum,
      );
      if (!finalized.ok) throw new Error(JSON.stringify(finalized.diagnostics));
      const frozen = await publishScenarioMutation(
        repository,
        processPackage,
        published,
        [finalized.value.output.datum],
        `phase-1-route-freeze-${String(groupIndex).padStart(3, "0")}`,
        { contract: "phase-1-route-freeze@1" },
        [finalized.value.output],
      );
      if (!frozen.ok) throw new Error(JSON.stringify(frozen.diagnostics));
      published.push(finalized.value.output.datum);
    }
    const result = await publishScenarioMutation(
      repository,
      processPackage,
      published,
      group.map((item) => item.datum),
      `phase-1-route-fixture-${String(groupIndex).padStart(3, "0")}`,
      { contract: "phase-1-route-fixture@1", scenario },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    published.push(...group.map((item) => item.datum));
    offset = end;
    groupIndex += 1;
  }
  const latestEnvironments = published.filter((item) =>
    item.type === "ENV" &&
    !published.some((candidate) =>
      candidate.id === item.id && candidate.revision > item.revision
    )
  );
  for (const [index, environment] of latestEnvironments.entries()) {
    const baseline = record("BSL", `BSL-${String(9900000000 + index).padStart(10, "0")}`, {
      title: `Freeze ${environment.revision_id} for the public route`,
      kind: "intent-approved",
      role: "accepted",
      scope: "phase-1-product-assurance",
      group: "DEFAULT",
      definition_members: [environment.revision_id],
      evidence: [],
    }, { scenario: "accept-phase-0-intent@1" });
    baseline.datum.created_by = {
      ...environment.created_by,
      scenario: "accept-phase-0-intent@1",
    };
    const finalized = await finalizeExactBaselineScenarioOutput(
      repository,
      processPackage,
      environment.created_by.process_ref,
      baseline.datum,
    );
    if (!finalized.ok) throw new Error(JSON.stringify(finalized.diagnostics));
    const frozen = await publishScenarioMutation(
      repository,
      processPackage,
      published,
      [finalized.value.output.datum],
      `phase-1-route-final-freeze-${String(index).padStart(3, "0")}`,
      { contract: "phase-1-route-final-freeze@1" },
      [finalized.value.output],
    );
    if (!frozen.ok) throw new Error(JSON.stringify(frozen.diagnostics));
    published.push(finalized.value.output.datum);
  }
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
      prompt_ref: item.datum.created_by.prompt_ref ??
        "prompts/phase-1-route-test.md@1",
      loaded_skill_refs: item.datum.created_by.loaded_skill_refs ?? [],
      policy_refs: item.datum.created_by.policy_refs ?? [],
    };
  }
  return safeRecords;
}

describe("Phase 1 hardening route evidence", () => {
  let processPackage: ProcessPackage;
  let recoveryPackage: ProcessPackage;

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
    const loaded = await loadProcessPackage(".lifecycle/process");
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    recoveryPackage = loaded.package;
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

  it("routes failed ENV qualification to replacement assurance", async () => {
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDQF00");
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment, {
      outcome: "fail",
    });
    const acceptedFoundation = foundation();
    const productReview = passingReview(acceptedFoundation[0]!, "REV-0HARDQF01");
    const requirementReview = passingReview(acceptedFoundation[1]!, "REV-0HARDQF02", {
      definitions: [acceptedFoundation[1]!, acceptedFoundation[0]!],
    });
    const activity = pilotActivity();
    const activityReview = passingReview(activity, "REV-0HARDQF03", {
      definitions: [activity, acceptedFoundation[0]!, acceptedFoundation[1]!, currentStrategy],
    });
    const exactTarget = target();
    const implementation = pilotImplementation();
    const implementationAuthority = implementationAuthorization(
      implementation,
      "DEC-0HARDQF04",
    );
    const implementationReview = passingReview(implementation, "REV-0HARDQF04");
    const exercisedPilot = pilotRun(implementation, { idSuffix: "QFEND0" });
    const records = [
      ...productReview,
      ...requirementReview,
      currentStrategy,
      ...strategyReview,
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      activity,
      ...activityReview,
      exactTarget,
      implementation,
      implementationAuthority,
      ...implementationReview,
      exercisedPilot.run,
      exercisedPilot.result,
    ];

    const historicalRoot = await copiedProcessPackage(
      "mdlm-pre-issue-214-package-",
    );
    try {
      await restoreHistoricalFixtureProcessPackage(
        historicalRoot,
        "sha256:deb27430c4d239eb67a1c19025d77dd6623813f83b0588681eebfc07bdfa8a0d",
      );
      const historical = await loadProcessPackage(historicalRoot);
      if (!historical.ok) throw new Error(JSON.stringify(historical.diagnostics));
      const historicalEvaluation = phase1Evaluation(historical.package, records);
      expect(classifyOperatorOutcome(
        operatorWorkProjection(historicalEvaluation),
        historicalEvaluation.terminalOutcome,
      )).toEqual(expect.objectContaining({ kind: "process-dead-end" }));
    } finally {
      await fs.rm(path.dirname(historicalRoot), { recursive: true, force: true });
    }

    const evaluation = phase1Evaluation(recoveryPackage, records);
    expect(classifyOperatorOutcome(
      operatorWorkProjection(evaluation),
      evaluation.terminalOutcome,
    ).kind).toBe("assignment");
    const route = evaluation.obligations.find((item) =>
      item.obligation === "environment-qualification-correction-required" &&
      item.subject === currentEnvironment.datum.revision_id
    );
    expect(route).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-environment-after-failed-qualification@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "autonomous",
          authority: "package-evidence",
        }),
      })],
    }));

    const prepared = await dryRunResolverScenario(
      recoveryPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "revise-environment-after-failed-qualification@1",
      route!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "failed_results"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      qualification.result.datum.revision_id,
    ]);
    expect(prepared.value.expectedOutputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "replacement",
        requiredLinks: expect.arrayContaining([
          {
            link: "corrects-qualification-result",
            target: { input: "failed_results" },
          },
        ]),
      }),
      expect.objectContaining({ name: "qualification_activity", cardinality: "one" }),
      expect.objectContaining({ name: "qualification_implementation", cardinality: "one" }),
    ]));
  });

  it("materializes replacement ENV Review Context with only fresh qualification evidence", async () => {
    const repository = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-phase1-env-review-context-"),
    );
    const processRoot = await replacementEnvironmentReviewContextProcessPackage();
    try {
      await initializeProcessPackageFixture(repository, processRoot);
      const loaded = await loadProcessPackage(processRoot);
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
      const currentStrategy = strategy(1);
      const firstEnvironment = environment(1);
      const failedQualification = qualificationEvidence(
        currentStrategy,
        firstEnvironment,
        { generation: 1, outcome: "fail" },
      );
      const replacement = environment(
        2,
        undefined,
        failedQualification.result.datum.revision_id,
      );
      const freshQualification = qualificationEvidence(
        currentStrategy,
        replacement,
        { generation: 2, outcome: "pass" },
      );
      const fixtureRecords = repositorySafeRecords([
        ...repositoryFoundation(),
        currentStrategy,
        firstEnvironment,
        ...Object.values(failedQualification),
        replacement,
        ...Object.values(freshQualification),
      ]);
      const safeStrategy = fixtureRecords[2]!;
      const safeFailedQualification = fixtureRecords.slice(4, 8);
      const safeReplacement = fixtureRecords[8]!;
      const safeFreshQualification = fixtureRecords.slice(9, 13);
      const fixtureProcessRef =
        `mdlm-bootstrap@0.74.0#${await processPackageDigest(processRoot)}`;
      for (const item of fixtureRecords) {
        item.datum.created_by.process_ref = fixtureProcessRef;
      }
      await publishFixtureHistory(repository, loaded.package, fixtureRecords);

      const next = await executeCommandApplication(["next"], repository);
      expect(next.exitCode, next.output).toBe(0);
      expect(JSON.parse(next.output).materializedExecutions).toEqual([
        expect.objectContaining({ scenario: "create-review-context@1" }),
      ]);
      const stored = await readRepositoryData(repository, loaded.package);
      if (!stored.ok) throw new Error(JSON.stringify(stored.diagnostics));
      const context = stored.value.map((item) => item.lifecycleDatum).find((item) =>
        item.datum.type === "BSL" &&
        item.datum.payload.scope === safeReplacement.datum.revision_id
      );
      expect(context?.datum.payload).toEqual(expect.objectContaining({
        definition_members: [
          safeReplacement.datum.revision_id,
          safeStrategy.datum.revision_id,
        ].sort(),
        evidence: safeFreshQualification.map((item) =>
          item.datum.revision_id
        ).sort(),
      }));
      expect(context?.datum.payload.evidence).not.toEqual(expect.arrayContaining(
        safeFailedQualification.map((item) => item.datum.revision_id),
      ));
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("restores ENV Review eligibility only from a fresh passing replacement qualification", () => {
    const currentStrategy = strategy(1);
    const strategyReview = passingReview(currentStrategy, "REV-0HARDQFP0");
    const firstEnvironment = environment(1);
    const failedQualification = qualificationEvidence(currentStrategy, firstEnvironment, {
      generation: 1,
      outcome: "fail",
    });
    const replacement = environment(
      2,
      undefined,
      failedQualification.result.datum.revision_id,
    );
    const replacementQualification = qualificationEvidence(currentStrategy, replacement, {
      generation: 2,
      outcome: "pass",
    });
    expect(replacement.datum.links).toEqual([
      { type: "realizes", target: currentStrategy.datum.revision_id },
      {
        type: "corrects-qualification-result",
        target: failedQualification.result.datum.revision_id,
      },
    ]);
    expect(replacementQualification.run.datum.links).toContainEqual({
      type: "executes",
      target: replacementQualification.implementation.datum.revision_id,
    });
    expect(replacementQualification.run.datum.links).not.toContainEqual({
      type: "executes",
      target: failedQualification.implementation.datum.revision_id,
    });
    const acceptedFoundation = foundation();
    const activity = pilotActivity();
    const activityReview = passingReview(activity, "REV-0HARDQFP1", {
      definitions: [activity, acceptedFoundation[0]!, acceptedFoundation[1]!, currentStrategy],
    });
    const records = [
      currentStrategy,
      ...strategyReview,
      firstEnvironment,
      failedQualification.activity,
      failedQualification.implementation,
      failedQualification.run,
      failedQualification.result,
      replacement,
      replacementQualification.activity,
      replacementQualification.implementation,
      replacementQualification.run,
      replacementQualification.result,
      activity,
      ...activityReview,
      target(),
    ];

    const beforeReview = phase1Evaluation(processPackage, records);
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "corrected-environment-qualification-revisions-for@1",
      { environment: firstEnvironment.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: replacement.datum.revision_id }),
      }),
    ]);
    expect(beforeReview.obligations.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === replacement.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-review-context@1",
    }));
    expect(evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records: [...foundation(), ...records],
        dependencyComparisons: [],
      },
      "selector",
      "environment-review-evidence-for@1",
      { environment: replacement.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: replacementQualification.result.datum.revision_id,
        }),
      }),
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: replacementQualification.run.datum.revision_id,
        }),
      }),
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: replacementQualification.implementation.datum.revision_id,
        }),
      }),
      expect.objectContaining({
        identity: expect.objectContaining({
          revision_id: replacementQualification.activity.datum.revision_id,
        }),
      }),
    ]);

    const replacementReview = passingReview(replacement, "REV-0HARDQFP2", {
      definitions: [replacement, currentStrategy],
      evidence: [
        replacementQualification.activity,
        replacementQualification.implementation,
        replacementQualification.run,
        replacementQualification.result,
      ],
    });
    expect(replacementReview[0].datum.payload.evidence).not.toContain(
      failedQualification.result.datum.revision_id,
    );
    const afterReview = phase1Evaluation(processPackage, [...records, ...replacementReview]);
    expect(afterReview.obligations.find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === replacement.datum.revision_id
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(afterReview.obligations.find((item) =>
      item.obligation === "pilot-verification-implementation-required" &&
      item.subject === activity.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "implement-verification-activity@1",
    }));
  });

  it("escalates failed ENV qualification after two autonomous replacements", () => {
    const currentStrategy = strategy(1);
    const firstEnvironment = environment(1);
    const firstQualification = qualificationEvidence(currentStrategy, firstEnvironment, {
      generation: 1,
      outcome: "fail",
    });
    const firstRecords = [
      currentStrategy,
      firstEnvironment,
      firstQualification.activity,
      firstQualification.implementation,
      firstQualification.run,
      firstQualification.result,
    ];
    expect(correction(
      processPackage,
      firstRecords,
      "environment-qualification-correction-required",
      firstEnvironment.datum.revision_id,
    )).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
      })],
    }));

    const secondEnvironment = environment(
      2,
      undefined,
      firstQualification.result.datum.revision_id,
    );
    const secondQualification = qualificationEvidence(currentStrategy, secondEnvironment, {
      generation: 2,
      outcome: "fail",
    });
    const secondRecords = [
      ...firstRecords,
      secondEnvironment,
      secondQualification.activity,
      secondQualification.implementation,
      secondQualification.run,
      secondQualification.result,
    ];
    expect(correction(
      processPackage,
      secondRecords,
      "environment-qualification-correction-required",
      secondEnvironment.datum.revision_id,
    )).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
      })],
    }));

    const thirdEnvironment = environment(
      3,
      undefined,
      secondQualification.result.datum.revision_id,
    );
    const thirdQualification = qualificationEvidence(currentStrategy, thirdEnvironment, {
      generation: 3,
      outcome: "fail",
    });
    const exhausted = correction(
      processPackage,
      [
        ...secondRecords,
        thirdEnvironment,
        thirdQualification.activity,
        thirdQualification.implementation,
        thirdQualification.run,
        thirdQualification.result,
      ],
      "environment-qualification-correction-required",
      thirdEnvironment.datum.revision_id,
    );
    expect(exhausted).toEqual(expect.objectContaining({
      actionableResolver: "revise-environment-after-failed-qualification@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("submits attended qualification correction with exact DEC authority evidence", async () => {
    const repository = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-phase1-attended-env-correction-"),
    );
    const processRoot = await attendedQualificationCorrectionProcessPackage();
    try {
      await initializeProcessPackageFixture(repository, processRoot);
      const loaded = await loadProcessPackage(processRoot);
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
      const currentStrategy = strategy(1);
      const firstEnvironment = environment(1);
      const firstQualification = qualificationEvidence(
        currentStrategy,
        firstEnvironment,
        { generation: 1, outcome: "fail" },
      );
      const secondEnvironment = environment(
        2,
        undefined,
        firstQualification.result.datum.revision_id,
      );
      const secondQualification = qualificationEvidence(
        currentStrategy,
        secondEnvironment,
        { generation: 2, outcome: "fail" },
      );
      const thirdEnvironment = environment(
        3,
        undefined,
        secondQualification.result.datum.revision_id,
      );
      const thirdQualification = qualificationEvidence(
        currentStrategy,
        thirdEnvironment,
        { generation: 3, outcome: "fail" },
      );
      const fixtureRecords = repositorySafeRecords([
        ...repositoryFoundation(),
        currentStrategy,
        firstEnvironment,
        ...Object.values(firstQualification),
        secondEnvironment,
        ...Object.values(secondQualification),
        thirdEnvironment,
        ...Object.values(thirdQualification),
      ]);
      const safeStrategy = fixtureRecords[2]!;
      const safeThirdEnvironment = fixtureRecords[13]!;
      const safeThirdQualification = fixtureRecords.slice(14, 18);
      const safeThirdResult = safeThirdQualification.find((item) =>
        item.datum.type === "RES"
      )!;
      const fixtureProcessRef =
        `mdlm-bootstrap@0.74.0#${await processPackageDigest(processRoot)}`;
      for (const item of fixtureRecords) {
        item.datum.created_by.process_ref = fixtureProcessRef;
      }
      await publishFixtureHistory(repository, loaded.package, fixtureRecords);

      const prepared = await prepareNextAssignment(
        repository,
        "revise-environment-after-failed-qualification@1",
      );
      expect(prepared.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      }));
      expect(inputRevision(prepared, "environment")).toBe(
        safeThirdEnvironment.datum.revision_id,
      );
      expect(inputRevisions(prepared, "failed_results")).toEqual([
        safeThirdResult.datum.revision_id,
      ]);

      const replacementPayload = structuredClone(safeThirdEnvironment.datum.payload);
      const activityPayload = structuredClone(thirdQualification.activity.datum.payload);
      const implementationPayload = structuredClone(
        thirdQualification.implementation.datum.payload,
      );
      const submitted = await submitAssignment(repository, prepared, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: safeThirdEnvironment.datum.id,
          type: "ENV",
          payload: replacementPayload,
          links: [
            { type: "realizes", target: safeStrategy.datum.revision_id },
            {
              type: "corrects-qualification-result",
              target: safeThirdResult.datum.revision_id,
            },
          ],
          body: "Attended correction preserves the profile while addressing the exact failed result.\n",
        },
      }, {
        localId: "qualification_activity",
        name: "qualification_activity",
        invocation: 0,
        lifecycleDatum: {
          type: "VER",
          payload: activityPayload,
          links: [
            { type: "governed-by", target: safeStrategy.datum.revision_id },
            { type: "qualifies", target: "$proposal.replacement.revision_id" },
          ],
          body: "Fresh qualification activity for the attended replacement.\n",
        },
      }, {
        localId: "qualification_implementation",
        name: "qualification_implementation",
        invocation: 0,
        lifecycleDatum: {
          type: "VAI",
          payload: implementationPayload,
          links: [
            { type: "realizes", target: "$proposal.qualification_activity.revision_id" },
            { type: "uses", target: "$proposal.replacement.revision_id" },
            { type: "targets", target: "$proposal.replacement.revision_id" },
          ],
          body: "Fresh implementation for the attended replacement.\n",
        },
      }, {
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Authorize attended environment correction",
            rationale: "The shared autonomous correction budget is exhausted.",
            kind: "scope",
            decision: "Authorize this exact environment replacement.",
            alternatives: ["Leave the failed environment unresolved."],
            effective_scope: "$proposal.replacement.revision_id",
          },
          links: [{
            type: "justifies",
            target: "$proposal.replacement.revision_id",
          }],
          body: "Stakeholder authority for the exact attended correction.\n",
        },
      }]);
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      const stored = await readRepositoryData(repository, loaded.package);
      if (!stored.ok) throw new Error(JSON.stringify(stored.diagnostics));
      const records = stored.value.map((item) => item.lifecycleDatum);
      const replacement = records.find((item) =>
        item.datum.id === safeThirdEnvironment.datum.id && item.datum.revision === 4
      )!;
      const decision = records.find((item) =>
        item.datum.type === "DEC" && item.datum.created_by.scenario ===
          "revise-environment-after-failed-qualification@1"
      )!;
      expect(replacement.datum.links).toContainEqual({
        type: "corrects-qualification-result",
        target: safeThirdResult.datum.revision_id,
      });
      expect(decision.datum.payload.effective_scope).toBe(
        replacement.datum.revision_id,
      );
      expect(decision.datum.links).toEqual([{
        type: "justifies",
        target: replacement.datum.revision_id,
      }]);
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("shares the ENV correction budget when qualification recovery precedes Review failure", () => {
    const currentStrategy = strategy(1);
    const firstEnvironment = environment(1);
    const firstQualification = qualificationEvidence(currentStrategy, firstEnvironment, {
      generation: 1,
      outcome: "fail",
    });
    const secondEnvironment = environment(
      2,
      undefined,
      firstQualification.result.datum.revision_id,
    );
    const secondQualification = qualificationEvidence(currentStrategy, secondEnvironment, {
      generation: 2,
      outcome: "pass",
    });
    const secondReview = failedReview(secondEnvironment, "REV-0HARDMXQ10");
    const throughFirstReviewFailure = [
      currentStrategy,
      firstEnvironment,
      ...Object.values(firstQualification),
      secondEnvironment,
      ...Object.values(secondQualification),
      ...secondReview,
    ];
    expect(correction(
      recoveryPackage,
      throughFirstReviewFailure,
      "environment-review-correction-required",
      secondEnvironment.datum.revision_id,
    )).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
      })],
    }));

    const thirdEnvironment = environment(3, secondReview[1].datum.revision_id);
    const thirdQualification = qualificationEvidence(currentStrategy, thirdEnvironment, {
      generation: 3,
      outcome: "pass",
    });
    const thirdReview = failedReview(thirdEnvironment, "REV-0HARDMXQ20");
    const exhaustedEvaluation = phase1Evaluation(recoveryPackage, [
      ...throughFirstReviewFailure,
      thirdEnvironment,
      ...Object.values(thirdQualification),
      ...thirdReview,
    ]);
    expect(exhaustedEvaluation.obligations.find((item) =>
      item.obligation === "environment-review-correction-required" &&
      item.subject === thirdEnvironment.datum.revision_id
    )).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    expect(classifyOperatorOutcome(
      operatorWorkProjection(exhaustedEvaluation),
      exhaustedEvaluation.terminalOutcome,
    ).kind).toBe("attention-required");
  });

  it("shares the ENV correction budget when Review recovery precedes qualification failure", () => {
    const currentStrategy = strategy(1);
    const firstEnvironment = environment(1);
    const firstQualification = qualificationEvidence(currentStrategy, firstEnvironment, {
      generation: 1,
      outcome: "pass",
    });
    const firstReview = failedReview(firstEnvironment, "REV-0HARDMXR10");
    const secondEnvironment = environment(2, firstReview[1].datum.revision_id);
    const secondQualification = qualificationEvidence(currentStrategy, secondEnvironment, {
      generation: 2,
      outcome: "fail",
    });
    const throughFirstQualificationFailure = [
      currentStrategy,
      firstEnvironment,
      ...Object.values(firstQualification),
      ...firstReview,
      secondEnvironment,
      ...Object.values(secondQualification),
    ];
    expect(correction(
      recoveryPackage,
      throughFirstQualificationFailure,
      "environment-qualification-correction-required",
      secondEnvironment.datum.revision_id,
    )).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({ mode: "autonomous" }),
      })],
    }));

    const thirdEnvironment = environment(
      3,
      undefined,
      secondQualification.result.datum.revision_id,
    );
    const thirdQualification = qualificationEvidence(currentStrategy, thirdEnvironment, {
      generation: 3,
      outcome: "fail",
    });
    const exhaustedEvaluation = phase1Evaluation(recoveryPackage, [
      ...throughFirstQualificationFailure,
      thirdEnvironment,
      ...Object.values(thirdQualification),
    ]);
    expect(exhaustedEvaluation.obligations.find((item) =>
      item.obligation === "environment-qualification-correction-required" &&
      item.subject === thirdEnvironment.datum.revision_id
    )).toEqual(expect.objectContaining({
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    expect(classifyOperatorOutcome(
      operatorWorkProjection(exhaustedEvaluation),
      exhaustedEvaluation.terminalOutcome,
    ).kind).toBe("attention-required");
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
    expect(prepared.value).toEqual(expect.objectContaining({
      executable: true,
      sideEffectFree: true,
      definition: expect.objectContaining({
        scenario: "write-verification-activity@2",
      }),
      prompt: expect.objectContaining({
        reference: "prompts/write-verification-activity.md@2",
      }),
      expectedOutputs: [expect.objectContaining({
        name: "activity",
        types: ["VER"],
      })],
      completion: expect.objectContaining({ status: "pending-output" }),
    }));
    expect(prepared.value.invocations[0]!.inputs.find(
      (input) => input.name === "intent_support",
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      product!.datum.revision_id,
    ]);
  });

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
          profile: "bootstrap@38",
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
          profile: "bootstrap@38",
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

  it("supplies exact linked revisions in a pilot VAI Review packet", async () => {
    const loaded = await loadProcessPackage(".lifecycle/process");
    expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    const packageUnderTest = loaded.package;
    const exactEnvironment = environment();
    exactEnvironment.datum.id = "ENV-RZSV8N3HSC";
    exactEnvironment.datum.revision_id = "ENV-RZSV8N3HSC-r00001";
    const exactActivity = pilotActivity();
    exactActivity.datum.id = "VER-3XJBWSKDJN";
    exactActivity.datum.revision_id = "VER-3XJBWSKDJN-r00001";
    const exactTarget = target();
    exactTarget.datum.id = "ART-2YHW87RF68";
    exactTarget.datum.revision_id = "ART-2YHW87RF68-r00001";
    const implementation = pilotImplementation();
    implementation.datum.id = "VAI-HKGY742WF5";
    implementation.datum.revision_id = "VAI-HKGY742WF5-r00001";
    implementation.datum.links = [
      { type: "realizes", target: exactActivity.datum.revision_id },
      { type: "uses", target: exactEnvironment.datum.revision_id },
      { type: "targets", target: exactTarget.datum.revision_id },
    ];
    const context = passingReview(implementation, "REV-W1T1E07MNY")[0];
    const snapshot = {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: [
        ...foundation(),
        strategy(1),
        exactEnvironment,
        exactActivity,
        exactTarget,
        implementation,
        context,
      ],
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(packageUnderTest, snapshot);
    const review = evaluation.obligations.find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === implementation.datum.revision_id
    );
    expect(review).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: true,
      actionableResolver: "review-datum-in-context@2",
    }));

    const prepared = await dryRunResolverScenario(
      packageUnderTest,
      snapshot,
      "review-datum-in-context@2",
      review!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const contextMembers = prepared.value.invocations[0]!.inputs.find(
      (input) => input.name === "context_members",
    )!;
    expect(contextMembers.values.map((value) => value.identity.revision_id)).toEqual([
      "ART-2YHW87RF68-r00001",
      "ENV-RZSV8N3HSC-r00001",
      "VER-3XJBWSKDJN-r00001",
    ]);
  });

  it("proves Phase 1 malformed command matrix rejection for every required coverage class atomically", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-malformed-target-"));
    try {
      await initializeProcessPackageFixture(repository, processPackage.root);
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
        if (omittedIndex < 0 || !retained) {
          throw new Error(`missing command case ${omittedKind}`);
        }
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
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

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

  it("executes and repository-validates exact RUN and RES outputs through the package Scenario", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-run-"));
    const processRoot = await phase1RunProcessPackage();
    try {
      await initializeProcessPackageFixture(repository, processRoot);
      const installedProcessRoot = await installCurrentLifecycleDataFixture(
        repository,
        "phase-1-run-ready",
      );
      const loadedFixture = await loadProcessPackage(installedProcessRoot);
      if (!loadedFixture.ok) throw new Error(JSON.stringify(loadedFixture.diagnostics));
      const fixturePackage = loadedFixture.package;
      const fixtureProcessRef =
        "mdlm-bootstrap@0.74.0#sha256:fe4b03737ad107e325e14ce24d53389ae1fa0636222297d83ccdfe4901bf6784";
      const readyInspection = await loadRepositoryInspection(
        repository,
        fixturePackage,
        fixtureProcessRef,
      );
      expect(readyInspection.ok, JSON.stringify(readyInspection.diagnostics)).toBe(true);
      if (!readyInspection.ok) return;
      const readySnapshot = readyInspection.value.lifecycleSnapshot(
        "phase-1-product-assurance",
      );
      const readyEvaluation = evaluateLifecycle(fixturePackage, readySnapshot);
      const obligation = readyEvaluation.obligations.find((item) =>
        item.obligation === "verification-run-required" && item.dispatchable
      )!;
      const prepared = await dryRunResolverScenario(
        fixturePackage,
        readySnapshot,
        "execute-verification-run@1",
        obligation.id,
        [],
      );
      expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
      if (!prepared.ok) return;
      expect({
        scenario: prepared.value.definition.scenario,
        phase: `${readyEvaluation.phase?.id}@${readyEvaluation.phase?.version}`,
        obligation: `${obligation.obligation}@1`,
        enabledObligations: fixturePackage.phases["phase-1-product-assurance"]?.obligations,
      }).toEqual({
        scenario: "execute-verification-run@1",
        phase: "phase-1-product-assurance@5",
        obligation: "verification-run-required@1",
        enabledObligations: ["verification-run-required@1"],
      });
      const input = (name: string): string =>
        prepared.value.invocations[0]!.inputs.find((item) => item.name === name)!
          .values[0]!.identity.revision_id!;
      const implementation = input("implementation");
      const activity = input("activity");
      const environmentRevision = input("environment");
      const executionTarget = input("execution_target");
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
      const invalid = scenarioOutputContractDiagnostics(
        fixturePackage.scenarios["execute-verification-run"]!,
        prepared.value.invocations,
        outputs.slice(0, 1),
      );
      expect(invalid).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-output-cardinality-invalid" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      await installCurrentLifecycleDataFixture(repository, "phase-1-run-res-published");
      const inspected = await loadRepositoryInspection(
        repository,
        fixturePackage,
        fixtureProcessRef,
      );
      expect(inspected.ok, JSON.stringify(inspected.diagnostics)).toBe(true);
      if (!inspected.ok) return;
      const baselines = await inspected.value.verifyBaselines();
      expect(baselines.ok, JSON.stringify(baselines.diagnostics)).toBe(true);
      const snapshot = inspected.value.lifecycleSnapshot("phase-1-product-assurance");
      const published = snapshot.records.map((item) => item.datum);
      const run = published.find((item) => item.type === "RUN")!;
      const result = published.find((item) => item.type === "RES")!;
      expect(published.map((item) => item.revision_id).sort()).toEqual([
        "ENV-0000000004-r00001",
        "PSP-0000000001-r00001",
        "RES-TG4R0R8KHG-r00001",
        "RUN-98HYSCZYCQ-r00001",
        "STK-0000000002-r00001",
        "VAI-0000000006-r00001",
        "VER-0000000005-r00001",
        "VSP-0000000003-r00001",
      ]);
      const execution = (await scenarioExecutionRecords(repository)).find(
        (item) => item.definition?.scenario === "execute-verification-run@1",
      );
      expect(execution).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "execute-verification-run@1" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
        outputs: [
          expect.objectContaining({
            name: "run",
            lifecycleDatum: expect.objectContaining({ type: "RUN", revisionId: run.revision_id }),
          }),
          expect.objectContaining({
            name: "result",
            lifecycleDatum: expect.objectContaining({ type: "RES", revisionId: result.revision_id }),
          }),
        ],
      }));
      expect(run.payload).toEqual(expect.objectContaining({
        activities_invoked: [activity],
        evidence_locations: evidence,
      }));
      expect(run.links).toEqual(expect.arrayContaining([
        { type: "executes", target: implementation },
        { type: "uses", target: environmentRevision },
        { type: "targets", target: executionTarget },
        { type: "produces", target: result.revision_id },
      ]));
      expect(result.payload).toEqual(expect.objectContaining({
        claim: expect.objectContaining({ outcome: "pass" }),
        evidence_refs: evidence,
      }));
      expect(result.links).toContainEqual({
        type: "assessed-in",
        target: environmentRevision,
      });

      const evaluation = evaluateLifecycle(fixturePackage, snapshot);
      expect(evaluation.diagnostics).toEqual([]);
      expect(evaluation.terminalOutcome).toEqual(expect.objectContaining({
        outcome: "profile-boundary-reached",
        evidence: expect.objectContaining({
          condition: expect.objectContaining({ result: true }),
        }),
      }));
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("prepares and submits pilot activity authoring with exact intent support through the public command application", async () => {
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
      await initializeProcessPackageFixture(repository, processRoot);
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
      const fixtureProcessRef = `mdlm-bootstrap@0.74.0#${await processPackageDigest(processRoot)}`;
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

      const materialized = await executeCommandApplication(["next"], repository);
      expect(materialized.exitCode, materialized.output).toBe(0);
      const materializedOutcome = JSON.parse(materialized.output);
      expect(materializedOutcome).toEqual(expect.objectContaining({
        outcome: "publication-required",
        materializedExecutions: [expect.objectContaining({
          scenario: "create-review-context@1",
          status: "completed",
        })],
      }));
      expect(materializedOutcome.assignment).toBeUndefined();
      const staged = spawnSync("git", ["-C", repository, "add", ".lifecycle/data"], {
        encoding: "utf8",
      });
      expect(staged.status, staged.stderr).toBe(0);
      const committed = spawnSync("git", [
        "-C", repository,
        "-c", "user.name=MDLM Test",
        "-c", "user.email=mdlm-test@localhost",
        "-c", "commit.gpgSign=false",
        "commit", "--quiet", "--no-verify", "-m", "Publish Review Context",
      ], { encoding: "utf8" });
      expect(committed.status, committed.stderr).toBe(0);

      const prepared = await prepareNextAssignment(
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
      const submitted = await submitAssignment(repository, prepared, [{
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
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("projects reviewed ENV evidence into the exact pilot VER Review assignment", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-ver-review-"));
    const processRoot = await phase1VaiCorrectionProcessPackage("[ENV, VER]");
    try {
      await initializeProcessPackageFixture(repository, processRoot);
      await installCurrentLifecycleDataFixture(repository, "phase-1-ver-review-ready");
      const reviewExecution = (await scenarioExecutionRecords(repository)).find(
        (item) => item.outputs.some((output) =>
          output.lifecycleDatum.revisionId === "REV-NQRVZ506ZE-r00001"
        ),
      );
      expect(reviewExecution).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "review-datum-in-context@2" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      }));

      const prepared = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(prepared, "subject")).toBe("VER-0000000013-r00001");
      expect(inputRevisions(prepared, "context_members")).toEqual([
        "PSP-0000000001-r00001",
        "STK-0000000002-r00001",
        "VSP-0000000003-r00001",
      ]);
      expect(
        prepared.packet.allowedProjections.inputSchemas.map(
          (schema: { type: string }) => schema.type,
        ),
      ).toEqual(["BSL", "PSP", "STK", "VER", "VSP"]);
      const projectedVerSchema =
        prepared.packet.allowedProjections.inputSchemas.find(
          (schema: { type: string }) => schema.type === "VER",
        );
      expect(projectedVerSchema).toEqual(expect.objectContaining({
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
      }));
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("allocates Review of corrected VAI r2 instead of a run for failed superseded r1", async () => {
    const repository = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-phase1-vai-correction-"),
    );
    const processRoot = await phase1VaiCorrectionProcessPackage(
      "[VSP, ENV, VER, VAI]",
    );
    try {
      await initializeProcessPackageFixture(repository, processRoot);
      const installedProcessRoot = await installCurrentLifecycleDataFixture(
        repository,
        "phase-1-vai-review-ready",
      );
      const loaded = await loadProcessPackage(installedProcessRoot);
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
      const fixtureProcessRef =
        "mdlm-bootstrap@0.74.0#sha256:9599fa8cd7d2557c24e62da6ce4b44324dd26e01a810272820051067fc54eca4";
      const inspected = await loadRepositoryInspection(
        repository,
        loaded.package,
        fixtureProcessRef,
      );
      expect(inspected.ok, JSON.stringify(inspected.diagnostics)).toBe(true);
      if (!inspected.ok) return;
      const baselines = await inspected.value.verifyBaselines();
      expect(baselines.ok, JSON.stringify(baselines.diagnostics)).toBe(true);
      const snapshot = inspected.value.lifecycleSnapshot("phase-1-product-assurance");
      const records = snapshot.records.map((item) => item.datum);
      const first = records.find((item) =>
        item.type === "VAI" && item.payload.kind === "pilot" && item.revision === 1 &&
        records.some((candidate) => candidate.id === item.id && candidate.revision === 2)
      )!;
      const replacement = records.find((item) =>
        item.id === first.id && item.revision === 2
      )!;
      const failedReview = records.find((item) =>
        item.type === "REV" && item.payload.outcome === "fail" &&
        item.links.some((link) => link.type === "reviews" && link.target === first.revision_id)
      )!;
      const authorization = records.find((item) =>
        item.type === "DEC" && item.links.some((link) =>
          link.type === "justifies" && link.target === replacement.revision_id
        )
      )!;
      const replacementContext = records.find((item) =>
        item.type === "BSL" && item.payload.scope === replacement.revision_id
      )!;
      expect({
        first: first.revision_id,
        replacement: replacement.revision_id,
        failedReview: failedReview.revision_id,
        authorization: authorization.revision_id,
        replacementContext: replacementContext.revision_id,
      }).toEqual({
        first: "VAI-0000000017-r00001",
        replacement: "VAI-0000000017-r00002",
        failedReview: "REV-DE6MH2AS75-r00001",
        authorization: "DEC-5AMKCRNEBB-r00001",
        replacementContext: "BSL-0000000020-r00001",
      });
      expect(failedReview).toEqual(expect.objectContaining({
        payload: expect.objectContaining({
          correction_authority: "package-evidence",
          outcome: "fail",
        }),
        created_by: expect.objectContaining({ scenario: "review-datum-in-context@2" }),
      }));
      expect(replacement).toEqual(expect.objectContaining({
        payload: expect.objectContaining({
          activity_bindings: expect.arrayContaining([
            "Correct the failed Review by adding an exact reproducible mode-producing observation.",
          ]),
        }),
        created_by: expect.objectContaining({ scenario: "revise-pilot-vai-after-review@1" }),
      }));
      expect(replacement.links).toContainEqual({
        type: "corrects-review",
        target: failedReview.revision_id,
      });
      expect(authorization).toEqual(expect.objectContaining({
        payload: expect.objectContaining({ effective_scope: replacement.revision_id }),
        created_by: expect.objectContaining({ scenario: "revise-pilot-vai-after-review@1" }),
      }));
      expect(replacementContext.payload).toEqual(expect.objectContaining({
        definition_members: [replacement.revision_id],
        evidence: [],
        snapshot: expect.objectContaining({
          member_hashes: {
            [replacement.revision_id]:
              "sha256:2b9358542cc3894f2aacf8692f28ae051f17843ef40fd6b59bc0d4efa7cc716e",
          },
          resolved_links: {
            [replacementContext.revision_id]: [],
            [replacement.revision_id]: [
              "ART-0000000016-r00001",
              "ENV-0000000006-r00001",
              failedReview.revision_id,
              "VER-0000000013-r00001",
            ],
          },
          process_provenance: expect.objectContaining({ process_ref: fixtureProcessRef }),
        }),
      }));
      const executions = await scenarioExecutionRecords(repository);
      expect(executions.find((item) => item.outputs?.some((output: any) =>
        output.lifecycleDatum?.revisionId === failedReview.revision_id
      ))).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "review-datum-in-context@2" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      }));
      expect(executions.find((item) => item.outputs?.some((output: any) =>
        output.lifecycleDatum?.revisionId === replacement.revision_id
      ))).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "revise-pilot-vai-after-review@1" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
        outputs: expect.arrayContaining([
          expect.objectContaining({ name: "replacement" }),
          expect.objectContaining({ name: "authorization" }),
        ]),
      }));

      const evaluation = evaluateLifecycle(loaded.package, snapshot);
      expect(evaluation.diagnostics).toEqual([]);
      expect(evaluation.obligations.find((item) =>
        item.obligation === "verification-run-required" && item.subject === first.revision_id
      )).toBeUndefined();
      expect(evaluation.obligations.find((item) =>
        item.obligation === "passing-review-required" &&
        item.subject === replacement.revision_id
      )).toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@2",
      }));

      const prepared = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(prepared, "subject")).toBe(replacement.revision_id);
      expect(prepared.packet.obligation.instance).toContain(replacement.revision_id);
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("retries after a durable all-not-launched run and progresses only after exercised evidence through the public command application", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase1-no-exercise-"));
    const processRoot = await phase1PilotRetryProcessPackage();
    try {
      await initializeProcessPackageFixture(repository, processRoot);
      const installedProcessRoot = await installCurrentLifecycleDataFixture(
        repository,
        "phase-1-pilot-retry-ready",
      );
      const loadedFixture = await loadProcessPackage(installedProcessRoot);
      if (!loadedFixture.ok) throw new Error(JSON.stringify(loadedFixture.diagnostics));
      const fixtureProcessRef =
        "mdlm-bootstrap@0.74.0#sha256:e5e1533167c2d71be979d29e3f5898c16c47aa1d98e7d9c57de77d3b4d57da1b";
      const retry = await prepareNextAssignment(
        repository,
        "execute-verification-run@1",
      );
      const implementation = inputRevision(retry, "implementation");
      const activity = inputRevision(retry, "activity");
      const environmentRevision = inputRevision(retry, "environment");
      const executionTarget = inputRevision(retry, "execution_target");
      expect(retry.packet.obligation).toEqual(expect.objectContaining({
        definition: "verification-run-required@1",
        instance: expect.stringContaining(implementation),
      }));
      expect(loadedFixture.package.scenarios["execute-verification-run"]?.prompt_ref).toBe(
        "prompts/execute-verification-run.md@2",
      );
      expect(retry.packet.prompt).toEqual(expect.objectContaining({
        reference: "prompts/execute-verification-run.md@2",
        content: expect.stringContaining(
          "A completed RUN means the bounded runner procedure completed",
        ),
      }));
      const exercisedEvidence = [
        "case:supported:exit-0",
        "case:unsupported:exit-2",
      ];
      const exercised = await submitAssignment(repository, retry, [{
        localId: "run",
        name: "run",
        invocation: 0,
        lifecycleDatum: {
          type: "RUN",
          payload: {
            title: "Exercised pilot run",
            kind: "pilot",
            started_at: "2026-01-01T00:02:00.000Z",
            completed_at: "2026-01-01T00:02:01.000Z",
            execution_state: "completed",
            execution_target: { kind: "prototype", ref: executionTarget },
            runner_ref: "runner:phase-1-public-command",
            configuration_refs: [environmentRevision],
            activities_expected: [activity],
            activities_invoked: [activity],
            evidence_locations: exercisedEvidence,
          },
          links: [
            { type: "executes", target: implementation },
            { type: "uses", target: environmentRevision },
            { type: "targets", target: executionTarget },
            { type: "produces", target: "$proposal.result.revision_id" },
          ],
          body: "The product launched and both behavior classes were exercised.\n",
        },
      }, {
        localId: "result",
        name: "result",
        invocation: 0,
        lifecycleDatum: {
          type: "RES",
          payload: {
            title: "Suitable exercised pilot result",
            claim: {
              kind: "pilot",
              scope: "verification-design",
              outcome: "suitable",
              formal_evidence_eligible: false,
            },
            assessment_state: "accepted",
            observations: {
              expected_success_observed: true,
              expected_discrimination_observed: true,
              details: "Supported behavior succeeded and intentionally unsupported behavior rejected.",
            },
            evidence_refs: exercisedEvidence,
            assessor_ref: "runner:phase-1-public-command",
          },
          links: [{ type: "assessed-in", target: environmentRevision }],
          body: "Both declared behavior classes were observed.\n",
        },
      }]);
      expect(exercised.status, `${exercised.stderr}${exercised.stdout}`).toBe(0);
      const afterInspection = await loadRepositoryInspection(
        repository,
        loadedFixture.package,
        fixtureProcessRef,
      );
      expect(afterInspection.ok, JSON.stringify(afterInspection.diagnostics)).toBe(true);
      if (!afterInspection.ok) return;
      const afterSnapshot = afterInspection.value.lifecycleSnapshot(
        "phase-1-product-assurance",
      );
      const afterRecords = afterSnapshot.records.map((item) => item.datum);
      const setupFailureRun = afterRecords.find((item) =>
        item.type === "RUN" && Array.isArray(item.payload.evidence_locations) &&
        item.payload.evidence_locations.includes("case:all:not-launched")
      )!;
      const setupFailureResult = afterRecords.find((item) =>
        item.type === "RES" && setupFailureRun.links.some((link) =>
          link.type === "produces" && link.target === item.revision_id
        )
      )!;
      const noExerciseEvidence = [
        "setup:containment-unavailable",
        "case:all:not-launched",
      ];
      expect(setupFailureRun.payload).toEqual(expect.objectContaining({
        execution_state: "completed",
        activities_invoked: [activity],
        evidence_locations: noExerciseEvidence,
      }));
      expect(setupFailureRun.links).toEqual(expect.arrayContaining([
        { type: "executes", target: implementation },
        { type: "uses", target: environmentRevision },
        { type: "targets", target: executionTarget },
        { type: "produces", target: setupFailureResult.revision_id },
      ]));
      expect(setupFailureResult.payload).toEqual(expect.objectContaining({
        claim: expect.objectContaining({ outcome: "inconclusive" }),
        assessment_state: "assessment-required",
        observations: expect.objectContaining({
          expected_success_observed: false,
          expected_discrimination_observed: false,
          details: expect.stringContaining("every target case was not launched"),
        }),
        evidence_refs: noExerciseEvidence,
      }));
      const setupExecution = (await scenarioExecutionRecords(repository)).find(
        (item) => item.outputs?.some((output: any) =>
          output.lifecycleDatum?.revisionId === setupFailureRun.revision_id
        ),
      );
      expect(setupExecution).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "execute-verification-run@1" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      }));
      const evaluation = evaluateLifecycle(loadedFixture.package, afterSnapshot);
      expect(evaluation.diagnostics).toEqual([]);
      expect(evaluateProcessDefinition(
        loadedFixture.package,
        afterSnapshot,
        "selector",
        "exercised-pilot-runs-for-implementation@1",
        { implementation },
      ).result).toHaveLength(1);
      expect(evaluation.obligations.find((item) =>
        item.obligation === "verification-run-required" && item.subject === implementation
      )).toEqual(expect.objectContaining({
        status: "satisfied",
        satisfied: true,
      }));
    } finally {
      await fs.rm(repository, { recursive: true, force: true });
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("satisfies only the pilot obligation with exact suitable recorded result evidence", () => {
    const currentStrategy = strategy(1);
    const currentEnvironment = environment();
    const qualification = qualificationEvidence(currentStrategy, currentEnvironment);
    const activity = pilotActivity();
    const completedImplementation = pilotImplementation();
    const unmetImplementation = pilotImplementation(1, [], "VAI-0HARDUNMET1");
    const completedPilot = pilotRun(completedImplementation, {
      idSuffix: "RECORDED",
      assessmentState: "recorded",
    });
    const records = [
      ...foundation(),
      currentStrategy,
      ...passingReview(currentStrategy, "REV-0HARDREC00"),
      currentEnvironment,
      qualification.activity,
      qualification.implementation,
      qualification.run,
      qualification.result,
      ...passingReview(currentEnvironment, "REV-0HARDREC01", {
        definitions: [currentEnvironment, currentStrategy],
        evidence: [
          qualification.activity,
          qualification.implementation,
          qualification.run,
          qualification.result,
        ],
      }),
      activity,
      ...passingReview(activity, "REV-0HARDREC02", {
        definitions: [activity, foundation()[0]!, foundation()[1]!, currentStrategy],
      }),
      target(),
      completedImplementation,
      implementationAuthorization(completedImplementation, "DEC-0HARDREC01"),
      ...passingReview(completedImplementation, "REV-0HARDREC03"),
      unmetImplementation,
      implementationAuthorization(unmetImplementation, "DEC-0HARDREC02"),
      ...passingReview(unmetImplementation, "REV-0HARDREC04"),
      completedPilot.run,
      completedPilot.result,
    ];

    expect(validatePayload(recoveryPackage, "RUN", completedPilot.run.datum.payload)).toBe(true);
    expect(validatePayload(recoveryPackage, "RES", completedPilot.result.datum.payload)).toBe(true);
    const evaluation = phase1Evaluation(recoveryPackage, records);
    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === completedImplementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "satisfied",
      satisfied: true,
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "verification-run-required" &&
      item.subject === unmetImplementation.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      satisfied: false,
      actionableResolver: "execute-verification-run@1",
      dispatchable: true,
    }));
  });

  it("keeps a completed setup-failure run without treating it as exercised pilot evidence", async () => {
    expect(processPackage.scenarios["execute-verification-run"]?.prompt_ref).toBe(
      "prompts/execute-verification-run.md@2",
    );
    const executionPrompt = await fs.readFile(
      path.join(processPackage.root, "prompts/execute-verification-run.md"),
      "utf8",
    );
    expect(executionPrompt).toContain(
      "A completed RUN means the bounded runner procedure completed",
    );

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

  it("executes timeout cleanup and continues aggregation with the subsequent case", () => {
    if (!["darwin", "linux"].includes(process.platform)) return;
    const runner = path.join(process.cwd(), "scripts/frontier-process-group.mjs");
    const stubbornGroup = `
const { spawn } = require("node:child_process");
process.on("SIGTERM", () => process.stdout.write("parent-term-observed\\n"));
process.stdout.write(${JSON.stringify(CLEANUP_PROBE_PARTIAL_MARKER)} + " parent=" + process.pid + "\\n");
const descendant = spawn(process.execPath, ["-e", ${JSON.stringify(`
process.on("SIGTERM", () => process.stdout.write("descendant-term-observed\\n"));
process.stdout.write("descendant-ready pid=" + process.pid + "\\n");
setInterval(() => {}, 1000);
`)}], { stdio: ["ignore", "pipe", "inherit"] });
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
      runCase(
        stubbornGroup,
        CLEANUP_PROBE_TIMEOUT_MS,
        CLEANUP_PROBE_TERMINATION_GRACE_MS,
      ),
      runCase('process.stdout.write("subsequent-case-succeeded\\n")', 1_000, 100),
    ];
    expect(aggregated[0]).toEqual(expect.objectContaining({ status: 124 }));
    expect(aggregated[0]!.stdout).toContain(CLEANUP_PROBE_PARTIAL_MARKER);
    expect(aggregated[0]!.stdout).toContain("descendant-ready");
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
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);
});
