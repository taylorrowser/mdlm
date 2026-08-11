import { spawnSync } from "node:child_process";
import { promises as fs, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { req } from "./helpers/req.js";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const bundledPackage = path.join(projectRoot, ".lifecycle/process");

type DatumRef = { id: string; revisionId: string };
type Packet = {
  assignment: { id: string };
  scenario: { reference: string };
  prompt: { skills: Array<{ reference: string }> };
  participation: Array<{
    authorityRequirement: { mode: string; authority: string; delegationAllowed: boolean };
  }>;
  exactInputs: Array<{
    inputs: Array<{ name: string; values: Array<Record<string, any>> }>;
  }>;
};
type ProposalOutput = {
  localId: string;
  name: string;
  invocation: number;
  lifecycleDatum: {
    id?: string;
    type: string;
    payload: Record<string, unknown>;
    links: Array<{ type: string; target: string }>;
    body: string;
  };
};

const evidenceContextId = "BSL-0P7K0TCX00";
const assessmentId = "PAS-0PA55A5500";
const assessmentRevision = (revision: number) =>
  `${assessmentId}-r${String(revision).padStart(5, "0")}`;
const evidenceContextRevision = `${evidenceContextId}-r00001`;

const measurements = {
  review: {
    contexts: 4,
    completed_reviews: 4,
    findings: 1,
    quality_improved: true,
    volume_assessment: "acceptable",
  },
  agent_effort: {
    tracer_issues: 1,
    implementation_commits: 1,
    implementation_commit_refs: [`git:${"a".repeat(40)}`],
    effort_assessment: "acceptable",
  },
  evidence_reuse: {
    eligible: 3,
    reused: 2,
    stale: 1,
    explanation_checks: 1,
    explanations_correct: true,
  },
  loose_ends: {
    sampled: 3,
    actionable: 3,
    useful: true,
    assessment: "Every sampled Loose End named exact work.",
  },
  gate_ceremony: {
    gates: 2,
    signoffs: 2,
    decision_reviews: 2,
    proportionate: true,
  },
  environment_profiles: { profiles_assessed: 1, sufficient: true },
  verification_discrimination: {
    supported_successes: 1,
    unsupported_rejections: 1,
    discriminates: true,
  },
  scope_reduction: {
    proposed_items: 2,
    removed_items: 1,
    retained_items: 1,
    demonstrated: true,
  },
};

function mdlm(repository: string, arguments_: string[], input?: string) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

function output(
  localId: string,
  name: string,
  type: string,
  payload: Record<string, unknown>,
  links: Array<{ type: string; target: string }> = [],
  id?: string,
): ProposalOutput {
  return {
    localId,
    name,
    invocation: 0,
    lifecycleDatum: {
      ...(id ? { id } : {}),
      type,
      payload,
      links,
      body: `Exact ${type} pilot-assessment fixture.\n`,
    },
  };
}

async function focusedPilotPackage(parent: string): Promise<string> {
  const packageRoot = path.join(parent, "process");
  await fs.cp(bundledPackage, packageRoot, { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, "scenarios/seed-pilot-assessment.yaml"),
    `kind: scenario-definition
id: seed-pilot-assessment
version: 1
description: Test-only publication of one exact frozen pilot boundary and PAS.
initiation: explicit
phases: [phase-2-pilot-assessment]
inputs: []
outputs:
  - {name: data, types: [BSL, PAS], cardinality: one-or-more, required_links: []}
prompt_ref: prompts/seed-pilot-assessment.md@1
review_policy_ref: review-applicability@1
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: coherent-batch
`,
  );
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-pilot-assessment.md"),
    "---\nid: seed-pilot-assessment\nversion: 1\nscenario: seed-pilot-assessment\n---\n\n# Seed exact pilot assessment\n",
  );

  const manifestPath = path.join(packageRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push("seed-pilot-assessment");
  manifest.assets.prompts.push("prompts/seed-pilot-assessment.md@1");
  await fs.writeFile(manifestPath, stringify(manifest));

  const retained = new Set([
    "review-context-required",
    "passing-review-required",
    "pilot-assessment-review-correction-required",
    "pilot-expansion-decision-required",
    "pilot-expansion-decision-review-correction-required",
  ]);
  const obligationsRoot = path.join(packageRoot, "obligations");
  for (const file of await fs.readdir(obligationsRoot)) {
    if (!file.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, file);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (retained.has(obligation.id)) continue;
    obligation.phases = obligation.phases.filter(
      (phase: string) => phase !== "phase-2-pilot-assessment",
    );
    if (obligation.phases.length === 0) obligation.phases = ["phase-0-wayfinding"];
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const phasePath = path.join(packageRoot, "phases/phase-2-pilot-assessment.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.scenarios.push("seed-pilot-assessment@1");
  phase.obligations = phase.obligations.filter((reference: string) =>
    retained.has(reference.replace(/@[1-9][0-9]*$/, ""))
  );
  await fs.writeFile(phasePath, stringify(phase));
  const phase0Path = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase0 = parse(await fs.readFile(phase0Path, "utf8"));
  phase0.order = 8;
  await fs.writeFile(phase0Path, stringify(phase0));
  return packageRoot;
}

describe("mdlm hardened pilot assessment", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-hardening-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const initialized = req(
      repository,
      "--json",
      "init",
      "--process",
      await focusedPilotPackage(parent),
    );
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  function writeAdapter(name: string, response: Record<string, unknown>): string {
    const adapter = path.join(parent, `${name}.mjs`);
    writeFileSync(
      adapter,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    return adapter;
  }

  function seedAssessment(recommendation: "proceed" | "change" | "stop") {
    const adapter = writeAdapter("seed-assessment", {
      outputs: [
        {
          name: "data",
          invocation: 0,
          lifecycleDatum: {
            id: evidenceContextId,
            type: "BSL",
            payload: {
              title: "Exact frozen pilot evidence boundary",
              kind: "pilot-assessment-context",
              role: "review-context",
              scope: "Phase 0–2 pilot evidence boundary",
              group: "DEFAULT",
              definition_members: [],
              evidence: [],
            },
            links: [],
            body: "Frozen exact evidence boundary.\n",
          },
        },
        {
          name: "data",
          invocation: 0,
          lifecycleDatum: {
            id: assessmentId,
            type: "PAS",
            payload: assessmentPayload(recommendation, "Initial exact assessment."),
            links: [{ type: "measures", target: evidenceContextRevision }],
            body: "Exact reviewed pilot measurements.\n",
          },
        },
      ],
      completionEvidence: { summary: "Seeded one exact PAS boundary." },
    });
    const seeded = req(
      repository,
      "scenario",
      "execute",
      "seed-pilot-assessment@1",
      "--initiate",
      "--adapter",
      adapter,
      "--json",
    );
    expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
  }

  function initializeFixture(recommendation: "proceed" | "change" | "stop") {
    seedAssessment(recommendation);
    expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status)
      .toBe(0);
    commit("Initialize exact pilot-assessment fixture");
  }

  function assessmentPayload(
    recommendation: "proceed" | "change" | "stop",
    rationale: string,
  ) {
    return {
      title: "Exact Phase 0–2 pilot assessment",
      rationale,
      pilot_scope: "phase-0-through-2",
      measurements,
      recommendation,
      limitations: recommendation === "proceed" ? [] : ["Retain the exact reviewed bound."],
    };
  }

  function commit(message: string) {
    expect(git(repository, "add", "--all").status).toBe(0);
    const committed = git(
      repository,
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "--no-verify",
      "--message",
      message,
    );
    expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
  }

  function nextOutcome(): Record<string, any> {
    const result = mdlm(repository, ["next"]);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout);
  }

  function prepare(outcome: Record<string, any>): Packet {
    const result = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout);
  }

  function submit(
    packet: Packet,
    outputs: ProposalOutput[],
    authoritySupplies: string[] = [],
  ): { outputs: Array<{ lifecycleDatum: DatumRef }> } {
    const result = mdlm(repository, ["scenario", "submit"], `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment: packet.assignment.id,
      kind: "proposal",
      proposal: {
        outputs,
        completionEvidence: { summary: "Completed exact pilot-assessment work." },
        loadedSkillRefs: packet.prompt.skills.map((skill) => skill.reference),
        authoritySupplies,
        standingDelegations: [],
      },
    })}\n`);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const execution = JSON.parse(result.stdout).execution;
    commit(`Publish ${packet.scenario.reference}`);
    return execution;
  }

  function inputValues(packet: Packet, name: string): Array<Record<string, any>> {
    return packet.exactInputs[0]!.inputs.find((input) => input.name === name)!.values;
  }

  function publishReview(subject: DatumRef, outcome: "pass" | "fail"): DatumRef {
    let next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    let packet = prepare(next);
    expect(packet.scenario.reference).toBe("create-review-context@2");
    const context = submit(packet, [output(
      `context-${subject.revisionId}`,
      "context",
      "BSL",
      {
        title: `Review Context for ${subject.revisionId}`,
        kind: "review-context",
        role: "review-context",
        scope: subject.revisionId,
        group: "DEFAULT",
        definition_members: [subject.revisionId],
        evidence: [],
      },
    )]).outputs[0]!.lifecycleDatum;

    next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("review-datum-in-context@3");
    return submit(packet, [output(
      `review-${subject.revisionId}`,
      "review",
      "REV",
      {
        title: `${outcome === "pass" ? "Passing" : "Failed"} independent Review`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: outcome === "fail" ? [{
          id: "F-100",
          target: subject.revisionId,
          relationship: "primary",
          severity: "blocking",
          summary: "The exact recommendation needs correction.",
        }] : [],
        outcome,
      },
      [
        { type: "reviews", target: subject.revisionId },
        { type: "contextualizes", target: context.revisionId },
      ],
    )], ["independent-reviewer"]).outputs[0]!.lifecycleDatum;
  }

  function submitAssessmentCorrection(packet: Packet, revision: number): DatumRef {
    const failedReviews = inputValues(packet, "failed_reviews")
      .map((value) => value.identity.revision_id as string);
    const context = inputValues(packet, "context")[0]!.identity.revision_id as string;
    expect(context).toBe(evidenceContextRevision);
    return submit(packet, [output(
      `assessment-${revision}`,
      "replacement",
      "PAS",
      assessmentPayload("change", `Corrected exact assessment cycle ${revision - 1}.`),
      [
        { type: "measures", target: context },
        ...failedReviews.map((target) => ({ type: "corrects-review", target })),
      ],
      assessmentId,
    )]).outputs[0]!.lifecycleDatum;
  }

  function publishExpansionDecision(
    assessment: DatumRef,
    recommendation: "proceed" | "change" | "stop",
  ): DatumRef {
    const review = publishReview(assessment, "pass");
    const next = nextOutcome();
    expect(next.outcome).toBe("attention-required");
    const packet = prepare(next);
    expect(packet.scenario.reference).toBe("decide-pilot-expansion@2");
    expect(next.authorityRequirement).toMatchObject({
      mode: "attended",
      authority: "stakeholder",
      delegationAllowed: false,
    });
    return submit(packet, [output(
      `decision-${recommendation}`,
      "decision",
      "DEC",
      {
        title: `${recommendation} after exact pilot assessment`,
        rationale: "Adopt the exact independently reviewed recommendation.",
        kind: "pilot-expansion",
        decision: recommendation,
        alternatives: ["proceed", "change", "stop"].filter((item) => item !== recommendation),
        effective_scope: "Phase 3–6 Example Process Package expansion",
      },
      [
        { type: "justifies", target: assessment.revisionId },
        { type: "relies-on-review", target: review.revisionId },
      ],
    )], ["stakeholder"]).outputs[0]!.lifecycleDatum;
  }

  it("keeps two PAS correction cycles autonomous, then escalates the unchanged exact context", () => {
    initializeFixture("change");
    const initial: DatumRef = { id: assessmentId, revisionId: assessmentRevision(1) };
    publishReview(initial, "fail");

    let next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    let packet = prepare(next);
    expect(packet.scenario.reference).toBe("revise-pilot-assessment-after-review@2");
    expect(packet.participation[0]!.authorityRequirement.mode).toBe("autonomous");
    const first = submitAssessmentCorrection(packet, 2);
    publishReview(first, "fail");

    next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("revise-pilot-assessment-after-review@2");
    expect(packet.participation[0]!.authorityRequirement.mode).toBe("autonomous");
    const second = submitAssessmentCorrection(packet, 3);
    publishReview(second, "fail");

    next = nextOutcome();
    expect(next.outcome).toBe("attention-required");
    expect(next.authorityRequirement).toMatchObject({
      mode: "attended",
      authority: "stakeholder",
      delegationAllowed: false,
    });
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("revise-pilot-assessment-after-review@2");
    expect(inputValues(packet, "assessment")[0]!.identity.revision_id)
      .toBe(assessmentRevision(3));
    expect(inputValues(packet, "context")[0]!.identity.revision_id)
      .toBe(evidenceContextRevision);
  }, 120_000);

  it.each([
    ["proceed", "profile-boundary-reached", "phase-2-pilot-assessment@3"],
    ["change", "profile-boundary-reached", "phase-7-change-control@3"],
    ["stop", "lifecycle-complete", "phase-2-pilot-assessment@3"],
  ] as const)(
    "maps a reviewed %s Decision to %s without fabricating later phases",
    (recommendation, expectedOutcome, expectedPhase) => {
      initializeFixture(recommendation);
      const assessment = { id: assessmentId, revisionId: assessmentRevision(1) };
      const decision = publishExpansionDecision(assessment, recommendation);
      publishReview(decision, "pass");
      const terminal = nextOutcome();
      expect(terminal.outcome).toBe(expectedOutcome);
      expect(terminal.phase).toBe(expectedPhase);
    },
    90_000,
  );

  it("corrects a failed Expansion Decision Review before the result becomes applicable", () => {
    initializeFixture("change");
    const assessment = { id: assessmentId, revisionId: assessmentRevision(1) };
    const decision = publishExpansionDecision(assessment, "change");
    const failedReview = publishReview(decision, "fail");

    let next = nextOutcome();
    expect(next.outcome).toBe("attention-required");
    let packet = prepare(next);
    expect(packet.scenario.reference).toBe("revise-pilot-expansion-decision-after-review@1");
    expect(inputValues(packet, "failed_reviews")[0]!.identity.revision_id)
      .toBe(failedReview.revisionId);
    const assessmentReview = inputValues(packet, "assessment_review")[0]!
      .identity.revision_id as string;
    const replacement = submit(packet, [output(
      "replacement-expansion-decision",
      "replacement",
      "DEC",
      {
        title: "Corrected exact change Decision",
        rationale: "Address the complete failed independent judgment.",
        kind: "pilot-expansion",
        decision: "change",
        alternatives: ["proceed", "stop"],
        effective_scope: "Phase 3–6 Example Process Package expansion",
      },
      [
        { type: "justifies", target: assessment.revisionId },
        { type: "relies-on-review", target: assessmentReview },
        { type: "corrects-review", target: failedReview.revisionId },
      ],
      decision.id,
    )], ["stakeholder"]).outputs[0]!.lifecycleDatum;

    publishReview(replacement, "pass");
    next = nextOutcome();
    expect(next.outcome).toBe("profile-boundary-reached");
    expect(next.phase).toBe("phase-7-change-control@3");
  }, 90_000);
});
