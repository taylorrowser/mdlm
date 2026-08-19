import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
import { Type } from "typebox";
import type { AssignmentPacket, JsonObject, JsonValue } from "./mdlm-client.js";

const systemPrompt = `You complete exactly one MDLM Assignment.
Use only the supplied Assignment Packet and attended context; do not infer repository or Process Package facts outside them.
Follow the packet prompt, assets, exact inputs, policies, participation, authority, prohibitions, output contracts, completion contract, and response schema.
Call complete_assignment exactly once as your final action.
Return typed inability instead of asking a user or fabricating missing facts.`;

export interface AssignmentCorrection {
  previousResponse: JsonObject;
  diagnostics: JsonValue;
}

export interface PiAssignmentRunOptions {
  correction?: AssignmentCorrection;
  attendedContext?: JsonValue;
}

export interface PiAssignmentRunnerOptions {
  repository: string;
  assignmentTimeoutMs?: number;
  providerRetries?: number;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  onText?: (text: string) => void;
}

export class PiAssignmentRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiAssignmentRunnerError";
  }
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

  constructor(options: PiAssignmentRunnerOptions) {
    this.#repository = options.repository;
    this.#assignmentTimeoutMs = options.assignmentTimeoutMs ?? 15 * 60_000;
    this.#providerRetries = options.providerRetries ?? 2;
    this.#provider = options.provider;
    this.#model = options.model;
    this.#thinkingLevel = options.thinkingLevel;
    this.#onText = options.onText;
  }

  async run(packet: AssignmentPacket, options: PiAssignmentRunOptions = {}): Promise<JsonObject> {
    let response: JsonObject | undefined;
    const completionTool = defineTool({
      name: "complete_assignment",
      label: "Complete Assignment",
      description: "Return the complete MDLM Assignment Response as the final action.",
      parameters: Type.Unsafe(packet.responseSchema),
      async execute(_toolCallId, parameters) {
        if (!isJsonObject(parameters)) {
          throw new PiAssignmentRunnerError("complete_assignment returned a non-object response");
        }
        response = parameters;
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
      retry: {
        enabled: true,
        maxRetries: this.#providerRetries,
        provider: {
          maxRetries: this.#providerRetries,
          timeoutMs: Math.min(this.#assignmentTimeoutMs, 120_000),
          maxRetryDelayMs: 30_000,
        },
      },
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
    const unsubscribe = this.#onText === undefined
      ? () => {}
      : session.subscribe((event) => {
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) this.#onText?.(event.assistantMessageEvent.delta);
        });

    const timeout = AbortSignal.timeout(this.#assignmentTimeoutMs);
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout.addEventListener("abort", () => {
        reject(new PiAssignmentRunnerError(
          `Pi Assignment exceeded ${this.#assignmentTimeoutMs}ms`,
        ));
      }, { once: true });
    });

    try {
      await Promise.race([
        session.prompt(buildPrompt(packet, options), { expandPromptTemplates: false }),
        timedOut,
      ]);
    } catch (error) {
      if (!session.isIdle) await boundedAbort(session.abort());
      throw error;
    } finally {
      unsubscribe();
      if (!session.isIdle) await boundedAbort(session.abort());
      session.dispose();
    }

    if (response === undefined) {
      throw new PiAssignmentRunnerError("Pi settled without calling complete_assignment");
    }
    return response;
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
