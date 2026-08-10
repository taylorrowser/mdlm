import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

export interface TerminalOutcomeDeclaration {
  condition: string;
  explanation: string;
}

export interface TerminalOutcomeDeclarations {
  profile_boundary?: TerminalOutcomeDeclaration;
  lifecycle_complete?: TerminalOutcomeDeclaration;
}

const definitionDirectories = [
  "aliases",
  "obligations",
  "phases",
  "policies",
  "profiles",
  "prompts",
  "scenarios",
  "selectors",
  "skills",
  "states",
  "templates",
  "types",
] as const;

function run(
  command: string,
  arguments_: string[],
  cwd: string,
): ReturnType<typeof spawnSync> {
  const result = spawnSync(command, arguments_, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} failed: ${result.stderr}${result.stdout}`,
    );
  }
  return result;
}

async function writeYaml(
  root: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringify(value));
}

/** Build the smallest valid package needed to exercise terminal outcomes. */
export async function terminalProcessPackage(
  parent: string,
  terminalOutcomes?: TerminalOutcomeDeclarations,
): Promise<string> {
  const root = path.join(parent, `terminal-process-${randomUUID()}`);
  const kernelPackage = path.join(process.cwd(), ".lifecycle/process");
  await fs.mkdir(root, { recursive: true });
  await Promise.all([
    fs.cp(path.join(kernelPackage, "meta"), path.join(root, "meta"), {
      recursive: true,
    }),
    fs.cp(
      path.join(kernelPackage, "primitives"),
      path.join(root, "primitives"),
      { recursive: true },
    ),
    ...definitionDirectories.map((directory) =>
      fs.mkdir(path.join(root, directory), { recursive: true })
    ),
  ]);

  const manifest = parse(
    await fs.readFile(path.join(kernelPackage, "manifest.yaml"), "utf8"),
  );
  Object.assign(manifest, {
    id: "terminal-fixture",
    version: "1.0.0",
    description: "Small package-neutral fixture for explicit terminal outcomes.",
    kernel_capabilities: {},
    catalog: {
      templates: ["terminal-datum"],
      types: ["ITM"],
      policies: ["no-waiver"],
      states: [],
      selectors: ["terminal-evidence"],
      obligations: ["terminal-check"],
      scenarios: ["record-terminal-item"],
      phases: ["phase-0-terminal"],
      aliases: [],
    },
    assets: {
      prompts: ["prompts/record-terminal-item.md@1"],
      skills: [],
      rubrics: [],
    },
    profiles: {
      default: "terminal@1",
      available: ["profiles/terminal.yaml@1"],
    },
    provenance: {
      created_by: "terminal-outcome-test@1",
      intent: "package-neutral-terminal-fixture",
      normative_scope: "test-only",
    },
  });
  await writeYaml(root, "manifest.yaml", manifest);
  await writeYaml(root, "templates/terminal-datum.yaml", {
    kind: "type-template-definition",
    id: "terminal-datum",
    version: 1,
    description: "A deliberately generic fixture datum.",
    payload_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
    outgoing_links: [],
  });
  await writeYaml(root, "types/ITM.yaml", {
    kind: "type-definition",
    id: "ITM",
    version: 1,
    name: "Fixture Item",
    description: "A generic item that is absent in terminal snapshots.",
    extends: "terminal-datum@1",
    lifecycle: { authorship: "authored", freeze_when: "explicit" },
    payload_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
    outgoing_links: [],
    kernel_managed_payload_paths: [],
  });
  await writeYaml(root, "policies/no-waiver.yaml", {
    kind: "policy-definition",
    id: "no-waiver",
    version: 1,
    description: "No fixture obligation is waived.",
    parameters: [{ name: "instance", kind: "scalar", scalar_type: "string" }],
    result_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        permitted: { type: "boolean" },
        approval_required: { type: "boolean" },
        applicable: { type: "boolean" },
        scope: { type: ["string", "null"] },
      },
    },
    default: {
      permitted: false,
      approval_required: false,
      applicable: false,
      scope: null,
    },
    rules: [],
  });
  await writeYaml(root, "selectors/terminal-evidence.yaml", {
    kind: "selector-definition",
    id: "terminal-evidence",
    version: 1,
    description: "Select any remaining generic fixture items.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["ITM"] },
      as: "item",
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  });
  await writeYaml(root, "obligations/terminal-check.yaml", {
    kind: "obligation-definition",
    id: "terminal-check",
    version: 1,
    description: "A satisfied obligation leaves no reachable work.",
    phases: ["phase-0-terminal"],
    for_each: "[phase]",
    subject_as: "terminal_scope",
    satisfied_when: "true",
    status_rules: [{
      status: "ready",
      priority: 1,
      when: "true",
      reason: "The fixture would record one generic item if unsatisfied.",
    }],
    default_status: "ready",
    resolve_with: { scenario: "record-terminal-item@1", inputs: {} },
    waiver_policy_ref: "no-waiver@1",
  });
  await writeYaml(root, "scenarios/record-terminal-item.yaml", {
    kind: "scenario-definition",
    id: "record-terminal-item",
    version: 1,
    description: "Record one generic fixture item.",
    phases: ["phase-0-terminal"],
    inputs: [],
    outputs: [{
      name: "item",
      types: ["ITM"],
      cardinality: "one",
      required_links: [],
    }],
    prompt_ref: "prompts/record-terminal-item.md@1",
    review_policy_ref: "no-waiver@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["terminal-check"],
    prohibited_inputs: [],
    batching: "single",
  });
  await fs.writeFile(
    path.join(root, "prompts/record-terminal-item.md"),
    "# Record terminal fixture item\n",
  );
  await writeYaml(root, "phases/phase-0-terminal.yaml", {
    kind: "phase-definition",
    id: "phase-0-terminal",
    version: 1,
    order: 0,
    name: "Terminal fixture",
    purpose: "Exercise package-authored terminal semantics.",
    coverage: "bootstrap-subset",
    omitted_capabilities: ["external fixture work"],
    entry: "true",
    scenarios: ["record-terminal-item@1"],
    obligations: ["terminal-check@1"],
    outputs: ["ITM"],
    progression: null,
    gate: {
      required: false,
      candidate_selector: "[]",
      candidate_as: "candidate",
      obligation: "terminal-check@1",
      completion: "false",
    },
  });
  await writeYaml(root, "profiles/terminal.yaml", {
    kind: "implementation-profile-definition",
    id: "terminal",
    version: 1,
    status: "experimental",
    description: "A bounded package-neutral terminal fixture.",
    enabled: {
      types: ["ITM"],
      phases: ["phase-0-terminal"],
      obligation_statuses: ["ready"],
    },
    disabled_capabilities: ["broader fixture coverage"],
    success_criteria: ["The exact declared terminal outcome is reported."],
    ...(terminalOutcomes ? { terminal_outcomes: terminalOutcomes } : {}),
  });
  return root;
}

export async function checkpointProcessRepository(
  parent: string,
): Promise<string> {
  const processRoot = await terminalProcessPackage(parent);
  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.id = "checkpoint-fixture";
  manifest.version = "1.0.0";
  manifest.description =
    "Small package-neutral fixture for one consolidated checkpoint conversation.";
  manifest.catalog.types = ["ITM", "QUE", "EVD"];
  manifest.catalog.policies = ["no-waiver", "queue-participation"];
  manifest.catalog.selectors = ["terminal-evidence", "open-queue-items"];
  manifest.catalog.obligations = ["queue-resolution"];
  manifest.catalog.scenarios = ["resolve-queue-item", "seed-queue-item"];
  manifest.assets.prompts = [
    "prompts/resolve-queue-item.md@1",
    "prompts/seed-queue-item.md@1",
  ];
  await writeYaml(processRoot, "manifest.yaml", manifest);
  await Promise.all([
    fs.rm(path.join(processRoot, "obligations/terminal-check.yaml")),
    fs.rm(path.join(processRoot, "scenarios/record-terminal-item.yaml")),
  ]);
  await writeYaml(processRoot, "types/QUE.yaml", {
    kind: "type-definition",
    id: "QUE",
    version: 1,
    name: "Fixture Question",
    description: "An exact package-owned question for checkpoint attention.",
    extends: "terminal-datum@1",
    lifecycle: { authorship: "authored", freeze_when: "explicit" },
    payload_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["question", "blocking_impact", "open"],
      properties: {
        question: { type: "string", minLength: 1 },
        blocking_impact: { type: "string", minLength: 1 },
        open: { type: "boolean" },
      },
    },
    outgoing_links: [],
    kernel_managed_payload_paths: [],
  });
  await writeYaml(processRoot, "types/EVD.yaml", {
    kind: "type-definition",
    id: "EVD",
    version: 1,
    name: "Fixture Resolution Evidence",
    description: "Exact normalized authority evidence for one fixture question.",
    extends: "terminal-datum@1",
    lifecycle: { authorship: "authored", freeze_when: "explicit" },
    payload_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["answer"],
      properties: { answer: { type: "string", minLength: 1 } },
    },
    outgoing_links: [],
    kernel_managed_payload_paths: [],
  });
  await writeYaml(processRoot, "selectors/open-queue-items.yaml", {
    kind: "selector-definition",
    id: "open-queue-items",
    version: 1,
    description: "Select exact unresolved fixture questions.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["QUE"] },
      as: "question",
      where: "question.payload.open == true",
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  });
  await writeYaml(processRoot, "policies/queue-participation.yaml", {
    kind: "policy-definition",
    id: "queue-participation",
    version: 1,
    description: "Schedule compatible exact questions at one declared checkpoint.",
    parameters: [{ name: "question", kind: "revision", types: ["QUE"] }],
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
        authority_mode: {
          type: "string",
          enum: ["autonomous", "delegated", "attended"],
        },
        authority: { type: "string", minLength: 1 },
        delegation_allowed: { type: "boolean" },
        attention_timing: {
          type: "string",
          enum: ["none", "immediate", "checkpoint"],
        },
        attention_checkpoint: { type: ["string", "null"] },
        consolidation_group: { type: ["string", "null"] },
      },
    },
    default: {
      authority_mode: "attended",
      authority: "fixture-stakeholder",
      delegation_allowed: false,
      attention_timing: "checkpoint",
      attention_checkpoint: "definition-gate",
      consolidation_group: "fixture-questions",
    },
    rules: [],
  });
  await writeYaml(processRoot, "obligations/queue-resolution.yaml", {
    kind: "obligation-definition",
    id: "queue-resolution",
    version: 1,
    description: "Every exact fixture question needs normalized evidence.",
    phases: ["phase-0-terminal"],
    for_each: 'select("open-queue-items@1", {})',
    subject_as: "question",
    satisfied_when: "false",
    status_rules: [{
      status: "ready",
      priority: 1,
      when: "true",
      reason: "The exact question is ready at its declared checkpoint.",
    }],
    default_status: "ready",
    resolve_with: {
      scenario: "resolve-queue-item@1",
      inputs: { question: "question" },
    },
    waiver_policy_ref: "no-waiver@1",
  });
  await writeYaml(processRoot, "scenarios/seed-queue-item.yaml", {
    kind: "scenario-definition",
    id: "seed-queue-item",
    version: 1,
    description: "Seed one exact fixture question before public evaluation.",
    phases: ["phase-0-terminal"],
    inputs: [],
    outputs: [{
      name: "question",
      types: ["QUE"],
      cardinality: "one",
      required_links: [],
    }],
    prompt_ref: "prompts/seed-queue-item.md@1",
    review_policy_ref: "no-waiver@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: [],
    initiation: "explicit",
    prohibited_inputs: [],
    batching: "single",
  });
  await fs.writeFile(
    path.join(processRoot, "prompts/seed-queue-item.md"),
    "---\nid: seed-queue-item\nversion: 1\nscenario: seed-queue-item\n---\n\n# Seed one exact fixture question\n",
  );
  await writeYaml(processRoot, "scenarios/resolve-queue-item.yaml", {
    kind: "scenario-definition",
    id: "resolve-queue-item",
    version: 1,
    description: "Publish one normalized exact question resolution.",
    phases: ["phase-0-terminal"],
    inputs: [{
      name: "question",
      types: ["QUE"],
      identity: "revision",
      cardinality: "one",
    }],
    outputs: [{
      name: "resolution",
      types: ["EVD"],
      cardinality: "one",
      required_links: [],
    }],
    prompt_ref: "prompts/resolve-queue-item.md@1",
    review_policy_ref: "no-waiver@1",
    participation: {
      policy_ref: "queue-participation@1",
      arguments: { question: "question" },
    },
    authority_evidence: { output: "resolution", type: "EVD" },
    completion: "execution.integrity.contract_valid == true",
    resolves: ["queue-resolution"],
    prohibited_inputs: [],
    batching: "single",
  });
  await fs.writeFile(
    path.join(processRoot, "prompts/resolve-queue-item.md"),
    "---\nid: resolve-queue-item\nversion: 1\nscenario: resolve-queue-item\n---\n\n# Resolve one exact fixture question\n\nReturn normalized evidence only.\n",
  );
  await writeYaml(processRoot, "phases/phase-0-terminal.yaml", {
    kind: "phase-definition",
    id: "phase-0-terminal",
    version: 1,
    order: 0,
    name: "Checkpoint fixture",
    purpose: "Exercise one package-authored checkpoint conversation.",
    coverage: "bootstrap-subset",
    omitted_capabilities: ["external fixture work"],
    entry: "true",
    attention_checkpoints: [{ id: "definition-gate", readiness: "true" }],
    scenarios: ["resolve-queue-item@1", "seed-queue-item@1"],
    obligations: ["queue-resolution@1"],
    outputs: ["EVD"],
    progression: null,
    gate: {
      required: false,
      candidate_selector: "[]",
      candidate_as: "candidate",
      obligation: "queue-resolution@1",
      completion: "false",
    },
  });
  await writeYaml(processRoot, "profiles/terminal.yaml", {
    kind: "implementation-profile-definition",
    id: "terminal",
    version: 1,
    status: "experimental",
    description: "A package-neutral checkpoint fixture.",
    enabled: {
      types: ["QUE", "EVD"],
      phases: ["phase-0-terminal"],
      obligation_statuses: ["ready"],
    },
    disabled_capabilities: ["broader fixture coverage"],
    success_criteria: ["One complete Consolidation Group is projected."],
  });

  const repository = path.join(parent, `checkpoint-repository-${randomUUID()}`);
  await fs.mkdir(repository);
  const reqExecutable = path.join(process.cwd(), "dist/req-entry.js");
  run(
    process.execPath,
    [reqExecutable, "--json", "init", "--process", processRoot],
    repository,
  );
  for (const [question, impact] of [
    ["Which boundary should the fixture retain?", "The answer changes fixture scope."],
    ["Which name should the fixture expose?", "The answer changes the public label."],
  ]) {
    run(process.execPath, [
      reqExecutable,
      "--json",
      "new",
      "QUE",
      "--scenario",
      "seed-queue-item@1",
      "--set",
      `question=${question}`,
      "--set",
      `blocking_impact=${impact}`,
      "--set",
      "open=true",
    ], repository);
  }
  run("git", ["init", "--quiet", "--initial-branch=main", "--template="], repository);
  run("git", ["add", "--all"], repository);
  run(
    "git",
    [
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@localhost",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "--no-verify",
      "--message",
      "Initialize checkpoint fixture repository",
    ],
    repository,
  );
  return repository;
}

/** Initialize exact package contracts, then add the Git state required by mdlm next. */
export async function terminalProcessRepository(
  parent: string,
  terminalOutcomes?: TerminalOutcomeDeclarations,
): Promise<string> {
  const processRoot = await terminalProcessPackage(parent, terminalOutcomes);
  const repository = path.join(parent, `terminal-repository-${randomUUID()}`);
  await fs.mkdir(repository);
  const reqExecutable = path.join(process.cwd(), "dist/req-entry.js");
  run(
    process.execPath,
    [reqExecutable, "--json", "init", "--process", processRoot],
    repository,
  );
  run("git", ["init", "--quiet", "--initial-branch=main", "--template="], repository);
  run("git", ["add", "--all"], repository);
  run(
    "git",
    [
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@localhost",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "--no-verify",
      "--message",
      "Initialize terminal fixture repository",
    ],
    repository,
  );
  return repository;
}
