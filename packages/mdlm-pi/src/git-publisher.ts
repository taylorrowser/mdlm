import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  PublicationEvidence,
  UncapturedPublicationEvidence,
} from "./run-journal.js";

const executeFile = promisify(execFile);

export interface GitPublisherOptions {
  repository: string;
  timeoutMs?: number;
}

export type PublicationCommitState =
  | { state: "needs-commit" }
  | { state: "committed"; commit: string }
  | { state: "ambiguous"; explanation: string };

export class GitPublisherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitPublisherError";
  }
}

/** Exact Git boundary for one canonical Scenario transaction. */
export class GitPublisher {
  readonly #repository: string;
  readonly #timeoutMs: number;

  constructor(options: GitPublisherOptions) {
    this.#repository = options.repository;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  async gitDirectory(): Promise<string> {
    return (await this.#git(["rev-parse", "--absolute-git-dir"])).trim();
  }

  async commonGitDirectory(): Promise<string> {
    return (await this.#git([
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ])).trim();
  }

  async head(): Promise<string> {
    return (await this.#git(["rev-parse", "HEAD"])).trim();
  }

  async assertClean(): Promise<void> {
    const changes = await this.#changes();
    if (changes.length > 0) {
      throw new GitPublisherError(
        `Repository has pre-existing changes; refusing to mix them with an MDLM transaction:\n${changes.join("\n")}`,
      );
    }
  }

  async capturePublication(
    publication: UncapturedPublicationEvidence,
  ): Promise<PublicationEvidence> {
    const outputPaths = publicationPaths(publication);
    const blobs = await Promise.all(outputPaths.map(async (outputPath) => ({
      path: outputPath,
      oid: await this.#worktreeBlob(outputPath),
    })));
    return { ...publication, outputPaths, blobs };
  }

  async pendingTransactionIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const changedPath of await this.#changes()) {
      const match = /^\.lifecycle\/data\/\.transactions\/([0-9a-f-]+)(?:\/|$)/i.exec(changedPath);
      if (!match?.[1]) {
        throw new GitPublisherError(
          `Change outside a canonical Scenario transaction prevents recovery: ${changedPath}`,
        );
      }
      ids.add(match[1]);
    }
    return [...ids].sort();
  }

  async publicationCommitState(
    publication: PublicationEvidence,
    baseCommit: string,
    allowedPendingExecutionIds: string[] = [],
  ): Promise<PublicationCommitState> {
    const currentHead = await this.head();
    const transactionDirectory = transactionPath(publication.executionId);
    const expectedPaths = publicationPaths(publication);
    const allowedPendingDirectories = allowedPendingExecutionIds.map(transactionPath);
    const changes = await this.#changes();
    const allowedChange = (change: string) =>
      isInside(change, transactionDirectory) ||
      allowedPendingDirectories.some((directory) => isInside(change, directory));
    if (currentHead === baseCommit) {
      const invalid = changes.filter((change) => !allowedChange(change));
      if (invalid.length > 0) {
        return {
          state: "ambiguous",
          explanation: `Changes outside recovered transaction '${publication.executionId}': ${invalid.join(", ")}`,
        };
      }
      const transactionChanges = changes
        .filter((change) => isInside(change, transactionDirectory))
        .sort();
      if (!samePaths(transactionChanges, expectedPaths)) {
        return {
          state: "ambiguous",
          explanation: `Transaction '${publication.executionId}' paths differ from its execution outputs`,
        };
      }
      if (!(await this.#worktreeMatches(publication))) {
        return {
          state: "ambiguous",
          explanation: `Transaction '${publication.executionId}' bytes differ from its journaled publication`,
        };
      }
      return { state: "needs-commit" };
    }

    const invalid = changes.filter((change) =>
      !allowedPendingDirectories.some((directory) => isInside(change, directory))
    );
    if (invalid.length > 0) {
      return {
        state: "ambiguous",
        explanation: `HEAD advanced with unexpected uncommitted changes: ${invalid.join(", ")}`,
      };
    }
    let parent: string;
    try {
      parent = (await this.#git(["rev-parse", "HEAD^"])).trim();
    } catch {
      return { state: "ambiguous", explanation: "HEAD advanced but its parent cannot be inspected" };
    }
    if (parent !== baseCommit) {
      return { state: "ambiguous", explanation: "HEAD advanced by more than the journaled publication" };
    }
    const committedPaths = splitNull(await this.#git([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      "HEAD",
    ]));
    if (!samePaths(committedPaths.sort(), expectedPaths)) {
      return { state: "ambiguous", explanation: "The new HEAD is not the exact journaled transaction" };
    }
    const subject = (await this.#git(["show", "-s", "--format=%s", "HEAD"])).trim();
    if (subject !== commitMessage(publication)) {
      return { state: "ambiguous", explanation: "The new HEAD has an unexpected commit message" };
    }
    if (!(await this.#commitMatches(publication))) {
      return { state: "ambiguous", explanation: "The new HEAD contains unexpected transaction bytes" };
    }
    return { state: "committed", commit: currentHead };
  }

  async commit(
    publication: PublicationEvidence,
    baseCommit: string,
    allowedPendingExecutionIds: string[] = [],
  ): Promise<string> {
    const state = await this.publicationCommitState(
      publication,
      baseCommit,
      allowedPendingExecutionIds,
    );
    if (state.state === "committed") return state.commit;
    if (state.state === "ambiguous") throw new GitPublisherError(state.explanation);

    const expectedPaths = publicationPaths(publication);
    await this.#configuredIdentity();
    await this.#git(["diff", "--check", "--", ...expectedPaths]);
    await this.#git(["add", "--", ...expectedPaths]);
    const staged = splitNull(await this.#git([
      "diff",
      "--cached",
      "--name-only",
      "-z",
    ])).sort();
    if (!samePaths(staged, expectedPaths)) {
      throw new GitPublisherError("Git staging did not contain exactly the Scenario execution outputs");
    }
    await this.#git(["diff", "--cached", "--check", "--", ...expectedPaths]);
    await this.#git(["commit", "-m", commitMessage(publication), "--", ...expectedPaths]);
    const committed = await this.publicationCommitState(
      publication,
      baseCommit,
      allowedPendingExecutionIds,
    );
    if (committed.state !== "committed") {
      throw new GitPublisherError(
        committed.state === "ambiguous"
          ? committed.explanation
          : "Git commit did not advance HEAD to the exact Scenario transaction",
      );
    }
    return committed.commit;
  }

  async #worktreeMatches(publication: PublicationEvidence): Promise<boolean> {
    validateBlobs(publication);
    const actual = await Promise.all(publication.blobs.map(async ({ path: outputPath }) => ({
      path: outputPath,
      oid: await this.#worktreeBlob(outputPath),
    })));
    return sameBlobs(actual, publication.blobs);
  }

  async #commitMatches(publication: PublicationEvidence): Promise<boolean> {
    validateBlobs(publication);
    const actual = await Promise.all(publication.blobs.map(async ({ path: outputPath }) => ({
      path: outputPath,
      oid: (await this.#git(["rev-parse", `HEAD:${outputPath}`])).trim(),
    })));
    return sameBlobs(actual, publication.blobs);
  }

  async #worktreeBlob(outputPath: string): Promise<string> {
    const oid = (await this.#git(["hash-object", "--no-filters", "--", outputPath])).trim();
    if (!/^[0-9a-f]{40,64}$/.test(oid)) {
      throw new GitPublisherError(`Git did not return a blob identity for '${outputPath}'`);
    }
    return oid;
  }

  async #configuredIdentity(): Promise<void> {
    const [name, email] = await Promise.all([
      this.#git(["config", "--get", "user.name"]),
      this.#git(["config", "--get", "user.email"]),
    ]);
    if (name.trim().length === 0 || email.trim().length === 0) {
      throw new GitPublisherError("Git user.name and user.email must be configured before publication");
    }
  }

  async #changes(): Promise<string[]> {
    const output = await this.#git([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    const records = splitNull(output);
    const paths: string[] = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record === undefined || record.length < 4) continue;
      paths.push(record.slice(3));
      if (record[0] === "R" || record[0] === "C" || record[1] === "R" || record[1] === "C") index += 1;
    }
    return paths;
  }

  async #git(arguments_: string[]): Promise<string> {
    try {
      const result = await executeFile("git", arguments_, {
        cwd: this.#repository,
        env: repositoryGitEnvironment(),
        encoding: "utf8",
        timeout: this.#timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
      return result.stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitPublisherError(`git ${arguments_.join(" ")} failed: ${message}`);
    }
  }
}

function transactionPath(executionId: string): string {
  if (!/^[0-9a-f-]+$/i.test(executionId)) {
    throw new GitPublisherError(`Invalid Scenario execution identity '${executionId}'`);
  }
  return `.lifecycle/data/.transactions/${executionId}`;
}

function publicationPaths(publication: UncapturedPublicationEvidence): string[] {
  const transactionDirectory = transactionPath(publication.executionId);
  const paths = [...new Set(publication.outputPaths)].sort();
  if (
    paths.length === 0 || paths.length !== publication.outputPaths.length ||
    paths.some((outputPath) => !isInside(outputPath, transactionDirectory))
  ) {
    throw new GitPublisherError("Scenario execution outputs do not name unique canonical transaction paths");
  }
  return paths;
}

function isInside(changedPath: string, directory: string): boolean {
  return changedPath === directory || changedPath.startsWith(`${directory}/`);
}

function commitMessage(publication: PublicationEvidence): string {
  return `mdlm: publish ${publication.scenario} (${publication.executionId})`;
}

function splitNull(value: string): string[] {
  return value.split("\0").filter((item) => item.length > 0);
}

function samePaths(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateBlobs(publication: PublicationEvidence): void {
  const expectedPaths = publicationPaths(publication);
  const blobPaths = publication.blobs.map((blob) => blob.path);
  if (
    !samePaths(blobPaths, expectedPaths) ||
    publication.blobs.some((blob) => !/^[0-9a-f]{40,64}$/.test(blob.oid))
  ) {
    throw new GitPublisherError("Journaled publication blobs do not match its exact transaction paths");
  }
}

function sameBlobs(
  left: { path: string; oid: string }[],
  right: { path: string; oid: string }[],
): boolean {
  return left.length === right.length && left.every((blob, index) =>
    blob.path === right[index]?.path && blob.oid === right[index]?.oid
  );
}

function repositoryGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GIT_")) delete environment[name];
  }
  return environment;
}
