import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { expect, it } from "vitest";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";

type Json = Record<string, any>;

const implementationRef = `procedure:sha256:${"1".repeat(64)}`;
const prohibitedInputs = [
  "product source code",
  "product unit tests",
  "private implementation details",
  "uncontrolled implementation shortcuts",
];
const capabilities = {
  controllability: ["process"],
  observability: ["stdio", "exit-status"],
  external_services: [],
  timing: "bounded",
};

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

  for (const entry of await fs.readdir(path.join(root, "obligations"))) {
    const obligationPath = path.join(root, "obligations", entry);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (!obligation.phases?.includes("phase-1-product-assurance")) continue;
    obligation.status_rules = [{
      status: "blocked",
      priority: 1_000_000,
      when: "true",
      reason: "Outside the focused RUN projection route.",
    }];
    obligation.default_status = "blocked";
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  for (const id of [
    "verification-run-required",
    "pilot-control-verification-run-required",
  ]) {
    const runObligationPath = path.join(root, `obligations/${id}.yaml`);
    const runObligation = parse(await fs.readFile(runObligationPath, "utf8"));
    runObligation.status_rules = [{
      status: "ready",
      priority: 2_000_000,
      when: "true",
      reason: "The focused pilot inputs permit one execution.",
    }];
    runObligation.default_status = "blocked";
    await fs.writeFile(runObligationPath, stringify(runObligation));
  }

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-run-projection",
    version: 1,
    description: "Publish the exact inputs for one focused pilot RUN.",
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
          { link: "verifies", target: { output: "requirement" } },
          { link: "verifies-revision", target: { output: "requirement" } },
          { link: "governed-by", target: { output: "strategy" } },
        ],
      },
      { name: "target", types: ["ART"], cardinality: "one", required_links: [] },
      {
        name: "implementation",
        types: ["VAI"],
        cardinality: "one",
        required_links: [
          { link: "realizes", target: { output: "activity" } },
          { link: "uses", target: { output: "environment" } },
          { link: "targets", target: { output: "target" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-run-projection.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-run-projection-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition",
    id: "seed-run-projection-required",
    version: 1,
    description: "The focused route requires one exact pilot implementation.",
    phases: ["phase-1-product-assurance"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("verification-implementations-requiring-run@1", {})',
    status_rules: [{
      status: "ready",
      priority: 3_000_000,
      when: 'none("verification-implementations-requiring-run@1", {})',
      reason: "Publish the focused pilot inputs.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-run-projection@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  await fs.writeFile(
    path.join(root, "scenarios/seed-run-projection.yaml"),
    stringify(seedScenario),
  );
  await fs.writeFile(
    path.join(root, "obligations/seed-run-projection-required.yaml"),
    stringify(seedObligation),
  );
  await fs.writeFile(
    path.join(root, "prompts/seed-run-projection.md"),
    "---\nid: seed-run-projection\nversion: 1\nscenario: seed-run-projection\n---\n\n# Seed RUN projection\n",
  );
  return root;
}

function fillSeed(packet: Json, controlled = true): Json {
  const response = structuredClone(packet.responseScaffold);
  const ref = (output: string) => ({ output });
  const controls = {
    activity_ref: ref("activity"),
    working_directory: "fresh-temporary-directory",
    known_good: {
      argv: ["node", "-e", "process.exit(0)"],
      expected_observation: {
        exit_status: 0,
        stdout: { encoding: "base64", bytes: "" },
        stderr: { encoding: "base64", bytes: "" },
      },
      expected_verification_outcome: "pass",
    },
    known_bad: {
      argv: ["node", "-e", "process.exit(1)"],
      expected_observation: {
        exit_status: 1,
        stdout: { encoding: "base64", bytes: "" },
        stderr: { encoding: "base64", bytes: "" },
      },
      expected_verification_outcome: "fail",
      fault: "The one-fault control exits one.",
    },
  };
  const payloads: Record<string, Json> = {
    product: {
      title: "Focused pilot product",
      rationale: "Provide one exact public behavior.",
      problem: "Prove fixed RUN fields do not need transcription.",
      users: ["operator"],
      goals: ["Execute two bounded controls."],
      non_goals: [],
      success_measures: ["The controls discriminate."],
    },
    requirement: {
      title: "Discriminate controls",
      rationale: "Bound the focused pilot.",
      statement: "The pilot shall distinguish the good and bad controls.",
      verification_intent: "Run both exact controls.",
      stakeholder: "operator",
      priority: "must",
      system_context: "focused-test",
    },
    strategy: {
      title: "Focused pilot strategy",
      rationale: "Use black-box evidence.",
      level: "stakeholder",
      permitted_methods: ["test"],
      independence: { boundary: "black-box", prohibited_inputs: prohibitedInputs },
      evidence_policy: "Retain exact observations.",
      assessment_policy: "Compare both controls.",
      environment_profile: {
        id: "focused-process",
        purpose: "Run two controls.",
        capabilities,
      },
    },
    environment: {
      title: "Focused process environment",
      rationale: "Run the bounded controls.",
      strategy_revision: ref("strategy"),
      profile_id: "focused-process",
      capabilities,
      reproducibility: {
        environment_ref: "node:24",
        configuration_digest: `sha256:${"0".repeat(64)}`,
        reconstruction: "Use the exact runtime.",
      },
    },
    activity: {
      title: "Focused pilot activity",
      rationale: "Distinguish the declared controls.",
      kind: "pilot",
      method: "test",
      assessment_mode: "automatic",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
      acceptance_criteria: ["Good passes and bad fails."],
      evidence_requirements: ["Retain both observations."],
      expected_success_activity: "Run the good control.",
      expected_discrimination_activity: "Run the bad control.",
    },
    target: {
      title: "Focused pilot controls",
      kind: "prototype",
      supported_behavior: ["The good control exits zero."],
      unsupported_behavior: ["The bad control exits nonzero."],
      prototype_controls: controls,
    },
    implementation: {
      title: "Focused pilot procedure",
      rationale: "Execute the exact controls.",
      kind: "pilot",
      implementation_ref: implementationRef,
      independence_mode: "source-blind",
      authoring_input_refs: [ref("activity"), ref("environment"), ref("target")],
      prohibited_inputs_observed: prohibitedInputs,
      activity_bindings: ["known_good", "known_bad"],
      target_behavior: {
        supported: ["The good control exits zero."],
        intentionally_unsupported: ["The bad control exits nonzero."],
      },
      prototype_control_bindings: {
        activity_ref: ref("activity"),
        known_good: {
          argv: controls.known_good.argv,
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: controls.known_bad.argv,
          expected_verification_outcome: "fail",
        },
      },
      execution_procedure: {
        deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 },
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
  };
  if (!controlled) {
    const exactBytes = { encoding: "base64", bytes: "" };
    payloads.target = {
      title: "Registered public-interface pilot",
      kind: "prototype",
      repository_ref: `git:${"3".repeat(40)}`,
      supported_behavior: ["The good control exits zero."],
      unsupported_behavior: ["The bad control exits nonzero."],
      evidence_refs: ["inline:registered-pilot"],
      public_interface: {
        repository_locator: "focused-product-repository",
        command: [
          { literal: "node" },
          { checkout_path: "pilot.mjs" },
          { extra_argument: { raw: { encoding: "utf-8", value: "unexpected" } } },
        ],
        argument_cases: [{
          id: "normal",
          kind: "normal",
          expected_observation: {
            classification: "success",
            exit_status: 0,
            stdout: exactBytes,
            stderr: exactBytes,
          },
        }, {
          id: "argument-bearing",
          kind: "extra-argument",
          expected_observation: {
            classification: "automatic-rejection",
            exit_status: 2,
            stdout: exactBytes,
            stderr: exactBytes,
          },
        }],
        working_directory: "fresh-temporary-directory",
      },
    };
    payloads.implementation = {
      title: "Registered public-interface pilot procedure",
      rationale: "Execute the exact public interface.",
      kind: "pilot",
      implementation_ref: implementationRef,
      independence_mode: "source-blind",
      authoring_input_refs: [ref("activity"), ref("environment"), ref("target")],
      prohibited_inputs_observed: prohibitedInputs,
      activity_bindings: ["normal", "argument-bearing"],
      target_behavior: {
        supported: ["The good control exits zero."],
        intentionally_unsupported: ["The bad control exits nonzero."],
      },
      execution_procedure: {
        deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 },
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
    };
  }
  for (const output of response.proposal.outputs) {
    output.payload = payloads[output.handle];
    output.body = `Focused ${output.handle}.\n`;
  }
  response.proposal.completionEvidence = { summary: "Published exact pilot inputs." };
  return response;
}

function commit(repository: string): void {
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"]).status).toBe(0);
  const result = spawnSync("git", [
    "-C", repository,
    "-c", "user.name=MDLM Test",
    "-c", "user.email=mdlm-test@localhost",
    "-c", "commit.gpgSign=false",
    "commit", "--quiet", "--no-verify", "-m", "Publish focused inputs",
  ], { encoding: "utf8" });
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

function inputRevision(packet: Json, name: string): string {
  return packet.exactInputs[0].inputs.find(
    (input: Json) => input.name === name,
  ).values[0].identity.revision_id;
}

function observation(control: string, exitStatus: number): Json {
  return {
    control,
    argv: ["node", "-e", `process.exit(${exitStatus})`],
    working_directory: "fresh-temporary-directory",
    stdin: { encoding: "base64", bytes: "" },
    stdout: { encoding: "base64", bytes: "" },
    stderr: { encoding: "base64", bytes: "" },
    exit_status: exitStatus,
    timed_out: false,
    truncated: false,
  };
}

it("projects fixed pilot RUN fields through author-only submission", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-run-projection-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await focusedPackage(parent));

    const seedNext = mdlm(repository, "next", "--json");
    expect(seedNext.status, `${seedNext.stderr}${seedNext.stdout}`).toBe(0);
    const seedPacket = JSON.parse(seedNext.stdout).assignment.packet;
    expect(seedPacket.scenario.reference).toBe("seed-run-projection@1");
    const seeded = mdlmWithInput(
      repository,
      `${JSON.stringify(fillSeed(seedPacket))}\n`,
      "scenario", "submit", "-", "--json",
    );
    expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
    commit(repository);

    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const packet = JSON.parse(next.stdout).assignment.packet;
    expect(packet.scenario.reference).toBe(
      "execute-pilot-control-verification-run@1",
    );
    const run = packet.responseScaffold.proposal.outputs.find(
      (output: Json) => output.handle === "run",
    );
    const target = inputRevision(packet, "execution_target");
    const activity = inputRevision(packet, "activity");
    expect(run.payload).toMatchObject({
      kind: "pilot",
      runner_ref: implementationRef,
      activities_expected: ["known_good", "known_bad"],
      execution_target: { kind: "prototype", ref: target },
      control_observations: {
        known_good: { artifact_ref: target, activity_ref: activity },
        known_bad: { artifact_ref: target, activity_ref: activity },
      },
    });

    const authorValues = {
      outputs: [{
        slot: "run",
        payload: {
          title: "Focused pilot run",
          started_at: "2026-09-03T00:00:00Z",
          completed_at: "2026-09-03T00:00:01Z",
          execution_state: "completed",
          configuration_refs: [inputRevision(packet, "implementation")],
          activities_invoked: ["known_good", "known_bad"],
          evidence_locations: ["inline:focused-pilot"],
          control_observations: {
            known_good: observation("known_good", 0),
            known_bad: observation("known_bad", 1),
          },
        },
        body: "The exact controls completed.\n",
      }, {
        slot: "result",
        payload: {
          title: "Suitable focused pilot",
          claim: {
            kind: "pilot",
            scope: "verification-design",
            outcome: "suitable",
            formal_evidence_eligible: false,
          },
          assessment_state: "recorded",
          observations: {
            expected_success_observed: true,
            expected_discrimination_observed: true,
            details: "The good control passed and the bad control failed.",
          },
          control_judgments: {
            known_good: { observation_ref: "known_good", outcome: "pass" },
            known_bad: { observation_ref: "known_bad", outcome: "fail" },
          },
          evidence_refs: ["inline:focused-pilot"],
          assessor_ref: implementationRef,
        },
        body: "The pilot discriminates the controls.\n",
      }],
      completionEvidence: { summary: "Executed both exact controls." },
    };
    const changed: Json = structuredClone(authorValues);
    changed.outputs[0].payload.runner_ref = `procedure:sha256:${"2".repeat(64)}`;
    const rejected = mdlmWithInput(
      repository,
      `${JSON.stringify(changed)}\n`,
      "assignment", "submit-proposal", "-", "--json",
    );
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout)).toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "assignment-author-values-fixed-payload",
        path: "authorValues.outputs.run.payload.runner_ref",
      })]),
    });

    const falseSuitable = structuredClone(authorValues);
    const falseSuitableRun = falseSuitable.outputs.find(
      (output: Json) => output.slot === "run",
    );
    expect(falseSuitableRun).toBeDefined();
    falseSuitableRun!.payload!.control_observations!.known_good!.stdout!.bytes = "WA==";
    const falseSuitableResult = mdlmWithInput(
      repository,
      `${JSON.stringify(falseSuitable)}\n`,
      "assignment", "submit-proposal", "-", "--json",
    );
    expect(falseSuitableResult.status).toBe(1);

    const accepted = mdlmWithInput(
      repository,
      `${JSON.stringify(authorValues)}\n`,
      "assignment", "submit-proposal", "-", "--json",
    );
    expect(accepted.status, `${accepted.stderr}${accepted.stdout}`).toBe(0);
    const outcome = JSON.parse(accepted.stdout);
    expect(outcome.receipt.publications).toEqual(expect.arrayContaining([
      expect.objectContaining({ handle: "run", revisionId: expect.stringMatching(/^RUN-/) }),
      expect.objectContaining({ handle: "result", revisionId: expect.stringMatching(/^RES-/) }),
    ]));
    const saved = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/work/assignment-response.json"),
      "utf8",
    ));
    expect(saved.proposal.outputs.find((output: Json) => output.handle === "run").payload)
      .toMatchObject({
        kind: "pilot",
        runner_ref: implementationRef,
        activities_expected: ["known_good", "known_bad"],
        execution_target: { kind: "prototype", ref: target },
        control_observations: {
          known_good: { artifact_ref: target, activity_ref: activity },
          known_bad: { artifact_ref: target, activity_ref: activity },
        },
      });
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 45_000);

it("leaves public-interface pilot observations to the author", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-run-projection-"));
  try {
    const repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    await selectProcessPackageFixture(repository, await focusedPackage(parent));

    const seedNext = mdlm(repository, "next", "--json");
    expect(seedNext.status, `${seedNext.stderr}${seedNext.stdout}`).toBe(0);
    const seedPacket = JSON.parse(seedNext.stdout).assignment.packet;
    const seeded = mdlmWithInput(
      repository,
      `${JSON.stringify(fillSeed(seedPacket, false))}\n`,
      "scenario", "submit", "-", "--json",
    );
    expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
    commit(repository);

    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const packet = JSON.parse(next.stdout).assignment.packet;
    expect(packet.scenario.reference).toBe("execute-verification-run@2");
    const run = packet.responseScaffold.proposal.outputs.find(
      (output: Json) => output.handle === "run",
    );
    expect(run.payload).toMatchObject({
      kind: "pilot",
      runner_ref: implementationRef,
      activities_expected: ["normal", "argument-bearing"],
      execution_target: { ref: inputRevision(packet, "execution_target") },
    });
    expect(run.payload.execution_target).not.toHaveProperty("kind");
    expect(run.payload).not.toHaveProperty("control_observations");
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}, 45_000);
