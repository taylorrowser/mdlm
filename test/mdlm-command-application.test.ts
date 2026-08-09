import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const bootstrapPackage = path.join(projectRoot, ".lifecycle/process");
const executables = {
  mdlm: path.join(projectRoot, "dist/mdlm.js"),
  prototype: path.join(projectRoot, "dist/prototype.js"),
  req: path.join(projectRoot, "dist/req.js"),
};

function execute(
  executable: string,
  cwd: string,
  ...arguments_: string[]
) {
  return spawnSync(process.execPath, [executable, ...arguments_], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe("shared MDLM command application", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-command-"));
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("exposes mdlm and inspects the same selected Process Package as req", async () => {
    const packageManifest = JSON.parse(
      await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { bin: Record<string, string> };
    expect(packageManifest.bin).toEqual({
      mdlm: "./dist/mdlm.js",
      req: "./dist/req.js",
    });

    const initialized = execute(
      executables.mdlm,
      repositoryRoot,
      "init",
      "--process",
      bootstrapPackage,
      "--json",
    );
    expect(
      initialized.status,
      `${initialized.stderr}${initialized.stdout}`,
    ).toBe(0);

    const throughMdlm = execute(
      executables.mdlm,
      repositoryRoot,
      "process",
      "show",
      "--json",
    );
    const throughReq = execute(
      executables.req,
      repositoryRoot,
      "process",
      "show",
      "--json",
    );

    expect(throughMdlm.status, throughMdlm.stderr).toBe(0);
    expect(throughMdlm.stdout).toBe(throughReq.stdout);
    expect(JSON.parse(throughMdlm.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "process.show",
      selected: true,
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.49.0",
      }),
    }));
  });

  it("keeps the prototype executable as a shared-application bridge", () => {
    const throughPrototype = execute(executables.prototype, projectRoot);
    const throughMdlm = execute(
      executables.mdlm,
      projectRoot,
      "process",
      "validate",
      "--ref",
      bootstrapPackage,
    );

    expect(throughPrototype.status, throughPrototype.stderr).toBe(0);
    expect(throughPrototype.stdout).toBe(throughMdlm.stdout);
  });
});
