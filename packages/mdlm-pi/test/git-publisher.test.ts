import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitPublisher, GitPublisherError } from "../src/git-publisher.js";
import type { UncapturedPublicationEvidence } from "../src/run-journal.js";

const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
const publicationCandidate: UncapturedPublicationEvidence = {
  executionId,
  scenario: "example@1",
  responseDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  outputPaths: [
    `.lifecycle/data/.transactions/${executionId}/execution.json`,
    `.lifecycle/data/.transactions/${executionId}/datum.md`,
  ],
};

describe("GitPublisher", () => {
  let repository: string;
  let publisher: GitPublisher;
  let baseCommit: string;

  beforeEach(async () => {
    repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-git-"));
    git("init", "--quiet");
    git("config", "user.name", "MDLM Pi Test");
    git("config", "user.email", "mdlm-pi@localhost");
    await fs.writeFile(path.join(repository, "README.md"), "initial\n");
    git("add", "README.md");
    git("commit", "--quiet", "-m", "initial");
    publisher = new GitPublisher({ repository });
    baseCommit = await publisher.head();
  });

  afterEach(async () => {
    await fs.rm(repository, { recursive: true, force: true });
  });

  it("commits only the exact transaction and recognizes the recovered commit", async () => {
    const publication = await createPublication();

    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toEqual({ state: "needs-commit" });
    const commit = await publisher.commit(publication, baseCommit);
    expect(commit).not.toBe(baseCommit);
    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toEqual({ state: "committed", commit });
    expect(git("show", "--format=", "--name-only", "HEAD").trim().split("\n").sort()).toEqual([
      `.lifecycle/data/.transactions/${executionId}/datum.md`,
      `.lifecycle/data/.transactions/${executionId}/execution.json`,
    ]);
  });

  it("serially commits multiple declared materializations without mixing them", async () => {
    const secondId = "b7fcab68-7094-45db-bfb2-bfa3de4c6c24";
    const publication = await createPublication();
    const second = await createPublication(secondId, "second@1");

    const firstCommit = await publisher.commit(publication, baseCommit, [secondId]);
    expect(git("show", "--format=", "--name-only", firstCommit).trim().split("\n").sort()).toEqual([
      `.lifecycle/data/.transactions/${executionId}/datum.md`,
      `.lifecycle/data/.transactions/${executionId}/execution.json`,
    ]);
    await expect(
      publisher.publicationCommitState(publication, baseCommit, [secondId]),
    ).resolves.toEqual({ state: "committed", commit: firstCommit });
    await publisher.commit(second, firstCommit);
    expect(git("status", "--short")).toBe("");
  });

  it("refuses extra paths even when they are inside the transaction directory", async () => {
    const publication = await createPublication();
    const transaction = path.join(repository, ".lifecycle/data/.transactions", executionId);
    await fs.writeFile(path.join(transaction, "extra.md"), "not declared\n");

    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toMatchObject({ state: "ambiguous" });
    await expect(publisher.commit(publication, baseCommit))
      .rejects.toThrow("paths differ");
  });

  it("stops when an expected transaction byte changes after capture", async () => {
    const publication = await createPublication();
    const datum = path.join(
      repository,
      ".lifecycle/data/.transactions",
      executionId,
      "datum.md",
    );
    await fs.writeFile(datum, "changed after capture\n");

    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toMatchObject({ state: "ambiguous", explanation: expect.stringContaining("bytes") });
  });

  it("fails before staging when configured Git identity is unavailable", async () => {
    git("config", "user.name", "");
    git("config", "user.email", "");
    const publication = await createPublication();

    await expect(publisher.commit(publication, baseCommit))
      .rejects.toThrow("user.name and user.email");
    expect(git("diff", "--cached", "--name-only")).toBe("");
  });

  it("reports a failed ordinary Git commit and leaves the exact staged transaction", async () => {
    const publication = await createPublication();
    const hook = path.join(repository, ".git/hooks/pre-commit");
    await fs.writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    await expect(publisher.commit(publication, baseCommit))
      .rejects.toBeInstanceOf(GitPublisherError);
    expect(git("diff", "--cached", "--name-only").trim().split("\n").sort()).toEqual([
      `.lifecycle/data/.transactions/${executionId}/datum.md`,
      `.lifecycle/data/.transactions/${executionId}/execution.json`,
    ]);
    expect(await publisher.head()).toBe(baseCommit);
  });

  it("ignores ambient GIT_DIR redirection", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-other-git-"));
    const previous = process.env.GIT_DIR;
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: other });
      process.env.GIT_DIR = path.join(other, ".git");
      await expect(publisher.head()).resolves.toBe(baseCommit);
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous;
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it("refuses to absorb a path outside the canonical transaction", async () => {
    const publication = await createPublication();
    await fs.writeFile(path.join(repository, "unrelated.txt"), "do not stage\n");

    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toMatchObject({ state: "ambiguous" });
    await expect(publisher.commit(publication, baseCommit))
      .rejects.toBeInstanceOf(GitPublisherError);
    expect(git("diff", "--cached", "--name-only")).toBe("");
  });

  async function createPublication(
    id = executionId,
    scenario = publicationCandidate.scenario,
  ) {
    const transaction = path.join(repository, ".lifecycle/data/.transactions", id);
    await fs.mkdir(transaction, { recursive: true });
    await fs.writeFile(path.join(transaction, "datum.md"), `${id}\n`);
    await fs.writeFile(path.join(transaction, "execution.json"), `{"id":"${id}"}\n`);
    return publisher.capturePublication({
      ...publicationCandidate,
      executionId: id,
      scenario,
      outputPaths: [
        `.lifecycle/data/.transactions/${id}/execution.json`,
        `.lifecycle/data/.transactions/${id}/datum.md`,
      ],
    });
  }

  function git(...arguments_: string[]): string {
    return execFileSync("git", arguments_, { cwd: repository, encoding: "utf8" });
  }
});
