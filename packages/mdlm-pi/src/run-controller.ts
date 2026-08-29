import type {
  AssignmentPacket,
  AssignmentSubmission,
  JsonObject,
  JsonValue,
  MdlmOperatorOutcome,
  PreparedAssignmentSubmission,
} from "./mdlm-client.js";
import { MdlmClient } from "./mdlm-client.js";
import type { OperatorIO } from "./operator-io.js";
import type { AssignmentCorrection, PiAssignmentRunOptions } from "./pi-assignment-runner.js";
import { PiAssignmentRunner } from "./pi-assignment-runner.js";
import { RunJournal } from "./run-journal.js";

type MdlmPort = Pick<MdlmClient,
  "next" | "prepareSubmission" | "submit" | "settlement"
>;
type AssignmentPort = Pick<PiAssignmentRunner, "run"> & {
  close?: (assignmentId: string) => Promise<void>;
};
type JournalPort = Pick<RunJournal,
  "load" | "capture" | "beginSubmission" | "requireSettlement" | "clear"
>;

export interface RunControllerOptions {
  mdlm: MdlmPort;
  assignments: AssignmentPort;
  io: OperatorIO;
  journal: JournalPort;
  signal?: AbortSignal;
}

export interface RunStop {
  status: string;
  details: JsonObject;
  successful: boolean;
}

/** One claim, one complete response at a time, and no replay after submission starts. */
export class RunController {
  readonly #mdlm: MdlmPort;
  readonly #assignments: AssignmentPort;
  readonly #io: OperatorIO;
  readonly #journal: JournalPort;
  readonly #signal: AbortSignal | undefined;

  constructor(options: RunControllerOptions) {
    this.#mdlm = options.mdlm;
    this.#assignments = options.assignments;
    this.#io = options.io;
    this.#journal = options.journal;
    this.#signal = options.signal;
  }

  async run(): Promise<RunStop> {
    this.#ensureRunning();
    const pending = await this.#journal.load();
    if (pending?.phase === "captured") {
      // No publication process started. Reclaiming the same Assignment is safe.
      await this.#journal.clear();
    } else if (pending !== null) {
      const identity = pending.settlementIdentity ?? pending.assignmentId;
      return this.#report(await this.#settle(identity));
    }

    const outcome = await this.#mdlm.next();
    if (outcome.outcome !== "assignment" && outcome.outcome !== "attention-required") {
      return this.#report(stopForOutcome(outcome));
    }

    const packet = outcome.assignment.packet;
    this.#io.progress(`Assignment ${outcome.assignment.id}: ${packet.scenario.reference}`);
    let options: PiAssignmentRunOptions = {};
    let authority: string | undefined;
    if (outcome.outcome === "attention-required") {
      authority = attendedAuthority(outcome);
      const attended = await this.#io.attention(outcome);
      options = { attendedContext: { conclusion: attended.conclusion } };
    }
    return this.#report(await this.#perform(packet, options, authority));
  }

  async #perform(
    packet: AssignmentPacket,
    initialOptions: PiAssignmentRunOptions,
    authority: string | undefined,
  ): Promise<RunStop> {
    let options = initialOptions;
    while (true) {
      this.#ensureRunning();
      let response: JsonObject;
      try {
        response = await this.#assignments.run(packet, options);
      } catch (error) {
        await this.#assignments.close?.(packet.assignment.id);
        throw error;
      }
      const prepared = this.#mdlm.prepareSubmission(response);
      await this.#journal.capture(packet.assignment.id, prepared.digest);
      await this.#journal.beginSubmission();
      const submission = await this.#mdlm.submit(prepared, authority);
      assertSubmissionBinding(packet, prepared, submission);

      if (submission.outcome === "accepted") {
        await this.#journal.clear();
        await this.#assignments.close?.(packet.assignment.id);
        return { status: "accepted", details: { submission }, successful: true };
      }
      if (submission.outcome === "settlement-required") {
        const settlement = object(submission.settlement, "submission.settlement");
        const identity = string(settlement.execution, "submission.settlement.execution");
        await this.#journal.requireSettlement(identity);
        await this.#assignments.close?.(packet.assignment.id);
        return settlementStop(submission);
      }

      await this.#journal.clear();
      const correction: AssignmentCorrection = {
        previousResponse: response,
        diagnostics: submission.diagnostics ?? [],
      };
      options = {
        ...(initialOptions.attendedContext === undefined
          ? {}
          : { attendedContext: initialOptions.attendedContext }),
        correction,
      };
    }
  }

  async #settle(identity: string): Promise<RunStop> {
    const submission = await this.#mdlm.settlement(identity);
    if (submission.outcome === "settlement-required") {
      const current = await this.#journal.load();
      if (current?.phase === "submitting") {
        const settlement = object(submission.settlement, "submission.settlement");
        await this.#journal.requireSettlement(string(
          settlement.execution,
          "submission.settlement.execution",
        ));
      }
      return settlementStop(submission);
    }
    await this.#journal.clear();
    return submission.outcome === "accepted"
      ? { status: "accepted", details: { submission, reconciled: true }, successful: true }
      : { status: "rejected", details: { submission, reconciled: true }, successful: false };
  }

  #report(stop: RunStop): RunStop {
    this.#io.stopped(stop.status, stop.details);
    return stop;
  }

  #ensureRunning(): void {
    if (this.#signal?.aborted) throw new Error("MDLM Pi run was interrupted");
  }
}

function stopForOutcome(outcome: MdlmOperatorOutcome): RunStop {
  const successful = outcome.outcome === "profile-boundary-reached" ||
    outcome.outcome === "lifecycle-complete";
  return { status: outcome.outcome, details: { outcome }, successful };
}

function attendedAuthority(outcome: JsonObject): string {
  const requirement = object(outcome.authorityRequirement, "attention.authorityRequirement");
  if (requirement.mode !== "attended") {
    throw new Error("Attention Required lacks an attended authority requirement");
  }
  return string(requirement.authority, "attention.authorityRequirement.authority");
}

function assertSubmissionBinding(
  packet: AssignmentPacket,
  prepared: PreparedAssignmentSubmission,
  submission: AssignmentSubmission,
): void {
  if (submission.assignment.id !== packet.assignment.id) {
    throw new Error("Submission outcome names a different Assignment");
  }
  if (submission.responseDigest !== prepared.digest) {
    throw new Error("Submission outcome names different response bytes");
  }
}

function settlementStop(submission: AssignmentSubmission): RunStop {
  return {
    status: "settlement-required",
    details: { submission },
    successful: false,
  };
}

function object(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function string(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}
