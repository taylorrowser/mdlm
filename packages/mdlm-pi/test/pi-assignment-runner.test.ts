import { Check } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { AssignmentPacket, JsonObject } from "../src/mdlm-client.js";
import {
  assignmentCompletionParameters,
  assignmentRetryPolicy,
  PiAssignmentRunner,
  type PiAssignmentSession,
} from "../src/pi-assignment-runner.js";

const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";

function packet(id = assignmentId): AssignmentPacket {
  return {
    contract: "mdlm-assignment-packet@3",
    assignment: { id },
    package: { reference: "package@1" },
    repository: { head: "base" },
    scenario: { reference: "independent-judgment@1" },
    responseScaffold: { contract: "mdlm-assignment-response@2", assignment: id },
    responseSchema: { type: "object" },
  };
}

describe("PiAssignmentRunner", () => {
  it("binds complete_assignment to the packet response schema", () => {
    const exact = packet();
    exact.responseSchema = {
      type: "object",
      required: ["contract", "assignment", "proposal"],
      properties: {
        contract: { const: "mdlm-assignment-response@2" },
        assignment: { const: assignmentId },
        proposal: { type: "object" },
      },
    };
    const parameters = assignmentCompletionParameters(exact);
    expect(Check(parameters, { assignment: assignmentId })).toBe(false);
    expect(Check(parameters, {
      contract: "mdlm-assignment-response@2",
      assignment: assignmentId,
      proposal: {},
    })).toBe(true);
  });

  it("uses a finite provider retry policy bounded by the Assignment timeout", () => {
    expect(assignmentRetryPolicy(15 * 60_000, 2).provider).toEqual({
      maxRetries: 2,
      timeoutMs: 120_000,
      maxRetryDelayMs: 30_000,
    });
    expect(assignmentRetryPolicy(5_000, 2).provider.timeoutMs).toBe(5_000);
  });

  it("uses one session for a rejected response and its correction", async () => {
    const first: JsonObject = { contract: "mdlm-assignment-response@2", assignment: assignmentId, first: true };
    const corrected: JsonObject = { contract: "mdlm-assignment-response@2", assignment: assignmentId, corrected: true };
    const responses = [first, corrected];
    const prompts: string[] = [];
    const session = scriptedSession(prompts);
    const factory = vi.fn(async (_packet: AssignmentPacket, capture: (value: JsonObject) => void) => {
      session.prompt = vi.fn(async (prompt: string) => {
        prompts.push(prompt);
        capture(responses.shift()!);
      });
      return session;
    });
    const runner = new PiAssignmentRunner({ repository: ".", sessionFactory: factory });

    await expect(runner.run(packet())).resolves.toEqual(first);
    await expect(runner.run(packet(), {
      correction: { previousResponse: first, diagnostics: [{ code: "invalid" }] },
    })).resolves.toEqual(corrected);

    expect(factory).toHaveBeenCalledOnce();
    expect(prompts[1]).toContain('"code":"invalid"');
  });

  it("does not copy attended authority metadata into the Assignment Response", async () => {
    const response: JsonObject = {
      contract: "mdlm-assignment-response@2",
      assignment: assignmentId,
      kind: "proposal",
      proposal: { outputs: [] },
    };
    const session = scriptedSession([]);
    const runner = new PiAssignmentRunner({
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
    const response: JsonObject = { assignment: assignmentId };
    const session = scriptedSession([]);
    const runner = new PiAssignmentRunner({
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

  it("does not reuse a session for a different Assignment", async () => {
    const factories: string[] = [];
    const runner = new PiAssignmentRunner({
      repository: ".",
      sessionFactory: async (current, capture) => {
        factories.push(current.assignment.id);
        const session = scriptedSession([]);
        session.prompt = vi.fn(async () => capture({ assignment: current.assignment.id }));
        return session;
      },
    });
    await runner.run(packet("assignment-a"));
    await runner.run(packet("assignment-b"));
    expect(factories).toEqual(["assignment-a", "assignment-b"]);
  });
});

function scriptedSession(prompts: string[]): PiAssignmentSession {
  return {
    get isIdle() { return true; },
    prompt: vi.fn(async (prompt: string) => { prompts.push(prompt); }),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}
