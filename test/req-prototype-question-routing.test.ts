import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");
const prototypeCommit = "5aa48c450047a414586a599b5083f638a7434414";
const prototypeEvidence = {
  repository_ref: `git:${prototypeCommit}`,
  supported_behavior: [
    "converts Celsius to Fahrenheit",
    "converts Fahrenheit to Celsius",
  ],
  unsupported_behavior: ["Kelvin conversion"],
  finding_if_supported:
    "The exact prototype supports the two declared conversions and deliberately excludes Kelvin.",
  finding_if_not_supported:
    "The exact prototype does not establish the declared bounded behavior.",
};

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${relative}\n`);
      if (entry.isDirectory()) await visit(absolute);
      else hash.update(await fs.readFile(absolute));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

interface CreatedDatum {
  id: string;
  revisionId: string;
}

describe("req prototype-bound empirical question routing", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-prototype-route-"));
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      examplePackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  function createQuestion(
    title: string,
    extraSets: string[] = [],
  ): CreatedDatum {
    const arguments_ = [
      "new",
      "QST",
      "--scenario",
      "chart-wayfinding-map@1",
      "--set",
      `title=${title}`,
      "--set",
      "kind=empirical",
      "--set",
      "evidence_available=true",
      "--set",
      "question=Does the exact converter prototype discriminate its bounded behavior?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=Prototype feasibility remains unrecorded",
    ];
    for (const value of extraSets) arguments_.push("--set", value);
    const created = req(repositoryRoot, ...arguments_, "--json");
    expect(created.status, `${created.stderr}${created.stdout}`).toBe(0);
    return JSON.parse(created.stdout).created;
  }

  function createUnfrozenPrototypeQuestion(): CreatedDatum {
    return createQuestion("Exact converter prototype", [
      "resolution_evidence=prototype",
      `prototype_evidence=${JSON.stringify(prototypeEvidence)}`,
    ]);
  }

  async function freezeSourceBoundary(
    question: CreatedDatum,
    boundaryId = "BSL-012345678B",
  ): Promise<{ boundary: CreatedDatum; execution: Record<string, unknown> }> {
    const obligation = looseEnds().find((candidate) =>
      candidate.obligation === "source-boundary-required" &&
      candidate.subject === question.revisionId
    );
    expect(obligation).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      eventualResolver: "freeze-source-boundary@1",
      actionableResolver: "freeze-source-boundary@1",
    }));
    const executable = await adapter({
      outputs: [{
        name: "boundary",
        invocation: 0,
        lifecycleDatum: {
          id: boundaryId,
          type: "BSL",
          payload: {
            title: "Exact source boundary",
            kind: "source-boundary",
            role: "source-boundary",
            scope: question.revisionId,
            group: "SAME-LINEAGE",
            definition_members: [question.revisionId],
            evidence: [],
          },
          links: [],
          body: "Freezes exactly the editable source Revision.\n",
        },
      }],
      completionEvidence: { summary: "Exact source Revision frozen." },
    }, "source-boundary-adapter.mjs");
    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "freeze-source-boundary@1",
      "--obligation",
      String((obligation as { id: string }).id),
      "--adapter",
      executable,
      "--input",
      `source=${question.revisionId}`,
      "--json",
    );
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const execution = JSON.parse(result.stdout).execution;
    return { boundary: execution.outputs[0].lifecycleDatum, execution };
  }

  async function createPrototypeQuestion(): Promise<CreatedDatum> {
    const question = createUnfrozenPrototypeQuestion();
    await freezeSourceBoundary(question);
    return question;
  }

  function looseEnds(): Record<string, unknown>[] {
    const result = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    return JSON.parse(result.stdout).looseEnds.items;
  }

  async function adapter(response: unknown, name: string): Promise<string> {
    const executable = path.join(repositoryRoot, name);
    await fs.writeFile(
      executable,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
      { mode: 0o755 },
    );
    return executable;
  }

  function successfulOutputs(question: CreatedDatum) {
    return [
      {
        name: "prototype",
        invocation: 0,
        lifecycleDatum: {
          id: "ART-0123456789",
          type: "ART",
          payload: {
            title: "Exact temperature converter prototype",
            kind: "prototype",
            repository_ref: prototypeEvidence.repository_ref,
            supported_behavior: prototypeEvidence.supported_behavior,
            unsupported_behavior: prototypeEvidence.unsupported_behavior,
            evidence_refs: ["npm test"],
          },
          links: [{ type: "derived-from", target: question.revisionId }],
          body: "Exact bounded prototype evidence.\n",
        },
      },
      {
        name: "finding",
        invocation: 0,
        lifecycleDatum: {
          id: "DEC-012345678A",
          type: "DEC",
          payload: {
            title: "Bounded prototype finding",
            rationale: "The exact target was exercised within its declared boundary.",
            kind: "decision",
            decision: prototypeEvidence.finding_if_supported,
            alternatives: [prototypeEvidence.finding_if_not_supported],
            effective_scope: prototypeEvidence.repository_ref,
          },
          links: [
            { type: "resolves", target: question.revisionId },
            { type: "justifies", target: "ART-0123456789-r00001" },
          ],
          body: "No conclusion is made outside the two declared conversions.\n",
        },
      },
      {
        name: "updated_question",
        invocation: 0,
        lifecycleDatum: {
          id: question.id,
          type: "QST",
          payload: {
            title: "Exact converter prototype",
            kind: "empirical",
            question: "Does the exact converter prototype discriminate its bounded behavior?",
            state: "answered",
            blocking_impact: "Prototype feasibility is recorded at one exact target",
            resolution_evidence: "prototype",
            prototype_evidence: prototypeEvidence,
          },
          links: [],
          body: "Answered only for the exact bounded prototype target.\n",
        },
      },
    ];
  }

  async function routeQuestionToPrototype(
    question: CreatedDatum,
  ): Promise<CreatedDatum> {
    const executable = await adapter({
      outputs: [{
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          id: "MAP-012345678D",
          type: "MAP",
          payload: {
            title: "Prototype routing frontier",
            purpose: "Route the preserved empirical question to exact prototype evidence.",
            frontier: ["Bounded temperature-converter feasibility"],
          },
          links: [{ type: "indexes", target: question.id }],
          body: "Indexes the preserved question without restating its claim.\n",
        },
      }, {
        name: "questions",
        invocation: 0,
        lifecycleDatum: {
          id: question.id,
          type: "QST",
          payload: {
            title: "Exact converter prototype",
            kind: "empirical",
            evidence_available: true,
            question: "Does the exact converter prototype discriminate its bounded behavior?",
            state: "open",
            blocking_impact: "Prototype feasibility remains unrecorded",
            resolution_evidence: "prototype",
            prototype_evidence: prototypeEvidence,
          },
          links: [],
          body: "Routes the preserved lineage to one exact prototype target.\n",
        },
      }],
      completionEvidence: { summary: "Preserved question routed to exact evidence." },
    }, "chart-prototype-route-adapter.mjs");
    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "chart-wayfinding-map@1",
      "--initiate",
      "--adapter",
      executable,
      "--json",
    );
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const output = JSON.parse(result.stdout).execution.outputs.find(
      (candidate: { name: string }) => candidate.name === "questions",
    );
    return output.lifecycleDatum;
  }

  function prototypeObligation(question: CreatedDatum): Record<string, unknown> {
    const obligation = looseEnds().find((candidate) =>
      candidate.obligation === "prototype-question-resolution" &&
      candidate.subject === question.revisionId
    );
    expect(obligation).toBeDefined();
    return obligation!;
  }

  it("keeps a generic empirical QST on the non-prototype resolution path", async () => {
    const question = createQuestion("Generic empirical evidence");

    expect(looseEnds()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "open-question-resolution",
        subject: question.revisionId,
        status: "blocked",
        dispatchable: false,
        eventualResolver: "resolve-question@2",
        actionableResolver: "freeze-source-boundary@1",
      }),
    ]));
    expect(looseEnds()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "prototype-question-resolution",
        subject: question.revisionId,
      }),
    ]));

    await freezeSourceBoundary(question);

    expect(looseEnds()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "open-question-resolution",
        subject: question.revisionId,
        status: "ready",
        dispatchable: true,
        eventualResolver: "resolve-question@2",
        actionableResolver: "resolve-question@2",
      }),
    ]));
  });

  it("rejects a mutable Git target in authored prototype-bound Lifecycle Data", () => {
    const result = req(
      repositoryRoot,
      "new",
      "QST",
      "--scenario",
      "chart-wayfinding-map@1",
      "--set",
      "title=Mutable prototype target",
      "--set",
      "kind=empirical",
      "--set",
      "question=Can a moving target establish the finding?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=No exact evidence boundary exists",
      "--set",
      "resolution_evidence=prototype",
      "--set",
      `prototype_evidence=${JSON.stringify({
        ...prototypeEvidence,
        repository_ref: "git:main",
      })}`,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "datum-payload" })]),
    );
  });

  it("discovers and atomically freezes the exact source before same-lineage resolution", async () => {
    const question = createUnfrozenPrototypeQuestion();

    expect(prototypeObligation(question)).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      eventualResolver: "resolve-question-with-prototype@2",
      actionableResolver: "freeze-source-boundary@1",
    }));

    const { boundary, execution } = await freezeSourceBoundary(question);
    expect(execution).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@1",
      status: "completed",
      definition: {
        obligation: "source-boundary-required@1",
        scenario: "freeze-source-boundary@1",
      },
      outputs: [expect.objectContaining({
        name: "boundary",
        data: expect.objectContaining({
          created_by: expect.objectContaining({
            scenario: "freeze-source-boundary@1",
            prompt_ref: "prompts/freeze-source-boundary.md@1",
          }),
        }),
      })],
    }));
    expect(boundary).toEqual(expect.objectContaining({
      type: "BSL",
      revisionId: "BSL-012345678B-r00001",
    }));
    const verified = req(
      repositoryRoot,
      "baseline",
      "verify",
      boundary.revisionId,
      "--json",
    );
    expect(verified.status, `${verified.stderr}${verified.stdout}`).toBe(0);
    expect(JSON.parse(verified.stdout).baselineVerification).toEqual(
      expect.objectContaining({
        baselineRevision: boundary.revisionId,
        valid: true,
        definitionMembers: [question.revisionId],
        evidence: [],
      }),
    );
    const boundaryShown = req(
      repositoryRoot,
      "show",
      boundary.revisionId,
      "--json",
    );
    expect(
      boundaryShown.status,
      `${boundaryShown.stderr}${boundaryShown.stdout}`,
    ).toBe(0);
    expect(
      JSON.parse(boundaryShown.stdout).lifecycleDatum.integrity
        .scenario_execution_valid,
    ).toBe(true);
    const shown = req(repositoryRoot, "show", question.revisionId, "--json");
    expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
    expect(JSON.parse(shown.stdout).lifecycleDatum.storage).toEqual({
      editable: false,
      frozen: true,
    });
    expect(prototypeObligation(question)).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "resolve-question-with-prototype@2",
    }));
  }, 45_000);

  it("does not accept a piecemeal boundary claiming the authored Scenario", async () => {
    const question = createUnfrozenPrototypeQuestion();
    const borrowed = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "freeze-source-boundary@1",
      "--set",
      "title=Forged source boundary",
      "--set",
      "kind=source-boundary",
      "--set",
      "role=source-boundary",
      "--set",
      `scope=${question.revisionId}`,
      "--set",
      "group=SAME-LINEAGE",
      "--json",
    );
    expect(borrowed.status, `${borrowed.stderr}${borrowed.stdout}`).toBe(0);
    const borrowedBoundary = JSON.parse(borrowed.stdout).created;
    const borrowedId = borrowedBoundary.id;
    expect(req(
      repositoryRoot,
      "baseline",
      "add",
      borrowedId,
      question.revisionId,
      "--json",
    ).status).toBe(0);
    expect(req(
      repositoryRoot,
      "baseline",
      "freeze",
      borrowedId,
      "--json",
    ).status).toBe(0);
    const forged = req(
      repositoryRoot,
      "show",
      borrowedBoundary.revisionId,
      "--json",
    );
    expect(forged.status, `${forged.stderr}${forged.stdout}`).toBe(0);
    expect(
      JSON.parse(forged.stdout).lifecycleDatum.integrity
        .scenario_execution_valid,
    ).toBe(false);

    expect(prototypeObligation(question)).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      actionableResolver: "freeze-source-boundary@1",
    }));
    await freezeSourceBoundary(question);
    expect(prototypeObligation(question)).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "resolve-question-with-prototype@2",
    }));
  }, 45_000);

  it.each([
    "missing source",
    "extra member",
    "wrong source",
    "mismatched scope",
    "extra evidence",
  ])(
    "publishes neither a boundary nor execution for %s",
    async (failure) => {
    const question = createUnfrozenPrototypeQuestion();
    const unrelated = createQuestion("Unrelated exact question");
    const obligation = looseEnds().find((candidate) =>
      candidate.obligation === "source-boundary-required" &&
      candidate.subject === question.revisionId
    ) as { id: string };
    expect(obligation).toBeDefined();
    const executable = await adapter({
      outputs: [{
        name: "boundary",
        invocation: 0,
        lifecycleDatum: {
          id: "BSL-012345678C",
          type: "BSL",
          payload: {
            title: "Incomplete source boundary",
            kind: "source-boundary",
            role: "source-boundary",
            scope: failure === "mismatched scope"
              ? unrelated.revisionId
              : question.revisionId,
            group: "SAME-LINEAGE",
            definition_members: failure === "missing source"
              ? []
              : failure === "extra member"
              ? [question.revisionId, unrelated.revisionId]
              : failure === "wrong source"
              ? [unrelated.revisionId]
              : [question.revisionId],
            evidence: failure === "extra evidence"
              ? [unrelated.revisionId]
              : [],
          },
          links: [],
          body: "The exact source is missing.\n",
        },
      }],
      completionEvidence: { summary: "Must not publish." },
    }, "invalid-source-boundary-adapter.mjs");
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "freeze-source-boundary@1",
      "--obligation",
      obligation.id,
      "--adapter",
      executable,
      "--input",
      `source=${question.revisionId}`,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "scenario-completion-failed" }),
      ]),
    );
    expect(await treeDigest(path.join(repositoryRoot, ".lifecycle"))).toBe(before);
  });

  it("dry-runs the exact target, bounded claims, complete contract, and package instructions", async () => {
    const question = await createPrototypeQuestion();
    const obligation = prototypeObligation(question);

    const result = req(
      repositoryRoot,
      "scenario",
      "dry-run",
      "resolve-question-with-prototype@2",
      "--obligation",
      String(obligation.id),
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );

    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const dryRun = JSON.parse(result.stdout).scenarioDryRun;
    expect(dryRun).toEqual(expect.objectContaining({
      executable: true,
      sideEffectFree: true,
      authorization: {
        mode: "dispatchable-obligation",
        obligation: obligation.id,
      },
      obligation: expect.objectContaining({
        instance: obligation.id,
        subject: question.revisionId,
        dispatchable: true,
      }),
      prohibitedInputs: [
        "conclusion outside the two declared bounded findings",
        "mutable repository reference",
        "prototype finding represented as RUN or RES evidence",
        "unstated prototype observation",
      ],
      policies: expect.arrayContaining([expect.objectContaining({
        role: "review",
        reference: "review-applicability@1",
      })]),
      expectedOutputs: [
        {
          name: "prototype",
          types: ["ART"],
          cardinality: "one",
          requiredLinks: [{ link: "derived-from", target: { input: "question" } }],
        },
        {
          name: "finding",
          types: ["DEC"],
          cardinality: "one",
          requiredLinks: [
            { link: "resolves", target: { input: "question" } },
            { link: "justifies", target: { output: "prototype" } },
          ],
        },
        {
          name: "updated_question",
          types: ["QST"],
          cardinality: "one",
          requiredLinks: [],
        },
      ],
      completion: expect.objectContaining({
        status: "pending-output",
        expression: expect.stringContaining(
          "prototype.payload.repository_ref == question.payload.prototype_evidence.repository_ref",
        ),
      }),
    }));
    expect(dryRun.invocations).toEqual([{
      inputs: [expect.objectContaining({
        name: "question",
        values: [expect.objectContaining({
          identity: expect.objectContaining({ revision_id: question.revisionId }),
          data: expect.objectContaining({
            payload: expect.objectContaining({
              resolution_evidence: "prototype",
              prototype_evidence: prototypeEvidence,
            }),
          }),
        })],
        checks: expect.arrayContaining([
          expect.objectContaining({ check: "resolution", passed: true }),
          expect.objectContaining({ check: "condition", passed: true }),
        ]),
      })],
    }]);
    expect(dryRun.prompt).toEqual(expect.objectContaining({
      reference: "prompts/resolve-question-with-prototype.md@2",
      content: await fs.readFile(
        path.join(examplePackage, "prompts/resolve-question-with-prototype.md"),
        "utf8",
      ),
      skills: await Promise.all([
        "lifecycle-data",
        "prototyping",
        "reproducibility",
        "clarification-protocol",
        "scope-challenge",
      ].map(async (skill) => expect.objectContaining({
        reference: `skills/${skill}.md@1`,
        content: await fs.readFile(
          path.join(examplePackage, `skills/${skill}.md`),
          "utf8",
        ),
      }))),
    }));
  });

  it("preserves repeated source boundaries through charting and prototype resolution", async () => {
    const originalQuestion = createQuestion("Preserved empirical question");
    await freezeSourceBoundary(originalQuestion);
    const question = await routeQuestionToPrototype(originalQuestion);
    expect(question).toEqual(expect.objectContaining({
      id: originalQuestion.id,
      revisionId: `${originalQuestion.id}-r00002`,
    }));
    await freezeSourceBoundary(question, "BSL-012345678D");
    const obligation = prototypeObligation(question);
    const executable = await adapter({
      outputs: successfulOutputs(question),
      completionEvidence: {
        commands: ["npm test"],
        target: prototypeEvidence.repository_ref,
      },
    }, "successful-prototype-adapter.mjs");

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question-with-prototype@2",
      "--obligation",
      String(obligation.id),
      "--adapter",
      executable,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );

    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    const execution = JSON.parse(result.stdout).execution;
    expect(execution).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@2",
      status: "completed",
      participation: [{
        policy: "question-participation@1",
        authorityRequirement: {
          mode: "autonomous",
          authority: "evidence-authority",
          delegationAllowed: false,
        },
        attentionSchedule: {
          timing: "none",
          checkpoint: null,
          consolidationGroup: null,
        },
        transactionBatching: "single",
      }],
      definition: {
        obligation: "prototype-question-resolution@1",
        scenario: "resolve-question-with-prototype@2",
      },
      authorization: {
        mode: "dispatchable-obligation",
        obligation: obligation.id,
      },
      completion: expect.objectContaining({
        contractValid: true,
        expressionPassed: true,
      }),
      outputs: [
        expect.objectContaining({
          name: "prototype",
          lifecycleDatum: expect.objectContaining({
            id: "ART-0123456789",
            revisionId: "ART-0123456789-r00001",
            type: "ART",
          }),
          data: expect.objectContaining({
            payload: expect.objectContaining({
              repository_ref: prototypeEvidence.repository_ref,
              supported_behavior: prototypeEvidence.supported_behavior,
              unsupported_behavior: prototypeEvidence.unsupported_behavior,
            }),
          }),
        }),
        expect.objectContaining({
          name: "finding",
          lifecycleDatum: expect.objectContaining({
            revisionId: "DEC-012345678A-r00001",
            type: "DEC",
          }),
          data: expect.objectContaining({
            payload: expect.objectContaining({
              decision: prototypeEvidence.finding_if_supported,
              effective_scope: prototypeEvidence.repository_ref,
            }),
          }),
        }),
        expect.objectContaining({
          name: "updated_question",
          lifecycleDatum: expect.objectContaining({
            id: question.id,
            revision: 3,
            revisionId: `${question.id}-r00003`,
            type: "QST",
          }),
          data: expect.objectContaining({
            payload: expect.objectContaining({ state: "answered" }),
          }),
        }),
      ],
    }));
    for (const output of execution.outputs) {
      expect(output.data.created_by).toEqual(expect.objectContaining({
        scenario: "resolve-question-with-prototype@2",
        prompt_ref: "prompts/resolve-question-with-prototype.md@2",
        process_ref: expect.stringMatching(/^mdlm-bootstrap@0\.56\.0#sha256:/),
        policy_refs: [
          "question-participation@1",
          "review-applicability@1",
          "waiver-applicability@1",
        ],
      }));
    }
    const history = req(repositoryRoot, "history", question.id, "--json");
    expect(history.status, `${history.stderr}${history.stdout}`).toBe(0);
    expect(JSON.parse(history.stdout).history.revisions).toEqual([
      expect.objectContaining({
        revision: 1,
        revisionId: originalQuestion.revisionId,
        classification: "frozen-history",
        frozenBy: ["BSL-012345678B-r00001"],
      }),
      expect.objectContaining({
        revision: 2,
        revisionId: question.revisionId,
        classification: "frozen-history",
        frozenBy: ["BSL-012345678D-r00001"],
      }),
      expect.objectContaining({
        revision: 3,
        revisionId: `${question.id}-r00003`,
        classification: "editable-work",
        frozenBy: [],
      }),
    ]);
    expect(looseEnds()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "prototype-question-resolution",
        subject: question.revisionId,
      }),
    ]));
  }, 30_000);

  it.each([
    ["unsupported conclusion", "scenario-completion-failed"],
    ["mutable prototype output", "scenario-completion-failed"],
    ["incomplete output batch", "scenario-output-cardinality-invalid"],
    ["RUN evidence substitution", "scenario-output-type-invalid"],
    ["RES evidence substitution", "scenario-output-type-invalid"],
  ])("publishes nothing for %s", async (failure, diagnosticCode) => {
    const question = await createPrototypeQuestion();
    const obligation = prototypeObligation(question);
    const outputs = structuredClone(successfulOutputs(question));
    if (failure === "unsupported conclusion") {
      outputs[1]!.lifecycleDatum.payload.decision =
        "The prototype proves production readiness for all temperature scales.";
    } else if (failure === "mutable prototype output") {
      outputs[0]!.lifecycleDatum.payload.repository_ref = "git:main";
    } else if (failure === "incomplete output batch") {
      outputs.pop();
    } else {
      outputs[0]!.lifecycleDatum.type = failure.startsWith("RUN") ? "RUN" : "RES";
    }
    const executable = await adapter({
      outputs,
      completionEvidence: { summary: "This response must not publish." },
    }, `failure-${diagnosticCode}.mjs`);
    const before = await treeDigest(path.join(repositoryRoot, ".lifecycle"));

    const result = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question-with-prototype@2",
      "--obligation",
      String(obligation.id),
      "--adapter",
      executable,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: diagnosticCode })]),
    );
    expect(await treeDigest(path.join(repositoryRoot, ".lifecycle"))).toBe(before);
  }, 15_000);

  it("routes an explicitly prototype-bound empirical QST to the prototype-producing Resolver", async () => {
    const question = await createPrototypeQuestion();

    expect(looseEnds()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "prototype-question-resolution",
        subject: question.revisionId,
        status: "ready",
        dispatchable: true,
        eventualResolver: "resolve-question-with-prototype@2",
        actionableResolver: "resolve-question-with-prototype@2",
        resolver: expect.objectContaining({
          scenario: "resolve-question-with-prototype@2",
          expectedOutputs: [
            expect.objectContaining({ name: "prototype", types: ["ART"] }),
            expect.objectContaining({ name: "finding", types: ["DEC"] }),
            expect.objectContaining({ name: "updated_question", types: ["QST"] }),
          ],
        }),
      }),
    ]));
    expect(looseEnds()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligation: "open-question-resolution",
        subject: question.revisionId,
      }),
    ]));
  });
});
