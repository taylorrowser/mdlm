import { mkdir } from "node:fs/promises";
import lockfile from "proper-lockfile";

export class RunLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunLockError";
  }
}

export class RunLock {
  static async acquire(directory: string): Promise<RunLock> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const release = await lockfile.lock(directory, {
        realpath: false,
        retries: 0,
        stale: 10_000,
        update: 3_000,
      });
      return new RunLock(release);
    } catch (error) {
      throw new RunLockError(
        `Another mdlm-pi run owns '${directory}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  readonly #release: () => Promise<void>;
  #released = false;

  private constructor(release: () => Promise<void>) {
    this.#release = release;
  }

  async release(): Promise<void> {
    if (this.#released) return;
    this.#released = true;
    await this.#release();
  }
}
