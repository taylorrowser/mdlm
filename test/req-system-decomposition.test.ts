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
      "complete-decomposition-work-package@1",
      "define-decomposition-work-package@1",
      "define-interface-control-specification@1",
      "define-system-architecture@1",
      "execute-decomposition-work-package@1",
      "simplify-architecture-and-interfaces@1",
      "simplify-requirement-set@1",
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
    const review = (subject: string, context: string, title = `Review ${subject}`) =>
      create(
        "REV",
        "--scenario",
        "review-datum-in-context@1",
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
      scenario: string,
      work: Record<string, any>,
      response: unknown,
      inputs: string[],
      label: string,
    ) => {
      const executable = await adapter(response, label);
      const arguments_ = [
        "scenario",
        "execute",
        scenario,
        "--obligation",
        String(work.id),
        "--adapter",
        executable,
      ];
      for (const input of inputs) arguments_.push("--input", input);
      const result = req(repositoryRoot, ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).execution as Record<string, any>;
    };

    const stakeholder = create(
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@1",
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
        "compile-psp@1",
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
      `environment_profiles=${JSON.stringify([{
        id: "system-boundary",
        purpose: "Exercise the controlled report boundary",
        controllability: ["report fixture"],
        observability: ["response schema", "error code"],
        external_services: [],
        timing: "deterministic request window",
      }])}`,
      "--link",
      `governs=${stakeholder.id}`,
    );

    const intentCandidate = freeze(
      baseline("Approved intent", "intent-level-candidate", "candidate"),
      [stakeholder.revisionId],
    );
    const intentDecision = create(
      "DEC",
      "--scenario",
      "record-gate-signoff@1",
      "--set",
      "title=Authorize system definition",
      "--set",
      "rationale=The exact stakeholder slice is bounded",
      "--set",
      "kind=gate-signoff",
      "--set",
      "decision=Proceed to one bounded system decomposition",
      "--set",
      'alternatives=["defer system definition"]',
      "--set",
      "effective_scope=Exact intent candidate only",
      "--link",
      `justifies=${intentCandidate.revisionId}`,
    );
    const intentDecisionContext = freeze(
      baseline("Intent decision review", "review-context", "review-context"),
      [intentDecision.revisionId],
    );
    review(intentDecision.revisionId, intentDecisionContext.revisionId);

    const architecture = create(
      "ASP",
      "--scenario",
      "define-system-architecture@1",
      "--set",
      "title=Report export system architecture",
      "--set",
      "rationale=One producer and one boundary keep the slice minimal",
      "--set",
      "level=system",
      "--set",
      `elements=${JSON.stringify([{
        id: "AEL-0REPRTCR00",
        alias: "REPORT_CORE",
        title: "Report core",
        responsibilities: ["prepare one completed report for export"],
      }, {
        id: "AEL-0EXPRTAP00",
        alias: "EXPORT_API",
        title: "Export boundary",
        responsibilities: ["expose the controlled report contract"],
      }])}`,
      "--set",
      'interactions=["Report core sends one completed report to the export boundary"]',
      "--set",
      'constraints=["The boundary exposes no private implementation detail"]',
      "--set",
      'nominated_risks=["schema drift"]',
      "--link",
      `governs=${stakeholder.revisionId}`,
    );
    const interfaceSpec = create(
      "ICSP",
      "--scenario",
      "define-interface-control-specification@1",
      "--set",
      "title=Report export boundary",
      "--set",
      "rationale=A normative black-box contract separates responsibility",
      "--set",
      `architecture_revision=${architecture.revisionId}`,
      "--set",
      'boundary={"from_element":"AEL-0REPRTCR00","to_element":"AEL-0EXPRTAP00"}',
      "--set",
      'operations=["POST /exports"]',
      "--set",
      'schemas=["report-export-request@1","report-export-response@1"]',
      "--set",
      'units=[]',
      "--set",
      'timing=["respond within the declared request window"]',
      "--set",
      'errors=["malformed requests return invalid-request"]',
      "--set",
      'security=["authorized report authors only"]',
      "--set",
      'ordering=["validate before export"]',
      "--set",
      'compatibility=["version 1 readers accept version 1 responses"]',
      "--set",
      "interface_version=1.0.0",
      "--link",
      `defines-interface-for=${architecture.revisionId}`,
    );
    const plan = create(
      "DWP",
      "--scenario",
      "define-decomposition-work-package@1",
      "--set",
      "title=Decompose report export intent",
      "--set",
      "rationale=One exact work package bounds parent coverage",
      "--set",
      "stage=planning",
      "--set",
      `parent_revisions=["${stakeholder.revisionId}"]`,
      "--set",
      `architecture_context={"revision":"${architecture.revisionId}","element":"AEL-0EXPRTAP00"}`,
      "--set",
      "target_child_type=SYS",
      "--set",
      "behavioral_slice=Public report export behavior and malformed-request discrimination",
      "--set",
      'expected_coverage=["successful export","invalid request rejection"]',
      "--set",
      'exclusions=["report rendering internals"]',
      "--set",
      `interface_context=["${interfaceSpec.revisionId}"]`,
      "--set",
      `verification_strategy_revision=${strategy.revisionId}`,
      "--set",
      "dependencies=[]",
      "--set",
      "required_review_policy=review-applicability@1",
      "--link",
      `decomposes=${stakeholder.revisionId}`,
    );
    for (const [source, type] of [
      [architecture.revisionId, "governs"],
      [interfaceSpec.revisionId, "defines-interface-for"],
    ] as const) {
      const linked = req(repositoryRoot, "link", source, plan.revisionId, "--type", type, "--json");
      expect(linked.status, `${linked.stderr}${linked.stdout}`).toBe(0);
    }
    const question = create(
      "QST",
      "--scenario",
      "resolve-question@1",
      "--set",
      "title=Confirm malformed-request scope",
      "--set",
      "kind=empirical",
      "--set",
      "question=Must malformed requests be rejected at the public boundary?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The DWP cannot execute until the boundary behavior is confirmed",
      "--link",
      `blocks=${plan.id}`,
    );
    const planningContext = freeze(
      baseline("Exact decomposition planning context", "review-context", "review-context"),
      [strategy.revisionId, architecture.revisionId, interfaceSpec.revisionId, plan.revisionId, question.revisionId],
    );
    expect(obligation("passing-review-required", plan.revisionId)).toEqual(
      expect.objectContaining({ status: "awaiting-review", dispatchable: true }),
    );
    for (const subject of [strategy.revisionId, architecture.revisionId, interfaceSpec.revisionId, plan.revisionId]) {
      review(subject, planningContext.revisionId);
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
      "resolve-question@1",
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
            links: [{ type: "resolves", target: question.revisionId }],
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
      actionableResolver: "execute-decomposition-work-package@1",
    }));
    const systemExecution = await execute(
      "execute-decomposition-work-package@1",
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

    const definitionContext = freeze(
      baseline("Exact decomposition definition set", "review-context", "review-context"),
      [plan.revisionId, system.revisionId, architecture.revisionId, interfaceSpec.revisionId],
    );
    review(system.revisionId, definitionContext.revisionId);

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
      const execution = await execute(
        scenario,
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
      );
      return execution.outputs[0].lifecycleDatum.revisionId as string;
    };
    const requirementSimplification = await simplify(
      "decomposition-simplification-required",
      "simplify-requirement-set@1",
      "simplification-requirements",
      "REV-0REQSMP100",
    );
    const architectureSimplification = await simplify(
      "architecture-interface-simplification-required",
      "simplify-architecture-and-interfaces@1",
      "simplification-architecture-interfaces",
      "REV-0ARCSMP100",
    );

    expect(obligation("decomposition-parent-coverage-required", plan.revisionId)).toEqual(
      expect.objectContaining({ status: "blocked", satisfied: false }),
    );
    const completionWork = obligation("decomposition-completion-required", plan.revisionId);
    expect(completionWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const completionExecution = await execute(
      "complete-decomposition-work-package@1",
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

    const completionContext = freeze(
      baseline("Exact DWP completion context", "review-context", "review-context"),
      [completion.revisionId, system.revisionId, architecture.revisionId, interfaceSpec.revisionId],
      [requirementSimplification, architectureSimplification],
    );
    expect(obligation("passing-review-required", completion.revisionId)).toEqual(
      expect.objectContaining({ status: "awaiting-review", dispatchable: true }),
    );
    review(completion.revisionId, completionContext.revisionId, "Review exact DWP completion");
    const shownCompletion = req(repositoryRoot, "show", completion.revisionId, "--json");
    expect(JSON.parse(shownCompletion.stdout).lifecycleDatum).toMatchObject({
      storage: { editable: false, frozen: true },
    });
    expect(phaseItems().find((item) =>
      item.obligation === "passing-review-required" &&
      item.subject === completion.revisionId
    )).toBeUndefined();

    const groupCandidate = freeze(
      baseline("SYS DEFAULT group candidate", "group-candidate", "candidate"),
      [completion.revisionId, system.revisionId, architecture.revisionId, interfaceSpec.revisionId],
      [requirementSimplification, architectureSimplification],
    );
    const groupReviewContext = freeze(
      baseline("SYS group review", "review-context", "review-context"),
      [groupCandidate.revisionId],
    );
    review(groupCandidate.revisionId, groupReviewContext.revisionId);

    const levelCandidate = baseline("SYS level candidate", "level-candidate", "candidate");
    for (const member of [strategy.revisionId, architecture.revisionId, interfaceSpec.revisionId]) {
      const added = req(repositoryRoot, "baseline", "add", levelCandidate.id, member, "--json");
      expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
    }
    const composed = req(
      repositoryRoot,
      "baseline",
      "compose",
      levelCandidate.id,
      groupCandidate.revisionId,
      "--json",
    );
    expect(composed.status, `${composed.stderr}${composed.stdout}`).toBe(0);
    const frozenLevel = req(repositoryRoot, "baseline", "freeze", levelCandidate.id, "--json");
    expect(frozenLevel.status, `${frozenLevel.stderr}${frozenLevel.stdout}`).toBe(0);
    const levelReviewContext = freeze(
      baseline("SYS level review", "review-context", "review-context"),
      [levelCandidate.revisionId],
    );
    review(levelCandidate.revisionId, levelReviewContext.revisionId);

    const gateWork = obligation("candidate-gate-signoff", levelCandidate.revisionId);
    expect(gateWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const gateDecision = create(
      "DEC",
      "--scenario",
      "record-gate-signoff@1",
      "--set",
      "title=Authorize exact SYS candidate",
      "--set",
      "rationale=The composed exact candidate is reviewed and unblocked",
      "--set",
      "kind=gate-signoff",
      "--set",
      "decision=Approve this exact SYS level candidate",
      "--set",
      'alternatives=["return the candidate for revision"]',
      "--set",
      "effective_scope=Exact SYS level candidate only",
      "--link",
      `justifies=${levelCandidate.revisionId}`,
    );
    const gateReviewContext = freeze(
      baseline("SYS gate decision review", "review-context", "review-context"),
      [gateDecision.revisionId],
    );
    review(gateDecision.revisionId, gateReviewContext.revisionId);

    const phase = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-2-system-definition",
      "--json",
    );
    expect(phase.status, `${phase.stderr}${phase.stdout}`).toBe(0);
    const phaseStatus = JSON.parse(phase.stdout).phaseStatus;
    expect(phaseStatus.entry.satisfied).toBe(true);
    expect(phaseStatus.gate.evaluations).toHaveLength(1);
    expect(phaseStatus.gate.evaluations[0]).toMatchObject({
      complete: true,
      status: "satisfied",
    });
    expect(phaseStatus.gate.evaluations[0].candidate.identity.revision_id)
      .toBe(levelCandidate.revisionId);
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
  }, 120_000);
});
