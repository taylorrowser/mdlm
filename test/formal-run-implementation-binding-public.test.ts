import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";

type Json = Record<string, any>;

const implementationRef = `procedure:sha256:${"1".repeat(64)}`;
const capabilities = {
  controllability: ["process"],
  observability: ["stdio", "exit-status"],
  external_services: [],
  timing: "bounded",
};

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

function commit(repository: string, message: string): void {
  expect(git(repository, "add", ".lifecycle").status).toBe(0);
  const committed = git(
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
  expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
}

async function focusedPackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });

  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.enabled.phases = ["phase-1-product-assurance"];
  await fs.writeFile(profilePath, stringify(profile));

  const phasePath = path.join(root, "phases/phase-1-product-assurance.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.attention_checkpoints = [];
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

  const runScenarioPath = path.join(root, "scenarios/execute-verification-run.yaml");
  const runScenario = parse(await fs.readFile(runScenarioPath, "utf8"));
  const resultOutput = runScenario.outputs.find(
    (output: Json) => output.name === "result",
  );
  resultOutput.required_links.push({
    link: "verifies-revision",
    target: { input: "requirement" },
  });
  resultOutput.permitted_links = [];
  await fs.writeFile(runScenarioPath, stringify(runScenario));

  for (const entry of await fs.readdir(path.join(root, "obligations"))) {
    const obligationPath = path.join(root, "obligations", entry);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (!obligation.phases?.includes("phase-1-product-assurance")) continue;
    obligation.status_rules = [{
      status: "blocked",
      priority: 1_000_000,
      when: "true",
      reason: "Outside the focused runner-identity route.",
    }];
    obligation.default_status = "blocked";
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-runner-identity-route",
    version: 1,
    description: "Publish the minimum exact formal-run inputs.",
    phases: ["phase-1-product-assurance"],
    inputs: [],
    outputs: [
      { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
      {
        name: "requirement",
        types: ["STK"],
        cardinality: "one",
        required_links: [{ link: "derived-from", target: { output: "product" } }],
      },
      {
        name: "strategy",
        types: ["VSP"],
        cardinality: "one",
        required_links: [
          { link: "governs", target: { output: "requirement" } },
          { link: "governs-revision", target: { output: "requirement" } },
        ],
      },
      {
        name: "environment",
        types: ["ENV"],
        cardinality: "one",
        required_links: [{ link: "realizes", target: { output: "strategy" } }],
      },
      {
        name: "activity",
        types: ["VER"],
        cardinality: "one",
        required_links: [
          { link: "governed-by", target: { output: "strategy" } },
          { link: "verifies-revision", target: { output: "requirement" } },
        ],
      },
      { name: "artifact", types: ["ART"], cardinality: "one", required_links: [] },
      {
        name: "implementation",
        types: ["VAI"],
        cardinality: "one",
        required_links: [
          { link: "realizes", target: { output: "activity" } },
          { link: "uses", target: { output: "environment" } },
          { link: "targets", target: { output: "artifact" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-runner-identity-route.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-runner-identity-route-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition",
    id: "seed-runner-identity-route-required",
    version: 1,
    description: "The focused route requires one exact qualification implementation.",
    phases: ["phase-1-product-assurance"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("focused-runner-implementations@1", {})',
    status_rules: [{
      status: "ready",
      priority: 2_000_000,
      when: 'none("focused-runner-implementations@1", {})',
      reason: "Publish the focused runner inputs.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-runner-identity-route@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const runObligation = {
    kind: "obligation-definition",
    id: "focused-runner-identity-required",
    version: 1,
    description: "The focused implementation requires one exact bound run.",
    phases: ["phase-1-product-assurance"],
    for_each: 'select("focused-runner-implementations@1", {})',
    subject_as: "implementation",
    satisfied_when:
      'exists("completed-runs-for-implementation@1", {implementation: implementation})',
    status_rules: [{
      status: "ready",
      priority: 2_000_000,
      when: "true",
      reason: "The exact qualification implementation is ready.",
    }],
    default_status: "blocked",
    resolve_with: {
      scenario: "execute-verification-run@2",
      inputs: {
        implementation: "implementation",
        activity:
          'one("verification-activities-for-implementation@1", {implementation: implementation})',
        environment:
          'one("environments-for-implementation@1", {implementation: implementation})',
        execution_target:
          'one("execution-targets-for-implementation@1", {implementation: implementation})',
        requirement:
          'first("phase-6-accepted-requirements-for-formal-implementation@1", {implementation: implementation})',
      },
    },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const selector = {
    kind: "selector-definition",
    id: "focused-runner-implementations",
    version: 1,
    description: "The qualification implementation published by focused setup.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["VAI"] },
      as: "implementation",
      where:
        'implementation.provenance.scenario == "seed-runner-identity-route@1"',
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  const acceptedRequirementSelector = {
    kind: "selector-definition",
    id: "phase-6-accepted-requirements-for-formal-implementation",
    version: 1,
    description: "The exact requirement bound to the focused formal implementation.",
    parameters: [{ name: "implementation", kind: "revision", types: ["VAI"] }],
    result_kind: "revision",
    query: {
      from: {
        selector: "requirements-for-pilot-activity@1",
        arguments: {
          activity:
            'one("verification-activities-for-implementation@1", {implementation: implementation})',
        },
      },
      as: "requirement",
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  const qualifiedEnvironmentSelector = {
    kind: "selector-definition",
    id: "phase-6-qualified-environments-for-formal-implementation",
    version: 1,
    description: "The exact environment bound to the focused formal implementation.",
    parameters: [{ name: "implementation", kind: "revision", types: ["VAI"] }],
    result_kind: "revision",
    query: {
      from: {
        selector: "environments-for-implementation@1",
        arguments: { implementation: "implementation" },
      },
      as: "environment",
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  const controlledArtifactSelector = {
    kind: "selector-definition",
    id: "phase-6-controlled-artifacts-for-formal-implementation",
    version: 1,
    description: "The exact artifact bound to the focused formal implementation.",
    parameters: [{ name: "implementation", kind: "revision", types: ["VAI"] }],
    result_kind: "revision",
    query: {
      from: {
        selector: "execution-targets-for-implementation@1",
        arguments: { implementation: "implementation" },
      },
      as: "artifact",
      where: 'artifact.identity.type == "ART"',
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  for (const [relative, value] of [
    ["scenarios/seed-runner-identity-route.yaml", seedScenario],
    ["obligations/seed-runner-identity-route-required.yaml", seedObligation],
    ["obligations/focused-runner-identity-required.yaml", runObligation],
    ["selectors/focused-runner-implementations.yaml", selector],
    ["selectors/phase-6-accepted-requirements-for-formal-implementation.yaml", acceptedRequirementSelector],
    ["selectors/phase-6-qualified-environments-for-formal-implementation.yaml", qualifiedEnvironmentSelector],
    ["selectors/phase-6-controlled-artifacts-for-formal-implementation.yaml", controlledArtifactSelector],
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(root, relative), stringify(value));
  }
  await fs.writeFile(
    path.join(root, "prompts/seed-runner-identity-route.md"),
    "---\nid: seed-runner-identity-route\nversion: 1\nscenario: seed-runner-identity-route\n---\n\n# Seed runner identity route\n",
  );
  return root;
}

function proposal(packet: Json, payloads: Record<string, Json>): Json {
  const response = structuredClone(packet.responseScaffold);
  response.proposal.outputs = response.proposal.outputs.map((output: Json) => ({
    ...output,
    payload: payloads[output.output ?? output.handle],
    body: `Focused ${output.output ?? output.handle}.\n`,
  }));
  response.proposal.completionEvidence = { summary: "Completed the focused route." };
  return response;
}

function nextPacket(repository: string, scenario: string): Json {
  const next = mdlm(repository, "next", "--json");
  expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
  const assignment = JSON.parse(next.stdout).assignment;
  expect(assignment.packet.scenario.reference).toBe(scenario);
  return assignment.packet;
}

function submit(repository: string, response: Json) {
  return mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    "scenario",
    "submit",
    "-",
    "--json",
  );
}

it("rejects a formal pass unless its runner and observations match", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-runner-binding-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await focusedPackage(parent));

    const seed = nextPacket(repository, "seed-runner-identity-route@1");
    const seedResult = submit(repository, proposal(seed, {
      product: {
        title: "Focused product",
        rationale: "Provide one requirement parent.",
        problem: "Exercise one exact qualification route.",
        users: ["operator"],
        goals: ["Run one exact procedure"],
        non_goals: ["Build a product"],
        success_measures: ["The bound procedure identity is retained"],
      },
      requirement: {
        title: "Retain exact runner identity",
        rationale: "Prevent execution evidence from naming another procedure.",
        statement: "The run shall identify the exact verification procedure.",
        verification_intent: "Compare the run and procedure identities.",
        stakeholder: "operator",
        priority: "must",
        system_context: "verification",
      },
      strategy: {
        title: "Qualification strategy",
        rationale: "Exercise one environment capability without product source.",
        level: "stakeholder",
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
        evidence_policy: "Retain the exact run identity.",
        assessment_policy: "Compare the expected and observed capability.",
        environment_profile: {
          id: "focused-process",
          purpose: "Execute one exact procedure.",
          capabilities,
        },
      },
      environment: {
        title: "Focused process environment",
        rationale: "Realize the exact qualification profile.",
        strategy_revision: "$proposal.strategy.revision_id",
        profile_id: "focused-process",
        capabilities,
        reproducibility: {
          environment_ref: "focused-process@1",
          configuration_digest: `sha256:${"0".repeat(64)}`,
          reconstruction: "Run the focused process fixture.",
        },
      },
      activity: {
        title: "Verify the focused requirement",
        rationale: "Check the declared behavior and its discrimination case.",
        kind: "formal",
        method: "test",
        assessment_mode: "automatic",
        claim: {
          kind: "formal",
          scope: "requirement",
          formal_evidence_eligible: true,
        },
        acceptance_criteria: ["The exact procedure completes."],
        evidence_requirements: ["Retain the exact runner identity."],
        expected_success_activity: "The capability probe succeeds.",
        expected_discrimination_activity: "The negative probe is rejected.",
        expected_observations: {
          "capability-probe": {
            stdin_base64: "",
            stdout_base64: "b2sK",
            stderr_base64: "",
            exit_status: 0,
            timed_out: false,
            truncated: false,
          },
          "negative-control": {
            stdin_base64: "YmFk",
            stdout_base64: "",
            stderr_base64: "ZXJyb3IK",
            exit_status: 2,
            timed_out: false,
            truncated: false,
          },
        },
      },
      artifact: {
        title: "Focused controlled product build",
        kind: "prototype",
        repository_ref: `git:${"0".repeat(40)}`,
        supported_behavior: ["The capability probe succeeds."],
        unsupported_behavior: ["The negative probe is rejected."],
      },
      implementation: {
        title: "Exact formal procedure",
        rationale: "Implement the exact requirement check.",
        kind: "formal",
        implementation_ref: implementationRef,
        independence_mode: "source-blind",
        authoring_input_refs: [
          "$proposal.activity.revision_id",
          "$proposal.environment.revision_id",
        ],
        prohibited_inputs_observed: [
          "product source code",
          "product unit tests",
          "private implementation details",
          "uncontrolled implementation shortcuts",
        ],
        activity_bindings: ["capability-probe", "negative-control"],
        target_behavior: {
          supported: ["The capability probe succeeds."],
          intentionally_unsupported: ["The negative probe is rejected."],
        },
        execution_procedure: {
          content: "#!/bin/sh\nexit 0\n",
          deadlines_ms: {
            checkout: 1000,
            environment_check: 1000,
            product_case: 1000,
          },
          deadline_scope: "infrastructure-safety-only",
          timeout: {
            termination: "process-group-sigterm-then-sigkill",
            force_after_ms: 100,
            reaping: "all-descendants",
            capture_partial_raw_observation: true,
          },
          cleanup: "guaranteed",
          aggregation: "continue-through-all-cases",
        },
      },
    }));
    expect(seedResult.status, `${seedResult.stderr}${seedResult.stdout}`).toBe(0);
    commit(repository, "Seed exact formal inputs");

    const run = nextPacket(repository, "execute-verification-run@2");
    const runInput = run.exactInputs[0].inputs;
    const revision = (name: string) =>
      runInput.find((input: Json) => input.name === name).values[0].identity.revision_id;
    const runPayload = {
      title: "Focused formal run",
      kind: "formal",
      started_at: "2026-09-02T00:00:00Z",
      completed_at: "2026-09-02T00:00:01Z",
      execution_state: "completed",
      execution_target: { kind: "product-build", ref: revision("execution_target") },
      runner_ref: implementationRef,
      configuration_refs: [revision("implementation"), revision("activity")],
      activities_expected: ["capability-probe", "negative-control"],
      activities_invoked: ["capability-probe", "negative-control"],
      evidence_locations: ["inline:focused-formal"],
      actual_observations: {
        "capability-probe": {
          stdin_base64: "",
          stdout_base64: "b2sK",
          stderr_base64: "",
          exit_status: 0,
          timed_out: false,
          truncated: false,
        },
        "different-negative-control": {
          stdin_base64: "YmFk",
          stdout_base64: "b2sK",
          stderr_base64: "",
          exit_status: 0,
          timed_out: false,
          truncated: false,
        },
      },
    };
    const resultPayload = {
      title: "Passing focused formal result",
      claim: {
        kind: "formal",
        scope: "requirement",
        outcome: "pass",
        formal_evidence_eligible: true,
      },
      assessment_state: "recorded",
      observations: {
        expected_success_observed: true,
        expected_discrimination_observed: true,
        details: "Both declared qualification activities completed.",
      },
      evidence_refs: ["inline:focused-formal"],
      assessor_ref: implementationRef,
    };
    const runnerMismatch = submit(repository, proposal(run, {
      run: {
        ...runPayload,
        runner_ref: `procedure:sha256:${"2".repeat(64)}`,
      },
      result: resultPayload,
    }));
    expect(runnerMismatch.status).toBe(1);
    expect(runnerMismatch.stdout).toContain("scenario-completion-failed");

    const mismatchedProposal = proposal(run, {
      run: runPayload,
      result: resultPayload,
    });
    const mismatched = submit(repository, mismatchedProposal);
    expect(mismatched.status).toBe(1);
    expect(mismatched.stdout).toContain("scenario-completion-failed");
    expect(JSON.parse(mismatched.stdout)).toEqual(expect.objectContaining({
      retryable: true,
      correctionConsumed: false,
    }));
    expect(git(repository, "status", "--short").stdout).toBe("");

    const correctedProposal = proposal(run, {
      run: {
        ...runPayload,
        actual_observations: {
          "capability-probe": {
            stdin_base64: "",
            stdout_base64: "b2sK",
            stderr_base64: "",
            exit_status: 0,
            timed_out: false,
            truncated: false,
          },
          "negative-control": {
            stdin_base64: "YmFk",
            stdout_base64: "",
            stderr_base64: "ZXJyb3IK",
            exit_status: 2,
            timed_out: false,
            truncated: false,
          },
        },
      },
      result: resultPayload,
    });
    const accepted = submit(repository, correctedProposal);
    expect(accepted.status, `${accepted.stderr}${accepted.stdout}`).toBe(0);
    expect(JSON.parse(accepted.stdout).receipt.publications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ handle: "run", revisionId: expect.stringMatching(/^RUN-/) }),
        expect.objectContaining({ handle: "result", revisionId: expect.stringMatching(/^RES-/) }),
      ]),
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 60_000);
