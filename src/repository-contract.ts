import { type ProcessPackage } from "./index.js";
import { processPackageDigest } from "./process-package-digest.js";

export const selectionRelativePath = ".lifecycle/process-selection.json";
export const packagesRelativePath = ".lifecycle/packages";

export interface PackageSummary {
  id: string;
  version: string;
  reference: string;
  language: string;
  digest: string;
}

export interface ProcessSelection {
  schemaVersion: 1;
  package: {
    id: string;
    version: string;
    reference: string;
    digest: string;
    path: string;
  };
  language: { expressions: string };
}

export interface RepositorySummary {
  contract: "mdlm-repository@1";
  datumEnvelope: string;
  artifactFormat: string;
  primitiveCatalog: string;
}

function languageVersion(processPackage: ProcessPackage): string {
  const language = processPackage.manifest.language;
  if (typeof language !== "object" || language === null) return "";
  const expressions = (language as Record<string, unknown>).expressions;
  return typeof expressions === "string" ? expressions : "";
}

export async function packageSummary(
  processPackage: ProcessPackage,
  root: string,
): Promise<PackageSummary> {
  const { id, version } = processPackage.manifest;
  return {
    id,
    version,
    reference: `${id}@${version}`,
    language: languageVersion(processPackage),
    digest: await processPackageDigest(root),
  };
}

export function processSelection(summary: PackageSummary): ProcessSelection {
  return {
    schemaVersion: 1,
    package: {
      id: summary.id,
      version: summary.version,
      reference: summary.reference,
      digest: summary.digest,
      path: `${packagesRelativePath}/${summary.reference}`,
    },
    language: { expressions: summary.language },
  };
}

export function repositorySummary(
  processPackage: ProcessPackage,
): RepositorySummary {
  const kernelContract = processPackage.manifest.kernel_contract as
    | Record<string, unknown>
    | undefined;
  const artifactFormat = processPackage.manifest.artifact_format as
    | Record<string, unknown>
    | undefined;
  return {
    contract: "mdlm-repository@1",
    datumEnvelope: String(kernelContract?.envelope_schema_id ?? ""),
    artifactFormat: `${String(artifactFormat?.media_type ?? "")}; metadata=${String(artifactFormat?.metadata ?? "")}; encoding=${String(artifactFormat?.encoding ?? "")}`,
    primitiveCatalog: String(kernelContract?.primitive_catalog_ref ?? ""),
  };
}

export function repositoryDescriptor(
  processPackage: ProcessPackage,
  summary: PackageSummary,
): Record<string, unknown> {
  const repository = repositorySummary(processPackage);
  return {
    schemaVersion: 1,
    repositoryContract: repository.contract,
    package: { reference: summary.reference, digest: summary.digest },
    contracts: {
      datumEnvelope: repository.datumEnvelope,
      artifactFormat: repository.artifactFormat,
      expressionLanguage: summary.language,
      primitiveCatalog: repository.primitiveCatalog,
    },
  };
}

export function repositoryDescriptorMatches(
  descriptor: Record<string, unknown>,
  processPackage: ProcessPackage,
  summary: PackageSummary,
): boolean {
  const packageContract = typeof descriptor.package === "object" &&
      descriptor.package !== null && !Array.isArray(descriptor.package)
    ? descriptor.package as Record<string, unknown>
    : {};
  const contracts = typeof descriptor.contracts === "object" &&
      descriptor.contracts !== null && !Array.isArray(descriptor.contracts)
    ? descriptor.contracts as Record<string, unknown>
    : {};
  const repository = repositorySummary(processPackage);
  return descriptor.schemaVersion === 1 &&
    descriptor.repositoryContract === repository.contract &&
    packageContract.reference === summary.reference &&
    packageContract.digest === summary.digest &&
    contracts.datumEnvelope === repository.datumEnvelope &&
    contracts.artifactFormat === repository.artifactFormat &&
    contracts.expressionLanguage === summary.language &&
    contracts.primitiveCatalog === repository.primitiveCatalog;
}
