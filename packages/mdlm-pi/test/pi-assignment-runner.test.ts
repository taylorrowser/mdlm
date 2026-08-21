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

function packet(
  id = assignmentId,
  scenario = "independent-judgment@1",
): AssignmentPacket {
  return {
    contract: "mdlm-assignment-packet@2",
    ok: true,
    command: "scenario.prepare",
    assignment: { id },
    package: { reference: "package@1" },
    repository: { head: "base" },
    scenario: { reference: scenario },
    responseSchema: { type: "object" },
  };
}

describe("PiAssignmentRunner", () => {
  it("binds the terminating tool to the exact packet response schema", () => {
    const exactPacket = packet();
    exactPacket.responseSchema = {
      type: "object",
      required: ["assignment", "proposal"],
      properties: {
        assignment: { const: assignmentId },
        proposal: {
          type: "object",
          required: ["outputs"],
          properties: { outputs: { type: "array" } },
        },
      },
    };
    const parameters = assignmentCompletionParameters(exactPacket);

    expect(Check(parameters, { assignment: assignmentId })).toBe(false);
    expect(Check(parameters, {
      assignment: assignmentId,
      proposal: { outputs: [] },
    })).toBe(true);
  });

  it("uses a finite two-retry provider policy bounded by the Assignment timeout", () => {
    expect(assignmentRetryPolicy(15 * 60_000, 2)).toEqual({
      enabled: true,
      maxRetries: 2,
      provider: {
        maxRetries: 2,
        timeoutMs: 120_000,
        maxRetryDelayMs: 30_000,
      },
    });
    expect(assignmentRetryPolicy(5_000, 2).provider.timeoutMs).toBe(5_000);
  });

  it("uses one isolated session for the initial response and its sole correction", async () => {
    const malformed: JsonObject = { assignment: assignmentId, malformed: true };
    const corrected: JsonObject = { assignment: assignmentId, corrected: true };
    const prompts: string[] = [];
    const dispose = vi.fn();
    let captures = 0;
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async (prompt: string) => { prompts.push(prompt); }),
      abort: vi.fn(async () => undefined),
      dispose,
      subscribe: vi.fn(() => () => {}),
    };
    const sessionFactory = vi.fn(async (_packet, capture) => {
      session.prompt = vi.fn(async (prompt: string) => {
        prompts.push(prompt);
        capture(captures++ === 0 ? malformed : corrected);
      });
      return session;
    });
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory,
    });

    await expect(runner.run(packet())).resolves.toEqual(malformed);
    await expect(runner.run(packet(), {
      correction: {
        previousResponse: malformed,
        diagnostics: [{ code: "FIX", message: "Correct it" }],
      },
    })).resolves.toEqual(corrected);

    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(prompts[1]).toContain('"code":"FIX"');
    expect(dispose).not.toHaveBeenCalled();
    await runner.close(assignmentId);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("normalizes equivalent worker and attended authority before capture", async () => {
    const response: JsonObject = {
      kind: "proposal",
      proposal: { authoritySupplies: ["stakeholder:attended-authority-holder"] },
    };
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async () => { capture(response); });
        return session;
      }),
    });

    await expect(runner.run(packet(), {
      attendedContext: {
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
        },
        authoritySupply: {
          authority: "stakeholder",
          source: "attended-authority-holder",
        },
      },
    })).resolves.toEqual({
      ...response,
      proposal: { authoritySupplies: ["stakeholder"] },
    });
  });

  it("does not let noisy worker authority block attended response capture", async () => {
    const response: JsonObject = {
      kind: "proposal",
      proposal: {
        authoritySupplies: ["stakeholder attended-authority-holder invocation 0"],
      },
    };
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async () => { capture(response); });
        return session;
      }),
    });

    await expect(runner.run(packet(), {
      attendedContext: {
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
        },
        authoritySupply: {
          authority: "stakeholder",
          source: "attended-authority-holder",
        },
      },
    })).resolves.toEqual({
      ...response,
      proposal: { authoritySupplies: ["stakeholder"] },
    });
  });

  it("replaces arbitrary worker authority text with captured attended authority", async () => {
    const response: JsonObject = {
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        authoritySupplies: [
          "release-manager",
          "stakeholder:other-authority-holder",
        ],
      },
    };
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async () => { capture(response); });
        return session;
      }),
    });

    await expect(runner.run(packet(), {
      attendedContext: {
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        },
        authoritySupply: {
          authority: "stakeholder",
          source: "attended-authority-holder",
        },
        conclusion: { statement: "Use the accepted scope." },
      },
    })).resolves.toEqual({
      ...response,
      proposal: { authoritySupplies: ["stakeholder"] },
    });
  });

  it("rejects conflicting captured attended authority before worker execution", async () => {
    const sessionFactory = vi.fn(async () => {
      const session: PiAssignmentSession = {
        get isIdle() { return true; },
        prompt: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
        dispose: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      };
      return session;
    });
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory,
    });

    await expect(runner.run(packet(), {
      attendedContext: {
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
        },
        authoritySupply: {
          authority: "release-manager",
          source: "attended-authority-holder",
        },
      },
    })).rejects.toThrow(
      "captured attended authority 'release-manager' conflicts with requirement 'stakeholder'",
    );
    expect(sessionFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["autonomous", []],
    ["independent review", ["independent-reviewer"]],
  ])("does not infer attended authority for %s work", async (_kind, authoritySupplies) => {
    const response: JsonObject = {
      assignment: assignmentId,
      kind: "proposal",
      proposal: { authoritySupplies },
    };
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async () => { capture(response); });
        return session;
      }),
    });

    await expect(runner.run(packet())).resolves.toEqual(response);
    await runner.dispose();
  });

  it("does not reuse an author's session or attended context for a review Assignment", async () => {
    const authorId = "9c1616d4-c016-4766-81e3-0ce2a6987518";
    const prompts: string[] = [];
    const sessions: PiAssignmentSession[] = [];
    const sessionFactory = vi.fn(async (assignment: AssignmentPacket, capture: (value: JsonObject) => void) => {
      const session: PiAssignmentSession = {
        get isIdle() { return true; },
        prompt: vi.fn(async (prompt: string) => {
          prompts.push(prompt);
          capture({ assignment: assignment.assignment.id, complete: true });
        }),
        abort: vi.fn(async () => undefined),
        dispose: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      };
      sessions.push(session);
      return session;
    });
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory,
    });

    await runner.run(packet(authorId, "author-work@1"), {
      attendedContext: {
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
        },
        authoritySupply: {
          authority: "stakeholder",
          source: "attended-authority-holder",
        },
        conclusion: "private attended conclusion",
      },
    });
    await runner.close(authorId);
    await runner.run(packet());

    expect(sessionFactory).toHaveBeenCalledTimes(2);
    expect(sessions[0]).not.toBe(sessions[1]);
    expect(prompts[0]).toContain("private attended conclusion");
    expect(prompts[1]).not.toContain("private attended conclusion");
    await runner.dispose();
  });

  it("rejects a session that tries to complete one Assignment more than once", async () => {
    const dispose = vi.fn();
    const response: JsonObject = { assignment: assignmentId, complete: true };
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose,
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async (_packet, capture) => {
        session.prompt = vi.fn(async () => {
          capture(response);
          capture(response);
        });
        return session;
      }),
    });

    await expect(runner.run(packet())).rejects.toThrow(
      "complete_assignment more than once",
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("aborts and disposes a session when the finite Assignment timeout expires", async () => {
    const abort = vi.fn(async () => undefined);
    const dispose = vi.fn();
    const session: PiAssignmentSession = {
      get isIdle() { return false; },
      prompt: vi.fn(async () => new Promise<void>(() => {})),
      abort,
      dispose,
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 20,
      sessionFactory: vi.fn(async () => session),
    });

    await expect(runner.run(packet())).rejects.toThrow("exceeded 20ms");
    expect(abort).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("bounds session creation as part of the Assignment timeout", async () => {
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 20,
      sessionFactory: vi.fn(async () => new Promise<PiAssignmentSession>(() => {})),
    });

    await expect(runner.run(packet())).rejects.toThrow("exceeded 20ms");
  });

  it("aborts and disposes a session that settles without a response", async () => {
    const dispose = vi.fn();
    const session: PiAssignmentSession = {
      get isIdle() { return true; },
      prompt: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      dispose,
      subscribe: vi.fn(() => () => {}),
    };
    const runner = new PiAssignmentRunner({
      repository: ".",
      assignmentTimeoutMs: 1_000,
      sessionFactory: vi.fn(async () => session),
    });

    await expect(runner.run(packet())).rejects.toThrow(
      "Pi settled without calling complete_assignment",
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
