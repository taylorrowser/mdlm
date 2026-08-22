import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { collectPerformanceDiagnostics } from "../src/performance-diagnostics.js";

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

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

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
  let templateRepository: string;
  let parent: string;
  let repository: string;

  beforeAll(async () => {
    templateParent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-assignment-template-"));
    templateRepository = path.join(templateParent, "repository");
    const initialized = await mdlm(templateParent, "init", templateRepository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-assignment-public-"));
    repository = path.join(parent, "repository");
    await fs.cp(templateRepository, repository, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(templateParent, { recursive: true, force: true });
  });

  it("atomically publishes one supplied Assignment Response and rejects replay", async () => {
    const next = JSON.parse((await mdlm(repository, "next")).stdout);
    const assignment = next.assignment.id as string;
    const packet = JSON.parse((await mdlm(
      repository,
      "scenario",
      "prepare",
      assignment,
    )).stdout);
    const loadedSkillRefs = packet.prompt.skills.map(
      (skill: { reference: string }) => skill.reference,
    );
    const response = wayfindingResponse(assignment, loadedSkillRefs);
    const responsePath = path.join(parent, "response.json");

    const submitted = await mdlmWithInput(
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

    const doctor = await mdlm(repository, "doctor", "--json");
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
    const replay = await mdlm(repository, "scenario", "submit", responsePath);
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

  it("keeps the versioned Assignment Response schema stable across Assignments", async () => {
    const first = JSON.parse((await mdlm(repository, "next")).stdout);
    const firstPacket = JSON.parse((await mdlm(
      repository,
      "scenario",
      "prepare",
      first.assignment.id,
    )).stdout);

    const secondRepository = path.join(parent, "second-repository");
    const initialized = await mdlm(parent, "init", secondRepository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    const second = JSON.parse((await mdlm(secondRepository, "next")).stdout);
    const secondPacket = JSON.parse((await mdlm(
      secondRepository,
      "scenario",
      "prepare",
      second.assignment.id,
    )).stdout);

    expect(second.assignment.id).not.toBe(first.assignment.id);
    expect(secondPacket.responseSchema).toEqual(firstPacket.responseSchema);
  });

  it("rejects corrupt exact lease contents instead of recovering automatically", async () => {
    const next = await mdlm(repository, "next");
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

    const corrupt = await mdlm(repository, "next");

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
    const next = await mdlm(repository, "next");
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

    const corrupt = await mdlm(repository, "next");

    expect(corrupt.status).toBe(1);
    expect(JSON.parse(corrupt.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-lease-invalid" }),
    ]);
  });

  it("reports malformed Assignment lease JSON without an untyped command error", async () => {
    const next = await mdlm(repository, "next");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    await fs.writeFile(
      path.join(repository, ".lifecycle/work/active-assignment.json"),
      "not json\n",
    );

    const malformed = await mdlm(repository, "next");

    expect(malformed.status).toBe(1);
    expect(JSON.parse(malformed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-lease-invalid" }),
    ]);
  });

  it("reuses the exact leased snapshot for immediate in-process preparation", async () => {
    const next = await mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;

    const prepared = await collectPerformanceDiagnostics(() =>
      executeCommandApplication(
        ["scenario", "prepare", assignment],
        repository,
      )
    );

    expect(prepared.value.exitCode, prepared.value.output).toBe(0);
    expect(prepared.diagnostics.repository.loads).toBe(0);
  });

  it("rejects preparation after tracked repository state changes without rebasing", async () => {
    const next = await mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(path.join(repository, ".gitignore"), "# tracked change\n");

    const prepared = await mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "scenario.prepare",
      diagnostics: [expect.objectContaining({ code: "assignment-stale" })],
    }));

    expect(git(repository, "checkout", "--", ".gitignore").status).toBe(0);
    const restored = await mdlm(repository, "scenario", "prepare", assignment);
    expect(restored.status).toBe(1);
    expect(JSON.parse(restored.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-unavailable" }),
    ]);
  });

  it("does not reuse preparation after untracked Lifecycle Data changes", async () => {
    const next = await mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.writeFile(
      path.join(repository, ".lifecycle/data/untracked.md"),
      "not Lifecycle Data\n",
    );

    const prepared = await mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "scenario.prepare",
      diagnostics: expect.arrayContaining([expect.any(Object)]),
    }));
  });

  it("does not retain the old next projection options", async () => {
    const next = await mdlm(repository, "next", "--phase", "phase-0-wayfinding");

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
    const next = await mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(
      path.join(
        repository,
        ".lifecycle/packages/mdlm-bootstrap@0.74.0/prompts/establish-initial-wayfinding-map.md",
      ),
      "\nPackage change.\n",
    );

    const prepared = await mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
  });

  it("invalidates the active lease when next observes a package change", async () => {
    const first = JSON.parse((await mdlm(repository, "next")).stdout);
    const promptRelative =
      ".lifecycle/packages/mdlm-bootstrap@0.74.0/prompts/establish-initial-wayfinding-map.md";
    await fs.appendFile(path.join(repository, promptRelative), "\nPackage change.\n");

    const changed = await mdlm(repository, "next");

    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "process-package-selection-mismatch" }),
    ]);
    expect(git(repository, "checkout", "--", promptRelative).status).toBe(0);
    const fresh = JSON.parse((await mdlm(repository, "next")).stdout);
    expect(fresh.assignment.id).not.toBe(first.assignment.id);
  });
});
