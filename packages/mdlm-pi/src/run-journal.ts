import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { PreparedAssignmentSubmission } from "./mdlm-client.js";

const journalContract = "mdlm-pi-run-journal@1" as const;

export interface SubmissionIntent {
  assignmentId: string;
  scenario: string;
  previousTransactionId: string | null;
  baseCommit: string;
  previousMalformedResponseDigests: string[];
  response: PreparedAssignmentSubmission;
}

export interface PublicationEvidence {
  executionId: string;
  scenario: string;
  responseDigest: `sha256:${string}`;
  outputPaths: string[];
}

interface JournalBase {
  contract: typeof journalContract;
  assignment: { id: string; scenario: string };
  submission: {
    source: string;
    digest: `sha256:${string}`;
    previousTransactionId: string | null;
    baseCommit: string;
    previousMalformedResponseDigests: string[];
  };
}

export type RunJournalRecord =
  | {
      contract: typeof journalContract;
      phase: "advancing";
      advancement: {
        baseCommit: string;
        previousTransactionId: string | null;
        pending: PublicationEvidence[];
      };
    }
  | JournalBase & { phase: "submitting" }
  | JournalBase & { phase: "published"; publication: PublicationEvidence }
  | JournalBase & { phase: "doctor-passed"; publication: PublicationEvidence };

export class RunJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunJournalError";
  }
}

/** Durable intent and reconciliation evidence for external side effects only. */
export class RunJournal {
  readonly #directory: string;
  readonly #journalPath: string;

  constructor(directory: string) {
    this.#directory = directory;
    this.#journalPath = path.join(directory, "run.json");
  }

  async load(): Promise<RunJournalRecord | null> {
    let source: string;
    try {
      source = await readFile(this.#journalPath, "utf8");
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return null;
      throw error;
    }
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      throw new RunJournalError(`Run journal is not valid JSON: ${this.#journalPath}`);
    }
    return parseJournal(value, this.#journalPath);
  }

  async beginAdvancement(intent: {
    baseCommit: string;
    previousTransactionId: string | null;
  }): Promise<void> {
    if (await this.load() !== null) {
      throw new RunJournalError("Cannot advance while recovery work remains in the run journal");
    }
    await this.#write({
      contract: journalContract,
      phase: "advancing",
      advancement: { ...intent, pending: [] },
    });
  }

  async recordAdvancementExecutions(publications: PublicationEvidence[]): Promise<void> {
    const current = await this.load();
    if (current?.phase !== "advancing" || current.advancement.pending.length > 0) {
      throw new RunJournalError("Materialized executions require one empty advancement intent");
    }
    await this.#write({
      ...current,
      advancement: { ...current.advancement, pending: publications },
    });
  }

  async completeAdvancementExecution(executionId: string, commit: string): Promise<void> {
    const current = await this.load();
    if (current?.phase !== "advancing" || current.advancement.pending[0]?.executionId !== executionId) {
      throw new RunJournalError("Advancement commits must complete in journaled execution order");
    }
    await this.#write({
      ...current,
      advancement: {
        ...current.advancement,
        baseCommit: commit,
        pending: current.advancement.pending.slice(1),
      },
    });
  }

  async beginSubmission(intent: SubmissionIntent): Promise<void> {
    if (await this.load() !== null) {
      throw new RunJournalError("Cannot begin submission while recovery work remains in the run journal");
    }
    const sourceDigest = digest(intent.response.source);
    if (sourceDigest !== intent.response.digest) {
      throw new RunJournalError("Cannot journal an Assignment response whose digest does not match its exact source");
    }
    await this.#write({
      contract: journalContract,
      phase: "submitting",
      assignment: { id: intent.assignmentId, scenario: intent.scenario },
      submission: {
        source: intent.response.source,
        digest: intent.response.digest,
        previousTransactionId: intent.previousTransactionId,
        baseCommit: intent.baseCommit,
        previousMalformedResponseDigests: intent.previousMalformedResponseDigests,
      },
    });
  }

  async replaceSubmission(
    expectedDigest: `sha256:${string}`,
    intent: SubmissionIntent,
  ): Promise<void> {
    const current = await this.load();
    if (current?.phase !== "submitting" || current.submission.digest !== expectedDigest) {
      throw new RunJournalError("Cannot replace a submission without its exact correction journal");
    }
    if (current.assignment.id !== intent.assignmentId) {
      throw new RunJournalError("Cannot replace a submission with a different Assignment");
    }
    if (digest(intent.response.source) !== intent.response.digest) {
      throw new RunJournalError("Cannot journal an Assignment response whose digest does not match its exact source");
    }
    await this.#write({
      contract: journalContract,
      phase: "submitting",
      assignment: { id: intent.assignmentId, scenario: intent.scenario },
      submission: {
        source: intent.response.source,
        digest: intent.response.digest,
        previousTransactionId: intent.previousTransactionId,
        baseCommit: intent.baseCommit,
        previousMalformedResponseDigests: intent.previousMalformedResponseDigests,
      },
    });
  }

  async recordPublication(publication: PublicationEvidence): Promise<void> {
    const current = await this.load();
    if (current === null || current.phase !== "submitting") {
      throw new RunJournalError("Publication can only follow a journaled submission intent");
    }
    if (
      publication.scenario !== current.assignment.scenario ||
      publication.responseDigest !== current.submission.digest
    ) {
      throw new RunJournalError("Publication evidence does not match the journaled Assignment response");
    }
    await this.#write({ ...current, phase: "published", publication });
  }

  async recordDoctorPassed(): Promise<void> {
    const current = await this.load();
    if (current === null || current.phase !== "published") {
      throw new RunJournalError("Doctor can only pass after publication is journaled");
    }
    await this.#write({ ...current, phase: "doctor-passed" });
  }

  async clear(): Promise<void> {
    await rm(this.#journalPath, { force: true });
    await syncDirectory(this.#directory);
  }

  async #write(record: RunJournalRecord): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(
      this.#directory,
      `.run-${process.pid}-${randomUUID()}.tmp`,
    );
    const file = await open(temporaryPath, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, this.#journalPath);
      await syncDirectory(this.#directory);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

function parseJournal(value: unknown, journalPath: string): RunJournalRecord {
  if (!isObject(value) || value.contract !== journalContract) {
    throw new RunJournalError(`Unsupported run journal contract: ${journalPath}`);
  }
  if (value.phase === "advancing") {
    const advancement = value.advancement;
    if (
      !isObject(advancement) || typeof advancement.baseCommit !== "string" ||
      advancement.baseCommit.length === 0 ||
      (advancement.previousTransactionId !== null &&
        typeof advancement.previousTransactionId !== "string") ||
      !Array.isArray(advancement.pending)
    ) {
      throw new RunJournalError(`Malformed advancement journal: ${journalPath}`);
    }
    for (const publication of advancement.pending) {
      parseStandalonePublication(publication, journalPath);
    }
    return {
      contract: journalContract,
      phase: "advancing",
      advancement: {
        baseCommit: advancement.baseCommit,
        previousTransactionId: advancement.previousTransactionId,
        pending: advancement.pending,
      },
    };
  }
  if (value.phase !== "submitting" && value.phase !== "published" && value.phase !== "doctor-passed") {
    throw new RunJournalError(`Unsupported run journal phase: ${journalPath}`);
  }
  const assignment = value.assignment;
  const submission = value.submission;
  if (
    !isObject(assignment) || typeof assignment.id !== "string" ||
    typeof assignment.scenario !== "string" || !isObject(submission) ||
    typeof submission.source !== "string" || typeof submission.digest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(submission.digest) ||
    (submission.previousTransactionId !== null && typeof submission.previousTransactionId !== "string") ||
    typeof submission.baseCommit !== "string" || submission.baseCommit.length === 0 ||
    !Array.isArray(submission.previousMalformedResponseDigests) ||
    !submission.previousMalformedResponseDigests.every((item) =>
      typeof item === "string" && /^sha256:[0-9a-f]{64}$/.test(item)
    )
  ) {
    throw new RunJournalError(`Malformed run journal: ${journalPath}`);
  }
  if (digest(submission.source) !== submission.digest) {
    throw new RunJournalError(`Run journal response digest does not match its exact source: ${journalPath}`);
  }
  const base: JournalBase = {
    contract: journalContract,
    assignment: { id: assignment.id, scenario: assignment.scenario },
    submission: {
      source: submission.source,
      digest: submission.digest as `sha256:${string}`,
      previousTransactionId: submission.previousTransactionId,
      baseCommit: submission.baseCommit,
      previousMalformedResponseDigests: submission.previousMalformedResponseDigests,
    },
  };
  if (value.phase === "submitting") return { ...base, phase: "submitting" };
  parsePublication(value.publication, assignment.scenario, submission.digest, journalPath);
  return { ...base, phase: value.phase, publication: value.publication };
}

function parseStandalonePublication(
  value: unknown,
  journalPath: string,
): asserts value is PublicationEvidence {
  if (
    !isObject(value) || typeof value.executionId !== "string" ||
    typeof value.scenario !== "string" ||
    typeof value.responseDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.responseDigest) ||
    !Array.isArray(value.outputPaths) ||
    !value.outputPaths.every((item) => typeof item === "string")
  ) {
    throw new RunJournalError(`Malformed publication evidence in run journal: ${journalPath}`);
  }
}

function parsePublication(
  value: unknown,
  scenario: string,
  responseDigest: string,
  journalPath: string,
): asserts value is PublicationEvidence {
  parseStandalonePublication(value, journalPath);
  if (
    value.scenario !== scenario || value.responseDigest !== responseDigest ||
    !Array.isArray(value.outputPaths) ||
    !value.outputPaths.every((item) => typeof item === "string")
  ) {
    throw new RunJournalError(`Malformed publication evidence in run journal: ${journalPath}`);
  }
}

function digest(source: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (process.platform !== "win32" && !isErrorCode(error, "ENOENT")) throw error;
  } finally {
    await handle?.close();
  }
}
