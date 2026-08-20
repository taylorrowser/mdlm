import { spawn, spawnSync } from "node:child_process";
import { promises as fs, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");

function invokeMdlm(
  repository: string,
  arguments_: string[],
  input?: string,
) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
    maxBuffer: 10 * 1024 * 1024,
  });
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

async function waitForPath(target: string, message: string): Promise<void> {
  try {
    await fs.access(target);
    return;
  } catch {
    // Wait for the process-level barrier below.
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error(message));
    }, 10_000);
    const watcher = watch(path.dirname(target), async () => {
      try {
        await fs.access(target);
        clearTimeout(timeout);
        watcher.close();
        resolve();
      } catch {
        // The observed event was unrelated to the barrier.
      }
    });
  });
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
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-assignment-public-"));
    repository = path.join(parent, "repository");
    const initialized = mdlm(parent, "init", repository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("allocates fresh exact work after an operator commit instead of reusing the pre-commit lease", () => {
    const allocated = mdlm(repository, "next", "--json");
    expect(allocated.status, `${allocated.stderr}${allocated.stdout}`).toBe(0);
    const staleAssignment = JSON.parse(allocated.stdout).assignment.id as string;
    const committed = git(repository, "commit", "--allow-empty", "-m", "Operator boundary");
    expect(committed.status, committed.stderr).toBe(0);
    const status = mdlm(repository, "status", "--json");
    expect(status.status, `${status.stderr}${status.stdout}`).toBe(0);
    expect(JSON.parse(status.stdout).currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "not-allocated", id: staleAssignment },
    });

    const refreshed = mdlm(repository, "next", "--json");
    expect(refreshed.status, `${refreshed.stderr}${refreshed.stdout}`).toBe(0);
    const freshAssignment = JSON.parse(refreshed.stdout).assignment.id as string;
    expect(freshAssignment).not.toBe(staleAssignment);

    const prepared = mdlm(repository, "scenario", "prepare", freshAssignment, "--json");
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout).assignment.id).toBe(freshAssignment);
    const stale = mdlm(repository, "assignment", "show", staleAssignment, "--json");
    expect(stale.status, `${stale.stderr}${stale.stdout}`).toBe(0);
    expect(JSON.parse(stale.stdout)).toMatchObject({ selected: false });
  });

  it("leases one exact bundled-package Assignment and prepares its complete packet", async () => {
    const first = mdlm(repository, "next");
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

    const repeated = mdlm(repository, "next");
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
          reference: "mdlm-bootstrap@0.72.0",
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

    const extraArgument = mdlm(
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
    const prepared = mdlm(
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
  });

  it("accepts every typed inability, abandons the Assignment without publication, and requires a deliberate fresh next", async () => {
    const reasons = [
      "stale-scope",
      "insufficient-declared-inputs",
      "prohibited-input-conflict",
      "ambiguity",
      "execution-failure",
    ];
    const dataRoot = path.join(repository, ".lifecycle/data");
    const before = await directoryBytes(dataRoot);
    let assignment = JSON.parse(mdlm(repository, "next").stdout).assignment.id as string;

    for (const reason of reasons) {
      const diagnostic = {
        code: `unable-${reason}`,
        message: `The child cannot complete because of ${reason}.`,
        path: "assignment",
      };
      const unable = mdlmWithInput(
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

      const fresh = JSON.parse(mdlm(repository, "next").stdout);
      expect(fresh.outcome).toBe("assignment");
      expect(fresh.assignment.id).not.toBe(assignment);
      assignment = fresh.assignment.id;
    }
  });

  it("preserves the same Assignment for one malformed-response correction that can publish", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout);
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));

    const malformed = mdlmWithInput(
      repository,
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
      assignment: { id: assignment },
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
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);

    const status = JSON.parse(mdlm(repository, "status", "--json").stdout);
    expect(status.currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "active", id: assignment },
    });
    const retained = JSON.parse(mdlm(repository, "next").stdout);
    expect(retained.assignment).toEqual({ id: assignment });
    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease).toEqual(expect.objectContaining({
      id: assignment,
      disposition: "active",
      retryAvailability: { malformedResponseCorrection: 0 },
      malformedResponses: [{
        digest: expect.stringMatching(/^sha256:/),
        diagnostics: malformedResult.malformedResponse.diagnostics,
      }],
    }));

    const corrected = mdlmWithInput(
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

    expect(corrected.status, `${corrected.stderr}${corrected.stdout}`).toBe(0);
    expect(JSON.parse(corrected.stdout)).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@4",
      execution: expect.objectContaining({
        response: expect.objectContaining({ assignment }),
      }),
    }));
  });

  it("exhausts the Assignment on a second malformed response and reports the terminal disposition", async () => {
    const assignment = JSON.parse(mdlm(repository, "next").stdout).assignment.id as string;
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));

    const first = mdlmWithInput(repository, "{}\n", "scenario", "submit");
    expect(first.status).toBe(1);
    expect(JSON.parse(first.stdout)).toEqual(expect.objectContaining({
      disposition: "correction-required",
      malformedResponse: expect.objectContaining({ correctionsRemaining: 1 }),
    }));

    const second = mdlmWithInput(repository, "{]\n", "scenario", "submit");

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
    const status = JSON.parse(mdlm(repository, "status", "--json").stdout);
    expect(status.currentOutcome).toEqual({
      outcome: "assignment",
      assignment: { allocation: "not-allocated" },
    });

    const prepared = mdlm(repository, "scenario", "prepare", assignment);
    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
    const fresh = JSON.parse(mdlm(repository, "next").stdout);
    expect(fresh.assignment.id).not.toBe(assignment);
  });

  it("serializes public publication and marks intervening tracked changes stale without charging a malformed retry", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout) as PreparedPromptPacket;
    const response = `${JSON.stringify(wayfindingResponse(
      assignment,
      packet.prompt.skills.map((skill) => skill.reference),
    ))}\n`;
    const lockOwner = holdPublicationLock(repository, process.pid);
    const staged = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        watcher.close();
        reject(new Error("Public submission did not stage publication"));
      }, 10_000);
      const watcher = watch(path.join(repository, ".lifecycle"), async () => {
        try {
          const entries = await fs.readdir(path.join(repository, ".lifecycle"));
          if (entries.some((entry) =>
            entry.startsWith(".scenario-") && entry.endsWith(".tmp")
          )) {
            clearTimeout(timeout);
            watcher.close();
            resolve();
          }
        } catch (error) {
          clearTimeout(timeout);
          watcher.close();
          reject(error);
        }
      });
    });
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
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout) as PreparedPromptPacket;
    const response = `${JSON.stringify(wayfindingResponse(
      assignment,
      packet.prompt.skills.map((skill) => skill.reference),
    ))}\n`;
    const publicationOwner = holdPublicationLock(repository, process.pid);
    const stagingRoot = path.join(repository, ".lifecycle");
    const staged = () => fs.readdir(stagingRoot).then((entries) =>
      entries.filter((entry) =>
        entry.startsWith(".scenario-") && entry.endsWith(".tmp")
      )
    );
    const waitForStaging = async (): Promise<void> => {
      if ((await staged()).length === 1) return;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          watcher.close();
          reject(new Error("First submission did not stage publication"));
        }, 10_000);
        const watcher = watch(stagingRoot, async () => {
          if ((await staged()).length === 1) {
            clearTimeout(timeout);
            watcher.close();
            resolve();
          }
        });
      });
    };
    const first = spawnMdlmWithInput(repository, response, process.env);
    await waitForStaging();
    const barrierRoot = path.join(parent, "valid-response-barrier");
    const barrierSignal = path.join(barrierRoot, "assignment-lock-attempted");
    await fs.mkdir(barrierRoot);
    const gitWrapper = path.join(barrierRoot, "git");
    await fs.writeFile(gitWrapper, `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
if (process.argv.includes("refs/mdlm/assignment-lease-lock")) fs.writeFileSync(process.env.MDLM_TEST_LOCK_SIGNAL, "");
const env = { ...process.env, PATH: process.env.MDLM_TEST_REAL_PATH };
delete env.MDLM_TEST_LOCK_SIGNAL;
delete env.MDLM_TEST_REAL_PATH;
const result = spawnSync("git", process.argv.slice(2), { env, stdio: "inherit" });
process.exit(result.status ?? 1);
`);
    await fs.chmod(gitWrapper, 0o755);
    const second = spawnMdlmWithInput(repository, response, {
      ...process.env,
      PATH: `${barrierRoot}:${process.env.PATH}`,
      MDLM_TEST_LOCK_SIGNAL: barrierSignal,
      MDLM_TEST_REAL_PATH: process.env.PATH,
    });
    await waitForPath(
      barrierSignal,
      "Second valid response did not reach the Assignment lock",
    );
    expect(await staged()).toHaveLength(1);
    expect(second.child.exitCode).toBeNull();
    expect(git(
      repository,
      "update-ref",
      "-d",
      "refs/mdlm/publication-lock",
      publicationOwner,
    ).status).toBe(0);

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
  });

  it.each([
    ["malformed", "a fresh Assignment", "{not-json\n", false],
    ["unable", "newer Assignment coordinates that retain its id", undefined, true],
  ] as const)(
    "does not let a %s response overwrite %s",
    async (kind, _newerLease, malformedSource, retainAssignmentId) => {
      const next = JSON.parse(mdlm(repository, "next").stdout);
      const assignment = next.assignment.id as string;
      const packet = JSON.parse(mdlm(
        repository,
        "scenario",
        "prepare",
        assignment,
      ).stdout) as PreparedPromptPacket;
      const validResponse = `${JSON.stringify(wayfindingResponse(
        assignment,
        packet.prompt.skills.map((skill) => skill.reference),
      ))}\n`;
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

      const fresh = JSON.parse(mdlm(repository, "next").stdout);
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
      const doctor = mdlm(repository, "doctor", "--json");
      expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    },
    30_000,
  );

  it("stops a corrected response when tracked state became stale and publishes nothing", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout);
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));
    expect(mdlmWithInput(repository, "{}\n", "scenario", "submit").status).toBe(1);
    await fs.appendFile(path.join(repository, ".gitignore"), "# stale correction\n");

    const corrected = mdlmWithInput(
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
    const fresh = JSON.parse(mdlm(repository, "next").stdout);
    expect(fresh.assignment.id).not.toBe(assignment);
  });

  it("keeps Scenario submission as the only normal mdlm Lifecycle Data writer", async () => {
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));
    const directCreation = mdlm(
      repository,
      "new",
      "QST",
      "--scenario",
      "resolve-question@2",
      "--set",
      "title=Direct publication bypass",
      "--set",
      "kind=empirical",
      "--set",
      "evidence_available=true",
      "--set",
      "question=Can mdlm publish without an Assignment Response?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The canonical writer invariant would fail",
      "--json",
    );

    expect(directCreation.status).toBe(1);
    expect(JSON.parse(directCreation.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-command" }),
    ]);

    const otherBypasses = [
      ["revise", "QST-0123456789"],
      ["link", "QST-0123456789-r00001", "QST-ABCDEFGHIJ", "--type", "blocks"],
      ["unlink", "QST-0123456789-r00001", "QST-ABCDEFGHIJ", "--type", "blocks"],
      ["baseline", "create", "--type", "BSL"],
      ["baseline", "add", "BSL-0123456789", "QST-0123456789-r00001"],
      ["baseline", "remove", "BSL-0123456789", "QST-0123456789-r00001"],
      ["baseline", "evidence", "add", "BSL-0123456789", "REV-0123456789-r00001"],
      ["baseline", "evidence", "remove", "BSL-0123456789", "REV-0123456789-r00001"],
      ["baseline", "compose", "BSL-0123456789", "BSL-ABCDEFGHIJ-r00001"],
      ["baseline", "freeze", "BSL-0123456789"],
    ];
    for (const arguments_ of otherBypasses) {
      const result = mdlm(repository, ...arguments_, "--json");
      expect(result.status, `${arguments_.join(" ")}\n${result.stdout}`).toBe(1);
      expect(JSON.parse(result.stdout).diagnostics).toEqual([
        expect.objectContaining({ code: "unknown-command" }),
      ]);
    }
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);
  });

  it("does not expose adapter execution through mdlm", async () => {
    const marker = path.join(parent, "adapter-invoked");
    const adapter = path.join(parent, "adapter.mjs");
    await fs.writeFile(
      adapter,
      `#!/usr/bin/env node\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "invoked");\nprocess.stdout.write(JSON.stringify({ outputs: [], completionEvidence: {} }));\n`,
      { mode: 0o755 },
    );

    const result = mdlm(
      repository,
      "scenario",
      "execute",
      "establish-initial-wayfinding-map@1",
      "--initiate",
      "--adapter",
      adapter,
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-command" }),
    ]);

    const alias = mdlm(
      repository,
      "question",
      "resolve",
      "--question",
      "QST-0123456789-r00001",
      "--obligation",
      "not-dispatchable",
      "--adapter",
      adapter,
      "--json",
    );
    expect(alias.status).toBe(1);
    expect(JSON.parse(alias.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-command" }),
    ]);
    await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects malformed Assignment Responses atomically", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    let assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout);
    const loadedSkillRefs = packet.prompt.skills.map(
      (skill: { reference: string }) => skill.reference,
    );
    const response = wayfindingResponse(assignment, loadedSkillRefs);
    const responsePath = path.join(parent, "response.json");
    const before = git(repository, "diff", "--binary", "HEAD").stdout;
    const rejectionCases = [
      {
        code: "scenario-skill-provenance-mismatch",
        mutate(candidate: typeof response) {
          candidate.proposal.loadedSkillRefs = loadedSkillRefs.slice(0, -1);
        },
      },
      {
        code: "scenario-skill-provenance-mismatch",
        mutate(candidate: typeof response) {
          candidate.proposal.loadedSkillRefs = [
            ...loadedSkillRefs,
            "skills/not-in-the-assignment.md@1",
          ];
        },
      },
      {
        code: "scenario-skill-provenance-mismatch",
        mutate(candidate: typeof response) {
          candidate.proposal.loadedSkillRefs = [...loadedSkillRefs].reverse();
        },
      },
      {
        code: "scenario-skill-provenance-mismatch",
        mutate(candidate: typeof response) {
          candidate.proposal.loadedSkillRefs = [
            "skills/not-in-the-assignment.md@1",
            ...loadedSkillRefs.slice(1),
          ];
        },
      },
    ];
    const abandonMalformedAssignment = () => {
      const abandoned = mdlmWithInput(
        repository,
        `${JSON.stringify({
          contract: "mdlm-assignment-response@1",
          assignment,
          kind: "unable",
          unable: {
            reason: "execution-failure",
            diagnostics: [{
              code: "canonical-correction-abandoned",
              message: "The validation tracer will continue with a fresh Assignment.",
            }],
          },
        })}\n`,
        "scenario",
        "submit",
      );
      expect(abandoned.status, `${abandoned.stderr}${abandoned.stdout}`).toBe(0);
      const fresh = JSON.parse(mdlm(repository, "next").stdout);
      expect(fresh.assignment.id).not.toBe(assignment);
      assignment = fresh.assignment.id;
      response.assignment = assignment;
    };
    for (const rejectionCase of rejectionCases) {
      const invalid = structuredClone(response);
      rejectionCase.mutate(invalid);
      await fs.writeFile(responsePath, `${JSON.stringify(invalid)}\n`);
      const rejected = mdlm(
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
          expect.objectContaining({
            code: rejectionCase.code,
            message: `Scenario Proposal must report exact Assignment skills in packet order; expected ${JSON.stringify(loadedSkillRefs)}, received ${JSON.stringify(invalid.proposal.loadedSkillRefs)}`,
          }),
        ]),
      }));
      abandonMalformedAssignment();
    }
    expect(git(repository, "diff", "--binary", "HEAD").stdout).toBe(before);
    expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);

    const forgedIdentity = structuredClone(response);
    Object.assign(forgedIdentity.proposal.outputs[0]!.lifecycleDatum, {
      id: "MAP-0123456789",
    });
    await fs.writeFile(responsePath, `${JSON.stringify(forgedIdentity)}\n`);
    const identityRejected = mdlm(repository, "scenario", "submit", responsePath);
    expect(identityRejected.status).toBe(1);
    expect(JSON.parse(identityRejected.stdout)).toEqual(expect.objectContaining({
      disposition: "correction-required",
      diagnostics: [
        expect.objectContaining({ code: "scenario-output-identity-kernel-managed" }),
      ],
    }));
    expect((await fs.readdir(path.join(repository, ".lifecycle/data"))).sort())
      .toEqual([".gitkeep"]);
    abandonMalformedAssignment();
    const freshLease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(freshLease).toEqual(expect.objectContaining({
      id: assignment,
      retryAvailability: { malformedResponseCorrection: 1 },
      malformedResponses: [],
    }));
  }, 60_000);

  it("atomically publishes one Assignment Response from stdin and rejects replay", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    ).stdout);
    const loadedSkillRefs = packet.prompt.skills.map(
      (skill: { reference: string }) => skill.reference,
    );
    const response = wayfindingResponse(assignment, loadedSkillRefs);
    const responsePath = path.join(parent, "response.json");

    const submitted = mdlmWithInput(
      repository,
      `${JSON.stringify(response)}\n`,
      "scenario",
      "submit",
    );

    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    const result = JSON.parse(submitted.stdout);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.submit",
      contract: "mdlm-scenario-execution@4",
      execution: expect.objectContaining({
        contract: "mdlm-scenario-execution@4",
        status: "completed",
        response: {
          contract: "mdlm-assignment-response@1",
          assignment,
          digest: expect.stringMatching(/^sha256:/),
        },
        outputs: expect.arrayContaining([expect.objectContaining({
          name: "map",
          lifecycleDatum: expect.objectContaining({
            id: expect.stringMatching(/^MAP-/),
            revision: 1,
            revisionId: expect.stringMatching(/^MAP-.*-r00001$/),
            type: "MAP",
          }),
        })]),
      }),
      diagnostics: [],
    }));
    expect(result.execution).not.toHaveProperty("adapter");
    expect(result.execution.skills.map((skill: { reference: string }) => skill.reference))
      .toEqual(loadedSkillRefs);
    expect(result.execution.outputs.map(
      (output: { data: { created_by: { loaded_skill_refs: string[] } } }) =>
        output.data.created_by.loaded_skill_refs,
    )).toEqual(result.execution.outputs.map(() => loadedSkillRefs));
    expect(result.execution.outputs[0].data.payload.frontier).toEqual([
      result.execution.outputs[1].lifecycleDatum.revisionId,
    ]);
    await expect(fs.stat(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });

    const doctor = mdlm(repository, "doctor", "--json");
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toContain(
      "?? .lifecycle/data/.transactions/",
    );
    expect(git(repository, "add", "-N", ".lifecycle/data").status).toBe(0);
    expect(git(repository, "diff", "--", ".lifecycle/data").stdout).toContain(
      "mdlm-scenario-execution@4",
    );

    const published = await directoryBytes(path.join(repository, ".lifecycle/data"));
    await fs.writeFile(responsePath, `${JSON.stringify(response)}\n`);
    const replay = mdlm(repository, "scenario", "submit", responsePath);
    expect(replay.status).toBe(1);
    expect(JSON.parse(replay.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(
      published,
    );

    expect(git(repository, "add", ".lifecycle/data").status).toBe(0);
    expect(git(
      repository,
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@example.invalid",
      "commit",
      "-m",
      "Publish initial Scenario transaction",
    ).status).toBe(0);
    expect(git(repository, "status", "--porcelain").stdout).toBe("");
  }, 40_000);

  it("publishes a complete Assignment Response from a file", async () => {
    const next = JSON.parse(mdlm(repository, "next").stdout);
    const packet = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      next.assignment.id,
    ).stdout);
    const response = {
      contract: "mdlm-assignment-response@1",
      assignment: next.assignment.id,
      kind: "proposal",
      proposal: {
        outputs: [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "File transport proposal",
              purpose: "Prove a harness can submit one complete response file.",
              frontier: ["$proposal.product-intent.revision_id"],
            },
            links: [{
              type: "indexes",
              target: "$proposal.product-intent.id",
            }],
            body: "One proposal transported without standard input.\n",
          },
        }, {
          localId: "product-intent",
          name: "product_intent",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: {
              title: "File-transported product intent",
              kind: "preferential",
              intent_scope: "product",
              question: "Which exact product should this work pursue?",
              state: "open",
              blocking_impact: "PSP compilation waits for the attended answer.",
            },
            links: [],
            body: "The file includes the required product-intent Question.\n",
          },
        }],
        completionEvidence: { summary: "The initial frontier is explicit." },
        loadedSkillRefs: packet.prompt.skills.map(
          (skill: { reference: string }) => skill.reference,
        ),
        authoritySupplies: [],
        standingDelegations: [],
      },
    };
    const responsePath = path.join(parent, "file-response.json");
    await fs.writeFile(responsePath, `${JSON.stringify(response)}\n`);

    const submitted = mdlm(repository, "scenario", "submit", responsePath);

    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
    expect(JSON.parse(submitted.stdout)).toEqual(expect.objectContaining({
      ok: true,
      contract: "mdlm-scenario-execution@4",
      execution: expect.objectContaining({
        response: expect.objectContaining({ assignment: next.assignment.id }),
      }),
    }));
  });

  it("keeps the versioned Assignment Response schema stable across Assignments", async () => {
    const first = JSON.parse(mdlm(repository, "next").stdout);
    const firstPacket = JSON.parse(mdlm(
      repository,
      "scenario",
      "prepare",
      first.assignment.id,
    ).stdout);

    const secondRepository = path.join(parent, "second-repository");
    const initialized = mdlm(parent, "init", secondRepository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    const second = JSON.parse(mdlm(secondRepository, "next").stdout);
    const secondPacket = JSON.parse(mdlm(
      secondRepository,
      "scenario",
      "prepare",
      second.assignment.id,
    ).stdout);

    expect(second.assignment.id).not.toBe(first.assignment.id);
    expect(secondPacket.responseSchema).toEqual(firstPacket.responseSchema);
  });

  it("rejects corrupt exact lease contents instead of recovering automatically", async () => {
    const next = mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8"));
    await fs.writeFile(leasePath, JSON.stringify({
      ...lease,
      bindings: [7],
      participation: ["not-participation"],
    }));

    const corrupt = mdlm(repository, "next");

    expect(corrupt.status).toBe(1);
    expect(JSON.parse(corrupt.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      diagnostics: [expect.objectContaining({
        code: "assignment-lease-invalid",
      })],
    }));
  });

  it("rejects corrupt package and repository fingerprints instead of recovering", async () => {
    const next = mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const leasePath = path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8"));
    await fs.writeFile(leasePath, JSON.stringify({
      ...lease,
      package: { ...lease.package, digest: "corrupt" },
      repository: { ...lease.repository, head: "corrupt" },
    }));

    const corrupt = mdlm(repository, "next");

    expect(corrupt.status).toBe(1);
    expect(JSON.parse(corrupt.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-lease-invalid" }),
    ]);
  });

  it("reports malformed Assignment lease JSON without an untyped command error", async () => {
    const next = mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    await fs.writeFile(
      path.join(repository, ".lifecycle/work/active-assignment.json"),
      "not json\n",
    );

    const malformed = mdlm(repository, "next");

    expect(malformed.status).toBe(1);
    expect(JSON.parse(malformed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-lease-invalid" }),
    ]);
  });

  it("rejects preparation after tracked repository state changes without rebasing", async () => {
    const next = mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(path.join(repository, ".gitignore"), "# tracked change\n");

    const prepared = mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "scenario.prepare",
      diagnostics: [expect.objectContaining({ code: "assignment-stale" })],
    }));

    expect(git(repository, "checkout", "--", ".gitignore").status).toBe(0);
    const restored = mdlm(repository, "scenario", "prepare", assignment);
    expect(restored.status).toBe(1);
    expect(JSON.parse(restored.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
  });

  it("does not retain the old next projection options", () => {
    const next = mdlm(repository, "next", "--phase", "phase-0-wayfinding");

    expect(next.status).toBe(1);
    expect(JSON.parse(next.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "next",
      diagnostics: [expect.objectContaining({
        code: "next-arguments-unsupported",
      })],
    }));
  });

  it("rejects preparation after the selected Process Package changes", async () => {
    const next = mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(
      path.join(
        repository,
        ".lifecycle/packages/mdlm-bootstrap@0.72.0/prompts/establish-initial-wayfinding-map.md",
      ),
      "\nPackage change.\n",
    );

    const prepared = mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
  });

  it("invalidates the active lease when next observes a package change", async () => {
    const first = JSON.parse(mdlm(repository, "next").stdout);
    const promptRelative =
      ".lifecycle/packages/mdlm-bootstrap@0.72.0/prompts/establish-initial-wayfinding-map.md";
    await fs.appendFile(path.join(repository, promptRelative), "\nPackage change.\n");

    const changed = mdlm(repository, "next");

    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "process-package-selection-mismatch" }),
    ]);
    expect(git(repository, "checkout", "--", promptRelative).status).toBe(0);
    const fresh = JSON.parse(mdlm(repository, "next").stdout);
    expect(fresh.assignment.id).not.toBe(first.assignment.id);
  });
});
