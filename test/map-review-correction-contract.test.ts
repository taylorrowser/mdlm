import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  claimNextWork,
  submitAssignmentResponse,
  type AssignmentPacket,
} from "../src/assignment.js";
import { initializeRepositoryFromProcessPackage } from
  "../src/repository-initialization.js";

const processRoot = path.join(process.cwd(), ".lifecycle/process");
const temporaryRoots: string[] = [];
type JsonObject = Record<string, any>;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

function input(packet: AssignmentPacket, name: string) {
  return packet.exactInputs[0]!.inputs.find((candidate) => candidate.name === name)!;
}

async function preferReviewWork(packageRoot: string): Promise<void> {
  const phasePath = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.routing.status_order = [
    "awaiting-review",
    "ready",
    "failed",
    "stale",
    "blocked",
  ];
  await fs.writeFile(phasePath, stringify(phase));
}

function response(packet: AssignmentPacket, failMapReview = false): string {
  const source: JsonObject = structuredClone(packet.responseScaffold);
  const scenario = packet.scenario.reference;
  if (scenario === "establish-initial-wayfinding-map@2") {
    const payloads: Record<string, Record<string, unknown>> = {
      map: {
        title: "Initial product wayfinding",
        purpose: "Index the product-intent decision that controls product work.",
        frontier: ["Product intent"],
      },
      product_intent: {
        title: "Choose the product",
        kind: "preferential",
        intent_scope: "product",
        question: "What product should this repository build?",
        state: "open",
        blocking_impact: "PSP compilation waits for the product boundary.",
      },
      questions: {
        title: "Bound the product evidence",
        kind: "empirical",
        question: "Which evidence bounds the product?",
        state: "open",
        blocking_impact: "No evidence claim should be inferred.",
      },
    };
    source.proposal.outputs = source.proposal.outputs.map((output: JsonObject) => ({
      ...output,
      payload: payloads[output.handle],
      body: `# ${output.handle}\n`,
    }));
  } else if (scenario === "freeze-source-boundary@1") {
    const subject = input(packet, "source").values[0]!;
    source.proposal.outputs[0]!.payload = {
      title: `Source boundary for ${subject.identity.revision_id}`,
      kind: "source-boundary",
      role: "source-boundary",
      scope: subject.identity.revision_id,
      group: "SAME-LINEAGE",
      definition_members: [subject.identity.revision_id],
      evidence: [],
    };
    source.proposal.outputs[0]!.body = "The exact source Revision is frozen.\n";
  } else if (scenario === "resolve-question@2") {
    const question = input(packet, "question").values[0]!;
    for (const output of source.proposal.outputs) {
      if (output.handle === "updated_question") {
        output.payload = {
          ...question.data.payload,
          state: "answered",
          attended_answer: "Build a bounded text counter.",
        };
        output.body = "The stakeholder supplied the product boundary.\n";
      } else if (output.handle === "decision") {
        output.payload = {
          title: "Resolve the product-intent Question",
          kind: "scope",
          rationale: "The attended answer fixes the selected product.",
          decision: "Build a bounded text counter.",
          alternatives: ["Leave the Question open."],
          effective_scope: "$proposal.updated_question.revision_id",
        };
        output.body = "The attended answer authorizes this exact scope.\n";
      }
    }
  } else if (scenario === "review-phase-0-foundation@1") {
    const subject = input(packet, "subject").values[0]!;
    for (const output of source.proposal.outputs) {
      if (output.handle === "context") {
        output.payload = {};
        output.body = "The kernel freezes the exact Review Context.\n";
      } else if (output.handle === "review") {
        output.payload = {
          title: `Review ${subject.identity.revision_id}`,
          review_kind: "phase-0-foundation",
          reviewer: "independent-reviewer",
          summary: failMapReview
            ? "The MAP still presents the answered product Question as open."
            : "The exact subject is consistent with its frozen context.",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          findings: failMapReview
            ? [{
              id: "F-001",
              target: subject.identity.revision_id,
              relationship: "primary",
              severity: "blocking",
              summary: "Remove the stale open-frontier claim.",
              criterion: "The MAP must represent the current decision frontier.",
              evidence: "The indexed product Question is answered.",
              material_consequence: "The operator can request an answer twice.",
            }]
            : [],
          correction_authority: failMapReview ? "package-evidence" : "author",
          outcome: failMapReview ? "fail" : "pass",
        };
        output.body = failMapReview
          ? "The MAP needs one bounded correction.\n"
          : "The subject passes its contextual Review.\n";
      }
    }
  } else {
    throw new Error(`No focused response for ${scenario}`);
  }
  source.proposal.completionEvidence = { summary: "Focused MAP correction setup." };
  return JSON.stringify(source);
}

it("claims a MAP correction packet that retains its answered product Question", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-map-correction-"));
  temporaryRoots.push(root);
  const repository = path.join(root, "repository");
  const packageRoot = path.join(root, "package");
  await fs.cp(processRoot, packageRoot, { recursive: true });
  await preferReviewWork(packageRoot);
  const initialized = await initializeRepositoryFromProcessPackage(
    repository,
    packageRoot,
  );
  expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
    .toBe(true);
  if (!initialized.ok) return;

  let answeredQuestion: string | undefined;
  for (let step = 0; step < 10; step += 1) {
    const claimed = await claimNextWork(repository);
    expect(claimed.ok, claimed.ok ? "" : JSON.stringify(claimed.diagnostics)).toBe(true);
    if (!claimed.ok || !(
      claimed.value.outcome === "assignment" ||
      claimed.value.outcome === "attention-required"
    )) return;
    const packet = claimed.value.assignment.packet;

    if (packet.scenario.reference === "revise-wayfinding-map-after-review@1") {
      expect(packet.contract).toBe("mdlm-assignment-packet@3");
      expect(input(packet, "indexed_product_questions").values.map(
        (value) => value.identity.revision_id,
      )).toContain(answeredQuestion);
      expect(packet.outputs).toEqual([
        expect.objectContaining({
          handle: "replacement",
          requiredLinks: expect.arrayContaining([
            { link: "indexes", target: { input: "indexed_product_questions" } },
            { link: "corrects-review", target: { input: "failed_reviews" } },
          ]),
        }),
      ]);
      expect(packet.responseScaffold.proposal.outputs).toEqual([
        expect.objectContaining({
          handle: "replacement",
          links: expect.arrayContaining([
            {
              type: "indexes",
              target: { datum: answeredQuestion!.replace(/-r[0-9]{5}$/, "") },
            },
            { type: "corrects-review", target: { input: "failed_reviews" } },
          ]),
        }),
      ]);
      return;
    }

    const subjectType = packet.scenario.reference === "review-phase-0-foundation@1"
      ? input(packet, "subject").values[0]!.identity.type
      : undefined;
    const submitted = await submitAssignmentResponse(
      repository,
      response(packet, subjectType === "MAP" && answeredQuestion !== undefined),
      packet.scenario.reference === "resolve-question@2" ? ["stakeholder"] : [],
    );
    expect(submitted.ok, submitted.ok ? "" : JSON.stringify(submitted.diagnostics))
      .toBe(true);
    if (!submitted.ok || submitted.value.outcome !== "accepted") return;
    if (packet.scenario.reference === "resolve-question@2") {
      answeredQuestion = submitted.value.receipt.publications.find(
        (publication) => publication.handle === "updated_question",
      )?.revisionId;
      expect(answeredQuestion).toEqual(expect.any(String));
    }
  }
  throw new Error("The public operator seam did not claim the MAP correction");
}, 30_000);
