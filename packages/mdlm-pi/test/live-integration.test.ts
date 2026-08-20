import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../../..");
const mdlm = path.join(projectRoot, "dist/mdlm.js");
const mdlmPi = path.join(projectRoot, "packages/mdlm-pi/dist/cli.js");
const temporaryRoots: string[] = [];
const liveEnabled = process.env.MDLM_PI_LIVE === "1";

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe.skipIf(!liveEnabled)("mdlm-pi live provider smoke", () => {
  it("initializes a scratch repository and publishes at least one real Assignment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-live-"));
    temporaryRoots.push(root);
    const repository = path.join(root, "repository");
    const mdlmWrapper = path.join(root, "mdlm.mjs");
    await writeFile(mdlmWrapper, `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, [${JSON.stringify(mdlm)}, ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
`);
    await chmod(mdlmWrapper, 0o755);
    await executeFile(process.execPath, [mdlm, "init", repository, "--json"], { cwd: projectRoot });
    await executeFile("git", ["config", "user.name", "MDLM Pi Live Test"], { cwd: repository });
    await executeFile("git", ["config", "user.email", "mdlm-pi-live@localhost"], {
      cwd: repository,
    });
    await executeFile("git", ["add", "."], { cwd: repository });
    await executeFile("git", ["commit", "--quiet", "-m", "initialize live smoke"], {
      cwd: repository,
    });

    const arguments_ = [mdlmPi, "run", repository, "--mdlm", mdlmWrapper];
    if (process.env.MDLM_PI_LIVE_PROVIDER) {
      arguments_.push("--provider", process.env.MDLM_PI_LIVE_PROVIDER);
    }
    if (process.env.MDLM_PI_LIVE_MODEL) {
      arguments_.push("--model", process.env.MDLM_PI_LIVE_MODEL);
    }
    await executeFile(process.execPath, arguments_, {
      cwd: root,
      timeout: 20 * 60_000,
      maxBuffer: 10 * 1024 * 1024,
    }).catch((error: unknown) => {
      const status = typeof error === "object" && error !== null && "code" in error
        ? Number(error.code)
        : NaN;
      if (status !== 4) throw error;
    });

    const subjects = (await executeFile("git", ["log", "--format=%s"], {
      cwd: repository,
    })).stdout;
    expect(subjects).toMatch(/^mdlm: publish /m);
    expect((await executeFile("git", ["status", "--porcelain"], {
      cwd: repository,
    })).stdout).toBe("");
  }, 20 * 60_000);
});
