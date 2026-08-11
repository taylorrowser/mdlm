import { spawnSync } from "node:child_process";
import { promises as fs, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { req } from "./helpers/req.js";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const processPackage = path.join(projectRoot, ".lifecycle/process");

type DatumRef = { id: string; revisionId: string };
type Packet = {
  assignment: { id: string };
  scenario: { reference: string };
  prompt: { skills: Array<{ reference: string }> };
  exactInputs: Array<{
    inputs: Array<{ name: string; values: Array<Record<string, any>> }>;
  }>;
};
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

const ids = {
  product: "PSP-0REPRTPRD0",
  parent: "STK-0REPRTSTK0",
  strategy: "VSP-0REPRTVSP0",
  architecture: "ASP-0REPRTARCH",
  interface: "ICSP-0REPRT1CSP",
  plan: "DWP-0REPRTPMN0",
  retained: "SYS-0EXPRTREQ0",
  removed: "SYS-0REPATREQ00",
};
const revision = (id: string, number = 1) => `${id}-r${String(number).padStart(5, "0")}`;
const initialMembers = [
  revision(ids.architecture),
  revision(ids.plan),
  revision(ids.interface),
  revision(ids.retained),
  revision(ids.removed),
];
const initialReviewSubjects = [
  ...initialMembers,
  revision(ids.product),
  revision(ids.parent),
  revision(ids.strategy),
];

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
      body: `Exact ${type} Phase 2 fixture.\n`,
    },
  };
}
function contextOutput(
  localId: string,
  id: string,
  scope: string,
  members: string[],
): ProposalOutput {
  return output(localId, "data", "BSL", {
    title: `Exact Review Context for ${scope}`,
    kind: "review-context",
    role: "review-context",
    scope,
    group: "DEFAULT",
    definition_members: members,
    evidence: [],
  }, [], id);
}

async function focusedPackage(root: string): Promise<string> {
  const packageRoot = path.join(root, "process");
  await fs.cp(processPackage, packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, "scenarios/seed-phase-2-data.yaml"), `kind: scenario-definition
id: seed-phase-2-data
version: 1
description: Test-only atomic publication of exact Phase 2 fixture data.
initiation: explicit
phases: [phase-2-system-definition]
inputs: []
outputs:
  - {name: data, types: [PSP, STK, VSP, ASP, ICSP, DWP, SYS, BSL], cardinality: one-or-more, required_links: []}
prompt_ref: prompts/seed-phase-2-data.md@1
review_policy_ref: review-applicability@1
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: coherent-batch
`);
  await fs.writeFile(path.join(packageRoot, "scenarios/seed-phase-2-reviews.yaml"), `kind: scenario-definition
id: seed-phase-2-reviews
version: 1
description: Test-only atomic publication of fresh exact member Reviews.
initiation: explicit
phases: [phase-2-system-definition]
inputs:
  - {name: plan, types: [DWP], cardinality: one, identity: revision}
  - {name: review_context, types: [BSL], cardinality: one, identity: revision}
outputs:
  - {name: reviews, types: [REV], cardinality: one-or-more, required_links: []}
prompt_ref: prompts/seed-phase-2-reviews.md@1
review_policy_ref: review-applicability@1
participation:
  policy_ref: contextual-review-participation@1
  arguments: {subject: plan, review_context: review_context}
authority_evidence: {output: reviews, type: REV}
completion: 'execution.integrity.contract_valid == true'
resolves: []
prohibited_inputs: [mutable latest aliases]
batching: coherent-batch
`);
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-phase-2-data.md"),
    "---\nid: seed-phase-2-data\nversion: 1\nscenario: seed-phase-2-data\n---\n\n# Seed Phase 2 data\n",
  );
  await fs.writeFile(
    path.join(packageRoot, "prompts/seed-phase-2-reviews.md"),
    "---\nid: seed-phase-2-reviews\nversion: 1\nscenario: seed-phase-2-reviews\n---\n\n# Seed Phase 2 Reviews\n",
  );

  const manifestPath = path.join(packageRoot, "manifest.yaml");
  const manifest = parse(await fs.readFile(manifestPath, "utf8"));
  manifest.catalog.scenarios.push("seed-phase-2-data", "seed-phase-2-reviews");
  manifest.assets.prompts.push(
    "prompts/seed-phase-2-data.md@1",
    "prompts/seed-phase-2-reviews.md@1",
  );
  await fs.writeFile(manifestPath, stringify(manifest));

  const retainedObligations = new Set([
    "review-context-required",
    "passing-review-required",
    "phase-2-simplification-correction-required",
    "phase-2-definition-consistency-correction-required",
    "decomposition-simplification-required",
    "architecture-interface-simplification-required",
    "decomposition-completion-required",
  ]);
  const obligationsRoot = path.join(packageRoot, "obligations");
  for (const file of await fs.readdir(obligationsRoot)) {
    if (!file.endsWith(".yaml")) continue;
    const obligationPath = path.join(obligationsRoot, file);
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    if (retainedObligations.has(obligation.id)) continue;
    obligation.phases = obligation.phases.filter(
      (phaseId: string) => phaseId !== "phase-2-system-definition",
    );
    if (obligation.phases.length === 0) obligation.phases = ["phase-0-wayfinding"];
    await fs.writeFile(obligationPath, stringify(obligation));
  }

  const phasePath = path.join(packageRoot, "phases/phase-2-system-definition.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.order = 0;
  phase.entry = "true";
  phase.scenarios = [
    "seed-phase-2-data@1",
    "seed-phase-2-reviews@1",
    "create-review-context@1",
    "review-datum-in-context@2",
    "simplify-requirement-set@2",
    "simplify-architecture-and-interfaces@2",
    "revise-phase-2-subject-after-simplification@1",
    "revise-phase-2-definition-set-after-simplification@1",
    "complete-decomposition-work-package@2",
  ];
  phase.obligations = [
    "review-context-required@2",
    "passing-review-required@2",
    "phase-2-simplification-correction-required@1",
    "phase-2-definition-consistency-correction-required@1",
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

describe("Phase 2 earliest simplification through the public mdlm seam", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase-2-simplification-"));
    repository = path.join(parent, "repository");
    await fs.mkdir(repository);
    const initialized = req(
      repository,
      "--json",
      "init",
      "--process",
      await focusedPackage(parent),
    );
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    const fixture = initialFixtureOutputs();
    seedData(fixture.filter((item) => item.lifecycleDatum.type !== "BSL"));
    seedData(fixture.filter((item) => item.lifecycleDatum.type === "BSL"));
    seedReviews(revision(ids.plan), revision("BSL-0DEFSETCTX"), initialReviewSubjects);
    expect(git(repository, "init", "--quiet", "--initial-branch=main", "--template=").status)
      .toBe(0);
    commit("Initialize exact Phase 2 fixture");
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  function initialFixtureOutputs(): ProposalOutput[] {
    const product = revision(ids.product);
    const parentRequirement = revision(ids.parent);
    const strategy = revision(ids.strategy);
    const architecture = revision(ids.architecture);
    const interfaceSpec = revision(ids.interface);
    const plan = revision(ids.plan);
    const outputs = [
      output("product", "data", "PSP", {
        title: "Report export fixture", rationale: "Bound the exact Phase 2 journey.",
        problem: "Duplicate boundaries multiply work.", users: ["report author"],
        goals: ["one report export"], non_goals: ["integration platform"],
        success_measures: ["one minimal boundary"],
      }, [], ids.product),
      output("parent", "data", "STK", {
        title: "Export one completed report", rationale: "Authors need one portable result.",
        statement: "The product shall export one completed report.",
        verification_intent: "Observe one exact public export.", stakeholder: "report author", priority: "must",
      }, [{ type: "derived-from", target: ids.product }], ids.parent),
      output("strategy", "data", "VSP", {
        title: "System export strategy", rationale: "The public boundary needs black-box evidence.",
        level: "system", permitted_methods: ["demonstration"],
        independence: { boundary: "black-box", prohibited_inputs: ["product source code", "product unit tests", "private implementation details", "uncontrolled implementation shortcuts"] },
        evidence_policy: "Retain exact observations.", assessment_policy: "Require discrimination.",
        environment_profile: { id: "system-boundary", purpose: "Exercise report export.", capabilities: { controllability: ["report fixture"], observability: ["response"], external_services: [], timing: "bounded" } },
      }, [
        { type: "governs", target: ids.parent },
        { type: "governs-revision", target: parentRequirement },
      ], ids.strategy),
      output("architecture", "data", "ASP", {
        title: "Duplicated report architecture", rationale: "Awaiting simplification.", level: "system",
        elements: [
          { id: "AEL-0REPRTCR00", alias: "REPORT_CORE", title: "Report core", responsibilities: ["prepare export"] },
          { id: "AEL-0EXPRTAP00", alias: "EXPORT_API", title: "Export API", responsibilities: ["relay export"] },
        ], interactions: ["Report core relays through Export API"], constraints: [], nominated_risks: ["duplicate responsibility"],
      }, [{ type: "governs", target: parentRequirement }], ids.architecture),
      output("interface", "data", "ICSP", {
        title: "Duplicated report boundary", rationale: "Awaiting simplification.",
        architecture_revision: architecture,
        boundary: { from_element: "AEL-0REPRTCR00", to_element: "AEL-0EXPRTAP00" },
        operations: ["POST /exports"], schemas: ["report@1"], units: [], timing: [], errors: ["invalid-report"], security: [], ordering: [], compatibility: ["v1"], interface_version: "1.0.0",
      }, [{ type: "defines-interface-for", target: architecture }], ids.interface),
      output("plan", "data", "DWP", planPayload(false), [
        { type: "decomposes", target: parentRequirement },
        { type: "allocated-to", target: architecture },
        { type: "governed-by", target: interfaceSpec },
        { type: "verified-under", target: strategy },
      ], ids.plan),
      output("retained", "data", "SYS", requirementPayload("Export completed report", architecture), [
        { type: "derived-from", target: ids.parent }, { type: "decomposes", target: plan },
        { type: "allocated-to", target: architecture }, { type: "governed-by", target: interfaceSpec },
      ], ids.retained),
      output("removed", "data", "SYS", requirementPayload("Relay completed report", architecture), [
        { type: "derived-from", target: ids.parent }, { type: "decomposes", target: plan },
        { type: "allocated-to", target: architecture }, { type: "governed-by", target: interfaceSpec },
      ], ids.removed),
      contextOutput("set-context", "BSL-0DEFSETCTX", plan, initialMembers),
    ];
    initialReviewSubjects.forEach((member, index) => {
      if (member !== plan) {
        outputs.push(contextOutput(`member-context-${index}`, `BSL-0MEMCTX00${index}`, member, [member]));
      }
    });
    return outputs;
  }

  function planPayload(reduced: boolean) {
    return {
      title: reduced ? "Minimal report export decomposition" : "Decompose report export",
      rationale: reduced ? "Duplicate relay work no longer applies." : "Bound exact system outputs.",
      stage: "planning",
      architecture_element: "AEL-0EXPRTAP00",
      target_child_type: "SYS",
      behavioral_slice: reduced ? "One public report export" : "Report export and duplicate relay behavior",
      expected_coverage: ["export"], exclusions: reduced ? ["internal relay behavior"] : [],
      dependencies: [], required_review_policy: "review-applicability@1",
    };
  }

  function requirementPayload(title: string, architecture: string) {
    return {
      title, rationale: "Express only necessary public behavior.",
      statement: `The system shall ${title.toLowerCase()}.`,
      verification_intent: "Observe exact success and malformed rejection.",
      architecture_allocation: { architecture_revision: architecture, element: "AEL-0EXPRTAP00" },
    };
  }

  function setInvocations(outputs: ProposalOutput[]) {
    for (const item of outputs) item.invocation = 0;
  }

  function seedData(outputs: ProposalOutput[]) {
    setInvocations(outputs);
    const adapter = writeAdapter("seed-data", {
      outputs: outputs.map(({ localId: _localId, ...item }) => item),
      completionEvidence: { summary: "Seeded exact Phase 2 fixture data." },
    });
    const seeded = req(repository, "scenario", "execute", "seed-phase-2-data@1", "--initiate", "--adapter", adapter, "--json");
    expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
  }

  function seedReviews(
    plan: string,
    setContext: string,
    members: string[],
    contexts = members.map((member, index) =>
      member === plan ? setContext : revision(`BSL-0MEMCTX00${index}`)),
  ) {
    const reviews = members.map((member, index) => {
      const review = output(`review-${index}`, "reviews", "REV", {
        title: `Passing Review of ${member}`, review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@1", findings: [], outcome: "pass",
      }, [
        { type: "reviews", target: member },
        { type: "contextualizes", target: contexts[index]! },
      ]);
      review.invocation = 0;
      return review;
    });
    const adapter = writeAdapter(`seed-reviews-${plan}`, {
      outputs: reviews.map(({ localId: _localId, ...item }) => item),
      completionEvidence: { summary: "Seeded fresh exact member Reviews." },
    });
    const seeded = req(
      repository, "scenario", "execute", "seed-phase-2-reviews@1", "--initiate",
      "--input", `plan=${plan}`, "--input", `review_context=${setContext}`,
      "--authorize", "independent-reviewer", "--adapter", adapter, "--json",
    );
    expect(seeded.status, `${seeded.stderr}${seeded.stdout}`).toBe(0);
  }

  function writeAdapter(name: string, response: Record<string, unknown>) {
    const adapter = path.join(parent, `${name.replaceAll("/", "-")}.mjs`);
    writeFileSync(adapter, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`, { mode: 0o755 });
    return adapter;
  }

  function commit(message: string) {
    expect(git(repository, "add", "--all").status).toBe(0);
    const result = git(repository, "-c", "user.name=MDLM Test", "-c", "user.email=mdlm-test@example.invalid", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "--message", message);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  }

  function next(): Packet {
    const result = mdlm(repository, ["next"]);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const outcome = JSON.parse(result.stdout);
    expect(outcome.outcome, JSON.stringify(outcome, null, 2)).toBe("assignment");
    const prepared = mdlm(repository, ["scenario", "prepare", outcome.assignment.id]);
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    return JSON.parse(prepared.stdout);
  }

  function submitResult(packet: Packet, outputs: ProposalOutput[], authoritySupplies: string[] = []) {
    return mdlm(repository, ["scenario", "submit"], `${JSON.stringify({
      contract: "mdlm-assignment-response@1", assignment: packet.assignment.id, kind: "proposal",
      proposal: {
        outputs, completionEvidence: { summary: "Completed exact Phase 2 work." },
        loadedSkillRefs: packet.prompt.skills.map((skill) => skill.reference),
        authoritySupplies, standingDelegations: [],
      },
    })}\n`);
  }

  function submit(packet: Packet, outputs: ProposalOutput[], authoritySupplies: string[] = []) {
    setInvocations(outputs);
    const result = submitResult(packet, outputs, authoritySupplies);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const execution = JSON.parse(result.stdout).execution;
    commit(`Publish ${packet.scenario.reference}`);
    return execution;
  }

  function inputValues(packet: Packet, name: string) {
    return packet.exactInputs[0]!.inputs.find((input) => input.name === name)!.values;
  }

  function failedPayload(packet: Packet, correctionSet: "subject" | "definition-consistency") {
    const kind = packet.scenario.reference === "simplify-requirement-set@2"
      ? "simplification-requirements"
      : "simplification-architecture-interfaces";
    return {
      title: `Failed ${correctionSet} simplification`, review_kind: kind,
      decomposition_plan_revision: revision(ids.plan),
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      definition_simplification: {
        primary_target: correctionSet === "subject" ? revision(ids.retained) : revision(ids.architecture),
        correction_set: correctionSet,
        primary_findings: [
          { id: "F-001", severity: "blocking", summary: "The exact scope is broader than necessary." },
          { id: "F-002", severity: "blocking", summary: "The definition preserves avoidable complexity." },
        ],
        ...(correctionSet === "definition-consistency" ? {
          collateral_findings: [{ id: "F-003", severity: "blocking", summary: "The exact consistency set must change together." }],
          scope_reduction: { rationale: "The duplicate relay output no longer applies." },
        } : {}),
      },
      outcome: "fail",
    };
  }

  it("keeps several Findings on one SYS subject and rejects cross-subject correction", () => {
    const packet = next();
    expect(["simplify-requirement-set@2", "simplify-architecture-and-interfaces@2"]).toContain(packet.scenario.reference);
    const context = inputValues(packet, "subject_context")[0]!.identity.revision_id;
    const payload = failedPayload(packet, "subject");
    const crossSubject = submitResult(packet, [output("invalid-review", "review", "REV", payload, [
      { type: "reviews", target: context }, { type: "contextualizes", target: context },
      { type: "blocks", target: revision(ids.retained) }, { type: "blocks", target: revision(ids.removed) },
    ])], ["independent-reviewer"]);
    expect(crossSubject.status).toBe(1);
    const failure = submit(packet, [output("failed-review", "review", "REV", payload, [
      { type: "reviews", target: context }, { type: "contextualizes", target: context },
      { type: "blocks", target: revision(ids.retained) },
    ])], ["independent-reviewer"]);
    const failedReview = failure.outputs[0].lifecycleDatum as DatumRef;

    const correction = next();
    expect(correction.scenario.reference).toBe("revise-phase-2-subject-after-simplification@1");
    expect(inputValues(correction, "subject")[0]!.identity.revision_id).toBe(revision(ids.retained));
    expect(inputValues(correction, "failed_review")[0]!.data.payload.definition_simplification.primary_findings).toHaveLength(2);
    const published = submit(correction, [output("replacement", "replacement", "SYS",
      requirementPayload("Export one completed report", revision(ids.architecture)), [
        { type: "derived-from", target: ids.parent }, { type: "decomposes", target: revision(ids.plan) },
        { type: "allocated-to", target: revision(ids.architecture) }, { type: "governed-by", target: revision(ids.interface) },
        { type: "corrects-review", target: failedReview.revisionId },
      ], ids.retained)]);
    expect(published.outputs[0].lifecycleDatum.revisionId).toBe(revision(ids.retained, 2));
    expect(req(repository, "show", revision(ids.removed), "--json").status).toBe(0);
  }, 90_000);

  it("atomically corrects the exact set, removes obsolete scope, requires fresh evidence, and resumes completion", () => {
    let packet = next();
    const context = inputValues(packet, "subject_context")[0]!.identity.revision_id;
    const allOutputRemoval = failedPayload(packet, "definition-consistency");
    const allOutputReduction = allOutputRemoval.definition_simplification.scope_reduction;
    expect(submitResult(packet, [output("invalid-all-output-review", "review", "REV", allOutputRemoval, [
      { type: "reviews", target: context }, { type: "contextualizes", target: context },
      ...initialMembers.map((member) => ({ type: "blocks", target: member })),
      { type: "removes", target: revision(ids.retained) },
      { type: "removes", target: revision(ids.removed) },
    ])], ["independent-reviewer"]).status).toBe(1);
    expect(allOutputReduction).toBeDefined();

    const failure = submit(packet, [output("failed-set-review", "review", "REV", failedPayload(packet, "definition-consistency"), [
      { type: "reviews", target: context }, { type: "contextualizes", target: context },
      ...initialMembers.map((member) => ({ type: "blocks", target: member })),
      { type: "removes", target: revision(ids.removed) },
    ])], ["independent-reviewer"]);
    const failedReview = failure.outputs[0].lifecycleDatum as DatumRef;

    packet = next();
    expect(packet.scenario.reference).toBe("revise-phase-2-definition-set-after-simplification@1");
    const correctedArchitecture = revision(ids.architecture, 2);
    const correctedInterface = revision(ids.interface, 2);
    const correctedPlan = revision(ids.plan, 2);
    const cause = { type: "corrects-review", target: failedReview.revisionId };
    const corrected = [
      output("architecture", "architecture", "ASP", {
        title: "Minimal report architecture", rationale: "One element removes the self-supporting boundary.", level: "system",
        elements: [{ id: "AEL-0EXPRTAP00", alias: "EXPORT", title: "Report export", responsibilities: ["export one report"] }],
        interactions: [], constraints: [], nominated_risks: ["schema drift"],
      }, [{ type: "governs", target: revision(ids.parent) }, { type: "governs", target: "$proposal.plan.revision_id" }, cause], ids.architecture),
      output("interface", "interfaces", "ICSP", {
        title: "Minimal public boundary", rationale: "One controlled boundary remains necessary.", architecture_revision: correctedArchitecture,
        boundary: { from_element: "AEL-0EXPRTAP00", to_element: "AEL-0EXPRTAP00" }, operations: ["POST /exports"], schemas: ["report@1"], units: [], timing: [], errors: ["invalid-report"], security: [], ordering: [], compatibility: ["v1"], interface_version: "1.1.0",
      }, [{ type: "defines-interface-for", target: "$proposal.architecture.revision_id" }, cause], ids.interface),
      output("plan", "plan", "DWP", planPayload(true), [
        { type: "decomposes", target: revision(ids.parent) }, { type: "allocated-to", target: "$proposal.architecture.revision_id" },
        { type: "governed-by", target: "$proposal.interface.revision_id" },
        { type: "verified-under", target: revision(ids.strategy) }, cause,
      ], ids.plan),
      output("requirement", "requirements", "SYS", requirementPayload("Export one completed report", correctedArchitecture), [
        { type: "derived-from", target: ids.parent }, { type: "decomposes", target: "$proposal.plan.revision_id" },
        { type: "allocated-to", target: "$proposal.architecture.revision_id" }, { type: "governed-by", target: "$proposal.interface.revision_id" }, cause,
      ], ids.retained),
    ];
    const stalePayloadReferences = structuredClone(corrected);
    (stalePayloadReferences.find((item) => item.name === "plan")!.lifecycleDatum.payload.interface_context as string[]) = [revision(ids.interface)];
    (stalePayloadReferences.find((item) => item.name === "requirements")!.lifecycleDatum.payload.interface_context as string[]) = [revision(ids.interface)];
    expect(submitResult(packet, stalePayloadReferences).status).toBe(1);
    const correction = submit(packet, corrected);
    for (const published of correction.outputs) {
      const shown = req(repository, "show", published.lifecycleDatum.revisionId, "--json");
      expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
      expect(JSON.parse(shown.stdout).lifecycleDatum.datum.links).toContainEqual(cause);
    }

    const looseEnds = req(repository, "loose-ends", "--phase", "phase-2-system-definition", "--json");
    expect(looseEnds.status, `${looseEnds.stderr}${looseEnds.stdout}`).toBe(0);
    const completion = JSON.parse(looseEnds.stdout).looseEnds.items.find(
      (item: { obligation: string }) => item.obligation === "decomposition-completion-required",
    );
    expect(completion).toEqual(expect.objectContaining({ status: "blocked", dispatchable: false }));

    const correctedRequirement = revision(ids.retained, 2);
    const correctedMembers = [correctedArchitecture, correctedPlan, correctedInterface, correctedRequirement];
    const preReviewedMembers = [correctedArchitecture, correctedInterface, correctedRequirement];
    const preReviewedContexts = preReviewedMembers.map((member, index) => revision(`BSL-0NEWCTX00${index}`));
    seedData(preReviewedMembers.map((member, index) =>
      contextOutput(`fresh-member-${index}`, `BSL-0NEWCTX00${index}`, member, [member])));
    seedReviews(correctedPlan, preReviewedContexts[0]!, preReviewedMembers, preReviewedContexts);
    commit("Publish unaffected fresh corrected definition evidence");

    packet = next();
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(inputValues(packet, "subject")[0]!.identity.revision_id).toBe(correctedPlan);
    expect(inputValues(packet, "context_members").map((member) => member.identity.revision_id)).toEqual([
      correctedArchitecture,
      correctedInterface,
      correctedRequirement,
    ]);
    const planContext = submit(packet, [output("fresh-plan-context", "context", "BSL", {
      title: `Exact Review Context for ${correctedPlan}`,
      kind: "review-context",
      role: "review-context",
      scope: correctedPlan,
      group: "DEFAULT",
      definition_members: correctedMembers,
      evidence: [],
    })]).outputs[0].lifecycleDatum as DatumRef;

    packet = next();
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    expect(inputValues(packet, "subject")[0]!.identity.revision_id).toBe(correctedPlan);
    expect(inputValues(packet, "context_members").map((member) => member.identity.revision_id)).toEqual([
      correctedArchitecture,
      correctedInterface,
      correctedRequirement,
    ]);
    submit(packet, [output("fresh-plan-review", "review", "REV", {
      title: `Passing Review of ${correctedPlan}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@1",
      findings: [],
      outcome: "pass",
    }, [
      { type: "reviews", target: correctedPlan },
      { type: "contextualizes", target: planContext.revisionId },
    ])], ["independent-reviewer"]);

    const remaining = new Set(["simplify-requirement-set@2", "simplify-architecture-and-interfaces@2"]);
    for (let index = 0; index < 2; index += 1) {
      packet = next();
      expect(remaining.delete(packet.scenario.reference)).toBe(true);
      const reviewKind = packet.scenario.reference === "simplify-requirement-set@2"
        ? "simplification-requirements" : "simplification-architecture-interfaces";
      const reviewContext = inputValues(packet, "subject_context")[0]!.identity.revision_id;
      submit(packet, [output(`pass-${index}`, "review", "REV", {
        title: `Passing ${reviewKind}`, review_kind: reviewKind,
        decomposition_plan_revision: correctedPlan,
        rubric_ref: "policies/rubrics/bootstrap-review.md@1", outcome: "pass",
      }, [{ type: "reviews", target: reviewContext }, { type: "contextualizes", target: reviewContext }])], ["independent-reviewer"]);
    }
    packet = next();
    expect(packet.scenario.reference).toBe("complete-decomposition-work-package@2");
    expect(inputValues(packet, "plan")[0]!.identity.revision_id).toBe(correctedPlan);
    expect(req(repository, "show", revision(ids.removed), "--json").status).toBe(0);
  }, 150_000);
});
