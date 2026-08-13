import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const reqExecutable = path.join(projectRoot, "dist/req-entry.js");
const bundledPackage = path.join(projectRoot, ".lifecycle/process");
const revision = (id: string, number = 1) => `${id}-r${String(number).padStart(5, "0")}`;

const ids = {
  product: "PSP-1020000001", stakeholder: "STK-1020000001",
  architecture: "ASP-1020000001", interface: "ICSP-1020000001", strategy: "VSP-1020000001",
  system: "SYS-1020000001", unaffected: "SYS-1020000002",
  consumerA: "DWP-1020000001", consumerB: "DWP-1020000002",
  verification: "VER-1020000001", unaffectedVerification: "VER-1020000002",
  source: "ART-1020000001", problem: "PRB-1020000001",
  systemContext: "BSL-1020000001", consumerAContext: "BSL-1020000002", consumerBContext: "BSL-1020000003",
  systemReview: "REV-1020000001", consumerAReview: "REV-1020000002", consumerBReview: "REV-1020000003",
  candidate: "BSL-1020000004", candidateContext: "BSL-1020000005", candidateReview: "REV-1020000004",
  gate: "DEC-1020000001", gateContext: "BSL-1020000006", gateReview: "REV-1020000005",
  accepted: "BSL-1020000007", sourceBoundary: "BSL-1020000008",
};

type Output = {
  localId: string; name: string; invocation: number;
  lifecycleDatum: { id?: string; type: string; payload: Record<string, unknown>; links: Array<{type: string; target: string}>; body: string };
};
type DatumRef = { id: string; revisionId: string };
type Packet = Record<string, any>;

function output(localId: string, name: string, type: string, payload: Record<string, unknown>, links: Array<{type: string; target: string}> = [], id?: string): Output {
  return { localId, name, invocation: 0, lifecycleDatum: { ...(id ? {id} : {}), type, payload, links, body: `Exact ${type} shared-system fixture.\n` } };
}
function mdlm(repository: string, args: string[], input?: string) {
  return spawnSync(process.execPath, [mdlmExecutable, ...args], { cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, ...(input === undefined ? {} : {input}) });
}
function git(repository: string, ...args: string[]) { return spawnSync("git", ["-C", repository, ...args], {encoding: "utf8"}); }

async function focusedPackage(
  parent: string,
  phaseId: "phase-2-system-definition" | "phase-7-change-control",
) {
  const root = path.join(parent, "process");
  await fs.cp(bundledPackage, root, {recursive: true});
  await fs.writeFile(path.join(root, "scenarios/seed-shared-system-change.yaml"), `kind: scenario-definition
id: seed-shared-system-change
version: 1
description: Test-only publication of exact shared-system accepted evidence.
initiation: explicit
phases: [${phaseId}]
inputs: []
outputs:
  - {name: data, types: [PSP, STK, ASP, ICSP, VSP, SYS, DWP, VER, ART, PRB, BSL, REV, DEC], cardinality: one-or-more, required_links: []}
prompt_ref: prompts/seed-shared-system-change.md@1
review_policy_ref: review-applicability@1
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: coherent-batch
`);
  await fs.writeFile(path.join(root, "prompts/seed-shared-system-change.md"), "---\nid: seed-shared-system-change\nversion: 1\nscenario: seed-shared-system-change\n---\n\n# Seed shared system evidence\n");
  const manifestPath = path.join(root, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push("seed-shared-system-change");
  manifest.assets.prompts.push("prompts/seed-shared-system-change.md@1");
  await fs.writeFile(manifestPath, stringify(manifest));
  const phasePath = path.join(root, `phases/${phaseId}.yaml`);
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.scenarios.push("seed-shared-system-change@1");
  if (phaseId === "phase-2-system-definition") {
    phase.obligations = ["shared-system-consumer-reevaluation-required@1"];
  }
  await fs.writeFile(phasePath, stringify(phase));
  const phase0Path = path.join(root, "phases/phase-0-wayfinding.yaml");
  const phase0 = parse(await fs.readFile(phase0Path, "utf8")); phase0.order = 8; await fs.writeFile(phase0Path, stringify(phase0));
  const reviewPath = path.join(root, "selectors/review-required-revisions.yaml");
  const review = parse(await fs.readFile(reviewPath, "utf8"));
  review.query.where = `policy("review-applicability@1", {subject: subject}).required == true
&& state(subject, "disposition") == "active"
&& none("newer-revisions-for@1", {subject: subject})
&& none("implemented-changes-impacting-revision@2", {subject: subject})
&& (
  (subject.identity.type == "CHG"
    && none("revised-requirements-for-change@3", {change: subject}))
  || (subject.identity.type == "DEC" && subject.payload.kind == "change-approval")
  || subject.provenance.scenario in ["revise-requirement-under-change@3", "reevaluate-shared-system-consumer@1", "create-stakeholder-change-candidate@1", "revise-stakeholder-change-after-review@2"]
)`;
  await fs.writeFile(reviewPath, stringify(review));
  const profilePath = path.join(root, "profiles/bootstrap.yaml");
  const profile = parse(await fs.readFile(profilePath, "utf8"));
  profile.terminal_outcomes.profile_boundary.condition = `phase.id == "phase-7-change-control" && exists("all-change-requests@1", {}) && every("all-change-requests@1", {}, change => state(change, "change-status") == "closed")`;
  profile.terminal_outcomes.lifecycle_complete.condition = "false";
  await fs.writeFile(profilePath, stringify(profile));
  return root;
}

const requirementPayload = (title: string) => ({ title, rationale: "One durable shared requirement serves both exact consumers.", statement: `The system shall ${title.toLowerCase()}.`, verification_intent: "Inspect exact public behavior." });
const dwpPayload = (title: string) => ({ title, rationale: "Record separate exact consumer coverage.", stage: "completion", architecture_element: "AEL-1020000000", target_child_type: "SYS", behavioral_slice: title, expected_coverage: [title], exclusions: [], dependencies: [], required_review_policy: "review-applicability@1", parent_coverage_status: "complete", deferred_questions: [], cross_group_dependencies: [], output_reviews_complete: true, simplification_disposition: "retained" });
const verificationPayload = (title: string) => ({ title, rationale: "Retain exact verification dependency.", kind: "pilot", method: "test", assessment_mode: "automatic", claim: {kind: "pilot", scope: "verification-design", formal_evidence_eligible: false}, acceptance_criteria: ["observable"], evidence_requirements: ["exact result"], expected_success_activity: "Exercise support.", expected_discrimination_activity: "Exercise rejection." });
const reviewPayload = (title: string, kind = "contextual") => ({ title, review_kind: kind, rubric_ref: "policies/rubrics/bootstrap-review.md@1", findings: [], outcome: "pass" });
const contextPayload = (title: string, scope: string, definitions: string[]) => ({ title, kind: "review-context", role: "review-context", scope, group: "DEFAULT", definition_members: definitions, evidence: [] });

describe("shared accepted SYS change control through the public operator process", () => {
  let parent: string; let repository: string;
  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-sys-change-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
  });
  async function initialize(phaseId: "phase-2-system-definition" | "phase-7-change-control") {
    const initialized = spawnSync(process.execPath, [reqExecutable, "init", "--process", await focusedPackage(parent, phaseId), "--json"], {cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  }
  afterEach(async () => fs.rm(parent, {recursive: true, force: true}));

  function commit(message: string) {
    const doctor = mdlm(repository, ["doctor", "--json"]);
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    expect(git(repository, "add", "-N", ".lifecycle/data").status).toBe(0);
    expect(git(repository, "diff", "--quiet", "--", ".lifecycle/data").status)
      .toBe(1);
    expect(git(repository, "add", "--all").status).toBe(0);
    const result = git(repository, "-c", "user.name=MDLM Test", "-c", "user.email=mdlm@example.invalid", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "--message", message);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");
  }
  async function seedBatch(outputs: Output[]) {
    const adapter = path.join(parent, `seed-${Math.random()}.mjs`);
    await fs.writeFile(adapter, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({outputs: outputs.map(({localId: _l, ...item}) => item), completionEvidence: {summary: "Seed exact shared-system evidence."}}))});\n`, {mode: 0o755});
    const result = spawnSync(process.execPath, [reqExecutable, "scenario", "execute", "seed-shared-system-change@1", "--initiate", "--adapter", adapter, "--json"], {cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  }
  async function seed(accepted = true) {
    const sys = revision(ids.system), unaffected = revision(ids.unaffected), a = revision(ids.consumerA), b = revision(ids.consumerB);
    const architecture = revision(ids.architecture), interfaceRevision = revision(ids.interface), strategy = revision(ids.strategy), stakeholder = revision(ids.stakeholder);
    const consumerLinks = (requirement: string) => [
      {type: "decomposes", target: requirement}, {type: "allocated-to", target: architecture},
      {type: "governed-by", target: interfaceRevision}, {type: "verified-under", target: strategy},
    ];
    await seedBatch([
      output("product", "data", "PSP", {title: "Shared report", rationale: "Bound accepted shared behavior.", problem: "Consumers may diverge.", users: ["report author"], goals: ["one shared export"], non_goals: ["consumer copies"], success_measures: ["both consumers bind one SYS"]}, [], ids.product),
      output("stakeholder", "data", "STK", {...requirementPayload("provide one portable report"), stakeholder: "report author", priority: "must"}, [{type: "derived-from", target: ids.product}], ids.stakeholder),
      output("architecture", "data", "ASP", {title: "Shared export architecture", rationale: "Bound both consumers.", level: "system", elements: [{id: "AEL-1020000000", alias: "EXPORT", title: "Export boundary", responsibilities: ["serve shared export"]}], interactions: ["Consumers use export boundary"], constraints: [], nominated_risks: ["consumer divergence"]}, [{type: "governs", target: stakeholder}], ids.architecture),
      output("interface", "data", "ICSP", {title: "Shared export interface", rationale: "Control consumer boundary.", architecture_revision: architecture, boundary: {from_element: "AEL-1020000000", to_element: "AEL-1020000000"}, operations: ["export"], schemas: ["report@1"], units: [], timing: [], errors: ["malformed"], security: [], ordering: [], compatibility: ["v1"], interface_version: "1.0.0"}, [{type: "defines-interface-for", target: architecture}], ids.interface),
      output("strategy", "data", "VSP", {title: "Shared export strategy", rationale: "Control exact evidence.", level: "system", permitted_methods: ["test"], independence: {boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"]}, evidence_policy: "Retain exact observations.", assessment_policy: "Require independent judgment.", environment_profile: {id: "shared", purpose: "Exercise export.", capabilities: {controllability: ["report"], observability: ["result"], external_services: [], timing: "bounded"}}}, [{type: "governs", target: ids.stakeholder}, {type: "governs-revision", target: stakeholder}], ids.strategy),
      output("sys", "data", "SYS", requirementPayload("export one shared report"), [{type: "derived-from", target: stakeholder}], ids.system),
      output("unaffected", "data", "SYS", requirementPayload("retain the report title"), [{type: "derived-from", target: stakeholder}], ids.unaffected),
      output("consumer-a", "data", "DWP", dwpPayload("API consumer coverage"), consumerLinks(sys), ids.consumerA),
      output("consumer-b", "data", "DWP", dwpPayload("CLI consumer coverage"), consumerLinks(sys), ids.consumerB),
      output("verification", "data", "VER", verificationPayload("Shared export verification"), [{type: "governed-by", target: strategy}, {type: "verifies", target: ids.system}, {type: "verifies-revision", target: sys}], ids.verification),
      output("unaffected-verification", "data", "VER", verificationPayload("Title verification"), [{type: "governed-by", target: strategy}, {type: "verifies", target: ids.unaffected}, {type: "verifies-revision", target: unaffected}], ids.unaffectedVerification),
      output("source", "data", "ART", {title: "Shared system observation", kind: "prototype", repository_ref: `git:${"a".repeat(40)}`, supported_behavior: ["shared export"], unsupported_behavior: ["malformed export"]}, [], ids.source),
      output("problem", "data", "PRB", {title: "Shared export change", rationale: "Both exact consumers need reassessment.", condition: "The accepted shared behavior changed.", severity: "major", disposition: "open", evidence_refs: [revision(ids.source)]}, [{type: "reports", target: revision(ids.source)}], ids.problem),
    ]);
    if (!accepted) {
      await seedBatch([
        output("draft-definition-context", "data", "BSL", contextPayload("Draft shared definition context", sys, [sys, a, b]), [], ids.systemContext),
      ]);
      await seedBatch([
        output("draft-sys", "data", "SYS", requirementPayload("export one shared report with explicit rejection"), [{type: "derived-from", target: stakeholder}], ids.system),
      ]);
      expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status).toBe(0);
      commit("Initialize draft shared SYS fixture");
      return;
    }
    await seedBatch([
      output("sys-context", "data", "BSL", contextPayload("SYS context", sys, [sys]), [], ids.systemContext),
      output("a-context", "data", "BSL", contextPayload("Consumer A context", a, [a, sys]), [], ids.consumerAContext),
      output("b-context", "data", "BSL", contextPayload("Consumer B context", b, [b, sys]), [], ids.consumerBContext),
    ]);
    await seedBatch([
      output("sys-review", "data", "REV", reviewPayload("SYS Review"), [{type: "reviews", target: sys}, {type: "contextualizes", target: revision(ids.systemContext)}], ids.systemReview),
      output("a-review", "data", "REV", reviewPayload("Consumer A Review"), [{type: "reviews", target: a}, {type: "contextualizes", target: revision(ids.consumerAContext)}], ids.consumerAReview),
      output("b-review", "data", "REV", reviewPayload("Consumer B Review"), [{type: "reviews", target: b}, {type: "contextualizes", target: revision(ids.consumerBContext)}], ids.consumerBReview),
    ]);
    await seedBatch([
      output("candidate", "data", "BSL", {title: "Accepted system candidate", kind: "level-candidate", role: "candidate", scope: "SYSTEM", group: "DEFAULT", definition_members: [sys, unaffected, a, b], evidence: [revision(ids.systemContext), revision(ids.systemReview), revision(ids.consumerAContext), revision(ids.consumerAReview), revision(ids.consumerBContext), revision(ids.consumerBReview), revision(ids.verification), revision(ids.unaffectedVerification)]}, [], ids.candidate),
    ]);
    await seedBatch([
      output("candidate-context", "data", "BSL", contextPayload("Candidate context", revision(ids.candidate), [revision(ids.candidate), sys, unaffected, a, b]), [], ids.candidateContext),
      output("gate", "data", "DEC", {title: "Approve system candidate", rationale: "Authorize exact shared system definition.", kind: "gate-signoff", gate_outcome: "approve", decision: "Approve.", alternatives: ["reject"], effective_scope: revision(ids.candidate)}, [{type: "justifies", target: revision(ids.candidate)}], ids.gate),
    ]);
    await seedBatch([
      output("candidate-review", "data", "REV", reviewPayload("Candidate Review", "cross-group"), [{type: "reviews", target: revision(ids.candidate)}, {type: "contextualizes", target: revision(ids.candidateContext)}], ids.candidateReview),
      output("gate-context", "data", "BSL", contextPayload("Gate context", revision(ids.gate), [revision(ids.gate)]), [], ids.gateContext),
    ]);
    await seedBatch([
      output("gate-review", "data", "REV", reviewPayload("Gate Review"), [{type: "reviews", target: revision(ids.gate)}, {type: "contextualizes", target: revision(ids.gateContext)}], ids.gateReview),
    ]);
    await seedBatch([
      output("accepted", "data", "BSL", {title: "Accepted shared system", kind: "level-accepted", role: "accepted", scope: "SYSTEM", group: "DEFAULT", definition_members: [sys, unaffected, a, b], evidence: [revision(ids.systemContext), revision(ids.systemReview), revision(ids.consumerAContext), revision(ids.consumerAReview), revision(ids.consumerBContext), revision(ids.consumerBReview), revision(ids.candidate), revision(ids.candidateContext), revision(ids.candidateReview), revision(ids.gate), revision(ids.gateContext), revision(ids.gateReview), revision(ids.verification), revision(ids.unaffectedVerification)]}, [{type: "promotes", target: revision(ids.candidate)}], ids.accepted),
      output("source-boundary", "data", "BSL", {title: "Change source boundary", kind: "source-boundary", role: "source-boundary", scope: revision(ids.problem), group: "DEFAULT", definition_members: [], evidence: [revision(ids.source), revision(ids.problem)]}, [], ids.sourceBoundary),
    ]);
    expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status).toBe(0); commit("Initialize shared accepted SYS fixture");
  }
  function next() { const result = mdlm(repository, ["next"]); expect(result.status, `${result.stderr}${result.stdout}`).toBe(0); return JSON.parse(result.stdout); }
  function prepare(outcome: any): Packet { expect(outcome.assignment, JSON.stringify(outcome)).toBeDefined(); const result = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]); expect(result.status, `${result.stderr}${result.stdout}`).toBe(0); return JSON.parse(result.stdout); }
  function values(packet: Packet, name: string) { return packet.exactInputs[0].inputs.find((input: any) => input.name === name).values as any[]; }
  function respond(packet: Packet, outputs: Output[], authorities: string[] = []) {
    return mdlm(repository, ["scenario", "submit"], `${JSON.stringify({contract: "mdlm-assignment-response@1", assignment: packet.assignment.id, kind: "proposal", proposal: {outputs, completionEvidence: {summary: "Publish exact shared-system change evidence."}, loadedSkillRefs: packet.prompt.skills.map((skill: any) => skill.reference), authoritySupplies: authorities, standingDelegations: []}})}\n`);
  }
  function publish(packet: Packet, outputs: Output[], authorities: string[] = []) {
    const result = respond(packet, outputs, authorities);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0); const execution = JSON.parse(result.stdout).execution; commit(`Publish ${packet.scenario.reference}`); return execution.outputs.map((item: any) => item.lifecycleDatum) as DatumRef[];
  }
  function publishContext(packet: Packet) {
    const subject = values(packet, "subject")[0]; const members = values(packet, "context_members");
    return publish(packet, [output("context", "context", "BSL", contextPayload(`Context for ${subject.identity.revision_id}`, subject.identity.revision_id, [subject.identity.revision_id, ...members.map((member) => member.identity.revision_id)]))])[0]!;
  }
  function publishReview(packet: Packet) {
    const subject = values(packet, "subject")[0], context = values(packet, "review_context")[0];
    const kind = subject.identity.type === "BSL" ? "cross-group" : "contextual";
    return publish(packet, [output("review", "review", "REV", reviewPayload(`Review ${subject.identity.revision_id}`, kind), [{type: "reviews", target: subject.identity.revision_id}, {type: "contextualizes", target: context.identity.revision_id}])], ["independent-reviewer"])[0]!;
  }
  function consumerReplacement(packet: Packet, change?: DatumRef) {
    const consumer = values(packet, "consumer")[0];
    const replacement = values(packet, "replacement_requirement")[0];
    const title = consumer.identity.id === ids.consumerA ? "API consumer coverage" : "CLI consumer coverage";
    return output("replacement-consumer", "replacement_consumer", "DWP", dwpPayload(title), [
      {type: "decomposes", target: replacement.identity.revision_id},
      {type: "allocated-to", target: revision(ids.architecture)},
      {type: "governed-by", target: revision(ids.interface)},
      {type: "verified-under", target: revision(ids.strategy)},
      ...(change ? [{type: "changed-under", target: change.revisionId}] : []),
    ], consumer.identity.id);
  }

  it("reevaluates both draft consumers serially without Change Request ceremony", async () => {
    await initialize("phase-2-system-definition");
    await seed(false);

    let outcome = next();
    let packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("reevaluate-shared-system-consumer@1");
    expect(values(packet, "consumer")[0].identity.revision_id).toBe(revision(ids.consumerA));
    expect(values(packet, "replacement_requirement")[0].identity.revision_id).toBe(revision(ids.system, 2));
    expect(packet.exactInputs[0].inputs.map((input: any) => input.name)).not.toContain("change");
    publish(packet, [consumerReplacement(packet)]);

    outcome = next();
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(values(packet, "subject")[0].identity.revision_id).toBe(revision(ids.consumerA, 2));
    publishContext(packet);
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("reevaluate-shared-system-consumer@1");
    expect(values(packet, "consumer")[0].identity.revision_id).toBe(revision(ids.consumerB));
    publish(packet, [consumerReplacement(packet)]);
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(values(packet, "subject")[0].identity.revision_id).toBe(revision(ids.consumerB, 2));
    publishContext(packet);
    for (const consumer of [ids.consumerA, ids.consumerB]) {
      packet = prepare(next());
      expect(packet.scenario.reference).toBe("review-datum-in-context@2");
      expect(values(packet, "subject")[0].identity.revision_id).toBe(revision(consumer, 2));
      publishReview(packet);
    }

    const consumerA = mdlm(repository, ["show", revision(ids.consumerA, 2), "--json"]);
    const consumerB = mdlm(repository, ["show", revision(ids.consumerB, 2), "--json"]);
    expect(consumerA.status, `${consumerA.stderr}${consumerA.stdout}`).toBe(0);
    expect(consumerB.status, `${consumerB.stderr}${consumerB.stdout}`).toBe(0);
    for (const result of [consumerA, consumerB]) {
      const datum = JSON.parse(result.stdout).lifecycleDatum.datum;
      expect(datum.links).toContainEqual({type: "decomposes", target: revision(ids.system, 2)});
      expect(datum.links.some((link: any) => link.type === "changed-under")).toBe(false);
      expect(datum.payload.parent_coverage_status).toBe("complete");
    }
  }, 180_000);

  it("replaces a shared accepted SYS through attended approval, serial consumer updates, a selective candidate, and exact closure", async () => {
    await initialize("phase-7-change-control");
    await seed();
    let outcome = next(), packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("analyze-change-impact@2");
    const change = publish(packet, [output("change", "change", "CHG", {title: "Change shared export", rationale: "Both exact consumers must rebind.", scope: "One accepted shared SYS and all exact consumers.", planned_changes: ["Revise the shared export contract."], implementation_order: "requirements -> context -> reviews -> baselines -> verification", closure_criteria: ["Both consumers have fresh coverage and Review evidence."]}, [{type: "derived-from", target: revision(ids.problem)}, {type: "impacts", target: revision(ids.system)}, {type: "impacts", target: revision(ids.accepted)}])])[0]!;

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(values(packet, "context_members").map((item) => item.identity.revision_id)).toEqual(expect.arrayContaining([
      revision(ids.system), revision(ids.accepted), revision(ids.systemContext), revision(ids.systemReview),
      revision(ids.consumerA), revision(ids.consumerB), revision(ids.consumerAContext), revision(ids.consumerBContext),
      revision(ids.consumerAReview), revision(ids.consumerBReview), revision(ids.candidate), revision(ids.candidateContext),
      revision(ids.candidateReview), revision(ids.gate), revision(ids.gateContext), revision(ids.gateReview),
      revision(ids.verification),
    ]));
    publishContext(packet);
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    publishReview(packet);

    outcome = next();
    expect(outcome.outcome).toBe("attention-required");
    packet = prepare(outcome);
    expect(packet.scenario.reference).toBe("approve-change-request@3");
    const approval = publish(packet, [output("approval", "approval", "DEC", {
      title: "Approve shared SYS change", rationale: "Authorize the bounded impact and serial implementation.", kind: "change-approval", change_disposition: "approve", decision: "Approve the exact shared SYS change.", alternatives: ["reject", "defer", "cancel"], effective_scope: change.revisionId,
    }, [{type: "justifies", target: change.revisionId}])], ["stakeholder"])[0]!;
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    publishContext(packet);
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    publishReview(packet);

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("revise-requirement-under-change@3");
    const replacement = publish(packet, [output("replacement", "revised_requirement", "SYS", requirementPayload("export one shared report and reject malformed exports"), [
      {type: "derived-from", target: revision(ids.stakeholder)},
      {type: "changed-under", target: change.revisionId},
    ], ids.system)])[0]!;
    expect(replacement.revisionId).toBe(revision(ids.system, 2));

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("reevaluate-shared-system-consumer@1");
    expect(values(packet, "consumer")[0].identity.revision_id).toBe(revision(ids.consumerA));
    const changedCoverage = dwpPayload("API consumer coverage");
    changedCoverage.expected_coverage = ["discarded unaffected coverage"];
    const rejected = respond(packet, [output("replacement-consumer", "replacement_consumer", "DWP", changedCoverage, [
      {type: "decomposes", target: replacement.revisionId},
      {type: "allocated-to", target: revision(ids.architecture)},
      {type: "governed-by", target: revision(ids.interface)},
      {type: "verified-under", target: revision(ids.strategy)},
      {type: "changed-under", target: change.revisionId},
    ], ids.consumerA)]);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "scenario-completion-failed"}),
    ]));
    const consumerA = publish(packet, [consumerReplacement(packet, change)])[0]!;
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    const consumerAContext = publishContext(packet);

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("reevaluate-shared-system-consumer@1");
    expect(values(packet, "consumer")[0].identity.revision_id).toBe(revision(ids.consumerB));
    const consumerB = publish(packet, [consumerReplacement(packet, change)])[0]!;
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    const consumerBContext = publishContext(packet);
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(values(packet, "subject")[0].identity.revision_id).toBe(replacement.revisionId);
    const replacementContext = publishContext(packet);
    const reviewedSubjects = [consumerA, consumerB, replacement];
    const reviews: DatumRef[] = [];
    for (const subject of reviewedSubjects) {
      packet = prepare(next());
      expect(packet.scenario.reference).toBe("review-datum-in-context@2");
      expect(values(packet, "subject")[0].identity.revision_id).toBe(subject.revisionId);
      reviews.push(publishReview(packet));
    }
    const [consumerAReview, consumerBReview, replacementReview] = reviews as [DatumRef, DatumRef, DatumRef];

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-stakeholder-change-candidate@1");
    expect(values(packet, "updated_consumers").map((item) => item.identity.revision_id)).toEqual([
      consumerA.revisionId,
      consumerB.revisionId,
    ]);
    expect(values(packet, "reusable_definitions").map((item) => item.identity.revision_id)).toEqual([
      revision(ids.unaffected),
    ]);
    expect(values(packet, "reusable_evidence").map((item) => item.identity.revision_id)).toEqual([
      revision(ids.unaffectedVerification),
    ]);
    const freshEvidence = values(packet, "fresh_evidence").map((item) => item.identity.revision_id);
    const reusableEvidence = values(packet, "reusable_evidence").map((item) => item.identity.revision_id);
    const candidate = publish(packet, [output("candidate", "candidate", "BSL", {
      title: "Selective shared SYS replacement candidate", kind: "level-candidate", role: "candidate", scope: "SYSTEM", group: "DEFAULT",
      definition_members: [replacement.revisionId, consumerA.revisionId, consumerB.revisionId, revision(ids.unaffected)],
      evidence: [...freshEvidence, ...reusableEvidence],
    }, [{type: "changed-under", target: change.revisionId}])])[0]!;

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("create-review-context@1");
    const candidateContext = publishContext(packet);
    packet = prepare(next());
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    const candidateReview = publishReview(packet);

    packet = prepare(next());
    expect(packet.scenario.reference).toBe("close-change-request@4");
    expect(values(packet, "approval")[0].identity.revision_id).toBe(approval.revisionId);
    expect(values(packet, "revised_requirements")[0].identity.revision_id).toBe(replacement.revisionId);
    expect(values(packet, "closure_evidence").map((item) => item.identity.revision_id)).toEqual(expect.arrayContaining([
      replacementContext.revisionId, replacementReview.revisionId,
      consumerAContext.revisionId, consumerBContext.revisionId,
      consumerAReview.revisionId, consumerBReview.revisionId,
      candidate.revisionId, candidateContext.revisionId, candidateReview.revisionId,
    ]));
    publish(packet, [
      output("closure", "closure", "DEC", {title: "Close shared SYS change", rationale: "Both consumers and the selective candidate have fresh exact evidence.", kind: "change-closure", decision: "Close the bounded shared SYS change.", alternatives: ["leave open"], effective_scope: change.revisionId}, [
        {type: "justifies", target: change.revisionId},
        {type: "confirms-revision", target: replacement.revisionId},
        ...values(packet, "closure_evidence").map((item) => ({type: "closes-with", target: item.identity.revision_id})),
      ]),
      output("closed-problem", "closed_problem", "PRB", {title: "Shared export change", rationale: "Fresh exact replacement evidence closes the observation.", condition: "The accepted shared behavior changed.", severity: "major", disposition: "closed", evidence_refs: [revision(ids.source)], closure_summary: "Both exact consumers now bind the changed shared SYS."}, [
        {type: "reports", target: revision(ids.source)},
        {type: "resolved-by", target: "$proposal.closure.revision_id"},
      ], ids.problem),
    ]);

    const terminal = next();
    expect(terminal.outcome, JSON.stringify(terminal)).toBe("profile-boundary-reached");
    const closedChange = mdlm(repository, ["show", change.revisionId, "--json"]);
    expect(JSON.parse(closedChange.stdout).projections.states["change-status"]).toBe("closed");
    const changedSystem = JSON.parse(mdlm(repository, ["show", replacement.revisionId, "--json"]).stdout).lifecycleDatum.datum;
    expect(changedSystem.id).toBe(ids.system);
    expect(changedSystem.links).toContainEqual({type: "changed-under", target: change.revisionId});
    const selectiveCandidate = JSON.parse(mdlm(repository, ["show", candidate.revisionId, "--json"]).stdout).lifecycleDatum.datum;
    expect(selectiveCandidate.payload.definition_members).toEqual([
      replacement.revisionId, consumerA.revisionId, consumerB.revisionId, revision(ids.unaffected),
    ]);
    const unaffectedEvidence = mdlm(repository, ["show", revision(ids.unaffectedVerification), "--json"]);
    expect(JSON.parse(unaffectedEvidence.stdout).projections.states.validity).toBe("valid");
  }, 1_800_000);

});
