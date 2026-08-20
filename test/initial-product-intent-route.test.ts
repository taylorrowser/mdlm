import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentPacket,
  JsonObject,
} from "../packages/mdlm-pi/src/mdlm-client.js";
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
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

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
      const initialized = mdlm(parent, "init", repository, "--json");
      expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);

      const map = prepareNextAssignment(repository);
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
      const unindexed = submitAssignment(repository, map, incompleteMapOutputs);
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
      const checkpointed = submitAssignment(
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

      const freshMap = prepareNextAssignment(
        repository,
        "establish-initial-wayfinding-map@2",
      );
      const duplicateProductIntent = structuredClone(mapOutputs);
      duplicateProductIntent[2]!.lifecycleDatum.payload.kind = "preferential";
      duplicateProductIntent[2]!.lifecycleDatum.payload.intent_scope = "product";
      delete duplicateProductIntent[2]!.lifecycleDatum.payload.evidence_available;
      const duplicated = submitAssignment(
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
      const deferred = submitAssignment(
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

      const validMap = prepareNextAssignment(
        repository,
        "establish-initial-wayfinding-map@2",
      );
      const publishedMap = submitAssignment(repository, validMap, mapOutputs);
      expect(publishedMap.status, `${publishedMap.stderr}${publishedMap.stdout}`).toBe(0);
      const mapExecution = JSON.parse(publishedMap.stdout).execution;
      const openQuestion = mapExecution.outputs.find(
        (output: { name: string }) => output.name === initialIntentOutput,
      ).lifecycleDatum;

      const boundary = prepareNextAssignment(repository);
      expect(boundary.packet.scenario.reference).toBe("freeze-source-boundary@1");
      expect(inputRevision(boundary, "source")).toBe(openQuestion.revisionId);
      const bounded = submitAssignment(repository, boundary, [{
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

      const resolution = prepareNextAssignment(repository, "resolve-question@2");
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
      const resolutionOutputs: ProposedOutput[] = [{
        localId: "decision",
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Build a four-operation command-line calculator",
            rationale: "This is the product the user explicitly requested.",
            kind: "scope",
            decision: "Build a command-line calculator supporting add, subtract, multiply, and divide.",
            alternatives: ["Build a graphical calculator", "Infer scope from the repository name"],
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
      const rejectedIncompleteAnswer = submitAssignment(
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
      workerProposal.authoritySupplies = [];
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
      const resolved = mdlmWithInput(
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

      let compile: PreparedAssignment | undefined;
      let reviewedDecision = false;
      for (let step = 0; step < 6; step += 1) {
        const prepared = prepareNextAssignment(repository);
        const scenario = prepared.packet.scenario.reference as string;
        if (scenario === "compile-psp@3") {
          compile = prepared;
          break;
        }
        expect(scenario).toBe("review-datum-in-context@2");
        if (inputRevision(prepared, "subject") === decision.revisionId) {
          reviewedDecision = true;
          expect(inputRevisions(prepared, "context_members")).toEqual(
            expect.arrayContaining([
              openQuestion.revisionId,
              answeredQuestion,
              sourceBoundary,
            ]),
          );
        }
        const reviewed = submitAssignment(repository, prepared, reviewOutput(prepared));
        expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
      }
      expect(reviewedDecision).toBe(true);
      expect(compile).toBeDefined();
      expect(inputRevision(compile!, "product_intent_authority")).toBe(
        decision.revisionId,
      );

      const productOutput: ProposedOutput = {
        localId: "product",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Four-operation command-line calculator",
            rationale: "Compile only the exact attended product intent.",
            problem: "A user needs basic arithmetic from a terminal.",
            users: ["command-line users"],
            goals: ["support add, subtract, multiply, and divide"],
            non_goals: ["graphical interface", "scientific functions"],
            workflows: ["provide an operation and operands, then receive the result"],
            success_measures: ["all four requested operations return correct results"],
          },
          links: [],
          body: "The PSP contains no product scope beyond the attended answer.\n",
        },
      };
      const dataRoot = path.join(repository, ".lifecycle", "data");
      const beforeUnsupported = await directoryDigest(dataRoot);
      const unsupported = submitAssignment(repository, compile!, [productOutput]);
      expect(unsupported.status).toBe(1);
      expect(JSON.parse(unsupported.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "scenario-output-required-link-missing" }),
        ]),
      );
      expect(await directoryDigest(dataRoot)).toBe(beforeUnsupported);

      productOutput.lifecycleDatum.links = [{
        type: "derived-from",
        target: decision.revisionId,
      }];
      const product = submitAssignment(repository, compile!, [productOutput]);
      expect(product.status, `${product.stderr}${product.stdout}`).toBe(0);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 45_000);
});
