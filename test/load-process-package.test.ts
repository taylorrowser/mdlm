import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";

describe("loadProcessPackage", () => {
  it("loads and validates the bootstrap process package", async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.package.manifest.version).toBe("0.3.0");
    expect(Object.keys(result.package.types)).toHaveLength(7);
    expect(Object.keys(result.package.templates)).toHaveLength(3);
    expect(Object.keys(result.package.selectors)).toHaveLength(24);
    expect(Object.keys(result.package.policies)).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects an obligation that references an unknown selector", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("review-required-revisions@1", "missing-selector@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          message: expect.stringContaining("missing-selector@1"),
        }),
      ]),
    );
  });

  it("rejects a type that extends an unknown template", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const typePath = path.join(processRoot, "types/STK.yaml");
    const typeDefinition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      typeDefinition.replace("requirement@1", "missing-template@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          message: expect.stringContaining("missing-template@1"),
        }),
      ]),
    );
  });

  it("rejects a template inheritance cycle before any type is resolved", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const templatePath = path.join(processRoot, "templates/titled-datum.yaml");
    const templateDefinition = await fs.readFile(templatePath, "utf8");
    await fs.writeFile(
      templatePath,
      templateDefinition.replace(
        "description: Payload fields",
        "extends: requirement@1\ndescription: Payload fields",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reference-cycle",
          message: expect.stringContaining("template"),
        }),
      ]),
    );
  });
});
