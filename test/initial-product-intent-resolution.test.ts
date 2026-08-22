import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AssignmentPacket, JsonObject } from "../packages/mdlm-pi/src/mdlm-client.js";
import { executeCommandApplication } from "../src/command-application.js";
import {
  PiAssignmentRunner,
  type PiAssignmentSession,
} from "../packages/mdlm-pi/src/pi-assignment-runner.js";
import {
  assignmentResponse,
  directoryDigest,
  inputRevision,
  prepareNextAssignment,
  submitAssignment,
  type ProposedOutput,
} from "./helpers/assignment-submission.js";
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

const attendedAnswer = [
  "Build the minimum command-line `temperature-converter <value> <source-unit>` product.",
  "Accept only uppercase `F` and `C` source units.",
  "For `F`, output Celsius using `(F - 32) * 5 / 9`; for `C`, output Fahrenheit using `C * 9 / 5 + 32`.",
  "Print the converted number and destination unit, round half away from zero to at most two decimals, and omit trailing zeros.",
  "Reject a wrong argument count, a malformed or non-finite value, an unsupported unit, and a non-finite result with a nonzero exit, a concise stderr message, and no stdout.",
  "Do not add interactive input, configuration, networking, a conversion framework, or production hardening. Keep one direct implementation with no runtime dependencies.",
].join(" ");

const openQuestion = {
  id: "QST-F0KNF9CYHQ",
  revisionId: "QST-F0KNF9CYHQ-r00001",
};

function resolutionOutputs(answeredQuestion: string): ProposedOutput[] {
  return [{
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
}

describe("initial product-intent resolution authority", () => {
  it("rejects an incomplete answer and publishes exact attended authority", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-intent-resolution-"));
    const repository = path.join(parent, "calculator");
    try {
      const initialized = await mdlm(parent, "init", repository, "--json");
      expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
      await installLifecycleDataFixture(repository, "initial-intent-foundation");
      const listed = await mdlm(repository, "list", "--json");
      expect(listed.status, `${listed.stderr}${listed.stdout}`).toBe(0);
      const records = (JSON.parse(listed.stdout).data as Array<{
        lifecycleDatum: {
          datum: {
            id: string;
            revision_id: string;
            type: string;
            payload: JsonObject;
          };
        };
      }>).map((item) => item.lifecycleDatum.datum);
      const initialIntent = records.find((datum) =>
        datum.type === "QST" && datum.payload.intent_scope === "product"
      );
      expect(initialIntent).toEqual(expect.objectContaining({
        id: openQuestion.id,
        revision_id: openQuestion.revisionId,
      }));
      const sourceBoundary = records.find((datum) =>
        datum.type === "BSL" && datum.payload.scope === openQuestion.revisionId
      );
      expect(sourceBoundary).toEqual(expect.objectContaining({
        revision_id: "BSL-D872Z49ACC-r00001",
        payload: expect.objectContaining({
          definition_members: [openQuestion.revisionId],
        }),
      }));

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
      const outputs = resolutionOutputs(answeredQuestion);
      const incomplete = structuredClone(outputs);
      delete incomplete[1]!.lifecycleDatum.payload.intent_scope;
      const before = await directoryDigest(path.join(repository, ".lifecycle", "data"));
      const rejected = await submitAssignment(repository, resolution, incomplete);
      expect(rejected.status).toBe(1);
      expect(JSON.parse(rejected.stdout).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]));
      expect(await directoryDigest(path.join(repository, ".lifecycle", "data"))).toBe(before);

      const workerResponse = assignmentResponse(resolution, outputs) as JsonObject;
      (workerResponse.proposal as JsonObject).authoritySupplies = [
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
      const carried = await runner.run(resolution.packet as AssignmentPacket, {
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
      });
      expect((carried.proposal as JsonObject).authoritySupplies).toEqual(["stakeholder"]);
      const submitted = await mdlmWithInput(
        repository,
        `${JSON.stringify(carried)}\n`,
        "scenario",
        "submit",
      );
      await runner.dispose();
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      const execution = JSON.parse(submitted.stdout).execution;
      expect(execution.authority.supplied).toEqual(["stakeholder"]);
      expect(execution.outputs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: "updated_question",
          lifecycleDatum: expect.objectContaining({
            id: openQuestion.id,
            revisionId: answeredQuestion,
            type: "QST",
          }),
          data: expect.objectContaining({
            payload: expect.objectContaining({
              intent_scope: "product",
              state: "answered",
              attended_answer: attendedAnswer,
            }),
          }),
        }),
        expect.objectContaining({
          name: "decision",
          lifecycleDatum: expect.objectContaining({
            type: "DEC",
          }),
          data: expect.objectContaining({
            payload: expect.objectContaining({
              kind: "scope",
              decision: attendedAnswer,
              effective_scope: answeredQuestion,
            }),
            links: [
              { type: "resolves", target: openQuestion.revisionId },
              { type: "resolves", target: answeredQuestion },
            ],
          }),
        }),
      ]));
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  }, 60_000);
});
