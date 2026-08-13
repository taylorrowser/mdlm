import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renamedBaselineProcessPackage } from "./helpers/process-package.js";
import { req } from "./helpers/req.js";

describe("exact-baseline corruption verification", () => {
  let repositoryRoot: string;
  let processRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-baseline-corruption-"));
    processRoot = await renamedBaselineProcessPackage("mdlm-baseline-corruption-process-");
    const initialized = req(repositoryRoot, "init", "--process", processRoot, "--json");
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(repositoryRoot, { recursive: true, force: true }),
      fs.rm(path.dirname(processRoot), { recursive: true, force: true }),
    ]);
  });

  it("detects changed bytes, missing references, and corrupt composition", async () => {
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Corruption target",
      "--set",
      "rationale=Frozen bytes must remain exact",
      "--set",
      "problem=Corruption invalidates baseline evidence",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["detect exact corruption"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["verification rejects changed bytes"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    const definition = JSON.parse(created.stdout).created as {
      id: string;
      revisionId: string;
      path: string;
    };
    const baselineCreated = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "SNP",
      "--scenario",
      "create-candidate-baseline@1",
      "--set",
      "title=Verification baseline",
      "--set",
      "kind=group-candidate",
      "--set",
      "role=candidate",
      "--set",
      "scope=Verification baseline",
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(baselineCreated.status, baselineCreated.stderr).toBe(0);
    const baseline = JSON.parse(baselineCreated.stdout).created as {
      id: string;
      revisionId: string;
      path: string;
    };
    expect(req(
      repositoryRoot,
      "baseline",
      "add",
      baseline.id,
      definition.revisionId,
      "--json",
    ).status).toBe(0);
    expect(req(repositoryRoot, "baseline", "freeze", baseline.id, "--json").status).toBe(0);

    const editableComponentCreated = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "SNP",
      "--scenario",
      "create-candidate-baseline@1",
      "--set",
      "title=Editable component",
      "--set",
      "kind=group-candidate",
      "--set",
      "role=candidate",
      "--set",
      "scope=Editable component",
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(editableComponentCreated.status, editableComponentCreated.stderr).toBe(0);
    const editableComponent = JSON.parse(editableComponentCreated.stdout).created as {
      revisionId: string;
    };

    const definitionPath = path.join(repositoryRoot, definition.path);
    const definitionBefore = await fs.readFile(definitionPath, "utf8");
    await fs.writeFile(definitionPath, `${definitionBefore}changed byte\n`);
    const changed = req(
      repositoryRoot,
      "baseline",
      "verify",
      baseline.revisionId,
      "--json",
    );
    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-hash-mismatch",
        path: definition.revisionId,
      })]),
    );

    await fs.writeFile(definitionPath, definitionBefore);
    await fs.rm(definitionPath);
    const missing = req(
      repositoryRoot,
      "baseline",
      "verify",
      baseline.revisionId,
      "--json",
    );
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-reference-missing",
        path: definition.revisionId,
      })]),
    );

    await fs.writeFile(definitionPath, definitionBefore);
    const frozenPath = path.join(repositoryRoot, baseline.path);
    const frozenBefore = await fs.readFile(frozenPath, "utf8");
    await fs.writeFile(
      frozenPath,
      frozenBefore.replace(
        "links: []",
        `links:\n  - type: composes\n    target: ${editableComponent.revisionId}`,
      ),
    );
    const corruptComposition = req(
      repositoryRoot,
      "baseline",
      "verify",
      baseline.revisionId,
      "--json",
    );
    expect(corruptComposition.status).toBe(1);
    expect(JSON.parse(corruptComposition.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: "baseline-composition-not-frozen",
        path: editableComponent.revisionId,
      })]),
    );
  }, 20_000);
});
