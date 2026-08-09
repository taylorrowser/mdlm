import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadProcessPackage,
  type ProcessDiagnostic,
  type ProcessPackage,
} from "./index.js";
import {
  packageSummary,
  repositoryDescriptorMatches,
  selectionRelativePath,
  type PackageSummary,
  type ProcessSelection,
} from "./repository-contract.js";

export type SelectedPackageResolution =
  | {
      ok: true;
      processPackage: ProcessPackage;
      summary: PackageSummary;
    }
  | {
      ok: false;
      selected: boolean;
      diagnostics: ProcessDiagnostic[];
    };

export async function readSelection(
  repositoryRoot: string,
): Promise<ProcessSelection | undefined> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(repositoryRoot, selectionRelativePath), "utf8"),
    ) as ProcessSelection;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function selectedPackage(
  repositoryRoot: string,
): Promise<SelectedPackageResolution> {
  const selection = await readSelection(repositoryRoot);
  if (!selection) {
    return {
      ok: false,
      selected: false,
      diagnostics: [{
        code: "process-package-not-selected",
        message:
          "No Process Package is selected; run 'mdlm process use <package@version>'",
      }],
    };
  }
  const packageRoot = path.resolve(repositoryRoot, selection.package.path);
  const loaded = await loadProcessPackage(packageRoot);
  if (!loaded.ok) {
    return { ok: false, selected: true, diagnostics: loaded.diagnostics };
  }
  const summary = await packageSummary(loaded.package, packageRoot);
  if (
    summary.reference !== selection.package.reference ||
    summary.digest !== selection.package.digest ||
    summary.language !== selection.language.expressions
  ) {
    return {
      ok: false,
      selected: true,
      diagnostics: [{
        code: "process-package-selection-mismatch",
        path: packageRoot,
        message:
          `Selected Process Package '${selection.package.reference}' no longer matches its exact recorded version, language, and digest`,
      }],
    };
  }
  return { ok: true, processPackage: loaded.package, summary };
}

export async function selectedRepositoryPackage(
  repositoryRoot: string,
): Promise<SelectedPackageResolution> {
  const selected = await selectedPackage(repositoryRoot);
  if (!selected.ok) return selected;
  const descriptorPath = path.join(repositoryRoot, ".lifecycle/repository.json");
  let descriptor: Record<string, unknown>;
  try {
    const parsed = JSON.parse(await fs.readFile(descriptorPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("repository descriptor must be a JSON object");
    }
    descriptor = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      selected: true,
      diagnostics: [{
        code: (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "repository-not-initialized"
          : "repository-contract",
        path: descriptorPath,
        message: (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "No MDLM repository descriptor exists; run 'mdlm init <destination>'"
          : `Cannot read the MDLM repository descriptor: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
  if (
    !repositoryDescriptorMatches(
      descriptor,
      selected.processPackage,
      selected.summary,
    )
  ) {
    return {
      ok: false,
      selected: true,
      diagnostics: [{
        code: "repository-contract-mismatch",
        path: descriptorPath,
        message:
          "The repository descriptor does not match its exact selected Process Package and supported contracts",
      }],
    };
  }
  return selected;
}
