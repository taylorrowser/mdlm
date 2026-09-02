import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

type Json = Record<string, any>;

const fixture = path.join(
  process.cwd(),
  "test/fixtures/formal-ver-review-failed-phase3.repository.bundle",
);

function input(packet: Json, name: string): Json[] {
  const found = packet.exactInputs[0].inputs.find(
    (candidate: Json) => candidate.name === name,
  );
  expect(found, `Missing exact input '${name}'`).toBeDefined();
  return found.values;
}

function response(packet: Json, outputs: Json[]): string {
  const value = structuredClone(packet.responseScaffold);
  value.proposal.outputs = outputs;
  value.proposal.completionEvidence = {
    summary: `Completed ${packet.scenario.reference}.`,
  };
  return `${JSON.stringify(value)}\n`;
}

function commit(repository: string, message: string): void {
  expect(spawnSync("git", ["-C", repository, "add", ".lifecycle"]).status).toBe(0);
  const result = spawnSync("git", [
    "-C", repository,
    "-c", "user.name=MDLM Test",
    "-c", "user.email=mdlm-test@localhost",
    "-c", "commit.gpgSign=false",
    "commit", "--quiet", "--no-verify", "-m", message,
  ], { encoding: "utf8" });
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

it("corrects a failed formal VER and reports the exact Phase 3 candidate blocker", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-formal-ver-correction-"));
  try {
    const repository = path.join(root, "repository");
    const cloned = spawnSync("git", ["clone", "--quiet", fixture, repository], {
      encoding: "utf8",
    });
    expect(cloned.status, `${cloned.stderr}${cloned.stdout}`).toBe(0);

    const next = mdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome.outcome).toBe("assignment");
    const packet = outcome.assignment.packet;
    expect(packet.scenario.reference).toBe(
      "revise-formal-verification-activity-after-review@1",
    );
    const failedActivity = input(packet, "activity")[0]!;
    const failedReview = input(packet, "failed_reviews")[0]!;
    const requirement = input(packet, "requirements")[0]!;

    const looseEnds = mdlm(repository, "loose-ends", "--json");
    expect(looseEnds.status, `${looseEnds.stderr}${looseEnds.stdout}`).toBe(0);
    const items = JSON.parse(looseEnds.stdout).looseEnds.items;
    const candidate = items.find(
      (item: Json) => item.obligation === "definition-level-candidate-required",
    );
    expect(candidate).toMatchObject({
      status: "blocked",
      explanation: "Formal verification coverage must pass Review before the direct definition candidate can be created.",
    });
    expect(candidate!.blockedBy).toContainEqual(expect.stringContaining(
      `formal-verification-activity-required@1:${requirement.identity.revision_id}:`,
    ));

    const replacementTemplate = packet.responseScaffold.proposal.outputs.find(
      (output: Json) => (output.output ?? output.handle) === "replacement",
    );
    const corrected = mdlmWithInput(
      repository,
      response(packet, [{
        ...replacementTemplate,
        payload: {
          ...failedActivity.data.payload,
          title: "Corrected formal verification for the exact component claim",
          rationale: "The criteria now exercise only the supplied exact component requirement.",
          acceptance_criteria: ["The exact component requirement is satisfied."],
          expected_success_activity: "Exercise the exact component requirement and observe its required result.",
          expected_discrimination_activity: "Exercise a contradictory result and observe rejection.",
          evidence_requirements: ["Retain the exact public invocation and observed result."],
        },
        body: "The corrected activity now tests only its exact requirement.\n",
      }]),
      "scenario", "submit", "-", "--json",
    );
    expect(corrected.status, `${corrected.stderr}${corrected.stdout}`).toBe(0);
    const accepted = JSON.parse(corrected.stdout);
    const replacement = accepted.receipt.publications.find(
      (publication: Json) => publication.handle === "replacement",
    ).revisionId;
    expect(replacement.replace(/-r[0-9]{5}$/, "")).toBe(
      failedActivity.identity.revision_id.replace(/-r[0-9]{5}$/, ""),
    );
    expect(replacement).not.toBe(failedActivity.identity.revision_id);
    commit(repository, "Correct the failed formal VER");

    const context = mdlm(repository, "next", "--json");
    expect(context.status, `${context.stderr}${context.stdout}`).toBe(0);
    expect(JSON.parse(context.stdout).outcome).toBe("publication-required");
    commit(repository, "Publish the corrected formal VER context");

    const review = mdlm(repository, "next", "--json");
    expect(review.status, `${review.stderr}${review.stdout}`).toBe(0);
    const reviewPacket = JSON.parse(review.stdout).assignment.packet;
    expect(reviewPacket.scenario.reference).toBe("review-datum-in-context@3");
    expect(input(reviewPacket, "subject")[0]!.identity.revision_id).toBe(replacement);
    const reviewTemplate = reviewPacket.responseScaffold.proposal.outputs.find(
      (output: Json) => (output.output ?? output.handle) === "review",
    );
    const reviewed = mdlmWithInput(
      repository,
      response(reviewPacket, [{
        ...reviewTemplate,
        payload: {
          title: "Review the corrected formal verification activity",
          review_kind: "contextual",
          reviewer: "independent-reviewer",
          summary: "The replacement matches its exact requirement and strategy.",
          rubric_ref: "policies/rubrics/bootstrap-review.md@3",
          findings: [],
          outcome: "pass",
        },
        body: "The corrected activity passes independent Review.\n",
      }]),
      "scenario", "submit", "-", "--authority", "independent-reviewer", "--json",
    );
    expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);
    commit(repository, "Review the corrected formal VER");

    const after = mdlm(repository, "loose-ends", "--json");
    expect(after.status, `${after.stderr}${after.stdout}`).toBe(0);
    const afterItems = JSON.parse(after.stdout).looseEnds.items;
    expect(afterItems).not.toContainEqual(expect.objectContaining({
      obligation: "formal-verification-activity-review-correction-required",
      subject: failedActivity.identity.revision_id,
    }));
    expect(afterItems).not.toContainEqual(expect.objectContaining({
      obligation: "formal-verification-activity-required",
      subject: requirement.identity.revision_id,
    }));

    expect(mdlm(repository, "show", failedActivity.identity.revision_id, "--json").status)
      .toBe(0);
    expect(mdlm(repository, "show", failedReview.identity.revision_id, "--json").status)
      .toBe(0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
