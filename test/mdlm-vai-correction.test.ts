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
  localId: string;
  name: string;
  invocation: number;
  lifecycleDatum: {
    id?: string;
    type: string;
    payload: Record<string, unknown>;
    links: { type: string; target: string }[];
    body: string;
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

const exactObservation = (
  exitStatus: number,
  stdout = "",
  stderr = "",
) => ({
  exit_status: exitStatus,
  stdout: { encoding: "base64", bytes: Buffer.from(stdout).toString("base64") },
  stderr: { encoding: "base64", bytes: Buffer.from(stderr).toString("base64") },
});

const publicInterface = {
  interface_version: 2,
  repository_locator: "file:///fixture",
  command: [
    { literal: "node" },
    { checkout_path: "bin/fixture.mjs" },
    { parameter: { name: "temperature", encoding: "utf-8 decimal token" } },
  ],
  argument_cases: [
    {
      id: "normal-freezing",
      kind: "normal",
      tokens: [
        { literal: "node" },
        { checkout_path: "bin/fixture.mjs" },
        { parameter: { name: "temperature", encoding: "utf-8 decimal token", value: "32" } },
        { literal: "--scale" },
        { literal: "--scale" },
      ],
      expected_observation: {
        classification: "success",
        ...exactObservation(0, "0 C\n"),
      },
    },
    {
      id: "raw-empty-token",
      kind: "raw-malformed",
      raw_token_positions: [2],
      tokens: [
        { literal: "node" },
        { checkout_path: "bin/fixture.mjs" },
        { raw: { encoding: "utf-8", value: "" } },
      ],
      expected_observation: {
        classification: "automatic-rejection",
        ...exactObservation(2, "", "invalid temperature\n"),
      },
    },
    {
      id: "omitted-temperature",
      kind: "omitted-argument",
      omitted_parameters: ["temperature"],
      tokens: [
        { literal: "node" },
        { checkout_path: "bin/fixture.mjs" },
      ],
      expected_observation: {
        classification: "automatic-rejection",
        ...exactObservation(2, "", "temperature required\n"),
      },
    },
    {
      id: "extra-temperature",
      kind: "extra-argument",
      extra_token_positions: [3],
      tokens: [
        { literal: "node" },
        { checkout_path: "bin/fixture.mjs" },
        { parameter: { name: "temperature", encoding: "utf-8 decimal token", value: "32" } },
        { raw: { encoding: "utf-8", value: "unexpected" } },
      ],
      expected_observation: {
        classification: "automatic-rejection",
        ...exactObservation(2, "", "unexpected argument\n"),
      },
    },
  ],
  working_directory: "fresh-temporary-directory",
  observation_protocol: {
    success: {
      exit_status: 0,
      stdout_contract: "case-specific exact bytes",
      stderr_contract: "case-specific exact bytes",
    },
    rejection: {
      exit_status: 2,
      stdout_contract: "case-specific exact bytes",
      stderr_contract: "case-specific exact bytes",
    },
  },
};

async function targetFixturePackage(root: string): Promise<string> {
  const packageRoot = path.join(root, "process");
  await fs.cp(processPackage, packageRoot, { recursive: true });

  const phase0Path = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase0 = parse(await fs.readFile(phase0Path, "utf8"));
  phase0.order = 100;
  await fs.writeFile(phase0Path, stringify(phase0));

  const phase1Path = path.join(packageRoot, "phases/phase-1-product-assurance.yaml");
  const phase1 = parse(await fs.readFile(phase1Path, "utf8"));
  phase1.order = 0;
  phase1.scenarios = ["register-pilot-target@1"];
  phase1.obligations = ["pilot-target-required@1"];
  phase1.progression = null;
  await fs.writeFile(phase1Path, stringify(phase1));

  const obligationsRoot = path.join(packageRoot, "obligations");
  for (const file of await fs.readdir(obligationsRoot)) {
    if (!file.endsWith(".yaml") || file === "pilot-target-required.yaml") continue;
    const obligationPath = path.join(obligationsRoot, file);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    obligation.phases = obligation.phases.filter(
      (phase: string) => phase !== "phase-1-product-assurance",
    );
    if (obligation.phases.length === 0) obligation.phases = ["phase-0-wayfinding"];
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const profilePath = path.join(packageRoot, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-1-product-assurance"];
  await fs.writeFile(profilePath, stringify(profile));
  return packageRoot;
}

function create(
  repository: string,
  type: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): Created {
  const scenarios: Record<string, string> = {
    PSP: "compile-psp@2",
    STK: "draft-stakeholder-requirements@2",
    VSP: "define-verification-strategy@1",
    ENV: "realize-verification-environment@1",
    VER: "write-verification-activity@1",
    ART: "register-pilot-target@1",
  };
  const arguments_ = ["new", type, "--scenario", scenarios[type]!];
  for (const [name, value] of Object.entries(payload)) {
    arguments_.push(
      "--set",
      `${name}=${typeof value === "string" ? value : JSON.stringify(value)}`,
    );
  }
  for (const link of links) arguments_.push("--link", `${link.type}=${link.target}`);
  arguments_.push("--body", `Fixture ${type}.`, "--json");
  const result = req(repository, ...arguments_);
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  return JSON.parse(result.stdout).created;
}

function initializeGit(repository: string) {
  expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status)
    .toBe(0);
  commit(repository, "Initialize exact command fixture");
}

function commit(repository: string, message: string) {
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
}

function next(repository: string) {
  const result = mdlm(repository, ["next"]);
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  return JSON.parse(result.stdout);
}

function prepare(repository: string, outcome: Record<string, any>): Packet {
  const result = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]);
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  return JSON.parse(result.stdout);
}

function respond(
  repository: string,
  packet: Packet,
  outputs: ProposalOutput[],
  authoritySupplies: string[] = [],
) {
  return mdlm(
    repository,
    ["scenario", "submit"],
    `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment: packet.assignment.id,
      kind: "proposal",
      proposal: {
        outputs,
        completionEvidence: { summary: "The exact public evidence is complete." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies,
        standingDelegations: [],
      },
    })}\n`,
  );
}

describe("malformed public command evidence through the public operator seam", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-command-evidence-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const packageRoot = await targetFixturePackage(parent);
    const initialized = req(repository, "--json", "init", "--process", packageRoot);
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("publishes exact normal, raw malformed, omitted, and extra argument observations", () => {
    const product = create(repository, "PSP", {
      title: "Exact public command",
      rationale: "Malformed cases must be distinguishable.",
      problem: "Ambiguous command evidence cannot support source-blind Review.",
      users: ["operator"],
      goals: ["exact command evidence"],
      non_goals: ["product source inspection"],
      success_measures: ["deterministic public observations"],
    });
    const requirement = create(repository, "STK", {
      title: "Reject malformed temperatures",
      rationale: "Every malformed variant needs deterministic rejection.",
      statement: "The product shall reject malformed temperature arguments.",
      verification_intent: "Compare normal and malformed public invocations.",
      stakeholder: "operator",
      priority: "must",
    }, [{ type: "derived-from", target: product.id }]);
    const strategy = create(repository, "VSP", {
      title: "Public command strategy",
      rationale: "Use only exact public observations.",
      level: "stakeholder",
      permitted_methods: ["demonstration"],
      independence: {
        boundary: "black-box",
        prohibited_inputs: [
          "product source code",
          "product unit tests",
          "private implementation details",
          "uncontrolled implementation shortcuts",
        ],
      },
      evidence_policy: "Retain exact bytes.",
      assessment_policy: "Require every malformed class.",
      environment_profile: {
        id: "public-command",
        purpose: "Exercise exact command arguments.",
        capabilities: {
          controllability: ["supply exact tokens"],
          observability: ["capture exact bytes"],
          external_services: [],
          timing: "bounded execution",
        },
      },
    }, [
      { type: "governs", target: requirement.id },
      { type: "governs-revision", target: requirement.revisionId },
    ]);
    create(repository, "VER", {
      title: "Malformed command pilot",
      rationale: "The design must distinguish malformed variants.",
      kind: "pilot",
      method: "demonstration",
      assessment_mode: "automatic",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
      acceptance_criteria: ["each malformed class rejects deterministically"],
      evidence_requirements: ["exact argument tokens and output bytes"],
      expected_success_activity: "Invoke the normal case.",
      expected_discrimination_activity: "Invoke every malformed case.",
    }, [
      { type: "governed-by", target: strategy.revisionId },
      { type: "verifies", target: requirement.id },
      { type: "verifies-revision", target: requirement.revisionId },
    ]);
    initializeGit(repository);

    const outcome = next(repository);
    expect(outcome.outcome).toBe("assignment");
    const packet = prepare(repository, outcome);
    expect(packet.scenario.reference).toBe("register-pilot-target@1");

    const incompleteInterface = structuredClone(publicInterface) as any;
    incompleteInterface.argument_cases = incompleteInterface.argument_cases.filter(
      (testCase: { kind: string }) => testCase.kind !== "omitted-argument",
    );
    const rejected = respond(repository, packet, [proposedDatum(
      "target",
      "target",
      "ART",
      {
        title: "Incomplete public target",
        kind: "prototype",
        repository_ref: `git:${"a".repeat(40)}`,
        supported_behavior: ["normal conversion"],
        unsupported_behavior: ["malformed conversion"],
        evidence_refs: [`git-object-observed:${"a".repeat(40)}`],
        public_interface: incompleteInterface,
      },
      [{ type: "derived-from", target: requirement.revisionId }],
    )]);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "scenario-output-schema-invalid",
      })]),
    );
    expect(mdlm(repository, ["show", "ART-0000000000-r00001", "--json"]).status)
      .toBe(1);

    const submitted = respond(repository, packet, [proposedDatum(
      "target",
      "target",
      "ART",
      {
        title: "Exact public target",
        kind: "prototype",
        repository_ref: `git:${"a".repeat(40)}`,
        supported_behavior: ["normal conversion"],
        unsupported_behavior: ["malformed conversion"],
        evidence_refs: [`git-object-observed:${"a".repeat(40)}`],
        public_interface: publicInterface,
      },
      [{ type: "derived-from", target: requirement.revisionId }],
    )]);
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const target = JSON.parse(submitted.stdout).execution.outputs[0].lifecycleDatum;
    const shown = mdlm(repository, ["show", target.revisionId, "--json"]);
    expect(shown.status).toBe(0);
    const storedInterface = JSON.parse(shown.stdout).lifecycleDatum.datum.payload
      .public_interface;
    expect(storedInterface.argument_cases.map((item: { kind: string }) => item.kind))
      .toEqual(["normal", "raw-malformed", "omitted-argument", "extra-argument"]);
    expect(storedInterface.argument_cases[0].tokens.slice(-2)).toEqual([
      { literal: "--scale" },
      { literal: "--scale" },
    ]);
    expect(storedInterface.argument_cases[1].tokens[2]).toEqual({
      raw: { encoding: "utf-8", value: "" },
    });
    expect(storedInterface.argument_cases[2].tokens).toHaveLength(2);
    expect(storedInterface.argument_cases[2].omitted_parameters).toEqual([
      "temperature",
    ]);
    expect(storedInterface.argument_cases[3].expected_observation.stderr).toEqual({
      encoding: "base64",
      bytes: Buffer.from("unexpected argument\n").toString("base64"),
    });
  }, 120_000);
});

const executionProcedure = {
  deadlines_ms: {
    checkout: 30_000,
    environment_check: 20_000,
    product_case: 5_000,
  },
  deadline_claim: "infrastructure-safety-only",
  timeout_recovery: {
    terminate: "process-group",
    graceful_signal: "SIGTERM",
    force_after_ms: 1_000,
    force_signal: "SIGKILL",
    reap: "all-descendants",
    capture_partial_raw_observation: true,
  },
  cleanup: "guaranteed",
  aggregation: "continue-through-all-cases",
};

async function vaiCorrectionFixturePackage(root: string): Promise<string> {
  const packageRoot = path.join(root, "vai-process");
  await fs.cp(processPackage, packageRoot, { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, "selectors/current-pilot-verification-implementations.yaml"),
    `kind: selector-definition
id: current-pilot-verification-implementations
version: 1
description: Test-only current exact source-blind pilot implementation selection.
parameters: []
result_kind: revision
query:
  from: {collection: revisions, types: [VAI]}
  as: implementation
  where: >-
    implementation.payload.kind == "pilot"
    && implementation.payload.independence_mode == "source-blind"
    && state(implementation, "disposition") == "active"
    && state(implementation, "validity") == "valid"
    && none("newer-revisions-for@1", {subject: implementation})
    && count("verification-activities-for-implementation@1",
      {implementation: implementation}) == 1
    && count("environments-for-implementation@1",
      {implementation: implementation}) == 1
    && count("artifact-targets-for-implementation@1",
      {implementation: implementation}) == 1
    && exists("pilot-implementation-authorizations-for@1",
      {implementation: implementation})
  distinct: true
  order_by: [identity.id, identity.revision]
`,
  );

  const scenarioFiles: Record<string, string> = {
    "seed-pilot-implementation.yaml": `kind: scenario-definition
id: seed-pilot-implementation
version: 1
description: Test-only exact pilot implementation publication.
initiation: explicit
phases: [phase-1-product-assurance]
inputs:
  - {name: activity, types: [VER], cardinality: one, identity: revision}
  - {name: environment, types: [ENV], cardinality: one, identity: revision}
  - {name: execution_target, types: [ART], cardinality: one, identity: revision}
outputs:
  - name: implementation
    types: [VAI]
    cardinality: one
    required_links:
      - {link: realizes, target: {input: activity}}
      - {link: uses, target: {input: environment}}
      - {link: targets, target: {input: execution_target}}
  - name: authorization
    types: [DEC]
    cardinality: one
    required_links:
      - {link: justifies, target: {output: implementation}}
prompt_ref: prompts/seed-pilot-implementation.md@1
review_policy_ref: review-applicability@1
participation:
  policy_ref: verification-implementation-participation@1
  arguments: {activity: activity, environment: environment, execution_target: execution_target}
authority_evidence: {output: authorization, type: DEC}
completion: >-
  execution.integrity.contract_valid == true
  && authorization.payload.effective_scope == implementation.identity.revision_id
resolves: []
prohibited_inputs: [product source code]
batching: single
`,
    "seed-vai-review.yaml": `kind: scenario-definition
id: seed-vai-review
version: 1
description: Test-only publication of one failed VAI Review.
initiation: explicit
phases: [phase-1-product-assurance]
inputs:
  - {name: subject, types: [VAI], cardinality: one, identity: revision}
  - {name: review_context, types: [BSL], cardinality: one, identity: revision}
outputs:
  - name: review
    types: [REV]
    cardinality: one
    required_links:
      - {link: reviews, target: {input: subject}}
      - {link: contextualizes, target: {input: review_context}}
prompt_ref: prompts/seed-vai-review.md@1
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
    "seed-verification-run.yaml": `kind: scenario-definition
id: seed-verification-run
version: 1
description: Test-only publication of immutable prior run evidence.
initiation: explicit
phases: [phase-1-product-assurance]
inputs:
  - {name: implementation, types: [VAI], cardinality: one, identity: revision}
  - {name: activity, types: [VER], cardinality: one, identity: revision}
  - {name: environment, types: [ENV], cardinality: one, identity: revision}
  - {name: execution_target, types: [ART], cardinality: one, identity: revision}
outputs:
  - name: run
    types: [RUN]
    cardinality: one
    required_links:
      - {link: executes, target: {input: implementation}}
      - {link: uses, target: {input: environment}}
      - {link: targets, target: {input: execution_target}}
      - {link: produces, target: {output: result}}
  - name: result
    types: [RES]
    cardinality: one
    required_links:
      - {link: assessed-in, target: {input: environment}}
prompt_ref: prompts/seed-verification-run.md@1
review_policy_ref: review-applicability@1
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: single
`,
  };
  for (const [file, content] of Object.entries(scenarioFiles)) {
    await fs.writeFile(path.join(packageRoot, "scenarios", file), content);
  }
  for (const name of [
    "seed-pilot-implementation",
    "seed-vai-review",
    "seed-verification-run",
  ]) {
    await fs.writeFile(
      path.join(packageRoot, "prompts", `${name}.md`),
      `---\nid: ${name}\nversion: 1\nscenario: ${name}\n---\n\n# ${name}\n`,
    );
  }

  const manifestPath = path.join(packageRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push(
    "seed-pilot-implementation",
    "seed-vai-review",
    "seed-verification-run",
  );
  manifest.assets.prompts.push(
    "prompts/seed-pilot-implementation.md@1",
    "prompts/seed-vai-review.md@1",
    "prompts/seed-verification-run.md@1",
  );
  await fs.writeFile(manifestPath, stringify(manifest));

  const retained = new Set([
    "pilot-vai-review-correction-required",
    "review-context-required",
    "passing-review-required",
    "verification-run-required",
  ]);
  const obligationsRoot = path.join(packageRoot, "obligations");
  for (const file of await fs.readdir(obligationsRoot)) {
    if (!file.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, file);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (retained.has(obligation.id)) continue;
    obligation.phases = obligation.phases.filter(
      (phase: string) => phase !== "phase-1-product-assurance",
    );
    if (obligation.phases.length === 0) obligation.phases = ["phase-0-wayfinding"];
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const runObligationPath = path.join(
    packageRoot,
    "obligations/verification-run-required.yaml",
  );
  const runObligation = parse(await fs.readFile(runObligationPath, "utf8"));
  runObligation.status_rules = [{
    status: "awaiting-review",
    priority: 200,
    when: 'none("passing-reviews-for@1", {subject: implementation})',
    reason: "The exact corrected VAI needs fresh independent Review.",
    blocked_by: [{
      obligation: "passing-review-required@2",
      subjects: "[implementation]",
    }],
  }, {
    status: "ready",
    priority: 100,
    when: "true",
    reason: "The fixture isolates exact fresh-run selection after VAI Review.",
  }];
  await fs.writeFile(runObligationPath, stringify(runObligation));

  const reviewPolicyPath = path.join(packageRoot, "policies/review-applicability.yaml");
  const reviewPolicy = parse(await fs.readFile(reviewPolicyPath, "utf8"));
  reviewPolicy.rules = [{
    priority: 100,
    when: 'subject.identity.type == "VAI" && subject.payload.kind == "pilot"',
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
    "seed-pilot-implementation@1",
    "seed-vai-review@1",
    "seed-verification-run@1",
    "revise-pilot-vai-after-review@1",
    "execute-verification-run@1",
    "create-review-context@1",
    "review-datum-in-context@2",
  ];
  phase1.obligations = [
    "pilot-vai-review-correction-required@1",
    "verification-run-required@1",
    "review-context-required@2",
    "passing-review-required@2",
  ];
  phase1.progression = null;
  await fs.writeFile(phase1Path, stringify(phase1));

  const profilePath = path.join(packageRoot, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-1-product-assurance"];
  await fs.writeFile(profilePath, stringify(profile));
  return packageRoot;
}

describe("failed pilot VAI correction through the public operator seam", () => {
  let parent: string;
  let repository: string;
  let adapterIndex = 0;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-vai-correction-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const packageRoot = await vaiCorrectionFixturePackage(parent);
    const initialized = req(repository, "--json", "init", "--process", packageRoot);
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  const adapter = async (response: Record<string, unknown>, label: string) => {
    adapterIndex += 1;
    const adapterPath = path.join(parent, `${label}-${adapterIndex}.mjs`);
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    return adapterPath;
  };

  const executeExplicit = async (
    scenario: string,
    inputs: string[],
    response: Record<string, unknown>,
    authority?: string,
  ) => {
    const adapterPath = await adapter(response, scenario);
    const arguments_ = ["scenario", "execute", scenario, "--initiate"];
    for (const input of inputs) arguments_.push("--input", input);
    if (authority) arguments_.push("--authorize", authority);
    arguments_.push("--adapter", adapterPath, "--json");
    const result = req(repository, ...arguments_);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout).execution;
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
    expect(req(
      repository,
      "baseline",
      "add",
      context.id,
      subject.revisionId,
      "--json",
    ).status).toBe(0);
    expect(req(repository, "baseline", "freeze", context.id, "--json").status)
      .toBe(0);
    return context;
  };

  const seedReview = async (
    subject: Created,
    context: Created,
    findingId: string,
    summary: string,
  ) => {
    const execution = await executeExplicit(
      "seed-vai-review@1",
      [`subject=${subject.revisionId}`, `review_context=${context.revisionId}`],
      {
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: `Failed ${findingId}`,
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [{
                id: findingId,
                target: subject.revisionId,
                relationship: "primary",
                severity: "blocking",
                summary,
              }],
              outcome: "fail",
            },
            links: [
              { type: "reviews", target: subject.revisionId },
              { type: "contextualizes", target: context.revisionId },
            ],
            body: "Immutable failed VAI Review.\n",
          },
        }],
        completionEvidence: { summary: "The procedure Review failed." },
      },
      "independent-reviewer",
    );
    return execution.outputs[0].lifecycleDatum as Created;
  };

  it("corrects every finding atomically and requires fresh Review and run evidence", async () => {
    const product = create(repository, "PSP", {
      title: "VAI correction fixture",
      rationale: "Exercise source-blind correction.",
      problem: "An unbounded procedure can strand verification.",
      users: ["operator"],
      goals: ["bounded recovery"],
      non_goals: ["product timing claims"],
      success_measures: ["fresh Review and run work"],
    });
    const requirement = create(repository, "STK", {
      title: "Reject malformed input",
      rationale: "Malformed variants need exact outcomes.",
      statement: "The product shall reject malformed input.",
      verification_intent: "Observe exact public rejection.",
      stakeholder: "operator",
      priority: "must",
    }, [{ type: "derived-from", target: product.id }]);
    const strategy = create(repository, "VSP", {
      title: "Source-blind strategy",
      rationale: "Use public command evidence only.",
      level: "stakeholder",
      permitted_methods: ["demonstration"],
      independence: {
        boundary: "black-box",
        prohibited_inputs: [
          "product source code",
          "product unit tests",
          "private implementation details",
          "uncontrolled implementation shortcuts",
        ],
      },
      evidence_policy: "Retain partial raw observations.",
      assessment_policy: "Aggregate every case.",
      environment_profile: {
        id: "public-command",
        purpose: "Exercise public malformed inputs.",
        capabilities: {
          controllability: ["supply exact arguments"],
          observability: ["capture partial exact bytes"],
          external_services: [],
          timing: "bounded execution safety",
        },
      },
    }, [
      { type: "governs", target: requirement.id },
      { type: "governs-revision", target: requirement.revisionId },
    ]);
    const environment = create(repository, "ENV", {
      title: "Exact environment",
      rationale: "Provide the public command boundary.",
      strategy_revision: strategy.revisionId,
      profile_id: "public-command",
      capabilities: {
        controllability: ["supply exact arguments"],
        observability: ["capture partial exact bytes"],
        external_services: [],
        timing: "bounded execution safety",
      },
      reproducibility: {
        environment_ref: "container:exact-vai",
        configuration_digest: `sha256:${"b".repeat(64)}`,
        reconstruction: "Restore the exact isolated environment.",
      },
    }, [{ type: "realizes", target: strategy.revisionId }]);
    const activity = create(repository, "VER", {
      title: "Malformed input pilot",
      rationale: "Exercise every exact command case.",
      kind: "pilot",
      method: "demonstration",
      assessment_mode: "automatic",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
      acceptance_criteria: ["normal and malformed cases classify exactly"],
      evidence_requirements: ["partial raw output for every case"],
      expected_success_activity: "Invoke the normal case.",
      expected_discrimination_activity: "Invoke malformed variants.",
    }, [
      { type: "governed-by", target: strategy.revisionId },
      { type: "verifies", target: requirement.id },
      { type: "verifies-revision", target: requirement.revisionId },
    ]);
    const target = create(repository, "ART", {
      title: "Exact malformed target",
      kind: "prototype",
      repository_ref: `git:${"c".repeat(40)}`,
      supported_behavior: ["normal command"],
      unsupported_behavior: ["malformed command"],
      evidence_refs: [`git-object-observed:${"c".repeat(40)}`],
      public_interface: publicInterface,
    }, [{ type: "derived-from", target: requirement.revisionId }]);

    const initialImplementation = await executeExplicit(
      "seed-pilot-implementation@1",
      [
        `activity=${activity.revisionId}`,
        `environment=${environment.revisionId}`,
        `execution_target=${target.revisionId}`,
      ],
      {
        outputs: [{
          name: "implementation",
          invocation: 0,
          lifecycleDatum: {
            id: "VAI-A2B4C6D8E0",
            type: "VAI",
            payload: {
              title: "Initial source-blind procedure",
              rationale: "Execute every exact public case.",
              kind: "pilot",
              implementation_ref: `procedure:sha256:${"d".repeat(64)}`,
              independence_mode: "source-blind",
              authoring_input_refs: [activity.revisionId, environment.revisionId, target.revisionId],
              prohibited_inputs_observed: [
                "product source code",
                "product unit tests",
                "private implementation details",
                "uncontrolled implementation shortcuts",
              ],
              activity_bindings: [
                "normal-freezing",
                "raw-empty-token",
                "omitted-temperature",
                "extra-temperature",
              ],
              target_behavior: {
                supported: ["normal command"],
                intentionally_unsupported: ["malformed command"],
              },
              execution_procedure: executionProcedure,
            },
            links: [
              { type: "realizes", target: activity.revisionId },
              { type: "uses", target: environment.revisionId },
              { type: "targets", target: target.revisionId },
            ],
            body: "Initial source-blind procedure.\n",
          },
        }, {
          name: "authorization",
          invocation: 0,
          lifecycleDatum: {
            id: "DEC-A2B4C6D8E0",
            type: "DEC",
            payload: {
              title: "Authorize initial implementation",
              rationale: "Independent implementation is exact.",
              kind: "decision",
              decision: "Authorize this exact pilot implementation.",
              alternatives: ["Do not implement the pilot"],
              effective_scope: "VAI-A2B4C6D8E0-r00001",
            },
            links: [{ type: "justifies", target: "VAI-A2B4C6D8E0-r00001" }],
            body: "Exact initial implementation authority.\n",
          },
        }],
        completionEvidence: { summary: "The exact pilot implementation exists." },
      },
      "independent-verification-implementer",
    );
    const implementation = initialImplementation.outputs.find(
      (output: { name: string }) => output.name === "implementation",
    ).lifecycleDatum as Created;

    const oldRun = await executeExplicit(
      "seed-verification-run@1",
      [
        `implementation=${implementation.revisionId}`,
        `activity=${activity.revisionId}`,
        `environment=${environment.revisionId}`,
        `execution_target=${target.revisionId}`,
      ],
      {
        outputs: [{
          name: "run",
          invocation: 0,
          lifecycleDatum: {
            id: "RUN-A2B4C6D8E0",
            type: "RUN",
            payload: {
              title: "Prior unsuitable run",
              kind: "pilot",
              started_at: "2026-08-11T10:00:00.000Z",
              completed_at: "2026-08-11T10:01:00.000Z",
              execution_state: "completed",
              execution_target: { kind: "prototype", ref: target.revisionId },
              runner_ref: "runner:initial@1",
              configuration_refs: ["configuration:initial"],
              activities_expected: ["normal-freezing", "raw-empty-token"],
              activities_invoked: ["normal-freezing", "raw-empty-token"],
              evidence_locations: ["evidence:initial"],
            },
            links: [
              { type: "executes", target: implementation.revisionId },
              { type: "uses", target: environment.revisionId },
              { type: "targets", target: target.revisionId },
              { type: "produces", target: "RES-A2B4C6D8E0-r00001" },
            ],
            body: "Immutable prior run.\n",
          },
        }, {
          name: "result",
          invocation: 0,
          lifecycleDatum: {
            id: "RES-A2B4C6D8E0",
            type: "RES",
            payload: {
              title: "Prior unsuitable result",
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
                details: "The prior procedure did not recover across all cases.",
              },
              evidence_refs: ["evidence:initial"],
              assessor_ref: "assessor:initial@1",
            },
            links: [{ type: "assessed-in", target: environment.revisionId }],
            body: "Immutable unsuitable pilot result.\n",
          },
        }],
        completionEvidence: { summary: "Prior exact evidence remains immutable." },
      },
    );
    const oldEvidenceIds: string[] = oldRun.outputs.map(
      (output: { lifecycleDatum: Created }) => output.lifecycleDatum.revisionId,
    );
    const context = createContext(implementation);
    const firstReview = await seedReview(
      implementation,
      context,
      "F-001",
      "Checkout, checks, and product cases need bounded timeout recovery.",
    );
    const secondReview = await seedReview(
      implementation,
      context,
      "F-002",
      "The procedure must retain partial bytes, clean up, and continue all cases.",
    );
    initializeGit(repository);

    const shownDatum = (revisionId: string) => JSON.parse(
      mdlm(repository, ["show", revisionId, "--json"]).stdout,
    ).lifecycleDatum.datum;
    const oldImplementationDatum = shownDatum(implementation.revisionId);
    const oldEvidenceData = oldEvidenceIds.map(shownDatum);
    const oldReviewIds = [firstReview.revisionId, secondReview.revisionId];
    const oldReviewData = oldReviewIds.map(shownDatum);

    let outcome = next(repository);
    expect(outcome).toEqual(expect.objectContaining({ outcome: "assignment" }));
    let packet = prepare(repository, outcome);
    expect(packet.scenario.reference).toBe("revise-pilot-vai-after-review@1");
    expect(packet.authority.requirements).toEqual([]);
    const input = (name: string) => packet.exactInputs[0].inputs.find(
      (candidate: { name: string }) => candidate.name === name,
    ).values;
    expect(input("failed_reviews").map(
      (review: { identity: { revision_id: string } }) => review.identity.revision_id
    ).sort()).toEqual([firstReview.revisionId, secondReview.revisionId].sort());
    expect(input("activity")[0].identity.revision_id).toBe(activity.revisionId);
    expect(input("environment")[0].identity.revision_id).toBe(environment.revisionId);
    expect(input("execution_target")[0].identity.revision_id).toBe(target.revisionId);

    const correctedPayload = {
      title: "Corrected source-blind procedure",
      rationale: "Bound and recover every public case without making a product timing claim.",
      kind: "pilot",
      implementation_ref: `procedure:sha256:${"e".repeat(64)}`,
      independence_mode: "source-blind",
      authoring_input_refs: [
        activity.revisionId,
        environment.revisionId,
        target.revisionId,
        firstReview.revisionId,
        secondReview.revisionId,
      ],
      prohibited_inputs_observed: [
        "product source code",
        "product unit tests",
        "private implementation details",
        "uncontrolled implementation shortcuts",
      ],
      activity_bindings: [
        "normal-freezing",
        "raw-empty-token",
        "omitted-temperature",
        "extra-temperature",
      ],
      target_behavior: {
        supported: ["normal command"],
        intentionally_unsupported: ["malformed command"],
      },
      execution_procedure: executionProcedure,
    };
    const correctionOutputs = (environmentTarget = environment.revisionId) => [
      proposedDatum(
        "replacement",
        "replacement",
        "VAI",
        correctedPayload,
        [
          { type: "realizes", target: activity.revisionId },
          { type: "uses", target: environmentTarget },
          { type: "targets", target: target.revisionId },
          { type: "corrects-review", target: firstReview.revisionId },
          { type: "corrects-review", target: secondReview.revisionId },
        ],
        implementation.id,
      ),
      proposedDatum("authorization", "authorization", "DEC", {
        title: "Authorize exact autonomous VAI correction",
        rationale: "Package evidence preserves every reviewed binding.",
        kind: "decision",
        decision: "Authorize this exact corrected pilot implementation.",
        alternatives: ["Retain the failed procedure"],
        effective_scope: "$proposal.replacement.revision_id",
      }, [{ type: "justifies", target: "$proposal.replacement.revision_id" }]),
    ];

    const otherEnvironment = create(repository, "ENV", {
      title: "Unrelated environment",
      rationale: "Exercise changed-binding rejection.",
      strategy_revision: strategy.revisionId,
      profile_id: "public-command",
      capabilities: {
        controllability: ["supply exact arguments"],
        observability: ["capture partial exact bytes"],
        external_services: [],
        timing: "bounded execution safety",
      },
      reproducibility: {
        environment_ref: "container:unrelated-vai",
        configuration_digest: `sha256:${"f".repeat(64)}`,
        reconstruction: "Restore an unrelated environment.",
      },
    }, [{ type: "realizes", target: strategy.revisionId }]);
    const changedBinding = correctionOutputs(otherEnvironment.revisionId);
    const rejected = respond(repository, packet, changedBinding);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "scenario-output-required-link-missing",
        path: "outputs.replacement.links.uses",
      })]),
    );
    expect(mdlm(repository, ["show", `${implementation.id}-r00002`, "--json"]).status)
      .toBe(1);

    const submitted = respond(repository, packet, correctionOutputs());
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const corrected = JSON.parse(submitted.stdout).execution.outputs.find(
      (output: { name: string }) => output.name === "replacement",
    ).lifecycleDatum as Created;
    commit(repository, "Publish corrected pilot VAI");
    const correctedDatum = shownDatum(corrected.revisionId);
    expect(correctedDatum.payload.execution_procedure).toEqual(executionProcedure);
    expect(correctedDatum.payload.activity_bindings).toEqual(
      oldImplementationDatum.payload.activity_bindings,
    );
    expect(correctedDatum.links).toEqual(expect.arrayContaining([
      { type: "realizes", target: activity.revisionId },
      { type: "uses", target: environment.revisionId },
      { type: "targets", target: target.revisionId },
      { type: "corrects-review", target: firstReview.revisionId },
      { type: "corrects-review", target: secondReview.revisionId },
    ]));
    expect(shownDatum(implementation.revisionId)).toEqual(oldImplementationDatum);
    oldEvidenceIds.forEach((revisionId, index) => {
      expect(shownDatum(revisionId)).toEqual(oldEvidenceData[index]);
    });
    oldReviewIds.forEach((revisionId, index) => {
      expect(shownDatum(revisionId)).toEqual(oldReviewData[index]);
    });

    outcome = next(repository);
    packet = prepare(repository, outcome);
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(packet.exactInputs[0].inputs.find(
      (candidate: { name: string }) => candidate.name === "subject",
    ).values[0].identity.revision_id).toBe(corrected.revisionId);
    const contextSubmission = respond(repository, packet, [proposedDatum(
      "fresh-context",
      "context",
      "BSL",
      {
        title: "Fresh corrected VAI context",
        kind: "review-context",
        role: "review-context",
        scope: corrected.revisionId,
        group: "DEFAULT",
        definition_members: [corrected.revisionId],
        evidence: [],
      },
    )]);
    expect(contextSubmission.status, contextSubmission.stdout).toBe(0);
    const freshContext = JSON.parse(contextSubmission.stdout).execution.outputs[0]
      .lifecycleDatum as Created;
    commit(repository, "Publish corrected VAI Review Context");

    outcome = next(repository);
    packet = prepare(repository, outcome);
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    expect(packet.exactInputs[0].inputs.find(
      (candidate: { name: string }) => candidate.name === "subject",
    ).values[0].identity.revision_id).toBe(corrected.revisionId);
    const reviewSubmission = respond(repository, packet, [proposedDatum(
      "fresh-review",
      "review",
      "REV",
      {
        title: "Passing corrected VAI Review",
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      },
      [
        { type: "reviews", target: corrected.revisionId },
        { type: "contextualizes", target: freshContext.revisionId },
      ],
    )], ["independent-reviewer"]);
    expect(reviewSubmission.status, reviewSubmission.stdout).toBe(0);
    commit(repository, "Publish corrected VAI Review");

    outcome = next(repository);
    packet = prepare(repository, outcome);
    expect(packet.scenario.reference).toBe("execute-verification-run@1");
    expect(packet.exactInputs[0].inputs.find(
      (candidate: { name: string }) => candidate.name === "implementation",
    ).values[0].identity.revision_id).toBe(corrected.revisionId);
    expect(oldEvidenceIds).not.toContain(corrected.revisionId);
  }, 180_000);
});
