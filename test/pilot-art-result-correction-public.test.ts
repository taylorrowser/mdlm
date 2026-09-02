import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { stringify, parse } from "yaml";
import { mdlm, mdlmWithInput, selectProcessPackageFixture } from "./helpers/mdlm.js";

const roots: string[] = [];
type Json = Record<string, any>;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

async function focusedPackage(parent: string): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });

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
  const phaseZeroPath = path.join(root, "phases/phase-0-wayfinding.yaml");
  const phaseZero = parse(await fs.readFile(phaseZeroPath, "utf8"));
  phaseZero.order = 10;
  await fs.writeFile(phaseZeroPath, stringify(phaseZero));

  const correctionPath = path.join(
    root,
    "obligations/pilot-vai-result-correction-required.yaml",
  );
  const correction = parse(await fs.readFile(correctionPath, "utf8"));
  correction.for_each = 'select("seeded-pilot-implementations@1", {})';
  correction.status_rules[0].when += '\n&& none("pilot-results-awaiting-assessment-for-implementation@1", {implementation: implementation})';
  await fs.writeFile(correctionPath, stringify(correction));
  const targetCorrectionPath = path.join(
    root,
    "obligations/pilot-vai-target-result-correction-required.yaml",
  );
  const targetCorrection = parse(await fs.readFile(targetCorrectionPath, "utf8"));
  targetCorrection.for_each = 'select("seeded-pilot-implementations@1", {})';
  targetCorrection.status_rules[0].when += '\n&& none("pilot-results-awaiting-assessment-for-implementation@1", {implementation: implementation})';
  await fs.writeFile(targetCorrectionPath, stringify(targetCorrection));
  const assessmentPath = path.join(
    root,
    "obligations/pilot-result-assessment-required.yaml",
  );
  const assessment = parse(await fs.readFile(assessmentPath, "utf8"));
  assessment.phases = ["phase-3-component-definition"];
  assessment.status_rules.find(
    (rule: Json) => rule.status === "awaiting-review",
  ).priority = 1_000;
  await fs.writeFile(assessmentPath, stringify(assessment));
  const reviewScenarioPath = path.join(root, "scenarios/review-phase-1-assurance.yaml");
  const reviewScenario = parse(await fs.readFile(reviewScenarioPath, "utf8"));
  reviewScenario.phases.push("phase-3-component-definition");
  await fs.writeFile(reviewScenarioPath, stringify(reviewScenario));
  const genericReviewPath = path.join(root, "obligations/passing-review-required.yaml");
  const genericReview = parse(await fs.readFile(genericReviewPath, "utf8"));
  genericReview.phases = ["phase-2-system-definition"];
  await fs.writeFile(genericReviewPath, stringify(genericReview));
  for (const [type, terminal] of [["ART", "prototype"], ["VAI", "pilot"]]) {
    const typePath = path.join(root, `types/${type}.yaml`);
    const definition = parse(await fs.readFile(typePath, "utf8"));
    definition.lifecycle = {
      ...definition.lifecycle,
      freeze_when: "terminal-outcome",
      terminal_payload_field: "kind",
      terminal_values: [terminal],
    };
    await fs.writeFile(typePath, stringify(definition));
  }

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-pilot-art-result-correction",
    version: 1,
    description: "Publish one accepted unsuitable pilot result against one ART.",
    phases: ["phase-3-component-definition"],
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
      {
        name: "target",
        types: ["ART"],
        cardinality: "one",
        required_links: [{ link: "derived-from", target: { output: "requirement" } }],
      },
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
      {
        name: "authorization",
        types: ["DEC"],
        cardinality: "one",
        required_links: [{ link: "justifies", target: { output: "implementation" } }],
      },
      {
        name: "result",
        types: ["RES"],
        cardinality: "one",
        required_links: [{ link: "assessed-in", target: { output: "environment" } }],
      },
      {
        name: "run",
        types: ["RUN"],
        cardinality: "one",
        required_links: [
          { link: "executes", target: { output: "implementation" } },
          { link: "uses", target: { output: "environment" } },
          { link: "targets", target: { output: "target" } },
          { link: "produces", target: { output: "result" } },
        ],
      },
      {
        name: "assessment_result",
        types: ["RES"],
        cardinality: "one",
        required_links: [{ link: "assessed-in", target: { output: "environment" } }],
      },
      {
        name: "assessment_run",
        types: ["RUN"],
        cardinality: "one",
        required_links: [
          { link: "executes", target: { output: "implementation" } },
          { link: "uses", target: { output: "environment" } },
          { link: "targets", target: { output: "target" } },
          { link: "produces", target: { output: "assessment_result" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-pilot-art-result-correction.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-pilot-art-result-correction-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition",
    id: "seed-pilot-art-result-correction-required",
    version: 1,
    description: "The focused regression requires one unsuitable pilot result.",
    phases: ["phase-3-component-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("seeded-pilot-implementations@1", {})',
    status_rules: [{
      status: "ready",
      priority: 20_000,
      when: 'none("seeded-pilot-implementations@1", {})',
      reason: "Publish the focused pilot evidence.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-pilot-art-result-correction@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const seeded = {
    kind: "selector-definition",
    id: "seeded-pilot-implementations",
    version: 1,
    description: "The exact VAI published by the focused setup.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["VAI"] },
      as: "implementation",
      where: 'implementation.provenance.scenario == "seed-pilot-art-result-correction@1"',
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  for (const [relative, value] of [
    ["scenarios/seed-pilot-art-result-correction.yaml", seedScenario],
    ["obligations/seed-pilot-art-result-correction-required.yaml", seedObligation],
    ["selectors/seeded-pilot-implementations.yaml", seeded],
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(root, relative), stringify(value));
  }
  await fs.writeFile(
    path.join(root, "prompts/seed-pilot-art-result-correction.md"),
    "---\nid: seed-pilot-art-result-correction\nversion: 1\nscenario: seed-pilot-art-result-correction\n---\n\n# Seed pilot evidence\n",
  );
  return root;
}

function commit(repository: string): void {
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"], {
    encoding: "utf8",
  }).status).toBe(0);
  const result = spawnSync("git", [
    "-C", repository,
    "-c", "user.name=MDLM Test",
    "-c", "user.email=mdlm-test@localhost",
    "-c", "commit.gpgSign=false",
    "commit", "--quiet", "--no-verify", "-m", "Publish focused pilot evidence",
  ], { encoding: "utf8" });
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

function packet(repository: string, scenario: string): Json {
  let next = mdlm(repository, "next", "--json");
  expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
  let outcome = JSON.parse(next.stdout);
  if (outcome.outcome === "publication-required") {
    commit(repository);
    next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    outcome = JSON.parse(next.stdout);
  }
  expect(outcome.phase).toBe("phase-3-component-definition@2");
  expect(outcome.assignment, JSON.stringify(outcome, null, 2)).toBeDefined();
  expect(outcome.assignment.packet.scenario.reference, JSON.stringify(outcome, null, 2))
    .toBe(scenario);
  return outcome.assignment.packet;
}

function submit(repository: string, packet: Json): ReturnType<typeof mdlmWithInput> {
  return mdlmWithInput(
    repository,
    `${JSON.stringify(packet.responseScaffold)}\n`,
    "scenario", "submit", "-", "--json",
  );
}

function fill(response: Json, payloads: Record<string, Json>): void {
  for (const output of response.proposal.outputs) {
    if (payloads[output.handle]) {
      output.payload = payloads[output.handle];
      output.body = `# ${output.handle}\n`;
    }
  }
  response.proposal.completionEvidence = { summary: "Focused public correction." };
}

it("routes assessed and unsuitable pilots without replay", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-art-correction-"));
  roots.push(parent);
  const repository = path.join(parent, "repository");
  const processRoot = await focusedPackage(parent);
  await fs.mkdir(repository);
  await selectProcessPackageFixture(repository, processRoot);

  const seed = packet(repository, "seed-pilot-art-result-correction@1");
  const seedResponse = structuredClone(seed.responseScaffold);
  const ref = (output: string) => ({ output });
  const independence = {
    boundary: "black-box",
    prohibited_inputs: [
      "product source code",
      "product unit tests",
      "private implementation details",
      "uncontrolled implementation shortcuts",
    ],
  };
  const capabilities = {
    controllability: ["arguments"], observability: ["exit status"],
    external_services: [], timing: "bounded",
  };
  const prototypeControls = (activityRef: unknown) => ({
    activity_ref: activityRef,
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
      fault: "The bad control exits one.",
    },
  });
  const prototypeBindings = (activityRef: unknown) => ({
    activity_ref: activityRef,
    known_good: {
      argv: ["node", "-e", "process.exit(0)"],
      expected_verification_outcome: "pass",
    },
    known_bad: {
      argv: ["node", "-e", "process.exit(1)"],
      expected_verification_outcome: "fail",
    },
  });
  fill(seedResponse, {
    product: {
      title: "Focused pilot product", rationale: "Bound one public behavior.",
      problem: "One exact target may need correction.", users: ["operator"],
      goals: ["Exercise one pilot target."], non_goals: [],
      success_measures: ["The good case exits zero."],
    },
    requirement: {
      title: "Bounded pilot behavior", rationale: "Exercise one public behavior.",
      statement: "The product shall pass the known-good case.",
      verification_intent: "Run one good and one bad case.", stakeholder: "operator",
      priority: "must", system_context: "focused-regression",
    },
    strategy: {
      title: "Pilot strategy", rationale: "Use black-box evidence.", level: "stakeholder",
      permitted_methods: ["test"], independence,
      evidence_policy: "Retain exact observations.", assessment_policy: "Compare both cases.",
      environment_profile: { id: "bounded-cli", purpose: "Run the pilot.", capabilities },
    },
    environment: {
      title: "Pilot environment", rationale: "Run a bounded command.",
      strategy_revision: ref("strategy"), profile_id: "bounded-cli", capabilities,
      reproducibility: {
        environment_ref: "node:24", configuration_digest: `sha256:${"a".repeat(64)}`,
        reconstruction: "Use the exact runtime.",
      },
    },
    activity: {
      title: "Pilot activity", rationale: "Discriminate the behavior.", kind: "pilot",
      method: "test", assessment_mode: "witnessed",
      claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false },
      acceptance_criteria: ["The good case passes."],
      evidence_requirements: ["Exact exit status."],
      expected_success_activity: "Run the good case.",
      expected_discrimination_activity: "Run the bad case.",
    },
    target: {
      title: "Original prototype", kind: "prototype",
      supported_behavior: ["The good case exits zero."],
      unsupported_behavior: ["The bad case does not exit zero."],
      prototype_controls: prototypeControls(ref("activity")),
    },
    implementation: {
      title: "Pilot procedure", rationale: "Run the exact activity.", kind: "pilot",
      implementation_ref: `procedure:sha256:${"c".repeat(64)}`,
      independence_mode: "source-blind", authoring_input_refs: [ref("activity")],
      prohibited_inputs_observed: independence.prohibited_inputs,
      activity_bindings: ["known-good", "known-bad"],
      prototype_control_bindings: prototypeBindings(ref("activity")),
      target_behavior: {
        supported: ["The good case exits zero."],
        intentionally_unsupported: ["The bad case does not exit zero."],
      },
      execution_procedure: {
        deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 },
        deadline_scope: "infrastructure-safety-only",
        timeout: {
          termination: "process-group-sigterm-then-sigkill", force_after_ms: 100,
          reaping: "all-descendants", capture_partial_raw_observation: true,
        },
        cleanup: "guaranteed", aggregation: "continue-through-all-cases",
      },
    },
    authorization: {
      title: "Authorize pilot", rationale: "Permit only the exact procedure.",
      kind: "decision", decision: "Authorize.", alternatives: ["Stop."],
      effective_scope: ref("implementation"),
    },
    result: {
      title: "Unsuitable pilot result",
      claim: {
        kind: "pilot", scope: "verification-design", outcome: "unsuitable",
        formal_evidence_eligible: false,
      },
      assessment_state: "accepted",
      observations: {
        expected_success_observed: false, expected_discrimination_observed: true,
        details: "The exact prototype target caused the good case to fail.",
      },
      evidence_refs: ["observation:good-exit-1"], assessor_ref: "focused-runner",
    },
    run: {
      title: "Completed unsuitable pilot", kind: "pilot",
      started_at: "2026-08-31T08:00:00.000Z",
      completed_at: "2026-08-31T08:00:01.000Z", execution_state: "completed",
      execution_target: { kind: "prototype", ref: ref("target") },
      runner_ref: "focused-runner", configuration_refs: [ref("environment")],
      activities_expected: ["known-good", "known-bad"],
      activities_invoked: ["known-good", "known-bad"],
      evidence_locations: ["observation:good-exit-1"],
    },
    assessment_result: {
      title: "Suitable pilot awaiting assessment",
      claim: {
        kind: "pilot", scope: "verification-design", outcome: "suitable",
        formal_evidence_eligible: false,
      },
      assessment_state: "assessment-required",
      observations: {
        expected_success_observed: true, expected_discrimination_observed: true,
        details: "Both exact controls discriminated the verification design.",
      },
      control_judgments: {
        known_good: { observation_ref: "known_good", outcome: "pass" },
        known_bad: { observation_ref: "known_bad", outcome: "fail" },
      },
      evidence_refs: ["observation:good-exit-0", "observation:bad-exit-1"],
      assessor_ref: "focused-runner",
    },
    assessment_run: {
      title: "Completed suitable pilot", kind: "pilot",
      started_at: "2026-08-31T08:01:00.000Z",
      completed_at: "2026-08-31T08:01:01.000Z", execution_state: "completed",
      execution_target: { kind: "prototype", ref: ref("target") },
      runner_ref: "focused-runner", configuration_refs: [ref("environment")],
      activities_expected: ["known-good", "known-bad"],
      activities_invoked: ["known-good", "known-bad"],
      evidence_locations: ["observation:good-exit-0", "observation:bad-exit-1"],
    },
  });
  const seeded = submit(repository, { responseScaffold: seedResponse });
  expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
  commit(repository);
  const unfavorableRun = seeded.stdout.match(/RUN-[A-Z0-9]+-r00001/)?.[0];
  const unfavorableResult = seeded.stdout.match(/RES-[A-Z0-9]+-r00001/)?.[0];
  expect(unfavorableRun).toBeDefined();
  expect(unfavorableResult).toBeDefined();
  const evidenceHead = spawnSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();

  const pending = mdlm(repository, "loose-ends", "--json");
  expect(JSON.parse(pending.stdout).looseEnds.items.some(
    (item: Json) => item.obligation === "pilot-result-assessment-required",
  ), pending.stdout).toBe(true);
  const assessment = packet(repository, "review-phase-1-assurance@1");
  const assessmentInputs = assessment.exactInputs[0].inputs;
  const assessedResult = seeded.stdout.match(/RES-[A-Z0-9]+-r00001/g)?.[1];
  expect(assessmentInputs.find((input: Json) => input.name === "subject")
    .values[0].identity.revision_id).toBe(assessedResult);
  expect(assessmentInputs.find((input: Json) => input.name === "review_context_members")
    .values.map((value: Json) => value.identity.type)).toEqual(
      expect.arrayContaining(["RUN", "VAI", "VER", "ENV", "ART"]),
    );
  const assessmentResponse = structuredClone(assessment.responseScaffold);
  fill(assessmentResponse, {
    context: {
      title: "Pilot result review context", kind: "review-context",
      role: "review-context", scope: assessedResult, group: "DEFAULT",
      definition_members: assessmentInputs.find(
        (input: Json) => input.name === "review_context_members",
      ).values.map((value: Json) => value.identity.revision_id),
      evidence: [],
    },
    review: {
      title: "Passing pilot result assessment", review_kind: "phase-1-assurance",
      outcome: "pass", reviewer: "independent-reviewer",
      summary: "The exact good and bad controls discriminate correctly.", findings: [],
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
    },
  });
  const assessed = submit(repository, { responseScaffold: assessmentResponse });
  expect(assessed.status, `${assessed.stderr}${assessed.stdout}`).toBe(0);
  commit(repository);

  const correction = packet(
    repository,
    "revise-pilot-vai-and-target-after-result@1",
  );
  const response = structuredClone(correction.responseScaffold);
  const inputRevision = (name: string) => correction.exactInputs[0].inputs.find(
    (input: Json) => input.name === name,
  ).values[0].identity.revision_id;
  expect(inputRevision("failed_results")).toBe(unfavorableResult);
  const targetHandle = response.proposal.outputs.some(
    (output: Json) => output.handle === "replacement_with_target",
  ) ? "replacement_with_target" : "replacement";
  fill(response, {
    replacement_target: {
      title: "Corrected prototype", kind: "prototype",
      supported_behavior: ["The good case exits zero."],
      unsupported_behavior: ["The bad case does not exit zero."],
      prototype_controls: prototypeControls(inputRevision("activity")),
    },
    [targetHandle]: {
      title: "Corrected pilot procedure", rationale: "Use the corrected target.", kind: "pilot",
      implementation_ref: `procedure:sha256:${"e".repeat(64)}`,
      independence_mode: "source-blind",
      authoring_input_refs: [inputRevision("activity")],
      prohibited_inputs_observed: independence.prohibited_inputs,
      activity_bindings: ["known-good", "known-bad"],
      prototype_control_bindings: prototypeBindings(inputRevision("activity")),
      target_behavior: {
        supported: ["The good case exits zero."],
        intentionally_unsupported: ["The bad case does not exit zero."],
      },
      execution_procedure: {
        deadlines_ms: { checkout: 1000, environment_check: 1000, product_case: 1000 },
        deadline_scope: "infrastructure-safety-only",
        timeout: {
          termination: "process-group-sigterm-then-sigkill", force_after_ms: 100,
          reaping: "all-descendants", capture_partial_raw_observation: true,
        },
        cleanup: "guaranteed", aggregation: "continue-through-all-cases",
      },
    },
    authorization: {
      title: "Authorize correction", rationale: "Correct only the target-causal failure.",
      kind: "decision", decision: "Authorize.", alternatives: ["Stop."],
      effective_scope: ref(targetHandle),
    },
  });
  if (targetHandle === "replacement") {
    const replacement = response.proposal.outputs.find(
      (output: Json) => output.handle === "replacement",
    );
    replacement.links.push(
      { type: "uses", target: { input: "environment" } },
      { type: "targets", target: { output: "replacement_target" } },
    );
  }
  const corrected = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    "scenario", "submit", "-", "--json",
  );
  expect(corrected.status, `${corrected.stderr}${corrected.stdout}`).toBe(0);
  const receipt = JSON.parse(corrected.stdout).receipt;
  expect(receipt.publications.map((item: Json) => item.handle)).toEqual(
    expect.arrayContaining(["replacement_target", targetHandle, "authorization"]),
  );
  const publishedTarget = receipt.publications.find(
    (item: Json) => item.handle === "replacement_target",
  );
  const publishedImplementation = receipt.publications.find(
    (item: Json) => item.handle === targetHandle,
  );
  expect(publishedTarget.stableId).toBe(
    correction.exactInputs[0].inputs.find(
      (input: Json) => input.name === "execution_target",
    ).values[0].identity.id,
  );
  expect(publishedImplementation.stableId).toBe(
    correction.exactInputs[0].inputs.find(
      (input: Json) => input.name === "implementation",
    ).values[0].identity.id,
  );
  expect(publishedTarget.revisionId).toMatch(/-r00002$/);
  expect(publishedImplementation.revisionId).toMatch(/-r00002$/);
  commit(repository);
  const correctionChanges = spawnSync(
    "git",
    ["-C", repository, "diff", "--name-only", `${evidenceHead}..HEAD`],
    { encoding: "utf8" },
  ).stdout.trim().split("\n");
  expect(correctionChanges.some((file) =>
    file.includes(".lifecycle/data/RUN/")
    || file.includes(".lifecycle/data/RES/"),
  )).toBe(false);
}, 45_000);
