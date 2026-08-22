import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentPacket,
  JsonObject,
} from "../packages/mdlm-pi/src/mdlm-client.js";
import { executeCommandApplication } from "../src/command-application.js";
import {
  PiAssignmentRunner,
  type PiAssignmentSession,
} from "../packages/mdlm-pi/src/pi-assignment-runner.js";
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

describe("initial product-intent authority", () => {
  it("resolves attended product intent before compiling a PSP from exact authority", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-product-intent-"));
    const repository = path.join(parent, "calculator");
    try {
      const initialized = await mdlm(parent, "init", repository, "--json");
      expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);

      const map = await prepareNextAssignment(repository);
      expect(map.packet.scenario.reference).toBe(
        "establish-initial-wayfinding-map@2",
      );
      const initialIntentOutput = "product_intent";
      const mapOutputs: ProposedOutput[] = [{
        localId: "map",
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          type: "MAP",
          payload: {
            title: "Calculator product-intent frontier",
            purpose: "Obtain the user's exact intended product before specification.",
            frontier: [
              "$proposal.product_intent.revision_id",
              "$proposal.optional-one.revision_id",
              "$proposal.optional-two.revision_id",
            ],
          },
          links: [
            { type: "indexes", target: "$proposal.product_intent.id" },
            { type: "indexes", target: "$proposal.optional-one.id" },
            { type: "indexes", target: "$proposal.optional-two.id" },
          ],
          body: "The map indexes the initial product intent and every optional Question.\n",
        },
      }, {
        localId: "product_intent",
        name: initialIntentOutput,
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: "Requested output boundary",
            kind: "preferential",
            intent_scope: "product",
            question: "What product do you currently intend to build?",
            state: "open",
            blocking_impact: "A PSP cannot be compiled without the user's answer.",
          },
          links: [],
          body: "The initial product intent requires an attended stakeholder answer.\n",
        },
      }, ...["one", "two"].map((suffix): ProposedOutput => ({
        localId: `optional-${suffix}`,
        name: "questions",
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: `Already answered optional Question ${suffix}`,
            kind: "empirical",
            evidence_available: true,
            question: `Was optional observation ${suffix} supplied?`,
            state: "answered",
            blocking_impact: "None; the observation is already answered.",
          },
          links: [],
          body: "The optional initial Question is structurally indexed by the MAP.\n",
        },
      }))];
      const incompleteMapOutputs = structuredClone(mapOutputs);
      incompleteMapOutputs[0]!.lifecycleDatum.links = incompleteMapOutputs[0]!
        .lifecycleDatum.links.filter((link) =>
          link.target !== "$proposal.optional-two.id"
        );
      const beforeUnindexed = await directoryDigest(
        path.join(repository, ".lifecycle", "data"),
      );
      const unindexed = await submitAssignment(repository, map, incompleteMapOutputs);
      expect(unindexed.status).toBe(1);
      expect(JSON.parse(unindexed.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-output-required-link-missing" }),
        ]),
      );
      expect(await directoryDigest(path.join(repository, ".lifecycle", "data")))
        .toBe(beforeUnindexed);

      const checkpointedProductIntent = structuredClone(mapOutputs);
      checkpointedProductIntent[1]!.lifecycleDatum.payload.attention_checkpoint =
        "phase-0-gate";
      checkpointedProductIntent[1]!.lifecycleDatum.payload.consolidation_group =
        "phase-0-stakeholder-questions";
      const checkpointed = await submitAssignment(
        repository,
        map,
        checkpointedProductIntent,
      );
      expect(checkpointed.status).toBe(1);
      expect(JSON.parse(checkpointed.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      );
      expect(await directoryDigest(path.join(repository, ".lifecycle", "data")))
        .toBe(beforeUnindexed);

      const freshMap = await prepareNextAssignment(
        repository,
        "establish-initial-wayfinding-map@2",
      );
      const duplicateProductIntent = structuredClone(mapOutputs);
      duplicateProductIntent[2]!.lifecycleDatum.payload.kind = "preferential";
      duplicateProductIntent[2]!.lifecycleDatum.payload.intent_scope = "product";
      delete duplicateProductIntent[2]!.lifecycleDatum.payload.evidence_available;
      const duplicated = await submitAssignment(
        repository,
        freshMap,
        duplicateProductIntent,
      );
      expect(duplicated.status).toBe(1);
      expect(JSON.parse(duplicated.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      );
      expect(await directoryDigest(path.join(repository, ".lifecycle", "data")))
        .toBe(beforeUnindexed);

      const deferredProductIntent = structuredClone(mapOutputs);
      deferredProductIntent[1]!.lifecycleDatum.payload.resolution_disposition =
        "defer";
      const deferred = await submitAssignment(
        repository,
        freshMap,
        deferredProductIntent,
      );
      expect(deferred.status).toBe(1);
      expect(JSON.parse(deferred.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      );
      expect(await directoryDigest(path.join(repository, ".lifecycle", "data")))
        .toBe(beforeUnindexed);

      const validMap = await prepareNextAssignment(
        repository,
        "establish-initial-wayfinding-map@2",
      );
      const publishedMap = await submitAssignment(repository, validMap, mapOutputs);
      expect(publishedMap.status, `${publishedMap.stderr}${publishedMap.stdout}`).toBe(0);
      const mapExecution = JSON.parse(publishedMap.stdout).execution;
      const openQuestion = mapExecution.outputs.find(
        (output: { name: string }) => output.name === initialIntentOutput,
      ).lifecycleDatum;

      const boundary = await prepareNextAssignment(repository);
      expect(boundary.packet.scenario.reference).toBe("freeze-source-boundary@1");
      expect(inputRevision(boundary, "source")).toBe(openQuestion.revisionId);
      const bounded = await submitAssignment(repository, boundary, [{
        localId: "boundary",
        name: "boundary",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Exact initial product-intent source boundary",
            kind: "source-boundary",
            role: "source-boundary",
            scope: openQuestion.revisionId,
            group: "SAME-LINEAGE",
            definition_members: [openQuestion.revisionId],
            evidence: [],
          },
          links: [],
          body: "The initial product-intent Question is the exact source boundary.\n",
        },
      }]);
      expect(bounded.status, `${bounded.stderr}${bounded.stdout}`).toBe(0);
      const sourceBoundary = JSON.parse(bounded.stdout).execution.outputs[0]
        .lifecycleDatum.revisionId as string;

      const resolution = await prepareNextAssignment(repository, "resolve-question@2");
      expect(resolution.outcome).toEqual(expect.objectContaining({
        outcome: "attention-required",
        authorityRequirement: expect.objectContaining({
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        }),
      }));
      expect(inputRevision(resolution, "question")).toBe(openQuestion.revisionId);
      const answeredQuestion = `${openQuestion.id}-r00002`;
      const attendedAnswer = [
        "Build the minimum command-line `temperature-converter <value> <source-unit>` product.",
        "Accept only uppercase `F` and `C` source units.",
        "For `F`, output Celsius using `(F - 32) * 5 / 9`; for `C`, output Fahrenheit using `C * 9 / 5 + 32`.",
        "Print the converted number and destination unit, round half away from zero to at most two decimals, and omit trailing zeros.",
        "Reject a wrong argument count, a malformed or non-finite value, an unsupported unit, and a non-finite result with a nonzero exit, a concise stderr message, and no stdout.",
        "Do not add interactive input, configuration, networking, a conversion framework, or production hardening. Keep one direct implementation with no runtime dependencies.",
      ].join(" ");
      const resolutionOutputs: ProposedOutput[] = [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Build the minimum command-line temperature converter",
            rationale: "This is the product the user explicitly requested.",
            kind: "scope",
            decision: attendedAnswer,
            alternatives: ["Build a conversion framework", "Infer scope from the repository name"],
            effective_scope: answeredQuestion,
          },
          links: [
            { type: "resolves", target: openQuestion.revisionId },
            { type: "resolves", target: "$proposal.answered.revision_id" },
          ],
          body: "The attended stakeholder answer fixes the exact initial product intent.\n",
        },
      }, {
        localId: "answered",
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: openQuestion.id,
          type: "QST",
          payload: {
            title: "Requested output boundary",
            kind: "preferential",
            intent_scope: "product",
            question: "What product do you currently intend to build?",
            state: "answered",
            blocking_impact: "A PSP cannot be compiled without the user's answer.",
            attended_answer: attendedAnswer,
          },
          links: [],
          body: "The initial product-intent Question has an attended answer.\n",
        },
      }];
      const incompleteAnswer = structuredClone(resolutionOutputs);
      delete incompleteAnswer[1]!.lifecycleDatum.payload.intent_scope;
      const beforeIncompleteAnswer = await directoryDigest(
        path.join(repository, ".lifecycle", "data"),
      );
      const rejectedIncompleteAnswer = await submitAssignment(
        repository,
        resolution,
        incompleteAnswer,
      );
      expect(rejectedIncompleteAnswer.status).toBe(1);
      expect(JSON.parse(rejectedIncompleteAnswer.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      );
      expect(await directoryDigest(path.join(repository, ".lifecycle", "data")))
        .toBe(beforeIncompleteAnswer);

      const workerResponse = assignmentResponse(resolution, resolutionOutputs) as JsonObject;
      const workerProposal = workerResponse.proposal as JsonObject;
      workerProposal.authoritySupplies = [
        "stakeholder attended-authority-holder invocation 0",
      ];
      const session: PiAssignmentSession = {
        get isIdle() { return true; },
        prompt: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
        dispose: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      };
      const runner = new PiAssignmentRunner({
        repository,
        assignmentTimeoutMs: 1_000,
        sessionFactory: vi.fn(async (_packet, capture) => {
          session.prompt = vi.fn(async () => { capture(workerResponse); });
          return session;
        }),
      });
      const carriedResponse = await runner.run(
        resolution.packet as AssignmentPacket,
        {
          attendedContext: {
            authorityRequirement: resolution.outcome.authorityRequirement,
            authoritySupply: {
              authority: "stakeholder",
              source: "attended-authority-holder",
            },
            conclusion: {
              statement: "Build the exact four-operation command-line calculator.",
            },
          },
        },
      );
      expect((carriedResponse.proposal as JsonObject).authoritySupplies).toEqual([
        "stakeholder",
      ]);
      const resolved = await mdlmWithInput(
        repository,
        `${JSON.stringify(carriedResponse)}\n`,
        "scenario",
        "submit",
      );
      await runner.dispose();
      expect(resolved.status, `${resolved.stderr}${resolved.stdout}`).toBe(0);
      const resolutionExecution = JSON.parse(resolved.stdout).execution;
      expect(resolutionExecution.authority.supplied).toEqual(["stakeholder"]);
      const decision = resolutionExecution.outputs.find(
        (output: { name: string }) => output.name === "decision",
      ).lifecycleDatum;

      let failedReviewRevision: string | undefined;
      for (let step = 0; step < 6; step += 1) {
        const prepared = await prepareNextAssignment(repository);
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
        const prepared = await prepareNextAssignment(repository);
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
      const product = await submitAssignment(repository, compile!, [productOutput]);
      expect(product.status, `${product.stderr}${product.stdout}`).toBe(0);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 120_000);
});
