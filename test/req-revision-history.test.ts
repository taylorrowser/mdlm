import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

function frontmatter(value: Record<string, unknown>): string {
  return `---\n${stringify(value).trimEnd()}\n---\n`;
}

describe("req revision lineage", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-revision-repo-"));
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      bootstrapPackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  function createDatum() {
    return req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@1",
      "--set",
      "title=Revision safety",
      "--set",
      "rationale=Exact history must remain immutable",
      "--set",
      "problem=Concurrent drafts can overwrite one another",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["preserve exact revisions"]',
      "--set",
      'non_goals=[]',
      "--set",
      'success_measures=["competing drafts are refused"]',
      "--body",
      "Original exact content.",
      "--json",
    );
  }

  async function freezeRevision(revisionId: string): Promise<string> {
    const baselineId = "BSL-0123456789";
    const baselineRevisionId = `${baselineId}-r00001`;
    const baselineDirectory = path.join(
      repositoryRoot,
      ".lifecycle/data/BSL",
      baselineId,
    );
    await fs.mkdir(baselineDirectory, { recursive: true });
    await fs.writeFile(
      path.join(baselineDirectory, "r00001.md"),
      frontmatter({
        id: baselineId,
        revision: 1,
        revision_id: baselineRevisionId,
        type: "BSL",
        payload: {
          title: "Frozen revision history",
          kind: "review-context",
          role: "review-context",
          scope: "revision history test",
          group: "DEFAULT",
          definition_members: [revisionId],
          evidence: [],
          snapshot: {
            frozen_at: "2026-08-04T17:00:00.000Z",
            member_hashes: {
              [revisionId]: `sha256:${"0".repeat(64)}`,
            },
            resolved_links: {},
            process_provenance: {
              process_ref: "mdlm-bootstrap@0.24.0",
              manifest_hash: `sha256:${"1".repeat(64)}`,
              asset_refs: [],
            },
          },
        },
        links: [],
        created_by: {
          scenario: "create-review-context@1",
          prompt_ref: "prompts/create-review-context.md@1",
          process_ref: "mdlm-bootstrap@0.24.0",
          loaded_skill_refs: [],
          policy_refs: [],
        },
      }),
    );
    return baselineRevisionId;
  }

  it("creates the next exact Revision while preserving frozen history", async () => {
    const created = createDatum();
    expect(created.status, created.stderr).toBe(0);
    const first = JSON.parse(created.stdout).created;

    const existingDraft = req(repositoryRoot, "revise", first.id, "--json");
    expect(existingDraft.status).toBe(1);
    expect(JSON.parse(existingDraft.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "editable-revision-exists",
        path: first.revisionId,
        message: expect.stringContaining(
          `Edit or abandon '${first.revisionId}' before creating another draft`,
        ),
      }),
    ]);

    const baselineRevisionId = await freezeRevision(first.revisionId);
    const revised = req(
      repositoryRoot,
      "revise",
      first.id,
      "--from",
      first.revisionId,
      "--json",
    );
    expect(revised.status, revised.stderr).toBe(0);
    expect(JSON.parse(revised.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "revise",
      created: {
        id: first.id,
        revisionId: `${first.id}-r00002`,
        type: "PSP",
        path: `.lifecycle/data/PSP/${first.id}/r00002.md`,
      },
    }));

    const firstShown = req(repositoryRoot, "show", first.revisionId, "--json");
    const secondShown = req(
      repositoryRoot,
      "show",
      `${first.id}-r00002`,
      "--json",
    );
    expect(JSON.parse(firstShown.stdout).lifecycleDatum).toMatchObject({
      datum: {
        id: first.id,
        revision: 1,
        revision_id: first.revisionId,
        body: "Original exact content.\n",
      },
      storage: { editable: false, frozen: true },
    });
    expect(JSON.parse(secondShown.stdout).lifecycleDatum).toMatchObject({
      datum: {
        id: first.id,
        revision: 2,
        revision_id: `${first.id}-r00002`,
        body: "Original exact content.\n",
      },
      storage: { editable: true, frozen: false },
    });

    const history = req(repositoryRoot, "history", first.id, "--json");
    expect(history.status, history.stderr).toBe(0);
    expect(JSON.parse(history.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "history",
      history: {
        id: first.id,
        type: "PSP",
        revisions: [
          {
            revision: 1,
            revisionId: first.revisionId,
            classification: "frozen-history",
            frozenBy: [baselineRevisionId],
            processRef: expect.stringContaining("mdlm-bootstrap@0.24.0#sha256:"),
          },
          {
            revision: 2,
            revisionId: `${first.id}-r00002`,
            classification: "editable-work",
            frozenBy: [],
            processRef: expect.stringContaining("mdlm-bootstrap@0.24.0#sha256:"),
          },
        ],
      },
    }));

    const human = req(repositoryRoot, "history", first.id);
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(`${first.revisionId} [frozen history]`);
    expect(human.stdout).toContain(`${first.id}-r00002 [editable work]`);
    expect(human.stdout).toContain(`Frozen By: ${baselineRevisionId}`);
  });

  it("refuses a competing draft without changing exact history or indexes", async () => {
    const created = createDatum();
    expect(created.status, created.stderr).toBe(0);
    const first = JSON.parse(created.stdout).created;
    await freezeRevision(first.revisionId);

    const revised = req(repositoryRoot, "revise", first.id, "--json");
    expect(revised.status, revised.stderr).toBe(0);
    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
    const indexPath = path.join(
      repositoryRoot,
      ".lifecycle/generated/indexes/data.json",
    );
    const indexBefore = await fs.readFile(indexPath, "utf8");
    const firstBefore = await fs.readFile(
      path.join(repositoryRoot, first.path),
      "utf8",
    );
    const secondPath = path.join(
      repositoryRoot,
      `.lifecycle/data/PSP/${first.id}/r00002.md`,
    );
    const secondBefore = await fs.readFile(secondPath, "utf8");

    const competing = req(repositoryRoot, "revise", first.id, "--json");
    expect(competing.status).toBe(1);
    expect(JSON.parse(competing.stdout)).toEqual(expect.objectContaining({
      ok: false,
      command: "revise",
      diagnostics: [{
        code: "editable-revision-exists",
        path: `${first.id}-r00002`,
        message: `Stable Datum '${first.id}' already has editable Revision '${first.id}-r00002'. Edit or abandon '${first.id}-r00002' before creating another draft.`,
      }],
    }));

    expect(await fs.readFile(path.join(repositoryRoot, first.path), "utf8"))
      .toBe(firstBefore);
    expect(await fs.readFile(secondPath, "utf8")).toBe(secondBefore);
    expect(await fs.readFile(indexPath, "utf8")).toBe(indexBefore);
    expect((await fs.readdir(path.dirname(secondPath))).sort()).toEqual([
      "r00001.md",
      "r00002.md",
    ]);
  });
});
