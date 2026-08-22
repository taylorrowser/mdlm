import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import {
  directoryDigest,
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type PreparedAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { installLifecycleDataFixture } from "./helpers/lifecycle-data-fixture.js";

type ExactInput = {
  identity: { id: string; revision_id: string; type: string };
  data: {
    links: Array<{ type: string; target: string }>;
    payload: Record<string, unknown>;
  };
};

function exactInput(prepared: PreparedAssignment, name: string): ExactInput {
  const input = prepared.packet.exactInputs[0]?.inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  const value = input?.values[0];
  if (!value) throw new Error(`Missing exact Assignment input '${name}'`);
  return value as ExactInput;
}

async function initializedRepository(prefix: string) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const repository = path.join(parent, "repository");
  const initialized = await executeCommandApplication(
    ["init", repository, "--json"],
    parent,
  );
  expect(initialized.exitCode, initialized.output).toBe(0);
  return { parent, repository };
}

function passingReviewOutput(prepared: PreparedAssignment): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  return [{
    localId: "review",
    name: "review",
    invocation: 0,
    lifecycleDatum: {
      type: "REV",
      payload: {
        title: `Passing Review of ${subject}`,
        review_kind: "contextual",
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        findings: [],
        outcome: "pass",
      },
      links: [
        { type: "reviews", target: subject },
        {
          type: "contextualizes",
          target: inputRevision(prepared, "review_context"),
        },
      ],
      body: "The corrected exact gate authority passes independent Review.\n",
    },
  }];
}

function executionOutputRevision(stdout: string, name: string): string {
  const output = (JSON.parse(stdout).execution.outputs as Array<{
    name: string;
    lifecycleDatum: { revisionId: string };
  }>).find((candidate) => candidate.name === name);
  if (!output) throw new Error(`Missing execution output '${name}'`);
  return output.lifecycleDatum.revisionId;
}

describe("Phase 0 corrected-gate public route", () => {
  it("rejects a candidate without exact member evidence without publishing partial data", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-candidate-publication-",
    );
    try {
      await installLifecycleDataFixture(repository, "candidate-publication");
      const prepared = await prepareNextAssignment(
        repository,
        "create-phase-0-intent-candidate@1",
      );
      const members = inputRevisions(prepared, "definition_members");
      const memberReviews = inputRevisions(prepared, "member_reviews");
      expect(members).toHaveLength(3);
      expect(memberReviews).toHaveLength(3);

      const candidate = (evidence: string[]): ProposedOutput => ({
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
            definition_members: members,
            evidence,
          },
          links: [],
          body: "The complete exact reviewed foundation is frozen.\n",
        },
      });
      const dataRoot = path.join(repository, ".lifecycle/data");
      const beforeInvalid = await directoryDigest(dataRoot);
      const invalid = await submitAssignment(repository, prepared, [candidate([])]);
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]));
      expect(await directoryDigest(dataRoot)).toBe(beforeInvalid);

      const valid = await submitAssignment(
        repository,
        prepared,
        [candidate(memberReviews)],
      );
      expect(valid.status, valid.stdout).toBe(0);
      const output = JSON.parse(valid.stdout).execution.outputs[0];
      expect(output.data.payload).toEqual(expect.objectContaining({
        definition_members: members,
        evidence: memberReviews,
        snapshot: expect.objectContaining({
          member_hashes: expect.any(Object),
          resolved_links: expect.any(Object),
          process_provenance: expect.any(Object),
        }),
      }));
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it("resumes at failed gate authority, reviews its correction, and accepts Phase 0 intent", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-corrected-gate-",
    );
    try {
      await installLifecycleDataFixture(repository, "corrected-gate");
      const correction = await prepareNextAssignment(
        repository,
        "revise-gate-signoff-after-review@2",
      );
      const failedDecision = exactInput(correction, "decision");
      const failedReviews = inputRevisions(correction, "failed_reviews");
      expect(failedReviews).toHaveLength(1);
      const candidateRevision = failedDecision.data.links.find(
        (link) => link.type === "justifies",
      )?.target;
      expect(candidateRevision).toMatch(/^BSL-.+-r00002$/);

      const correctedGateRevision = `${failedDecision.identity.id}-r00002`;
      const corrected = await submitAssignment(repository, correction, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: failedDecision.identity.id,
          type: "DEC",
          payload: {
            title: "Approve corrected candidate after Review correction",
            rationale: "The stakeholder corrected the failed gate authority.",
            kind: "gate-signoff",
            decision: "Approve the corrected candidate with the Review finding addressed.",
            alternatives: ["Reject the corrected candidate"],
            effective_scope: candidateRevision,
            gate_outcome: "approve",
          },
          links: [
            { type: "justifies", target: candidateRevision! },
            { type: "corrects-review", target: failedReviews[0]! },
          ],
          body: "The corrected gate Decision addresses the exact failed Review.\n",
        },
      }]);
      expect(corrected.status, corrected.stdout).toBe(0);
      expect(executionOutputRevision(corrected.stdout, "replacement")).toBe(
        correctedGateRevision,
      );

      const review = await prepareNextAssignment(
        repository,
        "review-datum-in-context@2",
      );
      expect(inputRevision(review, "subject")).toBe(correctedGateRevision);
      expect(inputRevisions(review, "context_members")).toEqual(
        expect.arrayContaining([
          failedDecision.identity.revision_id,
          failedReviews[0],
          candidateRevision,
        ]),
      );
      const reviewed = await submitAssignment(
        repository,
        review,
        passingReviewOutput(review),
      );
      expect(reviewed.status, reviewed.stdout).toBe(0);
      const reviewRevision = executionOutputRevision(reviewed.stdout, "review");

      const acceptance = await prepareNextAssignment(
        repository,
        "accept-phase-0-intent@1",
      );
      expect(inputRevision(acceptance, "gate_signoff")).toBe(correctedGateRevision);
      expect(inputRevisions(acceptance, "signoff_reviews")).toEqual([
        reviewRevision,
      ]);
      expect(inputRevision(acceptance, "candidate")).toBe(candidateRevision);
      const accepted = await submitAssignment(repository, acceptance, [{
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
            definition_members: inputRevisions(acceptance, "definition_members"),
            evidence: [
              ...inputRevisions(acceptance, "candidate_reviews"),
              correctedGateRevision,
              reviewRevision,
            ],
          },
          links: [{ type: "promotes", target: candidateRevision! }],
          body: "Accepted intent freezes the corrected candidate and reviewed gate authority.\n",
        },
      }]);
      expect(accepted.status, accepted.stdout).toBe(0);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 300_000);
});
