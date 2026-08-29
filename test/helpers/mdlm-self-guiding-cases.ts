import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operatorInstructions } from "../../src/operator-instructions.js";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");

function execute(cwd: string, arguments_: string[]) {
  return executeFrom(mdlmExecutable, cwd, arguments_);
}

function executeFrom(executable: string, cwd: string, arguments_: string[]) {
  return spawnSync(process.execPath, [executable, ...arguments_], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function copyPublicDistribution(destination: string): Promise<void> {
  await fs.mkdir(path.join(destination, ".lifecycle"), { recursive: true });
  await Promise.all([
    fs.cp(path.join(projectRoot, "dist"), path.join(destination, "dist"), {
      recursive: true,
    }),
    fs.cp(
      path.join(projectRoot, ".lifecycle/process"),
      path.join(destination, ".lifecycle/process"),
      { recursive: true },
    ),
    fs.cp(path.join(projectRoot, "operator"), path.join(destination, "operator"), {
      recursive: true,
    }),
    fs.writeFile(path.join(destination, "package.json"), '{"type":"module"}\n'),
    fs.symlink(
      await fs.realpath(path.join(projectRoot, "node_modules")),
      path.join(destination, "node_modules"),
    ),
  ]);
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

describe("self-guiding public CLI", () => {
  let parent: string;
  let repository: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-self-guiding-"));
    repository = path.join(parent, "repository");
    const initialized = execute(parent, ["init", repository, "--json"]);
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("installs one portable guide and equivalent thin provider pointers", async () => {
    const distribution = path.join(parent, "distribution");
    const installedRepository = path.join(parent, "installed-repository");
    await copyPublicDistribution(distribution);
    const initialized = executeFrom(
      path.join(distribution, "dist/mdlm.js"),
      parent,
      ["init", installedRepository, "--json"],
    );
    expect(initialized.status, initialized.stderr).toBe(0);
    repository = installedRepository;
    const installedPaths = [
      "MDLM.md",
      "AGENTS.md",
      "CLAUDE.md",
      ".agents/skills/mdlm/SKILL.md",
      ".claude/skills/mdlm/SKILL.md",
    ];
    for (const relativePath of installedPaths) {
      await expect(fs.readFile(path.join(repository, relativePath), "utf8"))
        .resolves.not.toBe("");
    }
    expect(await fs.readFile(
      path.join(repository, ".agents/skills/mdlm/SKILL.md"),
      "utf8",
    )).toBe(await fs.readFile(
      path.join(repository, ".claude/skills/mdlm/SKILL.md"),
      "utf8",
    ));
    for (const skillPath of [
      ".agents/skills/mdlm/SKILL.md",
      ".claude/skills/mdlm/SKILL.md",
    ]) {
      const guideFromSkill = path.resolve(
        path.dirname(path.join(repository, skillPath)),
        "../../../MDLM.md",
      );
      expect(await fs.readFile(guideFromSkill, "utf8")).toBe(
        await fs.readFile(path.join(repository, "MDLM.md"), "utf8"),
      );
    }
    const guide = await fs.readFile(path.join(repository, "MDLM.md"), "utf8");
    expect(guide).toContain("do not rely on a console or\ntool rendering");
    expect(guide).toContain("`allowedProjections.outputSchemas`");
    expect(guide).toContain("checklist of every\nrequired payload property");
    expect(git(repository, "rev-list", "--count", "HEAD").stdout).toBe("1\n");
    expect(git(repository, "status", "--porcelain").stdout).toBe("");
  });

  it("briefs clean and dirty repositories without changing bytes, refs, or an active lease", async () => {
    const selection = JSON.parse(await fs.readFile(
      path.join(repository, ".lifecycle/process-selection.json"),
      "utf8",
    ));
    const firstNext = execute(repository, ["next", "--json"]);
    expect(firstNext.status, firstNext.stderr).toBe(0);
    const leasePath = path.join(repository, ".lifecycle/work/active-assignment.json");
    const leaseBefore = await fs.readFile(leasePath);
    const refsBefore = git(repository, "show-ref", "--head").stdout;
    const indexPath = path.join(repository, ".git/index");
    const indexBefore = await fs.readFile(indexPath);
    const indexStatBefore = await fs.stat(indexPath);
    const guide = await fs.readFile(path.join(repository, "MDLM.md"), "utf8");

    const first = execute(repository, ["start", "--json"]);
    const second = execute(repository, ["start", "--json"]);
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    const briefing = JSON.parse(first.stdout);
    expect(briefing).toEqual(expect.objectContaining({
      ok: true,
      command: "start",
      contract: "mdlm-start@1",
      package: expect.objectContaining({
        reference: selection.package.reference,
        digest: expect.stringMatching(/^sha256:/),
      }),
      repository: {
        head: expect.stringMatching(/^[0-9a-f]{40}$/),
        trackedState: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
      operatorGuide: {
        path: "MDLM.md",
        content: guide,
        digest: `sha256:${createHash("sha256").update(guide).digest("hex")}`,
      },
      git: { clean: true, trackedPaths: [], untrackedPaths: [] },
      readyToContinue: true,
      nextCommand: "mdlm next --json",
      guidance: "Run mdlm next --json to obtain current work.",
    }));
    expect(second.stdout).toBe(first.stdout);
    expect(await fs.readFile(leasePath)).toEqual(leaseBefore);
    expect(git(repository, "show-ref", "--head").stdout).toBe(refsBefore);
    expect(await fs.readFile(indexPath)).toEqual(indexBefore);
    const indexStatAfter = await fs.stat(indexPath);
    expect(indexStatAfter.mtimeMs).toBe(indexStatBefore.mtimeMs);
    expect(indexStatAfter.ctimeMs).toBe(indexStatBefore.ctimeMs);

    await fs.appendFile(path.join(repository, "MDLM.md"), "dirty\n");
    await fs.writeFile(path.join(repository, "untracked.txt"), "new\n");
    const dirtyJson = execute(repository, ["start", "--json"]);
    expect(dirtyJson.status, dirtyJson.stderr).toBe(0);
    expect(JSON.parse(dirtyJson.stdout)).toEqual(expect.objectContaining({
      git: {
        clean: false,
        trackedPaths: ["MDLM.md"],
        untrackedPaths: ["untracked.txt"],
      },
      readyToContinue: false,
      guidance: "Preserve and resolve this exact Git state before invoking next.",
    }));
    const dirtyPlain = execute(repository, ["start"]);
    expect(dirtyPlain.status, dirtyPlain.stderr).toBe(0);
    expect(dirtyPlain.stdout).toContain("Ready to continue: no");
    expect(dirtyPlain.stdout).toContain(
      "Preserve and resolve this exact Git state before invoking next.",
    );
  });

  it("reports staged-only, worktree-only, and staged-plus-worktree changes", async () => {
    await fs.appendFile(path.join(repository, "AGENTS.md"), "staged only\n");
    expect(git(repository, "add", "AGENTS.md").status).toBe(0);
    await fs.appendFile(path.join(repository, "MDLM.md"), "worktree only\n");
    await fs.appendFile(path.join(repository, "CLAUDE.md"), "staged part\n");
    expect(git(repository, "add", "CLAUDE.md").status).toBe(0);
    await fs.appendFile(path.join(repository, "CLAUDE.md"), "worktree part\n");

    const start = execute(repository, ["start", "--json"]);
    expect(start.status, start.stderr).toBe(0);
    expect(JSON.parse(start.stdout).git).toEqual({
      clean: false,
      trackedPaths: ["AGENTS.md", "CLAUDE.md", "MDLM.md"],
      untrackedPaths: [],
    });
  });

  it("returns versioned continuation instructions for Assignment and Invalid outcomes", async () => {
    const next = execute(repository, ["next", "--json"]);
    const assignment = JSON.parse(next.stdout);
    expect(assignment.operatorInstructions).toEqual(expect.objectContaining({
      contract: "mdlm-operator-instructions@1",
      guidePath: "MDLM.md",
      action: "execute-assignment",
      disposition: "continuation",
      commands: expect.arrayContaining([
        "mdlm scenario submit <response-file> --json",
        "mdlm doctor --json",
        "mdlm next --json",
      ]),
    }));

    await fs.writeFile(
      path.join(repository, ".lifecycle/process-selection.json"),
      "{invalid\n",
    );
    const invalid = execute(repository, ["next", "--json"]);
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).operatorInstructions).toEqual(
      expect.objectContaining({
        contract: "mdlm-operator-instructions@1",
        action: "stop-failure",
        disposition: "unsuccessful-stop",
        commands: [],
      }),
    );
  });

  it("lists the complete agent-guided path in generic help", () => {
    const help = execute(repository, ["--help"]);
    expect(help.status, help.stderr).toBe(0);
    for (const command of [
      "mdlm init <destination>",
      "mdlm start [--json]",
      "mdlm next [--json]",
      "mdlm scenario submit [response-file|-] [--json]",
      "mdlm doctor [--json]",
    ]) expect(help.stdout).toContain(command);
  });
});

describe("mdlm-next@2 operator instruction contract", () => {
  const assignment = { id: "assignment-1" };

  it("keeps a persistent coordinator moving through fresh Assignments", () => {
    const instructions = operatorInstructions({
      outcome: "assignment",
      assignment,
    });

    expect(instructions.text).toContain("Begin this Assignment now");
    expect(instructions.text).toContain(
      "Do not stop merely to report a fresh Assignment",
    );
    expect(instructions.text).toContain("one-Assignment loop");
    expect(instructions.text).toContain("attended authority is unavailable");
    expect(instructions.text).toContain("integrity failure");
    expect(instructions.text).toContain("Profile Boundary Reached");
    expect(instructions.text).toContain("Lifecycle Complete");
  });

  it.each([
    ["assignment", "execute-assignment", "continuation"],
    ["attention-required", "obtain-attention", "continuation"],
    ["profile-boundary-reached", "stop-success", "successful-stop"],
    ["lifecycle-complete", "stop-success", "successful-stop"],
    ["process-dead-end", "stop-failure", "unsuccessful-stop"],
    ["invalid", "stop-failure", "unsuccessful-stop"],
  ] as const)("maps %s to %s", (outcome, action, disposition) => {
    expect(operatorInstructions({ outcome, assignment })).toEqual(
      expect.objectContaining({
        contract: "mdlm-operator-instructions@1",
        guidePath: "MDLM.md",
        action,
        disposition,
      }),
    );
  });

  it("does not recreate preparation choreography", () => {
    const instructions = operatorInstructions({ outcome: "assignment", assignment });
    expect(instructions.commands.join(" ")).not.toContain("scenario prepare");
  });
});
