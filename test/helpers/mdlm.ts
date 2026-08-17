import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadProcessPackage } from "../../src/index.js";
import {
  packageSummary,
  processSelection,
  repositoryDescriptor,
} from "../../src/repository-contract.js";

const mdlmExecutable = path.join(process.cwd(), "dist/mdlm.js");

export function mdlm(cwd: string, ...arguments_: string[]) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function mdlmWithEnvironment(
  cwd: string,
  environment: NodeJS.ProcessEnv,
  ...arguments_: string[]
) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function mdlmWithInput(
  cwd: string,
  input: string,
  ...arguments_: string[]
) {
  return spawnSync(process.execPath, [mdlmExecutable, ...arguments_], {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function selectedFixtureContracts(
  repositoryRoot: string,
  packageRoot: string,
): Promise<void> {
  const loaded = await loadProcessPackage(packageRoot);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  const summary = await packageSummary(loaded.package, packageRoot);
  const installedRoot = path.join(
    repositoryRoot,
    ".lifecycle/packages",
    summary.reference,
  );
  await fs.rm(installedRoot, { recursive: true, force: true });
  await fs.cp(packageRoot, installedRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(repositoryRoot, ".lifecycle/process-selection.json"),
      `${JSON.stringify(processSelection(summary), null, 2)}\n`,
    ),
    fs.writeFile(
      path.join(repositoryRoot, ".lifecycle/repository.json"),
      `${JSON.stringify(repositoryDescriptor(loaded.package, summary), null, 2)}\n`,
    ),
  ]);
}

/** Initialize an empty fixture repository through the compiled public executable. */
export function selectBootstrapProcessPackage(repositoryRoot: string): void {
  const initialized = mdlm(repositoryRoot, "init", ".", "--json");
  if (initialized.status !== 0) {
    throw new Error(
      `Could not initialize test repository: ${initialized.stderr}${initialized.stdout}`,
    );
  }
}

/**
 * Replace the bundled package in an initialized repository as fixture setup.
 * This is deliberately not a public package-selection compatibility helper.
 */
export async function selectProcessPackageFixture(
  repositoryRoot: string,
  packageRoot: string,
): Promise<void> {
  selectBootstrapProcessPackage(repositoryRoot);
  await selectedFixtureContracts(repositoryRoot, packageRoot);
  const staged = spawnSync("git", ["-C", repositoryRoot, "add", "--all"], {
    encoding: "utf8",
  });
  if (staged.status !== 0) throw new Error(staged.stderr);
  const amended = spawnSync(
    "git",
    [
      "-C",
      repositoryRoot,
      "-c",
      "user.name=MDLM Test",
      "-c",
      "user.email=mdlm-test@localhost",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--amend",
      "--quiet",
      "--no-edit",
      "--no-verify",
    ],
    { encoding: "utf8" },
  );
  if (amended.status !== 0) throw new Error(amended.stderr);
}

/** Stage an exact package directory for migration tests without a public command. */
export async function stageProcessPackageFixture(
  repositoryRoot: string,
  packageRoot: string,
): Promise<string> {
  const loaded = await loadProcessPackage(packageRoot);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  const summary = await packageSummary(loaded.package, packageRoot);
  const installedRoot = path.join(
    repositoryRoot,
    ".lifecycle/packages",
    summary.reference,
  );
  await fs.rm(installedRoot, { recursive: true, force: true });
  await fs.cp(packageRoot, installedRoot, { recursive: true });
  return summary.reference;
}
