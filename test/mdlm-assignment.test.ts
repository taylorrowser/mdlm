import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");

function mdlm(repository: string, ...arguments_: string[]) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
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
    expect(lease).toEqual(expect.objectContaining({
      contract: "mdlm-assignment-lease@1",
      id: outcome.assignment.id,
      disposition: "active",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.49.0",
        digest: expect.stringMatching(/^sha256:/),
      }),
      repository: {
        head: expect.stringMatching(/^[0-9a-f]{40}$/),
        trackedState: expect.stringMatching(/^sha256:/),
      },
      phase: "phase-0-wayfinding@2",
      obligation: {
        instance: expect.stringContaining("initial-wayfinding-map-required@1:"),
        definition: "initial-wayfinding-map-required@1",
        subject: "phase-0-wayfinding@2",
      },
      scenario: "establish-initial-wayfinding-map@1",
      bindings: [{ invocation: 0, inputs: [] }],
      participation: [],
      retryAvailability: { malformedResponseCorrection: 1 },
    }));

    const prepared = mdlm(
      repository,
      "scenario",
      "prepare",
      outcome.assignment.id,
    );
    expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
    const packet = JSON.parse(prepared.stdout);
    expect(packet).toEqual(expect.objectContaining({
      ok: true,
      command: "scenario.prepare",
      contract: "mdlm-assignment-packet@1",
      assignment: { id: outcome.assignment.id },
      phase: "phase-0-wayfinding@2",
      obligation: lease.obligation,
      scenario: expect.objectContaining({
        reference: "establish-initial-wayfinding-map@1",
      }),
      prompt: expect.objectContaining({
        reference: "prompts/establish-initial-wayfinding-map.md@1",
        content: expect.stringContaining("# Establish the initial wayfinding map"),
      }),
      assets: expect.arrayContaining([
        expect.objectContaining({
          reference: "prompts/establish-initial-wayfinding-map.md@1",
        }),
        expect.objectContaining({ reference: "skills/lifecycle-data.md@1" }),
        expect.objectContaining({ reference: "skills/wayfinding-map.md@1" }),
        expect.objectContaining({ reference: "skills/clarification-protocol.md@1" }),
        expect.objectContaining({ reference: "skills/scope-challenge.md@1" }),
      ]),
      exactInputs: [{ inputs: [] }],
      allowedProjections: expect.objectContaining({
        exactLifecycleData: [],
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
        expect.objectContaining({ name: "questions", types: ["QST"], cardinality: "zero-or-more" }),
      ]),
      outputLinks: expect.any(Array),
      completion: expect.objectContaining({
        status: "pending-output",
        expression: expect.stringContaining("map.payload.frontier"),
      }),
      responseSchema: expect.objectContaining({
        $id: "https://mdlm.dev/contracts/mdlm-assignment-response@1",
        oneOf: expect.any(Array),
      }),
      diagnostics: [],
    }));

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
    const lease = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/work/active-assignment.json"),
      "utf8",
    ));
    expect(lease.disposition).toBe("stale");
  });

  it("rejects preparation after the selected Process Package changes", async () => {
    const next = mdlm(repository, "next");
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    await fs.appendFile(
      path.join(
        repository,
        ".lifecycle/packages/mdlm-bootstrap@0.49.0/prompts/establish-initial-wayfinding-map.md",
      ),
      "\nPackage change.\n",
    );

    const prepared = mdlm(repository, "scenario", "prepare", assignment);

    expect(prepared.status).toBe(1);
    expect(JSON.parse(prepared.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
  });
});
