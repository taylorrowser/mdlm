import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import {
  loadProcessPackage,
  type LoadProcessPackageResult,
  type ProcessDiagnostic,
  type ProcessPackage,
} from "./index.js";
import {
  packageSummary,
  packagesRelativePath,
  processSelection,
  repositoryDescriptor,
  repositorySummary,
  selectionRelativePath,
  type PackageSummary,
  type RepositorySummary,
} from "./repository-contract.js";

const executeFile = promisify(execFile);
const bundledProcessPackage = fileURLToPath(
  new URL("../.lifecycle/process/", import.meta.url),
);
const operatorAssetRoot = fileURLToPath(new URL("../operator/", import.meta.url));

const operatorGuide = "MDLM.md";

type DestinationState = "absent" | "empty" | "pristine-git" | "nonempty";

export type RepositoryInitialization =
  | {
      ok: true;
      package: PackageSummary;
      repository: RepositorySummary;
      diagnostics: [];
    }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

function failure(
  code: string,
  message: string,
  pathValue?: string,
): RepositoryInitialization {
  return {
    ok: false,
    diagnostics: [{
      code,
      message,
      ...(pathValue === undefined ? {} : { path: pathValue }),
    }],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function prepareRepository(
  preparationRoot: string,
  processPackageRoot: string,
  processPackage: ProcessPackage,
  summary: PackageSummary,
): Promise<void> {
  const lifecycleRoot = path.join(preparationRoot, ".lifecycle");
  await fs.cp(
    processPackageRoot,
    path.join(preparationRoot, packagesRelativePath, summary.reference),
    { recursive: true },
  );
  await fs.mkdir(path.join(lifecycleRoot, "data"), { recursive: true });
  await fs.mkdir(path.join(lifecycleRoot, "work"), { recursive: true });
  await fs.mkdir(path.join(lifecycleRoot, "generated"), { recursive: true });
  await writeJson(
    path.join(preparationRoot, selectionRelativePath),
    processSelection(summary),
  );
  await writeJson(
    path.join(lifecycleRoot, "repository.json"),
    repositoryDescriptor(processPackage, summary),
  );
  await fs.writeFile(path.join(lifecycleRoot, "data/.gitkeep"), "");
  await fs.writeFile(
    path.join(preparationRoot, ".gitignore"),
    ".lifecycle/generated/\n.lifecycle/work/\n",
  );
  await fs.copyFile(
    path.join(operatorAssetRoot, operatorGuide),
    path.join(preparationRoot, operatorGuide),
  );
}

async function git(
  repositoryRoot: string,
  arguments_: string[],
): Promise<string> {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GIT_")) delete environment[name];
  }
  const result = await executeFile("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
  });
  return result.stdout;
}

async function initializeGit(repositoryRoot: string): Promise<void> {
  await git(repositoryRoot, [
    "init",
    "--quiet",
    "--initial-branch=main",
    "--template=",
  ]);
  await git(repositoryRoot, ["add", "--all"]);
  await git(repositoryRoot, [
    "-c",
    "user.name=MDLM",
    "-c",
    "user.email=mdlm@localhost",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "--message",
    "Initialize MDLM repository",
  ]);
  const commitCount = (await git(repositoryRoot, [
    "rev-list",
    "--count",
    "HEAD",
  ])).trim();
  const status = await git(repositoryRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (commitCount !== "1" || status !== "") {
    throw new Error(
      `Git verification expected one commit and a clean worktree; found ${commitCount} commit(s) and status ${JSON.stringify(status)}`,
    );
  }
}

async function destinationState(
  destination: string,
): Promise<DestinationState> {
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isDirectory()) return "nonempty";
    const entries = await fs.readdir(destination);
    if (entries.length === 0) return "empty";
    if (entries.length !== 1 || entries[0] !== ".git") return "nonempty";

    const gitDirectory = await fs.lstat(path.join(destination, ".git"));
    if (!gitDirectory.isDirectory() || gitDirectory.isSymbolicLink()) {
      return "nonempty";
    }
    const insideWorkTree = (await git(destination, [
      "rev-parse",
      "--is-inside-work-tree",
    ])).trim();
    const gitDirectoryPath = (await git(destination, [
      "rev-parse",
      "--git-dir",
    ])).trim();
    const commitCount = (await git(destination, [
      "rev-list",
      "--all",
      "--count",
    ])).trim();
    const status = await git(destination, [
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
    return insideWorkTree === "true" && gitDirectoryPath === ".git" &&
        commitCount === "0" && status === ""
      ? "pristine-git"
      : "nonempty";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

async function publish(
  preparationRoot: string,
  destination: string,
  state: Exclude<DestinationState, "nonempty">,
): Promise<void> {
  if (state === "absent") {
    await fs.rename(preparationRoot, destination);
    return;
  }

  if (state === "pristine-git") {
    if (await destinationState(destination) !== "pristine-git") {
      throw new Error("The existing Git repository changed during initialization");
    }
    const backup = await fs.mkdtemp(
      path.join(path.dirname(destination), ".mdlm-existing-git-"),
    );
    await fs.rmdir(backup);
    await fs.rename(destination, backup);
    try {
      await fs.rename(preparationRoot, destination);
    } catch (error) {
      await fs.rename(backup, destination);
      throw error;
    }
    await fs.rm(backup, { recursive: true, force: true });
    return;
  }

  await fs.rmdir(destination);
  try {
    await fs.rename(preparationRoot, destination);
  } catch (error) {
    await fs.mkdir(destination);
    throw error;
  }
}

async function initializeRepository(
  destination: string,
  processPackageRoot: string,
  loadPackage: () => Promise<LoadProcessPackageResult>,
): Promise<RepositoryInitialization> {
  const resolvedDestination = path.resolve(destination);
  let state: DestinationState;
  try {
    state = await destinationState(resolvedDestination);
  } catch (error) {
    return failure(
      "destination-inspection-failed",
      `Could not inspect initialization destination: ${error instanceof Error ? error.message : String(error)}`,
      resolvedDestination,
    );
  }
  if (state === "nonempty") {
    return failure(
      "destination-not-empty",
      "Initialization destination must be absent or an empty directory",
      resolvedDestination,
    );
  }

  const loaded = await loadPackage();
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics };
  const summary = await packageSummary(loaded.package, processPackageRoot);
  const repository = repositorySummary(loaded.package);

  const parent = path.dirname(resolvedDestination);
  try {
    await fs.mkdir(parent, { recursive: true });
  } catch (error) {
    return failure(
      "initialization-preparation-failed",
      `Could not prepare the destination parent: ${error instanceof Error ? error.message : String(error)}`,
      parent,
    );
  }

  let preparationRoot: string;
  try {
    preparationRoot = await fs.mkdtemp(path.join(parent, ".mdlm-init-"));
  } catch (error) {
    return failure(
      "initialization-preparation-failed",
      `Could not create initialization staging: ${error instanceof Error ? error.message : String(error)}`,
      parent,
    );
  }

  try {
    try {
      await prepareRepository(
        preparationRoot,
        processPackageRoot,
        loaded.package,
        summary,
      );
      if (state === "pristine-git") {
        await fs.cp(
          path.join(resolvedDestination, ".git"),
          path.join(preparationRoot, ".git"),
          { recursive: true },
        );
      }
    } catch (error) {
      return failure(
        "initialization-preparation-failed",
        `Could not prepare the MDLM repository: ${error instanceof Error ? error.message : String(error)}`,
        resolvedDestination,
      );
    }

    try {
      await initializeGit(preparationRoot);
    } catch (error) {
      return failure(
        "git-setup-failed",
        `Could not create the setup commit: ${error instanceof Error ? error.message : String(error)}`,
        resolvedDestination,
      );
    }

    try {
      await publish(preparationRoot, resolvedDestination, state);
    } catch (error) {
      return failure(
        "initialization-publication-failed",
        `Could not publish the initialized repository: ${error instanceof Error ? error.message : String(error)}`,
        resolvedDestination,
      );
    }

    return { ok: true, package: summary, repository, diagnostics: [] };
  } finally {
    await fs.rm(preparationRoot, { recursive: true, force: true });
  }
}

/** Initialize one destination with an exact, already validated Process Package. */
export function initializeRepositoryFromLoadedProcessPackage(
  destination: string,
  processPackageRoot: string,
  processPackage: ProcessPackage,
): Promise<RepositoryInitialization> {
  return initializeRepository(
    destination,
    processPackageRoot,
    async () => ({ ok: true, package: processPackage, diagnostics: [] }),
  );
}

/** Validate an exact Process Package directory and initialize one destination. */
export function initializeRepositoryFromProcessPackage(
  destination: string,
  processPackageRoot: string,
): Promise<RepositoryInitialization> {
  return initializeRepository(
    destination,
    processPackageRoot,
    () => loadProcessPackage(processPackageRoot),
  );
}

/** Initialize one destination with MDLM's bundled Example Process Package. */
export function initializeBundledRepository(
  destination: string,
  process: "tiny" | "exploratory" = "tiny",
): Promise<RepositoryInitialization> {
  const packageRoot = process === "exploratory"
    ? fileURLToPath(new URL("../.lifecycle/exploratory/", import.meta.url))
    : bundledProcessPackage;
  return initializeRepositoryFromProcessPackage(destination, packageRoot);
}
