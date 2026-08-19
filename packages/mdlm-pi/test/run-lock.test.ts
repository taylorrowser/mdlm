import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunLock, RunLockError } from "../src/run-lock.js";

describe("RunLock", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("admits one controller, rejects a concurrent owner, and releases idempotently", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pi-lock-"));
    roots.push(root);
    const directory = path.join(root, "state");
    const first = await RunLock.acquire(directory);

    await expect(RunLock.acquire(directory)).rejects.toBeInstanceOf(RunLockError);
    await first.release();
    await first.release();

    const next = await RunLock.acquire(directory);
    await next.release();
  });
});
