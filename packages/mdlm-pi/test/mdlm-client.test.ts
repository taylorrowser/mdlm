import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AssignmentPacket,
  type JsonObject,
  MdlmClient,
  MdlmClientError,
} from "../src/mdlm-client.js";

const executeFile = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../../..");
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const temporaryRoots: string[] = [];

function assignmentResponse(
  packet: AssignmentPacket,
  includeAuthorPreflight = true,
): JsonObject {
  const assets = packet.assets as JsonObject[];
  const loadedSkillRefs = assets
    .map((asset) => asset.reference)
    .filter((reference): reference is string =>
      typeof reference === "string" && reference.startsWith("skills/")
    )
    .filter((reference) => includeAuthorPreflight || reference !== "skills/author-preflight.md@1");

  return {
    contract: "mdlm-assignment-response@1",
    assignment: packet.assignment.id,
    kind: "proposal",
    proposal: {
      outputs: [
        {
          localId: "qstActiveFrontier",
          name: "questions",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: {
              title: "Identify stakeholder-owned active decision frontier",
              kind: "preferential",
              question: "Which product decision area is the active decision frontier?",
              state: "open",
              blocking_impact: "Product preferences must not be inferred from absent lifecycle data.",
            },
            links: [],
            body: "# Identify the active decision frontier\n\nWhich product decision area is the active decision frontier?",
          },
        },
        {
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Initial wayfinding map",
              purpose: "Index the current decision frontier without inventing product claims.",
              frontier: ["Stakeholder identification of the active product decision frontier"],
            },
            links: [{ type: "indexes", target: "$proposal.qstActiveFrontier.id" }],
            body: "# Initial wayfinding map\n\n- Stakeholder identification of the active product decision frontier — see linked QST.",
          },
        },
      ],
      completionEvidence: {
        execution: { integrity: { contract_valid: true } },
        map: { payload: { frontier: ["Stakeholder identification of the active product decision frontier"] } },
      },
      loadedSkillRefs,
      authoritySupplies: [],
      standingDelegations: [],
    },
  };
}

async function initializedRepository(): Promise<string> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-client-"));
  temporaryRoots.push(temporaryRoot);
  const repository = path.join(temporaryRoot, "repository");
  await executeFile(process.execPath, [mdlmExecutable, "init", repository, "--json"], {
    cwd: projectRoot,
  });
  return repository;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function clientFor(repository: string): MdlmClient {
  return new MdlmClient({
    repository,
    command: {
      program: process.execPath,
      arguments: [mdlmExecutable],
    },
    timeoutMs: 30_000,
  });
}

describe("MdlmClient", () => {
  it("preserves one exact Assignment across status, allocation, and preparation", async () => {
    const repository = await initializedRepository();
    const client = clientFor(repository);

    const initial = await client.status();
    expect(initial.contract).toBe("mdlm-status@1");
    expect(initial.currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "not-allocated" },
    });

    const allocated = await client.next();
    expect(allocated.contract).toBe("mdlm-next@1");
    expect(allocated.materializedExecutions).toEqual([]);
    expect(allocated.outcome).toBe("assignment");
    if (allocated.outcome !== "assignment") throw new Error("Expected Assignment");

    const leased = await client.status();
    expect(leased.currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "active", id: allocated.assignment.id },
    });

    const packet = await client.prepare(allocated.assignment.id);
    expect(packet.contract).toBe("mdlm-assignment-packet@2");
    expect(packet.assignment.id).toBe(allocated.assignment.id);
    expect(packet.scenario.reference).toBe("establish-initial-wayfinding-map@1");
    expect(packet.responseSchema).toMatchObject({
      $id: "https://mdlm.dev/contracts/mdlm-assignment-response@1",
    });
  });

  it("returns a correction disposition from a nonzero MDLM exit without losing the lease", async () => {
    const repository = await initializedRepository();
    const client = clientFor(repository);
    const allocated = await client.next();
    if (allocated.outcome !== "assignment") throw new Error("Expected Assignment");
    const packet = await client.prepare(allocated.assignment.id);

    expect(await client.assignment(allocated.assignment.id)).toMatchObject({
      contract: "mdlm-assignment-state@1",
      selected: true,
      disposition: "active",
      malformedResponses: [],
    });

    const preparedResponse = client.prepareSubmission({});
    const submission = await client.submit(preparedResponse);

    expect(submission).toMatchObject({
      ok: false,
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: allocated.assignment.id },
      disposition: "correction-required",
      orchestration: { action: "correct-response", automaticReplacement: false },
      malformedResponse: { attempt: 1, correctionsRemaining: 1 },
    });
    expect((await client.status()).currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "active", id: allocated.assignment.id },
    });
    expect(await client.assignment(allocated.assignment.id)).toMatchObject({
      selected: true,
      disposition: "active",
      retryAvailability: { malformedResponseCorrection: 0 },
      malformedResponses: [{ digest: preparedResponse.digest }],
    });
  });

  it("retains exact submit stdout and stderr under the private Git state directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-transcript-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    await mkdir(repository);
    const attempts = path.join(root, "git", "mdlm-pi", "attempts");
    const script = path.join(root, "fake-mdlm.mjs");
    const output = JSON.stringify({
      ok: false,
      command: "scenario.submit",
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: "fixture-assignment" },
      disposition: "abandoned",
    });
    await writeFile(script, `
let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stderr.write("CWD:" + process.cwd() + "\\nARGS:" + JSON.stringify(process.argv.slice(2)) + "\\nINPUT:" + input);
process.stdout.write(${JSON.stringify(output)});
process.exitCode = 1;
`);
    const client = new MdlmClient({
      repository,
      command: { program: process.execPath, arguments: [script] },
      attemptDirectory: attempts,
    });
    const response = client.prepareSubmission({ exact: "response" });
    let attempt: { pid: number; stdoutPath: string; stderrPath: string } | undefined;

    const submission = await client.submit(response, {
      started: async (started) => { attempt = started; },
    });

    expect(submission).toMatchObject({ disposition: "abandoned" });
    expect(attempt?.pid).toBeGreaterThan(0);
    expect(await readFile(attempt!.stdoutPath, "utf8")).toBe(output);
    expect(await readFile(attempt!.stderrPath, "utf8")).toBe(
      `CWD:${await realpath(repository)}\nARGS:["scenario","submit","-","--json"]\nINPUT:${response.source}`,
    );
  });

  it("bounds command waits and terminates a timed-out child", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-timeout-"));
    temporaryRoots.push(root);
    const script = path.join(root, "hang.mjs");
    await writeFile(script, "setInterval(() => {}, 1000);\n");
    const client = new MdlmClient({
      repository: root,
      command: { program: process.execPath, arguments: [script] },
      timeoutMs: 25,
    });

    await expect(client.status()).rejects.toThrow("exceeded 25ms");
  });

  it("bounds durable submit streams while retaining the exact bounded prefix", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-output-bound-"));
    temporaryRoots.push(root);
    const script = path.join(root, "large.mjs");
    const attempts = path.join(root, "attempts");
    await writeFile(script, "process.stdout.write('x'.repeat(100000));\n");
    const client = new MdlmClient({
      repository: root,
      command: { program: process.execPath, arguments: [script] },
      attemptDirectory: attempts,
      maxOutputBytes: 64,
      timeoutMs: 1_000,
    });
    let stdoutPath: string | undefined;

    await expect(client.submit(client.prepareSubmission({ exact: true }), {
      started: async (process) => { stdoutPath = process.stdoutPath; },
    })).rejects.toThrow("exceeded 64 output bytes");
    expect((await readFile(stdoutPath!)).byteLength).toBe(64);
  });

  it("rejects malformed JSON and wrong contract versions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-contract-"));
    temporaryRoots.push(root);
    const script = path.join(root, "result.mjs");
    await writeFile(script, "process.stdout.write(process.env.RESULT ?? '');\n");
    const client = () => new MdlmClient({
      repository: root,
      command: { program: process.execPath, arguments: [script] },
      timeoutMs: 1_000,
    });
    const previous = process.env.RESULT;
    try {
      process.env.RESULT = "not-json";
      await expect(client().status()).rejects.toBeInstanceOf(MdlmClientError);
      process.env.RESULT = JSON.stringify({
        contract: "mdlm-status@999",
        command: "status",
        ok: true,
        currentOutcome: { outcome: "lifecycle-complete" },
        recentTransaction: { available: false },
      });
      await expect(client().status()).rejects.toThrow("mdlm-status@1");
    } finally {
      if (previous === undefined) delete process.env.RESULT;
      else process.env.RESULT = previous;
    }
  });

  it("accepts complete typed invalid status and next contracts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-invalid-"));
    temporaryRoots.push(root);
    const script = path.join(root, "invalid.mjs");
    await writeFile(script, `
const command = process.argv[2];
process.stdout.write(JSON.stringify(command === "status" ? {
  contract: "mdlm-status@1", command: "status", ok: false,
  currentOutcome: { outcome: "invalid", diagnostics: [] },
  recentTransaction: { available: false }, diagnostics: []
} : {
  contract: "mdlm-next@1", command: "next", ok: false, outcome: "invalid",
  materializedExecutions: [], diagnostics: []
}));
process.exitCode = 1;
`);
    const client = new MdlmClient({
      repository: root,
      command: { program: process.execPath, arguments: [script] },
    });

    await expect(client.status()).resolves.toMatchObject({
      currentOutcome: { outcome: "invalid" },
      recentTransaction: { available: false },
    });
    await expect(client.next()).resolves.toMatchObject({
      outcome: "invalid",
      materializedExecutions: [],
    });
  });

  it("recovers exact publication identity through the public execution inspection", async () => {
    const repository = await initializedRepository();
    const client = clientFor(repository);
    const allocated = await client.next();
    if (allocated.outcome !== "assignment") throw new Error("Expected Assignment");
    const packet = await client.prepare(allocated.assignment.id);
    const preparedResponse = client.prepareSubmission(assignmentResponse(packet));
    const submission = await client.submit(preparedResponse);

    expect(submission.contract).toBe("mdlm-scenario-execution@4");
    const submittedExecution = submission.execution as JsonObject;
    const executionId = submittedExecution.id;
    expect(typeof executionId).toBe("string");

    const status = await client.status();
    expect(status.recentTransaction).toMatchObject({
      available: true,
      id: executionId,
      status: "completed",
      scenario: packet.scenario.reference,
    });

    const inspected = await client.execution(executionId as string);
    expect(inspected.execution).toMatchObject({
      id: executionId,
      status: "completed",
      response: {
        contract: "mdlm-assignment-response@1",
        assignment: allocated.assignment.id,
        digest: preparedResponse.digest,
      },
    });
    expect(await client.doctor()).toMatchObject({ ok: true, command: "doctor" });
  });
});
