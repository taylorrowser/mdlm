import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PublicationEvidence } from "./run-journal.js";

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
      const transactionChanges = changes.filter((change) => isInside(change, transactionDirectory));
      return transactionChanges.length === 0
        ? {
            state: "ambiguous",
            explanation: `Transaction '${publication.executionId}' is neither committed nor visible in the worktree`,
          }
        : { state: "needs-commit" };
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
    if (
      committedPaths.length === 0 ||
      committedPaths.some((changedPath) => !isInside(changedPath, transactionDirectory))
    ) {
      return { state: "ambiguous", explanation: "The new HEAD is not the exact journaled transaction" };
    }
    const subject = (await this.#git(["show", "-s", "--format=%s", "HEAD"])).trim();
    if (subject !== commitMessage(publication)) {
      return { state: "ambiguous", explanation: "The new HEAD has an unexpected commit message" };
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

    const transactionDirectory = transactionPath(publication.executionId);
    await this.#git(["add", "--", transactionDirectory]);
    const staged = splitNull(await this.#git([
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--",
      transactionDirectory,
    ]));
    if (staged.length === 0 || staged.some((changedPath) => !isInside(changedPath, transactionDirectory))) {
      throw new GitPublisherError("Git staging did not contain exactly the canonical Scenario transaction");
    }
    await this.#git(["commit", "-m", commitMessage(publication)]);
    return this.head();
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

function isInside(changedPath: string, directory: string): boolean {
  return changedPath === directory || changedPath.startsWith(`${directory}/`);
}

function commitMessage(publication: PublicationEvidence): string {
  return `mdlm: publish ${publication.scenario} (${publication.executionId})`;
}

function splitNull(value: string): string[] {
  return value.split("\0").filter((item) => item.length > 0);
}
