import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MdlmClient } from "../src/mdlm-client.js";
import { RunJournal } from "../src/run-journal.js";

const temporaryRoots: string[] = [];
const recoveryBoundary = { package: {}, repository: {} };

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
      ...recoveryBoundary,
      previousTransactionId: "transaction-0",
      baseCommit: "0123456789abcdef",
      previousMalformedResponseDigests: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      response,
    });

    await journal.recordSubmissionProcess({
      id: "attempt-1",
      pid: 12345,
      stdoutPath: path.join(storagePath, "attempts", "attempt-1.stdout"),
      stderrPath: path.join(storagePath, "attempts", "attempt-1.stderr"),
    });

    expect(await new RunJournal(storagePath).load()).toEqual({
      contract: "mdlm-pi-run-journal@1",
      phase: "submitting",
      assignment: {
        id: "assignment-1",
        scenario: "example-scenario@1",
        package: {},
        repository: {},
      },
      submission: {
        source: response.source,
        digest: response.digest,
        previousTransactionId: "transaction-0",
        baseCommit: "0123456789abcdef",
        previousMalformedResponseDigests: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        completedProcesses: [],
        process: {
          id: "attempt-1",
          pid: 12345,
          stdoutPath: path.join(storagePath, "attempts", "attempt-1.stdout"),
          stderrPath: path.join(storagePath, "attempts", "attempt-1.stderr"),
        },
      },
    });

    await new RunJournal(storagePath).recordPublication({
      executionId: "execution-1",
      scenario: "example-scenario@1",
      responseDigest: response.digest,
      outputPaths: [".lifecycle/data/.transactions/execution-1/MAP/MAP-1/r00001.md"],
      blobs: [{
        path: ".lifecycle/data/.transactions/execution-1/MAP/MAP-1/r00001.md",
        oid: "a".repeat(40),
      }],
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

  it("rejects a reevaluation marker without an exact recovery boundary", async () => {
    const storagePath = await journalPath();
    await mkdir(storagePath, { recursive: true });
    await writeFile(path.join(storagePath, "run.json"), `${JSON.stringify({
      contract: "mdlm-pi-run-journal@1",
      phase: "reevaluating",
      boundary: {
        package: { reference: "package@1", digest: `sha256:${"a".repeat(64)}` },
        repository: { head: "materialization-commit", trackedState: "sha256:not-exact" },
      },
    })}\n`);

    await expect(new RunJournal(storagePath).load()).rejects.toThrow(
      "Malformed reevaluation journal",
    );
  });

  it.each([
    {
      defect: "empty package reference",
      boundary: {
        package: {
          reference: "",
          digest: `sha256:${"a".repeat(64)}`,
          language: "mdlm-expression@1",
        },
        repository: {
          head: "a".repeat(40),
          trackedState: `sha256:${"b".repeat(64)}`,
        },
      },
    },
    {
      defect: "non-sha256 package digest",
      boundary: {
        package: {
          reference: "package@1",
          digest: "sha256:not-exact",
          language: "mdlm-expression@1",
        },
        repository: {
          head: "a".repeat(40),
          trackedState: `sha256:${"b".repeat(64)}`,
        },
      },
    },
    {
      defect: "missing expression language",
      boundary: {
        package: {
          reference: "package@1",
          digest: `sha256:${"a".repeat(64)}`,
        },
        repository: {
          head: "a".repeat(40),
          trackedState: `sha256:${"b".repeat(64)}`,
        },
      },
    },
    {
      defect: "empty expression language",
      boundary: {
        package: {
          reference: "package@1",
          digest: `sha256:${"a".repeat(64)}`,
          language: "",
        },
        repository: {
          head: "a".repeat(40),
          trackedState: `sha256:${"b".repeat(64)}`,
        },
      },
    },
    {
      defect: "non-Git HEAD",
      boundary: {
        package: {
          reference: "package@1",
          digest: `sha256:${"a".repeat(64)}`,
          language: "mdlm-expression@1",
        },
        repository: {
          head: "not-a-git-object",
          trackedState: `sha256:${"b".repeat(64)}`,
        },
      },
    },
    {
      defect: "uppercase Git HEAD",
      boundary: {
        package: {
          reference: "package@1",
          digest: `sha256:${"a".repeat(64)}`,
          language: "mdlm-expression@1",
        },
        repository: {
          head: "A".repeat(40),
          trackedState: `sha256:${"b".repeat(64)}`,
        },
      },
    },
  ])("rejects a reevaluation marker with $defect", async ({ boundary }) => {
    const storagePath = await journalPath();
    await mkdir(storagePath, { recursive: true });
    await writeFile(path.join(storagePath, "run.json"), `${JSON.stringify({
      contract: "mdlm-pi-run-journal@1",
      phase: "reevaluating",
      boundary,
    })}\n`);

    await expect(new RunJournal(storagePath).load()).rejects.toThrow(
      "Malformed reevaluation journal",
    );
  });

  it("makes a captured response durable before submission facts are inspected", async () => {
    const storagePath = await journalPath();
    const journal = new RunJournal(storagePath);
    const response = new MdlmClient({ repository: "." }).prepareSubmission({ exact: true });

    await journal.captureSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      ...recoveryBoundary,
      response,
    });

    expect(await new RunJournal(storagePath).load()).toEqual({
      contract: "mdlm-pi-run-journal@1",
      phase: "captured",
      assignment: {
        id: "assignment-1",
        scenario: "example-scenario@1",
        package: {},
        repository: {},
      },
      submission: {
        source: response.source,
        digest: response.digest,
        replacementDigest: null,
        completedProcesses: [],
      },
    });
  });

  it("removes bounded completed attempt streams when the transaction journal clears", async () => {
    const storagePath = await journalPath();
    const journal = new RunJournal(storagePath);
    const response = new MdlmClient({ repository: "." }).prepareSubmission({ exact: true });
    await journal.beginSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      ...recoveryBoundary,
      previousTransactionId: null,
      baseCommit: "base",
      previousMalformedResponseDigests: [],
      response,
    });
    const attempts = path.join(storagePath, "attempts");
    await mkdir(attempts, { recursive: true });
    const stdoutPath = path.join(attempts, "attempt.stdout");
    const stderrPath = path.join(attempts, "attempt.stderr");
    await writeFile(stdoutPath, "stdout");
    await writeFile(stderrPath, "stderr");
    await journal.recordSubmissionProcess({
      id: "attempt",
      pid: 12345,
      stdoutPath,
      stderrPath,
    });
    await journal.clearSubmissionProcess();

    await journal.clear();

    await expect(readFile(stdoutPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(stderrPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("atomically replaces a malformed response while retaining correction recovery", async () => {
    const storagePath = await journalPath();
    const journal = new RunJournal(storagePath);
    const client = new MdlmClient({ repository: "." });
    const malformed = client.prepareSubmission({ first: true });
    await journal.beginSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      ...recoveryBoundary,
      previousTransactionId: null,
      baseCommit: "base",
      previousMalformedResponseDigests: [],
      response: malformed,
    });

    const corrected = client.prepareSubmission({ corrected: true });
    await journal.captureSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      ...recoveryBoundary,
      replacementDigest: malformed.digest,
      response: corrected,
    });
    expect(await journal.load()).toMatchObject({
      phase: "captured",
      submission: {
        source: corrected.source,
        digest: corrected.digest,
        replacementDigest: malformed.digest,
      },
    });
    await journal.promoteCapturedSubmission({
      assignmentId: "assignment-1",
      scenario: "example-scenario@1",
      ...recoveryBoundary,
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
  });
});
