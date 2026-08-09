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

  it("exposes one command application through mdlm and temporary bridges", async () => {
    const packageManifest = JSON.parse(
      await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { bin: Record<string, string> };
    expect(packageManifest.bin).toEqual({
      mdlm: "./dist/mdlm.js",
      req: "./dist/req.js",
    });

    const unselected = Object.values(executables).map((executable) =>
      execute(executable, repositoryRoot, "process", "show", "--json")
    );
    for (const invocation of unselected) {
      expect(invocation.status, invocation.stderr).toBe(1);
      expect(invocation.stderr).toBe("");
      expect(invocation.stdout).toBe(unselected[0]?.stdout);
    }
    expect(JSON.parse(unselected[0]!.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "process-package-not-selected",
        message:
          "No Process Package is selected; run 'mdlm process use <package@version>'",
      })],
    }));

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

    const inspected = Object.values(executables).map((executable) =>
      execute(executable, repositoryRoot, "process", "show", "--json")
    );
    for (const invocation of inspected) {
      expect(invocation.status, invocation.stderr).toBe(0);
      expect(invocation.stderr).toBe("");
      expect(invocation.stdout).toBe(inspected[0]?.stdout);
    }
    expect(JSON.parse(inspected[0]!.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "process.show",
      selected: true,
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.49.0",
      }),
    }));
  });

  it("does not add an alternate unselected-package Loose End route", () => {
    const result = execute(
      executables.mdlm,
      repositoryRoot,
      "loose-ends",
      "--ref",
      bootstrapPackage,
      "--snapshot",
      path.join(projectRoot, "examples/psp-to-sys-snapshot.yaml"),
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "process-package-not-selected",
      })],
    }));
  });

  it("uses the canonical mdlm presentation for top-level failures", () => {
    const initialized = execute(
      executables.mdlm,
      repositoryRoot,
      "init",
      "--process",
      bootstrapPackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);

    const arguments_ = [
      "process",
      "expression",
      "evaluate",
      "review-context-required@2#satisfied_when",
      "--snapshot",
      path.join(projectRoot, "examples/psp-to-sys-snapshot.yaml"),
      "--bindings",
      JSON.stringify({ candidate: "PSP-7K3M9Q2D8F-r00001" }),
      "--json",
    ];
    const invocations = Object.values(executables).map((executable) =>
      execute(executable, repositoryRoot, ...arguments_)
    );

    for (const invocation of invocations) {
      expect(invocation.status, invocation.stderr).toBe(1);
      expect(invocation.stderr).toBe("");
      expect(invocation.stdout).toBe(invocations[0]?.stdout);
    }
    expect(JSON.parse(invocations[0]!.stdout)).toEqual({
      ok: false,
      diagnostics: [{
        code: "mdlm-error",
        message:
          "Unknown expression binding 'candidate'; missing required binding 'subject'",
      }],
    });
  });
});
