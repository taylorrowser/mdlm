import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AssignmentPacket, JsonObject, JsonValue } from "./mdlm-client.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const systemPrompt = `You complete exactly one MDLM Assignment.
Use only the supplied Assignment Packet and attended context; do not infer repository or Process Package facts outside them.
Follow the packet prompt, assets, exact inputs, policies, participation, authority, prohibitions, output contracts, completion contract, and response schema.
An attended conclusion supplies only the packet's exact named authority; normalize it into the required output and never treat chat prose itself as Lifecycle Data.
Call complete_assignment exactly once as your final action.
Return typed inability instead of asking a user or fabricating missing facts.`;

export function assignmentCompletionParameters(packet: AssignmentPacket) {
  return Type.Unsafe(packet.responseSchema);
}

export function assignmentRetryPolicy(assignmentTimeoutMs: number, providerRetries: number) {
  return {
    enabled: true,
    maxRetries: providerRetries,
    provider: {
      maxRetries: providerRetries,
      timeoutMs: Math.min(assignmentTimeoutMs, 120_000),
      maxRetryDelayMs: 30_000,
    },
  };
}

export interface AssignmentCorrection {
  previousResponse: JsonObject;
  diagnostics: JsonValue;
}

export interface PiAssignmentRunOptions {
  correction?: AssignmentCorrection;
  attendedContext?: JsonValue;
}

export interface PiAssignmentSession {
  readonly isIdle: boolean;
  prompt(text: string, options?: { expandPromptTemplates?: boolean }): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  subscribe(listener: (event: unknown) => void): () => void;
}

export type PiAssignmentSessionFactory = (
  packet: AssignmentPacket,
  capture: (response: JsonObject) => void,
) => Promise<PiAssignmentSession>;

export interface PiAssignmentRunnerOptions {
  repository: string;
  assignmentTimeoutMs?: number;
  providerRetries?: number;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  onText?: (text: string) => void;
  sessionFactory?: PiAssignmentSessionFactory;
}

export class PiAssignmentRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiAssignmentRunnerError";
  }
}

interface ActiveSession {
  session: PiAssignmentSession;
  unsubscribe: () => void;
  acceptingResponse: boolean;
  response?: JsonObject;
  completionError?: PiAssignmentRunnerError;
}

/** One isolated probabilistic worker behind one structured Assignment seam. */
export class PiAssignmentRunner {
  readonly #repository: string;
  readonly #assignmentTimeoutMs: number;
  readonly #providerRetries: number;
  readonly #provider: string | undefined;
  readonly #model: string | undefined;
  readonly #thinkingLevel: ThinkingLevel | undefined;
  readonly #onText: ((text: string) => void) | undefined;
  readonly #sessionFactory: PiAssignmentSessionFactory | undefined;
  readonly #sessions = new Map<string, ActiveSession>();

  constructor(options: PiAssignmentRunnerOptions) {
    this.#repository = options.repository;
    this.#assignmentTimeoutMs = options.assignmentTimeoutMs ?? 15 * 60_000;
    this.#providerRetries = options.providerRetries ?? 2;
    this.#provider = options.provider;
    this.#model = options.model;
    this.#thinkingLevel = options.thinkingLevel;
    this.#onText = options.onText;
    this.#sessionFactory = options.sessionFactory;
  }

  async run(packet: AssignmentPacket, options: PiAssignmentRunOptions = {}): Promise<JsonObject> {
    const assignmentId = packet.assignment.id;
    let attendedAuthority: string | undefined;
    try {
      attendedAuthority = capturedAttendedAuthority(options.attendedContext, assignmentId);
    } catch (error) {
      await this.close(assignmentId);
      throw error;
    }
    let active = this.#sessions.get(assignmentId);
    if (active !== undefined && options.correction === undefined) {
      throw new PiAssignmentRunnerError(`Assignment '${assignmentId}' already owns a Pi session`);
    }

    const timeout = AbortSignal.timeout(this.#assignmentTimeoutMs);
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout.addEventListener("abort", () => {
        reject(new PiAssignmentRunnerError(
          `Pi Assignment exceeded ${this.#assignmentTimeoutMs}ms`,
        ));
      }, { once: true });
    });
    let creating: Promise<ActiveSession> | undefined;
    if (active === undefined) {
      creating = this.#createActiveSession(packet);
      try {
        active = await Promise.race([creating, timedOut]);
      } catch (error) {
        void creating.then(() => this.close(assignmentId)).catch(() => {});
        throw error;
      }
    }
    delete active.response;
    delete active.completionError;
    active.acceptingResponse = true;

    try {
      await Promise.race([
        active.session.prompt(buildPrompt(packet, options), { expandPromptTemplates: false }),
        timedOut,
      ]);
      if (active.completionError !== undefined) throw active.completionError;
      if (active.response === undefined) {
        throw new PiAssignmentRunnerError("Pi settled without calling complete_assignment");
      }
      const response = correctMissingUnattendedAuthority(packet, options.correction) ??
        active.response;
      return carryAttendedAuthority(
        restorePacketInvalidCorrectionRouting(packet, options.correction, response),
        attendedAuthority,
        assignmentId,
      );
    } catch (error) {
      await this.close(assignmentId);
      throw error;
    } finally {
      active.acceptingResponse = false;
    }
  }

  async close(assignmentId: string): Promise<void> {
    const active = this.#sessions.get(assignmentId);
    if (active === undefined) return;
    this.#sessions.delete(assignmentId);
    active.unsubscribe();
    if (!active.session.isIdle) await boundedAbort(active.session.abort());
    active.session.dispose();
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((assignmentId) =>
      this.close(assignmentId)
    ));
  }

  async #createActiveSession(packet: AssignmentPacket): Promise<ActiveSession> {
    let active: ActiveSession | undefined;
    const capture = (response: JsonObject) => {
      if (active === undefined || !active.acceptingResponse) {
        throw new PiAssignmentRunnerError(
          `Assignment '${packet.assignment.id}' completed outside its response window`,
        );
      }
      if (active.response !== undefined) {
        active.completionError = new PiAssignmentRunnerError(
          `Assignment '${packet.assignment.id}' called complete_assignment more than once`,
        );
        return;
      }
      active.response = response;
    };
    const session = this.#sessionFactory === undefined
      ? await this.#createDefaultSession(packet, capture)
      : await this.#sessionFactory(packet, capture);
    const unsubscribe = this.#onText === undefined
      ? () => {}
      : session.subscribe((event) => {
          if (!isTextDeltaEvent(event)) return;
          this.#onText?.(event.assistantMessageEvent.delta);
        });
    active = { session, unsubscribe, acceptingResponse: false };
    this.#sessions.set(packet.assignment.id, active);
    return active;
  }

  async #createDefaultSession(
    packet: AssignmentPacket,
    capture: (response: JsonObject) => void,
  ): Promise<PiAssignmentSession> {
    const completionTool = defineTool({
      name: "complete_assignment",
      label: "Complete Assignment",
      description: "Return the complete MDLM Assignment Response as the final action.",
      parameters: assignmentCompletionParameters(packet),
      async execute(_toolCallId, parameters) {
        if (!isJsonObject(parameters)) {
          throw new PiAssignmentRunnerError("complete_assignment returned a non-object response");
        }
        capture(parameters);
        return {
          content: [{ type: "text" as const, text: "Assignment Response captured." }],
          details: {},
          terminate: true,
        };
      },
    });
    const settingsManager = SettingsManager.inMemory({
      ...(this.#provider ? { defaultProvider: this.#provider } : {}),
      ...(this.#model ? { defaultModel: this.#model } : {}),
      ...(this.#thinkingLevel ? { defaultThinkingLevel: this.#thinkingLevel } : {}),
      compaction: { enabled: false },
      retry: assignmentRetryPolicy(this.#assignmentTimeoutMs, this.#providerRetries),
    });
    const { session } = await createAgentSession({
      cwd: this.#repository,
      agentDir: getAgentDir(),
      tools: ["complete_assignment"],
      customTools: [completionTool],
      resourceLoader: controlledResources(),
      sessionManager: SessionManager.inMemory(this.#repository),
      settingsManager,
    });
    return {
      get isIdle() { return session.isIdle; },
      prompt: (text, options) => session.prompt(text, options),
      abort: () => session.abort(),
      dispose: () => session.dispose(),
      subscribe: (listener) => session.subscribe((event) => listener(event)),
    };
  }
}

function controlledResources(): ResourceLoader {
  return {
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function buildPrompt(packet: AssignmentPacket, options: PiAssignmentRunOptions): string {
  const sections = [
    "Complete this exact Assignment Packet.",
    JSON.stringify(packet),
  ];
  if (options.attendedContext !== undefined) {
    sections.push("Attended authority supplied for this Assignment:", JSON.stringify(options.attendedContext));
  }
  if (options.correction !== undefined) {
    sections.push(
      "Correct the previous response for the same Assignment. Do not allocate replacement work.",
      `Previous response: ${JSON.stringify(options.correction.previousResponse)}`,
      `MDLM diagnostics: ${JSON.stringify(options.correction.diagnostics)}`,
    );
  }
  return sections.join("\n\n");
}

async function boundedAbort(abort: Promise<void>): Promise<void> {
  await Promise.race([
    abort.catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

function capturedAttendedAuthority(
  attendedContext: JsonValue | undefined,
  assignmentId: string,
): string | undefined {
  if (attendedContext === undefined) return undefined;
  if (!isJsonObject(attendedContext)) {
    throw new PiAssignmentRunnerError(
      `Assignment '${assignmentId}' has malformed attended authority context`,
    );
  }
  const requirement = attendedContext.authorityRequirement;
  const supply = attendedContext.authoritySupply;
  if (
    !isJsonObject(requirement) || requirement.mode !== "attended" ||
    typeof requirement.authority !== "string" || requirement.authority.length === 0 ||
    !isJsonObject(supply) || typeof supply.authority !== "string" ||
    supply.authority.length === 0 || supply.source !== "attended-authority-holder"
  ) {
    throw new PiAssignmentRunnerError(
      `Assignment '${assignmentId}' has malformed attended authority context`,
    );
  }
  if (supply.authority !== requirement.authority) {
    throw new PiAssignmentRunnerError(
      `Assignment '${assignmentId}' captured attended authority '${supply.authority}' conflicts with requirement '${requirement.authority}'`,
    );
  }
  return requirement.authority;
}

function correctMissingUnattendedAuthority(
  packet: AssignmentPacket,
  correction: AssignmentCorrection | undefined,
): JsonObject | undefined {
  if (
    correction === undefined || !Array.isArray(correction.diagnostics) ||
    correction.diagnostics.length === 0 ||
    !correction.diagnostics.every((diagnostic) =>
      isJsonObject(diagnostic) && diagnostic.code === "scenario-authority-required"
    ) || correction.previousResponse.kind !== "proposal"
  ) return undefined;

  const packetAuthority = packet.authority;
  const previousProposal = correction.previousResponse.proposal;
  if (
    !isJsonObject(packetAuthority) || !Array.isArray(packetAuthority.requirements) ||
    packetAuthority.requirements.length === 0 || !isJsonObject(previousProposal) ||
    !Array.isArray(previousProposal.authoritySupplies)
  ) return undefined;

  const requiredAuthorities: string[] = [];
  for (const requirement of packetAuthority.requirements) {
    if (!isJsonObject(requirement)) return undefined;
    const authorityRequirement = requirement.authorityRequirement;
    const attentionSchedule = requirement.attentionSchedule;
    if (
      !isJsonObject(authorityRequirement) || authorityRequirement.mode !== "delegated" ||
      typeof authorityRequirement.authority !== "string" ||
      authorityRequirement.authority.length === 0 || !isJsonObject(attentionSchedule) ||
      attentionSchedule.timing !== "none"
    ) return undefined;
    if (!requiredAuthorities.includes(authorityRequirement.authority)) {
      requiredAuthorities.push(authorityRequirement.authority);
    }
  }

  return {
    ...correction.previousResponse,
    proposal: {
      ...previousProposal,
      authoritySupplies: requiredAuthorities,
    },
  };
}

function restorePacketInvalidCorrectionRouting(
  packet: AssignmentPacket,
  correction: AssignmentCorrection | undefined,
  response: JsonObject,
): JsonObject {
  if (
    correction === undefined || correction.previousResponse.kind !== "proposal" ||
    response.kind !== "proposal" || !Array.isArray(correction.diagnostics) ||
    correction.diagnostics.length === 0 ||
    !correction.diagnostics.every((diagnostic) =>
      isJsonObject(diagnostic) && diagnostic.code === "scenario-authority-unexpected"
    )
  ) return response;

  const previousProposal = correction.previousResponse.proposal;
  const proposal = response.proposal;
  const exactInputs = packet.exactInputs;
  const outputContracts = packet.outputs;
  if (
    !isJsonObject(previousProposal) || !Array.isArray(previousProposal.outputs) ||
    !isJsonObject(proposal) || !Array.isArray(proposal.outputs) ||
    !Array.isArray(exactInputs) || !Array.isArray(outputContracts)
  ) return response;

  const declaredNames = new Set<string>();
  for (const contract of outputContracts) {
    if (isJsonObject(contract) && typeof contract.name === "string") {
      declaredNames.add(contract.name);
    }
  }
  type OutputRouting = { name: string; invocation: number };
  const routingByLocalId = new Map<string, OutputRouting>();
  const duplicateLocalIds = new Set<string>();
  const routingByPosition: Array<OutputRouting | undefined> = [];
  for (const output of previousProposal.outputs) {
    const routing = isJsonObject(output) && typeof output.name === "string" &&
        declaredNames.has(output.name) && Number.isInteger(output.invocation) &&
        (output.invocation as number) >= 0 &&
        (output.invocation as number) < exactInputs.length
      ? { name: output.name, invocation: output.invocation as number }
      : undefined;
    routingByPosition.push(routing);
    if (routing === undefined || !isJsonObject(output) || typeof output.localId !== "string") {
      continue;
    }
    if (routingByLocalId.has(output.localId)) {
      routingByLocalId.delete(output.localId);
      duplicateLocalIds.add(output.localId);
    } else if (!duplicateLocalIds.has(output.localId)) {
      routingByLocalId.set(output.localId, routing);
    }
  }

  let changed = false;
  const outputs = proposal.outputs.map((output, index) => {
    if (!isJsonObject(output)) return output;
    const priorRouting = typeof output.localId === "string"
      ? routingByLocalId.get(output.localId) ?? routingByPosition[index]
      : routingByPosition[index];
    if (priorRouting === undefined) return output;
    const nameIsPacketInvalid =
      typeof output.name !== "string" || !declaredNames.has(output.name);
    const invocationIsPacketInvalid =
      !Number.isInteger(output.invocation) || (output.invocation as number) < 0 ||
      (output.invocation as number) >= exactInputs.length;
    if (!nameIsPacketInvalid && !invocationIsPacketInvalid) return output;
    changed = true;
    return {
      ...output,
      ...(nameIsPacketInvalid ? { name: priorRouting.name } : {}),
      ...(invocationIsPacketInvalid ? { invocation: priorRouting.invocation } : {}),
    };
  });
  if (!changed) return response;
  return { ...response, proposal: { ...proposal, outputs } };
}

function carryAttendedAuthority(
  response: JsonObject,
  attendedAuthority: string | undefined,
  assignmentId: string,
): JsonObject {
  if (attendedAuthority === undefined || response.kind !== "proposal") return response;
  const proposal = response.proposal;
  if (!isJsonObject(proposal) || !Array.isArray(proposal.authoritySupplies)) {
    throw new PiAssignmentRunnerError(
      `Assignment '${assignmentId}' proposal cannot carry attended authority '${attendedAuthority}'`,
    );
  }
  return {
    ...response,
    proposal: {
      ...proposal,
      authoritySupplies: [attendedAuthority],
    },
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextDeltaEvent(value: unknown): value is {
  type: "message_update";
  assistantMessageEvent: { type: "text_delta"; delta: string };
} {
  if (!isJsonObject(value) || value.type !== "message_update") return false;
  const event = value.assistantMessageEvent;
  return isJsonObject(event) && event.type === "text_delta" && typeof event.delta === "string";
}
