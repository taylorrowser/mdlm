import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { expect } from "vitest";
import { mdlm, mdlmWithInput, selectProcessPackageFixture } from "./mdlm.js";
import { installProportionalPhaseTwoReadyFixture } from
  "./proportional-phase-2-ready-fixture.js";

interface PacketValue {
  identity: { id: string; type: string; revision_id?: string };
  data: {
    type: string;
    payload: Record<string, unknown>;
    links: { type: string; target: string }[];
    body: string;
  };
}

interface Packet {
  assignment: { id: string };
  scenario: { reference: string };
  prompt: { skills: { reference: string }[] };
  exactInputs: {
    inputs: {
      name: string;
      values: PacketValue[];
    }[];
  }[];
}

function exactInputValuesAt(
  packet: Packet,
  invocation: number,
  name: string,
): PacketValue[] {
  return packet.exactInputs[invocation]!.inputs.find(
    (input) => input.name === name,
  )!.values;
}

function exactInputsAt(
  packet: Packet,
  invocation: number,
  name: string,
): string[] {
  return exactInputValuesAt(packet, invocation, name).map(
    (value) => value.identity.revision_id ?? value.identity.id,
  );
}

function exactInputs(packet: Packet, name: string): string[] {
  return exactInputsAt(packet, 0, name);
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

function prepareAny(repository: string): Packet {
  const next = mdlm(repository, "next", "--json");
  expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
  const nextOutcome = JSON.parse(next.stdout);
  expect(nextOutcome.assignment, next.stdout).toBeDefined();
  const assignment = nextOutcome.assignment.id as string;
  const prepared = mdlm(
    repository,
    "scenario",
    "prepare",
    assignment,
    "--json",
  );
  expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
  return JSON.parse(prepared.stdout) as Packet;
}

function prepare(repository: string, scenario: string): Packet {
  const packet = prepareAny(repository);
  expect(packet.scenario.reference).toBe(scenario);
  return packet;
}

function submit(
  repository: string,
  packet: Packet,
  outputs: unknown[],
  authoritySupplies: string[] = [],
) {
  const response = {
    contract: "mdlm-assignment-response@1",
    assignment: packet.assignment.id,
    kind: "proposal",
    proposal: {
      outputs,
      completionEvidence: {
        summary: `Completed ${packet.scenario.reference}.`,
      },
      loadedSkillRefs: packet.prompt.skills.map((skill) => skill.reference),
      authoritySupplies,
      standingDelegations: [],
    },
  };
  const result = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    "scenario",
    "submit",
    "-",
    "--json",
  );
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  return JSON.parse(result.stdout).execution as {
    outputs: { name: string; lifecycleDatum: { revisionId: string } }[];
  };
}

function submittedRevision(
  execution: {
    outputs: { name: string; lifecycleDatum: { revisionId: string } }[];
  },
  name: string,
): string {
  return execution.outputs.find((output) => output.name === name)!
    .lifecycleDatum.revisionId;
}

function packetBoundReviewBody(packet: Packet, invocation: number): string {
  const subject = exactInputValuesAt(packet, invocation, "subject")[0]!;
  if (subject.identity.type !== "SYS") {
    return "The exact subject is usable in its complete generated context.\n";
  }

  const subjectRevision = subject.identity.revision_id!;
  const statement = subject.data.payload.statement;
  expect(statement).toEqual(expect.any(String));
  const declaredTargets = new Set(subject.data.links.map((link) => link.target));
  const memberEvidence = exactInputValuesAt(
    packet,
    invocation,
    "context_members",
  ).map((member) => {
    const revision = member.identity.revision_id!;
    expect(declaredTargets.has(revision)).toBe(true);
    expect(member.data.payload.title).toEqual(expect.any(String));
    expect(member.data.payload.rationale).toEqual(expect.any(String));
    expect(member.data.body).toEqual(expect.any(String));
    return `${revision} (${member.identity.type}): ${String(
      member.data.payload.title,
    )}; ${String(member.data.payload.rationale)}; links ${member.data.links
      .map((link) => `${link.type}=${link.target}`)
      .join(", ")}; body ${member.data.body.trim()}`;
  });

  return [
    `Packet-bounded Review of ${subjectRevision}: ${String(statement)}`,
    "Every supplied exact context Revision was read from the Assignment packet:",
    ...memberEvidence,
    "The subject traces directly to every supplied member and is usable in that exact context.",
    "",
  ].join("\n");
}

function reviewPacket(repository: string, packet: Packet): string {
  const subjectValues = packet.exactInputs.map(
    (_, invocation) => exactInputValuesAt(packet, invocation, "subject")[0]!,
  );
  const subjects = subjectValues.map(
    (subject) => subject.identity.revision_id ?? subject.identity.id,
  );
  const planningSubjects = new Set(
    subjectValues
      .filter(
        (subject) =>
          subject.identity.type === "DWP" &&
          subject.data.payload.stage === "planning",
      )
      .map((subject) => subject.identity.revision_id!),
  );
  submit(
    repository,
    packet,
    subjects.map((subject, invocation) => ({
      localId: `review-${invocation}`,
      name: "review",
      invocation,
      lifecycleDatum: {
        type: "REV",
        payload: {
          title: `Review ${subject}`,
          review_kind: planningSubjects.has(subject)
            ? "simplification-product-definition"
            : "contextual",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          ...(planningSubjects.has(subject) ? {} : { findings: [] }),
          outcome: "pass",
        },
        links: [
          { type: "reviews", target: subject },
          {
            type: "contextualizes",
            target: exactInputsAt(packet, invocation, "review_context")[0]!,
          },
        ],
        body: packetBoundReviewBody(packet, invocation),
      },
    })),
    ["independent-reviewer"],
  );
  commit(repository, `Review ${subjects.join(", ")}`);
  return subjects[0]!;
}

function prepareScenarioAfterReviews(
  repository: string,
  scenario: string,
): Packet {
  for (let turn = 0; turn < 12; turn += 1) {
    const packet = prepareAny(repository);
    if (packet.scenario.reference === scenario) return packet;
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    reviewPacket(repository, packet);
  }
  throw new Error(`public route did not reach ${scenario}`);
}

async function phaseTwoOnlyPackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });
  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-2-system-definition"];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(root, "phases/phase-2-system-definition.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.attention_checkpoints = [];
  await fs.writeFile(phasePath, stringify(phase));
  for (const phaseId of [
    "phase-0-wayfinding",
    "phase-1-product-assurance",
    "phase-2-pilot-assessment",
    "phase-7-change-control",
  ]) {
    const otherPath = path.join(root, `phases/${phaseId}.yaml`);
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }

  const reviewSelectorPath = path.join(
    root,
    "selectors/review-required-revisions.yaml",
  );
  const reviewSelector = parse(await fs.readFile(reviewSelectorPath, "utf8"));
  reviewSelector.query.where +=
    ' && (subject.provenance.scenario != "seed-public-phase-2-definitions@1" || subject.identity.type == "VSP")';
  await fs.writeFile(reviewSelectorPath, stringify(reviewSelector));

  const seedDefinitions = {
    kind: "scenario-definition",
    id: "seed-public-phase-2-definitions",
    version: 1,
    description:
      "Publish the public regression's Phase 2 entry definitions through a real Assignment.",
    phases: ["phase-2-system-definition"],
    inputs: [],
    outputs: [
      {
        name: "product",
        types: ["PSP"],
        cardinality: "one",
        required_links: [],
      },
      {
        name: "requirements",
        types: ["STK"],
        cardinality: "one-or-more",
        required_links: [
          { link: "derived-from", target: { output: "product" } },
        ],
      },
      {
        name: "strategy",
        types: ["VSP"],
        cardinality: "one",
        required_links: [
          { link: "governs", target: { output: "requirements" } },
          { link: "governs-revision", target: { output: "requirements" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-public-phase-2-definitions.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["public-phase-2-definitions-required"],
    prohibited_inputs: [],
    batching: "coherent-batch",
  };
  const seedAcceptance = {
    kind: "scenario-definition",
    id: "seed-public-phase-2-acceptance",
    version: 1,
    description:
      "Freeze the public regression's exact accepted Phase 2 entry set through the kernel.",
    phases: ["phase-2-system-definition"],
    inputs: [
      {
        name: "product",
        types: ["PSP"],
        cardinality: "one",
        identity: "revision",
      },
      {
        name: "requirements",
        types: ["STK"],
        cardinality: "one-or-more",
        identity: "revision",
      },
    ],
    outputs: [
      {
        name: "accepted",
        types: ["BSL"],
        cardinality: "one",
        required_links: [],
      },
    ],
    prompt_ref: "prompts/seed-public-phase-2-acceptance.md@1",
    review_policy_ref: "review-applicability@1",
    completion:
      'execution.integrity.contract_valid == true && accepted.payload.kind == "intent-approved" && accepted.storage.frozen == true',
    resolves: ["public-phase-2-acceptance-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const definitionsObligation = {
    kind: "obligation-definition",
    id: "public-phase-2-definitions-required",
    version: 1,
    description:
      "The public regression requires one exact definition seed transaction.",
    phases: ["phase-2-system-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("public-phase-2-products@1", {})',
    status_rules: [
      {
        status: "ready",
        priority: 1000,
        when: 'none("public-phase-2-products@1", {})',
        reason: "Publish the exact public Phase 2 entry definitions.",
      },
    ],
    default_status: "blocked",
    resolve_with: { scenario: "seed-public-phase-2-definitions@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const acceptanceObligation = {
    kind: "obligation-definition",
    id: "public-phase-2-acceptance-required",
    version: 1,
    description:
      "The public regression requires one kernel-frozen accepted entry set.",
    phases: ["phase-2-system-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("public-phase-2-accepted@1", {})',
    status_rules: [
      {
        status: "blocked",
        priority: 1000,
        when: 'none("public-phase-2-products@1", {})',
        reason: "Definitions must exist before acceptance.",
        blocked_by: [
          {
            obligation: "public-phase-2-definitions-required@1",
            subjects: "[phase]",
          },
        ],
      },
      {
        status: "ready",
        priority: 900,
        when:
          'exists("public-phase-2-products@1", {})' +
          ' && none("public-phase-2-accepted@1", {})',
        reason: "Freeze the exact synthetic entry definitions.",
      },
    ],
    default_status: "blocked",
    resolve_with: {
      scenario: "seed-public-phase-2-acceptance@1",
      inputs: {
        product: 'one("public-phase-2-products@1", {})',
        requirements: 'select("public-phase-2-requirements@1", {})',
      },
    },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const selectors = [
    {
      kind: "selector-definition",
      id: "public-phase-2-products",
      version: 1,
      description: "Exact PSP seeded by the public regression.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["PSP"] },
        as: "product",
        where:
          'product.payload.problem == "Two related behaviors need one coherent system definition."',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
    {
      kind: "selector-definition",
      id: "public-phase-2-requirements",
      version: 1,
      description: "Exact STKs seeded by the public regression.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["STK"] },
        as: "requirement",
        where: 'requirement.payload.system_context != ""',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
    {
      kind: "selector-definition",
      id: "public-phase-2-strategies",
      version: 1,
      description: "Exact VSP seeded by the public regression.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["VSP"] },
        as: "strategy",
        where: 'strategy.payload.level == "stakeholder"',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
    {
      kind: "selector-definition",
      id: "public-phase-2-accepted",
      version: 1,
      description: "Exact accepted baseline seeded by the public regression.",
      parameters: [],
      result_kind: "baseline",
      query: {
        from: { collection: "baselines", types: ["BSL"] },
        as: "accepted",
        where:
          'accepted.payload.kind == "intent-approved" && accepted.storage.frozen == true',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
  ];
  for (const [relative, value] of [
    ["scenarios/seed-public-phase-2-definitions.yaml", seedDefinitions],
    ["scenarios/seed-public-phase-2-acceptance.yaml", seedAcceptance],
    [
      "obligations/public-phase-2-definitions-required.yaml",
      definitionsObligation,
    ],
    [
      "obligations/public-phase-2-acceptance-required.yaml",
      acceptanceObligation,
    ],
    ...selectors.map((selector) => [`selectors/${selector.id}.yaml`, selector]),
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(root, relative), stringify(value));
  }
  const seedPrompt = (id: string, scenario: string) =>
    `---\nid: ${id}\nversion: 1\nscenario: ${scenario}\nskills: [skills/lifecycle-data.md@1, skills/author-preflight.md@2]\n---\n\n# Public regression seed\n\nUse only the exact bounded test inputs and apply ephemeral author preflight.\n`;
  await fs.writeFile(
    path.join(root, "prompts/seed-public-phase-2-definitions.md"),
    seedPrompt(
      "seed-public-phase-2-definitions",
      "seed-public-phase-2-definitions",
    ),
  );
  await fs.writeFile(
    path.join(root, "prompts/seed-public-phase-2-acceptance.md"),
    seedPrompt(
      "seed-public-phase-2-acceptance",
      "seed-public-phase-2-acceptance",
    ),
  );
  phase.scenarios.unshift(
    "seed-public-phase-2-definitions@1",
    "seed-public-phase-2-acceptance@1",
  );
  phase.obligations.unshift(
    "public-phase-2-definitions-required@1",
    "public-phase-2-acceptance-required@1",
  );
  await fs.writeFile(phasePath, stringify(phase));
  const manifestPath = path.join(root, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.selectors.push(...selectors.map((selector) => selector.id));
  manifest.catalog.obligations.push(
    "public-phase-2-definitions-required",
    "public-phase-2-acceptance-required",
  );
  manifest.catalog.scenarios.push(
    "seed-public-phase-2-definitions",
    "seed-public-phase-2-acceptance",
  );
  manifest.assets.prompts.push(
    "prompts/seed-public-phase-2-definitions.md@1",
    "prompts/seed-public-phase-2-acceptance.md@1",
  );
  await fs.writeFile(manifestPath, stringify(manifest));
  return root;
}

async function seedPublicPhaseTwoEntry(
  repository: string,
  requirements: { statement: string; systemContext: string }[],
): Promise<{
  product: { datum: { id: string; revision_id: string } };
  requirements: { datum: { id: string; revision_id: string } }[];
  strategy: { datum: { id: string; revision_id: string } };
}> {
  const seedPacket = prepare(repository, "seed-public-phase-2-definitions@1");
  const seedExecution = submit(repository, seedPacket, [
    {
      localId: "product",
      name: "product",
      invocation: 0,
      lifecycleDatum: {
        type: "PSP",
        payload: {
          title: "Two-context public product",
          rationale: "Exercise complete independent Phase 2 contexts.",
          problem: "Two related behaviors need one coherent system definition.",
          users: ["operator"],
          goals: requirements.map(({ statement }) => statement),
          non_goals: ["Choose implementation details"],
          success_measures: ["Every context has an observable SYS definition"],
        },
        links: [],
        body: "One public product with independently justified contexts.\n",
      },
    },
    ...requirements.map(({ statement, systemContext }, index) => ({
      localId: `requirement-${index + 1}`,
      name: "requirements",
      invocation: 0,
      lifecycleDatum: {
        type: "STK",
        payload: {
          title: statement,
          rationale: "One stakeholder-visible behavior.",
          statement,
          verification_intent: `Observe that the product will ${statement.toLowerCase()}.`,
          stakeholder: "operator",
          priority: "must",
          system_context: systemContext,
        },
        links: [{ type: "derived-from", target: "$proposal.product.id" }],
        body: "One stakeholder-visible behavior.\n",
      },
    })),
    {
      localId: "strategy",
      name: "strategy",
      invocation: 0,
      lifecycleDatum: {
        type: "VSP",
        payload: {
          title: "Public black-box strategy",
          rationale: "Both contexts remain independently observable.",
          level: "system",
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
          evidence_policy: "Retain exact input, output, and exit status.",
          assessment_policy:
            "Every context must satisfy its observable behavior.",
          environment_profile: {
            id: "public-cli",
            purpose: "Exercise complete compiled public routes.",
            capabilities: {
              controllability: ["input"],
              observability: ["output", "exit status"],
              external_services: [],
              timing: "bounded",
            },
          },
        },
        links: requirements.flatMap((_, index) => [
          { type: "governs", target: `$proposal.requirement-${index + 1}.id` },
          {
            type: "governs-revision",
            target: `$proposal.requirement-${index + 1}.revision_id`,
          },
        ]),
        body: "One exact public verification strategy.\n",
      },
    },
  ]);
  commit(repository, "Publish public Phase 2 entry definitions");
  const asRecord = (revision: string) => ({
    datum: {
      id: revision.replace(/-r[0-9]{5}$/, ""),
      revision_id: revision,
    },
  });
  const outputs = seedExecution.outputs.map((output) => ({
    name: output.name,
    revision: output.lifecycleDatum.revisionId,
  }));
  const product = asRecord(
    outputs.find(({ name }) => name === "product")!.revision,
  );
  const seededRequirements = outputs
    .filter(({ name }) => name === "requirements")
    .map(({ revision }) => asRecord(revision));
  const strategy = asRecord(
    outputs.find(({ name }) => name === "strategy")!.revision,
  );
  const acceptancePacket = prepare(
    repository,
    "seed-public-phase-2-acceptance@1",
  );
  submit(repository, acceptancePacket, [
    {
      localId: "accepted",
      name: "accepted",
      invocation: 0,
      lifecycleDatum: {
        type: "BSL",
        payload: {
          title: "Accepted public Phase 2 intent",
          kind: "intent-approved",
          role: "accepted",
          scope: "public-phase2",
          group: "DEFAULT",
          definition_members: [
            product.datum.revision_id,
            ...seededRequirements.map(({ datum }) => datum.revision_id),
          ],
          evidence: [],
        },
        links: [],
        body: "",
      },
    },
  ]);
  commit(repository, "Freeze public Phase 2 entry definitions");
  return { product, requirements: seededRequirements, strategy };
}


export async function reconstructZeroInterfacePhaseTwoRouteForCapture(): Promise<void> {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-public-zero-interface-phase2-"),
  );
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const processRoot = await phaseTwoOnlyPackage(parent);
    await selectProcessPackageFixture(repository, processRoot);
    const seeded = await seedPublicPhaseTwoEntry(repository, [
      { statement: "Accept a client request", systemContext: "client" },
    ]);
    const requirement = seeded.requirements[0]!.datum.revision_id;

    const architecturePacket = prepare(
      repository,
      "define-system-architecture@3",
    );
    const architectureExecution = submit(repository, architecturePacket, [
      {
        localId: "architecture",
        name: "architecture",
        invocation: 0,
        lifecycleDatum: {
          type: "ASP",
          payload: {
            title: "Client responsibility architecture",
            rationale:
              "One responsibility has no independently controlled internal boundary.",
            level: "system",
            elements: [{
              id: "AEL-0C1ENTCTX01",
              alias: "CLIENT",
              title: "Client responsibility",
              responsibilities: ["Own the client behavior"],
            }],
            internal_interactions: [],
            controlled_boundaries: [],
            constraints: ["Remain solution-independent"],
            nominated_risks: ["The client behavior could be omitted"],
          },
          links: [{ type: "governs", target: requirement }],
          body: "One context with no controlled internal boundary.\n",
        },
      },
    ]);
    const architecture = submittedRevision(
      architectureExecution,
      "architecture",
    );
    commit(repository, "Publish client architecture");

    const planPacket = prepareScenarioAfterReviews(
      repository,
      "define-decomposition-work-package@3",
    );
    expect(exactInputs(planPacket, "interfaces")).toEqual([]);
    const planExecution = submit(repository, planPacket, [
      {
        localId: "plan",
        name: "plan",
        invocation: 0,
        lifecycleDatum: {
          type: "DWP",
          payload: {
            title: "Client behavior slice",
            rationale: "Keep the client behavior independently verifiable.",
            architecture_element: "AEL-0C1ENTCTX01",
            target_child_type: "SYS",
            behavioral_slice: "Define the exact client system behavior.",
            expected_coverage: ["One exact stakeholder behavior"],
            exclusions: ["Implementation design"],
            dependencies: [],
            required_review_policy: "review-applicability@1",
            stage: "planning",
          },
          links: [
            { type: "decomposes", target: requirement },
            { type: "allocated-to", target: architecture },
            { type: "verified-under", target: seeded.strategy.datum.revision_id },
          ],
          body: "One cohesive zero-interface decomposition slice.\n",
        },
      },
    ]);
    const plan = submittedRevision(planExecution, "plan");
    commit(repository, "Publish client decomposition plan");

    const executionPacket = prepareScenarioAfterReviews(
      repository,
      "execute-decomposition-work-package@2",
    );
    expect(exactInputs(executionPacket, "interfaces")).toEqual([]);
    expect(exactInputs(executionPacket, "plan")).toEqual([plan]);
    const execution = submit(repository, executionPacket, [
      {
        localId: "requirement",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "SYS",
          payload: {
            title: "Client observable system behavior",
            rationale: "Allocate one exact solution-independent behavior.",
            statement: "The system shall accept a client request deterministically.",
            verification_intent: "Observe the exact client outcome.",
          },
          links: [
            { type: "derived-from", target: requirement },
            { type: "decomposes", target: plan },
            { type: "allocated-to", target: architecture },
          ],
          body: "One detailed solution-independent system behavior.\n",
        },
      },
    ]);
    commit(repository, "Publish client system behavior");
    const system = submittedRevision(execution, "requirements");
    const shown = mdlm(repository, "show", system, "--json");
    expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
    expect(JSON.parse(shown.stdout).lifecycleDatum.datum.type).toBe("SYS");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

export async function runZeroInterfacePhaseTwoRoute(): Promise<void> {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-public-zero-interface-phase2-"),
  );
  try {
    const repository = path.join(parent, "repository");
    const checkpoint = await installProportionalPhaseTwoReadyFixture(repository);
    expect(Object.isFrozen(checkpoint)).toBe(true);
    const executionPacket = prepare(
      repository,
      "execute-decomposition-work-package@2",
    );
    expect(exactInputs(executionPacket, "interfaces")).toEqual([]);
    expect(exactInputs(executionPacket, "plan")).toEqual([checkpoint.plan]);
    expect(exactInputs(executionPacket, "parents")).toEqual([
      checkpoint.requirement,
    ]);
    expect(exactInputs(executionPacket, "architecture")).toEqual([
      checkpoint.architecture,
    ]);
    const execution = submit(repository, executionPacket, [
      {
        localId: "requirement",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "SYS",
          payload: {
            title: "Client observable system behavior",
            rationale: "Allocate one exact solution-independent behavior.",
            statement: "The system shall accept a client request deterministically.",
            verification_intent: "Observe the exact client outcome.",
          },
          links: [
            { type: "derived-from", target: checkpoint.requirement },
            { type: "decomposes", target: checkpoint.plan },
            { type: "allocated-to", target: checkpoint.architecture },
          ],
          body: "One detailed solution-independent system behavior.\n",
        },
      },
    ]);
    commit(repository, "Publish client system behavior");
    const system = submittedRevision(execution, "requirements");
    const shown = mdlm(repository, "show", system, "--json");
    expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
    expect(JSON.parse(shown.stdout).lifecycleDatum.datum.type).toBe("SYS");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}
