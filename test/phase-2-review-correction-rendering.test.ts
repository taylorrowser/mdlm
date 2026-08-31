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
      {
        name: "strategy",
        types: ["VSP"],
        cardinality: "one",
        required_links: [
          { link: "governs", target: { output: "stakeholder_requirement" } },
          { link: "governs-revision", target: { output: "stakeholder_requirement" } },
        ],
      },
      {
        name: "plan",
        types: ["DWP"],
        cardinality: "one",
        required_links: [
          { link: "decomposes", target: { output: "stakeholder_requirement" } },
          { link: "allocated-to", target: { output: "subject" } },
          { link: "verified-under", target: { output: "strategy" } },
        ],
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
      { name: "subject", types: ["ASP", "DWP"], cardinality: "one", identity: "revision" },
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
    satisfied_when: 'exists("seeded-phase-2-reviews-for@1", {subject: subject})',
    status_rules: [{
      status: "ready",
      priority: 1,
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
      description: "The exact seeded ASP and DWP correction subjects.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["ASP", "DWP"] },
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
    {
      kind: "selector-definition",
      id: "seeded-phase-2-reviews-for",
      version: 1,
      description: "Any exact seeded Review already published for one setup subject.",
      parameters: [{
        name: "subject",
        kind: "revision",
        types: ["ASP", "DWP"],
      }],
      result_kind: "revision",
      query: {
        from: {
          relation: "incoming-links",
          of: "subject",
          link: "reviews",
          emit: "source",
          types: ["REV"],
        },
        as: "review",
        where: "true",
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
    parameters: [{ name: "subject", kind: "revision", types: ["ASP", "DWP"] }],
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
  const correctionReviews = {
    kind: "selector-definition",
    id: "phase-2-correction-reviews-for-subject",
    version: 1,
    description: "Route the exact failed setup Review to the production correction adapter.",
    parameters: [
      { name: "subject", kind: "revision", types: ["SYS", "ASP", "ICSP", "DWP"] },
      { name: "view", kind: "scalar", scalar_type: "string" },
    ],
    result_kind: "revision",
    query: {
      from: {
        relation: "incoming-links",
        of: "subject",
        link: "reviews",
        emit: "source",
        types: ["REV"],
      },
      as: "review",
      where: 'review.payload.outcome == "fail"',
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  const correctableDecompositions = {
    kind: "selector-definition",
    id: "phase-2-correctable-decompositions",
    version: 1,
    description: "Route the exact seeded DWP carrying one failed setup Review.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["DWP"] },
      as: "subject",
      where: [
        'state(subject, "disposition") == "active"',
        '&& none("newer-revisions-for@1", {subject: subject})',
        '&& exists("phase-2-correction-reviews-for-subject@1",',
        '  {subject: subject, view: "local"})',
      ].join(" "),
      distinct: true,
      order_by: ["identity.id", "identity.revision"],
    },
  };

  for (const [relative, value] of [
    ["scenarios/seed-phase-2-correction-subject.yaml", seedScenario],
    ["scenarios/seed-failed-phase-2-review.yaml", reviewScenario],
    ["obligations/seed-phase-2-correction-subject-required.yaml", seedObligation],
    ["obligations/seed-failed-phase-2-review-required.yaml", reviewObligation],
    ["policies/seed-review-participation.yaml", reviewPolicy],
    ["selectors/phase-2-correction-reviews-for-subject.yaml", correctionReviews],
    ["selectors/phase-2-correctable-decompositions.yaml", correctableDecompositions],
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

async function definitionConsistencyPackage(parent: string): Promise<string> {
  const packageRoot = await correctionPackage(parent);
  for (const relative of [
    "obligations/seed-failed-phase-2-review-required.yaml",
    "scenarios/seed-failed-phase-2-review.yaml",
    "prompts/seed-failed-phase-2-review.md",
  ]) {
    await fs.rm(path.join(packageRoot, relative));
  }
  for (const relative of [
    "selectors/phase-2-correction-reviews-for-subject.yaml",
    "selectors/phase-2-correctable-decompositions.yaml",
  ]) {
    await fs.copyFile(
      path.join(process.cwd(), ".lifecycle/process", relative),
      path.join(packageRoot, relative),
    );
  }

  const write = async (relative: string, value: unknown) =>
    fs.writeFile(path.join(packageRoot, relative), stringify(value));
  const selector = (
    id: string,
    types: string[],
    scenario: string,
    extra = "true",
  ) => ({
    kind: "selector-definition",
    id,
    version: 1,
    description: `Exact ${id} regression records.`,
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types },
      as: "subject",
      where: `subject.provenance.scenario == "${scenario}@1" && (${extra})`,
      distinct: true,
      order_by: ["identity.type", "identity.id", "identity.revision"],
    },
  });

  const interfaceScenario = {
    kind: "scenario-definition",
    id: "seed-phase-2-consistency-interfaces",
    version: 1,
    description: "Publish two exact interfaces for the serial correction regression.",
    phases: ["phase-2-system-definition"],
    inputs: [
      { name: "architecture", types: ["ASP"], cardinality: "one", identity: "revision" },
      { name: "parent", types: ["STK"], cardinality: "one", identity: "revision" },
      { name: "strategy", types: ["VSP"], cardinality: "one", identity: "revision" },
    ],
    outputs: [
      ...["one", "two"].map((name) => ({
        name: `interface_${name}`,
        types: ["ICSP"],
        cardinality: "one",
        required_links: [
          { link: "defines-interface-for", target: { input: "architecture" } },
          { link: "defines-interface-for", target: { output: "revised_plan" } },
        ],
      })),
      {
        name: "revised_plan",
        types: ["DWP"],
        cardinality: "one",
        required_links: [
          { link: "decomposes", target: { input: "parent" } },
          { link: "allocated-to", target: { input: "architecture" } },
          { link: "governed-by", target: { output: "interface_one" } },
          { link: "governed-by", target: { output: "interface_two" } },
          { link: "verified-under", target: { input: "strategy" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-phase-2-consistency-interfaces.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-phase-2-consistency-interfaces-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const systemScenario = {
    kind: "scenario-definition",
    id: "seed-phase-2-consistency-systems",
    version: 1,
    description: "Publish retained and removed SYS subjects for the serial correction regression.",
    phases: ["phase-2-system-definition"],
    inputs: [
      { name: "parent", types: ["STK"], cardinality: "one", identity: "revision" },
      { name: "architecture", types: ["ASP"], cardinality: "one", identity: "revision" },
      { name: "interfaces", types: ["ICSP"], cardinality: "one-or-more", identity: "revision" },
      { name: "plan", types: ["DWP"], cardinality: "one", identity: "revision" },
    ],
    outputs: ["retained", "removed"].map((name) => ({
      name,
      types: ["SYS"],
      cardinality: "one",
      required_links: [
        { link: "derived-from", target: { input: "parent" } },
        { link: "decomposes", target: { input: "plan" } },
        { link: "allocated-to", target: { input: "architecture" } },
        { link: "governed-by", target: { input: "interfaces" } },
      ],
    })),
    prompt_ref: "prompts/seed-phase-2-consistency-systems.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-phase-2-consistency-systems-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const reviewScenario = {
    kind: "scenario-definition",
    id: "seed-phase-2-consistency-review",
    version: 1,
    description: "Publish one failed consistency Review with one removed SYS.",
    kernel_materialization: {
      kind: "exact-baseline@1",
      output: "review_context",
      subject_input: "plan",
      support_input: "context_members",
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
      { name: "plan", types: ["DWP"], cardinality: "one", identity: "revision" },
      { name: "context_members", types: ["ASP", "ICSP", "SYS"], cardinality: "one-or-more", identity: "revision" },
      { name: "definition_members", types: ["ASP", "ICSP", "DWP", "SYS"], cardinality: "one-or-more", identity: "revision" },
      { name: "removed", types: ["SYS"], cardinality: "one", identity: "revision" },
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
          { link: "reviews", target: { input: "plan" } },
          { link: "contextualizes", target: { output: "review_context" } },
          { link: "blocks", target: { input: "definition_members" } },
          { link: "flags", target: { input: "removed" } },
          { link: "removes", target: { input: "removed" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-phase-2-consistency-review.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-phase-2-consistency-review-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const obligation = (
    id: string,
    forEach: string,
    satisfiedWhen: string,
    scenario: string,
    inputs: Record<string, string>,
    priority: number,
  ) => ({
    kind: "obligation-definition",
    id,
    version: 1,
    description: `Prepare ${id} for the serial correction regression.`,
    phases: ["phase-2-system-definition"],
    for_each: forEach,
    subject_as: "subject",
    satisfied_when: satisfiedWhen,
    status_rules: [{ status: "ready", priority, when: `!(${satisfiedWhen})`, reason: "Seed exact regression evidence." }],
    default_status: "blocked",
    resolve_with: { scenario: `${scenario}@1`, inputs },
    waiver_policy_ref: "waiver-applicability@1",
  });

  await write("scenarios/seed-phase-2-consistency-interfaces.yaml", interfaceScenario);
  await write("scenarios/seed-phase-2-consistency-systems.yaml", systemScenario);
  await write("scenarios/seed-phase-2-consistency-review.yaml", reviewScenario);
  await write(
    "selectors/seeded-phase-2-consistency-interfaces.yaml",
    selector("seeded-phase-2-consistency-interfaces", ["ICSP"], "seed-phase-2-consistency-interfaces"),
  );
  await write(
    "selectors/seeded-phase-2-consistency-systems.yaml",
    selector("seeded-phase-2-consistency-systems", ["SYS"], "seed-phase-2-consistency-systems"),
  );
  await write(
    "selectors/seeded-phase-2-consistency-removed.yaml",
    selector(
      "seeded-phase-2-consistency-removed",
      ["SYS"],
      "seed-phase-2-consistency-systems",
      'subject.payload.title == "Removed system requirement"',
    ),
  );
  await write("selectors/seeded-phase-2-consistency-members.yaml", {
    kind: "selector-definition",
    id: "seeded-phase-2-consistency-members",
    version: 1,
    description: "The exact ASP, DWP, ICSP, and SYS consistency members.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["ASP", "ICSP", "DWP", "SYS"] },
      as: "subject",
      where: 'subject.provenance.scenario in ["seed-phase-2-correction-subject@1", "seed-phase-2-consistency-interfaces@1", "seed-phase-2-consistency-systems@1"] && (subject.identity.type != "DWP" || subject.provenance.scenario == "seed-phase-2-consistency-interfaces@1") && none("newer-revisions-for@1", {subject: subject})',
      distinct: true,
      order_by: ["identity.type", "identity.id", "identity.revision"],
    },
  });
  await write("selectors/seeded-phase-2-consistency-context-members.yaml", {
    kind: "selector-definition",
    id: "seeded-phase-2-consistency-context-members",
    version: 1,
    description: "The exact non-plan members supporting the Review Context.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["ASP", "ICSP", "SYS"] },
      as: "subject",
      where: 'subject.provenance.scenario in ["seed-phase-2-correction-subject@1", "seed-phase-2-consistency-interfaces@1", "seed-phase-2-consistency-systems@1"]',
      distinct: true,
      order_by: ["identity.type", "identity.id", "identity.revision"],
    },
  });
  await write("obligations/seed-phase-2-consistency-interfaces-required.yaml", obligation(
    "seed-phase-2-consistency-interfaces-required",
    'select("seeded-phase-2-correction-architectures@1", {})',
    'count("seeded-phase-2-consistency-interfaces@1", {}) == 2',
    "seed-phase-2-consistency-interfaces",
    {
      architecture: "subject",
      parent: 'one("seeded-phase-2-correction-parents@1", {})',
      strategy: 'one("seeded-phase-2-correction-strategies@1", {})',
    },
    900,
  ));
  await write("obligations/seed-phase-2-consistency-systems-required.yaml", obligation(
    "seed-phase-2-consistency-systems-required",
    'select("seeded-phase-2-correction-plans@1", {})',
    'count("seeded-phase-2-consistency-systems@1", {}) == 2',
    "seed-phase-2-consistency-systems",
    {
      parent: 'one("seeded-phase-2-correction-parents@1", {})',
      architecture: 'one("seeded-phase-2-correction-architectures@1", {})',
      interfaces: 'select("seeded-phase-2-consistency-interfaces@1", {})',
      plan: "subject",
    },
    800,
  ));
  await write("obligations/seed-phase-2-consistency-review-required.yaml", obligation(
    "seed-phase-2-consistency-review-required",
    'select("seeded-phase-2-correction-plans@1", {})',
    'exists("seeded-phase-2-consistency-reviews@1", {})',
    "seed-phase-2-consistency-review",
    {
      plan: "subject",
      context_members: 'select("seeded-phase-2-consistency-context-members@1", {})',
      definition_members: 'select("seeded-phase-2-consistency-members@1", {})',
      removed: 'one("seeded-phase-2-consistency-removed@1", {})',
    },
    700,
  ));
  await write(
    "selectors/seeded-phase-2-consistency-reviews.yaml",
    selector("seeded-phase-2-consistency-reviews", ["REV"], "seed-phase-2-consistency-review"),
  );
  await write(
    "selectors/seeded-phase-2-correction-plans.yaml",
    {
      kind: "selector-definition",
      id: "seeded-phase-2-correction-plans",
      version: 1,
      description: "The current exact seeded planning DWP.",
      parameters: [],
      result_kind: "revision",
      query: {
        from: { collection: "revisions", types: ["DWP"] },
        as: "subject",
        where: 'subject.provenance.scenario == "seed-phase-2-consistency-interfaces@1" && none("newer-revisions-for@1", {subject: subject})',
        distinct: true,
        order_by: ["identity.id", "identity.revision"],
      },
    },
  );
  await write(
    "selectors/seeded-phase-2-correction-architectures.yaml",
    selector("seeded-phase-2-correction-architectures", ["ASP"], "seed-phase-2-correction-subject"),
  );
  await write(
    "selectors/seeded-phase-2-correction-parents.yaml",
    selector("seeded-phase-2-correction-parents", ["STK"], "seed-phase-2-correction-subject"),
  );
  await write(
    "selectors/seeded-phase-2-correction-strategies.yaml",
    selector("seeded-phase-2-correction-strategies", ["VSP"], "seed-phase-2-correction-subject"),
  );
  for (const id of [
    "seed-phase-2-consistency-interfaces",
    "seed-phase-2-consistency-systems",
    "seed-phase-2-consistency-review",
  ]) {
    await fs.writeFile(
      path.join(packageRoot, `prompts/${id}.md`),
      `---\nid: ${id}\nversion: 1\nscenario: ${id}\n---\n\n# Seed exact serial correction evidence\n`,
    );
  }
  return packageRoot;
}

const publishedMaterializations = new Map<string, Set<string>>();

function commitMaterialized(repository: string, outcome: JsonObject): void {
  expect(outcome.assignment).toBeUndefined();
  const executions = outcome.materializedExecutions as JsonObject[];
  expect(executions.length).toBeGreaterThan(0);
  const seen = publishedMaterializations.get(repository) ?? new Set<string>();
  const roots = executions.map((execution) => {
    expect(execution.status).toBe("completed");
    expect(seen.has(execution.id), `replayed materialization ${execution.id}`)
      .toBe(false);
    return `.lifecycle/data/.transactions/${execution.id}`;
  });

  const status = spawnSync(
    "git",
    ["-C", repository, "status", "--porcelain=v1", "--untracked-files=all", "--", ".lifecycle/data"],
    { encoding: "utf8" },
  );
  expect(status.status, status.stderr).toBe(0);
  const changed = status.stdout.trim().split("\n").filter(Boolean)
    .map((line) => line.slice(3));
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every((file) =>
    roots.some((root) => file === root || file.startsWith(`${root}/`))
  ), status.stdout).toBe(true);
  for (const root of roots) {
    expect(changed.some((file) => file.startsWith(`${root}/`)), root).toBe(true);
  }

  const doctor = mdlm(repository, "doctor", "--json");
  expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
  const staged = spawnSync("git", ["-C", repository, "add", "--", ...roots], {
    encoding: "utf8",
  });
  expect(staged.status, staged.stderr).toBe(0);
  const stagedPaths = spawnSync(
    "git",
    ["-C", repository, "diff", "--cached", "--name-only"],
    { encoding: "utf8" },
  );
  expect(stagedPaths.status, stagedPaths.stderr).toBe(0);
  expect(stagedPaths.stdout.trim().split("\n").filter(Boolean).every((file) =>
    roots.some((root) => file === root || file.startsWith(`${root}/`))
  ), stagedPaths.stdout).toBe(true);
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
    "Publish exact materialized Lifecycle Data",
  ], { encoding: "utf8" });
  expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
  executions.forEach((execution) => seen.add(execution.id));
  publishedMaterializations.set(repository, seen);
}

function nextAssignment(repository: string): JsonObject {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    if (outcome.outcome === "publication-required") {
      commitMaterialized(repository, outcome);
      continue;
    }
    expect(outcome.assignment, next.stdout).toBeDefined();
    return outcome.assignment.packet;
  }
  throw new Error("Public route did not reach an Assignment");
}

function prepare(repository: string, scenario: string): JsonObject {
  const packet = nextAssignment(repository);
  expect(packet.scenario.reference).toBe(scenario);
  return packet;
}

function submit(
  repository: string,
  packet: JsonObject,
  fill: (output: JsonObject) => JsonObject | undefined,
  authority?: string,
): JsonObject {
  const response = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.map(fill).filter(Boolean);
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

export async function runPhaseTwoDefinitionConsistencySerialCorrection(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase2-consistency-"));
  try {
    const repository = path.join(root, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(
      repository,
      await definitionConsistencyPackage(root),
    );
    const input = (packet: JsonObject, name: string) =>
      packet.exactInputs[0].inputs.find((candidate: JsonObject) =>
        candidate.name === name
      );

    const seed = prepare(repository, "seed-phase-2-correction-subject@1");
    submit(repository, seed, (output) => {
      if (output.handle === "product") return {
        ...output,
        payload: {
          title: "Serial correction product",
          rationale: "Bound one exact Phase 2 correction regression.",
          problem: "One observable behavior needs a system definition.",
          users: ["operator"],
          goals: ["Observe one deterministic result"],
          non_goals: ["Choose implementation details"],
          success_measures: ["The result is exact"],
        },
        body: "One bounded product.\n",
      };
      if (output.handle === "stakeholder_requirement") return {
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
      if (output.handle === "subject") return {
        ...output,
        payload: {
          title: "System architecture",
          rationale: "Allocate the behavior to one stable element.",
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
      if (output.handle === "strategy") return {
        ...output,
        payload: {
          title: "System verification strategy",
          rationale: "Constrain the exact decomposition.",
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
          evidence_policy: "Retain exact observable outcomes.",
          assessment_policy: "Compare each result to the exact requirement.",
          environment_profile: {
            id: "serial-correction-test",
            purpose: "Exercise serial correction.",
            capabilities: {
              controllability: ["Provide one request"],
              observability: ["Observe one result"],
              external_services: [],
              timing: "Deterministic completion",
            },
          },
        },
        body: "One verification strategy.\n",
      };
      return {
        ...output,
        payload: {
          title: "Serial correction decomposition",
          rationale: "Bound the exact definition set.",
          stage: "planning",
          architecture_element: "AEL-0123456789",
          target_child_type: "SYS",
          behavioral_slice: "Report one result.",
          expected_coverage: ["One operator-visible behavior"],
          exclusions: [],
          dependencies: [],
          required_review_policy: "review-applicability@1",
        },
        body: "One planning decomposition.\n",
      };
    });
    commit(repository, "Seed serial correction definition roots");

    const interfaces = prepare(
      repository,
      "seed-phase-2-consistency-interfaces@1",
    );
    const architectureRevision = input(interfaces, "architecture")
      .values[0].identity.revision_id;
    submit(repository, interfaces, (output) =>
      output.handle === "revised_plan" ? {
        ...output,
        payload: {
          title: "Interface-bound serial correction decomposition",
          rationale: "Bind the exact definition set after both interfaces exist.",
          stage: "planning",
          architecture_element: "AEL-0123456789",
          target_child_type: "SYS",
          behavioral_slice: "Report one result.",
          expected_coverage: ["One operator-visible behavior"],
          exclusions: [],
          dependencies: [],
          required_review_policy: "review-applicability@1",
        },
        body: "The planning DWP now names both exact interfaces.\n",
      } : {
        ...output,
        payload: {
        title: `Interface ${output.handle}`,
        rationale: "Expose one independently controlled boundary.",
        architecture_revision: architectureRevision,
        boundaries: [{
          from_element: "AEL-0123456789",
          to_element: "AEL-0123456789",
        }],
        operations: [`operate-${output.handle}`],
        schemas: ["request -> result"],
        units: [],
        timing: ["deterministic"],
        errors: ["invalid request"],
        security: [],
        ordering: [],
        compatibility: ["versioned"],
        interface_version: "1",
        },
        body: `Exact ${output.handle}.\n`,
      }
    );
    commit(repository, "Seed two consistency interfaces");

    const systems = prepare(
      repository,
      "seed-phase-2-consistency-systems@1",
    );
    const systemArchitectureRevision = input(systems, "architecture")
      .values[0].identity.revision_id;
    submit(repository, systems, (output) => ({
      ...output,
      payload: {
        title: output.handle === "removed"
          ? "Removed system requirement"
          : "Retained system requirement",
        rationale: "Exercise exact scope reduction.",
        statement: `The system shall provide the ${output.handle} result.`,
        verification_intent: `Observe the ${output.handle} result.`,
        architecture_allocation: {
          architecture_revision: systemArchitectureRevision,
          element: "AEL-0123456789",
        },
      },
      body: `One ${output.handle} system requirement.\n`,
    }));
    commit(repository, "Seed retained and removed systems");

    const failed = prepare(
      repository,
      "seed-phase-2-consistency-review@1",
    );
    const planRevision = input(failed, "plan").values[0].identity.revision_id;
    const removedRevision = input(failed, "removed").values[0].identity.revision_id;
    const failedResult = submit(repository, failed, (output) =>
      output.handle === "context" ? {
        ...output,
        payload: {},
        body: "The kernel freezes the exact definition context.\n",
      } : {
        ...output,
        payload: {
        title: "Failed definition consistency Review",
        review_kind: "simplification-architecture-interfaces",
        reviewer: "independent-reviewer",
        summary: "Retain one SYS and correct every retained definition member.",
        decomposition_plan_revision: planRevision,
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        definition_simplification: {
          primary_target: planRevision,
          correction_set: "definition-consistency",
          primary_findings: [{
            id: "F-001",
            severity: "blocking",
            summary: "Correct the retained definition serially.",
            criterion: "Every retained member must be coherent.",
            evidence: "The current exact set is inconsistent.",
            material_consequence: "The candidate could contradict its definition.",
          }],
          collateral_findings: [{
            id: "F-002",
            severity: "blocking",
            summary: "Remove one obsolete SYS.",
            criterion: "Obsolete scope must not survive.",
            evidence: removedRevision,
            material_consequence: "The candidate would retain rejected scope.",
          }],
          scope_reduction: { rationale: "Remove the obsolete SYS only." },
        },
        correction_authority: "package-evidence",
        outcome: "fail",
        },
        body: "The exact retained set needs serial correction.\n",
      }
    );
    const reviewRevision = failedResult.receipt.publications.find(
      (publication: JsonObject) => publication.handle === "review",
    ).revisionId;
    commit(repository, "Publish failed definition consistency Review");

    const expected = new Map([
      ["revise-phase-2-subject-after-review@1", ["subject", "reviews", "governed_subjects"]],
      ["revise-phase-2-interface-after-review@1", ["subject", "reviews", "interface_subjects"]],
      ["revise-phase-2-decomposition-after-review@1", ["subject", "reviews", "parents", "architecture", "interfaces", "verification_strategy"]],
      ["revise-phase-2-system-requirement-after-review@1", ["subject", "reviews", "parents", "plans", "architectures", "interfaces"]],
    ]);
    const scenarios: string[] = [];
    const correctedSubjects: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const correction = nextAssignment(repository);
      const scenario = correction.scenario.reference as string;
      expect(expected.has(scenario), scenario).toBe(true);
      scenarios.push(scenario);
      const subjectInput = input(correction, "subject");
      const subject = subjectInput.values[0];
      correctedSubjects.push(subject.identity.revision_id);
      expect(subject.identity.revision_id).not.toBe(removedRevision);
      expect(input(correction, "reviews").values.map(
        (value: JsonObject) => value.identity.revision_id,
      )).toContain(reviewRevision);
      for (const name of expected.get(scenario)!) {
        expect(input(correction, name).values.length, `${scenario}:${name}`)
          .toBeGreaterThan(0);
      }
      const result = submit(repository, correction, (output) =>
        output.handle === "decision" ? undefined : {
          ...output,
          payload: subject.data.payload,
          body: `Serial correction of ${subject.identity.revision_id}.\n`,
        }
      );
      expect(result.receipt.publications[0]).toEqual(expect.objectContaining({
        stableId: subject.identity.id,
        revisionId: `${subject.identity.id}-r${String(
          subject.identity.revision + 1,
        ).padStart(5, "0")}`,
      }));
      commit(repository, `Correct retained definition member ${index + 1}`);
    }
    expect(scenarios.filter((scenario) =>
      scenario === "revise-phase-2-interface-after-review@1"
    )).toHaveLength(2);
    expect(new Set(correctedSubjects).size).toBe(5);
    expect(correctedSubjects).not.toContain(removedRevision);

    const fresh = mdlm(repository, "next", "--json");
    expect(fresh.status, `${fresh.stderr}${fresh.stdout}`).toBe(0);
    const freshOutcome = JSON.parse(fresh.stdout);
    if (freshOutcome.outcome === "publication-required") {
      expect(freshOutcome.assignment).toBeUndefined();
      expect(freshOutcome.materializedExecutions.map(
        (execution: JsonObject) => execution.scenario,
      )).toEqual(expect.arrayContaining([expect.stringMatching(/review|context/)]));
    } else {
      expect(freshOutcome.assignment.packet.scenario.reference).toMatch(
        /review|context/,
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
