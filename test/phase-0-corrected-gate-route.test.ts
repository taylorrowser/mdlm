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
import { executeCommandApplication } from "../src/command-application.js";

async function mdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

async function mdlmWithInput(
  repository: string,
  input: string,
  ...arguments_: string[]
) {
  const execution = await executeCommandApplication(arguments_, repository, input);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");
const processRef = "mdlm-bootstrap@0.74.0#sha256:phase-0-route-evidence";
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
    correctionAuthority?: "stakeholder" | "package-evidence";
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
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
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
      ...(outcome === "fail"
        ? {
            correction_authority:
              options.correctionAuthority ?? "package-evidence",
          }
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
      rubric_ref: "policies/rubrics/bootstrap-review.md@3",
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
  context.datum.payload.definition_members = [
    rejection.datum.revision_id,
    candidate.datum.revision_id,
    revisionId("REV-1030000004"),
  ].sort();
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
    data: { payload: Record<string, unknown> };
  };
}

async function initializedRepository(prefix: string): Promise<{
  parent: string;
  repository: string;
}> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const repository = path.join(parent, "repository");
  const initialized = await mdlm(parent, "init", repository, "--json");
  if (initialized.status !== 0) {
    await fs.rm(parent, { recursive: true, force: true });
    throw new Error(`${initialized.stderr}${initialized.stdout}`);
  }
  return { parent, repository };
}

function mapOutput(options: {
  empiricalEvidenceAvailable?: boolean;
  indexedPreferentialQuestion?: boolean;
} = {}): ProposedOutput[] {
  const additionalQuestion = options.empiricalEvidenceAvailable !== undefined
    ? {
        title: "Exact empirical repository answer",
        kind: "empirical",
        evidence_available: options.empiricalEvidenceAvailable,
        question: "Does the observed public transaction preserve exact QST lineage?",
        state: "open",
        blocking_impact: "The empirical route remains unproven without publication",
      }
    : options.indexedPreferentialQuestion
      ? {
          title: "Exact stakeholder product boundary",
          kind: "preferential",
          question: "Which exact product boundary should remain?",
          state: "open",
          blocking_impact: "The candidate cannot be reassembled before disposition.",
          attention_checkpoint: "phase-0-gate",
          consolidation_group: "phase-0-stakeholder-questions",
        }
      : undefined;
  return [{
    localId: "map",
    name: "map",
    invocation: 0,
    lifecycleDatum: {
      type: "MAP",
      payload: {
        title: "Exact public Phase 0 frontier",
        purpose: "Reach each retained hardening route through compiled mdlm Assignments.",
        frontier: [
          "$proposal.product-intent.revision_id",
          ...(additionalQuestion ? ["$proposal.additional-question.revision_id"] : []),
        ],
      },
      links: [
        { type: "indexes", target: "$proposal.product-intent.id" },
        ...(additionalQuestion
          ? [{ type: "indexes", target: "$proposal.additional-question.id" }]
          : []),
      ],
      body: "One exact public decision frontier.\n",
    },
  }, {
    localId: "product-intent",
    name: "product_intent",
    invocation: 0,
    lifecycleDatum: {
      type: "QST",
      payload: {
        title: "Exact initial product intent",
        kind: "preferential",
        intent_scope: "product",
        question: "Which exact product should this work pursue?",
        state: "open",
        blocking_impact: "PSP compilation waits for the attended answer.",
      },
      links: [],
      body: "Stakeholder authority must establish the initial product intent.\n",
    },
  }, ...(additionalQuestion
    ? [{
        localId: "additional-question",
        name: "questions",
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: additionalQuestion,
          links: [],
          body: "The route fixture includes one additional exact Question.\n",
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
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
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

function passingSimplificationReviewOutput(
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
        title: `Passing simplification Review of ${subject}`,
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        outcome: "pass",
      },
      links: [
        { type: "reviews", target: subject },
        { type: "contextualizes", target: context },
      ],
      body: "The exact candidate is the smallest sufficient product definition.\n",
    },
  }];
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
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
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
): Promise<{
  prepared: PreparedAssignment;
  reviewRevisions: string[];
  reviewContextRevisions: string[];
  productIntentAuthorityRevision: string | undefined;
  productIntentQuestionRevision: string | undefined;
}> {
  const reviewRevisions: string[] = [];
  const reviewContextRevisions: string[] = [];
  let productIntentAuthorityRevision: string | undefined;
  let productIntentQuestionRevision: string | undefined;
  for (let step = 0; step < 40; step += 1) {
    const prepared = await prepareNextAssignment(repository);
    const scenario = prepared.packet.scenario.reference as string;
    const resolvingInitialProductIntent = scenario === "resolve-question@2"
      && exactInput(prepared, "question").data.payload.intent_scope === "product";
    if (
      scenario === targetScenario
      && !(resolvingInitialProductIntent
        && options.empiricalEvidenceAvailable !== undefined)
    ) {
      return {
        prepared,
        reviewRevisions,
        reviewContextRevisions,
        productIntentAuthorityRevision,
        productIntentQuestionRevision,
      };
    }
    let outputs: ProposedOutput[];
    switch (scenario) {
      case "establish-initial-wayfinding-map@2":
        outputs = mapOutput(options);
        break;
      case "create-review-context@1":
        outputs = reviewContextOutput(prepared);
        break;
      case "review-datum-in-context@2":
        outputs = passingReviewOutput(prepared);
        break;
      case "resolve-question@2": {
        const question = exactInput(prepared, "question");
        const answeredRevision = revisionId(question.identity.id, 2);
        outputs = [{
          localId: "decision",
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Exact attended initial product intent",
              rationale: "The stakeholder supplied the product boundary.",
              kind: "scope",
              decision: "Build the bounded deterministic lifecycle product.",
              alternatives: ["Infer intent from repository context"],
              effective_scope: answeredRevision,
            },
            links: [
              { type: "resolves", target: question.identity.revision_id },
              { type: "resolves", target: "$proposal.answered.revision_id" },
            ],
            body: "The attended answer establishes exact product intent.\n",
          },
        }, {
          localId: "answered",
          name: "updated_question",
          invocation: 0,
          lifecycleDatum: {
            id: question.identity.id,
            type: "QST",
            payload: {
              title: "Exact initial product intent",
              kind: "preferential",
              intent_scope: "product",
              question: "Which exact product should this work pursue?",
              state: "answered",
              blocking_impact: "PSP compilation waits for the attended answer.",
              attended_answer: "Build the bounded deterministic lifecycle product.",
            },
            links: [],
            body: "The initial product-intent Question has an exact answer.\n",
          },
        }];
        break;
      }
      case "compile-psp@3": {
        const authority = exactInput(prepared, "product_intent_authority").identity;
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
            links: [{ type: "derived-from", target: authority.revision_id }],
            body: "One exact public product specification.\n",
          },
        }];
        break;
      }
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
    const submitted = await submitAssignment(repository, prepared, outputs);
    if (submitted.status !== 0) {
      throw new Error(`${scenario}: ${submitted.stderr}${submitted.stdout}`);
    }
    const execution = JSON.parse(submitted.stdout).execution;
    if (scenario === "resolve-question@2" && resolvingInitialProductIntent) {
      productIntentAuthorityRevision = execution.outputs.find(
        (item: { name: string }) => item.name === "decision",
      )?.lifecycleDatum.revisionId;
      productIntentQuestionRevision = execution.outputs.find(
        (item: { name: string }) => item.name === "updated_question",
      )?.lifecycleDatum.revisionId;
    }
    if (scenario === "create-review-context@1") {
      const subject = inputRevision(prepared, "subject");
      if (/^(?:MAP|PSP|STK)-/.test(subject)) {
        reviewContextRevisions.push(
          execution.outputs[0].lifecycleDatum.revisionId,
        );
      }
    } else if (scenario === "review-datum-in-context@2") {
      const subject = inputRevision(prepared, "subject");
      if (/^(?:MAP|PSP|STK)-/.test(subject)) {
        const reviewContextRevision = inputRevision(prepared, "review_context");
        if (!reviewContextRevisions.includes(reviewContextRevision)) {
          reviewContextRevisions.push(reviewContextRevision);
        }
        reviewRevisions.push(execution.outputs[0].lifecycleDatum.revisionId);
      }
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

  it("candidate-authority public route reaches corrected gate review and Phase 0 acceptance", async () => {
    const { parent, repository } = await initializedRepository("mdlm-phase0-candidate-");
    try {
      const {
        prepared,
        reviewRevisions,
        reviewContextRevisions,
        productIntentAuthorityRevision,
        productIntentQuestionRevision,
      } = await advancePhase0To(
        repository,
        "create-phase-0-intent-candidate@1",
        { indexedPreferentialQuestion: true },
      );
      expect(productIntentAuthorityRevision).toMatch(/^DEC-/);
      expect(productIntentQuestionRevision).toMatch(/^QST-/);
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
      const missingEvidence = await submitAssignment(
        repository,
        prepared,
        [candidate(members, [])],
      );
      expect(missingEvidence.status).toBe(1);
      expect(JSON.parse(missingEvidence.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      const valid = await submitAssignment(repository, prepared, [candidate(members)]);
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
      expect((await mdlm(repository, "doctor", "--json")).status).toBe(0);
      const candidateRevision = output.lifecycleDatum.revisionId as string;
      const review = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(review, "subject")).toBe(candidateRevision);
      expect(
        await hasGeneratedReviewContext(repository, candidateRevision),
      ).toBe(true);
      const contextRevision = inputRevision(review, "review_context");
      const failedReview = await submitAssignment(repository, review, [{
        localId: "review",
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: "Failed candidate Review with an unresolved indexed Question",
            review_kind: "simplification-product-definition",
            rubric_ref: "policies/rubrics/bootstrap-review.md@3",
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
            correction_authority: "stakeholder",
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
      const questionRevision = (
        output.data.payload.snapshot.resolved_links[mapRevision] as string[]
      ).find((revision) => revision.endsWith("-r00001"))!;
      expect(questionRevision).toMatch(/^QST-.+-r00001$/);

      const next = await prepareNextAssignment(repository, "resolve-question@2");
      expect(next.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        },
      }));
      expect(inputRevision(next, "question")).toBe(questionRevision);

      const looseEnds = await mdlm(repository, "loose-ends", "--json");
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

      const questionId = exactInput(next, "question").identity.id;
      const answeredQuestionRevision = `${questionId}-r00002`;
      const resolved = await submitAssignment(repository, next, [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Authorized exact product boundary",
            rationale: "The stakeholder selected the bounded public behavior.",
            kind: "scope",
            decision: "Retain the exact bounded public behavior.",
            alternatives: ["Defer the choice", "Remove the behavior"],
            effective_scope: answeredQuestionRevision,
          },
          links: [
            { type: "resolves", target: questionRevision },
            { type: "resolves", target: "$proposal.updated.revision_id" },
          ],
          body: "The stakeholder resolves the exact preferential Question.\n",
        },
      }, {
        localId: "updated",
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: questionId,
          type: "QST",
          payload: {
            title: "Exact stakeholder product boundary",
            kind: "preferential",
            question: "Which exact product boundary should remain?",
            state: "answered",
            blocking_impact: "The candidate must preserve this exact disposition.",
            attention_checkpoint: "phase-0-gate",
            consolidation_group: "phase-0-stakeholder-questions",
          },
          links: [],
          body: "The exact stakeholder product boundary is answered.\n",
        },
      }]);
      expect(resolved.status, `${resolved.stderr}${resolved.stdout}`).toBe(0);
      const resolutionOutputs = JSON.parse(resolved.stdout).execution.outputs as Array<{
        name: string;
        lifecycleDatum: { revisionId: string };
      }>;
      const decisionRevision = resolutionOutputs.find(
        (item) => item.name === "decision",
      )!.lifecycleDatum.revisionId;

      const decisionReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(decisionReview, "subject")).toBe(decisionRevision);
      expect(inputRevisions(decisionReview, "context_members")).toContain(
        answeredQuestionRevision,
      );
      const acceptedDecision = await submitAssignment(
        repository,
        decisionReview,
        passingReviewOutput(decisionReview),
      );
      expect(
        acceptedDecision.status,
        `${acceptedDecision.stderr}${acceptedDecision.stdout}`,
      ).toBe(0);

      const correction = await prepareNextAssignment(
        repository,
        "revise-intent-candidate-after-review@3",
      );
      const questionDispositions = inputRevisions(
        correction,
        "question_dispositions",
      );
      expect(questionDispositions).toHaveLength(2);
      expect(questionDispositions).toContain(answeredQuestionRevision);
      const questionDecisions = inputRevisions(correction, "question_decisions");
      expect(questionDecisions).toHaveLength(2);
      expect(questionDecisions).toContain(decisionRevision);
      const correctedMembers = inputRevisions(correction, "definition_members");
      const correctedMemberReviews = inputRevisions(correction, "member_reviews");
      const correctedReviewCauses = [
        ...inputRevisions(correction, "prior_failed_reviews"),
        ...inputRevisions(correction, "failed_reviews"),
      ];
      const candidateId = exactInput(correction, "candidate").identity.id;
      const correctedCandidateRevision = `${candidateId}-r00002`;
      const correctedCandidate = await submitAssignment(repository, correction, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: candidateId,
          type: "BSL",
          payload: {
            title: "Candidate corrected with exact Question authority",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "public-candidate-route",
            group: "DEFAULT",
            definition_members: correctedMembers,
            evidence: correctedMemberReviews,
          },
          links: [
            { type: "supersedes", target: candidateRevision },
            ...correctedReviewCauses.map((target) => ({
              type: "corrects-review",
              target,
            })),
          ],
          body: "The replacement uses only the exact reviewed Question disposition.\n",
        },
      }, {
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Authorized candidate correction",
            rationale: "The stakeholder authorized applying the exact answered Question.",
            kind: "scope",
            decision: "Rebuild the candidate with the authorized Question disposition.",
            alternatives: ["Leave the candidate blocked"],
            effective_scope: correctedCandidateRevision,
          },
          links: [{
            type: "justifies",
            target: "$proposal.replacement.revision_id",
          }],
          body: "The candidate correction uses the reviewed Question authority.\n",
        },
      }]);
      expect(
        correctedCandidate.status,
        `${correctedCandidate.stderr}${correctedCandidate.stdout}`,
      ).toBe(0);

      const correctionOutputs = JSON.parse(
        correctedCandidate.stdout,
      ).execution.outputs as Array<{
        name: string;
        data: {
          payload: Record<string, unknown>;
          links: Array<{ type: string; target: string }>;
        };
        lifecycleDatum: { revisionId: string };
      }>;
      expect(correctionOutputs.find((item) => item.name === "replacement"))
        .toEqual(expect.objectContaining({
          lifecycleDatum: expect.objectContaining({
            revisionId: correctedCandidateRevision,
          }),
        }));
      expect(correctionOutputs.find((item) => item.name === "decision"))
        .toEqual(expect.objectContaining({
          data: expect.objectContaining({
            payload: expect.objectContaining({
              effective_scope: correctedCandidateRevision,
            }),
            links: expect.arrayContaining([{
              type: "justifies",
              target: correctedCandidateRevision,
            }]),
          }),
        }));
      const correctionDecisionRevision = correctionOutputs.find(
        (item) => item.name === "decision",
      )!.lifecycleDatum.revisionId;

      const candidateReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(candidateReview, "subject")).toBe(
        correctedCandidateRevision,
      );
      expect(inputRevisions(candidateReview, "context_members")).toEqual(
        expect.arrayContaining([
          answeredQuestionRevision,
          decisionRevision,
          correctionDecisionRevision,
        ]),
      );
      const acceptedCandidateReview = await submitAssignment(
        repository,
        candidateReview,
        passingSimplificationReviewOutput(candidateReview),
      );
      expect(
        acceptedCandidateReview.status,
        `${acceptedCandidateReview.stderr}${acceptedCandidateReview.stdout}`,
      ).toBe(0);
      const candidateReviewRevision = (
        JSON.parse(acceptedCandidateReview.stdout).execution.outputs as Array<{
          lifecycleDatum: { revisionId: string };
        }>
      )[0]!.lifecycleDatum.revisionId;

      const correctionDecisionReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(correctionDecisionReview, "subject")).toBe(
        correctionDecisionRevision,
      );
      expect(inputRevisions(correctionDecisionReview, "context_members")).toEqual(
        [
          correctedCandidateRevision,
          ...correctedReviewCauses,
          answeredQuestionRevision,
          decisionRevision,
          productIntentAuthorityRevision!,
          productIntentQuestionRevision!,
          ...correctedMembers,
          ...correctedMemberReviews,
          ...reviewContextRevisions,
        ].sort(),
      );
      const acceptedCorrectionDecisionReview = await submitAssignment(
        repository,
        correctionDecisionReview,
        passingReviewOutput(correctionDecisionReview),
      );
      expect(
        acceptedCorrectionDecisionReview.status,
        `${acceptedCorrectionDecisionReview.stderr}${acceptedCorrectionDecisionReview.stdout}`,
      ).toBe(0);

      const gate = await prepareNextAssignment(repository, "record-gate-signoff@3");
      expect(inputRevision(gate, "candidate")).toBe(correctedCandidateRevision);
      const acceptedGate = await submitAssignment(repository, gate, [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Approve corrected candidate",
            rationale: "The exact candidate and its correction authority passed Review.",
            kind: "gate-signoff",
            decision: "Approve the corrected candidate.",
            alternatives: ["Reject the corrected candidate"],
            effective_scope: correctedCandidateRevision,
            gate_outcome: "approve",
          },
          links: [
            { type: "justifies", target: correctedCandidateRevision },
          ],
          body: "The exact corrected candidate is authorized for Phase 0 acceptance.\n",
        },
      }]);
      expect(
        acceptedGate.status,
        `${acceptedGate.stderr}${acceptedGate.stdout}`,
      ).toBe(0);
      const gateDecisionRevision = (
        JSON.parse(acceptedGate.stdout).execution.outputs as Array<{
          lifecycleDatum: { revisionId: string };
        }>
      )[0]!.lifecycleDatum.revisionId;

      const gateReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(gateReview, "subject")).toBe(gateDecisionRevision);
      expect(inputRevisions(gateReview, "context_members")).toEqual(
        [
          correctedCandidateRevision,
          candidateReviewRevision,
          answeredQuestionRevision,
          decisionRevision,
          productIntentAuthorityRevision!,
          productIntentQuestionRevision!,
          correctionDecisionRevision,
        ].sort(),
      );
      const failedGateReview = await submitAssignment(
        repository,
        gateReview,
        stakeholderOwnedFailureOutput(gateReview),
      );
      expect(
        failedGateReview.status,
        `${failedGateReview.stderr}${failedGateReview.stdout}`,
      ).toBe(0);
      const failedGateReviewRevision = (
        JSON.parse(failedGateReview.stdout).execution.outputs as Array<{
          lifecycleDatum: { revisionId: string };
        }>
      )[0]!.lifecycleDatum.revisionId;

      const gateCorrection = await prepareNextAssignment(
        repository,
        "revise-gate-signoff-after-review@2",
      );
      expect(inputRevision(gateCorrection, "decision")).toBe(
        gateDecisionRevision,
      );
      expect(inputRevisions(gateCorrection, "failed_reviews")).toEqual([
        failedGateReviewRevision,
      ]);
      const correctedGateRevision = `${exactInput(gateCorrection, "decision").identity.id}-r00002`;
      const acceptedGateCorrection = await submitAssignment(
        repository,
        gateCorrection,
        [{
          localId: "replacement",
          name: "replacement",
          invocation: 0,
          lifecycleDatum: {
            id: exactInput(gateCorrection, "decision").identity.id,
            type: "DEC",
            payload: {
              title: "Approve corrected candidate after Review correction",
              rationale: "The stakeholder corrected the failed gate authority.",
              kind: "gate-signoff",
              decision: "Approve the corrected candidate with the Review finding addressed.",
              alternatives: ["Reject the corrected candidate"],
              effective_scope: correctedCandidateRevision,
              gate_outcome: "approve",
            },
            links: [
              { type: "justifies", target: correctedCandidateRevision },
              {
                type: "corrects-review",
                target: failedGateReviewRevision,
              },
            ],
            body: "The corrected gate Decision addresses the exact failed Review.\n",
          },
        }],
      );
      expect(
        acceptedGateCorrection.status,
        `${acceptedGateCorrection.stderr}${acceptedGateCorrection.stdout}`,
      ).toBe(0);

      const correctedGateReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(correctedGateReview, "subject")).toBe(
        correctedGateRevision,
      );
      expect(inputRevisions(correctedGateReview, "context_members")).toEqual(
        [
          gateDecisionRevision,
          failedGateReviewRevision,
          correctedCandidateRevision,
          candidateReviewRevision,
          answeredQuestionRevision,
          decisionRevision,
          productIntentAuthorityRevision!,
          productIntentQuestionRevision!,
          correctionDecisionRevision,
        ].sort(),
      );
      const acceptedCorrectedGateReview = await submitAssignment(
        repository,
        correctedGateReview,
        passingReviewOutput(correctedGateReview),
      );
      expect(
        acceptedCorrectedGateReview.status,
        `${acceptedCorrectedGateReview.stderr}${acceptedCorrectedGateReview.stdout}`,
      ).toBe(0);
      const correctedGateReviewRevision = (
        JSON.parse(acceptedCorrectedGateReview.stdout).execution.outputs as Array<{
          lifecycleDatum: { revisionId: string };
        }>
      )[0]!.lifecycleDatum.revisionId;

      const acceptance = await prepareNextAssignment(
        repository,
        "accept-phase-0-intent@1",
      );
      expect(inputRevision(acceptance, "gate_signoff")).toBe(
        correctedGateRevision,
      );
      expect(inputRevisions(acceptance, "signoff_reviews")).toEqual([
        correctedGateReviewRevision,
      ]);
      expect(inputRevision(acceptance, "candidate")).toBe(
        correctedCandidateRevision,
      );
      const acceptedIntent = await submitAssignment(
        repository,
        acceptance,
        [{
          localId: "accepted",
          name: "accepted_intent",
          invocation: 0,
          lifecycleDatum: {
            type: "BSL",
            payload: {
              title: "Accepted corrected Phase 0 product intent",
              kind: "intent-approved",
              role: "accepted",
              scope: exactInput(acceptance, "candidate").data.payload.scope,
              group: exactInput(acceptance, "candidate").data.payload.group,
              definition_members: inputRevisions(
                acceptance,
                "definition_members",
              ),
              evidence: [
                ...inputRevisions(acceptance, "candidate_reviews"),
                correctedGateRevision,
                correctedGateReviewRevision,
              ],
            },
            links: [{
              type: "promotes",
              target: correctedCandidateRevision,
            }],
            body: "The accepted intent freezes the corrected candidate and exact reviewed gate authority.\n",
          },
        }],
      );
      expect(
        acceptedIntent.status,
        `${acceptedIntent.stderr}${acceptedIntent.stdout}`,
      ).toBe(0);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 300_000);

});
