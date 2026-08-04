import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req, selectBootstrapProcessPackage } from "./helpers/req.js";

const bootstrapRoot = path.join(process.cwd(), ".lifecycle/process");

async function yaml(filePath: string): Promise<Record<string, unknown>> {
  return parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
}

describe("req Process Package scaffolding", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-scaffold-"));
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("scaffolds a package containing only required versioned kernel contracts", async () => {
    const result = req(
      repositoryRoot,
      "process",
      "init",
      "case-process",
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      command: "process.init",
      scaffold: expect.objectContaining({
        package: "case-process@0.1.0",
        derivedFrom: null,
      }),
      diagnostics: [],
    }));
    const packageRoot = path.join(repositoryRoot, "case-process");
    const manifest = await yaml(path.join(packageRoot, "manifest.yaml"));
    expect(manifest).toEqual(expect.objectContaining({
      id: "case-process",
      version: "0.1.0",
      language: { expressions: "mdlm-expression@1" },
      kernel_capabilities: {},
      catalog: {
        templates: [],
        types: [],
        policies: [],
        states: [],
        selectors: [],
        obligations: [],
        scenarios: [],
        phases: [],
        aliases: [],
      },
      provenance: {
        created_by: "req-process-init@1",
        intent: "case-specific-process",
        normative_scope: "this-package-only",
      },
    }));
    const entries = (await fs.readdir(packageRoot)).sort();
    expect(entries).toEqual([
      "aliases",
      "manifest.yaml",
      "meta",
      "obligations",
      "phases",
      "policies",
      "primitives",
      "profiles",
      "prompts",
      "scenarios",
      "selectors",
      "skills",
      "states",
      "templates",
      "types",
    ]);
    expect((await fs.readdir(path.join(packageRoot, "primitives"))).sort()).toEqual([
      "kernel-v1.yaml",
    ]);

    const selected = req(repositoryRoot, "process", "show", "--json");
    expect(selected.status).toBe(1);
    expect(JSON.parse(selected.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "process-package-not-selected" }),
    ]);

    const validation = req(
      repositoryRoot,
      "process",
      "validate",
      "--ref",
      packageRoot,
      "--json",
    );
    expect(validation.status, validation.stderr).toBe(0);
    expect(JSON.parse(validation.stdout)).toEqual(expect.objectContaining({
      ok: true,
      package: expect.objectContaining({ reference: "case-process@0.1.0" }),
      validation: {
        compilation: "passed",
        references: "passed",
        capabilityBindings: "passed",
      },
    }));

    const collision = req(
      repositoryRoot,
      "process",
      "init",
      "case-process",
      "--json",
    );
    expect(collision.status).toBe(1);
    expect(JSON.parse(collision.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "process-package-destination-exists" }),
    ]);
  });

  it("copies an example under an independent identity with exact provenance", async () => {
    selectBootstrapProcessPackage(repositoryRoot);
    const result = req(
      repositoryRoot,
      "process",
      "init",
      "assurance-case",
      "--from",
      "mdlm-bootstrap@0.24.0",
      "--json",
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.scaffold).toEqual(expect.objectContaining({
      package: "assurance-case@0.1.0",
      derivedFrom: expect.objectContaining({
        package: "mdlm-bootstrap@0.24.0",
        digest: expect.stringMatching(/^sha256:/),
      }),
    }));
    const manifest = await yaml(
      path.join(repositoryRoot, "assurance-case", "manifest.yaml"),
    );
    expect(manifest.id).toBe("assurance-case");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.provenance).toEqual(expect.objectContaining({
      created_by: "req-process-init@1",
      derived_from: {
        package: "mdlm-bootstrap@0.24.0",
        digest: output.scaffold.derivedFrom.digest,
      },
    }));
    expect((await yaml(path.join(bootstrapRoot, "manifest.yaml"))).id).toBe(
      "mdlm-bootstrap",
    );
    const selected = req(repositoryRoot, "process", "show", "--json");
    expect(selected.status).toBe(0);
    expect(JSON.parse(selected.stdout).package.reference).toBe(
      "mdlm-bootstrap@0.24.0",
    );

    const validation = req(
      repositoryRoot,
      "process",
      "validate",
      "--ref",
      path.join(repositoryRoot, "assurance-case"),
      "--json",
    );
    expect(validation.status, validation.stderr).toBe(0);
  });

  it("scaffolds every accepted authored definition kind and updates its catalog", async () => {
    const packageRoot = path.join(repositoryRoot, "definition-case");
    expect(req(repositoryRoot, "process", "init", packageRoot).status).toBe(0);
    const definitions = [
      ["template", "case-template", "templates/case-template.yaml", "type-template-definition"],
      ["type", "CSE", "types/CSE.yaml", "type-definition"],
      ["selector", "case-selector", "selectors/case-selector.yaml", "selector-definition"],
      ["policy", "case-policy", "policies/case-policy.yaml", "policy-definition"],
      ["state", "case-state", "states/case-state.yaml", "state-definition"],
      ["obligation", "case-obligation", "obligations/case-obligation.yaml", "obligation-definition"],
      ["scenario", "case-scenario", "scenarios/case-scenario.yaml", "scenario-definition"],
      ["phase", "phase-1-case", "phases/phase-1-case.yaml", "phase-definition"],
      ["profile", "case-profile", "profiles/case-profile.yaml", "implementation-profile-definition"],
      ["alias", "case.prepare", "aliases/case.prepare.yaml", "command-alias-definition"],
    ] as const;

    for (const [kind, id, relativePath, definitionKind] of definitions) {
      const result = req(
        packageRoot,
        "process",
        "definition",
        "new",
        kind,
        id,
        "--json",
      );
      expect(result.status, `${kind}: ${result.stderr}`).toBe(0);
      expect(JSON.parse(result.stdout).definition).toEqual({
        kind,
        id,
        version: 1,
        path: relativePath,
      });
      expect(await yaml(path.join(packageRoot, relativePath))).toEqual(
        expect.objectContaining({ kind: definitionKind, id, version: 1 }),
      );
    }

    const manifest = await yaml(path.join(packageRoot, "manifest.yaml"));
    expect(manifest.catalog).toEqual(expect.objectContaining({
      templates: ["case-template"],
      types: ["CSE"],
      selectors: ["case-selector"],
      policies: ["case-policy"],
      states: ["case-state"],
      obligations: ["case-obligation"],
      scenarios: ["case-scenario"],
      phases: ["phase-1-case"],
      aliases: ["case.prepare"],
    }));
    expect(manifest.profiles).toEqual({
      default: "case-profile@1",
      available: ["profiles/case-profile.yaml@1"],
    });
  });

  it("validates an authored Package Command Alias as an accepted definition kind", async () => {
    selectBootstrapProcessPackage(repositoryRoot);
    const packageRoot = path.join(repositoryRoot, "alias-case");
    expect(req(
      repositoryRoot,
      "process",
      "init",
      packageRoot,
      "--from",
      "mdlm-bootstrap@0.24.0",
    ).status).toBe(0);
    expect(req(
      packageRoot,
      "process",
      "definition",
      "new",
      "alias",
      "case.prepare",
    ).status).toBe(0);
    const aliasPath = path.join(packageRoot, "aliases/case.prepare.yaml");
    const alias = await yaml(aliasPath);
    alias.scenario = "compile-psp@1";
    await fs.writeFile(aliasPath, stringify(alias));

    const validation = req(
      packageRoot,
      "process",
      "validate",
      "--ref",
      packageRoot,
      "--json",
    );
    expect(validation.status, validation.stderr).toBe(0);
  });

  it("scaffolds a reproducible snapshot and expected result that process test evaluates", async () => {
    selectBootstrapProcessPackage(repositoryRoot);
    const packageRoot = path.join(repositoryRoot, "fixture-case");
    expect(req(
      repositoryRoot,
      "process",
      "init",
      packageRoot,
      "--from",
      "mdlm-bootstrap@0.24.0",
    ).status).toBe(0);

    const scaffold = req(
      packageRoot,
      "process",
      "fixture",
      "new",
      "empty-wayfinding",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(scaffold.status, scaffold.stderr).toBe(0);
    expect(JSON.parse(scaffold.stdout).fixture).toEqual({
      name: "empty-wayfinding",
      phase: "phase-0-wayfinding",
      snapshot: "fixtures/empty-wayfinding/snapshot.yaml",
      expected: "fixtures/empty-wayfinding/expected.json",
    });

    const snapshot = await yaml(
      path.join(packageRoot, "fixtures/empty-wayfinding/snapshot.yaml"),
    );
    expect(snapshot).toEqual({
      processRef: "fixture:fixture-case@0.1.0:empty-wayfinding",
      phaseId: "phase-0-wayfinding",
      records: [],
      dependencyComparisons: [],
    });
    const expected = JSON.parse(await fs.readFile(
      path.join(packageRoot, "fixtures/empty-wayfinding/expected.json"),
      "utf8",
    ));
    expect(expected).toEqual(expect.objectContaining({
      schemaVersion: 1,
      package: "fixture-case@0.1.0",
      snapshot: "snapshot.yaml",
      evaluation: expect.objectContaining({ diagnostics: [] }),
    }));

    const test = req(packageRoot, "process", "test", "--json");
    expect(test.status, test.stderr).toBe(0);
    expect(JSON.parse(test.stdout).tests).toEqual({
      passed: 1,
      failed: 0,
      fixtures: [{ name: "empty-wayfinding", passed: true, diagnostics: [] }],
    });

    expected.evaluation.looseEnds = ["unexpected"];
    await fs.writeFile(
      path.join(packageRoot, "fixtures/empty-wayfinding/expected.json"),
      `${JSON.stringify(expected, null, 2)}\n`,
    );
    const mismatch = req(packageRoot, "process", "test", "--json");
    expect(mismatch.status).toBe(1);
    expect(JSON.parse(mismatch.stdout)).toEqual(expect.objectContaining({
      ok: false,
      tests: expect.objectContaining({ passed: 0, failed: 1 }),
      diagnostics: [expect.objectContaining({
        code: "fixture-result-mismatch",
      })],
    }));
  });
});
