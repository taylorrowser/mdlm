import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROCESS_REPOSITORY_TEST_TIMEOUT_MS } from "../scripts/root-test-observation-policy.mjs";
import { executeCommandApplication } from "../src/command-application.js";
import { initializeRepositoryFromLoadedProcessPackage } from "../src/repository-initialization.js";
import {
  assignmentResponse,
  directoryDigest,
  inputRevision,
  inputRevisions,
  prepareNextAssignment,
  submitAssignment,
  type PreparedAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { installLifecycleDataFixture } from "./helpers/lifecycle-data-fixture.js";

function reviewOutput(prepared: PreparedAssignment): ProposedOutput[] {
  const subject = inputRevision(prepared, "subject");
  const reviewContext = inputRevision(prepared, "review_context");
  return [{
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
        { type: "contextualizes", target: reviewContext },
      ],
      body: "The exact Revision passes independent Review.\n",
    },
  }];
}

function commitLifecycleData(repository: string): void {
  const add = spawnSync("git", ["-C", repository, "add", ".lifecycle/data"], {
    encoding: "utf8",
  });
  expect(add.status, `${add.stderr}${add.stdout}`).toBe(0);
  const commit = spawnSync(
    "git",
    [
      "-C",
      repository,
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@localhost",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      "Publish materialized Review Context",
    ],
    { encoding: "utf8" },
  );
  expect(commit.status, `${commit.stderr}${commit.stdout}`).toBe(0);
}

async function prepareNextThroughReviewContextPublication(
  repository: string,
): Promise<PreparedAssignment> {
  const next = await executeCommandApplication(["next", "--json"], repository);
  expect(next.exitCode, next.output).toBe(0);
  const outcome = JSON.parse(next.output);
  if (outcome.outcome === "publication-required") {
    expect(outcome).toMatchObject({
      materializedExecutions: [{
        scenario: "create-review-context@1",
        status: "completed",
      }],
    });
    commitLifecycleData(repository);
    return prepareNextAssignment(repository);
  }
  expect(outcome).toMatchObject({
    outcome: expect.stringMatching(/^(assignment|attention-required)$/),
    assignment: { id: expect.any(String) },
  });
  const prepared = await executeCommandApplication(
    ["scenario", "prepare", outcome.assignment.id, "--json"],
    repository,
  );
  expect(prepared.exitCode, prepared.output).toBe(0);
  return { outcome, packet: JSON.parse(prepared.output) };
}

describe("initial product-intent authority", () => {
  it("resolves attended product intent before compiling a PSP from exact authority", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-product-intent-"));
    const repository = path.join(parent, "calculator");
    try {
      const initialized = await initializeRepositoryFromLoadedProcessPackage(
        repository,
        path.resolve(".lifecycle/process"),
        await canonicalProcessPackage(),
      );
      expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics)).toBe(true);

      await installLifecycleDataFixture(
        repository,
        "resolved-initial-intent",
      );
      const openQuestion = {
        id: "QST-F0KNF9CYHQ",
        revisionId: "QST-F0KNF9CYHQ-r00001",
      };
      const answeredQuestion = "QST-F0KNF9CYHQ-r00002";
      const sourceBoundary = "BSL-D872Z49ACC-r00001";
      const decision = {
        id: "DEC-BTA8P3GVGG",
        revisionId: "DEC-BTA8P3GVGG-r00001",
      };
      const attendedAnswer = [
        "Build the minimum command-line `temperature-converter <value> <source-unit>` product.",
        "Accept only uppercase `F` and `C` source units.",
        "For `F`, output Celsius using `(F - 32) * 5 / 9`; for `C`, output Fahrenheit using `C * 9 / 5 + 32`.",
        "Print the converted number and destination unit, round half away from zero to at most two decimals, and omit trailing zeros.",
        "Reject a wrong argument count, a malformed or non-finite value, an unsupported unit, and a non-finite result with a nonzero exit, a concise stderr message, and no stdout.",
        "Do not add interactive input, configuration, networking, a conversion framework, or production hardening. Keep one direct implementation with no runtime dependencies.",
      ].join(" ");

      let failedReviewRevision: string | undefined;
      for (let step = 0; step < 6; step += 1) {
        const prepared = await prepareNextThroughReviewContextPublication(repository);
        expect(prepared.packet.scenario.reference).toBe("review-datum-in-context@2");
        if (inputRevision(prepared, "subject") !== decision.revisionId) {
          const reviewed = await submitAssignment(repository, prepared, reviewOutput(prepared));
          expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
          continue;
        }
        expect(inputRevisions(prepared, "context_members").sort()).toEqual([
          openQuestion.revisionId,
          answeredQuestion,
          sourceBoundary,
        ].sort());
        const failed = await submitAssignment(repository, prepared, [{
          localId: "review",
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: `Failed Review of ${decision.revisionId}`,
              review_kind: "contextual",
              rubric_ref: "policies/rubrics/bootstrap-review.md@3",
              findings: [{
                id: "F-001",
                target: decision.revisionId,
                relationship: "primary",
                severity: "blocking",
                summary: "The Decision must carry the self-contained attended answer without hidden source references.",
                criterion: "Exact attended product intent must remain available to downstream work.",
                evidence: "The Decision requires correction under the normalized attended answer authority.",
                material_consequence: "A lossy correction would make the PSP omit supplied behavior.",
              }],
              correction_authority: "stakeholder",
              outcome: "fail",
            },
            links: [
              { type: "reviews", target: decision.revisionId },
              { type: "contextualizes", target: inputRevision(prepared, "review_context") },
            ],
            body: "The initial product-intent Decision requires an attended correction.\n",
          },
        }]);
        expect(failed.status, `${failed.stderr}${failed.stdout}`).toBe(0);
        failedReviewRevision = JSON.parse(failed.stdout).execution.outputs[0]
          .lifecycleDatum.revisionId;
        break;
      }
      expect(failedReviewRevision).toBeDefined();

      const correction = await prepareNextAssignment(
        repository,
        "revise-question-decision-after-review@1",
      );
      expect(correction.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
        }),
      }));
      expect(inputRevision(correction, "question")).toBe(answeredQuestion);
      expect(inputRevisions(correction, "failed_reviews")).toEqual([
        failedReviewRevision,
      ]);
      const correctionOutput: ProposedOutput = {
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: decision.id,
          type: "DEC",
          payload: {
            title: "Corrected minimum temperature converter intent",
            rationale: "The attended correction retains the exact normalized product answer.",
            kind: "scope",
            decision: attendedAnswer,
            alternatives: [
              "Retain the exact attended answer",
              "Explicitly narrow, defer, or remove part of the answer",
            ],
            effective_scope: answeredQuestion,
          },
          links: [
            { type: "resolves", target: answeredQuestion },
            { type: "corrects-review", target: failedReviewRevision! },
          ],
          body: "The correction retains the exact attended product answer.\n",
        },
      };
      const lossyCorrection = structuredClone(correctionOutput);
      lossyCorrection.lifecycleDatum.payload.decision =
        "Build a command-line temperature converter for uppercase F and C.";
      const dataRoot = path.join(repository, ".lifecycle", "data");
      const beforeLossyCorrection = await directoryDigest(dataRoot);
      const markerOnlyLossyCorrection = structuredClone(lossyCorrection);
      markerOnlyLossyCorrection.lifecycleDatum.payload.attended_answer_change = {
        disposition: "narrow",
        previous_answer: attendedAnswer,
        revised_answer: attendedAnswer,
        rationale: "Claim that the shorter text is an attended narrowing.",
      };
      const rejectedMarkerOnlyCorrection = await submitAssignment(
        repository,
        correction,
        [markerOnlyLossyCorrection],
      );
      expect(rejectedMarkerOnlyCorrection.status).toBe(1);
      expect(JSON.parse(rejectedMarkerOnlyCorrection.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      );
      expect(await directoryDigest(dataRoot)).toBe(beforeLossyCorrection);

      const corrected = await submitAssignment(repository, correction, [correctionOutput]);
      expect(corrected.status, `${corrected.stderr}${corrected.stdout}`).toBe(0);
      const correctedDecision = JSON.parse(corrected.stdout).execution.outputs[0]
        .lifecycleDatum;

      let compile: PreparedAssignment | undefined;
      let reviewedCorrection = false;
      for (let step = 0; step < 6; step += 1) {
        const prepared = await prepareNextThroughReviewContextPublication(repository);
        const scenario = prepared.packet.scenario.reference as string;
        if (scenario === "compile-psp@3") {
          compile = prepared;
          break;
        }
        expect(scenario).toBe("review-datum-in-context@2");
        if (inputRevision(prepared, "subject") === correctedDecision.revisionId) {
          reviewedCorrection = true;
          expect(inputRevisions(prepared, "context_members").sort()).toEqual([
            openQuestion.revisionId,
            answeredQuestion,
            sourceBoundary,
            decision.revisionId,
            failedReviewRevision!,
          ].sort());
        }
        const reviewed = await submitAssignment(repository, prepared, reviewOutput(prepared));
        expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
      }
      expect(reviewedCorrection).toBe(true);
      expect(compile).toBeDefined();
      expect(inputRevision(compile!, "product_intent_authority")).toBe(
        correctedDecision.revisionId,
      );
      const compileAuthority = compile!.packet.exactInputs[0].inputs.find(
        (input: { name: string }) => input.name === "product_intent_authority",
      ).values[0].data.payload;
      expect(compileAuthority.decision).toBe(attendedAnswer);

      const productOutput: ProposedOutput = {
        localId: "product",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Minimum command-line temperature converter",
            rationale: "Compile only the accepted current attended product intent.",
            problem: "A command-line user needs deterministic F/C temperature conversion.",
            users: ["command-line users"],
            goals: [
              "accept exactly one finite value and an uppercase F or C source unit",
              "apply (F - 32) * 5 / 9 or C * 9 / 5 + 32 and print the destination unit",
              "round half away from zero to at most two decimals and omit trailing zeros",
              "reject wrong argument counts, malformed or non-finite values, unsupported units, and non-finite results without stdout",
            ],
            non_goals: [
              "interactive input, configuration, or networking",
              "a conversion framework or production hardening",
              "runtime dependencies or an indirect multi-module design",
            ],
            workflows: [
              "run temperature-converter <value> <source-unit> and receive the converted value and destination unit",
              "receive a nonzero exit and concise stderr with no stdout for an invalid invocation",
            ],
            success_measures: [
              "F and C conversions use the exact supplied formulas",
              "valid output follows the exact numeric and unit format",
              "every supplied invalid case fails without stdout",
            ],
          },
          links: [{
            type: "derived-from",
            target: correctedDecision.revisionId,
          }],
          body: "The PSP retains the formulas, destination units, formatting, invalid cases, exclusions, and simplicity constraints.\n",
        },
      };
      const invocationQuestion: ProposedOutput = {
        localId: "lineNumberQuestion",
        name: "questions",
        invocation: 1,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: "Define line numbering for conversion errors",
            kind: "preferential",
            intent_scope: "product",
            question: "Should a future line-specific conversion error use zero-based or one-based numbering?",
            state: "open",
            blocking_impact: "The product contract cannot assign an exact line number without this choice.",
            attention_checkpoint: "phase-0-gate",
            consolidation_group: "phase-0-stakeholder-questions",
          },
          links: [{ type: "blocks", target: "$proposal.product.id" }],
          body: "The product authority does not select a line-numbering base.\n",
        },
      };
      const malformedCompileResponse = assignmentResponse(
        compile!,
        [productOutput, invocationQuestion],
      );
      const malformedCompileProposal = malformedCompileResponse.proposal as {
        authoritySupplies: string[];
      };
      malformedCompileProposal.authoritySupplies = [correctedDecision.revisionId];
      const malformedCompile = await executeCommandApplication(
        ["scenario", "submit"],
        repository,
        `${JSON.stringify(malformedCompileResponse)}\n`,
      );
      expect(malformedCompile.exitCode).toBe(1);
      expect(JSON.parse(malformedCompile.output).malformedResponse).toEqual({
        attempt: 1,
        correctionsRemaining: 1,
        diagnostics: [{
          code: "scenario-authority-unexpected",
          path: "compile-psp@3#authority",
          message: `Scenario 'compile-psp@3' received authority not required by its exact participation: ${correctedDecision.revisionId}`,
        }, {
          code: "scenario-output-invocation-invalid",
          path: "proposal.outputs[1].invocation",
          message: "Scenario Proposal output 'questions' names unknown invocation 1",
        }],
      });
      const proposalSchema = compile!.packet.responseSchema.oneOf.find(
        (candidate: { properties: { kind: { const: string } } }) =>
          candidate.properties.kind.const === "proposal",
      );
      expect(proposalSchema.properties.proposal.properties.outputs.items.properties.invocation)
        .toEqual({ type: "integer", enum: [0] });

      const product = await submitAssignment(repository, compile!, [productOutput]);
      expect(product.status, `${product.stderr}${product.stdout}`).toBe(0);
      const publishedProduct = JSON.parse(product.stdout).execution.outputs[0]
        .lifecycleDatum;

      let stakeholderDraft: PreparedAssignment | undefined;
      for (let step = 0; step < 3; step += 1) {
        const prepared = await prepareNextThroughReviewContextPublication(repository);
        if (prepared.packet.scenario.reference === "draft-stakeholder-requirements@2") {
          stakeholderDraft = prepared;
          break;
        }
        expect(prepared.packet.scenario.reference).toBe("review-datum-in-context@2");
        const reviewed = await submitAssignment(repository, prepared, reviewOutput(prepared));
        expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
      }
      expect(stakeholderDraft).toBeDefined();
      const requiredStakeholderDraft = stakeholderDraft!;
      expect(inputRevision(requiredStakeholderDraft, "product_specification")).toBe(
        publishedProduct.revisionId,
      );
      const dataRootAfterProduct = path.join(repository, ".lifecycle", "data");
      const beforeMalformedStakeholder = await directoryDigest(dataRootAfterProduct);
      const stakeholderOutput: ProposedOutput = {
        localId: "requirement",
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "STK",
          payload: {
            title: "Command-line conversion stakeholder requirement",
            rationale: "Retain one exact current-package public authoring route.",
            statement: "The converter shall apply the accepted formulas and output contract.",
            verification_intent: "Exercise both unit directions and every invalid input class.",
            stakeholder: "command-line user",
            priority: "must",
            system_context: "temperature-converter",
          },
          links: [],
          body: "This requirement derives from the exact current product specification.\n",
        },
      };
      const malformedStakeholder = await submitAssignment(
        repository,
        requiredStakeholderDraft,
        [stakeholderOutput],
      );
      expect(malformedStakeholder.status).toBe(1);
      expect(JSON.parse(malformedStakeholder.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-output-required-link-missing" }),
        ]),
      );
      expect(await directoryDigest(dataRootAfterProduct)).toBe(
        beforeMalformedStakeholder,
      );

      stakeholderOutput.lifecycleDatum.links = [{
        type: "derived-from",
        target: publishedProduct.id,
      }];
      const stakeholder = await submitAssignment(
        repository,
        requiredStakeholderDraft,
        [stakeholderOutput],
      );
      expect(stakeholder.status, `${stakeholder.stderr}${stakeholder.stdout}`).toBe(0);
      const stakeholderExecution = JSON.parse(stakeholder.stdout).execution;
      expect(stakeholderExecution.definition.scenario).toBe(
        "draft-stakeholder-requirements@2",
      );
      const publishedStakeholder = stakeholderExecution.outputs[0].lifecycleDatum;
      expect(stakeholderExecution.outputs[0].data.links).toContainEqual({
        type: "derived-from",
        target: publishedProduct.id,
      });

      const nextReview = await prepareNextThroughReviewContextPublication(repository);
      expect(nextReview.packet.scenario.reference).not.toBe(
        "create-review-context@1",
      );
      const listed = await executeCommandApplication(["list", "--json"], repository);
      expect(listed.exitCode, listed.output).toBe(0);
      const generatedContext = (
        JSON.parse(listed.output).data as Array<{
          lifecycleDatum: { datum: { type: string; payload: Record<string, unknown> } };
        }>
      )
        .map((item) => item.lifecycleDatum.datum)
        .find((datum) =>
          datum.type === "BSL" &&
          datum.payload.scope === publishedStakeholder.revisionId
        );
      expect(generatedContext?.payload.definition_members).toEqual([
        publishedProduct.revisionId,
        publishedStakeholder.revisionId,
      ]);
      expect(generatedContext?.payload.evidence).toEqual([]);
      const generatedSnapshot = generatedContext?.payload.snapshot as
        { member_hashes: Record<string, string> } | undefined;
      expect(Object.keys(generatedSnapshot?.member_hashes ?? {})).toEqual([
        publishedProduct.revisionId,
        publishedStakeholder.revisionId,
      ]);
      expect(Object.values(generatedSnapshot?.member_hashes ?? {})).toEqual([
        expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      ]);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);
});
