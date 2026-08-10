import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");
const existingRepositoryCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim();

describe("req product-assurance qualification and pilot slice", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mdlm-product-assurance-"),
    );
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      examplePackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("rejects direct authoring of package-declared generated evidence", () => {
    const created = req(
      repositoryRoot,
      "new",
      "RES",
      "--scenario",
      "execute-verification-run@1",
      "--set",
      "title=Forged formal result",
      "--set",
      'claim={"kind":"formal","scope":"requirement","outcome":"pass","formal_evidence_eligible":true}',
      "--set",
      "assessment_state=accepted",
      "--set",
      'observations={"expected_success_observed":true,"expected_discrimination_observed":true,"details":"Not produced by a run"}',
      "--set",
      'evidence_refs=["evidence:forged"]',
      "--set",
      "assessor_ref=assessor:forged",
      "--json",
    );

    expect(created.status).toBe(1);
    expect(JSON.parse(created.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "generated-datum-requires-scenario-execution",
      }),
    ]);
  });

  it("qualifies one environment and records a discriminating source-independent pilot", async () => {
    let adapterSequence = 0;
    const create = (...arguments_: string[]) => {
      const result = req(repositoryRoot, "new", ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as {
        id: string;
        revisionId: string;
      };
    };
    const looseEnds = () => {
      const result = req(
        repositoryRoot,
        "loose-ends",
        "--phase",
        "phase-1-product-assurance",
        "--json",
      );
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items as Array<Record<string, any>>;
    };
    const runObligation = (subject: string) => {
      return looseEnds().find((item) =>
        item.obligation === "verification-run-required" &&
        item.subject === subject
      );
    };
    const adapter = async (response: unknown, label: string) => {
      adapterSequence += 1;
      const executable = path.join(
        repositoryRoot,
        `${String(adapterSequence).padStart(2, "0")}-${label}.mjs`,
      );
      const capture = `${executable}.request.json`;
      await fs.writeFile(
        executable,
        `#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = fs.readFileSync(0, "utf8");\nfs.writeFileSync(${JSON.stringify(capture)}, input);\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
        { mode: 0o755 },
      );
      return { executable, capture };
    };
    const createDiscoveredReviewContext = async (
      subject: string,
      title: string,
      definitionMembers: string[],
      evidence: string[] = [],
    ) => {
      const obligation = looseEnds().find((item) =>
        item.obligation === "review-context-required" && item.subject === subject
      );
      expect(obligation).toEqual(expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "create-review-context@1",
      }));
      if (!obligation) throw new Error(`Missing Review Context Obligation for ${subject}`);
      const configured = await adapter({
        outputs: [{
          name: "context",
          invocation: 0,
          lifecycleDatum: {
            type: "BSL",
            payload: {
              title,
              kind: "review-context",
              role: "review-context",
              scope: subject,
              group: "DEFAULT",
              definition_members: definitionMembers,
              evidence,
            },
            links: [],
            body: `Exact Review Context for ${subject}.\n`,
          },
        }],
        completionEvidence: { summary: `Exact Review Context frozen for ${subject}.` },
      }, "review-context");
      const executed = req(
        repositoryRoot,
        "scenario",
        "execute",
        String(obligation.actionableResolver),
        "--obligation",
        String(obligation.id),
        "--adapter",
        configured.executable,
        "--json",
      );
      expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
      return JSON.parse(executed.stdout).execution.outputs[0].lifecycleDatum as {
        revisionId: string;
      };
    };
    const review = async (
      subject: string,
      context: string,
      outcome: "pass" | "fail" = "pass",
      findings: Array<Record<string, unknown>> = [],
    ) => {
      const obligation = looseEnds().find((item) =>
        item.obligation === "passing-review-required" &&
        item.subject === subject
      );
      expect(obligation).toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@2",
      }));
      if (!obligation) throw new Error(`Missing Review Obligation for ${subject}`);
      const configured = await adapter({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: `Independent assurance review of ${subject}`,
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings,
              outcome,
            },
            links: [
              { type: "reviews", target: subject },
              { type: "contextualizes", target: context },
            ],
            body: `The exact subject records an independent ${outcome} contextual Review.\n`,
          },
        }],
        completionEvidence: {
          summary: `Independent assurance Review completed with ${outcome}.`,
        },
      }, "review");
      const executed = req(
        repositoryRoot,
        "scenario",
        "execute",
        String(obligation.actionableResolver),
        "--obligation",
        String(obligation.id),
        "--authorize",
        "independent-reviewer",
        "--adapter",
        configured.executable,
        "--input",
        `subject=${subject}`,
        "--input",
        `review_context=${context}`,
        "--json",
      );
      expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
      return JSON.parse(executed.stdout).execution.outputs[0].lifecycleDatum
        .revisionId as string;
    };
    const runResponse = (
      runId: string,
      resultId: string,
      kind: "qualification" | "pilot",
      implementation: string,
      environment: string,
      target: string,
      claim: Record<string, unknown>,
    ) => ({
      outputs: [
        {
          name: "run",
          invocation: 0,
          lifecycleDatum: {
            id: runId,
            type: "RUN",
            payload: {
              title: `${kind} verification run`,
              kind,
              started_at: "2026-08-04T19:00:00.000Z",
              completed_at: "2026-08-04T19:01:00.000Z",
              execution_state: "completed",
              execution_target: {
                kind: kind === "qualification" ? "environment" : "prototype",
                ref: target,
              },
              runner_ref: "runner:assurance-pilot@1",
              configuration_refs: ["config:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
              activities_expected: ["supported-success", "unsupported-discrimination"],
              activities_invoked: ["supported-success", "unsupported-discrimination"],
              evidence_locations: [`evidence:${kind}-run`],
            },
            links: [
              { type: "executes", target: implementation },
              { type: "uses", target: environment },
              { type: "targets", target },
              { type: "produces", target: `${resultId}-r00001` },
            ],
            body: `Exact ${kind} execution manifest.\n`,
          },
        },
        {
          name: "result",
          invocation: 0,
          lifecycleDatum: {
            id: resultId,
            type: "RES",
            payload: {
              title: `${kind} verification result`,
              claim,
              assessment_state: "accepted",
              observations: {
                expected_success_observed: true,
                expected_discrimination_observed: true,
                details: "Supported behavior succeeded and the negative control exposed the declared unsupported behavior.",
              },
              evidence_refs: [`evidence:${kind}-run`],
              assessor_ref: "assessor:product-assurance@1",
            },
            links: [{ type: "assessed-in", target: environment }],
            body: `Scoped ${kind} result.\n`,
          },
        },
      ],
      completionEvidence: {
        summary: "Both expected success and expected discrimination were observed.",
      },
    });

    const product = create(
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Representative report export",
      "--set",
      "rationale=A narrow externally observable behavior supports the assurance tracer",
      "--set",
      "problem=Report authors cannot carry one result into another tool",
      "--set",
      'users=["report author"]',
      "--set",
      'goals=["export one completed report"]',
      "--set",
      'non_goals=["general integration platform"]',
      "--set",
      'success_measures=["one report exports through the public boundary"]',
    );
    const requirement = create(
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Export one completed report",
      "--set",
      "rationale=Report authors need portable outcomes",
      "--set",
      "statement=The product shall export one completed report through its public interface.",
      "--set",
      "verification_intent=Demonstrate a representative export and reject an unsupported format.",
      "--set",
      "stakeholder=report author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${product.id}`,
    );
    const productContext = await createDiscoveredReviewContext(
      product.revisionId,
      "Product specification Review Context",
      [product.revisionId],
    );
    await review(product.revisionId, productContext.revisionId);
    const requirementContext = await createDiscoveredReviewContext(
      requirement.revisionId,
      "Stakeholder requirement Review Context",
      [requirement.revisionId, product.revisionId],
    );
    await review(requirement.revisionId, requirementContext.revisionId);
    const strategyWork = looseEnds().find((item) =>
      item.obligation === "verification-strategy-required"
    );
    expect(strategyWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "define-verification-strategy@1",
    }));

    const prohibitedInputs = [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ];
    const strategyAdapter = await adapter({
      outputs: [{
        name: "strategy",
        invocation: 0,
        lifecycleDatum: {
          type: "VSP",
          payload: {
            title: "Stakeholder export verification strategy",
            rationale: "The stakeholder commitment needs a controlled public-boundary demonstration",
            level: "stakeholder",
            permitted_methods: ["demonstration"],
            independence: {
              boundary: "black-box",
              prohibited_inputs: prohibitedInputs,
            },
            evidence_policy: "Retain exact public inputs and visible outputs",
            assessment_policy: "Pilot suitability requires positive and negative controls",
            environment_profile: {
              id: "browser-e2e",
              purpose: "Exercise the externally observable export boundary",
              capabilities: {
                controllability: ["create an isolated report fixture"],
                observability: ["capture the downloaded public artifact"],
                external_services: [],
                timing: "deterministic completion timeout",
              },
            },
          },
          links: [
            { type: "governs", target: requirement.id },
            { type: "governs-revision", target: requirement.revisionId },
          ],
          body: "The strategy governs the exact Phase 1 entry commitment.\n",
        },
      }],
      completionEvidence: { summary: "The exact commitment has strategy coverage." },
    }, "verification-strategy");
    const strategyExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(strategyWork!.actionableResolver),
      "--obligation",
      String(strategyWork!.id),
      "--adapter",
      strategyAdapter.executable,
      "--json",
    );
    expect(strategyExecution.status, `${strategyExecution.stderr}${strategyExecution.stdout}`).toBe(0);
    const strategy = JSON.parse(strategyExecution.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };
    const strategyContext = await createDiscoveredReviewContext(
      strategy.revisionId,
      "Verification strategy Review Context",
      [strategy.revisionId, requirement.revisionId],
    );
    const strategyReview = await review(
      strategy.revisionId,
      strategyContext.revisionId,
    );

    const environmentWork = looseEnds().find((item) =>
      item.obligation === "environment-assurance-required" &&
      item.subject === strategy.revisionId
    );
    expect(environmentWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "realize-verification-environment@1",
      resolver: expect.objectContaining({
        expectedOutputs: expect.arrayContaining([
          expect.objectContaining({ name: "environment", types: ["ENV"] }),
          expect.objectContaining({ name: "qualification_activity", types: ["VER"] }),
          expect.objectContaining({ name: "qualification_implementation", types: ["VAI"] }),
        ]),
      }),
    }));

    const environmentAdapter = await adapter({
      outputs: [
        {
          name: "environment",
          invocation: 0,
          lifecycleDatum: {
            id: "ENV-0000000001",
            type: "ENV",
            payload: {
              title: "Isolated browser export environment",
              rationale: "The exact strategy requires controlled fixtures and visible artifact capture",
              strategy_revision: strategy.revisionId,
              profile_id: "browser-e2e",
              capabilities: {
                controllability: ["create an isolated report fixture"],
                observability: ["capture the downloaded public artifact"],
                external_services: [],
                timing: "deterministic completion timeout",
              },
              reproducibility: {
                environment_ref: "container:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                configuration_digest: `sha256:${"c".repeat(64)}`,
                reconstruction: "Restore the exact container and isolated fixture configuration.",
              },
            },
            links: [{ type: "realizes", target: strategy.revisionId }],
            body: "Exact reproducible qualification environment.\n",
          },
        },
        {
          name: "qualification_activity",
          invocation: 0,
          lifecycleDatum: {
            id: "VER-0000000001",
            type: "VER",
            payload: {
              title: "Qualify browser export capabilities",
              rationale: "The environment must demonstrate controllability and observability",
              kind: "qualification",
              method: "test",
              assessment_mode: "automatic",
              claim: { kind: "qualification", scope: "environment-capability", formal_evidence_eligible: false },
              acceptance_criteria: ["isolated fixture is controllable", "visible artifact is observable"],
              evidence_requirements: ["fixture log", "artifact capture"],
              expected_success_activity: "Create and observe an isolated report export",
              expected_discrimination_activity: "Detect an absent visible artifact",
            },
            links: [
              { type: "governed-by", target: strategy.revisionId },
              { type: "qualifies", target: "ENV-0000000001-r00001" },
            ],
            body: "Qualification activity for declared environment capabilities.\n",
          },
        },
        {
          name: "qualification_implementation",
          invocation: 0,
          lifecycleDatum: {
            id: "VAI-0000000001",
            type: "VAI",
            payload: {
              title: "Environment capability qualification procedure",
              rationale: "The procedure exercises only declared environment capabilities",
              kind: "qualification",
              implementation_ref: "procedure:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
              independence_mode: "environment-capability",
              authoring_input_refs: [strategy.revisionId, "ENV-0000000001-r00001", "VER-0000000001-r00001"],
              prohibited_inputs_observed: prohibitedInputs,
              activity_bindings: ["supported-success", "unsupported-discrimination"],
              target_behavior: {
                supported: ["isolated fixture and visible artifact capture"],
                intentionally_unsupported: ["ambient production credentials"],
              },
            },
            links: [
              { type: "realizes", target: "VER-0000000001-r00001" },
              { type: "uses", target: "ENV-0000000001-r00001" },
              { type: "targets", target: "ENV-0000000001-r00001" },
            ],
            body: "Qualification implementation bounded to environment capabilities.\n",
          },
        },
      ],
      completionEvidence: { summary: "The strategy environment and qualification pair were realized atomically." },
    }, "verification-environment");
    const environmentExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(environmentWork!.actionableResolver),
      "--obligation",
      String(environmentWork!.id),
      "--adapter",
      environmentAdapter.executable,
      "--json",
    );
    expect(environmentExecution.status, `${environmentExecution.stderr}${environmentExecution.stdout}`).toBe(0);
    const environmentOutputs = JSON.parse(environmentExecution.stdout).execution.outputs as Array<{
      name: string;
      lifecycleDatum: { id: string; revisionId: string };
    }>;
    const output = (name: string) => environmentOutputs.find((item) => item.name === name)!.lifecycleDatum;
    let environment = output("environment");
    let qualificationActivity = output("qualification_activity");
    let qualificationImplementation = output("qualification_implementation");

    const prematureEnvironmentContext = looseEnds().find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === environment.revisionId
    );
    expect(prematureEnvironmentContext).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "execute-verification-run@1",
    }));

    const qualificationObligation = runObligation(
      qualificationImplementation.revisionId,
    )!;
    expect(qualificationObligation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
      resolver: expect.objectContaining({
        expectedOutputs: expect.arrayContaining([
          expect.objectContaining({ name: "run", types: ["RUN"] }),
          expect.objectContaining({ name: "result", types: ["RES"] }),
        ]),
      }),
    }));
    const qualificationAdapter = await adapter(
      runResponse(
        "RUN-0000000001",
        "RES-0000000001",
        "qualification",
        qualificationImplementation.revisionId,
        environment.revisionId,
        environment.revisionId,
        {
          kind: "qualification",
          scope: "environment-capability",
          outcome: "pass",
          formal_evidence_eligible: false,
        },
      ),
      "qualification-run",
    );
    const qualificationExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(qualificationObligation.actionableResolver),
      "--obligation",
      String(qualificationObligation.id),
      "--adapter",
      qualificationAdapter.executable,
      "--input",
      `implementation=${qualificationImplementation.revisionId}`,
      "--input",
      `activity=${qualificationActivity.revisionId}`,
      "--input",
      `environment=${environment.revisionId}`,
      "--input",
      `execution_target=${environment.revisionId}`,
      "--json",
    );
    expect(
      qualificationExecution.status,
      `${qualificationExecution.stderr}${qualificationExecution.stdout}`,
    ).toBe(0);
    let qualificationRun = "RUN-0000000001-r00001";
    let qualificationResult = "RES-0000000001-r00001";

    expect(runObligation(qualificationImplementation.revisionId)).toBeUndefined();

    const environmentContextWork = looseEnds().find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === environment.revisionId
    );
    expect(environmentContextWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-review-context@1",
    }));
    const environmentContextAdapter = await adapter({
      outputs: [{
        name: "context",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Environment qualification review context",
            kind: "review-context",
            role: "review-context",
            scope: environment.revisionId,
            group: "DEFAULT",
            definition_members: [strategy.revisionId, environment.revisionId],
            evidence: [
              qualificationActivity.revisionId,
              qualificationImplementation.revisionId,
              qualificationRun,
              qualificationResult,
            ],
          },
          links: [],
          body: "Exact environment qualification boundary.\n",
        },
      }],
      completionEvidence: { summary: "The qualified environment and exact assurance chain were frozen." },
    }, "environment-context");
    const environmentContextExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(environmentContextWork!.actionableResolver),
      "--obligation",
      String(environmentContextWork!.id),
      "--adapter",
      environmentContextAdapter.executable,
      "--json",
    );
    expect(
      environmentContextExecution.status,
      `${environmentContextExecution.stderr}${environmentContextExecution.stdout}`,
    ).toBe(0);
    const environmentContext = JSON.parse(environmentContextExecution.stdout)
      .execution.outputs[0].lifecycleDatum as { revisionId: string };
    const failedEnvironmentReview = await review(
      environment.revisionId,
      environmentContext.revisionId,
      "fail",
      [{
        id: "F-001",
        target: environment.revisionId,
        relationship: "primary",
        severity: "blocking",
        summary: "Independent-case execution is not discriminatively qualified.",
        evidence: "Repeated stateless controls cannot expose shared invocation state.",
      }],
    );
    const correctionWork = looseEnds().find((item) =>
      item.obligation === "environment-review-correction-required" &&
      item.subject === environment.revisionId
    );
    expect(correctionWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-environment-assurance-after-review@1",
    }));
    expect(correctionWork?.resolver).toEqual(expect.objectContaining({
      expectedOutputs: expect.arrayContaining([
        expect.objectContaining({ name: "replacement", types: ["ENV"] }),
        expect.objectContaining({ name: "qualification_activity", types: ["VER"] }),
        expect.objectContaining({ name: "qualification_implementation", types: ["VAI"] }),
      ]),
    }));
    expect(failedEnvironmentReview).toMatch(/^REV-[0-9A-HJKMNP-TV-Z]{10,12}-r00001$/);
    const correctionResponse = {
      outputs: [
        {
          name: "replacement",
          invocation: 0,
          lifecycleDatum: {
            id: environment.id,
            type: "ENV",
            payload: {
              title: "State-discriminating isolated browser export environment",
              rationale: "The corrected qualification uses state-sensitive controls capable of exposing shared invocation state.",
              strategy_revision: strategy.revisionId,
              profile_id: "browser-e2e",
              capabilities: {
                controllability: ["create an isolated report fixture"],
                observability: ["capture the downloaded public artifact"],
                external_services: [],
                timing: "deterministic completion timeout",
              },
              reproducibility: {
                environment_ref: "container:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                configuration_digest: `sha256:${"e".repeat(64)}`,
                reconstruction: "Restore the exact container and reset state before each isolated fixture execution.",
              },
            },
            links: [
              { type: "realizes", target: strategy.revisionId },
              { type: "corrects-review", target: failedEnvironmentReview },
            ],
            body: "Corrected environment assurance adds a state-sensitive isolation control.\n",
          },
        },
        {
          name: "qualification_activity",
          invocation: 0,
          lifecycleDatum: {
            id: "VER-0000000003",
            type: "VER",
            payload: {
              title: "Qualify state-sensitive browser isolation",
              rationale: "A state marker distinguishes isolated execution from hidden shared state.",
              kind: "qualification",
              method: "test",
              assessment_mode: "automatic",
              claim: { kind: "qualification", scope: "environment-capability", formal_evidence_eligible: false },
              acceptance_criteria: [
                "first invocation mutates a private marker",
                "second isolated invocation observes an absent marker",
                "shared-state negative control observes the marker and is rejected",
              ],
              evidence_requirements: ["per-invocation marker observations", "negative-control rejection"],
              expected_success_activity: "Execute two reset fixtures and observe no marker carried between them",
              expected_discrimination_activity: "Execute a deliberately shared fixture and detect its carried marker",
            },
            links: [
              { type: "governed-by", target: strategy.revisionId },
              { type: "qualifies", target: `${environment.id}-r00002` },
            ],
            body: "Fresh qualification design directly addresses F-001.\n",
          },
        },
        {
          name: "qualification_implementation",
          invocation: 0,
          lifecycleDatum: {
            id: "VAI-0000000009",
            type: "VAI",
            payload: {
              title: "State-sensitive isolation qualification procedure",
              rationale: "The procedure resets positive invocations and preserves state only in the negative control.",
              kind: "qualification",
              implementation_ref: `procedure:sha256:${"f".repeat(64)}`,
              independence_mode: "environment-capability",
              authoring_input_refs: [strategy.revisionId, `${environment.id}-r00002`, "VER-0000000003-r00001", failedEnvironmentReview],
              prohibited_inputs_observed: prohibitedInputs,
              activity_bindings: ["reset-positive", "shared-state-negative-control"],
              target_behavior: {
                supported: ["isolated state reset between invocations"],
                intentionally_unsupported: ["shared invocation state"],
              },
            },
            links: [
              { type: "realizes", target: "VER-0000000003-r00001" },
              { type: "uses", target: `${environment.id}-r00002` },
              { type: "targets", target: `${environment.id}-r00002` },
            ],
            body: "Fresh qualification implementation does not borrow prior evidence.\n",
          },
        },
      ],
      completionEvidence: {
        summary: "Every exact failed Review finding is addressed with a replacement ENV and fresh qualification chain.",
      },
    };
    const incompleteCorrectionResponse = structuredClone(correctionResponse);
    const incompleteReplacement = incompleteCorrectionResponse.outputs[0]!;
    incompleteReplacement.lifecycleDatum.links =
      incompleteReplacement.lifecycleDatum.links.filter(
        (link) => link.type !== "corrects-review",
      );
    const incompleteCorrectionAdapter = await adapter(
      incompleteCorrectionResponse,
      "incomplete-environment-correction",
    );
    const incompleteCorrection = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(correctionWork!.actionableResolver),
      "--obligation",
      String(correctionWork!.id),
      "--adapter",
      incompleteCorrectionAdapter.executable,
      "--json",
    );
    expect(incompleteCorrection.status).toBe(1);
    expect(JSON.parse(incompleteCorrection.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "scenario-output-required-link-missing",
        path: "outputs.replacement.links.corrects-review",
      }),
    ]);
    expect(req(
      repositoryRoot,
      "show",
      `${environment.id}-r00002`,
      "--json",
    ).status).toBe(1);

    const overbroadCorrectionResponse = structuredClone(correctionResponse);
    overbroadCorrectionResponse.outputs[0]!.lifecycleDatum.links.push({
      type: "corrects-review",
      target: strategyReview,
    });
    const overbroadCorrectionAdapter = await adapter(
      overbroadCorrectionResponse,
      "overbroad-environment-correction",
    );
    const overbroadCorrection = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(correctionWork!.actionableResolver),
      "--obligation",
      String(correctionWork!.id),
      "--adapter",
      overbroadCorrectionAdapter.executable,
      "--json",
    );
    expect(overbroadCorrection.status).toBe(1);
    expect(JSON.parse(overbroadCorrection.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]);
    expect(req(
      repositoryRoot,
      "show",
      `${environment.id}-r00002`,
      "--json",
    ).status).toBe(1);

    const correctionAdapter = await adapter(
      correctionResponse,
      "environment-correction",
    );
    const correctionExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(correctionWork!.actionableResolver),
      "--obligation",
      String(correctionWork!.id),
      "--adapter",
      correctionAdapter.executable,
      "--json",
    );
    expect(
      correctionExecution.status,
      `${correctionExecution.stderr}${correctionExecution.stdout}`,
    ).toBe(0);
    const correctedOutputs = JSON.parse(correctionExecution.stdout).execution.outputs as Array<{
      name: string;
      lifecycleDatum: { id: string; revisionId: string };
    }>;
    const correctedOutput = (name: string) =>
      correctedOutputs.find((item) => item.name === name)!.lifecycleDatum;
    environment = correctedOutput("replacement");
    qualificationActivity = correctedOutput("qualification_activity");
    qualificationImplementation = correctedOutput("qualification_implementation");
    expect(environment.revisionId).toBe("ENV-0000000001-r00002");
    const correctedEnvironmentInspection = req(
      repositoryRoot,
      "show",
      environment.revisionId,
      "--json",
    );
    expect(correctedEnvironmentInspection.status, correctedEnvironmentInspection.stderr)
      .toBe(0);
    expect(
      JSON.parse(correctedEnvironmentInspection.stdout).lifecycleDatum.datum.links
        .filter((link: { type: string }) => link.type === "corrects-review"),
    ).toEqual([{ type: "corrects-review", target: failedEnvironmentReview }]);

    const prematureCorrectedEnvironmentContext = looseEnds().find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === environment.revisionId
    );
    expect(prematureCorrectedEnvironmentContext).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "execute-verification-run@1",
    }));
    const correctedQualificationObligation = runObligation(
      qualificationImplementation.revisionId,
    )!;
    expect(correctedQualificationObligation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
    }));
    const correctedQualificationAdapter = await adapter(
      runResponse(
        "RUN-0000000009",
        "RES-0000000009",
        "qualification",
        qualificationImplementation.revisionId,
        environment.revisionId,
        environment.revisionId,
        {
          kind: "qualification",
          scope: "environment-capability",
          outcome: "pass",
          formal_evidence_eligible: false,
        },
      ),
      "corrected-qualification-run",
    );
    const correctedQualificationExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(correctedQualificationObligation.actionableResolver),
      "--obligation",
      String(correctedQualificationObligation.id),
      "--adapter",
      correctedQualificationAdapter.executable,
      "--json",
    );
    expect(
      correctedQualificationExecution.status,
      `${correctedQualificationExecution.stderr}${correctedQualificationExecution.stdout}`,
    ).toBe(0);
    qualificationRun = "RUN-0000000009-r00001";
    qualificationResult = "RES-0000000009-r00001";
    const correctedEnvironmentContext = await createDiscoveredReviewContext(
      environment.revisionId,
      "Corrected environment qualification Review Context",
      [strategy.revisionId, environment.revisionId],
      [
        qualificationActivity.revisionId,
        qualificationImplementation.revisionId,
        qualificationRun,
        qualificationResult,
        failedEnvironmentReview,
      ],
    );
    await review(environment.revisionId, correctedEnvironmentContext.revisionId);
    expect(looseEnds().find((item) =>
      item.obligation === "environment-review-correction-required" &&
      item.subject === "ENV-0000000001-r00001"
    )).toBeUndefined();
    const environmentHistory = req(
      repositoryRoot,
      "history",
      environment.id,
      "--json",
    );
    expect(environmentHistory.status, environmentHistory.stderr).toBe(0);
    expect(JSON.parse(environmentHistory.stdout).history.revisions).toEqual([
      expect.objectContaining({ revisionId: "ENV-0000000001-r00001" }),
      expect.objectContaining({ revisionId: environment.revisionId }),
    ]);
    const failedReviewInspection = req(
      repositoryRoot,
      "show",
      failedEnvironmentReview,
      "--json",
    );
    expect(failedReviewInspection.status, failedReviewInspection.stderr).toBe(0);
    expect(JSON.parse(failedReviewInspection.stdout).lifecycleDatum.datum.payload.outcome)
      .toBe("fail");

    const pilotActivityWork = looseEnds().find((item) =>
      item.obligation === "pilot-verification-activity-required" &&
      item.subject === requirement.revisionId
    );
    expect(pilotActivityWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "write-verification-activity@1",
    }));
    const pilotActivityAdapter = await adapter({
      outputs: [{
        name: "activity",
        invocation: 0,
        lifecycleDatum: {
          id: "VER-0000000002",
          type: "VER",
          payload: {
            title: "Pilot report export discrimination",
            rationale: "One positive and one negative activity test the verification design",
            kind: "pilot",
            method: "demonstration",
            assessment_mode: "witnessed",
            claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false },
            acceptance_criteria: ["supported export is observed", "unsupported format is rejected observably"],
            evidence_requirements: ["public invocation", "visible export", "visible rejection"],
            expected_success_activity: "Export the representative visible report",
            expected_discrimination_activity: "Request the intentionally unsupported binary format",
          },
          links: [
            { type: "governed-by", target: strategy.revisionId },
            { type: "verifies", target: requirement.id },
            { type: "verifies-revision", target: requirement.revisionId },
          ],
          body: "Source-independent pilot activity with positive and negative controls.\n",
        },
      }],
      completionEvidence: { summary: "Pilot verification activity authored from exact ready inputs." },
    }, "pilot-activity");
    const pilotActivityExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(pilotActivityWork!.actionableResolver),
      "--obligation",
      String(pilotActivityWork!.id),
      "--adapter",
      pilotActivityAdapter.executable,
      "--input",
      `requirement=${requirement.revisionId}`,
      "--input",
      `strategy=${strategy.revisionId}`,
      "--json",
    );
    expect(
      pilotActivityExecution.status,
      `${pilotActivityExecution.stderr}${pilotActivityExecution.stdout}`,
    ).toBe(0);
    const pilotActivity = JSON.parse(pilotActivityExecution.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };
    const targetWork = looseEnds().find((item) =>
      item.obligation === "pilot-target-required" &&
      item.subject === requirement.revisionId
    );
    expect(targetWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "register-pilot-target@1",
      unresolvedBindings: [],
    }));
    const targetResponse = {
      outputs: [{
        name: "target",
        invocation: 0,
        lifecycleDatum: {
          id: "ART-0000000001",
          type: "ART",
          payload: {
            title: "Controlled export pilot target",
            kind: "prototype",
            repository_ref: `git:${existingRepositoryCommit}`,
            supported_behavior: ["export the representative visible report"],
            unsupported_behavior: ["export an intentionally unsupported binary format"],
            evidence_refs: [`git-object-observed:${existingRepositoryCommit}`],
            public_interface: {
              interface_version: 2,
              repository_locator: `file://${process.cwd()}`,
              command: [
                { literal: "node" },
                { checkout_path: "bin/report.mjs" },
                {
                  parameter: {
                    name: "input",
                    encoding: "exact UTF-8 path to the controlled input fixture",
                  },
                },
                {
                  parameter: {
                    name: "format",
                    encoding: "visible report -> text; excluded binary report -> binary",
                  },
                },
              ],
              working_directory: "fresh-temporary-directory",
              observation_protocol: {
                success: {
                  exit_status: 0,
                  stdout_contract: "one exact visible report followed by a newline",
                  stderr_contract: "empty",
                },
                rejection: {
                  exit_status: 2,
                  stdout_contract: "empty",
                  stderr_contract: "one diagnostic line followed by a newline",
                },
              },
            },
          },
          links: [{ type: "derived-from", target: requirement.revisionId }],
          body: "Exact existing repository evidence registered for bounded pilot execution.\n",
        },
      }],
      completionEvidence: {
        summary: "One exact bounded repository target is registered for the exact requirement Revision.",
      },
    };
    const incompleteBoundaryResponse = structuredClone(targetResponse);
    delete (incompleteBoundaryResponse.outputs[0]!.lifecycleDatum.payload as {
      public_interface?: unknown;
    }).public_interface;
    const incompleteBoundaryAdapter = await adapter(
      incompleteBoundaryResponse,
      "incomplete-boundary-pilot-target",
    );
    const incompleteBoundary = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      incompleteBoundaryAdapter.executable,
      "--json",
    );
    expect(incompleteBoundary.status).toBe(1);
    expect(JSON.parse(incompleteBoundary.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]);

    const unencodedParameterResponse = structuredClone(targetResponse);
    const parameterToken = unencodedParameterResponse.outputs[0]!.lifecycleDatum
      .payload.public_interface.command[2] as {
        parameter: { name: string; encoding?: string };
      };
    delete parameterToken.parameter.encoding;
    const unencodedParameterAdapter = await adapter(
      unencodedParameterResponse,
      "unencoded-parameter-pilot-target",
    );
    const unencodedParameter = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      unencodedParameterAdapter.executable,
      "--json",
    );
    expect(unencodedParameter.status).toBe(1);
    expect(JSON.parse(unencodedParameter.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "scenario-output-schema-invalid" }),
      ]),
    );

    const mutableTargetResponse = structuredClone(targetResponse);
    mutableTargetResponse.outputs[0]!.lifecycleDatum.payload.repository_ref =
      "git:main";
    const mutableTargetAdapter = await adapter(
      mutableTargetResponse,
      "mutable-pilot-target",
    );
    const mutableTarget = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      mutableTargetAdapter.executable,
      "--json",
    );
    expect(mutableTarget.status).toBe(1);
    expect(JSON.parse(mutableTarget.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-output-schema-invalid" }),
    ]);

    const unobservedTargetResponse = structuredClone(targetResponse);
    unobservedTargetResponse.outputs[0]!.lifecycleDatum.payload.evidence_refs = [];
    const unobservedTargetAdapter = await adapter(
      unobservedTargetResponse,
      "unobserved-pilot-target",
    );
    const unobservedTarget = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      unobservedTargetAdapter.executable,
      "--json",
    );
    expect(unobservedTarget.status).toBe(1);
    expect(JSON.parse(unobservedTarget.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]);

    const unboundedTargetResponse = structuredClone(targetResponse);
    unboundedTargetResponse.outputs[0]!.lifecycleDatum.payload.supported_behavior = [];
    const unboundedTargetAdapter = await adapter(
      unboundedTargetResponse,
      "unbounded-pilot-target",
    );
    const unboundedTarget = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      unboundedTargetAdapter.executable,
      "--json",
    );
    expect(unboundedTarget.status).toBe(1);
    expect(JSON.parse(unboundedTarget.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]);

    const mismatchedTargetResponse = structuredClone(targetResponse);
    mismatchedTargetResponse.outputs[0]!.lifecycleDatum.links = [
      { type: "derived-from", target: product.revisionId },
    ];
    const mismatchedTargetAdapter = await adapter(
      mismatchedTargetResponse,
      "mismatched-pilot-target",
    );
    const mismatchedTarget = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      mismatchedTargetAdapter.executable,
      "--json",
    );
    expect(mismatchedTarget.status).toBe(1);
    expect(JSON.parse(mismatchedTarget.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "scenario-output-required-link-missing",
        path: "outputs.target.links.derived-from",
      }),
    ]);
    expect(req(
      repositoryRoot,
      "show",
      "ART-0000000001-r00001",
      "--json",
    ).status).toBe(1);

    const targetAdapter = await adapter(targetResponse, "pilot-target");
    const targetExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(targetWork!.actionableResolver),
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      targetAdapter.executable,
      "--json",
    );
    expect(targetExecution.status, `${targetExecution.stderr}${targetExecution.stdout}`)
      .toBe(0);
    const pilotTarget = JSON.parse(targetExecution.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };
    expect(looseEnds().find((item) =>
      item.obligation === "pilot-target-required" &&
      item.subject === requirement.revisionId
    )).toBeUndefined();
    const duplicateTargetResponse = structuredClone(targetResponse);
    duplicateTargetResponse.outputs[0]!.lifecycleDatum.id = "ART-0000000002";
    const duplicateTargetAdapter = await adapter(
      duplicateTargetResponse,
      "duplicate-pilot-target",
    );
    const duplicateTarget = req(
      repositoryRoot,
      "scenario",
      "execute",
      "register-pilot-target@1",
      "--obligation",
      String(targetWork!.id),
      "--adapter",
      duplicateTargetAdapter.executable,
      "--json",
    );
    expect(duplicateTarget.status).toBe(1);
    expect(JSON.parse(duplicateTarget.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "obligation-not-dispatchable",
        message: expect.stringContaining("status 'satisfied'"),
      }),
    ]);
    expect(req(
      repositoryRoot,
      "show",
      "ART-0000000002-r00001",
      "--json",
    ).status).toBe(1);
    const blockedPilotImplementationWork = looseEnds().find((item) =>
      item.obligation === "pilot-verification-implementation-required" &&
      item.subject === pilotActivity.revisionId
    );
    expect(blockedPilotImplementationWork).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      blockedBy: expect.arrayContaining([
        expect.stringContaining(pilotActivity.revisionId),
      ]),
    }));
    const pilotActivityContext = await createDiscoveredReviewContext(
      pilotActivity.revisionId,
      "Pilot activity review context",
      [pilotActivity.revisionId],
      [requirement.revisionId, strategy.revisionId, pilotTarget.revisionId],
    );
    await review(pilotActivity.revisionId, pilotActivityContext.revisionId);
    const pilotImplementationWork = looseEnds().find((item) =>
      item.obligation === "pilot-verification-implementation-required" &&
      item.subject === pilotActivity.revisionId
    );
    expect(pilotImplementationWork).toEqual(expect.objectContaining({
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
    const pilotImplementationDryRun = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      String(pilotImplementationWork!.actionableResolver),
      "--obligation",
      String(pilotImplementationWork!.id),
      "--json",
    );
    expect(
      pilotImplementationDryRun.status,
      `${pilotImplementationDryRun.stderr}${pilotImplementationDryRun.stdout}`,
    ).toBe(0);
    const publicImplementationInputs = JSON.parse(
      pilotImplementationDryRun.stdout,
    ).scenarioDryRun.invocations[0].inputs;
    expect(publicImplementationInputs.find(
      (input: { name: string }) => input.name === "execution_target",
    )).toEqual(expect.objectContaining({
      values: [expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            public_interface: targetResponse.outputs[0]!.lifecycleDatum.payload.public_interface,
          }),
        }),
      })],
    }));

    const pilotImplementationAdapter = await adapter({
      outputs: [
        {
          name: "implementation",
          invocation: 0,
          lifecycleDatum: {
            id: "VAI-0000000002",
            type: "VAI",
            payload: {
              title: "Source-independent pilot demonstration",
              rationale: "The implementation exercises only the controlled public target boundary",
              kind: "pilot",
              implementation_ref: "git:fedcba9876543210fedcba9876543210fedcba98",
              independence_mode: "source-blind",
              authoring_input_refs: [
                requirement.revisionId,
                strategy.revisionId,
                pilotActivity.revisionId,
                environment.revisionId,
                pilotTarget.revisionId,
              ],
              prohibited_inputs_observed: prohibitedInputs,
              activity_bindings: ["supported-success", "unsupported-discrimination"],
              target_behavior: {
                supported: ["export the representative visible report"],
                intentionally_unsupported: ["export an intentionally unsupported binary format"],
              },
            },
            links: [
              { type: "realizes", target: pilotActivity.revisionId },
              { type: "uses", target: environment.revisionId },
              { type: "targets", target: pilotTarget.revisionId },
            ],
            body: "Independently authorized source-blind pilot implementation.\n",
          },
        },
        {
          name: "authorization",
          invocation: 0,
          lifecycleDatum: {
            id: "DEC-0000000001",
            type: "DEC",
            payload: {
              title: "Authorize exact pilot implementation",
              rationale: "Independent implementation is authorized only for the bounded activity, environment, and target.",
              kind: "decision",
              decision: "Authorize independent implementation of the exact pilot activity.",
              alternatives: ["Do not implement the pilot activity"],
              effective_scope: "VAI-0000000002-r00001",
            },
            links: [{ type: "justifies", target: "VAI-0000000002-r00001" }],
            body: "Exact authorization for independent pilot implementation.\n",
          },
        },
      ],
      completionEvidence: { summary: "The exact pilot implementation was separately authorized and recorded." },
    }, "pilot-implementation");
    const pilotImplementationExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(pilotImplementationWork!.actionableResolver),
      "--obligation",
      String(pilotImplementationWork!.id),
      "--authorize",
      "independent-verification-implementer",
      "--adapter",
      pilotImplementationAdapter.executable,
      "--input",
      `activity=${pilotActivity.revisionId}`,
      "--input",
      `environment=${environment.revisionId}`,
      "--input",
      `execution_target=${pilotTarget.revisionId}`,
      "--json",
    );
    expect(
      pilotImplementationExecution.status,
      `${pilotImplementationExecution.stderr}${pilotImplementationExecution.stdout}`,
    ).toBe(0);
    const pilotImplementationResult = JSON.parse(pilotImplementationExecution.stdout).execution;
    expect(pilotImplementationResult.authority).toEqual(expect.objectContaining({
      supplied: ["independent-verification-implementer"],
    }));
    const pilotImplementation = pilotImplementationResult.outputs.find(
      (item: { name: string }) => item.name === "implementation",
    ).lifecycleDatum as { id: string; revisionId: string };
    const pilotAuthorization = pilotImplementationResult.outputs.find(
      (item: { name: string }) => item.name === "authorization",
    ).lifecycleDatum as { revisionId: string };
    const pilotAuthorizationShown = req(
      repositoryRoot,
      "show",
      pilotAuthorization.revisionId,
      "--json",
    );
    expect(pilotAuthorizationShown.status, pilotAuthorizationShown.stderr).toBe(0);
    expect(JSON.parse(pilotAuthorizationShown.stdout).lifecycleDatum.datum).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          effective_scope: pilotImplementation.revisionId,
        }),
        links: [{ type: "justifies", target: pilotImplementation.revisionId }],
      }),
    );

    expect(runObligation(pilotImplementation.revisionId)).toEqual(
      expect.objectContaining({
        status: "awaiting-review",
        dispatchable: false,
        blockedBy: [expect.stringContaining(pilotImplementation.revisionId)],
      }),
    );
    const pilotContext = await createDiscoveredReviewContext(
      pilotImplementation.revisionId,
      "Pilot implementation review context",
      [pilotImplementation.revisionId],
      [pilotActivity.revisionId, strategy.revisionId, environment.revisionId, pilotTarget.revisionId],
    );
    await review(pilotImplementation.revisionId, pilotContext.revisionId);

    const pilotObligation = runObligation(pilotImplementation.revisionId)!;
    expect(pilotObligation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
    }));
    const prohibitedAdapter = await adapter(
      { outputs: [], completionEvidence: {} },
      "prohibited-pilot",
    );
    const prohibited = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(pilotObligation.actionableResolver),
      "--obligation",
      String(pilotObligation.id),
      "--adapter",
      prohibitedAdapter.executable,
      "--input",
      "product source code=src/private.ts",
      "--json",
    );
    expect(prohibited.status).toBe(1);
    expect(JSON.parse(prohibited.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "prohibited-scenario-input",
        path: "product source code",
      }),
    ]);
    await expect(fs.stat(prohibitedAdapter.capture)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const wrongTargetRoot = `${repositoryRoot}-wrong-target`;
    await fs.cp(repositoryRoot, wrongTargetRoot, { recursive: true });
    const alternateTargetCreated = req(
      wrongTargetRoot,
      "new",
      "ART",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Unrelated controlled artifact",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:1111111111111111111111111111111111111111",
      "--set",
      'supported_behavior=["unrelated supported behavior"]',
      "--set",
      'unsupported_behavior=["unrelated negative control"]',
      "--set",
      `public_interface=${JSON.stringify(targetResponse.outputs[0]!.lifecycleDatum.payload.public_interface)}`,
      "--json",
    );
    expect(
      alternateTargetCreated.status,
      `${alternateTargetCreated.stderr}${alternateTargetCreated.stdout}`,
    ).toBe(0);
    const alternateTarget = JSON.parse(alternateTargetCreated.stdout).created as {
      revisionId: string;
    };
    const wrongTargetAdapter = await adapter(
      runResponse(
        "RUN-0000000004",
        "RES-0000000004",
        "pilot",
        pilotImplementation.revisionId,
        environment.revisionId,
        alternateTarget.revisionId,
        {
          kind: "pilot",
          scope: "verification-design",
          outcome: "suitable",
          formal_evidence_eligible: false,
        },
      ),
      "wrong-exact-target",
    );
    const wrongTargetExecution = req(
      wrongTargetRoot,
      "scenario",
      "execute",
      String(pilotObligation.actionableResolver),
      "--obligation",
      String(pilotObligation.id),
      "--adapter",
      wrongTargetAdapter.executable,
      "--input",
      `implementation=${pilotImplementation.revisionId}`,
      "--input",
      `activity=${pilotActivity.revisionId}`,
      "--input",
      `environment=${environment.revisionId}`,
      "--input",
      `execution_target=${alternateTarget.revisionId}`,
      "--json",
    );
    expect(wrongTargetExecution.status).toBe(1);
    expect(JSON.parse(wrongTargetExecution.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "scenario-input-binding-mismatch",
        path: "execution_target",
      }),
    ]);
    await expect(fs.stat(wrongTargetAdapter.capture)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await fs.rm(wrongTargetRoot, { recursive: true, force: true });

    const formalClaimAdapter = await adapter(
      runResponse(
        "RUN-0000000002",
        "RES-0000000002",
        "pilot",
        pilotImplementation.revisionId,
        environment.revisionId,
        pilotTarget.revisionId,
        {
          kind: "formal",
          scope: "requirement",
          outcome: "pass",
          formal_evidence_eligible: true,
        },
      ),
      "invalid-formal-promotion",
    );
    const formalClaim = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(pilotObligation.actionableResolver),
      "--obligation",
      String(pilotObligation.id),
      "--adapter",
      formalClaimAdapter.executable,
      "--input",
      `implementation=${pilotImplementation.revisionId}`,
      "--input",
      `activity=${pilotActivity.revisionId}`,
      "--input",
      `environment=${environment.revisionId}`,
      "--input",
      `execution_target=${pilotTarget.revisionId}`,
      "--json",
    );
    expect(formalClaim.status).toBe(1);
    expect(JSON.parse(formalClaim.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]);
    const absentFormal = req(
      repositoryRoot,
      "show",
      "RES-0000000002-r00001",
      "--json",
    );
    expect(absentFormal.status).toBe(1);

    const pilotAdapter = await adapter(
      runResponse(
        "RUN-0000000003",
        "RES-0000000003",
        "pilot",
        pilotImplementation.revisionId,
        environment.revisionId,
        pilotTarget.revisionId,
        {
          kind: "pilot",
          scope: "verification-design",
          outcome: "suitable",
          formal_evidence_eligible: false,
        },
      ),
      "pilot-run",
    );
    const pilotExecution = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(pilotObligation.actionableResolver),
      "--obligation",
      String(pilotObligation.id),
      "--adapter",
      pilotAdapter.executable,
      "--input",
      `implementation=${pilotImplementation.revisionId}`,
      "--input",
      `activity=${pilotActivity.revisionId}`,
      "--input",
      `environment=${environment.revisionId}`,
      "--input",
      `execution_target=${pilotTarget.revisionId}`,
      "--json",
    );
    expect(pilotExecution.status, `${pilotExecution.stderr}${pilotExecution.stdout}`).toBe(0);
    const pilotRun = "RUN-0000000003-r00001";
    const pilotResult = "RES-0000000003-r00001";

    const qualificationActivityShown = req(
      repositoryRoot,
      "show",
      qualificationActivity.revisionId,
      "--json",
    );
    expect(qualificationActivityShown.status).toBe(0);
    expect(
      JSON.parse(qualificationActivityShown.stdout).lifecycleDatum.datum.links,
    ).toEqual([
      { type: "governed-by", target: strategy.revisionId },
      { type: "qualifies", target: environment.revisionId },
    ]);
    const qualificationResultShown = req(
      repositoryRoot,
      "show",
      qualificationResult,
      "--json",
    );
    expect(qualificationResultShown.status).toBe(0);
    expect(JSON.parse(qualificationResultShown.stdout).lifecycleDatum).toEqual(
      expect.objectContaining({
        datum: expect.objectContaining({
          payload: expect.objectContaining({
            claim: {
              kind: "qualification",
              scope: "environment-capability",
              outcome: "pass",
              formal_evidence_eligible: false,
            },
          }),
          links: [{ type: "assessed-in", target: environment.revisionId }],
        }),
        storage: { editable: false, frozen: true },
      }),
    );
    const pilotImplementationShown = req(
      repositoryRoot,
      "show",
      pilotImplementation.revisionId,
      "--json",
    );
    expect(pilotImplementationShown.status, pilotImplementationShown.stderr).toBe(0);
    expect(
      JSON.parse(pilotImplementationShown.stdout).lifecycleDatum.datum.payload.target_behavior,
    ).toEqual({
      supported: ["export the representative visible report"],
      intentionally_unsupported: ["export an intentionally unsupported binary format"],
    });
    const pilotResultShown = req(repositoryRoot, "show", pilotResult, "--json");
    expect(pilotResultShown.status).toBe(0);
    expect(JSON.parse(pilotResultShown.stdout).lifecycleDatum).toEqual(
      expect.objectContaining({
        datum: expect.objectContaining({
          payload: expect.objectContaining({
            claim: {
              kind: "pilot",
              scope: "verification-design",
              outcome: "suitable",
              formal_evidence_eligible: false,
            },
            observations: expect.objectContaining({
              expected_success_observed: true,
              expected_discrimination_observed: true,
            }),
          }),
        }),
        storage: { editable: false, frozen: true },
      }),
    );
    const pilotRunShown = req(repositoryRoot, "show", pilotRun, "--json");
    expect(pilotRunShown.status).toBe(0);
    expect(JSON.parse(pilotRunShown.stdout).lifecycleDatum).toEqual(
      expect.objectContaining({
        datum: expect.objectContaining({
          links: expect.arrayContaining([
            { type: "executes", target: pilotImplementation.revisionId },
            { type: "uses", target: environment.revisionId },
            { type: "targets", target: pilotTarget.revisionId },
            { type: "produces", target: pilotResult },
          ]),
        }),
        storage: { editable: false, frozen: true },
      }),
    );
    expect(runObligation(pilotImplementation.revisionId)).toBeUndefined();

    const attemptedPromotion = req(
      repositoryRoot,
      "link",
      pilotResult,
      requirement.id,
      "--type",
      "verifies",
      "--json",
    );
    expect(attemptedPromotion.status).toBe(1);
    expect(JSON.parse(attemptedPromotion.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "frozen-revision-immutable" }),
    ]);
    const unchangedPilotResult = req(repositoryRoot, "show", pilotResult, "--json");
    expect(
      JSON.parse(unchangedPilotResult.stdout).lifecycleDatum.datum.links,
    ).toEqual([{ type: "assessed-in", target: environment.revisionId }]);
    const revisedGeneratedResult = req(
      repositoryRoot,
      "revise",
      "RES-0000000003",
      "--json",
    );
    expect(revisedGeneratedResult.status).toBe(1);
    expect(JSON.parse(revisedGeneratedResult.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "generated-datum-requires-scenario-execution",
      }),
    ]);
    const absentGeneratedRevision = req(
      repositoryRoot,
      "show",
      "RES-0000000003-r00002",
      "--json",
    );
    expect(absentGeneratedRevision.status).toBe(1);

    const phase = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-1-product-assurance",
      "--json",
    );
    expect(phase.status, phase.stderr).toBe(0);
    expect(JSON.parse(phase.stdout).phaseStatus.entry).toEqual(
      expect.objectContaining({ satisfied: true }),
    );

    const revisedRequirementRoot = `${repositoryRoot}-revised-requirement`;
    await fs.cp(repositoryRoot, revisedRequirementRoot, { recursive: true });
    const revisionBoundary = req(
      revisedRequirementRoot,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      "title=Requirement revision boundary",
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${requirement.revisionId}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(revisionBoundary.status, `${revisionBoundary.stderr}${revisionBoundary.stdout}`).toBe(0);
    const revisionBoundaryId = JSON.parse(revisionBoundary.stdout).created.id as string;
    expect(req(revisedRequirementRoot, "baseline", "add", revisionBoundaryId, requirement.revisionId, "--json").status).toBe(0);
    expect(req(revisedRequirementRoot, "baseline", "freeze", revisionBoundaryId, "--json").status).toBe(0);
    const revisedRequirement = req(
      revisedRequirementRoot,
      "revise",
      requirement.id,
      "--from",
      requirement.revisionId,
      "--json",
    );
    expect(revisedRequirement.status, `${revisedRequirement.stderr}${revisedRequirement.stdout}`).toBe(0);
    const revisedRequirementWork = req(
      revisedRequirementRoot,
      "loose-ends",
      "--phase",
      "phase-1-product-assurance",
      "--json",
    );
    expect(JSON.parse(revisedRequirementWork.stdout).looseEnds.items).toContainEqual(
      expect.objectContaining({
        obligation: "verification-strategy-required",
        status: "ready",
        dispatchable: true,
      }),
    );
    await fs.rm(revisedRequirementRoot, { recursive: true, force: true });

    const orphanRepositoryRoot = `${repositoryRoot}-orphan-activity`;
    await fs.cp(repositoryRoot, orphanRepositoryRoot, { recursive: true });
    const orphanActivity = req(
      orphanRepositoryRoot,
      "new",
      "VER",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Ambiguous orphan qualification activity",
      "--set",
      "rationale=This fixture proves unattached qualification evidence cannot reuse the prior exact context",
      "--set",
      "kind=qualification",
      "--set",
      "method=test",
      "--set",
      "assessment_mode=automatic",
      "--set",
      'claim={"kind":"qualification","scope":"environment-capability","formal_evidence_eligible":false}',
      "--set",
      'acceptance_criteria=["orphan activity is detected"]',
      "--set",
      'evidence_requirements=["exact implementation link"]',
      "--set",
      "expected_success_activity=Observe the declared environment capability",
      "--set",
      "expected_discrimination_activity=Reject an unattached qualification activity",
      "--link",
      `governed-by=${strategy.revisionId}`,
      "--link",
      `qualifies=${environment.revisionId}`,
      "--json",
    );
    expect(orphanActivity.status, `${orphanActivity.stderr}${orphanActivity.stdout}`).toBe(0);
    const orphanLooseEnds = req(
      orphanRepositoryRoot,
      "loose-ends",
      "--phase",
      "phase-1-product-assurance",
      "--json",
    );
    expect(orphanLooseEnds.status, `${orphanLooseEnds.stderr}${orphanLooseEnds.stdout}`).toBe(0);
    expect(JSON.parse(orphanLooseEnds.stdout).looseEnds.items.find((item: any) =>
      item.obligation === "review-context-required" &&
      item.subject === environment.revisionId
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
    }));
    await fs.rm(orphanRepositoryRoot, { recursive: true, force: true });

    const duplicateImplementationRoot = `${repositoryRoot}-duplicate-implementation`;
    await fs.cp(repositoryRoot, duplicateImplementationRoot, { recursive: true });
    const duplicateImplementation = req(
      duplicateImplementationRoot,
      "new",
      "VAI",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Ambiguous second qualification implementation",
      "--set",
      "rationale=This fixture proves an incomplete second chain cannot reuse the prior exact context",
      "--set",
      "kind=qualification",
      "--set",
      `implementation_ref=procedure:sha256:${"e".repeat(64)}`,
      "--set",
      "independence_mode=environment-capability",
      "--set",
      `authoring_input_refs=${JSON.stringify([strategy.revisionId, environment.revisionId, qualificationActivity.revisionId])}`,
      "--set",
      `prohibited_inputs_observed=${JSON.stringify(prohibitedInputs)}`,
      "--set",
      'activity_bindings=["ambiguous-qualification"]',
      "--set",
      'target_behavior={"supported":["declared environment capability"],"intentionally_unsupported":["unqualified behavior"]}',
      "--link",
      `realizes=${qualificationActivity.revisionId}`,
      "--link",
      `uses=${environment.revisionId}`,
      "--link",
      `targets=${environment.revisionId}`,
      "--json",
    );
    expect(
      duplicateImplementation.status,
      `${duplicateImplementation.stderr}${duplicateImplementation.stdout}`,
    ).toBe(0);
    const duplicateLooseEnds = req(
      duplicateImplementationRoot,
      "loose-ends",
      "--phase",
      "phase-1-product-assurance",
      "--json",
    );
    expect(duplicateLooseEnds.status, `${duplicateLooseEnds.stderr}${duplicateLooseEnds.stdout}`).toBe(0);
    expect(JSON.parse(duplicateLooseEnds.stdout).looseEnds.items.find((item: any) =>
      item.obligation === "review-context-required" &&
      item.subject === environment.revisionId
    )).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
    }));
    await fs.rm(duplicateImplementationRoot, { recursive: true, force: true });

    const progressionStatus = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-1-product-assurance",
      "--json",
    );
    expect(progressionStatus.status, progressionStatus.stderr).toBe(0);
    expect(JSON.parse(progressionStatus.stdout).phaseStatus.progression).toEqual(
      expect.objectContaining({
        nextPhase: "phase-2-system-definition",
        ready: true,
        authorized: true,
        complete: true,
      }),
    );
    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
  }, 180_000);

  it("supplies package-owned verification planning and execution contracts", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toEqual(expect.arrayContaining([
      "ENV@1",
      "RES@1",
      "RUN@1",
      "VAI@1",
      "VER@1",
      "VSP@1",
    ]));
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "define-verification-strategy@1",
      "execute-verification-run@1",
      "implement-verification-activity@1",
      "realize-verification-environment@1",
      "write-verification-activity@1",
    ]));
    expect(catalogs.obligations).toContain("verification-run-required@1");
    expect(catalogs.phases).toContain("phase-1-product-assurance@2");
  });
});
