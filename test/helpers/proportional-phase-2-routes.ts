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
  scenario: {
    reference: string;
    skills: { reference: string }[];
  };
  exactInputs: {
    inputs: {
      name: string;
      values: PacketValue[];
    }[];
  }[];
  responseScaffold: {
    contract: string;
    assignment: string;
    kind: "proposal";
    proposal: {
      outputs: Array<{
        handle: string;
        output?: string;
        invocation?: number;
        type: string;
        payload: unknown;
        links: unknown[];
        body: unknown;
      }>;
      completionEvidence: unknown;
    };
  };
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
  return nextOutcome.assignment.packet as Packet;
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
): {
  outputs: { name: string; lifecycleDatum: { revisionId: string } }[];
} {
  const response = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.map((expected) => {
    const supplied = outputs.find((output: any) =>
      output.localId === expected.handle || output.name === expected.handle
    ) as any;
    expect(supplied, `Missing ${expected.handle} output`).toBeDefined();
    return {
      handle: expected.handle,
      type: supplied.lifecycleDatum.type,
      payload: supplied.lifecycleDatum.payload,
      links: expected.links.length > 0
        ? expected.links
        : supplied.lifecycleDatum.links,
      body: supplied.lifecycleDatum.body,
    };
  });
  response.proposal.completionEvidence = {
    summary: `Completed ${packet.scenario.reference}.`,
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
  const accepted = JSON.parse(result.stdout) as {
    receipt: {
      publications: { handle: string; revisionId: string }[];
    };
  };
  return {
    outputs: accepted.receipt.publications.map((publication: {
      handle: string;
      revisionId: string;
    }) => ({
      name: publication.handle,
      lifecycleDatum: { revisionId: publication.revisionId },
    })),
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
  );
  commit(repository, `Review ${subjects.join(", ")}`);
  return subjects[0]!;
}

function reviewPhaseTwoPacket(repository: string, packet: Packet): string {
  const subjects = packet.exactInputs.map((_, invocation) =>
    exactInputValuesAt(packet, invocation, "subject")[0]!
  );
  const outputHandle = (
    invocation: number,
    output: "review_context" | "review",
  ) => packet.responseScaffold.proposal.outputs.find((candidate) =>
    (candidate.invocation ?? 0) === invocation &&
    (candidate.output ?? (candidate.handle === "context"
      ? "review_context"
      : candidate.handle)) === output
  )!.handle;
  submit(repository, packet, subjects.flatMap((subjectValue, invocation) => {
    const subject = subjectValue.identity.revision_id!;
    const members = exactInputsAt(
      packet,
      invocation,
      "review_context_members",
    );
    const planning = subjectValue.identity.type === "DWP" &&
      subjectValue.data.payload.stage === "planning";
    return [{
      localId: outputHandle(invocation, "review_context"),
      name: "review_context",
      invocation,
      lifecycleDatum: {
        type: "BSL",
        payload: {
          title: `Review context for ${subject}`,
          kind: "review-context",
          role: "review-context",
          scope: subject,
          group: "DEFAULT",
          definition_members: [subject, ...members].sort(),
          evidence: [],
        },
        links: [],
        body: "The exact Phase 2 datum and selected support.\n",
      },
    }, {
      localId: outputHandle(invocation, "review"),
      name: "review",
      invocation,
      lifecycleDatum: {
        type: "REV",
        payload: {
          title: `Review ${subject}`,
          review_kind: planning
            ? "simplification-product-definition"
            : "contextual",
          reviewer: "independent-reviewer",
          summary: "The exact Phase 2 datum is traceable and complete.",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          ...(planning ? {} : { findings: [] }),
          outcome: "pass",
        },
        links: [
          { type: "reviews", target: subject },
          {
            type: "contextualizes",
            target: `$proposal.${outputHandle(invocation, "review_context")}.revision_id`,
          },
        ],
        body: "The exact Phase 2 datum passes independent Review.\n",
      },
    }];
  }));
  const revisions = subjects.map((subject) => subject.identity.revision_id!);
  commit(repository, `Review ${revisions.join(", ")}`);
  return revisions[0]!;
}

function prepareScenarioAfterReviews(
  repository: string,
  scenario: string,
): Packet {
  for (let turn = 0; turn < 12; turn += 1) {
    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    if (outcome.outcome === "publication-required") {
      commit(repository, "Publish materialized review context");
      continue;
    }
    expect(outcome.assignment, next.stdout).toBeDefined();
    const packet = outcome.assignment.packet as Packet;
    if (packet.scenario.reference === scenario) return packet;
    if (packet.scenario.reference === "review-phase-2-datum@1") {
      reviewPhaseTwoPacket(repository, packet);
      continue;
    }
    expect(packet.scenario.reference).toBe("review-datum-in-context@3");
    reviewPacket(repository, packet);
  }
  throw new Error(`public route did not reach ${scenario}`);
}

async function phaseTwoOnlyPackage(
  parent: string,
  assuranceReview = false,
): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });
  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = assuranceReview
    ? ["phase-1-product-assurance", "phase-2-system-definition"]
    : ["phase-2-system-definition"];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(root, "phases/phase-2-system-definition.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = assuranceReview ? 1 : 0;
  phase.entry = "true";
  phase.attention_checkpoints = [];
  if (assuranceReview) {
    phase.routing.status_order = [
      "awaiting-review",
      "ready",
      "failed",
      "stale",
      "blocked",
    ];
  }
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
  if (assuranceReview) {
    const phaseOnePath = path.join(
      root,
      "phases/phase-1-product-assurance.yaml",
    );
    const phaseOne = parse(await fs.readFile(phaseOnePath, "utf8"));
    phaseOne.order = 0;
    phaseOne.entry = "true";
    phaseOne.progression.readiness =
      'none("current-pilot-verification-activities@1", {})';
    phaseOne.progression.authorization.condition =
      'exists("public-phase-1-markers@1", {})';
    phaseOne.progression.authorization.scenario =
      "seed-public-phase-1-marker@1";
    phaseOne.progression.authorization.subjects =
      'select("public-phase-1-markers@1", {})';
    phaseOne.progression.authorization.evidence_selector =
      "public-phase-1-markers@1";
    await fs.writeFile(phaseOnePath, stringify(phaseOne));
  }

  const reviewSelectorPath = path.join(
    root,
    "selectors/review-required-revisions.yaml",
  );
  const reviewSelector = parse(await fs.readFile(reviewSelectorPath, "utf8"));
  reviewSelector.query.where += assuranceReview
    ? ""
    : ' && (subject.provenance.scenario != "seed-public-phase-2-definitions@1" || subject.identity.type == "VSP")';
  await fs.writeFile(reviewSelectorPath, stringify(reviewSelector));

  if (assuranceReview) {
    const atomicReviewSelectorPath = path.join(
      root,
      "selectors/phase-2-atomic-review-required-revisions.yaml",
    );
    const atomicReviewSelector = parse(
      await fs.readFile(atomicReviewSelectorPath, "utf8"),
    );
    atomicReviewSelector.query.where +=
      ' && subject.identity.type == "SYS"' +
      ' && exists("pilot-verification-activities-for-requirement@1", {requirement: subject})';
    await fs.writeFile(
      atomicReviewSelectorPath,
      stringify(atomicReviewSelector),
    );

    const activeStrategiesPath = path.join(
      root,
      "selectors/current-phase-2-verification-strategies.yaml",
    );
    const activeStrategies = parse(
      await fs.readFile(activeStrategiesPath, "utf8"),
    );
    activeStrategies.query.where =
      'strategy.provenance.scenario == "seed-public-phase-2-definitions@1"' +
      ' && state(strategy, "disposition") == "active"' +
      ' && none("newer-revisions-for@1", {subject: strategy})';
    await fs.writeFile(activeStrategiesPath, stringify(activeStrategies));
  }

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
  if (assuranceReview) {
    (seedDefinitions.outputs as unknown[]).splice(2, 0, {
      name: "system",
      types: ["SYS"],
      cardinality: "one",
      required_links: [
        { link: "derived-from", target: { output: "requirements" } },
      ],
    });
    (seedDefinitions.outputs[3] as {
      required_links: unknown[];
    }).required_links = [
      { link: "governs", target: { output: "system" } },
      { link: "governs-revision", target: { output: "system" } },
    ];
  }
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
  const activityScenario = {
    kind: "scenario-definition",
    id: "seed-public-phase-2-activity",
    version: 1,
    description: "Publish one SYS-backed pilot VER through the public regression.",
    phases: ["phase-2-system-definition"],
    inputs: [
      {
        name: "requirement",
        types: ["SYS"],
        cardinality: "one",
        identity: "revision",
      },
      {
        name: "strategy",
        types: ["VSP"],
        cardinality: "one",
        identity: "revision",
      },
    ],
    outputs: [{
      name: "activity",
      types: ["VER"],
      cardinality: "one",
      required_links: [
        { link: "verifies", target: { input: "requirement" } },
        { link: "verifies-revision", target: { input: "requirement" } },
        { link: "governed-by", target: { input: "strategy" } },
      ],
    }],
    prompt_ref: "prompts/seed-public-phase-2-activity.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["public-phase-2-activity-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const activityObligation = {
    kind: "obligation-definition",
    id: "public-phase-2-activity-required",
    version: 1,
    description: "The public regression requires one SYS-backed pilot VER.",
    phases: ["phase-2-system-definition"],
    for_each: 'select("public-phase-2-systems@1", {})',
    subject_as: "requirement",
    satisfied_when:
      'exists("pilot-verification-activities-for-requirement@1", {requirement: requirement})',
    status_rules: [{
      status: "awaiting-review",
      priority: 1000,
      when:
        'exists("passing-reviews-for@1", {subject: one("public-phase-2-strategies@1", {})})',
      reason: "Publish the exact SYS-backed pilot VER after strategy Review.",
    }],
    default_status: "blocked",
    resolve_with: {
      scenario: "seed-public-phase-2-activity@1",
      inputs: {
        requirement: "requirement",
        strategy: 'one("public-phase-2-strategies@1", {})',
      },
    },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const markerScenario = {
    kind: "scenario-definition",
    id: "seed-public-phase-1-marker",
    version: 1,
    description: "Publish one marker that authorizes synthetic Phase 1 progression.",
    phases: ["phase-1-product-assurance"],
    inputs: [],
    outputs: [{
      name: "marker",
      types: ["MAP"],
      cardinality: "one",
      required_links: [],
    }],
    prompt_ref: "prompts/seed-public-phase-1-marker.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["public-phase-1-marker-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const markerObligation = {
    kind: "obligation-definition",
    id: "public-phase-1-marker-required",
    version: 1,
    description: "The public regression requires one Phase 1 marker.",
    phases: ["phase-1-product-assurance"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("public-phase-1-markers@1", {})',
    status_rules: [{
      status: "ready",
      priority: 1000,
      when: 'none("public-phase-1-markers@1", {})',
      reason: "Publish the Phase 1 progression marker.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-public-phase-1-marker@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  if (assuranceReview) {
    definitionsObligation.status_rules[0]!.status = "awaiting-review";
    acceptanceObligation.status_rules[1]!.status = "awaiting-review";
  }
  const selectors = [
    {
      kind: "selector-definition",
      id: "public-phase-1-markers",
      version: 1,
      description: "Exact MAP seeded by the public Phase 1 regression setup.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["MAP"] },
        as: "marker",
        where:
          'marker.provenance.scenario == "seed-public-phase-1-marker@1"',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
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
        where: assuranceReview
          ? 'strategy.payload.level == "system"'
          : 'strategy.payload.level == "stakeholder"',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
    {
      kind: "selector-definition",
      id: "public-phase-2-systems",
      version: 1,
      description: "Exact SYS seeded by the assurance public regression.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["SYS"] },
        as: "requirement",
        where:
          'requirement.provenance.scenario == "seed-public-phase-2-definitions@1"',
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
    ["scenarios/seed-public-phase-2-activity.yaml", activityScenario],
    ["scenarios/seed-public-phase-1-marker.yaml", markerScenario],
    [
      "obligations/public-phase-2-definitions-required.yaml",
      definitionsObligation,
    ],
    [
      "obligations/public-phase-2-acceptance-required.yaml",
      acceptanceObligation,
    ],
    [
      "obligations/public-phase-2-activity-required.yaml",
      activityObligation,
    ],
    ["obligations/public-phase-1-marker-required.yaml", markerObligation],
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
  await fs.writeFile(
    path.join(root, "prompts/seed-public-phase-2-activity.md"),
    seedPrompt(
      "seed-public-phase-2-activity",
      "seed-public-phase-2-activity",
    ),
  );
  await fs.writeFile(
    path.join(root, "prompts/seed-public-phase-1-marker.md"),
    seedPrompt("seed-public-phase-1-marker", "seed-public-phase-1-marker"),
  );
  await fs.writeFile(phasePath, stringify(phase));
  return root;
}

async function seedPublicPhaseTwoEntry(
  repository: string,
  requirements: { statement: string; systemContext: string }[],
  strategyLevel: "stakeholder" | "system" = "system",
): Promise<{
  product: { datum: { id: string; revision_id: string } };
  requirements: { datum: { id: string; revision_id: string } }[];
  system?: { datum: { id: string; revision_id: string } };
  strategy: { datum: { id: string; revision_id: string } };
}> {
  const seedPacket = prepare(repository, "seed-public-phase-2-definitions@1");
  const includesSystem = seedPacket.responseScaffold.proposal.outputs.some(
    (output) => output.handle === "system",
  );
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
    ...(includesSystem ? [{
      localId: "system",
      name: "system",
      invocation: 0,
      lifecycleDatum: {
        type: "SYS",
        payload: {
          title: "Representative observable system behavior",
          rationale: "Bind the pilot to one exact system behavior.",
          statement: "The system shall report one observable result.",
          verification_intent: "Observe the exact reported result.",
        },
        links: [{
          type: "derived-from",
          target: "$proposal.requirement-1.revision_id",
        }],
        body: "One exact representative system behavior.\n",
      },
    }] : []),
    {
      localId: "strategy",
      name: "strategy",
      invocation: 0,
      lifecycleDatum: {
        type: "VSP",
        payload: {
          title: "Public black-box strategy",
          rationale: "Both contexts remain independently observable.",
          level: strategyLevel,
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
  const systemOutput = outputs.find(({ name }) => name === "system");
  const system = systemOutput ? asRecord(systemOutput.revision) : undefined;
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
  return {
    product,
    requirements: seededRequirements,
    ...(system ? { system } : {}),
    strategy,
  };
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
      "define-decomposition-work-package@4",
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

export async function runPlanningDwpProductReviewProjection(): Promise<void> {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-public-planning-dwp-review-"),
  );
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const processRoot = await phaseTwoOnlyPackage(parent);

    const reviewContextPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const reviewContext = parse(await fs.readFile(reviewContextPath, "utf8"));
    reviewContext.phases.push("phase-2-system-definition");
    await fs.writeFile(reviewContextPath, stringify(reviewContext));

    const atomicSubjectsPath = path.join(
      processRoot,
      "selectors/phase-2-atomic-review-required-revisions.yaml",
    );
    const atomicSubjects = parse(await fs.readFile(atomicSubjectsPath, "utf8"));
    atomicSubjects.query.where +=
      ' && none("planning-dwp-matching-subject@1", {subject: subject})';
    await fs.writeFile(atomicSubjectsPath, stringify(atomicSubjects));

    const retainedObligations = new Set([
      "decomposition-planning-required",
      "passing-review-required",
      "phase-2-atomic-review-required",
      "planning-dwp-product-definition-review-required",
      "public-phase-2-acceptance-required",
      "public-phase-2-definitions-required",
      "review-context-required",
      "system-architecture-required",
    ]);
    const obligationsRoot = path.join(processRoot, "obligations");
    for (const entry of await fs.readdir(obligationsRoot)) {
      if (!entry.endsWith(".yaml")) continue;
      const file = path.join(obligationsRoot, entry);
      const obligation = parse(await fs.readFile(file, "utf8"));
      if (retainedObligations.has(obligation.id)) continue;
      obligation.satisfied_when = "true";
      await fs.writeFile(file, stringify(obligation));
    }

    await selectProcessPackageFixture(repository, processRoot);
    const seeded = await seedPublicPhaseTwoEntry(repository, [{
      statement: "Accept one client request",
      systemContext: "client",
    }], "stakeholder");
    const requirement = seeded.requirements[0]!.datum.revision_id;

    const architecturePacket = prepare(
      repository,
      "define-system-architecture@3",
    );
    const architectureExecution = submit(repository, architecturePacket, [{
      localId: "architecture",
      name: "architecture",
      invocation: 0,
      lifecycleDatum: {
        type: "ASP",
        payload: {
          title: "Client responsibility architecture",
          rationale: "One responsibility owns the observable behavior.",
          level: "system",
          elements: [{
            id: "AEL-0C1ENT5350",
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
        body: "One responsibility with no controlled internal boundary.\n",
      },
    }, {
      localId: "questions",
      name: "questions",
      invocation: 0,
      lifecycleDatum: { type: "QST", payload: null, links: [], body: null },
    }]);
    const architecture = submittedRevision(
      architectureExecution,
      "architecture",
    );
    commit(repository, "Publish client architecture");

    const planPacket = prepareScenarioAfterReviews(
      repository,
      "define-decomposition-work-package@4",
    );
    const planExecution = submit(repository, planPacket, [{
      localId: "plan",
      name: "plan",
      invocation: 0,
      lifecycleDatum: {
        type: "DWP",
        payload: {
          title: "Client behavior slice",
          rationale: "Keep the client behavior independently verifiable.",
          architecture_element: "AEL-0C1ENT5350",
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
          {
            type: "verified-under",
            target: seeded.strategy.datum.revision_id,
          },
        ],
        body: "One cohesive decomposition slice.\n",
      },
    }, {
      localId: "questions",
      name: "questions",
      invocation: 0,
      lifecycleDatum: { type: "QST", payload: null, links: [], body: null },
    }]);
    const plan = submittedRevision(planExecution, "plan");
    commit(repository, "Publish client decomposition plan");

    let planningReviewPacket: Packet | undefined;
    let ordinaryContextualReviewAccepted = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const projected = mdlm(repository, "next", "--json");
      expect(projected.status, `${projected.stderr}${projected.stdout}`).toBe(0);
      const outcome = JSON.parse(projected.stdout);
      if (outcome.outcome === "publication-required") {
        commit(repository, "Publish planning DWP Review Context");
        continue;
      }
      expect(outcome.assignment, projected.stdout).toBeDefined();
      const packet = outcome.assignment.packet as Packet;
      if (packet.scenario.reference === "review-datum-in-context@3") {
        reviewPacket(repository, packet);
        ordinaryContextualReviewAccepted = true;
        continue;
      }
      planningReviewPacket = packet;
      break;
    }

    expect(ordinaryContextualReviewAccepted).toBe(true);
    expect(planningReviewPacket?.scenario.reference).toBe(
      "review-planning-dwp-product-definition@1",
    );
    expect(exactInputs(planningReviewPacket!, "subject")).toEqual([plan]);
    expect(planningReviewPacket!.responseScaffold.proposal.outputs).toEqual([
      expect.objectContaining({
        handle: "review",
        type: "REV",
        payload: expect.objectContaining({
          review_kind: "simplification-product-definition",
        }),
      }),
    ]);

    const authorValues = {
      outputs: [{
        slot: "review",
        payload: {
          title: "Product-definition Review of the client behavior slice",
          reviewer: "independent-reviewer",
          summary: "The plan is bounded by its exact product-definition support.",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          outcome: "pass",
        },
        body: "The exact frozen context supports the bounded planning judgment.\n",
      }],
      completionEvidence: {
        summary: "Reviewed the exact planning DWP product definition.",
      },
    };
    expect(JSON.stringify(authorValues)).not.toContain("review_kind");
    const submitted = mdlmWithInput(
      repository,
      `${JSON.stringify(authorValues)}\n`,
      "assignment",
      "submit-proposal",
      "-",
      "--authority",
      "independent-reviewer",
      "--json",
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      command: "assignment.submit-proposal",
      outcome: "accepted",
      assignment: { id: planningReviewPacket!.assignment.id },
    });

    const compiled = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/work/assignment-response.json"),
      "utf8",
    ));
    expect(compiled.proposal.outputs).toEqual([
      expect.objectContaining({
        handle: "review",
        payload: expect.objectContaining({
          review_kind: "simplification-product-definition",
          outcome: "pass",
        }),
      }),
    ]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

async function runPhaseTwoSiblingSystemReviewRoute(
  definitionConsistencyFailure: boolean,
): Promise<void> {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-public-phase2-stakeholder-strategy-"),
  );
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const processRoot = await phaseTwoOnlyPackage(parent);
    const reviewSupport = parse(await fs.readFile(path.join(
      processRoot,
      "selectors/planning-dwp-review-support-for.yaml",
    ), "utf8"));
    expect(reviewSupport.query.where).toContain(
      'system-requirements-consumed-by@1',
    );
    expect(reviewSupport.query.where).not.toContain(
      'decomposition-output-revisions-for@1',
    );
    await selectProcessPackageFixture(repository, processRoot);
    const seeded = await seedPublicPhaseTwoEntry(repository, [{
      statement: "Accept one client request",
      systemContext: "client",
    }], "stakeholder");
    const requirement = seeded.requirements[0]!.datum.revision_id;

    const architecturePacket = prepare(
      repository,
      "define-system-architecture@3",
    );
    const architectureExecution = submit(repository, architecturePacket, [{
      localId: "architecture",
      name: "architecture",
      invocation: 0,
      lifecycleDatum: {
        type: "ASP",
        payload: {
          title: "Client responsibility architecture",
          rationale: "One responsibility owns the observable behavior.",
          level: "system",
          elements: [{
            id: "AEL-0C1ENT5350",
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
        body: "One responsibility with no controlled internal boundary.\n",
      },
    }, {
      localId: "questions",
      name: "questions",
      invocation: 0,
      lifecycleDatum: {
        type: "QST",
        payload: null,
        links: [],
        body: null,
      },
    }]);
    const architecture = submittedRevision(
      architectureExecution,
      "architecture",
    );
    commit(repository, "Publish client architecture");

    const planningPacket = prepareScenarioAfterReviews(
      repository,
      "define-decomposition-work-package@4",
    );
    expect(exactInputs(planningPacket, "verification_strategy")).toEqual([
      seeded.strategy.datum.revision_id,
    ]);

    const planExecution = submit(repository, planningPacket, [{
      localId: "plan",
      name: "plan",
      invocation: 0,
      lifecycleDatum: {
        type: "DWP",
        payload: {
          title: "Client behavior slice",
          rationale: "Keep the client behavior independently verifiable.",
          architecture_element: "AEL-0C1ENT5350",
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
          {
            type: "verified-under",
            target: seeded.strategy.datum.revision_id,
          },
        ],
        body: "One cohesive decomposition slice.\n",
      },
    }, {
      localId: "questions",
      name: "questions",
      invocation: 0,
      lifecycleDatum: {
        type: "QST",
        payload: null,
        links: [],
        body: null,
      },
    }]);
    const plan = submittedRevision(planExecution, "plan");
    commit(repository, "Publish client decomposition plan");

    const executionPacket = prepareScenarioAfterReviews(
      repository,
      "execute-decomposition-work-package@2",
    );
    const executionResponse = structuredClone(executionPacket.responseScaffold);
    const requirementTemplate = executionResponse.proposal.outputs.find(
      (output) => output.handle === "requirements",
    )!;
    executionResponse.proposal.outputs = Array.from(
      { length: 4 },
      (_, index) => ({
        ...structuredClone(requirementTemplate),
        handle: `requirement-${index + 1}`,
        payload: {
          title: `Client observable system behavior ${index + 1}`,
          rationale: "Allocate one exact solution-independent behavior.",
          statement: `The system shall report client outcome ${index + 1} deterministically.`,
          verification_intent: `Observe exact client outcome ${index + 1}.`,
        },
        body: `One detailed solution-independent system behavior ${index + 1}.\n`,
      }),
    );
    executionResponse.proposal.completionEvidence = {
      summary: "Published four sibling system requirements.",
    };
    const executionSubmit = mdlmWithInput(
      repository,
      `${JSON.stringify(executionResponse)}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(
      executionSubmit.status,
      `${executionSubmit.stderr}${executionSubmit.stdout}`,
    ).toBe(0);
    const systems = (JSON.parse(executionSubmit.stdout) as {
      receipt: { publications: { handle: string; revisionId: string }[] };
    }).receipt.publications.map((publication) => publication.revisionId).sort();
    expect(systems).toHaveLength(4);
    commit(repository, "Publish four sibling client system behaviors");

    const outputReviewPacket = prepare(
      repository,
      "review-phase-2-datum@1",
    );
    const reviewSubjects = outputReviewPacket.exactInputs.map(
      (_, invocation) => exactInputsAt(outputReviewPacket, invocation, "subject")[0]!,
    );
    expect(reviewSubjects).toEqual(systems);
    expect(reviewSubjects).not.toContain(plan);
    expect(outputReviewPacket.responseScaffold.proposal.outputs).toHaveLength(8);

    const failedSubject = systems[2]!;
    const reviewResponse = structuredClone(outputReviewPacket.responseScaffold);
    for (const output of reviewResponse.proposal.outputs) {
      const invocation = output.invocation!;
      const subject = reviewSubjects[invocation]!;
      if (output.output === "review_context") {
        output.payload = {};
        output.body = `Exact Review Context for ${subject}.\n`;
        continue;
      }
      const failed = subject === failedSubject;
      output.payload = {
        title: `Independent Review of ${subject}`,
        review_kind: "contextual",
        reviewer: "independent-reviewer",
        summary: failed
          ? "The exact subject needs one bounded correction."
          : "The exact subject is traceable and complete.",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: failed ? [{
          id: "F-001",
          target: subject,
          relationship: "primary",
          severity: "blocking",
          summary: "Correct this exact system requirement.",
          criterion: "The requirement must state one observable result.",
          evidence: "Its current statement is ambiguous in this fixture.",
          material_consequence: "Verification cannot distinguish the result.",
        }] : [],
        ...(failed ? { correction_authority: "package-evidence" } : {}),
        outcome: failed ? "fail" : "pass",
      };
      output.body = failed
        ? "This exact SYS needs correction.\n"
        : "This exact SYS passes independent Review.\n";
    }
    reviewResponse.proposal.completionEvidence = {
      summary: "Reviewed four sibling system requirements independently.",
    };
    const reviewSubmit = mdlmWithInput(
      repository,
      `${JSON.stringify(reviewResponse)}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(reviewSubmit.status, `${reviewSubmit.stderr}${reviewSubmit.stdout}`)
      .toBe(0);
    const reviewPublications = (JSON.parse(reviewSubmit.stdout) as {
      receipt: { publications: { handle: string; revisionId: string }[] };
    }).receipt.publications;
    expect(new Set(reviewPublications.map((item) => item.revisionId)).size).toBe(8);
    commit(repository, "Review four sibling client system behaviors");

    for (let invocation = 0; invocation < 4; invocation += 1) {
      const subject = reviewSubjects[invocation]!;
      const contextRevision = reviewPublications.find((publication) =>
        publication.handle === `invocation-${invocation + 1}-context`
      )!.revisionId;
      const reviewRevision = reviewPublications.find((publication) =>
        publication.handle === `invocation-${invocation + 1}-review`
      )!.revisionId;
      const members = exactInputsAt(
        outputReviewPacket,
        invocation,
        "review_context_members",
      );
      const shownContext = mdlm(repository, "show", contextRevision, "--json");
      expect(shownContext.status, `${shownContext.stderr}${shownContext.stdout}`)
        .toBe(0);
      expect(JSON.parse(shownContext.stdout).lifecycleDatum).toMatchObject({
        storage: { frozen: true },
        datum: {
          type: "BSL",
          created_by: { scenario: "review-phase-2-datum@1" },
          payload: {
            kind: "review-context",
            role: "review-context",
            scope: subject,
            definition_members: [subject, ...members].sort(),
          },
        },
      });
      const shownReview = mdlm(repository, "show", reviewRevision, "--json");
      expect(shownReview.status, `${shownReview.stderr}${shownReview.stdout}`)
        .toBe(0);
      expect(JSON.parse(shownReview.stdout).lifecycleDatum.datum).toMatchObject({
        type: "REV",
        created_by: { scenario: "review-phase-2-datum@1" },
        payload: { outcome: subject === failedSubject ? "fail" : "pass" },
        links: [
          { type: "reviews", target: subject },
          { type: "contextualizes", target: contextRevision },
        ],
      });
    }

    const correctionPacket = prepare(
      repository,
      "revise-phase-2-system-requirement-after-review@1",
    );
    expect(exactInputs(correctionPacket, "subject")).toEqual([failedSubject]);
    const correctionProjection = mdlm(repository, "loose-ends", "--json");
    expect(
      correctionProjection.status,
      `${correctionProjection.stderr}${correctionProjection.stdout}`,
    ).toBe(0);
    const correctionSubjects = JSON.parse(correctionProjection.stdout)
      .looseEnds.items.filter((item: { obligation: string }) =>
        item.obligation === "phase-2-system-review-correction-required"
      ).map((item: { subject: string }) => item.subject);
    expect(correctionSubjects).toEqual([failedSubject]);

    const correctionResponse = structuredClone(correctionPacket.responseScaffold);
    correctionResponse.proposal.outputs = correctionResponse.proposal.outputs
      .filter((output) => output.handle === "replacement")
      .map((output) => ({
        ...output,
        payload: {
          ...exactInputValuesAt(correctionPacket, 0, "subject")[0]!.data.payload,
          statement: "The system shall report the corrected client outcome deterministically.",
        },
        body: "One bounded same-lineage correction.\n",
      }));
    correctionResponse.proposal.completionEvidence = {
      summary: "Corrected only the failed sibling system requirement.",
    };
    const correctionSubmit = mdlmWithInput(
      repository,
      `${JSON.stringify(correctionResponse)}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(
      correctionSubmit.status,
      `${correctionSubmit.stderr}${correctionSubmit.stdout}`,
    ).toBe(0);
    const replacement = (JSON.parse(correctionSubmit.stdout) as {
      receipt: { publications: { handle: string; revisionId: string }[] };
    }).receipt.publications.find((publication) =>
      publication.handle === "replacement"
    )!.revisionId;
    commit(repository, "Correct only the failed sibling system requirement");

    const replacementReview = prepare(repository, "review-phase-2-datum@1");
    expect(replacementReview.exactInputs).toHaveLength(1);
    expect(exactInputs(replacementReview, "subject")).toEqual([replacement]);
    reviewPhaseTwoPacket(repository, replacementReview);

    const simplificationPacket = prepareScenarioAfterReviews(
      repository,
      "simplify-architecture-and-interfaces@2",
    );
    const simplificationContext = exactInputs(
      simplificationPacket,
      "subject_context",
    )[0]!;
    const simplificationResponse = structuredClone(
      simplificationPacket.responseScaffold,
    );
    const simplificationOutput = simplificationResponse.proposal.outputs[0]!;
    const simplificationLinks = simplificationOutput.links as Array<{
      type: string;
      target: { datum?: string };
    }>;
    if (definitionConsistencyFailure) {
      const definitionMembers = exactInputs(
        simplificationPacket,
        "definition_members",
      );
      expect(definitionMembers).toEqual([
        architecture,
        plan,
        ...systems.filter((candidate) => candidate !== failedSubject),
        replacement,
      ].sort());
      const blockTargets = simplificationLinks
        .filter((link) => link.type === "blocks")
        .map((link) => link.target.datum)
        .filter((target): target is string => target !== undefined)
        .sort();
      expect(blockTargets).toEqual(definitionMembers);
      simplificationOutput.payload = {
        title: "Failed simplification Review of the exact definition",
        review_kind: "simplification-architecture-interfaces",
        reviewer: "independent-reviewer",
        summary: "The exact definition needs one consistent correction.",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        definition_simplification: {
          primary_target: replacement,
          correction_set: "definition-consistency",
          primary_findings: [{
            id: "F-001",
            severity: "blocking",
            summary: "The definition members disagree about one behavior.",
            criterion: "The complete definition must describe one consistent behavior.",
            evidence: "The replacement SYS conflicts with its exact ASP and planning DWP context.",
            material_consequence: "The definition cannot advance as a coherent set.",
          }],
        },
        correction_authority: "package-evidence",
        outcome: "fail",
      };
      simplificationOutput.body =
        "Correct every exact definition member as one consistent set.\n";
      simplificationResponse.proposal.completionEvidence = {
        summary: "Recorded one exact definition-consistency failure.",
      };

      simplificationOutput.links = simplificationLinks.filter((link) =>
        link.type !== "blocks" ||
        link.target.datum !== architecture
      );
      const incomplete = mdlmWithInput(
        repository,
        `${JSON.stringify(simplificationResponse)}\n`,
        "scenario",
        "submit",
        "-",
        "--json",
      );
      expect(incomplete.status).toBe(1);
      expect(JSON.parse(incomplete.stdout)).toEqual(expect.objectContaining({
        outcome: "rejected",
        correctionConsumed: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      }));

      simplificationOutput.links = structuredClone(
        simplificationPacket.responseScaffold.proposal.outputs[0]!.links,
      );
      const accepted = mdlmWithInput(
        repository,
        `${JSON.stringify(simplificationResponse)}\n`,
        "scenario",
        "submit",
        "-",
        "--json",
      );
      expect(accepted.status, `${accepted.stderr}${accepted.stdout}`).toBe(0);
      expect(JSON.parse(accepted.stdout)).toEqual(expect.objectContaining({
        outcome: "accepted",
        receipt: expect.objectContaining({
          publications: [expect.objectContaining({ handle: "review" })],
        }),
      }));
      return;
    }

    simplificationOutput.payload = {
      title: "Simplification review of client system definition",
      review_kind: "simplification-architecture-interfaces",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      outcome: "pass",
      reviewer: "independent-reviewer",
      summary: "The one-element system definition is minimal and complete.",
    };
    simplificationOutput.links = simplificationLinks.filter(
      (link) => link.type !== "blocks",
    );
    simplificationOutput.body =
      "No behavior or controlled boundary can be removed.\n";
    simplificationResponse.proposal.completionEvidence = {
      summary: "Completed simplify-architecture-and-interfaces@2.",
    };
    const simplificationSubmit = mdlmWithInput(
      repository,
      `${JSON.stringify(simplificationResponse)}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(
      simplificationSubmit.status,
      `${simplificationSubmit.stderr}${simplificationSubmit.stdout}`,
    ).toBe(0);
    const simplificationReview = JSON.parse(simplificationSubmit.stdout)
      .receipt.publications.find(
        (publication: { handle: string }) => publication.handle === "review",
      ).revisionId as string;
    commit(repository, "Review system definition simplification");

    const completionPacket = prepareScenarioAfterReviews(
      repository,
      "complete-decomposition-work-package@3",
    );
    const completionResponse = structuredClone(
      completionPacket.responseScaffold,
    );
    completionResponse.proposal.outputs = completionResponse.proposal.outputs
      .filter((output) => output.handle === "completion");
    const completionOutput = completionResponse.proposal.outputs[0]!;
    completionOutput.payload = {
      ...exactInputValuesAt(completionPacket, 0, "plan")[0]!.data.payload,
      stage: "completion",
      parent_coverage_status: "complete",
      deferred_questions: [],
      cross_group_dependencies: [],
      output_reviews_complete: true,
      simplification_disposition: "retained",
    };
    completionOutput.body = "The completed slice covers its exact parent.\n";
    completionResponse.proposal.completionEvidence = {
      summary: "Completed the reviewed system decomposition.",
    };
    const completionSubmit = mdlmWithInput(
      repository,
      `${JSON.stringify(completionResponse)}\n`,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(
      completionSubmit.status,
      `${completionSubmit.stderr}${completionSubmit.stdout}`,
    ).toBe(0);
    const completionReceipt = JSON.parse(completionSubmit.stdout) as {
      receipt: { publications: { handle: string; revisionId: string }[] };
    };
    const completion = completionReceipt.receipt.publications.find(
      (publication) => publication.handle === "completion",
    )!.revisionId;
    expect(exactInputs(completionPacket, "simplification_reviews")).toEqual([
      simplificationReview,
    ]);
    commit(repository, "Complete client system decomposition");

    const projected = mdlm(repository, "loose-ends", "--json");
    expect(projected.status, `${projected.stderr}${projected.stdout}`).toBe(0);
    expect(JSON.parse(projected.stdout).looseEnds.items).toContainEqual(
      expect.objectContaining({
        obligation: "phase-2-atomic-review-required",
        subject: completion,
        status: "awaiting-review",
        actionableResolver: "review-phase-2-datum@1",
        dispatchable: true,
      }),
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

export async function runPhaseTwoSiblingSystemReviewBatch(): Promise<void> {
  await runPhaseTwoSiblingSystemReviewRoute(false);
}

export async function runPhaseTwoDefinitionConsistencyFailureSubmission(): Promise<void> {
  await runPhaseTwoSiblingSystemReviewRoute(true);
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

export async function runPhaseTwoAssuranceReviewRoute(): Promise<void> {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-public-phase2-assurance-review-"),
  );
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const processRoot = await phaseTwoOnlyPackage(parent, true);
    await selectProcessPackageFixture(repository, processRoot);
    const markerPacket = prepare(
      repository,
      "seed-public-phase-1-marker@1",
    );
    submit(repository, markerPacket, [{
      localId: "marker",
      name: "marker",
      invocation: 0,
      lifecycleDatum: {
        type: "MAP",
        payload: {
          title: "Synthetic Phase 1 progression marker",
          purpose: "Reach the exact Phase 2 assurance regression seam.",
          frontier: ["phase-2-assurance"],
        },
        links: [],
        body: "Public regression setup only.\n",
      },
    }]);
    commit(repository, "Publish Phase 1 progression marker");
    const seeded = await seedPublicPhaseTwoEntry(repository, [{
      statement: "Report one observable result",
      systemContext: "representative-system",
    }]);
    expect(seeded.system).toBeDefined();
    const reviewAssurance = (subject: string): void => {
      const packet = prepare(repository, "review-phase-1-assurance@1");
      expect(exactInputs(packet, "subject")).toEqual([subject]);
      submit(repository, packet, [{
        localId: "context",
        name: "review_context",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: `Review context for ${subject}`,
            kind: "review-context",
            role: "review-context",
            scope: subject,
            group: "DEFAULT",
            definition_members: [subject],
            evidence: [],
          },
          links: [],
          body: "The exact active Phase 2 strategy under Review.\n",
        },
      }, {
        localId: "review",
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: "Phase 2 assurance Review",
            review_kind: "phase-1-assurance",
            reviewer: "independent-reviewer",
            summary: "The exact strategy is traceable and bounded.",
            rubric_ref: "policies/rubrics/bootstrap-review.md@3",
            findings: [],
            outcome: "pass",
          },
          links: [
            { type: "reviews", target: subject },
            { type: "contextualizes", target: "$proposal.context.revision_id" },
          ],
          body: "The active Phase 2 assurance Revision passes Review.\n",
        },
      }]);
      commit(repository, `Review ${subject}`);
    };
    reviewAssurance(seeded.strategy.datum.revision_id);

    const activityPacket = prepare(
      repository,
      "seed-public-phase-2-activity@1",
    );
    expect(exactInputs(activityPacket, "requirement")).toEqual([
      seeded.system!.datum.revision_id,
    ]);
    const activityExecution = submit(repository, activityPacket, [{
      localId: "activity",
      name: "activity",
      invocation: 0,
      lifecycleDatum: {
        type: "VER",
        payload: {
          title: "Representative system pilot activity",
          rationale: "Exercise the exact representative system behavior.",
          kind: "pilot",
          method: "test",
          assessment_mode: "automatic",
          claim: {
            kind: "pilot",
            scope: "verification-design",
            formal_evidence_eligible: false,
          },
          acceptance_criteria: ["The exact observable result is reported."],
          evidence_requirements: ["Retain the exact output bytes."],
          expected_success_activity: "Observe the expected result.",
          expected_discrimination_activity: "Reject a mismatched result.",
        },
        links: [],
        body: "One exact SYS-backed pilot activity.\n",
      },
    }]);
    const activity = submittedRevision(activityExecution, "activity");
    commit(repository, "Publish representative system pilot activity");

    const packet = prepare(repository, "review-phase-2-datum@1");
    const [subject] = exactInputs(packet, "subject");
    expect(subject).toBe(seeded.system!.datum.revision_id);
    const members = exactInputs(packet, "review_context_members");
    const execution = submit(repository, packet, [{
      localId: "context",
      name: "review_context",
      invocation: 0,
      lifecycleDatum: {
        type: "BSL",
        payload: {
          title: `Review context for ${subject}`,
          kind: "review-context",
          role: "review-context",
          scope: subject,
          group: "DEFAULT",
          definition_members: [subject, ...members].sort(),
          evidence: [],
        },
        links: [],
        body: "The exact Phase 2 system datum and selected support.\n",
      },
    }, {
      localId: "review",
      name: "review",
      invocation: 0,
      lifecycleDatum: {
        type: "REV",
        payload: {
          title: "Independent Phase 2 system Review",
          review_kind: "contextual",
          reviewer: "independent-reviewer",
          summary: "The exact system datum is traceable and observable.",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          findings: [],
          outcome: "pass",
        },
        links: [
          { type: "reviews", target: subject },
          { type: "contextualizes", target: "$proposal.context.revision_id" },
        ],
        body: "The exact Phase 2 system datum passes independent Review.\n",
      },
    }]);
    commit(repository, `Review ${subject} with its atomic context`);

    const contextRevision = submittedRevision(execution, "context");
    const reviewRevision = submittedRevision(execution, "review");
    const shownContext = mdlm(repository, "show", contextRevision, "--json");
    expect(shownContext.status, `${shownContext.stderr}${shownContext.stdout}`)
      .toBe(0);
    const context = JSON.parse(shownContext.stdout).lifecycleDatum;
    expect(context).toMatchObject({
      storage: { frozen: true },
      datum: {
        type: "BSL",
        created_by: { scenario: "review-phase-2-datum@1" },
        payload: {
          kind: "review-context",
          role: "review-context",
          scope: subject,
          definition_members: [subject, ...members].sort(),
        },
      },
    });
    const shownReview = mdlm(repository, "show", reviewRevision, "--json");
    expect(shownReview.status, `${shownReview.stderr}${shownReview.stdout}`)
      .toBe(0);
    expect(JSON.parse(shownReview.stdout).lifecycleDatum.datum).toMatchObject({
      type: "REV",
      created_by: { scenario: "review-phase-2-datum@1" },
      links: [
        { type: "reviews", target: subject },
        { type: "contextualizes", target: contextRevision },
      ],
    });

    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome.phase).toBe("phase-2-system-definition@10");
    expect(outcome.outcome).toBe("assignment");
    const nextPacket = outcome.assignment.packet as Packet;
    expect(nextPacket.scenario.reference).toBe("review-phase-1-assurance@1");
    expect(exactInputs(nextPacket, "subject")).toEqual([activity]);
    expect(outcome.materializedExecutions).toBeUndefined();
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}
