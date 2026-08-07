import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

describe("req Problem Report and Change Request flow", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-change-control-"));
    const initialized = req(repositoryRoot, "init", "--process", examplePackage, "--json");
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("supplies exact Problem Report, Change Request, impact, approval, and closure contracts", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toEqual(expect.arrayContaining(["CHG@1", "PRB@1"]));
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "analyze-change-impact@1",
      "approve-change-request@2",
      "close-change-request@2",
      "report-problem@1",
      "revise-requirement-under-change@1",
    ]));
    expect(catalogs.obligations).toEqual(expect.arrayContaining([
      "change-approval-required@1",
      "change-closure-required@1",
      "change-impact-required@1",
      "change-revision-required@1",
      "problem-report-required@1",
    ]));
  });

  it("reports a pilot problem, bounds and approves impact, selectively stales evidence, and closes exactly", async () => {
    let adapterSequence = 0;
    const create = (...arguments_: string[]) => {
      const result = req(repositoryRoot, "new", ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as { id: string; revisionId: string };
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
    const looseEnds = (phase: string) => {
      const result = req(repositoryRoot, "loose-ends", "--phase", phase, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items as Array<Record<string, any>>;
    };
    const work = (phase: string, obligation: string, subject: string) => {
      const item = looseEnds(phase).find((candidate) =>
        candidate.obligation === obligation && candidate.subject === subject
      );
      expect(item).toBeDefined();
      return item as Record<string, any>;
    };
    const execute = async (
      scenario: string,
      obligation: Record<string, any>,
      response: unknown,
      inputs: string[],
      label: string,
    ) => {
      const executable = await adapter(response, label);
      const authority = scenario === "approve-change-request@2"
        ? "stakeholder"
        : scenario === "review-datum-in-context@2"
        ? "independent-reviewer"
        : undefined;
      const arguments_ = [
        "scenario",
        "execute",
        scenario,
        "--obligation",
        String(obligation.id),
        ...(authority ? ["--authorize", authority] : []),
        "--adapter",
        executable,
      ];
      for (const input of inputs) arguments_.push("--input", input);
      const result = req(repositoryRoot, ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).execution as Record<string, any>;
    };
    const baseline = (title: string, kind: string, role: string) => {
      const result = req(
        repositoryRoot,
        "baseline",
        "create",
        "--type",
        "BSL",
        "--scenario",
        kind === "review-context" ? "create-review-context@1" : "create-candidate-baseline@1",
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
      changedUnder?: string,
    ) => {
      for (const member of members) {
        const added = req(repositoryRoot, "baseline", "add", subject.id, member, "--json");
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      for (const item of evidence) {
        const added = req(repositoryRoot, "baseline", "evidence", "add", subject.id, item, "--json");
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      if (changedUnder) {
        const linked = req(
          repositoryRoot,
          "link",
          subject.revisionId,
          changedUnder,
          "--type",
          "changed-under",
          "--json",
        );
        expect(linked.status, `${linked.stderr}${linked.stdout}`).toBe(0);
      }
      const frozen = req(repositoryRoot, "baseline", "freeze", subject.id, "--json");
      expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
      return subject;
    };
    const review = async (
      subject: string,
      context: string,
      dependency?: string,
      changedUnder?: string,
    ) => {
      const links = [
        { type: "reviews", target: subject },
        { type: "contextualizes", target: context },
        ...(dependency ? [{ type: "depends-on", target: dependency }] : []),
        ...(changedUnder ? [{ type: "changed-under", target: changedUnder }] : []),
      ];
      const execution = await execute(
        "review-datum-in-context@2",
        work("phase-7-change-control", "passing-review-required", subject),
        {
          outputs: [{
            name: "review",
            invocation: 0,
            lifecycleDatum: {
              type: "REV",
              payload: {
                title: `Review ${subject}`,
                review_kind: "contextual",
                rubric_ref: "policies/rubrics/bootstrap-review.md@1",
                findings: [],
                outcome: "pass",
              },
              links,
              body: `Independent Review passed for ${subject}.\n`,
            },
          }],
          completionEvidence: { summary: `Independent Review passed for ${subject}.` },
        },
        [`subject=${subject}`, `review_context=${context}`],
        `review-${subject}`,
      );
      return execution.outputs[0].lifecycleDatum as { id: string; revisionId: string };
    };
    const runResponse = (
      runId: string,
      resultId: string,
      kind: "qualification" | "pilot",
      implementation: string,
      environment: string,
      target: string,
      claim: Record<string, unknown>,
      links: Array<{ type: string; target: string }> = [],
    ) => ({
      outputs: [
        {
          name: "run",
          invocation: 0,
          lifecycleDatum: {
            id: runId,
            type: "RUN",
            payload: {
              title: `${kind} change-control run`,
              kind,
              started_at: "2026-08-04T20:00:00.000Z",
              completed_at: "2026-08-04T20:01:00.000Z",
              execution_state: "completed",
              execution_target: {
                kind: kind === "qualification" ? "environment" : "prototype",
                ref: target,
              },
              runner_ref: "runner:change-control@1",
              configuration_refs: [`config:sha256:${"a".repeat(64)}`],
              activities_expected: ["supported-success", "unsupported-discrimination"],
              activities_invoked: ["supported-success", "unsupported-discrimination"],
              evidence_locations: [`evidence:${resultId}`],
            },
            links: [
              { type: "executes", target: implementation },
              { type: "uses", target: environment },
              { type: "targets", target },
              { type: "produces", target: `${resultId}-r00001` },
            ],
            body: `Exact ${kind} execution.\n`,
          },
        },
        {
          name: "result",
          invocation: 0,
          lifecycleDatum: {
            id: resultId,
            type: "RES",
            payload: {
              title: `${kind} change-control result`,
              claim,
              assessment_state: "accepted",
              observations: {
                expected_success_observed: true,
                expected_discrimination_observed: true,
                details: "The positive control completed and the negative control produced the expected discriminating observation.",
              },
              evidence_refs: [`evidence:${resultId}`],
              assessor_ref: "assessor:change-control@1",
            },
            links: [{ type: "assessed-in", target: environment }, ...links],
            body: `Scoped ${kind} evidence.\n`,
          },
        },
      ],
      completionEvidence: { summary: "Exact bounded execution completed." },
    });

    const product = create(
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Portable report",
      "--set",
      "rationale=One public export behavior supports exact change control",
      "--set",
      "problem=Completed reports cannot be carried between tools",
      "--set",
      'users=["report author"]',
      "--set",
      'goals=["export one completed report"]',
      "--set",
      'non_goals=["general integration platform"]',
      "--set",
      'success_measures=["valid exports succeed and malformed requests fail visibly"]',
    );
    const stakeholder = create(
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Export a completed report",
      "--set",
      "rationale=Report authors need portable outcomes",
      "--set",
      "statement=The product shall export one completed report.",
      "--set",
      "verification_intent=Exercise valid and malformed export requests.",
      "--set",
      "stakeholder=report author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${product.id}`,
    );
    const affected = create(
      "SYS",
      "--scenario",
      "derive-system-requirements@2",
      "--set",
      "title=Accept export requests",
      "--set",
      "rationale=The system boundary must accept report export requests",
      "--set",
      "statement=The system shall accept every export request.",
      "--set",
      "verification_intent=Observe valid and malformed request behavior.",
      "--link",
      `derived-from=${stakeholder.id}`,
    );
    const unrelated = create(
      "SYS",
      "--scenario",
      "derive-system-requirements@2",
      "--set",
      "title=Retain report title",
      "--set",
      "rationale=Portable reports need their title",
      "--set",
      "statement=The system shall retain the authored report title.",
      "--set",
      "verification_intent=Inspect the exported title.",
      "--link",
      `derived-from=${stakeholder.id}`,
    );
    const strategy = create(
      "VSP",
      "--scenario",
      "define-verification-strategy@1",
      "--set",
      "title=Change-control pilot strategy",
      "--set",
      "rationale=Public behavior needs source-independent discrimination",
      "--set",
      "level=system",
      "--set",
      'permitted_methods=["test"]',
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
      "evidence_policy=Retain exact public requests and responses",
      "--set",
      "assessment_policy=Require positive success and malformed-request discrimination",
      "--set",
      `environment_profile=${JSON.stringify({
        id: "public-api",
        purpose: "Exercise the controlled export boundary",
        capabilities: {
          controllability: ["request fixtures"],
          observability: ["response status"],
          external_services: [],
          timing: "deterministic request window",
        },
      })}`,
      "--link",
      `governs=${stakeholder.id}`,
      "--link",
      `governs-revision=${stakeholder.revisionId}`,
    );
    const environment = create(
      "ENV",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Controlled API environment",
      "--set",
      "rationale=Exact fixtures isolate public request behavior",
      "--set",
      `strategy_revision=${strategy.revisionId}`,
      "--set",
      "profile_id=public-api",
      "--set",
      `capabilities=${JSON.stringify({
        controllability: ["request fixtures"],
        observability: ["response status"],
        external_services: [],
        timing: "deterministic request window",
      })}`,
      "--set",
      `reproducibility=${JSON.stringify({
        environment_ref: `container:sha256:${"b".repeat(64)}`,
        configuration_digest: `sha256:${"c".repeat(64)}`,
        reconstruction: "Restore the exact isolated API fixture.",
      })}`,
      "--link",
      `realizes=${strategy.revisionId}`,
    );
    const qualificationActivity = create(
      "VER",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=Qualify controlled API capabilities",
      "--set",
      "rationale=The environment must expose controlled requests and visible responses",
      "--set",
      "kind=qualification",
      "--set",
      "method=test",
      "--set",
      "assessment_mode=automatic",
      "--set",
      'claim={"kind":"qualification","scope":"environment-capability","formal_evidence_eligible":false}',
      "--set",
      'acceptance_criteria=["fixtures are controllable","responses are observable"]',
      "--set",
      'evidence_requirements=["fixture log","response capture"]',
      "--set",
      "expected_success_activity=Send one controlled request",
      "--set",
      "expected_discrimination_activity=Detect one unavailable fixture",
      "--link",
      `governed-by=${strategy.revisionId}`,
      "--link",
      `qualifies=${environment.revisionId}`,
    );
    const prohibited = [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ];
    const qualificationImplementation = create(
      "VAI",
      "--scenario",
      "realize-verification-environment@1",
      "--set",
      "title=API environment qualification procedure",
      "--set",
      "rationale=Only declared environment capabilities are exercised",
      "--set",
      "kind=qualification",
      "--set",
      `implementation_ref=procedure:sha256:${"d".repeat(64)}`,
      "--set",
      "independence_mode=environment-capability",
      "--set",
      `authoring_input_refs=${JSON.stringify([strategy.revisionId, environment.revisionId, qualificationActivity.revisionId])}`,
      "--set",
      `prohibited_inputs_observed=${JSON.stringify(prohibited)}`,
      "--set",
      'activity_bindings=["supported-success","unsupported-discrimination"]',
      "--set",
      'target_behavior={"supported":["controlled request"],"intentionally_unsupported":["ambient production credentials"]}',
      "--link",
      `realizes=${qualificationActivity.revisionId}`,
      "--link",
      `uses=${environment.revisionId}`,
      "--link",
      `targets=${environment.revisionId}`,
    );
    const qualificationWork = work(
      "phase-1-product-assurance",
      "verification-run-required",
      qualificationImplementation.revisionId,
    );
    expect(qualificationWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    await execute(
      "execute-verification-run@1",
      qualificationWork,
      runResponse(
        "RUN-1000000001",
        "RES-1000000001",
        "qualification",
        qualificationImplementation.revisionId,
        environment.revisionId,
        environment.revisionId,
        { kind: "qualification", scope: "environment-capability", outcome: "pass", formal_evidence_eligible: false },
      ),
      [
        `implementation=${qualificationImplementation.revisionId}`,
        `activity=${qualificationActivity.revisionId}`,
        `environment=${environment.revisionId}`,
        `execution_target=${environment.revisionId}`,
      ],
      "qualification",
    );
    const qualificationResult = "RES-1000000001-r00001";
    const environmentContext = freeze(
      baseline("Environment review context", "review-context", "review-context"),
      [strategy.revisionId, environment.revisionId],
      [
        qualificationActivity.revisionId,
        qualificationImplementation.revisionId,
        "RUN-1000000001-r00001",
        qualificationResult,
      ],
    );
    await review(environment.revisionId, environmentContext.revisionId);

    const target = create(
      "ART",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Controlled export target",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:0123456789abcdef0123456789abcdef01234567",
      "--set",
      'supported_behavior=["valid export request"]',
      "--set",
      'unsupported_behavior=["malformed export request"]',
    );
    const pilotActivity = create(
      "VER",
      "--scenario",
      "write-verification-activity@1",
      "--set",
      "title=Discriminate malformed export requests",
      "--set",
      "rationale=The pilot must expose valid and malformed behavior independently",
      "--set",
      "kind=pilot",
      "--set",
      "method=test",
      "--set",
      "assessment_mode=automatic",
      "--set",
      'claim={"kind":"pilot","scope":"verification-design","formal_evidence_eligible":false}',
      "--set",
      'acceptance_criteria=["valid request succeeds","malformed request is rejected"]',
      "--set",
      'evidence_requirements=["public request","public response"]',
      "--set",
      "expected_success_activity=Send a valid export request",
      "--set",
      "expected_discrimination_activity=Send a malformed export request",
      "--link",
      `governed-by=${strategy.revisionId}`,
      "--link",
      `verifies=${affected.id}`,
    );
    const pilotImplementation = create(
      "VAI",
      "--scenario",
      "implement-verification-activity@1",
      "--set",
      "title=Source-independent export pilot",
      "--set",
      "rationale=Only the public target boundary is exercised",
      "--set",
      "kind=pilot",
      "--set",
      "implementation_ref=git:fedcba9876543210fedcba9876543210fedcba98",
      "--set",
      "independence_mode=source-blind",
      "--set",
      `authoring_input_refs=${JSON.stringify([affected.revisionId, pilotActivity.revisionId, environment.revisionId, target.revisionId])}`,
      "--set",
      `prohibited_inputs_observed=${JSON.stringify(prohibited)}`,
      "--set",
      'activity_bindings=["supported-success","unsupported-discrimination"]',
      "--set",
      'target_behavior={"supported":["valid export request"],"intentionally_unsupported":["malformed export request"]}',
      "--link",
      `realizes=${pilotActivity.revisionId}`,
      "--link",
      `uses=${environment.revisionId}`,
      "--link",
      `targets=${target.revisionId}`,
    );
    const pilotContext = freeze(
      baseline("Pilot review context", "review-context", "review-context"),
      [pilotActivity.revisionId, pilotImplementation.revisionId],
      [strategy.revisionId, environment.revisionId, target.revisionId],
    );
    const pilotActivityReview = await review(
      pilotActivity.revisionId,
      pilotContext.revisionId,
    );
    await review(pilotImplementation.revisionId, pilotContext.revisionId);
    const unrelatedContext = freeze(
      baseline("Unrelated requirement context", "review-context", "review-context"),
      [unrelated.revisionId],
    );
    const unrelatedReview = await review(
      unrelated.revisionId,
      unrelatedContext.revisionId,
      unrelated.id,
    );

    const pilotWork = work(
      "phase-1-product-assurance",
      "verification-run-required",
      pilotImplementation.revisionId,
    );
    expect(pilotWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    await execute(
      "execute-verification-run@1",
      pilotWork,
      runResponse(
        "RUN-2000000001",
        "RES-2000000001",
        "pilot",
        pilotImplementation.revisionId,
        environment.revisionId,
        target.revisionId,
        { kind: "pilot", scope: "verification-design", outcome: "unsuitable", formal_evidence_eligible: false },
        [{ type: "verifies", target: affected.id }],
      ),
      [
        `implementation=${pilotImplementation.revisionId}`,
        `activity=${pilotActivity.revisionId}`,
        `environment=${environment.revisionId}`,
        `execution_target=${target.revisionId}`,
      ],
      "failing-pilot",
    );
    const failedRun = "RUN-2000000001-r00001";
    const failedResult = "RES-2000000001-r00001";
    const affectedContext = freeze(
      baseline("Affected requirement evidence context", "review-context", "review-context"),
      [affected.revisionId],
      [failedResult],
    );
    const affectedRequirementReview = await review(
      affected.revisionId,
      affectedContext.revisionId,
      affected.id,
    );
    const before = freeze(
      baseline("Before approved change", "group-candidate", "candidate"),
      [affected.revisionId, unrelated.revisionId],
      [failedResult, affectedRequirementReview.revisionId, unrelatedReview.revisionId],
    );

    const reportWork = work("phase-7-change-control", "problem-report-required", failedResult);
    expect(reportWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const reportExecution = await execute(
      "report-problem@1",
      reportWork,
      {
        outputs: [{
          name: "problem",
          invocation: 0,
          lifecycleDatum: {
            id: "PRB-0000000001",
            type: "PRB",
            payload: {
              title: "Malformed export request was accepted",
              rationale: "The negative pilot control exposed behavior contrary to the intended boundary",
              condition: "A malformed export request returned a successful response.",
              severity: "major",
              disposition: "open",
              evidence_refs: [failedRun, failedResult],
            },
            links: [{ type: "reports", target: failedResult }],
            body: "The exact pilot result preserves the observed unexpected condition.\n",
          },
        }],
        completionEvidence: { summary: "The pilot problem is reported exactly." },
      },
      [`result=${failedResult}`],
      "report-problem",
    );
    const problem = reportExecution.outputs[0].lifecycleDatum as { id: string; revisionId: string };

    const impactWork = work("phase-7-change-control", "change-impact-required", problem.revisionId);
    const impactLinks = [
      affected.revisionId,
      pilotContext.revisionId,
      affectedRequirementReview.revisionId,
      before.revisionId,
      pilotActivity.revisionId,
      pilotImplementation.revisionId,
      failedRun,
      failedResult,
    ];
    const impactExecution = await execute(
      "analyze-change-impact@1",
      impactWork,
      {
        outputs: [{
          name: "change",
          invocation: 0,
          lifecycleDatum: {
            id: "CHG-0000000001",
            type: "CHG",
            payload: {
              title: "Reject malformed export requests",
              rationale: "A bounded requirement correction preserves valid export behavior",
              scope: "One system export requirement and directly dependent evidence",
              planned_changes: ["Require malformed requests to be rejected observably"],
              impact: {
                requirements: [affected.revisionId],
                contexts: [pilotContext.revisionId],
                reviews: [affectedRequirementReview.revisionId],
                baselines: [before.revisionId],
                verification_evidence: [pilotActivity.revisionId, pilotImplementation.revisionId, failedRun, failedResult],
              },
              implementation_order: "requirements -> context -> reviews -> baselines -> verification",
              closure_criteria: ["replacement pilot accepts valid requests and rejects malformed requests"],
            },
            links: [
              { type: "derived-from", target: problem.revisionId },
              ...impactLinks.map((target_) => ({ type: "impacts", target: target_ })),
            ],
            body: "Impact is limited to exact traced lifecycle and evidence Revisions.\n",
          },
        }],
        completionEvidence: { summary: "Exact impact is bounded in original-V order." },
      },
      [`problem=${problem.revisionId}`],
      "analyze-impact",
    );
    const change = impactExecution.outputs[0].lifecycleDatum as { id: string; revisionId: string };
    const shownChange = req(repositoryRoot, "show", change.revisionId, "--json");
    const changeDatum = JSON.parse(shownChange.stdout).lifecycleDatum.datum;
    expect(changeDatum.payload.impact).toEqual({
      requirements: [affected.revisionId],
      contexts: [pilotContext.revisionId],
      reviews: [affectedRequirementReview.revisionId],
      baselines: [before.revisionId],
      verification_evidence: [pilotActivity.revisionId, pilotImplementation.revisionId, failedRun, failedResult],
    });
    const persistedImpactLinks = changeDatum.links
      .filter((link: { type: string }) => link.type === "impacts")
      .map((link: { target: string }) => link.target);
    expect(persistedImpactLinks).toHaveLength(impactLinks.length);
    expect(persistedImpactLinks).toEqual(expect.arrayContaining(impactLinks));

    const changeContext = freeze(
      baseline("Change impact review context", "review-context", "review-context"),
      [change.revisionId, problem.revisionId],
      [failedResult],
    );
    await review(change.revisionId, changeContext.revisionId);
    const approvalWork = work("phase-7-change-control", "change-approval-required", change.revisionId);
    expect(approvalWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const approvalExecution = await execute(
      "approve-change-request@2",
      approvalWork,
      {
        outputs: [{
          name: "approval",
          invocation: 0,
          lifecycleDatum: {
            id: "DEC-3000000001",
            type: "DEC",
            payload: {
              title: "Approve bounded export correction",
              rationale: "The reviewed impact excludes the unrelated title behavior",
              kind: "change-approval",
              decision: "Approve the exact bounded Change Request.",
              alternatives: ["Accept malformed requests", "Rebuild unrelated export behavior"],
              effective_scope: change.revisionId,
            },
            links: [{ type: "justifies", target: change.revisionId }],
            body: "Approval applies only to the exact reviewed Change Request.\n",
          },
        }],
        completionEvidence: { summary: "The exact Change Request is approved." },
      },
      [`change=${change.revisionId}`],
      "approve-change",
    );
    const approval = approvalExecution.outputs[0].lifecycleDatum as { revisionId: string };
    const approvalContext = freeze(
      baseline("Change approval review context", "review-context", "review-context"),
      [approval.revisionId],
    );
    await review(approval.revisionId, approvalContext.revisionId);

    const revisionWork = work("phase-7-change-control", "change-revision-required", change.revisionId);
    expect(revisionWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const revisionExecution = await execute(
      "revise-requirement-under-change@1",
      revisionWork,
      {
        outputs: [{
          name: "revised_requirement",
          invocation: 0,
          lifecycleDatum: {
            id: affected.id,
            type: "SYS",
            payload: {
              title: "Validate export requests",
              rationale: "The public boundary must reject malformed requests without changing valid exports",
              statement: "The system shall accept valid export requests and reject malformed export requests observably.",
              verification_intent: "Observe one valid success and one malformed rejection.",
            },
            links: [
              { type: "derived-from", target: stakeholder.id },
              { type: "changed-under", target: change.revisionId },
            ],
            body: "The approved correction changes only malformed-request handling.\n",
          },
        }],
        completionEvidence: { summary: "The affected requirement was revised first." },
      },
      [
        `change=${change.revisionId}`,
        `requirement=${affected.revisionId}`,
        `approval=${approval.revisionId}`,
      ],
      "revise-requirement",
    );
    const revisedRequirement = revisionExecution.outputs[0].lifecycleDatum as { id: string; revisionId: string };
    expect(revisedRequirement.id).toBe(affected.id);
    expect(revisedRequirement.revisionId).toBe(`${affected.id}-r00002`);

    const replacementContext = freeze(
      baseline("Replacement requirement context", "review-context", "review-context"),
      [revisedRequirement.revisionId, unrelated.revisionId],
      [approval.revisionId],
      change.revisionId,
    );
    const replacementReview = await review(
      revisedRequirement.revisionId,
      replacementContext.revisionId,
      affected.id,
      change.revisionId,
    );
    const after = freeze(
      baseline("After approved change", "group-candidate", "candidate"),
      [revisedRequirement.revisionId, unrelated.revisionId],
      [failedResult, affectedRequirementReview.revisionId, unrelatedReview.revisionId, replacementReview.revisionId],
      change.revisionId,
    );

    const replacementImplementation = create(
      "VAI",
      "--scenario",
      "implement-verification-activity@1",
      "--set",
      "title=Replacement source-independent export pilot",
      "--set",
      "rationale=The same public activity is rerun against the corrected exact requirement",
      "--set",
      "kind=pilot",
      "--set",
      "implementation_ref=git:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--set",
      "independence_mode=source-blind",
      "--set",
      `authoring_input_refs=${JSON.stringify([revisedRequirement.revisionId, pilotActivity.revisionId, environment.revisionId, target.revisionId, change.revisionId])}`,
      "--set",
      `prohibited_inputs_observed=${JSON.stringify(prohibited)}`,
      "--set",
      'activity_bindings=["supported-success","unsupported-discrimination"]',
      "--set",
      'target_behavior={"supported":["valid export request"],"intentionally_unsupported":["malformed export request"]}',
      "--link",
      `realizes=${pilotActivity.revisionId}`,
      "--link",
      `uses=${environment.revisionId}`,
      "--link",
      `targets=${target.revisionId}`,
    );
    const replacementPilotContext = freeze(
      baseline("Replacement pilot review context", "review-context", "review-context"),
      [pilotActivity.revisionId, replacementImplementation.revisionId],
      [revisedRequirement.revisionId, environment.revisionId, target.revisionId],
      change.revisionId,
    );
    const replacementImplementationReview = await review(
      replacementImplementation.revisionId,
      replacementPilotContext.revisionId,
      undefined,
      change.revisionId,
    );
    const replacementRunWork = work(
      "phase-1-product-assurance",
      "verification-run-required",
      replacementImplementation.revisionId,
    );
    expect(replacementRunWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    await execute(
      "execute-verification-run@1",
      replacementRunWork,
      runResponse(
        "RUN-4000000001",
        "RES-4000000001",
        "pilot",
        replacementImplementation.revisionId,
        environment.revisionId,
        target.revisionId,
        { kind: "pilot", scope: "verification-design", outcome: "suitable", formal_evidence_eligible: false },
        [
          { type: "verifies", target: affected.id },
          { type: "changed-under", target: change.revisionId },
        ],
      ),
      [
        `implementation=${replacementImplementation.revisionId}`,
        `activity=${pilotActivity.revisionId}`,
        `environment=${environment.revisionId}`,
        `execution_target=${target.revisionId}`,
      ],
      "replacement-pilot",
    );
    const replacementResult = "RES-4000000001-r00001";

    const compared = req(
      repositoryRoot,
      "baseline",
      "diff",
      before.revisionId,
      after.revisionId,
      "--json",
    );
    expect(compared.status, `${compared.stderr}${compared.stdout}`).toBe(0);
    const diff = JSON.parse(compared.stdout).baselineDiff;
    expect(diff.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectRevision: failedResult,
        states: expect.objectContaining({ validity: "stale" }),
        changes: expect.arrayContaining([
          expect.objectContaining({
            kind: "stable-link-resolution-change",
            stable_target: affected.id,
            before_target_revision: affected.revisionId,
            after_target_revision: revisedRequirement.revisionId,
          }),
        ]),
      }),
      expect.objectContaining({
        subjectRevision: affectedRequirementReview.revisionId,
        states: expect.objectContaining({ validity: "stale" }),
      }),
    ]));
    const changedSubjects = diff.subjects.map((subject: { subjectRevision: string }) => subject.subjectRevision);
    expect(changedSubjects).not.toContain(unrelated.revisionId);
    expect(changedSubjects).not.toContain(unrelatedReview.revisionId);

    const closureWork = work("phase-7-change-control", "change-closure-required", change.revisionId);
    expect(closureWork).toEqual(expect.objectContaining({ status: "ready", dispatchable: true }));
    const closureId = "DEC-5000000001";
    const closureEvidence = [
      replacementContext.revisionId,
      replacementReview.revisionId,
      after.revisionId,
      replacementPilotContext.revisionId,
      replacementImplementationReview.revisionId,
      replacementResult,
    ];
    const closureExecution = await execute(
      "close-change-request@2",
      closureWork,
      {
        outputs: [
          {
            name: "closure",
            invocation: 0,
            lifecycleDatum: {
              id: closureId,
              type: "DEC",
              payload: {
                title: "Close bounded export correction",
                rationale: "Exact replacement lifecycle and independent pilot evidence satisfy closure criteria",
                kind: "change-closure",
                decision: "Close the exact Change Request and originating Problem Report.",
                alternatives: ["Leave the approved change open"],
                effective_scope: change.revisionId,
              },
              links: [
                { type: "justifies", target: change.revisionId },
                { type: "confirms-revision", target: revisedRequirement.revisionId },
                ...closureEvidence.map((target_) => ({ type: "closes-with", target: target_ })),
              ],
              body: "Closure cites exact approval, replacement definition, review, baseline, and verification evidence.\n",
            },
          },
          {
            name: "closed_problem",
            invocation: 0,
            lifecycleDatum: {
              id: problem.id,
              type: "PRB",
              payload: {
                title: "Malformed export request was accepted",
                rationale: "The bounded approved correction now has passing replacement evidence",
                condition: "A malformed export request returned a successful response.",
                severity: "major",
                disposition: "closed",
                evidence_refs: [failedRun, failedResult, replacementResult],
                closure_summary: "The revised requirement and replacement pilot reject malformed requests observably.",
              },
              links: [
                { type: "reports", target: failedResult },
                { type: "resolved-by", target: `${closureId}-r00001` },
              ],
              body: "The historical condition is closed by exact replacement evidence.\n",
            },
          },
        ],
        completionEvidence: { summary: "The exact CHG and PRB are closed atomically." },
      },
      [
        `change=${change.revisionId}`,
        `problem=${problem.revisionId}`,
        `approval=${approval.revisionId}`,
        `source_evidence=${failedResult}`,
        `revised_requirements=${revisedRequirement.revisionId}`,
        `closure_evidence=${closureEvidence.join(",")}`,
      ],
      "close-change",
    );
    expect(closureExecution.outputs.map((output: any) => output.lifecycleDatum.revisionId)).toEqual([
      `${closureId}-r00001`,
      `${problem.id}-r00002`,
    ]);
    const shownProblem = req(repositoryRoot, "show", `${problem.id}-r00002`, "--json");
    expect(JSON.parse(shownProblem.stdout).projections.states["change-status"]).toBe("closed");
    const shownClosedChange = req(repositoryRoot, "show", change.revisionId, "--json");
    expect(JSON.parse(shownClosedChange.stdout).projections.states["change-status"]).toBe("closed");
    expect(looseEnds("phase-7-change-control").find((item) =>
      item.obligation === "change-closure-required" && item.subject === change.revisionId
    )).toBeUndefined();

    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
  }, 210_000);
});
