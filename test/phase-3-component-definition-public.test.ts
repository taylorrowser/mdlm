import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";

type Json = Record<string, any>;

interface SuppliedOutput {
  output: string;
  handle?: string;
  links?: Json[];
  payload: Json;
  body: string;
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

function commit(repository: string, message: string): void {
  expect(git(repository, "add", ".lifecycle").status).toBe(0);
  const result = git(
    repository,
    "-c",
    "user.name=MDLM Test",
    "-c",
    "user.email=mdlm-test@localhost",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    message,
  );
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

function exactInputs(packet: Json, name: string): Json[] {
  const input = packet.exactInputs[0].inputs.find(
    (candidate: Json) => candidate.name === name,
  );
  expect(input, `Missing exact input '${name}'`).toBeDefined();
  return input.values;
}

function inputRevisions(packet: Json, name: string): string[] {
  return exactInputs(packet, name).map(
    (value) => value.identity.revision_id ?? value.identity.id,
  );
}

function assignmentResponse(
  packet: Json,
  supplied: SuppliedOutput[],
): Json {
  const response = structuredClone(packet.responseScaffold);
  response.proposal.outputs = supplied.map((output) => {
    const template = response.proposal.outputs.find(
      (candidate: Json) =>
        (candidate.output ?? candidate.handle) === output.output,
    );
    expect(template, `Missing output '${output.output}'`).toBeDefined();
    return {
      ...structuredClone(template),
      ...(output.handle ? { handle: output.handle } : {}),
      ...(output.links === undefined
        ? {}
        : { links: structuredClone(output.links) }),
      payload: output.payload,
      body: output.body,
    };
  });
  response.proposal.completionEvidence = {
    summary: `Completed ${packet.scenario.reference}.`,
  };
  return response;
}

function submit(
  repository: string,
  packet: Json,
  supplied: SuppliedOutput[],
  authority?: string,
): Json {
  const response = assignmentResponse(packet, supplied);
  const arguments_ = ["scenario", "submit", "-", "--json"];
  if (authority) arguments_.splice(3, 0, "--authority", authority);
  const result = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    ...arguments_,
  );
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  return JSON.parse(result.stdout);
}

function publication(result: Json, handle: string): string {
  const matched = result.receipt.publications.find(
    (candidate: Json) => candidate.handle === handle,
  );
  expect(matched, `Missing publication '${handle}'`).toBeDefined();
  return matched.revisionId;
}

function next(repository: string): Json {
  const result = mdlm(repository, "next", "--json");
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  return JSON.parse(result.stdout);
}

function nextPacket(repository: string, scenario: string): Json {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const outcome = next(repository);
    if (outcome.outcome === "publication-required") {
      expect(outcome.assignment).toBeUndefined();
      expect(outcome.materializedExecutions).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "completed" })]),
      );
      const doctor = mdlm(repository, "doctor", "--json");
      expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
      commit(repository, "Publish exact Review Context");
      continue;
    }
    expect(outcome.assignment, JSON.stringify(outcome)).toBeDefined();
    expect(outcome.assignment.packet.scenario.reference).toBe(scenario);
    return outcome.assignment.packet;
  }
  throw new Error(`Public route did not reach ${scenario}`);
}

async function phaseThreePackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });

  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = [
    "phase-3-component-definition",
    "phase-4-design-definition",
    "phase-5-implementation",
    "phase-6-verification",
  ];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(root, "phases/phase-3-component-definition.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.attention_checkpoints = [];
  await fs.writeFile(phasePath, stringify(phase));
  for (const phaseId of [
    "phase-0-wayfinding",
    "phase-1-product-assurance",
    "phase-2-system-definition",
    "phase-2-pilot-assessment",
    "phase-7-change-control",
  ]) {
    const otherPath = path.join(root, `phases/${phaseId}.yaml`);
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }

  const reviewRequiredPath = path.join(
    root,
    "selectors/review-required-revisions.yaml",
  );
  const reviewRequired = parse(await fs.readFile(reviewRequiredPath, "utf8"));
  reviewRequired.query.where = reviewRequired.query.where.replace(
    'subject.identity.type in ["BSL", "DEC"]',
    'subject.identity.type in ["BSL", "DEC", "STK", "SYS"]',
  );
  await fs.writeFile(reviewRequiredPath, stringify(reviewRequired));

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-system-definitions",
    version: 1,
    description: "Publish one exact SYS ancestry for the Phase 3 public regression.",
    phases: ["phase-3-component-definition"],
    inputs: [],
    outputs: [
      { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
      {
        name: "stakeholder_requirement",
        types: ["STK"],
        cardinality: "one",
        required_links: [
          { link: "derived-from", target: { output: "product" } },
        ],
      },
      {
        name: "system_requirement",
        types: ["SYS"],
        cardinality: "one",
        required_links: [
          { link: "derived-from", target: { output: "stakeholder_requirement" } },
        ],
      },
      {
        name: "stakeholder_strategy",
        types: ["VSP"],
        cardinality: "one",
        required_links: [
          { link: "governs", target: { output: "stakeholder_requirement" } },
          { link: "governs-revision", target: { output: "stakeholder_requirement" } },
        ],
      },
      {
        name: "system_strategy",
        types: ["VSP"],
        cardinality: "one",
        required_links: [
          { link: "governs", target: { output: "system_requirement" } },
          { link: "governs-revision", target: { output: "system_requirement" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-system-definitions.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["system-definitions-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const definitionsObligation = {
    kind: "obligation-definition",
    id: "system-definitions-required",
    version: 1,
    description: "The focused regression requires one exact SYS ancestry.",
    phases: ["phase-3-component-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("phase-3-test-systems@1", {})',
    status_rules: [{
      status: "ready",
      priority: 10_000,
      when: 'none("phase-3-test-systems@1", {})',
      reason: "Publish the exact system ancestry.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-system-definitions@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const acceptanceScenario = {
    kind: "scenario-definition",
    id: "seed-accepted-system-slice",
    version: 1,
    description: "Freeze the exact test SYS ancestry as one accepted system baseline.",
    phases: ["phase-3-component-definition"],
    inputs: [
      { name: "product", types: ["PSP"], cardinality: "one", identity: "revision" },
      { name: "stakeholder_requirement", types: ["STK"], cardinality: "one", identity: "revision" },
      { name: "system_requirement", types: ["SYS"], cardinality: "one", identity: "revision" },
    ],
    outputs: [
      { name: "accepted", types: ["BSL"], cardinality: "one", required_links: [] },
      { name: "accepted_intent", types: ["BSL"], cardinality: "one", required_links: [] },
    ],
    prompt_ref: "prompts/seed-accepted-system-slice.md@1",
    review_policy_ref: "review-applicability@1",
    completion: [
      "execution.integrity.contract_valid == true",
      '&& accepted.payload.kind == "level-accepted"',
      '&& accepted.payload.role == "accepted"',
      "&& accepted.storage.frozen == true",
      '&& accepted_intent.payload.kind == "intent-approved"',
      '&& accepted_intent.payload.role == "accepted"',
      "&& accepted_intent.storage.frozen == true",
    ].join(" "),
    resolves: ["accepted-system-slice-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const acceptanceObligation = {
    kind: "obligation-definition",
    id: "accepted-system-slice-required",
    version: 1,
    description: "The focused regression requires one exact accepted SYS slice.",
    phases: ["phase-3-component-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("phase-3-test-accepted-baselines@1", {})',
    status_rules: [
      {
        status: "blocked",
        priority: 200,
        when: 'none("phase-3-test-systems@1", {})',
        reason: "Exact SYS ancestry must exist before acceptance.",
      },
      {
        status: "ready",
        priority: 100,
        when: [
          'exists("phase-3-test-systems@1", {})',
          '&& exists("passing-reviews-for@1", {subject: one("phase-3-test-stakeholder-requirements@1", {})})',
          '&& exists("passing-reviews-for@1", {subject: one("phase-3-test-systems@1", {})})',
          '&& none("phase-3-test-accepted-baselines@1", {})',
        ].join(" "),
        reason: "Freeze the reviewed exact system ancestry as accepted evidence.",
      },
    ],
    default_status: "blocked",
    resolve_with: {
      scenario: "seed-accepted-system-slice@1",
      inputs: {
        product: 'one("phase-3-test-products@1", {})',
        stakeholder_requirement: 'one("phase-3-test-stakeholder-requirements@1", {})',
        system_requirement: 'one("phase-3-test-systems@1", {})',
      },
    },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const acceptedSelector = {
    kind: "selector-definition",
    id: "phase-3-test-accepted-baselines",
    version: 1,
    description: "Exact accepted system baseline published by focused setup.",
    parameters: [],
    result_kind: "baseline",
    query: {
      from: { collection: "baselines", types: ["BSL"] },
      as: "accepted",
      where: [
        'accepted.provenance.scenario == "seed-accepted-system-slice@1"',
        '&& accepted.payload.kind == "level-accepted"',
        '&& accepted.payload.role == "accepted"',
        "&& accepted.storage.frozen == true",
      ].join(" "),
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  const seededSelector = (
    id: string,
    types: string[],
    as: string,
  ) => ({
    kind: "selector-definition",
    id,
    version: 1,
    description: `Exact ${types.join("/")} published by focused setup.`,
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types },
      as,
      where: `${as}.provenance.scenario == "seed-system-definitions@1"`,
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  });
  for (const [relative, value] of [
    ["scenarios/seed-system-definitions.yaml", seedScenario],
    ["scenarios/seed-accepted-system-slice.yaml", acceptanceScenario],
    ["obligations/system-definitions-required.yaml", definitionsObligation],
    ["obligations/accepted-system-slice-required.yaml", acceptanceObligation],
    ["selectors/phase-3-test-accepted-baselines.yaml", acceptedSelector],
    ["selectors/phase-3-test-products.yaml", seededSelector("phase-3-test-products", ["PSP"], "product")],
    ["selectors/phase-3-test-stakeholder-requirements.yaml", seededSelector("phase-3-test-stakeholder-requirements", ["STK"], "requirement")],
    ["selectors/phase-3-test-systems.yaml", seededSelector("phase-3-test-systems", ["SYS"], "requirement")],
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(root, relative), stringify(value));
  }
  await fs.writeFile(
    path.join(root, "prompts/seed-system-definitions.md"),
    "---\nid: seed-system-definitions\nversion: 1\nscenario: seed-system-definitions\n---\n\n# Seed system definitions\n",
  );
  await fs.writeFile(
    path.join(root, "prompts/seed-accepted-system-slice.md"),
    "---\nid: seed-accepted-system-slice\nversion: 1\nscenario: seed-accepted-system-slice\n---\n\n# Seed accepted system evidence\n",
  );
  return root;
}

function review(
  repository: string,
  expectedSubject: string,
): string {
  const packet = nextPacket(repository, "review-datum-in-context@3");
  return submitReview(repository, packet, expectedSubject);
}

function reviewNext(repository: string): string {
  const packet = nextPacket(repository, "review-datum-in-context@3");
  return submitReview(repository, packet, inputRevisions(packet, "subject")[0]!);
}

function nextAfterReviews(
  repository: string,
  scenario: string,
  reviews: string[],
  reviewContexts?: Map<string, string>,
): Json {
  for (;;) {
    const outcome = next(repository);
    if (outcome.outcome === "publication-required") {
      commit(repository, "Publish exact Review Contexts");
      continue;
    }
    const packet = outcome.assignment?.packet;
    expect(packet, JSON.stringify(outcome)).toBeDefined();
    if (packet.scenario.reference === "review-datum-in-context@3") {
      const subject = inputRevisions(packet, "subject")[0]!;
      reviewContexts?.set(subject, inputRevisions(packet, "review_context")[0]!);
      reviews.push(submitReview(repository, packet, subject));
      continue;
    }
    expect(packet.scenario.reference).toBe(scenario);
    return packet;
  }
}

function terminalAfterReviews(repository: string, reviews: string[]): Json {
  for (;;) {
    const outcome = next(repository);
    if (outcome.outcome === "publication-required") {
      commit(repository, "Publish exact terminal Review Context");
      continue;
    }
    if (outcome.assignment?.packet.scenario.reference === "review-datum-in-context@3") {
      const packet = outcome.assignment.packet;
      reviews.push(submitReview(repository, packet, inputRevisions(packet, "subject")[0]!));
      continue;
    }
    return outcome;
  }
}

function submitReview(
  repository: string,
  packet: Json,
  expectedSubject: string,
): string {
  expect(inputRevisions(packet, "subject")).toEqual([expectedSubject]);
  const result = submit(repository, packet, [{
    output: "review",
    payload: {
      title: `Review ${expectedSubject}`,
      review_kind: "contextual",
      reviewer: "independent-reviewer",
      summary: "The exact subject is coherent in its complete frozen context.",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [],
      outcome: "pass",
    },
    body: "The supplied exact context supports this independent judgment.\n",
  }], "independent-reviewer");
  commit(repository, `Review ${expectedSubject}`);
  return publication(result, "review");
}

function submitFailedReview(
  repository: string,
  packet: Json,
  subject: string,
  criterion: string,
): { context: string; review: string } {
  expect(inputRevisions(packet, "subject")).toEqual([subject]);
  const context = inputRevisions(packet, "review_context")[0]!;
  const result = submit(repository, packet, [{
    output: "review",
    payload: {
      title: `Failed review ${subject}`,
      review_kind: "contextual",
      reviewer: "independent-reviewer",
      summary: criterion,
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [{
        id: "F-001",
        target: subject,
        relationship: "primary",
        severity: "blocking",
        summary: criterion,
        criterion,
        evidence: "The exact frozen subject omits required evidence.",
        material_consequence: "The design cannot be accepted from incomplete implementation evidence.",
      }],
      correction_authority: "package-evidence",
      outcome: "fail",
    },
    body: "One exact blocking finding requires same-lineage correction.\n",
  }], "independent-reviewer");
  commit(repository, `Fail review ${subject}`);
  return { context, review: publication(result, "review") };
}

function publishFormalActivity(repository: string): string {
  const packet = nextPacket(repository, "write-formal-verification-activity@1");
  const requirement = exactInputs(packet, "requirement")[0];
  const stakeholderClaim = requirement!.identity.type === "STK";
  const result = submit(repository, packet, [{
    output: "activity",
    payload: {
      title: `Formal verification for ${requirement!.identity.revision_id}`,
      rationale: "Specify a source-blind judgment of the exact requirement claim.",
      kind: "formal",
      method: stakeholderClaim ? "demonstration" : "test",
      assessment_mode: stakeholderClaim ? "witnessed" : "automatic",
      claim: { kind: "formal", scope: "requirement", formal_evidence_eligible: true },
      acceptance_criteria: ["The exact observable claim is satisfied."],
      evidence_requirements: ["Retain the authored claim judgment."],
      expected_success_activity: "The claim is supported.",
      expected_discrimination_activity: "A contradictory claim is rejected.",
    },
    body: "One source-blind formal verification specification.\n",
  }]);
  commit(repository, "Publish formal verification specification");
  return publication(result, "activity");
}

const exactBytes = { encoding: "base64", bytes: "" };

function formalImplementationPayload(activity: string, environment: string, index: number): Json {
  return {
    title: `Source-blind formal procedure ${index}`,
    rationale: "Implement only the supplied exact formal claim and public boundary.",
    kind: "formal",
    implementation_ref: `procedure:sha256:${String(index + 3).padStart(64, "0")}`,
    independence_mode: "source-blind",
    authoring_input_refs: [activity, environment],
    prohibited_inputs_observed: [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ],
    activity_bindings: ["exact formal claim"],
    target_behavior: {
      supported: ["declared claim"],
      intentionally_unsupported: ["undeclared claim"],
    },
    execution_procedure: {
      content: "Evaluate the exact formal claim through the declared public boundary.",
      deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 },
      deadline_scope: "infrastructure-safety-only",
      timeout: {
        termination: "process-group-sigterm-then-sigkill",
        force_after_ms: 100,
        reaping: "all-descendants",
        capture_partial_raw_observation: true,
      },
      cleanup: "guaranteed",
      aggregation: "continue-through-all-cases",
    },
  };
}

function implementationArtifactPayload(
  commitId: string,
  repositoryLocator: string,
  designs: string[],
): Json {
  const observation = (classification: string, exit_status: number) => ({
    classification,
    exit_status,
    stdout: exactBytes,
    stderr: exactBytes,
  });
  return {
    title: "Runnable bounded value checker",
    kind: "implementation",
    repository_ref: `git:${commitId}`,
    supported_behavior: ["classify and report one valid value"],
    unsupported_behavior: ["malformed or ambiguous invocation"],
    design_path_mapping: designs.map((design) => ({
      design_revision: design,
      paths: ["checker.mjs"],
    })),
    public_interface: {
      repository_locator: repositoryLocator,
      command: [
        { literal: "node" },
        { checkout_path: "checker.mjs" },
        {
          parameter: {
            name: "value",
            encoding: "utf-8",
            case_tokens: {
              normal: { value: "valid" },
              "raw-malformed": { raw: { encoding: "utf-8", value: "?" } },
              "omitted-argument": { omitted: true },
              "extra-argument": { value: "valid" },
            },
          },
        },
        { extra_argument: { raw: { encoding: "utf-8", value: "extra" } } },
      ],
      argument_cases: [
        { id: "normal", kind: "normal", expected_observation: observation("success", 0) },
        { id: "malformed", kind: "raw-malformed", expected_observation: observation("automatic-rejection", 2) },
        { id: "omitted", kind: "omitted-argument", expected_observation: observation("automatic-rejection", 2) },
        { id: "extra", kind: "extra-argument", expected_observation: observation("automatic-rejection", 2) },
      ],
      working_directory: "fresh-temporary-directory",
    },
  };
}

function formalExecutionOutputs(
  packet: Json,
  productArtifact: string,
  index: number,
  executionState: "completed" | "aborted" | "infrastructure-error",
  outcome: "pass" | "fail" | "inconclusive",
): SuppliedOutput[] {
  const implementation = inputRevisions(packet, "implementation")[0]!;
  const activity = exactInputs(packet, "activity")[0]!;
  const environment = inputRevisions(packet, "environment")[0]!;
  const requirement = inputRevisions(packet, "requirement")[0]!;
  const completed = executionState === "completed";
  const assessmentRequired = activity.data.payload.assessment_mode !== "automatic";
  const second = String(index).padStart(2, "0");
  return [
    {
      output: "run",
      payload: {
        title: `Formal run for ${requirement}`,
        kind: "formal",
        started_at: `2026-09-01T01:00:${second}Z`,
        completed_at: `2026-09-01T01:01:${second}Z`,
        execution_state: executionState,
        execution_target: { kind: "product-build", ref: productArtifact },
        runner_ref: "fixture-formal-runner@1",
        configuration_refs: [implementation, activity.identity.revision_id, environment, requirement],
        activities_expected: [activity.identity.revision_id],
        activities_invoked: completed ? [activity.identity.revision_id] : [],
        evidence_locations: [`inline:formal-${index}`],
      },
      body: "One immutable exact formal execution manifest.\n",
    },
    {
      output: "result",
      payload: {
        title: `Formal result for ${requirement}`,
        claim: {
          kind: "formal",
          scope: "requirement",
          outcome,
          formal_evidence_eligible: true,
        },
        assessment_state: completed
          ? assessmentRequired ? "assessment-required" : "recorded"
          : "inconclusive",
        observations: {
          expected_success_observed: completed && outcome === "pass",
          expected_discrimination_observed: completed && outcome !== "inconclusive",
          details: completed
            ? `The exact controlled execution produced ${outcome}.`
            : "Infrastructure prevented a product conclusion.",
        },
        evidence_refs: [`inline:formal-${index}`],
        assessor_ref: completed && assessmentRequired
          ? "witnessed-formal-assessor"
          : "fixture-formal-runner@1",
      },
      body: "One immutable exact requirement-scoped formal result.\n",
    },
  ];
}

it("lets explicit supplied links replace optional scaffold links", () => {
  const justifies = { type: "justifies", target: { input: "candidate" } };
  const packet = {
    scenario: { reference: "record-gate-signoff@3" },
    responseScaffold: {
      proposal: {
        outputs: [{
          handle: "decision",
          type: "DEC",
          payload: null,
          links: [
            justifies,
            { type: "blocks", target: { input: "candidate" } },
          ],
          body: null,
        }],
        completionEvidence: null,
      },
    },
  };

  const response = assignmentResponse(packet, [{
    output: "decision",
    links: [justifies],
    payload: { kind: "gate-signoff", gate_outcome: "approve" },
    body: "Approve the exact candidate.\n",
  }]);

  expect(response.proposal.outputs[0].links).toEqual([justifies]);
});

it("runs accepted-SYS evidence through lean Phase 6 at the public CLI", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase3-public-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await phaseThreePackage(parent));

    const seed = nextPacket(repository, "seed-system-definitions@1");
    const seeded = submit(repository, seed, [
      {
        output: "product",
        payload: {
          title: "Bounded value checker",
          rationale: "Provide one narrow observable product boundary.",
          problem: "An operator needs one exact valid or invalid result.",
          users: ["operator"],
          goals: ["Report whether one value is valid"],
          non_goals: ["Choose implementation details"],
          success_measures: ["The result is deterministic"],
        },
        body: "One bounded product intent.\n",
      },
      {
        output: "stakeholder_requirement",
        payload: {
          title: "Report one validity result",
          rationale: "Expose one stakeholder-visible judgment.",
          statement: "The product shall report whether one supplied value is valid.",
          verification_intent: "Observe one valid and one invalid value.",
          stakeholder: "operator",
          priority: "must",
          system_context: "value-check",
        },
        body: "One exact stakeholder requirement.\n",
      },
      {
        output: "system_requirement",
        payload: {
          title: "Classify one supplied value",
          rationale: "Allocate the exact observable system behavior.",
          statement: "The system shall classify one supplied value deterministically.",
          verification_intent: "Compare the reported class with the supplied value.",
        },
        body: "One exact system requirement.\n",
      },
      ...["stakeholder", "system"].map((level) => ({
        output: `${level}_strategy`,
        payload: {
          title: `${level} black-box strategy`,
          rationale: "Preserve the accepted source-blind upstream verification boundary.",
          level,
          permitted_methods: [level === "stakeholder" ? "demonstration" : "test"],
          independence: {
            boundary: "black-box",
            prohibited_inputs: [
              "product source code",
              "product unit tests",
              "private implementation details",
              "uncontrolled implementation shortcuts",
            ],
          },
          evidence_policy: "Retain exact authored verification evidence.",
          assessment_policy: "Judge the exact observable requirement claim.",
          environment_profile: {
            id: `${level}-formal`, purpose: "Author formal verification specifications.",
            capabilities: { controllability: ["literal value"], observability: ["reported class", "exit status"], external_services: [], timing: "bounded" },
          },
        },
        body: `One accepted ${level} strategy.\n`,
      })),
    ]);
    commit(repository, "Publish exact system ancestry");
    const product = publication(seeded, "product");
    const system = publication(seeded, "system_requirement");
    const stakeholder = publication(seeded, "stakeholder_requirement");
    const upstreamStrategies = [
      publication(seeded, "stakeholder_strategy"),
      publication(seeded, "system_strategy"),
    ];
    const upstreamDefinitionReviews = [
      review(repository, stakeholder),
      review(repository, system),
    ];
    expect(upstreamDefinitionReviews).toHaveLength(2);
    const acceptancePacket = nextPacket(
      repository,
      "seed-accepted-system-slice@1",
    );
    const accepted = submit(repository, acceptancePacket, [
      {
        output: "accepted",
        payload: {
          title: "Accepted system slice",
          kind: "level-accepted",
          role: "accepted",
          scope: "phase-3-public-test",
          group: "DEFAULT",
          definition_members: [product, stakeholder, system, ...upstreamStrategies],
          evidence: [],
        },
        body: "The exact system slice is accepted test evidence.\n",
      },
      {
        output: "accepted_intent",
        payload: {
          title: "Accepted stakeholder intent",
          kind: "intent-approved",
          role: "accepted",
          scope: "phase-3-public-test",
          group: "DEFAULT",
          definition_members: [product, stakeholder, upstreamStrategies[0]],
          evidence: [],
        },
        body: "The exact stakeholder scope is accepted test evidence.\n",
      },
    ]);
    expect(publication(accepted, "accepted")).toMatch(/^BSL-/);
    const acceptedIntent = publication(accepted, "accepted_intent");
    expect(acceptedIntent).toMatch(/^BSL-/);
    commit(repository, "Publish exact accepted system slice");

    const strategyPacket = nextPacket(
      repository,
      "define-lower-level-verification-strategy@1",
    );
    const strategyResult = submit(repository, strategyPacket, [{
      output: "strategy",
      payload: {
        title: "Component black-box strategy",
        rationale: "Judge the controlled boundary without implementation knowledge.",
        level: "component",
        permitted_methods: ["test"],
        independence: {
          boundary: "black-box",
          prohibited_inputs: [
            "product source code",
            "product unit tests",
            "private implementation details",
            "uncontrolled implementation shortcuts",
          ],
        },
        evidence_policy: "Retain exact inputs, outputs, and exit status.",
        assessment_policy: "Compare the reported class with the supplied value.",
        environment_profile: {
          id: "component-cli",
          purpose: "Exercise the controlled component boundary.",
          capabilities: {
            controllability: ["literal value"],
            observability: ["reported class", "exit status"],
            external_services: [],
            timing: "bounded",
          },
        },
      },
      body: "One black-box component strategy.\n",
    }]);
    commit(repository, "Publish component strategy");
    const strategy = publication(strategyResult, "strategy");

    const architecturePacket = nextPacket(
      repository,
      "define-component-architecture@1",
    );
    expect(inputRevisions(architecturePacket, "requirements")).toEqual([system]);
    const architectureResult = submit(repository, architecturePacket, [{
      output: "architecture",
      payload: {
        title: "Classifier component architecture",
        rationale: "Separate input classification from result reporting.",
        level: "component",
        elements: [
          {
            id: "AEL-CMPDEF00001",
            alias: "CLASSIFIER",
            title: "Classifier",
            responsibilities: ["Classify the supplied value"],
          },
          {
            id: "AEL-CMPDEF00002",
            alias: "REPORTER",
            title: "Reporter",
            responsibilities: ["Report the classification result"],
          },
        ],
        internal_interactions: ["Classifier sends one class to Reporter"],
        controlled_boundaries: [{
          from_element: "AEL-CMPDEF00001",
          to_element: "AEL-CMPDEF00002",
        }],
        constraints: ["Keep the boundary solution-independent"],
        nominated_risks: ["Classification and reporting could disagree"],
      },
      body: "Two components with one controlled boundary.\n",
    }]);
    commit(repository, "Publish component architecture");
    const architecture = publication(architectureResult, "architecture");

    const interfacePacket = nextPacket(
      repository,
      "define-interface-control-specification@2",
    );
    const interfaceResult = submit(repository, interfacePacket, [{
      output: "interface",
      payload: {
        title: "Classification result boundary",
        rationale: "Control the only cross-component result transfer.",
        architecture_revision: architecture,
        boundaries: [{
          from_element: "AEL-CMPDEF00001",
          to_element: "AEL-CMPDEF00002",
        }],
        operations: ["report-classification"],
        schemas: ["classification is valid or invalid"],
        units: [],
        timing: ["one result per supplied value"],
        errors: ["missing classification is rejected"],
        security: [],
        ordering: ["classify before report"],
        compatibility: ["unknown classifications are rejected"],
        interface_version: "1",
      },
      body: "One controlled component interface.\n",
    }]);
    commit(repository, "Publish component interface");
    const interfaceRevision = publication(interfaceResult, "interface");

    const planPacket = nextPacket(
      repository,
      "define-decomposition-work-package@4",
    );
    const planResult = submit(repository, planPacket, [{
      output: "plan",
      payload: {
        title: "Classification component slice",
        rationale: "Allocate classification and reporting without design detail.",
        stage: "planning",
        architecture_element: "AEL-CMPDEF00001",
        target_child_type: "CMP",
        behavioral_slice: "Classify and report one supplied value.",
        expected_coverage: ["The accepted system classification behavior"],
        exclusions: ["Implementation and formal verification"],
        dependencies: [system, architecture, interfaceRevision, strategy],
        required_review_policy: "review-applicability@1",
      },
      body: "One bounded SYS-to-CMP decomposition plan.\n",
    }]);
    commit(repository, "Publish component decomposition plan");
    const plan = publication(planResult, "plan");

    const executionPacket = nextPacket(
      repository,
      "execute-lower-level-decomposition-work-package@1",
    );
    const componentTemplate = executionPacket.responseScaffold.proposal.outputs.find(
      (output: Json) => (output.output ?? output.handle) === "component_requirements",
    );
    expect(componentTemplate).toBeDefined();
    const executionResult = submit(repository, executionPacket, [
      {
        output: "component_requirements",
        handle: "classifier-requirement",
        payload: {
          title: "Classify the supplied value",
          rationale: "Allocate the classification responsibility.",
          statement: "The classifier component shall classify one supplied value.",
          verification_intent: "Observe the class at the controlled boundary.",
          architecture_allocation: {
            architecture_revision: architecture,
            element: "AEL-CMPDEF00001",
          },
        },
        body: "One solution-independent classifier requirement.\n",
      },
      {
        output: "component_requirements",
        handle: "reporter-requirement",
        payload: {
          title: "Report the classification",
          rationale: "Allocate the reporting responsibility.",
          statement: "The reporter component shall report the supplied classification.",
          verification_intent: "Observe the exact reported class.",
          architecture_allocation: {
            architecture_revision: architecture,
            element: "AEL-CMPDEF00002",
          },
        },
        body: "One solution-independent reporter requirement.\n",
      },
    ]);
    commit(repository, "Publish two component requirements");
    const classifier = publication(executionResult, "classifier-requirement");
    const reporter = publication(executionResult, "reporter-requirement");

    for (const component of [classifier, reporter]) {
      const shown = mdlm(repository, "show", component, "--json");
      expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
      const datum = JSON.parse(shown.stdout).lifecycleDatum.datum;
      expect(datum.links).toEqual(expect.arrayContaining([
        { type: "derived-from", target: system },
        { type: "decomposes", target: plan },
        { type: "allocated-to", target: architecture },
        { type: "governed-by", target: interfaceRevision },
      ]));
    }
    const shownSystem = mdlm(repository, "show", system, "--json");
    expect(JSON.parse(shownSystem.stdout).lifecycleDatum.datum.links).toContainEqual({
      type: "derived-from",
      target: stakeholder,
    });

    const completionPacket = nextPacket(
      repository,
      "complete-decomposition-work-package@3",
    );
    expect(inputRevisions(completionPacket, "outputs")).toEqual([
      classifier,
      reporter,
    ].sort());
    const completionResult = submit(repository, completionPacket, [{
      output: "completion",
      payload: {
        title: "Completed classification component slice",
        rationale: "Account for the complete coherent CMP set.",
        stage: "completion",
        architecture_element: "AEL-CMPDEF00001",
        target_child_type: "CMP",
        behavioral_slice: "Classify and report one supplied value.",
        expected_coverage: ["The accepted system classification behavior"],
        exclusions: ["Implementation and formal verification"],
        dependencies: [system, architecture, interfaceRevision, strategy],
        required_review_policy: "review-applicability@1",
      },
      body: "The exact coherent component definition is complete.\n",
    }]);
    commit(repository, "Complete component decomposition");
    const completion = publication(completionResult, "completion");
    expect(completion.replace(/-r[0-9]{5}$/, "")).toBe(
      plan.replace(/-r[0-9]{5}$/, ""),
    );

    const formalActivities = Array.from(
      { length: 4 },
      () => publishFormalActivity(repository),
    );

    const missingReview = next(repository);
    expect(missingReview.outcome, JSON.stringify(missingReview)).toBe("publication-required");
    expect(missingReview.assignment).toBeUndefined();
    expect(missingReview.materializedExecutions.length).toBeGreaterThanOrEqual(5);
    expect(
      git(repository, "status", "--porcelain", "--", ".lifecycle/data").stdout,
    ).not.toBe("");
    expect(
      git(repository, "grep", "-l", 'kind: level-candidate', "--", ".lifecycle/data").stdout,
    ).toBe("");
    expect(
      git(repository, "grep", "-l", 'kind: gate-signoff', "--", ".lifecycle/data").stdout,
    ).toBe("");
    const doctor = mdlm(repository, "doctor", "--json");
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    commit(repository, "Publish coherent definition Review Context");

    const correctionRepository = path.join(parent, "correction-repository");
    await fs.cp(repository, correctionRepository, { recursive: true });

    const reviews: string[] = [];
    const environmentPacket = nextAfterReviews(repository, "realize-verification-environment@1", reviews);
    const environmentResult = submit(repository, environmentPacket, [
      { output: "environment", payload: {
        title: "Component pilot environment", rationale: "Realize the exact component strategy.",
        strategy_revision: strategy, profile_id: "component-cli",
        capabilities: { controllability: ["literal value"], observability: ["reported class", "exit status"], external_services: [], timing: "bounded" },
        reproducibility: { environment_ref: "fixture@1", configuration_digest: `sha256:${"0".repeat(64)}`, reconstruction: "Recreate the fixture." },
      }, body: "One reproducible environment.\n" },
      { output: "qualification_activity", payload: {
        title: "Qualify the component environment", rationale: "Check its declared capabilities.", kind: "qualification", method: "test", assessment_mode: "automatic",
        claim: { kind: "qualification", scope: "environment-capability", formal_evidence_eligible: false },
        acceptance_criteria: ["Capabilities are observable."], evidence_requirements: ["Retain observations."],
        expected_success_activity: "Exercise a declared capability.", expected_discrimination_activity: "Reject an undeclared capability.",
      }, body: "One qualification activity.\n" },
      { output: "qualification_implementation", payload: {
        title: "Environment qualification procedure", rationale: "Exercise positive and negative capability controls.", kind: "qualification",
        implementation_ref: `procedure:sha256:${"1".repeat(64)}`, independence_mode: "environment-capability",
        authoring_input_refs: [strategy], prohibited_inputs_observed: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"],
        activity_bindings: ["positive capability", "negative capability"],
        target_behavior: { supported: ["declared capabilities"], intentionally_unsupported: ["undeclared capabilities"] },
        execution_procedure: { content: "Run the positive and negative capability controls.", deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 }, deadline_scope: "infrastructure-safety-only", timeout: { termination: "process-group-sigterm-then-sigkill", force_after_ms: 100, reaping: "all-descendants", capture_partial_raw_observation: true }, cleanup: "guaranteed", aggregation: "continue-through-all-cases" },
      }, body: "One qualification procedure.\n" },
    ]);
    commit(repository, "Realize component pilot environment");
    const environment = publication(environmentResult, "environment");

    const qualificationPacket = nextPacket(repository, "execute-verification-run@2");
    const qualificationResult = submit(repository, qualificationPacket, [
      { output: "run", payload: {
        title: "Environment qualification run", kind: "qualification", started_at: "2026-08-31T00:00:00Z", completed_at: "2026-08-31T00:00:01Z", execution_state: "completed",
        execution_target: { kind: "environment", ref: environment }, runner_ref: "fixture-runner@1", configuration_refs: [strategy],
        activities_expected: ["capability"], activities_invoked: ["capability"], evidence_locations: ["inline:qualification"],
      }, body: "One immutable qualification run.\n" },
      { output: "result", payload: {
        title: "Passing environment qualification", claim: { kind: "qualification", scope: "environment-capability", outcome: "pass", formal_evidence_eligible: false },
        assessment_state: "accepted", observations: { expected_success_observed: true, expected_discrimination_observed: true, details: "Both controls behaved as declared." },
        evidence_refs: ["inline:qualification"], assessor_ref: "fixture-assessor@1",
      }, body: "The environment is suitable.\n" },
    ]);
    commit(repository, "Qualify component pilot environment");
    const pilotPacket = nextAfterReviews(repository, "write-representative-level-pilot-verification-activity@1", reviews);
    const pilotResult = submit(repository, pilotPacket, [{ output: "activity", payload: {
      title: "Component boundary pilot", rationale: "Discriminate good and bad behavior without source.", kind: "pilot", method: "test", assessment_mode: "automatic",
      claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false }, acceptance_criteria: ["Good passes and bad fails."],
      evidence_requirements: ["Retain both observations."], expected_success_activity: "valid classification", expected_discrimination_activity: "invalid classification",
    }, body: "One component pilot activity.\n" }]);
    commit(repository, "Publish component pilot activity");
    const pilotActivity = publication(pilotResult, "activity");
    const targetPacket = nextAfterReviews(repository, "build-representative-level-pilot-control-prototype@1", reviews);
    const targetResult = submit(repository, targetPacket, [{ output: "target", payload: {
      title: "Disposable classification controls", kind: "prototype",
      supported_behavior: ["valid classification"], unsupported_behavior: ["invalid classification"],
      prototype_controls: { activity_ref: pilotActivity, working_directory: "fresh-temporary-directory",
        known_good: { argv: ["node", "-e", "process.exit(0)"], expected_observation: { exit_status: 0, stdout: { encoding: "base64", bytes: "" }, stderr: { encoding: "base64", bytes: "" } }, expected_verification_outcome: "pass" },
        known_bad: { argv: ["node", "-e", "process.exit(2)"], expected_observation: { exit_status: 2, stdout: { encoding: "base64", bytes: "" }, stderr: { encoding: "base64", bytes: "" } }, expected_verification_outcome: "fail", fault: "Wrong exit status" } },
    }, body: "One disposable good and bad prototype pair.\n" }]);
    commit(repository, "Publish component pilot controls");
    const target = publication(targetResult, "target");

    const implementationPacket = nextPacket(repository, "implement-verification-activity@1");
    const implementationResult = submit(repository, implementationPacket, [
      { output: "implementation", payload: {
        title: "Source-blind component pilot", rationale: "Execute only the declared controls.", kind: "pilot", implementation_ref: `procedure:sha256:${"2".repeat(64)}`, independence_mode: "source-blind",
        authoring_input_refs: [pilotActivity, environment, target], prohibited_inputs_observed: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"],
        activity_bindings: ["known_good", "known_bad"], target_behavior: { supported: ["valid classification"], intentionally_unsupported: ["invalid classification"] },
        prototype_control_bindings: { activity_ref: pilotActivity, known_good: { argv: ["node", "-e", "process.exit(0)"], expected_verification_outcome: "pass" }, known_bad: { argv: ["node", "-e", "process.exit(2)"], expected_verification_outcome: "fail" } },
        execution_procedure: { deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 }, deadline_scope: "infrastructure-safety-only", timeout: { termination: "process-group-sigterm-then-sigkill", force_after_ms: 100, reaping: "all-descendants", capture_partial_raw_observation: true }, cleanup: "guaranteed", aggregation: "continue-through-all-cases" },
      }, body: "One source-blind pilot procedure.\n" },
      { output: "authorization", payload: { title: "Authorize pilot procedure", rationale: "The bounded exact controls preserve independence.", kind: "decision", decision: "Authorize the exact procedure.", alternatives: ["Do not run."], effective_scope: "$proposal.implementation.revision_id" }, body: "Authorize only this procedure.\n" },
    ]);
    commit(repository, "Implement component pilot");
    const implementation = publication(implementationResult, "implementation");
    const runPacket = nextAfterReviews(repository, "execute-verification-run@2", reviews);
    const observation = (control: string, argv: string[], exit_status: number) => ({ artifact_ref: target, control, activity_ref: pilotActivity, argv, working_directory: "fresh-temporary-directory", stdin: { encoding: "base64", bytes: "" }, stdout: { encoding: "base64", bytes: "" }, stderr: { encoding: "base64", bytes: "" }, exit_status, timed_out: false, truncated: false });
    const runResult = submit(repository, runPacket, [
      { output: "run", payload: { title: "Component pilot run", kind: "pilot", started_at: "2026-08-31T00:00:02Z", completed_at: "2026-08-31T00:00:03Z", execution_state: "completed", execution_target: { kind: "prototype", ref: target }, runner_ref: "fixture-runner@1", configuration_refs: [implementation], activities_expected: ["known_good", "known_bad"], activities_invoked: ["known_good", "known_bad"], evidence_locations: ["inline:pilot"], control_observations: { known_good: observation("known_good", ["node", "-e", "process.exit(0)"], 0), known_bad: observation("known_bad", ["node", "-e", "process.exit(2)"], 2) } }, body: "One immutable pilot run.\n" },
      { output: "result", payload: { title: "Suitable component pilot", claim: { kind: "pilot", scope: "verification-design", outcome: "suitable", formal_evidence_eligible: false }, assessment_state: "accepted", observations: { expected_success_observed: true, expected_discrimination_observed: true, details: "Good passed and bad failed." }, control_judgments: { known_good: { observation_ref: "known_good", outcome: "pass" }, known_bad: { observation_ref: "known_bad", outcome: "fail" } }, evidence_refs: ["inline:pilot"], assessor_ref: "fixture-assessor@1" }, body: "The pilot discriminates correctly.\n" },
    ]);
    commit(repository, "Execute component pilot");

    const candidatePacket = nextAfterReviews(repository, "create-definition-level-candidate@1", reviews);
    expect(inputRevisions(candidatePacket, "definition_members")).toEqual(
      expect.arrayContaining([classifier, reporter, architecture, interfaceRevision, plan, completion, strategy, ...formalActivities]),
    );
    const candidateResult = submit(repository, candidatePacket, [{
      output: "candidate",
      payload: {
        title: "Component definition candidate",
        kind: "level-candidate",
        role: "candidate",
        scope: completion,
        group: "DEFAULT",
        definition_members: inputRevisions(candidatePacket, "definition_members"),
        evidence: inputRevisions(candidatePacket, "evidence"),
      },
      body: "One direct coherent component candidate.\n",
    }]);
    commit(repository, "Publish component candidate");
    const candidate = publication(candidateResult, "candidate");
    reviews.push(review(repository, candidate));

    const gatePacket = nextAfterReviews(repository, "record-gate-signoff@3", reviews);
    expect(inputRevisions(gatePacket, "candidate")).toEqual([candidate]);
    const gateResult = submit(repository, gatePacket, [{
      output: "decision",
      links: [{ type: "justifies", target: { input: "candidate" } }],
      payload: {
        title: "Approve the component definition",
        rationale: "The exact candidate and independent Review support progression.",
        kind: "gate-signoff",
        decision: "Approve this exact component candidate.",
        alternatives: ["Reject and correct the candidate."],
        effective_scope: candidate,
        gate_outcome: "approve",
      },
      body: "The stakeholder approves the exact candidate.\n",
    }], "stakeholder");
    commit(repository, "Approve component candidate");
    const decision = publication(gateResult, "decision");
    reviews.push(review(repository, decision));

    const designStrategyPacket = nextAfterReviews(repository, "define-lower-level-verification-strategy@1", reviews);
    const designStrategyResult = submit(repository, designStrategyPacket, [{ output: "strategy", payload: {
      title: "Design black-box strategy", rationale: "Judge exact design claims without implementation knowledge.", level: "design", permitted_methods: ["test"],
      independence: { boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"] },
      evidence_policy: "Retain exact authored verification evidence.", assessment_policy: "Judge each exact design claim.",
      environment_profile: { id: "design-formal", purpose: "Author design verification specifications.", capabilities: { controllability: ["literal value"], observability: ["reported class", "exit status"], external_services: [], timing: "bounded" } },
    }, body: "One reusable design strategy.\n" }]);
    commit(repository, "Publish design strategy");
    const designStrategy = publication(designStrategyResult, "strategy");

    const designPlanPacket = nextAfterReviews(repository, "define-decomposition-work-package@4", reviews);
    const designPlanPayload = { title: "Classification design slice", rationale: "Derive implementable design without adding architecture.", stage: "planning", architecture_element: "AEL-CMPDEF00001", target_child_type: "DES", behavioral_slice: "Implement classification and reporting.", expected_coverage: ["Both component requirements"], exclusions: ["Product implementation"], dependencies: [classifier, reporter, architecture, interfaceRevision, designStrategy], required_review_policy: "review-applicability@1" };
    const designPlanResult = submit(repository, designPlanPacket, [{ output: "plan", payload: designPlanPayload, body: "One bounded CMP-to-DES plan.\n" }]);
    commit(repository, "Publish design decomposition plan");
    const designPlan = publication(designPlanResult, "plan");

    const designExecutionPacket = nextAfterReviews(repository, "execute-lower-level-decomposition-work-package@1", reviews);
    const designExecutionResult = submit(repository, designExecutionPacket, [
      { output: "design_requirements", handle: "classifier-design", payload: { title: "Evaluate the supplied value", rationale: "Implement the classifier responsibility.", statement: "The design shall evaluate the supplied value against the declared validity rule.", verification_intent: "Analyze the exact classification decision.", interface_effect: "unchanged", architecture_allocation: { architecture_revision: architecture, element: "AEL-CMPDEF00001" } }, body: "One classifier design requirement.\n" },
      { output: "design_requirements", handle: "reporter-design", payload: { title: "Emit the classification", rationale: "Implement the reporter responsibility.", statement: "The design shall emit the evaluated classification through the existing contract.", verification_intent: "Analyze the exact emitted classification.", interface_effect: "unchanged", architecture_allocation: { architecture_revision: architecture, element: "AEL-CMPDEF00002" } }, body: "One reporter design requirement.\n" },
    ]);
    commit(repository, "Publish two design requirements");
    const designs = [publication(designExecutionResult, "classifier-design"), publication(designExecutionResult, "reporter-design")];
    for (const design of designs) {
      const shown = JSON.parse(mdlm(repository, "show", design, "--json").stdout).lifecycleDatum.datum;
      expect(shown.links).toEqual(expect.arrayContaining([{ type: "decomposes", target: designPlan }, { type: "allocated-to", target: architecture }]));
    }

    const designCompletionPacket = nextAfterReviews(repository, "complete-decomposition-work-package@3", reviews);
    const designCompletionResult = submit(repository, designCompletionPacket, [{ output: "completion", payload: { ...designPlanPayload, stage: "completion" }, body: "The coherent design set is complete.\n" }]);
    commit(repository, "Complete design decomposition");
    const designCompletion = publication(designCompletionResult, "completion");

    const designFormalActivities = Array.from({ length: 2 }, () => publishFormalActivity(repository));
    const designCandidatePacket = nextAfterReviews(repository, "create-definition-level-candidate@1", reviews);
    expect(inputRevisions(designCandidatePacket, "definition_members")).toEqual(expect.arrayContaining([...designs, designPlan, designCompletion, designStrategy, ...designFormalActivities]));
    const designCandidateResult = submit(repository, designCandidatePacket, [{ output: "candidate", payload: { title: "Design definition candidate", kind: "level-candidate", role: "candidate", scope: designCompletion, group: "DEFAULT", definition_members: inputRevisions(designCandidatePacket, "definition_members"), evidence: inputRevisions(designCandidatePacket, "evidence") }, body: "One direct coherent design candidate.\n" }]);
    commit(repository, "Publish design candidate");
    const designCandidate = publication(designCandidateResult, "candidate");
    reviews.push(review(repository, designCandidate));

    const designGatePacket = nextAfterReviews(repository, "record-gate-signoff@3", reviews);
    const designGateResult = submit(repository, designGatePacket, [{ output: "decision", links: [{ type: "justifies", target: { input: "candidate" } }], payload: { title: "Approve the design definition", rationale: "The exact reviewed design preserves ancestry and isolation.", kind: "gate-signoff", decision: "Approve this exact design candidate.", alternatives: ["Reject and correct."], effective_scope: designCandidate, gate_outcome: "approve" }, body: "The stakeholder approves this design candidate.\n" }], "stakeholder");
    commit(repository, "Approve design candidate");
    reviews.push(review(repository, publication(designGateResult, "decision")));

    const promotionPacket = nextAfterReviews(repository, "promote-component-after-design-gate@1", reviews);
    const promotionResult = submit(repository, promotionPacket, [{ output: "accepted", payload: { title: "Accepted component definition", kind: "level-accepted", role: "accepted", scope: completion, group: "DEFAULT", definition_members: inputRevisions(promotionPacket, "component_members"), evidence: inputRevisions(promotionPacket, "design_authority_evidence") }, body: "Mechanically accept the exact component predecessor.\n" }]);
    commit(repository, "Promote exact component candidate");
    expect(publication(promotionResult, "accepted")).toMatch(/^BSL-/);

    const phaseFiveStart = git(repository, "rev-parse", "HEAD").stdout.trim();
    const formalImplementations: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const formalPacket = nextPacket(repository, "implement-verification-activity@1");
      expect(inputRevisions(formalPacket, "execution_target")).toEqual(
        inputRevisions(formalPacket, "environment"),
      );
      expect(
        formalPacket.exactInputs[0].inputs.flatMap((input: Json) => input.values)
          .some((value: Json) => value.identity?.type === "ART"),
      ).toBe(false);
      const activity = inputRevisions(formalPacket, "activity")[0]!;
      const formalEnvironment = inputRevisions(formalPacket, "environment")[0]!;
      if (index === 0) {
        const invalidImplementation = formalImplementationPayload(
          activity,
          formalEnvironment,
          index,
        );
        invalidImplementation.authoring_input_refs.push(
          "ART-0000000000-r00001",
        );
        const rejectedResponse = assignmentResponse(formalPacket, [
          {
            output: "implementation",
            payload: invalidImplementation,
            body: "A prohibited product ART appears in the authoring references.\n",
          },
          {
            output: "authorization",
            payload: {
              title: "Authorize invalid formal procedure",
              rationale: "This proposal deliberately crosses the source-blind boundary.",
              kind: "decision",
              decision: "Authorize this invalid formal procedure.",
              alternatives: ["Do not authorize."],
              effective_scope: "$proposal.implementation.revision_id",
            },
            body: "This proposal must reject before publication.\n",
          },
        ]);
        const rejected = mdlmWithInput(
          repository,
          `${JSON.stringify(rejectedResponse)}\n`,
          "scenario",
          "submit",
          "-",
          "--json",
        );
        expect(rejected.status).toBe(1);
        expect(rejected.stdout).toContain("scenario-completion-failed");
        expect(git(repository, "status", "--porcelain").stdout).toBe("");
      }
      const formalResult = submit(repository, formalPacket, [
        {
          output: "implementation",
          payload: formalImplementationPayload(activity, formalEnvironment, index),
          body: "One source-blind formal procedure.\n",
        },
        {
          output: "authorization",
          payload: {
            title: "Authorize exact formal procedure",
            rationale: "The exact source-blind inputs preserve independent verification authority.",
            kind: "decision",
            decision: "Authorize this exact formal procedure.",
            alternatives: ["Do not authorize."],
            effective_scope: "$proposal.implementation.revision_id",
          },
          body: "Authorize only the exact formal procedure.\n",
        },
      ]);
      commit(repository, `Implement formal verification activity ${index + 1}`);
      formalImplementations.push(publication(formalResult, "implementation"));
    }

    const phaseFiveFaultRepository = path.join(parent, "phase-five-fault-repository");
    await fs.cp(repository, phaseFiveFaultRepository, { recursive: true });

    const phaseFiveReviews: string[] = [];
    const reviewContexts = new Map<string, string>();
    const productPacket = nextAfterReviews(
      repository,
      "implement-design-set@1",
      phaseFiveReviews,
      reviewContexts,
    );
    expect(inputRevisions(productPacket, "design_requirements")).toEqual(
      [...designs].sort(),
    );
    const productRepository = path.join(parent, "product-repository");
    await fs.mkdir(productRepository);
    expect(git(productRepository, "init", "--quiet").status).toBe(0);
    await fs.writeFile(
      path.join(productRepository, "checker.mjs"),
      "const value = process.argv[2];\nprocess.exit(process.argv.length === 3 && value === 'valid' ? 0 : 2);\n",
    );
    expect(git(productRepository, "add", "checker.mjs").status).toBe(0);
    expect(git(
      productRepository,
      "-c", "user.name=MDLM Test",
      "-c", "user.email=mdlm-test@localhost",
      "-c", "commit.gpgSign=false",
      "commit", "--quiet", "--no-verify", "-m", "Implement bounded value checker",
    ).status).toBe(0);
    const productCommit = git(productRepository, "rev-parse", "HEAD").stdout.trim();
    const productResult = submit(repository, productPacket, [{
      output: "implementation",
      payload: implementationArtifactPayload(productCommit, productRepository, designs),
      body: "One controlled exact-commit product implementation.\n",
    }]);
    commit(repository, "Publish controlled product implementation");
    const productArtifact = publication(productResult, "implementation");

    const designAcceptancePacket = nextAfterReviews(
      repository,
      "accept-phase-2-system@1",
      phaseFiveReviews,
      reviewContexts,
    );
    expect(new Set(formalImplementations.map((item) => reviewContexts.get(item))).size)
      .toBe(1);
    const sharedFormalContext = reviewContexts.get(formalImplementations[0]!);
    expect(sharedFormalContext).toMatch(/^BSL-/);
    expect(inputRevisions(designAcceptancePacket, "candidate")).toEqual([designCandidate]);
    const designAcceptanceResult = submit(repository, designAcceptancePacket, [{
      output: "accepted",
      payload: {
        title: "Accepted design definition",
        kind: "level-accepted",
        role: "accepted",
        scope: exactInputs(designAcceptancePacket, "candidate")[0]!.data.payload.scope,
        group: "DEFAULT",
        definition_members: inputRevisions(designAcceptancePacket, "definition_members"),
        evidence: inputRevisions(designAcceptancePacket, "evidence"),
      },
      body: "Mechanically accept the exact reviewed implementation evidence.\n",
    }]);
    commit(repository, "Accept exact design implementation evidence");
    const acceptedDesign = publication(designAcceptanceResult, "accepted");
    expect(acceptedDesign).toMatch(/^BSL-/);

    const phaseFiveFirstRevisions = git(
      repository,
      "diff", "--name-only", `${phaseFiveStart}..HEAD`, "--", ".lifecycle/data",
    ).stdout.trim().split("\n").filter((name) => /r00001\.md$/.test(name));
    expect(phaseFiveFirstRevisions).toHaveLength(3 * formalImplementations.length + 5);
    expect(formalImplementations).toHaveLength(6);
    expect(phaseFiveReviews).toHaveLength(formalImplementations.length + 1);
    expect(reviewContexts.get(productArtifact)).not.toBe(sharedFormalContext);
    expect(new Set(reviews).size).toBe(reviews.length);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");

    const phaseSixStart = git(repository, "rev-parse", "HEAD").stdout.trim();
    const phaseSixFaultRepository = path.join(parent, "phase-six-fault-repository");
    await fs.cp(repository, phaseSixFaultRepository, { recursive: true });

    const phaseSixRuns: string[] = [];
    const phaseSixResults: string[] = [];
    const phaseSixReviews: string[] = [];
    const executionLevels: string[] = [];
    let witnessedResult: string | undefined;
    let witnessedReview: string | undefined;
    for (let index = 0; index < formalImplementations.length; index += 1) {
      const executionPacket = nextPacket(repository, "execute-verification-run@2");
      const requirement = exactInputs(executionPacket, "requirement")[0]!;
      executionLevels.push(requirement.identity.type);
      expect(inputRevisions(executionPacket, "execution_target")).toEqual([productArtifact]);
      expect(formalImplementations)
        .toContain(inputRevisions(executionPacket, "implementation")[0]);
      const executionResult = submit(
        repository,
        executionPacket,
        formalExecutionOutputs(executionPacket, productArtifact, index, "completed", "pass"),
      );
      commit(repository, `Execute formal ${requirement.identity.type} claim ${index + 1}`);
      phaseSixRuns.push(publication(executionResult, "run"));
      const result = publication(executionResult, "result");
      phaseSixResults.push(result);
      if (requirement.identity.type === "STK") {
        witnessedResult = result;
        phaseSixReviews.push(review(repository, architecture));
        phaseSixReviews.push(review(repository, interfaceRevision));
        phaseSixReviews.push(review(repository, product));
        witnessedReview = review(repository, result);
        phaseSixReviews.push(witnessedReview);
      }
    }
    expect(executionLevels).toEqual(["DES", "DES", "CMP", "CMP", "SYS", "STK"]);
    expect(phaseSixRuns).toHaveLength(6);
    expect(phaseSixResults).toHaveLength(6);
    expect(witnessedResult).toMatch(/^RES-/);
    expect(witnessedReview).toMatch(/^REV-/);

    const acceptanceDecisionPacket = nextPacket(repository, "record-product-acceptance@1");
    expect(inputRevisions(acceptanceDecisionPacket, "subject")).toEqual([acceptedIntent]);
    const acceptanceEvidence = inputRevisions(acceptanceDecisionPacket, "evidence");
    expect(new Set(acceptanceEvidence)).toEqual(new Set([
      productArtifact,
      stakeholder,
      ...phaseSixResults,
      witnessedReview!,
    ]));
    const acceptanceDecisionResult = submit(repository, acceptanceDecisionPacket, [{
      output: "decision",
      payload: {
        title: "Accept the verified bounded value checker",
        rationale: "Every exact accepted claim has applicable formal evidence against the controlled product.",
        kind: "product-acceptance",
        decision: "approve",
        alternatives: ["Reject the product."],
        effective_scope: acceptedIntent,
      },
      body: "The stakeholder accepts this exact controlled product and evidence set.\n",
    }], "stakeholder");
    commit(repository, "Record attended final product acceptance");
    const acceptanceDecision = publication(acceptanceDecisionResult, "decision");
    phaseSixReviews.push(review(repository, acceptanceDecision));

    const lifecycleComplete = terminalAfterReviews(repository, phaseSixReviews);
    expect(lifecycleComplete, JSON.stringify(lifecycleComplete)).toMatchObject({
      outcome: "lifecycle-complete",
      phase: "phase-6-verification@1",
    });
    expect(phaseSixReviews).toHaveLength(6);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");

    const infrastructurePacket = nextPacket(
      phaseSixFaultRepository,
      "execute-verification-run@2",
    );
    expect(exactInputs(infrastructurePacket, "requirement")[0]!.identity.type)
      .toBe("DES");
    const infrastructureAttempt = infrastructurePacket.responseScaffold.assignment;
    const infrastructureResult = submit(
      phaseSixFaultRepository,
      infrastructurePacket,
      formalExecutionOutputs(
        infrastructurePacket,
        productArtifact,
        20,
        "infrastructure-error",
        "inconclusive",
      ),
    );
    commit(phaseSixFaultRepository, "Preserve inconclusive infrastructure attempt");
    const infrastructureRun = publication(infrastructureResult, "run");
    const infrastructureEvidence = publication(infrastructureResult, "result");
    expect(git(
      phaseSixFaultRepository,
      "grep", "-l", "kind: problem-report", "--", ".lifecycle/data",
    ).status).toBe(1);

    const failingPacket = nextPacket(
      phaseSixFaultRepository,
      "execute-verification-run@2",
    );
    expect(failingPacket.responseScaffold.assignment).not.toBe(infrastructureAttempt);
    expect(inputRevisions(failingPacket, "implementation"))
      .toEqual(inputRevisions(infrastructurePacket, "implementation"));
    expect(inputRevisions(failingPacket, "requirement"))
      .toEqual(inputRevisions(infrastructurePacket, "requirement"));
    expect(exactInputs(failingPacket, "activity")[0]!.data.payload.assessment_mode)
      .toBe("automatic");
    const failingResult = submit(
      phaseSixFaultRepository,
      failingPacket,
      formalExecutionOutputs(failingPacket, productArtifact, 21, "completed", "fail"),
    );
    commit(phaseSixFaultRepository, "Preserve completed formal product failure");
    const failingRun = publication(failingResult, "run");
    const failingEvidence = publication(failingResult, "result");
    expect(failingRun).not.toBe(infrastructureRun);
    expect(failingEvidence).not.toBe(infrastructureEvidence);

    const problemPacket = nextPacket(phaseSixFaultRepository, "report-problem@1");
    expect(inputRevisions(problemPacket, "result")).toEqual([failingEvidence]);
    const problemResult = submit(phaseSixFaultRepository, problemPacket, [{
      output: "problem",
      payload: {
        title: "Controlled product fails one exact design claim",
        rationale: "The immutable completed formal result establishes a product failure.",
        condition: "The controlled product did not satisfy the exact design requirement.",
        severity: "major",
        disposition: "open",
        evidence_refs: [failingEvidence],
      },
      body: "One exact ordinary Problem Report preserves the formal failure.\n",
    }]);
    commit(phaseSixFaultRepository, "Report exact formal product failure");
    const problem = publication(problemResult, "problem");
    expect(problem).toMatch(/^PRB-/);
    const phaseSixFaultFiles = git(
      phaseSixFaultRepository,
      "diff", "--name-only", `${phaseSixStart}..HEAD`, "--", ".lifecycle/data",
    ).stdout.trim().split("\n").filter(Boolean);
    expect(phaseSixFaultFiles.filter((name) => /\/RUN-.*-r00001\.md$/.test(name)))
      .toHaveLength(2);
    expect(phaseSixFaultFiles.filter((name) => /\/RES-.*-r00001\.md$/.test(name)))
      .toHaveLength(2);
    expect(phaseSixFaultFiles.filter((name) => /\/PRB-.*-r00001\.md$/.test(name)))
      .toHaveLength(1);
    expect(phaseSixFaultFiles.some((name) => /\/DEC-/.test(name))).toBe(false);
    expect(git(phaseSixFaultRepository, "status", "--porcelain").stdout).toBe("");
    expect(next(phaseSixFaultRepository)).toMatchObject({
      outcome: "profile-boundary-reached",
      phase: "phase-6-verification@1",
    });

    const faultProductPacket = nextPacket(
      phaseFiveFaultRepository,
      "implement-design-set@1",
    );
    const incompleteArtifactResult = submit(
      phaseFiveFaultRepository,
      faultProductPacket,
      [{
        output: "implementation",
        payload: {
          ...implementationArtifactPayload(productCommit, productRepository, designs),
          design_path_mapping: [{
            design_revision: designs[0],
            paths: ["checker.mjs"],
          }],
        },
        body: "One deliberately incomplete DES mapping.\n",
      }],
    );
    commit(phaseFiveFaultRepository, "Publish incomplete product mapping");
    const incompleteArtifact = publication(
      incompleteArtifactResult,
      "implementation",
    );

    let failedArtifactReview: { context: string; review: string } | undefined;
    for (;;) {
      const outcome = next(phaseFiveFaultRepository);
      if (outcome.outcome === "publication-required") {
        commit(phaseFiveFaultRepository, "Publish Phase 5 fault Review Contexts");
        continue;
      }
      const packet = outcome.assignment?.packet;
      expect(packet, JSON.stringify(outcome)).toBeDefined();
      expect(packet.scenario.reference).toBe("review-datum-in-context@3");
      const subject = inputRevisions(packet, "subject")[0]!;
      if (subject === incompleteArtifact) {
        failedArtifactReview = submitFailedReview(
          phaseFiveFaultRepository,
          packet,
          subject,
          "The DES-to-path mapping must cover every exact candidate DES Revision.",
        );
        break;
      }
      submitReview(phaseFiveFaultRepository, packet, subject);
    }
    expect(failedArtifactReview).toBeDefined();

    const artifactCorrectionPacket = nextPacket(
      phaseFiveFaultRepository,
      "revise-implementation-artifact-after-review@1",
    );
    expect(inputRevisions(artifactCorrectionPacket, "implementation"))
      .toEqual([incompleteArtifact]);
    const artifactCorrectionResult = submit(
      phaseFiveFaultRepository,
      artifactCorrectionPacket,
      [{
        output: "replacement",
        payload: implementationArtifactPayload(productCommit, productRepository, designs),
        body: "The same-lineage artifact now maps every exact DES Revision.\n",
      }],
    );
    commit(phaseFiveFaultRepository, "Correct product mapping in the same lineage");
    const correctedArtifact = publication(artifactCorrectionResult, "replacement");
    expect(correctedArtifact.replace(/-r[0-9]{5}$/, "")).toBe(
      incompleteArtifact.replace(/-r[0-9]{5}$/, ""),
    );
    const correctedArtifactReviewPacket = nextPacket(
      phaseFiveFaultRepository,
      "review-datum-in-context@3",
    );
    expect(inputRevisions(correctedArtifactReviewPacket, "subject"))
      .toEqual([correctedArtifact]);
    expect(inputRevisions(correctedArtifactReviewPacket, "review_context")[0])
      .not.toBe(failedArtifactReview!.context);
    const correctedArtifactReview = submitReview(
      phaseFiveFaultRepository,
      correctedArtifactReviewPacket,
      correctedArtifact,
    );

    const failingFormal = [...formalImplementations].sort().at(-1)!;
    const unaffectedFormalReviews = new Map<string, string>();
    const faultFormalContexts = new Map<string, string>();
    let failedFormalReview: { context: string; review: string } | undefined;
    while (unaffectedFormalReviews.size < formalImplementations.length - 1 || !failedFormalReview) {
      const packet = nextPacket(
        phaseFiveFaultRepository,
        "review-datum-in-context@3",
      );
      const subject = inputRevisions(packet, "subject")[0]!;
      faultFormalContexts.set(
        subject,
        inputRevisions(packet, "review_context")[0]!,
      );
      if (subject === failingFormal) {
        failedFormalReview = submitFailedReview(
          phaseFiveFaultRepository,
          packet,
          subject,
          "The formal procedure must state one complete executable judgment step.",
        );
      } else {
        unaffectedFormalReviews.set(
          subject,
          submitReview(phaseFiveFaultRepository, packet, subject),
        );
      }
    }
    expect(
      new Set([
        ...unaffectedFormalReviews.keys(),
        failingFormal,
      ].map((subject) => faultFormalContexts.get(subject))).size,
    ).toBe(1);

    const formalCorrectionPacket = nextPacket(
      phaseFiveFaultRepository,
      "revise-pilot-vai-after-review@3",
    );
    const correctedActivity = inputRevisions(formalCorrectionPacket, "activity")[0]!;
    const correctedEnvironment = inputRevisions(formalCorrectionPacket, "environment")[0]!;
    const formalCorrectionResult = submit(
      phaseFiveFaultRepository,
      formalCorrectionPacket,
      [
        {
          output: "replacement",
          payload: formalImplementationPayload(correctedActivity, correctedEnvironment, 99),
          body: "The same-lineage formal procedure now states the complete judgment step.\n",
        },
        {
          output: "authorization",
          payload: {
            title: "Authorize corrected formal procedure",
            rationale: "The correction addresses only the exact failed Review.",
            kind: "decision",
            decision: "Authorize the corrected exact procedure.",
            alternatives: ["Do not authorize."],
            effective_scope: "$proposal.replacement.revision_id",
          },
          body: "Authorize only this corrected formal procedure.\n",
        },
      ],
    );
    commit(phaseFiveFaultRepository, "Correct formal VAI in the same lineage");
    const correctedFormal = publication(formalCorrectionResult, "replacement");
    expect(correctedFormal.replace(/-r[0-9]{5}$/, "")).toBe(
      failingFormal.replace(/-r[0-9]{5}$/, ""),
    );
    const correctedFormalReviewPacket = nextPacket(
      phaseFiveFaultRepository,
      "review-datum-in-context@3",
    );
    expect(inputRevisions(correctedFormalReviewPacket, "subject"))
      .toEqual([correctedFormal]);
    expect(inputRevisions(correctedFormalReviewPacket, "review_context")[0])
      .not.toBe(failedFormalReview!.context);
    const correctedFormalReview = submitReview(
      phaseFiveFaultRepository,
      correctedFormalReviewPacket,
      correctedFormal,
    );
    const faultDesignAcceptancePacket = nextPacket(
      phaseFiveFaultRepository,
      "accept-phase-2-system@1",
    );
    const faultAcceptanceEvidence = new Set(
      inputRevisions(faultDesignAcceptancePacket, "evidence"),
    );
    expect(faultAcceptanceEvidence.size).toBe(phaseFiveReviews.length);
    expect(faultAcceptanceEvidence.has(correctedArtifactReview)).toBe(true);
    expect(faultAcceptanceEvidence.has(correctedFormalReview)).toBe(true);
    for (const reviewId of unaffectedFormalReviews.values()) {
      expect(faultAcceptanceEvidence.has(reviewId)).toBe(true);
    }

    const failedPacket = nextPacket(
      correctionRepository,
      "review-datum-in-context@3",
    );
    const failedContext = inputRevisions(failedPacket, "review_context")[0];
    expect(inputRevisions(failedPacket, "subject")).toEqual([completion]);
    const failedResult = submit(correctionRepository, failedPacket, [{
      output: "review",
      payload: {
        title: `Review ${completion}`,
        review_kind: "contextual",
        reviewer: "independent-reviewer",
        summary: "The completion account is ambiguous in the frozen definition set.",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [{
          id: "F-001",
          target: completion,
          relationship: "primary",
          severity: "blocking",
          summary: "Clarify the exact completion account.",
          criterion: "The DWP completion must account unambiguously for its frozen component set.",
          evidence: "The completion rationale does not identify how its exact outputs close the slice.",
          material_consequence: "The candidate could advance without an explicit exact-set completion judgment.",
        }],
        correction_authority: "package-evidence",
        outcome: "fail",
      },
      body: "One exact member-targeted Finding blocks the coherent component set.\n",
    }], "independent-reviewer");
    commit(correctionRepository, "Publish failed coherent definition Review");
    const failedReview = publication(failedResult, "review");

    const correctionPacket = nextPacket(
      correctionRepository,
      "revise-definition-completion-after-review@1",
    );
    expect(inputRevisions(correctionPacket, "completion")).toEqual([completion]);
    expect(inputRevisions(correctionPacket, "failed_reviews")).toEqual([failedReview]);
    const correctionResult = submit(correctionRepository, correctionPacket, [{
      output: "replacement",
      payload: {
        title: "Corrected classification component slice",
        rationale: "Preserve the exact slice while resolving the member-targeted Finding.",
        stage: "completion",
        architecture_element: "AEL-CMPDEF00001",
        target_child_type: "CMP",
        behavioral_slice: "Classify and report one supplied value.",
        expected_coverage: ["The accepted system classification behavior"],
        exclusions: ["Implementation and formal verification"],
        dependencies: [system, architecture, interfaceRevision, strategy],
        required_review_policy: "review-applicability@1",
      },
      body: "The same-lineage completion now addresses the exact failed Review.\n",
    }]);
    commit(correctionRepository, "Correct component completion in the same lineage");
    const correctedCompletion = publication(correctionResult, "replacement");
    expect(correctedCompletion.replace(/-r[0-9]{5}$/, "")).toBe(
      completion.replace(/-r[0-9]{5}$/, ""),
    );
    expect(correctedCompletion).not.toBe(completion);

    const freshContextOutcome = next(correctionRepository);
    expect(freshContextOutcome.outcome).toBe("publication-required");
    commit(correctionRepository, "Publish corrected coherent definition context");
    const freshReviewPacket = nextPacket(
      correctionRepository,
      "review-datum-in-context@3",
    );
    const freshContext = inputRevisions(freshReviewPacket, "review_context")[0];
    expect(freshContext).not.toBe(failedContext);
    const freshReview = submitReview(
      correctionRepository,
      freshReviewPacket,
      correctedCompletion,
    );
    expect(freshReview).not.toBe(failedReview);
    expect(mdlm(correctionRepository, "show", completion, "--json").status).toBe(0);
    expect(mdlm(correctionRepository, "show", failedReview, "--json").status).toBe(0);

    expect(git(correctionRepository, "status", "--porcelain").stdout).toBe("");
  } finally {
    if (process.env.MDLM_KEEP_PHASE5_TEST !== "1") {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }
}, 720_000);
