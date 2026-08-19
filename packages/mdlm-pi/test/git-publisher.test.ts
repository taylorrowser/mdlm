import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitPublisher, GitPublisherError } from "../src/git-publisher.js";
import type { PublicationEvidence } from "../src/run-journal.js";

const executionId = "aef8da80-ce4b-420b-afa5-331a06860683";
const publication: PublicationEvidence = {
  executionId,
  scenario: "example@1",
  responseDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  outputPaths: [`.lifecycle/data/.transactions/${executionId}/datum.md`],
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
    const transaction = path.join(
      repository,
      ".lifecycle/data/.transactions",
      executionId,
    );
    await fs.mkdir(transaction, { recursive: true });
    await fs.writeFile(path.join(transaction, "datum.md"), "published\n");

    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toEqual({ state: "needs-commit" });
    const commit = await publisher.commit(publication, baseCommit);
    expect(commit).not.toBe(baseCommit);
    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toEqual({ state: "committed", commit });
    expect(git("show", "--format=", "--name-only", "HEAD").trim()).toBe(
      `.lifecycle/data/.transactions/${executionId}/datum.md`,
    );
  });

  it("serially commits multiple declared materializations without mixing them", async () => {
    const secondId = "b7fcab68-7094-45db-bfb2-bfa3de4c6c24";
    const second: PublicationEvidence = {
      ...publication,
      executionId: secondId,
      scenario: "second@1",
      outputPaths: [`.lifecycle/data/.transactions/${secondId}/datum.md`],
    };
    for (const id of [executionId, secondId]) {
      const transaction = path.join(repository, ".lifecycle/data/.transactions", id);
      await fs.mkdir(transaction, { recursive: true });
      await fs.writeFile(path.join(transaction, "datum.md"), `${id}\n`);
    }

    const firstCommit = await publisher.commit(publication, baseCommit, [secondId]);
    expect(git("show", "--format=", "--name-only", firstCommit).trim()).toBe(
      `.lifecycle/data/.transactions/${executionId}/datum.md`,
    );
    await expect(
      publisher.publicationCommitState(publication, baseCommit, [secondId]),
    ).resolves.toEqual({ state: "committed", commit: firstCommit });
    await publisher.commit(second, firstCommit);
    expect(git("status", "--short")).toBe("");
  });

  it("refuses to absorb a path outside the canonical transaction", async () => {
    const transaction = path.join(
      repository,
      ".lifecycle/data/.transactions",
      executionId,
    );
    await fs.mkdir(transaction, { recursive: true });
    await fs.writeFile(path.join(transaction, "datum.md"), "published\n");
    await fs.writeFile(path.join(repository, "unrelated.txt"), "do not stage\n");

    await expect(publisher.publicationCommitState(publication, baseCommit))
      .resolves.toMatchObject({ state: "ambiguous" });
    await expect(publisher.commit(publication, baseCommit))
      .rejects.toBeInstanceOf(GitPublisherError);
    expect(git("diff", "--cached", "--name-only")).toBe("");
  });

  function git(...arguments_: string[]): string {
    return execFileSync("git", arguments_, { cwd: repository, encoding: "utf8" });
  }
});
