import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { readScenarioExecution } from "../src/scenario-execution.js";
import {
  directoryDigest,
  inputRevision,
  inputRevisions,
  submitAssignment,
  type PreparedAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { installPreparedLifecycleDataFixture } from
  "./helpers/lifecycle-data-fixture.js";

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

const processRef =
  "mdlm-bootstrap@0.74.0#sha256:deb27430c4d239eb67a1c19025d77dd6623813f83b0588681eebfc07bdfa8a0d";

// Twice the 27,550 ms successful exact max-2 case is 55,100 ms,
// below the 61,111 ms failed observation.
// Round the larger observation up to the next 10,000 ms boundary.
const CONTENDED_CORRECTED_GATE_ACCEPTANCE_TEST_TIMEOUT_MS = 70_000;

function scenarioExecution(stdout: string): Record<string, any> {
  return JSON.parse(stdout).execution as Record<string, any>;
}

function executionOutputRevision(stdout: string, name: string): string {
  const output = scenarioExecution(stdout).outputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  if (!output) throw new Error(`Missing execution output '${name}'`);
  return output.lifecycleDatum.revisionId;
}

function expectExecutionContract(
  execution: Record<string, any>,
  scenario: string,
): void {
  expect(execution).toEqual(expect.objectContaining({
    contract: "mdlm-scenario-execution@4",
    status: "completed",
    response: {
      contract: "mdlm-assignment-response@1",
      assignment: expect.any(String),
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    },
    package: {
      reference: "mdlm-bootstrap@0.74.0",
      digest: processRef.split("#")[1],
      language: "mdlm-expression@1",
    },
    definition: expect.objectContaining({ scenario }),
    authorization: expect.objectContaining({ mode: "dispatchable-obligation" }),
    prompt: expect.objectContaining({
      reference: expect.stringMatching(/^prompts\/.+\.md@\d+$/),
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    }),
    skills: expect.arrayContaining([
      expect.objectContaining({ reference: "skills/lifecycle-data.md@1" }),
    ]),
    policies: expect.any(Array),
    completion: expect.objectContaining({
      contractValid: true,
      expressionPassed: true,
    }),
  }));
}

describe("Phase 0 corrected-gate public route", () => {
  it("rejects a candidate without exact member evidence without publishing partial data", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-candidate-publication-",
    );
    try {
      const prepared = await installPreparedLifecycleDataFixture(
        repository,
        "candidate-publication",
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

  it("corrects gate authority and atomically materializes its exact Review Context", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-corrected-gate-",
    );
    try {
      const correction = await installPreparedLifecycleDataFixture(
        repository,
        "corrected-gate",
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
      const correctionExecution = scenarioExecution(corrected.stdout);
      expectExecutionContract(
        correctionExecution,
        "revise-gate-signoff-after-review@2",
      );
      expect(executionOutputRevision(corrected.stdout, "replacement")).toBe(
        correctedGateRevision,
      );

      const resumed = await executeCommandApplication(["next"], repository);
      expect(resumed.exitCode, resumed.output).toBe(0);
      const outcome = JSON.parse(resumed.output);
      const materialized = outcome.materializedExecutions.find(
        (execution: { scenario: string }) =>
          execution.scenario === "create-review-context@1",
      );
      expect(materialized).toEqual(expect.objectContaining({
        id: expect.any(String),
        status: "completed",
      }));
      expect(outcome).toEqual(expect.objectContaining({
        phase: "phase-0-wayfinding@5",
        outcome: "assignment",
        assignment: { id: expect.any(String) },
      }));
      const contextResult = await readScenarioExecution(repository, materialized.id);
      expect(contextResult.ok).toBe(true);
      if (!contextResult.ok) throw new Error(JSON.stringify(contextResult.diagnostics));
      expectExecutionContract(contextResult.value, "create-review-context@1");
      const context = contextResult.value.outputs[0]!.data;
      const members = context.payload.definition_members as string[];
      expect(context.payload).toEqual(expect.objectContaining({
        kind: "review-context",
        role: "review-context",
        scope: correctedGateRevision,
      }));
      expect(members).toEqual(expect.arrayContaining([
        correctedGateRevision,
        failedDecision.identity.revision_id,
        failedReviews[0],
        candidateRevision,
      ]));
      const snapshot = context.payload.snapshot as Record<string, any>;
      expect(Object.keys(snapshot.member_hashes).sort()).toEqual([...members].sort());
      expect(Object.values(snapshot.member_hashes)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^sha256:[a-f0-9]{64}$/)]),
      );
      expect(snapshot.resolved_links).toEqual(expect.any(Object));
      expect(snapshot.process_provenance).toEqual(expect.objectContaining({
        process_ref: processRef,
        manifest_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        asset_refs: expect.arrayContaining([
          "create-review-context@1",
          "prompts/create-review-context.md@2",
          "skills/baseline-model.md@1",
        ]),
      }));
      expect(context.created_by).toEqual(expect.objectContaining({
        scenario: "create-review-context@1",
        prompt_ref: "prompts/create-review-context.md@2",
        process_ref: processRef,
        loaded_skill_refs: expect.arrayContaining(["skills/lifecycle-data.md@1"]),
        policy_refs: expect.arrayContaining([
          "review-applicability@1",
          "waiver-applicability@1",
        ]),
      }));
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 90_000);

  it("reviews corrected gate authority from its provenance-complete checkpoint", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-corrected-review-",
    );
    try {
      const review = await installPreparedLifecycleDataFixture(
        repository,
        "corrected-gate-review-ready",
      );
      const correctedGateRevision = inputRevision(review, "subject");
      const contextMembers = inputRevisions(review, "context_members");
      expect(correctedGateRevision).toMatch(/^DEC-.+-r00002$/);
      expect(contextMembers).toEqual(expect.arrayContaining([
        expect.stringMatching(/^DEC-.+-r00001$/),
        expect.stringMatching(/^REV-.+-r00001$/),
        expect.stringMatching(/^BSL-.+-r00002$/),
      ]));
      const reviewContext = exactInput(review, "review_context");
      expect(reviewContext.data.payload).toEqual(expect.objectContaining({
        kind: "review-context",
        role: "review-context",
        scope: correctedGateRevision,
        definition_members: expect.arrayContaining([
          correctedGateRevision,
          ...contextMembers,
        ]),
        snapshot: expect.objectContaining({
          member_hashes: expect.any(Object),
          resolved_links: expect.any(Object),
          process_provenance: expect.objectContaining({ process_ref: processRef }),
        }),
      }));

      const reviewed = await submitAssignment(
        repository,
        review,
        passingReviewOutput(review),
      );
      expect(reviewed.status, reviewed.stdout).toBe(0);
      const execution = scenarioExecution(reviewed.stdout);
      expectExecutionContract(execution, "review-datum-in-context@2");
      expect(execution.outputs[0].data).toEqual(expect.objectContaining({
        type: "REV",
        payload: expect.objectContaining({ outcome: "pass" }),
        links: expect.arrayContaining([
          { type: "reviews", target: correctedGateRevision },
          { type: "contextualizes", target: reviewContext.identity.revision_id },
        ]),
        created_by: expect.objectContaining({
          scenario: "review-datum-in-context@2",
          prompt_ref: "prompts/review-datum-in-context.md@6",
          process_ref: processRef,
        }),
      }));
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it("accepts corrected Phase 0 intent from its reviewed checkpoint", async () => {
    const { parent, repository } = await initializedRepository(
      "mdlm-phase0-corrected-acceptance-",
    );
    try {
      const acceptance = await installPreparedLifecycleDataFixture(
        repository,
        "corrected-gate-acceptance-ready",
      );
      const correctedGateRevision = inputRevision(acceptance, "gate_signoff");
      const reviewRevisions = inputRevisions(acceptance, "signoff_reviews");
      const candidateRevision = inputRevision(acceptance, "candidate");
      const definitionMembers = inputRevisions(acceptance, "definition_members");
      expect(correctedGateRevision).toMatch(/^DEC-.+-r00002$/);
      expect(reviewRevisions).toEqual([expect.stringMatching(/^REV-.+-r00001$/)]);
      expect(candidateRevision).toMatch(/^BSL-.+-r00002$/);

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
            definition_members: definitionMembers,
            evidence: [
              ...inputRevisions(acceptance, "candidate_reviews"),
              correctedGateRevision,
              ...reviewRevisions,
            ],
          },
          links: [{ type: "promotes", target: candidateRevision }],
          body: "Accepted intent freezes the corrected candidate and reviewed gate authority.\n",
        },
      }]);
      expect(accepted.status, accepted.stdout).toBe(0);
      const execution = scenarioExecution(accepted.stdout);
      expectExecutionContract(execution, "accept-phase-0-intent@1");
      const acceptedDatum = execution.outputs[0].data;
      expect(acceptedDatum).toEqual(expect.objectContaining({
        type: "BSL",
        payload: expect.objectContaining({
          kind: "intent-approved",
          role: "accepted",
          definition_members: definitionMembers,
          evidence: expect.arrayContaining([
            correctedGateRevision,
            ...reviewRevisions,
          ]),
          snapshot: expect.objectContaining({
            member_hashes: expect.any(Object),
            resolved_links: expect.any(Object),
            process_provenance: expect.objectContaining({ process_ref: processRef }),
          }),
        }),
        links: [{ type: "promotes", target: candidateRevision }],
        created_by: expect.objectContaining({
          scenario: "accept-phase-0-intent@1",
          process_ref: processRef,
        }),
      }));
      expect(execution.completion).toEqual(expect.objectContaining({
        contractValid: true,
        expressionPassed: true,
        evaluations: expect.any(Array),
      }));
      expect(execution.resultingObligations).toContain(
        `intent-approval-required@1:${candidateRevision}:${processRef}`,
      );
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, CONTENDED_CORRECTED_GATE_ACCEPTANCE_TEST_TIMEOUT_MS);
});
