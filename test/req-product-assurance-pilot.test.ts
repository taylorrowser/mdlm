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
    const baseline = (title: string) => {
      const result = req(
        repositoryRoot,
        "baseline",
        "create",
        "--type",
        "BSL",
        "--scenario",
        "create-review-context@1",
        "--set",
        `title=${title}`,
        "--set",
        "kind=review-context",
        "--set",
        "role=review-context",
        "--set",
        `scope=${title}`,
        "--set",
        "group=DEFAULT",
        "--json",
      );
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as {
        id: string;
        revisionId: string;
      };
    };
    const freezeContext = (
      title: string,
      members: string[],
      evidence: string[] = [],
    ) => {
      const context = baseline(title);
      for (const member of members) {
        const added = req(
          repositoryRoot,
          "baseline",
          "add",
          context.id,
          member,
          "--json",
        );
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      for (const item of evidence) {
        const added = req(
          repositoryRoot,
          "baseline",
          "evidence",
          "add",
          context.id,
          item,
          "--json",
        );
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      const frozen = req(
        repositoryRoot,
        "baseline",
        "freeze",
        context.id,
        "--json",
      );
      expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
      return context;
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
        "review-datum-in-context@2",
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
            links: [],
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
    const prohibitedInputs = [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ];
    const strategy = create(
      "VSP",
      "--scenario",
      "define-verification-strategy@1",
      "--set",
      "title=Stakeholder export verification strategy",
      "--set",
      "rationale=The stakeholder commitment needs a controlled public-boundary demonstration",
      "--set",
      "level=stakeholder",
      "--set",
      'permitted_methods=["demonstration"]',
      "--set",
      `independence=${JSON.stringify({
        boundary: "black-box",
        prohibited_inputs: prohibitedInputs,
      })}`,
      "--set",
      "evidence_policy=Retain exact public inputs and visible outputs",
      "--set",
      "assessment_policy=Pilot suitability requires positive and negative controls",
      "--set",
      `environment_profiles=${JSON.stringify([{
        id: "browser-e2e",
        purpose: "Exercise the externally observable export boundary",
        controllability: ["create an isolated report fixture"],
        observability: ["capture the downloaded public artifact"],
        external_services: [],
        timing: "deterministic completion timeout",
      }])}`,
      "--link",
      `governs=${requirement.id}`,
    );
    const environment = create(
      "ENV",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Isolated browser export environment",
      "--set",
      "rationale=The exact strategy requires controlled fixtures and visible artifact capture",
      "--set",
      `profile_refs=${JSON.stringify([`${strategy.revisionId}#browser-e2e`])}`,
      "--set",
      `capabilities=${JSON.stringify({
        controllability: ["create an isolated report fixture"],
        observability: ["capture the downloaded public artifact"],
        external_services: [],
        timing: "deterministic completion timeout",
      })}`,
      "--set",
      `reproducibility=${JSON.stringify({
        environment_ref: "container:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        configuration_digest: `sha256:${"c".repeat(64)}`,
        reconstruction: "Restore the exact container and isolated fixture configuration.",
      })}`,
      "--link",
      `realizes=${strategy.revisionId}`,
    );
    const qualificationActivity = create(
      "VER",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Qualify browser export capabilities",
      "--set",
      "rationale=The environment must demonstrate controllability and observability",
      "--set",
      "kind=qualification",
      "--set",
      "method=test",
      "--set",
      "assessment_mode=automatic",
      "--set",
      'claim={"kind":"qualification","scope":"environment-capability","formal_evidence_eligible":false}',
      "--set",
      'acceptance_criteria=["isolated fixture is controllable","visible artifact is observable"]',
      "--set",
      'evidence_requirements=["fixture log","artifact capture"]',
      "--set",
      "expected_success_activity=Create and observe an isolated report export",
      "--set",
      "expected_discrimination_activity=Detect an absent visible artifact",
      "--link",
      `governed-by=${strategy.revisionId}`,
      "--link",
      `qualifies=${environment.revisionId}`,
    );
    const qualificationImplementation = create(
      "VAI",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Environment capability qualification procedure",
      "--set",
      "rationale=The procedure exercises only declared environment capabilities",
      "--set",
      "kind=qualification",
      "--set",
      "implementation_ref=procedure:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "--set",
      "independence_mode=environment-capability",
      "--set",
      `authoring_input_refs=${JSON.stringify([
        strategy.revisionId,
        environment.revisionId,
        qualificationActivity.revisionId,
      ])}`,
      "--set",
      `prohibited_inputs_observed=${JSON.stringify(prohibitedInputs)}`,
      "--set",
      'activity_bindings=["supported-success","unsupported-discrimination"]',
      "--set",
      `target_behavior=${JSON.stringify({
        supported: ["isolated fixture and visible artifact capture"],
        intentionally_unsupported: ["ambient production credentials"],
      })}`,
      "--link",
      `realizes=${qualificationActivity.revisionId}`,
      "--link",
      `uses=${environment.revisionId}`,
      "--link",
      `targets=${environment.revisionId}`,
    );

    const qualificationObligation = runObligation(
      qualificationImplementation.revisionId,
    )!;
    expect(qualificationObligation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-verification-run@1",
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
      "execute-verification-run@1",
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

    const qualifiedLink = req(
      repositoryRoot,
      "link",
      environment.revisionId,
      qualificationResult,
      "--type",
      "qualified-by",
      "--json",
    );
    expect(qualifiedLink.status, qualifiedLink.stderr).toBe(0);
    expect(runObligation(qualificationImplementation.revisionId)).toBeUndefined();

    const environmentContext = freezeContext(
      "Environment qualification review context",
      [strategy.revisionId, environment.revisionId],
      [
        qualificationActivity.revisionId,
        qualificationImplementation.revisionId,
        qualificationRun,
        qualificationResult,
      ],
    );
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
    );
    const pilotActivity = create(
      "VER",
      "--scenario",
      "write-verification-activity@1",
      "--set",
      "title=Pilot report export discrimination",
      "--set",
      "rationale=One positive and one negative activity test the verification design",
      "--set",
      "kind=pilot",
      "--set",
      "method=demonstration",
      "--set",
      "assessment_mode=witnessed",
      "--set",
      'claim={"kind":"pilot","scope":"verification-design","formal_evidence_eligible":false}',
      "--set",
      'acceptance_criteria=["supported export is observed","unsupported format is rejected observably"]',
      "--set",
      'evidence_requirements=["public invocation","visible export","visible rejection"]',
      "--set",
      "expected_success_activity=Export the representative visible report",
      "--set",
      "expected_discrimination_activity=Request the intentionally unsupported binary format",
      "--link",
      `governed-by=${strategy.revisionId}`,
      "--link",
      `verifies=${requirement.id}`,
    );
    const pilotImplementation = create(
      "VAI",
      "--scenario",
      "implement-verification-activity@1",
      "--set",
      "title=Source-independent pilot demonstration",
      "--set",
      "rationale=The implementation exercises only the controlled public target boundary",
      "--set",
      "kind=pilot",
      "--set",
      "implementation_ref=git:fedcba9876543210fedcba9876543210fedcba98",
      "--set",
      "independence_mode=source-blind",
      "--set",
      `authoring_input_refs=${JSON.stringify([
        requirement.revisionId,
        strategy.revisionId,
        pilotActivity.revisionId,
        environment.revisionId,
        pilotTarget.revisionId,
      ])}`,
      "--set",
      `prohibited_inputs_observed=${JSON.stringify(prohibitedInputs)}`,
      "--set",
      'activity_bindings=["supported-success","unsupported-discrimination"]',
      "--set",
      `target_behavior=${JSON.stringify({
        supported: ["export the representative visible report"],
        intentionally_unsupported: ["export an intentionally unsupported binary format"],
      })}`,
      "--link",
      `realizes=${pilotActivity.revisionId}`,
      "--link",
      `uses=${environment.revisionId}`,
      "--link",
      `targets=${pilotTarget.revisionId}`,
    );

    expect(runObligation(pilotImplementation.revisionId)).toEqual(
      expect.objectContaining({
        status: "awaiting-review",
        dispatchable: false,
        blockedBy: expect.arrayContaining([
          expect.stringContaining(pilotActivity.revisionId),
          expect.stringContaining(pilotImplementation.revisionId),
        ]),
      }),
    );
    const pilotContext = freezeContext(
      "Pilot activity and implementation review context",
      [pilotActivity.revisionId, pilotImplementation.revisionId],
      [strategy.revisionId, environment.revisionId, pilotTarget.revisionId],
    );
    await review(pilotActivity.revisionId, pilotContext.revisionId);
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
      "execute-verification-run@1",
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
      "execute-verification-run@1",
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
      "execute-verification-run@1",
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
          links: [],
        }),
        storage: { editable: false, frozen: true },
      }),
    );
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
    ).toEqual([]);
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
