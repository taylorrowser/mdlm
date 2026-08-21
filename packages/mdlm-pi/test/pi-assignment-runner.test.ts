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

  it("corrects missing unattended authority from current participation without changing proposal content", async () => {
    const initialResponse: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "implementation",
          name: "implementation",
          invocation: 0,
          lifecycleDatum: { type: "VAI", payload: { title: "Original VAI" }, links: [] },
        }, {
          localId: "authorization",
          name: "authorization",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: { kind: "decision", decision: "Original exact authorization." },
            links: [{ type: "justifies", target: "$proposal.implementation.revision_id" }],
          },
        }],
        completionEvidence: { summary: "Original VAI content." },
        loadedSkillRefs: ["skills/verification-independence.md@1"],
        authoritySupplies: [],
        standingDelegations: [],
      },
    };
    const workerCorrection: JsonObject = {
      ...initialResponse,
      proposal: {
        ...(initialResponse.proposal as JsonObject),
        outputs: [
          ((initialResponse.proposal as JsonObject).outputs as JsonObject[])[0]!,
          {
            ...((initialResponse.proposal as JsonObject).outputs as JsonObject[])[1]!,
            lifecycleDatum: {
              type: "DEC",
              payload: { kind: "decision", decision: "Invented replacement authorization." },
              links: [{ type: "justifies", target: "$proposal.implementation.revision_id" }],
            },
          },
        ],
        authoritySupplies: [
          "independent-verification-implementer",
          "$proposal.authorization.revision_id",
        ],
      },
    };
    const responses = [initialResponse, workerCorrection];
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
        session.prompt = vi.fn(async () => { capture(responses.shift()!); });
        return session;
      }),
    });
    const implementationPacket = packet(
      assignmentId,
      "implement-verification-activity@1",
    );
    implementationPacket.authority = {
      evidence: { output: "authorization", type: "DEC" },
      requirements: [{
        invocation: 0,
        policy: "verification-implementation-participation@1",
        authorityRequirement: {
          mode: "delegated",
          authority: "independent-verification-implementer",
          delegationAllowed: false,
        },
        attentionSchedule: { timing: "none" },
      }],
      standingDelegation: null,
    };

    await expect(runner.run(implementationPacket)).resolves.toEqual(initialResponse);
    await expect(runner.run(implementationPacket, {
      correction: {
        previousResponse: initialResponse,
        diagnostics: [{
          code: "scenario-authority-required",
          path: "implement-verification-activity@1#authority",
          message: "Scenario requires independent-verification-implementer",
        }],
      },
    })).resolves.toEqual({
      ...initialResponse,
      proposal: {
        ...(initialResponse.proposal as JsonObject),
        authoritySupplies: ["independent-verification-implementer"],
      },
    });

    await runner.dispose();
  });

  it("preserves valid packet output routing when correcting unrelated authority", async () => {
    const initialResponse: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "productSpec",
          name: "product_specification",
          invocation: 0,
          lifecycleDatum: { type: "PSP", payload: { title: "Initial PSP" }, links: [] },
        }, {
          localId: "behaviorQuestion",
          name: "questions",
          invocation: 0,
          lifecycleDatum: { type: "QST", payload: { title: "Behavior" }, links: [] },
        }, {
          localId: "successQuestion",
          name: "questions",
          invocation: 0,
          lifecycleDatum: { type: "QST", payload: { title: "Success" }, links: [] },
        }],
        authoritySupplies: ["unexpected-authority"],
      },
    };
    const workerCorrection: JsonObject = {
      ...initialResponse,
      proposal: {
        ...(initialResponse.proposal as JsonObject),
        outputs: [
          ...((initialResponse.proposal as JsonObject).outputs as JsonObject[]).slice(0, 2),
          {
            ...((initialResponse.proposal as JsonObject).outputs as JsonObject[])[2]!,
            invocation: 1,
            lifecycleDatum: {
              type: "QST",
              payload: { title: "Corrected success content" },
              links: [],
            },
          },
        ],
        authoritySupplies: [],
      },
    };
    const responses = [initialResponse, workerCorrection];
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
        session.prompt = vi.fn(async () => { capture(responses.shift()!); });
        return session;
      }),
    });
    const compilePacket = packet(assignmentId, "compile-product-specification@1");
    compilePacket.exactInputs = [{ inputs: [] }];
    compilePacket.outputs = [{
      name: "product_specification",
      types: ["PSP"],
      cardinality: "one",
    }, {
      name: "questions",
      types: ["QST"],
      cardinality: "zero-or-more",
    }];

    await expect(runner.run(compilePacket)).resolves.toEqual(initialResponse);
    await expect(runner.run(compilePacket, {
      correction: {
        previousResponse: initialResponse,
        diagnostics: [{
          code: "scenario-authority-unexpected",
          path: "compile-product-specification@1#authority",
          message: "Scenario received authority not required by its exact participation",
        }],
      },
    })).resolves.toEqual({
      ...workerCorrection,
      proposal: {
        ...(workerCorrection.proposal as JsonObject),
        outputs: [
          ...((workerCorrection.proposal as JsonObject).outputs as JsonObject[]).slice(0, 2),
          {
            ...((workerCorrection.proposal as JsonObject).outputs as JsonObject[])[2]!,
            invocation: 0,
          },
        ],
      },
    });

    await runner.dispose();
  });

  it("retains corrected output routing for a non-authority diagnostic", async () => {
    const initialResponse: JsonObject = {
      contract: "mdlm-assignment-response@1",
      assignment: assignmentId,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "result",
          name: "product_specification",
          invocation: 0,
          lifecycleDatum: { type: "QST", payload: { title: "Wrong type" }, links: [] },
        }],
        authoritySupplies: [],
      },
    };
    const workerCorrection: JsonObject = {
      ...initialResponse,
      proposal: {
        ...(initialResponse.proposal as JsonObject),
        outputs: [{
          localId: "result",
          name: "questions",
          invocation: 0,
          lifecycleDatum: { type: "QST", payload: { title: "Corrected routing" }, links: [] },
        }],
      },
    };
    const responses = [initialResponse, workerCorrection];
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
        session.prompt = vi.fn(async () => { capture(responses.shift()!); });
        return session;
      }),
    });
    const compilePacket = packet(assignmentId, "compile-product-specification@1");
    compilePacket.exactInputs = [{ inputs: [] }];
    compilePacket.outputs = [{
      name: "product_specification",
      types: ["PSP"],
      cardinality: "one",
    }, {
      name: "questions",
      types: ["QST"],
      cardinality: "zero-or-more",
    }];

    await expect(runner.run(compilePacket)).resolves.toEqual(initialResponse);
    await expect(runner.run(compilePacket, {
      correction: {
        previousResponse: initialResponse,
        diagnostics: [{
          code: "scenario-output-type-invalid",
          path: "proposal.outputs[0].lifecycleDatum.type",
          message: "Output type is invalid for its declared output name",
        }],
      },
    })).resolves.toEqual(workerCorrection);

    await runner.dispose();
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
