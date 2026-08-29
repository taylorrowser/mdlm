import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  claimNextWork,
  submitAssignmentResponse,
  type AssignmentPacket,
} from "../src/assignment.js";
import { initializeRepositoryFromProcessPackage } from "../src/repository-initialization.js";

const processRoot = path.join(process.cwd(), ".lifecycle/process");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

function response(
  packet: AssignmentPacket,
  payloads: Record<string, Record<string, unknown>>,
): string {
  return JSON.stringify({
    ...packet.responseScaffold,
    proposal: {
      ...packet.responseScaffold.proposal,
      outputs: packet.responseScaffold.proposal.outputs.map((output) => ({
        ...output,
        payload: payloads[output.handle] ?? {},
        body: `# ${output.handle}\n`,
      })),
    },
  });
}

async function preferAtomicFoundationWork(
  packageRoot: string,
): Promise<void> {
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

async function addOptionalInitialOutput(packageRoot: string): Promise<void> {
  const scenarioPath = path.join(
    packageRoot,
    "scenarios/establish-initial-wayfinding-map.yaml",
  );
  const scenario = parse(await fs.readFile(scenarioPath, "utf8"));
  scenario.outputs.push({
    name: "optional_question",
    types: ["QST"],
    cardinality: "zero-or-one",
    required_links: [],
  });
  await fs.writeFile(scenarioPath, stringify(scenario));
}

async function lifecycleMarkdown(repository: string): Promise<string[]> {
  const root = path.join(repository, ".lifecycle/data");
  const entries = await fs.readdir(root, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".md")).sort();
}

describe("atomic Review submission", () => {
  it("keeps optional handles while omitting their publication", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-optional-output-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const packageRoot = path.join(root, "package");
    await fs.cp(processRoot, packageRoot, { recursive: true });
    await addOptionalInitialOutput(packageRoot);
    const initialized = await initializeRepositoryFromProcessPackage(repository, packageRoot);
    expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
      .toBe(true);
    if (!initialized.ok) return;

    const claimed = await claimNextWork(repository);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok || claimed.value.outcome !== "assignment") return;
    const packet = claimed.value.assignment.packet;
    const proposal = JSON.parse(response(packet, {
      map: {
        title: "Initial map",
        purpose: "Exercise optional symbolic output omission.",
        frontier: ["product-intent"],
      },
      product_intent: {
        title: "Intended product",
        kind: "preferential",
        intent_scope: "product",
        question: "What product should this repository build?",
        state: "open",
        blocking_impact: "The product specification waits for an answer.",
      },
      questions: {
        title: "Empirical boundary",
        kind: "empirical",
        question: "Which evidence bounds the product?",
        state: "open",
        blocking_impact: "No product claim is inferred from repository evidence.",
      },
    }));
    const optional = proposal.proposal.outputs.find(
      (output: Record<string, unknown>) => output.handle === "optional_question",
    );
    optional.payload = null;
    optional.body = null;
    expect(proposal.proposal.outputs.map(
      (output: Record<string, unknown>) => output.handle,
    )).toEqual(packet.responseScaffold.proposal.outputs.map((output) => output.handle));

    const halfNull = structuredClone(proposal);
    halfNull.proposal.outputs.find(
      (output: Record<string, unknown>) => output.handle === "optional_question",
    ).body = "# authored optional body\n";
    const halfNullRejected = await submitAssignmentResponse(
      repository,
      JSON.stringify(halfNull),
    );
    expect(halfNullRejected.ok).toBe(false);
    expect(halfNullRejected.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "assignment-response-output-omission-invalid" }),
    ]));

    const requiredNull = structuredClone(proposal);
    const required = requiredNull.proposal.outputs.find(
      (output: Record<string, unknown>) => output.handle === "product_intent",
    );
    required.payload = null;
    required.body = null;
    const rejected = await submitAssignmentResponse(repository, JSON.stringify(requiredNull));
    expect(rejected.ok).toBe(false);
    expect(rejected.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "assignment-response-output-omission-invalid" }),
    ]));

    const accepted = await submitAssignmentResponse(repository, JSON.stringify(proposal));
    expect(accepted.ok, accepted.ok ? "" : JSON.stringify(accepted.diagnostics)).toBe(true);
    if (!accepted.ok || accepted.value.outcome !== "accepted") return;
    expect(accepted.value.receipt.publications.map((publication) => publication.handle))
      .toEqual(["map", "product_intent", "questions"]);
  });

  it("publishes the kernel-built exact context and REV together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-atomic-submit-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const packageRoot = path.join(root, "package");
    await fs.cp(processRoot, packageRoot, { recursive: true });
    await preferAtomicFoundationWork(packageRoot);
    const initialized = await initializeRepositoryFromProcessPackage(
      repository,
      packageRoot,
    );
    expect(initialized.ok, initialized.ok ? "" : JSON.stringify(initialized.diagnostics))
      .toBe(true);
    if (!initialized.ok) return;

    const initial = await claimNextWork(repository);
    expect(initial.ok).toBe(true);
    if (!initial.ok || initial.value.outcome !== "assignment") return;
    const first = initial.value.assignment.packet;
    const created = await submitAssignmentResponse(repository, response(first, {
      map: {
        title: "Initial map",
        purpose: "Create one exact subject for atomic Review.",
        frontier: ["product-intent"],
      },
      product_intent: {
        title: "Intended product",
        kind: "preferential",
        intent_scope: "product",
        question: "What product should this repository build?",
        state: "open",
        blocking_impact: "The product specification waits for an answer.",
      },
      questions: {
        title: "Empirical boundary",
        kind: "empirical",
        question: "Which evidence bounds the product?",
        state: "open",
        blocking_impact: "No product claim is inferred from repository evidence.",
      },
    }));
    expect(created.ok, created.ok ? "" : JSON.stringify(created.diagnostics)).toBe(true);
    if (!created.ok || created.value.outcome !== "accepted") return;
    const map = created.value.receipt.publications.find(
      (publication) => publication.handle === "map",
    );
    expect(map).toBeDefined();

    const reviewOutcome = await claimNextWork(repository);
    expect(
      reviewOutcome.ok,
      reviewOutcome.ok ? "" : JSON.stringify(reviewOutcome.diagnostics),
    ).toBe(true);
    if (!reviewOutcome.ok || reviewOutcome.value.outcome !== "assignment") return;
    const packet = reviewOutcome.value.assignment.packet;
    expect(packet.scenario.reference).toBe("review-phase-0-foundation@1");
    expect(packet.outputs.find((output) => output.handle === "context")?.payloadSummary)
      .toMatchObject({
        kernelManaged: expect.arrayContaining([
          "scope",
          "definition_members",
          "evidence",
        ]),
      });

    const beforeInvalid = await lifecycleMarkdown(repository);
    const rejected = await submitAssignmentResponse(repository, response(packet, {
      context: { caller_authored_context: "must be replaced" },
      review: {},
    }));
    expect(rejected.ok).toBe(false);
    expect(await lifecycleMarkdown(repository)).toEqual(beforeInvalid);

    const recovered = await claimNextWork(repository);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok || recovered.value.outcome !== "assignment") return;
    expect(recovered.value.assignment.id).toBe(reviewOutcome.value.assignment.id);
    const accepted = await submitAssignmentResponse(repository, response(
      recovered.value.assignment.packet,
      {
        context: { caller_authored_context: "must be replaced" },
        review: {
          title: "Review the initial map",
          review_kind: "phase-0-foundation",
          outcome: "pass",
          reviewer: "independent-reviewer",
          summary: "The exact map is supported by its frozen context.",
          findings: [],
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          correction_authority: "author",
        },
      },
    ));
    expect(accepted.ok, accepted.ok ? "" : JSON.stringify(accepted.diagnostics)).toBe(true);
    if (!accepted.ok || accepted.value.outcome !== "accepted") return;
    expect(accepted.value.receipt.publications.map((item) => item.handle))
      .toEqual(["context", "review"]);

    const execution = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/data/.transactions",
      accepted.value.settlement.execution,
      "execution.json",
    ), "utf8"));
    const context = execution.outputs.find(
      (output: Record<string, unknown>) => output.handle === "context",
    ).data;
    expect(context.payload).not.toHaveProperty("caller_authored_context");
    expect(context.payload.definition_members).toContain(map!.revisionId);
    expect(execution.outputs.map(
      (output: { data: { type: string } }) => output.data.type,
    )).toEqual(["BSL", "REV"]);
  });
});
