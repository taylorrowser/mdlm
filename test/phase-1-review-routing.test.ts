import { beforeAll, describe, expect, it } from "vitest";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { operatorWorkProjection } from "../src/assignment.js";
import { submitPreparedResolverScenario } from "../src/scenario-execution.js";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";
import { evaluateProcessDefinition } from "../src/evaluator.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { runPilotControlEmptyArgvPublic } from
  "./pilot-control-empty-argv-public.js";

const processDigest = `sha256:${"c".repeat(64)}`;
const processRef = `mdlm-bootstrap@0.81.0#${processDigest}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  scenario: string,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  const value = lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef, scenario },
    storage: { editable: false, frozen: true },
  });
  value.integrity.scenario_execution_valid = true;
  return value;
}

function phase1Records(): {
  records: LifecycleRecord[];
  strategy: LifecycleRecord;
  activity: LifecycleRecord;
} {
  const product = record("PSP", "PSP-23456789AB", {
    title: "Product intent",
  }, "compile-psp@3");
  const requirement = record("STK", "STK-23456789AB", {
    title: "Count bytes",
  }, "draft-stakeholder-requirements@2", [
    { type: "derived-from", target: product.datum.id },
  ]);
  const acceptedIntent = record("BSL", "BSL-23456789AB", {
    title: "Accepted intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "product",
    group: "DEFAULT",
    definition_members: [
      product.datum.revision_id,
      requirement.datum.revision_id,
    ],
    evidence: [],
  }, "accept-phase-0-intent@1");
  const strategy = record("VSP", "VSP-23456789AB", {
    title: "Pilot strategy",
    level: "stakeholder",
    independence: { boundary: "black-box" },
  }, "define-verification-strategy@1", [
    { type: "governs", target: requirement.datum.id },
    { type: "governs-revision", target: requirement.datum.revision_id },
  ]);
  const activity = record("VER", "VER-23456789AB", {
    title: "Pilot activity",
    kind: "pilot",
    claim: {
      kind: "pilot",
      scope: "verification-design",
      formal_evidence_eligible: false,
    },
    expected_success_activity: "Run the passing control.",
    expected_discrimination_activity: "Run the failing control.",
  }, "write-verification-activity@2", [
    { type: "verifies", target: requirement.datum.id },
    { type: "verifies-revision", target: requirement.datum.revision_id },
    { type: "governed-by", target: strategy.datum.revision_id },
    { type: "derived-from", target: product.datum.revision_id },
  ]);
  return {
    records: [product, requirement, acceptedIntent, strategy, activity],
    strategy,
    activity,
  };
}

describe("Phase 1 review routing", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
  });

  it(
    "publishes and preserves empty pilot-control argv tokens",
    runPilotControlEmptyArgvPublic,
    30_000,
  );

  it("binds verification strategy coverage to stable and revision requirement identities", async () => {
    const loaded = await loadProcessPackage(".lifecycle/process");
    expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    const fixture = phase1Records();
    const requirement = fixture.records.find((item) => item.datum.type === "STK")!;
    const snapshot = {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: fixture.records.filter((item) =>
        item !== fixture.strategy && item !== fixture.activity
      ),
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(loaded.package, snapshot);
    const obligation = evaluation.looseEnds.find((item) =>
      item.obligation === "verification-strategy-required"
    )!;

    const prepared = await dryRunResolverScenario(
      loaded.package,
      snapshot,
      "define-verification-strategy@1",
      obligation.id,
      [],
      evaluation,
    );

    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]?.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "stable_requirements",
        contract: expect.objectContaining({ identity: "stable" }),
        values: [expect.objectContaining({ identity: expect.objectContaining({
          id: requirement.datum.id,
        }) })],
      }),
      expect.objectContaining({
        name: "requirements",
        contract: expect.objectContaining({ identity: "revision" }),
        values: [expect.objectContaining({ identity: expect.objectContaining({
          revision_id: requirement.datum.revision_id,
        }) })],
      }),
    ]));
    expect(prepared.value.expectedOutputs).toEqual([
      expect.objectContaining({
        requiredLinks: [
          { link: "governs", target: { input: "stable_requirements" } },
          { link: "governs-revision", target: { input: "requirements" } },
        ],
      }),
    ]);

    const submitted = await submitPreparedResolverScenario(
      "/tmp/mdlm-issue-428-stable-revision-bindings",
      loaded.package,
      {
        reference: "mdlm-bootstrap@0.92.0",
        digest: processDigest,
        language: "mdlm-expression@1",
      },
      {
        scenarioReference: "define-verification-strategy@1",
        obligationInstance: obligation.id,
        proposal: {
          outputs: [{
            localId: "strategy",
            name: "strategy",
            invocation: 0,
            lifecycleDatum: {
              type: "VSP",
              payload: {
                title: "Stakeholder verification strategy",
                rationale: "Verify the exact accepted stakeholder commitment.",
                level: "stakeholder",
                permitted_methods: ["test"],
                independence: {
                  boundary: "black-box",
                  prohibited_inputs: [
                    "product source code",
                    "product unit tests",
                    "private implementation details",
                    "uncontrolled implementation shortcuts",
                  ],
                },
                evidence_policy: "Retain the exact black-box observations.",
                assessment_policy: "Assess every bound requirement.",
                environment_profile: {
                  id: "bounded-cli",
                  purpose: "Run one bounded command-line verification.",
                  capabilities: {
                    controllability: ["stdin"],
                    observability: ["stdout"],
                    external_services: [],
                    timing: "bounded",
                  },
                },
              },
              links: [
                { type: "governs", target: requirement.datum.id },
                { type: "governs-revision", target: requirement.datum.revision_id },
              ],
              body: "The strategy covers the stable commitment and its exact Revision.",
            },
          }],
          completionEvidence: { summary: "Both requirement identities are covered." },
        },
        assignment: "issue-428-stable-revision-bindings",
        responseDigest: `sha256:${"b".repeat(64)}`,
        suppliedAuthorities: [],
        suppliedDelegations: [],
        loadedSkillRefs: prepared.value.prompt.skills.map((skill) => skill.reference),
      },
      {
        dryRun: prepared.value,
        evaluation,
        scenario: loaded.package.scenarios["define-verification-strategy"]!,
        snapshot,
        publishMutation: async (_root, _package, _expected, data, executionId) => ({
          ok: true,
          value: {
            created: data.map((datum) => ({
              id: datum.id,
              revisionId: datum.revision_id,
              type: datum.type,
              path: `.lifecycle/data/.transactions/${executionId}/${datum.type}.md`,
            })),
            executionPath: `.lifecycle/data/.transactions/${executionId}/execution.json`,
          },
          diagnostics: [],
        }),
      },
    );
    expect(submitted.ok, JSON.stringify(submitted.diagnostics)).toBe(true);
  });

  it("routes a new VSP to Review before pilot activity authoring", async () => {
    const fixture = phase1Records();
    const snapshot = {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: fixture.records.filter((record) => record !== fixture.activity),
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const activity = evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-verification-activity-required"
    );

    expect(activity).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      actionableResolver: "review-phase-1-assurance@1",
      blockedBy: [
        `phase-1-assurance-review-required@1:${fixture.strategy.datum.revision_id}:${processRef}`,
      ],
    }));
    const attempted = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "write-verification-activity@2",
      activity!.id,
      [],
      evaluation,
    );
    expect(attempted).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "obligation-not-dispatchable",
      })],
    });
  });

  it("routes an accepted pilot VER to Review before prototype construction", async () => {
    const fixture = phase1Records();
    const snapshot = {
      processRef,
      phaseId: "phase-1-product-assurance",
      records: fixture.records,
      dependencyComparisons: [],
    };
    const evaluation = evaluateLifecycle(processPackage, snapshot);
    const target = evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-target-required"
    );

    const attempted = await dryRunResolverScenario(
      processPackage,
      snapshot,
      "build-pilot-control-prototype@1",
      target!.id,
      [],
      evaluation,
    );
    expect(attempted).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "obligation-not-dispatchable",
      })],
    });

    expect(target).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      actionableResolver: "review-phase-1-assurance@1",
      blockedBy: [
        `phase-1-assurance-review-required@1:${fixture.activity.datum.revision_id}:${processRef}`,
      ],
    }));
    expect(evaluation.looseEnds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "phase-1-assurance-review-required",
        subject: fixture.activity.datum.revision_id,
        dispatchable: true,
        actionableResolver: "review-phase-1-assurance@1",
      }),
    ]));

  });

  it("uses the active Phase 1 Review obligation at every pure assurance gate", () => {
    for (const obligationId of [
      "pilot-verification-activity-required",
      "pilot-target-required",
      "environment-assurance-required",
      "pilot-verification-implementation-required",
      "verification-run-required",
    ]) {
      const declaration = JSON.stringify(processPackage.obligations[obligationId]);
      expect(declaration).toContain("phase-1-assurance-review-required@1");
      expect(declaration).not.toContain("passing-review-required@2");
    }
  });

  it("routes a failed pilot VAI Review to an exact upstream VER revision", async () => {
    const loaded = await loadProcessPackage(".lifecycle/process");
    expect(loaded.ok, JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    const scenario = loaded.package.scenarios["revise-pilot-vai-after-review"]!;
    const reconciliation = loaded.package.selectors[
      "valid-pilot-vai-activity-reconciliations"
    ]!;
    const completion = scenario.completion as { source: string };
    const query = reconciliation.query as { where: { source: string } };

    expect(scenario.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "replacement_activity",
        types: ["VER"],
        cardinality: "zero-or-one",
        required_links: expect.arrayContaining([
          { link: "verifies", target: { input: "requirement" } },
          { link: "verifies-revision", target: { input: "requirement" } },
          { link: "governed-by", target: { input: "strategy" } },
          { link: "corrects-review", target: { input: "failed_reviews" } },
        ]),
      }),
    ]));
    expect(completion.source).toContain(
      'exists("valid-pilot-vai-activity-reconciliations@1"',
    );
    expect(completion.source).toContain(
      'one("verification-activities-for-implementation@1",\n      {implementation: replacement}) == replacement_activity',
    );
    expect(query.where.source).toContain(
      "candidate.identity.id == activity.identity.id",
    );
    expect(query.where.source).toContain(
      "candidate.payload.claim == activity.payload.claim",
    );
  });

  it("routes an inconclusive pilot result to correction before another run", async () => {
    const strategy = record("VSP", "VSP-R3S7T402XY", {
      title: "Pilot strategy",
      environment_profile: {
        id: "local-cli",
        capabilities: {
          controllability: ["process"],
          observability: ["stdio", "exit-status"],
          external_services: [],
          timing: "bounded",
        },
      },
    }, "define-verification-strategy@1");
    const requirement = record("STK", "STK-R3S7T402XY", {
      title: "Portable command",
    }, "draft-stakeholder-requirements@2");
    const activity = record("VER", "VER-R3S7T402XY", {
      title: "Pilot activity",
      kind: "pilot",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
    }, "write-verification-activity@2", [
      { type: "verifies-revision", target: requirement.datum.revision_id },
      { type: "governed-by", target: strategy.datum.revision_id },
    ]);
    const environment = record("ENV", "ENV-R3S7T402XY", {
      title: "Local command environment",
    }, "realize-verification-environment@1", [
      { type: "realizes", target: strategy.datum.revision_id },
    ]);
    const target = record("ART", "ART-R3S7T402XY", {
      title: "Disposable controls",
      kind: "prototype",
      supported_behavior: ["portable command starts"],
      unsupported_behavior: ["invalid input is rejected"],
      prototype_controls: {
        activity_ref: activity.datum.revision_id,
        working_directory: "fresh-temporary-directory",
        known_good: {
          argv: ["node", "-e", "process.exit(0)"],
          expected_observation: {
            exit_status: 0,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "" },
          },
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: ["node", "-e", "process.exit(2)"],
          expected_observation: {
            exit_status: 2,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "" },
          },
          expected_verification_outcome: "fail",
          fault: "Wrong exit status",
        },
      },
    }, "build-pilot-control-prototype@1", [
      { type: "derived-from", target: requirement.datum.revision_id },
    ]);
    const implementation = record("VAI", "VAI-R3S7T402XY", {
      title: "Source-blind pilot procedure",
      kind: "pilot",
      independence_mode: "source-blind",
      target_behavior: {
        supported: ["portable command starts"],
        intentionally_unsupported: ["invalid input is rejected"],
      },
      prototype_control_bindings: {
        activity_ref: activity.datum.revision_id,
        known_good: {
          argv: ["node", "-e", "process.exit(0)"],
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: ["node", "-e", "process.exit(2)"],
          expected_verification_outcome: "fail",
        },
      },
    }, "implement-verification-activity@1", [
      { type: "realizes", target: activity.datum.revision_id },
      { type: "uses", target: environment.datum.revision_id },
      { type: "targets", target: target.datum.revision_id },
    ]);
    const authorization = record("DEC", "DEC-R3S7T402XY", {
      title: "Pilot implementation authorization",
      kind: "decision",
      decision: "Authorize the bounded pilot procedure.",
      alternatives: ["do not execute"],
      effective_scope: implementation.datum.revision_id,
    }, "implement-verification-activity@1", [
      { type: "justifies", target: implementation.datum.revision_id },
    ]);
    const result = record("RES", "RES-R3S7T402XY", {
      title: "Inconclusive pilot result",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        outcome: "inconclusive",
        formal_evidence_eligible: false,
      },
      assessment_state: "inconclusive",
      observations: {
        expected_success_observed: false,
        expected_discrimination_observed: false,
        details: "The declared command was unavailable before product launch.",
      },
    }, "execute-verification-run@2", [
      { type: "assessed-in", target: environment.datum.revision_id },
    ]);
    const run = record("RUN", "RUN-R3S7T402XY", {
      title: "Completed setup-failure run",
      kind: "pilot",
      execution_state: "completed",
    }, "execute-verification-run@2", [
      { type: "executes", target: implementation.datum.revision_id },
      { type: "uses", target: environment.datum.revision_id },
      { type: "targets", target: target.datum.revision_id },
      { type: "produces", target: result.datum.revision_id },
    ]);
    const records = [
      strategy,
      requirement,
      activity,
      environment,
      target,
      implementation,
      authorization,
      run,
      result,
    ];
    const reviewContextMembers = evaluateProcessDefinition(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records,
        dependencyComparisons: [],
      },
      "selector",
      "review-context-members-for@1",
      { subject: implementation.datum.revision_id },
    ).result as Array<{ identity: { revision_id: string } }>;
    expect(reviewContextMembers.map((member) => member.identity.revision_id))
      .toEqual([
        target.datum.revision_id,
        authorization.datum.revision_id,
        environment.datum.revision_id,
        activity.datum.revision_id,
      ]);
    const evaluation = evaluateLifecycle(processPackage, {
      processRef,
      phaseId: "phase-1-product-assurance",
      records,
      dependencyComparisons: [],
    });
    const work = operatorWorkProjection(evaluation, records).filter((item) =>
      item.subject === implementation.datum.revision_id
    );

    expect(work).toEqual(expect.arrayContaining([
      expect.objectContaining({
        definition: "pilot-vai-result-correction-required@1",
        scenario: "revise-pilot-vai-after-result@1",
        dispatchable: true,
      }),
      expect.objectContaining({
        definition: "verification-run-required@2",
        scenario: "revise-pilot-vai-after-result@1",
        dispatchable: false,
        blockedBy: [expect.stringContaining("pilot-vai-result-correction-required@1")],
      }),
    ]));

    const correction = evaluation.looseEnds.find((item) =>
      item.obligation === "pilot-vai-result-correction-required" &&
      item.subject === implementation.datum.revision_id
    )!;
    const prepared = await dryRunResolverScenario(
      processPackage,
      {
        processRef,
        phaseId: "phase-1-product-assurance",
        records,
        dependencyComparisons: [],
      },
      "revise-pilot-vai-after-result@1",
      correction.id,
      [],
      evaluation,
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const submitted = await submitPreparedResolverScenario(
      "/tmp/mdlm-issue-402-no-publication",
      processPackage,
      {
        reference: "mdlm-bootstrap@0.81.0",
        digest: processDigest,
        language: "mdlm-expression@1",
      },
      {
        scenarioReference: "revise-pilot-vai-after-result@1",
        obligationInstance: correction.id,
        proposal: {
          outputs: [{
            localId: "replacement",
            name: "replacement",
            invocation: 0,
            lifecycleDatum: {
              id: implementation.datum.id,
              type: "VAI",
              payload: {
                title: "Corrected source-blind pilot procedure",
                rationale: "Replace the unavailable runner command.",
                kind: "pilot",
                implementation_ref: `procedure:sha256:${"a".repeat(64)}`,
                independence_mode: "source-blind",
                authoring_input_refs: [activity.datum.revision_id],
                prohibited_inputs_observed: [
                  "product source code",
                  "product unit tests",
                  "private implementation details",
                  "uncontrolled implementation shortcuts",
                ],
                activity_bindings: ["known_good", "known_bad"],
                target_behavior: implementation.datum.payload.target_behavior,
                execution_procedure: {
                  deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 },
                  deadline_scope: "infrastructure-safety-only",
                  timeout: {
                    termination: "process-group-sigterm-then-sigkill",
                    force_after_ms: 100,
                    reaping: "all-descendants",
                    capture_partial_raw_observation: true,
                  },
                  cleanup: "guaranteed",
                  aggregation: "continue-through-all-cases",
                },
              },
              links: [
                { type: "realizes", target: activity.datum.revision_id },
                { type: "uses", target: environment.datum.revision_id },
                { type: "targets", target: target.datum.revision_id },
                { type: "corrects-pilot-result", target: result.datum.revision_id },
              ],
              body: "The corrected VAI intentionally omits its required control bindings.",
            },
          }, {
            localId: "authorization",
            name: "authorization",
            invocation: 0,
            lifecycleDatum: {
              type: "DEC",
              payload: {
                title: "Authorize pilot correction",
                rationale: "Use the accepted unfavorable result as correction cause.",
                kind: "decision",
                decision: "Authorize the corrected procedure.",
                alternatives: ["stop"],
                effective_scope: "$proposal.replacement.revision_id",
              },
              links: [{ type: "justifies", target: "$proposal.replacement.revision_id" }],
              body: "Authorize only the exact corrected VAI.",
            },
          }],
          completionEvidence: { summary: "Correction proposed without control bindings." },
        },
        assignment: "issue-402-missing-bindings",
        responseDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        suppliedAuthorities: [],
        suppliedDelegations: [],
        loadedSkillRefs: prepared.value.prompt.skills.map((skill) => skill.reference),
      },
      {
        dryRun: prepared.value,
        evaluation,
        scenario: processPackage.scenarios["revise-pilot-vai-after-result"]!,
        snapshot: {
          processRef,
          phaseId: "phase-1-product-assurance",
          records,
          dependencyComparisons: [],
        },
      },
    );
    expect(submitted).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "scenario-completion-failed" })],
    });
  });
});
