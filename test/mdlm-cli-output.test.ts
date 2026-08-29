import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
    const started = await executeCommandApplication(["start", "--json"], repository);
    expect(started.exitCode).toBe(0);
    return repository;
  }

  async function stdoutProbe(mode: "delay" | "fail"): Promise<string> {
    const probe = path.join(parent!, `stdout-${mode}.mjs`);
    await fs.writeFile(probe, `
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
  const completed = typeof encoding === "function" ? encoding : callback;
  if (typeof completed !== "function") return true;
  if (${JSON.stringify(mode)} === "fail") {
    completed(new Error("injected stdout failure"));
    return false;
  }
  setTimeout(() => {
    if (typeof encoding === "string") originalWrite(chunk, encoding, completed);
    else originalWrite(chunk, completed);
  }, 25);
  return false;
};
`);
    return pathToFileURL(probe).href;
  }

  it("keeps a side-effecting next process open until piped stdout accepts every byte", async () => {
    const repository = await startedRepository();
    const probe = await stdoutProbe("delay");

    const next = spawnSync(
      process.execPath,
      ["--import", probe, executable, "next", "--json"],
      { cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );

    expect(next.status, next.stderr).toBe(0);
    expect(next.stderr).toBe("");
    expect(next.stdout.length).toBeGreaterThan(40_000);
    expect(JSON.parse(next.stdout)).toMatchObject({
      contract: "mdlm-next@2",
      outcome: "assignment",
      assignment: { id: expect.any(String) },
    });
  });

  it("fails the CLI invocation when piped stdout rejects the result", async () => {
    const repository = await startedRepository();
    const probe = await stdoutProbe("fail");

    const next = spawnSync(
      process.execPath,
      ["--import", probe, executable, "next", "--json"],
      { cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );

    expect(next.status).not.toBe(0);
    expect(next.stdout).toBe("");
    expect(next.stderr).toContain("injected stdout failure");
  });
});
