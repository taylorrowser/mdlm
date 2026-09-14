import { Check } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../src/mdlm-client.js";
import type { AgentTask } from "../src/pi-work-runner.js";
import {
  workCompletionParameters,
  workRetryPolicy,
  PiWorkRunner,
  type PiWorkSession,
} from "../src/pi-work-runner.js";

const workId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";

function packet(id = workId): AgentTask {
  return { id, context: { prompt: "Author direct data" }, responseSchema: { type: "object" } };
}

describe("PiWorkRunner", () => {
  it("binds complete_work to the packet response schema", () => {
    const exact = packet();
    exact.responseSchema = {
      type: "object",
      required: ["contract", "operation", "proposal"],
      properties: {
        contract: { const: "direct-result" },
        operation: { const: workId },
        proposal: { type: "object" },
      },
    };
    const parameters = workCompletionParameters(exact);
    expect(Check(parameters, { operation: workId })).toBe(false);
    expect(Check(parameters, {
      contract: "direct-result",
      operation: workId,
      proposal: {},
    })).toBe(true);
  });

  it("uses a finite provider retry policy bounded by the work timeout", () => {
    expect(workRetryPolicy(15 * 60_000, 2).provider).toEqual({
      maxRetries: 2,
      timeoutMs: 120_000,
      maxRetryDelayMs: 30_000,
    });
    expect(workRetryPolicy(5_000, 2).provider.timeoutMs).toBe(5_000);
  });

  it("does not copy attended authority metadata into the work Response", async () => {
    const response: JsonObject = {
      contract: "direct-result",
      operation: workId,
      kind: "proposal",
      proposal: { outputs: [] },
    };
    const session = scriptedSession([]);
    const runner = new PiWorkRunner({
      repository: ".",
      sessionFactory: async (_packet, capture) => {
        session.prompt = vi.fn(async () => capture(response));
        return session;
      },
    });

    await expect(runner.run(packet(), {
      attendedContext: { conclusion: { statement: "approve" } },
    })).resolves.toEqual(response);
    expect(JSON.stringify(response)).not.toContain("authoritySupplies");
  });

  it("rejects more than one completion call in the same response window", async () => {
    const response: JsonObject = { operation: workId };
    const session = scriptedSession([]);
    const runner = new PiWorkRunner({
      repository: ".",
      sessionFactory: async (_packet, capture) => {
        session.prompt = vi.fn(async () => {
          capture(response);
          capture(response);
        });
        return session;
      },
    });
    await expect(runner.run(packet())).rejects.toThrow("more than once");
  });

  it("does not reuse a session for a different work", async () => {
    const factories: string[] = [];
    const runner = new PiWorkRunner({
      repository: ".",
      sessionFactory: async (current, capture) => {
        factories.push(current.id);
        const session = scriptedSession([]);
        session.prompt = vi.fn(async () => capture({ operation: current.id }));
        return session;
      },
    });
    await runner.run(packet("operation-a"));
    await runner.run(packet("operation-b"));
    expect(factories).toEqual(["operation-a", "operation-b"]);
  });
});

function scriptedSession(prompts: string[]): PiWorkSession {
  return {
    get isIdle() { return true; },
    prompt: vi.fn(async (prompt: string) => { prompts.push(prompt); }),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}
