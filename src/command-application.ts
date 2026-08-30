import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify, TextDecoder } from "node:util";
import { parse } from "yaml";
import {
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
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
  activeLifecycleEvaluation,
  initialPhaseId,
  looseEndsProjection,
  phaseStatusProjection,
  type LooseEndsProjection,
  type PhaseStatusProjection,
} from "./lifecycle-inspection.js";
import {
  humanLooseEnds,
  humanParticipation,
  humanPhaseStatus,
} from "./lifecycle-output.js";
import {
  diffExactBaselines,
  verifyExactBaseline,
  type BaselineDiff,
  type BaselineRepositoryVerification,
  type BaselineVerification,
} from "./exact-baseline-repository.js";
import {
  datumHistory,
  inspectBacklinks,
  listData,
  repositoryLifecycleSnapshot,
  showDatum,
  traceGraph,
  type BacklinkInspection,
  type DatumHistory,
  type DatumProjections,
  type GraphTrace,
  type ListedDatum,
  type RepositoryIndexSummary,
  type RepositoryReportSummary,
  type StoredDatum,
} from "./lifecycle-repository.js";
import { loadRepositoryInspection } from "./repository-inspection.js";
import {
  readScenarioExecution,
  type ScenarioExecution,
} from "./scenario-execution.js";
import {
  testProcessFixtures,
  type FixtureTestSummary,
} from "./process-package-fixtures.js";
import { initializeBundledRepository } from "./repository-initialization.js";
import { repositoryGitEnvironment } from "./git-environment.js";
import {
  operatorInstructions,
  type OperatorInstructions,
} from "./operator-instructions.js";
import {
  claimNextWork,
  inspectAssignmentState,
  inspectOperatorStatus,
  inspectSubmissionSettlement,
  repositoryFingerprint,
  submitAssignmentResponse,
  type AssignmentDisposition,
  type AssignmentOutcome,
  type AssignmentPacket,
  type AssignmentState,
  type AssignmentSubmission,
  type OperatorStatus,
  type SubmissionOutcome,
} from "./assignment.js";
import {
  readSelection,
  selectedPackage,
  selectedRepositoryPackage,
} from "./selected-package.js";
import {
  packageSummary,
  packagesRelativePath,
  processSelection,
  repositoryDescriptor,
  repositoryDescriptorMatches,
  repositorySummary,
  selectionRelativePath,
  type PackageSummary,
  type RepositorySummary,
} from "./repository-contract.js";

interface ExactPackageIdentity {
  reference: string;
  digest: string;
}

interface ProcessMigration {
  from: ExactPackageIdentity;
  to: ExactPackageIdentity;
}

interface TypeSchemaInspection {
  definition: string;
  name: string;
  description: string;
  templateChain: string[];
  effectiveEnvelope: Record<string, unknown>;
  flattenedPayloadSchema: Record<string, unknown>;
  sourceOwnedLinkContracts: Record<string, unknown>[];
  lifecycleBehavior: Record<string, unknown>;
  kernelCapabilityBindings: {
    reference: string;
    binding: { type: string };
  }[];
}

interface StartBriefing {
  contract: "mdlm-start@1";
  operatorGuide: {
    path: "MDLM.md";
    content: string;
    digest: string;
  };
  git: {
    clean: boolean;
    trackedPaths: string[];
    untrackedPaths: string[];
  };
  readyToContinue: boolean;
  nextCommand: "mdlm next --json";
  repository: AssignmentPacket["repository"];
  guidance: string;
}

interface CommandResultBase {
  ok: boolean;
  command?: string;
  contract?: AssignmentOutcome["contract"] | AssignmentPacket["contract"] | AssignmentSubmission["contract"] | AssignmentDisposition["contract"] | AssignmentState["contract"] | OperatorStatus["contract"] | StartBriefing["contract"] | SubmissionOutcome["contract"];
  outcome?: AssignmentOutcome["outcome"] | SubmissionOutcome["outcome"] | "invalid";
  assignment?: { id: string; packet?: AssignmentPacket };
  authorityRequirement?: Extract<AssignmentOutcome, {
    outcome: "attention-required";
  }>["authorityRequirement"];
  scenarioReference?: string;
  disposition?: AssignmentDisposition["disposition"] | Extract<AssignmentState, { selected: true }>["disposition"];
  retryAvailability?: Extract<AssignmentState, { selected: true }>["retryAvailability"];
  malformedResponses?: Extract<AssignmentState, { selected: true }>["malformedResponses"];
  response?: Extract<AssignmentState, { selected: true }>["response"];
  terminalDiagnostics?: Extract<AssignmentState, { selected: true }>["terminalDiagnostics"];
  orchestration?: AssignmentDisposition["orchestration"] |
    Extract<SubmissionOutcome, { outcome: "settlement-required" }>["orchestration"];
  unable?: Extract<AssignmentDisposition, { disposition: "abandoned" }>["unable"];
  malformedResponse?: Extract<AssignmentDisposition, {
    disposition: "correction-required" | "exhausted";
  }>["malformedResponse"];
  integrity?: OperatorStatus["integrity"] | { status: "invalid" };
  package?: PackageSummary | AssignmentPacket["package"];
  profile?: OperatorStatus["profile"];
  activePhase?: OperatorStatus["activePhase"];
  omittedCoverage?: OperatorStatus["omittedCoverage"];
  recentTransaction?: OperatorStatus["recentTransaction"];
  unresolvedWork?: OperatorStatus["unresolvedWork"];
  currentOutcome?: OperatorStatus["currentOutcome"] | {
    outcome: "invalid";
    diagnostics: ProcessDiagnostic[];
  };
  drillDownCommands?: OperatorStatus["drillDownCommands"];
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
  tests?: FixtureTestSummary;
  repository?: RepositorySummary | AssignmentPacket["repository"];
  operatorGuide?: StartBriefing["operatorGuide"];
  git?: StartBriefing["git"];
  readyToContinue?: StartBriefing["readyToContinue"];
  nextCommand?: StartBriefing["nextCommand"];
  guidance?: StartBriefing["guidance"];
  operatorInstructions?: OperatorInstructions;
  help?: string;
  migration?: ProcessMigration;
  schema?: TypeSchemaInspection;
  lifecycleDatum?: StoredDatum["lifecycleDatum"];
  projections?: DatumProjections;
  data?: ListedDatum[];
  history?: DatumHistory;
  baselineVerification?: BaselineVerification;
  baselineDiff?: BaselineDiff;
  baselineRepositoryVerification?: BaselineRepositoryVerification;
  execution?: ScenarioExecution;
  responseDigest?: string;
  settlement?: Extract<SubmissionOutcome, { outcome: "accepted" | "settlement-required" }>["settlement"];
  receipt?: Extract<SubmissionOutcome, { outcome: "accepted" }>["receipt"];
  retryable?: boolean;
  correctionConsumed?: false;
  reason?: Extract<SubmissionOutcome, { outcome: "settlement-required" }>["reason"];
  backlinks?: BacklinkInspection;
  trace?: GraphTrace;
  index?: RepositoryIndexSummary;
  report?: RepositoryReportSummary;
  diagnostics: ProcessDiagnostic[];
}

type CommandResult = CommandResultBase;

const executeFile = promisify(execFile);
const operatorGuidePath = "MDLM.md";

const help = `Usage: mdlm <command> [--json]

Agent-guided lifecycle commands:
  mdlm init <destination>
  mdlm start [--json]
  mdlm next [--json]
  mdlm scenario submit [response-file|-] [--authority <authority-id>] [--json]
  mdlm scenario settlement <assignment-or-execution-id> [--json]
  mdlm doctor [--json]`;

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

async function atomicJsonPair(
  entries: [{ path: string; value: unknown }, { path: string; value: unknown }],
): Promise<void> {
  const prepared: {
    path: string;
    value: unknown;
    temporaryPath: string;
    backupPath: string;
  }[] = [];
  try {
    for (const entry of entries) {
      const temporaryPath = `${entry.path}.${randomUUID()}.tmp`;
      const backupPath = `${entry.path}.${randomUUID()}.backup`;
      const original = await fs.readFile(entry.path);
      prepared.push({ ...entry, temporaryPath, backupPath });
      await Promise.all([
        fs.writeFile(
          temporaryPath,
          `${JSON.stringify(entry.value, null, 2)}\n`,
        ),
        fs.writeFile(backupPath, original),
      ]);
    }
  } catch (error) {
    await Promise.allSettled(prepared.flatMap((entry) => [
      fs.rm(entry.temporaryPath, { force: true }),
      fs.rm(entry.backupPath, { force: true }),
    ]));
    throw error;
  }

  const replaced: typeof prepared = [];
  try {
    for (const entry of prepared) {
      await fs.rename(entry.temporaryPath, entry.path);
      replaced.push(entry);
    }
  } catch (error) {
    for (const entry of replaced.reverse()) {
      await fs.rename(entry.backupPath, entry.path);
    }
    throw error;
  } finally {
    await Promise.allSettled(prepared.flatMap((entry) => [
      fs.rm(entry.temporaryPath, { force: true }),
      fs.rm(entry.backupPath, { force: true }),
    ]));
  }
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

async function runProcessFixtures(
  repositoryRoot: string,
  reference?: string,
): Promise<CommandResult> {
  let packageRoot: string;
  if (reference) {
    packageRoot = (await installedPackageRoot(repositoryRoot, reference)) ??
      path.resolve(repositoryRoot, reference);
  } else {
    try {
      await fs.access(path.join(repositoryRoot, "manifest.yaml"));
      packageRoot = repositoryRoot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const selection = await readSelection(repositoryRoot);
      if (!selection) {
        return failure(
          "process-package-not-selected",
          "No Process Package is selected; run from a Process Package root or use '--ref <package-ref>'",
        );
      }
      packageRoot = path.resolve(repositoryRoot, selection.package.path);
    }
  }
  const tested = await testProcessFixtures(packageRoot);
  if (!tested.ok) {
    return {
      ok: false,
      command: "process.test",
      diagnostics: tested.diagnostics,
    };
  }
  const diagnostics = tested.value.fixtures.flatMap((fixture) =>
    fixture.diagnostics
  );
  return {
    ok: tested.value.failed === 0,
    command: "process.test",
    tests: tested.value,
    diagnostics,
  };
}

async function verifyBaseline(
  repositoryRoot: string,
  baselineIdentity: string,
): Promise<CommandResult> {
  const command = "baseline.verify";
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command,
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const verified = await verifyExactBaseline(
    repositoryRoot,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
    baselineIdentity,
  );
  if (!verified.ok) {
    return {
      ok: false,
      command,
      package: selected.summary,
      selected: true,
      diagnostics: verified.diagnostics,
    };
  }
  return {
    ok: true,
    command,
    package: selected.summary,
    baselineVerification: verified.value,
    diagnostics: [],
  };
}

async function diffBaselines(
  repositoryRoot: string,
  beforeIdentity: string,
  afterIdentity: string,
): Promise<CommandResult> {
  const command = "baseline.diff";
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command,
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const diff = await diffExactBaselines(
    repositoryRoot,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
    beforeIdentity,
    afterIdentity,
  );
  if (!diff.ok) {
    return {
      ok: false,
      command,
      package: selected.summary,
      selected: true,
      diagnostics: diff.diagnostics,
    };
  }
  return {
    ok: true,
    command,
    package: selected.summary,
    baselineDiff: diff.value,
    diagnostics: [],
  };
}

async function showStoredBacklinks(
  repositoryRoot: string,
  identity: string,
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "backlinks",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const backlinks = await inspectBacklinks(
    repositoryRoot,
    selected.processPackage,
    identity,
  );
  if (!backlinks.ok) {
    return {
      ok: false,
      command: "backlinks",
      package: selected.summary,
      selected: true,
      diagnostics: backlinks.diagnostics,
    };
  }
  return {
    ok: true,
    command: "backlinks",
    package: selected.summary,
    backlinks: backlinks.value,
    diagnostics: [],
  };
}

async function showGraphTrace(
  repositoryRoot: string,
  identity: string,
  arguments_: string[],
): Promise<CommandResult> {
  const depthSource = optionValue(arguments_, "--depth") ?? "1";
  const depth = Number(depthSource);
  if (!Number.isSafeInteger(depth) || depth < 0) {
    return {
      ...failure("invalid-trace-depth", `Trace depth '${depthSource}' must be a non-negative integer`),
      command: "trace",
    };
  }
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "trace",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const traced = await traceGraph(
    repositoryRoot,
    selected.processPackage,
    identity,
    optionValue(arguments_, "--relation"),
    depth,
  );
  if (!traced.ok) {
    return {
      ok: false,
      command: "trace",
      package: selected.summary,
      selected: true,
      diagnostics: traced.diagnostics,
    };
  }
  return {
    ok: true,
    command: "trace",
    package: selected.summary,
    trace: traced.value,
    diagnostics: [],
  };
}

async function showStoredDatum(
  repositoryRoot: string,
  identity: string,
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "show",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const shown = await showDatum(
    repositoryRoot,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
    identity,
  );
  if (!shown.ok) {
    return {
      ok: false,
      command: "show",
      package: selected.summary,
      selected: true,
      diagnostics: shown.diagnostics,
    };
  }
  return {
    ok: true,
    command: "show",
    package: selected.summary,
    lifecycleDatum: shown.value.lifecycleDatum,
    projections: shown.value.projections,
    diagnostics: [],
  };
}

async function showDatumHistory(
  repositoryRoot: string,
  stableId: string,
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "history",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const history = await datumHistory(
    repositoryRoot,
    selected.processPackage,
    stableId,
  );
  if (!history.ok) {
    return {
      ok: false,
      command: "history",
      package: selected.summary,
      selected: true,
      diagnostics: history.diagnostics,
    };
  }
  return {
    ok: true,
    command: "history",
    package: selected.summary,
    history: history.value,
    diagnostics: [],
  };
}

async function listStoredData(repositoryRoot: string): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "list",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const listed = await listData(
    repositoryRoot,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
  );
  if (!listed.ok) {
    return {
      ok: false,
      command: "list",
      package: selected.summary,
      selected: true,
      diagnostics: listed.diagnostics,
    };
  }
  return {
    ok: true,
    command: "list",
    package: selected.summary,
    data: listed.value,
    diagnostics: [],
  };
}

async function doctorRepository(repositoryRoot: string): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "doctor",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const processReference =
    `${selected.summary.reference}#${selected.summary.digest}`;
  const inspection = await loadRepositoryInspection(
    repositoryRoot,
    selected.processPackage,
    processReference,
  );
  if (!inspection.ok) {
    return {
      ok: false,
      command: "doctor",
      package: selected.summary,
      selected: true,
      diagnostics: inspection.diagnostics,
    };
  }
  const verified = await inspection.value.verifyBaselines();
  if (!verified.ok) {
    return {
      ok: false,
      command: "doctor",
      package: selected.summary,
      selected: true,
      diagnostics: verified.diagnostics,
    };
  }
  const projections = await inspection.value.rebuildGeneratedProjections();
  if (!projections.ok) {
    return {
      ok: false,
      command: "doctor",
      package: selected.summary,
      selected: true,
      diagnostics: projections.diagnostics,
    };
  }
  return {
    ok: true,
    command: "doctor",
    package: selected.summary,
    baselineRepositoryVerification: verified.value,
    index: projections.value.index,
    report: projections.value.report,
    diagnostics: [],
  };
}

async function migrateRepositoryPackage(
  repositoryRoot: string,
  reference: string,
): Promise<CommandResult> {
  const command = "process.migrate";
  const targetRoot = await installedPackageRoot(repositoryRoot, reference);
  if (!targetRoot) {
    return {
      ...failure(
        "process-package-not-installed",
        `Process Package '${reference}' is not installed`,
      ),
      command,
    };
  }
  const targetLoaded = await loadProcessPackage(targetRoot);
  if (!targetLoaded.ok) {
    return { ok: false, command, diagnostics: targetLoaded.diagnostics };
  }
  const target = await packageSummary(targetLoaded.package, targetRoot);
  if (target.reference !== reference) {
    return {
      ...failure(
        "process-package-reference-mismatch",
        `Installed reference '${reference}' contains '${target.reference}'`,
        targetRoot,
      ),
      command,
    };
  }

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
      ...failure(
        "repository-contract",
        `Cannot read the MDLM repository descriptor: ${error instanceof Error ? error.message : String(error)}`,
        descriptorPath,
      ),
      command,
    };
  }
  const packageContract = typeof descriptor.package === "object" &&
      descriptor.package !== null && !Array.isArray(descriptor.package)
    ? descriptor.package as Record<string, unknown>
    : {};
  const previousReference = typeof packageContract.reference === "string"
    ? packageContract.reference
    : "";
  const previousDigest = typeof packageContract.digest === "string"
    ? packageContract.digest
    : "";
  const previousRoot = await installedPackageRoot(
    repositoryRoot,
    previousReference,
  );
  if (!previousRoot) {
    return {
      ...failure(
        "repository-process-package-not-installed",
        `Repository Process Package '${previousReference}' is not installed`,
      ),
      command,
    };
  }
  const previousLoaded = await loadProcessPackage(previousRoot, {
    compatibility: "historical-authoring",
  });
  if (!previousLoaded.ok) {
    return { ok: false, command, diagnostics: previousLoaded.diagnostics };
  }
  const previous = await packageSummary(previousLoaded.package, previousRoot);
  if (
    previous.reference !== previousReference || previous.digest !== previousDigest ||
    !repositoryDescriptorMatches(descriptor, previousLoaded.package, previous)
  ) {
    return {
      ...failure(
        "repository-contract-mismatch",
        "The repository descriptor does not match its exact installed Process Package and supported contracts",
        descriptorPath,
      ),
      command,
    };
  }

  const selected = await selectedPackage(repositoryRoot, {
    compatibility: "historical-authoring",
  });
  if (!selected.ok) {
    return { ok: false, command, diagnostics: selected.diagnostics };
  }
  if (
    selected.summary.reference !== previous.reference &&
    selected.summary.reference !== target.reference
  ) {
    return {
      ...failure(
        "process-migration-selection-ambiguity",
        `Selected Process Package '${selected.summary.reference}' is neither the repository contract '${previous.reference}' nor migration target '${target.reference}'`,
      ),
      command,
    };
  }

  const previousRepository = repositorySummary(previousLoaded.package);
  const targetRepository = repositorySummary(targetLoaded.package);
  if (
    JSON.stringify(previousRepository) !== JSON.stringify(targetRepository) ||
    previous.language !== target.language
  ) {
    return {
      ...failure(
        "repository-contract-incompatible",
        `Process Package '${target.reference}' changes the repository's kernel-owned contracts`,
      ),
      command,
    };
  }

  const targetCompatibility = targetLoaded.package.manifest.compatibility;
  const migrationPolicy =
    typeof targetCompatibility === "object" && targetCompatibility !== null
      ? (targetCompatibility as Record<string, unknown>).repository_migration
      : undefined;
  if (
    migrationPolicy === "fresh-only" &&
    previous.reference !== target.reference
  ) {
    return {
      ...failure(
        "fresh-repository-required",
        `Process Package '${target.reference}' requires initialization in a fresh repository and cannot migrate '${previous.reference}'`,
      ),
      command,
    };
  }

  const targetProcessReference = `${target.reference}#${target.digest}`;
  const inspection = await loadRepositoryInspection(
    repositoryRoot,
    targetLoaded.package,
    targetProcessReference,
  );
  if (!inspection.ok) {
    return { ok: false, command, diagnostics: inspection.diagnostics };
  }
  const baselines = await inspection.value.verifyBaselines();
  if (!baselines.ok) {
    return { ok: false, command, diagnostics: baselines.diagnostics };
  }

  try {
    await atomicJsonPair([
      {
        path: path.join(repositoryRoot, selectionRelativePath),
        value: processSelection(target),
      },
      {
        path: descriptorPath,
        value: repositoryDescriptor(targetLoaded.package, target),
      },
    ]);
  } catch (error) {
    return {
      ...failure(
        "process-migration-write-failed",
        `Could not atomically publish the repository migration: ${error instanceof Error ? error.message : String(error)}`,
      ),
      command,
    };
  }
  return {
    ok: true,
    command,
    package: target,
    installed: true,
    selected: true,
    migration: {
      from: { reference: previous.reference, digest: previous.digest },
      to: { reference: target.reference, digest: target.digest },
    },
    diagnostics: [],
  };
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
  deriveActive = false,
): Promise<SelectedLifecycleEvaluation> {
  const resolved = snapshotPath
    ? await selectedPackage(repositoryRoot)
    : await selectedRepositoryPackage(repositoryRoot);
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
  let snapshot: LifecycleSnapshot;
  if (snapshotPath) {
    snapshot = await readLifecycleSnapshot(repositoryRoot, snapshotPath);
  } else {
    const repositoryPhaseId = phaseId ?? initialPhaseId(resolved.processPackage);
    if (!repositoryPhaseId) {
      return {
        ok: false,
        result: failure("phase-required", "The selected Process Package declares no Phase"),
      };
    }
    const repositorySnapshot = await repositoryLifecycleSnapshot(
      repositoryRoot,
      resolved.processPackage,
      `${resolved.summary.reference}#${resolved.summary.digest}`,
      repositoryPhaseId,
    );
    if (!repositorySnapshot.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          command,
          package: resolved.summary,
          selected: true,
          diagnostics: repositorySnapshot.diagnostics,
        },
      };
    }
    snapshot = repositorySnapshot.value;
  }
  const evaluation = phaseId !== undefined
    ? evaluateLifecycle(resolved.processPackage, { ...snapshot, phaseId })
    : deriveActive || !snapshotPath
    ? activeLifecycleEvaluation(resolved.processPackage, snapshot)
    : evaluateLifecycle(resolved.processPackage, snapshot);
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
  return {
    ok: true,
    summary: resolved.summary,
    evaluation,
  };
}

async function phaseStatus(
  repositoryRoot: string,
  phaseId: string | undefined,
  snapshotPath: string | undefined,
): Promise<CommandResult> {
  const resolved = await selectedLifecycleEvaluation(
    repositoryRoot,
    "phase.status",
    snapshotPath,
    phaseId,
    phaseId === undefined,
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

function nulPaths(output: string): string[] {
  return [...new Set(output.split("\0").filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

async function startBriefing(repositoryRoot: string): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "start",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const guidePath = path.join(repositoryRoot, operatorGuidePath);
  let content: string;
  let guideBytes: Buffer;
  try {
    guideBytes = await fs.readFile(guidePath);
    content = new TextDecoder("utf-8", { fatal: true }).decode(guideBytes);
  } catch (error) {
    return {
      ...failure(
        "operator-guide-read-failed",
        `Could not read '${operatorGuidePath}': ${error instanceof Error ? error.message : String(error)}`,
        guidePath,
      ),
      command: "start",
    };
  }

  let trackedPaths: string[];
  let untrackedPaths: string[];
  try {
    const environment = {
      ...repositoryGitEnvironment(),
      GIT_OPTIONAL_LOCKS: "0",
    };
    const [tracked, untracked, fingerprint] = await Promise.all([
      executeFile("git", ["diff", "--name-only", "-z", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
      }),
      executeFile("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
      }),
      repositoryFingerprint(repositoryRoot),
    ]);
    if (!fingerprint.ok) {
      return {
        ok: false,
        command: "start",
        diagnostics: fingerprint.diagnostics,
      };
    }
    trackedPaths = nulPaths(tracked.stdout);
    untrackedPaths = nulPaths(untracked.stdout);
    const clean = trackedPaths.length === 0 && untrackedPaths.length === 0;
    return {
      ok: true,
      command: "start",
      contract: "mdlm-start@1",
      package: selected.summary,
      repository: fingerprint.value,
      operatorGuide: {
        path: operatorGuidePath,
        content,
        digest: `sha256:${createHash("sha256").update(guideBytes).digest("hex")}`,
      },
      git: { clean, trackedPaths, untrackedPaths },
      readyToContinue: clean,
      nextCommand: "mdlm next --json",
      guidance: clean
        ? "Run mdlm next --json to obtain current work."
        : "Preserve and resolve this exact Git state before invoking next.",
      diagnostics: [],
    };
  } catch (error) {
    return {
      ...failure(
        "git-cleanliness-inspection-failed",
        `Could not inspect ordinary Git cleanliness: ${error instanceof Error ? error.message : String(error)}`,
        repositoryRoot,
      ),
      command: "start",
    };
  }
}

async function showNextAssignment(
  repositoryRoot: string,
): Promise<CommandResult> {
  const leased = await claimNextWork(repositoryRoot);
  return leased.ok
    ? {
        ok: true,
        command: "next",
        ...leased.value,
        diagnostics: [],
      }
    : {
        ok: false,
        command: "next",
        contract: "mdlm-next@2",
        outcome: "invalid",
        integrity: { status: "invalid" },
        diagnostics: leased.diagnostics,
      };
}

async function showOperatorStatus(
  repositoryRoot: string,
): Promise<CommandResult> {
  const inspected = await inspectOperatorStatus(repositoryRoot);
  return inspected.ok
    ? {
        ok: true,
        command: "status",
        ...inspected.value,
        diagnostics: [],
      }
    : {
        ok: false,
        command: "status",
        contract: "mdlm-status@1",
        integrity: { status: "invalid" },
        currentOutcome: {
          outcome: "invalid",
          diagnostics: inspected.diagnostics,
        },
        recentTransaction: { available: false },
        diagnostics: inspected.diagnostics,
      };
}

async function showAssignmentState(
  repositoryRoot: string,
  assignmentId: string,
): Promise<CommandResult> {
  const inspected = await inspectAssignmentState(repositoryRoot, assignmentId);
  return inspected.ok
    ? {
        ok: true,
        command: "assignment.show",
        ...inspected.value,
        diagnostics: [],
      }
    : {
        ok: false,
        command: "assignment.show",
        contract: "mdlm-assignment-state@1",
        diagnostics: inspected.diagnostics,
      };
}

async function submitExactAssignment(
  repositoryRoot: string,
  responsePath: string | undefined,
  standardInput: string | undefined,
  authoritySupplies: string[],
): Promise<CommandResult> {
  let source: string;
  if (responsePath && responsePath !== "-") {
    try {
      source = await fs.readFile(path.resolve(repositoryRoot, responsePath), "utf8");
    } catch (error) {
      return {
        ...failure(
          "assignment-response-read-failed",
          `Could not read Assignment Response '${responsePath}': ${error instanceof Error ? error.message : String(error)}`,
          responsePath,
        ),
        command: "scenario.submit",
      };
    }
  } else if (standardInput !== undefined && standardInput.length > 0) {
    source = standardInput;
  } else {
    return {
      ...failure(
        "assignment-response-required",
        "Expected an Assignment Response file or one JSON value on standard input",
      ),
      command: "scenario.submit",
    };
  }
  const submitted = await submitAssignmentResponse(
    repositoryRoot,
    source,
    authoritySupplies,
  );
  if (!submitted.ok) {
    return {
      ok: false,
      command: "scenario.submit",
      ...(submitted.value ?? submitted.disposition ?? {}),
      diagnostics: submitted.diagnostics,
    };
  }
  return {
    ok: true,
    command: "scenario.submit",
    ...submitted.value,
    diagnostics: [],
  };
}

async function showScenarioExecution(
  repositoryRoot: string,
  executionId: string,
): Promise<CommandResult> {
  const selected = await selectedPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "scenario.execution.show",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const execution = await readScenarioExecution(repositoryRoot, executionId);
  return execution.ok
    ? {
        ok: true,
        command: "scenario.execution.show",
        package: selected.summary,
        selected: true,
        execution: execution.value,
        diagnostics: [],
      }
    : {
        ok: false,
        command: "scenario.execution.show",
        package: selected.summary,
        selected: true,
        diagnostics: execution.diagnostics,
      };
}

async function showSubmissionSettlement(
  repositoryRoot: string,
  identity: string,
): Promise<CommandResult> {
  const inspected = await inspectSubmissionSettlement(repositoryRoot, identity);
  return inspected.ok
    ? {
        ok: true,
        command: "scenario.settlement",
        ...inspected.value,
        diagnostics: [],
      }
    : {
        ok: false,
        command: "scenario.settlement",
        diagnostics: inspected.diagnostics,
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

async function inspectSelectedTypeSchema(
  repositoryRoot: string,
  typeId: string,
): Promise<CommandResult> {
  const selected = await selectedPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "schema",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const resolved = resolveType(selected.processPackage, typeId);
  if (!resolved.ok) {
    return {
      ok: false,
      command: "schema",
      package: selected.summary,
      selected: true,
      diagnostics: resolved.diagnostics,
    };
  }
  return {
    ok: true,
    command: "schema",
    package: selected.summary,
    selected: true,
    schema: {
      definition: `${resolved.type.id}@${resolved.type.version}`,
      name: resolved.type.name,
      description: resolved.type.description,
      templateChain: resolved.type.templateChain,
      effectiveEnvelope: resolved.type.envelopeSchema,
      flattenedPayloadSchema: resolved.type.payloadSchema,
      sourceOwnedLinkContracts: resolved.type.outgoingLinks,
      lifecycleBehavior: resolved.type.lifecycle,
      kernelCapabilityBindings: Object.entries(
        selected.processPackage.kernelCapabilities,
      )
        .filter(([, binding]) => binding.type === typeId)
        .map(([reference, binding]) => ({ reference, binding }))
        .sort((left, right) => left.reference.localeCompare(right.reference)),
    },
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

/** Render one already-inspected operator status without rereading repository state. */
export function renderOperatorStatus(status: OperatorStatus): string {
  const transaction = status.recentTransaction.available
    ? `${status.recentTransaction.id} [${status.recentTransaction.status}] ${status.recentTransaction.scenario}`
    : "none";
  const assignment = "assignment" in status.currentOutcome
    ? status.currentOutcome.assignment.allocation === "active"
      ? `active ${status.currentOutcome.assignment.id}`
      : "not allocated"
    : "none";
  const terminal = "evidence" in status.currentOutcome
    ? [
        `Terminal Explanation: ${status.currentOutcome.explanation}`,
        `Terminal Evidence: ${status.currentOutcome.evidence.profile} — ${status.currentOutcome.evidence.condition.source} => ${status.currentOutcome.evidence.condition.result}`,
        `Terminal Selector Evidence: ${JSON.stringify(status.currentOutcome.evidence.condition.selectors)}`,
      ]
    : [];
  return [
    `Process Package: ${status.package.reference}`,
    `Implementation Profile: ${status.profile.reference} [${status.profile.status}]`,
    "Integrity: valid",
    `Active Phase: ${status.activePhase.reference} — ${status.activePhase.name}`,
    `Purpose: ${status.activePhase.purpose}`,
    `Coverage: ${status.activePhase.coverage}`,
    `Profile Omitted Coverage: ${status.omittedCoverage.profile.join(", ") || "none"}`,
    `Phase Omitted Coverage: ${status.omittedCoverage.phase.join(", ") || "none"}`,
    `Recent Transaction: ${transaction}`,
    `Unresolved Work: total=${status.unresolvedWork.total}, dispatchable=${status.unresolvedWork.dispatchable}, by-status=${JSON.stringify(status.unresolvedWork.byStatus)}`,
    `Current Operator Outcome: ${status.currentOutcome.outcome}`,
    `Assignment: ${assignment}`,
    ...terminal,
    "Drill Down:",
    ...status.drillDownCommands.map((command) => `  ${command}`),
  ].join("\n");
}

function renderCommandResult(result: CommandResult): string {
  if (result.help) return result.help;
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
  if (
    result.contract === "mdlm-start@1" && result.package && result.repository &&
    "head" in result.repository &&
    result.operatorGuide && result.git && result.readyToContinue !== undefined &&
    result.nextCommand && result.guidance
  ) {
    const state = [
      `Git: ${result.git.clean ? "clean" : "dirty"}`,
      `Tracked paths: ${result.git.trackedPaths.join(", ") || "none"}`,
      `Untracked paths: ${result.git.untrackedPaths.join(", ") || "none"}`,
      `Ready to continue: ${result.git.clean ? "yes" : "no"}`,
      ...(!result.git.clean ? [result.guidance] : []),
    ];
    return [
      `Process Package: ${result.package.reference}#${result.package.digest}`,
      `Repository HEAD: ${result.repository.head}`,
      `Repository Tracked State: ${result.repository.trackedState}`,
      ...state,
      `Operator Guide: ${result.operatorGuide.path}#${result.operatorGuide.digest}`,
      "",
      result.operatorGuide.content.trimEnd(),
      "",
      `Next command: ${result.nextCommand}`,
    ].join("\n");
  }
  if (result.schema && result.package) {
    const schema = result.schema;
    const capabilityBindings = schema.kernelCapabilityBindings.map(
      ({ reference, binding }) => `${reference} -> ${binding.type}`,
    );
    return [
      `Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      `Digest: ${result.package.digest}`,
      `Lifecycle Type: ${schema.definition}`,
      `Name: ${schema.name}`,
      `Description: ${schema.description}`,
      `Template Chain: ${schema.templateChain.join(" → ") || "none"}`,
      `Effective Envelope: ${JSON.stringify(schema.effectiveEnvelope)}`,
      `Flattened Payload Schema: ${JSON.stringify(schema.flattenedPayloadSchema)}`,
      `Source-owned Link Contracts: ${JSON.stringify(schema.sourceOwnedLinkContracts)}`,
      `Lifecycle Behavior: ${JSON.stringify(schema.lifecycleBehavior)}`,
      `Kernel Capability Bindings: ${capabilityBindings.join(", ") || "none"}`,
    ].join("\n");
  }
  if (result.migration) {
    return [
      `Previous Process Package: ${result.migration.from.reference}#${result.migration.from.digest}`,
      `Current Process Package: ${result.migration.to.reference}#${result.migration.to.digest}`,
    ].join("\n");
  }
  if (result.repository && "contract" in result.repository && result.package) {
    return [
      `Repository Contract: ${result.repository.contract}`,
      `Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      `Datum Envelope: ${result.repository.datumEnvelope}`,
      `Artifact Format: ${result.repository.artifactFormat}`,
      `Primitive Catalog: ${result.repository.primitiveCatalog}`,
    ].join("\n");
  }
  if (result.tests) {
    return [
      `Process Fixtures: passed=${result.tests.passed}, failed=${result.tests.failed}`,
      ...result.tests.fixtures.map((fixture) =>
        `${fixture.passed ? "PASS" : "FAIL"} ${fixture.name}`
      ),
    ].join("\n");
  }
  if (result.index) {
    return [
      `Repository: healthy`,
      `Lifecycle Data: ${result.index.data}`,
      `Verified Baselines: ${result.baselineRepositoryVerification?.verifiedBaselines ?? 0}`,
      `Process Drift: ${result.baselineRepositoryVerification?.processDrift ?? 0}`,
      `Index: ${result.index.rebuilt ? "rebuilt" : "current"}`,
      `Index Path: ${result.index.path}`,
      `Report: ${result.report?.rebuilt ? "rebuilt" : "current"}`,
      `Report Path: ${result.report?.path ?? "none"}`,
    ].join("\n");
  }
  if (result.baselineVerification) {
    return [
      `Baseline Verification: ${result.baselineVerification.baselineRevision} [valid]`,
      `Definition Members: ${result.baselineVerification.definitionMembers.join(", ") || "none"}`,
      `Evidence: ${result.baselineVerification.evidence.join(", ") || "none"}`,
      `Composition: ${result.baselineVerification.composition.join(", ") || "none"}`,
      `Checked Hashes: ${result.baselineVerification.checkedHashes}`,
      `Checked Resolutions: ${result.baselineVerification.checkedResolutions}`,
    ].join("\n");
  }
  if (result.execution) {
    const execution = result.execution;
    return [
      `Scenario Execution: ${execution.id} [${execution.status}]`,
      `Scenario: ${execution.definition.scenario}`,
      `Authorization: ${execution.authorization.mode}`,
      ...(execution.obligation
        ? [`Obligation: ${execution.obligation.instance}`]
        : []),
      `Package: ${execution.package.reference}#${execution.package.digest}`,
      `Assignment Response: ${execution.response.assignment}`,
      `Prompt: ${execution.prompt.reference}`,
      ...execution.skills.map((skill) => `Skill: ${skill.reference}`),
      ...execution.policies.map((policy) =>
        `Policy [${policy.role}]: ${policy.reference}`
      ),
      ...humanParticipation(execution.participation ?? []),
      ...(execution.authority
        ? [
            `Authority Supplied: ${execution.authority.supplied.join(", ") || "none"}`,
            `Standing Delegations: ${execution.authority.delegations.join(", ") || "none"}`,
            ...execution.authority.requirements.map((requirement) =>
              `Authority Evidence [${requirement.policy}]: ${requirement.evidence.output} (${requirement.evidence.type})`
            ),
          ]
        : []),
      ...execution.outputs.map((output) =>
        `Output ${output.name}: ${output.lifecycleDatum.revisionId}`
      ),
      `Contract Valid: ${execution.completion.contractValid}`,
      `Completion Passed: ${execution.completion.expressionPassed}`,
      `Discovered Obligations: ${execution.discoveredObligations.length}`,
    ].join("\n");
  }
  if (result.baselineDiff) {
    const drift = new Set<object>(result.baselineDiff.processDrift);
    return [
      `Baseline Diff: ${result.baselineDiff.beforeBaseline} → ${result.baselineDiff.afterBaseline}`,
      `Changes: ${result.baselineDiff.changes.length}`,
      ...result.baselineDiff.changes.map((change) =>
        `${change.kind}${drift.has(change) ? " [informational]" : ""}: ${change.before_revision} → ${change.after_revision}`
      ),
      ...result.baselineDiff.subjects.flatMap((subject) => [
        `Subject: ${subject.subjectRevision}`,
        ...Object.entries(subject.states).map(([dimension, value]) =>
          `  ${dimension}: ${Array.isArray(value) ? value.join(", ") : value}`
        ),
        ...Object.entries(subject.stateExplanations).map(
          ([dimension, explanation]) =>
            `  ${dimension} explanation: ${Array.isArray(explanation) ? explanation.join("; ") : explanation}`,
        ),
      ]),
    ].join("\n");
  }
  if (result.backlinks) {
    return [
      `Backlinks: ${result.backlinks.identity} [${result.backlinks.identityKind.replace("-", " ")}]`,
      ...result.backlinks.links.map((link) =>
        `${link.source} --${link.type}/${link.inverseLabel}--> ${link.target} [${link.targetIdentityKind.replace("-", " ")}]`
      ),
    ].join("\n");
  }
  if (result.trace) {
    return [
      `Trace: ${result.trace.root.identity} [${result.trace.root.identityKind.replace("-", " ")}]`,
      `Depth: ${result.trace.depth}`,
      `Relation: ${result.trace.relation ?? "all"}`,
      ...result.trace.links.map((link) =>
        `${link.source} --${link.type}/${link.inverseLabel}--> ${link.target} [${link.targetIdentityKind.replace("-", " ")}]`
      ),
    ].join("\n");
  }
  if (result.history) {
    return [
      `Stable Datum: ${result.history.id}`,
      `Type: ${result.history.type}`,
      ...result.history.revisions.flatMap((revision) => [
        `${revision.revisionId} [${revision.classification.replace("-", " ")}]`,
        `  Process: ${revision.processRef}`,
        `  Frozen By: ${revision.frozenBy.join(", ") || "none"}`,
      ]),
    ].join("\n");
  }
  if (result.lifecycleDatum && result.projections) {
    const datum = result.lifecycleDatum.datum;
    return [
      `Lifecycle Datum: ${datum.id}`,
      `Revision: ${datum.revision_id}`,
      `Type: ${datum.type}`,
      `Payload: ${JSON.stringify(datum.payload)}`,
      `Links: ${JSON.stringify(datum.links)}`,
      `Created By: ${JSON.stringify(datum.created_by)}`,
      `Body: ${datum.body}`,
      `Storage: ${JSON.stringify(result.lifecycleDatum.storage)}`,
      `Integrity: ${JSON.stringify(result.lifecycleDatum.integrity)}`,
      ...Object.entries(result.projections.states).map(([dimension, value]) =>
        `${dimension[0]?.toUpperCase() ?? ""}${dimension.slice(1)}: ${Array.isArray(value) ? value.join(", ") || "none" : value}`
      ),
      `Backlinks: ${result.projections.backlinks.length}`,
      `Obligations: ${result.projections.obligations.length}`,
      ...result.projections.obligations.map((obligation) =>
        `- ${obligation.obligation}: ${JSON.stringify(obligation)}`
      ),
      `Kernel Capabilities: ${result.projections.kernelCapabilities.join(", ") || "none"}`,
    ].join("\n");
  }
  if (result.data) {
    return [
      `Lifecycle Data: ${result.data.length}`,
      ...result.data.flatMap(({ lifecycleDatum, projections }) => [
        `${lifecycleDatum.datum.revision_id} [${lifecycleDatum.datum.type}] ${typeof lifecycleDatum.datum.payload.title === "string" ? lifecycleDatum.datum.payload.title : "untitled"}`,
        `  Durable: ${JSON.stringify(lifecycleDatum)}`,
        `  Projections: ${JSON.stringify(projections)}`,
      ]),
    ].join("\n");
  }
  if (result.phaseStatus && result.package) {
    return humanPhaseStatus(result.package.reference, result.phaseStatus);
  }
  if (result.looseEnds && result.package) {
    return humanLooseEnds(result.package.reference, result.looseEnds);
  }
  if (
    result.contract === "mdlm-status@1" && result.package && result.profile &&
    result.activePhase && result.omittedCoverage && result.recentTransaction &&
    result.unresolvedWork && result.currentOutcome && result.drillDownCommands
  ) return renderOperatorStatus(result as OperatorStatus);
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

function commandOperands(arguments_: string[]): string[] {
  return arguments_.filter((argument, index) =>
    argument !== "--json" &&
    argument !== "--ref" &&
    arguments_[index - 1] !== "--ref" &&
    argument !== "--authority" &&
    arguments_[index - 1] !== "--authority"
  );
}

async function dispatchCommand(
  arguments_: string[],
  repositoryRoot: string,
  standardInput?: string,
): Promise<CommandResult> {
  const operands = commandOperands(arguments_);
  if (
    (arguments_.length === 1 && arguments_[0] === "--help") ||
    (operands.length === 1 && operands[0] === "help")
  ) {
    return { ok: true, command: "help", help, diagnostics: [] };
  }
  if (operands[0] === "init") {
    if (arguments_.includes("--process")) {
      return failure(
        "init-custom-process-unsupported",
        "mdlm init uses the bundled Example Process Package and does not accept '--process'",
      );
    }
    const initArguments = arguments_.filter((argument) => argument !== "--json");
    if (initArguments.length !== 2 || initArguments[1]?.startsWith("--")) {
      return failure(
        "init-destination-required",
        "Expected 'mdlm init <destination>'",
      );
    }
    const initialized = await initializeBundledRepository(
      path.resolve(repositoryRoot, initArguments[1]!),
    );
    return { ...initialized, command: "init" };
  }
  if (operands[0] === "start") {
    const startArguments = arguments_.filter((argument) => argument !== "--json");
    return startArguments.length === 1
      ? startBriefing(repositoryRoot)
      : {
          ...failure(
            "start-arguments-unsupported",
            "Expected 'mdlm start' without operands",
          ),
          command: "start",
        };
  }
  if (operands[0] === "doctor") return doctorRepository(repositoryRoot);
  if (operands[0] === "status") {
    const statusArguments = arguments_.filter((argument) => argument !== "--json");
    return statusArguments.length === 1
      ? showOperatorStatus(repositoryRoot)
      : {
          ...failure(
            "status-arguments-unsupported",
            "Expected 'mdlm status' without operands",
          ),
          command: "status",
        };
  }
  if (
    operands[0] === "baseline" && operands[1] === "verify" && operands[2]
  ) {
    return verifyBaseline(repositoryRoot, operands[2]);
  }
  if (
    operands[0] === "baseline" && operands[1] === "diff" &&
    operands[2] && operands[3]
  ) {
    return diffBaselines(repositoryRoot, operands[2], operands[3]);
  }
  if (operands[0] === "backlinks" && operands[1]) {
    return showStoredBacklinks(repositoryRoot, operands[1]);
  }
  if (operands[0] === "trace" && operands[1]) {
    return showGraphTrace(repositoryRoot, operands[1], arguments_);
  }
  if (operands[0] === "show" && operands[1]) {
    return showStoredDatum(repositoryRoot, operands[1]);
  }
  if (operands[0] === "history" && operands[1]) {
    return showDatumHistory(repositoryRoot, operands[1]);
  }
  if (operands[0] === "list") return listStoredData(repositoryRoot);
  if (operands[0] === "schema" && operands[1]) {
    return inspectSelectedTypeSchema(repositoryRoot, operands[1]);
  }
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
  if (operands[0] === "phase" && operands[1] === "status") {
    return phaseStatus(
      repositoryRoot,
      operands[2]?.startsWith("--") ? undefined : operands[2],
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
    const nextArguments = arguments_.filter((argument) => argument !== "--json");
    return nextArguments.length === 1
      ? showNextAssignment(repositoryRoot)
      : {
          ...failure(
            "next-arguments-unsupported",
            "Expected 'mdlm next' without legacy projection options",
          ),
          command: "next",
        };
  }
  if (operands[0] === "assignment" && operands[1] === "show") {
    const assignmentArguments = arguments_.filter((argument) => argument !== "--json");
    return assignmentArguments.length === 3 &&
        assignmentArguments[2] && !assignmentArguments[2].startsWith("--")
      ? showAssignmentState(repositoryRoot, assignmentArguments[2])
      : {
          ...failure(
            "assignment-show-arguments-invalid",
            "Expected 'mdlm assignment show <assignment-id>'",
          ),
          command: "assignment.show",
          contract: "mdlm-assignment-state@1",
        };
  }
  if (operands[0] === "scenario" && operands[1] === "submit") {
    const submitArguments = operands;
    return submitArguments.length <= 3 &&
        (submitArguments.length < 3 || submitArguments[2] === "-" ||
          !submitArguments[2]?.startsWith("--"))
      ? submitExactAssignment(
          repositoryRoot,
          submitArguments[2],
          standardInput,
          optionValues(arguments_, "--authority"),
        )
      : {
          ...failure(
            "scenario-submit-arguments-invalid",
            "Expected 'mdlm scenario submit [response-file|-]'",
          ),
          command: "scenario.submit",
        };
  }
  if (
    operands[0] === "scenario" && operands[1] === "settlement" &&
    operands.length === 3 && operands[2]
  ) {
    return showSubmissionSettlement(repositoryRoot, operands[2]);
  }
  if (
    operands[0] === "scenario" && operands[1] === "execution" &&
    operands[2] === "show" && operands[3]
  ) {
    return showScenarioExecution(repositoryRoot, operands[3]);
  }
  if (operands[0] !== "process") {
    return failure(
      "unknown-command",
      "Expected an MDLM operator or inspection command",
    );
  }
  if (operands[1] === "test") {
    return runProcessFixtures(repositoryRoot, optionValue(arguments_, "--ref"));
  }
  if (operands[1] === "migrate" && operands[2]) {
    return migrateRepositoryPackage(repositoryRoot, operands[2]);
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

export interface CommandApplicationExecution {
  exitCode: 0 | 1;
  output: string;
}

async function executeCommand(
  arguments_: string[],
  dispatch: () => Promise<CommandResult>,
): Promise<CommandApplicationExecution> {
  let result: CommandResult;
  try {
    result = await dispatch();
  } catch (error) {
    const failed = failure(
      "mdlm-error",
      error instanceof Error ? error.message : String(error),
    );
    result = arguments_[0] === "next"
      ? {
          ...failed,
          command: "next",
          contract: "mdlm-next@2",
          outcome: "invalid",
          integrity: { status: "invalid" },
        }
      : arguments_[0] === "status"
      ? {
          ...failed,
          command: "status",
          contract: "mdlm-status@1",
          integrity: { status: "invalid" },
          currentOutcome: {
            outcome: "invalid",
            diagnostics: failed.diagnostics,
          },
        }
      : failed;
  }
  if (arguments_[0] === "next") {
    if (!result.ok) {
      result = {
        ...result,
        command: "next",
        contract: "mdlm-next@2",
        outcome: "invalid",
        integrity: { status: "invalid" },
      };
    }
    result = {
      ...result,
      operatorInstructions: operatorInstructions({
        outcome: result.outcome as AssignmentOutcome["outcome"] | "invalid",
        ...(result.assignment ? { assignment: result.assignment } : {}),
        ...(result.authorityRequirement
          ? { authorityRequirement: result.authorityRequirement }
          : {}),
      }),
    };
  }
  return {
    exitCode: result.ok ? 0 : 1,
    output: `${arguments_.includes("--json") ||
        (result.contract && arguments_[0] !== "status" &&
          arguments_[0] !== "start") ||
        arguments_[0] === "next" ||
        (arguments_[0] === "scenario" && arguments_[1] === "submit")
      ? JSON.stringify(result, null, 2)
      : renderCommandResult(result)}\n`,
  };
}

/** Dispatch and render one MDLM invocation without owning process startup. */
export function executeCommandApplication(
  arguments_: string[],
  repositoryRoot: string,
  standardInput?: string,
): Promise<CommandApplicationExecution> {
  return executeCommand(
    arguments_,
    () => dispatchCommand(arguments_, repositoryRoot, standardInput),
  );
}
