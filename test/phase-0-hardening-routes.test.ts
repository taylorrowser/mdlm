import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessPackage,
} from "../src/index.js";
import {
  evaluateProcessDefinition,
  evaluateScenarioParticipation,
} from "../src/evaluator.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";
import {
  copiedProcessPackage,
  suppressPhase0FoundationObligations,
} from "./helpers/process-package.js";
import { req } from "./helpers/req.js";
import { freezeQuestionSource } from "./helpers/source-boundary.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");
const mdlmExecutable = path.join(process.cwd(), "dist/mdlm.js");
const processRef = "mdlm-bootstrap@0.59.0#sha256:phase-0-route-evidence";
const revisionId = (id: string, revision = 1) =>
  `${id}-r${String(revision).padStart(5, "0")}`;

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  options: {
    revision?: number;
    links?: Array<{ type: string; target: string }>;
    scenario?: string;
  } = {},
): LifecycleRecord {
  const result = frozenLifecycleRecord(processRef, type, id, payload, {
    links: options.links ?? [],
    ...(options.scenario ? { scenario: options.scenario } : {}),
  });
  result.datum.revision = options.revision ?? 1;
  result.datum.revision_id = revisionId(id, options.revision ?? 1);
  return result;
}

function contextFor(subject: LifecycleRecord, id: string): LifecycleRecord {
  return record("BSL", id, {
    title: `Exact Review Context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [subject.datum.revision_id],
    evidence: [],
  }, { scenario: "create-review-context@1" });
}

function reviewFor(
  subject: LifecycleRecord,
  id: string,
  outcome: "pass" | "fail",
  options: {
    contextId?: string;
    correctionAuthority?: "stakeholder";
    reviewKind?: "contextual" | "simplification-product-definition";
  } = {},
): [LifecycleRecord, LifecycleRecord] {
  const context = contextFor(
    subject,
    options.contextId ?? id.replace("REV", "BSL"),
  );
  const reviewKind = options.reviewKind ?? "contextual";
  const review = record("REV", id, {
    title: `${outcome === "pass" ? "Passing" : "Failed"} Review of ${subject.datum.revision_id}`,
    review_kind: reviewKind,
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    ...(reviewKind === "simplification-product-definition"
      ? outcome === "fail"
        ? {
            simplification: {
              target: subject.datum.revision_id,
              findings: [{
                id: "F-001",
                severity: "blocking",
                summary: "The exact product definition remains unnecessarily broad.",
              }],
            },
          }
        : {}
      : {
          findings: outcome === "fail"
            ? [{
                id: "F-001",
                target: subject.datum.revision_id,
                relationship: "primary",
                severity: "blocking",
                summary: "Correct the exact reviewed Revision.",
              }]
            : [],
        }),
    ...(options.correctionAuthority
      ? { correction_authority: options.correctionAuthority }
      : {}),
    outcome,
  }, {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: subject.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
      ...(reviewKind === "simplification-product-definition" && outcome === "fail"
        ? [{ type: "blocks", target: subject.datum.revision_id }]
        : []),
    ],
  });
  return [context, review];
}

function phase0Foundation() {
  const map = record("MAP", "MAP-1030000001", {
    title: "Exact Phase 0 frontier",
    purpose: "Bound one complete intent candidate.",
    frontier: ["One operator-visible outcome"],
  }, { scenario: "establish-initial-wayfinding-map@1" });
  const product = record("PSP", "PSP-1030000001", {
    title: "Exact Phase 0 product",
    rationale: "Define the bounded operator outcome.",
    problem: "The operator needs one deterministic outcome.",
    users: ["operator"],
    goals: ["deterministic outcome"],
    non_goals: ["implementation architecture"],
    success_measures: ["the outcome is independently reviewable"],
  }, { scenario: "compile-psp@2" });
  const requirement = record("STK", "STK-1030000001", {
    title: "Deterministic operator outcome",
    rationale: "The exact product intent requires an observable commitment.",
    statement: "The product shall expose one deterministic operator outcome.",
    verification_intent: "Observe the exact public outcome.",
    stakeholder: "operator",
    priority: "must",
  }, {
    scenario: "draft-stakeholder-requirements@2",
    links: [{ type: "derived-from", target: product.datum.id }],
  });
  const members = [map, product, requirement];
  const reviews = members.flatMap((member, index) => reviewFor(
    member,
    `REV-103000000${index + 1}`,
    "pass",
    { contextId: `BSL-103000000${index + 1}` },
  ));
  return { map, product, requirement, members, reviews };
}

function intentCandidate(
  foundation: ReturnType<typeof phase0Foundation>,
  options: { revision?: number; links?: Array<{ type: string; target: string }> } = {},
): LifecycleRecord {
  const memberReviewIds = foundation.reviews
    .filter((item) => item.datum.type === "REV")
    .map((item) => item.datum.revision_id);
  return record("BSL", "BSL-1030000004", {
    title: "Exact Phase 0 intent candidate",
    kind: "intent-level-candidate",
    role: "candidate",
    scope: "product-intent",
    group: "DEFAULT",
    definition_members: foundation.members.map((member) => member.datum.revision_id),
    evidence: memberReviewIds,
  }, {
    ...(options.revision === undefined ? {} : { revision: options.revision }),
    scenario: options.revision && options.revision > 1
      ? "revise-intent-candidate-after-review@3"
      : "create-phase-0-intent-candidate@1",
    ...(options.links === undefined ? {} : { links: options.links }),
  });
}

function passingSimplification(
  candidate: LifecycleRecord,
  id = "REV-1030000004",
): [LifecycleRecord, LifecycleRecord] {
  const context = record("BSL", id.replace("REV", "BSL"), {
    title: "Exact candidate simplification context",
    kind: "review-context",
    role: "review-context",
    scope: candidate.datum.revision_id,
    group: "DEFAULT",
    definition_members: [candidate.datum.revision_id],
    evidence: [],
  }, { scenario: "create-review-context@1" });
  const review = record("REV", id, {
    title: "Passing candidate-centered simplification Review",
    review_kind: "simplification-product-definition",
    rubric_ref: "policies/rubrics/bootstrap-review.md@1",
    outcome: "pass",
  }, {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: candidate.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
  });
  return [context, review];
}

function gateRejection(
  candidate: LifecycleRecord,
  blocker: LifecycleRecord,
): LifecycleRecord[] {
  const rejection = record("DEC", "DEC-1030000001", {
    title: "Reviewed Phase 0 gate rejection",
    rationale: "The exact blocker must be corrected before returning to this gate.",
    kind: "gate-signoff",
    gate_outcome: "reject",
    gate_rejection: {
      findings: [{ id: "G-001", summary: "Correct the exact implicated requirement." }],
    },
    decision: "Reject this exact candidate and correct its blocker.",
    alternatives: ["Approve without correction"],
    effective_scope: candidate.datum.revision_id,
  }, {
    scenario: "record-gate-signoff@3",
    links: [
      { type: "justifies", target: candidate.datum.revision_id },
      { type: "blocks", target: blocker.datum.revision_id },
    ],
  });
  const [context, review] = reviewFor(
    rejection,
    "REV-1030000005",
    "pass",
    { contextId: "BSL-1030000006" },
  );
  return [rejection, context, review];
}

function snapshot(records: LifecycleRecord[], phaseId = "phase-0-wayfinding"): LifecycleSnapshot {
  return { processRef, phaseId, records, dependencyComparisons: [] };
}

function obligation(
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
  name: string,
  subject?: string,
  phaseId = "phase-0-wayfinding",
) {
  return evaluateLifecycle(processPackage, snapshot(records, phaseId)).obligations.find(
    (item) => item.obligation === name && (subject === undefined || item.subject === subject),
  );
}

async function treeDigest(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(path.relative(root, absolute));
    }
  }
  await visit(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file).update("\0").update(await fs.readFile(path.join(root, file)));
  }
  return hash.digest("hex");
}

function mdlm(repository: string, input: string | undefined, ...arguments_: string[]) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
    maxBuffer: 10 * 1024 * 1024,
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

async function adapter(root: string, name: string, response: unknown): Promise<string> {
  const executable = path.join(root, `${name}.mjs`);
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
    { mode: 0o755 },
  );
  return executable;
}

describe("Phase 0 missing hardening routes", () => {
  let processPackage: ProcessPackage;
  const roots: string[] = [];

  beforeAll(async () => {
    const loaded = await loadProcessPackage(bootstrapPackage);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("publishes PSP atomically through compile-psp@2 at the public repository seam and yields fresh PSP Review work", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase0-psp-"));
    roots.push(root);
    const initialized = req(root, "init", "--process", bootstrapPackage, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    const map = req(
      root,
      "new",
      "MAP",
      "--scenario",
      "establish-initial-wayfinding-map@1",
      "--set",
      "title=Exact public PSP frontier",
      "--set",
      "purpose=Exercise PSP publication through one repository transaction",
      "--set",
      'frontier=["publish one exact product specification"]',
      "--json",
    );
    expect(map.status, `${map.stderr}${map.stdout}`).toBe(0);

    const projected = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(projected.status, projected.stderr).toBe(0);
    const productWork = JSON.parse(projected.stdout).looseEnds.items.find(
      (item: { obligation: string }) => item.obligation === "product-specification-required",
    ) as { id: string } | undefined;
    expect(productWork).toEqual(expect.objectContaining({
      id: expect.any(String),
      status: "ready",
      actionableResolver: "compile-psp@2",
    }));

    const response = (successMeasures: string[]) => ({
      outputs: [{
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          id: "PSP-1030000098",
          type: "PSP",
          payload: {
            title: "Exact publicly compiled product specification",
            rationale: "Publish product intent through the compiled repository command.",
            problem: "The public PSP route needs literal executable evidence.",
            users: ["operator"],
            goals: ["publish one exact PSP atomically"],
            non_goals: ["direct lifecycle data mutation"],
            success_measures: successMeasures,
          },
          links: [],
          body: "One exact product specification published through compile-psp@2.\n",
        },
      }],
      completionEvidence: { summary: "The exact PSP was compiled." },
    });
    const dataRoot = path.join(root, ".lifecycle/data");
    const beforeInvalid = await treeDigest(dataRoot);
    const invalidAdapter = await adapter(root, "invalid-psp", response([]));
    const invalid = req(
      root,
      "scenario",
      "execute",
      "compile-psp@2",
      "--obligation",
      productWork!.id,
      "--adapter",
      invalidAdapter,
      "--json",
    );
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-output-schema-invalid" }),
    ]));
    expect(await treeDigest(dataRoot)).toBe(beforeInvalid);

    const validAdapter = await adapter(
      root,
      "valid-psp",
      response(["fresh PSP Review work follows publication"]),
    );
    const valid = req(
      root,
      "scenario",
      "execute",
      "compile-psp@2",
      "--obligation",
      productWork!.id,
      "--adapter",
      validAdapter,
      "--json",
    );
    expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
    const execution = JSON.parse(valid.stdout).execution;
    expect(execution).toEqual(expect.objectContaining({
      definition: expect.objectContaining({ scenario: "compile-psp@2" }),
      completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      outputs: [expect.objectContaining({
        name: "product_specification",
        lifecycleDatum: expect.objectContaining({
          id: "PSP-1030000098",
          revisionId: "PSP-1030000098-r00001",
          type: "PSP",
        }),
      })],
    }));
    const shown = req(root, "show", "PSP-1030000098-r00001", "--json");
    expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
    expect(JSON.parse(shown.stdout).lifecycleDatum).toMatchObject({
      datum: {
        revision_id: "PSP-1030000098-r00001",
        type: "PSP",
        created_by: { scenario: "compile-psp@2" },
        payload: {
          title: "Exact publicly compiled product specification",
          success_measures: ["fresh PSP Review work follows publication"],
        },
      },
      integrity: { scenario_execution_valid: true },
    });
    const after = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(after.status, after.stderr).toBe(0);
    expect(JSON.parse(after.stdout).looseEnds.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "review-context-required",
        subject: "PSP-1030000098-r00001",
        status: "ready",
        actionableResolver: "create-review-context@1",
      }),
    ]));
  }, 30_000);

  it("publishes STK through draft-stakeholder-requirements atomically and yields fresh STK Review work", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase0-stk-"));
    roots.push(root);
    const initialized = req(root, "init", "--process", bootstrapPackage, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    const packageDigest = JSON.parse(initialized.stdout).package.digest as string;
    const created = req(
      root,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Exact public STK route",
      "--set",
      "rationale=Exercise one real repository transaction",
      "--set",
      "problem=Stakeholder intent needs an exact commitment",
      "--set",
      'users=["operator"]',
      "--set",
      'goals=["publish one exact STK"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["fresh Review work follows"]',
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    const product = JSON.parse(created.stdout).created as {
      id: string;
      revisionId: string;
    };
    const obligationId =
      `stakeholder-requirements-required@1:${product.revisionId}:mdlm-bootstrap@0.59.0#${packageDigest}`;
    const response = (target: string) => ({
      outputs: [{
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          id: "STK-1030000099",
          type: "STK",
          payload: {
            title: "Exact public stakeholder requirement",
            rationale: "Bind one stakeholder-visible outcome to the governing PSP.",
            statement: "The product shall publish one exact operator outcome.",
            verification_intent: "Observe the exact public outcome.",
            stakeholder: "operator",
            priority: "must",
          },
          links: [{ type: "derived-from", target }],
          body: "One exact stakeholder-visible commitment.\n",
        },
      }],
      completionEvidence: { summary: "The exact STK was drafted." },
    });
    const dataRoot = path.join(root, ".lifecycle/data");
    const beforeInvalid = await treeDigest(dataRoot);
    const invalidAdapter = await adapter(root, "invalid-stk", response("PSP-0000000000"));
    const invalid = req(
      root,
      "scenario",
      "execute",
      "draft-stakeholder-requirements@2",
      "--obligation",
      obligationId,
      "--adapter",
      invalidAdapter,
      "--json",
    );
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-output-required-link-missing" }),
    ]));
    expect(await treeDigest(dataRoot)).toBe(beforeInvalid);

    const validAdapter = await adapter(root, "valid-stk", response(product.id));
    const valid = req(
      root,
      "scenario",
      "execute",
      "draft-stakeholder-requirements@2",
      "--obligation",
      obligationId,
      "--adapter",
      validAdapter,
      "--json",
    );
    expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
    const output = JSON.parse(valid.stdout);
    const requirement = output.execution.outputs[0].lifecycleDatum;
    expect(output.execution).toEqual(expect.objectContaining({
      definition: expect.objectContaining({
        scenario: "draft-stakeholder-requirements@2",
      }),
      completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
    }));
    expect(output.execution.outputs[0].data.links).toContainEqual({
      type: "derived-from",
      target: product.id,
    });
    const looseEnds = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(looseEnds.status, looseEnds.stderr).toBe(0);
    expect(JSON.parse(looseEnds.stdout).looseEnds.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "review-context-required",
        subject: requirement.revisionId,
        status: "ready",
        actionableResolver: "create-review-context@1",
      }),
    ]));
  }, 30_000);

  it("creates only a complete reviewed Phase 0 intent candidate and then yields fresh candidate Review work", () => {
    const foundation = phase0Foundation();
    const records = [...foundation.members, ...foundation.reviews];
    expect(obligation(
      processPackage,
      records,
      "intent-candidate-required",
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-phase-0-intent-candidate@1",
    }));

    const incomplete = intentCandidate(foundation);
    incomplete.datum.payload.definition_members = foundation.members.slice(0, 2)
      .map((member) => member.datum.revision_id);
    expect(obligation(
      processPackage,
      [...records, incomplete],
      "intent-candidate-required",
    )?.satisfied).toBe(false);

    const candidate = intentCandidate(foundation);
    const complete = evaluateLifecycle(processPackage, snapshot([...records, candidate]));
    expect(complete.obligations.find((item) =>
      item.obligation === "intent-candidate-required"
    )).toEqual(expect.objectContaining({ satisfied: true, status: "satisfied" }));
    expect(candidate.datum.payload).toMatchObject({
      definition_members: foundation.members.map((member) => member.datum.revision_id),
      evidence: foundation.reviews
        .filter((item) => item.datum.type === "REV")
        .map((item) => item.datum.revision_id),
    });
    expect(complete.looseEnds.find((item) =>
      item.obligation === "review-context-required" &&
      item.subject === candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "create-review-context@1",
    }));
  });

  it("publishes a complete candidate atomically through create-phase-0-intent-candidate with exact frozen membership", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase0-candidate-"));
    roots.push(root);
    const initialized = req(root, "init", "--process", bootstrapPackage, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);

    const create = (arguments_: string[]) => {
      const result = req(root, ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as { id: string; revisionId: string };
    };
    const map = create([
      "new", "MAP", "--scenario", "establish-initial-wayfinding-map@1",
      "--set", "title=Public candidate frontier",
      "--set", "purpose=Freeze exact reviewed Phase 0 membership",
      "--set", 'frontier=["one exact product commitment"]',
    ]);
    const product = create([
      "new", "PSP", "--scenario", "compile-psp@2",
      "--set", "title=Public candidate product",
      "--set", "rationale=Exercise exact candidate publication",
      "--set", "problem=Candidate membership must be complete",
      "--set", 'users=["operator"]',
      "--set", 'goals=["freeze exact membership"]',
      "--set", "non_goals=[]",
      "--set", 'success_measures=["incomplete membership is rejected"]',
    ]);
    const requirement = create([
      "new", "STK", "--scenario", "draft-stakeholder-requirements@2",
      "--set", "title=Public candidate requirement",
      "--set", "rationale=Retain one exact stakeholder commitment",
      "--set", "statement=The product shall freeze complete reviewed intent.",
      "--set", "verification_intent=Inspect exact candidate membership.",
      "--set", "stakeholder=operator",
      "--set", "priority=must",
      "--link", `derived-from=${product.id}`,
    ]);
    const subjects = [map, product, requirement];
    const reviews: string[] = [];
    for (const [index, subject] of subjects.entries()) {
      const context = create([
        "baseline", "create", "--type", "BSL",
        "--scenario", "create-review-context@1",
        "--set", `title=Public candidate member context ${index + 1}`,
        "--set", "kind=review-context",
        "--set", "role=review-context",
        "--set", `scope=${subject.revisionId}`,
        "--set", "group=phase-0-wayfinding",
      ]);
      const added = req(root, "baseline", "add", context.id, subject.revisionId, "--json");
      expect(added.status, `${added.stderr}${added.stdout}`).toBe(0);
      const frozen = req(root, "baseline", "freeze", context.id, "--json");
      expect(frozen.status, `${frozen.stderr}${frozen.stdout}`).toBe(0);
      const projected = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
      expect(projected.status, projected.stderr).toBe(0);
      const reviewWork = JSON.parse(projected.stdout).looseEnds.items.find(
        (item: { obligation: string; subject: string }) =>
          item.obligation === "passing-review-required" &&
          item.subject === subject.revisionId,
      ) as { id: string } | undefined;
      expect(reviewWork).toBeDefined();
      const reviewAdapter = await adapter(root, `candidate-member-review-${index}`, {
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            id: `REV-103000009${index}`,
            type: "REV",
            payload: {
              title: `Passing public candidate member Review ${index + 1}`,
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: subject.revisionId },
              { type: "contextualizes", target: context.revisionId },
            ],
            body: "The exact candidate member passes independent Review.\n",
          },
        }],
        completionEvidence: { summary: "Independent member Review passed." },
      });
      const reviewed = req(
        root,
        "scenario", "execute", "review-datum-in-context@2",
        "--obligation", reviewWork!.id,
        "--authorize", "independent-reviewer",
        "--adapter", reviewAdapter,
        "--input", `subject=${subject.revisionId}`,
        "--input", `review_context=${context.revisionId}`,
        "--json",
      );
      expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
      reviews.push(JSON.parse(reviewed.stdout).execution.outputs[0].lifecycleDatum.revisionId);
    }

    const projected = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(projected.status, projected.stderr).toBe(0);
    const candidateWork = JSON.parse(projected.stdout).looseEnds.items.find(
      (item: { obligation: string }) => item.obligation === "intent-candidate-required",
    ) as { id: string } | undefined;
    expect(candidateWork).toBeDefined();
    const candidateResponse = (members: string[]) => ({
      outputs: [{
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          id: "BSL-1030000099",
          type: "BSL",
          payload: {
            title: "Public exact Phase 0 candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "public-candidate-route",
            group: "DEFAULT",
            definition_members: members,
            evidence: reviews,
          },
          links: [],
          body: "The complete exact reviewed foundation is frozen.\n",
        },
      }],
      completionEvidence: { summary: "Exact intent candidate frozen." },
    });
    const dataRoot = path.join(root, ".lifecycle/data");
    const beforeInvalid = await treeDigest(dataRoot);
    const invalidAdapter = await adapter(
      root,
      "incomplete-candidate",
      candidateResponse(subjects.slice(0, 2).map((subject) => subject.revisionId)),
    );
    const invalid = req(
      root,
      "scenario", "execute", "create-phase-0-intent-candidate@1",
      "--obligation", candidateWork!.id,
      "--adapter", invalidAdapter,
      "--json",
    );
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]));
    expect(await treeDigest(dataRoot)).toBe(beforeInvalid);

    const validAdapter = await adapter(
      root,
      "complete-candidate",
      candidateResponse(subjects.map((subject) => subject.revisionId)),
    );
    const valid = req(
      root,
      "scenario", "execute", "create-phase-0-intent-candidate@1",
      "--obligation", candidateWork!.id,
      "--adapter", validAdapter,
      "--json",
    );
    expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
    const execution = JSON.parse(valid.stdout).execution;
    expect(execution.outputs[0].data.payload).toMatchObject({
      definition_members: subjects.map((subject) => subject.revisionId),
      evidence: reviews,
    });
    expect(execution.outputs[0].data.payload.snapshot).toEqual(expect.objectContaining({
      member_hashes: expect.any(Object),
      resolved_links: expect.any(Object),
      process_provenance: expect.any(Object),
    }));
    const candidateRevision = execution.outputs[0].lifecycleDatum.revisionId;
    const after = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(after.status, after.stderr).toBe(0);
    expect(JSON.parse(after.stdout).looseEnds.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "review-context-required",
        subject: candidateRevision,
        status: "ready",
      }),
    ]));
  }, 90_000);

  it("routes an initial failed foundation Review to the first autonomous correction with exact evidence", async () => {
    const subject = phase0Foundation().requirement;
    const [context, failed] = reviewFor(subject, "REV-1030000010", "fail");
    const records = [subject, context, failed];
    const correction = obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      subject.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(correction).not.toHaveProperty("participation");
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "revise-foundation-after-review@5",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "failed_reviews"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      failed.datum.revision_id,
    ]);
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "prior_failed_reviews"
    )?.values).toEqual([]);
  });

  it("keeps the second autonomous foundation correction dispatchable after the first replacement fails fresh Review", async () => {
    const original = phase0Foundation().requirement;
    const [context1, failure1] = reviewFor(original, "REV-1030000011", "fail");
    const replacement = record("STK", original.datum.id, {
      ...original.datum.payload,
      title: "First exact corrected requirement",
    }, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: "PSP-1030000001" },
        { type: "corrects-review", target: failure1.datum.revision_id },
      ],
    });
    const [context2, failure2] = reviewFor(replacement, "REV-1030000012", "fail");
    const records = [original, context1, failure1, replacement, context2, failure2];
    const correction = obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      replacement.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      original.datum.revision_id,
    )).toBeUndefined();
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "revise-foundation-after-review@5",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const inputs = prepared.value.invocations[0]!.inputs;
    expect(inputs.find((input) => input.name === "prior_failed_reviews")?.values.map(
      (value) => value.identity.revision_id,
    )).toEqual([failure1.datum.revision_id]);
    expect(inputs.find((input) => input.name === "failed_reviews")?.values.map(
      (value) => value.identity.revision_id,
    )).toEqual([failure2.datum.revision_id]);
  });

  it("exhausts foundation correction after the second replacement and permits no third autonomous cycle", async () => {
    const original = phase0Foundation().requirement;
    const [context1, failure1] = reviewFor(original, "REV-1030000013", "fail");
    const first = record("STK", original.datum.id, original.datum.payload, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: "PSP-1030000001" },
        { type: "corrects-review", target: failure1.datum.revision_id },
      ],
    });
    const [context2, failure2] = reviewFor(first, "REV-1030000014", "fail");
    const second = record("STK", original.datum.id, original.datum.payload, {
      revision: 3,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: "PSP-1030000001" },
        { type: "corrects-review", target: failure1.datum.revision_id },
        { type: "corrects-review", target: failure2.datum.revision_id },
      ],
    });
    const beforeFinalFailure = [original, context1, failure1, first, context2, failure2, second];
    expect(obligation(
      processPackage,
      beforeFinalFailure,
      "review-context-required",
      second.datum.revision_id,
    )).toEqual(expect.objectContaining({ status: "ready" }));
    const [context3, failure3] = reviewFor(second, "REV-1030000015", "fail");
    const records = [...beforeFinalFailure, context3, failure3];
    expect(obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      second.datum.revision_id,
    )).toBeUndefined();
    const escalation = obligation(
      processPackage,
      records,
      "foundation-review-escalation-required",
      second.datum.revision_id,
    );
    expect(escalation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "escalate-foundation-review-correction@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    expect(escalation).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "escalate-foundation-review-correction@2",
      escalation!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "lineage"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      original.datum.revision_id,
      first.datum.revision_id,
      second.datum.revision_id,
    ]);
  });

  it("routes a stakeholder-owned foundation failure immediately to attended escalation without spending an autonomous cycle", () => {
    const subject = phase0Foundation().requirement;
    const [context, failed] = reviewFor(subject, "REV-1030000016", "fail", {
      correctionAuthority: "stakeholder",
    });
    const records = [subject, context, failed];
    expect(obligation(
      processPackage,
      records,
      "foundation-review-correction-required",
      subject.datum.revision_id,
    )).toBeUndefined();
    expect(obligation(
      processPackage,
      records,
      "foundation-review-escalation-required",
      subject.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      actionableResolver: "escalate-foundation-review-correction@2",
      explanation: expect.stringMatching(/stakeholder attention.*immediately/i),
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
  });

  it("returns a passing candidate-centered simplification Review to attended Phase 0 gate sign-off", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    const simplification = passingSimplification(candidate);
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      ...simplification,
    ];
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "valid-product-simplification-reviews@1",
      { review: simplification[1].datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: candidate.datum.revision_id,
      }) }),
    ]);
    expect(evaluation.obligations.some((item) =>
      [
        "foundation-review-correction-required",
        "intent-candidate-review-correction-required",
      ].includes(item.obligation)
    )).toBe(false);
    expect(evaluation.obligations.find((item) =>
      item.obligation === "candidate-gate-signoff" &&
      item.subject === candidate.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@3",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      })],
    }));
    for (const member of foundation.members) {
      expect(evaluation.artifacts[member.datum.revision_id]?.states.validity).toBe("valid");
    }
  });

  it("publishes an empirical QST answer with no DEC through resolve-question@2", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase0-empirical-answer-"));
    roots.push(root);
    const initialized = req(root, "init", "--process", bootstrapPackage, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);

    const created = req(
      root,
      "new",
      "QST",
      "--scenario",
      "resolve-question@2",
      "--set",
      "title=Exact empirical repository answer",
      "--set",
      "kind=empirical",
      "--set",
      "evidence_available=true",
      "--set",
      "question=Does the observed public transaction preserve exact QST lineage?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The empirical route remains unproven without publication",
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    const question = JSON.parse(created.stdout).created as {
      id: string;
      revisionId: string;
    };
    await freezeQuestionSource(root, question.revisionId);

    const projected = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(projected.status, projected.stderr).toBe(0);
    const answerWork = JSON.parse(projected.stdout).looseEnds.items.find(
      (item: { obligation: string; subject: string }) =>
        item.obligation === "open-question-resolution" &&
        item.subject === question.revisionId,
    ) as { id: string } | undefined;
    expect(answerWork).toEqual(expect.objectContaining({
      id: expect.any(String),
      status: "ready",
      actionableResolver: "resolve-question@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "autonomous",
          authority: "evidence-authority",
        }),
      })],
    }));

    const answerAdapter = await adapter(root, "empirical-answer-without-dec", {
      outputs: [{
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: question.id,
          type: "QST",
          payload: {
            title: "Exact empirical repository answer",
            kind: "empirical",
            evidence_available: true,
            question: "Does the observed public transaction preserve exact QST lineage?",
            state: "answered",
            blocking_impact: "The empirical route remains unproven without publication",
          },
          links: [],
          body: "The observed public transaction preserves exact QST lineage.\n",
        },
      }],
      completionEvidence: {
        summary: "Exact available evidence answered the empirical Question without a Decision.",
      },
    });
    const answered = req(
      root,
      "scenario",
      "execute",
      "resolve-question@2",
      "--obligation",
      answerWork!.id,
      "--adapter",
      answerAdapter,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );
    expect(answered.status, `${answered.stderr}${answered.stdout}`).toBe(0);
    const execution = JSON.parse(answered.stdout).execution;
    expect(execution).toEqual(expect.objectContaining({
      definition: expect.objectContaining({ scenario: "resolve-question@2" }),
      completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      outputs: [expect.objectContaining({
        name: "updated_question",
        lifecycleDatum: expect.objectContaining({
          id: question.id,
          revisionId: `${question.id}-r00002`,
          type: "QST",
        }),
      })],
    }));
    expect(execution.outputs.some((output: { lifecycleDatum: { type: string } }) =>
      output.lifecycleDatum.type === "DEC"
    )).toBe(false);

    const listed = req(root, "list", "--json");
    expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
    const published = JSON.parse(listed.stdout).data as Array<{
      lifecycleDatum: { datum: LifecycleRecord["datum"] };
    }>;
    expect(published.find((item) => item.lifecycleDatum.datum.id === question.id)?.lifecycleDatum)
      .toMatchObject({
        datum: {
          id: question.id,
          revision: 2,
          revision_id: `${question.id}-r00002`,
          type: "QST",
          payload: { kind: "empirical", state: "answered" },
          created_by: { scenario: "resolve-question@2" },
        },
        integrity: { scenario_execution_valid: true },
      });
    expect(published.filter((item) => item.lifecycleDatum.datum.type === "DEC")).toEqual([]);
    const after = req(root, "loose-ends", "--phase", "phase-0-wayfinding", "--json");
    expect(after.status, after.stderr).toBe(0);
    expect(JSON.parse(after.stdout).looseEnds.items.some(
      (item: { obligation: string; subject: string }) =>
        item.obligation === "open-question-resolution" &&
        [question.revisionId, `${question.id}-r00002`].includes(item.subject),
    )).toBe(false);
  }, 45_000);

  it("resolves a source-bounded prototype Question only with the exact ART bounded DEC and same-lineage answer", async () => {
    const question = record("QST", "QST-1030000001", {
      title: "Bounded prototype question",
      kind: "empirical",
      question: "Does the exact prototype support the declared outcome?",
      state: "open",
      blocking_impact: "The bounded outcome remains unknown.",
      resolution_evidence: "prototype",
      prototype_evidence: {
        repository_ref: `git:${"a".repeat(40)}`,
        supported_behavior: ["declared outcome"],
        unsupported_behavior: ["all other outcomes"],
        finding_if_supported: "supported",
        finding_if_not_supported: "not-supported",
      },
    }, { scenario: "freeze-source-boundary@1" });
    const boundary = record("BSL", "BSL-1030000007", {
      title: "Exact prototype Question source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: question.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [question.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const records = [question, boundary];
    const route = obligation(
      processPackage,
      records,
      "prototype-question-resolution",
      question.datum.revision_id,
    );
    expect(route).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "resolve-question-with-prototype@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "autonomous",
          authority: "evidence-authority",
        }),
      })],
    }));
    expect(route).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "resolve-question-with-prototype@2",
      route!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);

    const prototype = record("ART", "ART-1030000001", {
      title: "Exact bounded prototype",
      kind: "prototype",
      repository_ref: `git:${"a".repeat(40)}`,
      supported_behavior: ["declared outcome"],
      unsupported_behavior: ["all other outcomes"],
    }, {
      scenario: "resolve-question-with-prototype@2",
      links: [{ type: "derived-from", target: question.datum.revision_id }],
    });
    const answered = record("QST", question.datum.id, {
      ...question.datum.payload,
      state: "answered",
    }, { revision: 2, scenario: "resolve-question-with-prototype@2" });
    const finding = record("DEC", "DEC-1030000002", {
      title: "Bounded prototype finding",
      rationale: "The exact repository evidence supports one predeclared finding.",
      kind: "decision",
      decision: "supported",
      alternatives: ["not-supported"],
      effective_scope: `git:${"a".repeat(40)}`,
    }, {
      scenario: "resolve-question-with-prototype@2",
      links: [
        { type: "resolves", target: question.datum.revision_id },
        { type: "justifies", target: prototype.datum.revision_id },
      ],
    });
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    formatsPlugin.default(ajv);
    for (const output of [prototype, finding, answered]) {
      const resolved = resolveType(processPackage, output.datum.type);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(ajv.compile(resolved.type.payloadSchema)(output.datum.payload)).toBe(true);
      }
    }
    const completed = evaluateLifecycle(
      processPackage,
      snapshot([...records, prototype, finding, answered]),
    );
    expect(completed.obligations.some((item) =>
      item.obligation === "prototype-question-resolution" && !item.satisfied
    )).toBe(false);
    expect(completed.looseEnds.some((item) =>
      item.subject === question.datum.revision_id
    )).toBe(false);
  });

  it("keeps a source-bounded unavailable-evidence Question unchanged and attended-delegable for a deliberate fresh allocation", () => {
    const question = record("QST", "QST-1030000002", {
      title: "Unavailable empirical evidence",
      kind: "empirical",
      question: "Can the evidence provider establish the exact outcome?",
      state: "open",
      blocking_impact: "The evidence is currently unavailable.",
      evidence_available: false,
    }, { scenario: "resolve-question@2" });
    const boundary = record("BSL", "BSL-1030000008", {
      title: "Unavailable evidence source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: question.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [question.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const records = [question, boundary];
    const before = structuredClone(records);
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "open-question-resolution" &&
      item.subject === question.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "resolve-question@2",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "evidence-provider",
          delegationAllowed: true,
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(records).toEqual(before);
    expect(records.filter((item) => item.datum.type !== "QST" && item.datum.type !== "BSL"))
      .toEqual([]);
  });

  it("abandons a source-bounded unavailable-evidence Assignment without publication and requires deliberate fresh attention", async () => {
    const repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase0-inability-"));
    roots.push(repository);
    const processRoot = await copiedProcessPackage("mdlm-phase0-inability-process-");
    await suppressPhase0FoundationObligations(processRoot);
    const initialized = req(repository, "init", "--process", processRoot, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    const created = req(
      repository,
      "new", "QST",
      "--scenario", "resolve-question@2",
      "--set", "title=Unavailable exact evidence",
      "--set", "kind=empirical",
      "--set", "evidence_available=false",
      "--set", "question=Can the evidence provider establish the exact outcome?",
      "--set", "state=open",
      "--set", "blocking_impact=The still-open Question awaits exact evidence",
      "--json",
    );
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    const question = JSON.parse(created.stdout).created as { revisionId: string };
    await freezeQuestionSource(repository, question.revisionId);
    expect(git(repository, "init").status).toBe(0);
    expect(git(repository, "add", ".lifecycle").status).toBe(0);
    expect(git(
      repository,
      "-c", "user.name=MDLM Test",
      "-c", "user.email=mdlm-test@example.invalid",
      "commit", "-m", "Prepare unavailable evidence Question",
    ).status).toBe(0);

    const first = mdlm(repository, undefined, "next");
    expect(first.status, `${first.stderr}${first.stdout}`).toBe(0);
    const allocated = JSON.parse(first.stdout);
    expect(allocated).toEqual(expect.objectContaining({
      outcome: "attention-required",
      assignment: { id: expect.any(String) },
      authorityRequirement: {
        mode: "attended",
        authority: "evidence-provider",
        delegationAllowed: true,
      },
    }));
    const before = await treeDigest(path.join(repository, ".lifecycle/data"));
    const unable = {
      contract: "mdlm-assignment-response@1",
      assignment: allocated.assignment.id,
      kind: "unable",
      unable: {
        reason: "insufficient-declared-inputs",
        diagnostics: [{
          code: "unavailable-evidence",
          message: "The evidence provider cannot obtain the exact evidence.",
          path: "assignment",
        }],
      },
    };
    const submitted = mdlm(
      repository,
      `${JSON.stringify(unable)}\n`,
      "scenario", "submit",
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    expect(JSON.parse(submitted.stdout)).toEqual(expect.objectContaining({
      disposition: "abandoned",
      orchestration: { action: "stop", automaticReplacement: false },
      unable: unable.unable,
    }));
    expect(await treeDigest(path.join(repository, ".lifecycle/data"))).toBe(before);
    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease).toEqual(expect.objectContaining({
      id: allocated.assignment.id,
      disposition: "abandoned",
    }));

    const fresh = mdlm(repository, undefined, "next");
    expect(fresh.status, `${fresh.stderr}${fresh.stdout}`).toBe(0);
    expect(JSON.parse(fresh.stdout)).toEqual(expect.objectContaining({
      outcome: "attention-required",
      assignment: { id: expect.not.stringMatching(allocated.assignment.id) },
      authorityRequirement: expect.objectContaining({ authority: "evidence-provider" }),
    }));
  }, 45_000);

  it("keeps a preferential answer unsatisfied until its exact scoped Decision passes fresh Review", () => {
    const source = record("QST", "QST-1030000003", {
      title: "Preferential export question",
      kind: "preferential",
      question: "Which exact export should remain?",
      state: "open",
      blocking_impact: "The product scope depends on the answer.",
    }, { scenario: "resolve-question@2" });
    const boundary = record("BSL", "BSL-1030000009", {
      title: "Preferential source boundary",
      kind: "source-boundary",
      role: "source-boundary",
      scope: source.datum.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [source.datum.revision_id],
      evidence: [],
    }, { scenario: "freeze-source-boundary@1" });
    boundary.integrity.scenario_execution_valid = true;
    const answered = record("QST", source.datum.id, {
      ...source.datum.payload,
      state: "answered",
    }, { revision: 2, scenario: "resolve-question@2" });
    const decision = record("DEC", "DEC-1030000003", {
      title: "Exact preferential scope Decision",
      rationale: "The stakeholder selected the smallest sufficient export.",
      kind: "scope",
      decision: "Retain CSV only.",
      alternatives: ["Retain every export"],
      effective_scope: answered.datum.revision_id,
    }, {
      scenario: "resolve-question@2",
      links: [
        { type: "resolves", target: source.datum.revision_id },
        { type: "resolves", target: answered.datum.revision_id },
      ],
    });
    const beforeReview = [source, boundary, answered, decision];
    expect(obligation(
      processPackage,
      beforeReview,
      "open-question-resolution",
      answered.datum.revision_id,
    )).toEqual(expect.objectContaining({
      satisfied: false,
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
    const selectedBefore = evaluateProcessDefinition(
      processPackage,
      snapshot(beforeReview),
      "selector",
      "applicable-question-answers-for@1",
      { question: answered.datum.revision_id },
    );
    expect(selectedBefore.result).toEqual([]);

    const [context, review] = reviewFor(decision, "REV-1030000017", "pass", {
      contextId: "BSL-1030000010",
    });
    const afterReview = [...beforeReview, context, review];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(afterReview),
      "selector",
      "applicable-question-answers-for@1",
      { question: answered.datum.revision_id },
    ).result).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: decision.datum.revision_id,
      }) }),
    ]);
    expect(evaluateLifecycle(processPackage, snapshot(afterReview)).obligations.some(
      (item) => item.obligation === "open-question-resolution" && !item.satisfied,
    )).toBe(false);
  });

  it("routes a failed change-disposition Review to immediate attended same-lineage correction", async () => {
    const problem = record("PRB", "PRB-1030000001", {
      title: "Exact change problem",
      rationale: "Preserve the observed change trigger.",
      observation: "The accepted requirement needs a bounded change.",
      expected: "The exact accepted behavior remains coherent.",
      severity: "major",
    });
    const change = record("CHG", "CHG-1030000001", {
      title: "Exact bounded change",
      rationale: "Correct one accepted requirement.",
      scope: "one accepted requirement",
      planned_changes: ["replace the exact requirement"],
      implementation_order: "requirements -> context -> reviews -> baselines -> verification",
      closure_criteria: ["fresh exact evidence passes"],
    }, {
      scenario: "analyze-change-impact@2",
      links: [{ type: "derived-from", target: problem.datum.revision_id }],
    });
    const decision = record("DEC", "DEC-1030000004", {
      title: "Failed change disposition",
      rationale: "Exercise renewed attended judgment.",
      kind: "change-approval",
      change_disposition: "reject",
      decision: "Reject the current change plan.",
      alternatives: ["Approve the current plan"],
      effective_scope: change.datum.revision_id,
    }, {
      scenario: "approve-change-request@3",
      links: [{ type: "justifies", target: change.datum.revision_id }],
    });
    const [context, failed] = reviewFor(decision, "REV-1030000018", "fail", {
      contextId: "BSL-1030000011",
    });
    const records = [problem, change, decision, context, failed];
    const correction = obligation(
      processPackage,
      records,
      "change-disposition-review-correction-required",
      decision.datum.revision_id,
      "phase-7-change-control",
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-change-disposition-after-review@1",
      participation: [expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
        attentionSchedule: expect.objectContaining({ timing: "immediate" }),
      })],
    }));
    expect(correction).toBeDefined();
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records, "phase-7-change-control"),
      "revise-change-disposition-after-review@1",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const inputs = prepared.value.invocations[0]!.inputs;
    expect(inputs.find((input) => input.name === "decision")?.values[0]?.identity.revision_id)
      .toBe(decision.datum.revision_id);
    expect(inputs.find((input) => input.name === "change")?.values[0]?.identity.revision_id)
      .toBe(change.datum.revision_id);
    expect(inputs.find((input) => input.name === "target")?.values[0]?.identity.revision_id)
      .toBe(change.datum.revision_id);
    expect(inputs.find((input) => input.name === "failed_reviews")?.values[0]?.identity.revision_id)
      .toBe(failed.datum.revision_id);
  });

  it("keeps a reviewed exact Phase 0 gate rejection nonterminal and dispatches causal correction", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    const simplification = passingSimplification(candidate);
    const rejection = gateRejection(candidate, foundation.requirement);
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      ...simplification,
      ...rejection,
    ];
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluation.phase?.gate.evaluations[0]).toEqual(expect.objectContaining({
      complete: false,
      status: "blocked",
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(evaluation.obligations.find((item) =>
      item.obligation === "foundation-review-correction-required" &&
      item.subject === foundation.requirement.datum.revision_id
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(evaluation.terminalOutcome?.outcome).not.toBe("process-dead-end");
  });

  it("returns corrected and freshly reviewed Phase 0 evidence to the same gate without reusing the rejected sign-off", () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    const simplification = passingSimplification(candidate);
    const rejectionRecords = gateRejection(candidate, foundation.requirement);
    const rejection = rejectionRecords[0]!;
    const correctedRequirement = record("STK", foundation.requirement.datum.id, {
      ...foundation.requirement.datum.payload,
      title: "Corrected deterministic operator outcome",
    }, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [
        { type: "derived-from", target: foundation.product.datum.id },
        { type: "corrects-gate-rejection", target: rejection.datum.revision_id },
      ],
    });
    const [correctedContext, correctedReview] = reviewFor(
      correctedRequirement,
      "REV-1030000019",
      "pass",
      { contextId: "BSL-1030000012" },
    );
    const correctedFoundation = {
      ...foundation,
      requirement: correctedRequirement,
      members: [foundation.map, foundation.product, correctedRequirement],
      reviews: [
        ...foundation.reviews,
        correctedContext,
        correctedReview,
      ],
    };
    const superseding = intentCandidate(correctedFoundation, {
      revision: 2,
      links: [
        { type: "supersedes", target: candidate.datum.revision_id },
        { type: "corrects-gate-rejection", target: rejection.datum.revision_id },
      ],
    });
    const freshSimplification = passingSimplification(superseding, "REV-1030000020");
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      ...simplification,
      ...rejectionRecords,
      correctedRequirement,
      correctedContext,
      correctedReview,
      superseding,
      ...freshSimplification,
    ];
    const evaluation = evaluateLifecycle(processPackage, snapshot(records));
    expect(evaluation.phase?.gate.evaluations).toEqual([
      expect.objectContaining({
        candidate: expect.objectContaining({ identity: expect.objectContaining({
          revision_id: superseding.datum.revision_id,
        }) }),
        complete: false,
        status: "ready",
        actionableResolver: "record-gate-signoff@3",
        dispatchable: true,
      }),
    ]);
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "applicable-gate-signoffs-for@1",
      { candidate: superseding.datum.revision_id },
    ).result).toEqual([]);
    expect(evaluateScenarioParticipation(
      processPackage,
      snapshot(records),
      "record-gate-signoff@3",
      [{ candidate: superseding.datum.revision_id }],
    )).toEqual([
      expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      }),
    ]);
  });
});
