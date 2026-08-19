import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mdlm,
  mdlmWithEnvironment,
  mdlmWithInput,
} from "./helpers/mdlm.js";

const timeout = 60_000;

type Packet = {
  contract: string;
  assignment: { id: string };
  scenario: { reference: string };
  prompt: { skills: { reference: string }[] };
  exactInputs: {
    inputs: {
      name: string;
      values: { identity: { revision_id?: string; id: string } }[];
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
  const assignment = JSON.parse(next.stdout).assignment.id as string;
  const prepared = mdlm(
    repository,
    "scenario", "prepare", assignment, "--json",
  );
  expectSuccess(prepared, "mdlm scenario prepare");
  return JSON.parse(prepared.stdout) as Packet;
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
                rubric_ref: "policies/rubrics/bootstrap-review.md@2",
              },
              assets: [
                expect.objectContaining({
                  reference: "policies/rubrics/bootstrap-review.md@2",
                  path: "policies/rubrics/bootstrap-review.md",
                  digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
                  content: expect.stringContaining("# Bootstrap review policy"),
                }),
              ],
            },
          ],
        }),
      );
      expect(reviewPacket.assets).toContainEqual(
        expect.objectContaining({
          reference: "policies/rubrics/bootstrap-review.md@2",
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

      const reviewSubmission = submitProposal(
      repository,
      reviewPacket,
      [reviewOutput],
      ["independent-reviewer"],
    );
      expect(reviewSubmission.execution.outputs[0].data.payload).toEqual(
        expect.objectContaining({
          rubric_ref: "policies/rubrics/bootstrap-review.md@2",
          outcome: "pass",
        }),
      );
    },
    timeout,
  );
});
