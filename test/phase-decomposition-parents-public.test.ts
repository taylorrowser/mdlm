import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { mdlm, mdlmWithInput, selectProcessPackageFixture } from "./helpers/mdlm.js";

type Json = Record<string, any>;

const phases = [
  { id: "phase-2-system-definition", parentType: "STK", targetType: "SYS", level: "stakeholder" },
  { id: "phase-3-component-definition", parentType: "SYS", targetType: "CMP", level: "component" },
  { id: "phase-4-design-definition", parentType: "CMP", targetType: "DES", level: "design" },
] as const;

async function writeYaml(root: string, relative: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(root, relative), stringify(value));
}

async function focusedPackage(parent: string, phase: typeof phases[number]): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, { recursive: true });

  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = [phase.id];
  await fs.writeFile(profilePath, stringify(profile));
  const phasePath = path.join(root, `phases/${phase.id}.yaml`);
  const activePhase = parse(await fs.readFile(phasePath, "utf8"));
  activePhase.order = 0;
  activePhase.entry = "true";
  activePhase.attention_checkpoints = [];
  await fs.writeFile(phasePath, stringify(activePhase));
  for (const file of await fs.readdir(path.join(root, "phases"))) {
    if (!file.endsWith(".yaml") || file === `${phase.id}.yaml`) continue;
    const filePath = path.join(root, "phases", file);
    const otherPhase = parse(await fs.readFile(filePath, "utf8"));
    otherPhase.order += 100;
    await fs.writeFile(filePath, stringify(otherPhase));
  }

  for (const file of await fs.readdir(path.join(root, "obligations"))) {
    if (!file.endsWith(".yaml")) continue;
    const filePath = path.join(root, "obligations", file);
    const obligation = parse(await fs.readFile(filePath, "utf8"));
    obligation.status_rules = [{
      status: "blocked",
      priority: 1_000_000,
      when: "true",
      reason: "Outside the focused decomposition-parent route.",
    }];
    obligation.default_status = "blocked";
    await fs.writeFile(filePath, stringify(obligation));
  }

  const output = (name: string, types: string[], required_links: Json[] = []) => ({
    name, types, cardinality: "one", required_links,
  });
  await writeYaml(root, "scenarios/seed-phase-decomposition-parents.yaml", {
    kind: "scenario-definition",
    id: "seed-phase-decomposition-parents",
    version: 1,
    description: "Publish one STK/SYS/CMP ancestry governed by one reused component architecture.",
    phases: [phase.id],
    inputs: [],
    outputs: [
      output("product", ["PSP"]),
      output("stakeholder", ["STK"], [
        { link: "derived-from", target: { output: "product" } },
      ]),
      output("system", ["SYS"], [
        { link: "derived-from", target: { output: "stakeholder" } },
      ]),
      output("architecture", ["ASP"], [
        { link: "governs", target: { output: "stakeholder" } },
        { link: "governs", target: { output: "system" } },
        { link: "governs", target: { output: "component" } },
        { link: "governs", target: { output: "prior_plan" } },
      ]),
      output("strategy", ["VSP"], [
        { link: "governs", target: { output: "stakeholder" } },
        { link: "governs-revision", target: { output: "stakeholder" } },
        { link: "governs", target: { output: "system" } },
        { link: "governs-revision", target: { output: "system" } },
        { link: "governs", target: { output: "component" } },
        { link: "governs-revision", target: { output: "component" } },
      ]),
      output("prior_plan", ["DWP"], [
        { link: "decomposes", target: { output: "system" } },
        { link: "allocated-to", target: { output: "architecture" } },
        { link: "verified-under", target: { output: "strategy" } },
      ]),
      output("component", ["CMP"], [
        { link: "derived-from", target: { output: "system" } },
        { link: "decomposes", target: { output: "prior_plan" } },
        { link: "allocated-to", target: { output: "architecture" } },
      ]),
    ],
    prompt_ref: "prompts/seed-phase-decomposition-parents.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["phase-decomposition-seed-required"],
    prohibited_inputs: [],
    batching: "single",
  });
  await fs.writeFile(
    path.join(root, "prompts/seed-phase-decomposition-parents.md"),
    "---\nid: seed-phase-decomposition-parents\nversion: 1\nscenario: seed-phase-decomposition-parents\n---\n\n# Seed phase decomposition parents\n",
  );
  await writeYaml(root, "obligations/phase-decomposition-seed-required.yaml", {
    kind: "obligation-definition", id: "phase-decomposition-seed-required", version: 1,
    description: "The focused route requires one reused architecture ancestry.",
    phases: [phase.id], for_each: "[phase]", subject_as: "required_phase",
    satisfied_when: 'exists("phase-decomposition-architectures@1", {})',
    status_rules: [{ status: "ready", priority: 10_000,
      when: 'none("phase-decomposition-architectures@1", {})', reason: "Publish the ancestry." }],
    default_status: "blocked", resolve_with: { scenario: "seed-phase-decomposition-parents@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  });
  await writeYaml(root, "obligations/phase-decomposition-plan-required.yaml", {
    kind: "obligation-definition", id: "phase-decomposition-plan-required", version: 1,
    description: "The focused route requires one phase-compatible DWP plan.",
    phases: [phase.id], for_each: "[phase]", subject_as: "required_phase",
    satisfied_when: 'exists("phase-decomposition-new-plans@1", {})',
    status_rules: [{ status: "ready", priority: 10_000,
      when: 'exists("phase-decomposition-architectures@1", {}) && none("phase-decomposition-new-plans@1", {})',
      reason: "Plan the active phase decomposition." }],
    default_status: "blocked",
    resolve_with: { scenario: "define-decomposition-work-package@4", inputs: {
      parents: 'select("decomposition-parents-for-architecture@1", {architecture: one("phase-decomposition-architectures@1", {})})',
      architecture: 'one("phase-decomposition-architectures@1", {})',
      interfaces: 'select("phase-decomposition-interfaces@1", {})',
      verification_strategy: 'one("phase-decomposition-strategies@1", {})',
    } },
    waiver_policy_ref: "waiver-applicability@1",
  });
  if (phase.id !== "phase-2-system-definition") {
    await writeYaml(root, "obligations/phase-decomposition-execution-required.yaml", {
      kind: "obligation-definition", id: "phase-decomposition-execution-required", version: 1,
      description: "The focused route exposes the exact lower-level decomposition Assignment.",
      phases: [phase.id], for_each: "[phase]", subject_as: "required_phase",
      satisfied_when: "false",
      status_rules: [{ status: "ready", priority: 10_000,
        when: 'exists("phase-decomposition-new-plans@1", {})',
        reason: "Expose the exact target-specific authoring guidance." }],
      default_status: "blocked",
      resolve_with: { scenario: "execute-lower-level-decomposition-work-package@1", inputs: {
        plan: 'one("phase-decomposition-new-plans@1", {})',
        parents: 'select("lower-level-decomposition-parents-for@1", {plan: one("phase-decomposition-new-plans@1", {})})',
        architecture: 'one("architectures-for-decomposition@1", {plan: one("phase-decomposition-new-plans@1", {})})',
        interfaces: 'select("interfaces-for-decomposition@1", {plan: one("phase-decomposition-new-plans@1", {})})',
      } },
      waiver_policy_ref: "waiver-applicability@1",
    });
  }

  const seededSelector = (id: string, type: string, alias: string) => ({
    kind: "selector-definition", id, version: 1,
    description: `Exact ${type} from the focused seed.`, parameters: [], result_kind: "revision",
    query: { from: { collection: "revisions", types: [type] }, as: alias,
      where: `${alias}.provenance.scenario == "seed-phase-decomposition-parents@1"`,
      distinct: true, order_by: ["identity.revision_id"] },
  });
  for (const [relative, value] of [
    ["selectors/phase-decomposition-architectures.yaml", seededSelector("phase-decomposition-architectures", "ASP", "architecture")],
    ["selectors/phase-decomposition-strategies.yaml", seededSelector("phase-decomposition-strategies", "VSP", "strategy")],
    ["selectors/phase-decomposition-new-plans.yaml", {
      kind: "selector-definition", id: "phase-decomposition-new-plans", version: 1,
      description: "DWP plans created through the public Scenario under test.", parameters: [], result_kind: "revision",
      query: { from: { collection: "revisions", types: ["DWP"] }, as: "plan",
        where: 'plan.provenance.scenario == "define-decomposition-work-package@4"',
        distinct: true, order_by: ["identity.revision_id"] },
    }],
    ["selectors/phase-decomposition-interfaces.yaml", {
      kind: "selector-definition", id: "phase-decomposition-interfaces", version: 1,
      description: "The focused architecture has no controlled interface.", parameters: [], result_kind: "revision",
      query: { from: { collection: "revisions", types: ["ICSP"] }, as: "interface",
        where: "false", distinct: true, order_by: ["identity.revision_id"] },
    }],
  ] as [string, unknown][]) await writeYaml(root, relative, value);

  for (const [file, id, type, alias] of [
    ["phase-2-entry-requirements.yaml", "phase-2-entry-requirements", "STK", "requirement"],
    ["phase-3-entry-requirements.yaml", "phase-3-entry-requirements", "SYS", "requirement"],
    ["phase-4-entry-component-requirements.yaml", "phase-4-entry-component-requirements", "CMP", "requirement"],
  ] as [string, string, string, string][]) await writeYaml(root, `selectors/${file}`, seededSelector(id, type, alias));
  return root;
}

function json(command: ReturnType<typeof mdlm>): Json {
  expect(command.status, `${command.stderr}${command.stdout}`).toBe(0);
  return JSON.parse(command.stdout);
}

function response(packet: Json, payloads: Record<string, Json>): Json {
  const value = structuredClone(packet.responseScaffold);
  value.proposal.outputs = value.proposal.outputs.filter(
    (output: Json) => payloads[output.output ?? output.handle] !== undefined,
  );
  for (const output of value.proposal.outputs) {
    output.payload = payloads[output.output ?? output.handle];
    output.body = `${output.type} fixture.\n`;
  }
  value.proposal.completionEvidence = { summary: "Focused public transaction." };
  return value;
}

function submit(repository: string, value: Json): Json {
  return json(mdlmWithInput(repository, `${JSON.stringify(value)}\n`, "scenario", "submit", "-", "--json"));
}

function commit(repository: string): void {
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"]).status).toBe(0);
  const result = spawnSync("git", ["-C", repository, "-c", "user.name=MDLM Test",
    "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false", "commit",
    "--quiet", "--no-verify", "-m", "Publish focused ancestry"], { encoding: "utf8" });
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

it("gives decomposition planning the active parent and Phase 4 target guidance", async () => {
  for (const phase of phases) {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase-parents-"));
    try {
      const repository = path.join(parent, "repository");
      await fs.mkdir(repository);
      await selectProcessPackageFixture(repository, await focusedPackage(parent, phase));
      const seedOutcome = json(mdlm(repository, "next", "--json"));
      expect(seedOutcome.assignment, JSON.stringify(seedOutcome)).toBeDefined();
      const seedPacket = seedOutcome.assignment.packet;
      const commonRequirement = {
        rationale: "Keep one exact ancestry.", statement: "The product shall report one value.",
        verification_intent: "Observe the reported value.",
      };
      const seedResult = submit(repository, response(seedPacket, {
        product: { title: "Reporter", rationale: "Exercise decomposition.", problem: "Report one value.",
          users: ["operator"], goals: ["Report one value"], non_goals: ["Implementation"], success_measures: ["Deterministic output"] },
        stakeholder: { title: "Report", ...commonRequirement, stakeholder: "operator", priority: "must", system_context: "reporter" },
        system: { title: "Classify", ...commonRequirement },
        architecture: { title: "Reused component architecture", rationale: "Reuse one allocation context.", level: "component",
          elements: [{ id: "AEL-PHASE62200", alias: "REPORTER", title: "Reporter", responsibilities: ["Report one value"] }],
          internal_interactions: [], controlled_boundaries: [], constraints: [], nominated_risks: [] },
        strategy: { title: `${phase.level} strategy`, rationale: "Verify the exact active parent.", level: phase.level,
          permitted_methods: ["test"], independence: { boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"] },
          evidence_policy: "Retain observations.", assessment_policy: "Compare the result.",
          environment_profile: { id: "phase-parent", purpose: "Exercise one boundary.", capabilities: { controllability: ["input"], observability: ["output"], external_services: [], timing: "bounded" } } },
        prior_plan: { title: "Prior component plan", rationale: "Create the inherited component requirement.", stage: "planning",
          architecture_element: "AEL-PHASE62200", target_child_type: "CMP", behavioral_slice: "Report one value.",
          expected_coverage: ["The system requirement"], exclusions: [], dependencies: [], required_review_policy: "review-applicability@1" },
        component: { title: "Report value", ...commonRequirement,
          architecture_allocation: { architecture_revision: "ASP-0000000000-r00001", element: "AEL-PHASE62200" } },
      }));
      expect(seedResult.outcome).toBe("accepted");
      commit(repository);

      const planOutcome = json(mdlm(repository, "next", "--json"));
      expect(planOutcome.assignment, JSON.stringify(planOutcome)).toBeDefined();
      const packet = planOutcome.assignment.packet;
      expect(packet.scenario.reference).toBe("define-decomposition-work-package@4");
      const parents = packet.exactInputs[0].inputs.find((input: Json) => input.name === "parents").values;
      expect(parents.map((parent: Json) => parent.identity.type)).toEqual([phase.parentType]);
      const plan = packet.responseScaffold.proposal.outputs.find((output: Json) => output.output === "plan");
      const decompositionLinks = plan.links.filter((link: Json) => link.type === "decomposes");
      expect(decompositionLinks).toEqual([
        { type: "decomposes", target: { input: "parents" } },
      ]);

      if (phase.id === "phase-4-design-definition") {
        const accepted = submit(repository, response(packet, { plan: {
          title: "Design decomposition", rationale: "Define one exact design slice.", stage: "planning",
          architecture_element: "AEL-PHASE62200", target_child_type: phase.targetType,
          behavioral_slice: "Report one value.", expected_coverage: ["The component requirement"],
          exclusions: ["Implementation"], dependencies: [], required_review_policy: "review-applicability@1",
        } }));
        expect(accepted.outcome).toBe("accepted");
        expect(accepted.receipt.publications).toEqual([
          expect.objectContaining({ handle: "plan", revisionId: expect.stringMatching(/^DWP-/) }),
        ]);
        commit(repository);

        const executionPacket = json(mdlm(repository, "next", "--json")).assignment.packet;
        expect(executionPacket.scenario.reference)
          .toBe("execute-lower-level-decomposition-work-package@1");
        const exactPlan = executionPacket.exactInputs[0].inputs.find(
          (input: Json) => input.name === "plan",
        ).values[0];
        expect(exactPlan.data.payload.target_child_type).toBe("DES");
        expect(executionPacket.scenario.prompt.content).toContain(
          "When the exact plan's `target_child_type` is `CMP`, keep each requirement solution-independent",
        );
        expect(executionPacket.scenario.prompt.content).toContain(
          "When the exact plan's `target_child_type` is `DES`, add at least one concrete implementable technical choice beyond renaming or restating its parent CMP",
        );
        expect(executionPacket.scenario.prompt.content).toContain(
          "Do not name source files or symbols, include product code or unit tests, or expose verification implementation.",
        );
      }
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }
}, 360_000);
