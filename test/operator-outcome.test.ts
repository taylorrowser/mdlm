import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  classifyOperatorOutcome,
  type OperatorWorkFacts,
} from "../src/operator-outcome.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import { terminalProcessRepository } from "./helpers/terminal-process-package.js";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");

function mdlm(repository: string, ...arguments_: string[]) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function mdlmWithInput(
  repository: string,
  input: string,
  ...arguments_: string[]
) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function recordInstalledPackageChange(
  repository: string,
  packageRoot: string,
): Promise<void> {
  const digest = await processPackageDigest(packageRoot);
  for (const relativePath of [
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ]) {
    const contractPath = path.join(repository, relativePath);
    const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
    contract.package.digest = digest;
    await fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  }
}

async function publishCheckpointQuestions(repository: string): Promise<void> {
  const packageRoot = path.join(
    repository,
    ".lifecycle/packages/mdlm-bootstrap@0.59.0",
  );
  const phasePath = path.join(packageRoot, "phases/phase-0-wayfinding.yaml");
  const phase = parse(await fs.readFile(phasePath, "utf8"));
  phase.attention_checkpoints[0].readiness = "true";
  await fs.writeFile(phasePath, stringify(phase));
  const obligationPath = path.join(
    packageRoot,
    "obligations/open-question-resolution.yaml",
  );
  const obligation = parse(await fs.readFile(obligationPath, "utf8"));
  obligation.status_rules[0].when = "false";
  await fs.writeFile(obligationPath, stringify(obligation));
  await recordInstalledPackageChange(repository, packageRoot);

  const first = JSON.parse(mdlm(repository, "next").stdout);
  const packet = JSON.parse(mdlm(
    repository,
    "scenario",
    "prepare",
    first.assignment.id,
  ).stdout);
  const questions = [
    ["Choose the retained boundary", "Which boundary should remain?", "The answer changes product scope."],
    ["Choose the public name", "Which name should be public?", "The answer changes the public label."],
  ].map(([title, question, blockingImpact], index) => ({
    localId: `question-${index + 1}`,
    name: "questions",
    invocation: 0,
    lifecycleDatum: {
      type: "QST",
      payload: {
        title,
        kind: "preferential",
        question,
        state: "open",
        blocking_impact: blockingImpact,
        attention_checkpoint: "phase-0-gate",
        consolidation_group: "phase-0-stakeholder-questions",
      },
      links: [],
      body: "Checkpoint-scheduled stakeholder question.\n",
    },
  }));
  const submitted = mdlmWithInput(
    repository,
    `${JSON.stringify({
      contract: "mdlm-assignment-response@1",
      assignment: first.assignment.id,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Checkpoint conversation tracer",
              purpose: "Exercise consolidated stakeholder attention.",
              frontier: ["Resolve the checkpoint questions"],
            },
            links: [],
            body: "Public operator-seam checkpoint tracer.\n",
          },
        }, ...questions],
        completionEvidence: { summary: "Map and checkpoint questions proposed." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies: [],
        standingDelegations: [],
      },
    })}\n`,
    "scenario",
    "submit",
  );
  expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
}

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

describe("public mdlm outcome and status seam", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-operator-outcome-"));
    repository = path.join(parent, "repository");
    const initialized = mdlm(parent, "init", repository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("reports status without allocating an Assignment", async () => {
    const status = mdlm(repository, "status", "--json");

    expect(status.status, `${status.stderr}${status.stdout}`).toBe(0);
    expect(JSON.parse(status.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "status",
      contract: "mdlm-status@1",
      package: expect.objectContaining({ reference: "mdlm-bootstrap@0.59.0" }),
      profile: expect.objectContaining({ reference: "bootstrap@34" }),
      integrity: { status: "valid", diagnostics: [] },
      activePhase: expect.objectContaining({
        reference: "phase-0-wayfinding@4",
        purpose: expect.any(String),
      }),
      omittedCoverage: expect.objectContaining({
        profile: expect.any(Array),
        phase: expect.any(Array),
      }),
      recentTransaction: { available: false },
      unresolvedWork: expect.objectContaining({ total: expect.any(Number) }),
      currentOutcome: expect.objectContaining({
        outcome: "assignment",
        assignment: { allocation: "not-allocated" },
      }),
      drillDownCommands: expect.arrayContaining([
        "mdlm next",
        "mdlm loose-ends --json",
      ]),
      diagnostics: [],
    }));
    const readable = mdlm(repository, "status");
    expect(readable.status, `${readable.stderr}${readable.stdout}`).toBe(0);
    expect(readable.stdout).toContain("Active Phase: phase-0-wayfinding@4");
    expect(readable.stdout).toContain("Current Operator Outcome: assignment");
    await expect(fs.stat(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });

    const allocated = JSON.parse(mdlm(repository, "next").stdout);
    const withLease = JSON.parse(mdlm(repository, "status", "--json").stdout);
    expect(withLease.currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "active", id: allocated.assignment.id },
    });
    expect(JSON.parse(mdlm(repository, "next").stdout).assignment)
      .toEqual(allocated.assignment);
  });

  it("returns immediate attended work with an exact Assignment and Authority Requirement", () => {
    const outcome = classifyOperatorOutcome([work({
      authorityRequirements: [{
        policy: "question-participation@1",
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
    })]);

    expect(outcome).toEqual(expect.objectContaining({
      kind: "attention-required",
      authorityRequirement: {
        mode: "attended",
        authority: "stakeholder",
        delegationAllowed: false,
      },
      attentionSchedule: expect.objectContaining({ timing: "immediate" }),
    }));
  });

  it("projects one complete checkpoint conversation and the first exact Assignment", async () => {
    await publishCheckpointQuestions(repository);

    const next = mdlm(repository, "next");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome).toEqual(expect.objectContaining({
      ok: true,
      contract: "mdlm-next@1",
      outcome: "attention-required",
      assignment: { id: expect.any(String) },
      authorityRequirement: {
        mode: "attended",
        authority: "stakeholder",
        delegationAllowed: false,
      },
      attentionSchedule: {
        timing: "checkpoint",
        checkpoint: "phase-0-gate",
        consolidationGroup: "phase-0-stakeholder-questions",
      },
      checkpointConversation: {
        checkpoint: "phase-0-gate",
        consolidationGroup: "phase-0-stakeholder-questions",
        items: [
          expect.objectContaining({
            exactSubject: expect.objectContaining({
              identity: expect.objectContaining({ type: "QST" }),
              payload: expect.objectContaining({
                question: expect.any(String),
                blocking_impact: expect.any(String),
              }),
            }),
          }),
          expect.objectContaining({
            exactSubject: expect.objectContaining({
              identity: expect.objectContaining({ type: "QST" }),
              payload: expect.objectContaining({
                question: expect.any(String),
                blocking_impact: expect.any(String),
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
    const revisions = outcome.checkpointConversation.items.map(
      (item: { exactSubject: { identity: { revisionId: string } } }) =>
        item.exactSubject.identity.revisionId,
    );
    expect(new Set(revisions).size).toBe(2);

    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const packet = JSON.parse(prepared.stdout);
    expect(packet.checkpointConversation).toEqual(outcome.checkpointConversation);
    expect(packet.exactInputs).toHaveLength(1);
    expect(packet.exactInputs[0].inputs[0].values[0].identity.revision_id)
      .toBe(revisions[0]);
    expect(JSON.stringify(packet)).not.toContain("rawTranscript");
  });

  it("resolves the package-declared default from multiple valid profiles", async () => {
    const packageRoot = path.join(
      repository,
      ".lifecycle/packages/mdlm-bootstrap@0.59.0",
    );
    const bootstrapProfilePath = path.join(packageRoot, "profiles/bootstrap.yaml");
    const alternateProfilePath = path.join(packageRoot, "profiles/alternate.yaml");
    const alternateProfile = (await fs.readFile(bootstrapProfilePath, "utf8"))
      .replace("id: bootstrap", "id: alternate");
    await fs.writeFile(alternateProfilePath, alternateProfile);
    const manifestPath = path.join(packageRoot, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    manifest.profiles = {
      default: "alternate@34",
      available: [
        "profiles/bootstrap.yaml@34",
        "profiles/alternate.yaml@34",
      ],
    };
    await fs.writeFile(manifestPath, stringify(manifest));
    await recordInstalledPackageChange(repository, packageRoot);

    const status = mdlm(repository, "status", "--json");

    expect(status.status, `${status.stderr}${status.stdout}`).toBe(0);
    expect(JSON.parse(status.stdout).profile).toEqual(expect.objectContaining({
      reference: "alternate@34",
    }));
  });

  it("classifies package-declared Phase progression as immediate attended work", async () => {
    const packageRoot = path.join(
      repository,
      ".lifecycle/packages/mdlm-bootstrap@0.59.0",
    );
    await fs.writeFile(
      path.join(packageRoot, "phases/phase-0-wayfinding.yaml"),
      `kind: phase-definition
id: phase-0-wayfinding
version: 2
order: 0
name: Progression-only profile
purpose: Prove package-declared progression remains reachable operator work.
coverage: bootstrap-subset
omitted_capabilities: [all other lifecycle work]
entry: 'true'
scenarios: [establish-initial-wayfinding-map@1, record-consequential-decision@1]
obligations: [initial-wayfinding-map-required@1]
outputs: [MAP, DEC]
progression:
  next_phase: phase-1-product-assurance
  readiness: 'exists("current-wayfinding-maps@1", {})'
  authorization:
    condition: 'false'
    policy_ref: phase-progression-participation@1
    arguments: {phase: 'phase'}
    scenario: record-consequential-decision@1
    subjects: 'select("current-wayfinding-maps@1", {})'
    evidence_selector: applicable-disposition-decisions-for@1
gate:
  required: false
  candidate_selector: 'select("current-wayfinding-maps@1", {})'
  candidate_as: candidate
  obligation: candidate-gate-signoff@3
  completion: 'true'
`,
    );
    const obligationsRoot = path.join(packageRoot, "obligations");
    for (const file of await fs.readdir(obligationsRoot)) {
      if (!file.endsWith(".yaml") || file === "initial-wayfinding-map-required.yaml") {
        continue;
      }
      const obligationPath = path.join(obligationsRoot, file);
      const obligation = parse(await fs.readFile(obligationPath, "utf8"));
      const phases = (obligation.phases as string[]).filter(
        (phase) => phase !== "phase-0-wayfinding",
      );
      obligation.phases = phases.length > 0
        ? phases
        : ["phase-1-product-assurance"];
      await fs.writeFile(obligationPath, stringify(obligation));
    }
    await recordInstalledPackageChange(repository, packageRoot);

    const first = JSON.parse(mdlm(repository, "next").stdout);
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      first.assignment.id,
    ).stdout);
    const submitted = mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment: first.assignment.id,
        kind: "proposal",
        proposal: {
          outputs: [{
            localId: "map",
            name: "map",
            invocation: 0,
            lifecycleDatum: {
              type: "MAP",
              payload: {
                title: "Phase progression fixture",
                purpose: "Supply one exact progression authorization subject.",
                frontier: ["Authorize the package-declared next Phase"],
              },
              links: [],
              body: "A progression authorization subject.\n",
            },
          }],
          completionEvidence: { summary: "Progression subject proposed." },
          loadedSkillRefs: packet.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario",
      "submit",
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const mapRevision = JSON.parse(submitted.stdout).execution.outputs[0]
      .lifecycleDatum.revisionId as string;
    const status = JSON.parse(mdlm(repository, "status", "--json").stdout);
    expect(status.unresolvedWork).toEqual({
      total: 1,
      dispatchable: 1,
      byStatus: { "awaiting-authority": 1 },
    });
    expect(status.currentOutcome).toEqual(expect.objectContaining({
      outcome: "attention-required",
      assignment: { allocation: "not-allocated" },
    }));

    const next = mdlm(repository, "next");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const outcome = JSON.parse(next.stdout);
    expect(outcome).toEqual(expect.objectContaining({
      contract: "mdlm-next@1",
      outcome: "attention-required",
      assignment: { id: expect.any(String) },
      authorityRequirement: {
        mode: "attended",
        authority: "stakeholder",
        delegationAllowed: false,
      },
    }));
    const progressionPacket = mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
    );
    expect(
      progressionPacket.status,
      `${progressionPacket.stderr}${progressionPacket.stdout}`,
    ).toBe(0);
    expect(JSON.parse(progressionPacket.stdout)).toEqual(expect.objectContaining({
      phase: "phase-0-wayfinding@2",
      scenario: expect.objectContaining({
        reference: "record-consequential-decision@1",
      }),
      exactInputs: [expect.objectContaining({
        inputs: [expect.objectContaining({
          name: "subject",
          values: [expect.objectContaining({
            identity: expect.objectContaining({ revision_id: mapRevision }),
          })],
        })],
      })],
    }));
  });

  it("returns a declared Profile Boundary with omitted coverage and exact condition evidence", async () => {
    repository = await terminalProcessRepository(parent, {
      profile_boundary: {
        condition: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
        explanation: "This exact profile intentionally omits external breadth.",
      },
    });

    const next = mdlm(repository, "next");
    const status = mdlm(repository, "status", "--json");
    const readableStatus = mdlm(repository, "status");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: true,
      contract: "mdlm-next@1",
      outcome: "profile-boundary-reached",
      phase: "phase-0-terminal@1",
      explanation: "This exact profile intentionally omits external breadth.",
      omittedCoverage: {
        profile: ["broader fixture coverage"],
        phase: ["external fixture work"],
      },
      evidence: {
        profile: "terminal@1",
        condition: {
          source: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
          result: true,
          selectors: [{
            selector: "terminal-evidence@1",
            arguments: {},
            result: [],
          }],
        },
      },
      diagnostics: [],
    }));
    expect(status.status, `${status.stderr}${status.stdout}`).toBe(0);
    expect(JSON.parse(status.stdout).currentOutcome).toEqual(
      expect.objectContaining({
        outcome: "profile-boundary-reached",
        omittedCoverage: expect.objectContaining({
          phase: ["external fixture work"],
        }),
        evidence: expect.objectContaining({ profile: "terminal@1" }),
      }),
    );
    expect(readableStatus.stdout).toContain(
      "Current Operator Outcome: profile-boundary-reached",
    );
    expect(readableStatus.stdout).toContain(
      "Terminal Evidence: terminal@1",
    );
  });

  it("returns Lifecycle Complete only from its explicit package condition", async () => {
    repository = await terminalProcessRepository(parent, {
      lifecycle_complete: {
        condition: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
        explanation: "Every lifecycle objective selected by this package is complete.",
      },
    });

    const next = mdlm(repository, "next");
    const status = mdlm(repository, "status", "--json");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: true,
      contract: "mdlm-next@1",
      outcome: "lifecycle-complete",
      explanation: "Every lifecycle objective selected by this package is complete.",
      evidence: {
        profile: "terminal@1",
        condition: {
          source: 'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"',
          result: true,
          selectors: [{
            selector: "terminal-evidence@1",
            arguments: {},
            result: [],
          }],
        },
      },
      diagnostics: [],
    }));
    expect(JSON.parse(status.stdout).currentOutcome).toEqual(
      expect.objectContaining({
        outcome: "lifecycle-complete",
        evidence: expect.objectContaining({ profile: "terminal@1" }),
      }),
    );
  });

  it("returns Invalid when exact terminal conditions are ambiguous", async () => {
    repository = await terminalProcessRepository(parent, {
      profile_boundary: {
        condition: 'none("terminal-evidence@1", {})',
        explanation: "The profile boundary holds.",
      },
      lifecycle_complete: {
        condition: 'phase.id == "phase-0-terminal"',
        explanation: "Lifecycle completion also holds.",
      },
    });

    const next = mdlm(repository, "next");

    expect(next.status).toBe(1);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: false,
      contract: "mdlm-next@1",
      outcome: "invalid",
      diagnostics: [expect.objectContaining({
        code: "ambiguous-terminal-outcomes",
      })],
    }));
  });

  it("returns Process Dead End successfully with blocker diagnostics", async () => {
    repository = await terminalProcessRepository(parent);

    const next = mdlm(repository, "next");

    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: true,
      contract: "mdlm-next@1",
      outcome: "process-dead-end",
      phase: "phase-0-terminal@1",
      explanation: expect.stringContaining("unfinished"),
      blockers: [],
      diagnostics: [],
    }));
  });

  it("returns versioned Invalid for malformed repository selection JSON", async () => {
    await fs.writeFile(
      path.join(repository, ".lifecycle/process-selection.json"),
      "{not-json\n",
    );

    const next = mdlm(repository, "next");

    expect(next.status).toBe(1);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      contract: "mdlm-next@1",
      outcome: "invalid",
      integrity: { status: "invalid" },
      diagnostics: [expect.objectContaining({
        code: "process-package-selection-invalid",
      })],
    }));
  });

  it("returns Invalid with a nonzero command status for integrity failure", async () => {
    await fs.appendFile(
      path.join(
        repository,
        ".lifecycle/packages/mdlm-bootstrap@0.59.0/manifest.yaml",
      ),
      "\n# integrity failure\n",
    );

    const next = mdlm(repository, "next");

    expect(next.status).toBe(1);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      contract: "mdlm-next@1",
      outcome: "invalid",
      integrity: { status: "invalid" },
      diagnostics: [expect.objectContaining({
        code: "process-package-selection-mismatch",
      })],
    }));
    const status = mdlm(repository, "status", "--json");
    expect(status.status).toBe(1);
    expect(JSON.parse(status.stdout)).toEqual(expect.objectContaining({
      contract: "mdlm-status@1",
      integrity: { status: "invalid" },
      currentOutcome: expect.objectContaining({ outcome: "invalid" }),
    }));
  });
});
