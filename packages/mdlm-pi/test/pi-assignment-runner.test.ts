import { describe, expect, it, vi } from "vitest";
import type { AssignmentPacket, JsonObject } from "../src/mdlm-client.js";
import {
  PiAssignmentRunner,
  type PiAssignmentSession,
} from "../src/pi-assignment-runner.js";

const assignmentId = "3dae4ec3-2aae-444d-87a5-89c6dc4af3fc";

function packet(
  id = assignmentId,
  scenario = "review-datum-in-context@2",
): AssignmentPacket {
  return {
    contract: "mdlm-assignment-packet@2",
    ok: true,
    command: "scenario.prepare",
    assignment: { id },
    scenario: { reference: scenario },
    responseSchema: { type: "object" },
  };
}

describe("PiAssignmentRunner", () => {
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

    await runner.run(packet(authorId, "author-datum@1"), {
      attendedContext: { conclusion: "private attended conclusion" },
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
