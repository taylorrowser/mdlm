import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mdlm, mdlmWithInput } from "./helpers/mdlm.js";

const projectRoot = process.cwd();
// The compiled-CLI transaction repeatedly reloads the full selected package;
// keep a finite bound above the observed cold-run contention window.
const commandApplicationTimeout = 60_000;

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

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" });
}

function expectUnknownCommand(result: ReturnType<typeof mdlm>, label: string): void {
  expect(result.status, `${label}\n${result.stderr}${result.stdout}`).toBe(1);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
    ok: false,
    diagnostics: [expect.objectContaining({ code: "unknown-command" })],
  }));
}

describe("clean mdlm command application", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-command-"));
    repository = path.join(parent, "repository");
    const initialized = mdlm(parent, "init", repository, "--json");
    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
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

  it("rejects every public bypass with structured diagnostics and byte-identical Lifecycle Data", async () => {
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
      ["scenario", "dry-run", "establish-initial-wayfinding-map@1"],
      ["scenario", "execute", "establish-initial-wayfinding-map@1", "--adapter", adapter],
      ["question", "resolve", "--adapter", adapter],
      ["process", "install", path.join(projectRoot, ".lifecycle/process")],
      ["process", "use", "mdlm-bootstrap@0.70.0"],
      ["process", "init", path.join(parent, "package")],
      ["process", "definition", "new", "type", "NEW"],
      ["process", "fixture", "new", "new-fixture"],
    ];

    for (const arguments_ of prohibited) {
      const result = mdlm(repository, ...arguments_, "--json");
      expectUnknownCommand(result, arguments_.join(" "));
      expect(await directoryBytes(path.join(repository, ".lifecycle/data"))).toBe(before);
    }
    await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it(
    "publishes only through scenario submit and retains inspection, package, and baseline readers",
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
                frontier: ["Inspect the exact published Revision"],
              },
              links: [],
              body: "One canonical publication.\n",
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
      const datum = execution.outputs[0].lifecycleDatum;

      for (const arguments_ of [
      ["show", datum.revisionId],
      ["list"],
      ["history", datum.id],
      ["backlinks", datum.revisionId],
      ["trace", datum.revisionId],
      ["scenario", "execution", "show", execution.id],
      ["schema", "MAP"],
      ["phase", "status"],
      ["loose-ends"],
      ["process", "show"],
      ["process", "validate"],
      ["process", "test"],
      ["process", "capabilities"],
    ]) {
      const result = mdlm(repository, ...arguments_, "--json");
      expect(result.status, `${arguments_.join(" ")}\n${result.stderr}${result.stdout}`).toBe(0);
    }

      const capabilities = mdlm(
      repository,
      "process",
      "capabilities",
      "--json",
    );
      expect(capabilities.status, `${capabilities.stderr}${capabilities.stdout}`).toBe(0);
      expect(JSON.parse(capabilities.stdout).capabilities.hostFunctions).toEqual(
        expect.arrayContaining(["array_has_field", "first"]),
      );

      expect(git(repository, "add", ".lifecycle/data").status).toBe(0);
      const committed = git(
      repository,
      "-c", "user.name=MDLM Test",
      "-c", "user.email=mdlm-test@localhost",
      "-c", "commit.gpgSign=false",
      "commit", "--quiet", "--no-verify", "-m", "Publish inspection tracer",
    );
      expect(committed.status, `${committed.stderr}${committed.stdout}`).toBe(0);

      const baselineNext = mdlm(repository, "next");
      expect(baselineNext.status, baselineNext.stderr).toBe(0);
      const baselineAssignment = JSON.parse(baselineNext.stdout).assignment.id as string;
      const baselinePrepared = mdlm(
      repository,
      "scenario",
      "prepare",
      baselineAssignment,
    );
      expect(
      baselinePrepared.status,
      `${baselinePrepared.stderr}${baselinePrepared.stdout}`,
    ).toBe(0);
      expect(JSON.parse(baselinePrepared.stdout).scenario.reference).toBe(
        "compile-psp@2",
      );
      const dataFiles = await fs.readdir(
        path.join(repository, ".lifecycle", "data"),
        { recursive: true },
      );
      const baselineFile = dataFiles.find((file) =>
        /(?:^|\/)BSL\/BSL-[0-9A-HJKMNP-TV-Z]{10,12}\/r00001\.md$/.test(file),
      );
      expect(baselineFile).toBeDefined();
      const baselineId = path.basename(path.dirname(baselineFile!));
      for (const arguments_ of [
        ["baseline", "verify", baselineId],
        ["baseline", "diff", baselineId, baselineId],
      ]) {
      const result = mdlm(repository, ...arguments_, "--json");
      expect(result.status, `${arguments_.join(" ")}\n${result.stderr}${result.stdout}`).toBe(0);
    }
    },
    commandApplicationTimeout,
  );
});
