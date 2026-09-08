import { describe, expect, it } from "vitest";
import { classifyOperatorOutcome, type OperatorWorkFacts } from "../src/operator-outcome.js";

function work(overrides: Partial<OperatorWorkFacts> = {}): OperatorWorkFacts {
  return {
    kind: "obligation",
    phase: "discovery@7",
    instance: "clarify-scope@3:subject-1:package@1#digest",
    definition: "clarify-scope@3",
    subject: "subject-1",
    scenario: "resolve-scope@2",
    dispatchable: true,
    authorityRequirements: [],
    explanation: "The exact scope decision is unresolved.",
    status: "ready",
    blockedBy: [],
    blockerChains: [],
    unresolvedBindings: [],
    ...overrides,
  };
}

describe("package-neutral Operator Outcome classification", () => {
  it("classifies autonomous and delegated work as runnable Assignments", () => {
    expect(classifyOperatorOutcome([work()]).kind).toBe("assignment");
    expect(classifyOperatorOutcome([work({
      authorityRequirements: [{
        policy: "independent-participation@4",
        authorityRequirement: {
          mode: "delegated",
          authority: "separate-authority",
          delegationAllowed: false,
        },
        attentionSchedule: {
          timing: "none",
          checkpoint: null,
          consolidationGroup: null,
        },
      }],
    })]).kind).toBe("assignment");
  });

  it("classifies immediate attended work with its exact authority requirement", () => {
    const classified = classifyOperatorOutcome([
      work({ instance: "autonomous@1:ITM-r00001:process" }),
      work({
      authorityRequirements: [{
        policy: "scope-authority@9",
        authorityRequirement: {
          mode: "attended",
          authority: "scope-owner",
          delegationAllowed: false,
        },
        attentionSchedule: {
          timing: "immediate",
          checkpoint: null,
          consolidationGroup: null,
        },
      }],
    }),
    ]);

    expect(classified).toEqual(expect.objectContaining({
      kind: "attention-required",
      authorityRequirement: {
        mode: "attended",
        authority: "scope-owner",
        delegationAllowed: false,
      },
      explanation: "The exact scope decision is unresolved.",
    }));
  });

  it("continues eligible work before an inactive checkpoint", () => {
    const checkpointQuestion = work({
      instance: "question@1:QUE-ONE-r00001:package@1#digest",
      subject: "QUE-ONE-r00001",
      authorityRequirements: [{
        policy: "question-participation@1",
        authorityRequirement: {
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
        },
        attentionSchedule: {
          timing: "checkpoint",
          checkpoint: "definition-gate",
          consolidationGroup: "stakeholder-questions",
        },
      }],
    });

    expect(classifyOperatorOutcome(
      [checkpointQuestion, work({ instance: "autonomous@1:ITM-r00001:process" })],
      null,
      [],
    )).toEqual(expect.objectContaining({
      kind: "assignment",
      work: expect.objectContaining({
        instance: "autonomous@1:ITM-r00001:process",
      }),
    }));
  });

  it("consolidates every compatible Question at an active checkpoint before other work", () => {
    const checkpointRequirement = {
      policy: "question-participation@1",
      authorityRequirement: {
        mode: "attended" as const,
        authority: "stakeholder",
        delegationAllowed: false,
      },
      attentionSchedule: {
        timing: "checkpoint" as const,
        checkpoint: "definition-gate",
        consolidationGroup: "stakeholder-questions",
      },
    };
    const question = (
      stableId: string,
      impact: string,
    ): OperatorWorkFacts => work({
      instance: `question@1:${stableId}-r00001:package@1#digest`,
      subject: `${stableId}-r00001`,
      authorityRequirements: [checkpointRequirement],
      exactSubject: {
        identity: {
          id: stableId,
          revisionId: `${stableId}-r00001`,
          type: "QUE",
          revision: 1,
        },
        payload: {
          question: `Question for ${stableId}`,
          blocking_impact: impact,
        },
        links: [],
        body: "",
      },
    });

    const classified = classifyOperatorOutcome(
      [
        work({
          instance: "authorize-gate@1:SNP-r00001:package@1#digest",
          authorityRequirements: [{
            policy: "gate-participation@1",
            authorityRequirement: {
              mode: "attended",
              authority: "stakeholder",
              delegationAllowed: false,
            },
            attentionSchedule: {
              timing: "immediate",
              checkpoint: null,
              consolidationGroup: null,
            },
          }],
        }),
        {
          ...question("QUE-TWO", "The second choice changes the interface."),
          authorityRequirements: [{
            ...checkpointRequirement,
            attentionSchedule: {
              ...checkpointRequirement.attentionSchedule,
              checkpoint: "later-gate",
            },
          }, checkpointRequirement],
        },
        question("QUE-ONE", "The first choice changes product scope."),
        {
          ...question("QUE-THREE", "The third choice awaits exact source freezing."),
          dispatchable: false,
        },
      ],
      null,
      ["definition-gate"],
    );

    expect(JSON.stringify(classified)).not.toContain("rawTranscript");
    expect(classified).toEqual(expect.objectContaining({
      kind: "attention-required",
      work: expect.objectContaining({
        subject: "QUE-TWO-r00001",
      }),
      attentionSchedule: checkpointRequirement.attentionSchedule,
      checkpointConversation: {
        checkpoint: "definition-gate",
        consolidationGroup: "stakeholder-questions",
        items: [
          expect.objectContaining({
            exactSubject: expect.objectContaining({
              identity: expect.objectContaining({ revisionId: "QUE-TWO-r00001" }),
              payload: expect.objectContaining({
                blocking_impact: "The second choice changes the interface.",
              }),
            }),
          }),
          expect.objectContaining({
            exactSubject: expect.objectContaining({
              identity: expect.objectContaining({ revisionId: "QUE-ONE-r00001" }),
              payload: expect.objectContaining({
                blocking_impact: "The first choice changes product scope.",
              }),
            }),
          }),
          expect.objectContaining({
            exactSubject: expect.objectContaining({
              identity: expect.objectContaining({ revisionId: "QUE-THREE-r00001" }),
              payload: expect.objectContaining({
                blocking_impact: "The third choice awaits exact source freezing.",
              }),
            }),
          }),
        ],
        conversation: {
          format: "freeform",
          semanticMapping: "harness",
          transcriptStorage: "none-by-default",
          publication: "serial-with-reevaluation",
          checkpointScheduling: "not-deferral",
        },
      },
    }));
  });

  it("classifies package-declared successful terminal outcomes when no work can advance", () => {
    const profileBoundary = classifyOperatorOutcome([], {
      outcome: "profile-boundary-reached",
      explanation: "The selected profile intentionally stops before deployment.",
      omittedCoverage: {
        profile: ["deployment"],
        phase: ["deployment evidence"],
      },
      evidence: {
        profile: "bounded@1",
        condition: { source: "true", result: true, selectors: [] },
      },
    });
    const lifecycleComplete = classifyOperatorOutcome([], {
      outcome: "lifecycle-complete",
      explanation: "Every package-declared lifecycle objective is satisfied.",
      evidence: {
        profile: "complete@1",
        condition: { source: "true", result: true, selectors: [] },
      },
    });

    expect(profileBoundary).toEqual(expect.objectContaining({
      kind: "profile-boundary-reached",
      explanation: expect.stringContaining("intentionally stops"),
    }));
    expect(lifecycleComplete).toEqual(expect.objectContaining({
      kind: "lifecycle-complete",
      explanation: expect.stringContaining("lifecycle objective"),
    }));
    if (profileBoundary.kind !== "profile-boundary-reached") {
      throw new Error(`unexpected outcome: ${profileBoundary.kind}`);
    }
    if (lifecycleComplete.kind !== "lifecycle-complete") {
      throw new Error(`unexpected outcome: ${lifecycleComplete.kind}`);
    }
    expect(classifyOperatorOutcome([work()], {
      outcome: "profile-boundary-reached",
      explanation: "Work takes precedence over a matched terminal condition.",
      omittedCoverage: { profile: [], phase: [] },
      evidence: {
        profile: "bounded@1",
        condition: { source: "true", result: true, selectors: [] },
      },
    }).kind).toBe("assignment");
  });

  it("reports a Process Dead End with exact blocker diagnostics", () => {
    const classified = classifyOperatorOutcome([work({
      dispatchable: false,
      status: "blocked",
      blockedBy: ["source-required@1:source-1:package@1#digest"],
      blockerChains: [[
        "clarify-scope@3:subject-1:package@1#digest",
        "source-required@1:source-1:package@1#digest",
      ]],
    })]);

    expect(classified).toEqual({
      kind: "process-dead-end",
      explanation: "The supported profile is unfinished, but no Assignment or immediate Attention Requirement can advance it.",
      blockers: [expect.objectContaining({
        instance: "clarify-scope@3:subject-1:package@1#digest",
        status: "blocked",
        blockedBy: ["source-required@1:source-1:package@1#digest"],
      })],
    });
  });
});

