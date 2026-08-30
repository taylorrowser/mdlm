import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import {
  mdlm,
  mdlmWithInput,
  selectProcessPackageFixture,
} from "./helpers/mdlm.js";

type JsonObject = Record<string, any>;
type Subject = "strategy" | "environment" | "activity" | "implementation";

const cases: Array<{
  subject: Subject;
  obligation: string;
  scenario: string;
}> = [
  {
    subject: "strategy",
    obligation: "verification-strategy-review-correction-required",
    scenario: "revise-verification-strategy-after-review@2",
  },
  {
    subject: "environment",
    obligation: "environment-review-correction-required",
    scenario: "revise-environment-assurance-after-review@2",
  },
  {
    subject: "activity",
    obligation: "pilot-verification-activity-review-correction-required",
    scenario: "revise-pilot-verification-activity-after-review@3",
  },
  {
    subject: "implementation",
    obligation: "pilot-vai-review-correction-required",
    scenario: "revise-pilot-vai-after-review@3",
  },
];

function commit(repository: string, message: string): void {
  const added = spawnSync("git", ["-C", repository, "add", ".lifecycle"], {
    encoding: "utf8",
  });
  expect(added.status, added.stderr).toBe(0);
  const committed = spawnSync("git", [
    "-C",
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
  ], { encoding: "utf8" });
  expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
}

async function focusedPackage(parent: string, subject: Subject): Promise<string> {
  const root = path.join(parent, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), root, {
    recursive: true,
  });

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
  for (const phaseId of [
    "phase-0-wayfinding",
    "phase-1-product-assurance",
    "phase-2-pilot-assessment",
    "phase-7-change-control",
  ]) {
    const otherPath = path.join(root, `phases/${phaseId}.yaml`);
    const other = parse(await fs.readFile(otherPath, "utf8"));
    other.order += 10;
    await fs.writeFile(otherPath, stringify(other));
  }

  const target = cases.find((candidate) => candidate.subject === subject)!;
  const obligationPath = path.join(root, `obligations/${target.obligation}.yaml`);
  const obligation = parse(await fs.readFile(obligationPath, "utf8"));
  obligation.status_rules = obligation.status_rules.map(
    (rule: JsonObject) => ({ ...rule, priority: 10_000 }),
  );
  await fs.writeFile(obligationPath, stringify(obligation));

  const seedScenario = {
    kind: "scenario-definition",
    id: "seed-phase-2-assurance-correction",
    version: 1,
    description: "Publish one exact Phase 2 assurance chain and one failed Review.",
    phases: ["phase-2-system-definition"],
    inputs: [],
    outputs: [
      { name: "product", types: ["PSP"], cardinality: "one", required_links: [] },
      {
        name: "stakeholder_requirement",
        types: ["STK"],
        cardinality: "one",
        required_links: [{ link: "derived-from", target: { output: "product" } }],
      },
      {
        name: "requirement",
        types: ["SYS"],
        cardinality: "one",
        required_links: [{
          link: "derived-from",
          target: { output: "stakeholder_requirement" },
        }],
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
      { name: "review_context", types: ["BSL"], cardinality: "one", required_links: [] },
      {
        name: "review",
        types: ["REV"],
        cardinality: "one",
        required_links: [
          { link: "reviews", target: { output: subject } },
          { link: "contextualizes", target: { output: "review_context" } },
        ],
      },
    ],
    prompt_ref: "prompts/seed-phase-2-assurance-correction.md@1",
    review_policy_ref: "review-applicability@1",
    completion: "execution.integrity.contract_valid == true",
    resolves: ["seed-phase-2-assurance-correction-required"],
    prohibited_inputs: [],
    batching: "single",
  };
  const seedObligation = {
    kind: "obligation-definition",
    id: "seed-phase-2-assurance-correction-required",
    version: 1,
    description: "The regression requires one exact failed Phase 2 assurance Review.",
    phases: ["phase-2-system-definition"],
    for_each: "[phase]",
    subject_as: "required_phase",
    satisfied_when: 'exists("seeded-phase-2-assurance-reviews@1", {})',
    status_rules: [{
      status: "ready",
      priority: 20_000,
      when: 'none("seeded-phase-2-assurance-reviews@1", {})',
      reason: "Publish the exact focused assurance chain.",
    }],
    default_status: "blocked",
    resolve_with: { scenario: "seed-phase-2-assurance-correction@1", inputs: {} },
    waiver_policy_ref: "waiver-applicability@1",
  };
  const seededReviews = {
    kind: "selector-definition",
    id: "seeded-phase-2-assurance-reviews",
    version: 1,
    description: "The exact failed Review published by focused setup.",
    parameters: [],
    result_kind: "revision",
    query: {
      from: { collection: "revisions", types: ["REV"] },
      as: "review",
      where: 'review.provenance.scenario == "seed-phase-2-assurance-correction@1"',
      distinct: true,
      order_by: ["identity.revision_id"],
    },
  };
  for (const [relative, value] of [
    ["scenarios/seed-phase-2-assurance-correction.yaml", seedScenario],
    ["obligations/seed-phase-2-assurance-correction-required.yaml", seedObligation],
    ["selectors/seeded-phase-2-assurance-reviews.yaml", seededReviews],
  ] as [string, unknown][]) {
    await fs.writeFile(path.join(root, relative), stringify(value));
  }
  await fs.writeFile(
    path.join(root, "prompts/seed-phase-2-assurance-correction.md"),
    "---\nid: seed-phase-2-assurance-correction\nversion: 1\nscenario: seed-phase-2-assurance-correction\n---\n\n# Seed the focused assurance chain\n",
  );
  return root;
}

function nextPacket(repository: string, scenario: string): JsonObject {
  const next = mdlm(repository, "next", "--json");
  expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
  const outcome = JSON.parse(next.stdout);
  expect(outcome.assignment, next.stdout).toBeDefined();
  expect(outcome.assignment.packet.scenario.reference).toBe(scenario);
  return outcome.assignment.packet;
}

function submitSeed(
  repository: string,
  packet: JsonObject,
  subject: Subject,
): JsonObject {
  const response = structuredClone(packet.responseScaffold);
  const subjectReference = `$proposal.${subject}.revision_id`;
  const payloads: Record<string, JsonObject> = {
    product: {
      title: "Focused assurance product",
      rationale: "Bound one exact system pilot correction route.",
      problem: "One observable behavior needs exact correction evidence.",
      users: ["operator"],
      goals: ["Observe one exact result"],
      non_goals: ["Choose implementation details"],
      success_measures: ["The result is exact"],
    },
    stakeholder_requirement: {
      title: "Report one exact result",
      rationale: "Expose one operator-visible behavior.",
      statement: "The product shall report one exact result.",
      verification_intent: "Observe the exact result.",
      stakeholder: "operator",
      priority: "must",
      system_context: "product",
    },
    requirement: {
      title: "Report one system result",
      rationale: "Allocate the exact observable behavior.",
      statement: "The system shall report one exact result.",
      verification_intent: "Observe the exact system result.",
    },
    strategy: {
      title: "System black-box strategy",
      rationale: "Preserve one exact observable boundary.",
      level: "system",
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
      evidence_policy: "Retain exact output and exit status.",
      assessment_policy: "Compare each result to the exact requirement.",
      environment_profile: {
        id: "focused-cli",
        purpose: "Exercise one exact assurance correction route.",
        capabilities: {
          controllability: ["literal argv"],
          observability: ["stdout", "exit status"],
          external_services: [],
          timing: "bounded",
        },
      },
    },
    environment: {
      title: "Focused command environment",
      rationale: "Realize the exact system strategy profile.",
      strategy_revision: "$proposal.strategy.revision_id",
      profile_id: "focused-cli",
      capabilities: {
        controllability: ["literal argv"],
        observability: ["stdout", "exit status"],
        external_services: [],
        timing: "bounded",
      },
      reproducibility: {
        environment_ref: "focused-local-command",
        configuration_digest: `sha256:${"4".repeat(64)}`,
        reconstruction: "Use the exact local command environment.",
      },
    },
    activity: {
      title: "Focused system pilot activity",
      rationale: "Distinguish the exact supported and unsupported cases.",
      kind: "pilot",
      method: "test",
      assessment_mode: "automatic",
      claim: {
        kind: "pilot",
        scope: "verification-design",
        formal_evidence_eligible: false,
      },
      acceptance_criteria: ["The supported case passes and the bad case fails."],
      evidence_requirements: ["Record exact stdout and exit status."],
      expected_success_activity: "Run the known-good control.",
      expected_discrimination_activity: "Run the known-bad control.",
    },
    target: {
      title: "Disposable focused controls",
      kind: "prototype",
      supported_behavior: ["Run the known-good control."],
      unsupported_behavior: ["Run the known-bad control."],
      prototype_controls: {
        activity_ref: "$proposal.activity.revision_id",
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
          argv: ["node", "-e", "process.exit(2)"],
          expected_observation: {
            exit_status: 2,
            stdout: { encoding: "base64", bytes: "" },
            stderr: { encoding: "base64", bytes: "" },
          },
          expected_verification_outcome: "fail",
          fault: "The bad control exits nonzero.",
        },
      },
    },
    implementation: {
      title: "Focused source-blind pilot procedure",
      rationale: "Bind the two exact controls without product source.",
      kind: "pilot",
      implementation_ref: `procedure:sha256:${"5".repeat(64)}`,
      independence_mode: "source-blind",
      authoring_input_refs: ["$proposal.activity.revision_id"],
      prohibited_inputs_observed: [
        "product source code",
        "product unit tests",
        "private implementation details",
        "uncontrolled implementation shortcuts",
      ],
      activity_bindings: ["known_good", "known_bad"],
      target_behavior: {
        supported: ["Run the known-good control."],
        intentionally_unsupported: ["Run the known-bad control."],
      },
      prototype_control_bindings: {
        activity_ref: "$proposal.activity.revision_id",
        known_good: {
          argv: ["node", "-e", "process.exit(0)"],
          expected_verification_outcome: "pass",
        },
        known_bad: {
          argv: ["node", "-e", "process.exit(2)"],
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
    review_context: {
      title: "Exact failed assurance context",
      kind: "review-context",
      role: "review-context",
      scope: subjectReference,
      group: "DEFAULT",
      definition_members: [],
      evidence: [],
    },
    review: {
      title: "Failed exact assurance Review",
      review_kind: "phase-1-assurance",
      reviewer: "independent-reviewer",
      summary: "The exact assurance claim is blocked.",
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
      findings: [{
        id: "F-001",
        target: subjectReference,
        relationship: "primary",
        severity: "blocking",
        summary: "Correct the exact assurance claim.",
        criterion: "The claim must match its exact system boundary.",
        evidence: "The current Revision does not match that boundary.",
        material_consequence: "The representative pilot cannot proceed.",
      }],
      correction_authority: "package-evidence",
      outcome: "fail",
    },
  };
  response.proposal.outputs = response.proposal.outputs.map((output: JsonObject) => ({
    ...output,
    payload: payloads[output.handle],
    body: `# ${output.handle}\n`,
  }));
  response.proposal.completionEvidence = { summary: "Publish the focused failed Review." };
  const submitted = mdlmWithInput(
    repository,
    `${JSON.stringify(response)}\n`,
    "scenario",
    "submit",
    "-",
    "--json",
  );
  expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
  return JSON.parse(submitted.stdout);
}

function input(packet: JsonObject, name: string): JsonObject[] {
  return packet.exactInputs[0].inputs.find(
    (candidate: JsonObject) => candidate.name === name,
  ).values;
}

function revisions(packet: JsonObject, name: string): string[] {
  return input(packet, name).map((value) => value.identity.revision_id);
}

export async function runPhaseTwoAssuranceCorrectionPublic(): Promise<void> {
  for (const testCase of cases) {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase2-assurance-correction-"));
    try {
      const repository = path.join(parent, "repository");
      await fs.mkdir(repository);
      await selectProcessPackageFixture(
        repository,
        await focusedPackage(parent, testCase.subject),
      );
      const seed = nextPacket(repository, "seed-phase-2-assurance-correction@1");
      const seeded = submitSeed(repository, seed, testCase.subject);
      commit(repository, `Seed failed ${testCase.subject} Review`);
      const byHandle = Object.fromEntries(
        seeded.receipt.publications.map((publication: JsonObject) => [
          publication.handle,
          publication.revisionId,
        ]),
      );

      const correction = nextPacket(repository, testCase.scenario);
      expect(revisions(correction, "failed_reviews")).toEqual([byHandle.review]);
      expect(input(correction, "failed_reviews")[0]!.data.links).toContainEqual({
        type: "contextualizes",
        target: byHandle.review_context,
      });
      if (testCase.subject === "strategy") {
        expect(revisions(correction, "strategy")).toEqual([byHandle.strategy]);
        expect(revisions(correction, "requirements")).toEqual([byHandle.requirement]);
      } else if (testCase.subject === "environment") {
        expect(revisions(correction, "environment")).toEqual([byHandle.environment]);
        expect(revisions(correction, "strategy")).toEqual([byHandle.strategy]);
      } else if (testCase.subject === "activity") {
        expect(revisions(correction, "activity")).toEqual([byHandle.activity]);
        expect(revisions(correction, "requirement")).toEqual([byHandle.requirement]);
        expect(revisions(correction, "strategy")).toEqual([byHandle.strategy]);
        expect(revisions(correction, "intent_support")).toEqual([]);
      } else {
        expect(revisions(correction, "implementation")).toEqual([byHandle.implementation]);
        expect(revisions(correction, "activity")).toEqual([byHandle.activity]);
        expect(revisions(correction, "environment")).toEqual([byHandle.environment]);
        expect(revisions(correction, "execution_target")).toEqual([byHandle.target]);
        expect(revisions(correction, "requirement")).toEqual([byHandle.requirement]);
        expect(revisions(correction, "strategy")).toEqual([byHandle.strategy]);
      }
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }
}
