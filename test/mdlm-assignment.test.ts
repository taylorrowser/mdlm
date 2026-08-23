import { spawn, spawnSync } from "node:child_process";
import { constants, promises as fs, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
  PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
} from "../scripts/root-test-observation-policy.mjs";
import { assignmentResponseSchema } from "../src/assignment.js";
import { executeCommandApplication } from "../src/command-application.js";
import { validateScenarioSkillProvenance } from "../src/scenario-execution.js";

const CONTENDED_INITIALIZATION_SETUP_HOOK_TIMEOUT_MS = PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;
const CONTENDED_SETUP_HOOK_TIMEOUT_MS = 20_000;
const CONTENDED_CORRECTION_SETUP_HOOK_TIMEOUT_MS = PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;
const CONTENDED_TEST_SETUP_HOOK_TIMEOUT_MS = 20_000;
const CONTENDED_ASSIGNMENT_BARRIER_TIMEOUT_MS = 30_000;
const CONTENDED_PUBLICATION_BARRIER_TIMEOUT_MS = 30_000;
const CONTENDED_ASSIGNMENT_RACE_TIMEOUT_MS = 75_000;
const CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS = 75_000;

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const initialWayfindingSkillRefs = [
  "skills/lifecycle-data.md@1",
  "skills/wayfinding-map.md@1",
  "skills/clarification-protocol.md@1",
  "skills/scope-challenge.md@2",
  "skills/author-preflight.md@2",
];

async function invokeMdlm(
  repository: string,
  arguments_: string[],
  input?: string,
) {
  const execution = await executeCommandApplication(
    arguments_,
    repository,
    input,
  );
  return {
    status: execution.exitCode,
    stdout: execution.output,
    stderr: "",
  };
}

function mdlm(repository: string, ...arguments_: string[]) {
  return invokeMdlm(repository, arguments_);
}

function mdlmWithInput(repository: string, input: string, ...arguments_: string[]) {
  return invokeMdlm(repository, arguments_, input);
}

function spawnMdlmWithInput(
  repository: string,
  input: string,
  environment: NodeJS.ProcessEnv,
) {
  const child = spawn(
    process.execPath,
    [mdlmExecutable, "scenario", "submit"],
    {
      cwd: repository,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => stdout += chunk);
  child.stderr.on("data", (chunk: string) => stderr += chunk);
  child.stdin.end(input);
  const closed = new Promise<number | null>((resolve) =>
    child.on("close", resolve)
  );
  return { child, closed, output: () => ({ stdout, stderr }) };
}

async function waitForFilesystemCondition(
  directory: string,
  condition: () => Promise<boolean>,
  message: string,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const watcher = watch(directory, () => void observe());
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      watcher.close();
      reject(new Error(message));
    }, timeoutMs);
    const observe = async () => {
      try {
        if (!await condition() || settled) return;
        settled = true;
        clearTimeout(timeout);
        watcher.close();
        resolve();
      } catch {
        // The observed event was unrelated to the condition.
      }
    };
    void observe();
  });
}

function waitForPath(
  target: string,
  message: string,
  timeoutMs = 10_000,
): Promise<void> {
  return waitForFilesystemCondition(
    path.dirname(target),
    async () => fs.access(target).then(() => true),
    message,
    timeoutMs,
  );
}

function waitForDirectoryEntry(
  directory: string,
  predicate: (entry: string) => boolean,
  message: string,
  timeoutMs = 10_000,
): Promise<void> {
  return waitForFilesystemCondition(
    directory,
    async () => (await fs.readdir(directory)).some(predicate),
    message,
    timeoutMs,
  );
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

function holdRepositoryLock(
  repository: string,
  reference: string,
  pid: number,
): string {
  const owner = spawnSync(
    "git",
    ["-C", repository, "hash-object", "-w", "--stdin"],
    {
      encoding: "utf8",
      input: `${JSON.stringify({
        expiresAt: Date.now() + 60_000,
        pid,
        token: `test-${reference}`,
      })}\n`,
    },
  );
  expect(owner.status, owner.stderr).toBe(0);
  const objectId = owner.stdout.trim();
  const locked = git(
    repository,
    "update-ref",
    reference,
    objectId,
    "0000000000000000000000000000000000000000",
  );
  expect(locked.status, locked.stderr).toBe(0);
  return objectId;
}

function holdPublicationLock(repository: string, pid: number): string {
  return holdRepositoryLock(
    repository,
    "refs/mdlm/publication-lock",
    pid,
  );
}

type PreparedPromptPacket = {
  prompt: { skills: { reference: string }[] };
  responseSchema: {
    oneOf: {
      properties: {
        kind: { const?: string };
        unable?: { properties?: { reason?: { enum?: string[] } } };
      };
    }[];
  };
};

type AssignmentTemplateState = {
  assignment: string;
  packet: PreparedPromptPacket;
  loadedSkillRefs: string[];
  validResponse: ReturnType<typeof wayfindingResponse>;
  correctionDiagnostics: unknown[];
};

async function directoryBytes(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(path.relative(root, absolute));
    }
  }
  await visit(root);
  const content = await Promise.all(files.sort().map(async (file) => [
    file,
    (await fs.readFile(path.join(root, file))).toString("base64"),
  ]));
  return JSON.stringify(content);
}

function wayfindingResponse(assignment: string, loadedSkillRefs: string[]) {
  return {
    contract: "mdlm-assignment-response@1",
    assignment,
    kind: "proposal",
    proposal: {
      outputs: [{
        localId: "map",
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          type: "MAP",
          payload: {
            title: "Initial product wayfinding",
            purpose: "Bound the first product-intent conversation.",
            frontier: ["$proposal.product-intent.revision_id"],
          },
          links: [{
            type: "indexes",
            target: "$proposal.product-intent.id",
          }],
          body: "One exact initial decision frontier.\n",
        },
      }, {
        localId: "product-intent",
        name: "product_intent",
        invocation: 0,
        lifecycleDatum: {
          type: "QST",
          payload: {
            title: "Clarify the intended product outcome",
            kind: "preferential",
            intent_scope: "product",
            question: "Which exact product outcome should this repository pursue?",
            state: "open",
            blocking_impact: "Product intent cannot advance without this answer.",
          },
          links: [],
          body: "One exact stakeholder question.\n",
        },
      }],
      completionEvidence: {
        summary: "The initial decision frontier is explicit.",
      },
      loadedSkillRefs,
      authoritySupplies: [],
      standingDelegations: [],
    },
  };
}

describe("MDLM Assignment leasing and preparation", () => {
  let templateParent: string;
  let initializedTemplateRepository: string;
  let activeTemplateRepository: string;
  let correctionTemplateRepository: string;
  let templateAssignment: string;
  let templatePacket: PreparedPromptPacket;
  let templateLoadedSkillRefs: string[];
  let templateState: AssignmentTemplateState;
  let parent: string;
  let repository: string;

  const copyRepository = (source: string, destination: string) =>
    fs.cp(source, destination, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
    });

  beforeAll(async () => {
    templateParent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-assignment-template-"));
    initializedTemplateRepository = path.join(templateParent, "initialized");
    activeTemplateRepository = path.join(templateParent, "active");
    correctionTemplateRepository = path.join(templateParent, "correction-required");

    const initialized = await mdlm(
      templateParent,
      "init",
      initializedTemplateRepository,
      "--json",
    );
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  }, CONTENDED_INITIALIZATION_SETUP_HOOK_TIMEOUT_MS);

  beforeAll(async () => {
    await copyRepository(initializedTemplateRepository, activeTemplateRepository);
  }, CONTENDED_SETUP_HOOK_TIMEOUT_MS);

  beforeAll(async () => {
    const allocated = await mdlm(activeTemplateRepository, "next");
    expect(allocated.status, `${allocated.stderr}${allocated.stdout}`).toBe(0);
    templateAssignment = JSON.parse(allocated.stdout).assignment.id as string;
    templateLoadedSkillRefs = initialWayfindingSkillRefs;
    templatePacket = {
      prompt: {
        skills: templateLoadedSkillRefs.map((reference) => ({ reference })),
      },
      responseSchema:
        assignmentResponseSchema() as PreparedPromptPacket["responseSchema"],
    };
  }, CONTENDED_SETUP_HOOK_TIMEOUT_MS);

  beforeAll(async () => {
    await copyRepository(activeTemplateRepository, correctionTemplateRepository);
    const dataBeforeCorrection = await directoryBytes(path.join(
      correctionTemplateRepository,
      ".lifecycle/data",
    ));
    const malformed = await mdlmWithInput(
      correctionTemplateRepository,
      "{not-json\n",
      "scenario",
      "submit",
    );
    expect(malformed.status).toBe(1);
    const malformedResult = JSON.parse(malformed.stdout);
    expect(malformedResult).toEqual(expect.objectContaining({
      ok: false,
      command: "scenario.submit",
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: templateAssignment },
      disposition: "correction-required",
      orchestration: {
        action: "correct-response",
        automaticReplacement: false,
      },
      malformedResponse: expect.objectContaining({
        attempt: 1,
        correctionsRemaining: 1,
        diagnostics: [expect.objectContaining({
          code: "assignment-response-invalid",
          path: "response",
        })],
      }),
    }));
    expect(await directoryBytes(path.join(
      correctionTemplateRepository,
      ".lifecycle/data",
    ))).toBe(dataBeforeCorrection);

    templateState = {
      assignment: templateAssignment,
      packet: templatePacket,
      loadedSkillRefs: templateLoadedSkillRefs,
      validResponse: wayfindingResponse(
        templateAssignment,
        templateLoadedSkillRefs,
      ),
      correctionDiagnostics: malformedResult.malformedResponse.diagnostics,
    };
  }, CONTENDED_CORRECTION_SETUP_HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-assignment-public-"));
    repository = path.join(parent, "repository");
  }, CONTENDED_TEST_SETUP_HOOK_TIMEOUT_MS);

  const useRepositoryTemplate = (kind: "initialized" | "active" | "correction") =>
    copyRepository(
      kind === "initialized"
        ? initializedTemplateRepository
        : kind === "correction"
          ? correctionTemplateRepository
          : activeTemplateRepository,
      repository,
    );

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(templateParent, { recursive: true, force: true });
  });

  it("allocates fresh exact work after an operator commit instead of reusing the pre-commit lease", async () => {
    await useRepositoryTemplate("initialized");
    const allocated = await mdlm(repository, "next", "--json");
    expect(allocated.status, `${allocated.stderr}${allocated.stdout}`).toBe(0);
    const staleAssignment = JSON.parse(allocated.stdout).assignment.id as string;
    const committed = git(repository, "commit", "--allow-empty", "-m", "Operator boundary");
    expect(committed.status, committed.stderr).toBe(0);
    const status = await mdlm(repository, "status", "--json");
    expect(status.status, `${status.stderr}${status.stdout}`).toBe(0);
    expect(JSON.parse(status.stdout).currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "not-allocated", id: staleAssignment },
    });

    const refreshed = await mdlm(repository, "next", "--json");
    expect(refreshed.status, `${refreshed.stderr}${refreshed.stdout}`).toBe(0);
    const freshAssignment = JSON.parse(refreshed.stdout).assignment.id as string;
    expect(freshAssignment).not.toBe(staleAssignment);

    const prepared = await mdlm(repository, "scenario", "prepare", freshAssignment, "--json");
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout).assignment.id).toBe(freshAssignment);
    const stale = await mdlm(repository, "assignment", "show", staleAssignment, "--json");
    expect(stale.status, `${stale.stderr}${stale.stdout}`).toBe(0);
    expect(JSON.parse(stale.stdout)).toMatchObject({ selected: false });
  }, CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS);

  it("leases one exact bundled-package Assignment and prepares its complete packet", async () => {
    await useRepositoryTemplate("initialized");
    const first = await mdlm(repository, "next");
    expect(first.status, `${first.stderr}${first.stdout}`).toBe(0);
    const outcome = JSON.parse(first.stdout);
    expect(outcome).toEqual(expect.objectContaining({
      ok: true,
      command: "next",
      contract: "mdlm-next@1",
      outcome: "assignment",
      assignment: { id: expect.any(String) },
      diagnostics: [],
    }));
    expect(outcome.assignment.id).toMatch(/^[0-9a-f-]{36}$/i);

    const repeated = await mdlm(repository, "next");
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout).assignment).toEqual(outcome.assignment);

    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8"));
    expect(lease).toEqual(
      expect.objectContaining({
        contract: "mdlm-assignment-lease@1",
        id: outcome.assignment.id,
        disposition: "active",
        package: expect.objectContaining({
          reference: "mdlm-bootstrap@0.74.0",
          digest: expect.stringMatching(/^sha256:/),
        }),
        repository: {
        head: expect.stringMatching(/^[0-9a-f]{40}$/),
        trackedState: expect.stringMatching(/^sha256:/),
      },
        phase: "phase-0-wayfinding@5",
        obligation: {
        instance: expect.stringContaining("initial-wayfinding-map-required@2:"),
        definition: "initial-wayfinding-map-required@2",
        subject: "phase-0-wayfinding@5",
      },
        scenario: "establish-initial-wayfinding-map@2",
        bindings: [{ invocation: 0, inputs: [] }],
        participation: [],
        retryAvailability: { malformedResponseCorrection: 1 },
      }),
    );

    const extraArgument = await mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
      "extra",
    );
    expect(extraArgument.status).toBe(1);
    expect(JSON.parse(extraArgument.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-prepare-arguments-invalid" }),
    ]);

    const looseObjectsBeforePrepare = git(
      repository,
      "count-objects",
      "-v",
    ).stdout;
    const prepared = await mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(git(repository, "count-objects", "-v").stdout).toBe(
      looseObjectsBeforePrepare,
    );
    const packet = JSON.parse(prepared.stdout);
    expect(Object.keys(packet).sort()).toEqual([
      "allowedProjections",
      "assets",
      "assignment",
      "authority",
      "command",
      "completion",
      "contract",
      "diagnostics",
      "exactInputs",
      "obligation",
      "ok",
      "outputLinks",
      "outputs",
      "package",
      "participation",
      "phase",
      "policies",
      "prohibitions",
      "prompt",
      "repository",
      "responseSchema",
      "scenario",
    ]);
    expect(packet).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.prepare",
      contract: "mdlm-assignment-packet@2",
      assignment: { id: outcome.assignment.id },
      package: {
        reference: lease.package.reference,
        digest: lease.package.digest,
        language: lease.package.language,
      },
      repository: lease.repository,
      phase: "phase-0-wayfinding@5",
      obligation: lease.obligation,
      scenario: expect.objectContaining({
        reference: "establish-initial-wayfinding-map@2",
      }),
      prompt: expect.objectContaining({
        reference: "prompts/establish-initial-wayfinding-map.md@2",
        content: expect.stringContaining("# Establish the initial wayfinding map"),
      }),
      assets: expect.arrayContaining([
        expect.objectContaining({
          reference: "prompts/establish-initial-wayfinding-map.md@2",
        }),
        expect.objectContaining({ reference: "skills/lifecycle-data.md@1" }),
        expect.objectContaining({ reference: "skills/wayfinding-map.md@1" }),
        expect.objectContaining({ reference: "skills/clarification-protocol.md@1" }),
        expect.objectContaining({ reference: "skills/scope-challenge.md@2" }),
      ]),
      exactInputs: [{ inputs: [] }],
      allowedProjections: expect.objectContaining({
        exactLifecycleData: [],
        inputSchemas: [],
        outputSchemas: expect.arrayContaining([
          expect.objectContaining({ type: "MAP" }),
          expect.objectContaining({ type: "QST" }),
        ]),
      }),
      policies: expect.arrayContaining([
        expect.objectContaining({
          role: "review",
          reference: "review-applicability@1",
        }),
        expect.objectContaining({
          role: "waiver",
          reference: "waiver-applicability@1",
        }),
      ]),
      participation: [],
      authority: {
        evidence: null,
        requirements: [],
        standingDelegation: null,
      },
      prohibitions: [
        "generated indexes as lifecycle truth",
        "unstated stakeholder preferences",
      ],
      outputs: expect.arrayContaining([
        expect.objectContaining({ name: "map", types: ["MAP"], cardinality: "one" }),
        expect.objectContaining({ name: "product_intent", types: ["QST"], cardinality: "one" }),
      ]),
      outputLinks: expect.any(Array),
      completion: expect.objectContaining({
        status: "pending-output",
        expression: expect.stringContaining("map.payload.frontier"),
      }),
      responseSchema: expect.objectContaining({
        $id: "https://mdlm.dev/contracts/mdlm-assignment-response@1",
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              assignment: { type: "string", minLength: 1 },
            }),
          }),
        ]),
      }),
      diagnostics: [],
    }));
    expect(packet.prompt.skills.map((skill: { reference: string }) =>
      skill.reference
    )).toEqual(initialWayfindingSkillRefs);
    const proposalSchema = packet.responseSchema.oneOf[0].properties.proposal;
    expect(proposalSchema.required).toContain("loadedSkillRefs");
    expect(proposalSchema.properties.outputs.items.required).toContain("localId");
    expect(proposalSchema.properties.outputs.items.properties.localId.description)
      .toContain("$proposal.<localId>.revision_id");

    expect(git(repository, "status", "--porcelain").stdout).toBe("");
    const ignored = git(
      repository,
      "check-ignore",
      ".lifecycle/work/active-assignment.json",
    );
    expect(ignored.status, ignored.stderr).toBe(0);
    expect(ignored.stdout).toBe(".lifecycle/work/active-assignment.json\n");
    expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);
  }, CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS);

  it("declares every typed inability and abandons one exact Assignment without publication", async () => {
    await useRepositoryTemplate("active");
    const reasons = [
      "stale-scope",
      "insufficient-declared-inputs",
      "prohibited-input-conflict",
      "ambiguity",
      "execution-failure",
    ];
    const unableSchema = templateState.packet.responseSchema.oneOf.find(
      (candidate) => candidate.properties.kind.const === "unable",
    );
    expect(unableSchema?.properties.unable?.properties?.reason?.enum)
      .toEqual(reasons);

    const reason = reasons[0]!;
    const dataRoot = path.join(repository, ".lifecycle/data");
    const before = await directoryBytes(dataRoot);
    const assignment = templateState.assignment;
    const diagnostic = {
      code: `unable-${reason}`,
      message: `The child cannot complete because of ${reason}.`,
      path: "assignment",
    };
    const unable = await mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment,
        kind: "unable",
        unable: { reason, diagnostics: [diagnostic] },
      })}\n`,
      "scenario",
      "submit",
    );

    expect(unable.status, `${unable.stderr}${unable.stdout}`).toBe(0);
    expect(JSON.parse(unable.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.submit",
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: assignment },
      disposition: "abandoned",
      orchestration: {
        action: "stop",
        automaticReplacement: false,
      },
      unable: { reason, diagnostics: [diagnostic] },
      diagnostics: [],
    }));
    expect(await directoryBytes(dataRoot)).toBe(before);

    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease).toEqual(expect.objectContaining({
      id: assignment,
      disposition: "abandoned",
      response: expect.objectContaining({
        kind: "unable",
        digest: expect.stringMatching(/^sha256:/),
        unable: { reason, diagnostics: [diagnostic] },
      }),
    }));

    const fresh = JSON.parse((await mdlm(repository, "next")).stdout);
    expect(fresh.outcome).toBe("assignment");
    expect(fresh.assignment.id).not.toBe(assignment);
  });

  it("preserves the same Assignment for one malformed-response correction that can publish", async () => {
    await useRepositoryTemplate("correction");
    const assignment = templateState.assignment;

    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect({
      outcome: "assignment",
      assignment: { allocation: lease.disposition, id: lease.id },
    }).toEqual({
      outcome: "assignment",
      assignment: { allocation: "active", id: assignment },
    });
    expect({ id: lease.id }).toEqual({ id: assignment });
    expect(lease).toEqual(expect.objectContaining({
      id: assignment,
      disposition: "active",
      retryAvailability: { malformedResponseCorrection: 0 },
      malformedResponses: [{
        digest: expect.stringMatching(/^sha256:/),
        diagnostics: templateState.correctionDiagnostics,
      }],
    }));

    const corrected = await mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment,
        kind: "proposal",
        proposal: {
          outputs: [{
            localId: "map",
            name: "map",
            invocation: 0,
            lifecycleDatum: {
              type: "MAP",
              payload: {
                title: "Corrected Assignment Response",
                purpose: "Prove one contract-form correction can publish.",
                frontier: ["$proposal.product-intent.revision_id"],
              },
              links: [{
                type: "indexes",
                target: "$proposal.product-intent.id",
              }],
              body: "The same Assignment publishes after one correction.\n",
            },
          }, {
            localId: "product-intent",
            name: "product_intent",
            invocation: 0,
            lifecycleDatum: {
              type: "QST",
              payload: {
                title: "Corrected initial product intent",
                kind: "preferential",
                intent_scope: "product",
                question: "Which exact product should this work pursue?",
                state: "open",
                blocking_impact: "PSP compilation waits for the attended answer.",
              },
              links: [],
              body: "The corrected response includes the required product-intent Question.\n",
            },
          }],
          completionEvidence: { summary: "The corrected response is complete." },
          loadedSkillRefs: templateState.loadedSkillRefs,
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario",
      "submit",
    );

    expect(corrected.status, `${corrected.stderr}${corrected.stdout}`).toBe(0);
    expect(JSON.parse(corrected.stdout)).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@4",
      execution: expect.objectContaining({
        response: expect.objectContaining({ assignment }),
      }),
    }));
  }, CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS);

  it("exhausts the Assignment on a second malformed response and reports the terminal disposition", async () => {
    await useRepositoryTemplate("correction");
    const assignment = templateState.assignment;
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));

    const second = await mdlmWithInput(repository, "{]\n", "scenario", "submit");

    expect(second.status).toBe(1);
    const exhausted = JSON.parse(second.stdout);
    expect(exhausted).toEqual(expect.objectContaining({
      ok: false,
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: assignment },
      disposition: "exhausted",
      orchestration: {
        action: "stop",
        automaticReplacement: false,
      },
      malformedResponse: expect.objectContaining({
        attempt: 2,
        correctionsRemaining: 0,
      }),
    }));
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);
    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease.disposition).toBe("exhausted");
    expect(lease.malformedResponses).toHaveLength(2);
    expect({
      outcome: "assignment",
      assignment: {
        allocation: lease.disposition === "active" ? "active" : "not-allocated",
      },
    }).toEqual({
      outcome: "assignment",
      assignment: { allocation: "not-allocated" },
    });

    const prepared = await mdlm(repository, "scenario", "prepare", assignment);
    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
    const fresh = JSON.parse((await mdlm(repository, "next")).stdout);
    expect(fresh.assignment.id).not.toBe(assignment);
  }, CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS);

  it("serializes public publication and marks intervening tracked changes stale without charging a malformed retry", async () => {
    await useRepositoryTemplate("active");
    const assignment = templateState.assignment;
    const response = `${JSON.stringify(templateState.validResponse)}\n`;
    const lockOwner = holdPublicationLock(repository, process.pid);
    const staged = waitForDirectoryEntry(
      path.join(repository, ".lifecycle"),
      (entry) => entry.startsWith(".scenario-") && entry.endsWith(".tmp"),
      "Public submission did not stage publication",
      CONTENDED_PUBLICATION_BARRIER_TIMEOUT_MS,
    );
    const child = spawn(
      process.execPath,
      [mdlmExecutable, "scenario", "submit"],
      { cwd: repository, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout += chunk);
    child.stderr.on("data", (chunk: string) => stderr += chunk);
    child.stdin.end(response);

    await staged;
    expect(child.exitCode).toBeNull();
    await fs.appendFile(
      path.join(repository, ".gitignore"),
      "# Intervening tracked publication input.\n",
    );
    expect(git(
      repository,
      "update-ref",
      "-d",
      "refs/mdlm/publication-lock",
      lockOwner,
    ).status).toBe(0);
    const status = await new Promise<number | null>((resolve) =>
      child.on("close", resolve)
    );

    expect(status, `${stderr}${stdout}`).toBe(1);
    expect(JSON.parse(stdout)).toEqual(expect.objectContaining({
      disposition: "stale",
      diagnostics: [expect.objectContaining({ code: "assignment-stale" })],
    }));
    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease).toEqual(expect.objectContaining({
      disposition: "stale",
      malformedResponses: [],
    }));
  });

  it("allows only one concurrent valid response to publish for an Assignment", async () => {
    await useRepositoryTemplate("active");
    const assignment = templateState.assignment;
    const response = `${JSON.stringify(templateState.validResponse)}\n`;
    const stagingRoot = path.join(repository, ".lifecycle");
    const barrierRoot = path.join(parent, "valid-response-barrier");
    const publicationSignal = path.join(barrierRoot, "publication-lock-attempted");
    const publicationRelease = path.join(barrierRoot, "publication-lock-release");
    const barrierSignal = path.join(barrierRoot, "assignment-lock-attempted");
    await fs.mkdir(barrierRoot);
    const gitWrapper = path.join(barrierRoot, "git");
    await fs.writeFile(gitWrapper, `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
if (process.argv.includes("refs/mdlm/publication-lock") && process.env.MDLM_TEST_PUBLICATION_SIGNAL) {
  fs.writeFileSync(process.env.MDLM_TEST_PUBLICATION_SIGNAL, "");
  const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(process.env.MDLM_TEST_PUBLICATION_RELEASE)) Atomics.wait(sleepBuffer, 0, 0, 25);
}
if (process.argv.includes("refs/mdlm/assignment-lease-lock") && process.env.MDLM_TEST_LOCK_SIGNAL) {
  fs.writeFileSync(process.env.MDLM_TEST_LOCK_SIGNAL, "");
}
const env = { ...process.env, PATH: process.env.MDLM_TEST_REAL_PATH };
delete env.MDLM_TEST_LOCK_SIGNAL;
delete env.MDLM_TEST_PUBLICATION_RELEASE;
delete env.MDLM_TEST_PUBLICATION_SIGNAL;
delete env.MDLM_TEST_REAL_PATH;
const result = spawnSync("git", process.argv.slice(2), { env, stdio: "inherit" });
process.exit(result.status ?? 1);
`);
    await fs.chmod(gitWrapper, 0o755);
    const first = spawnMdlmWithInput(repository, response, {
      ...process.env,
      PATH: `${barrierRoot}:${process.env.PATH}`,
      MDLM_TEST_PUBLICATION_RELEASE: publicationRelease,
      MDLM_TEST_PUBLICATION_SIGNAL: publicationSignal,
      MDLM_TEST_REAL_PATH: process.env.PATH,
    });
    await waitForPath(
      publicationSignal,
      "First submission did not reach publication",
      CONTENDED_PUBLICATION_BARRIER_TIMEOUT_MS,
    );
    expect((await fs.readdir(stagingRoot)).filter((entry) =>
      entry.startsWith(".scenario-") && entry.endsWith(".tmp")
    )).toHaveLength(1);
    const second = spawnMdlmWithInput(repository, response, {
      ...process.env,
      PATH: `${barrierRoot}:${process.env.PATH}`,
      MDLM_TEST_LOCK_SIGNAL: barrierSignal,
      MDLM_TEST_REAL_PATH: process.env.PATH,
    });
    await waitForPath(
      barrierSignal,
      "Second valid response did not reach the Assignment lock",
      CONTENDED_ASSIGNMENT_BARRIER_TIMEOUT_MS,
    );
    expect((await fs.readdir(stagingRoot)).filter((entry) =>
      entry.startsWith(".scenario-") && entry.endsWith(".tmp")
    )).toHaveLength(1);
    expect(second.child.exitCode).toBeNull();
    await fs.writeFile(publicationRelease, "");

    const [firstStatus, secondStatus] = await Promise.all([
      first.closed,
      second.closed,
    ]);
    const firstOutput = first.output();
    const secondOutput = second.output();
    expect(firstStatus, `${firstOutput.stderr}${firstOutput.stdout}`).toBe(0);
    expect(secondStatus, `${secondOutput.stderr}${secondOutput.stdout}`).toBe(1);
    expect(JSON.parse(secondOutput.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
    const transactionsRoot = path.join(
      repository,
      ".lifecycle/data/.transactions",
    );
    expect(await fs.readdir(transactionsRoot)).toHaveLength(1);
  }, CONTENDED_ASSIGNMENT_TEST_TIMEOUT_MS);

  it.each([
    ["malformed", "a fresh Assignment", "{not-json\n", false],
    ["unable", "newer Assignment coordinates that retain its id", undefined, true],
  ] as const)(
    "does not let a %s response overwrite %s",
    async (kind, _newerLease, malformedSource, retainAssignmentId) => {
      await useRepositoryTemplate("active");
      const assignment = templateState.assignment;
      const validResponse = `${JSON.stringify(templateState.validResponse)}\n`;
      const losingResponse = malformedSource ?? `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment,
        kind: "unable",
        unable: {
          reason: "execution-failure",
          diagnostics: [{
            code: "unable-execution-failure",
            message: "The concurrent worker could not complete.",
            path: "assignment",
          }],
        },
      })}\n`;
      const leaseLockRef = "refs/mdlm/assignment-lease-lock";
      const barrierRoot = path.join(parent, "git-barrier");
      const barrierSignal = path.join(barrierRoot, "lease-lock-attempted");
      const barrierRelease = path.join(barrierRoot, "release");
      await fs.mkdir(barrierRoot);
      const gitWrapper = path.join(barrierRoot, "git");
      await fs.writeFile(gitWrapper, `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
if (process.argv.includes("${leaseLockRef}")) {
  fs.writeFileSync(process.env.MDLM_TEST_LOCK_SIGNAL, "");
  while (!fs.existsSync(process.env.MDLM_TEST_LOCK_RELEASE)) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}
const env = { ...process.env, PATH: process.env.MDLM_TEST_REAL_PATH };
delete env.MDLM_TEST_LOCK_SIGNAL;
delete env.MDLM_TEST_LOCK_RELEASE;
delete env.MDLM_TEST_REAL_PATH;
const result = spawnSync("git", process.argv.slice(2), { env, stdio: "inherit" });
process.exit(result.status ?? 1);
`);
      await fs.chmod(gitWrapper, 0o755);
      const losing = spawnMdlmWithInput(repository, losingResponse, {
        ...process.env,
        PATH: `${barrierRoot}:${process.env.PATH}`,
        MDLM_TEST_LOCK_SIGNAL: barrierSignal,
        MDLM_TEST_LOCK_RELEASE: barrierRelease,
        MDLM_TEST_REAL_PATH: process.env.PATH,
      });
      await waitForPath(
        barrierSignal,
        `${kind} response did not reach the Assignment lease lock`,
        CONTENDED_ASSIGNMENT_BARRIER_TIMEOUT_MS,
      );

      const winning = spawnMdlmWithInput(repository, validResponse, {
        ...process.env,
        MDLM_PERFORMANCE: "json",
      });
      const transactionsRoot = path.join(
        repository,
        ".lifecycle/data/.transactions",
      );
      const winningStatus = await winning.closed;
      const winningOutput = winning.output();
      expect(
        winningStatus,
        `${winningOutput.stderr}${winningOutput.stdout}`,
      ).toBe(0);
      const performance = JSON.parse(
        winningOutput.stderr.split("\n").find((line) => line.startsWith("{"))!,
      );
      expect(performance.repository.loads).toBe(1);
      expect(performance.stages).toEqual(expect.objectContaining({
        "repository.parse": expect.objectContaining({ count: 1 }),
        "repository.provenance": expect.objectContaining({ count: 1 }),
        "repository.validation": expect.objectContaining({ count: 1 }),
      }));
      expect(performance.work).toEqual(expect.objectContaining({
        "repository.parse.records": 0,
        "repository.provenance.records": 0,
        "repository.validation.records": 0,
      }));

      const fresh = JSON.parse((await mdlm(repository, "next")).stdout);
      expect(fresh.assignment.id).not.toBe(assignment);
      const activeLeasePath = path.join(
        repository,
        ".lifecycle/work/active-assignment.json",
      );
      const freshLeaseValue = JSON.parse(
        await fs.readFile(activeLeasePath, "utf8"),
      );
      if (retainAssignmentId) freshLeaseValue.id = assignment;
      const freshLease = `${JSON.stringify(freshLeaseValue, null, 2)}\n`;
      await fs.writeFile(activeLeasePath, freshLease);
      await fs.writeFile(barrierRelease, "continue");
      const losingStatus = await losing.closed;
      const losingOutput = losing.output();
      expect(
        losingStatus,
        `${losingOutput.stderr}${losingOutput.stdout}`,
      ).toBe(1);
      expect(JSON.parse(losingOutput.stdout).diagnostics).toEqual([
        expect.objectContaining({ code: "assignment-unavailable" }),
      ]);
      expect(await fs.readFile(activeLeasePath, "utf8")).toBe(freshLease);
      const transactions = await Promise.all(
        (await fs.readdir(transactionsRoot)).map((entry) =>
          fs.readFile(path.join(transactionsRoot, entry, "execution.json"), "utf8")
            .then(JSON.parse)
        ),
      );
      expect(transactions.filter((transaction) =>
        transaction.response?.assignment === assignment
      )).toHaveLength(1);
      const repositoryIntegrity = git(repository, "fsck", "--no-progress");
      expect(
        repositoryIntegrity.status,
        `${repositoryIntegrity.stderr}${repositoryIntegrity.stdout}`,
      ).toBe(0);
    },
    CONTENDED_ASSIGNMENT_RACE_TIMEOUT_MS,
  );

  it("stops a corrected response when tracked state became stale and publishes nothing", async () => {
    await useRepositoryTemplate("correction");
    const assignment = templateState.assignment;
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));
    await fs.appendFile(path.join(repository, ".gitignore"), "# stale correction\n");

    const corrected = await mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment,
        kind: "proposal",
        proposal: {
          outputs: [{
            localId: "map",
            name: "map",
            invocation: 0,
            lifecycleDatum: {
              type: "MAP",
              payload: {
                title: "Stale correction",
                purpose: "This proposal must not be rebased.",
                frontier: ["Stop on changed tracked state"],
              },
              links: [],
              body: "No publication is permitted.\n",
            },
          }],
          completionEvidence: {},
          loadedSkillRefs: templateState.loadedSkillRefs,
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario",
      "submit",
    );

    expect(corrected.status).toBe(1);
    expect(JSON.parse(corrected.stdout)).toEqual(expect.objectContaining({
      contract: "mdlm-assignment-disposition@1",
      assignment: { id: assignment },
      disposition: "stale",
      orchestration: {
        action: "stop",
        automaticReplacement: false,
      },
      diagnostics: [expect.objectContaining({ code: "assignment-stale" })],
    }));
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);
    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease.disposition).toBe("stale");

    expect(git(repository, "checkout", "--", ".gitignore").status).toBe(0);
    const fresh = JSON.parse((await mdlm(repository, "next")).stdout);
    expect(fresh.assignment.id).not.toBe(assignment);
  });

  it("accepts a cwd-relative Assignment Response file through the executable", async () => {
    await useRepositoryTemplate("active");
    const response = templateState.validResponse;
    const responseName = "assignment-response.json";
    await fs.writeFile(
      path.join(repository, responseName),
      `${JSON.stringify(response)}\n`,
    );

    const submitted = spawnSync(
      process.execPath,
      [mdlmExecutable, "scenario", "submit", responseName, "--json"],
      { cwd: repository, encoding: "utf8" },
    );

    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    expect(JSON.parse(submitted.stdout)).toEqual(expect.objectContaining({
      ok: true,
      contract: "mdlm-scenario-execution@4",
      execution: expect.objectContaining({
        response: expect.objectContaining({ assignment: templateState.assignment }),
      }),
    }));
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);

  it("rejects malformed Assignment Responses atomically", async () => {
    await useRepositoryTemplate("active");
    const loadedSkillRefs = templateState.loadedSkillRefs;
    const rejectionCases: {
      name: string;
      mutate(candidate: AssignmentTemplateState["validResponse"]): void;
    }[] = [
      {
        name: "missing-skill",
        mutate(candidate) {
          candidate.proposal.loadedSkillRefs = loadedSkillRefs.slice(0, -1);
        },
      },
      {
        name: "extra-skill",
        mutate(candidate) {
          candidate.proposal.loadedSkillRefs = [
            ...loadedSkillRefs,
            "skills/not-in-the-assignment.md@1",
          ];
        },
      },
      {
        name: "reversed-skills",
        mutate(candidate) {
          candidate.proposal.loadedSkillRefs = [...loadedSkillRefs].reverse();
        },
      },
      {
        name: "substituted-skill",
        mutate(candidate) {
          candidate.proposal.loadedSkillRefs = [
            "skills/not-in-the-assignment.md@1",
            ...loadedSkillRefs.slice(1),
          ];
        },
      },
    ];

    for (const [index, rejectionCase] of rejectionCases.entries()) {
      const invalid = structuredClone(templateState.validResponse);
      rejectionCase.mutate(invalid);
      const expectedDiagnostic = {
        code: "scenario-skill-provenance-mismatch",
        path: "establish-initial-wayfinding-map@2#skills",
        message: `Scenario Proposal must report exact Assignment skills in packet order; expected ${JSON.stringify(loadedSkillRefs)}, received ${JSON.stringify(invalid.proposal.loadedSkillRefs)}`,
      };
      if (index !== 0) {
        expect(validateScenarioSkillProvenance(
          "establish-initial-wayfinding-map@2",
          loadedSkillRefs,
          invalid.proposal.loadedSkillRefs,
        )).toEqual([expectedDiagnostic]);
        continue;
      }

      const responsePath = path.join(parent, `${rejectionCase.name}.json`);
      const before = git(repository, "diff", "--binary", "HEAD").stdout;
      await fs.writeFile(responsePath, `${JSON.stringify(invalid)}\n`);
      const rejected = await mdlm(
        repository,
        "scenario",
        "submit",
        "--json",
        responsePath,
      );
      expect(rejected.status).toBe(1);
      expect(JSON.parse(rejected.stdout)).toEqual(expect.objectContaining({
        disposition: "correction-required",
        diagnostics: expect.arrayContaining([
          expect.objectContaining(expectedDiagnostic),
        ]),
      }));
      expect(git(repository, "diff", "--binary", "HEAD").stdout).toBe(before);
      expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
        .toEqual([".gitkeep"]);
    }

    const identityRepository = path.join(parent, "repository-forged-identity");
    await copyRepository(activeTemplateRepository, identityRepository);
    const responsePath = path.join(parent, "forged-identity.json");
    const before = git(identityRepository, "diff", "--binary", "HEAD").stdout;
    const forgedIdentity = structuredClone(templateState.validResponse);
    Object.assign(forgedIdentity.proposal.outputs[0]!.lifecycleDatum, {
      id: "MAP-0123456789",
    });
    await fs.writeFile(responsePath, `${JSON.stringify(forgedIdentity)}\n`);
    const identityRejected = await mdlm(
      identityRepository,
      "scenario",
      "submit",
      responsePath,
    );
    expect(identityRejected.status).toBe(1);
    expect(JSON.parse(identityRejected.stdout)).toEqual(expect.objectContaining({
      disposition: "correction-required",
      diagnostics: [
        expect.objectContaining({ code: "scenario-output-identity-kernel-managed" }),
      ],
    }));
    expect(git(identityRepository, "diff", "--binary", "HEAD").stdout).toBe(before);
    expect((await fs.readdir(path.join(identityRepository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);
});
