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
          "No Process Package is selected; run 'req process use <package@version>'",
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
        version: "0.30.0",
        reference: "mdlm-bootstrap@0.30.0",
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
      "mdlm-bootstrap@0.30.0",
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
        version: "0.30.0",
        reference: "mdlm-bootstrap@0.30.0",
        digest: installation.package.digest,
        path: ".lifecycle/packages/mdlm-bootstrap@0.30.0",
      },
      language: { expressions: "mdlm-expression@1" },
    });
  });

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
        reference: "mdlm-bootstrap@0.30.0",
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
      "Validated Process Package: mdlm-bootstrap@0.30.0",
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
        reference: "mdlm-bootstrap@0.30.0",
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
          meta_schema_version: 2,
        }),
        kernelCapabilities: [{
          reference: "exact-baseline@1",
          binding: { type: "BSL" },
        }],
        definitionCatalogs: expect.objectContaining({
          types: ["ART@1", "ASP@1", "BSL@2", "CHG@1", "DEC@2", "DWP@1", "ENV@1", "ICSP@1", "MAP@1", "PAS@1", "PRB@1", "PSP@2", "QST@2", "RES@1", "REV@2", "RUN@1", "STK@2", "SYS@2", "VAI@1", "VER@1", "VSP@1"],
          phases: ["phase-0-wayfinding@2", "phase-1-product-assurance@1", "phase-2-pilot-assessment@1", "phase-2-system-definition@3", "phase-7-change-control@1"],
        }),
      },
      diagnostics: [],
    });

    const human = req(repositoryRoot, "process", "show");
    expect(human.status, human.stderr).toBe(0);
    for (const semantic of [
      "Process Package: mdlm-bootstrap@0.30.0",
      "Expression Language: mdlm-expression@1",
      "Status: experimental",
      "Kernel Contract: mdlm-kernel-process-interface@1",
      "Primitive Catalog: primitives/kernel-v1.yaml@1",
      "Kernel Capabilities: exact-baseline@1 -> BSL",
      "Phases: phase-0-wayfinding@2, phase-1-product-assurance@1, phase-2-pilot-assessment@1, phase-2-system-definition@3, phase-7-change-control@1",
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
        reference: "mdlm-bootstrap@0.30.0",
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
          types: ["ART@1", "ASP@1", "BSL@2", "CHG@1", "DEC@2", "DWP@1", "ENV@1", "ICSP@1", "MAP@1", "PAS@1", "PRB@1", "PSP@2", "QST@2", "RES@1", "REV@2", "RUN@1", "STK@2", "SYS@2", "VAI@1", "VER@1", "VSP@1"],
          phases: ["phase-0-wayfinding@2", "phase-1-product-assurance@1", "phase-2-pilot-assessment@1", "phase-2-system-definition@3", "phase-7-change-control@1"],
        }),
      },
      diagnostics: [],
    });

    const human = req(repositoryRoot, "process", "capabilities");
    expect(human.status, human.stderr).toBe(0);
    for (const semantic of [
      "Process Package: mdlm-bootstrap@0.30.0",
      "Expression Language: mdlm-expression@1",
      "Context Roots: execution, phase, process",
      "Host Functions: count, every, exists, none, one, policy, present, select, state",
      "Collections: baselines [exact-baseline@1], revisions",
      "Kernel Capabilities: exact-baseline@1 -> BSL",
      "Types: ART@1, ASP@1, BSL@2, CHG@1, DEC@2, DWP@1, ENV@1, ICSP@1, MAP@1, PAS@1, PRB@1, PSP@2, QST@2, RES@1, REV@2, RUN@1, STK@2, SYS@2, VAI@1, VER@1, VSP@1",
    ]) {
      expect(human.stdout).toContain(semantic);
    }
  });
});
