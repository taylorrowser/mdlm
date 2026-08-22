import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type PreparedAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { executeCommandApplication } from "../src/command-application.js";

async function mdlm(repository: string, ...arguments_: string[]) {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

type ExactInput = {
  identity: { id: string; revision_id: string; type: string };
  data: {
    links: Array<{ type: string; target: string }>;
    payload: Record<string, unknown>;
  };
};

type ExecutionOutput = {
  name: string;
  data: {
    links: Array<{ type: string; target: string }>;
    payload: Record<string, unknown>;
  };
  lifecycleDatum: {
    id: string;
    revisionId: string;
    type: string;
  };
};

function exactInput(
  prepared: PreparedAssignment,
  name: string,
  invocation = 0,
): ExactInput {
  const input = prepared.packet.exactInputs[invocation]?.inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  const value = input?.values[0];
  if (!value) throw new Error(`Missing exact Assignment input '${name}'`);
  return value as ExactInput;
}

async function submit(
  repository: string,
  prepared: PreparedAssignment,
  outputs: ProposedOutput[],
): Promise<ExecutionOutput[]> {
  const submitted = await submitAssignment(repository, prepared, outputs);
  expect(
    submitted.status,
    `${prepared.packet.scenario.reference}: ${submitted.stderr}${submitted.stdout}`,
  ).toBe(0);
  return JSON.parse(submitted.stdout).execution.outputs as ExecutionOutput[];
}

function outputRevision(outputs: ExecutionOutput[], name: string): string {
  const revision = outputs.find((output) => output.name === name)?.lifecycleDatum
    .revisionId;
  if (!revision) throw new Error(`Missing execution output '${name}'`);
  return revision;
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
        title: `Review Context for ${subject}`,
        kind: "review-context",
        role: "review-context",
        scope: subject,
        group: "phase-0-currentness-route",
        definition_members: [...new Set(members)],
        evidence: [],
      },
      links: [],
      body: "This context freezes the exact public Assignment inputs.\n",
    },
  }];
}

function passingReviewOutput(
  prepared: PreparedAssignment,
  reviewKind: "contextual" | "simplification-product-definition" = "contextual",
): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  return [{
    localId: "review",
    name: "review",
    invocation: 0,
    lifecycleDatum: {
      type: "REV",
      payload: {
        title: `Passing Review of ${subject}`,
        review_kind: reviewKind,
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        ...(reviewKind === "contextual" ? { findings: [] } : {}),
        outcome: "pass",
      },
      links: [
        { type: "reviews", target: subject },
        {
          type: "contextualizes",
          target: inputRevision(prepared, "review_context"),
        },
      ],
      body: "The exact Revision passes its required Review.\n",
    },
  }];
}

function sourceBoundaryOutput(prepared: PreparedAssignment): ProposedOutput[] {
  const source = inputRevision(prepared, "source");
  return [{
    localId: "boundary",
    name: "boundary",
    invocation: 0,
    lifecycleDatum: {
      type: "BSL",
      payload: {
        title: `Source boundary for ${source}`,
        kind: "source-boundary",
        role: "source-boundary",
        scope: source,
        group: "SAME-LINEAGE",
        definition_members: [source],
        evidence: [],
      },
      links: [],
      body: "The editable Question source is frozen before its answer.\n",
    },
  }];
}

async function passReviewWorkUntil(
  repository: string,
  targetScenario: string,
  allowedSubjects: Set<string>,
  reviewedSubjects: Map<string, string>,
  createdContexts: Set<string>,
  rereviewedSubjects: Set<string>,
  allowedRereviewSubjects = new Set<string>(),
): Promise<PreparedAssignment> {
  const observedScenarios: string[] = [];
  for (let step = 0; step < 12; step += 1) {
    const prepared = await prepareNextAssignment(repository);
    const scenario = prepared.packet.scenario.reference as string;
    observedScenarios.push(scenario);
    if (scenario === targetScenario) return prepared;

    expect([
      "create-review-context@1",
      "review-datum-in-context@2",
    ], `Unexpected Scenario before ${targetScenario}`).toContain(scenario);
    const subject = inputRevision(prepared, "subject");
    expect(allowedSubjects.has(subject), `Unexpected Review subject ${subject}`)
      .toBe(true);

    if (scenario === "create-review-context@1") {
      expect(createdContexts.has(subject), `Repeated Review Context for ${subject}`)
        .toBe(false);
      createdContexts.add(subject);
      await submit(repository, prepared, reviewContextOutput(prepared));
      continue;
    }

    if (reviewedSubjects.has(subject)) {
      expect(
        allowedRereviewSubjects.has(subject) && !rereviewedSubjects.has(subject),
        `Repeated Review for ${subject}`,
      ).toBe(true);
      rereviewedSubjects.add(subject);
    }
    const reviewKind = exactInput(prepared, "subject").identity.type === "BSL"
      ? "simplification-product-definition"
      : "contextual";
    const outputs = await submit(
      repository,
      prepared,
      passingReviewOutput(prepared, reviewKind),
    );
    reviewedSubjects.set(subject, outputRevision(outputs, "review"));
  }
  throw new Error(
    `Did not reach ${targetScenario}; observed ${observedScenarios.join(", ")}`,
  );
}

async function initializedRepository(): Promise<{
  parent: string;
  repository: string;
}> {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-phase0-candidate-currentness-"),
  );
  const repository = path.join(parent, "repository");
  const initialized = await mdlm(parent, "init", repository, "--json");
  if (initialized.status !== 0) {
    await fs.rm(parent, { recursive: true, force: true });
    throw new Error(`${initialized.stderr}${initialized.stdout}`);
  }
  return { parent, repository };
}

async function looseEnds(repository: string): Promise<Array<Record<string, unknown>>> {
  const listed = await mdlm(repository, "loose-ends", "--json");
  expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
  return JSON.parse(listed.stdout).looseEnds.items as Array<
    Record<string, unknown>
  >;
}

describe("Phase 0 intent candidate currentness", () => {
  it("rebuilds only answer-affected foundation lineages before accepting the current candidate through the reviewed gate", async () => {
    const { parent, repository } = await initializedRepository();
    try {
      const reviewedSubjects = new Map<string, string>();
      const createdContexts = new Set<string>();
      const rereviewedSubjects = new Set<string>();

      const mapAssignment = await prepareNextAssignment(
        repository,
        "establish-initial-wayfinding-map@2",
      );
      const mapOutputs = await submit(repository, mapAssignment, [{
        localId: "map",
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          type: "MAP",
          payload: {
            title: "Phase 0 candidate-currentness frontier",
            purpose: "Establish one attended product intent and its public route.",
            frontier: ["$proposal.product-intent.revision_id"],
          },
          links: [{
            type: "indexes",
            target: "$proposal.product-intent.id",
          }],
          body: "The MAP indexes the one initial product-intent Question.\n",
        },
      }, {
        localId: "product-intent",
        name: "product_intent",
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: "Initial product boundary",
            kind: "preferential",
            intent_scope: "product",
            question: "Which bounded lifecycle product should be built?",
            state: "open",
            blocking_impact: "PSP compilation waits for the attended answer.",
          },
          links: [],
          body: "Stakeholder authority must establish the product boundary.\n",
        },
      }]);
      const mapRevision = outputRevision(mapOutputs, "map");
      const initialQuestion = mapOutputs.find(
        (output) => output.name === "product_intent",
      )!;

      const initialBoundary = await prepareNextAssignment(
        repository,
        "freeze-source-boundary@1",
      );
      expect(inputRevision(initialBoundary, "source")).toBe(
        initialQuestion.lifecycleDatum.revisionId,
      );
      await submit(repository, initialBoundary, sourceBoundaryOutput(initialBoundary));

      const initialResolution = await prepareNextAssignment(
        repository,
        "resolve-question@2",
      );
      expect(initialResolution.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        }),
      }));
      const initialQuestionRevision = inputRevision(
        initialResolution,
        "question",
      );
      const initialQuestionId = exactInput(initialResolution, "question").identity
        .id;
      const answeredInitialQuestion = `${initialQuestionId}-r00002`;
      const initialAnswer = "Build the smallest deterministic lifecycle product.";
      const initialResolutionOutputs = await submit(repository, initialResolution, [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Attended initial product intent",
            rationale: "The stakeholder supplied the exact product boundary.",
            kind: "scope",
            decision: initialAnswer,
            alternatives: ["Infer intent from repository context"],
            effective_scope: answeredInitialQuestion,
          },
          links: [
            { type: "resolves", target: initialQuestionRevision },
            { type: "resolves", target: "$proposal.answered.revision_id" },
          ],
          body: "The attended answer establishes initial product intent.\n",
        },
      }, {
        localId: "answered",
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: initialQuestionId,
          type: "QST",
          payload: {
            title: "Initial product boundary",
            kind: "preferential",
            intent_scope: "product",
            question: "Which bounded lifecycle product should be built?",
            state: "answered",
            blocking_impact: "PSP compilation waits for the attended answer.",
            attended_answer: initialAnswer,
          },
          links: [],
          body: "The initial product-intent Question is answered.\n",
        },
      }]);
      const initialAuthorityRevision = outputRevision(
        initialResolutionOutputs,
        "decision",
      );
      const compile = await passReviewWorkUntil(
        repository,
        "compile-psp@3",
        new Set([mapRevision, initialAuthorityRevision]),
        reviewedSubjects,
        createdContexts,
        rereviewedSubjects,
      );
      expect(reviewedSubjects.has(initialAuthorityRevision)).toBe(true);
      expect(inputRevision(compile, "product_intent_authority")).toBe(
        initialAuthorityRevision,
      );
      const productOutputs = await submit(repository, compile, [{
        localId: "product",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Bounded deterministic lifecycle product",
            rationale: "Compile the exact attended product intent.",
            problem: "Operators need one deterministic lifecycle outcome.",
            users: ["operator"],
            goals: ["publish the exact lifecycle outcome"],
            non_goals: ["implementation architecture"],
            success_measures: ["the public outcome is independently reviewable"],
          },
          links: [{
            type: "derived-from",
            target: initialAuthorityRevision,
          }],
          body: "The PSP compiles the exact attended authority.\n",
        },
      }]);
      const product = productOutputs[0]!;
      const productRevision = product.lifecycleDatum.revisionId;
      const productId = product.lifecycleDatum.id;
      const draft = await passReviewWorkUntil(
        repository,
        "draft-stakeholder-requirements@2",
        new Set([mapRevision, initialAuthorityRevision, productRevision]),
        reviewedSubjects,
        createdContexts,
        rereviewedSubjects,
      );
      expect(inputRevision(draft, "product_specification")).toBe(productRevision);
      const drafted = await submit(repository, draft, [{
        localId: "affected",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "STK",
          payload: {
            title: "Configurable public outcome",
            rationale: "One stakeholder choice affects this commitment.",
            statement: "The product shall publish the selected bounded outcome.",
            verification_intent: "Observe the selected public outcome.",
            stakeholder: "operator",
            priority: "must",
            system_context: "product",
          },
          links: [{ type: "derived-from", target: productId }],
          body: "This requirement is affected by the checkpoint answer.\n",
        },
      }, {
        localId: "unaffected",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "STK",
          payload: {
            title: "Deterministic command completion",
            rationale: "This commitment does not depend on the pending choice.",
            statement: "The product shall complete each command deterministically.",
            verification_intent: "Repeat the same command and compare outcomes.",
            stakeholder: "operator",
            priority: "must",
            system_context: "product",
          },
          links: [{ type: "derived-from", target: productId }],
          body: "This requirement is unaffected by the checkpoint answer.\n",
        },
      }, {
        localId: "checkpoint-question",
        name: "questions",
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: "Preferred bounded outcome",
            kind: "preferential",
            intent_scope: "product",
            question: "Which bounded public outcome should the product retain?",
            state: "open",
            blocking_impact: "The PSP and one requirement must incorporate the answer.",
            attention_checkpoint: "phase-0-gate",
            consolidation_group: "phase-0-stakeholder-questions",
          },
          links: [
            { type: "blocks", target: productId },
            { type: "blocks", target: "$proposal.affected.id" },
          ],
          body: "The product-scoped choice waits for the Phase 0 gate checkpoint.\n",
        },
      }]);
      const affected = drafted.find((output) =>
        output.name === "requirements" &&
        output.data.payload.title === "Configurable public outcome"
      )!;
      const unaffected = drafted.find((output) =>
        output.name === "requirements" &&
        output.data.payload.title === "Deterministic command completion"
      )!;
      const checkpointQuestion = drafted.find(
        (output) => output.name === "questions",
      )!;
      const affectedRevision = affected.lifecycleDatum.revisionId;
      const unaffectedRevision = unaffected.lifecycleDatum.revisionId;
      const checkpointQuestionRevision = checkpointQuestion.lifecycleDatum
        .revisionId;
      const originalBlocks = checkpointQuestion.data.links.filter(
        (link) => link.type === "blocks",
      );
      expect(originalBlocks.map((link) => link.target).sort()).toEqual([
        affected.lifecycleDatum.id,
        productId,
      ].sort());
      expect(originalBlocks.map((link) => link.target)).not.toContain(
        unaffected.lifecycleDatum.id,
      );

      const checkpointBoundary = await prepareNextAssignment(
        repository,
        "freeze-source-boundary@1",
      );
      expect(inputRevision(checkpointBoundary, "source")).toBe(
        checkpointQuestionRevision,
      );
      await submit(
        repository,
        checkpointBoundary,
        sourceBoundaryOutput(checkpointBoundary),
      );
      const candidateAssignment = await passReviewWorkUntil(
        repository,
        "create-phase-0-intent-candidate@1",
        new Set([
          mapRevision,
          initialAuthorityRevision,
          productRevision,
          affectedRevision,
          unaffectedRevision,
        ]),
        reviewedSubjects,
        createdContexts,
        rereviewedSubjects,
      );
      const initialMembers = inputRevisions(
        candidateAssignment,
        "definition_members",
      );
      expect(initialMembers.sort()).toEqual([
        mapRevision,
        productRevision,
        affectedRevision,
        unaffectedRevision,
      ].sort());
      const initialMemberReviews = inputRevisions(
        candidateAssignment,
        "member_reviews",
      );
      const candidateOutputs = await submit(repository, candidateAssignment, [{
        localId: "candidate",
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Initial reviewed Phase 0 intent candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "phase-0-product-intent",
            group: "DEFAULT",
            definition_members: initialMembers,
            evidence: initialMemberReviews,
          },
          links: [],
          body: "The candidate freezes the reviewed initial foundation.\n",
        },
      }]);
      const initialCandidate = candidateOutputs[0]!;
      const initialCandidateId = initialCandidate.lifecycleDatum.id;
      const initialCandidateRevision = initialCandidate.lifecycleDatum.revisionId;
      const checkpointResolution = await passReviewWorkUntil(
        repository,
        "resolve-question@2",
        new Set([initialCandidateRevision]),
        reviewedSubjects,
        createdContexts,
        rereviewedSubjects,
      );
      expect(reviewedSubjects.has(initialCandidateRevision)).toBe(true);
      expect(await looseEnds(repository)).not.toContainEqual(expect.objectContaining({
        obligation: "candidate-gate-signoff",
        subject: initialCandidateRevision,
        status: "ready",
        dispatchable: true,
      }));
      expect(checkpointResolution.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        }),
      }));
      expect(inputRevision(checkpointResolution, "question")).toBe(
        checkpointQuestionRevision,
      );
      const checkpointQuestionId = exactInput(
        checkpointResolution,
        "question",
      ).identity.id;
      const answeredCheckpointQuestion = `${checkpointQuestionId}-r00002`;
      const checkpointAnswer = "Retain the single operator-visible bounded outcome.";
      const answerOutputs = await submit(repository, checkpointResolution, [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Select the bounded public outcome",
            rationale: "The stakeholder answered the deferred product choice.",
            kind: "scope",
            decision: checkpointAnswer,
            alternatives: ["Retain both possible outcomes"],
            effective_scope: answeredCheckpointQuestion,
          },
          links: [
            { type: "resolves", target: checkpointQuestionRevision },
            { type: "resolves", target: "$proposal.answered.revision_id" },
          ],
          body: "The attended scope Decision answers the checkpoint Question.\n",
        },
      }, {
        localId: "answered",
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: checkpointQuestionId,
          type: "QST",
          payload: {
            title: "Preferred bounded outcome",
            kind: "preferential",
            intent_scope: "product",
            question: "Which bounded public outcome should the product retain?",
            state: "answered",
            blocking_impact: "The PSP and one requirement must incorporate the answer.",
            attention_checkpoint: "phase-0-gate",
            consolidation_group: "phase-0-stakeholder-questions",
            attended_answer: checkpointAnswer,
          },
          links: originalBlocks,
          body: "The checkpoint Question preserves its exact blocked targets.\n",
        },
      }]);
      const answerDecisionRevision = outputRevision(answerOutputs, "decision");
      const answeredQuestionOutput = answerOutputs.find(
        (output) => output.name === "updated_question",
      )!;
      expect(answeredQuestionOutput.lifecycleDatum.revisionId).toBe(
        answeredCheckpointQuestion,
      );
      expect(answeredQuestionOutput.data.links.filter(
        (link) => link.type === "blocks",
      )).toEqual(originalBlocks);

      expect(await looseEnds(repository)).not.toContainEqual(expect.objectContaining({
        obligation: "candidate-gate-signoff",
        subject: initialCandidateRevision,
        status: "ready",
        dispatchable: true,
      }));
      const answerReview = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(answerReview, "subject")).toBe(answerDecisionRevision);
      const answerReviewContextRevision = inputRevision(
        answerReview,
        "review_context",
      );
      const answerReviewMembers = inputRevisions(
        answerReview,
        "context_members",
      );
      expect(answerReviewMembers).toEqual(expect.arrayContaining([
        answeredCheckpointQuestion,
        productRevision,
        affectedRevision,
      ]));
      expect(answerReviewMembers).not.toContain(unaffectedRevision);
      const answerReviewOutputs = await submit(
        repository,
        answerReview,
        passingReviewOutput(answerReview),
      );
      const answerReviewRevision = outputRevision(answerReviewOutputs, "review");
      reviewedSubjects.set(answerDecisionRevision, answerReviewRevision);
      const productCorrection = await prepareNextAssignment(
        repository,
        "revise-foundation-after-review@5",
      );
      expect(productCorrection.packet.scenario.reference).not.toBe(
        "record-gate-signoff@3",
      );
      expect(inputRevision(productCorrection, "subject")).toBe(productRevision);
      expect(inputRevisions(productCorrection, "product_questions")).toEqual([
        answeredCheckpointQuestion,
      ]);
      expect(inputRevisions(
        productCorrection,
        "product_answer_decisions",
      )).toEqual([answerDecisionRevision]);
      expect(inputRevisions(
        productCorrection,
        "product_intent_authority",
      )).toEqual([initialAuthorityRevision]);
      expect(await looseEnds(repository)).not.toContainEqual(expect.objectContaining({
        obligation: "candidate-gate-signoff",
        subject: initialCandidateRevision,
        status: "ready",
        dispatchable: true,
      }));

      const correctedProductRevision = `${productId}-r00002`;
      const correctedProductOutputs = await submit(repository, productCorrection, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: productId,
          type: "PSP",
          payload: {
            ...product.data.payload,
            title: "Bounded lifecycle product with answered outcome",
          },
          links: [
            { type: "derived-from", target: initialAuthorityRevision },
            { type: "incorporates-answer", target: answerDecisionRevision },
          ],
          body: "The same PSP lineage incorporates the reviewed product answer.\n",
        },
      }]);
      expect(outputRevision(correctedProductOutputs, "replacement")).toBe(
        correctedProductRevision,
      );
      expect(correctedProductOutputs[0]!.data.links).toEqual(
        expect.arrayContaining([
          { type: "derived-from", target: initialAuthorityRevision },
          { type: "incorporates-answer", target: answerDecisionRevision },
        ]),
      );
      const requirementCorrection = await passReviewWorkUntil(
        repository,
        "revise-foundation-after-review@5",
        new Set([correctedProductRevision]),
        reviewedSubjects,
        createdContexts,
        rereviewedSubjects,
      );
      expect(inputRevision(requirementCorrection, "subject")).toBe(
        affectedRevision,
      );
      expect(inputRevisions(requirementCorrection, "product_questions")).toEqual([
        answeredCheckpointQuestion,
      ]);
      expect(inputRevisions(
        requirementCorrection,
        "product_answer_decisions",
      )).toEqual([answerDecisionRevision]);

      const affectedId = affected.lifecycleDatum.id;
      const correctedAffectedRevision = `${affectedId}-r00002`;
      const correctedRequirementOutputs = await submit(
        repository,
        requirementCorrection,
        [{
          localId: "replacement",
          name: "replacement",
          invocation: 0,
          lifecycleDatum: {
            id: affectedId,
            type: "STK",
            payload: {
              ...affected.data.payload,
              title: "Selected bounded public outcome",
            },
            links: [
              { type: "derived-from", target: productId },
              { type: "incorporates-answer", target: answerDecisionRevision },
            ],
            body: "The affected STK lineage derives from the current PSP and incorporates the answer.\n",
          },
        }],
      );
      expect(outputRevision(correctedRequirementOutputs, "replacement")).toBe(
        correctedAffectedRevision,
      );
      expect(correctedRequirementOutputs[0]!.data.links).toEqual(
        expect.arrayContaining([
          { type: "derived-from", target: productId },
          { type: "incorporates-answer", target: answerDecisionRevision },
        ]),
      );
      const candidateCorrection = await passReviewWorkUntil(
        repository,
        "revise-intent-candidate-after-review@3",
        new Set([
          correctedProductRevision,
          correctedAffectedRevision,
          unaffectedRevision,
        ]),
        reviewedSubjects,
        createdContexts,
        rereviewedSubjects,
        new Set([unaffectedRevision]),
      );
      expect(await looseEnds(repository)).not.toContainEqual(expect.objectContaining({
        obligation: "foundation-review-correction-required",
        subject: unaffectedRevision,
      }));
      expect(inputRevision(candidateCorrection, "candidate")).toBe(
        initialCandidateRevision,
      );
      expect(inputRevisions(candidateCorrection, "question_dispositions")).toEqual([
        answeredInitialQuestion,
      ]);
      expect(inputRevisions(candidateCorrection, "question_decisions")).toEqual([
        initialAuthorityRevision,
      ]);
      const currentMembers = inputRevisions(
        candidateCorrection,
        "definition_members",
      );
      expect(currentMembers.sort()).toEqual([
        mapRevision,
        correctedProductRevision,
        correctedAffectedRevision,
        unaffectedRevision,
      ].sort());
      expect(currentMembers).not.toContain(productRevision);
      expect(currentMembers).not.toContain(affectedRevision);
      const currentMemberReviews = inputRevisions(
        candidateCorrection,
        "member_reviews",
      );
      expect(currentMemberReviews.sort()).toEqual([
        reviewedSubjects.get(mapRevision)!,
        reviewedSubjects.get(correctedProductRevision)!,
        reviewedSubjects.get(correctedAffectedRevision)!,
        reviewedSubjects.get(unaffectedRevision)!,
      ].sort());

      const replacementCandidateRevision = `${initialCandidateId}-r00002`;
      const replacementOutputs = await submit(repository, candidateCorrection, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: initialCandidateId,
          type: "BSL",
          payload: {
            title: "Current reviewed Phase 0 intent candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "phase-0-product-intent",
            group: "DEFAULT",
            definition_members: currentMembers,
            evidence: currentMemberReviews,
          },
          links: [{
            type: "supersedes",
            target: initialCandidateRevision,
          }],
          body: "The same candidate lineage now freezes only current reviewed members.\n",
        },
      }]);
      expect(outputRevision(replacementOutputs, "replacement")).toBe(
        replacementCandidateRevision,
      );

      const listed = await mdlm(repository, "list", "--json");
      expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
      const candidateData = (JSON.parse(listed.stdout).data as Array<{
        lifecycleDatum: {
          datum: {
            id: string;
            revision_id: string;
            type: string;
            payload: Record<string, unknown>;
          };
        };
      }>).map((item) => item.lifecycleDatum.datum).filter((datum) =>
        datum.type === "BSL" && datum.payload.kind === "intent-level-candidate"
      );
      expect([...new Set(candidateData.map((datum) => datum.id))]).toEqual([
        initialCandidateId,
      ]);
      expect(candidateData.map((datum) => datum.revision_id)).toEqual([
        replacementCandidateRevision,
      ]);

      const authorityAndCorrectionEssentials = [
        answeredCheckpointQuestion,
        answerDecisionRevision,
        answerReviewRevision,
        answerReviewContextRevision,
        productRevision,
        affectedRevision,
        correctedProductRevision,
        correctedAffectedRevision,
      ];
      const unrelatedReplacementRevision =
        `${unaffected.lifecycleDatum.id}-r00002`;

      let replacementCandidateReview = await prepareNextAssignment(repository);
      if (
        replacementCandidateReview.packet.scenario.reference ===
          "create-review-context@1"
      ) {
        expect(inputRevision(replacementCandidateReview, "subject")).toBe(
          replacementCandidateRevision,
        );
        expect(createdContexts.has(replacementCandidateRevision)).toBe(false);
        createdContexts.add(replacementCandidateRevision);
        await submit(
          repository,
          replacementCandidateReview,
          reviewContextOutput(replacementCandidateReview),
        );
        replacementCandidateReview = await prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
      }
      expect(replacementCandidateReview.packet.scenario.reference).toBe(
        "review-datum-in-context@2",
      );
      expect(inputRevision(replacementCandidateReview, "subject")).toBe(
        replacementCandidateRevision,
      );
      const replacementCandidateContextRevision = inputRevision(
        replacementCandidateReview,
        "review_context",
      );
      const replacementCandidateContextMembers = exactInput(
        replacementCandidateReview,
        "review_context",
      ).data.payload.definition_members as string[];
      expect(replacementCandidateContextMembers).toEqual(expect.arrayContaining([
        replacementCandidateRevision,
        ...authorityAndCorrectionEssentials,
      ]));
      expect(replacementCandidateContextMembers).not.toContain(
        unrelatedReplacementRevision,
      );
      const replacementCandidateReviewOutputs = await submit(
        repository,
        replacementCandidateReview,
        passingReviewOutput(
          replacementCandidateReview,
          "simplification-product-definition",
        ),
      );
      const replacementReview = outputRevision(
        replacementCandidateReviewOutputs,
        "review",
      );
      reviewedSubjects.set(replacementCandidateRevision, replacementReview);
      const gate = await prepareNextAssignment(repository, "record-gate-signoff@3");
      expect(inputRevision(gate, "candidate")).toBe(
        replacementCandidateRevision,
      );
      expect(inputRevisions(gate, "candidate")).not.toContain(
        initialCandidateRevision,
      );
      expect(await looseEnds(repository)).not.toContainEqual(expect.objectContaining({
        obligation: "candidate-gate-signoff",
        subject: initialCandidateRevision,
        status: "ready",
        dispatchable: true,
      }));
      const gateOutputs = await submit(repository, gate, [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Approve the current Phase 0 intent candidate",
            rationale: "The corrected candidate preserves the exact reviewed product answer.",
            kind: "gate-signoff",
            decision: "Approve the current corrected candidate.",
            alternatives: ["Reject the current corrected candidate"],
            effective_scope: replacementCandidateRevision,
            gate_outcome: "approve",
          },
          links: [{
            type: "justifies",
            target: replacementCandidateRevision,
          }],
          body: "The stakeholder approves only the corrected current candidate.\n",
        },
      }]);
      const gateDecisionRevision = outputRevision(gateOutputs, "decision");

      let gateReview = await prepareNextAssignment(repository);
      if (gateReview.packet.scenario.reference === "create-review-context@1") {
        expect(inputRevision(gateReview, "subject")).toBe(gateDecisionRevision);
        expect(createdContexts.has(gateDecisionRevision)).toBe(false);
        createdContexts.add(gateDecisionRevision);
        await submit(repository, gateReview, reviewContextOutput(gateReview));
        gateReview = await prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
      }
      expect(gateReview.packet.scenario.reference).toBe(
        "review-datum-in-context@2",
      );
      expect(inputRevision(gateReview, "subject")).toBe(gateDecisionRevision);
      const gateReviewContextMembers = exactInput(
        gateReview,
        "review_context",
      ).data.payload.definition_members as string[];
      expect(gateReviewContextMembers).toEqual(expect.arrayContaining([
        gateDecisionRevision,
        replacementCandidateRevision,
        replacementReview,
        ...authorityAndCorrectionEssentials,
      ]));
      expect(gateReviewContextMembers).not.toContain(
        unrelatedReplacementRevision,
      );
      const gateReviewOutputs = await submit(
        repository,
        gateReview,
        passingReviewOutput(gateReview),
      );
      const gateReviewRevision = outputRevision(gateReviewOutputs, "review");

      const acceptance = await prepareNextAssignment(
        repository,
        "accept-phase-0-intent@1",
      );
      expect(inputRevision(acceptance, "candidate")).toBe(
        replacementCandidateRevision,
      );
      expect(inputRevision(acceptance, "gate_signoff")).toBe(
        gateDecisionRevision,
      );
      expect(inputRevisions(acceptance, "signoff_reviews")).toEqual([
        gateReviewRevision,
      ]);
      const acceptedOutputs = await submit(repository, acceptance, [{
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
              gateDecisionRevision,
              gateReviewRevision,
            ],
          },
          links: [{
            type: "promotes",
            target: replacementCandidateRevision,
          }],
          body: "Accepted intent preserves the corrected foundation and reviewed gate authority.\n",
        },
      }]);
      expect(outputRevision(acceptedOutputs, "accepted_intent")).toMatch(
        /^BSL-/,
      );
      expect(replacementCandidateContextRevision).toMatch(/^BSL-/);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 360_000);
});
