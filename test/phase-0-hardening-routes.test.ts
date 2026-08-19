import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
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
import { readRepositoryData } from "../src/lifecycle-repository.js";
import { dryRunResolverScenario } from "../src/scenario-dry-run.js";
import {
  directoryDigest,
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type PreparedAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");
const processRef = "mdlm-bootstrap@0.70.0#sha256:phase-0-route-evidence";
const revisionId = (id: string, revision = 1) =>
  `${id}-r${String(revision).padStart(5, "0")}`;

async function hasGeneratedReviewContext(
  repository: string,
  scope: string,
): Promise<boolean> {
  const dataRoot = path.join(repository, ".lifecycle", "data");
  const files = await fs.readdir(dataRoot, { recursive: true });
  for (const file of files.filter((candidate) => candidate.endsWith(".md"))) {
    const source = await fs.readFile(path.join(dataRoot, file), "utf8");
    if (
      source.includes("kind: review-context") &&
      source.includes(`scope: ${scope}`)
    )
      return true;
  }
  return false;
}

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
  const directSupportTypes = new Set([
    "STK",
    "ASP",
    "ICSP",
    "DWP",
    "SYS",
    "VSP",
    "PAS",
  ]);
  const exactTarget = (target: string) =>
    /-r[0-9]{5}$/.test(target) ? target : `${target}-r00001`;
  const support = directSupportTypes.has(subject.datum.type)
    ? subject.datum.links.map((link) => exactTarget(link.target))
    : subject.datum.type === "DEC" &&
        subject.datum.payload.kind === "pilot-expansion"
      ? subject.datum.links.map((link) => exactTarget(link.target))
      : subject.datum.type === "BSL" &&
          subject.datum.payload.role === "candidate"
        ? (subject.datum.payload.definition_members as string[])
        : [];
  return record("BSL", id, {
    title: `Exact Review Context for ${subject.datum.revision_id}`,
    kind: "review-context",
    role: "review-context",
    scope: subject.datum.revision_id,
    group: "DEFAULT",
    definition_members: [
      ...new Set([subject.datum.revision_id, ...support]),
    ].sort(),
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
  const review = record(
    "REV",
    id,
    {
      title: `${outcome === "pass" ? "Passing" : "Failed"} Review of ${subject.datum.revision_id}`,
      review_kind: reviewKind,
      rubric_ref: "policies/rubrics/bootstrap-review.md@2",
      ...(reviewKind === "simplification-product-definition"
        ? outcome === "fail"
          ? {
              simplification: {
                target: subject.datum.revision_id,
                findings: [
                  {
                    id: "F-001",
                    severity: "blocking",
                    criterion:
                      "A failed contextual Review must identify a concrete defect in the exact Phase 0 Revision.",
                    evidence:
                      "The Review rejects the exact subject Revision in its kernel-frozen Phase 0 context.",
                    material_consequence:
                      "The rejected Revision cannot satisfy its foundation Review obligation.",
                    summary: "The exact product definition remains unnecessarily broad.",
                  },
                ],
              },
            }
          : {}
        : {
            findings:
              outcome === "fail"
                ? [
                    {
                      id: "F-001",
                      target: subject.datum.revision_id,
                      relationship: "primary",
                      severity: "blocking",
                      criterion:
                        "Product-definition simplification must remove or justify scope broader than the accepted intent.",
                      evidence:
                        "The Review observes that the exact candidate contains an unnecessarily broad product definition.",
                      material_consequence:
                        "Accepting the candidate would preserve avoidable scope and downstream artifact expansion.",
                      summary: "Correct the exact reviewed Revision.",
                    },
                  ]
                : [],
          }),
      ...(options.correctionAuthority
      ? { correction_authority: options.correctionAuthority }
      : {}),
      outcome,
    },
    {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: subject.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
      ...(reviewKind === "simplification-product-definition" && outcome === "fail"
        ? [{ type: "blocks", target: subject.datum.revision_id }]
        : []),
    ],
  },
  );
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
  const requirement = record(
    "STK",
    "STK-1030000001",
    {
      title: "Deterministic operator outcome",
      rationale: "The exact product intent requires an observable commitment.",
      statement: "The product shall expose one deterministic operator outcome.",
      verification_intent: "Observe the exact public outcome.",
      stakeholder: "operator",
      priority: "must",
      system_context: "product",
    },
    {
    scenario: "draft-stakeholder-requirements@2",
    links: [{ type: "derived-from", target: product.datum.id }],
  },
  );
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
  options: {
    revision?: number;
    links?: Array<{ type: string; target: string }>;
  } = {},
): LifecycleRecord {
  const memberRevisions = new Set(
    foundation.members.map((member) => member.datum.revision_id),
  );
  const memberReviewIds = foundation.reviews
    .filter((item) =>
      item.datum.type === "REV" && item.datum.links.some((link) =>
        link.type === "reviews" && memberRevisions.has(link.target)
      )
    )
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
  const review = record(
    "REV",
    id,
    {
      title: "Passing candidate-centered simplification Review",
      review_kind: "simplification-product-definition",
      rubric_ref: "policies/rubrics/bootstrap-review.md@2",
      outcome: "pass",
    },
    {
    scenario: "review-datum-in-context@2",
    links: [
      { type: "reviews", target: candidate.datum.revision_id },
      { type: "contextualizes", target: context.datum.revision_id },
    ],
  },
  );
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

function exactInput(prepared: PreparedAssignment, name: string) {
  const input = prepared.packet.exactInputs[0].inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  if (!input) throw new Error(`Missing exact Assignment input '${name}'`);
  return input.values[0] as {
    identity: { id: string; revision_id: string; type: string };
  };
}

async function initializedRepository(prefix: string): Promise<{
  parent: string;
  repository: string;
}> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const repository = path.join(parent, "repository");
  const initialized = mdlm(parent, "init", repository, "--json");
  if (initialized.status !== 0) {
    await fs.rm(parent, { recursive: true, force: true });
    throw new Error(`${initialized.stderr}${initialized.stdout}`);
  }
  return { parent, repository };
}

function indexedPreferentialMapOutput(): ProposedOutput[] {
  return [{
    localId: "map",
    name: "map",
    invocation: 0,
    lifecycleDatum: {
      type: "MAP",
      payload: {
        title: "Exact public Phase 0 frontier",
        purpose: "Resolve the exact stakeholder choice before correcting its candidate.",
        frontier: ["$proposal.question.revision_id"],
      },
      links: [{ type: "indexes", target: "$proposal.question.id" }],
      body: "The candidate depends on one exact indexed stakeholder Question.\n",
    },
  }, {
    localId: "question",
    name: "questions",
    invocation: 0,
    lifecycleDatum: {
      type: "QST",
      payload: {
        title: "Exact stakeholder product boundary",
        kind: "preferential",
        question: "Which exact product boundary should remain?",
        state: "open",
        blocking_impact: "The candidate cannot be reassembled before disposition.",
        attention_checkpoint: "phase-0-gate",
        consolidation_group: "phase-0-stakeholder-questions",
      },
      links: [],
      body: "Stakeholder authority is required for this exact product choice.\n",
    },
  }];
}

function mapOutput(empiricalEvidenceAvailable?: boolean): ProposedOutput[] {
  const withEmpiricalQuestion = empiricalEvidenceAvailable !== undefined;
  return [{
    localId: "map",
    name: "map",
    invocation: 0,
    lifecycleDatum: {
      type: "MAP",
      payload: {
        title: "Exact public Phase 0 frontier",
        purpose: "Reach each retained hardening route through compiled mdlm Assignments.",
        frontier: withEmpiricalQuestion
          ? ["$proposal.question.revision_id"]
          : ["Compile the smallest sufficient product intent"],
      },
      links: [],
      body: "One exact public decision frontier.\n",
    },
  }, ...(withEmpiricalQuestion
    ? [{
        localId: "question",
        name: "questions",
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: "Exact empirical repository answer",
            kind: "empirical",
            evidence_available: empiricalEvidenceAvailable,
            question: "Does the observed public transaction preserve exact QST lineage?",
            state: "open",
            blocking_impact: "The empirical route remains unproven without publication",
          },
          links: [],
          body: "Available exact public evidence can answer this Question.\n",
        },
      } satisfies ProposedOutput]
    : [])];
}

function reviewContextOutput(prepared: PreparedAssignment): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  const members = [subject, ...inputRevisions(prepared, "context_members")];
  return [{
    localId: "context",
    name: "context",
    invocation: 0,
    lifecycleDatum: {
      type: "BSL",
      payload: {
        title: `Exact public Review Context for ${subject}`,
        kind: "review-context",
        role: "review-context",
        scope: subject,
        group: "phase-0-route-evidence",
        definition_members: [...new Set(members)],
        evidence: [],
      },
      links: [],
      body: "The exact public Review context is frozen.\n",
    },
  }];
}

function passingReviewOutput(prepared: PreparedAssignment): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  const context = inputRevision(prepared, "review_context");
  return [
    {
      localId: "review",
      name: "review",
      invocation: 0,
      lifecycleDatum: {
        type: "REV",
        payload: {
          title: `Passing independent Review of ${subject}`,
          review_kind: "contextual",
          rubric_ref: "policies/rubrics/bootstrap-review.md@2",
          findings: [],
          outcome: "pass",
        },
        links: [
        { type: "reviews", target: subject },
        { type: "contextualizes", target: context },
      ],
        body: "The exact public foundation Revision passes independent Review.\n",
      },
    },
  ];
}

function stakeholderOwnedFailureOutput(
  prepared: PreparedAssignment,
): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  const context = inputRevision(prepared, "review_context");
  return [{
    localId: "review",
    name: "review",
    invocation: 0,
    lifecycleDatum: {
      type: "REV",
      payload: {
        title: `Failed independent Review of ${subject}`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@2",
        findings: [{
          id: "F-001",
          target: subject,
          relationship: "primary",
          severity: "blocking",
          criterion:
            "Consequential ambiguity requires stakeholder-owned minimum-scope correction.",
          evidence:
            "Bounded and substantially broader deterministic behaviors both satisfy the underspecified subject.",
          material_consequence:
            "Autonomous correction could add stakeholder-visible scope and avoidable downstream work.",
          summary: "Obtain exact stakeholder disposition of the ambiguity.",
        }],
        correction_authority: "stakeholder",
        outcome: "fail",
      },
      links: [
        { type: "reviews", target: subject },
        { type: "contextualizes", target: context },
      ],
      body: "The ambiguity requires exact stakeholder correction authority.\n",
    },
  }];
}

async function advancePhase0To(
  repository: string,
  targetScenario: string,
  options: {
    empiricalEvidenceAvailable?: boolean;
    indexedPreferentialQuestion?: boolean;
  } = {},
): Promise<{ prepared: PreparedAssignment; reviewRevisions: string[] }> {
  const reviewRevisions: string[] = [];
  for (let step = 0; step < 20; step += 1) {
    const prepared = prepareNextAssignment(repository);
    const scenario = prepared.packet.scenario.reference as string;
    if (scenario === targetScenario) return { prepared, reviewRevisions };
    let outputs: ProposedOutput[];
    switch (scenario) {
      case "establish-initial-wayfinding-map@1":
        outputs = options.indexedPreferentialQuestion
          ? indexedPreferentialMapOutput()
          : mapOutput(options.empiricalEvidenceAvailable);
        break;
      case "create-review-context@1":
        outputs = reviewContextOutput(prepared);
        break;
      case "review-datum-in-context@2":
        outputs = passingReviewOutput(prepared);
        break;
      case "compile-psp@2":
        outputs = [{
          localId: "product",
          name: "product_specification",
          invocation: 0,
          lifecycleDatum: {
            type: "PSP",
            payload: {
              title: "Exact public product intent",
              rationale: "Reach the exact downstream stakeholder route.",
              problem: "The public operator needs deterministic lifecycle outcomes.",
              users: ["operator"],
              goals: ["publish exact lifecycle truth"],
              non_goals: ["direct repository mutation"],
              success_measures: ["fresh independent Review follows publication"],
            },
            links: [],
            body: "One exact public product specification.\n",
          },
        }];
        break;
      case "draft-stakeholder-requirements@2": {
        const product = exactInput(prepared, "product_specification").identity;
        outputs = [
          {
            localId: "requirement",
            name: "requirements",
            invocation: 0,
            lifecycleDatum: {
              type: "STK",
              payload: {
                title: "Exact public stakeholder commitment",
                rationale: "Bind observable behavior to the exact product intent.",
                statement: "The product shall publish one deterministic operator outcome.",
                verification_intent: "Observe the exact compiled public outcome.",
                stakeholder: "operator",
                priority: "must",
                system_context: "product",
              },
              links: [{ type: "derived-from", target: product.id }],
              body: "One exact stakeholder-visible commitment.\n",
            },
          },
        ];
        break;
      }
      case "freeze-source-boundary@1": {
        const question = inputRevision(prepared, "source");
        outputs = [{
          localId: "boundary",
          name: "boundary",
          invocation: 0,
          lifecycleDatum: {
            type: "BSL",
            payload: {
              title: "Exact empirical Question source boundary",
              kind: "source-boundary",
              role: "source-boundary",
              scope: question,
              group: "SAME-LINEAGE",
              definition_members: [question],
              evidence: [],
            },
            links: [],
            body: "The exact empirical source Revision is frozen.\n",
          },
        }];
        break;
      }
      default:
        throw new Error(
          `Unexpected ${scenario} while advancing to ${targetScenario}`,
        );
    }
    const submitted = submitAssignment(repository, prepared, outputs);
    if (submitted.status !== 0) {
      throw new Error(`${scenario}: ${submitted.stderr}${submitted.stdout}`);
    }
    const execution = JSON.parse(submitted.stdout).execution;
    if (scenario === "review-datum-in-context@2") {
      reviewRevisions.push(execution.outputs[0].lifecycleDatum.revisionId);
    }
  }
  throw new Error(`Did not reach ${targetScenario}`);
}

describe("Phase 0 missing hardening routes", () => {
  let processPackage: ProcessPackage;
  beforeAll(async () => {
    const loaded = await loadProcessPackage(bootstrapPackage);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("publishes PSP atomically through compile-psp@2 at the public repository seam and yields fresh PSP Review work", async () => {
    const { parent, repository } = await initializedRepository("mdlm-phase0-psp-");
    try {
      const { prepared } = await advancePhase0To(repository, "compile-psp@2");
      const dataRoot = path.join(repository, ".lifecycle/data");
      const beforeInvalid = await directoryDigest(dataRoot);
      const invalid = submitAssignment(repository, prepared, []);
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stdout)).toEqual(expect.objectContaining({
        disposition: "correction-required",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "scenario-output-cardinality-invalid" }),
        ]),
      }));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      const valid = submitAssignment(repository, prepared, [{
        localId: "product",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Exact publicly compiled product specification",
            rationale: "Publish product intent through one Assignment Response.",
            problem: "The public PSP route needs literal executable evidence.",
            users: ["operator"],
            goals: ["publish one exact PSP atomically"],
            non_goals: ["direct lifecycle data mutation"],
            success_measures: ["fresh PSP Review work follows publication"],
          },
          links: [],
          body: "One exact product specification published through compile-psp@2.\n",
        },
      }]);
      expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
      const execution = JSON.parse(valid.stdout).execution;
      const product = execution.outputs[0].lifecycleDatum;
      expect(execution).toEqual(expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        definition: expect.objectContaining({ scenario: "compile-psp@2" }),
        completion: expect.objectContaining({ contractValid: true, expressionPassed: true }),
      }));
      expect(product).toEqual(expect.objectContaining({
        type: "PSP",
        revision: 1,
        revisionId: expect.stringMatching(/^PSP-.*-r00001$/),
      }));
      const doctor = mdlm(repository, "doctor", "--json");
      expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
      const next = prepareNextAssignment(repository);
      expect(next.packet.scenario.reference).not.toBe(
        "create-review-context@1",
      );
      expect(
        await hasGeneratedReviewContext(repository, product.revisionId),
      ).toBe(true);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 45_000);

  it("publishes STK through draft-stakeholder-requirements atomically and yields fresh STK Review work", async () => {
    const { parent, repository } = await initializedRepository("mdlm-phase0-stk-");
    try {
      const { prepared } = await advancePhase0To(
        repository,
        "draft-stakeholder-requirements@2",
      );
      const product = exactInput(prepared, "product_specification").identity;
      const dataRoot = path.join(repository, ".lifecycle/data");
      const beforeInvalid = await directoryDigest(dataRoot);
      const malformed: ProposedOutput = {
        localId: "requirement",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "STK",
          payload: {
            title: "Malformed public stakeholder commitment",
            rationale: "Exercise atomic required-link rejection.",
            statement: "The product shall reject this incomplete proposal.",
            verification_intent: "Observe no publication.",
            stakeholder: "operator",
            priority: "must",
            system_context: "product",
          },
          links: [],
          body: "Missing the exact required product link.\n",
        },
      };
      const invalid = submitAssignment(repository, prepared, [malformed]);
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-output-required-link-missing" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      malformed.lifecycleDatum.links = [{ type: "derived-from", target: product.id }];
      malformed.lifecycleDatum.payload.title = "Exact public stakeholder requirement";
      const valid = submitAssignment(repository, prepared, [malformed]);
      expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
      const execution = JSON.parse(valid.stdout).execution;
      const requirement = execution.outputs[0].lifecycleDatum;
      expect(execution.definition.scenario).toBe("draft-stakeholder-requirements@2");
      expect(execution.outputs[0].data.links).toContainEqual({
        type: "derived-from",
        target: product.id,
      });
      expect(mdlm(repository, "doctor", "--json").status).toBe(0);
      const next = prepareNextAssignment(repository);
      expect(next.packet.scenario.reference).not.toBe(
        "create-review-context@1",
      );
      expect(
        await hasGeneratedReviewContext(repository, requirement.revisionId),
      ).toBe(true);
      const listed = mdlm(repository, "list", "--json");
      expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
      const generated = (
        JSON.parse(listed.stdout).data as Array<{
        lifecycleDatum: { datum: LifecycleRecord["datum"] };
      }>
      )
        .map((item) => item.lifecycleDatum.datum)
        .find(
          (datum) =>
            datum.type === "BSL" &&
            datum.payload.scope === requirement.revisionId,
        );
      expect(generated?.payload.definition_members).toEqual([
        product.revision_id,
        requirement.revisionId,
      ]);
      expect(generated?.payload.evidence).toEqual([]);
      const snapshot = generated?.payload.snapshot as
        { member_hashes: Record<string, string> } | undefined;
      expect(Object.keys(snapshot?.member_hashes ?? {})).toEqual([
        product.revision_id,
        requirement.revisionId,
      ]);
      expect(Object.values(snapshot?.member_hashes ?? {})).toEqual([
        expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      ]);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it("prepares the exact PSP parent in both STK Review context Assignments", async () => {
    const foundation = phase0Foundation();
    const records = [
      ...foundation.members,
      ...foundation.reviews.slice(0, 4),
    ];
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "current-product-specifications-for-requirement@1",
      { requirement: foundation.requirement.datum.revision_id },
    ).result).toEqual([{ key: foundation.product.datum.id }]);
    const contextRoute = obligation(
      processPackage,
      records,
      "review-context-required",
      foundation.requirement.datum.revision_id,
    );
    expect(contextRoute).toBeDefined();
    const preparedContext = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "create-review-context@1",
      contextRoute!.id,
      [],
    );
    expect(preparedContext.ok, JSON.stringify(preparedContext.diagnostics)).toBe(true);
    if (!preparedContext.ok) return;
    expect(preparedContext.value.invocations[0]!.inputs.find((input) =>
      input.name === "context_members"
    )?.values.map((value) => value.identity.revision_id)).toEqual([
      foundation.product.datum.revision_id,
    ]);

    const context = record(
      "BSL",
      "BSL-1030000091",
      {
        title: "Exact current STK Review Context",
        kind: "review-context",
        role: "review-context",
        scope: foundation.requirement.datum.revision_id,
        group: "DEFAULT",
        definition_members: [
          foundation.requirement.datum.revision_id,
          foundation.product.datum.revision_id,
        ],
        evidence: [],
      },
      { scenario: "create-review-context@1" },
    );
    const reviewRecords = [...records, context];
    const reviewRoute = obligation(
      processPackage,
      reviewRecords,
      "passing-review-required",
      foundation.requirement.datum.revision_id,
    );
    expect(reviewRoute).toBeDefined();
    const preparedReview = await dryRunResolverScenario(
      processPackage,
      snapshot(reviewRecords),
      "review-datum-in-context@2",
      reviewRoute!.id,
      [],
    );
    expect(preparedReview.ok, JSON.stringify(preparedReview.diagnostics)).toBe(true);
    if (!preparedReview.ok) return;
    const suppliedParents = preparedReview.value.invocations[0]!.inputs.find(
      (input) => input.name === "context_members",
    )?.values;
    expect(suppliedParents?.map((value) => value.identity.revision_id)).toEqual([
      foundation.product.datum.revision_id,
    ]);
    expect(suppliedParents?.[0]?.data.payload).toEqual(expect.objectContaining({
      title: "Exact Phase 0 product",
      problem: "The operator needs one deterministic outcome.",
    }));
  });

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

  it("publishes a complete candidate and selects its attended indexed Question before correction at the public command seam", async () => {
    const { parent, repository } = await initializedRepository("mdlm-phase0-candidate-");
    try {
      const { prepared, reviewRevisions } = await advancePhase0To(
        repository,
        "create-phase-0-intent-candidate@1",
        { indexedPreferentialQuestion: true },
      );
      const members = inputRevisions(prepared, "definition_members");
      expect(members.map((revision) => revision.slice(0, 3)).sort()).toEqual([
        "MAP", "PSP", "STK",
      ]);
      const memberReviews = inputRevisions(prepared, "member_reviews");
      expect(memberReviews).toEqual([...reviewRevisions].sort());
      const candidate = (
        definitionMembers: string[],
        evidence: string[] = memberReviews,
      ): ProposedOutput => ({
        localId: "candidate",
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Public exact Phase 0 candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "public-candidate-route",
            group: "DEFAULT",
            definition_members: definitionMembers,
            evidence,
          },
          links: [],
          body: "The complete exact reviewed foundation is frozen.\n",
        },
      });
      const dataRoot = path.join(repository, ".lifecycle/data");
      const beforeInvalid = await directoryDigest(dataRoot);
      const missingEvidence = submitAssignment(
        repository,
        prepared,
        [candidate(members, [])],
      );
      expect(missingEvidence.status).toBe(1);
      expect(JSON.parse(missingEvidence.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      const valid = submitAssignment(repository, prepared, [candidate(members)]);
      expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
      const execution = JSON.parse(valid.stdout).execution;
      const output = execution.outputs[0];
      expect(execution.definition.scenario).toBe("create-phase-0-intent-candidate@1");
      expect(output.data.payload).toMatchObject({
        definition_members: members,
        evidence: memberReviews,
        snapshot: expect.objectContaining({
          member_hashes: expect.any(Object),
          resolved_links: expect.any(Object),
          process_provenance: expect.any(Object),
        }),
      });
      expect(mdlm(repository, "doctor", "--json").status).toBe(0);
      const candidateRevision = output.lifecycleDatum.revisionId as string;
      const review = prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(review, "subject")).toBe(candidateRevision);
      expect(
        await hasGeneratedReviewContext(repository, candidateRevision),
      ).toBe(true);
      const contextRevision = inputRevision(review, "review_context");
      const failedReview = submitAssignment(repository, review, [{
        localId: "review",
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: "Failed candidate Review with an unresolved indexed Question",
            review_kind: "simplification-product-definition",
            rubric_ref: "policies/rubrics/bootstrap-review.md@2",
            simplification: {
              target: candidateRevision,
              findings: [{
                id: "F-162",
                severity: "blocking",
                criterion: "The candidate must dispose every indexed stakeholder Question.",
                evidence: "Its exact MAP member still indexes an open preferential Question.",
                material_consequence: "Correction cannot reassemble authorized product intent.",
                summary: "Resolve the exact Question before candidate correction.",
              }],
            },
            outcome: "fail",
          },
          links: [
            { type: "reviews", target: candidateRevision },
            { type: "contextualizes", target: contextRevision },
            { type: "blocks", target: candidateRevision },
          ],
          body: "The independent Review preserves the exact causal blocker.\n",
        },
      }]);
      expect(failedReview.status, `${failedReview.stderr}${failedReview.stdout}`)
        .toBe(0);

      const mapRevision = members.find((revision) =>
        revision.startsWith("MAP-")
      )!;
      const questionRevision = output.data.payload.snapshot.resolved_links[
        mapRevision
      ][0] as string;
      expect(questionRevision).toMatch(/^QST-.+-r\d{5}$/);

      const next = prepareNextAssignment(repository, "resolve-question@2");
      expect(next.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        },
      }));
      expect(inputRevision(next, "question")).toBe(questionRevision);

      const looseEnds = mdlm(repository, "loose-ends", "--json");
      expect(looseEnds.status, `${looseEnds.stderr}${looseEnds.stdout}`).toBe(0);
      expect(JSON.parse(looseEnds.stdout).looseEnds.items).toContainEqual(
        expect.objectContaining({
          obligation: "intent-candidate-review-correction-required",
          subject: candidateRevision,
          status: "blocked",
          dispatchable: false,
          actionableResolver: "resolve-question@2",
        }),
      );
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 90_000);

  it("supplies complete passing member Reviews when correcting a candidate that omitted them", async () => {
    const foundation = phase0Foundation();
    const candidate = intentCandidate(foundation);
    candidate.datum.payload.evidence = [];
    const context = record("BSL", "BSL-1030000092", {
      title: "Exact failed candidate Review Context",
      kind: "review-context",
      role: "review-context",
      scope: candidate.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        candidate.datum.revision_id,
        ...foundation.members.map((member) => member.datum.revision_id),
      ],
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const failed = record(
      "REV",
      "REV-1030000092",
      {
        title: "Failed candidate evidence Review",
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@2",
        simplification: {
          target: candidate.datum.revision_id,
          findings: [
            {
              id: "F-001",
              severity: "blocking",
              criterion:
                "A corrected candidate must include passing Reviews for every exact definition member.",
              evidence:
                "The candidate correction omits one member Review required by its complete frozen definition set.",
              material_consequence:
                "The candidate cannot establish that every member is independently usable.",
              summary: "The candidate omits complete member Review evidence.",
            },
          ],
        },
        outcome: "fail",
      },
      {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: candidate.datum.revision_id },
        { type: "contextualizes", target: context.datum.revision_id },
        { type: "blocks", target: candidate.datum.revision_id },
      ],
    },
    );
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      candidate,
      context,
      failed,
    ];
    const correction = obligation(
      processPackage,
      records,
      "intent-candidate-review-correction-required",
      candidate.datum.revision_id,
    );
    expect(correction).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-intent-candidate-after-review@3",
    }));
    const prepared = await dryRunResolverScenario(
      processPackage,
      snapshot(records),
      "revise-intent-candidate-after-review@3",
      correction!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    const memberReviewIds = foundation.reviews
      .filter((item) => item.datum.type === "REV")
      .map((item) => item.datum.revision_id);
    expect(prepared.value.invocations[0]!.inputs.find((input) =>
      input.name === "member_reviews"
    )?.values.map((value) => value.identity.revision_id)).toEqual(
      memberReviewIds,
    );

    const replacement = intentCandidate(foundation, {
      revision: 2,
      links: [
        { type: "supersedes", target: candidate.datum.revision_id },
        { type: "corrects-review", target: failed.datum.revision_id },
      ],
    });
    const completionResult = (evidence: string[]) => {
      replacement.datum.payload.evidence = evidence;
      return evaluateProcessDefinition(
        processPackage,
        snapshot([...records, replacement]),
        "selector",
        "complete-superseding-intent-candidates-for@1",
        { candidate: candidate.datum.revision_id },
      ).result;
    };
    expect(completionResult([])).toEqual([]);
    expect(completionResult([...memberReviewIds, failed.datum.revision_id])).toEqual([]);
    expect(completionResult(memberReviewIds)).toEqual([
      expect.objectContaining({ identity: expect.objectContaining({
        revision_id: replacement.datum.revision_id,
      }) }),
    ]);
  });

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
      actionableResolver: "escalate-foundation-review-correction@3",
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
      "escalate-foundation-review-correction@3",
      escalation!.id,
      [],
    );
    expect(prepared.ok, JSON.stringify(prepared.diagnostics)).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.prompt.skills.map((skill) => skill.reference)).toEqual([
      "skills/lifecycle-data.md@1",
      "skills/clarification-protocol.md@1",
      "skills/requirement-writing.md@1",
      "skills/author-preflight.md@2",
    ]);
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
      actionableResolver: "escalate-foundation-review-correction@3",
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

  it("rejects attended foundation correction without durable minimum-scope option framing at the public repository seam", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-correction-scope-",
    );
    try {
      const { prepared: compile } = await advancePhase0To(
        repository,
        "compile-psp@2",
      );
      const published = submitAssignment(repository, compile, [{
        localId: "product",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Tiny ambiguous public product",
            rationale: "Exercise minimum-sufficient ambiguity correction.",
            problem: "The operator needs one bounded deterministic result.",
            users: ["operator"],
            goals: ["produce one deterministic result"],
            non_goals: ["production-scale semantic machinery"],
            success_measures: ["the bounded result is independently reviewable"],
          },
          links: [],
          body: "The exact result convention remains preferentially ambiguous.\n",
        },
      }]);
      expect(published.status, `${published.stderr}${published.stdout}`).toBe(0);
      const product = JSON.parse(published.stdout).execution.outputs[0]
        .lifecycleDatum.revisionId as string;

      let review = prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      if (inputRevision(review, "subject") !== product) {
        const reviewedMap = submitAssignment(
          repository,
          review,
          passingReviewOutput(review),
        );
        expect(
          reviewedMap.status,
          `${reviewedMap.stderr}${reviewedMap.stdout}`,
        ).toBe(0);
        review = prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
      }
      expect(inputRevision(review, "subject")).toBe(product);
      const failedSubmission = submitAssignment(
        repository,
        review,
        stakeholderOwnedFailureOutput(review),
      );
      expect(
        failedSubmission.status,
        `${failedSubmission.stderr}${failedSubmission.stdout}`,
      ).toBe(0);
      const failedReview = JSON.parse(failedSubmission.stdout).execution.outputs[0]
        .lifecycleDatum.revisionId as string;

      const correction = prepareNextAssignment(
        repository,
        "escalate-foundation-review-correction@3",
      );
      expect(correction.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      }));
      const subject = exactInput(correction, "subject").identity;
      const beforeInvalid = await directoryDigest(
        path.join(repository, ".lifecycle", "data"),
      );
      const invalid = submitAssignment(repository, correction, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: subject.id,
          type: "PSP",
          payload: {
            title: "Unframed deterministic product correction",
            rationale: "Choose one deterministic convention.",
            problem: "The operator needs one bounded deterministic result.",
            users: ["operator"],
            goals: ["produce one deterministic result"],
            non_goals: ["production-scale semantic machinery"],
            success_measures: ["the selected result is independently reviewable"],
          },
          links: [{ type: "corrects-review", target: failedReview }],
          body: "This replacement omits the required comparative disposition.\n",
        },
      }, {
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Unframed scope Decision",
            rationale: "The stakeholder selected a deterministic convention.",
            kind: "scope",
            decision: "Retain a deterministic result convention.",
            alternatives: ["Use another deterministic convention"],
            effective_scope: `${subject.id}-r00002`,
          },
          links: [{
            type: "justifies",
            target: "$proposal.replacement.revision_id",
          }],
          body: "No bounded, defer-or-remove, and retain comparison is recorded.\n",
        },
      }]);
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      );
      expect(await directoryDigest(
        path.join(repository, ".lifecycle", "data"),
      )).toBe(beforeInvalid);

      const bounded = submitAssignment(repository, correction, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: subject.id,
          type: "PSP",
          payload: {
            title: "Bounded deterministic product correction",
            rationale: "Resolve only the reviewed output ambiguity.",
            problem: "The operator needs one bounded deterministic result.",
            users: ["operator"],
            goals: ["produce one deterministic result"],
            non_goals: ["numeric limits", "machine representation rules"],
            success_measures: ["the selected result is independently reviewable"],
          },
          links: [{ type: "corrects-review", target: failedReview }],
          body: "The correction remains local to the exact reviewed ambiguity.\n",
        },
      }, {
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Bounded scope correction Decision",
            rationale: "The stakeholder selected the smallest sufficient fix.",
            kind: "scope",
            decision: "Bound only the ambiguous output convention.",
            alternatives: [
              "Defer the output convention",
              "Retain a broader numeric semantics model",
            ],
            effective_scope: `${subject.id}-r00002`,
            scope_correction: {
              disposition: "bound",
              options: {
                bounded: "Clarify only the inconsistent output/failure clause.",
                defer_or_remove: "Remove the unsupported output commitment until needed.",
                retain: "Retain broader numeric semantics only with explicit need.",
              },
              necessity:
                "One local output clarification is sufficient; numeric limits and machine representation are unnecessary.",
            },
          },
          links: [{
            type: "justifies",
            target: "$proposal.replacement.revision_id",
          }],
          body: "The exact comparison preserves stakeholder authority.\n",
        },
      }]);
      expect(bounded.status, `${bounded.stderr}${bounded.stdout}`).toBe(0);
      const boundedOutputs = JSON.parse(bounded.stdout).execution.outputs as Array<{
        name: string;
        lifecycleDatum: { revisionId: string };
      }>;
      const corrected = boundedOutputs.find(
        (output) => output.name === "replacement",
      )!.lifecycleDatum.revisionId;
      const correctionDecision = boundedOutputs.find(
        (output) => output.name === "decision",
      )!.lifecycleDatum.revisionId;
      expect(corrected).toBe(`${subject.id}-r00002`);
      let freshReview = prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      if (inputRevision(freshReview, "subject") !== corrected) {
        const reviewedDecision = submitAssignment(
          repository,
          freshReview,
          passingReviewOutput(freshReview),
        );
        expect(
          reviewedDecision.status,
          `${reviewedDecision.stderr}${reviewedDecision.stdout}`,
        ).toBe(0);
        freshReview = prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
      }
      expect(inputRevision(freshReview, "subject")).toBe(corrected);
      const comparativeContextRevision = inputRevision(
        freshReview,
        "review_context",
      );
      const stored = await readRepositoryData(repository, processPackage);
      expect(stored.ok, JSON.stringify(stored.diagnostics)).toBe(true);
      if (!stored.ok) return;
      const comparativeContext = stored.value.find((item) =>
        item.lifecycleDatum.datum.revision_id === comparativeContextRevision
      )?.lifecycleDatum.datum;
      expect(comparativeContext?.payload.definition_members).toEqual(
        expect.arrayContaining([
          product,
          failedReview,
          correctionDecision,
          corrected,
        ]),
      );
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it("makes existing STK Review evidence stale when its stable PSP parent advances", () => {
    const foundation = phase0Foundation();
    const revisedProduct = record("PSP", foundation.product.datum.id, {
      ...foundation.product.datum.payload,
      title: "Revised exact Phase 0 product",
    }, { revision: 2, scenario: "compile-psp@2" });
    const records = [
      ...foundation.members,
      ...foundation.reviews,
      revisedProduct,
    ];
    expect(obligation(
      processPackage,
      records,
      "stakeholder-requirements-required",
      revisedProduct.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "create-review-context@1",
      blockedBy: [expect.stringMatching(/^passing-review-required@2:/)],
    }));
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(records),
      "selector",
      "passing-reviews-for@1",
      { subject: foundation.requirement.datum.revision_id },
    ).result).toEqual([]);
    expect(obligation(
      processPackage,
      records,
      "review-context-required",
      foundation.requirement.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: null,
      eventualResolver: "create-review-context@1",
      explanation: expect.stringMatching(/passing independent Review.*current PSP/i),
    }));

    const [productContext, productReview] = reviewFor(
      revisedProduct,
      "REV-1030000023",
      "pass",
      { contextId: "BSL-1030000023" },
    );
    const afterProductReview = [...records, productContext, productReview];
    expect(obligation(
      processPackage,
      afterProductReview,
      "stakeholder-requirements-required",
      revisedProduct.datum.revision_id,
    )?.satisfied).toBe(true);
    expect(evaluateProcessDefinition(
      processPackage,
      snapshot(afterProductReview),
      "selector",
      "passing-reviews-for@1",
      { subject: foundation.requirement.datum.revision_id },
    ).result).toEqual([]);
    expect(obligation(
      processPackage,
      afterProductReview,
      "passing-review-required",
      foundation.requirement.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "blocked",
      actionableResolver: "create-review-context@1",
    }));
  });

  it("excludes unrelated Decisions from corrected foundation Review Context support", () => {
    const original = record("PSP", "PSP-1030000021", {
      title: "Original bounded product",
      rationale: "Preserve the exact correction comparison.",
      problem: "One product ambiguity remains.",
      users: ["operator"],
      goals: ["resolve one ambiguity"],
      non_goals: ["unrelated behavior"],
      success_measures: ["one exact outcome is reviewable"],
    });
    const [, failed] = reviewFor(original, "REV-1030000021", "fail", {
      correctionAuthority: "stakeholder",
    });
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: "Corrected bounded product",
    }, {
      revision: 2,
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "corrects-review", target: failed.datum.revision_id }],
    });
    const decision = record("DEC", "DEC-1030000021", {
      title: "Exact correction authority",
      rationale: "The stakeholder selected the bounded correction.",
      kind: "scope",
      decision: "Bound the correction.",
      alternatives: ["defer it", "retain broader behavior"],
      effective_scope: corrected.datum.revision_id,
      scope_correction: {
        disposition: "bound",
        options: {
          bounded: "Correct one ambiguity.",
          defer_or_remove: "Remove the unsupported behavior.",
          retain: "Retain broader behavior with explicit need.",
        },
        necessity: "The bounded behavior alone satisfies the product goal.",
      },
    }, {
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const unrelated = record("DEC", "DEC-1030000022", {
      title: "Unrelated scope Decision",
      rationale: "Exercise exact causal exclusion.",
      kind: "scope",
      decision: "Decide unrelated scope.",
      alternatives: ["Leave unrelated scope open"],
      effective_scope: corrected.datum.revision_id,
    }, {
      scenario: "record-consequential-decision@1",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const selectedResult = evaluateProcessDefinition(
      processPackage,
      snapshot([original, failed, corrected, decision, unrelated]),
      "selector",
      "review-context-members-for@1",
      { subject: corrected.datum.revision_id },
    ).result;
    expect(Array.isArray(selectedResult)).toBe(true);
    if (!Array.isArray(selectedResult)) return;
    const selected = selectedResult.map(
      (item: { identity: { revision_id: string } }) => item.identity.revision_id,
    );
    expect(selected).toEqual(expect.arrayContaining([
      original.datum.revision_id,
      failed.datum.revision_id,
      decision.datum.revision_id,
    ]));
    expect(selected).not.toContain(unrelated.datum.revision_id);
  });

  it("requires an exact reactivation condition only for defer-or-remove scope correction", () => {
    const resolved = resolveType(processPackage, "DEC");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    formatsPlugin.default(ajv);
    const validate = ajv.compile(resolved.type.payloadSchema);
    const payload = (disposition: "bound" | "defer-or-remove" | "retain") => ({
      title: `Structured ${disposition} correction`,
      rationale: "Exercise the exact structured scope contract.",
      kind: "scope",
      decision: `Select ${disposition}.`,
      alternatives: ["Select another exact disposition"],
      effective_scope: "PSP-1030000024-r00002",
      scope_correction: {
        disposition,
        options: {
          bounded: "Correct only the exact ambiguity.",
          defer_or_remove: "Remove unsupported behavior until needed.",
          retain: "Retain broader behavior only with explicit need.",
        },
        necessity: "The selected option is the minimum authorized outcome.",
      },
    });
    expect(validate(payload("bound"))).toBe(true);
    expect(validate(payload("retain"))).toBe(true);
    expect(validate(payload("defer-or-remove"))).toBe(false);
    expect(validate({
      ...payload("defer-or-remove"),
      scope_correction: {
        ...payload("defer-or-remove").scope_correction,
        reactivation_condition:
          "Reconsider only when an accepted stakeholder outcome requires the deferred behavior.",
      },
    })).toBe(true);
  });

  it.each([
    {
      suffix: "25",
      disposition: "retain" as const,
      replacementBody:
        "Retain the exact complex behavior because the stakeholder supplied concrete necessity.\n",
      reactivationCondition: undefined,
    },
    {
      suffix: "26",
      disposition: "defer-or-remove" as const,
      replacementBody:
        "Remove the optional behavior until the recorded stakeholder condition becomes true.\n",
      reactivationCondition:
        "Reconsider only when an accepted stakeholder outcome requires the deferred behavior.",
    },
  ])("allows reviewed $disposition correction authority to proceed to STK work", ({
    suffix,
    disposition,
    replacementBody,
    reactivationCondition,
  }) => {
    const original = record("PSP", `PSP-10300000${suffix}`, {
      title: "Product requiring exact correction authority",
      rationale: "Exercise a non-bounded stakeholder disposition.",
      problem: "One optional behavior has unsettled scope.",
      users: ["operator"],
      goals: ["publish only authorized behavior"],
      non_goals: ["infer stakeholder authority"],
      success_measures: ["the exact disposition passes independent Review"],
    });
    const [failedContext, failed] = reviewFor(
      original,
      `REV-10300000${suffix}`,
      "fail",
      { correctionAuthority: "stakeholder" },
    );
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: `${disposition} corrected product`,
    }, {
      revision: 2,
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "corrects-review", target: failed.datum.revision_id }],
    });
    corrected.datum.body = replacementBody;
    const decision = record("DEC", `DEC-10300000${suffix}`, {
      title: `${disposition} correction authority`,
      rationale: "The stakeholder compared all exact correction outcomes.",
      kind: "scope",
      decision: `Select ${disposition} for the exact corrected PSP.`,
      alternatives: ["Bound the behavior", "Select the other exact disposition"],
      effective_scope: corrected.datum.revision_id,
      scope_correction: {
        disposition,
        options: {
          bounded: "Correct only the exact ambiguity.",
          defer_or_remove: "Remove unsupported behavior until needed.",
          retain: "Retain broader behavior only with explicit need.",
        },
        necessity:
          "The selected outcome is the minimum stakeholder-authorized behavior.",
        ...(reactivationCondition
          ? { reactivation_condition: reactivationCondition }
          : {}),
      },
    }, {
      scenario: "escalate-foundation-review-correction@3",
      links: [{ type: "justifies", target: corrected.datum.revision_id }],
    });
    const comparativeContext = record("BSL", `BSL-10300000${suffix}`, {
      title: `Comparative Review Context for ${corrected.datum.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: corrected.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        original.datum.revision_id,
        failed.datum.revision_id,
        corrected.datum.revision_id,
        decision.datum.revision_id,
      ].sort(),
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const correctedReview = record("REV", `REV-20300000${suffix}`, {
      title: `Passing comparative Review of ${corrected.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@2",
      findings: [],
      outcome: "pass",
    }, {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: corrected.datum.revision_id },
        { type: "contextualizes", target: comparativeContext.datum.revision_id },
      ],
    });
    const [decisionContext, decisionReview] = reviewFor(
      decision,
      `REV-30300000${suffix}`,
      "pass",
      { contextId: `BSL-20300000${suffix}` },
    );
    const records = [
      original,
      failedContext,
      failed,
      corrected,
      decision,
      comparativeContext,
      correctedReview,
      decisionContext,
      decisionReview,
    ];
    expect(obligation(
      processPackage,
      records,
      "stakeholder-requirements-required",
      corrected.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "draft-stakeholder-requirements@2",
    }));
  });

  it("keeps an ordinary bounded autonomous clarification eligible for normal Review and STK fan-out", () => {
    const original = record("PSP", "PSP-1030000027", {
      title: "Ordinary bounded ambiguous product",
      rationale: "One local observable ambiguity needs correction.",
      problem: "Success and failure output overlap.",
      users: ["operator"],
      goals: ["clarify the one overlapping outcome"],
      non_goals: ["numeric limits", "machine representation", "rendering machinery"],
      success_measures: ["each outcome is unambiguous"],
    });
    const [failedContext, failed] = reviewFor(
      original,
      "REV-1030000027",
      "fail",
    );
    const corrected = record("PSP", original.datum.id, {
      ...original.datum.payload,
      title: "Locally clarified bounded product",
    }, {
      revision: 2,
      scenario: "revise-foundation-after-review@5",
      links: [{ type: "corrects-review", target: failed.datum.revision_id }],
    });
    const comparativeContext = record("BSL", "BSL-1030000027", {
      title: `Comparative Review Context for ${corrected.datum.revision_id}`,
      kind: "review-context",
      role: "review-context",
      scope: corrected.datum.revision_id,
      group: "DEFAULT",
      definition_members: [
        original.datum.revision_id,
        failed.datum.revision_id,
        corrected.datum.revision_id,
      ].sort(),
      evidence: [],
    }, { scenario: "create-review-context@1" });
    const correctedReview = record("REV", "REV-2030000027", {
      title: `Passing bounded Review of ${corrected.datum.revision_id}`,
      review_kind: "contextual",
      rubric_ref: "policies/rubrics/bootstrap-review.md@2",
      findings: [],
      outcome: "pass",
    }, {
      scenario: "review-datum-in-context@2",
      links: [
        { type: "reviews", target: corrected.datum.revision_id },
        { type: "contextualizes", target: comparativeContext.datum.revision_id },
      ],
    });
    expect(obligation(
      processPackage,
      [
        original,
        failedContext,
        failed,
        corrected,
        comparativeContext,
        correctedReview,
      ],
      "stakeholder-requirements-required",
      corrected.datum.revision_id,
    )).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "draft-stakeholder-requirements@2",
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
    const { parent, repository } = await initializedRepository("mdlm-phase0-empirical-");
    try {
      const { prepared } = await advancePhase0To(repository, "resolve-question@2", {
        empiricalEvidenceAvailable: true,
      });
      const question = exactInput(prepared, "question").identity;
      const answered: ProposedOutput = {
        localId: "updatedQuestion",
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
          body: "The observed compiled transaction preserves exact QST lineage.\n",
        },
      };
      const dataRoot = path.join(repository, ".lifecycle/data");
      const beforeInvalid = await directoryDigest(dataRoot);
      const invalidOutput = structuredClone(answered);
      invalidOutput.lifecycleDatum.payload.state = "open";
      const invalid = submitAssignment(repository, prepared, [invalidOutput]);
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      const valid = submitAssignment(repository, prepared, [answered]);
      expect(valid.status, `${valid.stderr}${valid.stdout}`).toBe(0);
      const execution = JSON.parse(valid.stdout).execution;
      expect(execution.definition.scenario).toBe("resolve-question@2");
      expect(execution.outputs).toHaveLength(1);
      expect(execution.outputs[0]).toEqual(expect.objectContaining({
        name: "updated_question",
        lifecycleDatum: expect.objectContaining({
          id: question.id,
          revision: 2,
          revisionId: `${question.id}-r00002`,
          type: "QST",
        }),
      }));
      const listed = mdlm(repository, "list", "--json");
      expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
      const data = JSON.parse(listed.stdout).data as Array<{
        lifecycleDatum: { datum: LifecycleRecord["datum"] };
      }>;
      expect(data.filter((item) => item.lifecycleDatum.datum.type === "DEC")).toEqual([]);
      expect(data.find((item) =>
        item.lifecycleDatum.datum.revision_id === `${question.id}-r00002`
      )?.lifecycleDatum.datum.payload).toMatchObject({
        kind: "empirical",
        state: "answered",
      });
      expect(mdlm(repository, "doctor", "--json").status).toBe(0);
      const next = prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(next, "subject")).toMatch(
        /^(?:MAP|PSP|STK)-.*-r00001$/,
      );
      expect(inputRevision(next, "subject")).not.toBe(question.revision_id);
      expect(
        await hasGeneratedReviewContext(
          repository,
          inputRevision(next, "subject"),
        ),
      ).toBe(true);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);

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
    const { parent, repository } = await initializedRepository("mdlm-phase0-inability-");
    try {
      const { prepared: first } = await advancePhase0To(
        repository,
        "resolve-question@2",
        { empiricalEvidenceAvailable: false },
      );
      expect(first.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: {
          mode: "attended",
          authority: "evidence-provider",
          delegationAllowed: true,
        },
      }));
      const dataRoot = path.join(repository, ".lifecycle/data");
      const before = await directoryDigest(dataRoot);
      const unable = {
        contract: "mdlm-assignment-response@1",
        assignment: first.outcome.assignment.id,
        kind: "unable",
        unable: {
          reason: "insufficient-declared-inputs",
          diagnostics: [{
            code: "unavailable-evidence",
            message: "The evidence provider cannot obtain the exact declared evidence.",
            path: "assignment",
          }],
        },
      };
      const submitted = mdlmWithInput(
        repository,
        `${JSON.stringify(unable)}\n`,
        "scenario",
        "submit",
      );
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      expect(JSON.parse(submitted.stdout)).toEqual(expect.objectContaining({
        contract: "mdlm-assignment-disposition@1",
        assignment: { id: first.outcome.assignment.id },
        disposition: "abandoned",
        orchestration: { action: "stop", automaticReplacement: false },
        unable: unable.unable,
      }));
      expect(await directoryDigest(dataRoot)).toBe(before);

      const fresh = prepareNextAssignment(repository, "resolve-question@2");
      expect(fresh.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          authority: "evidence-provider",
        }),
      }));
      expect(fresh.outcome.assignment.id).not.toBe(first.outcome.assignment.id);
      expect(fresh.packet.repository).toEqual(first.packet.repository);
      expect(inputRevision(fresh, "question")).toBe(inputRevision(first, "question"));
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);

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
    correctedContext.datum.payload.definition_members = [
      correctedRequirement.datum.revision_id,
      foundation.product.datum.revision_id,
      foundation.requirement.datum.revision_id,
      rejection.datum.revision_id,
    ].sort();
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
