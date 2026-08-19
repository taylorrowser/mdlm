import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MdlmClient } from "../src/mdlm-client.js";
import { RunJournal } from "../src/run-journal.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function journalPath(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-journal-"));
  temporaryRoots.push(root);
  return path.join(root, "git", "mdlm-pi");
}

describe("RunJournal", () => {
  it("recovers exact submission intent and publication progress after recreation", async () => {
    const storagePath = await journalPath();
    const journal = new RunJournal(storagePath);
    const response = new MdlmClient({ repository: "." }).prepareSubmission({
      contract: "mdlm-assignment-response@1",
      assignment: "assignment-1",
      kind: "unable",
      unable: { reason: "ambiguity", diagnostics: [{ code: "UNKNOWN", message: "Unknown" }] },
    });

    await journal.beginSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      previousTransactionId: "transaction-0",
      baseCommit: "0123456789abcdef",
      previousMalformedResponseDigests: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      response,
    });

    expect(await new RunJournal(storagePath).load()).toEqual({
      contract: "mdlm-pi-run-journal@1",
      phase: "submitting",
      assignment: { id: "assignment-1", scenario: "example-scenario@1" },
      submission: {
        source: response.source,
        digest: response.digest,
        previousTransactionId: "transaction-0",
        baseCommit: "0123456789abcdef",
        previousMalformedResponseDigests: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      },
    });

    await new RunJournal(storagePath).recordPublication({
      executionId: "execution-1",
      scenario: "example-scenario@1",
      responseDigest: response.digest,
      outputPaths: [".lifecycle/data/.transactions/execution-1/MAP/MAP-1/r00001.md"],
    });
    await new RunJournal(storagePath).recordDoctorPassed();

    expect(await new RunJournal(storagePath).load()).toMatchObject({
      phase: "doctor-passed",
      assignment: { id: "assignment-1", scenario: "example-scenario@1" },
      submission: { digest: response.digest },
      publication: {
        executionId: "execution-1",
        scenario: "example-scenario@1",
        responseDigest: response.digest,
        outputPaths: [".lifecycle/data/.transactions/execution-1/MAP/MAP-1/r00001.md"],
      },
    });

    await new RunJournal(storagePath).clear();
    expect(await new RunJournal(storagePath).load()).toBeNull();
  });

  it("atomically replaces a malformed response while retaining correction recovery", async () => {
    const storagePath = await journalPath();
    const journal = new RunJournal(storagePath);
    const client = new MdlmClient({ repository: "." });
    const malformed = client.prepareSubmission({ first: true });
    await journal.beginSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      previousTransactionId: null,
      baseCommit: "base",
      previousMalformedResponseDigests: [],
      response: malformed,
    });

    const corrected = client.prepareSubmission({ corrected: true });
    await journal.replaceSubmission(malformed.digest, {
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      previousTransactionId: null,
      baseCommit: "base",
      previousMalformedResponseDigests: [malformed.digest],
      response: corrected,
    });

    expect(await journal.load()).toMatchObject({
      phase: "submitting",
      submission: {
        source: corrected.source,
        digest: corrected.digest,
        previousMalformedResponseDigests: [malformed.digest],
      },
    });
    await expect(journal.replaceSubmission(malformed.digest, {
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      previousTransactionId: null,
      baseCommit: "base",
      previousMalformedResponseDigests: [],
      response: malformed,
    })).rejects.toThrow("exact correction journal");
  });
});
