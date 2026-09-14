import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { JsonObject, JsonValue } from "./mdlm-client.js";
import { MdlmClient } from "./mdlm-client.js";
import type { OperatorIO } from "./operator-io.js";
import { PiWorkRunner } from "./pi-work-runner.js";
import { RunJournal, type RunJournalRecord } from "./run-journal.js";

type MdlmPort = Pick<MdlmClient, "identity" | "discover" | "guidance" | "prepareSubmission" | "submit" | "settlement" | "execute" | "executionSettlement">;
export interface RunControllerOptions {
  mdlm: MdlmPort;
  worker: Pick<PiWorkRunner, "run" | "close">;
  io: OperatorIO;
  journal: Pick<RunJournal, "load" | "capture" | "beginSubmission" | "clear">;
  signal?: AbortSignal;
}
export interface RunStop { status: string; details: JsonObject; successful: boolean }

/** The agent chooses work; this controller transports one direct operation. */
export class RunController {
  constructor(private readonly options: RunControllerOptions) {}

  async run(): Promise<RunStop> {
    const { mdlm, worker, io, journal } = this.options;
    this.ensureRunning();
    const pending = await journal.load();
    if (pending?.phase === "captured") await journal.clear();
    else if (pending !== null) {
      if (!isDeepStrictEqual(pending.transport, mdlm.identity())) throw new Error("Pending operation transport identity changed");
      const result = pending.kind === "execution"
        ? await mdlm.executionSettlement(pending.operation)
        : await mdlm.settlement(pending.operation);
      return this.finish(result, pending, true);
    }

    const available = await mdlm.discover();
    if (available.contract !== "mdlm-expectations@2") throw new Error("Unsupported discovery contract");
    if (available.outcome !== "work-available") {
      return this.report(String(available.outcome), { discovery: available },
        available.outcome === "profile-boundary-reached" || available.outcome === "lifecycle-complete");
    }
    const items = array(available.items, "available items").map(value => object(value, "work item"));
    const eligible = items.filter(item => !Array.isArray(item.blocked) || item.blocked.length === 0);
    if (eligible.length === 0) return this.report("blocked", { discovery: available }, false);
    const selectionId = randomUUID();
    let selection: JsonObject;
    try {
      selection = await worker.run({
        id: selectionId,
        context: { instruction: "Choose the work most useful to the stakeholder goal. Priority is a suggestion. Return its action and exact subject if present.", discovery: available },
        responseSchema: { type: "object", oneOf: eligible.map(item => ({
          type: "object", additionalProperties: false,
          properties: { action: { const: string(item.action, "action") }, ...(item.subject ? { subject: { const: item.subject } } : {}) },
          required: item.subject ? ["action", "subject"] : ["action"],
        })) },
      });
    } finally { await worker.close(selectionId); }
    const chosen = eligible.find(item => item.action === selection.action && item.subject === selection.subject);
    if (!chosen) throw new Error("Agent selected work outside the available context");
    let guidance = await mdlm.guidance(string(chosen.action, "action"), optionalString(chosen.subject));
    this.assertGuidance(guidance, chosen);
    const authority = guidance.authority === undefined ? undefined : object(guidance.authority, "authority");
    if (authority?.kind === "independent-review") {
      return this.report("independent-review-required", { guidance }, false);
    }
    let attendedContext: JsonValue | undefined;
    let authorityName: string | undefined;
    if (authority !== undefined) {
      if (authority.kind !== "stakeholder") throw new Error("Unknown required authority");
      authorityName = string(authority.name, "authority name");
      attendedContext = (await io.attention(guidance)).conclusion;
    }
    let execution: JsonObject | undefined;
    if (typeof guidance.executionCommand === "string" && !hasReceipt(guidance)) {
      const operation = randomUUID();
      const boundary = { package: object(guidance.package, "package"), snapshot: string(guidance.snapshot, "snapshot"), transport: mdlm.identity() };
      await journal.capture(operation, `sha256:${"0".repeat(64)}`, boundary, "execution");
      await journal.beginSubmission();
      const executed = await mdlm.execute(string(guidance.executionSubject ?? guidance.subject, "execution subject"), operation);
      execution = executed;
      const captured = (await journal.load())!;
      if (executed.contract !== "mdlm-execution-result@1" || executed.operation !== operation) throw new Error("Execution result differs from pending operation");
      if (executionState(executed) !== "completed") return this.finish(executed, captured, false);
      await journal.clear();
      guidance = await mdlm.guidance(string(chosen.action, "action"), optionalString(chosen.subject));
      this.assertGuidance(guidance, chosen);
    }
    this.ensureRunning();
    const operation = randomUUID();
    let authored: JsonObject;
    try {
      authored = await worker.run({
        id: operation,
        context: { instruction: "Follow the package prompt. Return candidates and optional receipt evidence only. The controller adds exact action, operation, package, snapshot, inputs and attended authority.", guidance, ...(execution === undefined ? {} : { execution }) },
        responseSchema: {
          type: "object", additionalProperties: false, required: ["candidates"],
          properties: {
            candidates: { type: "array", items: { type: "object" } },
            evidence: { type: "object", additionalProperties: false, properties: { receipt: { type: "string" } } },
          },
        },
      }, attendedContext === undefined ? {} : { attendedContext });
    } finally { await worker.close(operation); }
    const evidence = authored.evidence === undefined ? {} : object(authored.evidence, "evidence");
    if (Object.keys(evidence).some(key => key !== "receipt")) throw new Error("Agent supplied unsupported evidence or authority");
    const proposal: JsonObject = {
      operation, action: guidance.action!, package: guidance.package!, snapshot: guidance.snapshot!,
      ...(guidance.subject === undefined ? {} : { subject: guidance.subject }),
      inputs: guidance.inputs!, candidates: array(authored.candidates, "candidates"),
      evidence: { ...evidence, ...(authorityName ? { authority: [authorityName] } : {}) },
    };
    const prepared = mdlm.prepareSubmission(proposal);
    await journal.capture(operation, prepared.digest, { package: object(guidance.package, "package"), snapshot: string(guidance.snapshot, "snapshot"), transport: mdlm.identity() });
    await journal.beginSubmission();
    const result = await mdlm.submit(prepared, authorityName);
    return this.finish(result, (await journal.load())!, false);
  }

  private async finish(result: JsonObject, pending: RunJournalRecord, reconciled: boolean): Promise<RunStop> {
    if (result.ok === false) {
      // Resolve nonpublication through settlement before permitting another operation.
      return this.report("rejected", { result, reconciled }, false);
    }
    const contract = pending.kind === "execution" ? "mdlm-execution-result@1" : "mdlm-proposal-result@2";
    if (result.contract !== contract || result.operation !== pending.operation) throw new Error("Result differs from pending operation");
    if (pending.kind === "proposal" && result.outcome === "accepted" && result.proposalDigest !== pending.proposalDigest) {
      throw new Error("Result differs from pending proposal bytes");
    }
    if (pending.kind === "execution") {
      if (reconciled && executionState(result) === "not-started") {
        await this.options.journal.clear();
        return this.report("not-started", { result, reconciled }, false);
      }
      if (executionState(result) !== "completed") return this.report("settlement-required", { result, reconciled }, false);
    } else if (result.outcome !== "accepted" && result.outcome !== "not-published") {
      throw new Error("Unsupported proposal result");
    }
    await this.options.journal.clear();
    return this.report(pending.kind === "execution" ? "executed" : String(result.outcome), { result, reconciled },
      pending.kind === "execution" || result.outcome === "accepted");
  }

  private assertGuidance(guidance: JsonObject, chosen: JsonObject): void {
    if (guidance.contract !== "mdlm-direct-guidance@1" || guidance.action !== chosen.action || guidance.subject !== chosen.subject) {
      throw new Error("Guidance differs from selected work");
    }
    object(guidance.package, "package"); string(guidance.snapshot, "snapshot"); object(guidance.inputs, "inputs");
  }
  private ensureRunning(): void { if (this.options.signal?.aborted) throw new Error("MDLM Pi run was interrupted"); }
  private report(status: string, details: JsonObject, successful: boolean): RunStop {
    this.options.io.stopped(status, details);
    return { status, details, successful };
  }
}
function hasReceipt(guidance: JsonObject): boolean {
  return Array.isArray(guidance.evidence) && guidance.evidence.length > 0;
}
function object(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function string(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a nonempty string`);
  return value;
}
function optionalString(value: JsonValue | undefined): string | undefined { return value === undefined ? undefined : string(value, "subject"); }
function array(value: JsonValue | undefined, label: string): JsonValue[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function executionState(result: JsonObject): JsonValue | undefined {
  const value = object(result.value, "execution result");
  return value.receipt === undefined ? value.state : object(value.receipt, "receipt").state;
}
