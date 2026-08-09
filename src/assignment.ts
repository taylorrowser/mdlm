import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type {
  LifecycleEvaluation,
  ObligationEvaluation,
  ProcessDiagnostic,
  ProcessPackage,
  VersionedDefinition,
} from "./index.js";
import {
  activeLifecycleEvaluation,
  initialPhaseId,
  nextWorkProjection,
} from "./lifecycle-inspection.js";
import { verifyRepositoryBaselines } from "./exact-baseline-repository.js";
import { repositoryLifecycleSnapshot } from "./lifecycle-repository.js";
import {
  classifyOperatorOutcome,
  type OperatorOutcomeClassification,
  type OperatorWorkFacts,
} from "./operator-outcome.js";
import { parseObligationInstanceIdentity } from "./obligation-instance.js";
import { authorityEvidenceContract } from "./participation.js";
import { resolveType } from "./index.js";
import {
  dryRunExplicitScenario,
  dryRunResolverScenario,
  type ScenarioDryRun,
  type ScenarioDryRunInvocation,
} from "./scenario-dry-run.js";
import {
  submitExplicitScenario,
  submitResolverScenario,
  type PackageExecutionIdentity,
  type ScenarioExecution,
  type ScenarioProposal,
} from "./scenario-execution.js";
import { selectedRepositoryPackage } from "./selected-package.js";
import type { PackageSummary } from "./repository-contract.js";

const executeFile = promisify(execFile);
const leaseRelativePath = ".lifecycle/work/active-assignment.json";

interface RepositoryFingerprint {
  head: string;
  trackedState: string;
}

interface AssignmentBinding {
  invocation: number;
  inputs: {
    name: string;
    values: string[];
  }[];
}

interface AssignmentLease {
  contract: "mdlm-assignment-lease@1";
  id: string;
  disposition: "active";
  package: PackageExecutionIdentity;
  repository: RepositoryFingerprint;
  phase: string;
  obligation: {
    instance: string;
    definition: string;
    subject: string;
  } | null;
  progression: {
    instance: string;
    nextPhase: string;
    subjects: string[];
  } | null;
  scenario: string;
  bindings: AssignmentBinding[];
  participation: NonNullable<ScenarioDryRun["participation"]>;
  retryAvailability: {
    malformedResponseCorrection: 1;
  };
}

interface OperatorOutcomeBase {
  package: PackageSummary;
  contract: "mdlm-next@1";
  phase: string;
}

export type OperatorOutcome =
  | OperatorOutcomeBase & {
      outcome: "assignment";
      assignment: { id: string };
    }
  | OperatorOutcomeBase & {
      outcome: "attention-required";
      assignment: { id: string };
      authorityRequirement: NonNullable<ScenarioDryRun["participation"]>[number]["authorityRequirement"];
      attentionSchedule: NonNullable<ScenarioDryRun["participation"]>[number]["attentionSchedule"];
      explanation: string;
    }
  | OperatorOutcomeBase & {
      outcome: "profile-boundary-reached";
      explanation: string;
      omittedCoverage: {
        profile: string[];
        phase: string[];
      };
      evidence: Extract<OperatorOutcomeClassification, {
        kind: "profile-boundary-reached";
      }>["evidence"];
    }
  | OperatorOutcomeBase & {
      outcome: "lifecycle-complete";
      explanation: string;
      evidence: Extract<OperatorOutcomeClassification, {
        kind: "lifecycle-complete";
      }>["evidence"];
    }
  | OperatorOutcomeBase & {
      outcome: "process-dead-end";
      explanation: string;
      blockers: Extract<OperatorOutcomeClassification, { kind: "process-dead-end" }>["blockers"];
    };

export type AssignmentOutcome = OperatorOutcome;

export interface OperatorStatus {
  contract: "mdlm-status@1";
  package: PackageSummary;
  profile: {
    reference: string;
    status: string;
    description: string;
  };
  integrity: { status: "valid"; diagnostics: [] };
  activePhase: {
    reference: string;
    name: string;
    purpose: string;
    coverage: string;
  };
  omittedCoverage: {
    profile: string[];
    phase: string[];
  };
  recentTransaction:
    | { available: false }
    | {
        available: true;
        id: string;
        status: string;
        scenario: string;
      };
  unresolvedWork: {
    total: number;
    dispatchable: number;
    byStatus: Record<string, number>;
  };
  currentOutcome:
    | {
        outcome: "assignment";
        assignment: { allocation: "active"; id: string } | { allocation: "not-allocated" };
      }
    | {
        outcome: "attention-required";
        assignment: { allocation: "active"; id: string } | { allocation: "not-allocated" };
        authorityRequirement: NonNullable<ScenarioDryRun["participation"]>[number]["authorityRequirement"];
        attentionSchedule: NonNullable<ScenarioDryRun["participation"]>[number]["attentionSchedule"];
        explanation: string;
      }
    | {
        outcome: "profile-boundary-reached";
        explanation: string;
        omittedCoverage: {
          profile: string[];
          phase: string[];
        };
        evidence: Extract<OperatorOutcomeClassification, {
          kind: "profile-boundary-reached";
        }>["evidence"];
      }
    | {
        outcome: "lifecycle-complete";
        explanation: string;
        evidence: Extract<OperatorOutcomeClassification, {
          kind: "lifecycle-complete";
        }>["evidence"];
      }
    | {
        outcome: "process-dead-end";
        explanation: string;
        blockers: Extract<OperatorOutcomeClassification, { kind: "process-dead-end" }>["blockers"];
      };
  drillDownCommands: string[];
}

export interface AssignmentSubmission extends ScenarioExecution {
  contract: "mdlm-scenario-execution@4";
}

export interface AssignmentPacket {
  contract: "mdlm-assignment-packet@1";
  assignment: { id: string };
  package: PackageExecutionIdentity;
  repository: RepositoryFingerprint;
  phase: string;
  obligation: AssignmentLease["obligation"];
  progression?: NonNullable<AssignmentLease["progression"]>;
  scenario: {
    reference: string;
    definition: { id: string; version: number };
  };
  prompt: ScenarioDryRun["prompt"];
  assets: Array<Omit<ScenarioDryRun["prompt"], "skills">>;
  exactInputs: ScenarioDryRunInvocation[];
  allowedProjections: {
    exactLifecycleData: string[];
    outputSchemas: {
      type: string;
      envelope: Record<string, unknown>;
      payload: Record<string, unknown>;
      outgoingLinks: Record<string, unknown>[];
    }[];
  };
  policies: ScenarioDryRun["policies"];
  participation: NonNullable<ScenarioDryRun["participation"]>;
  authority: {
    evidence: ReturnType<typeof authorityEvidenceContract> | null;
    requirements: {
      invocation: number;
      policy: string;
      authorityRequirement: NonNullable<ScenarioDryRun["participation"]>[number]["authorityRequirement"];
      attentionSchedule: NonNullable<ScenarioDryRun["participation"]>[number]["attentionSchedule"];
    }[];
    standingDelegation: ScenarioDryRun["standingDelegation"] | null;
  };
  prohibitions: string[];
  outputs: ScenarioDryRun["expectedOutputs"];
  outputLinks: {
    output: string;
    requiredLinks: ScenarioDryRun["expectedOutputs"][number]["requiredLinks"];
  }[];
  completion: ScenarioDryRun["completion"];
  responseSchema: Record<string, unknown>;
}

type AssignmentResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

interface ExactAssignment {
  summary: PackageSummary;
  processPackage: ProcessPackage;
  lease: Omit<AssignmentLease, "id">;
  dryRun: ScenarioDryRun;
  scenario: VersionedDefinition;
  classification: Extract<OperatorOutcomeClassification, {
    kind: "assignment" | "attention-required";
  }>;
}

interface ExactOperatorState {
  summary: PackageSummary;
  processPackage: ProcessPackage;
  evaluation: LifecycleEvaluation;
  fingerprint: RepositoryFingerprint;
  classification: OperatorOutcomeClassification;
  assignment?: ExactAssignment;
}

function failure(code: string, message: string, pathValue?: string): AssignmentResult<never> {
  return {
    ok: false,
    diagnostics: [{
      code,
      message,
      ...(pathValue === undefined ? {} : { path: pathValue }),
    }],
  };
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GIT_")) delete environment[name];
  }
  return environment;
}

async function git(repositoryRoot: string, arguments_: string[]): Promise<string> {
  const result = await executeFile("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer: 20 * 1024 * 1024,
  });
  return result.stdout;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function repositoryFingerprint(
  repositoryRoot: string,
): Promise<AssignmentResult<RepositoryFingerprint>> {
  try {
    const [headSource, stagedDiff, worktreeDiff] = await Promise.all([
      git(repositoryRoot, ["rev-parse", "HEAD"]),
      git(repositoryRoot, [
        "diff",
        "--binary",
        "--no-ext-diff",
        "--cached",
        "HEAD",
        "--",
      ]),
      git(repositoryRoot, [
        "diff",
        "--binary",
        "--no-ext-diff",
        "--",
      ]),
    ]);
    const head = headSource.trim();
    return {
      ok: true,
      value: {
        head,
        trackedState: sha256(
          `${head}\0staged\0${stagedDiff}\0worktree\0${worktreeDiff}`,
        ),
      },
      diagnostics: [],
    };
  } catch (error) {
    return failure(
      "assignment-repository-fingerprint-failed",
      `Could not fingerprint the tracked Git repository state: ${error instanceof Error ? error.message : String(error)}`,
      repositoryRoot,
    );
  }
}

function leasePath(repositoryRoot: string): string {
  return path.join(repositoryRoot, leaseRelativePath);
}

async function writeLease(
  repositoryRoot: string,
  lease: AssignmentLease,
): Promise<void> {
  const target = leasePath(repositoryRoot);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(lease, null, 2)}\n`);
  await fs.rename(temporary, target);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function assignmentLease(value: unknown): AssignmentLease | undefined {
  const lease = object(value);
  const packageValue = object(lease?.package);
  const repository = object(lease?.repository);
  const obligation = object(lease?.obligation);
  const progression = object(lease?.progression);
  const retry = object(lease?.retryAvailability);
  const parsedObligation = typeof obligation?.instance === "string"
    ? parseObligationInstanceIdentity(obligation.instance)
    : undefined;
  const obligationValid = obligation !== undefined && progression === undefined &&
    typeof obligation.instance === "string" &&
    typeof obligation.definition === "string" &&
    obligation.definition === parsedObligation?.obligationReference &&
    typeof obligation.subject === "string" &&
    obligation.subject === parsedObligation?.subject.identity;
  const progressionValid = obligation === undefined && progression !== undefined &&
    typeof progression.instance === "string" &&
    progression.instance.startsWith("phase-progression:") &&
    typeof progression.nextPhase === "string" && progression.nextPhase.length > 0 &&
    Array.isArray(progression.subjects) && progression.subjects.length > 0 &&
    progression.subjects.every((subject) => typeof subject === "string");
  return lease?.contract === "mdlm-assignment-lease@1" &&
      typeof lease.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lease.id) &&
      lease.disposition === "active" &&
      typeof packageValue?.reference === "string" && packageValue.reference.length > 0 &&
      typeof packageValue.digest === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(packageValue.digest) &&
      typeof packageValue.language === "string" && packageValue.language.length > 0 &&
      typeof repository?.head === "string" &&
      /^[0-9a-f]{40}$/.test(repository.head) &&
      typeof repository.trackedState === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(repository.trackedState) &&
      typeof lease.phase === "string" && lease.phase.length > 0 &&
      (obligationValid || progressionValid) &&
      typeof lease.scenario === "string" && lease.scenario.length > 0 &&
      Array.isArray(lease.bindings) &&
      Array.isArray(lease.participation) &&
      retry?.malformedResponseCorrection === 1
    ? lease as unknown as AssignmentLease
    : undefined;
}

async function readLease(
  repositoryRoot: string,
): Promise<AssignmentResult<AssignmentLease | undefined>> {
  const target = leasePath(repositoryRoot);
  let source: string;
  try {
    source = await fs.readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, value: undefined, diagnostics: [] };
    }
    return failure(
      "assignment-lease-read-failed",
      `Could not read the Assignment lease: ${error instanceof Error ? error.message : String(error)}`,
      target,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return failure(
      "assignment-lease-invalid",
      "The active Assignment lease is not valid JSON",
      target,
    );
  }
  const lease = assignmentLease(value);
  return lease
    ? { ok: true, value: lease, diagnostics: [] }
    : failure(
        "assignment-lease-invalid",
        "The active Assignment lease does not satisfy mdlm-assignment-lease@1",
        target,
      );
}

function exactEntityId(value: ScenarioDryRunInvocation["inputs"][number]["values"][number]): string {
  return value.identity.revision_id ?? value.identity.id;
}

function bindings(invocations: ScenarioDryRunInvocation[]): AssignmentBinding[] {
  return invocations.map((invocation, invocationIndex) => ({
    invocation: invocationIndex,
    inputs: invocation.inputs.map((input) => ({
      name: input.name,
      values: input.values.map(exactEntityId),
    })),
  }));
}

function packageIdentity(identity: PackageSummary): PackageExecutionIdentity {
  return {
    reference: identity.reference,
    digest: identity.digest,
    language: identity.language,
  };
}

function obligationDefinition(instance: ObligationEvaluation): string {
  return parseObligationInstanceIdentity(instance.id)?.obligationReference ??
    instance.obligation;
}

function definition(
  catalog: Record<string, VersionedDefinition>,
  reference: string,
): VersionedDefinition | undefined {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  const candidate = match?.[1] ? catalog[match[1]] : undefined;
  return candidate?.version === Number(match?.[2]) ? candidate : undefined;
}

function unversioned(reference: string): string | undefined {
  return /^(.*)@[1-9][0-9]*$/.exec(reference)?.[1];
}

function phaseReference(evaluation: LifecycleEvaluation): string {
  const phase = evaluation.phase;
  return phase ? `${phase.id}@${phase.version}` : "";
}

function operatorWork(evaluation: LifecycleEvaluation): OperatorWorkFacts[] {
  const phase = phaseReference(evaluation);
  const obligations = evaluation.looseEnds.map((item) => ({
    kind: "obligation" as const,
    phase,
    instance: item.id,
    definition: obligationDefinition(item),
    subject: item.subject,
    scenario: item.actionableResolver ?? item.eventualResolver,
    dispatchable: item.dispatchable,
    authorityRequirements: (item.participation ?? []).map((participation) => ({
      policy: participation.policy,
      authorityRequirement: participation.authorityRequirement,
      attentionSchedule: participation.attentionSchedule,
    })),
    explanation: item.explanation,
    status: item.status,
    blockedBy: item.blockedBy,
    blockerChains: item.blockerChains,
    unresolvedBindings: item.unresolvedBindings,
  }));
  const progression = nextWorkProjection(evaluation)?.item;
  if (!progression || !("kind" in progression)) return obligations;
  const subjects = progression.subjects.map(
    (subject) => subject.identity.revision_id,
  );
  return [
    ...obligations,
    {
      kind: "phase-progression",
      phase,
      instance: progression.id,
      definition: "phase-progression",
      subject: subjects[0] ?? phase,
      scenario: progression.scenario,
      dispatchable: progression.dispatchable,
      authorityRequirements: [{
        policy: progression.authority.policy,
        authorityRequirement: progression.authority.authorityRequirement,
        attentionSchedule: progression.authority.attentionSchedule,
      }],
      explanation: progression.explanation,
      status: progression.status,
      blockedBy: [],
      blockerChains: [],
      unresolvedBindings: progression.dispatchable
        ? []
        : ["progression.authorization.subjects"],
      progression: {
        nextPhase: progression.nextPhase,
        subjects,
      },
    },
  ];
}

function progressionRequestedInputs(
  scenario: VersionedDefinition,
  work: OperatorWorkFacts,
): AssignmentResult<{ name: string; value: string }[]> {
  const subjects = work.progression?.subjects ?? [];
  const inputs = Array.isArray(scenario.inputs)
    ? scenario.inputs.flatMap((value) => {
        const input = object(value);
        return typeof input?.name === "string" ? [input] : [];
      })
    : [];
  const input = inputs[0];
  if (inputs.length !== 1 || !input || subjects.length === 0) {
    return failure(
      "phase-progression-inputs-invalid",
      `Phase progression Scenario '${work.scenario}' must bind its declared authorization subjects to one Scenario input`,
      work.scenario,
    );
  }
  const cardinality = typeof input.cardinality === "string"
    ? input.cardinality
    : "";
  const values = ["one", "zero-or-one"].includes(cardinality)
    ? subjects.slice(0, 1)
    : subjects;
  return {
    ok: true,
    value: [{ name: input.name as string, value: values.join(",") }],
    diagnostics: [],
  };
}

async function exactOperatorState(
  repositoryRoot: string,
): Promise<AssignmentResult<ExactOperatorState>> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) return { ok: false, diagnostics: selected.diagnostics };
  const firstPhase = initialPhaseId(selected.processPackage);
  if (!firstPhase) {
    return failure("phase-required", "The selected Process Package declares no Phase");
  }
  const processReference = `${selected.summary.reference}#${selected.summary.digest}`;
  const [loaded, fingerprint, baselines] = await Promise.all([
    repositoryLifecycleSnapshot(
      repositoryRoot,
      selected.processPackage,
      processReference,
      firstPhase,
    ),
    repositoryFingerprint(repositoryRoot),
    verifyRepositoryBaselines(
      repositoryRoot,
      selected.processPackage,
      processReference,
    ),
  ]);
  if (!loaded.ok) return loaded;
  if (!fingerprint.ok) return fingerprint;
  if (!baselines.ok) return baselines;
  const evaluation = activeLifecycleEvaluation(
    selected.processPackage,
    loaded.value,
  );
  if (evaluation.diagnostics.length > 0) {
    return { ok: false, diagnostics: evaluation.diagnostics };
  }
  const classification = classifyOperatorOutcome(
    operatorWork(evaluation),
    evaluation.terminalOutcome,
  );
  const state: ExactOperatorState = {
    summary: selected.summary,
    processPackage: selected.processPackage,
    evaluation,
    fingerprint: fingerprint.value,
    classification,
  };
  if (
    classification.kind !== "assignment" &&
    classification.kind !== "attention-required"
  ) {
    return { ok: true, value: state, diagnostics: [] };
  }

  const work = classification.work;
  const item = work.kind === "obligation"
    ? evaluation.looseEnds.find((candidate) => candidate.id === work.instance)
    : undefined;
  const scenarioReference = work.scenario;
  const scenario = definition(selected.processPackage.scenarios, scenarioReference);
  const phaseId = unversioned(work.phase);
  if (!scenario || !phaseId || (work.kind === "obligation" && !item)) {
    return failure(
      "scenario-definition-unavailable",
      `Could not resolve exact Scenario '${scenarioReference}' in Phase '${work.phase}'`,
      scenarioReference,
    );
  }
  const snapshot = { ...loaded.value, phaseId };
  let prepared: Awaited<ReturnType<typeof dryRunResolverScenario>>;
  if (work.kind === "obligation" && item) {
    prepared = await dryRunResolverScenario(
      selected.processPackage,
      snapshot,
      scenarioReference,
      item.id,
      [],
    );
  } else {
    const requestedInputs = progressionRequestedInputs(scenario, work);
    if (!requestedInputs.ok) return requestedInputs;
    prepared = await dryRunExplicitScenario(
      selected.processPackage,
      snapshot,
      scenarioReference,
      requestedInputs.value,
    );
  }
  if (!prepared.ok) return prepared;
  state.assignment = {
    summary: selected.summary,
    processPackage: selected.processPackage,
    lease: {
      contract: "mdlm-assignment-lease@1",
      disposition: "active",
      package: packageIdentity(selected.summary),
      repository: fingerprint.value,
      phase: work.phase,
      obligation: item
        ? {
            instance: item.id,
            definition: obligationDefinition(item),
            subject: item.subject,
          }
        : null,
      progression: work.progression
        ? {
            instance: work.instance,
            nextPhase: work.progression.nextPhase,
            subjects: work.progression.subjects,
          }
        : null,
      scenario: scenarioReference,
      bindings: bindings(prepared.value.invocations),
      participation: prepared.value.participation ?? [],
      retryAvailability: { malformedResponseCorrection: 1 },
    },
    dryRun: prepared.value,
    scenario,
    classification,
  };
  return { ok: true, value: state, diagnostics: [] };
}

async function exactAssignment(
  repositoryRoot: string,
): Promise<AssignmentResult<ExactAssignment>> {
  const state = await exactOperatorState(repositoryRoot);
  if (!state.ok) return state;
  return state.value.assignment
    ? { ok: true, value: state.value.assignment, diagnostics: [] }
    : failure(
        "assignment-unavailable",
        "The current Operator Outcome does not contain an Assignment",
      );
}

function sameAssignment(lease: AssignmentLease, exact: ExactAssignment): boolean {
  const { id: _id, ...persisted } = lease;
  return isDeepStrictEqual(persisted, exact.lease);
}

function sameAssignmentSource(
  lease: AssignmentLease,
  exact: ExactAssignment,
): boolean {
  return isDeepStrictEqual(lease.package, exact.lease.package) &&
    isDeepStrictEqual(lease.repository, exact.lease.repository);
}

function invalidLease(repositoryRoot: string): AssignmentResult<never> {
  return failure(
    "assignment-lease-invalid",
    "The active Assignment lease does not satisfy its exact current state",
    leasePath(repositoryRoot),
  );
}

function leasedOutcome(
  exact: ExactAssignment,
  assignmentId: string,
): AssignmentOutcome {
  const base = {
    package: exact.summary,
    contract: "mdlm-next@1" as const,
    phase: exact.lease.phase,
    assignment: { id: assignmentId },
  };
  return exact.classification.kind === "attention-required"
    ? {
        ...base,
        outcome: "attention-required",
        authorityRequirement: exact.classification.authorityRequirement,
        attentionSchedule: exact.classification.attentionSchedule,
        explanation: exact.classification.explanation,
      }
    : { ...base, outcome: "assignment" };
}

/** Classify the current repository and lease its one exact Assignment when present. */
export async function leaseNextAssignment(
  repositoryRoot: string,
): Promise<AssignmentResult<AssignmentOutcome>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const state = await exactOperatorState(repositoryRoot);
  if (!state.ok) {
    if (
      persisted.value &&
      !state.diagnostics.some((item) =>
        item.code === "assignment-repository-fingerprint-failed"
      )
    ) await fs.rm(leasePath(repositoryRoot), { force: true });
    return state;
  }
  if (
    state.value.classification.kind !== "assignment" &&
    state.value.classification.kind !== "attention-required"
  ) {
    if (persisted.value) await fs.rm(leasePath(repositoryRoot), { force: true });
    const classification = state.value.classification;
    const base = {
      package: state.value.summary,
      contract: "mdlm-next@1" as const,
      phase: phaseReference(state.value.evaluation),
    };
    const value: AssignmentOutcome = classification.kind === "process-dead-end"
      ? {
          ...base,
          outcome: "process-dead-end",
          explanation: classification.explanation,
          blockers: classification.blockers,
        }
      : classification.kind === "profile-boundary-reached"
      ? {
          ...base,
          outcome: "profile-boundary-reached",
          explanation: classification.explanation,
          omittedCoverage: classification.omittedCoverage,
          evidence: classification.evidence,
        }
      : {
          ...base,
          outcome: "lifecycle-complete",
          explanation: classification.explanation,
          evidence: classification.evidence,
        };
    return { ok: true, value, diagnostics: [] };
  }
  const exact = state.value.assignment;
  if (!exact) {
    return failure(
      "assignment-unavailable",
      "The classified Operator Outcome did not prepare its exact Assignment",
    );
  }
  if (persisted.value && sameAssignment(persisted.value, exact)) {
    return {
      ok: true,
      value: leasedOutcome(exact, persisted.value.id),
      diagnostics: [],
    };
  }
  if (persisted.value && sameAssignmentSource(persisted.value, exact)) {
    return invalidLease(repositoryRoot);
  }
  const lease: AssignmentLease = {
    ...exact.lease,
    id: randomUUID(),
  };
  await writeLease(repositoryRoot, lease);
  return {
    ok: true,
    value: leasedOutcome(exact, lease.id),
    diagnostics: [],
  };
}

async function recentTransaction(
  repositoryRoot: string,
): Promise<OperatorStatus["recentTransaction"]> {
  const root = path.join(repositoryRoot, ".lifecycle/data/.transactions");
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { available: false };
    }
    throw error;
  }
  const executions = await Promise.all(entries.map(async (id) => {
    const executionPath = path.join(root, id, "execution.json");
    try {
      const [source, statistics] = await Promise.all([
        fs.readFile(executionPath, "utf8"),
        fs.stat(executionPath),
      ]);
      const execution = object(JSON.parse(source));
      const definitionValue = object(execution?.definition);
      return {
        modified: statistics.mtimeMs,
        id: typeof execution?.id === "string" ? execution.id : id,
        status: typeof execution?.status === "string"
          ? execution.status
          : "unknown",
        scenario: typeof definitionValue?.scenario === "string"
          ? definitionValue.scenario
          : "unknown",
      };
    } catch {
      return undefined;
    }
  }));
  const latest = executions.filter((value) => value !== undefined).sort(
    (left, right) =>
      right.modified - left.modified || right.id.localeCompare(left.id),
  )[0];
  return latest
    ? {
        available: true,
        id: latest.id,
        status: latest.status,
        scenario: latest.scenario,
      }
    : { available: false };
}

function statusOutcome(
  state: ExactOperatorState,
  activeLease: AssignmentLease | undefined,
): OperatorStatus["currentOutcome"] {
  const classification = state.classification;
  if (classification.kind === "process-dead-end") {
    return {
      outcome: "process-dead-end",
      explanation: classification.explanation,
      blockers: classification.blockers,
    };
  }
  if (classification.kind === "profile-boundary-reached") {
    return {
      outcome: "profile-boundary-reached",
      explanation: classification.explanation,
      omittedCoverage: classification.omittedCoverage,
      evidence: classification.evidence,
    };
  }
  if (classification.kind === "lifecycle-complete") {
    return {
      outcome: "lifecycle-complete",
      explanation: classification.explanation,
      evidence: classification.evidence,
    };
  }
  const exact = state.assignment;
  const assignment = exact && activeLease && sameAssignment(activeLease, exact)
    ? { allocation: "active" as const, id: activeLease.id }
    : { allocation: "not-allocated" as const };
  return classification.kind === "attention-required"
    ? {
        outcome: "attention-required",
        assignment,
        authorityRequirement: classification.authorityRequirement,
        attentionSchedule: classification.attentionSchedule,
        explanation: classification.explanation,
      }
    : { outcome: "assignment", assignment };
}

function selectedProfile(
  processPackage: ProcessPackage,
): AssignmentResult<VersionedDefinition> {
  const profiles = object(processPackage.manifest.profiles);
  const reference = typeof profiles?.default === "string"
    ? profiles.default
    : "";
  const profile = definition(processPackage.profiles, reference);
  return profile
    ? { ok: true, value: profile, diagnostics: [] }
    : failure(
        "profile-selection-invalid",
        `The Process Package default implementation profile '${reference || "(missing)"}' does not resolve exactly`,
        "manifest.profiles.default",
      );
}

/** Inspect current operator truth without allocating or replacing an Assignment. */
export async function inspectOperatorStatus(
  repositoryRoot: string,
): Promise<AssignmentResult<OperatorStatus>> {
  const [state, persisted, recent] = await Promise.all([
    exactOperatorState(repositoryRoot),
    readLease(repositoryRoot),
    recentTransaction(repositoryRoot),
  ]);
  if (!state.ok) return state;
  if (!persisted.ok) return persisted;
  const resolvedProfile = selectedProfile(state.value.processPackage);
  if (!resolvedProfile.ok) return resolvedProfile;
  const profile = resolvedProfile.value;
  const phase = state.value.evaluation.phase;
  const phaseDefinition = phase
    ? state.value.processPackage.phases[phase.id]
    : undefined;
  if (!phase || !phaseDefinition) {
    return failure(
      "phase-required",
      "Operator status requires one derived Active Phase",
      "phases",
    );
  }
  const disabledCapabilities = Array.isArray(profile.disabled_capabilities)
    ? profile.disabled_capabilities.filter(
      (value): value is string => typeof value === "string",
    )
    : [];
  const phaseOmissions = Array.isArray(phaseDefinition.omitted_capabilities)
    ? phaseDefinition.omitted_capabilities.filter(
      (value): value is string => typeof value === "string",
    )
    : [];
  const unresolvedWork = operatorWork(state.value.evaluation);
  const byStatus: Record<string, number> = {};
  for (const item of unresolvedWork) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }
  return {
    ok: true,
    value: {
      contract: "mdlm-status@1",
      package: state.value.summary,
      profile: {
        reference: `${profile.id}@${profile.version}`,
        status: typeof profile.status === "string" ? profile.status : "unknown",
        description: typeof profile.description === "string"
          ? profile.description
          : "",
      },
      integrity: { status: "valid", diagnostics: [] },
      activePhase: {
        reference: `${phase.id}@${phase.version}`,
        name: typeof phaseDefinition.name === "string"
          ? phaseDefinition.name
          : phase.id,
        purpose: typeof phaseDefinition.purpose === "string"
          ? phaseDefinition.purpose
          : "",
        coverage: typeof phaseDefinition.coverage === "string"
          ? phaseDefinition.coverage
          : "",
      },
      omittedCoverage: {
        profile: disabledCapabilities,
        phase: phaseOmissions,
      },
      recentTransaction: recent,
      unresolvedWork: {
        total: unresolvedWork.length,
        dispatchable: unresolvedWork.filter((item) => item.dispatchable).length,
        byStatus: Object.fromEntries(
          Object.entries(byStatus).sort(([left], [right]) =>
            left.localeCompare(right)
          ),
        ),
      },
      currentOutcome: statusOutcome(state.value, persisted.value),
      drillDownCommands: [
        "mdlm next",
        "mdlm loose-ends --json",
        `mdlm phase status ${phase.id} --json`,
        "mdlm doctor --json",
        "mdlm process show --json",
      ],
    },
    diagnostics: [],
  };
}

function responseSchema(): Record<string, unknown> {
  const diagnostic = {
    type: "object",
    additionalProperties: false,
    required: ["code", "message"],
    properties: {
      code: { type: "string", minLength: 1 },
      message: { type: "string", minLength: 1 },
      path: { type: "string" },
    },
  };
  const lifecycleDatum = {
    type: "object",
    additionalProperties: false,
    required: ["type", "payload", "links", "body"],
    properties: {
      id: {
        type: "string",
        description: "Existing Stable Datum identity for a same-lineage replacement; omit for a new Stable Datum",
      },
      type: { type: "string", pattern: "^[A-Z]{3,8}$" },
      payload: { type: "object" },
      links: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "target"],
          properties: {
            type: { type: "string" },
            target: { type: "string" },
          },
        },
      },
      body: { type: "string" },
    },
  };
  const common = {
    contract: { const: "mdlm-assignment-response@1" },
    assignment: { type: "string", minLength: 1 },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://mdlm.dev/contracts/mdlm-assignment-response@1",
    title: "MDLM Assignment Response",
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["contract", "assignment", "kind", "proposal"],
        properties: {
          ...common,
          kind: { const: "proposal" },
          proposal: {
            type: "object",
            additionalProperties: false,
            required: [
              "outputs",
              "completionEvidence",
              "loadedSkillRefs",
              "authoritySupplies",
              "standingDelegations",
            ],
            properties: {
              outputs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["localId", "name", "invocation", "lifecycleDatum"],
                  properties: {
                    localId: {
                      type: "string",
                      pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
                      description: "Proposal-local identity used by $proposal.<localId>.id and $proposal.<localId>.revision_id references",
                    },
                    name: { type: "string" },
                    invocation: { type: "integer", minimum: 0 },
                    lifecycleDatum,
                  },
                },
              },
              completionEvidence: {},
              loadedSkillRefs: {
                type: "array",
                items: { type: "string", minLength: 1 },
                uniqueItems: true,
              },
              authoritySupplies: {
                type: "array",
                items: { type: "string" },
                uniqueItems: true,
              },
              standingDelegations: {
                type: "array",
                items: { type: "string" },
                uniqueItems: true,
              },
            },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["contract", "assignment", "kind", "unable"],
        properties: {
          ...common,
          kind: { const: "unable" },
          unable: {
            type: "object",
            additionalProperties: false,
            required: ["reason", "diagnostics"],
            properties: {
              reason: {
                enum: [
                  "stale-scope",
                  "insufficient-declared-inputs",
                  "prohibited-input-conflict",
                  "ambiguity",
                  "execution-failure",
                ],
              },
              diagnostics: { type: "array", items: diagnostic },
            },
          },
        },
      },
    ],
  };
}

interface ProposalAssignmentResponse {
  contract: "mdlm-assignment-response@1";
  assignment: string;
  kind: "proposal";
  proposal: ScenarioProposal & {
    loadedSkillRefs: string[];
    authoritySupplies: string[];
    standingDelegations: string[];
  };
}

const validateAssignmentResponse = new Ajv2020({ allErrors: true, strict: false })
  .compile(responseSchema());

function responseDiagnostics(errors: ErrorObject[] | null | undefined): ProcessDiagnostic[] {
  return (errors ?? []).map((error) => ({
    code: "assignment-response-invalid",
    path: error.instancePath.length > 0 ? `response${error.instancePath}` : "response",
    message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  }));
}

function parseAssignmentResponse(
  source: string,
): AssignmentResult<ProposalAssignmentResponse> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return failure(
      "assignment-response-invalid",
      `Assignment Response must contain one JSON value: ${error instanceof Error ? error.message : String(error)}`,
      "response",
    );
  }
  if (!validateAssignmentResponse(value)) {
    return {
      ok: false,
      diagnostics: responseDiagnostics(validateAssignmentResponse.errors),
    };
  }
  const response = value as Record<string, unknown>;
  if (response.kind !== "proposal") {
    return failure(
      "assignment-response-kind-unsupported",
      "This implementation boundary accepts Scenario Proposals; typed inability is handled separately",
      "response.kind",
    );
  }
  return {
    ok: true,
    value: value as ProposalAssignmentResponse,
    diagnostics: [],
  };
}

function outputSchemas(
  processPackage: ProcessPackage,
  dryRun: ScenarioDryRun,
): AssignmentPacket["allowedProjections"]["outputSchemas"] {
  const types = [...new Set(
    dryRun.expectedOutputs.flatMap((output) => output.types),
  )].sort();
  return types.flatMap((type) => {
    const resolved = resolveType(processPackage, type);
    return resolved.ok
      ? [{
          type,
          envelope: resolved.type.envelopeSchema,
          payload: resolved.type.payloadSchema,
          outgoingLinks: resolved.type.outgoingLinks,
        }]
      : [];
  });
}

function exactLifecycleData(dryRun: ScenarioDryRun): string[] {
  return [...new Set(dryRun.invocations.flatMap((invocation) =>
    invocation.inputs.flatMap((input) => input.values.map(exactEntityId))
  ))].sort();
}

function packet(
  exact: ExactAssignment,
  lease: AssignmentLease,
): AssignmentPacket {
  const participation = exact.dryRun.participation ?? [];
  return {
    contract: "mdlm-assignment-packet@1",
    assignment: { id: lease.id },
    package: exact.lease.package,
    repository: exact.lease.repository,
    phase: exact.lease.phase,
    obligation: exact.lease.obligation,
    ...(exact.lease.progression
      ? { progression: exact.lease.progression }
      : {}),
    scenario: {
      reference: exact.lease.scenario,
      definition: { id: exact.scenario.id, version: exact.scenario.version },
    },
    prompt: exact.dryRun.prompt,
    assets: [
      {
        reference: exact.dryRun.prompt.reference,
        path: exact.dryRun.prompt.path,
        digest: exact.dryRun.prompt.digest,
        content: exact.dryRun.prompt.content,
      },
      ...exact.dryRun.prompt.skills,
    ],
    exactInputs: exact.dryRun.invocations,
    allowedProjections: {
      exactLifecycleData: exactLifecycleData(exact.dryRun),
      outputSchemas: outputSchemas(exact.processPackage, exact.dryRun),
    },
    policies: exact.dryRun.policies,
    participation,
    authority: {
      evidence: authorityEvidenceContract(exact.scenario.authority_evidence) ?? null,
      requirements: participation.flatMap((value, invocation) =>
        value.authorityRequirement.mode === "autonomous"
          ? []
          : [{
              invocation,
              policy: value.policy,
              authorityRequirement: value.authorityRequirement,
              attentionSchedule: value.attentionSchedule,
            }]
      ),
      standingDelegation: exact.dryRun.standingDelegation ?? null,
    },
    prohibitions: exact.dryRun.prohibitedInputs,
    outputs: exact.dryRun.expectedOutputs,
    outputLinks: exact.dryRun.expectedOutputs.map((output) => ({
      output: output.name,
      requiredLinks: output.requiredLinks,
    })),
    completion: exact.dryRun.completion,
    responseSchema: responseSchema(),
  };
}

/** Revalidate and atomically publish one complete Scenario Proposal. */
export async function submitAssignmentResponse(
  repositoryRoot: string,
  responseSource: string,
): Promise<AssignmentResult<AssignmentSubmission>> {
  const parsed = parseAssignmentResponse(responseSource);
  if (!parsed.ok) return parsed;
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.id !== parsed.value.assignment) {
    return failure(
      "assignment-unavailable",
      `Assignment '${parsed.value.assignment}' is not the active Assignment`,
      parsed.value.assignment,
    );
  }
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok || !sameAssignment(lease, exact.value)) {
    return failure(
      "assignment-stale",
      `Assignment '${lease.id}' no longer matches the current exact repository state; submit will not rebase it`,
      lease.id,
    );
  }
  const proposal = parsed.value.proposal;
  const submission = {
    scenarioReference: exact.value.lease.scenario,
    proposal: {
      outputs: proposal.outputs,
      completionEvidence: proposal.completionEvidence,
    },
    assignment: lease.id,
    responseDigest: sha256(responseSource),
    suppliedAuthorities: proposal.authoritySupplies,
    suppliedDelegations: proposal.standingDelegations,
    loadedSkillRefs: proposal.loadedSkillRefs,
  };
  const submitted = exact.value.lease.obligation
    ? await submitResolverScenario(
        repositoryRoot,
        exact.value.processPackage,
        exact.value.lease.package,
        {
          ...submission,
          obligationInstance: exact.value.lease.obligation.instance,
        },
      )
    : await submitExplicitScenario(
        repositoryRoot,
        exact.value.processPackage,
        exact.value.lease.package,
        {
          ...submission,
          requestedInputs: exact.value.lease.bindings.flatMap((invocation) =>
            invocation.inputs.map((input) => ({
              name: input.name,
              value: input.values.join(","),
            }))
          ),
        },
      );
  if (!submitted.ok) return submitted;
  await fs.rm(leasePath(repositoryRoot), { force: true });
  return {
    ok: true,
    value: submitted.value as AssignmentSubmission,
    diagnostics: [],
  };
}

/** Revalidate one active exact Assignment and expand its harness-neutral packet. */
export async function prepareAssignment(
  repositoryRoot: string,
  assignmentId: string,
): Promise<AssignmentResult<AssignmentPacket>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.id !== assignmentId) {
    return failure(
      "assignment-unavailable",
      `Assignment '${assignmentId}' is not the active Assignment`,
      assignmentId,
    );
  }
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok) {
    if (exact.diagnostics.some((item) =>
      item.code === "assignment-repository-fingerprint-failed"
    )) return exact;
    await fs.rm(leasePath(repositoryRoot), { force: true });
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer matches the current exact repository state; prepare will not rebase it`,
      assignmentId,
    );
  }
  if (!sameAssignment(lease, exact.value)) {
    if (sameAssignmentSource(lease, exact.value)) {
      return invalidLease(repositoryRoot);
    }
    await fs.rm(leasePath(repositoryRoot), { force: true });
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer matches the current exact repository state; prepare will not rebase it`,
      assignmentId,
    );
  }
  return {
    ok: true,
    value: packet(exact.value, lease),
    diagnostics: [],
  };
}
