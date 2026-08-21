import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type {
  AssignmentPacket,
  AssignmentState,
  JsonObject,
  JsonValue,
  MdlmNext,
  MdlmStatus,
  PreparedAssignmentSubmission,
} from "./mdlm-client.js";
import { MdlmClient } from "./mdlm-client.js";
import { GitPublisher } from "./git-publisher.js";
import type { OperatorIO } from "./operator-io.js";
import type { PiAssignmentRunOptions } from "./pi-assignment-runner.js";
import { PiAssignmentRunner } from "./pi-assignment-runner.js";
import type {
  RecoveryAssignment,
  RunJournalRecord,
  UncapturedPublicationEvidence,
} from "./run-journal.js";
import { RunJournal } from "./run-journal.js";

type MdlmPort = Pick<MdlmClient,
  "status" | "next" | "assignment" | "prepare" | "prepareSubmission" |
  "submit" | "execution" | "doctor"
>;
type AssignmentPort = Pick<PiAssignmentRunner, "run"> & {
  close?: (assignmentId: string) => Promise<void>;
};
type GitPort = Pick<GitPublisher,
  "assertClean" | "head" | "repositoryFingerprint" | "capturePublication" |
  "commit" | "publicationCommitState" | "pendingTransactionIds"
>;
type JournalPort = Pick<RunJournal,
  "load" | "beginAdvancement" | "restoreReevaluation" |
  "recordAdvancementExecutions" | "completeAdvancementExecution" | "captureSubmission" |
  "promoteCapturedSubmission" | "recordSubmissionProcess" |
  "clearSubmissionProcess" | "recordPublication" |
  "recordDoctorPassed" | "clear" | "loadAttendedConclusions" |
  "recordAttendedConclusions" | "clearAttendedConclusions" |
  "loadAttendedAssignment" | "recordAttendedAssignment" | "clearAttendedAssignment"
>;

export interface RunControllerOptions {
  mdlm: MdlmPort;
  assignments: AssignmentPort;
  io: OperatorIO;
  git: GitPort;
  journal: JournalPort;
  signal?: AbortSignal;
}

export interface RunStop {
  status: string;
  details: JsonObject;
  successful: boolean;
}

type SubmissionResult =
  | { kind: "published" }
  | {
      kind: "correction";
      previousResponse: JsonObject;
      diagnostics: JsonValue;
      replacementDigest: `sha256:${string}`;
    }
  | { kind: "stopped"; stop: RunStop };

/** Deterministic owner of continuation, recovery, and serial publication. */
export class RunController {
  readonly #mdlm: MdlmPort;
  readonly #assignments: AssignmentPort;
  readonly #io: OperatorIO;
  readonly #git: GitPort;
  readonly #journal: JournalPort;
  readonly #signal: AbortSignal | undefined;

  constructor(options: RunControllerOptions) {
    this.#mdlm = options.mdlm;
    this.#assignments = options.assignments;
    this.#io = options.io;
    this.#git = options.git;
    this.#journal = options.journal;
    this.#signal = options.signal;
  }

  async run(): Promise<RunStop> {
    this.#ensureRunning();
    const recovered = await this.#recover();
    if (recovered?.kind === "stopped") return this.#report(recovered.stop);
    if (recovered?.kind === "correction") {
      return this.#report({
        status: "assignment-correction-session-lost",
        details: {
          assignment: { id: recovered.assignmentId },
          responseDigest: recovered.replacementDigest,
          diagnostics: recovered.diagnostics,
        },
        successful: false,
      });
    }
    let reevaluationRequired = recovered?.kind === "reevaluate";
    let recoveredStatus = recovered?.kind === "reevaluate" ? recovered.status : undefined;

    await this.#git.assertClean();
    while (true) {
      this.#ensureRunning();
      const statusWasVerified = recoveredStatus !== undefined;
      const status = recoveredStatus ?? await this.#mdlm.status();
      recoveredStatus = undefined;
      const outcome = status.currentOutcome;
      if (reevaluationRequired && outcome.outcome === "invalid") {
        await this.#clearAttendedState();
        return this.#report(stopForOutcome(outcome));
      }
      if (reevaluationRequired && !statusWasVerified) {
        await this.#assertCurrentReevaluationBoundary(status);
      }
      if (outcome.outcome !== "assignment" && outcome.outcome !== "attention-required") {
        if (reevaluationRequired) await this.#journal.clear();
        await this.#clearAttendedState();
        return this.#report(stopForOutcome(outcome));
      }

      const allocation = asObject(outcome.assignment, "status.currentOutcome.assignment");
      let allocated: JsonObject;
      if (
        !reevaluationRequired &&
        (allocation.allocation === "active" || allocation.id !== undefined)
      ) {
        asString(allocation.id, "status.currentOutcome.assignment.id");
        allocated = {
          ...outcome,
          ...(status.package === undefined ? {} : { package: status.package }),
        };
      } else {
        const advancement = await this.#advance(status);
        if (advancement.materializedExecutions.length > 0) {
          // Committing automatic materialization changes the repository fingerprint and
          // retires the Assignment lease returned by the pre-commit `next`.
          reevaluationRequired = true;
          continue;
        }
        reevaluationRequired = false;
        allocated = advancement;
        if (allocated.outcome !== "assignment" && allocated.outcome !== "attention-required") {
          await this.#clearAttendedState();
          return this.#report(stopForOutcome(allocated));
        }
      }
      if (allocated.outcome !== "attention-required") {
        await this.#clearAttendedState();
      }
      const assignment = asObject(allocated.assignment, "outcome.assignment");
      const assignmentId = asString(assignment.id, "outcome.assignment.id");
      const packet = await this.#mdlm.prepare(assignmentId);
      this.#io.progress(`Assignment ${assignmentId}: ${packet.scenario.reference}`);

      let attendedContext: JsonValue | undefined;
      if (allocated.outcome === "attention-required") {
        attendedContext = await this.#attendedContext(allocated, packet);
      }
      const stopped = await this.#completeAssignment(
        packet,
        attendedContext === undefined ? {} : { attendedContext },
      );
      if (stopped) {
        await this.#clearAttendedState();
        return this.#report(stopped);
      }
      await this.#journal.clearAttendedAssignment();
      await this.#git.assertClean();
    }
  }

  async #assertCurrentReevaluationBoundary(status: MdlmStatus): Promise<void> {
    const record = await this.#journal.load();
    if (record?.phase !== "reevaluating") {
      throw new Error("Reevaluation requires its exact recovery boundary");
    }
    assertReevaluationBoundary(record.boundary, {
      package: statusPackage(status, "reevaluation recovery"),
      repository: await this.#git.repositoryFingerprint(),
    });
  }

  async #attendedContext(
    outcome: JsonObject,
    packet: AssignmentPacket,
  ): Promise<JsonObject> {
    const assignment = recoveryAssignment(packet);
    const attendedAssignment = await this.#journal.loadAttendedAssignment();
    if (attendedAssignment !== null) {
      if (attendedAssignment.assignment.id !== assignment.id) {
        await this.#journal.clearAttendedAssignment();
      } else {
        if (!isDeepStrictEqual(attendedAssignment.assignment, assignment)) {
          throw new Error(`Assignment '${assignment.id}' attended recovery boundary changed`);
        }
        return attendedAssignment.context;
      }
    }

    const group = attendedGroup(outcome);
    let context: JsonObject;
    if (group === null) {
      context = attendedAuthorityContext(
        outcome,
        (await this.#io.attention(outcome)).conclusion,
      );
    } else {
      const persisted = await this.#journal.loadAttendedConclusions();
      if (
        persisted !== null && isDeepStrictEqual(persisted.package, group.package) &&
        persisted.checkpoint === group.checkpoint &&
        persisted.consolidationGroup === group.consolidationGroup &&
        persisted.authority === group.authority &&
        group.items.every((item) => persisted.items.includes(item))
      ) {
        context = attendedAuthorityContext(outcome, persisted.conclusion);
      } else {
        if (persisted !== null) await this.#journal.clearAttendedConclusions();
        const supplied = await this.#io.attention(outcome);
        const recorded = await this.#journal.recordAttendedConclusions({
          ...group,
          conclusion: {
            authority: group.authority,
            checkpoint: group.checkpoint,
            consolidationGroup: group.consolidationGroup,
            itemInstances: group.items,
            conclusion: supplied.conclusion,
          },
        });
        context = attendedAuthorityContext(outcome, recorded.conclusion);
      }
    }
    await this.#journal.recordAttendedAssignment({ assignment, context });
    return context;
  }

  async #clearAttendedState(): Promise<void> {
    await this.#journal.clearAttendedAssignment();
    await this.#journal.clearAttendedConclusions();
  }

  async #advance(status: MdlmStatus): Promise<MdlmNext> {
    await this.#journal.beginAdvancement({
      package: statusPackage(status, "advancement"),
      repository: await this.#git.repositoryFingerprint(),
      previousTransactionId: recentTransactionId(status.recentTransaction),
    });
    const outcome = await this.#mdlm.next();
    const declared = outcome.materializedExecutions;
    const pendingIds = await this.#git.pendingTransactionIds();
    const declaredIds = declared.map((execution) => execution.id).sort();
    if (!sameStrings(pendingIds, declaredIds)) {
      throw new Error(
        `mdlm next materialization evidence differs from Git changes: ` +
        `declared=${declaredIds.join(",")} pending=${pendingIds.join(",")}`,
      );
    }
    const publications = await Promise.all(
      declared.map(async ({ id }) => this.#git.capturePublication(
        publicationFromMaterialization((await this.#mdlm.execution(id)).execution),
      )),
    );
    await this.#journal.recordAdvancementExecutions(publications);
    await this.#finishAdvancement();
    return outcome;
  }

  async #completeAssignment(
    packet: AssignmentPacket,
    initialOptions: PiAssignmentRunOptions,
    initialReplacementDigest?: `sha256:${string}`,
  ): Promise<RunStop | null> {
    let options = initialOptions;
    let replacementDigest = initialReplacementDigest;
    let correctionPrepared = initialOptions.correction !== undefined;
    while (true) {
      let response: JsonObject;
      try {
        response = await this.#assignments.run(packet, options);
      } catch (error) {
        await this.#assignments.close?.(packet.assignment.id);
        throw error;
      }
      const prepared = this.#mdlm.prepareSubmission(response);
      await this.#journal.captureSubmission({
        assignmentId: packet.assignment.id,
        scenario: packet.scenario.reference,
        package: packet.package,
        repository: packet.repository,
        response: prepared,
        ...(replacementDigest === undefined ? {} : { replacementDigest }),
      });
      const submitted = await this.#submitCaptured(packet, response, prepared);
      if (submitted.kind === "published") {
        await this.#assignments.close?.(packet.assignment.id);
        return null;
      }
      if (submitted.kind === "stopped") {
        await this.#assignments.close?.(packet.assignment.id);
        return submitted.stop;
      }
      if (correctionPrepared) {
        await this.#assignments.close?.(packet.assignment.id);
        throw new Error(`Assignment '${packet.assignment.id}' requested more than one correction`);
      }
      correctionPrepared = true;
      options = {
        ...(initialOptions.attendedContext === undefined
          ? {}
          : { attendedContext: initialOptions.attendedContext }),
        correction: {
          previousResponse: submitted.previousResponse,
          diagnostics: submitted.diagnostics,
        },
      };
      replacementDigest = submitted.replacementDigest;
    }
  }

  async #submitCaptured(
    packet: AssignmentPacket,
    response: JsonObject,
    prepared: PreparedAssignmentSubmission,
  ): Promise<SubmissionResult> {
    const assignmentState = await this.#mdlm.assignment(packet.assignment.id);
    if (!assignmentState.selected || assignmentState.disposition !== "active") {
      throw new Error(`Assignment '${packet.assignment.id}' is not an active durable lease`);
    }
    assertRecoveryBoundary(recoveryAssignment(packet), assignmentState);
    const status = await this.#mdlm.status();
    await this.#journal.promoteCapturedSubmission({
      assignmentId: packet.assignment.id,
      scenario: packet.scenario.reference,
      package: packet.package,
      repository: packet.repository,
      previousTransactionId: recentTransactionId(status.recentTransaction),
      baseCommit: await this.#git.head(),
      previousMalformedResponseDigests: malformedDigests(assignmentState),
      response: prepared,
    });

    const submission = await this.#mdlm.submit(prepared, {
      started: (process) => this.#journal.recordSubmissionProcess(process),
    });
    await this.#completeObservedSubmissionProcess();
    return this.#consumeSubmission(packet, response, prepared, submission);
  }

  async #consumeSubmission(
    packet: AssignmentPacket,
    response: JsonObject,
    prepared: PreparedAssignmentSubmission,
    submission: JsonObject,
  ): Promise<SubmissionResult> {
    if (submission.contract === "mdlm-scenario-execution@4") {
      const publication = await this.#git.capturePublication(publicationFromCommand(submission, {
        assignmentId: packet.assignment.id,
        scenario: packet.scenario.reference,
        responseDigest: prepared.digest,
      }));
      await this.#journal.recordPublication(publication);
      await this.#finishPublication();
      return { kind: "published" };
    }

    const disposition = asString(submission.disposition, "submission.disposition");
    if (disposition === "correction-required") {
      const malformed = asObject(submission.malformedResponse, "submission.malformedResponse");
      return {
        kind: "correction",
        previousResponse: response,
        diagnostics: malformed.diagnostics ?? [],
        replacementDigest: prepared.digest,
      };
    }
    if (disposition === "abandoned") {
      const stop = abandonedStop(packet.assignment.id, response, submission);
      await this.#journal.clear();
      return { kind: "stopped", stop };
    }
    return {
      kind: "stopped",
      stop: {
        status: `assignment-${disposition}`,
        details: submission,
        successful: false,
      },
    };
  }

  async #recover(): Promise<
    | {
        kind: "correction";
        assignmentId: string;
        previousResponse: JsonObject;
        diagnostics: JsonValue;
        replacementDigest: `sha256:${string}`;
      }
    | { kind: "stopped"; stop: RunStop }
    | { kind: "reevaluate"; status: MdlmStatus }
    | null
  > {
    let record = await this.#journal.load();
    if (record === null) return null;
    if (record.phase === "reevaluating") {
      const status = await this.#mdlm.status();
      if (status.currentOutcome.outcome === "invalid") {
        return { kind: "stopped", stop: stopForOutcome(status.currentOutcome) };
      }
      assertReevaluationBoundary(record.boundary, {
        package: statusPackage(status, "reevaluation recovery"),
        repository: await this.#git.repositoryFingerprint(),
      });
      return { kind: "reevaluate", status };
    }
    if (record.phase === "captured") {
      this.#io.progress(`Recovering captured response for Assignment ${record.assignment.id}`);
      const state = await this.#mdlm.assignment(record.assignment.id);
      if (!state.selected || state.disposition !== "active") {
        throw new Error(`Captured Assignment '${record.assignment.id}' is not an active durable lease`);
      }
      assertRecoveryBoundary(record.assignment, state);
      const packet = await this.#mdlm.prepare(record.assignment.id);
      assertRecoveryBoundary(record.assignment, packet);
      if (packet.scenario.reference !== record.assignment.scenario) {
        throw new Error(`Captured Assignment '${record.assignment.id}' changed Scenario identity`);
      }
      const response = parseResponseSource(record.submission.source);
      const submitted = await this.#submitCaptured(packet, response, {
        response,
        source: record.submission.source,
        digest: record.submission.digest,
      });
      if (submitted.kind === "published") return null;
      if (submitted.kind === "stopped") return submitted;
      return {
        kind: "correction",
        assignmentId: record.assignment.id,
        previousResponse: submitted.previousResponse,
        diagnostics: submitted.diagnostics,
        replacementDigest: submitted.replacementDigest,
      };
    }
    if (record.phase === "advancing") {
      this.#io.progress("Recovering interrupted mdlm next materialization");
      const status = await this.#mdlm.status();
      if (status.currentOutcome.outcome === "invalid") {
        return { kind: "stopped", stop: stopForOutcome(status.currentOutcome) };
      }
      if (!isDeepStrictEqual(
        statusPackage(status, "advancement recovery"),
        record.advancement.package,
      )) {
        throw new Error("Selected Process Package changed during interrupted mdlm next recovery");
      }
      if (record.advancement.pending.length === 0) {
        if (await this.#git.head() !== record.advancement.baseCommit) {
          throw new Error("HEAD changed during interrupted mdlm next recovery");
        }
        const pendingIds = await this.#git.pendingTransactionIds();
        if (pendingIds.length > 1) {
          throw new Error(
            "Interrupted mdlm next materialization order cannot be proven",
          );
        }
        const recentId = recentTransactionId(status.recentTransaction);
        if (pendingIds.length === 0) {
          if (!isDeepStrictEqual(
            await this.#git.repositoryFingerprint(),
            record.advancement.repository,
          )) {
            throw new Error("Repository fingerprint changed during interrupted mdlm next recovery");
          }
          if (recentId !== record.advancement.previousTransactionId) {
            throw new Error("mdlm next changed recent transaction without visible transaction files");
          }
          if (record.advancement.purpose === "post-materialization-reevaluation") {
            await this.#journal.restoreReevaluation();
            return { kind: "reevaluate", status };
          }
        } else if (
          recentId === null || recentId === record.advancement.previousTransactionId ||
          !pendingIds.includes(recentId)
        ) {
          throw new Error("mdlm next worktree and recent transaction evidence contradict each other");
        }
        const publications = await Promise.all(
          pendingIds.map(async (id) => this.#git.capturePublication(
            publicationFromMaterialization((await this.#mdlm.execution(id)).execution),
          )),
        );
        await this.#journal.recordAdvancementExecutions(publications);
      }
      if (!(await this.#finishAdvancement())) return null;
      const reevaluation = await this.#journal.load();
      if (reevaluation?.phase !== "reevaluating") {
        throw new Error("Materialization recovery lost its reevaluation boundary");
      }
      const reevaluatedStatus = await this.#mdlm.status();
      if (reevaluatedStatus.currentOutcome.outcome === "invalid") {
        return { kind: "stopped", stop: stopForOutcome(reevaluatedStatus.currentOutcome) };
      }
      assertReevaluationBoundary(reevaluation.boundary, {
        package: statusPackage(reevaluatedStatus, "reevaluation recovery"),
        repository: await this.#git.repositoryFingerprint(),
      });
      return { kind: "reevaluate", status: reevaluatedStatus };
    }
    this.#io.progress(`Recovering ${record.phase} transaction for Assignment ${record.assignment.id}`);

    if (record.phase === "submitting") {
      const child = record.submission.process;
      if (child !== undefined) {
        if (processAlive(child.pid)) {
          return {
            kind: "stopped",
            stop: {
              status: "submission-child-active",
              details: {
                pid: child.pid,
                stdoutPath: child.stdoutPath,
                stderrPath: child.stderrPath,
              },
              successful: false,
            },
          };
        }
        await this.#journal.clearSubmissionProcess();
        const refreshed = await this.#journal.load();
        if (refreshed?.phase !== "submitting") {
          throw new Error("Run journal lost submission evidence after child exit");
        }
        record = refreshed;
      }
      const recovered = await this.#recoverSubmission(record);
      if (recovered !== null) return recovered;
      record = await this.#journal.load();
      if (record === null) throw new Error("Run journal disappeared during publication recovery");
    }
    await this.#finishPublication();
    return null;
  }

  async #recoverSubmission(record: Extract<RunJournalRecord, { phase: "submitting" }>): Promise<
    | {
        kind: "correction";
        assignmentId: string;
        previousResponse: JsonObject;
        diagnostics: JsonValue;
        replacementDigest: `sha256:${string}`;
      }
    | { kind: "stopped"; stop: RunStop }
    | null
  > {
    const status = await this.#mdlm.status();
    if (status.currentOutcome.outcome === "invalid") {
      return { kind: "stopped", stop: stopForOutcome(status.currentOutcome) };
    }
    const recentId = recentTransactionId(status.recentTransaction);
    if (recentId !== null && recentId !== record.submission.previousTransactionId) {
      const inspected = await this.#mdlm.execution(recentId);
      const publication = await this.#git.capturePublication(publicationFromExecution(
        inspected.execution,
        {
          assignmentId: record.assignment.id,
          scenario: record.assignment.scenario,
          responseDigest: record.submission.digest,
        },
      ));
      await this.#journal.recordPublication(publication);
      return null;
    }

    if (record.submission.completedProcesses.length > 0) {
      assertRecoveryBoundary(record.assignment, {
        package: statusPackage(status, "submission recovery"),
        repository: await this.#git.repositoryFingerprint(),
      });
      const stop = await abandonedStopFromCompletedProcess(record);
      if (stop !== null) {
        await this.#journal.clear();
        return { kind: "stopped", stop };
      }
    }

    const state = await this.#mdlm.assignment(record.assignment.id);
    const previousResponse = parseResponseSource(record.submission.source);
    if (!state.selected) {
      throw new Error(
        `Cannot reconcile Assignment '${record.assignment.id}': no publication or durable lease is observable`,
      );
    }
    assertRecoveryBoundary(record.assignment, state);
    if (state.disposition === "abandoned") {
      const persistedResponse = state.response;
      if (persistedResponse?.digest !== record.submission.digest) {
        throw new Error(`Abandoned Assignment '${record.assignment.id}' has an unexpected response digest`);
      }
      return {
        kind: "stopped",
        stop: {
          status: "assignment-abandoned",
          details: state,
          successful: false,
        },
      };
    }
    if (state.disposition === "exhausted" || state.disposition === "stale") {
      return {
        kind: "stopped",
        stop: {
          status: `assignment-${state.disposition}`,
          details: state,
          successful: false,
        },
      };
    }

    const currentDigests = malformedDigests(state);
    const previousDigests = record.submission.previousMalformedResponseDigests;
    if (!isPrefix(previousDigests, currentDigests)) {
      throw new Error(`Assignment '${record.assignment.id}' malformed-response history diverged`);
    }
    if (currentDigests.length > previousDigests.length) {
      if (
        currentDigests.length !== previousDigests.length + 1 ||
        currentDigests.at(-1) !== record.submission.digest
      ) {
        throw new Error(`Assignment '${record.assignment.id}' recorded an unexpected malformed response`);
      }
      const latest = state.malformedResponses.at(-1);
      return {
        kind: "correction",
        assignmentId: record.assignment.id,
        previousResponse,
        diagnostics: latest?.diagnostics ?? [],
        replacementDigest: record.submission.digest,
      };
    }

    const prepared: PreparedAssignmentSubmission = {
      response: previousResponse,
      source: record.submission.source,
      digest: record.submission.digest,
    };
    const submission = await this.#mdlm.submit(prepared, {
      started: (process) => this.#journal.recordSubmissionProcess(process),
    });
    await this.#completeObservedSubmissionProcess();
    if (submission.contract === "mdlm-scenario-execution@4") {
      const publication = await this.#git.capturePublication(publicationFromCommand(submission, {
        assignmentId: record.assignment.id,
        scenario: record.assignment.scenario,
        responseDigest: record.submission.digest,
      }));
      await this.#journal.recordPublication(publication);
      return null;
    }
    const disposition = asString(submission.disposition, "submission.disposition");
    if (disposition === "correction-required") {
      const malformed = asObject(submission.malformedResponse, "submission.malformedResponse");
      return {
        kind: "correction",
        assignmentId: record.assignment.id,
        previousResponse,
        diagnostics: malformed.diagnostics ?? [],
        replacementDigest: record.submission.digest,
      };
    }
    if (disposition === "abandoned") {
      const stop = abandonedStop(record.assignment.id, previousResponse, submission);
      await this.#journal.clear();
      return { kind: "stopped", stop };
    }
    return {
      kind: "stopped",
      stop: { status: `assignment-${disposition}`, details: submission, successful: false },
    };
  }

  async #completeObservedSubmissionProcess(): Promise<void> {
    const current = await this.#journal.load();
    if (current?.phase === "submitting" && current.submission.process !== undefined) {
      await this.#journal.clearSubmissionProcess();
    }
  }

  async #finishAdvancement(): Promise<boolean> {
    let record = await this.#journal.load();
    if (record?.phase !== "advancing") {
      throw new Error("Advancement finalization requires a durable advancement intent");
    }
    while (record.advancement.pending.length > 0) {
      const publication = record.advancement.pending[0]!;
      const diagnosis = await this.#mdlm.doctor();
      if (!diagnosis.ok) throw new Error(`mdlm doctor failed: ${JSON.stringify(diagnosis)}`);
      const allowedPending = record.advancement.pending.slice(1).map((item) => item.executionId);
      const commit = await this.#git.commit(
        publication,
        record.advancement.baseCommit,
        allowedPending,
      );
      this.#io.progress(`Committed ${commit}: ${publication.scenario}`);
      await this.#journal.completeAdvancementExecution(
        publication.executionId,
        commit,
        await this.#git.repositoryFingerprint(),
      );
      const next = await this.#journal.load();
      if (next?.phase === "reevaluating") return true;
      if (next?.phase !== "advancing") {
        throw new Error("Run journal lost advancement evidence during commit finalization");
      }
      record = next;
    }
    await this.#journal.clear();
    return false;
  }

  async #finishPublication(): Promise<void> {
    let record = await this.#journal.load();
    if (
      record === null || record.phase === "captured" ||
      record.phase === "submitting" || record.phase === "advancing" ||
      record.phase === "reevaluating"
    ) {
      throw new Error("Publication finalization requires journaled execution evidence");
    }
    if (record.phase === "published") {
      const diagnosis = await this.#mdlm.doctor();
      if (!diagnosis.ok) throw new Error(`mdlm doctor failed: ${JSON.stringify(diagnosis)}`);
      await this.#journal.recordDoctorPassed();
      record = await this.#journal.load();
      if (record === null || record.phase !== "doctor-passed") {
        throw new Error("Run journal did not retain doctor evidence");
      }
    }
    const commit = await this.#git.commit(record.publication, record.submission.baseCommit);
    this.#io.progress(`Committed ${commit}: ${record.assignment.scenario}`);
    await this.#journal.clear();
  }

  #ensureRunning(): void {
    if (this.#signal?.aborted) throw new Error("mdlm-pi run interrupted");
  }

  #report(stop: RunStop): RunStop {
    this.#io.stopped(stop.status, stop.details);
    return stop;
  }
}

function statusPackage(status: MdlmStatus, boundary: string): JsonObject {
  const packageIdentity = asObject(status.package, `${boundary}.package`);
  const reference = asString(packageIdentity.reference, `${boundary}.package.reference`);
  if (reference.length === 0) {
    throw new Error(`Expected ${boundary}.package.reference to be nonempty`);
  }
  const digest = asString(packageIdentity.digest, `${boundary}.package.digest`);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`Expected ${boundary}.package.digest to be an exact sha256 identity`);
  }
  const language = asString(packageIdentity.language, `${boundary}.package.language`);
  if (language.length === 0) {
    throw new Error(`Expected ${boundary}.package.language to be nonempty`);
  }
  return packageIdentity;
}

function assertReevaluationBoundary(
  expected: {
    package: JsonObject;
    repository: { head: string; trackedState: string };
  },
  actual: {
    package: JsonObject;
    repository: { head: string; trackedState: string };
  },
): void {
  if (!isDeepStrictEqual(actual.package, expected.package)) {
    throw new Error("selected Process Package changed during reevaluation recovery");
  }
  if (!isDeepStrictEqual(actual.repository, expected.repository)) {
    throw new Error("repository fingerprint changed during reevaluation recovery");
  }
}

function attendedGroup(outcome: JsonObject): {
  package: JsonObject;
  checkpoint: string;
  consolidationGroup: string | null;
  authority: string;
  items: string[];
} | null {
  if (outcome.checkpointConversation === undefined) return null;
  const conversation = asObject(
    outcome.checkpointConversation,
    "attention-required.checkpointConversation",
  );
  const checkpoint = asString(
    conversation.checkpoint,
    "attention-required.checkpointConversation.checkpoint",
  );
  const consolidationGroup = conversation.consolidationGroup;
  if (consolidationGroup !== null && typeof consolidationGroup !== "string") {
    throw new Error(
      "Expected attention-required.checkpointConversation.consolidationGroup to be a string or null",
    );
  }
  if (!Array.isArray(conversation.items) || conversation.items.length === 0) {
    throw new Error("Attention checkpoint conversation must contain exact items");
  }
  const items = conversation.items.map((item, index) =>
    asString(
      asObject(item, `attention-required.checkpointConversation.items[${index}]`).instance,
      `attention-required.checkpointConversation.items[${index}].instance`,
    )
  );
  const authorityRequirement = asObject(
    outcome.authorityRequirement,
    "attention-required.authorityRequirement",
  );
  if (authorityRequirement.mode !== "attended") {
    throw new Error("Attention Required must name an attended Authority Requirement");
  }
  return {
    package: asObject(outcome.package, "attention-required.package"),
    checkpoint,
    consolidationGroup,
    authority: asString(
      authorityRequirement.authority,
      "attention-required.authorityRequirement.authority",
    ),
    items,
  };
}

function attendedAuthorityContext(outcome: JsonObject, conclusion: JsonValue): JsonObject {
  const authorityRequirement = asObject(
    outcome.authorityRequirement,
    "attention-required.authorityRequirement",
  );
  if (authorityRequirement.mode !== "attended") {
    throw new Error("Attention Required must name an attended Authority Requirement");
  }
  const authority = asString(
    authorityRequirement.authority,
    "attention-required.authorityRequirement.authority",
  );
  return {
    authorityRequirement,
    authoritySupply: {
      authority,
      source: "attended-authority-holder",
    },
    conclusion,
    ...(outcome.attentionContext === undefined
      ? {}
      : { attentionContext: outcome.attentionContext }),
    ...(outcome.checkpointConversation === undefined
      ? {}
      : { checkpointConversation: outcome.checkpointConversation }),
  };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

function stopForOutcome(outcome: JsonObject): RunStop {
  const status = asString(outcome.outcome, "outcome.outcome");
  return {
    status,
    details: outcome,
    successful: status === "profile-boundary-reached" || status === "lifecycle-complete",
  };
}

function recentTransactionId(value: JsonValue): string | null {
  const transaction = asObject(value, "recentTransaction");
  return transaction.available === true
    ? asString(transaction.id, "recentTransaction.id")
    : null;
}

function recoveryAssignment(packet: AssignmentPacket): RecoveryAssignment {
  return {
    id: packet.assignment.id,
    scenario: packet.scenario.reference,
    package: packet.package,
    repository: packet.repository,
  };
}

function assertRecoveryBoundary(
  expected: RecoveryAssignment,
  actual: {
    package: JsonObject;
    repository: JsonObject | { head: string; trackedState: string };
  },
): void {
  if (!isDeepStrictEqual(actual.package, expected.package)) {
    throw new Error(`Assignment '${expected.id}' selected Process Package changed during recovery`);
  }
  if (!isDeepStrictEqual(actual.repository, expected.repository)) {
    throw new Error(`Assignment '${expected.id}' repository fingerprint changed during recovery`);
  }
}

function malformedDigests(state: Extract<AssignmentState, { selected: true }>): string[] {
  return state.malformedResponses.map((item, index) =>
    asString(item.digest, `malformedResponses[${index}].digest`)
  );
}

function publicationFromCommand(
  command: JsonObject,
  expected: { assignmentId: string; scenario: string; responseDigest: string },
): UncapturedPublicationEvidence {
  return publicationFromExecution(asObject(command.execution, "submission.execution"), expected);
}

function publicationFromExecution(
  execution: JsonObject,
  expected: { assignmentId: string; scenario: string; responseDigest: string },
): UncapturedPublicationEvidence {
  const executionId = asString(execution.id, "execution.id");
  if (execution.status !== "completed") throw new Error(`Scenario execution '${executionId}' is not completed`);
  const response = asObject(execution.response, "execution.response");
  if (response.assignment !== expected.assignmentId || response.digest !== expected.responseDigest) {
    throw new Error(`Scenario execution '${executionId}' does not match the journaled Assignment response`);
  }
  const definition = asObject(execution.definition, "execution.definition");
  if (definition.scenario !== expected.scenario) {
    throw new Error(`Scenario execution '${executionId}' has unexpected Scenario identity`);
  }
  if (!Array.isArray(execution.outputs)) throw new Error("Scenario execution outputs are missing");
  const outputPaths = execution.outputs.map((item, index) => {
    const output = asObject(item, `execution.outputs[${index}]`);
    const datum = asObject(output.lifecycleDatum, `execution.outputs[${index}].lifecycleDatum`);
    return asString(datum.path, `execution.outputs[${index}].lifecycleDatum.path`);
  });
  return {
    executionId,
    scenario: expected.scenario,
    responseDigest: expected.responseDigest as `sha256:${string}`,
    outputPaths: [
      `.lifecycle/data/.transactions/${executionId}/execution.json`,
      ...outputPaths,
    ],
  };
}

function publicationFromMaterialization(execution: JsonObject): UncapturedPublicationEvidence {
  const executionId = asString(execution.id, "execution.id");
  if (execution.status !== "completed") {
    throw new Error(`Scenario execution '${executionId}' is not completed`);
  }
  const responseDigest = asString(
    asObject(execution.response, "execution.response").digest,
    "execution.response.digest",
  );
  if (!/^sha256:[0-9a-f]{64}$/.test(responseDigest)) {
    throw new Error(`Scenario execution '${executionId}' has an invalid response digest`);
  }
  const scenario = asString(
    asObject(execution.definition, "execution.definition").scenario,
    "execution.definition.scenario",
  );
  if (!Array.isArray(execution.outputs)) throw new Error("Scenario execution outputs are missing");
  const outputPaths = execution.outputs.map((item, index) => {
    const output = asObject(item, `execution.outputs[${index}]`);
    const datum = asObject(output.lifecycleDatum, `execution.outputs[${index}].lifecycleDatum`);
    return asString(datum.path, `execution.outputs[${index}].lifecycleDatum.path`);
  });
  return {
    executionId,
    scenario,
    responseDigest: responseDigest as `sha256:${string}`,
    outputPaths: [
      `.lifecycle/data/.transactions/${executionId}/execution.json`,
      ...outputPaths,
    ],
  };
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

async function abandonedStopFromCompletedProcess(
  record: Extract<RunJournalRecord, { phase: "submitting" }>,
): Promise<RunStop | null> {
  const completed = record.submission.completedProcesses;
  if (completed.length === 0 || completed.length > 2) {
    throw new Error(
      `Cannot reconcile Assignment '${record.assignment.id}': completed submission results are ambiguous`,
    );
  }
  if (completed.length === 2) {
    if (record.submission.previousMalformedResponseDigests.length === 0) {
      throw new Error(
        `Cannot reconcile Assignment '${record.assignment.id}': completed submission results are ambiguous`,
      );
    }
    const correction = await completedSubmission(record.assignment.id, completed[0]!);
    if (!isCompletedCorrection(correction, record.assignment.id)) {
      throw new Error(
        `Cannot reconcile Assignment '${record.assignment.id}': completed submission results are ambiguous`,
      );
    }
  }
  const submission = await completedSubmission(record.assignment.id, completed.at(-1)!);
  if (isCompletedCorrection(submission, record.assignment.id)) return null;
  const response = parseResponseSource(record.submission.source);
  return abandonedStop(record.assignment.id, response, submission);
}

function isCompletedCorrection(submission: JsonObject, assignmentId: string): boolean {
  const assignment = submission.assignment;
  const orchestration = submission.orchestration;
  const malformed = submission.malformedResponse;
  return (
    submission.contract === "mdlm-assignment-disposition@1" &&
    submission.command === "scenario.submit" &&
    submission.ok === false &&
    typeof assignment === "object" && assignment !== null && !Array.isArray(assignment) &&
    assignment.id === assignmentId &&
    submission.disposition === "correction-required" &&
    typeof orchestration === "object" && orchestration !== null &&
    !Array.isArray(orchestration) &&
    orchestration.action === "correct-response" &&
    orchestration.automaticReplacement === false &&
    typeof malformed === "object" && malformed !== null && !Array.isArray(malformed) &&
    malformed.attempt === 1 &&
    malformed.correctionsRemaining === 1 &&
    Array.isArray(malformed.diagnostics)
  );
}

async function completedSubmission(
  assignmentId: string,
  process: { stdoutPath: string },
): Promise<JsonObject> {
  const information = await stat(process.stdoutPath);
  if (!information.isFile() || information.size > 10 * 1024 * 1024) {
    throw new Error(
      `Cannot reconcile Assignment '${assignmentId}': completed submission stdout is invalid`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(process.stdoutPath, "utf8"));
  } catch {
    throw new Error(
      `Cannot reconcile Assignment '${assignmentId}': completed submission stdout is not one JSON document`,
    );
  }
  return asObject(parsed as JsonValue, "completed submission stdout");
}

function abandonedStop(
  assignmentId: string,
  response: JsonObject,
  submission: JsonObject,
): RunStop {
  if (
    response.contract !== "mdlm-assignment-response@1" ||
    response.assignment !== assignmentId ||
    response.kind !== "unable" ||
    typeof response.unable !== "object" || response.unable === null ||
    Array.isArray(response.unable)
  ) {
    throw new Error(
      `Cannot reconcile Assignment '${assignmentId}': journaled response is not its exact typed inability`,
    );
  }
  const childAssignment = asObject(submission.assignment, "submission.assignment");
  const orchestration = asObject(submission.orchestration, "submission.orchestration");
  if (
    submission.contract !== "mdlm-assignment-disposition@1" ||
    submission.command !== "scenario.submit" ||
    submission.ok !== true ||
    childAssignment.id !== assignmentId ||
    submission.disposition !== "abandoned" ||
    orchestration.action !== "stop" ||
    orchestration.automaticReplacement !== false ||
    !isDeepStrictEqual(submission.unable, response.unable)
  ) {
    throw new Error(
      `Cannot reconcile Assignment '${assignmentId}': submission result is not its terminal abandoned disposition`,
    );
  }
  return {
    status: "assignment-abandoned",
    details: submission,
    successful: false,
  };
}

function parseResponseSource(source: string): JsonObject {
  const value: unknown = JSON.parse(source);
  return asObject(value as JsonValue, "journal.submission.source");
}

function isPrefix(prefix: string[], value: string[]): boolean {
  return prefix.length <= value.length && prefix.every((item, index) => value[index] === item);
}

function asObject(value: JsonValue | undefined, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${path} to be an object`);
  }
  return value;
}

function asString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string") throw new Error(`Expected ${path} to be a string`);
  return value;
}
