import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { mdlm, mdlmWithInput, selectProcessPackageFixture } from "./helpers/mdlm.js";

type Json = Record<string, any>;

async function focusedPackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, { recursive: true });
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
  for (const entry of await fs.readdir(path.join(root, "phases"))) {
    const otherPath = path.join(root, "phases", entry);
    if (otherPath === phasePath) continue;
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }
  for (const entry of await fs.readdir(path.join(root, "obligations"))) {
    const obligationPath = path.join(root, "obligations", entry);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (obligation.phases?.includes("phase-3-component-definition")) {
      obligation.status_rules = [{
        status: "blocked",
        priority: 1_000_000,
        when: "true",
        reason: "Outside the focused DWP publication route.",
      }];
      obligation.default_status = "blocked";
      await fs.writeFile(obligationPath, stringify(obligation));
    }
  }

  const seedScenario = {
    kind: "scenario-definition", id: "seed-phase-3-dwp-inputs", version: 1,
    description: "Publish the minimum exact Phase 3 DWP inputs.",
    phases: ["phase-3-component-definition"], inputs: [],
    outputs: [
      { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
      { name: "stakeholder_requirement", types: ["STK"], cardinality: "one", required_links: [{ link: "derived-from", target: { output: "product" } }] },
      { name: "system_requirement", types: ["SYS"], cardinality: "one", required_links: [{ link: "derived-from", target: { output: "stakeholder_requirement" } }] },
      { name: "architecture", types: ["ASP"], cardinality: "one", required_links: [{ link: "governs", target: { output: "system_requirement" } }] },
      { name: "strategy", types: ["VSP"], cardinality: "one", required_links: [{ link: "governs", target: { output: "system_requirement" } }, { link: "governs-revision", target: { output: "system_requirement" } }] },
    ],
    prompt_ref: "prompts/seed-phase-3-dwp-inputs.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["phase-3-dwp-inputs-required"], prohibited_inputs: [], batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition", id: "phase-3-dwp-inputs-required", version: 1,
    description: "The focused public route requires one exact input set.",
    phases: ["phase-3-component-definition"], for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("phase-3-dwp-test-systems@1", {})',
    status_rules: [{ status: "ready", priority: 10_000, when: 'none("phase-3-dwp-test-systems@1", {})', reason: "Publish the exact focused input set." }],
    default_status: "blocked", resolve_with: { scenario: "seed-phase-3-dwp-inputs@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const planObligation = {
    kind: "obligation-definition", id: "decomposition-planning-required", version: 2,
    description: "The exact focused Phase 3 input set requires one DWP.",
    phases: ["phase-3-component-definition"],
    for_each: 'select("phase-3-dwp-test-systems@1", {})', subject_as: "requirement",
    satisfied_when: 'exists("phase-3-dwp-test-plans@1", {})',
    status_rules: [{ status: "ready", priority: 10_000, when: 'none("phase-3-dwp-test-plans@1", {})', reason: "The exact Phase 3 inputs are ready." }],
    default_status: "blocked",
    resolve_with: { scenario: "define-decomposition-work-package@4", inputs: {
      parents: 'select("phase-3-dwp-test-systems@1", {})',
      architecture: 'one("phase-3-dwp-test-architectures@1", {})',
      interfaces: 'select("phase-3-dwp-test-interfaces@1", {})',
      verification_strategy: 'one("phase-3-dwp-test-strategies@1", {})',
    } },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const followupObligation = {
    kind: "obligation-definition", id: "focused-dwp-followup-required", version: 1,
    description: "A valid focused DWP keeps the public route live.",
    phases: ["phase-3-component-definition"],
    for_each: 'select("phase-3-dwp-test-plans@1", {})', subject_as: "plan",
    satisfied_when: "false",
    status_rules: [{ status: "ready", priority: 10_000, when: "true", reason: "The valid focused plan has a follow-up route." }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-phase-3-dwp-inputs@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const selector = (id: string, types: string[], as: string) => ({
    kind: "selector-definition", id, version: 1,
    description: `Exact ${types.join("/")} published by focused setup.`,
    parameters: [], result_kind: "revision",
    query: { from: { collection: "revisions", types }, as,
      where: `${as}.provenance.scenario == "seed-phase-3-dwp-inputs@1"`,
      distinct: true, order_by: ["identity.revision_id"] },
  });
  const plans = {
    kind: "selector-definition", id: "phase-3-dwp-test-plans", version: 1,
    description: "Exact DWP published by the focused Scenario.", parameters: [],
    result_kind: "revision", query: { from: { collection: "revisions", types: ["DWP"] }, as: "plan",
      where: 'plan.provenance.scenario == "define-decomposition-work-package@4"',
      distinct: true, order_by: ["identity.revision_id"] },
  };
  for (const [relative, value] of [
    ["scenarios/seed-phase-3-dwp-inputs.yaml", seedScenario],
    ["obligations/phase-3-dwp-inputs-required.yaml", seedObligation],
    ["obligations/decomposition-planning-required.yaml", planObligation],
    ["obligations/focused-dwp-followup-required.yaml", followupObligation],
    ["selectors/phase-3-dwp-test-systems.yaml", selector("phase-3-dwp-test-systems", ["SYS"], "requirement")],
    ["selectors/phase-3-dwp-test-architectures.yaml", selector("phase-3-dwp-test-architectures", ["ASP"], "architecture")],
    ["selectors/phase-3-dwp-test-strategies.yaml", selector("phase-3-dwp-test-strategies", ["VSP"], "strategy")],
    ["selectors/phase-3-dwp-test-interfaces.yaml", {
      kind: "selector-definition", id: "phase-3-dwp-test-interfaces", version: 1,
      description: "The focused interaction-free architecture has no ICSP.",
      parameters: [], result_kind: "revision",
      query: { from: { collection: "revisions", types: ["ICSP"] }, as: "interface", where: "false", distinct: true, order_by: ["identity.revision_id"] },
    }],
    ["selectors/phase-3-dwp-test-plans.yaml", plans],
  ] as [string, unknown][]) await fs.writeFile(path.join(root, relative), stringify(value));
  await fs.writeFile(path.join(root, "prompts/seed-phase-3-dwp-inputs.md"), "---\nid: seed-phase-3-dwp-inputs\nversion: 1\nscenario: seed-phase-3-dwp-inputs\n---\n\n# Seed exact Phase 3 DWP inputs\n");
  return root;
}

function json(command: ReturnType<typeof mdlm>): Json {
  expect(command.status, `${command.stderr}${command.stdout}`).toBe(0);
  return JSON.parse(command.stdout);
}

function response(packet: Json, outputs: Json[]): Json {
  const value = structuredClone(packet.responseScaffold);
  value.proposal.outputs = outputs.map((supplied) => {
    const template = value.proposal.outputs.find((candidate: Json) =>
      (candidate.output ?? candidate.handle) === supplied.output);
    expect(template).toBeDefined();
    return { ...template, payload: supplied.payload, body: supplied.body };
  });
  value.proposal.completionEvidence = { summary: "Focused public transaction." };
  return value;
}

function submit(repository: string, value: Json): Json {
  const command = mdlmWithInput(
    repository,
    `${JSON.stringify(value)}\n`,
    "scenario",
    "submit",
    "-",
    "--json",
  );
  expect([0, 1]).toContain(command.status);
  return JSON.parse(command.stdout);
}

function commit(repository: string): void {
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"]).status).toBe(0);
  const result = spawnSync("git", ["-C", repository, "-c", "user.name=MDLM Test", "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Publish focused inputs"], { encoding: "utf8" });
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

function planResponse(packet: Json, targetChildType: "CMP" | "DES"): Json {
  return response(packet, [{ output: "plan", payload: {
    title: "Reporter component slice", rationale: "One slice covers the exact system behavior.",
    stage: "planning", architecture_element: "AEL-PHASE3TEST0",
    target_child_type: targetChildType, behavioral_slice: "Define the reporter component requirement.",
    expected_coverage: ["The supplied system requirement"], exclusions: ["Implementation"],
    dependencies: [], required_review_policy: "review-applicability@1",
  }, body: "One bounded decomposition plan.\n" }]);
}

it("rejects a phase-incompatible DWP before publication", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase3-dwp-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await focusedPackage(parent));
    const seedPacket = json(mdlm(repository, "next", "--json")).assignment.packet;
    expect(seedPacket.scenario.reference).toBe("seed-phase-3-dwp-inputs@1");
    const seed = response(seedPacket, [
      { output: "product", payload: { title: "Reporter", rationale: "Exercise one route.", problem: "Report one class.", users: ["operator"], goals: ["Report"], non_goals: ["Design"], success_measures: ["Deterministic"] }, body: "Product.\n" },
      { output: "stakeholder_requirement", payload: { title: "Report", rationale: "Expose one result.", statement: "The product shall report one result.", verification_intent: "Observe it.", stakeholder: "operator", priority: "must", system_context: "report" }, body: "Stakeholder requirement.\n" },
      { output: "system_requirement", payload: { title: "Classify", rationale: "Allocate behavior.", statement: "The system shall classify one input.", verification_intent: "Observe the class." }, body: "System requirement.\n" },
      { output: "architecture", payload: { title: "Reporter architecture", rationale: "Bound one responsibility.", level: "component", elements: [{ id: "AEL-PHASE3TEST0", alias: "REPORTER", title: "Reporter", responsibilities: ["Report"] }], internal_interactions: [], controlled_boundaries: [], constraints: [], nominated_risks: [] }, body: "Architecture.\n" },
      { output: "strategy", payload: { title: "Component strategy", rationale: "Verify as a black box.", level: "component", permitted_methods: ["test"], independence: { boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"] }, evidence_policy: "Retain observations.", assessment_policy: "Compare the result.", environment_profile: { id: "component-test", purpose: "Exercise the boundary.", capabilities: { controllability: ["input"], observability: ["result"], external_services: [], timing: "bounded" } } }, body: "Strategy.\n" },
    ]);
    expect(submit(repository, seed).outcome).toBe("accepted");
    commit(repository);
    const next = json(mdlm(repository, "next", "--json"));
    expect(next.phase).toBe("phase-3-component-definition@2");
    const packet = next.assignment.packet;
    expect(packet.scenario.reference).toBe("define-decomposition-work-package@4");
    const invalid = submit(repository, planResponse(packet, "DES"));
    expect(invalid).toEqual(expect.objectContaining({
      outcome: "rejected",
      retryable: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]),
    }));
    expect(spawnSync("git", ["-C", repository, "status", "--porcelain", "--", ".lifecycle/data"], { encoding: "utf8" }).stdout).toBe("");
    const accepted = submit(repository, planResponse(packet, "CMP"));
    expect(accepted.outcome).toBe("accepted");
    expect(accepted.receipt.publications).toEqual([expect.objectContaining({ handle: "plan" })]);
    expect(json(mdlm(repository, "next", "--json")).outcome).not.toBe("process-dead-end");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 60_000);
