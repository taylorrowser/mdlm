import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { mdlm, mdlmWithInput, selectProcessPackageFixture } from "./helpers/mdlm.js";

type Json = Record<string, any>;

const capabilities = {
  controllability: ["input"],
  observability: ["output"],
  external_services: [],
  timing: "bounded",
};

async function focusedPackage(parent: string, ambiguous: boolean): Promise<string> {
  const root = path.join(parent, ambiguous ? "ambiguous-process" : "unrelated-process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, { recursive: true });

  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-5-implementation"];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(root, "phases/phase-5-implementation.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.outputs = [...new Set([...phase.outputs, "PSP", "STK", "VSP", "ENV", "VER"])];
  phase.progression.readiness = "false";
  phase.progression.authorization.condition = "false";
  await fs.writeFile(phasePath, stringify(phase));
  for (const entry of await fs.readdir(path.join(root, "phases"))) {
    const otherPath = path.join(root, "phases", entry);
    if (otherPath === phasePath) continue;
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }

  // Keep the production selector's exact-strategy logic in this public route,
  // while replacing assurance evidence with fixture markers. Qualification and
  // Review remain asserted against the unmodified package below.
  const formalSelectorPath = path.join(root, "selectors/formal-environments-for-activity.yaml");
  const formalSelector = parse(await fs.readFile(formalSelectorPath, "utf8"));
  formalSelector.query.where = formalSelector.query.where
    .replace('exists("passing-qualification-results-for@1", {environment: environment})', "true")
    .replace('exists("passing-reviews-for@1", {subject: environment})', "true");
  await fs.writeFile(formalSelectorPath, stringify(formalSelector));
  const implementationScenarioPath = path.join(root, "scenarios/implement-verification-activity.yaml");
  const implementationScenario = parse(await fs.readFile(implementationScenarioPath, "utf8"));
  implementationScenario.inputs.find((input: Json) => input.name === "activity").conditions = 'activity.payload.kind == "formal"';
  implementationScenario.inputs.find((input: Json) => input.name === "environment").conditions = "true";
  await fs.writeFile(implementationScenarioPath, stringify(implementationScenario));

  for (const entry of await fs.readdir(path.join(root, "obligations"))) {
    const file = path.join(root, "obligations", entry);
    const obligation = parse(await fs.readFile(file, "utf8"));
    if (!obligation.phases?.includes("phase-5-implementation")) continue;
    obligation.status_rules = [{
      status: "blocked",
      priority: 1_000_000,
      when: "true",
      reason: "Outside the focused formal environment route.",
    }];
    obligation.default_status = "blocked";
    await fs.writeFile(file, stringify(obligation));
  }

  const outputs: Json[] = [
    { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
    { name: "requirement", types: ["STK"], cardinality: "one", required_links: [{ link: "derived-from", target: { output: "product" } }] },
    { name: "governing_strategy", types: ["VSP"], cardinality: "one", required_links: [{ link: "governs", target: { output: "requirement" } }, { link: "governs-revision", target: { output: "requirement" } }] },
    { name: "unrelated_strategy", types: ["VSP"], cardinality: "one", required_links: [{ link: "governs", target: { output: "requirement" } }, { link: "governs-revision", target: { output: "requirement" } }] },
    { name: "governing_environment", types: ["ENV"], cardinality: "one", required_links: [{ link: "realizes", target: { output: "governing_strategy" } }] },
    { name: "unrelated_environment", types: ["ENV"], cardinality: "one", required_links: [{ link: "realizes", target: { output: "unrelated_strategy" } }] },
    ...(ambiguous ? [{ name: "ambiguous_environment", types: ["ENV"], cardinality: "one", required_links: [{ link: "realizes", target: { output: "governing_strategy" } }] }] : []),
    { name: "activity", types: ["VER"], cardinality: "one", required_links: [{ link: "governed-by", target: { output: "governing_strategy" } }, { link: "verifies", target: { output: "requirement" } }, { link: "verifies-revision", target: { output: "requirement" } }] },
  ];
  const seedScenario = {
    kind: "scenario-definition", id: "seed-formal-environment-route", version: 1,
    description: "Publish the exact focused Phase 5 selector inputs.", phases: ["phase-5-implementation"],
    inputs: [], outputs, prompt_ref: "prompts/seed-formal-environment-route.md@1",
    review_policy_ref: "review-applicability@1", completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-formal-environment-route-required"], prohibited_inputs: [], batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition", id: "seed-formal-environment-route-required", version: 1,
    description: "The focused route requires exact selector inputs.", phases: ["phase-5-implementation"],
    for_each: "[phase]", subject_as: "required_phase",
    satisfied_when: 'exists("focused-formal-activities@1", {})',
    status_rules: [{ status: "ready", priority: 2_000_000, when: 'none("focused-formal-activities@1", {})', reason: "Publish focused inputs." }],
    default_status: "blocked", resolve_with: { scenario: "seed-formal-environment-route@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const formalObligation = {
    kind: "obligation-definition", id: "formal-verification-implementation-required", version: 1,
    description: "Dispatch the focused formal activity only for one exact environment.", phases: ["phase-5-implementation"],
    for_each: 'select("focused-formal-activities@1", {})', subject_as: "activity", satisfied_when: "false",
    status_rules: [{ status: "ready", priority: 1_000_000, when: 'count("formal-environments-for-activity@1", {activity: activity}) == 1', reason: "One exact environment is ready." }],
    default_status: "blocked",
    resolve_with: { scenario: "implement-verification-activity@1", inputs: {
      activity: "activity",
      environment: 'one("formal-environments-for-activity@1", {activity: activity})',
      execution_target: 'one("formal-environments-for-activity@1", {activity: activity})',
    } },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const activities = {
    kind: "selector-definition", id: "focused-formal-activities", version: 1,
    description: "The formal activity published by focused setup.", parameters: [], result_kind: "revision",
    query: { from: { collection: "revisions", types: ["VER"] }, as: "activity", where: 'activity.provenance.scenario == "seed-formal-environment-route@1"', distinct: true, order_by: ["identity.revision_id"] },
  };
  for (const [relative, value] of [
    ["scenarios/seed-formal-environment-route.yaml", seedScenario],
    ["obligations/seed-formal-environment-route-required.yaml", seedObligation],
    ["obligations/formal-verification-implementation-required.yaml", formalObligation],
    ["selectors/focused-formal-activities.yaml", activities],
  ] as [string, unknown][]) await fs.writeFile(path.join(root, relative), stringify(value));
  await fs.writeFile(path.join(root, "prompts/seed-formal-environment-route.md"), "---\nid: seed-formal-environment-route\nversion: 1\nscenario: seed-formal-environment-route\n---\n\n# Seed formal environment route\n");
  return root;
}

function response(packet: Json, ambiguous: boolean): Json {
  const value = structuredClone(packet.responseScaffold);
  const payloads: Record<string, Json> = {
    product: { title: "Echo", rationale: "Exercise one route.", problem: "Echo input.", users: ["operator"], goals: ["Echo"], non_goals: [], success_measures: ["Exact output"] },
    requirement: { title: "Echo input", rationale: "Expose one behavior.", statement: "The product shall echo one input.", verification_intent: "Observe exact output.", stakeholder: "operator", priority: "must", system_context: "echo" },
    governing_strategy: strategyPayload("governing-profile"),
    unrelated_strategy: strategyPayload("unrelated-profile"),
    governing_environment: environmentPayload("$proposal.governing_strategy.revision_id", "governing-profile"),
    unrelated_environment: environmentPayload("$proposal.unrelated_strategy.revision_id", "unrelated-profile"),
    ...(ambiguous ? { ambiguous_environment: environmentPayload("$proposal.governing_strategy.revision_id", "governing-profile") } : {}),
    activity: { title: "Verify echo", rationale: "Judge the exact requirement.", kind: "formal", method: "test", assessment_mode: "automatic", claim: { kind: "formal", scope: "requirement", formal_evidence_eligible: true }, acceptance_criteria: ["Output matches input."], evidence_requirements: ["Retain output."], expected_success_activity: "Matching output passes.", expected_discrimination_activity: "Different output fails.", expected_observations: { "echo-case": { stdin_base64: "ZWNobw==", stdout_base64: "ZWNobw==", stderr_base64: "", exit_status: 0, timed_out: false, truncated: false } } },
  };
  value.proposal.outputs = value.proposal.outputs.map((output: Json) => ({
    ...output,
    payload: payloads[output.output ?? output.handle],
    body: `Focused ${output.output ?? output.handle}.\n`,
  }));
  value.proposal.completionEvidence = { summary: "Published focused exact selector inputs." };
  return value;
}

function strategyPayload(id: string): Json {
  return { title: id, rationale: "Verify without source access.", level: "design", permitted_methods: ["test"], independence: { boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"] }, evidence_policy: "Retain output.", assessment_policy: "Compare output.", environment_profile: { id, purpose: "Exercise the public command.", capabilities } };
}

function environmentPayload(strategy: string, profile: string): Json {
  return { title: profile, rationale: "Realize the exact strategy.", strategy_revision: strategy, profile_id: profile, capabilities, reproducibility: { environment_ref: `${profile}@1`, configuration_digest: `sha256:${"0".repeat(64)}`, reconstruction: "Recreate the focused fixture." } };
}

async function runRoute(parent: string, ambiguous: boolean): Promise<{ outcome: Json; repository: string }> {
  const repository = path.join(parent, ambiguous ? "ambiguous-repository" : "unrelated-repository");
  await fs.mkdir(repository);
  await selectProcessPackageFixture(repository, await focusedPackage(parent, ambiguous));
  const first = JSON.parse(mdlm(repository, "next", "--json").stdout);
  expect(first.assignment.packet.scenario.reference).toBe("seed-formal-environment-route@1");
  const submitted = mdlmWithInput(repository, `${JSON.stringify(response(first.assignment.packet, ambiguous))}\n`, "scenario", "submit", "-", "--json");
  expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"]).status).toBe(0);
  expect(spawnSync("git", ["-C", repository, "-c", "user.name=MDLM Test", "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Seed exact environments"], { encoding: "utf8" }).status).toBe(0);
  const next = mdlm(repository, "next", "--json");
  expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
  return { outcome: JSON.parse(next.stdout), repository };
}

it("dispatches only the environment realizing the exact governing strategy", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-formal-env-"));
  try {
    const productionSelector = await fs.readFile(
      path.join(process.cwd(), ".lifecycle/process/selectors/formal-environments-for-activity.yaml"),
      "utf8",
    );
    expect(productionSelector).toContain("passing-qualification-results-for@1");
    expect(productionSelector).toContain("passing-reviews-for@1");
    const phaseFiveEntry = await fs.readFile(
      path.join(process.cwd(), ".lifecycle/process/selectors/phase-5-entry-design-candidates.yaml"),
      "utf8",
    );
    expect(phaseFiveEntry).toContain(
      'count("formal-environments-for-activity@1", {activity: activity}) == 1',
    );

    const unrelatedRoute = await runRoute(parent, false);
    const unrelated = unrelatedRoute.outcome;
    expect(unrelated.assignment, JSON.stringify(unrelated)).toBeDefined();
    expect(unrelated.assignment.packet.scenario.reference).toBe("implement-verification-activity@1");
    const environment = unrelated.assignment.packet.exactInputs[0].inputs.find((input: Json) => input.name === "environment").values;
    expect(environment).toHaveLength(1);
    const shown = mdlm(unrelatedRoute.repository, "show", environment[0].identity.revision_id, "--json");
    expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
    expect(JSON.parse(shown.stdout).lifecycleDatum.datum.payload.profile_id).toBe("governing-profile");

    const ambiguous = (await runRoute(parent, true)).outcome;
    expect(ambiguous.outcome).toBe("process-dead-end");
    expect(ambiguous.assignment).toBeUndefined();
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 60_000);
