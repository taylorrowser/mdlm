import { spawnSync } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { PROCESS_REPOSITORY_TEST_TIMEOUT_MS } from "../scripts/root-test-observation-policy.mjs";
import { parse } from "yaml";
import { executeCommandApplication } from "../src/command-application.js";
import {
  mdlmWithEnvironment as processMdlmWithEnvironment,
  mdlmWithInputAndEnvironment as processMdlmWithInputAndEnvironment,
} from "./helpers/mdlm.js";
import { installLifecycleDataFixture } from "./helpers/lifecycle-data-fixture.js";

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

// Twice the 54,154 ms exact max-2 pass is 108,308 ms; round strictly up.
// The resulting shared bound also clears the retained 91,141 ms failure.
const CONTENDED_REVIEW_ASSIGNMENT_TEST_TIMEOUT_MS = PROCESS_REPOSITORY_TEST_TIMEOUT_MS;

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
  result: { status: number | null; stdout: string; stderr: string },
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

async function prepareNext(repository: string): Promise<Packet> {
  const next = await mdlm(repository, "next", "--json");
  expectSuccess(next, "mdlm next");
  const nextOutcome = JSON.parse(next.stdout) as Packet["nextOutcome"] & {
    assignment: { id: string };
  };
  const prepared = await mdlm(
    repository,
    "scenario", "prepare", nextOutcome.assignment.id, "--json",
  );
  expectSuccess(prepared, "mdlm scenario prepare");
  return {
    ...(JSON.parse(prepared.stdout) as Omit<Packet, "nextOutcome">),
    nextOutcome,
  };
}

async function submitProposal(
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
  const submitted = await mdlmWithInput(
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

async function fixtureRevision(repository: string, type: string): Promise<string> {
  const dataRoot = path.join(repository, ".lifecycle/data");
  const entries = await fs.readdir(dataRoot, { recursive: true });
  const revisions = new Set<string>();
  for (const entry of entries.filter((candidate) => candidate.endsWith(".md"))) {
    const datum = parseLifecycleMarkdown(
      await fs.readFile(path.join(dataRoot, entry), "utf8"),
    );
    if (datum.type === type && typeof datum.revision_id === "string") {
      revisions.add(datum.revision_id);
    }
  }
  if (revisions.size !== 1) {
    throw new Error(`Expected one ${type} fixture Revision, found ${revisions.size}`);
  }
  return [...revisions][0]!;
}

function exactInput(packet: Packet, name: string): string {
  const value = packet.exactInputs[0]?.inputs.find((input) => input.name === name)
    ?.values[0]?.identity;
  const exact = value?.revision_id ?? value?.id;
  if (!exact) throw new Error(`Missing exact '${name}' input`);
  return exact;
}

describe("delegated Review Assignment packets", () => {
  it(
    "forks one exact Review Context across passing Review and package-evidence correction",
    async () => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-review-packet-"));
      const repository = path.join(parent, "repository");
      const correctionRepository = path.join(parent, "correction-repository");
      onTestFinished(async () => {
        await fs.rm(parent, { recursive: true, force: true });
      });
      expectSuccess(
        await mdlm(parent, "init", repository, "--json"),
        "mdlm init",
      );
      await installLifecycleDataFixture(repository, "review-foundation");
      const mapRevision = await fixtureRevision(repository, "MAP");
      // The fixture stops after exact public PSP publication. This test retains
      // true-process Review materialization and submission.

      const nextReview = processMdlmWithEnvironment(
        repository,
        { MDLM_PERFORMANCE: "json" },
        "next",
        "--json",
      );
      expectSuccess(nextReview, "mdlm next with automatic exact baseline");
      expect(JSON.parse(nextReview.stderr)).toEqual(expect.objectContaining({
        contract: "mdlm-performance@1",
        repository: expect.objectContaining({ loads: 1 }),
      }));
      const nextReviewOutput = JSON.parse(nextReview.stdout) as {
        assignment: { id: string };
        materializedExecutions: { id: string; scenario: string; status: string }[];
      };
      const preCommitReviewAssignment = nextReviewOutput.assignment.id;
      expect(nextReviewOutput.materializedExecutions).toEqual([
        expect.objectContaining({ scenario: "create-review-context@1", status: "completed" }),
      ]);
      const transactionRoot = path.join(repository, ".lifecycle/data/.transactions");
      const executionFiles = (await fs.readdir(transactionRoot)).map((id) =>
        path.join(transactionRoot, id, "execution.json")
      );
      const executions = await Promise.all(executionFiles.map(async (file) =>
        JSON.parse(await fs.readFile(file, "utf8")) as {
          id?: string;
          definition?: { scenario?: string };
          response?: { assignment?: string };
        }
      ));
      const materializationExecution = executions.find((execution) =>
        execution.id === nextReviewOutput.materializedExecutions[0]?.id &&
        execution.definition?.scenario === "create-review-context@1"
      );
      expect(materializationExecution?.response?.assignment).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(materializationExecution?.response?.assignment).not.toMatch(/^kernel-/);
      expect(materializationExecution?.response?.assignment).not.toBe(
        preCommitReviewAssignment,
      );
      expect(nextReviewOutput.materializedExecutions[0]?.id).toBe(
        materializationExecution?.id,
      );

      await fs.cp(repository, correctionRepository, {
        recursive: true,
        mode: fsConstants.COPYFILE_FICLONE,
      });

      commitLifecycleData(repository, "Publish automatic Review Context");
      const freshReview = await mdlm(repository, "next", "--json");
      expectSuccess(freshReview, "mdlm next after Review Context commit");
      const freshReviewOutput = JSON.parse(freshReview.stdout) as {
        assignment: { id: string };
        materializedExecutions: unknown[];
      };
      expect(freshReviewOutput.materializedExecutions).toEqual([]);
      expect(freshReviewOutput.assignment.id).not.toBe(preCommitReviewAssignment);
      const preparedReview = await mdlm(
        repository,
        "scenario", "prepare", freshReviewOutput.assignment.id, "--json",
      );
      expectSuccess(preparedReview, "mdlm scenario prepare fresh Review");
      const reviewPacket = JSON.parse(preparedReview.stdout) as Packet;
      expect(reviewPacket.contract).toBe("mdlm-assignment-packet@2");
      expect(reviewPacket.scenario.reference).toBe("review-datum-in-context@2");
      expect(reviewPacket.prompt.skills.map((skill) => skill.reference))
        .toContain("skills/review-correction-authority.md@1");
      expect(exactInput(reviewPacket, "subject")).toBe(mapRevision);
      expect(exactInput(reviewPacket, "review_context")).toMatch(
        /^BSL-[0-9A-HJKMNP-TV-Z]{10,12}-r00001$/,
      );

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

      const preparedCorrectionReview = await mdlm(
        correctionRepository,
        "scenario", "prepare", preCommitReviewAssignment, "--json",
      );
      expectSuccess(preparedCorrectionReview, "mdlm scenario prepare pre-commit Review");
      const correctionReviewPacket = JSON.parse(
        preparedCorrectionReview.stdout,
      ) as Packet;
      expect(correctionReviewPacket.contract).toBe("mdlm-assignment-packet@2");
      expect(correctionReviewPacket.assignment.id).toBe(preCommitReviewAssignment);
      expect(correctionReviewPacket.scenario.reference).toBe(
        "review-datum-in-context@2",
      );
      expect(exactInput(correctionReviewPacket, "subject")).toBe(
        exactInput(reviewPacket, "subject"),
      );
      expect(exactInput(correctionReviewPacket, "review_context")).toBe(
        exactInput(reviewPacket, "review_context"),
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
      const rejected = await mdlmWithInput(
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
      const submittedReview = processMdlmWithInputAndEnvironment(
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

      const subject = exactInput(correctionReviewPacket, "subject");
      const reviewContext = exactInput(correctionReviewPacket, "review_context");
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
        assignment: correctionReviewPacket.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [output],
          completionEvidence: { summary: "Completed independent Review." },
          loadedSkillRefs: correctionReviewPacket.prompt.skills.map(
            (skill) => skill.reference,
          ),
          authoritySupplies: ["independent-reviewer"],
          standingDelegations: [],
        },
      });
      const before = await lifecycleDatumCount(correctionRepository);

      const omitted = await mdlmWithInput(
        correctionRepository,
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
      expect(await lifecycleDatumCount(correctionRepository)).toBe(before);

      const classified = structuredClone(failedReview);
      (classified.lifecycleDatum.payload as Record<string, unknown>)
        .correction_authority = "package-evidence";
      const submitted = await mdlmWithInput(
        correctionRepository,
        `${JSON.stringify(response(classified))}\n`,
        "scenario", "submit", "-", "--json",
      );
      expectSuccess(submitted, "submit classified failed Review");
      commitLifecycleData(
        correctionRepository,
        "Publish package-evidence Review failure",
      );

      const correction = await prepareNext(correctionRepository);
      expect(correction.nextOutcome.outcome).toBe("assignment");
      expect(correction.scenario.reference).toBe("revise-foundation-after-review@5");
      const failedReviewRevision = exactInput(correction, "failed_reviews");
      expect(failedReviewRevision).toMatch(/^REV-/);
      const correctionSubject = correction.exactInputs[0]?.inputs.find(
        (input) => input.name === "subject",
      )?.values[0]?.identity;
      expect(correctionSubject?.type).toBe("MAP");
      const corrected = await submitProposal(correctionRepository, correction, [{
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
    CONTENDED_REVIEW_ASSIGNMENT_TEST_TIMEOUT_MS,
  );
});
