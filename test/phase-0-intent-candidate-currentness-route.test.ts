import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import {
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type PreparedAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { installLifecycleDataFixture } from "./helpers/lifecycle-data-fixture.js";

type ExactValue = {
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
  lifecycleDatum: { id: string; revisionId: string; type: string };
};

function exactValues(prepared: PreparedAssignment, name: string): ExactValue[] {
  const input = prepared.packet.exactInputs[0]?.inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  if (!Array.isArray(input?.values)) {
    throw new Error(`Missing exact Assignment input '${name}'`);
  }
  return input.values as ExactValue[];
}

function exactValue(prepared: PreparedAssignment, name: string): ExactValue {
  const value = exactValues(prepared, name)[0];
  if (!value) throw new Error(`Empty exact Assignment input '${name}'`);
  return value;
}

async function initializedRepository() {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-phase0-current-candidate-"),
  );
  const repository = path.join(parent, "repository");
  const initialized = await executeCommandApplication(
    ["init", repository, "--json"],
    parent,
  );
  expect(initialized.exitCode, initialized.output).toBe(0);
  return { parent, repository };
}

async function submit(
  repository: string,
  prepared: PreparedAssignment,
  outputs: ProposedOutput[],
): Promise<ExecutionOutput[]> {
  const submitted = await submitAssignment(repository, prepared, outputs);
  expect(submitted.status, submitted.stdout).toBe(0);
  return JSON.parse(submitted.stdout).execution.outputs as ExecutionOutput[];
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

function passingCandidateReview(prepared: PreparedAssignment): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  return [{
    localId: "review",
    name: "review",
    invocation: 0,
    lifecycleDatum: {
      type: "REV",
      payload: {
        title: `Passing Review of ${subject}`,
        review_kind: "simplification-product-definition",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        outcome: "pass",
      },
      links: [
        { type: "reviews", target: subject },
        {
          type: "contextualizes",
          target: inputRevision(prepared, "review_context"),
        },
      ],
      body: "The replacement candidate passes independent Review.\n",
    },
  }];
}

function revisionNumber(revision: string): number {
  return Number(revision.slice(-5));
}

describe("Phase 0 intent-candidate currentness public route", () => {
  it("replaces only stale answer-affected members and routes the current candidate to its gate", async () => {
    const { parent, repository } = await initializedRepository();
    try {
      await installLifecycleDataFixture(repository, "candidate-currentness");
      const correction = await prepareNextAssignment(
        repository,
        "revise-intent-candidate-after-review@3",
      );
      const priorCandidate = exactValue(correction, "candidate");
      expect(revisionNumber(priorCandidate.identity.revision_id)).toBe(1);
      const priorMembers = priorCandidate.data.payload.definition_members as string[];
      const currentMembers = exactValues(correction, "definition_members");
      const currentMemberRevisions = currentMembers.map(
        (member) => member.identity.revision_id,
      );
      expect(currentMembers.map((member) => member.identity.type).sort()).toEqual([
        "MAP",
        "PSP",
        "STK",
        "STK",
      ]);

      const currentProduct = currentMembers.find(
        (member) => member.identity.type === "PSP",
      )!;
      const currentRequirements = currentMembers.filter(
        (member) => member.identity.type === "STK",
      );
      const affectedRequirement = currentRequirements.find((member) =>
        revisionNumber(member.identity.revision_id) === 2
      )!;
      const unaffectedRequirement = currentRequirements.find((member) =>
        revisionNumber(member.identity.revision_id) === 1
      )!;
      expect(revisionNumber(currentProduct.identity.revision_id)).toBe(2);
      expect(affectedRequirement).toBeDefined();
      expect(unaffectedRequirement).toBeDefined();

      const staleProduct = `${currentProduct.identity.id}-r00001`;
      const staleAffected = `${affectedRequirement.identity.id}-r00001`;
      expect(priorMembers).toEqual(expect.arrayContaining([
        staleProduct,
        staleAffected,
        unaffectedRequirement.identity.revision_id,
      ]));
      expect(currentMemberRevisions).not.toContain(staleProduct);
      expect(currentMemberRevisions).not.toContain(staleAffected);
      expect(currentMemberRevisions).toContain(
        unaffectedRequirement.identity.revision_id,
      );
      expect(currentProduct.data.links).toContainEqual(expect.objectContaining({
        type: "incorporates-answer",
      }));
      expect(affectedRequirement.data.links).toContainEqual(expect.objectContaining({
        type: "incorporates-answer",
      }));
      expect(unaffectedRequirement.data.links).not.toContainEqual(
        expect.objectContaining({ type: "incorporates-answer" }),
      );

      const memberReviews = exactValues(correction, "member_reviews");
      expect(memberReviews.map((review) =>
        review.data.links.find((link) => link.type === "reviews")?.target
      ).sort()).toEqual([...currentMemberRevisions].sort());
      const answeredQuestions = exactValues(correction, "question_dispositions");
      expect(answeredQuestions).not.toHaveLength(0);
      expect(answeredQuestions.every((question) =>
        question.data.payload.state === "answered"
      )).toBe(true);
      expect(exactValues(correction, "question_decisions")).not.toHaveLength(0);

      const replacementRevision = `${priorCandidate.identity.id}-r00002`;
      const outputs = await submit(repository, correction, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: priorCandidate.identity.id,
          type: "BSL",
          payload: {
            title: "Current reviewed Phase 0 intent candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: priorCandidate.data.payload.scope,
            group: priorCandidate.data.payload.group,
            definition_members: currentMemberRevisions,
            evidence: memberReviews.map((review) => review.identity.revision_id),
          },
          links: [{
            type: "supersedes",
            target: priorCandidate.identity.revision_id,
          }],
          body: "The same candidate lineage freezes only current reviewed members.\n",
        },
      }]);
      const replacement = outputs.find((output) => output.name === "replacement")!;
      expect(replacement.lifecycleDatum.revisionId).toBe(replacementRevision);
      const snapshotHashes = replacement.data.payload.snapshot as {
        member_hashes: Record<string, string>;
      };
      expect(Object.keys(snapshotHashes.member_hashes)).toEqual(
        expect.arrayContaining([
          ...currentMemberRevisions,
          ...memberReviews.map((review) => review.identity.revision_id),
        ]),
      );
      expect(snapshotHashes.member_hashes).not.toHaveProperty(staleProduct);
      expect(snapshotHashes.member_hashes).not.toHaveProperty(staleAffected);

      const listed = await executeCommandApplication(["list", "--json"], repository);
      expect(listed.exitCode, listed.output).toBe(0);
      type ListedDatum = ExactValue["data"] & {
        id: string;
        revision_id: string;
        type: string;
      };
      const listedData = (JSON.parse(listed.output).data as Array<{
        lifecycleDatum: { datum: ListedDatum };
      }>).map((item) => item.lifecycleDatum.datum);
      const currentCandidates = listedData.filter((datum) =>
        datum.type === "BSL" && datum.payload.kind === "intent-level-candidate"
      );
      expect(currentCandidates.map((datum) => datum.revision_id)).toEqual([
        replacementRevision,
      ]);

      const productAnswer = currentProduct.data.links.find(
        (link) => link.type === "incorporates-answer",
      )!.target;
      expect(affectedRequirement.data.links).toContainEqual({
        type: "incorporates-answer",
        target: productAnswer,
      });
      const answerDecision = listedData.find(
        (datum) => datum.revision_id === productAnswer,
      )!;
      const answeredQuestionRevision = answerDecision.payload.effective_scope as string;
      const answeredQuestion = listedData.find(
        (datum) => datum.revision_id === answeredQuestionRevision,
      )!;
      expect(answeredQuestion.links).toEqual(expect.arrayContaining([
        { type: "blocks", target: currentProduct.identity.id },
        { type: "blocks", target: affectedRequirement.identity.id },
      ]));
      expect(answeredQuestion.links).not.toContainEqual({
        type: "blocks",
        target: unaffectedRequirement.identity.id,
      });
      const answerContext = listedData.find((datum) =>
        datum.type === "BSL" && datum.payload.kind === "review-context" &&
        datum.payload.scope === productAnswer
      )!;
      expect(answerContext.payload.definition_members).toEqual(
        expect.arrayContaining([
          answeredQuestionRevision,
          staleProduct,
          staleAffected,
        ]),
      );
      expect(answerContext.payload.definition_members).not.toContain(
        unaffectedRequirement.identity.revision_id,
      );
      expect(listedData).toContainEqual(expect.objectContaining({
        type: "REV",
        links: expect.arrayContaining([
          { type: "reviews", target: productAnswer },
          { type: "contextualizes", target: answerContext.revision_id },
        ]),
      }));

      let review = await prepareNextAssignment(repository);
      if (review.packet.scenario.reference === "create-review-context@1") {
        expect(inputRevision(review, "subject")).toBe(replacementRevision);
        await submit(repository, review, reviewContextOutput(review));
        review = await prepareNextAssignment(
          repository,
          "review-datum-in-context@2",
        );
      }
      expect(review.packet.scenario.reference).toBe("review-datum-in-context@2");
      expect(inputRevision(review, "subject")).toBe(replacementRevision);
      const reviewContextMembers = exactValue(
        review,
        "review_context",
      ).data.payload.definition_members as string[];
      expect(reviewContextMembers).toEqual(expect.arrayContaining([
        replacementRevision,
        currentProduct.identity.revision_id,
        affectedRequirement.identity.revision_id,
        staleProduct,
        staleAffected,
      ]));
      expect(reviewContextMembers).not.toContain(
        `${unaffectedRequirement.identity.id}-r00002`,
      );
      await submit(repository, review, passingCandidateReview(review));

      const gate = await prepareNextAssignment(
        repository,
        "record-gate-signoff@3",
      );
      expect(inputRevision(gate, "candidate")).toBe(replacementRevision);
      expect(inputRevisions(gate, "candidate")).not.toContain(
        priorCandidate.identity.revision_id,
      );
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 360_000);
});
