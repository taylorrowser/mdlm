import { Writable } from "node:stream";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { writeCommandOutput } from "../src/command-output.js";

describe("MDLM CLI output", () => {
  let parent: string | undefined;

  afterEach(async () => {
    if (parent) await fs.rm(parent, { recursive: true, force: true });
  });

  it("keeps a side-effecting next command open until piped stdout accepts every byte", async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-cli-output-"));
    const repository = path.join(parent, "repository");
    const initialized = await executeCommandApplication(
      ["init", repository, "--json"],
      parent,
    );
    expect(initialized.exitCode).toBe(0);
    const started = await executeCommandApplication(["start", "--json"], repository);
    expect(started.exitCode).toBe(0);

    const next = await executeCommandApplication(["next", "--json"], repository);
    expect(next.exitCode).toBe(0);
    expect(JSON.parse(next.output)).toMatchObject({
      contract: "mdlm-next@2",
      outcome: "assignment",
      assignment: { id: expect.any(String) },
    });

    let releaseWrite: (() => void) | undefined;
    const chunks: Buffer[] = [];
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        releaseWrite = callback;
      },
    });
    let completed = false;
    const writing = writeCommandOutput(stdout, next.output).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);
    releaseWrite!();
    await writing;
    expect(Buffer.concat(chunks).toString("utf8")).toBe(next.output);
  });

  it("rejects a stdout write error", async () => {
    const failure = new Error("stdout closed");
    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback(failure);
      },
    });
    stdout.on("error", () => {});

    await expect(writeCommandOutput(stdout, "result\n")).rejects.toBe(failure);
  });
});
