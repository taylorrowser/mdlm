import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");

type Packet = Record<string, any>;
type ProposalOutput = {
  localId: string;
  name: string;
  invocation: number;
  lifecycleDatum: {
    id?: string;
    type: string;
    payload: Record<string, unknown>;
    links: { type: string; target: string }[];
    body: string;
  };
};

function invokeMdlm(repository: string, arguments_: string[], input?: string) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
    maxBuffer: 10 * 1024 * 1024,
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

function exactInput(packet: Packet, name: string) {
  const input = packet.exactInputs[0].inputs.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  expect(input, `Missing exact input '${name}'`).toBeDefined();
  return input;
}

describe("failed STK Review correction through the public operator process", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-review-correction-"));
    repository = path.join(parent, "repository");
    const initialized = invokeMdlm(parent, ["init", repository, "--json"]);
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("derives one exact correction, fresh independent Review, and resumed work", async () => {
    const commit = (message: string) => {
      expect(git(repository, "add", ".lifecycle/data").status).toBe(0);
      const committed = git(
        repository,
        "-c",
        "user.name=MDLM Test",
        "-c",
        "user.email=mdlm-test@example.invalid",
        "commit",
        "-m",
        message,
      );
      expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);
    };
    const nextPacket = () => {
      const next = invokeMdlm(repository, ["next"]);
      expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
      const outcome = JSON.parse(next.stdout);
      expect(outcome.outcome).toBe("assignment");
      const prepared = invokeMdlm(repository, [
        "scenario",
        "prepare",
        outcome.assignment.id,
      ]);
      expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
      return JSON.parse(prepared.stdout) as Packet;
    };
    const respond = (
      packet: Packet,
      outputs: ProposalOutput[],
      authoritySupplies: string[] = [],
    ) => invokeMdlm(
      repository,
      ["scenario", "submit"],
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: packet.assignment.id,
        kind: "proposal",
        proposal: {
          outputs,
          completionEvidence: { summary: "The exact Scenario proposal is complete." },
          loadedSkillRefs: packet.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies,
          standingDelegations: [],
        },
      })}\n`,
    );
    const publish = (
      packet: Packet,
      outputs: ProposalOutput[],
      authoritySupplies: string[] = [],
    ) => {
      const submitted = respond(packet, outputs, authoritySupplies);
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      const execution = JSON.parse(submitted.stdout).execution as Record<string, any>;
      commit(`Publish ${packet.scenario.reference}`);
      return execution;
    };
    const publishContext = (packet: Packet) => {
      expect(packet.scenario.reference).toBe("create-review-context@1");
      const subject = exactInput(packet, "subject").values[0];
      return publish(packet, [{
        localId: `context-${subject.identity.revision_id}`,
        name: "context",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: `Review context for ${subject.identity.revision_id}`,
            kind: "review-context",
            role: "review-context",
            scope: subject.identity.revision_id,
            group: "DEFAULT",
            definition_members: [subject.identity.revision_id],
            evidence: [],
          },
          links: [],
          body: "One exact frozen Review Context.\n",
        },
      }]);
    };
    const publishReview = (packet: Packet, outcome: "pass" | "fail") => {
      expect(packet.scenario.reference).toBe("review-datum-in-context@2");
      const subject = exactInput(packet, "subject").values[0];
      const context = exactInput(packet, "review_context").values[0];
      const findings = outcome === "fail"
        ? [{
            id: "F-001",
            target: subject.identity.revision_id,
            relationship: "primary",
            severity: "blocking",
            summary: "The actor and observable rejection behavior are ambiguous.",
          }, {
            id: "F-002",
            target: subject.identity.revision_id,
            relationship: "primary",
            severity: "blocking",
            summary: "The verification intent omits the unsupported route.",
          }]
        : [];
      return publish(packet, [{
        localId: `review-${subject.identity.revision_id}`,
        name: "review",
        invocation: 0,
        lifecycleDatum: {
          type: "REV",
          payload: {
            title: `${outcome === "pass" ? "Passing" : "Failed"} Review of ${subject.identity.revision_id}`,
            review_kind: "contextual",
            rubric_ref: "policies/rubrics/bootstrap-review.md@1",
            findings,
            outcome,
          },
          links: [
            { type: "reviews", target: subject.identity.revision_id },
            { type: "contextualizes", target: context.identity.revision_id },
          ],
          body: `The independent Review ${outcome === "pass" ? "passes" : "fails"}.\n`,
        },
      }], ["independent-reviewer"]);
    };

    let packet = nextPacket();
    expect(packet.scenario.reference).toBe("establish-initial-wayfinding-map@1");
    publish(packet, [{
      localId: "map",
      name: "map",
      invocation: 0,
      lifecycleDatum: {
        type: "MAP",
        payload: {
          title: "Review correction tracer",
          purpose: "Exercise normal failed-Review reevaluation.",
          frontier: ["Define one exact product commitment"],
        },
        links: [],
        body: "One bounded decision frontier.\n",
      },
    }]);

    packet = nextPacket();
    publishContext(packet);

    packet = nextPacket();
    expect(packet.scenario.reference).toBe("compile-psp@2");
    const productExecution = publish(packet, [{
      localId: "product-specification",
      name: "product_specification",
      invocation: 0,
      lifecycleDatum: {
        type: "PSP",
        payload: {
          title: "Typed command validation",
          rationale: "Operators need deterministic public command outcomes.",
          problem: "Malformed command behavior is ambiguous.",
          users: ["MDLM operator"],
          goals: ["Expose deterministic command acceptance and rejection"],
          non_goals: ["Define private implementation details"],
          success_measures: ["Supported and unsupported commands are distinguishable"],
        },
        links: [],
        body: "A minimal product-intent definition.\n",
      },
    }]);
    const productStable = productExecution.outputs[0].lifecycleDatum.id as string;

    packet = nextPacket();
    publishContext(packet);

    packet = nextPacket();
    expect(packet.scenario.reference).toBe("draft-stakeholder-requirements@2");
    const requirementExecution = publish(packet, [{
      localId: "stakeholder-requirement",
      name: "requirements",
      invocation: 0,
      lifecycleDatum: {
        type: "STK",
        payload: {
          title: "Reject malformed commands",
          rationale: "The initial claim deliberately needs independent correction.",
          statement: "MDLM shall reject bad commands.",
          verification_intent: "Observe one command result.",
          stakeholder: "MDLM operator",
          priority: "must",
        },
        links: [{ type: "derived-from", target: productStable }],
        body: "An intentionally ambiguous initial requirement.\n",
      },
    }]);
    const requirement = requirementExecution.outputs[0].lifecycleDatum as {
      id: string;
      revisionId: string;
    };

    packet = nextPacket();
    publishContext(packet);

    let failedReview: Record<string, any> | undefined;
    while (!failedReview) {
      packet = nextPacket();
      expect(packet.scenario.reference).toBe("review-datum-in-context@2");
      const subject = exactInput(packet, "subject").values[0];
      const review = publishReview(packet, subject.identity.type === "STK" ? "fail" : "pass");
      if (subject.identity.type === "STK") {
        failedReview = review.outputs[0].lifecycleDatum;
      }
    }

    const oldRequirement = JSON.parse(
      invokeMdlm(repository, ["show", requirement.revisionId, "--json"]).stdout,
    ).lifecycleDatum;
    const oldReview = JSON.parse(
      invokeMdlm(repository, ["show", failedReview.revisionId, "--json"]).stdout,
    ).lifecycleDatum;

    packet = nextPacket();
    expect(packet.scenario.reference).toBe("revise-foundation-after-review@2");
    expect(packet.obligation).toEqual(expect.objectContaining({
      definition: "foundation-review-correction-required@2",
      subject: requirement.revisionId,
    }));
    const correctionSubject = exactInput(packet, "subject");
    const failedReviews = exactInput(packet, "failed_reviews");
    expect(correctionSubject.values.map((value: any) => value.identity.revision_id))
      .toEqual([requirement.revisionId]);
    expect(failedReviews.values.map((value: any) => value.identity.revision_id))
      .toEqual([failedReview.revisionId]);
    expect(failedReviews.values[0].data.payload.findings).toEqual([
      expect.objectContaining({ id: "F-001", severity: "blocking" }),
      expect.objectContaining({ id: "F-002", severity: "blocking" }),
    ]);
    const replacementOutput: ProposalOutput = {
      localId: "replacement",
      name: "replacement",
      invocation: 0,
      lifecycleDatum: {
        id: requirement.id,
        type: "STK",
        payload: {
          title: "Reject malformed commands deterministically",
          rationale: "The corrected claim names the actor and both observable routes.",
          statement: "MDLM shall return a typed rejection to an operator for every malformed public command without publishing Lifecycle Data.",
          verification_intent: "Observe one supported command succeed and one malformed command return a typed rejection with no Lifecycle Data write.",
          stakeholder: "MDLM operator",
          priority: "must",
        },
        links: [
          { type: "derived-from", target: productStable },
          { type: "corrects-review", target: failedReview.revisionId },
        ],
        body: "The same Stable Datum now addresses every blocking Review Finding.\n",
      },
    };
    const missingCausalLink = structuredClone(replacementOutput);
    missingCausalLink.lifecycleDatum.links = missingCausalLink.lifecycleDatum.links
      .filter((link) => link.type !== "corrects-review");
    const rejected = respond(packet, [missingCausalLink]);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "scenario-output-required-link-missing",
        path: "outputs.replacement.links.corrects-review",
      }),
    ]));

    const replacementExecution = publish(packet, [replacementOutput]);
    const replacement = replacementExecution.outputs[0].lifecycleDatum as {
      id: string;
      revision: number;
      revisionId: string;
    };
    expect(replacement).toEqual(expect.objectContaining({
      id: requirement.id,
      revision: 2,
    }));

    expect(JSON.parse(
      invokeMdlm(repository, ["show", requirement.revisionId, "--json"]).stdout,
    ).lifecycleDatum).toEqual(oldRequirement);
    expect(JSON.parse(
      invokeMdlm(repository, ["show", failedReview.revisionId, "--json"]).stdout,
    ).lifecycleDatum).toEqual(oldReview);

    packet = nextPacket();
    expect(packet.scenario.reference).toBe("create-review-context@1");
    expect(exactInput(packet, "subject").values[0].identity.revision_id)
      .toBe(replacement.revisionId);
    const replacementContext = publishContext(packet).outputs[0].lifecycleDatum;

    packet = nextPacket();
    expect(packet.scenario.reference).toBe("review-datum-in-context@2");
    expect(exactInput(packet, "subject").values[0].identity.revision_id)
      .toBe(replacement.revisionId);
    expect(exactInput(packet, "review_context").values[0].identity.revision_id)
      .toBe(replacementContext.revisionId);
    expect(packet.authority.requirements).toEqual([
      expect.objectContaining({
        authorityRequirement: expect.objectContaining({
          mode: "delegated",
          authority: "independent-reviewer",
        }),
      }),
    ]);
    publishReview(packet, "pass");

    packet = nextPacket();
    expect(packet.scenario.reference).toBe("create-phase-0-intent-candidate@1");
  }, 60_000);
});
