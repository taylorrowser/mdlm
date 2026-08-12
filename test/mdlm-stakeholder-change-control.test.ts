import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const bundledPackage = path.join(projectRoot, ".lifecycle/process");

const ids = {
  product: "PSP-1010000000",
  accepted: "STK-1010000001",
  unaffected: "STK-1010000002",
  draft: "STK-1010000003",
  strategy: "VSP-1010000000",
  affectedEvidence: "VER-1010000001",
  unaffectedEvidence: "VER-1010000002",
  source: "ART-1010000000",
  problem: "PRB-1010000000",
  baseline: "BSL-1010000000",
  sourceBoundary: "BSL-1010000001",
  draftReviewContext: "BSL-1010000002",
  acceptedReviewContext: "BSL-1010000003",
  draftReview: "REV-1010000000",
  acceptedReview: "REV-1010000001",
};
const revision = (id: string, number = 1) =>
  `${id}-r${String(number).padStart(5, "0")}`;

type Packet = Record<string, any>;
type DatumRef = { id: string; revisionId: string };
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

function output(
  localId: string,
  name: string,
  type: string,
  payload: Record<string, unknown>,
  links: Array<{ type: string; target: string }> = [],
  id?: string,
): ProposalOutput {
  return {
    localId,
    name,
    invocation: 0,
    lifecycleDatum: {
      ...(id ? { id } : {}),
      type,
      payload,
      links,
      body: `Exact ${type} stakeholder-change fixture.\n`,
    },
  };
}

async function focusedChangePackage(parent: string): Promise<string> {
  const packageRoot = path.join(parent, "process");
  await fs.cp(bundledPackage, packageRoot, { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, "scenarios/seed-accepted-stakeholder-change.yaml"),
    `kind: scenario-definition
id: seed-accepted-stakeholder-change
version: 1
description: Test-only publication of accepted and draft stakeholder requirements plus exact change evidence.
initiation: explicit
phases: [phase-7-change-control]
inputs: []
outputs:
  - {name: data, types: [PSP, STK, VSP, VER, ART, PRB, BSL, REV], cardinality: one-or-more, required_links: []}
prompt_ref: prompts/seed-accepted-stakeholder-change.md@1
review_policy_ref: review-applicability@1
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: coherent-batch
`,
  );
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-accepted-stakeholder-change.md"),
    "---\nid: seed-accepted-stakeholder-change\nversion: 1\nscenario: seed-accepted-stakeholder-change\n---\n\n# Seed accepted stakeholder change\n",
  );

  const manifestPath = path.join(packageRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push("seed-accepted-stakeholder-change");
  manifest.assets.prompts.push("prompts/seed-accepted-stakeholder-change.md@1");
  await fs.writeFile(manifestPath, stringify(manifest));

  const phasePath = path.join(packageRoot, "phases/phase-7-change-control.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.scenarios.push("seed-accepted-stakeholder-change@1");
  await fs.writeFile(phasePath, stringify(phase));
  const phase0Path = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase0 = parse(await fs.readFile(phase0Path, "utf8"));
  phase0.order = 8;
  await fs.writeFile(phase0Path, stringify(phase0));

  const reviewSelectorPath = path.join(packageRoot, "selectors/review-required-revisions.yaml");
  const reviewSelector = parse(await fs.readFile(reviewSelectorPath, "utf8"));
  reviewSelector.query.where = `policy("review-applicability@1", {subject: subject}).required == true
&& state(subject, "disposition") == "active"
&& none("newer-revisions-for@1", {subject: subject})
&& (
  phase.id != "phase-7-change-control"
  || subject.identity.type == "CHG"
  || (subject.identity.type == "DEC" && subject.payload.kind == "change-approval")
  || subject.provenance.scenario in ["revise-requirement-under-change@2", "create-stakeholder-change-candidate@1", "revise-stakeholder-change-after-review@1"]
)`;
  await fs.writeFile(reviewSelectorPath, stringify(reviewSelector));

  const profilePath = path.join(packageRoot, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.terminal_outcomes.profile_boundary.condition = `phase.id == "phase-7-change-control"
&& exists("all-change-requests@1", {})
&& every("all-change-requests@1", {}, change => state(change, "change-status") == "closed")`;
  profile.terminal_outcomes.lifecycle_complete.condition = "false";
  await fs.writeFile(profilePath, stringify(profile));
  return packageRoot;
}

function requirementPayload(title: string, statement: string) {
  return {
    title,
    rationale: "The exact stakeholder commitment is independently traceable.",
    statement,
    verification_intent: "Observe the exact stakeholder-visible behavior.",
    stakeholder: "report author",
    priority: "must",
  };
}

function activityPayload(title: string) {
  return {
    title,
    rationale: "The exact public behavior needs independent evidence.",
    kind: "pilot",
    method: "test",
    assessment_mode: "automatic",
    claim: { kind: "pilot", scope: "verification-design", formal_evidence_eligible: false },
    acceptance_criteria: ["the public behavior is observed"],
    evidence_requirements: ["exact public observation"],
    expected_success_activity: "Exercise the supported behavior.",
    expected_discrimination_activity: "Exercise the unsupported behavior.",
  };
}

describe("accepted STK change control through the public operator process", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-stk-change-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    // Install the focused test package through setup only; all lifecycle work below uses mdlm.
    const packageRoot = await focusedChangePackage(parent);
    const reqExecutable = path.join(projectRoot, "dist/req-entry.js");
    const selected = spawnSync(process.execPath, [reqExecutable, "init", "--process", packageRoot, "--json"], {
      cwd: repository,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    expect(selected.status, `${selected.stderr}${selected.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  function commit(message: string) {
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

  async function seed() {
    const strategyPayload = {
      title: "Accepted intent strategy",
      rationale: "The accepted exact commitments need controlled public evidence.",
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
      evidence_policy: "Retain exact observations.",
      assessment_policy: "Require independent assessment.",
      environment_profile: {
        id: "public",
        purpose: "Exercise the public behavior.",
        capabilities: {
          controllability: ["public request"],
          observability: ["public result"],
          external_services: [],
          timing: "bounded",
        },
      },
    };
    const outputs = [
      output("product", "data", "PSP", {
        title: "Portable report",
        rationale: "Report authors need portable exact outcomes.",
        problem: "A completed report cannot be used outside the product.",
        users: ["report author"],
        goals: ["export a completed report"],
        non_goals: ["general integration platform"],
        success_measures: ["one report exports exactly"],
      }, [], ids.product),
      output("accepted", "data", "STK", requirementPayload(
        "Export a completed report",
        "The product shall export a completed report.",
      ), [{ type: "derived-from", target: ids.product }], ids.accepted),
      output("unaffected", "data", "STK", requirementPayload(
        "Retain the authored title",
        "The product shall retain the authored report title.",
      ), [{ type: "derived-from", target: ids.product }], ids.unaffected),
      output("draft", "data", "STK", requirementPayload(
        "Preview a completed report",
        "The product shall preview a completed report.",
      ), [{ type: "derived-from", target: ids.product }], ids.draft),
      output("strategy", "data", "VSP", strategyPayload, [
        { type: "governs", target: ids.accepted },
        { type: "governs-revision", target: revision(ids.accepted) },
      ], ids.strategy),
      output("affected-evidence", "data", "VER", activityPayload("Export evidence"), [
        { type: "governed-by", target: revision(ids.strategy) },
        { type: "verifies", target: ids.accepted },
        { type: "verifies-revision", target: revision(ids.accepted) },
      ], ids.affectedEvidence),
      output("unaffected-evidence", "data", "VER", activityPayload("Title evidence"), [
        { type: "governed-by", target: revision(ids.strategy) },
        { type: "verifies", target: ids.unaffected },
        { type: "verifies-revision", target: revision(ids.unaffected) },
      ], ids.unaffectedEvidence),
      output("source", "data", "ART", {
        title: "Accepted export observation",
        kind: "prototype",
        repository_ref: `git:${"a".repeat(40)}`,
        supported_behavior: ["valid export"],
        unsupported_behavior: ["malformed export"],
      }, [], ids.source),
      output("problem", "data", "PRB", {
        title: "Accepted export intent needs a bounded change",
        rationale: "The immutable observation conflicts with accepted stakeholder intent.",
        condition: "A malformed report export is accepted.",
        severity: "major",
        disposition: "open",
        evidence_refs: [revision(ids.source)],
      }, [{ type: "reports", target: revision(ids.source) }], ids.problem),
    ];
    const adapter = path.join(parent, "seed.mjs");
    const executeSeed = async (seedOutputs: ProposalOutput[]) => {
      await fs.writeFile(
        adapter,
        `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
          outputs: seedOutputs.map(({ localId: _localId, ...value }) => value),
          completionEvidence: { summary: "Seeded accepted and draft STK evidence." },
        }))});\n`,
        { mode: 0o755 },
      );
      const seeded = spawnSync(
        process.execPath,
        [path.join(projectRoot, "dist/req-entry.js"), "scenario", "execute", "seed-accepted-stakeholder-change@1", "--initiate", "--adapter", adapter, "--json"],
        { cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
    };
    await executeSeed(outputs);
    await executeSeed([
      output("draft-review-context", "data", "BSL", {
        title: "Review Context for individually passing unaccepted intent",
        kind: "review-context",
        role: "review-context",
        scope: revision(ids.draft),
        group: "DEFAULT",
        definition_members: [revision(ids.draft)],
        evidence: [],
      }, [], ids.draftReviewContext),
      output("accepted-review-context", "data", "BSL", {
        title: "Review Context for accepted stakeholder requirement",
        kind: "review-context",
        role: "review-context",
        scope: revision(ids.accepted),
        group: "DEFAULT",
        definition_members: [revision(ids.accepted)],
        evidence: [],
      }, [], ids.acceptedReviewContext),
      output("draft-review", "data", "REV", {
        title: "Passing Review of unaccepted stakeholder requirement",
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      }, [
        { type: "reviews", target: revision(ids.draft) },
        { type: "contextualizes", target: revision(ids.draftReviewContext) },
      ], ids.draftReview),
      output("accepted-review", "data", "REV", {
        title: "Passing Review of accepted stakeholder requirement",
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: [],
        outcome: "pass",
      }, [
        { type: "reviews", target: revision(ids.accepted) },
        { type: "contextualizes", target: revision(ids.acceptedReviewContext) },
      ], ids.acceptedReview),
    ]);
    await executeSeed([
      output("accepted-baseline", "data", "BSL", {
        title: "Authorized accepted intent",
        kind: "intent-approved",
        role: "accepted",
        scope: "DEFAULT",
        group: "DEFAULT",
        definition_members: [
          revision(ids.product),
          revision(ids.accepted),
          revision(ids.unaffected),
        ],
        evidence: [
          revision(ids.affectedEvidence),
          revision(ids.unaffectedEvidence),
          revision(ids.acceptedReviewContext),
          revision(ids.acceptedReview),
        ],
      }, [], ids.baseline),
      output("source-boundary", "data", "BSL", {
        title: "Frozen exact change source",
        kind: "source-boundary",
        role: "source-boundary",
        scope: revision(ids.problem),
        group: "DEFAULT",
        definition_members: [],
        evidence: [revision(ids.source), revision(ids.problem)],
      }, [], ids.sourceBoundary),
    ]);
    expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status).toBe(0);
    commit("Initialize accepted STK change fixture");
  }

  function nextOutcome() {
    const result = mdlm(repository, ["next"]);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout) as Record<string, any>;
  }

  function prepare(outcome: Record<string, any>): Packet {
    const result = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout);
  }

  function inputs(packet: Packet, name: string): Array<Record<string, any>> {
    return packet.exactInputs[0].inputs.find((input: { name: string }) => input.name === name).values;
  }

  function respond(packet: Packet, outputs: ProposalOutput[], authoritySupplies: string[] = []) {
    return mdlm(repository, ["scenario", "submit"], `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment: packet.assignment.id,
      kind: "proposal",
      proposal: {
        outputs,
        completionEvidence: { summary: "Completed exact accepted STK change work." },
        loadedSkillRefs: packet.prompt.skills.map((skill: { reference: string }) => skill.reference),
        authoritySupplies,
        standingDelegations: [],
      },
    })}\n`);
  }

  function publish(packet: Packet, outputs: ProposalOutput[], authoritySupplies: string[] = []) {
    const submitted = respond(packet, outputs, authoritySupplies);
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const execution = JSON.parse(submitted.stdout).execution as { outputs: Array<{ lifecycleDatum: DatumRef }> };
    commit(`Publish ${packet.scenario.reference}`);
    return execution;
  }

  function publishContext(packet: Packet) {
    const subject = inputs(packet, "subject")[0]!;
    return publish(packet, [output(
      `context-${subject.identity.revision_id}`,
      "context",
      "BSL",
      {
        title: `Review Context for ${subject.identity.revision_id}`,
        kind: "review-context",
        role: "review-context",
        scope: subject.identity.revision_id,
        group: "DEFAULT",
        definition_members: [
          subject.identity.revision_id,
          ...inputs(packet, "context_members").map((member) => member.identity.revision_id),
        ],
        evidence: [],
      },
      [],
    )]).outputs[0]!.lifecycleDatum;
  }

  function publishReview(packet: Packet, outcome: "pass" | "fail" = "pass") {
    const subject = inputs(packet, "subject")[0]!;
    const context = inputs(packet, "review_context")[0]!;
    return publish(packet, [output(
      `review-${subject.identity.revision_id}`,
      "review",
      "REV",
      {
        title: `${outcome === "pass" ? "Passing" : "Failing"} Review of ${subject.identity.revision_id}`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        findings: outcome === "pass" ? [] : [{
          id: "F-101",
          target: subject.identity.revision_id,
          relationship: "primary",
          severity: "blocking",
          summary: "The exact change evidence needs correction before it can advance.",
        }],
        outcome,
      },
      [
        { type: "reviews", target: subject.identity.revision_id },
        { type: "contextualizes", target: context.identity.revision_id },
      ],
    )], ["independent-reviewer"]).outputs[0]!.lifecycleDatum;
  }

  function changeOutput(requirement: string, includeAffectedEvidence = true): ProposalOutput {
    return output("change", "change", "CHG", {
      title: "Reject malformed report exports",
      rationale: "Change only the exact accepted export commitment and traced evidence.",
      scope: "One accepted stakeholder requirement and its exact dependent evidence.",
      planned_changes: ["Reject malformed exports observably."],
      implementation_order: "requirements -> context -> reviews -> baselines -> verification",
      closure_criteria: ["The replacement STK has fresh reviewed candidate evidence."],
    }, [
      { type: "derived-from", target: revision(ids.problem) },
      { type: "impacts", target: requirement },
      { type: "impacts", target: revision(ids.baseline) },
      { type: "impacts", target: revision(ids.acceptedReviewContext) },
      { type: "impacts", target: revision(ids.acceptedReview) },
      { type: "impacts", target: revision(ids.strategy) },
      ...(includeAffectedEvidence
        ? [{ type: "impacts", target: revision(ids.affectedEvidence) }]
        : []),
    ]);
  }

  function publishChangeAndReview(): { change: DatumRef; packet: Packet } {
    let next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    let packet = prepare(next);
    expect(packet.scenario.reference).toBe("analyze-change-impact@2");

    const unacceptedReview = mdlm(repository, ["show", revision(ids.draftReview), "--json"]);
    expect(unacceptedReview.status, `${unacceptedReview.stderr}${unacceptedReview.stdout}`).toBe(0);
    expect(JSON.parse(unacceptedReview.stdout).lifecycleDatum.datum.payload.outcome).toBe("pass");
    const unacceptedRequirement = mdlm(repository, ["show", revision(ids.draft), "--json"]);
    expect(unacceptedRequirement.status, `${unacceptedRequirement.stderr}${unacceptedRequirement.stdout}`).toBe(0);
    expect(JSON.parse(unacceptedRequirement.stdout).projections.states.maturity).toBe("review-frozen");
    const draftRejected = respond(packet, [changeOutput(revision(ids.draft))]);
    expect(draftRejected.status).toBe(1);
    expect(JSON.parse(draftRejected.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]));

    const change = publish(packet, [changeOutput(revision(ids.accepted))]).outputs[0]!.lifecycleDatum;
    next = nextOutcome();
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("create-review-context@1");
    publishContext(packet);
    next = nextOutcome();
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    publishReview(packet);
    next = nextOutcome();
    expect(next.outcome).toBe("attention-required");
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("approve-change-request@3");
    return { change, packet };
  }

  function publishDisposition(packet: Packet, change: DatumRef, disposition: "approve" | "reject" | "defer" | "cancel") {
    const decision = publish(packet, [output(
      `disposition-${disposition}`,
      "approval",
      "DEC",
      {
        title: `${disposition} exact Change Request`,
        rationale: "Apply one explicit attended disposition to the exact reviewed impact.",
        kind: "change-approval",
        change_disposition: disposition,
        ...(disposition === "defer"
          ? { change_reactivation_condition: "New exact stakeholder evidence justifies reevaluation." }
          : {}),
        decision: `${disposition} the exact bounded Change Request.`,
        alternatives: ["approve", "reject", "defer", "cancel"].filter((value) => value !== disposition),
        effective_scope: change.revisionId,
      },
      [{ type: "justifies", target: change.revisionId }],
    )], ["stakeholder"]).outputs[0]!.lifecycleDatum;
    let next = nextOutcome();
    let reviewPacket = prepare(next);
    expect(reviewPacket.scenario.reference).toBe("create-review-context@1");
    publishContext(reviewPacket);
    next = nextOutcome();
    reviewPacket = prepare(next);
    publishReview(reviewPacket);
    return decision;
  }

  it("atomically rejects impact that omits directly traceable accepted evidence", async () => {
    await seed();
    const next = nextOutcome();
    const packet = prepare(next);
    expect(packet.scenario.reference).toBe("analyze-change-impact@2");

    const underReported = respond(packet, [changeOutput(revision(ids.accepted), false)]);
    expect(underReported.status).toBe(1);
    expect(JSON.parse(underReported.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]));
    expect(git(repository, "grep", "type: CHG", "--", ".lifecycle/data").status).toBe(1);
  }, 90_000);

  it("routes a failed Change Request Review through same-lineage Correction and fresh Review", async () => {
    await seed();
    let next = nextOutcome();
    let packet = prepare(next);
    const change = publish(packet, [changeOutput(revision(ids.accepted))]).outputs[0]!.lifecycleDatum;

    next = nextOutcome();
    packet = prepare(next);
    publishContext(packet);
    next = nextOutcome();
    packet = prepare(next);
    const failedReview = publishReview(packet, "fail");

    next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("revise-stakeholder-change-after-review@1");
    expect(inputs(packet, "subject")[0]!.identity.revision_id).toBe(change.revisionId);
    const correctedChange = publish(packet, [output(
      "corrected-change",
      "replacement",
      "CHG",
      {
        title: "Reject malformed report exports",
        rationale: "Change only the exact accepted export commitment and traced evidence.",
        scope: "One accepted stakeholder requirement and its exact dependent evidence.",
        planned_changes: ["Reject malformed exports observably."],
        implementation_order: "requirements -> context -> reviews -> baselines -> verification",
        closure_criteria: ["The replacement STK has fresh reviewed candidate evidence."],
      },
      [
        { type: "derived-from", target: revision(ids.problem) },
        { type: "impacts", target: revision(ids.accepted) },
        { type: "impacts", target: revision(ids.baseline) },
        { type: "impacts", target: revision(ids.acceptedReviewContext) },
        { type: "impacts", target: revision(ids.acceptedReview) },
        { type: "impacts", target: revision(ids.strategy) },
        { type: "impacts", target: revision(ids.affectedEvidence) },
        { type: "corrects-review", target: failedReview.revisionId },
      ],
      change.id,
    )]).outputs[0]!.lifecycleDatum;
    expect(correctedChange.revisionId).toBe(revision(change.id, 2));

    next = nextOutcome();
    packet = prepare(next);
    expect(packet.scenario.reference).toBe("create-review-context@1");
    publishContext(packet);
    next = nextOutcome();
    packet = prepare(next);
    publishReview(packet);
    next = nextOutcome();
    expect(next.outcome).toBe("attention-required");
    expect(prepare(next).scenario.reference).toBe("approve-change-request@3");
  }, 120_000);

  it.each(["reject", "defer", "cancel"] as const)(
    "closes an exact reviewed %s disposition without replacing accepted history",
    async (disposition) => {
      await seed();
      const { change, packet } = publishChangeAndReview();
      publishDisposition(packet, change, disposition);
      const terminal = nextOutcome();
      expect(terminal.outcome).toBe("profile-boundary-reached");
      expect(terminal.phase).toBe("phase-7-change-control@3");
      const status = mdlm(repository, ["status", "--json"]);
      expect(status.status, `${status.stderr}${status.stdout}`).toBe(0);
      expect(JSON.parse(status.stdout).unresolvedWork.total).toBe(0);
      expect(git(repository, "grep", "STK-1010000001-r00002", "--", ".lifecycle/data").status).toBe(1);
      const accepted = mdlm(repository, ["show", revision(ids.accepted), "--json"]);
      expect(accepted.status, `${accepted.stderr}${accepted.stdout}`).toBe(0);
      expect(JSON.parse(accepted.stdout).projections.states.maturity).toBe("accepted");
    },
    90_000,
  );

  it("routes a failed attended disposition Review back to renewed attended judgment", async () => {
    await seed();
    const { change, packet } = publishChangeAndReview();
    const decision = publish(packet, [output(
      "initial-approval",
      "approval",
      "DEC",
      {
        title: "Approve exact Change Request",
        rationale: "Apply one explicit attended disposition to the exact reviewed impact.",
        kind: "change-approval",
        change_disposition: "approve",
        decision: "approve the exact bounded Change Request.",
        alternatives: ["reject", "defer", "cancel"],
        effective_scope: change.revisionId,
      },
      [{ type: "justifies", target: change.revisionId }],
    )], ["stakeholder"]).outputs[0]!.lifecycleDatum;

    let next = nextOutcome();
    let work = prepare(next);
    publishContext(work);
    next = nextOutcome();
    work = prepare(next);
    const failedReview = publishReview(work, "fail");

    next = nextOutcome();
    expect(next.outcome).toBe("attention-required");
    work = prepare(next);
    expect(work.scenario.reference).toBe("revise-change-disposition-after-review@1");
    const replacement = publish(work, [output(
      "corrected-approval",
      "replacement",
      "DEC",
      {
        title: "Corrected approval of exact Change Request",
        rationale: "Renew attended judgment after addressing the exact Review finding.",
        kind: "change-approval",
        change_disposition: "approve",
        decision: "approve the corrected exact bounded Change Request disposition.",
        alternatives: ["reject", "defer", "cancel"],
        effective_scope: change.revisionId,
      },
      [
        { type: "justifies", target: change.revisionId },
        { type: "corrects-review", target: failedReview.revisionId },
      ],
      decision.id,
    )], ["stakeholder"]).outputs[0]!.lifecycleDatum;
    expect(replacement.revisionId).toBe(revision(decision.id, 2));

    next = nextOutcome();
    work = prepare(next);
    publishContext(work);
    next = nextOutcome();
    work = prepare(next);
    publishReview(work);
    next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    expect(prepare(next).scenario.reference).toBe("revise-requirement-under-change@2");
  }, 180_000);

  it("requires same-lineage replacement, preserves unaffected exact evidence, and closes with fresh Review and candidate evidence", async () => {
    await seed();
    const { change, packet } = publishChangeAndReview();
    publishDisposition(packet, change, "approve");

    let next = nextOutcome();
    expect(next.outcome).toBe("assignment");
    let work = prepare(next);
    expect(work.scenario.reference).toBe("revise-requirement-under-change@2");
    expect(inputs(work, "requirement")[0]!.identity.revision_id).toBe(revision(ids.accepted));
    const wrongLineage = respond(work, [output(
      "wrong-lineage",
      "revised_requirement",
      "STK",
      requirementPayload("Changed export", "The product shall reject malformed exports."),
      [
        { type: "derived-from", target: ids.product },
        { type: "changed-under", target: change.revisionId },
      ],
    )]);
    expect(wrongLineage.status).toBe(1);
    expect(JSON.parse(wrongLineage.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]));
    let replacement = publish(work, [output(
      "replacement",
      "revised_requirement",
      "STK",
      requirementPayload(
        "Validate report exports",
        "The product shall export valid completed reports and reject malformed exports observably.",
      ),
      [
        { type: "derived-from", target: ids.product },
        { type: "changed-under", target: change.revisionId },
      ],
      ids.accepted,
    )]).outputs[0]!.lifecycleDatum;
    expect(replacement.revisionId).toBe(revision(ids.accepted, 2));

    next = nextOutcome();
    work = prepare(next);
    expect(work.scenario.reference).toBe("create-review-context@1");
    let context = publishContext(work);
    next = nextOutcome();
    work = prepare(next);
    const failedReplacementReview = publishReview(work, "fail");

    next = nextOutcome();
    work = prepare(next);
    expect(work.scenario.reference).toBe("revise-stakeholder-change-after-review@1");
    replacement = publish(work, [output(
      "corrected-replacement",
      "replacement",
      "STK",
      requirementPayload(
        "Validate report exports after Review",
        "The product shall export valid completed reports and reject malformed exports observably.",
      ),
      [
        { type: "derived-from", target: ids.product },
        { type: "changed-under", target: change.revisionId },
        { type: "corrects-review", target: failedReplacementReview.revisionId },
      ],
      ids.accepted,
    )]).outputs[0]!.lifecycleDatum;
    expect(replacement.revisionId).toBe(revision(ids.accepted, 3));

    next = nextOutcome();
    work = prepare(next);
    context = publishContext(work);
    next = nextOutcome();
    work = prepare(next);
    const review = publishReview(work);

    const implementingChange = mdlm(repository, ["show", change.revisionId, "--json"]);
    expect(implementingChange.status, `${implementingChange.stderr}${implementingChange.stdout}`).toBe(0);
    expect(JSON.parse(implementingChange.stdout).projections.states["change-status"]).toBe(
      "implementation-in-progress",
    );
    const affectedEvidence = mdlm(repository, ["show", revision(ids.affectedEvidence), "--json"]);
    const unaffectedEvidence = mdlm(repository, ["show", revision(ids.unaffectedEvidence), "--json"]);
    expect(JSON.parse(affectedEvidence.stdout).projections.states.validity).toBe("stale");
    expect(JSON.parse(unaffectedEvidence.stdout).projections.states.validity).toBe("valid");

    next = nextOutcome();
    expect(next.outcome, JSON.stringify(next)).toBe("assignment");
    work = prepare(next);
    expect(work.scenario.reference).toBe("create-stakeholder-change-candidate@1");
    expect(inputs(work, "reusable_definitions").map((value) => value.identity.revision_id)).toEqual([
      revision(ids.product),
      revision(ids.unaffected),
    ]);
    expect(inputs(work, "reusable_evidence").map((value) => value.identity.revision_id)).toEqual([
      revision(ids.unaffectedEvidence),
    ]);
    let candidate = publish(work, [output(
      "candidate",
      "candidate",
      "BSL",
      {
        title: "Replacement stakeholder intent candidate",
        kind: "intent-change-candidate",
        role: "candidate",
        scope: "DEFAULT",
        group: "DEFAULT",
        definition_members: [
          replacement.revisionId,
          revision(ids.product),
          revision(ids.unaffected),
        ],
        evidence: [context.revisionId, review.revisionId, revision(ids.unaffectedEvidence)],
      },
      [{ type: "changed-under", target: change.revisionId }],
    )]).outputs[0]!.lifecycleDatum;

    next = nextOutcome();
    work = prepare(next);
    publishContext(work);
    next = nextOutcome();
    work = prepare(next);
    const failedCandidateReview = publishReview(work, "fail");

    next = nextOutcome();
    work = prepare(next);
    expect(work.scenario.reference).toBe("revise-stakeholder-change-after-review@1");
    candidate = publish(work, [output(
      "corrected-candidate",
      "replacement",
      "BSL",
      {
        title: "Corrected replacement stakeholder intent candidate",
        kind: "intent-change-candidate",
        role: "candidate",
        scope: "DEFAULT",
        group: "DEFAULT",
        definition_members: [
          replacement.revisionId,
          revision(ids.product),
          revision(ids.unaffected),
        ],
        evidence: [context.revisionId, review.revisionId, revision(ids.unaffectedEvidence)],
      },
      [
        { type: "changed-under", target: change.revisionId },
        { type: "corrects-review", target: failedCandidateReview.revisionId },
      ],
      candidate.id,
    )]).outputs[0]!.lifecycleDatum;
    expect(candidate.revisionId).toBe(revision(candidate.id, 2));

    next = nextOutcome();
    work = prepare(next);
    publishContext(work);
    next = nextOutcome();
    work = prepare(next);
    const candidateReview = publishReview(work);

    next = nextOutcome();
    work = prepare(next);
    expect(work.scenario.reference).toBe("close-change-request@3");
    expect(inputs(work, "revised_requirements")[0]!.identity.revision_id).toBe(replacement.revisionId);
    expect(inputs(work, "closure_evidence").map((value) => value.identity.revision_id)).toEqual(expect.arrayContaining([
      context.revisionId,
      review.revisionId,
      candidate.revisionId,
      candidateReview.revisionId,
    ]));
    publish(work, [
      output("closure", "closure", "DEC", {
        title: "Close exact accepted STK change",
        rationale: "The replacement has fresh exact Review and candidate evidence.",
        kind: "change-closure",
        decision: "Close the bounded accepted stakeholder change.",
        alternatives: ["Leave the exact change open"],
        effective_scope: change.revisionId,
      }, [
        { type: "justifies", target: change.revisionId },
        { type: "confirms-revision", target: replacement.revisionId },
        ...inputs(work, "closure_evidence").map((value) => ({
          type: "closes-with",
          target: value.identity.revision_id,
        })),
      ]),
      output("closed-problem", "closed_problem", "PRB", {
        title: "Accepted export intent needs a bounded change",
        rationale: "Fresh exact replacement evidence closes the immutable observed condition.",
        condition: "A malformed report export is accepted.",
        severity: "major",
        disposition: "closed",
        evidence_refs: [revision(ids.source)],
        closure_summary: "The reviewed replacement candidate rejects malformed exports.",
      }, [
        { type: "reports", target: revision(ids.source) },
        { type: "resolved-by", target: "$proposal.closure.revision_id" },
      ], ids.problem),
    ]);

    const terminal = nextOutcome();
    expect(terminal.outcome).toBe("profile-boundary-reached");
    expect(git(repository, "grep", revision(ids.unaffectedEvidence), "--", ".lifecycle/data").status).toBe(0);
    const acceptedHistory = mdlm(repository, ["show", revision(ids.accepted), "--json"]);
    expect(JSON.parse(acceptedHistory.stdout).projections.states.maturity).toBe("accepted");
  }, 180_000);
});
