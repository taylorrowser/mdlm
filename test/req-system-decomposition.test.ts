import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

describe("req system decomposition slice", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-system-decomposition-"));
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

  it("supplies decomposition, architecture, and interface definitions and contracts", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toEqual(expect.arrayContaining([
      "ASP@1",
      "DWP@1",
      "ICSP@1",
      "SYS@2",
    ]));
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "complete-decomposition-work-package@2",
      "define-decomposition-work-package@2",
      "define-interface-control-specification@2",
      "define-system-architecture@2",
      "execute-decomposition-work-package@2",
      "simplify-architecture-and-interfaces@2",
      "simplify-requirement-set@2",
    ]));
    expect(catalogs.obligations).toEqual(expect.arrayContaining([
      "decomposition-completion-required@1",
      "decomposition-output-reviews-required@1",
      "decomposition-parent-coverage-required@1",
      "decomposition-simplification-required@1",
    ]));
  });

  it("moves one bounded decomposition through exact coverage, simplification, completion, and a reviewed SYS gate", async () => {
    let adapterSequence = 0;
    const create = (...arguments_: string[]) => {
      const result = req(repositoryRoot, "new", ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as { id: string; revisionId: string };
    };
    const baseline = (title: string, kind: string, role: string) => {
      const result = req(
        repositoryRoot,
        "baseline",
        "create",
        "--type",
        "BSL",
        "--scenario",
        kind === "review-context"
          ? "create-review-context@1"
          : "create-candidate-baseline@1",
        "--set",
        `title=${title}`,
        "--set",
        `kind=${kind}`,
        "--set",
        `role=${role}`,
        "--set",
        `scope=${title}`,
        "--set",
        "group=DEFAULT",
        "--json",
      );
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as { id: string; revisionId: string };
    };
    const freeze = (
      subject: { id: string; revisionId: string },
      members: string[],
      evidence: string[] = [],
    ) => {
      for (const member of members) {
        const added = req(repositoryRoot, "baseline", "add", subject.id, member, "--json");
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      for (const item of evidence) {
        const added = req(repositoryRoot, "baseline", "evidence", "add", subject.id, item, "--json");
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      const frozen = req(repositoryRoot, "baseline", "freeze", subject.id, "--json");
      expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
      return subject;
    };
    const fixtureReview = (subject: string, context: string, title = `Review ${subject}`) =>
      create(
        "REV",
        "--scenario",
        "review-datum-in-context@2",
        "--set",
        `title=${title}`,
        "--set",
        "review_kind=contextual",
        "--set",
        "rubric_ref=policies/rubrics/bootstrap-review.md@1",
        "--set",
        "findings=[]",
        "--set",
        "outcome=pass",
        "--link",
        `reviews=${subject}`,
        "--link",
        `contextualizes=${context}`,
      );
    const phaseItems = () => {
      const result = req(
        repositoryRoot,
        "loose-ends",
        "--phase",
        "phase-2-system-definition",
        "--json",
      );
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items as Array<Record<string, any>>;
    };
    const obligation = (name: string, subject: string) => {
      const item = phaseItems().find((candidate) =>
        candidate.obligation === name && candidate.subject === subject
      );
      expect(item).toBeDefined();
      return item as Record<string, any>;
    };
    const adapter = async (response: unknown, label: string) => {
      adapterSequence += 1;
      const executable = path.join(
        repositoryRoot,
        `${String(adapterSequence).padStart(2, "0")}-${label}.mjs`,
      );
      await fs.writeFile(
        executable,
        `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
        { mode: 0o755 },
      );
      return executable;
    };
    const execute = async (
      work: Record<string, any>,
      response: unknown,
      inputs: string[],
      label: string,
      authority?: string,
    ) => {
      const executable = await adapter(response, label);
      const scenario = String(work.actionableResolver);
      expect(scenario).toMatch(/@[1-9][0-9]*$/);
      const arguments_ = [
        "scenario",
        "execute",
        scenario,
        "--obligation",
        String(work.id),
        ...(authority ? ["--authorize", authority] : []),
        "--adapter",
        executable,
      ];
      for (const input of inputs) arguments_.push("--input", input);
      const result = req(repositoryRoot, ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).execution as Record<string, any>;
    };
    const createDiscoveredReviewContext = async (
      title: string,
      members: string[],
      evidence: string[] = [],
    ) => {
      const work = obligation("review-context-required", members[0]!);
      expect(work.actionableResolver).toBe("create-review-context@1");
      const execution = await execute(
        work,
        {
          outputs: [{
            name: "context",
            invocation: 0,
            lifecycleDatum: {
              type: "BSL",
              payload: {
                title,
                kind: "review-context",
                role: "review-context",
                scope: members[0],
                group: "DEFAULT",
                definition_members: members,
                evidence,
              },
              links: [],
              body: `Exact Review Context for ${members[0]}.\n`,
            },
          }],
          completionEvidence: { summary: `Exact Review Context frozen for ${members[0]}.` },
        },
        [],
        "review-context",
      );
      return execution.outputs[0].lifecycleDatum as { revisionId: string };
    };
    const publishDiscoveredReview = async (
      subject: string,
      context: string,
      title = `Review ${subject}`,
    ) => {
      const work = obligation("passing-review-required", subject);
      expect(work.actionableResolver).toBe("review-datum-in-context@2");
      const execution = await execute(
        work,
        {
          outputs: [{
            name: "review",
            invocation: 0,
            lifecycleDatum: {
              type: "REV",
              payload: {
                title,
                review_kind: "contextual",
                rubric_ref: "policies/rubrics/bootstrap-review.md@1",
                findings: [],
                outcome: "pass",
              },
              links: [
                { type: "reviews", target: subject },
                { type: "contextualizes", target: context },
              ],
              body: "Independent contextual Review passed.\n",
            },
          }],
          completionEvidence: { summary: `Independent Review passed for ${subject}.` },
        },
        [`subject=${subject}`, `review_context=${context}`],
        "contextual-review",
        "independent-reviewer",
      );
      return execution.outputs[0].lifecycleDatum as { revisionId: string };
    };

    const stakeholder = create(
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Export a completed report",
      "--set",
      "rationale=Report authors need a portable result",
      "--set",
      "statement=The product shall export one completed report through a public boundary.",
      "--set",
      "verification_intent=Observe one exact export and malformed-request rejection.",
      "--set",
      "stakeholder=report author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${create(
        "PSP",
        "--scenario",
        "compile-psp@2",
        "--set",
        "title=Portable report",
        "--set",
        "rationale=One bounded export validates the decomposition tracer",
        "--set",
        "problem=Completed reports cannot leave the product",
        "--set",
        'users=["report author"]',
        "--set",
        'goals=["export one completed report"]',
        "--set",
        'non_goals=["general integration platform"]',
        "--set",
        'success_measures=["one report crosses the public boundary"]',
      ).id}`,
    );
    const strategy = create(
      "VSP",
      "--scenario",
      "define-verification-strategy@1",
      "--set",
      "title=System export strategy",
      "--set",
      "rationale=The system boundary needs observable independent evidence",
      "--set",
      "level=system",
      "--set",
      'permitted_methods=["demonstration","test"]',
      "--set",
      `independence=${JSON.stringify({
        boundary: "black-box",
        prohibited_inputs: [
          "product source code",
          "product unit tests",
          "private implementation details",
          "uncontrolled implementation shortcuts",
        ],
      })}`,
      "--set",
      "evidence_policy=Retain exact requests and visible responses",
      "--set",
      "assessment_policy=Require success and malformed-request discrimination",
      "--set",
      `environment_profile=${JSON.stringify({
        id: "system-boundary",
        purpose: "Exercise the controlled report boundary",
        capabilities: {
          controllability: ["report fixture"],
          observability: ["response schema", "error code"],
          external_services: [],
          timing: "deterministic request window",
        },
      })}`,
      "--link",
      `governs=${stakeholder.id}`,
      "--link",
      `governs-revision=${stakeholder.revisionId}`,
    );

    const intentCandidate = freeze(
      baseline("Approved intent", "intent-level-candidate", "candidate"),
      [stakeholder.revisionId],
    );
    const intentDecision = create(
      "DEC",
      "--scenario",
      "record-gate-signoff@2",
      "--set",
      "title=Authorize system definition",
      "--set",
      "rationale=The exact stakeholder slice is bounded",
      "--set",
      "kind=gate-signoff",
      "--set",
      "gate_outcome=approve",
      "--set",
      "decision=Proceed to one bounded system decomposition",
      "--set",
      'alternatives=["defer system definition"]',
      "--set",
      `effective_scope=${intentCandidate.revisionId}`,
      "--link",
      `justifies=${intentCandidate.revisionId}`,
    );
    const intentDecisionContext = freeze(
      baseline("Intent decision review", "review-context", "review-context"),
      [intentDecision.revisionId],
    );
    fixtureReview(intentDecision.revisionId, intentDecisionContext.revisionId);

    expect(obligation("decomposition-planning-required", stakeholder.revisionId)).toEqual(
      expect.objectContaining({ status: "blocked", dispatchable: false }),
    );
    expect(obligation("system-architecture-required", stakeholder.revisionId)).toEqual(
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "define-system-architecture@2",
      }),
    );

    const architectureWork = obligation("system-architecture-required", stakeholder.revisionId);
    const architectureExecution = await execute(
      architectureWork,
      {
        outputs: [{
          name: "architecture",
          invocation: 0,
          lifecycleDatum: {
            id: "ASP-0REPRTARCH",
            type: "ASP",
            payload: {
              title: "Report export system architecture",
              rationale: "One producer and one boundary keep the slice minimal",
              level: "system",
              elements: [{
                id: "AEL-0REPRTCR00",
                alias: "REPORT_CORE",
                title: "Report core",
                responsibilities: ["prepare one completed report for export"],
              }, {
                id: "AEL-0EXPRTAP00",
                alias: "EXPORT_API",
                title: "Export boundary",
                responsibilities: ["expose the controlled report contract"],
              }],
              interactions: ["Report core sends one completed report to the export boundary"],
              constraints: ["The boundary exposes no private implementation detail"],
              nominated_risks: ["schema drift"],
            },
            links: [{ type: "governs", target: stakeholder.revisionId }],
            body: "One minimal system architecture.\n",
          },
        }],
        completionEvidence: { summary: "The accepted intent has exact architecture context." },
      },
      [`requirements=${stakeholder.revisionId}`],
      "define-architecture",
    );
    const architecture = architectureExecution.outputs[0].lifecycleDatum as {
      id: string;
      revisionId: string;
    };
    expect(obligation("decomposition-planning-required", stakeholder.revisionId)).toEqual(
      expect.objectContaining({ status: "blocked", dispatchable: false }),
    );
    expect(obligation("interface-control-specification-required", architecture.revisionId)).toEqual(
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "define-interface-control-specification@2",
      }),
    );
    const interfaceWork = obligation(
      "interface-control-specification-required",
      architecture.revisionId,
    );
    const interfaceExecution = await execute(
      interfaceWork,
      {
        outputs: [{
          name: "interface",
          invocation: 0,
          lifecycleDatum: {
            id: "ICSP-0REPRT1CSP",
            type: "ICSP",
            payload: {
              title: "Report export boundary",
              rationale: "A normative black-box contract separates responsibility",
              architecture_revision: architecture.revisionId,
              boundary: {
                from_element: "AEL-0REPRTCR00",
                to_element: "AEL-0EXPRTAP00",
              },
              operations: ["POST /exports"],
              schemas: ["report-export-request@1", "report-export-response@1"],
              units: [],
              timing: ["respond within the declared request window"],
              errors: ["malformed requests return invalid-request"],
              security: ["authorized report authors only"],
              ordering: ["validate before export"],
              compatibility: ["version 1 readers accept version 1 responses"],
              interface_version: "1.0.0",
            },
            links: [{ type: "defines-interface-for", target: architecture.revisionId }],
            body: "One exact black-box interface contract.\n",
          },
        }],
        completionEvidence: { summary: "The architecture has one exact interface contract." },
      },
      [`architecture=${architecture.revisionId}`],
      "define-interface",
    );
    const interfaceSpec = interfaceExecution.outputs[0].lifecycleDatum as {
      id: string;
      revisionId: string;
    };
    expect(obligation("decomposition-planning-required", stakeholder.revisionId)).toEqual(
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "define-decomposition-work-package@2",
      }),
    );
    const planningWork = obligation("decomposition-planning-required", stakeholder.revisionId);
    const planningExecution = await execute(
      planningWork,
      {
        outputs: [{
          name: "plan",
          invocation: 0,
          lifecycleDatum: {
            id: "DWP-0REPRTPMN0",
            type: "DWP",
            payload: {
              title: "Decompose report export intent",
              rationale: "One exact work package bounds parent coverage",
              stage: "planning",
              parent_revisions: [stakeholder.revisionId],
              architecture_context: {
                revision: architecture.revisionId,
                element: "AEL-0EXPRTAP00",
              },
              target_child_type: "SYS",
              behavioral_slice: "Public report export behavior and malformed-request discrimination",
              expected_coverage: ["successful export", "invalid request rejection"],
              exclusions: ["report rendering internals"],
              interface_context: [interfaceSpec.revisionId],
              verification_strategy_revision: strategy.revisionId,
              dependencies: [],
              required_review_policy: "review-applicability@1",
            },
            links: [
              { type: "decomposes", target: stakeholder.revisionId },
              { type: "allocated-to", target: architecture.revisionId },
              { type: "governed-by", target: interfaceSpec.revisionId },
            ],
            body: "One bounded decomposition plan.\n",
          },
        }],
        completionEvidence: { summary: "Exact inputs produced one bounded plan and scope challenge." },
      },
      [
        `parents=${stakeholder.revisionId}`,
        `architecture=${architecture.revisionId}`,
        `interfaces=${interfaceSpec.revisionId}`,
        `verification_strategy=${strategy.revisionId}`,
      ],
      "plan-decomposition",
    );
    const plan = planningExecution.outputs.find((output: any) =>
      output.name === "plan"
    )!.lifecycleDatum as { id: string; revisionId: string };
    expect(obligation("decomposition-execution-required", plan.revisionId)).toEqual(
      expect.objectContaining({
        status: "blocked",
        dispatchable: false,
        blockedBy: expect.arrayContaining([
          expect.stringContaining("passing-review-required@2"),
        ]),
      }),
    );
    const question = create(
      "QST",
      "--scenario",
      String(planningWork.actionableResolver),
      "--set",
      "title=Confirm malformed-request scope",
      "--set",
      "kind=empirical",
      "--set",
      "evidence_available=true",
      "--set",
      "question=Must malformed requests be rejected at the public boundary?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The DWP cannot execute until the boundary behavior is confirmed",
      "--link",
      `blocks=${plan.id}`,
    );
    const planningContext = await createDiscoveredReviewContext(
      "Exact decomposition planning context",
      [strategy.revisionId, architecture.revisionId, interfaceSpec.revisionId, plan.revisionId, question.revisionId],
    );
    expect(obligation("passing-review-required", plan.revisionId)).toEqual(
      expect.objectContaining({ status: "awaiting-review", dispatchable: true }),
    );
    for (const subject of [strategy.revisionId, architecture.revisionId, interfaceSpec.revisionId, plan.revisionId]) {
      await publishDiscoveredReview(subject, planningContext.revisionId);
    }
    expect(phaseItems().find((item) =>
      item.obligation === "passing-review-required" && item.subject === plan.revisionId
    )).toBeUndefined();

    expect(obligation("decomposition-execution-required", plan.revisionId)).toEqual(
      expect.objectContaining({
        status: "blocked",
        dispatchable: false,
        blockedBy: expect.arrayContaining([
          expect.stringContaining(question.revisionId),
        ]),
      }),
    );
    const questionWork = phaseItems().find((item) =>
      item.obligation === "open-question-resolution" && item.subject === question.revisionId
    );
    expect(questionWork).toBeDefined();
    await execute(
      questionWork!,
      {
        outputs: [{
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Confirm public rejection behavior",
              rationale: "Malformed-request discrimination is required for the controlled boundary",
              kind: "decision",
              decision: "Reject malformed requests at the public boundary",
              alternatives: ["accept malformed requests"],
              effective_scope: "Exact report export DWP",
            },
            links: [
              { type: "resolves", target: question.revisionId },
              { type: "resolves", target: `${question.id}-r00002` },
            ],
            body: "The public boundary must discriminate malformed requests.\n",
          },
        }, {
          name: "updated_question",
          invocation: 0,
          lifecycleDatum: {
            id: question.id,
            type: "QST",
            payload: {
              title: "Confirm malformed-request scope",
              kind: "empirical",
              question: "Must malformed requests be rejected at the public boundary?",
              state: "answered",
              blocking_impact: "Resolved for this exact DWP",
            },
            links: [{ type: "blocks", target: plan.id }],
            body: "Answered by exact Decision evidence.\n",
          },
        }],
        completionEvidence: { summary: "The exact blocking question was answered." },
      },
      [`question=${question.revisionId}`],
      "resolve-question",
    );

    const executionWork = obligation("decomposition-execution-required", plan.revisionId);
    expect(executionWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "execute-decomposition-work-package@2",
    }));
    const systemExecution = await execute(
      executionWork,
      {
        outputs: [{
          name: "requirements",
          invocation: 0,
          lifecycleDatum: {
            id: "SYS-0EXPRTREQ0",
            type: "SYS",
            payload: {
              title: "Export one completed report",
              rationale: "The exact stakeholder commitment requires one public system behavior",
              statement: "The system shall export one completed report through the controlled public boundary.",
              verification_intent: "Observe a valid export and rejection of a malformed request.",
              architecture_allocation: {
                architecture_revision: architecture.revisionId,
                element: "AEL-0EXPRTAP00",
              },
              interface_context: [interfaceSpec.revisionId],
            },
            links: [
              { type: "derived-from", target: stakeholder.id },
              { type: "decomposes", target: plan.revisionId },
              { type: "allocated-to", target: architecture.revisionId },
              { type: "governed-by", target: interfaceSpec.revisionId },
            ],
            body: "One minimal solution-independent system requirement.\n",
          },
        }],
        completionEvidence: { summary: "The exact parent slice produced one bounded SYS revision." },
      },
      [
        `plan=${plan.revisionId}`,
        `parents=${stakeholder.revisionId}`,
        `architecture=${architecture.revisionId}`,
        `interfaces=${interfaceSpec.revisionId}`,
      ],
      "execute-dwp",
    );
    const system = systemExecution.outputs[0].lifecycleDatum as { id: string; revisionId: string };
    const shownSystem = req(repositoryRoot, "show", system.revisionId, "--json");
    expect(JSON.parse(shownSystem.stdout).lifecycleDatum.datum.links).toEqual([
      { type: "derived-from", target: stakeholder.id },
      { type: "decomposes", target: plan.revisionId },
      { type: "allocated-to", target: architecture.revisionId },
      { type: "governed-by", target: interfaceSpec.revisionId },
    ]);

    expect(obligation("decomposition-output-reviews-required", plan.revisionId)).toEqual(
      expect.objectContaining({ status: "awaiting-review", satisfied: false }),
    );
    expect(obligation("decomposition-completion-required", plan.revisionId)).toEqual(
      expect.objectContaining({
        status: "blocked",
        blockedBy: expect.arrayContaining([
          expect.stringContaining("decomposition-output-reviews-required@1"),
          expect.stringContaining("decomposition-simplification-required@1"),
          expect.stringContaining("architecture-interface-simplification-required@1"),
        ]),
      }),
    );

    const definitionContext = await createDiscoveredReviewContext(
      "Exact decomposition definition set",
      [system.revisionId, plan.revisionId, architecture.revisionId, interfaceSpec.revisionId],
    );
    await publishDiscoveredReview(system.revisionId, definitionContext.revisionId);

    const simplify = async (
      obligationName: string,
      scenario: string,
      reviewKind: string,
      reviewId: string,
    ) => {
      const work = obligation(obligationName, plan.revisionId);
      expect(work).toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
      }));
      expect(work.actionableResolver).toBe(scenario);
      const execution = await execute(
        work,
        {
          outputs: [{
            name: "review",
            invocation: 0,
            lifecycleDatum: {
              id: reviewId,
              type: "REV",
              payload: {
                title: `${reviewKind} simplification`,
                review_kind: reviewKind,
                decomposition_plan_revision: plan.revisionId,
                rubric_ref: "policies/rubrics/bootstrap-review.md@1",
                findings: [],
                outcome: "pass",
              },
              links: [
                { type: "reviews", target: definitionContext.revisionId },
                { type: "contextualizes", target: definitionContext.revisionId },
              ],
              body: "The exact set is minimal for its accepted scope.\n",
            },
          }],
          completionEvidence: { summary: "The dedicated simplification challenge passed." },
        },
        [`plan=${plan.revisionId}`, `subject_context=${definitionContext.revisionId}`],
        scenario,
        "independent-reviewer",
      );
      return execution.outputs[0].lifecycleDatum.revisionId as string;
    };
    const requirementSimplification = await simplify(
      "decomposition-simplification-required",
      "simplify-requirement-set@2",
      "simplification-requirements",
      "REV-0REQSMP100",
    );
    const architectureSimplification = await simplify(
      "architecture-interface-simplification-required",
      "simplify-architecture-and-interfaces@2",
      "simplification-architecture-interfaces",
      "REV-0ARCSMP100",
    );

    expect(obligation("decomposition-parent-coverage-required", plan.revisionId)).toEqual(
      expect.objectContaining({ status: "blocked", satisfied: false }),
    );
    const completionWork = obligation("decomposition-completion-required", plan.revisionId);
    expect(completionWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const completionExecution = await execute(
      completionWork,
      {
        outputs: [{
          name: "completion",
          invocation: 0,
          lifecycleDatum: {
            id: plan.id,
            type: "DWP",
            payload: {
              title: "Complete report export decomposition",
              rationale: "Exact reviewed outputs account for the bounded parent slice",
              stage: "completion",
              parent_revisions: [stakeholder.revisionId],
              architecture_context: {
                revision: architecture.revisionId,
                element: "AEL-0EXPRTAP00",
              },
              target_child_type: "SYS",
              behavioral_slice: "Public report export behavior and malformed-request discrimination",
              expected_coverage: ["successful export", "invalid request rejection"],
              exclusions: ["report rendering internals"],
              interface_context: [interfaceSpec.revisionId],
              verification_strategy_revision: strategy.revisionId,
              dependencies: [],
              required_review_policy: "review-applicability@1",
              child_revisions: [system.revisionId],
              parent_coverage_status: "complete",
              coverage_account: [{
                parent_revision: stakeholder.revisionId,
                child_revisions: [system.revisionId],
                disposition: "covered",
              }],
              deferred_questions: [],
              cross_group_dependencies: [],
              output_reviews_complete: true,
              simplification_disposition: "retained",
            },
            links: [
              { type: "decomposes", target: stakeholder.revisionId },
              { type: "derived-from", target: plan.revisionId },
              { type: "allocated-to", target: architecture.revisionId },
              { type: "governed-by", target: interfaceSpec.revisionId },
              { type: "produces", target: system.revisionId },
              { type: "justifies", target: requirementSimplification },
              { type: "justifies", target: architectureSimplification },
            ],
            body: "All exact parent coverage and simplification evidence is accounted for.\n",
          },
        }],
        completionEvidence: { summary: "The DWP completion Revision records complete coverage." },
      },
      [`plan=${plan.revisionId}`],
      "complete-dwp",
    );
    const completion = completionExecution.outputs[0].lifecycleDatum as { id: string; revisionId: string };
    expect(completion.id).toBe(plan.id);
    expect(completion.revisionId).toBe(`${plan.id}-r00002`);
    expect(phaseItems().find((item) =>
      item.obligation === "decomposition-parent-coverage-required" &&
      item.subject === plan.revisionId
    )).toBeUndefined();

    const completionContext = await createDiscoveredReviewContext(
      "Exact DWP completion context",
      [completion.revisionId, system.revisionId, architecture.revisionId, interfaceSpec.revisionId],
      [requirementSimplification, architectureSimplification],
    );
    expect(obligation("passing-review-required", completion.revisionId)).toEqual(
      expect.objectContaining({ status: "awaiting-review", dispatchable: true }),
    );
    await publishDiscoveredReview(
      completion.revisionId,
      completionContext.revisionId,
      "Review exact DWP completion",
    );
    const shownCompletion = req(repositoryRoot, "show", completion.revisionId, "--json");
    expect(JSON.parse(shownCompletion.stdout).lifecycleDatum).toMatchObject({
      storage: { editable: false, frozen: true },
    });
    expect(phaseItems().find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === completion.revisionId
    )).toBeUndefined();

    expect(obligation("decomposition-group-candidate-required", completion.revisionId)).toEqual(
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "create-decomposition-group-candidate@1",
      }),
    );
    const groupCandidateWork = obligation(
      "decomposition-group-candidate-required",
      completion.revisionId,
    );
    const groupCandidateResponse = (extraMembers: string[] = []) => ({
      outputs: [{
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "SYS DEFAULT group candidate",
            kind: "group-candidate",
            role: "candidate",
            scope: completion.revisionId,
            group: "DEFAULT",
            definition_members: [
              architecture.revisionId,
              completion.revisionId,
              interfaceSpec.revisionId,
              system.revisionId,
              ...extraMembers,
            ],
            evidence: [requirementSimplification, architectureSimplification],
          },
          links: [],
          body: "Exact reviewed decomposition group candidate.\n",
        },
      }],
      completionEvidence: { summary: "The exact group definition was frozen." },
    });
    const invalidGroupAdapter = await adapter(
      groupCandidateResponse([strategy.revisionId]),
      "invalid-group-candidate",
    );
    const invalidGroup = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(groupCandidateWork.actionableResolver),
      "--obligation",
      String(groupCandidateWork.id),
      "--adapter",
      invalidGroupAdapter,
      "--input",
      `completion=${completion.revisionId}`,
      "--json",
    );
    expect(invalidGroup.status).toBe(1);
    expect(JSON.parse(invalidGroup.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "scenario-completion-failed" }),
    );
    const groupCandidateExecution = await execute(
      groupCandidateWork,
      groupCandidateResponse(),
      [`completion=${completion.revisionId}`],
      "group-candidate",
    );
    const groupCandidate = groupCandidateExecution.outputs[0].lifecycleDatum as {
      id: string;
      revisionId: string;
    };
    const groupReviewContext = await createDiscoveredReviewContext(
      "SYS group review",
      [groupCandidate.revisionId],
    );
    await publishDiscoveredReview(groupCandidate.revisionId, groupReviewContext.revisionId);

    expect(obligation("system-level-candidate-required", groupCandidate.revisionId)).toEqual(
      expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "create-system-level-candidate@1",
      }),
    );
    const levelCandidateWork = obligation(
      "system-level-candidate-required",
      groupCandidate.revisionId,
    );
    const levelCandidateResponse = (includeStrategy: boolean) => ({
      outputs: [{
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "SYS level candidate",
            kind: "level-candidate",
            role: "candidate",
            scope: groupCandidate.revisionId,
            group: "SYSTEM",
            definition_members: [
              architecture.revisionId,
              interfaceSpec.revisionId,
              ...(includeStrategy ? [strategy.revisionId] : []),
            ],
            evidence: [],
          },
          links: [{ type: "composes", target: groupCandidate.revisionId }],
          body: "Exact composed system-level candidate.\n",
        },
      }],
      completionEvidence: { summary: "The reviewed group was composed with shared context." },
    });
    const levelInputs = [
      `group=${groupCandidate.revisionId}`,
      `completion=${completion.revisionId}`,
      `architecture=${architecture.revisionId}`,
      `interfaces=${interfaceSpec.revisionId}`,
      `verification_strategy=${strategy.revisionId}`,
    ];
    const invalidLevelAdapter = await adapter(
      levelCandidateResponse(false),
      "invalid-level-candidate",
    );
    const invalidLevel = req(
      repositoryRoot,
      "scenario",
      "execute",
      String(levelCandidateWork.actionableResolver),
      "--obligation",
      String(levelCandidateWork.id),
      "--adapter",
      invalidLevelAdapter,
      ...levelInputs.flatMap((input) => ["--input", input]),
      "--json",
    );
    expect(invalidLevel.status).toBe(1);
    expect(JSON.parse(invalidLevel.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "scenario-completion-failed" }),
    );
    const levelCandidateExecution = await execute(
      levelCandidateWork,
      levelCandidateResponse(true),
      levelInputs,
      "level-candidate",
    );
    const levelCandidate = levelCandidateExecution.outputs[0].lifecycleDatum as {
      id: string;
      revisionId: string;
    };
    const levelReviewContext = await createDiscoveredReviewContext(
      "SYS level review",
      [levelCandidate.revisionId],
    );
    await publishDiscoveredReview(levelCandidate.revisionId, levelReviewContext.revisionId);

    const gateWork = obligation("candidate-gate-signoff", levelCandidate.revisionId);
    expect(gateWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    expect(gateWork.actionableResolver).toBe("record-gate-signoff@2");
    const gateExecution = await execute(
      gateWork,
      {
        outputs: [{
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Authorize exact SYS candidate",
              rationale: "The composed exact candidate is reviewed and unblocked",
              kind: "gate-signoff",
              gate_outcome: "approve",
              decision: "Approve this exact SYS level candidate",
              alternatives: ["return the candidate for revision"],
              effective_scope: levelCandidate.revisionId,
            },
            links: [{ type: "justifies", target: levelCandidate.revisionId }],
            body: "Stakeholder authority approved the exact system candidate.\n",
          },
        }],
        completionEvidence: { summary: "Exact gate approval recorded." },
      },
      [`candidate=${levelCandidate.revisionId}`],
      "system-gate",
      "stakeholder",
    );
    const gateDecision = gateExecution.outputs[0].lifecycleDatum as { revisionId: string };
    const gateReviewContext = await createDiscoveredReviewContext(
      "SYS gate decision review",
      [gateDecision.revisionId],
    );
    await publishDiscoveredReview(gateDecision.revisionId, gateReviewContext.revisionId);

    const phase = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-2-system-definition",
    );
    expect(phase.status, `${phase.stderr}${phase.stdout}`).toBe(0);
    expect(phase.stdout).toContain(`Gate Candidate: ${levelCandidate.revisionId}`);
    expect(phase.stdout).toContain("Gate Complete: true");
    expect(phase.stdout).toContain("Progression Next Phase: phase-2-pilot-assessment");
    expect(phase.stdout).toContain("Progression Ready: true");
    expect(phase.stdout).toContain("Progression Authorized: true");
    expect(phase.stdout).toContain("Progression Complete: true");
    const shownLevel = req(repositoryRoot, "show", levelCandidate.revisionId, "--json");
    const levelDatum = JSON.parse(shownLevel.stdout).lifecycleDatum.datum;
    expect(levelDatum.payload.definition_members).toEqual([
      architecture.revisionId,
      interfaceSpec.revisionId,
      strategy.revisionId,
    ].sort());
    expect(levelDatum.links).toContainEqual({
      type: "composes",
      target: groupCandidate.revisionId,
    });
    const shownGroup = req(repositoryRoot, "show", groupCandidate.revisionId, "--json");
    expect(JSON.parse(shownGroup.stdout).lifecycleDatum.datum.payload.definition_members)
      .toEqual([
        architecture.revisionId,
        completion.revisionId,
        interfaceSpec.revisionId,
        system.revisionId,
      ].sort());
    for (const candidate of [groupCandidate.revisionId, levelCandidate.revisionId]) {
      const verified = req(repositoryRoot, "baseline", "verify", candidate, "--json");
      expect(verified.status, `${verified.stderr}${verified.stdout}`).toBe(0);
      expect(JSON.parse(verified.stdout).baselineVerification.valid).toBe(true);
    }
  }, 180_000);
});
