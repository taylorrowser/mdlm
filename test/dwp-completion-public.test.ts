import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { expect, it } from "vitest";
import { mdlm, mdlmWithInput, selectProcessPackageFixture } from "./helpers/mdlm.js";

type Json = Record<string, any>;

async function writeYaml(root: string, relative: string, value: unknown) {
  await fs.writeFile(path.join(root, relative), stringify(value));
}

function commit(repository: string, message: string) {
  const staged = spawnSync("git", ["-C", repository, "add", ".lifecycle/data"], {
    encoding: "utf8",
  });
  expect(staged.status, staged.stderr).toBe(0);
  const committed = spawnSync("git", [
    "-C", repository,
    "-c", "user.name=MDLM Test",
    "-c", "user.email=mdlm-test@localhost",
    "-c", "commit.gpgSign=false",
    "commit", "--quiet", "--no-verify", "-m", message,
  ], { encoding: "utf8" });
  expect(committed.status, committed.stderr).toBe(0);
}

async function focusedPackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });
  for (const file of await fs.readdir(path.join(root, "obligations"))) {
    if (!file.endsWith(".yaml")) continue;
    const filePath = path.join(root, "obligations", file);
    const obligation = parse(await fs.readFile(filePath, "utf8"));
    obligation.status_rules = [{
      status: "blocked",
      priority: 10_000,
      when: "true",
      reason: "Suppressed by the focused public regression fixture.",
    }];
    obligation.default_status = "blocked";
    await fs.writeFile(filePath, stringify(obligation));
  }

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
  for (const file of await fs.readdir(path.join(root, "phases"))) {
    if (!file.endsWith(".yaml") || file === "phase-2-system-definition.yaml") continue;
    const filePath = path.join(root, "phases", file);
    const other = parse(await fs.readFile(filePath, "utf8"));
    other.order += 100;
    await fs.writeFile(filePath, stringify(other));
  }

  const completionPath = path.join(
    root,
    "scenarios/complete-decomposition-work-package.yaml",
  );
  const completion = parse(await fs.readFile(completionPath, "utf8"));
  completion.resolves.push("fixture-dwp-completion-required");
  await fs.writeFile(completionPath, stringify(completion));

  await writeYaml(root, "scenarios/seed-dwp-completion-fixture.yaml", {
    kind: "scenario-definition",
    id: "seed-dwp-completion-fixture",
    version: 1,
    description: "Publish the exact inputs for the public DWP completion regression.",
    phases: ["phase-2-system-definition"],
    inputs: [],
    outputs: [
      { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
      { name: "parent", types: ["STK"], cardinality: "one", required_links: [
        { link: "derived-from", target: { output: "product" } },
      ] },
      { name: "architecture", types: ["ASP"], cardinality: "one", required_links: [
        { link: "governs", target: { output: "parent" } },
        { link: "governs", target: { output: "plan" } },
      ] },
      { name: "strategy", types: ["VSP"], cardinality: "one", required_links: [
        { link: "governs", target: { output: "parent" } },
        { link: "governs-revision", target: { output: "parent" } },
      ] },
      { name: "plan", types: ["DWP"], cardinality: "one", required_links: [
        { link: "decomposes", target: { output: "parent" } },
        { link: "allocated-to", target: { output: "architecture" } },
        { link: "verified-under", target: { output: "strategy" } },
      ] },
      { name: "requirement", types: ["SYS"], cardinality: "one", required_links: [
        { link: "derived-from", target: { output: "parent" } },
        { link: "decomposes", target: { output: "plan" } },
        { link: "allocated-to", target: { output: "architecture" } },
      ] },
    ],
    prompt_ref: "prompts/seed-dwp-completion-fixture.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["fixture-dwp-seed-required"],
    prohibited_inputs: [],
    batching: "single",
  });
  await fs.writeFile(
    path.join(root, "prompts/seed-dwp-completion-fixture.md"),
    "---\nid: seed-dwp-completion-fixture\nversion: 1\nscenario: seed-dwp-completion-fixture\n---\n\n# Seed DWP completion fixture\n",
  );
  await writeYaml(root, "obligations/fixture-dwp-seed-required.yaml", {
    kind: "obligation-definition",
    id: "fixture-dwp-seed-required",
    version: 1,
    description: "The fixture requires one exact DWP context.",
    phases: ["phase-2-system-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("fixture-dwp-plans@1", {})',
    status_rules: [{ status: "ready", priority: 100,
      when: 'none("fixture-dwp-plans@1", {})', reason: "Publish the fixture." }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-dwp-completion-fixture@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  });
  await writeYaml(root, "obligations/fixture-dwp-completion-required.yaml", {
    kind: "obligation-definition",
    id: "fixture-dwp-completion-required",
    version: 1,
    description: "The fixture requires the public DWP completion response.",
    phases: ["phase-2-system-definition"],
    for_each: 'select("fixture-dwp-plans@1", {})',
    subject_as: "plan",
    satisfied_when: "false",
    status_rules: [{ status: "ready", priority: 100, when: "true",
      reason: "Prepare the exact completion response." }],
    default_status: "blocked",
    resolve_with: { scenario: "complete-decomposition-work-package@3", inputs: {
      plan: "plan",
      parents: 'select("fixture-dwp-parents@1", {})',
      outputs: 'select("fixture-dwp-requirements@1", {})',
      architecture: 'one("fixture-dwp-architectures@1", {})',
      interfaces: 'select("fixture-dwp-interfaces@1", {})',
      verification_strategy: 'one("fixture-dwp-strategies@1", {})',
      simplification_reviews: 'select("fixture-dwp-reviews@1", {})',
    } },
    waiver_policy_ref: "waiver-applicability@1",
  });
  for (const [id, type, alias] of [
    ["fixture-dwp-products", "PSP", "product"],
    ["fixture-dwp-parents", "STK", "parent"],
    ["fixture-dwp-architectures", "ASP", "architecture"],
    ["fixture-dwp-strategies", "VSP", "strategy"],
    ["fixture-dwp-plans", "DWP", "plan"],
    ["fixture-dwp-requirements", "SYS", "requirement"],
    ["fixture-dwp-interfaces", "ICSP", "interface"],
    ["fixture-dwp-reviews", "REV", "review"],
  ]) {
    await writeYaml(root, `selectors/${id}.yaml`, {
      kind: "selector-definition", id, version: 1,
      description: `Exact ${type} from the focused DWP fixture.`, parameters: [],
      result_kind: "revision", query: {
        from: { collection: "revisions", types: [type] }, as: alias,
        where: `${alias}.provenance.scenario == "seed-dwp-completion-fixture@1"`,
        distinct: true, order_by: ["identity.revision_id"],
      },
    });
  }
  return root;
}

it("prepares conditional SYS completion fields and rejects omissions by name", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-dwp-public-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await focusedPackage(parent));

    const seededResult = mdlm(repository, "next", "--json");
    expect(seededResult.status, `${seededResult.stderr}${seededResult.stdout}`).toBe(0);
    const seeded = JSON.parse(seededResult.stdout);
    expect(seeded.assignment, seededResult.stdout).toBeDefined();
    expect(seeded.assignment.packet.scenario.reference).toBe(
      "seed-dwp-completion-fixture@1",
    );
    const seedResponse = structuredClone(seeded.assignment.packet.responseScaffold);
    const payloads: Record<string, Json> = {
      product: { title: "Fixture product", rationale: "Reach the public seam.",
        problem: "One behavior needs a system requirement.", users: ["operator"],
        goals: ["Define the behavior"], non_goals: ["Implementation"],
        success_measures: ["The public scaffold is complete"] },
      parent: { title: "Accept one value", rationale: "Define one behavior.",
        statement: "The product shall accept one value.",
        verification_intent: "Observe acceptance.", stakeholder: "operator",
        priority: "must", system_context: "fixture" },
      architecture: { title: "Fixture architecture", rationale: "Allocate behavior.",
        level: "system", elements: [{ id: "AEL-5400000001", alias: "FIXTURE",
          title: "Fixture element", responsibilities: ["Accept one value"] }],
        internal_interactions: [], controlled_boundaries: [], constraints: [],
        nominated_risks: [] },
      strategy: { title: "Fixture strategy", rationale: "Observe behavior.",
        level: "stakeholder", permitted_methods: ["test"], independence: {
          boundary: "black-box", prohibited_inputs: ["product source code",
            "product unit tests", "private implementation details",
            "uncontrolled implementation shortcuts"] },
        evidence_policy: "Retain exact output.", assessment_policy: "Compare output.",
        environment_profile: { id: "fixture", purpose: "Run one test.",
          capabilities: { controllability: ["input"], observability: ["output"],
            external_services: [], timing: "bounded" } } },
      plan: { title: "Fixture system decomposition", rationale: "Define one SYS.",
        stage: "planning", architecture_element: "AEL-5400000001",
        target_child_type: "SYS", behavioral_slice: "Accept one value",
        expected_coverage: ["The stakeholder behavior"], exclusions: [],
        dependencies: [], required_review_policy: "review-applicability@1" },
      requirement: { title: "Accept one value", rationale: "Allocate behavior.",
        statement: "The system shall accept one value.",
        verification_intent: "Observe acceptance." },
    };
    for (const output of seedResponse.proposal.outputs) {
      output.payload = payloads[output.handle];
      output.body = `# ${output.handle}\n`;
    }
    seedResponse.proposal.completionEvidence = { summary: "Fixture published." };
    const seedSubmit = mdlmWithInput(repository, `${JSON.stringify(seedResponse)}\n`,
      "scenario", "submit", "-", "--json");
    expect(seedSubmit.status, `${seedSubmit.stderr}${seedSubmit.stdout}`).toBe(0);
    commit(repository, "Publish DWP completion fixture");

    const next = JSON.parse(mdlm(repository, "next", "--json").stdout);
    expect(next.assignment.packet.scenario.reference).toBe(
      "complete-decomposition-work-package@3",
    );
    const response = structuredClone(next.assignment.packet.responseScaffold);
    const completion = response.proposal.outputs.find(
      (output: Json) => output.handle === "completion",
    );
    const conditional = ["parent_coverage_status", "deferred_questions",
      "cross_group_dependencies", "output_reviews_complete",
      "simplification_disposition"];
    expect(completion.payload).toMatchObject(Object.fromEntries([
      ["stage", "completion"], ...conditional.map((field) => [field, null]),
    ]));
    Object.assign(completion.payload, payloads.plan, { stage: "completion" });
    conditional.forEach((field) => delete completion.payload[field]);
    completion.body = "The incomplete account omits conditional fields.\n";
    response.proposal.completionEvidence = { summary: "Incomplete fixture." };
    const rejected = mdlmWithInput(repository, `${JSON.stringify(response)}\n`,
      "scenario", "submit", "-", "--json");
    expect(rejected.status).toBe(1);
    conditional.forEach((field) => expect(rejected.stdout).toContain(field));
    expect(rejected.stdout).not.toContain("scenario-completion-failed");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
