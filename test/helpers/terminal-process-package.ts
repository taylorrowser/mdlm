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
