import path from "node:path";
import { spawnSync } from "node:child_process";

const reqExecutable = path.join(process.cwd(), "dist/req.js");

export function req(cwd: string, ...arguments_: string[]) {
  return spawnSync(process.execPath, [reqExecutable, ...arguments_], {
    cwd,
    encoding: "utf8",
  });
}

export function selectProcessPackage(
  repositoryRoot: string,
  packagePath: string,
  packageReference: string,
): void {
  const installation = req(
    repositoryRoot,
    "process",
    "install",
    packagePath,
    "--json",
  );
  if (installation.status !== 0) {
    throw new Error(
      `Could not install test Process Package: ${installation.stderr}${installation.stdout}`,
    );
  }
  const selection = req(
    repositoryRoot,
    "process",
    "use",
    packageReference,
    "--json",
  );
  if (selection.status !== 0) {
    throw new Error(
      `Could not select test Process Package: ${selection.stderr}${selection.stdout}`,
    );
  }
}

export function selectBootstrapProcessPackage(repositoryRoot: string): void {
  selectProcessPackage(
    repositoryRoot,
    path.join(process.cwd(), ".lifecycle/process"),
    "mdlm-bootstrap@0.43.0",
  );
}
