import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadProcessPackage,
  type LoadProcessPackageOptions,
  type ProcessDiagnostic,
  type ProcessPackage,
} from "./index.js";
import { processPackageDigest } from "./process-package-digest.js";
import {
  packageSummary,
  repositoryDescriptorMatches,
  selectionRelativePath,
  type PackageSummary,
  type ProcessSelection,
} from "./repository-contract.js";

const loadedPackages = new Map<string, ProcessPackage>();
const loadedPackageLimit = 16;

function loadedPackageKey(
  packageRoot: string,
  digest: string,
  options: LoadProcessPackageOptions,
): string {
  return `${path.resolve(packageRoot)}\0${options.compatibility ?? "current"}\0${digest}`;
}

function cachedPackage(key: string): ProcessPackage | undefined {
  const cached = loadedPackages.get(key);
  if (!cached) return undefined;
  loadedPackages.delete(key);
  loadedPackages.set(key, cached);
  return structuredClone(cached);
}

function cachePackage(key: string, processPackage: ProcessPackage): void {
  loadedPackages.set(key, structuredClone(processPackage));
  if (loadedPackages.size > loadedPackageLimit) {
    const oldest = loadedPackages.keys().next().value;
    if (oldest !== undefined) loadedPackages.delete(oldest);
  }
}

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

function validSelection(value: unknown): value is ProcessSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const selection = value as Record<string, unknown>;
  const packageValue = typeof selection.package === "object" &&
      selection.package !== null && !Array.isArray(selection.package)
    ? selection.package as Record<string, unknown>
    : undefined;
  const language = typeof selection.language === "object" &&
      selection.language !== null && !Array.isArray(selection.language)
    ? selection.language as Record<string, unknown>
    : undefined;
  return selection.schemaVersion === 1 && packageValue !== undefined &&
    typeof packageValue.id === "string" && packageValue.id.length > 0 &&
    typeof packageValue.version === "string" && packageValue.version.length > 0 &&
    typeof packageValue.reference === "string" && packageValue.reference.length > 0 &&
    typeof packageValue.digest === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(packageValue.digest) &&
    typeof packageValue.path === "string" && packageValue.path.length > 0 &&
    language !== undefined && typeof language.expressions === "string" &&
    language.expressions.length > 0;
}

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
  options: LoadProcessPackageOptions = {},
): Promise<SelectedPackageResolution> {
  let selection: ProcessSelection | undefined;
  try {
    selection = await readSelection(repositoryRoot);
  } catch (error) {
    return {
      ok: false,
      selected: true,
      diagnostics: [{
        code: "process-package-selection-invalid",
        path: path.join(repositoryRoot, selectionRelativePath),
        message: `Cannot read the selected Process Package contract: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
  if (!selection) {
    return {
      ok: false,
      selected: false,
      diagnostics: [{
        code: "process-package-not-selected",
        message:
          "No Process Package is selected; initialize a repository with 'mdlm init <destination>'",
      }],
    };
  }
  if (!validSelection(selection)) {
    return {
      ok: false,
      selected: true,
      diagnostics: [{
        code: "process-package-selection-invalid",
        path: path.join(repositoryRoot, selectionRelativePath),
        message: "The selected Process Package contract does not satisfy its versioned repository schema",
      }],
    };
  }
  const packageRoot = path.resolve(repositoryRoot, selection.package.path);
  let digestBeforeLoad: string | undefined;
  try {
    digestBeforeLoad = await processPackageDigest(packageRoot);
  } catch {
    // Preserve loadProcessPackage's typed filesystem diagnostics on failure.
  }
  const cacheKey = digestBeforeLoad === undefined
    ? undefined
    : loadedPackageKey(packageRoot, digestBeforeLoad, options);
  let processPackage = cacheKey === undefined ? undefined : cachedPackage(cacheKey);
  if (!processPackage) {
    const loaded = await loadProcessPackage(packageRoot, options);
    if (!loaded.ok) {
      return { ok: false, selected: true, diagnostics: loaded.diagnostics };
    }
    processPackage = loaded.package;
    if (cacheKey !== undefined) {
      const digestAfterLoad = await processPackageDigest(packageRoot);
      if (digestAfterLoad !== digestBeforeLoad) {
        return {
          ok: false,
          selected: true,
          diagnostics: [{
            code: "process-package-changed-during-load",
            path: packageRoot,
            message: "The selected Process Package changed while it was being loaded",
          }],
        };
      }
      cachePackage(cacheKey, processPackage);
    }
  }
  const summary = await packageSummary(processPackage, packageRoot);
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
  return { ok: true, processPackage, summary };
}

export async function selectedRepositoryPackage(
  repositoryRoot: string,
  options: LoadProcessPackageOptions = {},
): Promise<SelectedPackageResolution> {
  const selected = await selectedPackage(repositoryRoot, options);
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
