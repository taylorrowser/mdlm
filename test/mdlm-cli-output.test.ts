import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runMdlmCli } from "../src/cli-main.js";
import { executeCommandApplication } from "../src/command-application.js";

const executable = path.join(process.cwd(), "dist/mdlm.js");

describe("MDLM CLI output", () => {
  let parent: string | undefined;

  afterEach(async () => {
    if (parent) await fs.rm(parent, { recursive: true, force: true });
  });

  async function startedRepository(): Promise<string> {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-cli-output-"));
    const repository = path.join(parent, "repository");
    const initialized = await executeCommandApplication(
      ["init", repository, "--json"],
      parent,
    );
    expect(initialized.exitCode).toBe(0);
    return repository;
  }

  it("keeps the direct discovery result pending until piped stdout accepts every byte", async () => {
    const repository = await startedRepository();
    let releaseWrite: (() => void) | undefined;
    const chunks: Buffer[] = [];
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        releaseWrite = callback;
      },
    });
    let completed = false;
    const invocation = runMdlmCli({
      arguments_: ["expectations", "--json"],
      cwd: repository,
      stdout,
      stderr: new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
      performanceDiagnostics: false,
    }).then((exitCode) => {
      completed = true;
      return exitCode;
    });

    while (!releaseWrite) await new Promise((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);
    releaseWrite();
    expect(await invocation).toBe(0);
    const output = Buffer.concat(chunks).toString("utf8");
    expect(output.length).toBeGreaterThan(0);
    expect(JSON.parse(output)).toMatchObject({
      contract: "mdlm-expectations@2",
      outcome: "work-available",
      items: expect.any(Array),
    });
  });

  it("fails the built CLI when piped stdout rejects the result", async () => {
    const repository = await startedRepository();
    const probe = path.join(parent!, "stdout-failure.mjs");
    await fs.writeFile(probe, `
process.stdout.write = (_chunk, encoding, callback) => {
  const completed = typeof encoding === "function" ? encoding : callback;
  if (typeof completed === "function") completed(new Error("injected stdout failure"));
  return false;
};
`);

    const next = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(probe).href, executable, "expectations", "--json"],
      { cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );

    expect(next.status).not.toBe(0);
    expect(next.stdout).toBe("");
    expect(next.stderr).toContain("injected stdout failure");
  });

  it("runs through an installed-style bin symlink", async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-cli-symlink-"));
    const launcher = path.join(parent, "mdlm");
    await fs.symlink(executable, launcher);

    const help = spawnSync(process.execPath, [launcher, "--help"], {
      cwd: parent,
      encoding: "utf8",
    });

    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("Usage: mdlm");
  });
});
