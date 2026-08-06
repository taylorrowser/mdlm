import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

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
    const review = async (subject: string, context: string) => {
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
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: subject },
              { type: "contextualizes", target: context },
            ],
            body: "The exact subject passes independent contextual review.\n",
          },
        }],
        completionEvidence: { summary: "Independent assurance review passed." },
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
    const environment = output("environment");
    const qualificationActivity = output("qualification_activity");
    const qualificationImplementation = output("qualification_implementation");

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
    const qualificationRun = "RUN-0000000001-r00001";
    const qualificationResult = "RES-0000000001-r00001";

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
    await review(environment.revisionId, environmentContext.revisionId);

    const pilotTarget = create(
      "ART",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Controlled export pilot target",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:0123456789abcdef0123456789abcdef01234567",
      "--set",
      'supported_behavior=["export the representative visible report"]',
      "--set",
      'unsupported_behavior=["export an intentionally unsupported binary format"]',
      "--link",
      `derived-from=${requirement.revisionId}`,
    );
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

    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
  }, 60_000);

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
    expect(catalogs.phases).toContain("phase-1-product-assurance@1");
  });
});
