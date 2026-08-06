import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

describe("req Phase 0–2 pilot assessment", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-assessment-"));
    const initialized = req(repositoryRoot, "init", "--process", examplePackage, "--json");
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("supplies package-owned pilot measurement, review, and expansion-decision contracts", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toContain("PAS@1");
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "record-pilot-observation@1",
      "prepare-pilot-assessment-context@1",
      "assess-phase-0-2-pilot@1",
      "decide-pilot-expansion@2",
    ]));
    expect(catalogs.obligations).toEqual(expect.arrayContaining([
      "pilot-assessment-required@1",
      "pilot-expansion-decision-required@1",
    ]));
    expect(catalogs.phases).toContain("phase-2-pilot-assessment@1");
    expect(catalogs.phases).not.toEqual(expect.arrayContaining([
      "phase-3-component-definition@1",
      "phase-4-design-definition@1",
      "phase-5-implementation@1",
      "phase-6-verification@1",
    ]));
  });

  it("reviews durable measurements and records change before deferred expansion", async () => {
    let adapterSequence = 0;
    const observedAgentEffort = {
      tracerIssues: 4,
      implementationCommitRefs: [
        "git:368abb8fc723fa95fc333a261971514e258d39d6",
        "git:3712a5a0a9216ace54d8df4eed5623e746752439",
        "git:3b8e9e1194cb42df5fe55ecccfe66b2b5391730a",
        "git:ca5696a1b24303164c3a16b992ddc17cbeb6f699",
        "git:ca6f3ff34317e22e637c158442d5103df908dcac",
        "git:2532e1db87ef2b795d38189cdf9ed02d7b147ca3",
        "git:24b603e609ac2587bf2c26d8abb0152a80f2207f",
        "git:52ed299ed35af40a805208fc5725e084ae61977e",
        "git:cce892a6ebd73a02b748665e864f9afc31f67f8b",
        "git:59784df7d1b593fb02392644f98868b4b70f44eb",
        "git:b4f98de7eee2d027cb9c34ebbd39aea63e898456",
        "git:2dc4ef743ba703a820e113ac3e6f9aeb7c892fe6",
        "git:cab9f166226a99cde9287d93ca93824c5ea03c57",
      ],
    };
    const run = (...arguments_: string[]) => req(repositoryRoot, ...arguments_);
    const create = (...arguments_: string[]) => {
      const result = run("new", ...arguments_, "--json");
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
    const looseEnds = () => {
      const result = run("loose-ends", "--phase", "phase-2-pilot-assessment", "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items as Array<Record<string, any>>;
    };
    const work = (obligation: string, subject: string) => {
      const item = looseEnds().find((candidate) =>
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
      const authority = scenario === "review-datum-in-context@2"
        ? "independent-reviewer"
        : scenario === "decide-pilot-expansion@2"
          ? "stakeholder"
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
      const result = run(...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).execution as Record<string, any>;
    };
    const baseline = (title: string, kind: string) => {
      const result = run(
        "baseline",
        "create",
        "--type",
        "BSL",
        "--scenario",
        kind === "review-context"
          ? "create-review-context@1"
          : "prepare-pilot-assessment-context@1",
        "--set",
        `title=${title}`,
        "--set",
        `kind=${kind}`,
        "--set",
        "role=review-context",
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
        const added = run("baseline", "add", subject.id, member, "--json");
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      for (const item of evidence) {
        const added = run("baseline", "evidence", "add", subject.id, item, "--json");
        expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      }
      const frozen = run("baseline", "freeze", subject.id, "--json");
      expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
      return subject;
    };

    const observations = [
      ["Review burden observation", "28 Reviews in 19 exact contexts were executed; no Review finding improvement was measured"],
      ["Agent effort observation", "Four agent tracer issues produced 13 exact Git commits from Phase 0 through localized change"],
      ["Reuse observation", "One unaffected Review remained reusable while two affected evidence claims became Stale with exact explanations"],
      ["Queue and gate observation", "Exact blockers were useful; review-context and gate ceremony were high for the slice"],
      ["Discrimination and scope observation", "Supported and unsupported behavior discriminated; zero of three challenged definition items were removed"],
    ].map(([title, decision], index) => create(
      "DEC",
      "--scenario",
      "record-pilot-observation@1",
      "--id",
      `DEC-800000000${index + 1}`,
      "--set",
      `title=${title}`,
      "--set",
      `rationale=Durable pilot observation ${index + 1}`,
      "--set",
      "kind=decision",
      "--set",
      `decision=${decision}`,
      "--set",
      "alternatives=[]",
      "--set",
      "effective_scope=Phase 0–2 pilot",
    ));

    const assessmentContext = freeze(
      baseline("Phase 0–2 pilot measurement context", "pilot-assessment-context"),
      [],
      observations.map((observation) => observation.revisionId),
    );
    const assessmentWork = work("pilot-assessment-required", assessmentContext.revisionId);
    expect(assessmentWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "assess-phase-0-2-pilot@1",
    }));

    const directAssessment = run(
      "new",
      "PAS",
      "--scenario",
      "assess-phase-0-2-pilot@1",
      "--set",
      "title=Bypass",
      "--json",
    );
    expect(directAssessment.status).toBe(1);
    expect(JSON.parse(directAssessment.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "generated-datum-requires-scenario-execution" }),
    ]));

    const assessmentExecution = await execute(
      "assess-phase-0-2-pilot@1",
      assessmentWork,
      {
        outputs: [{
          name: "assessment",
          invocation: 0,
          lifecycleDatum: {
            id: "PAS-0000000001",
            type: "PAS",
            payload: {
              title: "Phase 0–2 pilot assessment",
              rationale: "The exact pilot evidence supports a bounded change recommendation before lifecycle expansion",
              pilot_scope: "phase-0-through-2",
              measurements: {
                review: {
                  contexts: 19,
                  completed_reviews: 28,
                  findings: 0,
                  quality_improved: false,
                  volume_assessment: "high",
                },
                agent_effort: {
                  tracer_issues: observedAgentEffort.tracerIssues,
                  implementation_commits: observedAgentEffort.implementationCommitRefs.length,
                  implementation_commit_refs: observedAgentEffort.implementationCommitRefs,
                  effort_assessment: "high",
                },
                evidence_reuse: {
                  eligible: 3,
                  reused: 1,
                  stale: 2,
                  explanation_checks: 2,
                  explanations_correct: true,
                },
                loose_ends: {
                  sampled: 18,
                  actionable: 11,
                  useful: true,
                  assessment: "Exact blockers and actionable resolvers made the queue useful.",
                },
                gate_ceremony: {
                  gates: 3,
                  signoffs: 3,
                  decision_reviews: 3,
                  proportionate: false,
                },
                environment_profiles: {
                  profiles_assessed: 2,
                  sufficient: true,
                },
                verification_discrimination: {
                  supported_successes: 1,
                  unsupported_rejections: 1,
                  discriminates: true,
                },
                scope_reduction: {
                  proposed_items: 3,
                  removed_items: 0,
                  retained_items: 3,
                  demonstrated: false,
                },
              },
              recommendation: "change",
              limitations: [
                "Reduce review-context and gate ceremony before Phases 3–6.",
                "Require the next decomposition pilot to remove at least one challenged scope item.",
              ],
            },
            links: [{ type: "measures", target: assessmentContext.revisionId }],
            body: "The pilot validates immutable evidence, selective reuse, discrimination, and Loose End routing, but not scope removal or proportionate ceremony.\n",
          },
        }],
        completionEvidence: { summary: "Measured the exact Phase 0–2 pilot context." },
      },
      [`context=${assessmentContext.revisionId}`],
      "assess-pilot",
    );
    const assessment = assessmentExecution.outputs[0].lifecycleDatum as {
      id: string;
      revisionId: string;
    };

    const shownAssessment = run("show", assessment.revisionId, "--json");
    expect(shownAssessment.status, shownAssessment.stderr).toBe(0);
    const assessmentDatum = JSON.parse(shownAssessment.stdout).lifecycleDatum.datum;
    expect(assessmentDatum.payload.measurements).toMatchObject({
      review: { contexts: 19, completed_reviews: 28, quality_improved: false },
      agent_effort: {
        tracer_issues: observedAgentEffort.tracerIssues,
        implementation_commits: observedAgentEffort.implementationCommitRefs.length,
        implementation_commit_refs: observedAgentEffort.implementationCommitRefs,
      },
      evidence_reuse: { reused: 1, stale: 2, explanations_correct: true },
      loose_ends: { useful: true },
      gate_ceremony: { proportionate: false },
      verification_discrimination: { discriminates: true },
      scope_reduction: { removed_items: 0, demonstrated: false },
    });
    expect(assessmentDatum.links).toContainEqual({
      type: "measures",
      target: assessmentContext.revisionId,
    });

    const decisionBeforeReview = work("pilot-expansion-decision-required", assessment.revisionId);
    expect(decisionBeforeReview).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: false,
      blockedBy: expect.arrayContaining([
        expect.stringContaining("passing-review-required@2"),
      ]),
    }));

    const reviewContext = freeze(
      baseline("Pilot assessment independent review context", "review-context"),
      [assessment.revisionId],
      observations.map((observation) => observation.revisionId),
    );
    const reviewWork = work("passing-review-required", assessment.revisionId);
    const reviewExecution = await execute(
      "review-datum-in-context@2",
      reviewWork,
      {
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            id: "REV-8000000001",
            type: "REV",
            payload: {
              title: "Independent Review of Phase 0–2 pilot measurements",
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: assessment.revisionId },
              { type: "contextualizes", target: reviewContext.revisionId },
            ],
            body: "Counts, reuse conclusions, Staleness explanations, discrimination, and absent scope reduction match the exact evidence context.\n",
          },
        }],
        completionEvidence: { summary: "Pilot measurements independently reviewed." },
      },
      [
        `subject=${assessment.revisionId}`,
        `review_context=${reviewContext.revisionId}`,
      ],
      "review-assessment",
    );
    const assessmentReview = reviewExecution.outputs[0].lifecycleDatum as { revisionId: string };

    const decisionWork = work("pilot-expansion-decision-required", assessment.revisionId);
    expect(decisionWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "decide-pilot-expansion@2",
    }));
    const decisionExecution = await execute(
      "decide-pilot-expansion@2",
      decisionWork,
      {
        outputs: [{
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            id: "DEC-9000000001",
            type: "DEC",
            payload: {
              title: "Change before expanding beyond Phase 2",
              rationale: "Evidence reuse and verification worked, but ceremony was high and no challenged scope was removed",
              kind: "pilot-expansion",
              decision: "change",
              alternatives: ["proceed", "stop"],
              effective_scope: "Phase 3–6 Example Process Package expansion",
            },
            links: [
              { type: "justifies", target: assessment.revisionId },
              { type: "relies-on-review", target: assessmentReview.revisionId },
            ],
            body: "Do not begin Phases 3–6 until review ceremony is reduced and scope removal is demonstrated.\n",
          },
        }],
        completionEvidence: { summary: "Recorded the reviewed pilot expansion decision." },
      },
      [
        `assessment=${assessment.revisionId}`,
        `assessment_review=${assessmentReview.revisionId}`,
      ],
      "decide-expansion",
    );
    const decision = decisionExecution.outputs[0].lifecycleDatum as { revisionId: string };
    const shownDecision = run("show", decision.revisionId, "--json");
    expect(shownDecision.status, shownDecision.stderr).toBe(0);
    expect(JSON.parse(shownDecision.stdout).lifecycleDatum.datum).toMatchObject({
      payload: {
        kind: "pilot-expansion",
        decision: "change",
        effective_scope: "Phase 3–6 Example Process Package expansion",
      },
      links: [
        { type: "justifies", target: assessment.revisionId },
        { type: "relies-on-review", target: assessmentReview.revisionId },
      ],
    });
    const recordedDecisionWork = work(
      "pilot-expansion-decision-required",
      assessment.revisionId,
    );
    expect(recordedDecisionWork).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "create-review-context@1",
    }));
    const decisionContext = freeze(
      baseline("Pilot expansion Decision review context", "review-context"),
      [decision.revisionId],
    );
    const decisionReviewWork = work("passing-review-required", decision.revisionId);
    await execute(
      "review-datum-in-context@2",
      decisionReviewWork,
      {
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            id: "REV-9000000002",
            type: "REV",
            payload: {
              title: "Independent pilot expansion Decision review",
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: decision.revisionId },
              { type: "contextualizes", target: decisionContext.revisionId },
            ],
            body: "The exact expansion Decision passes independent Review.\n",
          },
        }],
        completionEvidence: { summary: "Independent Decision review passed." },
      },
      [
        `subject=${decision.revisionId}`,
        `review_context=${decisionContext.revisionId}`,
      ],
      "review-expansion-decision",
    );
    expect(looseEnds().find((item) =>
      item.obligation === "pilot-expansion-decision-required" &&
      item.subject === assessment.revisionId
    )).toBeUndefined();

    const doctor = run("doctor", "--json");
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
  }, 90_000);
});
