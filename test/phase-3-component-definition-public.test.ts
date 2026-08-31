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

function submit(
  repository: string,
  packet: Json,
  supplied: SuppliedOutput[],
  authority?: string,
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
      payload: output.payload,
      body: output.body,
    };
  });
  response.proposal.completionEvidence = {
    summary: `Completed ${packet.scenario.reference}.`,
  };
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
  profile.enabled.phases = ["phase-3-component-definition"];
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
    ],
    prompt_ref: "prompts/seed-accepted-system-slice.md@1",
    review_policy_ref: "review-applicability@1",
    completion: [
      "execution.integrity.contract_valid == true",
      '&& accepted.payload.kind == "level-accepted"',
      '&& accepted.payload.role == "accepted"',
      "&& accepted.storage.frozen == true",
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
        when: 'exists("phase-3-test-systems@1", {}) && none("phase-3-test-accepted-baselines@1", {})',
        reason: "Freeze the exact system ancestry as accepted evidence.",
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

it("runs the accepted-SYS Phase 3 slice through a reviewed gate", async () => {
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
    ]);
    commit(repository, "Publish exact system ancestry");
    const product = publication(seeded, "product");
    const system = publication(seeded, "system_requirement");
    const stakeholder = publication(seeded, "stakeholder_requirement");
    const acceptancePacket = nextPacket(
      repository,
      "seed-accepted-system-slice@1",
    );
    const accepted = submit(repository, acceptancePacket, [{
      output: "accepted",
      payload: {
        title: "Accepted system slice",
        kind: "level-accepted",
        role: "accepted",
        scope: "phase-3-public-test",
        group: "DEFAULT",
        definition_members: [product, stakeholder, system],
        evidence: [],
      },
      body: "The exact system slice is accepted test evidence.\n",
    }]);
    expect(publication(accepted, "accepted")).toMatch(/^BSL-/);
    commit(repository, "Publish exact accepted system slice");

    const strategyPacket = nextPacket(
      repository,
      "define-component-verification-strategy@1",
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
      "define-component-decomposition-work-package@1",
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
      "execute-component-decomposition-work-package@1",
    );
    const componentTemplate = executionPacket.responseScaffold.proposal.outputs.find(
      (output: Json) => (output.output ?? output.handle) === "requirements",
    );
    expect(componentTemplate).toBeDefined();
    const executionResult = submit(repository, executionPacket, [
      {
        output: "requirements",
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
        output: "requirements",
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
      "complete-component-decomposition-work-package@1",
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

    const missingReview = next(repository);
    expect(missingReview.outcome).toBe("publication-required");
    expect(missingReview.assignment).toBeUndefined();
    expect(missingReview.materializedExecutions).toHaveLength(1);
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

    const reviews = [review(repository, completion)];

    const candidatePacket = nextPacket(
      repository,
      "create-component-level-candidate@1",
    );
    expect(inputRevisions(candidatePacket, "definition_members")).toEqual(
      [classifier, reporter, architecture, interfaceRevision, plan, completion, strategy]
        .sort(),
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
        evidence: inputRevisions(candidatePacket, "definition_review"),
      },
      body: "One direct coherent component candidate.\n",
    }]);
    commit(repository, "Publish component candidate");
    const candidate = publication(candidateResult, "candidate");
    reviews.push(review(repository, candidate));

    const gatePacket = nextPacket(repository, "record-gate-signoff@3");
    expect(inputRevisions(gatePacket, "candidate")).toEqual([candidate]);
    const gateResult = submit(repository, gatePacket, [{
      output: "decision",
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

    const terminal = next(repository);
    expect(terminal).toMatchObject({
      outcome: "profile-boundary-reached",
      phase: "phase-3-component-definition@1",
    });
    expect(reviews).toHaveLength(3);
    expect(new Set(reviews).size).toBe(3);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");

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
      "revise-component-completion-after-review@1",
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

    const correctedCandidatePacket = nextPacket(
      correctionRepository,
      "create-component-level-candidate@1",
    );
    const correctedMembers = inputRevisions(
      correctedCandidatePacket,
      "definition_members",
    );
    const correctedReview = inputRevisions(
      correctedCandidatePacket,
      "definition_review",
    )[0];
    const correctedCandidateResult = submit(
      correctionRepository,
      correctedCandidatePacket,
      [{
        output: "candidate",
        payload: {
          title: "Corrected component definition candidate",
          kind: "level-candidate",
          role: "candidate",
          scope: correctedCompletion,
          group: "DEFAULT",
          definition_members: correctedMembers,
          evidence: [correctedReview],
        },
        body: "One corrected coherent component candidate.\n",
      }],
    );
    commit(correctionRepository, "Publish corrected component candidate");
    const correctedCandidate = publication(correctedCandidateResult, "candidate");

    const candidateReviewPacket = nextPacket(
      correctionRepository,
      "review-datum-in-context@3",
    );
    expect(inputRevisions(candidateReviewPacket, "subject")).toEqual([
      correctedCandidate,
    ]);
    const failedCandidateResult = submit(
      correctionRepository,
      candidateReviewPacket,
      [{
        output: "review",
        payload: {
          title: `Review ${correctedCandidate}`,
          review_kind: "contextual",
          reviewer: "independent-reviewer",
          summary: "The corrected candidate does not state its exact isolation judgment.",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          findings: [{
            id: "F-002",
            target: correctedCandidate,
            relationship: "primary",
            severity: "blocking",
            summary: "State the exact candidate isolation judgment.",
            criterion: "The direct candidate must be independently isolated from other slices.",
            evidence: "The candidate Review omits the isolation judgment.",
            material_consequence: "The stakeholder gate could receive a cross-slice candidate.",
          }],
          correction_authority: "package-evidence",
          outcome: "fail",
        },
        body: "The exact candidate requires evidence-preserving correction.\n",
      }],
      "independent-reviewer",
    );
    commit(correctionRepository, "Publish failed component candidate Review");
    const failedCandidateReview = publication(failedCandidateResult, "review");

    const candidateCorrectionPacket = nextPacket(
      correctionRepository,
      "revise-phase-2-candidate-after-review@2",
    );
    expect(inputRevisions(candidateCorrectionPacket, "candidate")).toEqual([
      correctedCandidate,
    ]);
    expect(inputRevisions(candidateCorrectionPacket, "failed_reviews")).toEqual([
      failedCandidateReview,
    ]);
    const candidateCorrectionResult = submit(
      correctionRepository,
      candidateCorrectionPacket,
      [{
        output: "replacement",
        payload: {
          title: "Evidence-preserving component candidate correction",
          kind: "level-candidate",
          role: "candidate",
          scope: correctedCompletion,
          group: "DEFAULT",
          definition_members: inputRevisions(
            candidateCorrectionPacket,
            "definition_members",
          ),
          evidence: inputRevisions(candidateCorrectionPacket, "evidence"),
        },
        body: "The replacement preserves the exact component membership and evidence.\n",
      }],
    );
    commit(correctionRepository, "Correct component candidate in the same lineage");
    const replacementCandidate = publication(
      candidateCorrectionResult,
      "replacement",
    );
    expect(replacementCandidate.replace(/-r[0-9]{5}$/, "")).toBe(
      correctedCandidate.replace(/-r[0-9]{5}$/, ""),
    );
    expect(replacementCandidate).not.toBe(correctedCandidate);
    expect(mdlm(
      correctionRepository,
      "show",
      failedCandidateReview,
      "--json",
    ).status).toBe(0);
    expect(git(correctionRepository, "status", "--porcelain").stdout).toBe("");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 180_000);
