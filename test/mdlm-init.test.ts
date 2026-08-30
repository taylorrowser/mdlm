import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentProcessPackageIdentity } from "./helpers/current-process-package-identity.js";
import "./helpers/mdlm-self-guiding-cases.js";

const projectRoot = process.cwd();
const mdlmExecutable = path.join(projectRoot, "dist/mdlm.js");
const resolvedDependency = fileURLToPath(import.meta.resolve("yaml"));
const nodeModulesMarker = `${path.sep}node_modules`;
const dependenciesRoot = resolvedDependency.slice(
  0,
  resolvedDependency.indexOf(nodeModulesMarker) + nodeModulesMarker.length,
);

function executeFrom(
  executable: string,
  cwd: string,
  arguments_: string[],
  env?: NodeJS.ProcessEnv,
) {
  return spawnSync(process.execPath, [executable, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: env ?? process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function execute(
  cwd: string,
  arguments_: string[],
  env?: NodeJS.ProcessEnv,
) {
  return executeFrom(mdlmExecutable, cwd, arguments_, env);
}

function git(repository: string, ...arguments_: string[]) {
  return spawnSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
  });
}

async function copyDistribution(distribution: string): Promise<void> {
  await fs.mkdir(path.join(distribution, ".lifecycle"), { recursive: true });
  await Promise.all([
    fs.cp(path.join(projectRoot, "dist"), path.join(distribution, "dist"), {
      recursive: true,
    }),
    fs.cp(
      path.join(projectRoot, ".lifecycle/process"),
      path.join(distribution, ".lifecycle/process"),
      { recursive: true },
    ),
    fs.cp(
      path.join(projectRoot, "operator"),
      path.join(distribution, "operator"),
      { recursive: true },
    ),
    fs.writeFile(
      path.join(distribution, "package.json"),
      '{"type":"module"}\n',
    ),
    fs.symlink(
      dependenciesRoot,
      path.join(distribution, "node_modules"),
    ),
  ]);
}

describe("mdlm init", () => {
  let parent: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-init-public-"));
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("initializes an absent destination with the bundled package and one clean setup commit", async () => {
    const destination = path.join(parent, "product");
    const { reference } = await currentProcessPackageIdentity(
      path.join(projectRoot, ".lifecycle/process"),
    );
    const initialized = execute(parent, ["init", destination, "--json"]);

    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    expect(JSON.parse(initialized.stdout)).toEqual(
      expect.objectContaining({
        ok: true,
        command: "init",
        package: expect.objectContaining({
          reference,
        }),
        repository: expect.objectContaining({
        contract: "mdlm-repository@1",
      }),
      }),
    );

    const selection = JSON.parse(await fs.readFile(
      path.join(destination, ".lifecycle/process-selection.json"),
      "utf8",
    ));
    expect(selection.package.reference).toBe(reference);
    await expect(fs.stat(path.join(destination, ".lifecycle/data")))
      .resolves.toMatchObject({});
    await expect(fs.stat(path.join(destination, ".lifecycle/work")))
      .resolves.toMatchObject({});

    const history = git(
      destination,
      "log",
      "--format=%an <%ae>%n%s",
    );
    expect(history.status, history.stderr).toBe(0);
    expect(history.stdout).toBe(
      "MDLM <mdlm@localhost>\nInitialize MDLM repository\n",
    );
    expect(git(destination, "rev-list", "--count", "HEAD").stdout).toBe("1\n");
    expect(git(destination, "status", "--porcelain").stdout).toBe("");

    const ignored = git(
      destination,
      "check-ignore",
      ".lifecycle/work",
      ".lifecycle/generated",
    );
    expect(ignored.status, ignored.stderr).toBe(0);
    expect(ignored.stdout).toBe(
      ".lifecycle/work\n.lifecycle/generated\n",
    );

    const doctor = execute(destination, ["doctor", "--json"]);
    expect(doctor.status, `${doctor.stderr}${doctor.stdout}`).toBe(0);
    expect(git(destination, "status", "--porcelain").stdout).toBe("");
  });

  it("initializes an existing empty destination", async () => {
    const destination = path.join(parent, "product");
    await fs.mkdir(destination);

    const initialized = execute(parent, ["init", destination, "--json"]);

    expect(initialized.status, initialized.stderr).toBe(0);
    expect(git(destination, "status", "--porcelain").stdout).toBe("");
    expect(git(destination, "rev-list", "--count", "HEAD").stdout).toBe("1\n");
  });

  it("accepts only a pristine existing Git repository", async () => {
    const destination = path.join(parent, "product");
    await fs.mkdir(destination);
    expect(git(destination, "init", "--quiet").status).toBe(0);
    expect(git(destination, "config", "mdlm.test-marker", "preserved").status)
      .toBe(0);

    const initialized = execute(parent, ["init", destination, "--json"]);

    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    expect(git(destination, "config", "--get", "mdlm.test-marker").stdout)
      .toBe("preserved\n");
    expect(git(destination, "status", "--porcelain").stdout).toBe("");
    expect(git(destination, "rev-list", "--count", "HEAD").stdout).toBe("1\n");

    const withHistory = path.join(parent, "with-history");
    await fs.mkdir(withHistory);
    expect(git(withHistory, "init", "--quiet").status).toBe(0);
    expect(git(
      withHistory,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--quiet",
      "--allow-empty",
      "--message",
      "existing history",
    ).status).toBe(0);
    const existingHead = git(withHistory, "rev-parse", "HEAD").stdout;

    const rejected = execute(parent, ["init", withHistory, "--json"]);

    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "destination-not-empty",
      })],
    }));
    expect(git(withHistory, "rev-parse", "HEAD").stdout).toBe(existingHead);
  });

  it("rejects a nonempty destination without altering it", async () => {
    const destination = path.join(parent, "product");
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "keep.txt"), "preserve me\n");

    const initialized = execute(parent, ["init", destination, "--json"]);

    expect(initialized.status).toBe(1);
    expect(JSON.parse(initialized.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "destination-not-empty",
      })],
    }));
    expect(await fs.readdir(destination)).toEqual(["keep.txt"]);
    expect(await fs.readFile(path.join(destination, "keep.txt"), "utf8"))
      .toBe("preserve me\n");
  });

  it("rejects custom Process Package options without creating a destination", async () => {
    const destination = path.join(parent, "product");

    const initialized = execute(parent, [
      "init",
      destination,
      "--process",
      path.join(projectRoot, ".lifecycle/process"),
      "--json",
    ]);

    expect(initialized.status).toBe(1);
    expect(JSON.parse(initialized.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "init-custom-process-unsupported",
      })],
    }));
    await expect(fs.stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ignores ambient Git routing and identity configuration", async () => {
    const destination = path.join(parent, "product");
    const otherRepository = path.join(parent, "other");
    await fs.mkdir(otherRepository);
    expect(git(otherRepository, "init", "--quiet").status).toBe(0);

    const initialized = execute(parent, ["init", destination, "--json"], {
      ...process.env,
      GIT_DIR: path.join(otherRepository, ".git"),
      GIT_WORK_TREE: otherRepository,
      GIT_INDEX_FILE: path.join(parent, "outside-index"),
      GIT_AUTHOR_NAME: "Ambient Author",
      GIT_AUTHOR_EMAIL: "ambient@example.com",
      GIT_COMMITTER_NAME: "Ambient Committer",
      GIT_COMMITTER_EMAIL: "ambient@example.com",
    });

    expect(initialized.status, `${initialized.stderr}${initialized.stdout}`).toBe(0);
    expect(git(destination, "log", "--format=%an <%ae>").stdout).toBe(
      "MDLM <mdlm@localhost>\n",
    );
    expect(git(otherRepository, "rev-list", "--all", "--count").stdout).toBe("0\n");
    await expect(fs.stat(path.join(parent, "outside-index")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves no destination when its bundled package fails validation", async () => {
    const distribution = path.join(parent, "distribution");
    await copyDistribution(distribution);
    await fs.writeFile(
      path.join(distribution, ".lifecycle/process/types/PSP.yaml"),
      "kind: not-a-type\n",
    );
    const destination = path.join(parent, "product");

    const initialized = executeFrom(
      path.join(distribution, "dist/mdlm.js"),
      parent,
      ["init", destination, "--json"],
    );

    expect(initialized.status, initialized.stderr).toBe(1);
    expect(initialized.stdout, initialized.stderr).not.toBe("");
    expect(JSON.parse(initialized.stdout).diagnostics.length).toBeGreaterThan(0);
    await expect(fs.stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(parent)).filter((entry) =>
      entry.startsWith(".mdlm-init-")
    )).toEqual([]);
  });

  it("leaves no destination when repository preparation fails", async () => {
    const distribution = path.join(parent, "distribution");
    await copyDistribution(distribution);
    const fifo = path.join(distribution, ".lifecycle/process/copy-failure");
    const createdFifo = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    expect(createdFifo.status, createdFifo.stderr).toBe(0);
    const destination = path.join(parent, "product");

    const initialized = executeFrom(
      path.join(distribution, "dist/mdlm.js"),
      parent,
      ["init", destination, "--json"],
    );

    expect(initialized.status).toBe(1);
    expect(JSON.parse(initialized.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "initialization-preparation-failed",
      })],
    }));
    await expect(fs.stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(parent)).filter((entry) =>
      entry.startsWith(".mdlm-init-")
    )).toEqual([]);
  });

  it("rolls back an existing empty destination when Git setup fails", async () => {
    const destination = path.join(parent, "product");
    await fs.mkdir(destination);
    const fakeBin = path.join(parent, "fake-bin");
    await fs.mkdir(fakeBin);
    await fs.writeFile(
      path.join(fakeBin, "git"),
      "#!/bin/sh\necho 'injected git failure' >&2\nexit 73\n",
      { mode: 0o755 },
    );

    const initialized = execute(parent, ["init", destination, "--json"], {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    });

    expect(initialized.status).toBe(1);
    expect(JSON.parse(initialized.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "git-setup-failed" })],
    }));
    expect(await fs.readdir(destination)).toEqual([]);
    expect((await fs.readdir(parent)).filter((entry) =>
      entry.startsWith(".mdlm-init-")
    )).toEqual([]);
  });

  it("does not publish over a destination populated during preparation", async () => {
    const destination = path.join(parent, "product");
    await fs.mkdir(destination);
    const fakeBin = path.join(parent, "fake-bin");
    await fs.mkdir(fakeBin);
    const realGit = spawnSync("which", ["git"], { encoding: "utf8" })
      .stdout.trim();
    await fs.writeFile(
      path.join(fakeBin, "git"),
      `#!/bin/sh\nif [ "$1" = status ]; then\n  touch "$MDLM_PUBLICATION_BLOCKER/keep.txt"\nfi\nexec "${realGit}" "$@"\n`,
      { mode: 0o755 },
    );

    const initialized = execute(parent, ["init", destination, "--json"], {
      ...process.env,
      MDLM_PUBLICATION_BLOCKER: destination,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    });

    expect(initialized.status).toBe(1);
    expect(JSON.parse(initialized.stdout)).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "initialization-publication-failed",
      })],
    }));
    expect(await fs.readdir(destination)).toEqual(["keep.txt"]);
    expect((await fs.readdir(parent)).filter((entry) =>
      entry.startsWith(".mdlm-init-")
    )).toEqual([]);
  });
});
