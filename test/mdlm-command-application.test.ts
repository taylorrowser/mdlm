import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { loadProcessPackage } from "../src/index.js";
import {
  processCapabilities,
  processInspection,
} from "../src/process-package-inspection.js";
import { testProcessFixtures } from "../src/process-package-fixtures.js";
import { readScenarioExecution } from "../src/scenario-execution.js";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

const projectRoot = process.cwd();
// The compiled-CLI transaction repeatedly reloads the full selected package;
// keep a finite bound above the observed cold-run contention window.
const commandApplicationTimeout = 60_000;

async function copyRepositoryFoundation(
  source: string,
  destination: string,
): Promise<void> {
  await fs.cp(source, destination, {
    recursive: true,
    mode: fsConstants.COPYFILE_FICLONE,
  });
}

async function directoryBytes(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(path.relative(root, absolute));
    }
  }
  await visit(root);
  return JSON.stringify(await Promise.all(files.sort().map(async (file) => [
    file,
    (await fs.readFile(path.join(root, file))).toString("base64"),
  ])));
}

async function executeMdlm(
  repository: string,
  ...arguments_: string[]
): Promise<{ status: number; stdout: string; stderr: string }> {
  const execution = await executeCommandApplication(arguments_, repository);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

async function executeMdlmWithInput(
  repository: string,
  input: string,
  ...arguments_: string[]
): Promise<{ status: number; stdout: string; stderr: string }> {
  const execution = await executeCommandApplication(arguments_, repository, input);
  return { status: execution.exitCode, stdout: execution.output, stderr: "" };
}

function expectUnknownCommand(
  result: { status: number | null; stdout: string; stderr: string },
  label: string,
): void {
  expect(result.status, `${label}\n${result.stderr}${result.stdout}`).toBe(1);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
    ok: false,
    diagnostics: [expect.objectContaining({ code: "unknown-command" })],
  }));
}

describe("clean mdlm command application", () => {
  let templateParent: string;
  let templateRepository: string;
  let parent: string;
  let repository: string;

  beforeAll(async () => {
    templateParent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-command-template-"));
    templateRepository = path.join(templateParent, "repository");
    const initialized = await executeMdlm(
      templateParent,
      "init",
      templateRepository,
      "--json",
    );
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-command-"));
    repository = path.join(parent, "repository");
    await copyRepositoryFoundation(templateRepository, repository);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(templateParent, { recursive: true, force: true });
  });

  it("exposes only the mdlm package executable and build entry", async () => {
    const packageManifest = JSON.parse(
      await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { bin: Record<string, string>; scripts: Record<string, string> };

    expect(packageManifest.bin).toEqual({ mdlm: "./dist/mdlm.js" });
    expect(packageManifest.scripts).not.toHaveProperty("prototype");
    await expect(fs.stat(path.join(projectRoot, "dist/req-entry.js")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(projectRoot, "dist/prototype.js")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects one executable bypass and every semantic bypass without changing Lifecycle Data", async () => {
    const marker = path.join(parent, "adapter-spawned");
    const adapter = path.join(parent, "adapter.mjs");
    await fs.writeFile(
      adapter,
      `#!/usr/bin/env node\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "spawned");\n`,
      { mode: 0o755 },
    );
    const before = await directoryBytes(path.join(repository, ".lifecycle/data"));
    const prohibited = [
      ["new", "QST"],
      ["revise", "QST-0123456789"],
      ["link", "QST-0123456789-r00001", "QST-ABCDEFGHIJ", "--type", "blocks"],
      ["unlink", "QST-0123456789-r00001", "QST-ABCDEFGHIJ", "--type", "blocks"],
      ["baseline", "create", "--type", "BSL"],
      ["baseline", "add", "BSL-0123456789", "QST-0123456789-r00001"],
      ["baseline", "remove", "BSL-0123456789", "QST-0123456789-r00001"],
      ["baseline", "evidence", "add", "BSL-0123456789", "REV-0123456789-r00001"],
      ["baseline", "evidence", "remove", "BSL-0123456789", "REV-0123456789-r00001"],
      ["baseline", "compose", "BSL-0123456789", "BSL-ABCDEFGHIJ-r00001"],
      ["baseline", "freeze", "BSL-0123456789"],
      ["scenario", "dry-run", "establish-initial-wayfinding-map@2"],
      ["question", "resolve", "--adapter", adapter],
      ["process", "install", path.join(projectRoot, ".lifecycle/process")],
      ["process", "use", "mdlm-bootstrap@0.74.0"],
      ["process", "init", path.join(parent, "package")],
      ["process", "definition", "new", "type", "NEW"],
      ["process", "fixture", "new", "new-fixture"],
    ];

    const executableArguments = [
      "scenario",
      "execute",
      "establish-initial-wayfinding-map@2",
      "--adapter",
      adapter,
    ];
    const executableResult = mdlm(repository, ...executableArguments, "--json");
    expectUnknownCommand(executableResult, executableArguments.join(" "));
    expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);
    await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });

    for (const arguments_ of prohibited) {
      const result = await executeMdlm(repository, ...arguments_, "--json");
      expectUnknownCommand(result, arguments_.join(" "));
      expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);
    }
  });

  it("projects durable Assignment dispositions for external crash reconciliation", async () => {
    const next = await executeMdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const assignment = JSON.parse(next.stdout).assignment.id as string;

    const active = await executeMdlm(
      repository,
      "assignment",
      "show",
      assignment,
      "--json",
    );
    expect(active.status, `${active.stderr}${active.stdout}`).toBe(0);
    expect(JSON.parse(active.stdout)).toMatchObject({
      ok: true,
      command: "assignment.show",
      contract: "mdlm-assignment-state@1",
      assignment: { id: assignment },
      selected: true,
      disposition: "active",
      retryAvailability: { malformedResponseCorrection: 1 },
      malformedResponses: [],
    });

    const malformedSource = "{}\n";
    const malformed = await executeMdlmWithInput(
      repository,
      malformedSource,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(malformed.status, `${malformed.stderr}${malformed.stdout}`).toBe(1);
    expect(JSON.parse(malformed.stdout)).toMatchObject({
      disposition: "correction-required",
    });

    const correction = await executeMdlm(
      repository,
      "assignment",
      "show",
      assignment,
      "--json",
    );
    expect(correction.status, `${correction.stderr}${correction.stdout}`).toBe(0);
    expect(JSON.parse(correction.stdout)).toMatchObject({
      selected: true,
      disposition: "active",
      retryAvailability: { malformedResponseCorrection: 0 },
      malformedResponses: [{
        digest: `sha256:${createHash("sha256").update(malformedSource).digest("hex")}`,
      }],
    });

    const absent = await executeMdlm(
      repository,
      "assignment",
      "show",
      "00000000-0000-4000-8000-000000000000",
      "--json",
    );
    expect(absent.status, `${absent.stderr}${absent.stdout}`).toBe(0);
    expect(JSON.parse(absent.stdout)).toMatchObject({
      contract: "mdlm-assignment-state@1",
      selected: false,
    });
  });

  it(
    "publishes only through scenario submit and retains package readers",
    async () => {
      const next = mdlm(repository, "next");
      expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
      const assignment = JSON.parse(next.stdout).assignment.id as string;
      const prepared = mdlm(repository, "scenario", "prepare", assignment);
      expect(prepared.status, `${prepared.stderr}${prepared.stdout}`).toBe(0);
      const packet = JSON.parse(prepared.stdout);
      const before = await directoryBytes(path.join(repository, ".lifecycle/data"));
      const submitted = mdlmWithInput(
      repository,
      `${JSON.stringify({
        contract: "mdlm-assignment-response@1",
        assignment,
        kind: "proposal",
        proposal: {
          outputs: [{
            localId: "map",
            name: "map",
            invocation: 0,
            lifecycleDatum: {
              type: "MAP",
              payload: {
                title: "Clean interface inspection tracer",
                purpose: "Publish one normal datum only through scenario submit.",
                frontier: ["$proposal.product-intent.revision_id"],
              },
              links: [{
                type: "indexes",
                target: "$proposal.product-intent.id",
              }],
              body: "One canonical publication.\n",
            },
          }, {
            localId: "product-intent",
            name: "product_intent",
            invocation: 0,
            lifecycleDatum: {
              type: "QST",
              payload: {
                title: "Exact inspection product intent",
                kind: "preferential",
                intent_scope: "product",
                question: "Which exact product should the inspection trace pursue?",
                state: "open",
                blocking_impact: "PSP compilation waits for the attended answer.",
              },
              links: [],
              body: "The initial frontier carries one exact product-intent Question.\n",
            },
          }],
          completionEvidence: { summary: "Published the inspection tracer." },
          loadedSkillRefs: packet.prompt.skills.map(
            (skill: { reference: string }) => skill.reference,
          ),
          authoritySupplies: [],
          standingDelegations: [],
        },
      })}\n`,
      "scenario",
      "submit",
    );
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).not.toBe(before);
      const execution = JSON.parse(submitted.stdout).execution;
      const storedExecution = await readScenarioExecution(repository, execution.id);
      expect(storedExecution.ok).toBe(true);
      if (!storedExecution.ok) {
        throw new Error(JSON.stringify(storedExecution.diagnostics));
      }
      expect(storedExecution.value.id).toBe(execution.id);

      const descriptor = JSON.parse(await fs.readFile(
        path.join(repository, ".lifecycle/repository.json"),
        "utf8",
      )) as { package: { reference: string } };
      const packageRoot = path.join(
        repository,
        ".lifecycle/packages",
        descriptor.package.reference,
      );
      const loadedPackage = await loadProcessPackage(packageRoot);
      expect(loadedPackage.ok).toBe(true);
      if (!loadedPackage.ok) throw new Error(JSON.stringify(loadedPackage.diagnostics));
      expect(processInspection(loadedPackage.package).status).toBe("experimental");
      const fixtureTests = await testProcessFixtures(packageRoot);
      expect(fixtureTests.ok).toBe(true);
      if (!fixtureTests.ok) throw new Error(JSON.stringify(fixtureTests.diagnostics));
      expect(fixtureTests.value.failed).toBe(0);

      expect(processCapabilities(loadedPackage.package).hostFunctions).toEqual(
        expect.arrayContaining(["array_has_field", "first"]),
      );

    },
    commandApplicationTimeout,
  );
});
