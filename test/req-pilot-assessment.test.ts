import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

describe("req Phase 0–2 pilot assessment", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-assessment-"));
    const initialized = req(repositoryRoot, "init", "--process", examplePackage, "--json");
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("supplies package-owned pilot measurement, review, and expansion-decision contracts", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toContain("PAS@1");
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "record-pilot-observation@2",
      "prepare-pilot-assessment-context@1",
      "assess-phase-0-2-pilot@1",
      "revise-pilot-assessment-after-review@2",
      "decide-pilot-expansion@2",
      "revise-pilot-expansion-decision-after-review@1",
    ]));
    expect(catalogs.obligations).toEqual(expect.arrayContaining([
      "pilot-observation-required@1",
      "pilot-assessment-context-required@1",
      "pilot-assessment-required@1",
      "pilot-assessment-review-correction-required@1",
      "pilot-expansion-decision-required@1",
      "pilot-expansion-decision-review-correction-required@1",
    ]));
    expect(catalogs.phases).toContain("phase-2-pilot-assessment@3");
    expect(catalogs.phases).not.toEqual(expect.arrayContaining([
      "phase-3-component-definition@1",
      "phase-4-design-definition@1",
      "phase-5-implementation@1",
      "phase-6-verification@1",
    ]));
  });

});
