import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

const timeout = 60_000;

type Packet = {
  contract: string;
  assignment: { id: string };
  scenario: { reference: string };
  prompt: { skills: { reference: string }[] };
  exactInputs: {
    inputs: { name: string; values: { identity: { revision_id?: string; id: string } }[] }[];
  }[];
  policies: {
    role: string;
    reference: string;
    evaluations?: {
      invocation: number;
      arguments: Record<string, string>;
      result: Record<string, unknown>;
      assets: { reference: string; path: string; digest: string; content: string }[];
    }[];
  }[];
  assets: { reference: string; path: string; digest: string; content: string }[];
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

  it("supplies the exact resolved rubric and accepts an unchanged packet-only judgment", () => {
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

    const contextPacket = prepareNext(repository);
    expect(contextPacket.scenario.reference).toBe("create-review-context@1");
    const contextSubmission = submitProposal(repository, contextPacket, [{
      localId: "context",
      name: "context",
      invocation: 0,
      lifecycleDatum: {
        type: "BSL",
        payload: {
          title: "Review packet regression context",
          kind: "review-context",
          role: "review-context",
          scope: mapRevision,
          group: "review-packet-regression",
          definition_members: [mapRevision],
          evidence: [],
        },
        links: [],
        body: "One exact frozen context for the review packet regression.\n",
      },
    }]);
    const contextRevision = contextSubmission.execution.outputs[0].lifecycleDatum
      .revisionId as string;
    commitLifecycleData(repository, "Publish review packet regression context");

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
    const productRevision = productSubmission.execution.outputs.find(
      (output: { name: string }) => output.name === "product_specification",
    ).lifecycleDatum.revisionId as string;
    commitLifecycleData(repository, "Publish review packet regression product");

    const productContextPacket = prepareNext(repository);
    expect(productContextPacket.scenario.reference).toBe("create-review-context@1");
    expect(exactInput(productContextPacket, "subject")).toBe(productRevision);
    submitProposal(repository, productContextPacket, [{
      localId: "context",
      name: "context",
      invocation: 0,
      lifecycleDatum: {
        type: "BSL",
        payload: {
          title: "Product review packet regression context",
          kind: "review-context",
          role: "review-context",
          scope: productRevision,
          group: "review-packet-regression",
          definition_members: [productRevision],
          evidence: [],
        },
        links: [],
        body: "One exact frozen context for the product review route.\n",
      },
    }]);
    commitLifecycleData(repository, "Publish product review context");

    const requirementPacket = prepareNext(repository);
    expect(requirementPacket.scenario.reference).toBe(
      "draft-stakeholder-requirements@2",
    );
    const requirementSubmission = submitProposal(repository, requirementPacket, [{
      localId: "requirement",
      name: "requirements",
      invocation: 0,
      lifecycleDatum: {
        type: "STK",
        payload: {
          title: "Resolved review evidence requirement",
          rationale: "Independent reviewers need the exact applicable rubric.",
          statement: "The prepared packet supplies exact resolved policy assets.",
          verification_intent: "Submit a judgment using only packet evidence.",
          stakeholder: "independent reviewer",
          priority: "must",
        },
        links: [{
          type: "derived-from",
          target: exactInput(requirementPacket, "product_specification").replace(
            /-r[0-9]{5}$/,
            "",
          ),
        }],
        body: "One stakeholder-visible packet completeness commitment.\n",
      },
    }]);
    const requirementRevision = requirementSubmission.execution.outputs.find(
      (output: { name: string }) => output.name === "requirements",
    ).lifecycleDatum.revisionId as string;
    commitLifecycleData(repository, "Publish packet evidence requirement");

    const requirementContextPacket = prepareNext(repository);
    expect(requirementContextPacket.scenario.reference).toBe(
      "create-review-context@1",
    );
    expect(exactInput(requirementContextPacket, "subject")).toBe(
      requirementRevision,
    );
    submitProposal(repository, requirementContextPacket, [{
      localId: "context",
      name: "context",
      invocation: 0,
      lifecycleDatum: {
        type: "BSL",
        payload: {
          title: "Requirement review packet regression context",
          kind: "review-context",
          role: "review-context",
          scope: requirementRevision,
          group: "review-packet-regression",
          definition_members: [requirementRevision],
          evidence: [],
        },
        links: [],
        body: "One exact frozen context for the requirement review route.\n",
      },
    }]);
    commitLifecycleData(repository, "Publish requirement review context");

    const reviewPacket = prepareNext(repository);
    expect(reviewPacket.contract).toBe("mdlm-assignment-packet@2");
    expect(reviewPacket.scenario.reference).toBe("review-datum-in-context@2");
    expect(exactInput(reviewPacket, "subject")).toBe(mapRevision);
    expect(exactInput(reviewPacket, "review_context")).toBe(contextRevision);

    const reviewPolicy = reviewPacket.policies.find((policy) =>
      policy.role === "review"
    );
    expect(reviewPolicy).toEqual(expect.objectContaining({
      reference: "review-applicability@1",
      evaluations: [{
        invocation: 0,
        arguments: { subject: mapRevision },
        result: {
          required: true,
          rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        },
        assets: [expect.objectContaining({
          reference: "policies/rubrics/bootstrap-review.md@1",
          path: "policies/rubrics/bootstrap-review.md",
          digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          content: expect.stringContaining("# Bootstrap review policy"),
        })],
      }],
    }));
    expect(reviewPacket.assets).toContainEqual(expect.objectContaining({
      reference: "policies/rubrics/bootstrap-review.md@1",
      digest: reviewPolicy?.evaluations?.[0]?.assets[0]?.digest,
      content: reviewPolicy?.evaluations?.[0]?.assets[0]?.content,
    }));

    const rubricReference = reviewPolicy?.evaluations?.[0]?.result.rubric_ref;
    const reviewSubmission = submitProposal(repository, reviewPacket, [{
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
    }], ["independent-reviewer"]);
    expect(reviewSubmission.execution.outputs[0].data.payload).toEqual(
      expect.objectContaining({
        rubric_ref: "policies/rubrics/bootstrap-review.md@1",
        outcome: "pass",
      }),
    );
  }, timeout);
});
