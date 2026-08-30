import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";

type JsonObject = Record<string, any>;

async function expectTypeSpecificCorrectionScaffolds(): Promise<void> {
  const cases = [
    {
      scenario: "revise-phase-2-system-requirement-after-review",
      type: "SYS",
      links: ["corrects-review", "derived-from", "decomposes", "allocated-to", "governed-by"],
    },
    {
      scenario: "revise-phase-2-subject-after-review",
      type: "ASP",
      links: ["corrects-review", "governs"],
    },
    {
      scenario: "revise-phase-2-interface-after-review",
      type: "ICSP",
      links: ["corrects-review", "defines-interface-for"],
    },
    {
      scenario: "revise-phase-2-decomposition-after-review",
      type: "DWP",
      links: [
        "corrects-review",
        "decomposes",
        "allocated-to",
        "governed-by",
        "verified-under",
        "derived-from",
        "produces",
        "justifies",
      ],
    },
  ];
  for (const expected of cases) {
    const definition = parse(await fs.readFile(
      path.join(
        process.cwd(),
        `.lifecycle/process/scenarios/${expected.scenario}.yaml`,
      ),
      "utf8",
    ));
    expect(definition.outputs).toEqual([
      expect.objectContaining({
        name: "replacement",
        types: [expected.type],
        identity_from: { input: "subject" },
        required_links: expected.links.map((link) => expect.objectContaining({ link })),
      }),
      expect.objectContaining({
        name: "decision",
        types: ["DEC"],
        cardinality: "zero-or-one",
      }),
    ]);
  }
}

function commit(repository: string, message: string): void {
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"], {
    encoding: "utf8",
  }).status).toBe(0);
  const committed = spawnSync("git", [
    "-C",
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
  ], { encoding: "utf8" });
  expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
}

async function correctionPackage(parent: string): Promise<string> {
  const packageRoot = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), packageRoot, {
    recursive: true,
  });

  const profilePath = path.join(packageRoot, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-2-system-definition"];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(
    packageRoot,
    "phases/phase-2-system-definition.yaml",
  );
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.attention_checkpoints = [];
  phase.routing.status_order = ["ready", "awaiting-review", "failed", "stale", "blocked"];
  await fs.writeFile(phasePath, stringify(phase));
  for (const phaseId of [
    "phase-0-wayfinding",
    "phase-1-product-assurance",
    "phase-2-pilot-assessment",
    "phase-7-change-control",
  ]) {
    const otherPath = path.join(packageRoot, `phases/${phaseId}.yaml`);
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-phase-2-correction-subject",
    version: 1,
    description: "Publish one exact ASP subject for the correction regression.",
    phases: ["phase-2-system-definition"],
    inputs: [],
    outputs: [
      { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
      {
        name: "stakeholder_requirement",
        types: ["STK"],
        cardinality: "one",
        required_links: [{ link: "derived-from", target: { output: "product" } }],
      },
      {
        name: "subject",
        types: ["ASP"],
        cardinality: "one",
        required_links: [{
          link: "governs",
          target: { output: "stakeholder_requirement" },
        }],
      },
    ],
    prompt_ref: "prompts/seed-phase-2-correction-subject.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-phase-2-correction-subject-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const reviewScenario = {
    kind: "scenario-definition",
    id: "seed-failed-phase-2-review",
    version: 1,
    description: "Publish one exact failed Review through an independent transaction.",
    kernel_materialization: {
      kind: "exact-baseline@1",
      output: "review_context",
      subject_input: "subject",
      support_input: "review_context_members",
      payload_fields: {
        title: "title",
        kind: "kind",
        role: "role",
        scope: "scope",
        group: "group",
        members: "definition_members",
        evidence: "evidence",
      },
      title_prefix: "Review context for ",
      baseline_kind: "review-context",
      baseline_role: "review-context",
      baseline_group: "DEFAULT",
      evidence_subject_types: [],
      evidence_types: [],
    },
    phases: ["phase-2-system-definition"],
    inputs: [
      { name: "subject", types: ["ASP"], cardinality: "one", identity: "revision" },
      {
        name: "review_context_members",
        types: ["PSP", "STK"],
        cardinality: "zero-or-more",
        identity: "revision",
      },
    ],
    outputs: [
      {
        name: "review_context",
        handle: "context",
        types: ["BSL"],
        cardinality: "one",
        required_links: [],
      },
      {
        name: "review",
        types: ["REV"],
        cardinality: "one",
        required_links: [
          { link: "reviews", target: { input: "subject" } },
          { link: "contextualizes", target: { output: "review_context" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-failed-phase-2-review.md@1",
    review_policy_ref: "review-applicability@1",
    participation: {
      policy_ref: "seed-review-participation@1",
      arguments: { subject: "subject" },
    },
    authority_evidence: { output: "review", type: "REV" },
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-failed-phase-2-review-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition",
    id: "seed-phase-2-correction-subject-required",
    version: 1,
    description: "The regression requires one exact Phase 2 subject.",
    phases: ["phase-2-system-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("seeded-phase-2-correction-subjects@1", {})',
    status_rules: [{
      status: "ready",
      priority: 1000,
      when: 'none("seeded-phase-2-correction-subjects@1", {})',
      reason: "Publish the exact regression subject.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-phase-2-correction-subject@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const reviewObligation = {
    kind: "obligation-definition",
    id: "seed-failed-phase-2-review-required",
    version: 1,
    description: "The regression requires one exact failed Review.",
    phases: ["phase-2-system-definition"],
    for_each: 'select("seeded-phase-2-correction-subjects@1", {})',
    subject_as: "subject",
    satisfied_when: 'exists("failing-reviews-for@1", {subject: subject})',
    status_rules: [{
      status: "ready",
      priority: 1000,
      when: 'none("failing-reviews-for@1", {subject: subject})',
      reason: "Publish the exact failed Review.",
    }],
    default_status: "blocked",
    resolve_with: {
      scenario: "seed-failed-phase-2-review@1",
      inputs: {
        subject: "subject",
        review_context_members: 'select("seeded-phase-2-correction-context@1", {})',
      },
    },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const selectors = [
    {
      kind: "selector-definition",
      id: "seeded-phase-2-correction-subjects",
      version: 1,
      description: "The exact seeded ASP correction subject.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["ASP"] },
        as: "subject",
        where: 'subject.provenance.scenario == "seed-phase-2-correction-subject@1"',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
    {
      kind: "selector-definition",
      id: "seeded-phase-2-correction-context",
      version: 1,
      description: "The exact PSP and STK context of the seeded ASP.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["PSP", "STK"] },
        as: "member",
        where: 'member.provenance.scenario == "seed-phase-2-correction-subject@1"',
        distinct: true,
        order_by: ["identity.revision_id"],
      },
    },
  ];
  const reviewPolicy = {
    kind: "policy-definition",
    id: "seed-review-participation",
    version: 1,
    description: "Delegate the exact regression Review without scheduled attention.",
    parameters: [{ name: "subject", kind: "revision", types: ["ASP"] }],
    result_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: [
        "authority_mode",
        "authority",
        "delegation_allowed",
        "attention_timing",
        "attention_checkpoint",
        "consolidation_group",
      ],
      properties: {
        authority_mode: { type: "string", enum: ["autonomous", "delegated", "attended"] },
        authority: { type: "string", minLength: 1 },
        delegation_allowed: { type: "boolean" },
        attention_timing: { type: "string", enum: ["none", "immediate", "checkpoint"] },
        attention_checkpoint: { type: ["string", "null"] },
        consolidation_group: { type: ["string", "null"] },
      },
    },
    default: {
      authority_mode: "delegated",
      authority: "independent-reviewer",
      delegation_allowed: true,
      attention_timing: "none",
      attention_checkpoint: null,
      consolidation_group: null,
    },
    rules: [],
  };

  for (const [relative, value] of [
    ["scenarios/seed-phase-2-correction-subject.yaml", seedScenario],
    ["scenarios/seed-failed-phase-2-review.yaml", reviewScenario],
    ["obligations/seed-phase-2-correction-subject-required.yaml", seedObligation],
    ["obligations/seed-failed-phase-2-review-required.yaml", reviewObligation],
    ["policies/seed-review-participation.yaml", reviewPolicy],
    ...selectors.map((selector) => [`selectors/${selector.id}.yaml`, selector]),
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(packageRoot, relative), stringify(value));
  }
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-phase-2-correction-subject.md"),
    "---\nid: seed-phase-2-correction-subject\nversion: 1\nscenario: seed-phase-2-correction-subject\n---\n\n# Seed the exact subject\n",
  );
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-failed-phase-2-review.md"),
    "---\nid: seed-failed-phase-2-review\nversion: 1\nscenario: seed-failed-phase-2-review\n---\n\n# Review the exact subject\n",
  );
  return packageRoot;
}

function prepare(repository: string, scenario: string): JsonObject {
  const next = mdlm(repository, "next", "--json");
  expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
  const outcome = JSON.parse(next.stdout);
  expect(outcome.assignment, next.stdout).toBeDefined();
  expect(outcome.assignment.packet.scenario.reference).toBe(scenario);
  return outcome.assignment.packet;
}

function submit(
  repository: string,
  packet: JsonObject,
  fill: (output: JsonObject) => JsonObject,
  authority?: string,
): JsonObject {
  const response = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.map(fill);
  response.proposal.completionEvidence = { summary: `Complete ${packet.scenario.reference}.` };
  const arguments_ = ["scenario", "submit", "-", "--json"];
  if (authority) arguments_.splice(3, 0, "--authority", authority);
  const submitted = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    ...arguments_,
  );
  expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
  return JSON.parse(submitted.stdout);
}

export async function runPhaseTwoReviewCorrectionRendering(): Promise<void> {
  await expectTypeSpecificCorrectionScaffolds();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase2-correction-"));
  try {
  const repository = path.join(root, "repository");
  await fs.mkdir(repository);
  await selectProcessPackageFixture(repository, await correctionPackage(root));

  const seed = prepare(repository, "seed-phase-2-correction-subject@1");
  const seeded = submit(repository, seed, (output) => {
    if (output.handle === "product") {
      return {
        ...output,
        payload: {
          title: "Correction product",
          rationale: "Bound the exact Phase 2 renderer regression.",
          problem: "One observable behavior needs a system definition.",
          users: ["operator"],
          goals: ["Observe one deterministic result"],
          non_goals: ["Choose implementation details"],
          success_measures: ["The result is exact"],
        },
        body: "One bounded product.\n",
      };
    }
    if (output.handle === "stakeholder_requirement") {
      return {
        ...output,
        payload: {
          title: "Report one result",
          rationale: "Expose one exact operator-visible behavior.",
          statement: "The product shall report one result.",
          verification_intent: "Observe the exact result.",
          stakeholder: "operator",
          priority: "must",
          system_context: "product",
        },
        body: "One stakeholder requirement.\n",
      };
    }
    return {
      ...output,
      payload: {
        title: "System architecture",
        rationale: "Allocate the operator-visible behavior to one stable element.",
        level: "system",
        elements: [{
          id: "AEL-0123456789",
          alias: "CORE",
          title: "Core",
          responsibilities: ["Report the exact result"],
        }],
        internal_interactions: [],
        controlled_boundaries: [],
        constraints: [],
        nominated_risks: [],
      },
      body: "One system architecture.\n",
    };
  });
  commit(repository, "Seed Phase 2 correction subject");
  const subjectRevision = seeded.receipt.publications.find(
    (publication: JsonObject) => publication.handle === "subject",
  ).revisionId;

  const review = prepare(repository, "seed-failed-phase-2-review@1");
  submit(repository, review, (output) => {
    if (output.handle === "context") {
      return { ...output, payload: {}, body: "The kernel freezes this context.\n" };
    }
    return {
      ...output,
      payload: {
        title: `Review ${subjectRevision}`,
        review_kind: "contextual",
        reviewer: "independent-reviewer",
        summary: "The exact deterministic result is missing.",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [{
          id: "F-001",
          target: subjectRevision,
          relationship: "primary",
          severity: "blocking",
          summary: "State the deterministic result explicitly.",
          criterion: "The system behavior must be unambiguous.",
          evidence: "The exact result is not named.",
          material_consequence: "Two conforming implementations could disagree.",
        }],
        correction_authority: "package-evidence",
        outcome: "fail",
      },
      body: "The exact ASP needs one bounded correction.\n",
    };
  }, "independent-reviewer");
  commit(repository, "Publish failed Phase 2 Review");

  const correction = prepare(
    repository,
    "revise-phase-2-subject-after-review@1",
  );
  expect(correction.outputs).toEqual([
    expect.objectContaining({
      handle: "replacement",
      type: "ASP",
      cardinality: "one",
      identity: { input: "subject" },
    }),
    expect.objectContaining({
      handle: "decision",
      type: "DEC",
      cardinality: "zero-or-one",
    }),
  ]);
  expect(correction.responseScaffold.proposal.outputs).toEqual([
    expect.objectContaining({
      handle: "replacement",
      type: "ASP",
      links: [
        { type: "corrects-review", target: { input: "reviews" } },
        { type: "governs", target: { input: "governed_subjects" } },
      ],
    }),
    expect.objectContaining({ handle: "decision", type: "DEC" }),
  ]);

  const subject = correction.exactInputs[0].inputs.find(
    (input: JsonObject) => input.name === "subject",
  ).values[0];
  const response = structuredClone(correction.responseScaffold);
  response.proposal.outputs = response.proposal.outputs
    .filter((output: JsonObject) => output.handle === "replacement")
    .map((output: JsonObject) => ({
      ...output,
      payload: {
        ...subject.data.payload,
        constraints: ["Report acceptance deterministically"],
      },
      body: "The corrected ASP names the deterministic allocation constraint.\n",
    }));
  response.proposal.completionEvidence = {
    summary: "The bounded ASP correction resolves the exact failed Review.",
  };
  const submitted = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    "scenario",
    "submit",
    "-",
    "--json",
  );
  expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
  expect(JSON.parse(submitted.stdout).receipt.publications).toEqual([
    expect.objectContaining({
      handle: "replacement",
      stableId: subject.identity.id,
      revisionId: `${subject.identity.id}-r00002`,
    }),
  ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
