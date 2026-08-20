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
import type { PublicationEvidence, RunJournalRecord } from "./run-journal.js";
import { RunJournal } from "./run-journal.js";

type MdlmPort = Pick<MdlmClient,
  "status" | "next" | "assignment" | "prepare" | "prepareSubmission" |
  "submit" | "execution" | "doctor"
>;
type AssignmentPort = Pick<PiAssignmentRunner, "run"> & {
  close?: (assignmentId: string) => Promise<void>;
};
type GitPort = Pick<GitPublisher,
  "assertClean" | "head" | "commit" | "publicationCommitState" |
  "pendingTransactionIds"
>;
type JournalPort = Pick<RunJournal,
  "load" | "beginAdvancement" | "recordAdvancementExecutions" |
  "completeAdvancementExecution" | "beginSubmission" | "replaceSubmission" |
  "recordSubmissionProcess" | "clearSubmissionProcess" | "recordPublication" |
  "recordDoctorPassed" | "clear" | "loadAttendedConclusions" |
  "recordAttendedConclusions" | "clearAttendedConclusions"
>;

export interface RunControllerOptions {
  mdlm: MdlmPort;
  assignments: AssignmentPort;
  io: OperatorIO;
  git: GitPort;
  journal: JournalPort;
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

  constructor(options: RunControllerOptions) {
    this.#mdlm = options.mdlm;
    this.#assignments = options.assignments;
    this.#io = options.io;
    this.#git = options.git;
    this.#journal = options.journal;
  }

  async run(): Promise<RunStop> {
    const recovered = await this.#recover();
    if (recovered?.kind === "stopped") return this.#report(recovered.stop);
    if (recovered?.kind === "correction") {
      const packet = await this.#mdlm.prepare(recovered.assignmentId);
      const corrected = await this.#completeAssignment(
        packet,
        {
          correction: {
            previousResponse: recovered.previousResponse,
            diagnostics: recovered.diagnostics,
          },
        },
        recovered.replacementDigest,
      );
      if (corrected) return this.#report(corrected);
    }

    await this.#git.assertClean();
    while (true) {
      const status = await this.#mdlm.status();
      const outcome = status.currentOutcome;
      if (outcome.outcome !== "assignment" && outcome.outcome !== "attention-required") {
        await this.#journal.clearAttendedConclusions();
        return this.#report(stopForOutcome(outcome));
      }

      const allocation = asObject(outcome.assignment, "status.currentOutcome.assignment");
      let allocated: JsonObject;
      if (allocation.allocation === "active") {
        allocated = outcome;
      } else {
        const advancement = await this.#advance(status);
        if (advancement.materializedExecutions.length > 0) {
          // Committing automatic materialization changes the repository fingerprint and
          // retires the Assignment lease returned by the pre-commit `next`.
          continue;
        }
        allocated = advancement;
        if (allocated.outcome !== "assignment" && allocated.outcome !== "attention-required") {
          await this.#journal.clearAttendedConclusions();
          return this.#report(stopForOutcome(allocated));
        }
      }
      if (allocated.outcome !== "attention-required") {
        await this.#journal.clearAttendedConclusions();
      }
      const assignment = asObject(allocated.assignment, "outcome.assignment");
      const assignmentId = asString(assignment.id, "outcome.assignment.id");
      const packet = await this.#mdlm.prepare(assignmentId);
      this.#io.progress(`Assignment ${assignmentId}: ${packet.scenario.reference}`);

      let attendedContext: JsonValue | undefined;
      if (allocated.outcome === "attention-required") {
        attendedContext = await this.#attendedContext(allocated);
      }
      const stopped = await this.#completeAssignment(
        packet,
        attendedContext === undefined ? {} : { attendedContext },
      );
      if (stopped) {
        await this.#journal.clearAttendedConclusions();
        return this.#report(stopped);
      }
      await this.#git.assertClean();
    }
  }

  async #attendedContext(outcome: JsonObject): Promise<JsonObject> {
    const group = attendedGroup(outcome);
    if (group === null) {
      return attendedAuthorityContext(
        outcome,
        (await this.#io.attention(outcome)).conclusion,
      );
    }

    const persisted = await this.#journal.loadAttendedConclusions();
    if (
      persisted !== null && persisted.checkpoint === group.checkpoint &&
      persisted.consolidationGroup === group.consolidationGroup &&
      persisted.authority === group.authority &&
      group.items.every((item) => persisted.items.includes(item))
    ) {
      return attendedAuthorityContext(outcome, persisted.conclusion);
    }
    if (persisted !== null) await this.#journal.clearAttendedConclusions();
    const supplied = await this.#io.attention(outcome);
    const recorded = await this.#journal.recordAttendedConclusions({
      ...group,
      conclusion: supplied.conclusion,
    });
    return attendedAuthorityContext(outcome, recorded.conclusion);
  }

  async #advance(status: MdlmStatus): Promise<MdlmNext> {
    await this.#journal.beginAdvancement({
      baseCommit: await this.#git.head(),
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
      declared.map(async ({ id }) =>
        publicationFromMaterialization((await this.#mdlm.execution(id)).execution)
      ),
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
      const submitted = await this.#submit(packet, response, replacementDigest);
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
        correction: {
          previousResponse: submitted.previousResponse,
          diagnostics: submitted.diagnostics,
        },
      };
      replacementDigest = submitted.replacementDigest;
    }
  }

  async #submit(
    packet: AssignmentPacket,
    response: JsonObject,
    replacementDigest?: `sha256:${string}`,
  ): Promise<SubmissionResult> {
    const assignmentState = await this.#mdlm.assignment(packet.assignment.id);
    if (!assignmentState.selected || assignmentState.disposition !== "active") {
      throw new Error(`Assignment '${packet.assignment.id}' is not an active durable lease`);
    }
    const status = await this.#mdlm.status();
    const prepared = this.#mdlm.prepareSubmission(response);
    const intent = {
      assignmentId: packet.assignment.id,
      scenario: packet.scenario.reference,
      previousTransactionId: recentTransactionId(status.recentTransaction),
      baseCommit: await this.#git.head(),
      previousMalformedResponseDigests: malformedDigests(assignmentState),
      response: prepared,
    };
    if (replacementDigest === undefined) {
      await this.#journal.beginSubmission(intent);
    } else {
      await this.#journal.replaceSubmission(replacementDigest, intent);
    }

    const submission = await this.#mdlm.submit(prepared, {
      started: (process) => this.#journal.recordSubmissionProcess(process),
    });
    return this.#consumeSubmission(packet, response, prepared, submission);
  }

  async #consumeSubmission(
    packet: AssignmentPacket,
    response: JsonObject,
    prepared: PreparedAssignmentSubmission,
    submission: JsonObject,
  ): Promise<SubmissionResult> {
    if (submission.contract === "mdlm-scenario-execution@4") {
      const publication = publicationFromCommand(submission, {
        assignmentId: packet.assignment.id,
        scenario: packet.scenario.reference,
        responseDigest: prepared.digest,
      });
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
    await this.#journal.clear();
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
    | null
  > {
    let record = await this.#journal.load();
    if (record === null) return null;
    if (record.phase === "advancing") {
      this.#io.progress("Recovering interrupted mdlm next materialization");
      if (record.advancement.pending.length === 0) {
        const publications = await Promise.all(
          (await this.#git.pendingTransactionIds()).map(async (id) =>
            publicationFromMaterialization((await this.#mdlm.execution(id)).execution)
          ),
        );
        await this.#journal.recordAdvancementExecutions(publications);
      }
      await this.#finishAdvancement();
      return null;
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
    const recentId = recentTransactionId(status.recentTransaction);
    if (recentId !== null && recentId !== record.submission.previousTransactionId) {
      const inspected = await this.#mdlm.execution(recentId);
      const publication = publicationFromExecution(inspected.execution, {
        assignmentId: record.assignment.id,
        scenario: record.assignment.scenario,
        responseDigest: record.submission.digest,
      });
      await this.#journal.recordPublication(publication);
      return null;
    }

    const state = await this.#mdlm.assignment(record.assignment.id);
    const previousResponse = parseResponseSource(record.submission.source);
    if (!state.selected) {
      throw new Error(
        `Cannot reconcile Assignment '${record.assignment.id}': no publication or durable lease is observable`,
      );
    }
    if (state.disposition === "abandoned") {
      const persistedResponse = state.response;
      if (persistedResponse?.digest !== record.submission.digest) {
        throw new Error(`Abandoned Assignment '${record.assignment.id}' has an unexpected response digest`);
      }
      await this.#journal.clear();
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
      await this.#journal.clear();
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
    if (submission.contract === "mdlm-scenario-execution@4") {
      const publication = publicationFromCommand(submission, {
        assignmentId: record.assignment.id,
        scenario: record.assignment.scenario,
        responseDigest: record.submission.digest,
      });
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
    await this.#journal.clear();
    return {
      kind: "stopped",
      stop: { status: `assignment-${disposition}`, details: submission, successful: false },
    };
  }

  async #finishAdvancement(): Promise<void> {
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
      await this.#journal.completeAdvancementExecution(publication.executionId, commit);
      const next = await this.#journal.load();
      if (next?.phase !== "advancing") {
        throw new Error("Run journal lost advancement evidence during commit finalization");
      }
      record = next;
    }
    await this.#journal.clear();
  }

  async #finishPublication(): Promise<void> {
    let record = await this.#journal.load();
    if (record === null || record.phase === "submitting" || record.phase === "advancing") {
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

  #report(stop: RunStop): RunStop {
    this.#io.stopped(stop.status, stop.details);
    return stop;
  }
}

function attendedGroup(outcome: JsonObject): {
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

function malformedDigests(state: Extract<AssignmentState, { selected: true }>): string[] {
  return state.malformedResponses.map((item, index) =>
    asString(item.digest, `malformedResponses[${index}].digest`)
  );
}

function publicationFromCommand(
  command: JsonObject,
  expected: { assignmentId: string; scenario: string; responseDigest: string },
): PublicationEvidence {
  return publicationFromExecution(asObject(command.execution, "submission.execution"), expected);
}

function publicationFromExecution(
  execution: JsonObject,
  expected: { assignmentId: string; scenario: string; responseDigest: string },
): PublicationEvidence {
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
    outputPaths,
  };
}

function publicationFromMaterialization(execution: JsonObject): PublicationEvidence {
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
    outputPaths,
  };
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
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
