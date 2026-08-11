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
    links: Array<{ type: string; target: string }>;
    body: string;
  };
};

function mdlm(repository: string, arguments_: string[], input?: string) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

const proposal = (
  localId: string,
  name: string,
  type: string,
  payload: Record<string, unknown>,
  links: Array<{ type: string; target: string }> = [],
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
    body: `Exact ${type} Phase 2 simplification fixture output.\n`,
  },
});

async function focusedPackage(root: string): Promise<string> {
  const packageRoot = path.join(root, "process");
  await fs.cp(processPackage, packageRoot, { recursive: true });

  await fs.writeFile(
    path.join(packageRoot, "scenarios/seed-phase-2-simplification-review.yaml"),
    `kind: scenario-definition
id: seed-phase-2-simplification-review
version: 1
description: Test-only explicit publication of one exact Phase 2 simplification Review.
initiation: explicit
phases: [phase-2-system-definition]
inputs:
  - {name: subject, types: [SYS, ASP, ICSP, DWP, BSL], cardinality: one, identity: revision}
  - {name: review_context, types: [BSL], cardinality: one, identity: revision}
outputs:
  - name: review
    types: [REV]
    cardinality: one
    required_links:
      - {link: reviews, target: {input: subject}}
      - {link: contextualizes, target: {input: review_context}}
prompt_ref: prompts/seed-phase-2-simplification-review.md@1
review_policy_ref: review-applicability@1
participation:
  policy_ref: contextual-review-participation@1
  arguments: {subject: subject, review_context: review_context}
authority_evidence: {output: review, type: REV}
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: single
`,
  );
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-phase-2-simplification-review.md"),
    `---\nid: seed-phase-2-simplification-review\nversion: 1\nscenario: seed-phase-2-simplification-review\n---\n\n# Seed one Phase 2 simplification Review fixture\n`,
  );

  const manifestPath = path.join(packageRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push("seed-phase-2-simplification-review");
  manifest.assets.prompts.push("prompts/seed-phase-2-simplification-review.md@1");
  await fs.writeFile(manifestPath, stringify(manifest));

  const retained = new Set([
    "phase-2-simplification-correction-required",
    "phase-2-definition-consistency-correction-required",
    "review-context-required",
    "passing-review-required",
    "decomposition-output-reviews-required",
    "phase-2-definition-context-required",
    "decomposition-simplification-required",
    "architecture-interface-simplification-required",
    "decomposition-completion-required",
  ]);
  const obligationsRoot = path.join(packageRoot, "obligations");
  for (const file of await fs.readdir(obligationsRoot)) {
    if (!file.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, file);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (retained.has(obligation.id)) continue;
    obligation.phases = obligation.phases.filter(
      (phase: string) => phase !== "phase-2-system-definition",
    );
    if (obligation.phases.length === 0) obligation.phases = ["phase-0-wayfinding"];
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const reviewPolicyPath = path.join(packageRoot, "policies/review-applicability.yaml");
  const reviewPolicy = parse(await fs.readFile(reviewPolicyPath, "utf8"));
  reviewPolicy.rules = [{
    priority: 500,
    when: `subject.identity.type in ["SYS", "ASP", "ICSP", "DWP"]
      && exists("cited-failing-reviews-by-correction@1", {replacement: subject})`,
    result: {
      required: true,
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    },
  }];
  await fs.writeFile(reviewPolicyPath, stringify(reviewPolicy));

  const phasePath = path.join(packageRoot, "phases/phase-2-system-definition.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.scenarios = [
    "seed-phase-2-simplification-review@1",
    "revise-phase-2-subject-after-simplification@1",
    "revise-phase-2-definition-set-after-simplification@1",
    "create-review-context@1",
    "review-datum-in-context@2",
    "create-phase-2-definition-context@1",
    "simplify-requirement-set@2",
    "simplify-architecture-and-interfaces@2",
    "complete-decomposition-work-package@2",
  ];
  phase.obligations = [
    "phase-2-simplification-correction-required@1",
    "phase-2-definition-consistency-correction-required@1",
    "review-context-required@2",
    "passing-review-required@2",
    "decomposition-output-reviews-required@1",
    "phase-2-definition-context-required@1",
    "decomposition-simplification-required@1",
    "architecture-interface-simplification-required@1",
    "decomposition-completion-required@1",
  ];
  phase.progression = null;
  phase.gate.required = false;
  await fs.writeFile(phasePath, stringify(phase));

  const phase0Path = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase0 = parse(await fs.readFile(phase0Path, "utf8"));
  phase0.order = 100;
  await fs.writeFile(phase0Path, stringify(phase0));
  return packageRoot;
}

describe("Phase 2 earliest simplification through the public operator seam", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase-2-simplification-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const packageRoot = await focusedPackage(parent);
    const initialized = req(repository, "--json", "init", "--process", packageRoot);
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  const create = (
    type: string,
    scenario: string,
    payload: Record<string, unknown>,
    links: Array<{ type: string; target: string }> = [],
    id?: string,
  ): Created => {
    const arguments_ = ["new", type, "--scenario", scenario];
    if (id) arguments_.push("--id", id);
    for (const [name, value] of Object.entries(payload)) {
      arguments_.push(
        "--set",
        `${name}=${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
    }
    for (const link of links) arguments_.push("--link", `${link.type}=${link.target}`);
    arguments_.push("--body", `Fixture ${type} Lifecycle Datum.`, "--json");
    const created = req(repository, ...arguments_);
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    return JSON.parse(created.stdout).created;
  };

  const freezeContext = (members: Created[], scope: string): Created => {
    const created = req(
      repository,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      `title=Definition context for ${scope}`,
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${scope}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    const context = JSON.parse(created.stdout).created as Created;
    for (const member of members) {
      const added = req(repository, "baseline", "add", context.id, member.revisionId, "--json");
      expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
    }
    const frozen = req(repository, "baseline", "freeze", context.id, "--json");
    expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
    return context;
  };

  const seedPassingReview = async (subject: Created, context: Created): Promise<Created> => {
    const adapterPath = path.join(parent, `passing-review-${subject.id}.mjs`);
    const response = {
      outputs: [{
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: `Passing Review of ${subject.revisionId}`,
            review_kind: "contextual",
            rubric_ref: "policies/rubrics/bootstrap-review.md@1",
            findings: [],
            outcome: "pass",
          },
          links: [
            { type: "reviews", target: subject.revisionId },
            { type: "contextualizes", target: context.revisionId },
          ],
          body: "The exact initial definition member is acceptable.\n",
        },
      }],
      completionEvidence: { summary: "The initial definition member passed Review." },
    };
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    const published = req(
      repository,
      "scenario",
      "execute",
      "seed-phase-2-simplification-review@1",
      "--initiate",
      "--input",
      `subject=${subject.revisionId}`,
      "--input",
      `review_context=${context.revisionId}`,
      "--authorize",
      "independent-reviewer",
      "--adapter",
      adapterPath,
      "--json",
    );
    expect(published.status, `${published.stderr}${published.stdout}`).toBe(0);
    return JSON.parse(published.stdout).execution.outputs[0].lifecycleDatum;
  };

  const seedWrongContextFailure = async (
    plan: Created,
    wrongContext: Created,
    members: Created[],
  ) => {
    const adapterPath = path.join(parent, "wrong-context-review.mjs");
    const response = {
      outputs: [{
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: "Wrong-context simplification failure",
            review_kind: "simplification-architecture-interfaces",
            decomposition_plan_revision: plan.revisionId,
            rubric_ref: "policies/rubrics/bootstrap-review.md@1",
            definition_simplification: {
              primary_target: members[0]!.revisionId,
              correction_set: "definition-consistency",
              primary_findings: [{
                id: "F-900",
                severity: "blocking",
                summary: "This judgment did not receive the complete current context.",
              }],
            },
            outcome: "fail",
          },
          links: [
            { type: "reviews", target: wrongContext.revisionId },
            { type: "contextualizes", target: wrongContext.revisionId },
            ...members.map((member) => ({ type: "blocks", target: member.revisionId })),
          ],
          body: "This fixture must not route current correction.\n",
        },
      }],
      completionEvidence: { summary: "Published wrong-context historical evidence." },
    };
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    const published = req(
      repository,
      "scenario",
      "execute",
      "seed-phase-2-simplification-review@1",
      "--initiate",
      "--input",
      `subject=${wrongContext.revisionId}`,
      "--input",
      `review_context=${wrongContext.revisionId}`,
      "--authorize",
      "independent-reviewer",
      "--adapter",
      adapterPath,
      "--json",
    );
    expect(published.status, `${published.stderr}${published.stdout}`).toBe(0);
  };

  const commit = (message: string) => {
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
  };

  const next = () => {
    const outcome = mdlm(repository, ["next"]);
    expect(outcome.status, `${outcome.stderr}${outcome.stdout}`).toBe(0);
    return JSON.parse(outcome.stdout);
  };

  const prepare = (outcome: Record<string, any>): Packet => {
    const prepared = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]);
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    return JSON.parse(prepared.stdout);
  };

  const submitResult = (
    packet: Packet,
    outputs: ProposalOutput[],
    authoritySupplies: string[] = [],
  ) => mdlm(
    repository,
    ["scenario", "submit"],
    `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment: packet.assignment.id,
      kind: "proposal",
      proposal: {
        outputs,
        completionEvidence: { summary: "The exact Phase 2 work is complete." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies,
        standingDelegations: [],
      },
    })}\n`,
  );

  const submit = (
    packet: Packet,
    outputs: ProposalOutput[],
    authoritySupplies: string[] = [],
  ) => {
    const submitted = submitResult(packet, outputs, authoritySupplies);
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const execution = JSON.parse(submitted.stdout).execution;
    commit(`Publish ${packet.scenario.reference}`);
    return execution;
  };

  const inputValues = (packet: Packet, name: string) => packet.exactInputs[0].inputs.find(
    (input: { name: string }) => input.name === name,
  ).values;

  it("serializes subject findings, corrects a coherent set, reduces scope, and resumes after fresh evidence", async () => {
    const product = create("PSP", "compile-psp@2", {
      title: "Report export fixture",
      rationale: "Bound one exact Phase 2 simplification journey.",
      problem: "Duplicate export boundaries multiply downstream work.",
      users: ["report author"],
      goals: ["one report export"],
      non_goals: ["general integration platform"],
      success_measures: ["one minimal controlled boundary"],
    });
    const parentRequirement = create("STK", "draft-stakeholder-requirements@2", {
      title: "Export one completed report",
      rationale: "Report authors need one portable result.",
      statement: "The product shall export one completed report.",
      verification_intent: "Observe one exact public export.",
      stakeholder: "report author",
      priority: "must",
    }, [{ type: "derived-from", target: product.id }]);
    const strategy = create("VSP", "define-verification-strategy@1", {
      title: "System export strategy",
      rationale: "The public boundary requires black-box evidence.",
      level: "system",
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
      evidence_policy: "Retain exact public observations.",
      assessment_policy: "Require success and malformed rejection.",
      environment_profile: {
        id: "system-boundary",
        purpose: "Exercise report export.",
        capabilities: {
          controllability: ["report fixture"],
          observability: ["response"],
          external_services: [],
          timing: "bounded",
        },
      },
    }, [
      { type: "governs", target: parentRequirement.id },
      { type: "governs-revision", target: parentRequirement.revisionId },
    ]);
    const architecture = create("ASP", "define-system-architecture@2", {
      title: "Duplicated report architecture",
      rationale: "Fixture architecture awaiting simplification.",
      level: "system",
      elements: [{
        id: "AEL-0REPRTCR00",
        alias: "REPORT_CORE",
        title: "Report core",
        responsibilities: ["prepare export"],
      }, {
        id: "AEL-0EXPRTAP00",
        alias: "EXPORT_API",
        title: "Export API",
        responsibilities: ["relay export"],
      }],
      interactions: ["Report core relays through Export API"],
      constraints: [],
      nominated_risks: ["duplicate responsibility"],
    }, [{ type: "governs", target: parentRequirement.revisionId }], "ASP-0REPRTARCH");
    const interfaceSpec = create("ICSP", "define-interface-control-specification@2", {
      title: "Duplicated report boundary",
      rationale: "Fixture interface awaiting simplification.",
      architecture_revision: architecture.revisionId,
      boundary: { from_element: "AEL-0REPRTCR00", to_element: "AEL-0EXPRTAP00" },
      operations: ["POST /exports"],
      schemas: ["report@1"],
      units: [],
      timing: [],
      errors: ["invalid-report"],
      security: [],
      ordering: [],
      compatibility: ["v1"],
      interface_version: "1.0.0",
    }, [{ type: "defines-interface-for", target: architecture.revisionId }], "ICSP-0REPRT1CSP");
    const plan = create("DWP", "define-decomposition-work-package@2", {
      title: "Decompose report export",
      rationale: "Bound exact system outputs.",
      stage: "planning",
      parent_revisions: [parentRequirement.revisionId],
      architecture_context: { revision: architecture.revisionId, element: "AEL-0EXPRTAP00" },
      target_child_type: "SYS",
      behavioral_slice: "Report export and duplicate relay behavior",
      expected_coverage: ["export", "relay"],
      exclusions: [],
      interface_context: [interfaceSpec.revisionId],
      verification_strategy_revision: strategy.revisionId,
      dependencies: [],
      required_review_policy: "review-applicability@1",
    }, [
      { type: "decomposes", target: parentRequirement.revisionId },
      { type: "allocated-to", target: architecture.revisionId },
      { type: "governed-by", target: interfaceSpec.revisionId },
    ], "DWP-0REPRTPMN0");
    const systemOne = create("SYS", "execute-decomposition-work-package@2", {
      title: "Export completed report",
      rationale: "Express the necessary public behavior.",
      statement: "The system shall export one completed report.",
      verification_intent: "Observe one exact export.",
      architecture_allocation: {
        architecture_revision: architecture.revisionId,
        element: "AEL-0EXPRTAP00",
      },
      interface_context: [interfaceSpec.revisionId],
    }, [
      { type: "derived-from", target: parentRequirement.id },
      { type: "decomposes", target: plan.revisionId },
      { type: "allocated-to", target: architecture.revisionId },
      { type: "governed-by", target: interfaceSpec.revisionId },
    ], "SYS-0EXPRTREQ0");
    const removedSystem = create("SYS", "execute-decomposition-work-package@2", {
      title: "Relay completed report",
      rationale: "Duplicate behavior challenged by simplification.",
      statement: "The system shall relay a completed report between internal elements.",
      verification_intent: "Observe the duplicate relay.",
      architecture_allocation: {
        architecture_revision: architecture.revisionId,
        element: "AEL-0REPRTCR00",
      },
      interface_context: [interfaceSpec.revisionId],
    }, [
      { type: "derived-from", target: parentRequirement.id },
      { type: "decomposes", target: plan.revisionId },
      { type: "allocated-to", target: architecture.revisionId },
      { type: "governed-by", target: interfaceSpec.revisionId },
    ], "SYS-0RELAYREQ00");
    const exactSet = [architecture, interfaceSpec, plan, systemOne, removedSystem];
    const context = freezeContext(exactSet, plan.revisionId);
    for (const member of exactSet) await seedPassingReview(member, context);
    const wrongContext = freezeContext([systemOne], plan.revisionId);
    await seedWrongContextFailure(plan, wrongContext, exactSet);

    expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status)
      .toBe(0);
    commit("Initialize exact Phase 2 simplification fixture");

    let outcome = next();
    expect(outcome.outcome).toBe("assignment");
    let packet = prepare(outcome);
    expect([
      "simplify-requirement-set@2",
      "simplify-architecture-and-interfaces@2",
    ]).toContain(packet.scenario.reference);
    const subjectReviewKind = packet.scenario.reference === "simplify-requirement-set@2"
      ? "simplification-requirements"
      : "simplification-architecture-interfaces";
    const subjectFailurePayload = {
      title: "Failed subject-bounded Phase 2 simplification",
      review_kind: subjectReviewKind,
      decomposition_plan_revision: plan.revisionId,
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      definition_simplification: {
        primary_target: systemOne.revisionId,
        correction_set: "subject",
        primary_findings: [{
          id: "F-001",
          severity: "blocking",
          summary: "The export behavior is broader than the accepted intent.",
        }, {
          id: "F-002",
          severity: "blocking",
          summary: "The verification intent preserves unnecessary variants.",
        }],
      },
      outcome: "fail",
    };
    let reviewContext = inputValues(packet, "subject_context")[0].identity.revision_id;
    const crossSubject = submitResult(packet, [proposal(
      "cross-subject-simplification",
      "review",
      "REV",
      subjectFailurePayload,
      [
        { type: "reviews", target: reviewContext },
        { type: "contextualizes", target: reviewContext },
        { type: "blocks", target: systemOne.revisionId },
        { type: "blocks", target: removedSystem.revisionId },
      ],
    )], ["independent-reviewer"]);
    expect(crossSubject.status, `${crossSubject.stderr}${crossSubject.stdout}`).toBe(1);

    const subjectFailure = submit(packet, [proposal(
      "subject-simplification",
      "review",
      "REV",
      subjectFailurePayload,
      [
        { type: "reviews", target: reviewContext },
        { type: "contextualizes", target: reviewContext },
        { type: "blocks", target: systemOne.revisionId },
      ],
    )], ["independent-reviewer"]);
    const subjectFailedReview = subjectFailure.outputs[0].lifecycleDatum as Created;

    outcome = next();
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("revise-phase-2-subject-after-simplification@1");
    const subjectCorrection = submit(packet, [proposal(
      "subject-replacement",
      "replacement",
      "SYS",
      {
        title: "Export one completed report",
        rationale: "One bounded behavior addresses both findings together.",
        statement: "The system shall export one completed report.",
        verification_intent: "Observe one successful export and malformed rejection.",
        architecture_allocation: {
          architecture_revision: architecture.revisionId,
          element: "AEL-0EXPRTAP00",
        },
        interface_context: [interfaceSpec.revisionId],
      },
      [
        { type: "derived-from", target: parentRequirement.id },
        { type: "decomposes", target: plan.revisionId },
        { type: "allocated-to", target: architecture.revisionId },
        { type: "governed-by", target: interfaceSpec.revisionId },
        { type: "corrects-review", target: subjectFailedReview.revisionId },
      ],
      systemOne.id,
    )]);
    const subjectReplacement = subjectCorrection.outputs[0].lifecycleDatum as Created;
    expect(subjectReplacement.revisionId).toBe(`${systemOne.id}-r00002`);

    const currentExactSet = [architecture, interfaceSpec, plan, subjectReplacement, removedSystem];
    const currentMemberIds = currentExactSet.map((member) => member.revisionId).sort();
    while (true) {
      outcome = next();
      packet = prepare(outcome);
      if (packet.scenario.reference === "create-phase-2-definition-context@1") {
        expect(inputValues(packet, "definition_members").map(
          (member: { identity: { revision_id: string } }) => member.identity.revision_id,
        ).sort()).toEqual(currentMemberIds);
        const contextPayload = {
          title: "Subject-corrected exact Phase 2 context",
          kind: "review-context",
          role: "review-context",
          scope: plan.revisionId,
          group: "DEFAULT",
          definition_members: currentMemberIds,
          evidence: [],
        };
        const extraContext = submitResult(packet, [proposal(
          "extra-subject-corrected-definition-context",
          "context",
          "BSL",
          {
            ...contextPayload,
            definition_members: [...currentMemberIds, parentRequirement.revisionId],
          },
        )]);
        expect(extraContext.status, `${extraContext.stderr}${extraContext.stdout}`).toBe(1);
        submit(packet, [proposal(
          "subject-corrected-definition-context",
          "context",
          "BSL",
          contextPayload,
        )]);
        continue;
      }
      if (packet.scenario.reference === "create-review-context@1") {
        submit(packet, [proposal("subject-review-context", "context", "BSL", {
          title: "Fresh subject correction context",
          kind: "review-context",
          role: "review-context",
          scope: subjectReplacement.revisionId,
          group: "DEFAULT",
          definition_members: [subjectReplacement.revisionId],
          evidence: [],
        })]);
        continue;
      }
      if (packet.scenario.reference === "review-datum-in-context@2") {
        const freshContext = inputValues(packet, "review_context")[0].identity.revision_id;
        submit(packet, [proposal("subject-review", "review", "REV", {
          title: "Fresh passing subject Review",
          review_kind: "contextual",
          rubric_ref: "policies/rubrics/bootstrap-review.md@1",
          findings: [],
          outcome: "pass",
        }, [
          { type: "reviews", target: subjectReplacement.revisionId },
          { type: "contextualizes", target: freshContext },
        ])], ["independent-reviewer"]);
        continue;
      }
      expect([
        "simplify-requirement-set@2",
        "simplify-architecture-and-interfaces@2",
      ]).toContain(packet.scenario.reference);
      break;
    }

    const consistencyReviewKind = packet.scenario.reference === "simplify-requirement-set@2"
      ? "simplification-requirements"
      : "simplification-architecture-interfaces";
    const consistencyFailurePayload = {
      title: "Failed exact Phase 2 definition consistency simplification",
      review_kind: consistencyReviewKind,
      decomposition_plan_revision: plan.revisionId,
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      definition_simplification: {
        primary_target: architecture.revisionId,
        correction_set: "definition-consistency",
        primary_findings: [{
          id: "F-101",
          severity: "blocking",
          summary: "The architecture has an unnecessary boundary.",
        }],
        collateral_findings: currentExactSet.slice(1).map((_member, index) => ({
          id: `F-${String(index + 102).padStart(3, "0")}`,
          severity: "blocking",
          summary: "This exact collateral definition must change with the boundary.",
        })),
        scope_reduction: {
          rationale: "The duplicate relay SYS output no longer applies.",
        },
      },
      outcome: "fail",
    };
    reviewContext = inputValues(packet, "subject_context")[0].identity.revision_id;
    const consistencyFailure = submit(packet, [proposal(
      "consistency-simplification",
      "review",
      "REV",
      consistencyFailurePayload,
      [
        { type: "reviews", target: reviewContext },
        { type: "contextualizes", target: reviewContext },
        ...currentExactSet.map((member) => ({ type: "blocks", target: member.revisionId })),
        { type: "removes", target: removedSystem.revisionId },
      ],
    )], ["independent-reviewer"]);
    const failedReview = consistencyFailure.outputs[0].lifecycleDatum as Created;

    outcome = next();
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe(
      "revise-phase-2-definition-set-after-simplification@1",
    );
    expect(inputValues(packet, "failed_reviews")[0]).toMatchObject({
      identity: { revision_id: failedReview.revisionId },
      data: {
        payload: {
          definition_simplification: {
            primary_target: architecture.revisionId,
            primary_findings: expect.arrayContaining([
              expect.objectContaining({ id: "F-101" }),
            ]),
          },
        },
      },
    });

    const correctedArchitectureRevision = `${architecture.id}-r00002`;
    const correctedInterfaceRevision = `${interfaceSpec.id}-r00002`;
    const correctedPlanRevision = `${plan.id}-r00002`;
    const correctedSystemRevision = `${systemOne.id}-r00003`;
    const cause = { type: "corrects-review", target: failedReview.revisionId };
    const correctedDefinitionOutputs = [
      proposal("architecture", "architecture", "ASP", {
        title: "Minimal report architecture",
        rationale: "One element removes the self-supporting boundary.",
        level: "system",
        elements: [{
          id: "AEL-0EXPRTAP00",
          alias: "EXPORT",
          title: "Report export",
          responsibilities: ["export one completed report"],
        }],
        interactions: [],
        constraints: [],
        nominated_risks: ["schema drift"],
      }, [
        { type: "governs", target: parentRequirement.revisionId },
        { type: "governs", target: "$proposal.plan.revision_id" },
        cause,
      ], architecture.id),
      proposal("interface", "interface", "ICSP", {
        title: "Minimal public report boundary",
        rationale: "One controlled boundary remains externally necessary.",
        architecture_revision: correctedArchitectureRevision,
        boundary: { from_element: "AEL-0EXPRTAP00", to_element: "AEL-0EXPRTAP00" },
        operations: ["POST /exports"],
        schemas: ["report@1"],
        units: [],
        timing: [],
        errors: ["invalid-report"],
        security: [],
        ordering: [],
        compatibility: ["v1"],
        interface_version: "1.1.0",
      }, [
        { type: "defines-interface-for", target: "$proposal.architecture.revision_id" },
        cause,
      ], interfaceSpec.id),
      proposal("plan", "plan", "DWP", {
        title: "Minimal report export decomposition",
        rationale: "The challenged relay work no longer applies.",
        stage: "planning",
        parent_revisions: [parentRequirement.revisionId],
        architecture_context: {
          revision: correctedArchitectureRevision,
          element: "AEL-0EXPRTAP00",
        },
        target_child_type: "SYS",
        behavioral_slice: "One public report export",
        expected_coverage: ["export"],
        exclusions: ["internal relay behavior"],
        interface_context: [correctedInterfaceRevision],
        verification_strategy_revision: strategy.revisionId,
        dependencies: [],
        required_review_policy: "review-applicability@1",
      }, [
        { type: "decomposes", target: parentRequirement.revisionId },
        { type: "allocated-to", target: "$proposal.architecture.revision_id" },
        { type: "governed-by", target: "$proposal.interface.revision_id" },
        cause,
      ], plan.id),
      proposal("requirement", "requirements", "SYS", {
        title: "Export one completed report",
        rationale: "One behavior covers the reduced exact scope.",
        statement: "The system shall export one completed report through the public boundary.",
        verification_intent: "Observe one exact successful export and malformed rejection.",
        architecture_allocation: {
          architecture_revision: correctedArchitectureRevision,
          element: "AEL-0EXPRTAP00",
        },
        interface_context: [correctedInterfaceRevision],
      }, [
        { type: "derived-from", target: parentRequirement.id },
        { type: "decomposes", target: "$proposal.plan.revision_id" },
        { type: "allocated-to", target: "$proposal.architecture.revision_id" },
        { type: "governed-by", target: "$proposal.interface.revision_id" },
        cause,
      ], systemOne.id),
    ];
    const retainedObsoleteOutput = proposal("removed-requirement", "requirements", "SYS", {
      title: "Relay completed report",
      rationale: "Incorrectly retains behavior that the exact Review removed.",
      statement: "The system shall continue relaying completed reports internally.",
      verification_intent: "Observe the obsolete relay.",
      architecture_allocation: {
        architecture_revision: correctedArchitectureRevision,
        element: "AEL-0EXPRTAP00",
      },
      interface_context: [correctedInterfaceRevision],
    }, [
      { type: "derived-from", target: parentRequirement.id },
      { type: "decomposes", target: "$proposal.plan.revision_id" },
      { type: "allocated-to", target: "$proposal.architecture.revision_id" },
      { type: "governed-by", target: "$proposal.interface.revision_id" },
      cause,
    ], removedSystem.id);
    const retainedObsolete = submitResult(
      packet,
      [...correctedDefinitionOutputs, retainedObsoleteOutput],
    );
    expect(
      retainedObsolete.status,
      `${retainedObsolete.stderr}${retainedObsolete.stdout}`,
    ).toBe(1);

    const correction = submit(packet, correctedDefinitionOutputs);
    expect(correction.outputs.map(
      (output: { lifecycleDatum: Created }) => output.lifecycleDatum.revisionId,
    )).toEqual(expect.arrayContaining([
      correctedArchitectureRevision,
      correctedInterfaceRevision,
      correctedPlanRevision,
      correctedSystemRevision,
    ]));

    const correctedMembers = [
      correctedArchitectureRevision,
      correctedInterfaceRevision,
      correctedPlanRevision,
      correctedSystemRevision,
    ];
    let definitionContextCreated = false;
    const publishDefinitionContext = (definitionPacket: Packet) => {
      expect(inputValues(definitionPacket, "definition_members").map(
        (member: { identity: { revision_id: string } }) => member.identity.revision_id,
      ).sort()).toEqual(correctedMembers.slice().sort());
      submit(definitionPacket, [proposal("corrected-definition-context", "context", "BSL", {
        title: "Corrected exact Phase 2 definition context",
        kind: "review-context",
        role: "review-context",
        scope: correctedPlanRevision,
        group: "DEFAULT",
        definition_members: correctedMembers,
        evidence: [],
      })]);
      definitionContextCreated = true;
    };
    const reviewed = new Set<string>();
    while (reviewed.size < correctedMembers.length) {
      outcome = next();
      expect(outcome.outcome).toBe("assignment");
      packet = prepare(outcome);
      if (packet.scenario.reference === "create-phase-2-definition-context@1") {
        publishDefinitionContext(packet);
        continue;
      }
      if (packet.scenario.reference === "create-review-context@1") {
        const subject = inputValues(packet, "subject")[0].identity.revision_id as string;
        const contextMembers = inputValues(packet, "context_members").map(
          (member: { identity: { revision_id: string } }) => member.identity.revision_id,
        );
        expect(contextMembers).toEqual([]);
        submit(packet, [proposal(
          `context-${subject.replaceAll("-", "_")}`,
          "context",
          "BSL",
          {
            title: `Fresh exact definition context for ${subject}`,
            kind: "review-context",
            role: "review-context",
            scope: subject,
            group: "DEFAULT",
            definition_members: [subject],
            evidence: [],
          },
        )]);
        continue;
      }
      expect(packet.scenario.reference).toBe("review-datum-in-context@2");
      const subject = inputValues(packet, "subject")[0].identity.revision_id as string;
      const reviewContext = inputValues(packet, "review_context")[0].identity.revision_id as string;
      submit(packet, [proposal(
        `review-${subject.replaceAll("-", "_")}`,
        "review",
        "REV",
        {
          title: `Fresh passing Review of ${subject}`,
          review_kind: "contextual",
          rubric_ref: "policies/rubrics/bootstrap-review.md@1",
          findings: [],
          outcome: "pass",
        },
        [
          { type: "reviews", target: subject },
          { type: "contextualizes", target: reviewContext },
        ],
      )], ["independent-reviewer"]);
      reviewed.add(subject);
    }
    expect([...reviewed].sort()).toEqual(correctedMembers.slice().sort());

    if (!definitionContextCreated) {
      outcome = next();
      expect(outcome.outcome, JSON.stringify(outcome, null, 2)).toBe("assignment");
      packet = prepare(outcome);
      expect(packet.scenario.reference).toBe("create-phase-2-definition-context@1");
      publishDefinitionContext(packet);
    }

    const simplificationMembers: string[][] = [];
    const simplificationScenarios = new Set([
      "simplify-requirement-set@2",
      "simplify-architecture-and-interfaces@2",
    ]);
    for (let index = 0; index < 2; index += 1) {
      outcome = next();
      expect(outcome.outcome, JSON.stringify(outcome, null, 2)).toBe("assignment");
      packet = prepare(outcome);
      expect(simplificationScenarios.delete(packet.scenario.reference)).toBe(true);
      const reviewKind = packet.scenario.reference === "simplify-requirement-set@2"
        ? "simplification-requirements"
        : "simplification-architecture-interfaces";
      const members = inputValues(packet, "definition_members").map(
        (member: { identity: { revision_id: string } }) => member.identity.revision_id,
      );
      simplificationMembers.push(members);
      expect(members.sort()).toEqual(correctedMembers.slice().sort());
      expect(members).not.toContain(removedSystem.revisionId);
      const reviewContext = inputValues(packet, "subject_context")[0].identity.revision_id;
      submit(packet, [proposal(
        `simplification-${reviewKind}`,
        "review",
        "REV",
        {
          title: `Passing ${reviewKind}`,
          review_kind: reviewKind,
          decomposition_plan_revision: correctedPlanRevision,
          rubric_ref: "policies/rubrics/bootstrap-review.md@1",
          outcome: "pass",
        },
        [
          { type: "reviews", target: reviewContext },
          { type: "contextualizes", target: reviewContext },
        ],
      )], ["independent-reviewer"]);
    }

    outcome = next();
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("complete-decomposition-work-package@2");
    expect(inputValues(packet, "plan")[0].identity.revision_id).toBe(correctedPlanRevision);
    expect(mdlm(repository, ["show", removedSystem.revisionId, "--json"]).status).toBe(0);
  }, 180_000);
});
