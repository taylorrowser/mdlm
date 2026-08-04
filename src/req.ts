#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleSnapshot,
  type ProcessDiagnostic,
  type ProcessPackage,
} from "./index.js";
import {
  evaluateProcessDefinition,
  evaluateProcessExpression,
  type ProcessDirectEvaluation,
  type ProcessExpressionEvaluation,
} from "./evaluator.js";
import {
  processCapabilities,
  processInspection,
  type ProcessCapabilities,
  type ProcessInspection,
} from "./process-package-inspection.js";
import {
  looseEndsProjection,
  nextWorkProjection,
  phaseStatusProjection,
  type LooseEndsProjection,
  type NextWorkProjection,
  type PhaseStatusProjection,
} from "./lifecycle-inspection.js";
import {
  humanLooseEnds,
  humanNextWork,
  humanPhaseStatus,
} from "./lifecycle-output.js";

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
  evaluation?: ProcessDirectEvaluation | ProcessExpressionEvaluation;
  phaseStatus?: PhaseStatusProjection;
  looseEnds?: LooseEndsProjection;
  next?: NextWorkProjection;
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

async function readLifecycleSnapshot(
  repositoryRoot: string,
  snapshotPath: string,
): Promise<LifecycleSnapshot> {
  return parse(
    await fs.readFile(path.resolve(repositoryRoot, snapshotPath), "utf8"),
  ) as LifecycleSnapshot;
}

type SelectedLifecycleEvaluation =
  | {
      ok: true;
      summary: PackageSummary;
      evaluation: ReturnType<typeof evaluateLifecycle>;
    }
  | { ok: false; result: CommandResult };

async function selectedLifecycleEvaluation(
  repositoryRoot: string,
  command: string,
  snapshotPath: string | undefined,
  phaseId?: string,
): Promise<SelectedLifecycleEvaluation> {
  const resolved = await selectedPackage(repositoryRoot);
  if (!resolved.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        command,
        selected: resolved.selected,
        diagnostics: resolved.diagnostics,
      },
    };
  }
  if (!snapshotPath) {
    return {
      ok: false,
      result: failure(
        "snapshot-required",
        `${command} requires '--snapshot <fixture>'`,
      ),
    };
  }
  const snapshot = await readLifecycleSnapshot(repositoryRoot, snapshotPath);
  const evaluation = evaluateLifecycle(
    resolved.processPackage,
    phaseId === undefined ? snapshot : { ...snapshot, phaseId },
  );
  if (evaluation.diagnostics.length > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        command,
        package: resolved.summary,
        selected: true,
        diagnostics: evaluation.diagnostics,
      },
    };
  }
  return { ok: true, summary: resolved.summary, evaluation };
}

async function phaseStatus(
  repositoryRoot: string,
  phaseId: string,
  snapshotPath: string | undefined,
): Promise<CommandResult> {
  const resolved = await selectedLifecycleEvaluation(
    repositoryRoot,
    "phase.status",
    snapshotPath,
    phaseId,
  );
  if (!resolved.ok) return resolved.result;
  const projection = phaseStatusProjection(resolved.evaluation);
  if (!projection) throw new Error("Lifecycle evaluation did not return a Phase");
  return {
    ok: true,
    command: "phase.status",
    package: resolved.summary,
    selected: true,
    phaseStatus: projection,
    diagnostics: [],
  };
}

async function showLooseEnds(
  repositoryRoot: string,
  snapshotPath: string | undefined,
  phaseId?: string,
): Promise<CommandResult> {
  const resolved = await selectedLifecycleEvaluation(
    repositoryRoot,
    "loose-ends",
    snapshotPath,
    phaseId,
  );
  if (!resolved.ok) return resolved.result;
  const projection = looseEndsProjection(resolved.evaluation);
  if (!projection) throw new Error("Lifecycle evaluation did not return a Phase");
  return {
    ok: true,
    command: "loose-ends",
    package: resolved.summary,
    selected: true,
    looseEnds: projection,
    diagnostics: [],
  };
}

async function showNextWork(
  repositoryRoot: string,
  snapshotPath: string | undefined,
  phaseId?: string,
): Promise<CommandResult> {
  const resolved = await selectedLifecycleEvaluation(
    repositoryRoot,
    "next",
    snapshotPath,
    phaseId,
  );
  if (!resolved.ok) return resolved.result;
  const projection = nextWorkProjection(resolved.evaluation);
  if (!projection) throw new Error("Lifecycle evaluation did not return a Phase");
  return {
    ok: true,
    command: "next",
    package: resolved.summary,
    selected: true,
    next: projection,
    diagnostics: [],
  };
}

async function evaluateSelectedExpression(
  repositoryRoot: string,
  target: string,
  snapshotPath: string | undefined,
  bindingsSource: string | undefined,
): Promise<CommandResult> {
  const resolved = await selectedPackage(repositoryRoot);
  if (!resolved.ok) {
    return {
      ok: false,
      command: "process.expression.evaluate",
      selected: resolved.selected,
      diagnostics: resolved.diagnostics,
    };
  }
  if (!snapshotPath) {
    return failure(
      "snapshot-required",
      "Expression evaluation requires '--snapshot <fixture>'",
    );
  }
  let bindings: Record<string, unknown> = {};
  try {
    const parsedBindings = bindingsSource === undefined
      ? {}
      : JSON.parse(bindingsSource) as unknown;
    if (
      typeof parsedBindings !== "object" || parsedBindings === null ||
      Array.isArray(parsedBindings)
    ) {
      return failure("invalid-bindings", "Expression bindings must be a JSON object");
    }
    bindings = parsedBindings as Record<string, unknown>;
  } catch (error) {
    return failure(
      "invalid-bindings",
      `Expression bindings are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const snapshot = await readLifecycleSnapshot(repositoryRoot, snapshotPath);
  return {
    ok: true,
    command: "process.expression.evaluate",
    package: resolved.summary,
    selected: true,
    evaluation: evaluateProcessExpression(
      resolved.processPackage,
      snapshot,
      target,
      bindings,
    ),
    diagnostics: [],
  };
}

async function evaluateSelectedDefinition(
  repositoryRoot: string,
  kind: ProcessDirectEvaluation["target"]["kind"],
  reference: string,
  snapshotPath: string | undefined,
  argumentsValue: Record<string, unknown>,
): Promise<CommandResult> {
  const resolved = await selectedPackage(repositoryRoot);
  if (!resolved.ok) {
    return {
      ok: false,
      command: `${kind}.evaluate`,
      selected: resolved.selected,
      diagnostics: resolved.diagnostics,
    };
  }
  if (!snapshotPath) {
    return failure(
      "snapshot-required",
      `${kind} evaluation requires '--snapshot <fixture>'`,
    );
  }
  const snapshot = await readLifecycleSnapshot(repositoryRoot, snapshotPath);
  return {
    ok: true,
    command: `${kind}.evaluate`,
    package: resolved.summary,
    selected: true,
    evaluation: evaluateProcessDefinition(
      resolved.processPackage,
      snapshot,
      kind,
      reference,
      argumentsValue,
    ),
    diagnostics: [],
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
  if (result.phaseStatus && result.package) {
    return humanPhaseStatus(result.package.reference, result.phaseStatus);
  }
  if (result.looseEnds && result.package) {
    return humanLooseEnds(result.package.reference, result.looseEnds);
  }
  if (result.next && result.package) {
    return humanNextWork(result.package.reference, result.next);
  }
  if (result.evaluation && result.package) {
    const evaluation = result.evaluation;
    const evidence = evaluation.evidence.map((item) => {
      if (item.kind === "expression" && item.span) {
        const { start, end } = item.span;
        return `Source: ${item.source} [${start.line}:${start.column}-${end.line}:${end.column}] — ${item.definition}`;
      }
      const label = `${item.kind[0]?.toUpperCase() ?? ""}${item.kind.slice(1)}`;
      return `${label} ${item.definition} -> ${JSON.stringify(item.result)}`;
    });
    const target = "field" in evaluation.target
      ? `Expression: ${evaluation.target.definition}#${evaluation.target.field}`
      : `${evaluation.target.kind[0]?.toUpperCase() ?? ""}${evaluation.target.kind.slice(1)}: ${evaluation.target.definition}`;
    const contract = "contract" in evaluation
      ? [`Expected Type: ${evaluation.contract.expectedType}`]
      : [];
    return [
      `Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      target,
      ...contract,
      `Result: ${JSON.stringify(evaluation.result)}`,
      `Traversed Definitions: ${evaluation.traversedDefinitions.join(", ")}`,
      ...evidence,
    ].join("\n");
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

function optionValues(arguments_: string[], option: string): string[] {
  return arguments_.flatMap((argument, index) =>
    arguments_[index - 1] === option ? [argument] : []
  );
}

function directArguments(arguments_: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const argument of optionValues(arguments_, "--arg")) {
    const separator = argument.indexOf("=");
    if (separator < 1) throw new Error(`Invalid --arg '${argument}'; expected name=value`);
    const name = argument.slice(0, separator);
    const source = argument.slice(separator + 1);
    try {
      result[name] = JSON.parse(source) as unknown;
    } catch {
      result[name] = source;
    }
  }
  const from = optionValue(arguments_, "--from");
  const subject = optionValue(arguments_, "--subject");
  if (from !== undefined) result.from = from;
  if (subject !== undefined) result.subject = subject;
  return result;
}

async function run(arguments_: string[], repositoryRoot: string): Promise<CommandResult> {
  const operands = arguments_.filter((argument, index) =>
    argument !== "--json" &&
    argument !== "--ref" &&
    arguments_[index - 1] !== "--ref"
  );
  const directKind = ["relation", "selector", "policy", "state", "obligation"]
    .includes(operands[0] ?? "")
    ? operands[0] as ProcessDirectEvaluation["target"]["kind"]
    : undefined;
  if (directKind && operands[1] === "evaluate" && operands[2]) {
    return evaluateSelectedDefinition(
      repositoryRoot,
      directKind,
      operands[2],
      optionValue(arguments_, "--snapshot"),
      directArguments(arguments_),
    );
  }
  if (operands[0] === "phase" && operands[1] === "status" && operands[2]) {
    return phaseStatus(
      repositoryRoot,
      operands[2],
      optionValue(arguments_, "--snapshot"),
    );
  }
  if (operands[0] === "loose-ends") {
    return showLooseEnds(
      repositoryRoot,
      optionValue(arguments_, "--snapshot"),
      optionValue(arguments_, "--phase"),
    );
  }
  if (operands[0] === "next") {
    return showNextWork(
      repositoryRoot,
      optionValue(arguments_, "--snapshot"),
      optionValue(arguments_, "--phase"),
    );
  }
  if (operands[0] !== "process") {
    return failure("unknown-command", "Expected a process or definition evaluation command");
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
  if (
    operands[1] === "expression" && operands[2] === "evaluate" && operands[3]
  ) {
    return evaluateSelectedExpression(
      repositoryRoot,
      operands[3],
      optionValue(arguments_, "--snapshot"),
      optionValue(arguments_, "--bindings"),
    );
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
