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
import {
  createExactBaseline,
  freezeExactBaseline,
  mutateExactBaseline,
  verifyExactBaseline,
  type BaselineFreeze,
  type BaselineMutation,
  type BaselineVerification,
} from "./exact-baseline-repository.js";
import {
  createDatum,
  datumHistory,
  inspectBacklinks,
  listData,
  mutateDatumLink,
  rebuildRepositoryIndex,
  reviseDatum,
  showDatum,
  traceGraph,
  type BacklinkInspection,
  type CreatedDatum,
  type DatumHistory,
  type DatumProjections,
  type GraphTrace,
  type LinkMutation,
  type ListedDatum,
  type RepositoryIndexSummary,
  type StoredDatum,
} from "./lifecycle-repository.js";
import {
  scaffoldProcessDefinition,
  scaffoldProcessFixture,
  scaffoldProcessPackage,
  testProcessFixtures,
  type DefinitionScaffold,
  type FixtureScaffold,
  type FixtureTestSummary,
  type PackageScaffold,
} from "./process-package-scaffolding.js";

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

interface RepositorySummary {
  contract: "mdlm-repository@1";
  datumEnvelope: string;
  artifactFormat: string;
  primitiveCatalog: string;
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
  scaffold?: PackageScaffold;
  definition?: DefinitionScaffold;
  fixture?: FixtureScaffold;
  tests?: FixtureTestSummary;
  repository?: RepositorySummary;
  created?: CreatedDatum;
  lifecycleDatum?: StoredDatum["lifecycleDatum"];
  projections?: DatumProjections;
  data?: ListedDatum[];
  history?: DatumHistory;
  linkMutation?: LinkMutation;
  baselineMutation?: BaselineMutation;
  baselineFreeze?: BaselineFreeze;
  baselineVerification?: BaselineVerification;
  backlinks?: BacklinkInspection;
  trace?: GraphTrace;
  index?: RepositoryIndexSummary;
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

function repositorySummary(processPackage: ProcessPackage): RepositorySummary {
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

async function initializeRepository(
  repositoryRoot: string,
  processReference: string | undefined,
): Promise<CommandResult> {
  if (!processReference) {
    return failure(
      "process-package-required",
      "Repository initialization requires '--process <package-ref>'",
    );
  }
  const lifecycleRoot = path.join(repositoryRoot, ".lifecycle");
  try {
    await fs.access(lifecycleRoot);
    return failure(
      "repository-already-initialized",
      "The repository already contains .lifecycle",
      lifecycleRoot,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const installedRoot = await installedPackageRoot(repositoryRoot, processReference);
  const sourceRoot = installedRoot ?? path.resolve(repositoryRoot, processReference);
  const loaded = await loadProcessPackage(sourceRoot);
  if (!loaded.ok) return { ok: false, command: "init", diagnostics: loaded.diagnostics };
  const summary = await packageSummary(loaded.package, sourceRoot);
  if (installedRoot && summary.reference !== processReference) {
    return failure(
      "process-package-reference-mismatch",
      `Installed reference '${processReference}' contains '${summary.reference}'`,
      sourceRoot,
    );
  }
  const repository = repositorySummary(loaded.package);
  const temporaryRoot = path.join(repositoryRoot, `.mdlm-init-${randomUUID()}`);
  try {
    await fs.mkdir(temporaryRoot);
    const installation = await installPackage(temporaryRoot, sourceRoot);
    if (!installation.ok) return { ...installation, command: "init" };
    const selection = await usePackage(temporaryRoot, summary.reference);
    if (!selection.ok) return { ...selection, command: "init" };
    await Promise.all([
      fs.mkdir(path.join(temporaryRoot, ".lifecycle/data"), { recursive: true }),
      fs.mkdir(path.join(temporaryRoot, ".lifecycle/generated/indexes"), {
        recursive: true,
      }),
    ]);
    await atomicJson(path.join(temporaryRoot, ".lifecycle/repository.json"), {
      schemaVersion: 1,
      repositoryContract: repository.contract,
      package: { reference: summary.reference, digest: summary.digest },
      contracts: {
        datumEnvelope: repository.datumEnvelope,
        artifactFormat: repository.artifactFormat,
        expressionLanguage: summary.language,
        primitiveCatalog: repository.primitiveCatalog,
      },
    });
    await fs.rename(path.join(temporaryRoot, ".lifecycle"), lifecycleRoot);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
  return {
    ok: true,
    command: "init",
    package: summary,
    repository,
    diagnostics: [],
  };
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

async function initPackage(
  repositoryRoot: string,
  destination: string,
  from?: string,
): Promise<CommandResult> {
  let source:
    | { root: string; reference: string; digest: string }
    | undefined;
  if (from) {
    const installedRoot = await installedPackageRoot(repositoryRoot, from);
    const sourceRoot = installedRoot ?? path.resolve(repositoryRoot, from);
    const loaded = await loadProcessPackage(sourceRoot);
    if (!loaded.ok) {
      return { ok: false, command: "process.init", diagnostics: loaded.diagnostics };
    }
    const summary = await packageSummary(loaded.package, sourceRoot);
    if (installedRoot && summary.reference !== from) {
      return failure(
        "process-package-reference-mismatch",
        `Installed reference '${from}' contains '${summary.reference}'`,
        sourceRoot,
      );
    }
    source = {
      root: sourceRoot,
      reference: summary.reference,
      digest: summary.digest,
    };
  }
  const scaffolded = await scaffoldProcessPackage(
    path.resolve(repositoryRoot, destination),
    source,
  );
  if (!scaffolded.ok) {
    return {
      ok: false,
      command: "process.init",
      diagnostics: scaffolded.diagnostics,
    };
  }
  return {
    ok: true,
    command: "process.init",
    scaffold: scaffolded.value,
    diagnostics: [],
  };
}

async function newProcessDefinition(
  repositoryRoot: string,
  kind: string,
  id: string,
): Promise<CommandResult> {
  const scaffolded = await scaffoldProcessDefinition(repositoryRoot, kind, id);
  if (!scaffolded.ok) {
    return {
      ok: false,
      command: "process.definition.new",
      diagnostics: scaffolded.diagnostics,
    };
  }
  return {
    ok: true,
    command: "process.definition.new",
    definition: scaffolded.value,
    diagnostics: [],
  };
}

async function newProcessFixture(
  repositoryRoot: string,
  name: string,
  phaseId?: string,
): Promise<CommandResult> {
  const scaffolded = await scaffoldProcessFixture(repositoryRoot, name, phaseId);
  if (!scaffolded.ok) {
    return {
      ok: false,
      command: "process.fixture.new",
      diagnostics: scaffolded.diagnostics,
    };
  }
  return {
    ok: true,
    command: "process.fixture.new",
    fixture: scaffolded.value,
    diagnostics: [],
  };
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

function assignments(
  arguments_: string[],
  option: string,
): { ok: true; values: { path: string; value: unknown }[] } | CommandResult {
  const values: { path: string; value: unknown }[] = [];
  for (const assignment of optionValues(arguments_, option)) {
    const separator = assignment.indexOf("=");
    if (separator < 1) {
      return failure(
        "invalid-assignment",
        `Invalid ${option} '${assignment}'; expected path=value`,
      );
    }
    const pathValue = assignment.slice(0, separator);
    const source = assignment.slice(separator + 1);
    let value: unknown;
    try {
      value = parse(source) as unknown;
    } catch (error) {
      return failure(
        "invalid-assignment",
        `Invalid ${option} value for '${pathValue}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    values.push({ path: pathValue, value });
  }
  return { ok: true, values };
}

async function newDatum(
  repositoryRoot: string,
  typeId: string,
  arguments_: string[],
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "new",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const fields = assignments(arguments_, "--set");
  if (!("values" in fields)) return { ...fields, command: "new" };
  const linkAssignments = assignments(arguments_, "--link");
  if (!("values" in linkAssignments)) return { ...linkAssignments, command: "new" };
  const links: { type: string; target: string }[] = [];
  for (const link of linkAssignments.values) {
    if (typeof link.value !== "string") {
      return failure(
        "invalid-link",
        `Link '${link.path}' target must be a Stable or Revision ID`,
      );
    }
    links.push({ type: link.path, target: link.value });
  }
  const created = await createDatum(
    repositoryRoot,
    selected.processPackage,
    selected.summary.reference,
    selected.summary.digest,
    typeId,
    optionValue(arguments_, "--scenario"),
    fields.values,
    links,
    optionValue(arguments_, "--body") ?? "",
  );
  if (!created.ok) {
    return {
      ok: false,
      command: "new",
      package: selected.summary,
      selected: true,
      diagnostics: created.diagnostics,
    };
  }
  return {
    ok: true,
    command: "new",
    package: selected.summary,
    created: created.value,
    diagnostics: [],
  };
}

function unavailableExactBaseline(command: string): CommandResult {
  return {
    ...failure(
      "kernel-capability-unavailable",
      "Selected Process Package does not bind Kernel Capability exact-baseline@1",
      "exact-baseline@1",
    ),
    command,
  };
}

async function newBaseline(
  repositoryRoot: string,
  arguments_: string[],
): Promise<CommandResult> {
  const command = "baseline.create";
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command,
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  if (!selected.processPackage.kernelCapabilities["exact-baseline@1"]) {
    return unavailableExactBaseline(command);
  }
  const type = optionValue(arguments_, "--type");
  if (!type) {
    return {
      ...failure("baseline-type-required", "Baseline creation requires '--type <bound-type>'"),
      command,
    };
  }
  const fields = assignments(arguments_, "--set");
  if (!("values" in fields)) return { ...fields, command };
  const created = await createExactBaseline(
    repositoryRoot,
    selected.processPackage,
    selected.summary.reference,
    selected.summary.digest,
    type,
    optionValue(arguments_, "--scenario"),
    fields.values,
    optionValue(arguments_, "--body") ?? "",
  );
  if (!created.ok) {
    return {
      ok: false,
      command,
      package: selected.summary,
      selected: true,
      diagnostics: created.diagnostics,
    };
  }
  return {
    ok: true,
    command,
    package: selected.summary,
    created: created.value,
    diagnostics: [],
  };
}

async function mutateBaseline(
  repositoryRoot: string,
  command: "baseline.add" | "baseline.remove" | "baseline.evidence.add" |
    "baseline.evidence.remove" | "baseline.compose",
  baselineIdentity: string,
  targetRevision: string,
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command,
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const section = command === "baseline.compose"
    ? "composition" as const
    : command.startsWith("baseline.evidence")
    ? "evidence" as const
    : "definition_members" as const;
  const operation = command.endsWith(".remove") || command === "baseline.remove"
    ? "removed" as const
    : "added" as const;
  const mutated = await mutateExactBaseline(
    repositoryRoot,
    selected.processPackage,
    baselineIdentity,
    targetRevision,
    section,
    operation,
  );
  if (!mutated.ok) {
    return {
      ok: false,
      command,
      package: selected.summary,
      selected: true,
      diagnostics: mutated.diagnostics,
    };
  }
  return {
    ok: true,
    command,
    package: selected.summary,
    baselineMutation: mutated.value,
    diagnostics: [],
  };
}

async function freezeBaseline(
  repositoryRoot: string,
  baselineIdentity: string,
): Promise<CommandResult> {
  const command = "baseline.freeze";
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command,
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const frozen = await freezeExactBaseline(
    repositoryRoot,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
    baselineIdentity,
  );
  if (!frozen.ok) {
    return {
      ok: false,
      command,
      package: selected.summary,
      selected: true,
      diagnostics: frozen.diagnostics,
    };
  }
  return {
    ok: true,
    command,
    package: selected.summary,
    baselineFreeze: frozen.value,
    diagnostics: [],
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

async function reviseStoredDatum(
  repositoryRoot: string,
  stableId: string,
  arguments_: string[],
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command: "revise",
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const revised = await reviseDatum(
    repositoryRoot,
    selected.processPackage,
    selected.summary.reference,
    selected.summary.digest,
    stableId,
    optionValue(arguments_, "--from"),
  );
  if (!revised.ok) {
    return {
      ok: false,
      command: "revise",
      package: selected.summary,
      selected: true,
      diagnostics: revised.diagnostics,
    };
  }
  return {
    ok: true,
    command: "revise",
    package: selected.summary,
    created: revised.value,
    diagnostics: [],
  };
}

async function mutateStoredDatumLink(
  repositoryRoot: string,
  command: "link" | "unlink",
  sourceRevision: string,
  target: string,
  arguments_: string[],
): Promise<CommandResult> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) {
    return {
      ok: false,
      command,
      selected: selected.selected,
      diagnostics: selected.diagnostics,
    };
  }
  const type = optionValue(arguments_, "--type");
  if (!type) {
    return { ...failure("link-type-required", "Link mutation requires '--type <relationship>'"), command };
  }
  const mutated = await mutateDatumLink(
    repositoryRoot,
    selected.processPackage,
    sourceRevision,
    target,
    type,
    command === "link" ? "added" : "removed",
  );
  if (!mutated.ok) {
    return {
      ok: false,
      command,
      package: selected.summary,
      selected: true,
      diagnostics: mutated.diagnostics,
    };
  }
  return {
    ok: true,
    command,
    package: selected.summary,
    linkMutation: mutated.value,
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
  const rebuilt = await rebuildRepositoryIndex(
    repositoryRoot,
    selected.processPackage,
    selected.summary.reference,
  );
  if (!rebuilt.ok) {
    return {
      ok: false,
      command: "doctor",
      package: selected.summary,
      selected: true,
      diagnostics: rebuilt.diagnostics,
    };
  }
  return {
    ok: true,
    command: "doctor",
    package: selected.summary,
    index: rebuilt.value,
    diagnostics: [],
  };
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

async function selectedRepositoryPackage(
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
          ? "No MDLM repository descriptor exists; run 'req init --process <package-ref>'"
          : `Cannot read the MDLM repository descriptor: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
  const packageContract = typeof descriptor.package === "object" &&
      descriptor.package !== null
    ? descriptor.package as Record<string, unknown>
    : {};
  const contracts = typeof descriptor.contracts === "object" &&
      descriptor.contracts !== null
    ? descriptor.contracts as Record<string, unknown>
    : {};
  const repository = repositorySummary(selected.processPackage);
  if (
    descriptor.schemaVersion !== 1 ||
    descriptor.repositoryContract !== repository.contract ||
    packageContract.reference !== selected.summary.reference ||
    packageContract.digest !== selected.summary.digest ||
    contracts.datumEnvelope !== repository.datumEnvelope ||
    contracts.artifactFormat !== repository.artifactFormat ||
    contracts.expressionLanguage !== selected.summary.language ||
    contracts.primitiveCatalog !== repository.primitiveCatalog
  ) {
    return {
      ok: false,
      selected: true,
      diagnostics: [{
        code: "repository-contract-mismatch",
        path: descriptorPath,
        message: "The repository descriptor does not match its exact selected Process Package and supported contracts",
      }],
    };
  }
  return selected;
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
  if (result.repository && result.package) {
    return [
      `Repository Contract: ${result.repository.contract}`,
      `Process Package: ${result.package.reference}`,
      `Expression Language: ${result.package.language}`,
      `Datum Envelope: ${result.repository.datumEnvelope}`,
      `Artifact Format: ${result.repository.artifactFormat}`,
      `Primitive Catalog: ${result.repository.primitiveCatalog}`,
    ].join("\n");
  }
  if (result.scaffold) {
    return [
      `Process Package: ${result.scaffold.package}`,
      `Path: ${result.scaffold.path}`,
      `Derived From: ${result.scaffold.derivedFrom?.package ?? "none"}`,
      `Source Digest: ${result.scaffold.derivedFrom?.digest ?? "none"}`,
    ].join("\n");
  }
  if (result.definition) {
    return [
      `Definition: ${result.definition.id}@${result.definition.version}`,
      `Kind: ${result.definition.kind}`,
      `Path: ${result.definition.path}`,
    ].join("\n");
  }
  if (result.fixture) {
    return [
      `Fixture: ${result.fixture.name}`,
      `Phase: ${result.fixture.phase}`,
      `Snapshot: ${result.fixture.snapshot}`,
      `Expected Result: ${result.fixture.expected}`,
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
      `Index: ${result.index.rebuilt ? "rebuilt" : "current"}`,
      `Index Path: ${result.index.path}`,
    ].join("\n");
  }
  if (result.linkMutation) {
    return [
      `Link: ${result.linkMutation.operation}`,
      `Source Revision: ${result.linkMutation.sourceRevision}`,
      `Relationship: ${result.linkMutation.type}`,
      `Target: ${result.linkMutation.target}`,
    ].join("\n");
  }
  if (result.baselineMutation) {
    return [
      `Baseline Mutation: ${result.baselineMutation.operation}`,
      `Baseline Revision: ${result.baselineMutation.baselineRevision}`,
      `Target: ${result.baselineMutation.target}`,
    ].join("\n");
  }
  if (result.baselineFreeze) {
    return [
      `Frozen Baseline: ${result.baselineFreeze.baselineRevision}`,
      `Frozen At: ${result.baselineFreeze.frozenAt}`,
      `Definition Members: ${result.baselineFreeze.definitionMembers.join(", ") || "none"}`,
      `Evidence: ${result.baselineFreeze.evidence.join(", ") || "none"}`,
      `Composition: ${result.baselineFreeze.composition.join(", ") || "none"}`,
      `Hashes: ${result.baselineFreeze.hashes}`,
      `Process: ${result.baselineFreeze.processRef}`,
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
  if (result.created) {
    return [
      `Lifecycle Datum: ${result.created.id}`,
      `Revision: ${result.created.revisionId}`,
      `Type: ${result.created.type}`,
      `Path: ${result.created.path}`,
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
  if (operands[0] === "init") {
    return initializeRepository(
      repositoryRoot,
      optionValue(arguments_, "--process"),
    );
  }
  if (operands[0] === "doctor") return doctorRepository(repositoryRoot);
  if (operands[0] === "new" && operands[1]) {
    return newDatum(repositoryRoot, operands[1], arguments_);
  }
  if (operands[0] === "revise" && operands[1]) {
    return reviseStoredDatum(repositoryRoot, operands[1], arguments_);
  }
  if (operands[0] === "baseline" && operands[1] === "create") {
    return newBaseline(repositoryRoot, arguments_);
  }
  if (
    operands[0] === "baseline" &&
    (operands[1] === "add" || operands[1] === "remove") &&
    operands[2] && operands[3]
  ) {
    return mutateBaseline(
      repositoryRoot,
      `baseline.${operands[1]}`,
      operands[2],
      operands[3],
    );
  }
  if (
    operands[0] === "baseline" && operands[1] === "evidence" &&
    (operands[2] === "add" || operands[2] === "remove") &&
    operands[3] && operands[4]
  ) {
    return mutateBaseline(
      repositoryRoot,
      `baseline.evidence.${operands[2]}`,
      operands[3],
      operands[4],
    );
  }
  if (
    operands[0] === "baseline" && operands[1] === "compose" &&
    operands[2] && operands[3]
  ) {
    return mutateBaseline(
      repositoryRoot,
      "baseline.compose",
      operands[2],
      operands[3],
    );
  }
  if (
    operands[0] === "baseline" && operands[1] === "freeze" && operands[2]
  ) {
    return freezeBaseline(repositoryRoot, operands[2]);
  }
  if (
    operands[0] === "baseline" && operands[1] === "verify" && operands[2]
  ) {
    return verifyBaseline(repositoryRoot, operands[2]);
  }
  if (
    (operands[0] === "link" || operands[0] === "unlink") &&
    operands[1] && operands[2]
  ) {
    return mutateStoredDatumLink(
      repositoryRoot,
      operands[0],
      operands[1],
      operands[2],
      arguments_,
    );
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
  if (operands[1] === "init" && operands[2]) {
    return initPackage(
      repositoryRoot,
      operands[2],
      optionValue(arguments_, "--from"),
    );
  }
  if (
    operands[1] === "definition" && operands[2] === "new" &&
    operands[3] && operands[4]
  ) {
    return newProcessDefinition(repositoryRoot, operands[3], operands[4]);
  }
  if (
    operands[1] === "fixture" && operands[2] === "new" && operands[3]
  ) {
    return newProcessFixture(
      repositoryRoot,
      operands[3],
      optionValue(arguments_, "--phase"),
    );
  }
  if (operands[1] === "test") {
    return runProcessFixtures(repositoryRoot, optionValue(arguments_, "--ref"));
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
