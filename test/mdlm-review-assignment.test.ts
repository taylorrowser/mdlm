import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  mdlm,
  mdlmWithEnvironment,
  mdlmWithInput,
  mdlmWithInputAndEnvironment,
} from "./helpers/mdlm.js";

const timeout = 60_000;

function parseLifecycleMarkdown(source: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match?.[1]) throw new Error("Lifecycle Markdown frontmatter unavailable");
  return { ...(parse(match[1]) as Record<string, unknown>), body: match[2] };
}

type Packet = {
  contract: string;
  assignment: { id: string };
  nextOutcome: { outcome: string };
  scenario: { reference: string };
  prompt: { skills: { reference: string }[] };
  exactInputs: {
    inputs: {
      name: string;
      values: {
        identity: { revision_id?: string; id: string; type: string };
      }[];
    }[];
  }[];
  policies: {
    role: string;
    reference: string;
    evaluations?: {
      invocation: number;
      arguments: Record<string, unknown>;
      result: Record<string, unknown>;
      assets: {
        reference: string;
        path: string;
        digest: string;
        content: string;
      }[];
    }[];
  }[];
  assets: {
    reference: string;
    path: string;
    digest: string;
    content: string;
  }[];
};

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

function expectSuccess(
  result: ReturnType<typeof mdlm>,
  command: string,
): void {
  expect(result.status, `${command}\n${result.stderr}${result.stdout}`).toBe(0);
}

function commitLifecycleData(repository: string, message: string): void {
  expectSuccess(git(repository, "add", ".lifecycle/data"), "git add");
  expectSuccess(
    git(
      repository,
      "-c", "user.name=MDLM Test",
      "-c", "user.email=mdlm-test@localhost",
      "-c", "commit.gpgSign=false",
      "commit", "--quiet", "--no-verify", "-m", message,
    ),
    "git commit",
  );
}

function prepareNext(repository: string): Packet {
  const next = mdlm(repository, "next", "--json");
  expectSuccess(next, "mdlm next");
  const nextOutcome = JSON.parse(next.stdout) as Packet["nextOutcome"] & {
    assignment: { id: string };
  };
  const prepared = mdlm(
    repository,
    "scenario", "prepare", nextOutcome.assignment.id, "--json",
  );
  expectSuccess(prepared, "mdlm scenario prepare");
  return {
    ...(JSON.parse(prepared.stdout) as Omit<Packet, "nextOutcome">),
    nextOutcome,
  };
}

function submitProposal(
  repository: string,
  packet: Packet,
  outputs: unknown[],
  authoritySupplies: string[] = [],
) {
  const response = {
    contract: "mdlm-assignment-response@1",
    assignment: packet.assignment.id,
    kind: "proposal",
    proposal: {
      outputs,
      completionEvidence: { summary: `Completed ${packet.scenario.reference}.` },
      loadedSkillRefs: packet.prompt.skills.map((skill) => skill.reference),
      authoritySupplies,
      standingDelegations: [],
    },
  };
  const source = `${JSON.stringify(response)}\n`;
  const submitted = mdlmWithInput(
    repository,
    source,
    "scenario", "submit", "-", "--json",
  );
  expectSuccess(submitted, "mdlm scenario submit");
  expect(`${JSON.stringify(response)}\n`).toBe(source);
  return JSON.parse(submitted.stdout);
}

async function lifecycleDatumCount(repository: string): Promise<number> {
  const entries = await fs.readdir(path.join(repository, ".lifecycle/data"), {
    recursive: true,
  });
  return entries.filter((entry) => entry.endsWith(".md")).length;
}

function exactInput(packet: Packet, name: string): string {
  const value = packet.exactInputs[0]?.inputs.find((input) => input.name === name)
    ?.values[0]?.identity;
  const exact = value?.revision_id ?? value?.id;
  if (!exact) throw new Error(`Missing exact '${name}' input`);
  return exact;
}

describe("delegated Review Assignment packets", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-review-packet-"));
    repository = path.join(parent, "repository");
    expectSuccess(mdlm(parent, "init", repository, "--json"), "mdlm init");
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it(
    "supplies the exact resolved rubric and accepts an unchanged packet-only judgment",
    async () => {
      const mapPacket = prepareNext(repository);
      const mapSubmission = submitProposal(repository, mapPacket, [{
      localId: "map",
      name: "map",
      invocation: 0,
      lifecycleDatum: {
        type: "MAP",
        payload: {
          title: "Review packet regression map",
          purpose: "Prove delegated reviewers receive exact policy evidence.",
          frontier: ["Review this exact map in its frozen context."],
        },
        links: [],
        body: "The packet must contain everything needed for independent judgment.\n",
      },
    }]);
      const mapRevision = mapSubmission.execution.outputs.find(
      (output: { name: string }) => output.name === "map",
    ).lifecycleDatum.revisionId as string;
      commitLifecycleData(repository, "Publish review packet regression map");

      const productPacket = prepareNext(repository);
      expect(productPacket.scenario.reference).toBe("compile-psp@2");
      const productSubmission = submitProposal(repository, productPacket, [{
      localId: "product",
      name: "product_specification",
      invocation: 0,
      lifecycleDatum: {
        type: "PSP",
        payload: {
          title: "Review packet regression product",
          rationale: "Keep the public lifecycle route genuine and bounded.",
          problem: "Delegated review packets can omit applicable rubric evidence.",
          users: ["independent reviewers"],
          goals: ["Supply exact resolved policy evidence in the packet."],
          non_goals: ["Predetermine the review outcome."],
          success_measures: ["A packet-only judgment submits unchanged."],
        },
        links: [],
        body: "A minimal product definition used only to reach the Review route.\n",
      },
    }]);
      commitLifecycleData(repository, "Publish review packet regression product");

      const nextReview = mdlmWithEnvironment(
        repository,
        { MDLM_PERFORMANCE: "json" },
        "next",
        "--json",
      );
      expectSuccess(nextReview, "mdlm next with automatic exact baseline");
      const performance = JSON.parse(nextReview.stderr);
      expect(performance).toEqual(expect.objectContaining({
        contract: "mdlm-performance@1",
        repository: expect.objectContaining({ loads: 1 }),
      }));
      const reviewAssignment = JSON.parse(nextReview.stdout).assignment.id as string;
      const preparedReview = mdlm(
        repository,
        "scenario", "prepare", reviewAssignment, "--json",
      );
      expectSuccess(preparedReview, "mdlm scenario prepare Review");
      const reviewPacket = JSON.parse(preparedReview.stdout) as Packet;
      expect(reviewPacket.contract).toBe("mdlm-assignment-packet@2");
      expect(reviewPacket.scenario.reference).toBe("review-datum-in-context@2");
      expect(reviewPacket.prompt.skills.map((skill) => skill.reference))
        .toContain("skills/review-correction-authority.md@1");
      expect(exactInput(reviewPacket, "subject")).toBe(mapRevision);
      expect(exactInput(reviewPacket, "review_context")).toMatch(
        /^BSL-[0-9A-HJKMNP-TV-Z]{10,12}-r00001$/,
      );
      const transactionRoot = path.join(repository, ".lifecycle/data/.transactions");
      const executionFiles = (await fs.readdir(transactionRoot)).map((id) =>
        path.join(transactionRoot, id, "execution.json")
      );
      const executions = await Promise.all(executionFiles.map(async (file) =>
        JSON.parse(await fs.readFile(file, "utf8")) as {
          definition?: { scenario?: string };
          response?: { assignment?: string };
        }
      ));
      const materializationExecution = executions.find((execution) =>
        execution.definition?.scenario === "create-review-context@1"
      );
      expect(materializationExecution?.response?.assignment).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(materializationExecution?.response?.assignment).not.toMatch(/^kernel-/);

      const reviewPolicy = reviewPacket.policies.find((policy) =>
      policy.role === "review"
    );
      expect(reviewPolicy).toEqual(
        expect.objectContaining({
          reference: "review-applicability@1",
          evaluations: [
            {
              invocation: 0,
              arguments: { subject: mapRevision },
              result: {
                required: true,
                rubric_ref: "policies/rubrics/bootstrap-review.md@3",
              },
              assets: [
                expect.objectContaining({
                  reference: "policies/rubrics/bootstrap-review.md@3",
                  path: "policies/rubrics/bootstrap-review.md",
                  digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
                  content: expect.stringContaining(
                    "correction_authority: package-evidence",
                  ),
                }),
              ],
            },
          ],
        }),
      );
      expect(reviewPacket.assets).toContainEqual(
        expect.objectContaining({
          reference: "policies/rubrics/bootstrap-review.md@3",
          digest: reviewPolicy?.evaluations?.[0]?.assets[0]?.digest,
          content: reviewPolicy?.evaluations?.[0]?.assets[0]?.content,
        }),
      );

      const rubricReference = reviewPolicy?.evaluations?.[0]?.result.rubric_ref;
      const reviewOutput = {
      localId: "review",
      name: "review",
      invocation: 0,
      lifecycleDatum: {
        type: "REV",
        payload: {
          title: "Independent review of the packet regression map",
          review_kind: "contextual",
          rubric_ref: rubricReference,
          findings: [],
          outcome: "pass",
        },
        links: [
          { type: "reviews", target: exactInput(reviewPacket, "subject") },
          {
            type: "contextualizes",
            target: exactInput(reviewPacket, "review_context"),
          },
        ],
        body: "Independent judgment: the exact map passes the supplied rubric.\n",
      },
    };
      const substitutedRubricResponse = {
      contract: "mdlm-assignment-response@1",
      assignment: reviewPacket.assignment.id,
      kind: "proposal",
      proposal: {
        outputs: [{
          ...reviewOutput,
          lifecycleDatum: {
            ...reviewOutput.lifecycleDatum,
            payload: {
              ...reviewOutput.lifecycleDatum.payload,
              rubric_ref: "policies/rubrics/substituted.md@9",
            },
          },
        }],
        completionEvidence: { summary: "Tried a substituted rubric." },
        loadedSkillRefs: reviewPacket.prompt.skills.map((skill) => skill.reference),
        authoritySupplies: ["independent-reviewer"],
        standingDelegations: [],
      },
    };
      const rejected = mdlmWithInput(
      repository,
      `${JSON.stringify(substitutedRubricResponse)}\n`,
      "scenario", "submit", "-", "--json",
    );
      expect(rejected.status, rejected.stderr).toBe(1);
      expect(JSON.parse(rejected.stdout)).toEqual(expect.objectContaining({
      disposition: "correction-required",
      malformedResponse: expect.objectContaining({ correctionsRemaining: 1 }),
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]),
    }));

      const reviewResponse = {
        contract: "mdlm-assignment-response@1",
        assignment: reviewPacket.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [reviewOutput],
          completionEvidence: {
            summary: `Completed ${reviewPacket.scenario.reference}.`,
          },
          loadedSkillRefs: reviewPacket.prompt.skills.map(
            (skill) => skill.reference,
          ),
          authoritySupplies: ["independent-reviewer"],
          standingDelegations: [],
        },
      };
      const expectedLifecycleDataCount = await lifecycleDatumCount(repository);
      const submittedReview = mdlmWithInputAndEnvironment(
        repository,
        `${JSON.stringify(reviewResponse)}\n`,
        { MDLM_PERFORMANCE: "json" },
        "scenario", "submit", "-", "--json",
      );
      expectSuccess(submittedReview, "mdlm scenario submit with performance diagnostics");
      const reviewSubmission = JSON.parse(submittedReview.stdout);
      expect(JSON.parse(submittedReview.stderr)).toMatchObject({
        contract: "mdlm-performance@1",
        repository: { loads: 1, markdownFiles: expectedLifecycleDataCount },
        stages: { "lifecycle.evaluation": { count: 2 } },
        work: {
          "lifecycle.evaluation.snapshots": 2,
          "repository.parse.records": expectedLifecycleDataCount,
          "repository.provenance.records": expectedLifecycleDataCount,
          "repository.validation.records": expectedLifecycleDataCount,
        },
      });
      const publishedOutput = reviewSubmission.execution.outputs[0];
      expect(publishedOutput.data.payload).toEqual(expect.objectContaining({
        rubric_ref: "policies/rubrics/bootstrap-review.md@3",
        outcome: "pass",
      }));
      expect(parseLifecycleMarkdown(await fs.readFile(
        path.join(repository, publishedOutput.lifecycleDatum.path),
        "utf8",
      ))).toEqual(publishedOutput.data);
    },
    timeout,
  );

  it(
    "rejects an unclassified failed Review atomically and routes explicit package-evidence correction autonomously",
    async () => {
      const mapPacket = prepareNext(repository);
      submitProposal(repository, mapPacket, [{
        localId: "map",
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          type: "MAP",
          payload: {
            title: "Offline availability review map",
            purpose: "Bound one offline availability commitment for independent Review.",
            frontier: ["Define the exact offline availability commitment."],
          },
          links: [],
          body: "A package-neutral route to one bounded product commitment.\n",
        },
      }]);
      commitLifecycleData(repository, "Publish offline availability map");

      const productPacket = prepareNext(repository);
      submitProposal(repository, productPacket, [{
        localId: "product",
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Bounded offline availability",
            rationale: "Users need one previously opened item while disconnected.",
            problem: "A brief connection loss currently hides all prior work.",
            users: ["field operator"],
            goals: ["Keep one previously opened item readable while offline."],
            non_goals: ["Offline editing", "Background synchronization"],
            success_measures: ["A previously opened item remains readable without a connection."],
          },
          links: [],
          body: "The commitment is deliberately bounded to read-only availability.\n",
        },
      }]);
      commitLifecycleData(repository, "Publish bounded offline availability product");

      const reviewPacket = prepareNext(repository);
      expect(reviewPacket.scenario.reference).toBe("review-datum-in-context@2");
      const subject = exactInput(reviewPacket, "subject");
      const reviewContext = exactInput(reviewPacket, "review_context");
      const failedReview = {
        localId: "review",
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: "Independent Review of offline availability wayfinding",
            review_kind: "contextual",
            rubric_ref: "policies/rubrics/bootstrap-review.md@3",
            findings: [{
              id: "F-001",
              target: subject,
              relationship: "primary",
              severity: "blocking",
              criterion: "The wayfinding frontier must identify the bounded product outcome under Review.",
              evidence: "The frontier names definition work but does not identify the read-only availability boundary.",
              material_consequence: "The next product Revision could broaden offline behavior without package evidence.",
              summary: "Name the bounded read-only availability outcome.",
            }],
            outcome: "fail",
          },
          links: [
            { type: "reviews", target: subject },
            { type: "contextualizes", target: reviewContext },
          ],
          body: "The exact subject has one package-bounded blocking defect.\n",
        },
      };
      const response = (output: typeof failedReview) => ({
        contract: "mdlm-assignment-response@1",
        assignment: reviewPacket.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [output],
          completionEvidence: { summary: "Completed independent Review." },
          loadedSkillRefs: reviewPacket.prompt.skills.map(
            (skill) => skill.reference,
          ),
          authoritySupplies: ["independent-reviewer"],
          standingDelegations: [],
        },
      });
      const before = await lifecycleDatumCount(repository);

      const omitted = mdlmWithInput(
        repository,
        `${JSON.stringify(response(failedReview))}\n`,
        "scenario", "submit", "-", "--json",
      );

      expect(omitted.status, omitted.stderr).toBe(1);
      expect(JSON.parse(omitted.stdout)).toEqual(expect.objectContaining({
        disposition: "correction-required",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "scenario-completion-failed" }),
        ]),
      }));
      expect(await lifecycleDatumCount(repository)).toBe(before);

      const classified = structuredClone(failedReview);
      (classified.lifecycleDatum.payload as Record<string, unknown>)
        .correction_authority = "package-evidence";
      const submitted = mdlmWithInput(
        repository,
        `${JSON.stringify(response(classified))}\n`,
        "scenario", "submit", "-", "--json",
      );
      expectSuccess(submitted, "submit classified failed Review");
      commitLifecycleData(repository, "Publish package-evidence Review failure");

      const correction = prepareNext(repository);
      expect(correction.nextOutcome.outcome).toBe("assignment");
      expect(correction.scenario.reference).toBe("revise-foundation-after-review@5");
      const failedReviewRevision = exactInput(correction, "failed_reviews");
      expect(failedReviewRevision).toMatch(/^REV-/);
      const correctionSubject = correction.exactInputs[0]?.inputs.find(
        (input) => input.name === "subject",
      )?.values[0]?.identity;
      expect(correctionSubject?.type).toBe("MAP");
      const corrected = submitProposal(repository, correction, [{
        localId: "replacement",
        name: "replacement",
        invocation: 0,
        lifecycleDatum: {
          id: correctionSubject!.id,
          type: "MAP",
          payload: {
            title: "Bounded offline availability review map",
            purpose: "Bound one read-only offline availability commitment for independent Review.",
            frontier: ["Define read-only access to one previously opened item while offline."],
          },
          links: [{ type: "corrects-review", target: failedReviewRevision }],
          body: "The corrected frontier names the exact package-bounded outcome.\n",
        },
      }]);
      expect(corrected.execution.outputs).toHaveLength(1);
      expect(corrected.execution.outputs[0].name).toBe("replacement");
    },
    timeout,
  );
});
