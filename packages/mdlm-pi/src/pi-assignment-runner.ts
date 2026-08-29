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
import {
  isPiStopReason,
  observedPiIdentity,
  redactProviderError,
  type PiTerminalTelemetry,
} from "./operational-failure.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const systemPrompt = `You complete exactly one MDLM Assignment.
Use only the supplied Assignment Packet and attended context; do not infer repository or Process Package facts outside them.
Follow the packet prompt, exact inputs, policies, participation, authority, prohibitions, output contracts, completion contract, response scaffold, and response schema.
Use symbolic output handles from the scaffold. Never predict generated identities, links, or authority metadata.
An attended conclusion informs the proposal, but authority travels outside the response and is bound to the Assignment by MDLM.
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
  readonly code: string;
  readonly telemetry: PiTerminalTelemetry | undefined;

  constructor(
    message: string,
    options: { code?: string; telemetry?: PiTerminalTelemetry } = {},
  ) {
    super(message);
    this.name = "PiAssignmentRunnerError";
    this.code = options.code ?? "PI_ASSIGNMENT_RUNNER_ERROR";
    this.telemetry = options.telemetry;
  }
}

interface ActiveSession {
  session: PiAssignmentSession;
  unsubscribe: () => void;
  acceptingResponse: boolean;
  completeAssignmentObserved: boolean | null;
  completeAssignmentPendingIds: Set<string>;
  terminal: MutableTerminalTelemetry;
  response?: JsonObject;
  completionError?: PiAssignmentRunnerError;
}

interface MutableTerminalTelemetry {
  stopReason: PiTerminalTelemetry["stopReason"];
  providerError: PiTerminalTelemetry["providerError"];
  retriesConsumed: number | null;
  provider: string | null;
  model: string | null;
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
    let active = this.#sessions.get(assignmentId);
    if (active !== undefined && options.correction === undefined) {
      throw new PiAssignmentRunnerError(`Assignment '${assignmentId}' already owns a Pi session`);
    }

    const timeout = AbortSignal.timeout(this.#assignmentTimeoutMs);
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout.addEventListener("abort", () => {
        reject(new PiAssignmentRunnerError(
          `Pi Assignment exceeded ${this.#assignmentTimeoutMs}ms`,
          active === undefined ? {} : { telemetry: terminalTelemetry(active) },
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
    active.completeAssignmentObserved = null;
    active.completeAssignmentPendingIds.clear();
    active.terminal = unavailableTerminalTelemetry();

    try {
      await Promise.race([
        active.session.prompt(buildPrompt(packet, options), { expandPromptTemplates: false }),
        timedOut,
      ]);
      if (active.completionError !== undefined) throw active.completionError;
      if (active.response === undefined) {
        throw new PiAssignmentRunnerError(
          "Pi settled without calling complete_assignment",
          {
            code: "PI_SETTLED_WITHOUT_COMPLETION",
            telemetry: terminalTelemetry(active),
          },
        );
      }
      return active.response;
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
      if (active !== undefined) active.completeAssignmentObserved = true;
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
    active = {
      session,
      unsubscribe: () => {},
      acceptingResponse: false,
      completeAssignmentObserved: null,
      completeAssignmentPendingIds: new Set(),
      terminal: unavailableTerminalTelemetry(),
    };
    active.unsubscribe = session.subscribe((event) => {
      observeTerminalEvent(active!, event);
      if (isTextDeltaEvent(event)) this.#onText?.(event.assistantMessageEvent.delta);
    });
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

function terminalTelemetry(active: ActiveSession): PiTerminalTelemetry {
  return {
    ...active.terminal,
    completeAssignmentObserved: active.completeAssignmentPendingIds.size > 0 && active.completeAssignmentObserved !== true
      ? null
      : active.completeAssignmentObserved,
  };
}

function observeTerminalEvent(active: ActiveSession, event: unknown): void {
  if (!isRecord(event) || typeof event.type !== "string") return;
  if (event.type === "agent_start") {
    if (active.terminal.retriesConsumed === null) active.terminal.retriesConsumed = 0;
    if (active.completeAssignmentObserved === null) active.completeAssignmentObserved = false;
  }
  if (event.type === "tool_execution_start" && event.toolName === "complete_assignment" &&
      typeof event.toolCallId === "string") {
    active.completeAssignmentPendingIds.add(event.toolCallId);
  }
  if (event.type === "tool_execution_end" && event.toolName === "complete_assignment") {
    if (typeof event.toolCallId === "string") active.completeAssignmentPendingIds.delete(event.toolCallId);
    // Only the local tool callback proves execution. Pi also emits end events for
    // calls rejected before execution, so an event pair alone remains unavailable.
    if (active.completeAssignmentObserved !== true) active.completeAssignmentObserved = null;
  }
  const retryAttempt = event.attempt;
  if (event.type === "auto_retry_start" && Number.isSafeInteger(retryAttempt) && (retryAttempt as number) > 0) {
    active.terminal.retriesConsumed = Math.max(
      active.terminal.retriesConsumed ?? 0,
      retryAttempt as number,
    );
    if (typeof event.errorMessage === "string") {
      active.terminal.providerError = redactProviderError(event.errorMessage);
    }
  }
  if (event.type === "auto_retry_end" && typeof event.finalError === "string") {
    active.terminal.providerError = redactProviderError(event.finalError);
  }
  if ((event.type === "message_end" || event.type === "turn_end") && isRecord(event.message)) {
    observeAssistantMessage(active.terminal, event.message);
  }
  if (event.type === "agent_end" && Array.isArray(event.messages)) {
    const terminalMessage = event.messages.findLast((message) =>
      isRecord(message) && message.role === "assistant"
    );
    if (terminalMessage !== undefined) observeAssistantMessage(active.terminal, terminalMessage);
  }
}

function unavailableTerminalTelemetry(): MutableTerminalTelemetry {
  return {
    stopReason: null,
    providerError: null,
    retriesConsumed: null,
    provider: null,
    model: null,
  };
}

function observeAssistantMessage(terminal: MutableTerminalTelemetry, message: Record<string, unknown>): void {
  if (message.role !== "assistant") return;
  if (isPiStopReason(message.stopReason)) terminal.stopReason = message.stopReason;
  terminal.provider = observedPiIdentity(message.provider);
  terminal.model = observedPiIdentity(message.model);
  if (typeof message.errorMessage === "string") {
    terminal.providerError = redactProviderError(message.errorMessage);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    sections.push(
      "Attended conclusion for this Assignment. Use it only to author the declared output. Do not copy authority metadata into the response:",
      JSON.stringify(options.attendedContext),
    );
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
