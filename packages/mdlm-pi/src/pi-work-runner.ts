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
import type { JsonObject, JsonValue } from "./mdlm-client.js";

export interface AgentTask {
  id: string;
  context: JsonObject;
  responseSchema: JsonObject;
}
import {
  isPiStopReason,
  observedPiIdentity,
  redactProviderError,
  type PiTerminalTelemetry,
} from "./operational-failure.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const systemPrompt = `Choose useful lifecycle work from the supplied available actions, then follow its package guidance.
Use the supplied exact context and preserve stakeholder intent. Keep proposed functionality minimal.
Edit product source only when the task asks for implementation. The controller owns lifecycle discovery, execution and publication; leave lifecycle files and commands to it.
Return the requested structured result through complete_work exactly once as your final action.
Authority travels through the attended transport, never through invented proposal fields.
If necessary information is missing, explain the blocker instead of fabricating evidence.`;

export function workCompletionParameters(packet: AgentTask) {
  return Type.Unsafe(packet.responseSchema);
}

export function workRetryPolicy(workTimeoutMs: number, providerRetries: number) {
  return {
    enabled: true,
    maxRetries: providerRetries,
    provider: {
      maxRetries: providerRetries,
      timeoutMs: Math.min(workTimeoutMs, 120_000),
      maxRetryDelayMs: 30_000,
    },
  };
}

export interface PiWorkRunOptions {
  attendedContext?: JsonValue;
}

export interface PiWorkSession {
  readonly isIdle: boolean;
  prompt(text: string, options?: { expandPromptTemplates?: boolean }): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  subscribe(listener: (event: unknown) => void): () => void;
}

export type PiWorkSessionFactory = (
  packet: AgentTask,
  capture: (response: JsonObject) => void,
) => Promise<PiWorkSession>;

export interface PiWorkRunnerOptions {
  repository: string;
  workTimeoutMs?: number;
  providerRetries?: number;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  onText?: (text: string) => void;
  sessionFactory?: PiWorkSessionFactory;
}

export class PiWorkRunnerError extends Error {
  readonly code: string;
  readonly telemetry: PiTerminalTelemetry | undefined;

  constructor(
    message: string,
    options: { code?: string; telemetry?: PiTerminalTelemetry } = {},
  ) {
    super(message);
    this.name = "PiWorkRunnerError";
    this.code = options.code ?? "PI_WORK_RUNNER_ERROR";
    this.telemetry = options.telemetry;
  }
}

interface ActiveSession {
  session: PiWorkSession;
  unsubscribe: () => void;
  acceptingResponse: boolean;
  completionObserved: boolean | null;
  completionPendingIds: Set<string>;
  terminal: MutableTerminalTelemetry;
  response?: JsonObject;
  completionError?: PiWorkRunnerError;
}

interface MutableTerminalTelemetry {
  stopReason: PiTerminalTelemetry["stopReason"];
  providerError: PiTerminalTelemetry["providerError"];
  retriesConsumed: number | null;
  provider: string | null;
  model: string | null;
}

/** One isolated agent session for choosing work or authoring a direct proposal. */
export class PiWorkRunner {
  readonly #repository: string;
  readonly #workTimeoutMs: number;
  readonly #providerRetries: number;
  readonly #provider: string | undefined;
  readonly #model: string | undefined;
  readonly #thinkingLevel: ThinkingLevel | undefined;
  readonly #onText: ((text: string) => void) | undefined;
  readonly #sessionFactory: PiWorkSessionFactory | undefined;
  readonly #sessions = new Map<string, ActiveSession>();

  constructor(options: PiWorkRunnerOptions) {
    this.#repository = options.repository;
    this.#workTimeoutMs = options.workTimeoutMs ?? 15 * 60_000;
    this.#providerRetries = options.providerRetries ?? 2;
    this.#provider = options.provider;
    this.#model = options.model;
    this.#thinkingLevel = options.thinkingLevel;
    this.#onText = options.onText;
    this.#sessionFactory = options.sessionFactory;
  }

  async run(packet: AgentTask, options: PiWorkRunOptions = {}): Promise<JsonObject> {
    const workId = packet.id;
    let active = this.#sessions.get(workId);
    if (active !== undefined) {
      throw new PiWorkRunnerError(`Work '${workId}' already owns a Pi session`);
    }

    const timeout = AbortSignal.timeout(this.#workTimeoutMs);
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout.addEventListener("abort", () => {
        reject(new PiWorkRunnerError(
          `Pi work exceeded ${this.#workTimeoutMs}ms`,
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
        void creating.then(() => this.close(workId)).catch(() => {});
        throw error;
      }
    }
    delete active.response;
    delete active.completionError;
    active.acceptingResponse = true;
    active.completionObserved = null;
    active.completionPendingIds.clear();
    active.terminal = unavailableTerminalTelemetry();

    try {
      await Promise.race([
        active.session.prompt(buildPrompt(packet, options), { expandPromptTemplates: false }),
        timedOut,
      ]);
      if (active.completionError !== undefined) throw active.completionError;
      if (active.response === undefined) {
        throw new PiWorkRunnerError(
          "Pi settled without calling complete_work",
          {
            code: "PI_SETTLED_WITHOUT_COMPLETION",
            telemetry: terminalTelemetry(active),
          },
        );
      }
      return active.response;
    } catch (error) {
      await this.close(workId);
      throw error;
    } finally {
      active.acceptingResponse = false;
    }
  }

  async close(workId: string): Promise<void> {
    const active = this.#sessions.get(workId);
    if (active === undefined) return;
    this.#sessions.delete(workId);
    active.unsubscribe();
    if (!active.session.isIdle) await boundedAbort(active.session.abort());
    active.session.dispose();
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((workId) =>
      this.close(workId)
    ));
  }

  async #createActiveSession(packet: AgentTask): Promise<ActiveSession> {
    let active: ActiveSession | undefined;
    const capture = (response: JsonObject) => {
      if (active !== undefined) active.completionObserved = true;
      if (active === undefined || !active.acceptingResponse) {
        throw new PiWorkRunnerError(
          `Work '${packet.id}' completed outside its response window`,
        );
      }
      if (active.response !== undefined) {
        active.completionError = new PiWorkRunnerError(
          `Work '${packet.id}' called complete_work more than once`,
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
      completionObserved: null,
      completionPendingIds: new Set(),
      terminal: unavailableTerminalTelemetry(),
    };
    active.unsubscribe = session.subscribe((event) => {
      observeTerminalEvent(active!, event);
      if (isTextDeltaEvent(event)) this.#onText?.(event.assistantMessageEvent.delta);
    });
    this.#sessions.set(packet.id, active);
    return active;
  }

  async #createDefaultSession(
    packet: AgentTask,
    capture: (response: JsonObject) => void,
  ): Promise<PiWorkSession> {
    const completionTool = defineTool({
      name: "complete_work",
      label: "Complete work",
      description: "Return the requested structured result as the final action.",
      parameters: workCompletionParameters(packet),
      async execute(_toolCallId, parameters) {
        if (!isJsonObject(parameters)) {
          throw new PiWorkRunnerError("complete_work returned a non-object response");
        }
        capture(parameters);
        return {
          content: [{ type: "text" as const, text: "Result captured." }],
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
      retry: workRetryPolicy(this.#workTimeoutMs, this.#providerRetries),
    });
    const { session } = await createAgentSession({
      cwd: this.#repository,
      agentDir: getAgentDir(),
      tools: ["read", "bash", "edit", "write", "complete_work"],
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
    completionObserved: active.completionPendingIds.size > 0 && active.completionObserved !== true
      ? null
      : active.completionObserved,
  };
}

function observeTerminalEvent(active: ActiveSession, event: unknown): void {
  if (!isRecord(event) || typeof event.type !== "string") return;
  if (event.type === "agent_start") {
    if (active.terminal.retriesConsumed === null) active.terminal.retriesConsumed = 0;
    if (active.completionObserved === null) active.completionObserved = false;
  }
  if (event.type === "tool_execution_start" && event.toolName === "complete_work" &&
      typeof event.toolCallId === "string") {
    active.completionPendingIds.add(event.toolCallId);
  }
  if (event.type === "tool_execution_end" && event.toolName === "complete_work") {
    if (typeof event.toolCallId === "string") active.completionPendingIds.delete(event.toolCallId);
    // Only the local tool callback proves execution. Pi also emits end events for
    // calls rejected before execution, so an event pair alone remains unavailable.
    if (active.completionObserved !== true) active.completionObserved = null;
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

function buildPrompt(packet: AgentTask, options: PiWorkRunOptions): string {
  const sections = [
    "Follow this exact task context.",
    JSON.stringify(packet.context),
  ];
  if (options.attendedContext !== undefined) {
    sections.push(
      "Attended conclusion for this work. Use it to author the requested data. Authority remains outside the proposal:",
      JSON.stringify(options.attendedContext),
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
