import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentSubmission,
  JsonObject,
  MdlmOperatorOutcome,
  PreparedAssignmentSubmission,
} from "../src/mdlm-client.js";
import { RunController } from "../src/run-controller.js";
import { RunJournal } from "../src/run-journal.js";

const fixtureRoot = path.resolve(import.meta.dirname, "../../../test/fixtures/operator-contract-v2");
const digest = `sha256:${"e".repeat(64)}` as const;
const transport = { repository: "/repo", command: { program: "mdlm", arguments: [] } };
const boundary = { package: { reference: "package@1" }, repository: { head: "base" }, transport };

describe("v2 operator loop", () => {
  it("claims once, performs the included packet, and submits one accepted response", async () => {
    const outcome = await fixture<MdlmOperatorOutcome>("assignment.json");
    const response = await fixture<JsonObject>("assignment-response.json");
    const accepted = await fixture<AssignmentSubmission>("submission-accepted.json");
    const dependencies = await harness(outcome, [response], [accepted]);

    const result = await new RunController(dependencies).run();

    expect(result).toMatchObject({ status: "accepted", successful: true });
    expect(dependencies.mdlm.next).toHaveBeenCalledOnce();
    expect(dependencies.assignments.run).toHaveBeenCalledOnce();
    expect(dependencies.mdlm.submit).toHaveBeenCalledOnce();
  });

  it("corrects a side-effect-free rejection without claiming or consuming authority again", async () => {
    const outcome = await fixture<MdlmOperatorOutcome>("assignment.json");
    const response = await fixture<JsonObject>("assignment-response.json");
    const rejected = await fixture<AssignmentSubmission>("submission-rejected.json");
    const accepted = await fixture<AssignmentSubmission>("submission-accepted.json");
    const dependencies = await harness(outcome, [response, response], [rejected, accepted]);

    await expect(new RunController(dependencies).run()).resolves.toMatchObject({ status: "accepted" });

    expect(dependencies.mdlm.next).toHaveBeenCalledOnce();
    expect(dependencies.mdlm.submit).toHaveBeenCalledTimes(2);
    expect(dependencies.assignments.run).toHaveBeenNthCalledWith(2, expect.anything(), {
      correction: {
        previousResponse: response,
        diagnostics: rejected.diagnostics,
      },
    });
  });

  it("passes attended authority as submit metadata and never adds it to the response", async () => {
    const outcome = await fixture<MdlmOperatorOutcome>("attention-required.json");
    if (outcome.outcome !== "attention-required") throw new Error("fixture outcome changed");
    const response = { ...(await fixture<JsonObject>("assignment-response.json")), assignment: outcome.assignment.id };
    const acceptedFixture = await fixture<AssignmentSubmission>("submission-accepted.json");
    const accepted = { ...acceptedFixture, assignment: { id: outcome.assignment.id } };
    const dependencies = await harness(outcome, [response], [accepted]);

    await new RunController(dependencies).run();

    expect(dependencies.mdlm.submit).toHaveBeenCalledWith(expect.anything(), "stakeholder");
    expect(JSON.stringify(response)).not.toContain("authoritySupplies");
  });

  it("settles a started submission without calling next or replaying submit", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-settlement-"));
    const journal = new RunJournal(directory);
    await journal.capture("11111111-1111-4111-8111-111111111111", digest, boundary);
    await journal.beginSubmission();
    await journal.requireSettlement("33333333-3333-4333-8333-333333333333");
    const accepted = await fixture<AssignmentSubmission>("submission-accepted.json");
    const next = vi.fn(async (): Promise<MdlmOperatorOutcome> => { throw new Error("next replayed"); });
    const submit = vi.fn(async (): Promise<AssignmentSubmission> => { throw new Error("submit replayed"); });
    const settlement = vi.fn(async () => accepted);
    const controller = new RunController({
      mdlm: { identity: () => transport, next, submit, settlement, prepareSubmission },
      assignments: { run: vi.fn() },
      io: io(),
      journal,
    });

    await expect(controller.run()).resolves.toMatchObject({ status: "accepted", successful: true });
    expect(settlement).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
    expect(next).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps the journal when settlement names different response bytes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-settlement-drift-"));
    const journal = new RunJournal(directory);
    await journal.capture("11111111-1111-4111-8111-111111111111", digest, boundary);
    await journal.beginSubmission();
    const accepted = await fixture<AssignmentSubmission>("submission-accepted.json");
    const wrong = { ...accepted, responseDigest: `sha256:${"f".repeat(64)}` };
    const controller = new RunController({
      mdlm: {
        identity: () => transport,
        next: vi.fn(),
        submit: vi.fn(),
        settlement: vi.fn(async () => wrong),
        prepareSubmission,
      },
      assignments: { run: vi.fn() },
      io: io(),
      journal,
    });

    await expect(controller.run()).rejects.toThrow("pending Assignment response");
    await expect(journal.load()).resolves.toMatchObject({ phase: "submitting" });
  });

  it.each([
    ["profile-boundary-reached.json", true],
    ["lifecycle-complete.json", true],
    ["process-dead-end.json", false],
    ["invalid.json", false],
  ])("reports terminal fixture %s without invoking a worker", async (name, successful) => {
    const outcome = await fixture<MdlmOperatorOutcome>(name);
    const dependencies = await harness(outcome, [], []);
    await expect(new RunController(dependencies).run()).resolves.toMatchObject({
      status: outcome.outcome,
      successful,
    });
    expect(dependencies.assignments.run).not.toHaveBeenCalled();
  });
});

async function harness(
  outcome: MdlmOperatorOutcome,
  responses: JsonObject[],
  submissions: AssignmentSubmission[],
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-loop-"));
  return {
    mdlm: {
      identity: () => transport,
      next: vi.fn(async () => outcome),
      prepareSubmission,
      submit: vi.fn(async () => ({ ...submissions.shift()!, responseDigest: digest })),
      settlement: vi.fn(async () => ({ ...submissions.shift()!, responseDigest: digest })),
    },
    assignments: {
      run: vi.fn(async () => responses.shift()!),
      close: vi.fn(async () => undefined),
    },
    io: io(),
    journal: new RunJournal(directory),
  };
}

function prepareSubmission(response: JsonObject): PreparedAssignmentSubmission {
  return { response, source: `${JSON.stringify(response)}\n`, digest };
}

function io() {
  return {
    progress: vi.fn(),
    attention: vi.fn(async () => ({ conclusion: { statement: "approve" } })),
    stopped: vi.fn(),
  };
}

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8")) as T;
}
