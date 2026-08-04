#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadProcessPackage,
  type ProcessDiagnostic,
  type ProcessPackage,
  type VersionedDefinition,
} from "./index.js";
import { expressionLanguageCapabilities } from "./expression.js";

interface PackageSummary {
  id: string;
  version: string;
  reference: string;
  language: string;
  digest: string;
}

interface ProcessSelection {
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

interface ProcessCapabilities {
  contextRoots: {
    id: string;
    paths: { path: string; type: string }[];
  }[];
  paths: {
    entity: Record<string, unknown>[];
    context: { root: string; path: string; type: string }[];
  };
  operators: string[];
  hostFunctions: string[];
  collections: { id: string; requires: string | null }[];
  relations: (Record<string, unknown> & {
    id: string;
    requires: string | null;
  })[];
  kernelCapabilities: {
    reference: string;
    binding: { type: string };
    collections: string[];
    relations: string[];
  }[];
  definitionCatalogs: Record<string, string[]>;
}

interface ProcessInspection {
  status: string;
  description: string;
  kernelContract: {
    id: string;
    version: number;
    primitiveCatalogRef: string;
  };
  compatibility: Record<string, unknown>;
  kernelCapabilities: {
    reference: string;
    binding: { type: string };
  }[];
  definitionCatalogs: Record<string, string[]>;
}

interface CommandResult {
  ok: boolean;
  command?: string;
  package?: PackageSummary;
  installed?: boolean;
  selected?: boolean;
  inspection?: ProcessInspection;
  validation?: {
    compilation: "passed" | "failed" | "unconfirmed";
    references: "passed" | "failed" | "unconfirmed";
    capabilityBindings: "passed" | "failed" | "unconfirmed";
  };
  capabilities?: ProcessCapabilities;
  diagnostics: ProcessDiagnostic[];
}

const selectionRelativePath = ".lifecycle/process-selection.json";
const packagesRelativePath = ".lifecycle/packages";

function languageVersion(processPackage: ProcessPackage): string {
  const language = processPackage.manifest.language;
  if (typeof language !== "object" || language === null) return "";
  const expressions = (language as Record<string, unknown>).expressions;
  return typeof expressions === "string" ? expressions : "";
}

async function filePaths(root: string, directory = root): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filePaths(root, entryPath);
    return entry.isFile() ? [path.relative(root, entryPath)] : [];
  }));
  return nested.flat().sort();
}

async function packageDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of await filePaths(root)) {
    const contents = await fs.readFile(path.join(root, relativePath));
    hash.update(relativePath);
    hash.update("\0");
    hash.update(String(contents.byteLength));
    hash.update("\0");
    hash.update(contents);
  }
  return `sha256:${hash.digest("hex")}`;
}

async function packageSummary(
  processPackage: ProcessPackage,
  root: string,
): Promise<PackageSummary> {
  const { id, version } = processPackage.manifest;
  return {
    id,
    version,
    reference: `${id}@${version}`,
    language: languageVersion(processPackage),
    digest: await packageDigest(root),
  };
}

function failure(
  code: string,
  message: string,
  pathValue?: string,
): CommandResult {
  return {
    ok: false,
    diagnostics: [{
      code,
      message,
      ...(pathValue === undefined ? {} : { path: pathValue }),
    }],
  };
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporaryPath, filePath);
}

async function installPackage(
  repositoryRoot: string,
  sourceRoot: string,
): Promise<CommandResult> {
  const absoluteSource = path.resolve(repositoryRoot, sourceRoot);
  const loaded = await loadProcessPackage(absoluteSource);
  if (!loaded.ok) return { ok: false, command: "process.install", diagnostics: loaded.diagnostics };
  const summary = await packageSummary(loaded.package, absoluteSource);
  const packagesRoot = path.join(repositoryRoot, packagesRelativePath);
  const destination = path.join(packagesRoot, summary.reference);
  await fs.mkdir(packagesRoot, { recursive: true });

  let installed = true;
  try {
    const destinationDigest = await packageDigest(destination);
    if (destinationDigest !== summary.digest) {
      return failure(
        "process-package-version-conflict",
        `Installed Process Package '${summary.reference}' has different content for the same exact version`,
        destination,
      );
    }
    installed = false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const temporaryDirectory = path.join(
      packagesRoot,
      `.${summary.reference}.${randomUUID()}.tmp`,
    );
    await fs.cp(absoluteSource, temporaryDirectory, { recursive: true });
    await fs.rename(temporaryDirectory, destination);
  }

  return {
    ok: true,
    command: "process.install",
    package: summary,
    installed,
    selected: false,
    diagnostics: [],
  };
}

async function installedPackageRoot(
  repositoryRoot: string,
  reference: string,
): Promise<string | undefined> {
  if (!/^[a-z][a-z0-9-]*@[0-9]+\.[0-9]+\.[0-9]+$/.test(reference)) {
    return undefined;
  }
  const packageRoot = path.join(repositoryRoot, packagesRelativePath, reference);
  try {
    if ((await fs.stat(packageRoot)).isDirectory()) return packageRoot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return undefined;
}

async function usePackage(
  repositoryRoot: string,
  reference: string,
): Promise<CommandResult> {
  const packageRoot = await installedPackageRoot(repositoryRoot, reference);
  if (!packageRoot) {
    return failure(
      "process-package-not-installed",
      `Process Package '${reference}' is not installed`,
    );
  }
  const loaded = await loadProcessPackage(packageRoot);
  if (!loaded.ok) return { ok: false, command: "process.use", diagnostics: loaded.diagnostics };
  const summary = await packageSummary(loaded.package, packageRoot);
  if (summary.reference !== reference) {
    return failure(
      "process-package-reference-mismatch",
      `Installed reference '${reference}' contains '${summary.reference}'`,
      packageRoot,
    );
  }
  const selection: ProcessSelection = {
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
  await atomicJson(path.join(repositoryRoot, selectionRelativePath), selection);
  return {
    ok: true,
    command: "process.use",
    package: summary,
    installed: true,
    selected: true,
    diagnostics: [],
  };
}

async function readSelection(
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

type SelectedPackageResolution =
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

async function selectedPackage(
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
          "No Process Package is selected; run 'req process use <package@version>'",
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

function failedValidation(
  diagnostics: ProcessDiagnostic[],
  selected: boolean,
): CommandResult {
  const compilationCodes = new Set([
    "legacy-expression-authoring",
    "expression-dependency-cycle",
  ]);
  const referenceCodes = new Set([
    "manifest-catalog-disagreement",
    "unknown-reference",
    "version-mismatch",
  ]);
  const capabilityCodes = new Set([
    "capability-required",
    "incompatible-kernel-capability",
    "unknown-capability-type",
    "unknown-kernel-capability",
  ]);
  const hasCode = (codes: Set<string>, prefix?: string): boolean =>
    diagnostics.some((diagnostic) =>
      codes.has(diagnostic.code) ||
      (prefix !== undefined && diagnostic.code.startsWith(prefix))
    );
  return {
    ok: false,
    command: "process.validate",
    selected,
    validation: {
      compilation: hasCode(compilationCodes, "expression-")
        ? "failed"
        : "unconfirmed",
      references: hasCode(referenceCodes) ? "failed" : "unconfirmed",
      capabilityBindings: hasCode(capabilityCodes)
        ? "failed"
        : "unconfirmed",
    },
    diagnostics,
  };
}

async function validateExplicitPackage(
  repositoryRoot: string,
  reference: string,
): Promise<CommandResult> {
  const installedRoot = await installedPackageRoot(repositoryRoot, reference);
  const packageRoot = installedRoot ?? path.resolve(repositoryRoot, reference);
  const loaded = await loadProcessPackage(packageRoot);
  if (!loaded.ok) return failedValidation(loaded.diagnostics, false);
  return {
    ok: true,
    command: "process.validate",
    package: await packageSummary(loaded.package, packageRoot),
    selected: false,
    validation: {
      compilation: "passed",
      references: "passed",
      capabilityBindings: "passed",
    },
    diagnostics: [],
  };
}

async function validateSelectedPackage(
  repositoryRoot: string,
): Promise<CommandResult> {
  const resolved = await selectedPackage(repositoryRoot);
  if (!resolved.ok) {
    return resolved.selected
      ? failedValidation(resolved.diagnostics, true)
      : { ok: false, diagnostics: resolved.diagnostics };
  }
  return {
    ok: true,
    command: "process.validate",
    package: resolved.summary,
    selected: true,
    validation: {
      compilation: "passed",
      references: "passed",
      capabilityBindings: "passed",
    },
    diagnostics: [],
  };
}

const definitionCatalogGroups = [
  "templates",
  "types",
  "policies",
  "states",
  "selectors",
  "obligations",
  "scenarios",
  "phases",
  "profiles",
  "primitives",
] as const;

function versionedReferences(
  definitions: Record<string, VersionedDefinition>,
): string[] {
  return Object.values(definitions)
    .map((definition) => `${definition.id}@${definition.version}`)
    .sort();
}

function definitionCatalogs(
  processPackage: ProcessPackage,
): Record<string, string[]> {
  return Object.fromEntries(
    definitionCatalogGroups.map((group) => [
      group,
      versionedReferences(processPackage[group]),
    ]),
  );
}

function processCapabilities(processPackage: ProcessPackage): ProcessCapabilities {
  const expression = expressionLanguageCapabilities();
  const primitiveCatalogs = Object.values(processPackage.primitives);
  const entityPaths = primitiveCatalogs.flatMap((catalog) =>
    Array.isArray(catalog.entity_paths)
      ? catalog.entity_paths.filter(
          (value): value is Record<string, unknown> =>
            typeof value === "object" && value !== null,
        )
      : []
  );
  const collections = new Map<string, string | null>();
  const relations = new Map<
    string,
    Record<string, unknown> & { id: string; requires: string | null }
  >();
  for (const catalog of primitiveCatalogs) {
    for (const collection of Array.isArray(catalog.collections) ? catalog.collections : []) {
      if (typeof collection === "string") collections.set(collection, null);
    }
    for (const relationValue of Array.isArray(catalog.relations) ? catalog.relations : []) {
      if (typeof relationValue !== "object" || relationValue === null) continue;
      const relation = relationValue as Record<string, unknown>;
      if (typeof relation.id !== "string") continue;
      relations.set(relation.id, { ...relation, id: relation.id, requires: null });
    }
  }

  const kernelCapabilities = Object.entries(processPackage.kernelCapabilities)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reference, binding]) => {
      const capabilityCollections = new Set<string>();
      const capabilityRelations = new Set<string>();
      for (const catalog of primitiveCatalogs) {
        const surfaces = typeof catalog.capability_surfaces === "object" &&
            catalog.capability_surfaces !== null
          ? catalog.capability_surfaces as Record<string, unknown>
          : {};
        const surface = typeof surfaces[reference] === "object" &&
            surfaces[reference] !== null
          ? surfaces[reference] as Record<string, unknown>
          : {};
        for (const collection of Array.isArray(surface.collections) ? surface.collections : []) {
          if (typeof collection !== "string") continue;
          capabilityCollections.add(collection);
          collections.set(collection, reference);
        }
        for (const relationValue of Array.isArray(surface.relations) ? surface.relations : []) {
          if (typeof relationValue !== "object" || relationValue === null) continue;
          const relation = relationValue as Record<string, unknown>;
          if (typeof relation.id !== "string") continue;
          capabilityRelations.add(relation.id);
          relations.set(relation.id, {
            ...relation,
            id: relation.id,
            requires: reference,
          });
        }
      }
      return {
        reference,
        binding: { type: binding.type },
        collections: [...capabilityCollections].sort(),
        relations: [...capabilityRelations].sort(),
      };
    });

  return {
    contextRoots: expression.contextRoots,
    paths: {
      entity: entityPaths.sort((left, right) =>
        String(left.path).localeCompare(String(right.path))
      ),
      context: expression.contextRoots.flatMap((root) =>
        root.paths.map((item) => ({ root: root.id, ...item }))
      ),
    },
    operators: expression.operators,
    hostFunctions: expression.hostFunctions,
    collections: [...collections]
      .map(([id, requires]) => ({ id, requires }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    relations: [...relations.values()].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    kernelCapabilities,
    definitionCatalogs: definitionCatalogs(processPackage),
  };
}

async function selectedCapabilities(
  repositoryRoot: string,
): Promise<CommandResult> {
  const resolved = await selectedPackage(repositoryRoot);
  if (!resolved.ok) {
    return {
      ok: false,
      command: "process.capabilities",
      selected: resolved.selected,
      diagnostics: resolved.diagnostics,
    };
  }
  return {
    ok: true,
    command: "process.capabilities",
    package: resolved.summary,
    selected: true,
    capabilities: processCapabilities(resolved.processPackage),
    diagnostics: [],
  };
}

function processInspection(processPackage: ProcessPackage): ProcessInspection {
  const kernelContract = typeof processPackage.manifest.kernel_contract === "object" &&
      processPackage.manifest.kernel_contract !== null
    ? processPackage.manifest.kernel_contract as Record<string, unknown>
    : {};
  const compatibility = typeof processPackage.manifest.compatibility === "object" &&
      processPackage.manifest.compatibility !== null
    ? processPackage.manifest.compatibility as Record<string, unknown>
    : {};
  return {
    status: String(processPackage.manifest.status),
    description: String(processPackage.manifest.description),
    kernelContract: {
      id: String(kernelContract.id),
      version: Number(kernelContract.version),
      primitiveCatalogRef: String(kernelContract.primitive_catalog_ref),
    },
    compatibility,
    kernelCapabilities: Object.entries(processPackage.kernelCapabilities)
      .map(([reference, binding]) => ({
        reference,
        binding: { type: binding.type },
      }))
      .sort((left, right) => left.reference.localeCompare(right.reference)),
    definitionCatalogs: definitionCatalogs(processPackage),
  };
}

async function showSelectedPackage(
  repositoryRoot: string,
): Promise<CommandResult> {
  const resolved = await selectedPackage(repositoryRoot);
  if (!resolved.ok) {
    return {
      ok: false,
      ...(resolved.selected ? { command: "process.show", selected: true } : {}),
      diagnostics: resolved.diagnostics,
    };
  }
  return {
    ok: true,
    command: "process.show",
    package: resolved.summary,
    installed: true,
    selected: true,
    inspection: processInspection(resolved.processPackage),
    diagnostics: [],
  };
}

function humanOutput(result: CommandResult): string {
  if (!result.ok && result.validation) {
    return [
      `Compilation: ${result.validation.compilation}`,
      `References: ${result.validation.references}`,
      `Capability Bindings: ${result.validation.capabilityBindings}`,
      ...result.diagnostics.map(
        (diagnostic) =>
          `Diagnostic [${diagnostic.code}]: ${diagnostic.message}`,
      ),
    ].join("\n");
  }
  if (!result.ok) {
    return result.diagnostics
      .map((diagnostic) => `Error [${diagnostic.code}]: ${diagnostic.message}`)
      .join("\n");
  }
  if (result.validation && result.package) {
    return [
      `Validated Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      `Compilation: ${result.validation.compilation}`,
      `References: ${result.validation.references}`,
      `Capability Bindings: ${result.validation.capabilityBindings}`,
      "Diagnostics: none",
    ].join("\n");
  }
  if (result.inspection && result.package) {
    const inspection = result.inspection;
    const kernelCapabilities = inspection.kernelCapabilities.map((capability) =>
      `${capability.reference} -> ${capability.binding.type}`
    );
    return [
      `Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      `Digest: ${result.package.digest}`,
      `Status: ${inspection.status}`,
      `Description: ${inspection.description}`,
      `Kernel Contract: ${inspection.kernelContract.id}@${inspection.kernelContract.version}`,
      `Primitive Catalog: ${inspection.kernelContract.primitiveCatalogRef}`,
      `Kernel Capabilities: ${kernelCapabilities.join(", ") || "none"}`,
      ...Object.entries(inspection.definitionCatalogs).map(([group, references]) =>
        `${group[0]?.toUpperCase() ?? ""}${group.slice(1)}: ${references.join(", ") || "none"}`
      ),
    ].join("\n");
  }
  if (result.capabilities && result.package) {
    const capabilities = result.capabilities;
    const collections = capabilities.collections.map((collection) =>
      `${collection.id}${collection.requires ? ` [${collection.requires}]` : ""}`
    );
    const kernelCapabilities = capabilities.kernelCapabilities.map((capability) =>
      `${capability.reference} -> ${capability.binding.type}`
    );
    return [
      `Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      `Context Roots: ${capabilities.contextRoots.map((root) => root.id).join(", ")}`,
      `Entity Paths: ${capabilities.paths.entity.map((item) => item.path).join(", ")}`,
      `Context Paths: ${capabilities.paths.context.map((item) => `${item.root}.${item.path}`).join(", ")}`,
      `Operators: ${capabilities.operators.join(", ")}`,
      `Host Functions: ${capabilities.hostFunctions.join(", ")}`,
      `Collections: ${collections.join(", ")}`,
      `Relations: ${capabilities.relations.map((relation) => relation.id).join(", ")}`,
      `Kernel Capabilities: ${kernelCapabilities.join(", ") || "none"}`,
      ...Object.entries(capabilities.definitionCatalogs).map(([group, references]) =>
        `${group[0]?.toUpperCase() ?? ""}${group.slice(1)}: ${references.join(", ") || "none"}`
      ),
    ].join("\n");
  }
  const lines = result.package
    ? [
        `Process Package: ${result.package.reference}`,
        `Expression Language: ${result.package.language}`,
        `Digest: ${result.package.digest}`,
      ]
    : [];
  return lines.join("\n");
}

function optionValue(arguments_: string[], option: string): string | undefined {
  const index = arguments_.indexOf(option);
  return index < 0 ? undefined : arguments_[index + 1];
}

async function run(arguments_: string[], repositoryRoot: string): Promise<CommandResult> {
  const operands = arguments_.filter((argument, index) =>
    argument !== "--json" &&
    argument !== "--ref" &&
    arguments_[index - 1] !== "--ref"
  );
  if (operands[0] !== "process") {
    return failure("unknown-command", "Expected a 'req process' command");
  }
  if (operands[1] === "install" && operands[2]) {
    return installPackage(repositoryRoot, operands[2]);
  }
  if (operands[1] === "use" && operands[2]) {
    return usePackage(repositoryRoot, operands[2]);
  }
  if (operands[1] === "validate") {
    const reference = optionValue(arguments_, "--ref");
    return reference
      ? validateExplicitPackage(repositoryRoot, reference)
      : validateSelectedPackage(repositoryRoot);
  }
  if (operands[1] === "capabilities") return selectedCapabilities(repositoryRoot);
  if (operands[1] === "show") return showSelectedPackage(repositoryRoot);
  return failure(
    "unknown-command",
    `Unknown process command '${operands.slice(1).join(" ")}'`,
  );
}

const json = process.argv.includes("--json");
try {
  const result = await run(process.argv.slice(2), process.cwd());
  process.stdout.write(`${json ? JSON.stringify(result, null, 2) : humanOutput(result)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const result = failure(
    "req-error",
    error instanceof Error ? error.message : String(error),
  );
  process.stdout.write(`${json ? JSON.stringify(result, null, 2) : humanOutput(result)}\n`);
  process.exitCode = 1;
}
