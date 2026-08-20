import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { JsonValue, PreparedAssignmentSubmission } from "./mdlm-client.js";

const journalContract = "mdlm-pi-run-journal@1" as const;
const attendedConclusionsContract = "mdlm-pi-attended-conclusions@1" as const;

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

export interface SubmissionProcess {
  id: string;
  pid: number;
  stdoutPath: string;
  stderrPath: string;
}

export interface AttendedConclusions {
  contract: typeof attendedConclusionsContract;
  checkpoint: string;
  consolidationGroup: string | null;
  authority: string;
  items: string[];
  conclusion: JsonValue;
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
    process?: SubmissionProcess;
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
  readonly #attendedConclusionsPath: string;

  constructor(directory: string) {
    this.#directory = directory;
    this.#journalPath = path.join(directory, "run.json");
    this.#attendedConclusionsPath = path.join(directory, "attended-conclusions.json");
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

  async loadAttendedConclusions(): Promise<AttendedConclusions | null> {
    let source: string;
    try {
      source = await readFile(this.#attendedConclusionsPath, "utf8");
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return null;
      throw error;
    }
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      throw new RunJournalError(
        `Attended conclusions are not valid JSON: ${this.#attendedConclusionsPath}`,
      );
    }
    return parseAttendedConclusions(value, this.#attendedConclusionsPath);
  }

  async recordAttendedConclusions(
    conclusions: Omit<AttendedConclusions, "contract">,
  ): Promise<AttendedConclusions> {
    if (await this.loadAttendedConclusions() !== null) {
      throw new RunJournalError("Cannot replace attended conclusions without clearing their exact group");
    }
    const record: AttendedConclusions = {
      contract: attendedConclusionsContract,
      ...conclusions,
    };
    await this.#writeFile(
      this.#attendedConclusionsPath,
      "attended",
      record,
    );
    return record;
  }

  async clearAttendedConclusions(): Promise<void> {
    await rm(this.#attendedConclusionsPath, { force: true });
    await syncDirectory(this.#directory);
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

  async recordSubmissionProcess(process: SubmissionProcess): Promise<void> {
    const current = await this.load();
    if (current?.phase !== "submitting" || current.submission.process !== undefined) {
      throw new RunJournalError("A child process requires one unstarted submission intent");
    }
    if (!validSubmissionProcess(process)) {
      throw new RunJournalError("Cannot journal malformed submission process evidence");
    }
    await this.#write({
      ...current,
      submission: { ...current.submission, process },
    });
  }

  async clearSubmissionProcess(): Promise<void> {
    const current = await this.load();
    if (current?.phase !== "submitting" || current.submission.process === undefined) {
      throw new RunJournalError("A completed child process requires one started submission intent");
    }
    const { process: _process, ...submission } = current.submission;
    await this.#write({ ...current, submission });
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
    await this.#writeFile(this.#journalPath, "run", record);
  }

  async #writeFile(filePath: string, prefix: string, value: unknown): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(
      this.#directory,
      `.${prefix}-${process.pid}-${randomUUID()}.tmp`,
    );
    const file = await open(temporaryPath, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, filePath);
      await syncDirectory(this.#directory);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

function parseAttendedConclusions(
  value: unknown,
  conclusionsPath: string,
): AttendedConclusions {
  if (
    !isObject(value) || value.contract !== attendedConclusionsContract ||
    typeof value.checkpoint !== "string" || value.checkpoint.length === 0 ||
    (value.consolidationGroup !== null &&
      typeof value.consolidationGroup !== "string") ||
    typeof value.authority !== "string" || value.authority.length === 0 ||
    !Array.isArray(value.items) || value.items.length === 0 ||
    !value.items.every((item) => typeof item === "string" && item.length > 0) ||
    !isJsonValue(value.conclusion)
  ) {
    throw new RunJournalError(`Malformed attended conclusions: ${conclusionsPath}`);
  }
  return {
    contract: attendedConclusionsContract,
    checkpoint: value.checkpoint,
    consolidationGroup: value.consolidationGroup,
    authority: value.authority,
    items: value.items,
    conclusion: value.conclusion,
  };
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
  if (submission.process !== undefined && !validSubmissionProcess(submission.process)) {
    throw new RunJournalError(`Malformed submission process evidence: ${journalPath}`);
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
      ...(submission.process ? { process: submission.process } : {}),
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

function validSubmissionProcess(value: unknown): value is SubmissionProcess {
  return isObject(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.pid === "number" && Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.stdoutPath === "string" && value.stdoutPath.length > 0 &&
    typeof value.stderrPath === "string" && value.stderrPath.length > 0;
}

function digest(source: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
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
