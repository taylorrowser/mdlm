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
