import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
  PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
} from "../scripts/root-test-observation-policy.mjs";
import { executeCommandApplication } from "../src/command-application.js";
import { readScenarioExecution } from "../src/scenario-execution.js";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

const projectRoot = process.cwd();
// The compiled-CLI transaction repeatedly reloads the full selected package;
// use the complete max-2 process/repository observation bound.
const commandApplicationTimeout = PROCESS_REPOSITORY_TEST_TIMEOUT_MS;
const CONTENDED_COMMAND_INITIALIZATION_HOOK_TIMEOUT_MS =
  PROCESS_REPOSITORY_HOOK_TIMEOUT_MS;

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
  }, CONTENDED_COMMAND_INITIALIZATION_HOOK_TIMEOUT_MS);

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
      contract: "mdlm-submission-outcome@1",
      outcome: "rejected",
      assignment: { id: assignment },
      responseDigest: `sha256:${createHash("sha256")
        .update(malformedSource).digest("hex")}`,
      retryable: true,
      correctionConsumed: false,
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
      retryAvailability: { malformedResponseCorrection: 1 },
      malformedResponses: [],
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

  it("settles an abandoned nonretryable inability from its authenticated lease", async () => {
    const next = await executeMdlm(repository, "next", "--json");
    expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
    const assignment = JSON.parse(next.stdout).assignment.id as string;
    const unable = {
      reason: "insufficient-declared-inputs",
      diagnostics: [{
        code: "phase-0-map-authority-links-unavailable",
        message: "The Assignment lacks the exact authority links required to proceed.",
        path: "assignment.packet.exactInputs",
      }],
    };
    const responseSource = `${JSON.stringify({
      contract: "mdlm-assignment-response@2",
      assignment,
      kind: "unable",
      unable,
    })}\n`;
    const responseDigest = `sha256:${createHash("sha256")
      .update(responseSource)
      .digest("hex")}`;
    const submitted = await executeMdlmWithInput(
      repository,
      responseSource,
      "scenario",
      "submit",
      "-",
      "--json",
    );
    expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(1);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      command: "scenario.submit",
      outcome: "rejected",
      assignment: { id: assignment },
      responseDigest,
      retryable: false,
    });

    const lease = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/work/active-assignment.json"),
      "utf8",
    ));
    expect(lease).toMatchObject({
      id: assignment,
      disposition: "abandoned",
      response: { kind: "unable", digest: responseDigest, unable },
    });

    const settlement = await executeMdlm(
      repository,
      "scenario",
      "settlement",
      assignment,
      "--json",
    );
    expect(settlement.status, `${settlement.stderr}${settlement.stdout}`).toBe(0);
    expect(JSON.parse(settlement.stdout)).toEqual({
      ok: true,
      command: "scenario.settlement",
      contract: "mdlm-submission-outcome@1",
      outcome: "rejected",
      assignment: { id: assignment },
      responseDigest,
      diagnostics: [],
      retryable: false,
      correctionConsumed: false,
    });
  });

  it(
    "publishes only through scenario submit and retains package readers",
    async () => {
      const next = mdlm(repository, "next");
      expect(next.status, `${next.stderr}${next.stdout}`).toBe(0);
      const assignment = JSON.parse(next.stdout).assignment.id as string;
      const before = await directoryBytes(path.join(repository, ".lifecycle/data"));
      const submitted = mdlmWithInput(
        repository,
        `${JSON.stringify({
          contract: "mdlm-assignment-response@2",
          assignment,
          kind: "proposal",
          proposal: {
            outputs: [{
              handle: "map",
              type: "MAP",
              payload: {
                title: "Clean interface inspection tracer",
                purpose: "Publish one normal datum only through scenario submit.",
                frontier: [{ output: "product_intent" }],
              },
              links: [{
                type: "indexes",
                target: { output: "product_intent" },
              }],
              body: "One canonical publication.\n",
            }, {
              handle: "product_intent",
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
            }],
            completionEvidence: { summary: "Published the inspection tracer." },
          },
        })}\n`,
        "scenario",
        "submit",
      );
      expect(submitted.status, `${submitted.stderr}${submitted.stdout}`).toBe(0);
      expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).not.toBe(before);
      const execution = JSON.parse(submitted.stdout).settlement.execution as string;
      const storedExecution = await readScenarioExecution(repository, execution);
      expect(storedExecution.ok).toBe(true);
      if (!storedExecution.ok) {
        throw new Error(JSON.stringify(storedExecution.diagnostics));
      }
      expect(storedExecution.value.id).toBe(execution);

      const commandReaders = Promise.all([
        executeMdlm(repository, "process", "capabilities", "--json"),
        executeMdlm(
          repository,
          "baseline",
          "verify",
          "BSL-0000000000",
          "--json",
        ),
      ]);
      const [capabilities, missingBaseline] = await commandReaders;
      expect(capabilities.status, capabilities.stdout).toBe(0);
      expect(JSON.parse(capabilities.stdout).capabilities.hostFunctions).toEqual(
        expect.arrayContaining(["array_has_field", "first"]),
      );
      expect(missingBaseline.status).toBe(1);
      expect(JSON.parse(missingBaseline.stdout).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "unknown-baseline" }),
        ]),
      );

    },
    commandApplicationTimeout,
  );
});
