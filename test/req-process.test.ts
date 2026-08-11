import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req, selectBootstrapProcessPackage } from "./helpers/req.js";

const bootstrapPackage = path.join(process.cwd(), ".lifecycle/process");

describe("req process package commands", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-req-"));
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("installs without implicit activation and records an exact selected package", async () => {
    const missing = req(repositoryRoot, "process", "show", "--json");
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout)).toEqual({
      ok: false,
      diagnostics: [{
        code: "process-package-not-selected",
        message:
          "No Process Package is selected; run 'mdlm process use <package@version>'",
      }],
    });

    const installed = req(
      repositoryRoot,
      "process",
      "install",
      bootstrapPackage,
      "--json",
    );
    expect(installed.status, installed.stderr).toBe(0);
    const installation = JSON.parse(installed.stdout);
    expect(installation).toEqual({
      ok: true,
      command: "process.install",
      package: {
        id: "mdlm-bootstrap",
        version: "0.57.0",
        reference: "mdlm-bootstrap@0.57.0",
        language: "mdlm-expression@1",
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      installed: true,
      selected: false,
      diagnostics: [],
    });
    await expect(
      fs.readFile(
        path.join(repositoryRoot, ".lifecycle/process-selection.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const selected = req(
      repositoryRoot,
      "process",
      "use",
      "mdlm-bootstrap@0.57.0",
      "--json",
    );
    expect(selected.status, selected.stderr).toBe(0);
    expect(JSON.parse(selected.stdout)).toEqual({
      ok: true,
      command: "process.use",
      package: installation.package,
      installed: true,
      selected: true,
      diagnostics: [],
    });
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(repositoryRoot, ".lifecycle/process-selection.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      schemaVersion: 1,
      package: {
        id: "mdlm-bootstrap",
        version: "0.57.0",
        reference: "mdlm-bootstrap@0.57.0",
        digest: installation.package.digest,
        path: ".lifecycle/packages/mdlm-bootstrap@0.57.0",
      },
      language: { expressions: "mdlm-expression@1" },
    });
  });

  it("migrates an initialized repository contract to one exact installed package", async () => {
    const previousPackage = path.join(repositoryRoot, "mdlm-bootstrap-previous");
    await fs.cp(bootstrapPackage, previousPackage, { recursive: true });
    const manifestPath = path.join(previousPackage, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "version: 0.57.0",
        "version: 0.40.0",
      ),
    );
    const previousTargetSelectorPath = path.join(
      previousPackage,
      "selectors/current-pilot-targets-for-requirement.yaml",
    );
    await fs.writeFile(
      previousTargetSelectorPath,
      (await fs.readFile(previousTargetSelectorPath, "utf8")).replace(
        `present(target.payload.public_interface)
    && target.payload.public_interface.working_directory == "fresh-temporary-directory"`,
        'target.payload.kind == "prototype"',
      ),
    );

    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      previousPackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
    const previous = JSON.parse(initialized.stdout).package;
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Historical product intent",
      "--set",
      "rationale=Migration must preserve exact evidence",
      "--set",
      "problem=Repository contracts evolve",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["preserve historical provenance"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["migration leaves Markdown unchanged"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    const createdOutput = JSON.parse(created.stdout).created as {
      path: string;
      revisionId: string;
    };
    const createdPath = path.join(repositoryRoot, createdOutput.path);
    const historicalDatum = await fs.readFile(createdPath, "utf8");
    const historicalRequirementCreated = req(
      repositoryRoot,
      "new",
      "STK",
      "--scenario",
      "draft-stakeholder-requirements@2",
      "--set",
      "title=Historical public target requirement",
      "--set",
      "rationale=Migration must preserve the exact earlier target contract",
      "--set",
      "statement=The product shall expose one historical public behavior.",
      "--set",
      "verification_intent=Invoke the historical public command.",
      "--set",
      "stakeholder=lifecycle author",
      "--set",
      "priority=must",
      "--link",
      `derived-from=${createdOutput.revisionId.replace(/-r[0-9]{5}$/, "")}`,
      "--json",
    );
    expect(
      historicalRequirementCreated.status,
      `${historicalRequirementCreated.stderr}${historicalRequirementCreated.stdout}`,
    ).toBe(0);
    const historicalRequirement = JSON.parse(
      historicalRequirementCreated.stdout,
    ).created as { revisionId: string };
    const historicalTargetCreated = req(
      repositoryRoot,
      "new",
      "ART",
      "--scenario",
      "register-pilot-target@1",
      "--set",
      "title=Historical version-one public target",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:1111111111111111111111111111111111111111",
      "--set",
      'supported_behavior=["historical visible behavior"]',
      "--set",
      'unsupported_behavior=["historical excluded behavior"]',
      "--set",
      'evidence_refs=["historical observation"]',
      "--link",
      `derived-from=${historicalRequirement.revisionId}`,
      "--json",
    );
    expect(
      historicalTargetCreated.status,
      `${historicalTargetCreated.stderr}${historicalTargetCreated.stdout}`,
    ).toBe(0);
    const historicalTarget = JSON.parse(historicalTargetCreated.stdout).created as {
      path: string;
      revisionId: string;
    };
    const historicalTargetPath = path.join(repositoryRoot, historicalTarget.path);
    const historicalTargetDatum = await fs.readFile(historicalTargetPath, "utf8");
    const historicalSelectorSnapshotPath = path.join(
      repositoryRoot,
      "historical-target-snapshot.json",
    );
    const historicalSelectorRecords = [
      historicalRequirement.revisionId,
      historicalTarget.revisionId,
    ].map((revisionId) => {
      const shown = req(repositoryRoot, "show", revisionId, "--json");
      expect(shown.status, `${shown.stderr}${shown.stdout}`).toBe(0);
      return JSON.parse(shown.stdout).lifecycleDatum;
    });
    await fs.writeFile(
      historicalSelectorSnapshotPath,
      JSON.stringify({
        processRef: `${previous.reference}#${previous.digest}`,
        phaseId: "phase-1-product-assurance",
        records: historicalSelectorRecords,
        dependencyComparisons: [],
      }),
    );
    const evaluateHistoricalTarget = () => req(
      repositoryRoot,
      "selector",
      "evaluate",
      "current-pilot-targets-for-requirement@1",
      "--snapshot",
      historicalSelectorSnapshotPath,
      "--arg",
      `requirement=${historicalRequirement.revisionId}`,
      "--json",
    );
    const previouslyEligibleTarget = evaluateHistoricalTarget();
    expect(
      previouslyEligibleTarget.status,
      `${previouslyEligibleTarget.stderr}${previouslyEligibleTarget.stdout}`,
    ).toBe(0);
    expect(JSON.parse(previouslyEligibleTarget.stdout).evaluation.result).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({ revision_id: historicalTarget.revisionId }),
      }),
    ]);

    const adapterPath = path.join(repositoryRoot, "historical-scope-adapter.mjs");
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "decision",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Historical exact scope",
              rationale: "Preserve one exact authority transaction across migration.",
              kind: "scope",
              decision: "Retain this exact historical scope.",
              alternatives: ["Revise the scope"],
              effective_scope: createdOutput.revisionId,
            },
            links: [{ type: "justifies", target: createdOutput.revisionId }],
            body: "Historical stakeholder-authorized scope.\\n",
          },
        }],
        completionEvidence: { summary: "Explicit historical authority supplied." },
      }))});\n`,
      { mode: 0o755 },
    );
    const executed = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-consequential-decision@1",
      "--initiate",
      "--authorize",
      "stakeholder",
      "--adapter",
      adapterPath,
      "--input",
      `subject=${createdOutput.revisionId}`,
      "--json",
    );
    expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
    const execution = JSON.parse(executed.stdout).execution;
    const executionPath = path.join(
      repositoryRoot,
      ".lifecycle/data/.transactions",
      execution.id,
      "execution.json",
    );
    const decisionPath = path.join(
      repositoryRoot,
      execution.outputs[0].lifecycleDatum.path,
    );
    const [historicalExecution, historicalDecision] = await Promise.all([
      fs.readFile(executionPath, "utf8"),
      fs.readFile(decisionPath, "utf8"),
    ]);
    const installed = req(
      repositoryRoot,
      "process",
      "install",
      bootstrapPackage,
      "--json",
    );
    expect(installed.status, installed.stderr).toBe(0);
    const next = JSON.parse(installed.stdout).package;
    expect(
      req(repositoryRoot, "process", "use", next.reference, "--json").status,
    ).toBe(0);

    const descriptorPath = path.join(repositoryRoot, ".lifecycle/repository.json");
    const descriptorBefore = await fs.readFile(descriptorPath, "utf8");
    const mismatched = req(repositoryRoot, "doctor", "--json");
    expect(mismatched.status).toBe(1);
    expect(JSON.parse(mismatched.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "repository-contract-mismatch" }),
    );

    const migrated = req(
      repositoryRoot,
      "process",
      "migrate",
      next.reference,
      "--json",
    );
    expect(migrated.status, `${migrated.stderr}${migrated.stdout}`).toBe(0);
    expect(JSON.parse(migrated.stdout)).toEqual({
      ok: true,
      command: "process.migrate",
      package: next,
      installed: true,
      selected: true,
      migration: {
        from: { reference: previous.reference, digest: previous.digest },
        to: { reference: next.reference, digest: next.digest },
      },
      diagnostics: [],
    });
    expect(await fs.readFile(descriptorPath, "utf8")).not.toBe(descriptorBefore);
    expect(await fs.readFile(createdPath, "utf8")).toBe(historicalDatum);
    expect(await fs.readFile(historicalTargetPath, "utf8")).toBe(historicalTargetDatum);
    const migratedHistoricalTarget = evaluateHistoricalTarget();
    expect(migratedHistoricalTarget.status, migratedHistoricalTarget.stderr).toBe(0);
    expect(JSON.parse(migratedHistoricalTarget.stdout).evaluation.result).toEqual([]);
    expect(await fs.readFile(executionPath, "utf8")).toBe(historicalExecution);
    expect(await fs.readFile(decisionPath, "utf8")).toBe(historicalDecision);
    expect(JSON.parse(await fs.readFile(descriptorPath, "utf8")).package).toEqual({
      reference: next.reference,
      digest: next.digest,
    });
    expect(req(repositoryRoot, "doctor", "--json").status).toBe(0);
    expect(
      req(
        repositoryRoot,
        "process",
        "migrate",
        previous.reference,
        "--json",
      ).status,
    ).toBe(0);

    const human = req(
      repositoryRoot,
      "process",
      "migrate",
      next.reference,
    );
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(
      `Previous Process Package: ${previous.reference}#${previous.digest}`,
    );
    expect(human.stdout).toContain(
      `Current Process Package: ${next.reference}#${next.digest}`,
    );
  }, 45_000);

  it("leaves repository contract files unchanged when migration changes kernel-owned contracts", async () => {
    const previousPackage = path.join(repositoryRoot, "previous-process");
    const incompatiblePackage = path.join(repositoryRoot, "incompatible-process");
    await fs.cp(bootstrapPackage, previousPackage, { recursive: true });
    await fs.cp(bootstrapPackage, incompatiblePackage, { recursive: true });
    for (const [packageRoot, version] of [
      [previousPackage, "0.40.0"],
      [incompatiblePackage, "0.57.0"],
    ] as const) {
      const manifestPath = path.join(packageRoot, "manifest.yaml");
      await fs.writeFile(
        manifestPath,
        (await fs.readFile(manifestPath, "utf8")).replace(
          "version: 0.57.0",
          `version: ${version}`,
        ),
      );
    }
    const incompatibleManifest = path.join(incompatiblePackage, "manifest.yaml");
    await fs.writeFile(
      incompatibleManifest,
      (await fs.readFile(incompatibleManifest, "utf8")).replace(
        "media_type: text/markdown",
        "media_type: text/plain",
      ),
    );
    expect(
      req(
        repositoryRoot,
        "init",
        "--process",
        previousPackage,
        "--json",
      ).status,
    ).toBe(0);
    expect(
      req(
        repositoryRoot,
        "process",
        "install",
        incompatiblePackage,
        "--json",
      ).status,
    ).toBe(0);
    const selectionPath = path.join(
      repositoryRoot,
      ".lifecycle/process-selection.json",
    );
    const descriptorPath = path.join(
      repositoryRoot,
      ".lifecycle/repository.json",
    );
    const [selectionBefore, descriptorBefore] = await Promise.all([
      fs.readFile(selectionPath, "utf8"),
      fs.readFile(descriptorPath, "utf8"),
    ]);

    const result = req(
      repositoryRoot,
      "process",
      "migrate",
      "mdlm-bootstrap@0.57.0",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "repository-contract-incompatible" }),
    );
    await expect(fs.readFile(selectionPath, "utf8")).resolves.toBe(selectionBefore);
    await expect(fs.readFile(descriptorPath, "utf8")).resolves.toBe(descriptorBefore);
  }, 20_000);

  it("rejects incompatible authoritative Markdown before publishing migration files", async () => {
    const previousPackage = path.join(repositoryRoot, "previous-data-process");
    const incompatiblePackage = path.join(repositoryRoot, "incompatible-data-process");
    await fs.cp(bootstrapPackage, previousPackage, { recursive: true });
    await fs.cp(bootstrapPackage, incompatiblePackage, { recursive: true });
    for (const [packageRoot, version] of [
      [previousPackage, "0.40.0"],
      [incompatiblePackage, "0.57.0"],
    ] as const) {
      const manifestPath = path.join(packageRoot, "manifest.yaml");
      await fs.writeFile(
        manifestPath,
        (await fs.readFile(manifestPath, "utf8")).replace(
          "version: 0.57.0",
          `version: ${version}`,
        ),
      );
    }
    const pspTypePath = path.join(incompatiblePackage, "types/PSP.yaml");
    await fs.writeFile(
      pspTypePath,
      (await fs.readFile(pspTypePath, "utf8"))
        .replace(
          "required: [problem, users, goals, non_goals, success_measures]",
          "required: [problem, users, goals, non_goals, success_measures, migration_marker]",
        )
        .replace(
          "    problem: {type: string, minLength: 1}",
          "    migration_marker: {type: string, minLength: 1}\n    problem: {type: string, minLength: 1}",
        ),
    );
    expect(
      req(repositoryRoot, "init", "--process", previousPackage, "--json").status,
    ).toBe(0);
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Existing intent",
      "--set",
      "rationale=Existing data must remain valid",
      "--set",
      "problem=Migration compatibility",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["reject reinterpretation"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["files remain unchanged"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    expect(
      req(
        repositoryRoot,
        "process",
        "install",
        incompatiblePackage,
        "--json",
      ).status,
    ).toBe(0);
    const selectionPath = path.join(repositoryRoot, ".lifecycle/process-selection.json");
    const descriptorPath = path.join(repositoryRoot, ".lifecycle/repository.json");
    const [selectionBefore, descriptorBefore] = await Promise.all([
      fs.readFile(selectionPath, "utf8"),
      fs.readFile(descriptorPath, "utf8"),
    ]);

    const result = req(
      repositoryRoot,
      "process",
      "migrate",
      "mdlm-bootstrap@0.57.0",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "datum-payload" }),
    );
    await expect(fs.readFile(selectionPath, "utf8")).resolves.toBe(selectionBefore);
    await expect(fs.readFile(descriptorPath, "utf8")).resolves.toBe(descriptorBefore);
  }, 25_000);

  it("rejects invalid exact baselines before publishing migration files", async () => {
    const previousPackage = path.join(repositoryRoot, "previous-baseline-process");
    const targetPackage = path.join(repositoryRoot, "target-baseline-process");
    await fs.cp(bootstrapPackage, previousPackage, { recursive: true });
    await fs.cp(bootstrapPackage, targetPackage, { recursive: true });
    for (const [packageRoot, version] of [
      [previousPackage, "0.40.0"],
      [targetPackage, "0.57.0"],
    ] as const) {
      const manifestPath = path.join(packageRoot, "manifest.yaml");
      await fs.writeFile(
        manifestPath,
        (await fs.readFile(manifestPath, "utf8")).replace(
          "version: 0.57.0",
          `version: ${version}`,
        ),
      );
    }
    expect(
      req(repositoryRoot, "init", "--process", previousPackage, "--json").status,
    ).toBe(0);
    const created = req(
      repositoryRoot,
      "new",
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Baseline member",
      "--set",
      "rationale=Migration verifies frozen evidence",
      "--set",
      "problem=Baseline bytes may drift",
      "--set",
      'users=["lifecycle author"]',
      "--set",
      'goals=["detect baseline drift"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["migration is rejected"]',
      "--json",
    );
    expect(created.status, created.stderr).toBe(0);
    const definition = JSON.parse(created.stdout).created;
    const baselineCreated = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@2",
      "--set",
      "title=Migration boundary",
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${definition.revisionId}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(baselineCreated.status, baselineCreated.stderr).toBe(0);
    const baseline = JSON.parse(baselineCreated.stdout).created;
    expect(
      req(
        repositoryRoot,
        "baseline",
        "add",
        baseline.id,
        definition.revisionId,
        "--json",
      ).status,
    ).toBe(0);
    expect(
      req(repositoryRoot, "baseline", "freeze", baseline.id, "--json").status,
    ).toBe(0);
    await fs.appendFile(path.join(repositoryRoot, definition.path), "changed byte\n");
    expect(
      req(repositoryRoot, "process", "install", targetPackage, "--json").status,
    ).toBe(0);
    const selectionPath = path.join(repositoryRoot, ".lifecycle/process-selection.json");
    const descriptorPath = path.join(repositoryRoot, ".lifecycle/repository.json");
    const [selectionBefore, descriptorBefore] = await Promise.all([
      fs.readFile(selectionPath, "utf8"),
      fs.readFile(descriptorPath, "utf8"),
    ]);

    const result = req(
      repositoryRoot,
      "process",
      "migrate",
      "mdlm-bootstrap@0.57.0",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "baseline-hash-mismatch" }),
    );
    await expect(fs.readFile(selectionPath, "utf8")).resolves.toBe(selectionBefore);
    await expect(fs.readFile(descriptorPath, "utf8")).resolves.toBe(descriptorBefore);
  }, 30_000);

  it("leaves both exact contract files unchanged when migration cannot publish", async () => {
    const previousPackage = path.join(repositoryRoot, "previous-write-process");
    await fs.cp(bootstrapPackage, previousPackage, { recursive: true });
    const manifestPath = path.join(previousPackage, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "version: 0.57.0",
        "version: 0.40.0",
      ),
    );
    expect(
      req(repositoryRoot, "init", "--process", previousPackage, "--json").status,
    ).toBe(0);
    expect(
      req(
        repositoryRoot,
        "process",
        "install",
        bootstrapPackage,
        "--json",
      ).status,
    ).toBe(0);
    const lifecycleRoot = path.join(repositoryRoot, ".lifecycle");
    const selectionPath = path.join(lifecycleRoot, "process-selection.json");
    const descriptorPath = path.join(lifecycleRoot, "repository.json");
    const [selectionBefore, descriptorBefore] = await Promise.all([
      fs.readFile(selectionPath, "utf8"),
      fs.readFile(descriptorPath, "utf8"),
    ]);

    await fs.chmod(lifecycleRoot, 0o555);
    let result;
    try {
      result = req(
        repositoryRoot,
        "process",
        "migrate",
        "mdlm-bootstrap@0.57.0",
        "--json",
      );
    } finally {
      await fs.chmod(lifecycleRoot, 0o755);
    }

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "process-migration-write-failed" }),
    );
    await expect(fs.readFile(selectionPath, "utf8")).resolves.toBe(selectionBefore);
    await expect(fs.readFile(descriptorPath, "utf8")).resolves.toBe(descriptorBefore);
    expect(
      (await fs.readdir(lifecycleRoot)).filter((name) =>
        name.endsWith(".tmp") || name.endsWith(".backup")
      ),
    ).toEqual([]);
  }, 20_000);

  it("does not publish migration files when the installed target no longer validates", async () => {
    const previousPackage = path.join(repositoryRoot, "previous-valid-process");
    const targetPackage = path.join(repositoryRoot, "target-corrupt-process");
    await fs.cp(bootstrapPackage, previousPackage, { recursive: true });
    await fs.cp(bootstrapPackage, targetPackage, { recursive: true });
    for (const [packageRoot, version] of [
      [previousPackage, "0.40.0"],
      [targetPackage, "0.57.0"],
    ] as const) {
      const manifestPath = path.join(packageRoot, "manifest.yaml");
      await fs.writeFile(
        manifestPath,
        (await fs.readFile(manifestPath, "utf8")).replace(
          "version: 0.57.0",
          `version: ${version}`,
        ),
      );
    }
    expect(
      req(repositoryRoot, "init", "--process", previousPackage, "--json").status,
    ).toBe(0);
    expect(
      req(
        repositoryRoot,
        "process",
        "install",
        targetPackage,
        "--json",
      ).status,
    ).toBe(0);
    const installedObligation = path.join(
      repositoryRoot,
      ".lifecycle/packages/mdlm-bootstrap@0.57.0/obligations/review-context-required.yaml",
    );
    await fs.writeFile(
      installedObligation,
      (await fs.readFile(installedObligation, "utf8")).replace(
        'satisfied_when: \'exists("valid-review-contexts-for@1", {subject: subject})\'',
        "satisfied_when: 'subject.payload.title ? true'",
      ),
    );
    const selectionPath = path.join(repositoryRoot, ".lifecycle/process-selection.json");
    const descriptorPath = path.join(repositoryRoot, ".lifecycle/repository.json");
    const [selectionBefore, descriptorBefore] = await Promise.all([
      fs.readFile(selectionPath, "utf8"),
      fs.readFile(descriptorPath, "utf8"),
    ]);

    const result = req(
      repositoryRoot,
      "process",
      "migrate",
      "mdlm-bootstrap@0.57.0",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "expression-syntax" }),
    );
    await expect(fs.readFile(selectionPath, "utf8")).resolves.toBe(selectionBefore);
    await expect(fs.readFile(descriptorPath, "utf8")).resolves.toBe(descriptorBefore);
  }, 20_000);

  it("validates the selected package and reports every validation surface", () => {
    selectBootstrapProcessPackage(repositoryRoot);

    const validation = req(
      repositoryRoot,
      "process",
      "validate",
      "--json",
    );
    expect(validation.status, validation.stderr).toBe(0);
    expect(JSON.parse(validation.stdout)).toEqual({
      ok: true,
      command: "process.validate",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.57.0",
        language: "mdlm-expression@1",
      }),
      selected: true,
      validation: {
        compilation: "passed",
        references: "passed",
        capabilityBindings: "passed",
      },
      diagnostics: [],
    });

    const human = req(repositoryRoot, "process", "validate");
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain(
      "Validated Process Package: mdlm-bootstrap@0.57.0",
    );
    expect(human.stdout).toContain("Expression Language: mdlm-expression@1");
    expect(human.stdout).toContain("Compilation: passed");
    expect(human.stdout).toContain("References: passed");
    expect(human.stdout).toContain("Capability Bindings: passed");
    expect(human.stdout).toContain("Diagnostics: none");
  });

  it("inspects the exact selected manifest and definition catalogs", () => {
    selectBootstrapProcessPackage(repositoryRoot);

    const result = req(repositoryRoot, "process", "show", "--json");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "process.show",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.57.0",
        language: "mdlm-expression@1",
      }),
      installed: true,
      selected: true,
      inspection: {
        status: "experimental",
        description: expect.stringContaining("Typed declarative MDLM bootstrap"),
        kernelContract: {
          id: "mdlm-kernel-process-interface",
          version: 1,
          primitiveCatalogRef: "primitives/kernel-v1.yaml@1",
        },
        compatibility: expect.objectContaining({
          minimum_kernel: "0.2.0",
          meta_schema_version: 3,
        }),
        kernelCapabilities: [{
          reference: "exact-baseline@1",
          binding: { type: "BSL" },
        }],
        definitionCatalogs: expect.objectContaining({
          types: ["ART@1", "ASP@2", "BSL@5", "CHG@2", "DEC@6", "DWP@2", "ENV@1", "ICSP@2", "MAP@3", "PAS@1", "PRB@1", "PSP@4", "QST@4", "RES@1", "REV@5", "RUN@1", "STK@4", "SYS@3", "VAI@1", "VER@1", "VSP@1"],
          phases: ["phase-0-wayfinding@4", "phase-1-product-assurance@5", "phase-2-pilot-assessment@3", "phase-2-system-definition@7", "phase-7-change-control@3"],
        }),
      },
      diagnostics: [],
    });

    const human = req(repositoryRoot, "process", "show");
    expect(human.status, human.stderr).toBe(0);
    for (const semantic of [
      "Process Package: mdlm-bootstrap@0.57.0",
      "Expression Language: mdlm-expression@1",
      "Status: experimental",
      "Kernel Contract: mdlm-kernel-process-interface@1",
      "Primitive Catalog: primitives/kernel-v1.yaml@1",
      "Kernel Capabilities: exact-baseline@1 -> BSL",
      "Phases: phase-0-wayfinding@4, phase-1-product-assurance@5, phase-2-pilot-assessment@3, phase-2-system-definition@7, phase-7-change-control@3",
    ]) {
      expect(human.stdout).toContain(semantic);
    }
  });

  it("reports diagnostics when explicit package compilation fails", async () => {
    const invalidPackage = path.join(repositoryRoot, "invalid-process");
    await fs.cp(bootstrapPackage, invalidPackage, { recursive: true });
    const obligationPath = path.join(
      invalidPackage,
      "obligations/review-context-required.yaml",
    );
    await fs.writeFile(
      obligationPath,
      (await fs.readFile(obligationPath, "utf8")).replace(
        'satisfied_when: \'exists("valid-review-contexts-for@1", {subject: subject})\'',
        "satisfied_when: 'subject.payload.title ? true'",
      ),
    );

    const result = req(
      repositoryRoot,
      "process",
      "validate",
      "--ref",
      invalidPackage,
      "--json",
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      command: "process.validate",
      selected: false,
      validation: {
        compilation: "failed",
        references: "unconfirmed",
        capabilityBindings: "unconfirmed",
      },
      diagnostics: [expect.objectContaining({
        code: "expression-syntax",
        source: "subject.payload.title ? true",
        message: "Unexpected character '?'",
      })],
    });

    const human = req(
      repositoryRoot,
      "process",
      "validate",
      "--ref",
      invalidPackage,
    );
    expect(human.status).toBe(1);
    expect(human.stdout).toContain("Compilation: failed");
    expect(human.stdout).toContain("References: unconfirmed");
    expect(human.stdout).toContain("Capability Bindings: unconfirmed");
    expect(human.stdout).toContain(
      "Diagnostic [expression-syntax]: Unexpected character '?'",
    );
  });

  it("enumerates the selected package and kernel expression capabilities", () => {
    selectBootstrapProcessPackage(repositoryRoot);

    const result = req(
      repositoryRoot,
      "process",
      "capabilities",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual({
      ok: true,
      command: "process.capabilities",
      package: expect.objectContaining({
        reference: "mdlm-bootstrap@0.57.0",
        language: "mdlm-expression@1",
      }),
      selected: true,
      capabilities: {
        contextRoots: [
          {
            id: "execution",
            paths: [{ path: "integrity.contract_valid", type: "boolean" }],
          },
          {
            id: "phase",
            paths: [{ path: "id", type: "string" }],
          },
          {
            id: "process",
            paths: [
              { path: "current_ref", type: "string" },
              { path: "integrity.package_valid", type: "boolean" },
            ],
          },
        ],
        paths: expect.objectContaining({
          entity: expect.arrayContaining([
            expect.objectContaining({ path: "identity.revision_id" }),
            expect.objectContaining({ path: "payload.*" }),
          ]),
          context: expect.arrayContaining([
            {
              root: "process",
              path: "integrity.package_valid",
              type: "boolean",
            },
          ]),
        }),
        operators: ["!", "!=", "&&", "<", "<=", "==", ">", ">=", "in", "||"],
        hostFunctions: [
          "count",
          "every",
          "exists",
          "none",
          "one",
          "policy",
          "present",
          "select",
          "state",
        ],
        collections: expect.arrayContaining([
          { id: "revisions", requires: null },
          { id: "baselines", requires: "exact-baseline@1" },
        ]),
        relations: expect.arrayContaining([
          expect.objectContaining({ id: "incoming-links", requires: null }),
          expect.objectContaining({
            id: "baseline-members",
            requires: "exact-baseline@1",
          }),
        ]),
        kernelCapabilities: [{
          reference: "exact-baseline@1",
          binding: { type: "BSL" },
          collections: ["baselines"],
          relations: [
            "baseline-composed",
            "baseline-evidence",
            "baseline-members",
            "baseline-memberships",
          ],
        }],
        definitionCatalogs: expect.objectContaining({
          types: ["ART@1", "ASP@2", "BSL@5", "CHG@2", "DEC@6", "DWP@2", "ENV@1", "ICSP@2", "MAP@3", "PAS@1", "PRB@1", "PSP@4", "QST@4", "RES@1", "REV@5", "RUN@1", "STK@4", "SYS@3", "VAI@1", "VER@1", "VSP@1"],
          phases: ["phase-0-wayfinding@4", "phase-1-product-assurance@5", "phase-2-pilot-assessment@3", "phase-2-system-definition@7", "phase-7-change-control@3"],
        }),
      },
      diagnostics: [],
    });

    const human = req(repositoryRoot, "process", "capabilities");
    expect(human.status, human.stderr).toBe(0);
    for (const semantic of [
      "Process Package: mdlm-bootstrap@0.57.0",
      "Expression Language: mdlm-expression@1",
      "Context Roots: execution, phase, process",
      "Host Functions: count, every, exists, none, one, policy, present, select, state",
      "Collections: baselines [exact-baseline@1], revisions",
      "Kernel Capabilities: exact-baseline@1 -> BSL",
      "Types: ART@1, ASP@2, BSL@5, CHG@2, DEC@6, DWP@2, ENV@1, ICSP@2, MAP@3, PAS@1, PRB@1, PSP@4, QST@4, RES@1, REV@5, RUN@1, STK@4, SYS@3, VAI@1, VER@1, VSP@1",
    ]) {
      expect(human.stdout).toContain(semantic);
    }
  });
});
