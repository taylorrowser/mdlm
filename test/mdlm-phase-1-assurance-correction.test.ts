import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { req } from "./helpers/req.js";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const processPackage = path.join(projectRoot, ".lifecycle/process");

function mdlm(repository: string, arguments_: string[], input?: string) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
}
function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}
type Created = { id: string; revisionId: string };
type Packet = Record<string, any>;
type ProposalOutput = {
  localId: string; name: string; invocation: number;
  lifecycleDatum: {
    id?: string; type: string; payload: Record<string, unknown>;
    links: { type: string; target: string }[]; body: string;
  };
};
const proposedDatum = (
  localId: string,
  name: string,
  type: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
  id?: string,
): ProposalOutput => ({
  localId,
  name,
  invocation: 0,
  lifecycleDatum: {
    ...(id ? { id } : {}),
    type,
    payload,
    links,
    body: `Exact ${type} fixture output.\n`,
  },
});
const prohibitedInputs = [
  "product source code",
  "product unit tests",
  "private implementation details",
  "uncontrolled implementation shortcuts",
];
const capabilities = {
  controllability: ["supply one exact public command vector"],
  observability: ["capture exact public output bytes"], external_services: [],
  timing: "bounded deterministic timeout",
};
const strategyPayload = (title: string, profileId = "public-command") => ({
  title,
  rationale: "The exact requirement needs black-box assurance.",
  level: "stakeholder",
  permitted_methods: ["demonstration"],
  independence: { boundary: "black-box", prohibited_inputs: prohibitedInputs },
  evidence_policy: "Retain exact public observations.",
  assessment_policy: "Require positive and negative discrimination.",
  environment_profile: {
    id: profileId, purpose: "Exercise the public command boundary.", capabilities,
  },
});
const environmentPayload = (
  title: string,
  strategy: Created,
  environmentRef: string,
  digestCharacter: string,
) => ({
  title,
  rationale: "Exercise the exact public command boundary.",
  strategy_revision: strategy.revisionId,
  profile_id: "public-command",
  capabilities,
  reproducibility: {
    environment_ref: environmentRef,
    configuration_digest: `sha256:${digestCharacter.repeat(64)}`,
    reconstruction: "Restore the exact container and isolated fixture.",
  },
});
const pilotPayload = (title: string) => ({
  title,
  rationale: "Prove the verification design discriminates exactly.",
  kind: "pilot",
  method: "demonstration",
  assessment_mode: "witnessed",
  claim: {
    kind: "pilot", scope: "verification-design", formal_evidence_eligible: false,
  },
  acceptance_criteria: ["supported and malformed outcomes differ exactly"],
  evidence_requirements: ["exact public success and rejection bytes"],
  expected_success_activity: "Exercise the supported public command.",
  expected_discrimination_activity: "Exercise the malformed public command.",
});

async function assuranceFixturePackage(root: string): Promise<string> {
  const packageRoot = path.join(root, "process");
  await fs.cp(processPackage, packageRoot, { recursive: true });

  await fs.writeFile(
    path.join(packageRoot, "scenarios/seed-assurance-review.yaml"),
    `kind: scenario-definition
id: seed-assurance-review
version: 1
description: Test-only explicit publication of one exact assurance Review.
initiation: explicit
phases: [phase-1-product-assurance]
inputs:
  - {name: subject, types: [VSP, ENV, VER], cardinality: one, identity: revision}
  - {name: review_context, types: [BSL], cardinality: one, identity: revision}
outputs:
  - name: review
    types: [REV]
    cardinality: one
    required_links:
      - {link: reviews, target: {input: subject}}
      - {link: contextualizes, target: {input: review_context}}
prompt_ref: prompts/seed-assurance-review.md@1
review_policy_ref: review-applicability@1
participation:
  policy_ref: contextual-review-participation@1
  arguments: {subject: subject, review_context: review_context}
authority_evidence: {output: review, type: REV}
completion: 'execution.integrity.contract_valid == true && review.payload.outcome == "fail"'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: single
`,
  );
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-assurance-review.md"),
    `---\nid: seed-assurance-review\nversion: 1\nscenario: seed-assurance-review\n---\n\n# Seed one assurance Review fixture\n`,
  );

  const manifestPath = path.join(packageRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push("seed-assurance-review");
  manifest.assets.prompts.push("prompts/seed-assurance-review.md@1");
  await fs.writeFile(manifestPath, stringify(manifest));

  const retainedPhase1Obligations = new Set([
    "environment-review-correction-required",
    "pilot-verification-activity-review-correction-required",
    "verification-run-required",
    "review-context-required",
    "passing-review-required",
  ]);
  const obligationsRoot = path.join(packageRoot, "obligations");
  for (const file of await fs.readdir(obligationsRoot)) {
    if (!file.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, file);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (retainedPhase1Obligations.has(obligation.id)) continue;
    obligation.phases = obligation.phases.filter(
      (phase: string) => phase !== "phase-1-product-assurance",
    );
    if (obligation.phases.length === 0) obligation.phases = ["phase-0-wayfinding"];
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const reviewPolicyPath = path.join(packageRoot, "policies/review-applicability.yaml");
  const reviewPolicy = parse(await fs.readFile(reviewPolicyPath, "utf8"));
  reviewPolicy.rules = [{
    priority: 400,
    when: `subject.identity.type in ["ENV", "VER"]
      && exists("cited-failing-reviews-by-correction@1", {replacement: subject})`,
    result: {
      required: true,
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    },
  }];
  await fs.writeFile(reviewPolicyPath, stringify(reviewPolicy));

  const phase0Path = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase0 = parse(await fs.readFile(phase0Path, "utf8"));
  phase0.order = 100;
  await fs.writeFile(phase0Path, stringify(phase0));

  const phase1Path = path.join(packageRoot, "phases/phase-1-product-assurance.yaml");
  const phase1 = parse(await fs.readFile(phase1Path, "utf8"));
  phase1.order = 0;
  phase1.scenarios = [
    "seed-assurance-review@1",
    "execute-verification-run@1",
    "create-review-context@1",
    "review-datum-in-context@2",
    "revise-environment-assurance-after-review@2",
    "revise-pilot-verification-activity-after-review@2",
  ];
  phase1.obligations = [
    "environment-review-correction-required@2",
    "pilot-verification-activity-review-correction-required@2",
    "verification-run-required@1",
    "review-context-required@2",
    "passing-review-required@2",
  ];
  await fs.writeFile(phase1Path, stringify(phase1));
  return packageRoot;
}

describe("Phase 1 assurance correction through the public operator seam", () => {
  let parent: string;
  let repository: string;
  let adapterSequence = 0;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase-1-assurance-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const packageRoot = await assuranceFixturePackage(parent);
    const initialized = req(
      repository,
      "--json",
      "init",
      "--process",
      packageRoot,
    );
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  const create = (
    type: string,
    payload: Record<string, unknown>,
    links: { type: string; target: string }[] = [],
    id?: string,
  ): Created => {
    const creationScenario: Record<string, string> = {
      PSP: "compile-psp@2",
      STK: "draft-stakeholder-requirements@2",
      VSP: "define-verification-strategy@1",
      ENV: "realize-verification-environment@1",
      VER: "write-verification-activity@1",
    };
    const arguments_ = [
      "new",
      type,
      "--scenario",
      creationScenario[type] ?? "compile-psp@2",
    ];
    if (id) arguments_.push("--id", id);
    for (const [name, value] of Object.entries(payload)) {
      arguments_.push(
        "--set",
        `${name}=${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
    }
    for (const link of links) {
      arguments_.push("--link", `${link.type}=${link.target}`);
    }
    arguments_.push("--body", `Fixture ${type} Lifecycle Datum.`, "--json");
    const created = req(repository, ...arguments_);
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    return JSON.parse(created.stdout).created;
  };

  const createProductBoundary = () => {
    const product = create("PSP", {
      title: "Public assurance fixture",
      rationale: "Exercise exact Phase 1 correction outcomes.",
      problem: "Assurance failures need live correction.",
      users: ["operator"],
      goals: ["bounded correction"],
      non_goals: ["broader lifecycle disposition"],
      success_measures: ["explicit correction and escalation"],
    });
    const requirement = create("STK", {
      title: "Reject malformed commands",
      rationale: "Operators need deterministic public outcomes.",
      statement: "The product shall reject malformed public commands.",
      verification_intent: "Observe supported success and malformed rejection.",
      stakeholder: "operator",
      priority: "must",
    }, [{ type: "derived-from", target: product.id }]);
    const strategy = create("VSP", strategyPayload("Public command strategy"), [
      { type: "governs", target: requirement.id },
      { type: "governs-revision", target: requirement.revisionId },
    ]);
    return { product, requirement, strategy };
  };

  const createContext = (subject: Created): Created => {
    const created = req(
      repository,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      `title=Review context for ${subject.revisionId}`,
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${subject.revisionId}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    const context = JSON.parse(created.stdout).created as Created;
    const added = req(
      repository,
      "baseline",
      "add",
      context.id,
      subject.revisionId,
      "--json",
    );
    expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
    const frozen = req(repository, "baseline", "freeze", context.id, "--json");
    expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
    return context;
  };

  const seedFailedReview = async (
    subject: Created,
    stakeholderOwned = false,
  ): Promise<Created> => {
    const context = createContext(subject);
    adapterSequence += 1;
    const adapterPath = path.join(parent, `review-adapter-${adapterSequence}.mjs`);
    const response = {
      outputs: [{
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: `Failed Review of ${subject.revisionId}`,
            review_kind: "contextual",
            rubric_ref: "policies/rubrics/bootstrap-review.md@1",
            findings: [{
              id: "F-001",
              target: subject.revisionId,
              relationship: "primary",
              severity: "blocking",
              summary: "The exact discrimination evidence needs correction.",
            }],
            ...(stakeholderOwned ? { correction_authority: "stakeholder" } : {}),
            outcome: "fail",
          },
          links: [
            { type: "reviews", target: subject.revisionId },
            { type: "contextualizes", target: context.revisionId },
          ],
          body: "One immutable failed assurance Review.\n",
        },
      }],
      completionEvidence: { summary: "The exact assurance Review failed." },
    };
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    const reviewed = req(
      repository,
      "scenario",
      "execute",
      "seed-assurance-review@1",
      "--initiate",
      "--input",
      `subject=${subject.revisionId}`,
      "--input",
      `review_context=${context.revisionId}`,
      "--authorize",
      "independent-reviewer",
      "--adapter",
      adapterPath,
      "--json",
    );
    expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
    return JSON.parse(reviewed.stdout).execution.outputs[0].lifecycleDatum;
  };

  const initializeGit = () => {
    expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status)
      .toBe(0);
    commit("Initialize Phase 1 assurance fixture");
  };

  const commit = (message: string) => {
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
  };

  const next = () => {
    const outcome = mdlm(repository, ["next"]);
    expect(outcome.status, `${outcome.stderr}${outcome.stdout}`).toBe(0);
    return JSON.parse(outcome.stdout);
  };

  const prepare = (outcome: Record<string, any>): Packet => {
    const prepared = mdlm(repository, [
      "scenario",
      "prepare",
      outcome.assignment.id,
    ]);
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    return JSON.parse(prepared.stdout);
  };

  const submit = (
    packet: Packet,
    outputs: ProposalOutput[],
    authoritySupplies: string[] = [],
  ) => {
    const submitted = mdlm(
      repository,
      ["scenario", "submit"],
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: packet.assignment.id,
        kind: "proposal",
        proposal: {
          outputs,
          completionEvidence: { summary: "The exact correction is complete." },
          loadedSkillRefs: packet.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies,
          standingDelegations: [],
        },
      })}\n`,
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const execution = JSON.parse(submitted.stdout).execution;
    commit(`Publish ${packet.scenario.reference}`);
    return execution;
  };

  const publishFailedReview = (
    subject: Created,
    definitionMembers: string[] = [subject.revisionId],
    evidence: string[] = [],
  ): Created => {
    let outcome = next();
    expect(outcome.outcome).toBe("assignment");
    let packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(packet.exactInputs[0].inputs.find(
      (input: { name: string }) => input.name === "subject",
    ).values[0].identity.revision_id).toBe(subject.revisionId);
    const contextExecution = submit(packet, [proposedDatum(
      `context-${subject.revisionId.replaceAll("-", "_")}`,
      "context",
      "BSL",
      {
        title: `Fresh Review Context for ${subject.revisionId}`,
        kind: "review-context",
        role: "review-context",
        scope: subject.revisionId,
        group: "DEFAULT",
        definition_members: definitionMembers,
        evidence,
      },
    )]);
    const context = contextExecution.outputs[0].lifecycleDatum as Created;

    outcome = next();
    expect(outcome.outcome).toBe("assignment");
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    expect(packet.exactInputs[0].inputs.find(
      (input: { name: string }) => input.name === "review_context",
    ).values[0].identity.revision_id).toBe(context.revisionId);
    return submit(packet, [proposedDatum(
      `review-${subject.revisionId.replaceAll("-", "_")}`,
      "review",
      "REV",
      {
        title: `Failed Review of ${subject.revisionId}`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [{
          id: "F-001",
          target: subject.revisionId,
          relationship: "primary",
          severity: "blocking",
          summary: "The fresh exact discrimination evidence still needs correction.",
        }],
        outcome: "fail",
      },
      [
        { type: "reviews", target: subject.revisionId },
        { type: "contextualizes", target: context.revisionId },
      ],
    )], ["independent-reviewer"]).outputs[0].lifecycleDatum;
  };

  const publishQualificationRun = (
    activity: Created,
    implementation: Created,
    environment: Created,
    cycle: number,
  ) => {
    const outcome = next();
    expect(outcome.outcome).toBe("assignment");
    const packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("execute-verification-run@1");
    return submit(packet, [
      proposedDatum(`run-${cycle}`, "run", "RUN", {
        title: `Fresh qualification run ${cycle}`,
        kind: "qualification",
        started_at: `2026-08-10T1${cycle}:00:00.000Z`,
        completed_at: `2026-08-10T1${cycle}:01:00.000Z`,
        execution_state: "completed",
        execution_target: { kind: "environment", ref: environment.revisionId },
        runner_ref: "runner:public-assurance@1",
        configuration_refs: [`configuration:qualification-${cycle}`],
        activities_expected: ["supported", "malformed"],
        activities_invoked: ["supported", "malformed"],
        evidence_locations: [`evidence:qualification-${cycle}`],
      }, [
        { type: "executes", target: implementation.revisionId },
        { type: "uses", target: environment.revisionId },
        { type: "targets", target: environment.revisionId },
        { type: "produces", target: `$proposal.result-${cycle}.revision_id` },
      ]),
      proposedDatum(`result-${cycle}`, "result", "RES", {
        title: `Fresh qualification result ${cycle}`,
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
          details: "Supported behavior succeeded and malformed behavior was rejected.",
        },
        evidence_refs: [`evidence:qualification-${cycle}`],
        assessor_ref: "assessor:public-assurance@1",
      }, [{ type: "assessed-in", target: environment.revisionId }]),
    ]);
  };

  const environmentCorrectionOutputs = (
    environment: Created,
    strategy: Created,
    failedReview: Created,
    cycle: number,
  ): ProposalOutput[] => [
    proposedDatum(
      `environment-${cycle}`,
      "replacement",
      "ENV",
      environmentPayload(
        `Corrected public environment ${cycle}`,
        strategy,
        `container:public-command-${cycle}`,
        String(cycle),
      ),
      [
        { type: "realizes", target: strategy.revisionId },
        { type: "corrects-review", target: failedReview.revisionId },
      ],
      environment.id,
    ),
    proposedDatum(`qualification-${cycle}`, "qualification_activity", "VER", {
      title: `Fresh qualification activity ${cycle}`,
      rationale: "The replacement ENV requires fresh qualification claims.",
      kind: "qualification",
      method: "test",
      assessment_mode: "automatic",
      claim: {
        kind: "qualification",
        scope: "environment-capability",
        formal_evidence_eligible: false,
      },
      acceptance_criteria: ["exact public control succeeds"],
      evidence_requirements: ["exact public observation"],
      expected_success_activity: "Exercise the supported command.",
      expected_discrimination_activity: "Reject the malformed command.",
    }, [
      { type: "governed-by", target: strategy.revisionId },
      { type: "qualifies", target: `$proposal.environment-${cycle}.revision_id` },
    ]),
    proposedDatum(
      `qualification-implementation-${cycle}`,
      "qualification_implementation",
      "VAI",
      {
        title: `Fresh qualification implementation ${cycle}`,
        rationale: "Execute only the replacement ENV capability boundary.",
        kind: "qualification",
        implementation_ref: `procedure:sha256:${String(cycle).repeat(64)}`,
        independence_mode: "environment-capability",
        authoring_input_refs: [strategy.revisionId],
        prohibited_inputs_observed: prohibitedInputs,
        activity_bindings: ["supported", "malformed"],
        target_behavior: {
          supported: ["exact public command"],
          intentionally_unsupported: ["malformed public command"],
        },
      },
      [
        { type: "realizes", target: `$proposal.qualification-${cycle}.revision_id` },
        { type: "uses", target: `$proposal.environment-${cycle}.revision_id` },
        { type: "targets", target: `$proposal.environment-${cycle}.revision_id` },
      ],
    ),
  ];

  const pilotCorrectionOutput = (
    activity: Created,
    requirement: Created,
    strategy: Created,
    failedReview: Created,
    cycle: number,
  ): ProposalOutput => proposedDatum(
    `pilot-${cycle}`,
    "replacement",
    "VER",
    pilotPayload(`Corrected pilot activity ${cycle}`),
    [
      { type: "governed-by", target: strategy.revisionId },
      { type: "verifies", target: requirement.id },
      { type: "verifies-revision", target: requirement.revisionId },
      { type: "corrects-review", target: failedReview.revisionId },
    ],
    activity.id,
  );

  it("preserves the ENV correction budget while rebuilding qualification before attention", async () => {
    const { strategy } = createProductBoundary();
    let environment = create("ENV", environmentPayload(
      "Initial public environment",
      strategy,
      "container:public-command-initial",
      "a",
    ), [{ type: "realizes", target: strategy.revisionId }]);
    let failedReview = await seedFailedReview(environment, true);
    initializeGit();
    const qualificationRevisions: string[] = [];
    const completeCycle = (execution: any, cycle: number) => {
      const output = (name: string) => execution.outputs.find(
        (candidate: { name: string }) => candidate.name === name,
      ).lifecycleDatum as Created;
      environment = output("replacement");
      const activity = output("qualification_activity");
      const implementation = output("qualification_implementation");
      qualificationRevisions.push(activity.revisionId, implementation.revisionId);
      const runEvidence = publishQualificationRun(
        activity,
        implementation,
        environment,
        cycle,
      ).outputs.map((item: { lifecycleDatum: Created }) =>
        item.lifecycleDatum.revisionId
      );
      failedReview = publishFailedReview(
        environment,
        [strategy.revisionId, environment.revisionId],
        [activity.revisionId, implementation.revisionId, ...runEvidence],
      );
    };

    let outcome = next();
    expect(outcome.outcome).toBe("attention-required");
    let packet = prepare(outcome);
    const attendedOutputs = environmentCorrectionOutputs(
      environment,
      strategy,
      failedReview,
      0,
    );
    attendedOutputs.push(proposedDatum("scope-decision", "decision", "DEC", {
      title: "Authorize attended ENV correction",
      rationale: "The exact finding requires stakeholder judgment.",
      kind: "scope",
      decision: "Authorize this exact correction.",
      alternatives: ["Retain the failed ENV"],
      effective_scope: "$proposal.environment-0.revision_id",
    }, [{ type: "justifies", target: "$proposal.environment-0.revision_id" }]));
    completeCycle(submit(packet, attendedOutputs, ["stakeholder"]), 0);

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      outcome = next();
      expect(outcome.outcome).toBe("assignment");
      packet = prepare(outcome);
      expect(packet.scenario.reference).toBe(
        "revise-environment-assurance-after-review@2",
      );
      expect(packet.authority.requirements).toEqual([]);
      completeCycle(submit(
        packet,
        environmentCorrectionOutputs(environment, strategy, failedReview, cycle),
      ), cycle);
    }

    expect(new Set(qualificationRevisions).size).toBe(6);
    expect(mdlm(repository, ["show", `${environment.id}-r00001`, "--json"]).status)
      .toBe(0);
    const escalation = next();
    expect(escalation).toEqual(expect.objectContaining({
      outcome: "attention-required",
      authorityRequirement: expect.objectContaining({
        mode: "attended",
        authority: "stakeholder",
      }),
      attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      explanation: expect.stringMatching(/both autonomous environment/i),
    }));
    expect(prepare(escalation).scenario.reference).toBe(
      "revise-environment-assurance-after-review@2",
    );
  }, 120_000);

  it("projects pilot VER correction and exhausted-budget attention without replacing ENV evidence", async () => {
    const { requirement, strategy } = createProductBoundary();
    const environment = create("ENV", environmentPayload(
      "Reusable qualified environment",
      strategy,
      "container:reusable-public-command",
      "b",
    ), [{ type: "realizes", target: strategy.revisionId }]);
    let activity = create("VER", pilotPayload("Initial public pilot activity"), [
      { type: "governed-by", target: strategy.revisionId },
      { type: "verifies", target: requirement.id },
      { type: "verifies-revision", target: requirement.revisionId },
    ]);
    let failedReview = await seedFailedReview(activity);
    initializeGit();
    const preservedEnvironment = mdlm(
      repository,
      ["show", environment.revisionId, "--json"],
    ).stdout;

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const outcome = next();
      expect(outcome).toEqual(expect.objectContaining({ outcome: "assignment" }));
      const packet = prepare(outcome);
      expect(packet.scenario.reference).toBe(
        "revise-pilot-verification-activity-after-review@2",
      );
      expect(packet.authority.requirements).toEqual([]);
      const execution = submit(packet, [pilotCorrectionOutput(
        activity,
        requirement,
        strategy,
        failedReview,
        cycle,
      )]);
      activity = execution.outputs[0].lifecycleDatum;
      failedReview = publishFailedReview(activity);
    }

    expect(mdlm(repository, ["show", environment.revisionId, "--json"]).stdout)
      .toBe(preservedEnvironment);
    const escalation = next();
    expect(escalation).toEqual(expect.objectContaining({
      outcome: "attention-required",
      authorityRequirement: expect.objectContaining({
        mode: "attended",
        authority: "stakeholder",
      }),
      attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      explanation: expect.stringMatching(/both autonomous pilot/i),
    }));
    expect(prepare(escalation).scenario.reference).toBe(
      "revise-pilot-verification-activity-after-review@2",
    );
  }, 120_000);

  it("reports unsupported Phase 1 ambiguity as a public Profile Boundary", () => {
    const { requirement } = createProductBoundary();
    create("VSP", strategyPayload(
      "Competing public command strategy",
      "competing-public-command",
    ), [
      { type: "governs", target: requirement.id },
      { type: "governs-revision", target: requirement.revisionId },
    ]);
    initializeGit();

    const outcome = next();
    if (outcome.outcome === "assignment") {
      throw new Error(`Unexpected Assignment: ${JSON.stringify(prepare(outcome))}`);
    }
    expect(outcome).toEqual(expect.objectContaining({
      contract: "mdlm-next@1",
      outcome: "profile-boundary-reached",
      phase: "phase-1-product-assurance@4",
      explanation: expect.stringMatching(/multiple applicable strategies/i),
      evidence: expect.objectContaining({
        profile: "bootstrap@27",
        condition: expect.objectContaining({ result: true }),
      }),
    }));
    expect(outcome).not.toHaveProperty("assignment");
  }, 60_000);
});
