import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "yaml";
import { inspectDirectExpectations, submitDirectProposal, inspectDirectSettlement, runDirectExecution, inspectDirectExecution, inspectDirectReview, registerDirectReviewFiles, inspectVerificationContext, inspectVerificationStatus } from "./direct-proposal.js";
import { requirementTraceBinding } from "./requirement-trace.js";
import { inspectRequirementTrace } from "./requirement-trace-inspection.js";
import { loadProcessPackage, resolveType, type LifecycleSnapshot, type ProcessDiagnostic } from "./index.js";
import { evaluateProcessDefinition, evaluateProcessExpression, type ProcessDirectEvaluation } from "./evaluator.js";
import { processCapabilities, processInspection } from "./process-package-inspection.js";
import { diffExactBaselines, verifyExactBaseline } from "./exact-baseline-repository.js";
import { datumHistory, inspectBacklinks, listData, showDatum, traceGraph, readRepositoryData } from "./lifecycle-repository.js";
import { initializeBundledRepository } from "./repository-initialization.js";
import { selectedPackage, selectedRepositoryPackage } from "./selected-package.js";
import { packageSummary, packagesRelativePath } from "./repository-contract.js";

interface CommandResult {
  ok: boolean;
  command?: string;
  diagnostics: ProcessDiagnostic[];
  [key: string]: unknown;
}

const help = `Usage: mdlm <command> [--json]

Direct lifecycle work:
  mdlm init <destination> [--process exploratory|iterative]
  mdlm expectations [show <action> [<exact-subject>]] [--json]
  mdlm proposal submit <proposal-file|-> [--authority <authority-id>] [--json]
  mdlm proposal settlement <operation-id> [--json]
  mdlm verification context <exact-RQS-or-EXP> [--output <file>] [--json]
  mdlm verification status <exact-product-or-selection> [--json]
  mdlm execution run <exact-subject> <operation-id> [--activity <exact-activity>] [--json]
  mdlm execution settlement <operation-id> [--json]
  mdlm review context <action> [<exact-subject>] [--output <file>] [--json]
  mdlm review register <proposal-file> <verdict-file> [--json]

Inspect lifecycle data:
  mdlm status [--json]
  mdlm doctor [--json]
  mdlm list [--json]
  mdlm show <identity> [--json]
  mdlm history <stable-id> [--json]
  mdlm backlinks <identity> [--json]
  mdlm trace <identity> [--relation <relation>] [--depth <integer>] [--json]
  mdlm trace why <path:line> --implementation <IMP-revision> [--json]
  mdlm trace impact <REQ-id-or-revision> --implementation <IMP-revision> [--json]
  mdlm schema <type> [--json]
  mdlm process show|validate|capabilities [--json]

Choose available work, retrieve its guidance, and submit the proposed data.
Use a distinct operation ID for new work and settlement to recover its result.`;

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
  if (!selected.ok) return { ...selected, command: "doctor" };
  const loaded = await readRepositoryData(repositoryRoot, selected.processPackage);
  if (!loaded.ok) return { ...loaded, command: "doctor" };
  return { ok: true, command: "doctor", package: selected.summary, integrity: { status: "valid" }, dataCount: loaded.value.length, diagnostics: [] };
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

function renderCommandResult(result: CommandResult): string {
  if (typeof result.help === "string") return result.help;
  if (!result.ok) return result.diagnostics.map(d => `Error [${d.code}]: ${d.message}`).join("\n");
  return JSON.stringify(result, null, 2);
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
    argument !== "--activity" &&
    arguments_[index - 1] !== "--activity" &&
    argument !== "--authority" &&
    arguments_[index - 1] !== "--authority"
  );
}

async function dispatchCommand(
  arguments_: string[],
  repositoryRoot: string,
  standardInput?: string,
): Promise<CommandResult> {
  const outputOptions = optionValues(arguments_, "--output");
  const exportingReview = ["review", "verification"].includes(arguments_[0]!) && arguments_[1] === "context";
  if (arguments_.includes("--output") && (!exportingReview || outputOptions.length !== 1 || !outputOptions[0] || outputOptions[0].startsWith("--"))) {
    return failure("review-output-invalid", "--output requires one file path for review context");
  }
  const operands = commandOperands(exportingReview ? arguments_.filter((argument, index) => argument !== "--output" && arguments_[index - 1] !== "--output") : arguments_);
  if (
    (arguments_.length === 1 && arguments_[0] === "--help") ||
    (operands.length === 1 && operands[0] === "help")
  ) {
    return { ok: true, command: "help", help, diagnostics: [] };
  }
  if (operands[0] === "init") {
    const selectedProcess = optionValue(arguments_, "--process");
    if (arguments_.includes("--process") && selectedProcess !== "exploratory" && selectedProcess !== "iterative") {
      return failure(
        "init-custom-process-unsupported",
        "Named alternatives are '--process exploratory' and '--process iterative'; custom Process Package paths are unsupported",
      );
    }
    const initArguments = arguments_.filter((argument) => argument !== "--json");
    const expected = selectedProcess ? 4 : 2;
    if (initArguments.length !== expected || initArguments[1]?.startsWith("--") ||
      (expected === 4 && (initArguments[2] !== "--process" || initArguments[3] !== selectedProcess))) {
      return failure(
        "init-destination-required",
        "Expected 'mdlm init <destination> [--process exploratory|iterative]'",
      );
    }
    const initialized = await initializeBundledRepository(
      path.resolve(repositoryRoot, initArguments[1]!),
      selectedProcess === "exploratory" || selectedProcess === "iterative" ? selectedProcess : "tiny",
    );
    return { ...initialized, command: "init" };
  }
  if (operands[0] === "doctor") return doctorRepository(repositoryRoot);
  if (operands[0] === "verification") {
    try {
      if (operands.length !== 3) throw new Error("Expected verification context <exact-RQS-or-EXP> or verification status <exact-product-or-selection>");
      if (operands[1] === "status") return {...await inspectVerificationStatus(repositoryRoot, operands[2]!), command: "verification.status", diagnostics: []};
      if (operands[1] !== "context") throw new Error("Unknown verification command");
      const context = {...await inspectVerificationContext(repositoryRoot, operands[2]!), command: "verification.context", diagnostics: []};
      if (!outputOptions.length) return context;
      const file = path.resolve(repositoryRoot, outputOptions[0]!);
      const bytes = Buffer.from(`${JSON.stringify(context, null, 2)}\n`, "utf8");
      await fs.writeFile(file, bytes, {flag: "wx"});
      return {ok:true, command:"verification.context", contract:"mdlm-verification-export@1", export:{path:file,bytes:bytes.length,exportSha256:createHash("sha256").update(bytes).digest("hex")},subject:context.subject,package:context.package,snapshot:context.snapshot,authoringContext:context.authoringContext,diagnostics:[]};
    } catch(error) {return {...failure("verification-invalid", String(error)),command:"verification"};}
  }
  if (operands[0] === "execution") {
    try {
      if (operands[1] === "run" && operands.length === 4) return {...await runDirectExecution(repositoryRoot, operands[2]!, operands[3]!, optionValue(arguments_, "--activity")), command: "execution.run", diagnostics: []};
      if (operands[1] === "settlement" && operands.length === 3) return {...await inspectDirectExecution(repositoryRoot, operands[2]!), command: "execution.settlement", diagnostics: []};
      throw new Error("Expected execution run <exact-subject> <operation-id> or execution settlement <operation-id>");
    } catch (error) { return {...failure("direct-execution-invalid", String(error)), command: "execution"}; }
  }
  if (operands[0] === "expectations") {
    try {
      if (operands.length !== 1 && !([3, 4].includes(operands.length) && operands[1] === "show")) throw new Error("Expected expectations [show <action> [<exact-subject>]]");
      return {...await inspectDirectExpectations(repositoryRoot, operands[2], operands[3]), command: "expectations", diagnostics: []};
    } catch (error) { return {...failure("direct-expectation-invalid", String(error)), command: "expectations"}; }
  }
  if (operands[0] === "proposal") {
    try {
      if (operands[1] === "settlement" && operands.length === 3) return {...await inspectDirectSettlement(repositoryRoot, operands[2]!), command: "proposal.settlement", diagnostics: []};
      if (operands[1] !== "submit" || operands.length !== 3) throw new Error("Expected proposal submit <file|-> or proposal settlement <operation>");
      const source = operands[2] === "-" ? standardInput ?? "" : await fs.readFile(path.resolve(repositoryRoot, operands[2]!), "utf8");
      return {...await submitDirectProposal(repositoryRoot, source, optionValues(arguments_, "--authority")), command: "proposal.submit", diagnostics: []};
    } catch (error) { return {...failure("direct-proposal-invalid", String(error)), command: "proposal"}; }
  }
  if (operands[0] === "review") {
    if (operands[1] === "context" && [3, 4].includes(operands.length)) {
      const context = await inspectDirectReview(repositoryRoot, operands[2]!, operands[3]);
      const result = {...context, command: "review.context", diagnostics: []};
      if (!outputOptions.length) return result;
      const file = path.resolve(repositoryRoot, outputOptions[0]!);
      const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8");
      await fs.writeFile(file, bytes, {flag: "wx"});
      return {
        ok: true, command: "review.context", contract: "mdlm-review-export@1",
        export: {path: file, bytes: bytes.length, exportSha256: createHash("sha256").update(bytes).digest("hex")},
        action: `${context.action.id}@${context.action.version}`,
        ...(context.subject ? {subject: context.subject} : {}),
        snapshot: context.snapshot, package: context.package, diagnostics: [],
      };
    }
    if (operands[1] === "register" && operands.length === 4) {
      const [proposal, verdict] = await Promise.all([
        fs.readFile(path.resolve(repositoryRoot, operands[2]!), "utf8"),
        fs.readFile(path.resolve(repositoryRoot, operands[3]!), "utf8"),
      ]);
      return { ...await registerDirectReviewFiles(repositoryRoot, proposal, verdict), command: "review.register", diagnostics: [] };
    }
    return failure("review-arguments-invalid", "Expected review context <action> [<exact-subject>] or review register <proposal-file> <verdict-file>");
  }
  if (operands[0] === "status") {
    if (operands.length !== 1) return failure("status-arguments-unsupported", "Expected mdlm status without operands");
    return { ...await inspectDirectExpectations(repositoryRoot), command: "status", diagnostics: [] };
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
  if (operands[0] === "trace" && ["why", "impact"].includes(operands[1] ?? "")) {
    const selected = await selectedRepositoryPackage(repositoryRoot);
    if (!selected.ok) return {...failure("trace-package-unavailable", "Select a valid process package"), diagnostics: selected.diagnostics};
    const binding = requirementTraceBinding(selected.processPackage);
    const implementation = optionValue(arguments_, "--implementation");
    if (!binding || !implementation || !operands[2]) return failure("trace-arguments-invalid", "Trace requires a supported package, query and --implementation exact revision");
    const loaded = await readRepositoryData(repositoryRoot, selected.processPackage);
    if (!loaded.ok) return {...loaded, command: "trace"};
    const line = /^(.*):(\d+)$/.exec(operands[2]);
    if (operands[1] === "why" && !line) return failure("trace-line-invalid", "Expected path:line");
    const query = operands[1] === "why" ? {kind: "why" as const, path: line![1]!, line: Number(line![2])} : {kind: "impact" as const, requirement: operands[2]};
    const result = inspectRequirementTrace(loaded.value.map((d) => d.lifecycleDatum.datum), binding, implementation, query);
    return {ok: result.diagnostics.length === 0, command: "trace", requirementTrace: result, diagnostics: result.diagnostics};
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
  const directKind = ["relation", "selector", "policy", "state"]
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
  if (operands[0] !== "process") {
    return failure(
      "unknown-command",
      "Expected an MDLM operator or inspection command",
    );
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

/** Dispatch and render one invocation; cli-main awaits stream writes. */
export async function executeCommandApplication(
  arguments_: string[],
  repositoryRoot: string,
  standardInput?: string,
): Promise<CommandApplicationExecution> {
  let result: CommandResult;
  try {
    result = await dispatchCommand(arguments_, repositoryRoot, standardInput);
  } catch (error) {
    result = failure("mdlm-error", error instanceof Error ? error.message : String(error));
  }
  return {
    exitCode: result.ok ? 0 : 1,
    output: `${arguments_.includes("--json") ? JSON.stringify(result, null, 2) : renderCommandResult(result)}\n`,
  };
}
