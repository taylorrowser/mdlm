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
const executionProcedure = {
  deadlines_ms: { checkout: 30_000, environment_check: 20_000, product_case: 5_000 },
  deadline_scope: "infrastructure-safety-only",
  timeout: {
    termination: "process-group-sigterm-then-sigkill",
    force_after_ms: 1_000,
    reaping: "all-descendants",
    capture_partial_raw_observation: true,
  },
  cleanup: "guaranteed",
  aggregation: "continue-through-all-cases",
};
const pilotTargetPayload = (title: string, commit: string) => ({
  title,
  kind: "prototype",
  repository_ref: `git:${commit}`,
  supported_behavior: ["supported public command"],
  unsupported_behavior: ["malformed public command"],
  evidence_refs: [`git-object-observed:${commit}`],
  public_interface: {
    repository_locator: "file:///fixture",
    command: [
      { literal: "node" },
      { checkout_path: "bin/fixture.mjs" },
      {
        parameter: {
          name: "input",
          encoding: "exact UTF-8 fixture input",
          case_tokens: {
            normal: { value: "ok" },
            "raw-malformed": { raw: { encoding: "utf-8", value: "" } },
            "omitted-argument": { omitted: true },
            "extra-argument": { value: "ok" },
          },
        },
      },
      { extra_argument: { raw: { encoding: "utf-8", value: "extra" } } },
    ],
    argument_cases: [
      {
        id: "normal",
        kind: "normal",
        expected_observation: {
          classification: "success", exit_status: 0,
          stdout: { encoding: "base64", bytes: "b2sK" },
          stderr: { encoding: "base64", bytes: "" },
        },
      },
      {
        id: "raw-malformed",
        kind: "raw-malformed",
        expected_observation: {
          classification: "automatic-rejection", exit_status: 2,
          stdout: { encoding: "base64", bytes: "" },
          stderr: { encoding: "base64", bytes: "ZXJyb3IK" },
        },
      },
      {
        id: "omitted",
        kind: "omitted-argument",
        expected_observation: {
          classification: "automatic-rejection", exit_status: 2,
          stdout: { encoding: "base64", bytes: "" },
          stderr: { encoding: "base64", bytes: "cmVxdWlyZWQK" },
        },
      },
      {
        id: "extra",
        kind: "extra-argument",
        expected_observation: {
          classification: "automatic-rejection", exit_status: 2,
          stdout: { encoding: "base64", bytes: "" },
          stderr: { encoding: "base64", bytes: "ZXh0cmEK" },
        },
      },
    ],
    working_directory: "fresh-temporary-directory",
  },
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
  - {name: subject, types: [VSP, ENV, VER, VAI], cardinality: one, identity: revision}
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
completion: 'execution.integrity.contract_valid == true'
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
    "verification-strategy-review-correction-required",
    "environment-review-correction-required",
    "pilot-verification-activity-review-correction-required",
    "pilot-vai-review-correction-required",
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
    when: `subject.identity.type in ["VSP", "ENV", "VER", "VAI"]
      && exists("cited-failing-reviews-by-correction@1", {replacement: subject})`,
    result: {
      required: true,
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    },
  }];
  await fs.writeFile(reviewPolicyPath, stringify(reviewPolicy));

  const runObligationPath = path.join(
    packageRoot,
    "obligations/verification-run-required.yaml",
  );
  const runObligation = parse(await fs.readFile(runObligationPath, "utf8"));
  runObligation.status_rules = [{
    status: "awaiting-review",
    priority: 200,
    when: `implementation.payload.kind == "pilot"
      && none("passing-reviews-for@1", {subject: implementation})`,
    reason: "The focused fixture requires a passing Review of the exact pilot VAI.",
    blocked_by: [{
      obligation: "passing-review-required@2",
      subjects: "[implementation]",
    }],
  }, {
    status: "ready",
    priority: 100,
    when: "true",
    reason: "The focused fixture isolates exact run selection after correction.",
  }];
  await fs.writeFile(runObligationPath, stringify(runObligation));

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
    "revise-verification-strategy-after-review@2",
    "revise-environment-assurance-after-review@2",
    "revise-pilot-verification-activity-after-review@2",
    "revise-pilot-vai-after-review@1",
  ];
  phase1.obligations = [
    "verification-strategy-review-correction-required@2",
    "environment-review-correction-required@2",
    "pilot-verification-activity-review-correction-required@2",
    "pilot-vai-review-correction-required@1",
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
      ART: "register-pilot-target@1",
      VAI: "implement-verification-activity@1",
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

  const seedReview = async (
    subject: Created,
    reviewOutcome: "pass" | "fail",
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
            title: `${reviewOutcome === "pass" ? "Passing" : "Failed"} Review of ${subject.revisionId}`,
            review_kind: "contextual",
            rubric_ref: "policies/rubrics/bootstrap-review.md@1",
            findings: reviewOutcome === "fail" ? [{
              id: "F-001",
              target: subject.revisionId,
              relationship: "primary",
              severity: "blocking",
              summary: "The exact discrimination evidence needs correction.",
            }, {
              id: "F-002",
              target: subject.revisionId,
              relationship: "primary",
              severity: "blocking",
              summary: "The exact rejection observation also needs correction.",
            }] : [],
            ...(stakeholderOwned ? { correction_authority: "stakeholder" } : {}),
            outcome: reviewOutcome,
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

  const respond = (
    packet: Packet,
    outputs: ProposalOutput[],
    authoritySupplies: string[] = [],
  ) => mdlm(
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

  const submit = (
    packet: Packet,
    outputs: ProposalOutput[],
    authoritySupplies: string[] = [],
  ) => {
    const submitted = respond(packet, outputs, authoritySupplies);
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const execution = JSON.parse(submitted.stdout).execution;
    commit(`Publish ${packet.scenario.reference}`);
    return execution;
  };

  const expectSelfContainedAttendedPacket = (packet: Packet) => {
    expect(packet.authority.evidence).toEqual({ output: "decision", type: "DEC" });
    expect(packet.prompt.content).toContain("`decision`");
    expect(packet.prompt.content).toContain("`kind: scope`");
    expect(packet.prompt.content).toContain("`effective_scope`");
    expect(packet.prompt.content).toContain(
      "$proposal.<replacement-local-id>.revision_id",
    );
    expect(packet.prompt.content).toContain("`justifies`");
  };

  const publishReview = (
    subject: Created,
    definitionMembers: string[] = [subject.revisionId],
    evidence: string[] = [],
    reviewOutcome: "pass" | "fail" = "fail",
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
        title: `${reviewOutcome === "pass" ? "Passing" : "Failed"} Review of ${subject.revisionId}`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: reviewOutcome === "fail" ? [{
          id: "F-001",
          target: subject.revisionId,
          relationship: "primary",
          severity: "blocking",
          summary: "The fresh exact discrimination evidence still needs correction.",
        }] : [],
        outcome: reviewOutcome,
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

  const strategyCorrectionOutput = (
    strategy: Created,
    requirement: Created,
    failedReview: Created,
    cycle: number,
  ): ProposalOutput => proposedDatum(
    `strategy-${cycle}`,
    "replacement",
    "VSP",
    strategyPayload(`Corrected public strategy ${cycle}`),
    [
      { type: "governs", target: requirement.id },
      { type: "governs-revision", target: requirement.revisionId },
      { type: "corrects-review", target: failedReview.revisionId },
    ],
    strategy.id,
  );

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

  it("bounds VSP correction before projecting attended escalation", async () => {
    const { requirement, strategy: initialStrategy } = createProductBoundary();
    let strategy = initialStrategy;
    let failedReview = await seedReview(strategy, "fail");
    initializeGit();

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const outcome = next();
      expect(outcome.outcome).toBe("assignment");
      const packet = prepare(outcome);
      expect(packet.scenario.reference).toBe(
        "revise-verification-strategy-after-review@2",
      );
      expect(packet.authority.requirements).toEqual([]);
      const reviewInput = packet.exactInputs[0].inputs.find(
        (input: { name: string }) => input.name === "failed_reviews",
      ).values[0];
      expect(reviewInput.identity.revision_id).toBe(failedReview.revisionId);
      expect(reviewInput.data.payload.findings).toHaveLength(cycle === 1 ? 2 : 1);
      const correctionOutput = strategyCorrectionOutput(
        strategy,
        requirement,
        failedReview,
        cycle,
      );
      if (cycle === 1) {
        const missingCause = structuredClone(correctionOutput);
        missingCause.lifecycleDatum.links = missingCause.lifecycleDatum.links
          .filter((link) => link.type !== "corrects-review");
        const rejected = respond(packet, [missingCause]);
        expect(rejected.status).toBe(1);
        expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
          expect.arrayContaining([expect.objectContaining({
            code: "scenario-output-required-link-missing",
            path: "outputs.replacement.links.corrects-review",
          })]),
        );
        expect(mdlm(repository, ["show", `${strategy.id}-r00002`, "--json"])
          .status).toBe(1);
      }
      strategy = submit(packet, [correctionOutput]).outputs[0].lifecycleDatum;
      failedReview = publishReview(strategy);
    }

    const escalation = next();
    expect(escalation).toEqual(expect.objectContaining({
      outcome: "attention-required",
      authorityRequirement: expect.objectContaining({
        mode: "attended",
        authority: "stakeholder",
      }),
      attentionSchedule: expect.objectContaining({ timing: "immediate" }),
    }));
    const packet = prepare(escalation);
    expect(packet.scenario.reference).toBe(
      "revise-verification-strategy-after-review@2",
    );
    expectSelfContainedAttendedPacket(packet);
  }, 120_000);

  it("preserves the ENV correction budget while rebuilding qualification before attention", async () => {
    const { strategy } = createProductBoundary();
    let environment = create("ENV", environmentPayload(
      "Initial public environment",
      strategy,
      "container:public-command-initial",
      "a",
    ), [{ type: "realizes", target: strategy.revisionId }]);
    let failedReview = await seedReview(environment, "fail", true);
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
      failedReview = publishReview(
        environment,
        [strategy.revisionId, environment.revisionId],
        [activity.revisionId, implementation.revisionId, ...runEvidence],
      );
    };

    let outcome = next();
    expect(outcome.outcome).toBe("attention-required");
    let packet = prepare(outcome);
    expectSelfContainedAttendedPacket(packet);
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
      const correctionOutputs = environmentCorrectionOutputs(
        environment,
        strategy,
        failedReview,
        cycle,
      );
      if (cycle === 1) {
        const missingCause = structuredClone(correctionOutputs);
        missingCause[0]!.lifecycleDatum.links = missingCause[0]!.lifecycleDatum.links
          .filter((link) => link.type !== "corrects-review");
        const rejected = respond(packet, missingCause);
        expect(rejected.status).toBe(1);
        expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
          expect.arrayContaining([expect.objectContaining({
            code: "scenario-output-required-link-missing",
            path: "outputs.replacement.links.corrects-review",
          })]),
        );
        expect(mdlm(repository, ["show", `${environment.id}-r00003`, "--json"])
          .status).toBe(1);
      }
      completeCycle(submit(packet, correctionOutputs), cycle);
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
    }));
    const escalationPacket = prepare(escalation);
    expect(escalationPacket.scenario.reference).toBe(
      "revise-environment-assurance-after-review@2",
    );
    expectSelfContainedAttendedPacket(escalationPacket);
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
    let failedReview = await seedReview(activity, "fail");
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
      const correctionOutput = pilotCorrectionOutput(
        activity,
        requirement,
        strategy,
        failedReview,
        cycle,
      );
      if (cycle === 1) {
        const missingCause = structuredClone(correctionOutput);
        missingCause.lifecycleDatum.links = missingCause.lifecycleDatum.links
          .filter((link) => link.type !== "corrects-review");
        const rejected = respond(packet, [missingCause]);
        expect(rejected.status).toBe(1);
        expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
          expect.arrayContaining([expect.objectContaining({
            code: "scenario-output-required-link-missing",
            path: "outputs.replacement.links.corrects-review",
          })]),
        );
        expect(mdlm(repository, ["show", `${activity.id}-r00002`, "--json"])
          .status).toBe(1);
      }
      const execution = submit(packet, [correctionOutput]);
      activity = execution.outputs[0].lifecycleDatum;
      failedReview = publishReview(activity);
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
    }));
    const escalationPacket = prepare(escalation);
    expect(escalationPacket.scenario.reference).toBe(
      "revise-pilot-verification-activity-after-review@2",
    );
    expectSelfContainedAttendedPacket(escalationPacket);
  }, 120_000);

  it("corrects failed pilot VAI procedures without reusing prior run evidence", async () => {
    const { requirement, strategy } = createProductBoundary();
    const environment = create("ENV", environmentPayload(
      "Reusable pilot environment",
      strategy,
      "container:vai-correction",
      "e",
    ), [{ type: "realizes", target: strategy.revisionId }]);
    const activity = create("VER", pilotPayload("Exact malformed-input pilot"), [
      { type: "governed-by", target: strategy.revisionId },
      { type: "verifies", target: requirement.id },
      { type: "verifies-revision", target: requirement.revisionId },
    ]);
    const target = create(
      "ART",
      pilotTargetPayload("Exact malformed-input target", "f".repeat(40)),
      [{ type: "derived-from", target: requirement.revisionId }],
    );
    const otherEnvironment = create("ENV", environmentPayload(
      "Unrelated pilot environment",
      strategy,
      "container:unrelated-vai",
      "a",
    ), [{ type: "realizes", target: strategy.revisionId }]);
    const implementation = create("VAI", {
      title: "Initial source-blind pilot procedure",
      rationale: "Execute every exact public command case.",
      kind: "pilot",
      implementation_ref: `procedure:sha256:${"b".repeat(64)}`,
      independence_mode: "source-blind",
      authoring_input_refs: [activity.revisionId, environment.revisionId, target.revisionId],
      prohibited_inputs_observed: prohibitedInputs,
      activity_bindings: ["normal", "raw-malformed", "omitted", "extra"],
      target_behavior: {
        supported: ["supported public command"],
        intentionally_unsupported: ["malformed public command"],
      },
      execution_procedure: executionProcedure,
    }, [
      { type: "realizes", target: activity.revisionId },
      { type: "uses", target: environment.revisionId },
      { type: "targets", target: target.revisionId },
    ]);
    await seedReview(implementation, "pass");
    initializeGit();

    let outcome = next();
    let packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("execute-verification-run@1");
    const oldRun = submit(packet, [
      proposedDatum("old-run", "run", "RUN", {
        title: "Prior unsuitable pilot run",
        kind: "pilot",
        started_at: "2026-08-11T10:00:00.000Z",
        completed_at: "2026-08-11T10:01:00.000Z",
        execution_state: "completed",
        execution_target: { kind: "prototype", ref: target.revisionId },
        runner_ref: "runner:initial@1",
        configuration_refs: ["configuration:initial"],
        activities_expected: ["normal", "raw-malformed", "omitted", "extra"],
        activities_invoked: ["normal", "raw-malformed", "omitted", "extra"],
        evidence_locations: ["evidence:initial"],
      }, [
        { type: "executes", target: implementation.revisionId },
        { type: "uses", target: environment.revisionId },
        { type: "targets", target: target.revisionId },
        { type: "produces", target: "$proposal.old-result.revision_id" },
      ]),
      proposedDatum("old-result", "result", "RES", {
        title: "Prior unsuitable pilot result",
        claim: {
          kind: "pilot",
          scope: "verification-design",
          outcome: "unsuitable",
          formal_evidence_eligible: false,
        },
        assessment_state: "accepted",
        observations: {
          expected_success_observed: false,
          expected_discrimination_observed: false,
          details: "The original procedure did not recover through every case.",
        },
        evidence_refs: ["evidence:initial"],
        assessor_ref: "assessor:initial@1",
      }, [{ type: "assessed-in", target: environment.revisionId }]),
    ]).outputs.map((output: { lifecycleDatum: Created }) => output.lifecycleDatum);
    const failedReviews = [
      await seedReview(implementation, "fail"),
      await seedReview(implementation, "fail"),
    ];
    commit("Record exact failed VAI Reviews");

    const showDatum = (revisionId: string) => {
      const shown = mdlm(repository, ["show", revisionId, "--json"]);
      expect(shown.status).toBe(0);
      return JSON.parse(shown.stdout).lifecycleDatum.datum;
    };
    const immutableBefore = [implementation, ...oldRun, ...failedReviews]
      .map((datum) => [datum.revisionId, showDatum(datum.revisionId)] as const);

    outcome = next();
    expect(outcome.outcome).toBe("assignment");
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("revise-pilot-vai-after-review@1");
    expect(packet.authority.requirements).toEqual([]);
    const inputValues = (name: string) => packet.exactInputs[0].inputs.find(
      (input: { name: string }) => input.name === name,
    ).values;
    expect(inputValues("failed_reviews").map(
      (review: { identity: { revision_id: string } }) => review.identity.revision_id,
    ).sort()).toEqual(failedReviews.map((review) => review.revisionId).sort());

    const correctedPayload = {
      title: "Corrected source-blind pilot procedure",
      rationale: "Bound recovery without making a product timing claim.",
      kind: "pilot",
      implementation_ref: `procedure:sha256:${"c".repeat(64)}`,
      independence_mode: "source-blind",
      authoring_input_refs: [
        activity.revisionId,
        environment.revisionId,
        target.revisionId,
        ...failedReviews.map((review) => review.revisionId),
      ],
      prohibited_inputs_observed: prohibitedInputs,
      activity_bindings: ["normal", "raw-malformed", "omitted", "extra"],
      target_behavior: {
        supported: ["supported public command"],
        intentionally_unsupported: ["malformed public command"],
      },
      execution_procedure: executionProcedure,
    };
    const correction = (environmentTarget: string): ProposalOutput[] => [
      proposedDatum(
        "replacement",
        "replacement",
        "VAI",
        correctedPayload,
        [
          { type: "realizes", target: activity.revisionId },
          { type: "uses", target: environmentTarget },
          { type: "targets", target: target.revisionId },
          ...failedReviews.map((review) => ({
            type: "corrects-review",
            target: review.revisionId,
          })),
        ],
        implementation.id,
      ),
      proposedDatum("authorization", "authorization", "DEC", {
        title: "Authorize exact corrected VAI",
        rationale: "Package evidence preserves every reviewed verification binding.",
        kind: "decision",
        decision: "Authorize this exact corrected pilot implementation.",
        alternatives: ["Retain the failed procedure"],
        effective_scope: "$proposal.replacement.revision_id",
      }, [{ type: "justifies", target: "$proposal.replacement.revision_id" }]),
    ];
    const incompleteCorrection = correction(otherEnvironment.revisionId);
    incompleteCorrection[0]!.lifecycleDatum.links = incompleteCorrection[0]!
      .lifecycleDatum.links.filter(
        (link) => link.target !== failedReviews[1]!.revisionId,
      );
    const rejected = respond(packet, incompleteCorrection);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "scenario-output-required-link-missing",
          path: "outputs.replacement.links.uses",
        }),
        expect.objectContaining({
          code: "scenario-output-required-link-missing",
          path: "outputs.replacement.links.corrects-review",
        }),
      ]),
    );
    expect(mdlm(repository, ["show", `${implementation.id}-r00002`, "--json"]).status)
      .toBe(1);

    const corrected = submit(packet, correction(environment.revisionId))
      .outputs.find((output: { name: string }) => output.name === "replacement")
      .lifecycleDatum as Created;
    expect(showDatum(corrected.revisionId).payload.execution_procedure.timeout)
      .toEqual(expect.objectContaining({
        termination: "process-group-sigterm-then-sigkill",
        reaping: "all-descendants",
        capture_partial_raw_observation: true,
      }));
    for (const [revisionId, datum] of immutableBefore) {
      expect(showDatum(revisionId)).toEqual(datum);
    }

    publishReview(corrected, [corrected.revisionId], [], "pass");
    outcome = next();
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("execute-verification-run@1");
    expect(packet.exactInputs[0].inputs.find(
      (input: { name: string }) => input.name === "implementation",
    ).values[0].identity.revision_id).toBe(corrected.revisionId);
    expect(oldRun.map((datum: Created) => datum.revisionId))
      .not.toContain(corrected.revisionId);
  }, 120_000);

  const expectProfileBoundary = () => {
    initializeGit();
    const outcome = next();
    if (outcome.outcome === "assignment") {
      throw new Error(`Unexpected Assignment: ${JSON.stringify(prepare(outcome))}`);
    }
    expect(outcome).toEqual(expect.objectContaining({
      contract: "mdlm-next@1",
      outcome: "profile-boundary-reached",
      phase: "phase-1-product-assurance@5",
      explanation: expect.stringMatching(/multiple applicable/i),
      evidence: expect.objectContaining({
        profile: "bootstrap@34",
        condition: expect.objectContaining({ result: true }),
      }),
    }));
    expect(outcome).not.toHaveProperty("assignment");
  };

  it("reports multiple applicable VSPs as a public Profile Boundary", () => {
    const { requirement } = createProductBoundary();
    create("VSP", strategyPayload(
      "Competing public command strategy",
      "competing-public-command",
    ), [
      { type: "governs", target: requirement.id },
      { type: "governs-revision", target: requirement.revisionId },
    ]);
    expectProfileBoundary();
  }, 60_000);

  it("reports multiple applicable ENVs as a public Profile Boundary", () => {
    const { strategy } = createProductBoundary();
    for (const [suffix, digest] of [["one", "c"], ["two", "d"]] as const) {
      create("ENV", environmentPayload(
        `Competing environment ${suffix}`,
        strategy,
        `container:competing-${suffix}`,
        digest,
      ), [{ type: "realizes", target: strategy.revisionId }]);
    }
    expectProfileBoundary();
  }, 60_000);

  it("reports multiple applicable pilot targets as a public Profile Boundary", () => {
    const { requirement, strategy } = createProductBoundary();
    create("VER", pilotPayload("Pilot activity with competing targets"), [
      { type: "governed-by", target: strategy.revisionId },
      { type: "verifies", target: requirement.id },
      { type: "verifies-revision", target: requirement.revisionId },
    ]);
    for (const [title, commit] of [
      ["First pilot target", "a".repeat(40)],
      ["Second pilot target", "b".repeat(40)],
    ] as const) {
      create("ART", pilotTargetPayload(title, commit), [
        { type: "derived-from", target: requirement.revisionId },
      ]);
    }
    expectProfileBoundary();
  }, 60_000);
});
