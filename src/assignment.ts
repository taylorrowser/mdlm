import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { repositoryGitEnvironment } from "./git-environment.js";
import type {
  LifecycleEvaluation,
  LifecycleRecord,
  LifecycleSnapshot,
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
import { selectedImplementationProfile } from "./implementation-profile.js";
import {
  loadRepositoryInspection,
  type RepositoryInspection,
  type RepositoryTransaction,
} from "./repository-inspection.js";
import { measure } from "./performance-diagnostics.js";
import {
  classifyOperatorOutcome,
  type CheckpointConversation,
  type OperatorOutcomeClassification,
  type OperatorWorkFacts,
} from "./operator-outcome.js";
import { parseObligationInstanceIdentity } from "./obligation-instance.js";
import { authorityEvidenceContract } from "./participation.js";
import { resolveType } from "./index.js";
import {
  dryRunExplicitScenario,
  dryRunResolverScenario,
  type ScenarioBoundEntity,
  type ScenarioDryRun,
  type ScenarioDryRunInvocation,
} from "./scenario-dry-run.js";
import {
  submitPreparedExplicitScenario,
  submitPreparedResolverScenario,
  type PackageExecutionIdentity,
  type PreparedScenarioSubmission,
  type ScenarioExecution,
  type ScenarioProposal,
} from "./scenario-execution.js";
import { selectedRepositoryPackage } from "./selected-package.js";
import type { PackageSummary } from "./repository-contract.js";
import { withRepositoryLock } from "./repository-lock.js";

const executeFile = promisify(execFile);
const leaseRelativePath = ".lifecycle/work/active-assignment.json";
// Every lease writer takes this lock. The first response to acquire it owns the
// Assignment outcome; a valid proposal retains ownership through publication
// and lease retirement. Waiters reread the exact lease and return unavailable.
// Valid proposals acquire the publication lock only while holding this lock.
const leaseLockRef = "refs/mdlm/assignment-lease-lock";
const unableReasonCategories = [
  "stale-scope",
  "insufficient-declared-inputs",
  "prohibited-input-conflict",
  "ambiguity",
  "execution-failure",
] as const;
type UnableReason = typeof unableReasonCategories[number];

export interface RepositoryFingerprint {
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

interface MalformedAssignmentResponse {
  digest: string;
  diagnostics: ProcessDiagnostic[];
}

interface AssignmentLease {
  contract: "mdlm-assignment-lease@1";
  id: string;
  disposition: "active" | "abandoned" | "exhausted" | "stale";
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
    malformedResponseCorrection: 0 | 1;
  };
  malformedResponses: MalformedAssignmentResponse[];
  response?: {
    kind: "unable";
    digest: string;
    unable: UnableAssignmentResponse["unable"];
  };
  terminalDiagnostics?: ProcessDiagnostic[];
}

export type AssignmentState = {
  contract: "mdlm-assignment-state@1";
  assignment: { id: string };
} & (
  | { selected: false }
  | {
      selected: true;
      package: PackageExecutionIdentity;
      repository: RepositoryFingerprint;
      scenarioReference: string;
      disposition: AssignmentLease["disposition"];
      retryAvailability: AssignmentLease["retryAvailability"];
      malformedResponses: MalformedAssignmentResponse[];
      response?: AssignmentLease["response"];
      terminalDiagnostics?: ProcessDiagnostic[];
    }
);

interface OperatorOutcomeBase {
  package: PackageSummary;
  contract: "mdlm-next@1";
  phase: string;
  materializedExecutions: {
    id: string;
    scenario: string;
    status: "completed";
  }[];
}

export interface AttentionContext {
  invocations: {
    inputs: { name: string; values: ScenarioBoundEntity[] }[];
  }[];
}

export type OperatorOutcome =
  | OperatorOutcomeBase & {
      outcome: "publication-required";
    }
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
      attentionContext: AttentionContext;
      checkpointConversation?: CheckpointConversation;
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
        assignment: { allocation: "active"; id: string } | {
          allocation: "not-allocated";
          id?: string;
        };
      }
    | {
        outcome: "attention-required";
        assignment: { allocation: "active"; id: string } | {
          allocation: "not-allocated";
          id?: string;
        };
        authorityRequirement: NonNullable<ScenarioDryRun["participation"]>[number]["authorityRequirement"];
        attentionSchedule: NonNullable<ScenarioDryRun["participation"]>[number]["attentionSchedule"];
        explanation: string;
        attentionContext: AttentionContext;
        checkpointConversation?: CheckpointConversation;
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

export type AssignmentDisposition =
  | {
      contract: "mdlm-assignment-disposition@1";
      assignment: { id: string };
      disposition: "abandoned";
      orchestration: { action: "stop"; automaticReplacement: false };
      unable: UnableAssignmentResponse["unable"];
    }
  | {
      contract: "mdlm-assignment-disposition@1";
      assignment: { id: string };
      disposition: "correction-required";
      orchestration: {
        action: "correct-response";
        automaticReplacement: false;
      };
      malformedResponse: {
        attempt: number;
        correctionsRemaining: 1;
        diagnostics: ProcessDiagnostic[];
      };
    }
  | {
      contract: "mdlm-assignment-disposition@1";
      assignment: { id: string };
      disposition: "exhausted";
      orchestration: { action: "stop"; automaticReplacement: false };
      malformedResponse: {
        attempt: number;
        correctionsRemaining: 0;
        diagnostics: ProcessDiagnostic[];
      };
    }
  | {
      contract: "mdlm-assignment-disposition@1";
      assignment: { id: string };
      disposition: "stale";
      orchestration: { action: "stop"; automaticReplacement: false };
    };

export interface AssignmentPacket {
  contract: "mdlm-assignment-packet@3";
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
  exactInputs: ScenarioDryRunInvocation[];
  allowedProjections: {
    exactLifecycleData: string[];
    exactLifecycleDataDigests: Record<string, string>;
    inputSchemas: {
      type: string;
      envelope: Record<string, unknown>;
      payload: Record<string, unknown>;
      outgoingLinks: Record<string, unknown>[];
    }[];
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
  responseSkeleton?: AssignmentResponseSkeleton;
  checkpointConversation?: CheckpointConversation;
}

export interface AssignmentResponseSkeleton {
  contract: "mdlm-assignment-response@1";
  assignment: string;
  kind: "proposal";
  proposal: {
    outputs: {
      localId: string;
      name: string;
      invocation: 0;
      lifecycleDatum: {
        type: string;
        payload: null;
        links: { type: string; target: string }[];
        body: null;
      };
    }[];
    completionEvidence: null;
    loadedSkillRefs: null;
    authoritySupplies: null;
    standingDelegations: null;
  };
}

type AssignmentResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

type AssignmentSubmissionResult =
  | {
      ok: true;
      value: AssignmentSubmission | AssignmentDisposition;
      diagnostics: [];
    }
  | {
      ok: false;
      disposition?: AssignmentDisposition;
      diagnostics: ProcessDiagnostic[];
    };

interface ExactAssignment {
  summary: PackageSummary;
  processPackage: ProcessPackage;
  inspection: RepositoryInspection;
  transaction: RepositoryTransaction;
  snapshot: LifecycleSnapshot;
  evaluation: LifecycleEvaluation;
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
  inspection: RepositoryInspection;
  transaction: RepositoryTransaction;
  snapshot: LifecycleSnapshot;
  evaluation: LifecycleEvaluation;
  fingerprint: RepositoryFingerprint;
  work: OperatorWorkFacts[];
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

async function git(repositoryRoot: string, arguments_: string[]): Promise<string> {
  const result = await executeFile("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...repositoryGitEnvironment(), GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 20 * 1024 * 1024,
  });
  return result.stdout;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export async function repositoryFingerprint(
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

async function confirmRepositoryFingerprint(
  repositoryRoot: string,
  expected: RepositoryFingerprint,
): Promise<AssignmentResult<RepositoryFingerprint>> {
  const current = await repositoryFingerprint(repositoryRoot);
  if (!current.ok) return current;
  if (!isDeepStrictEqual(current.value, expected)) {
    return failure(
      "assignment-repository-changed-during-inspection",
      "The tracked repository changed while MDLM prepared its verified command snapshot",
      repositoryRoot,
    );
  }
  return current;
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
  const malformedResponses = Array.isArray(lease?.malformedResponses)
    ? lease.malformedResponses
    : undefined;
  const validDiagnostic = (value: unknown): boolean => {
    const diagnostic = object(value);
    return typeof diagnostic?.code === "string" &&
      typeof diagnostic.message === "string" &&
      (diagnostic.path === undefined || typeof diagnostic.path === "string");
  };
  const malformedResponsesValid = malformedResponses?.every((value) => {
    const malformed = object(value);
    return typeof malformed?.digest === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(malformed.digest) &&
      Array.isArray(malformed.diagnostics) &&
      malformed.diagnostics.every(validDiagnostic);
  }) ?? false;
  const response = object(lease?.response);
  const unable = object(response?.unable);
  const unableReasons = new Set<string>(unableReasonCategories);
  const unableResponseValid = response?.kind === "unable" &&
    typeof response.digest === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(response.digest) &&
    unableReasons.has(String(unable?.reason)) &&
    Array.isArray(unable?.diagnostics) &&
    unable.diagnostics.every(validDiagnostic);
  const terminalDiagnosticsValid = Array.isArray(lease?.terminalDiagnostics) &&
    lease.terminalDiagnostics.every(validDiagnostic);
  const dispositionValid = lease?.disposition === "active"
    ? response === undefined && lease.terminalDiagnostics === undefined &&
      ((retry?.malformedResponseCorrection === 1 &&
        malformedResponses?.length === 0) ||
        (retry?.malformedResponseCorrection === 0 &&
          malformedResponses?.length === 1))
    : lease?.disposition === "abandoned"
    ? unableResponseValid && retry?.malformedResponseCorrection === 0
    : lease?.disposition === "exhausted"
    ? response === undefined && terminalDiagnosticsValid &&
      retry?.malformedResponseCorrection === 0 &&
      (malformedResponses?.length ?? 0) >= 2
    : lease?.disposition === "stale"
    ? response === undefined && terminalDiagnosticsValid &&
      retry?.malformedResponseCorrection === 0
    : false;
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
      dispositionValid &&
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
      (retry?.malformedResponseCorrection === 0 ||
        retry?.malformedResponseCorrection === 1) &&
      malformedResponsesValid
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

/** Inspect one durable Assignment lease without allocating or mutating work. */
export async function inspectAssignmentState(
  repositoryRoot: string,
  assignmentId: string,
): Promise<AssignmentResult<AssignmentState>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.id !== assignmentId) {
    return {
      ok: true,
      value: {
        contract: "mdlm-assignment-state@1",
        assignment: { id: assignmentId },
        selected: false,
      },
      diagnostics: [],
    };
  }
  return {
    ok: true,
    value: {
      contract: "mdlm-assignment-state@1",
      assignment: { id: lease.id },
      selected: true,
      package: lease.package,
      repository: lease.repository,
      scenarioReference: lease.scenario,
      disposition: lease.disposition,
      retryAvailability: lease.retryAvailability,
      malformedResponses: lease.malformedResponses,
      ...(lease.response ? { response: lease.response } : {}),
      ...(lease.terminalDiagnostics
        ? { terminalDiagnostics: lease.terminalDiagnostics }
        : {}),
    },
    diagnostics: [],
  };
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

/** Project package-neutral operator work from one lifecycle evaluation and its Lifecycle Data. */
export function operatorWorkProjection(
  evaluation: LifecycleEvaluation,
  records: readonly LifecycleRecord[] = [],
): OperatorWorkFacts[] {
  const phase = phaseReference(evaluation);
  const recordsByRevision = new Map(
    records.map((record) => [record.datum.revision_id, record]),
  );
  const obligations = evaluation.looseEnds.map((item) => {
    const record = recordsByRevision.get(item.subject);
    return {
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
      ...(record
        ? {
            exactSubject: {
              identity: {
                id: record.datum.id,
                revisionId: record.datum.revision_id,
                type: record.datum.type,
                revision: record.datum.revision,
              },
              payload: record.datum.payload,
              links: record.datum.links,
              body: record.datum.body,
            },
          }
        : {}),
    };
  });
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

type AssignableClassification = Extract<OperatorOutcomeClassification, {
  kind: "assignment" | "attention-required";
}>;

interface PreparedOperatorWork {
  dryRun: ScenarioDryRun;
  item?: ObligationEvaluation;
  scenario: VersionedDefinition;
  snapshot: LifecycleSnapshot;
}

async function prepareOperatorWork(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  evaluation: LifecycleEvaluation,
  classification: AssignableClassification,
): Promise<AssignmentResult<PreparedOperatorWork>> {
  const work = classification.work;
  const item = work.kind === "obligation"
    ? evaluation.looseEnds.find((candidate) => candidate.id === work.instance)
    : undefined;
  const scenario = definition(processPackage.scenarios, work.scenario);
  const phaseId = unversioned(work.phase);
  if (!scenario || !phaseId || (work.kind === "obligation" && !item)) {
    return failure(
      "scenario-definition-unavailable",
      `Could not resolve exact Scenario '${work.scenario}' in Phase '${work.phase}'`,
      work.scenario,
    );
  }
  const phaseSnapshot = { ...snapshot, phaseId };
  if (work.kind === "obligation" && item) {
    const prepared = await dryRunResolverScenario(
      processPackage,
      phaseSnapshot,
      work.scenario,
      item.id,
      [],
      evaluation,
    );
    return prepared.ok
      ? {
        ok: true,
        value: { dryRun: prepared.value, item, scenario, snapshot: phaseSnapshot },
        diagnostics: [],
      }
      : prepared;
  }
  const requestedInputs = progressionRequestedInputs(scenario, work);
  if (!requestedInputs.ok) return requestedInputs;
  const prepared = await dryRunExplicitScenario(
    processPackage,
    phaseSnapshot,
    work.scenario,
    requestedInputs.value,
  );
  return prepared.ok
    ? {
      ok: true,
      value: { dryRun: prepared.value, scenario, snapshot: phaseSnapshot },
      diagnostics: [],
    }
    : prepared;
}

function assignmentFromPreparedWork(
  summary: PackageSummary,
  processPackage: ProcessPackage,
  inspection: RepositoryInspection,
  transaction: RepositoryTransaction,
  evaluation: LifecycleEvaluation,
  fingerprint: RepositoryFingerprint,
  classification: AssignableClassification,
  prepared: PreparedOperatorWork,
): ExactAssignment {
  const work = classification.work;
  return {
    summary,
    processPackage,
    inspection,
    transaction,
    snapshot: prepared.snapshot,
    evaluation,
    lease: {
      contract: "mdlm-assignment-lease@1",
      disposition: "active",
      package: packageIdentity(summary),
      repository: fingerprint,
      phase: work.phase,
      obligation: prepared.item
        ? {
          instance: prepared.item.id,
          definition: obligationDefinition(prepared.item),
          subject: prepared.item.subject,
        }
        : null,
      progression: work.progression
        ? {
          instance: work.instance,
          nextPhase: work.progression.nextPhase,
          subjects: work.progression.subjects,
        }
        : null,
      scenario: work.scenario,
      bindings: bindings(prepared.dryRun.invocations),
      participation: prepared.dryRun.participation ?? [],
      retryAvailability: { malformedResponseCorrection: 1 },
      malformedResponses: [],
    },
    dryRun: prepared.dryRun,
    scenario: prepared.scenario,
    classification,
  };
}

async function operatorStateFromSnapshot(
  repositoryRoot: string,
  summary: PackageSummary,
  processPackage: ProcessPackage,
  inspection: RepositoryInspection,
  transaction: RepositoryTransaction,
  snapshot: LifecycleSnapshot,
  fingerprint: RepositoryFingerprint,
): Promise<AssignmentResult<ExactOperatorState>> {
  const evaluation = measure(
    "lifecycle.evaluation",
    () => activeLifecycleEvaluation(processPackage, snapshot),
  );
  if (evaluation.diagnostics.length > 0) {
    return { ok: false, diagnostics: evaluation.diagnostics };
  }
  const workItems = operatorWorkProjection(evaluation, snapshot.records);
  const classification = classifyOperatorOutcome(
    workItems,
    evaluation.terminalOutcome,
    evaluation.phase?.attentionCheckpoints.filter((checkpoint) => checkpoint.active)
      .map((checkpoint) => checkpoint.id) ?? [],
  );
  const state: ExactOperatorState = {
    summary,
    processPackage,
    inspection,
    transaction,
    snapshot,
    evaluation,
    fingerprint,
    work: workItems,
    classification,
  };
  if (
    classification.kind === "assignment" ||
    classification.kind === "attention-required"
  ) {
    const prepared = await prepareOperatorWork(
      processPackage,
      snapshot,
      evaluation,
      classification,
    );
    if (!prepared.ok) return prepared;
    state.assignment = assignmentFromPreparedWork(
      summary,
      processPackage,
      inspection,
      transaction,
      evaluation,
      fingerprint,
      classification,
      prepared.value,
    );
  }
  const confirmed = await confirmRepositoryFingerprint(repositoryRoot, fingerprint);
  return confirmed.ok
    ? { ok: true, value: state, diagnostics: [] }
    : confirmed;
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
  const fingerprint = await repositoryFingerprint(repositoryRoot);
  if (!fingerprint.ok) return fingerprint;
  const inspection = await loadRepositoryInspection(
    repositoryRoot,
    selected.processPackage,
    processReference,
  );
  if (!inspection.ok) return inspection;
  const baselines = await inspection.value.verifyBaselines();
  if (!baselines.ok) return baselines;
  return operatorStateFromSnapshot(
    repositoryRoot,
    selected.summary,
    selected.processPackage,
    inspection.value,
    inspection.value.beginTransaction(),
    inspection.value.lifecycleSnapshot(firstPhase),
    fingerprint.value,
  );
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

function assignmentCoordinates(
  lease: AssignmentLease | Omit<AssignmentLease, "id">,
): unknown {
  const {
    id: _id,
    disposition: _disposition,
    retryAvailability: _retryAvailability,
    malformedResponses: _malformedResponses,
    response: _response,
    terminalDiagnostics: _terminalDiagnostics,
    ...coordinates
  } = lease as AssignmentLease;
  return coordinates;
}

function sameAssignment(lease: AssignmentLease, exact: ExactAssignment): boolean {
  return lease.disposition === "active" && isDeepStrictEqual(
    assignmentCoordinates(lease),
    assignmentCoordinates(exact.lease),
  );
}

function sameAssignmentSource(
  lease: AssignmentLease,
  exact: ExactAssignment,
): boolean {
  return isDeepStrictEqual(lease.package, exact.lease.package) &&
    isDeepStrictEqual(lease.repository, exact.lease.repository);
}

function sameAssignmentWork(
  lease: AssignmentLease,
  exact: ExactAssignment,
): boolean {
  const obligationMatches = lease.obligation === null && exact.lease.obligation === null ||
    lease.obligation !== null && exact.lease.obligation !== null &&
      lease.obligation.definition === exact.lease.obligation.definition &&
      lease.obligation.subject === exact.lease.obligation.subject;
  return lease.phase === exact.lease.phase &&
    lease.scenario === exact.lease.scenario &&
    obligationMatches &&
    isDeepStrictEqual(lease.progression, exact.lease.progression);
}

async function changedTrackedPaths(repositoryRoot: string): Promise<Set<string>> {
  const [staged, unstaged] = await Promise.all([
    git(repositoryRoot, [
      "diff", "--name-only", "-z", "--no-ext-diff", "--cached", "HEAD", "--",
    ]),
    git(repositoryRoot, [
      "diff", "--name-only", "-z", "--no-ext-diff", "HEAD", "--",
    ]),
  ]);
  return new Set(`${staged}${unstaged}`.split("\0").filter(Boolean));
}

async function packageMigrationRebase(
  repositoryRoot: string,
  lease: AssignmentLease,
  exact: ExactAssignment,
): Promise<AssignmentLease | undefined> {
  if (
    isDeepStrictEqual(lease.package, exact.lease.package) ||
    lease.repository.head !== exact.lease.repository.head ||
    !sameAssignmentWork(lease, exact)
  ) return undefined;
  const changed = await changedTrackedPaths(repositoryRoot);
  const migrationContracts = new Set([
    ".lifecycle/process-selection.json",
    ".lifecycle/repository.json",
  ]);
  if (
    changed.size !== migrationContracts.size ||
    ![...changed].every((item) => migrationContracts.has(item))
  ) return undefined;
  return {
    ...exact.lease,
    id: lease.id,
    retryAvailability: lease.retryAvailability,
    malformedResponses: lease.malformedResponses,
  };
}

function invalidLease(repositoryRoot: string): AssignmentResult<never> {
  return failure(
    "assignment-lease-invalid",
    "The active Assignment lease does not satisfy its exact current state",
    leasePath(repositoryRoot),
  );
}

function attendedInputs(
  invocations: ScenarioDryRunInvocation[],
): AttentionContext {
  return {
    invocations: invocations.map((invocation) => ({
      inputs: invocation.inputs.map(({ name, values }) => ({ name, values })),
    })),
  };
}

interface ExactBaselineMaterialization {
  kind: "exact-baseline@1";
  output: string;
  subjectInput: string;
  supportInput: string;
  payloadFields: {
    title: string;
    kind: string;
    role: string;
    scope: string;
    group: string;
    members: string;
    evidence: string;
  };
  titlePrefix: string;
  baselineKind: string;
  baselineRole: string;
  baselineGroup: string;
  evidenceSubjectTypes: Set<string>;
  evidenceTypes: Set<string>;
}

function exactBaselineMaterialization(
  scenario: VersionedDefinition,
): ExactBaselineMaterialization | undefined {
  const value = scenario.kernel_materialization;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const marker = value as Record<string, unknown>;
  if (marker.kind !== "exact-baseline@1") return undefined;
  const string = (name: string) =>
    typeof marker[name] === "string" ? marker[name] as string : "";
  const strings = (candidate: unknown) =>
    Array.isArray(candidate)
      ? new Set(
          candidate.filter((item): item is string => typeof item === "string"),
        )
      : new Set<string>();
  const payloadFields = object(marker.payload_fields);
  if (!payloadFields) return undefined;
  const payloadField = (name: string) =>
    typeof payloadFields[name] === "string" ? payloadFields[name] as string : "";
  return {
    kind: marker.kind,
    output: string("output"),
    subjectInput: string("subject_input"),
    supportInput: string("support_input"),
    payloadFields: {
      title: payloadField("title"),
      kind: payloadField("kind"),
      role: payloadField("role"),
      scope: payloadField("scope"),
      group: payloadField("group"),
      members: payloadField("members"),
      evidence: payloadField("evidence"),
    },
    titlePrefix: string("title_prefix"),
    baselineKind: string("baseline_kind"),
    baselineRole: string("baseline_role"),
    baselineGroup: string("baseline_group"),
    evidenceSubjectTypes: strings(marker.evidence_subject_types),
    evidenceTypes: strings(marker.evidence_types),
  };
}

function inputEntities(
  exact: ExactAssignment,
  name: string,
  invocation = 0,
): ScenarioBoundEntity[] {
  return (
    exact.dryRun.invocations[invocation]?.inputs.find((input) => input.name === name)
      ?.values ?? []
  );
}

function exactBaselineProposal(
  baselineType: string,
  subject: ScenarioBoundEntity,
  support: ScenarioBoundEntity[],
  materialization: ExactBaselineMaterialization,
  invocation: number,
  lineageId?: string,
): ScenarioProposal {
  const isEvidence = (item: ScenarioBoundEntity) =>
    materialization.evidenceSubjectTypes.has(subject.identity.type) &&
    materialization.evidenceTypes.has(item.identity.type);
  const revisionIds = (items: ScenarioBoundEntity[]) =>
    items
      .map((item) => item.identity.revision_id)
      .filter((id): id is string => id !== undefined)
      .sort();
  return {
    outputs: [
      {
        name: materialization.output,
        invocation,
        lifecycleDatum: {
          ...(lineageId ? { id: lineageId } : {}),
          type: baselineType,
          payload: {
            [materialization.payloadFields.title]:
              `${materialization.titlePrefix}${subject.identity.revision_id}`,
            [materialization.payloadFields.kind]: materialization.baselineKind,
            [materialization.payloadFields.role]: materialization.baselineRole,
            [materialization.payloadFields.scope]: subject.identity.revision_id,
            [materialization.payloadFields.group]: materialization.baselineGroup,
            [materialization.payloadFields.members]: revisionIds([
              subject,
              ...support.filter((item) => !isEvidence(item)),
            ]),
            [materialization.payloadFields.evidence]: revisionIds(
              support.filter(isEvidence),
            ),
          },
          links: [],
          body: "",
        },
      },
    ],
    completionEvidence: { contract: "kernel-exact-baseline-materialization@1" },
  };
}

function exactBaselineLineage(
  snapshot: LifecycleSnapshot,
  baselineType: string,
  subject: ScenarioBoundEntity,
  materialization: ExactBaselineMaterialization,
  scenarioReference: string,
): string | undefined {
  return snapshot.records
    .filter((record) =>
      record.datum.type === baselineType &&
      record.datum.payload[materialization.payloadFields.kind] ===
        materialization.baselineKind &&
      record.datum.payload[materialization.payloadFields.role] ===
        materialization.baselineRole &&
      record.datum.payload[materialization.payloadFields.scope] ===
        subject.identity.revision_id &&
      record.datum.created_by.scenario === scenarioReference
    )
    .sort((left, right) => right.datum.revision - left.datum.revision)[0]
    ?.datum.id;
}

async function verifyPublicationFingerprint(
  repositoryRoot: string,
  expected: RepositoryFingerprint,
): Promise<AssignmentResult<undefined>> {
  const current = await repositoryFingerprint(repositoryRoot);
  if (!current.ok) return current;
  return isDeepStrictEqual(current.value, expected)
    ? { ok: true, value: undefined, diagnostics: [] }
    : failure(
      "scenario-repository-changed",
      "The tracked repository changed after Assignment inspection and before publication",
      repositoryRoot,
    );
}

function preparedScenarioSubmission(
  repositoryRoot: string,
  exact: ExactAssignment,
  verifyAssignment: () => Promise<AssignmentResult<undefined>>,
): PreparedScenarioSubmission {
  return {
    dryRun: exact.dryRun,
    evaluation: exact.evaluation,
    scenario: exact.scenario,
    snapshot: exact.snapshot,
    finalizeExactBaseline: (_root, _package, _processRef, proposedDatum) =>
      exact.transaction.finalizeExactBaseline(proposedDatum),
    publishMutation: (
      _root,
      _package,
      expectedData,
      data,
      executionId,
      executionRecord,
      kernelFinalizedOutputs,
    ) =>
      exact.transaction.publishScenarioMutation(
        expectedData,
        data,
        executionId,
        executionRecord,
        kernelFinalizedOutputs,
        async () => {
          const fingerprint = await verifyPublicationFingerprint(
            repositoryRoot,
            exact.lease.repository,
          );
          return fingerprint.ok ? verifyAssignment() : fingerprint;
        },
      ),
  };
}

async function materializeExactBaseline(
  repositoryRoot: string,
  exact: ExactAssignment,
  assignmentId: string,
  materialization: ExactBaselineMaterialization,
  verifyAssignment: () => Promise<AssignmentResult<undefined>>,
): Promise<AssignmentResult<ScenarioExecution>> {
  const baselineType = exact.processPackage.kernelCapabilities[materialization.kind]?.type;
  if (!baselineType || !exact.lease.obligation) {
    return failure(
      "kernel-materialization-input-invalid",
      "Exact Baseline materialization requires a bound capability and one Obligation",
    );
  }
  const proposals = exact.dryRun.invocations.map((_, invocation) => {
    const subject = inputEntities(
      exact,
      materialization.subjectInput,
      invocation,
    )[0];
    if (!subject?.identity.revision_id) return undefined;
    return exactBaselineProposal(
      baselineType,
      subject,
      inputEntities(exact, materialization.supportInput, invocation),
      materialization,
      invocation,
      exactBaselineLineage(
        exact.snapshot,
        baselineType,
        subject,
        materialization,
        exact.lease.scenario,
      ),
    );
  });
  if (proposals.some((proposal) => proposal === undefined)) {
    return failure(
      "kernel-materialization-input-invalid",
      "Exact Baseline materialization requires one revision subject per invocation",
    );
  }
  const proposal: ScenarioProposal = {
    outputs: proposals.flatMap((item) => item!.outputs),
    completionEvidence: { contract: "kernel-exact-baseline-materialization@1" },
  };
  const loadedSkillRefs = exact.dryRun.prompt.skills.map(
    (skill) => skill.reference,
  );
  const responseSource = JSON.stringify({
    contract: "mdlm-assignment-response@1",
    assignment: assignmentId,
    kind: "proposal",
    proposal: {
      ...proposal,
      loadedSkillRefs,
      authoritySupplies: [],
      standingDelegations: [],
    },
  });
  const submitted = await submitPreparedResolverScenario(
    repositoryRoot,
    exact.processPackage,
    exact.lease.package,
    {
      scenarioReference: exact.lease.scenario,
      obligationInstance: exact.lease.obligation.instance,
      proposal,
      assignment: assignmentId,
      responseDigest: sha256(responseSource),
      suppliedAuthorities: [],
      suppliedDelegations: [],
      loadedSkillRefs,
    },
    preparedScenarioSubmission(repositoryRoot, exact, verifyAssignment),
  );
  return submitted;
}

function materializedRecords(execution: ScenarioExecution): LifecycleRecord[] {
  return execution.outputs.map((output) => ({
    datum: output.data,
    storage: { editable: false, frozen: true },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
      scenario_execution_valid: true,
    },
  }));
}

function leasedOutcome(
  exact: ExactAssignment,
  assignmentId: string,
  materializedExecutions: OperatorOutcomeBase["materializedExecutions"],
): AssignmentOutcome {
  const base = {
    package: exact.summary,
    contract: "mdlm-next@1" as const,
    phase: exact.lease.phase,
    assignment: { id: assignmentId },
    materializedExecutions,
  };
  return exact.classification.kind === "attention-required"
    ? {
        ...base,
        outcome: "attention-required",
        authorityRequirement: exact.classification.authorityRequirement,
        attentionSchedule: exact.classification.attentionSchedule,
        explanation: exact.classification.explanation,
        attentionContext: attendedInputs(exact.dryRun.invocations),
        ...(exact.classification.checkpointConversation
          ? {
              checkpointConversation:
                exact.classification.checkpointConversation,
            }
          : {}),
      }
    : { ...base, outcome: "assignment" };
}

/** Classify the current repository and lease its one exact Assignment when present. */
async function leaseNextAssignmentLocked(
  repositoryRoot: string,
  renewLeaseLock: () => Promise<void>,
): Promise<AssignmentResult<AssignmentOutcome>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  let activeLease = persisted.value;
  let state = await exactOperatorState(repositoryRoot);
  if (!state.ok) {
    if (
      activeLease &&
      !state.diagnostics.some((item) =>
        item.code === "assignment-repository-fingerprint-failed"
      )
    ) {
      await renewLeaseLock();
      await fs.rm(leasePath(repositoryRoot), { force: true });
    }
    return state;
  }

  const materializedObligations = new Set<string>();
  const materializedExecutions: OperatorOutcomeBase["materializedExecutions"] = [];
  while (state.value.assignment) {
    const exact = state.value.assignment;
    const materialization = exactBaselineMaterialization(exact.scenario);
    if (!materialization) break;
    const obligation = exact.lease.obligation?.instance;
    if (!obligation || materializedObligations.has(obligation)) {
      return failure(
        "kernel-materialization-cycle",
        "Kernel materialization did not discharge its exact Obligation",
        obligation,
      );
    }
    materializedObligations.add(obligation);
    if (activeLease) {
      await renewLeaseLock();
      await fs.rm(leasePath(repositoryRoot), { force: true });
    }
    const lease: AssignmentLease = { ...exact.lease, id: randomUUID() };
    await renewLeaseLock();
    await writeLease(repositoryRoot, lease);
    const unchanged = await confirmRepositoryFingerprint(
      repositoryRoot,
      exact.lease.repository,
    );
    if (!unchanged.ok) {
      await renewLeaseLock();
      await fs.rm(leasePath(repositoryRoot), { force: true });
      return unchanged;
    }
    const materialized = await materializeExactBaseline(
      repositoryRoot,
      exact,
      lease.id,
      materialization,
      async () => {
        await renewLeaseLock();
        const current = await readLease(repositoryRoot);
        if (!current.ok) return current;
        return exactActiveLease(current.value, lease)
          ? { ok: true, value: undefined, diagnostics: [] }
          : failure(
            "scenario-repository-changed",
            "The active Assignment changed before exact Baseline publication",
            leasePath(repositoryRoot),
          );
      },
    );
    await renewLeaseLock();
    await fs.rm(leasePath(repositoryRoot), { force: true });
    activeLease = undefined;
    if (!materialized.ok) return materialized;
    materializedExecutions.push({
      id: materialized.value.id,
      scenario: materialized.value.definition.scenario,
      status: "completed",
    });
    const fingerprint = await repositoryFingerprint(repositoryRoot);
    if (!fingerprint.ok) return fingerprint;
    const snapshot: LifecycleSnapshot = {
      ...state.value.snapshot,
      records: [
        ...state.value.snapshot.records,
        ...materializedRecords(materialized.value),
      ],
    };
    state = await operatorStateFromSnapshot(
      repositoryRoot,
      state.value.summary,
      state.value.processPackage,
      state.value.inspection,
      state.value.transaction,
      snapshot,
      fingerprint.value,
    );
    if (!state.ok) return state;
  }

  if (materializedExecutions.length > 0) {
    if (activeLease) {
      await renewLeaseLock();
      await fs.rm(leasePath(repositoryRoot), { force: true });
    }
    return {
      ok: true,
      value: {
        package: state.value.summary,
        contract: "mdlm-next@1",
        phase: phaseReference(state.value.evaluation),
        outcome: "publication-required",
        materializedExecutions,
      },
      diagnostics: [],
    };
  }

  if (
    state.value.classification.kind !== "assignment" &&
    state.value.classification.kind !== "attention-required"
  ) {
    if (activeLease) {
      await renewLeaseLock();
      await fs.rm(leasePath(repositoryRoot), { force: true });
    }
    const classification = state.value.classification;
    const base = {
      package: state.value.summary,
      contract: "mdlm-next@1" as const,
      phase: phaseReference(state.value.evaluation),
      materializedExecutions,
    };
    const value: AssignmentOutcome = classification.kind === "process-dead-end"
      ? {
          ...base,
          outcome: "process-dead-end",
          explanation: classification.explanation,
          blockers: classification.blockers,
        }
      : { ...base, ...operatorTerminalOutcomeProjection(classification) };
    return { ok: true, value, diagnostics: [] };
  }
  const exact = state.value.assignment;
  if (!exact) {
    return failure(
      "assignment-unavailable",
      "The classified Operator Outcome did not prepare its exact Assignment",
    );
  }
  if (activeLease && sameAssignment(activeLease, exact)) {
    return {
      ok: true,
      value: leasedOutcome(exact, activeLease.id, materializedExecutions),
      diagnostics: [],
    };
  }
  if (
    activeLease?.disposition === "active" &&
    sameAssignmentSource(activeLease, exact)
  ) {
    return invalidLease(repositoryRoot);
  }
  const lease: AssignmentLease = {
    ...exact.lease,
    id: randomUUID(),
  };
  await renewLeaseLock();
  await writeLease(repositoryRoot, lease);
  return {
    ok: true,
    value: leasedOutcome(exact, lease.id, materializedExecutions),
    diagnostics: [],
  };
}

/** Classify the repository and atomically own every resulting lease transition. */
export function leaseNextAssignment(
  repositoryRoot: string,
): Promise<AssignmentResult<AssignmentOutcome>> {
  return withRepositoryLock(
    repositoryRoot,
    leaseLockRef,
    (renew) => leaseNextAssignmentLocked(repositoryRoot, renew),
  );
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

/** Project one package-declared successful terminal classification for next/status composition. */
export function operatorTerminalOutcomeProjection(
  classification: Extract<OperatorOutcomeClassification, {
    kind: "profile-boundary-reached" | "lifecycle-complete";
  }>,
): Extract<OperatorStatus["currentOutcome"], {
  outcome: "profile-boundary-reached" | "lifecycle-complete";
}> {
  return classification.kind === "profile-boundary-reached"
    ? {
        outcome: "profile-boundary-reached",
        explanation: classification.explanation,
        omittedCoverage: classification.omittedCoverage,
        evidence: classification.evidence,
      }
    : {
        outcome: "lifecycle-complete",
        explanation: classification.explanation,
        evidence: classification.evidence,
      };
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
  if (
    classification.kind === "profile-boundary-reached" ||
    classification.kind === "lifecycle-complete"
  ) return operatorTerminalOutcomeProjection(classification);
  const exact = state.assignment;
  const assignment = exact && activeLease && sameAssignment(activeLease, exact)
    ? { allocation: "active" as const, id: activeLease.id }
    : {
        allocation: "not-allocated" as const,
        ...(activeLease?.disposition === "active" ? { id: activeLease.id } : {}),
      };
  if (classification.kind !== "attention-required") {
    return { outcome: "assignment", assignment };
  }
  if (!exact) {
    throw new Error("Attention Required is missing its exact prepared Assignment");
  }
  return {
    outcome: "attention-required",
    assignment,
    authorityRequirement: classification.authorityRequirement,
    attentionSchedule: classification.attentionSchedule,
    explanation: classification.explanation,
    attentionContext: attendedInputs(exact.dryRun.invocations),
    ...(classification.checkpointConversation
      ? { checkpointConversation: classification.checkpointConversation }
      : {}),
  };
}

function selectedProfile(
  processPackage: ProcessPackage,
): AssignmentResult<VersionedDefinition> {
  const selected = selectedImplementationProfile(processPackage);
  return selected
    ? { ok: true, value: selected.definition, diagnostics: [] }
    : failure(
        "profile-selection-invalid",
        `The Process Package default implementation profile '${String(object(processPackage.manifest.profiles)?.default ?? "(missing)")}' does not resolve exactly`,
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
  const unresolvedWork = state.value.work;
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
        ...(persisted.value
          ? [`mdlm assignment show ${persisted.value.id} --json`]
          : []),
        "mdlm loose-ends --json",
        `mdlm phase status ${phase.id} --json`,
        "mdlm doctor --json",
        "mdlm process show --json",
      ],
    },
    diagnostics: [],
  };
}

/** Return the Assignment response contract, optionally bound to exact invocation groups. */
export function assignmentResponseSchema(
  invocations?: readonly number[],
  authoritySupplies?: readonly string[],
): Record<string, unknown> {
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
  const authoritySuppliesSchema = authoritySupplies
    ? authoritySupplies.length > 0
      ? { items: { enum: [...authoritySupplies] } }
      : { items: { type: "string" }, maxItems: 0 }
    : { items: { type: "string" } };
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
                    invocation: invocations
                      ? { type: "integer", enum: [...invocations] }
                      : { type: "integer", minimum: 0 },
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
                ...authoritySuppliesSchema,
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
              reason: { enum: unableReasonCategories },
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

interface UnableAssignmentResponse {
  contract: "mdlm-assignment-response@1";
  assignment: string;
  kind: "unable";
  unable: {
    reason: UnableReason;
    diagnostics: ProcessDiagnostic[];
  };
}

type AssignmentResponse = ProposalAssignmentResponse | UnableAssignmentResponse;

const validateAssignmentResponse = new Ajv2020({ allErrors: true, strict: false })
  .compile(assignmentResponseSchema());

function responseDiagnostics(errors: ErrorObject[] | null | undefined): ProcessDiagnostic[] {
  return (errors ?? []).map((error) => ({
    code: "assignment-response-invalid",
    path: error.instancePath.length > 0 ? `response${error.instancePath}` : "response",
    message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  }));
}

function parseAssignmentResponse(
  source: string,
): AssignmentResult<AssignmentResponse> {
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
  return {
    ok: true,
    value: value as AssignmentResponse,
    diagnostics: [],
  };
}

type ProjectedTypeSchema =
  AssignmentPacket["allowedProjections"]["outputSchemas"][number];

function projectedTypeSchemas(
  processPackage: ProcessPackage,
  types: string[],
): ProjectedTypeSchema[] {
  return [...new Set(types)].sort().flatMap((type) => {
    const resolved = resolveType(processPackage, type);
    return resolved.ok
      ? [
          {
            type,
            envelope: resolved.type.envelopeSchema,
            payload: resolved.type.payloadSchema,
            outgoingLinks: resolved.type.outgoingLinks,
          },
        ]
      : [];
  });
}

function inputSchemas(
  processPackage: ProcessPackage,
  dryRun: ScenarioDryRun,
): AssignmentPacket["allowedProjections"]["inputSchemas"] {
  return projectedTypeSchemas(
    processPackage,
    dryRun.invocations.flatMap((invocation) =>
      invocation.inputs.flatMap((input) =>
        input.values.map((value) => value.identity.type),
      ),
    ),
  );
}

function outputSchemas(
  processPackage: ProcessPackage,
  dryRun: ScenarioDryRun,
): AssignmentPacket["allowedProjections"]["outputSchemas"] {
  return projectedTypeSchemas(
    processPackage,
    dryRun.expectedOutputs.flatMap((output) => output.types),
  );
}

function exactLifecycleData(dryRun: ScenarioDryRun): string[] {
  return [...new Set(dryRun.invocations.flatMap((invocation) =>
    invocation.inputs.flatMap((input) => input.values.map(exactEntityId))
  ))].sort();
}

function requiredLinkIdentity(
  processPackage: ProcessPackage,
  sourceType: string,
  linkId: string,
  targetType: string,
): "id" | "revision_id" | undefined {
  const source = resolveType(processPackage, sourceType);
  if (!source.ok) return undefined;
  const link = source.type.outgoingLinks
    .map(object)
    .find((candidate) => candidate?.id === linkId);
  const targets = Array.isArray(link?.targets)
    ? link.targets.map(object).filter((candidate) =>
      candidate?.kind === "datum" &&
      Array.isArray(candidate.types) &&
      candidate.types.includes(targetType)
    )
    : [];
  if (targets.length !== 1) return undefined;
  return targets[0]?.identity === "stable"
    ? "id"
    : targets[0]?.identity === "revision"
    ? "revision_id"
    : undefined;
}

function assignmentResponseSkeleton(
  exact: ExactAssignment,
  lease: AssignmentLease,
): AssignmentResponseSkeleton | undefined {
  const { dryRun, processPackage, scenario } = exact;
  const nonAutonomous = (dryRun.participation ?? []).some((item) =>
    item.authorityRequirement.mode !== "autonomous"
  );
  const authorityOutput = authorityEvidenceContract(scenario.authority_evidence)?.output;
  if (
    dryRun.invocations.length !== 1 ||
    dryRun.expectedOutputs.some((output) =>
      (output.cardinality !== "one" && !(
        nonAutonomous &&
        output.cardinality === "zero-or-one" &&
        output.name === authorityOutput
      )) || output.types.length !== 1
    )
  ) return undefined;

  const invocation = dryRun.invocations[0]!;
  const outputByName = new Map(dryRun.expectedOutputs.map((output) => [
    output.name,
    output,
  ]));
  if (outputByName.size !== dryRun.expectedOutputs.length) return undefined;

  const outputDefinitions = Array.isArray(scenario.outputs)
    ? scenario.outputs.map(object)
    : [];
  if (
    outputDefinitions.some((output) => !output) ||
    outputDefinitions.length !== dryRun.expectedOutputs.length
  ) return undefined;

  const outputs: AssignmentResponseSkeleton["proposal"]["outputs"] = [];
  for (const expected of dryRun.expectedOutputs) {
    const sourceType = expected.types[0]!;
    const definition = outputDefinitions.find((output) =>
      output?.name === expected.name
    );
    const requiredLinks = Array.isArray(definition?.required_links)
      ? definition.required_links.map(object)
      : [];
    if (
      !definition ||
      requiredLinks.some((link) => !link) ||
      requiredLinks.length !== expected.requiredLinks.length
    ) return undefined;

    const links: { type: string; target: string }[] = [];
    for (const required of requiredLinks) {
      const linkId = typeof required?.link === "string" ? required.link : undefined;
      const target = object(required?.target);
      if (!linkId || ["partition", "cover"].includes(String(required?.distribution))) {
        return undefined;
      }
      if (typeof target?.input === "string") {
        const input = invocation.inputs.find((candidate) =>
          candidate.name === target.input
        );
        if (!input || input.values.length !== 1) return undefined;
        const value = input.values[0]!;
        const identity = requiredLinkIdentity(
          processPackage,
          sourceType,
          linkId,
          value.identity.type,
        );
        const exactTarget = identity === "id"
          ? value.identity.id
          : identity === "revision_id"
          ? value.identity.revision_id
          : undefined;
        if (!exactTarget) return undefined;
        links.push({ type: linkId, target: exactTarget });
        continue;
      }
      if (typeof target?.output === "string") {
        const targetOutput = outputByName.get(target.output);
        const targetType = targetOutput?.types[0];
        if (!targetOutput || !targetType) return undefined;
        const identity = requiredLinkIdentity(
          processPackage,
          sourceType,
          linkId,
          targetType,
        );
        if (!identity) return undefined;
        links.push({
          type: linkId,
          target: `$proposal.${targetOutput.name}.${identity}`,
        });
        continue;
      }
      return undefined;
    }
    outputs.push({
      localId: expected.name,
      name: expected.name,
      invocation: 0,
      lifecycleDatum: {
        type: sourceType,
        payload: null,
        links,
        body: null,
      },
    });
  }

  return {
    contract: "mdlm-assignment-response@1",
    assignment: lease.id,
    kind: "proposal",
    proposal: {
      outputs,
      completionEvidence: null,
      loadedSkillRefs: null,
      authoritySupplies: null,
      standingDelegations: null,
    },
  };
}

function packet(
  exact: ExactAssignment,
  lease: AssignmentLease,
): AssignmentPacket {
  const participation = exact.dryRun.participation ?? [];
  const exactData = exactLifecycleData(exact.dryRun);
  const responseSkeleton = assignmentResponseSkeleton(exact, lease);
  return {
    contract: "mdlm-assignment-packet@3",
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
    exactInputs: exact.dryRun.invocations,
    allowedProjections: {
      exactLifecycleData: exactData,
      exactLifecycleDataDigests:
        exact.inspection.exactLifecycleDataDigests(exactData),
      inputSchemas: inputSchemas(exact.processPackage, exact.dryRun),
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
    responseSchema: assignmentResponseSchema(
      exact.dryRun.invocations.map((_, invocation) => invocation),
      [...new Set(participation.flatMap((value) =>
        value.authorityRequirement.mode === "autonomous"
          ? []
          : [value.authorityRequirement.authority]
      ))].sort(),
    ),
    ...(responseSkeleton ? { responseSkeleton } : {}),
    ...(exact.classification.kind === "attention-required" &&
        exact.classification.checkpointConversation
      ? {
          checkpointConversation:
            exact.classification.checkpointConversation,
        }
      : {}),
  };
}

function dispositionBase(assignmentId: string): {
  contract: "mdlm-assignment-disposition@1";
  assignment: { id: string };
} {
  return {
    contract: "mdlm-assignment-disposition@1",
    assignment: { id: assignmentId },
  };
}

function unavailableSubmission<T>(
  assignmentId: string,
): AssignmentResult<T> {
  return failure(
    "assignment-unavailable",
    `Assignment '${assignmentId}' is not the active Assignment`,
    assignmentId,
  );
}

function exactActiveLease(
  current: AssignmentLease | undefined,
  expected: AssignmentLease,
): current is AssignmentLease {
  return current?.disposition === "active" &&
    isDeepStrictEqual(current, expected);
}

function withExactActiveLease(
  repositoryRoot: string,
  expectedLease: AssignmentLease,
  operation: (
    lease: AssignmentLease,
    renew: () => Promise<void>,
  ) => Promise<AssignmentSubmissionResult>,
): Promise<AssignmentSubmissionResult> {
  return withRepositoryLock(repositoryRoot, leaseLockRef, async (renew) => {
    const persisted = await readLease(repositoryRoot);
    if (!persisted.ok) return persisted;
    return exactActiveLease(persisted.value, expectedLease)
      ? operation(persisted.value, renew)
      : unavailableSubmission(expectedLease.id);
  });
}

async function writeMalformedResponse(
  repositoryRoot: string,
  lease: AssignmentLease,
  responseSource: string,
  diagnostics: ProcessDiagnostic[],
  renew: () => Promise<void>,
): Promise<AssignmentSubmissionResult> {
  const malformedResponses = [
    ...lease.malformedResponses,
    { digest: sha256(responseSource), diagnostics },
  ];
  const correctionRequired =
    lease.retryAvailability.malformedResponseCorrection === 1;
  const disposition: AssignmentDisposition = correctionRequired
    ? {
        ...dispositionBase(lease.id),
        disposition: "correction-required",
        orchestration: {
          action: "correct-response",
          automaticReplacement: false,
        },
        malformedResponse: {
          attempt: malformedResponses.length,
          correctionsRemaining: 1,
          diagnostics,
        },
      }
    : {
        ...dispositionBase(lease.id),
        disposition: "exhausted",
        orchestration: { action: "stop", automaticReplacement: false },
        malformedResponse: {
          attempt: malformedResponses.length,
          correctionsRemaining: 0,
          diagnostics,
        },
      };
  await renew();
  await writeLease(repositoryRoot, {
    ...lease,
    disposition: correctionRequired ? "active" : "exhausted",
    retryAvailability: { malformedResponseCorrection: 0 },
    malformedResponses,
    ...(correctionRequired ? {} : { terminalDiagnostics: diagnostics }),
  });
  return { ok: false, disposition, diagnostics };
}

async function recordMalformedResponse(
  repositoryRoot: string,
  expectedLease: AssignmentLease,
  responseSource: string,
  diagnostics: ProcessDiagnostic[],
): Promise<AssignmentSubmissionResult> {
  return withExactActiveLease(
    repositoryRoot,
    expectedLease,
    (lease, renew) =>
      writeMalformedResponse(
        repositoryRoot,
        lease,
        responseSource,
        diagnostics,
        renew,
      ),
  );
}

async function writeStaleDisposition(
  repositoryRoot: string,
  lease: AssignmentLease,
  renew: () => Promise<void>,
): Promise<AssignmentSubmissionResult> {
  const diagnostics = failure(
    "assignment-stale",
    `Assignment '${lease.id}' no longer matches the current exact repository state; submit will not rebase it`,
    lease.id,
  ).diagnostics;
  await renew();
  await writeLease(repositoryRoot, {
    ...lease,
    disposition: "stale",
    retryAvailability: { malformedResponseCorrection: 0 },
    terminalDiagnostics: diagnostics,
  });
  return {
    ok: false,
    disposition: {
      ...dispositionBase(lease.id),
      disposition: "stale",
      orchestration: { action: "stop", automaticReplacement: false },
    },
    diagnostics,
  };
}

async function recordStaleDisposition(
  repositoryRoot: string,
  expectedLease: AssignmentLease,
): Promise<AssignmentSubmissionResult> {
  return withExactActiveLease(
    repositoryRoot,
    expectedLease,
    (lease, renew) => writeStaleDisposition(repositoryRoot, lease, renew),
  );
}

async function writeUnableResponse(
  repositoryRoot: string,
  lease: AssignmentLease,
  responseSource: string,
  unable: UnableAssignmentResponse["unable"],
  renew: () => Promise<void>,
): Promise<AssignmentSubmissionResult> {
  await renew();
  await writeLease(repositoryRoot, {
    ...lease,
    disposition: "abandoned",
    retryAvailability: { malformedResponseCorrection: 0 },
    response: {
      kind: "unable",
      digest: sha256(responseSource),
      unable,
    },
  });
  return {
    ok: true,
    value: {
      ...dispositionBase(lease.id),
      disposition: "abandoned",
      orchestration: { action: "stop", automaticReplacement: false },
      unable,
    },
    diagnostics: [],
  };
}

async function recordUnableResponse(
  repositoryRoot: string,
  expectedLease: AssignmentLease,
  responseSource: string,
  unable: UnableAssignmentResponse["unable"],
): Promise<AssignmentSubmissionResult> {
  return withExactActiveLease(
    repositoryRoot,
    expectedLease,
    (lease, renew) =>
      writeUnableResponse(
        repositoryRoot,
        lease,
        responseSource,
        unable,
        renew,
      ),
  );
}

/** Apply one harness response to the active exact Assignment. */
export async function submitAssignmentResponse(
  repositoryRoot: string,
  responseSource: string,
): Promise<AssignmentSubmissionResult> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  const parsed = parseAssignmentResponse(responseSource);
  if (!parsed.ok) {
    if (lease?.disposition !== "active") return parsed;
    const exact = await exactAssignment(repositoryRoot);
    return !exact.ok || !sameAssignment(lease, exact.value)
      ? recordStaleDisposition(repositoryRoot, lease)
      : recordMalformedResponse(
          repositoryRoot,
          lease,
          responseSource,
          parsed.diagnostics,
        );
  }
  if (
    !lease || lease.disposition !== "active" ||
    lease.id !== parsed.value.assignment
  ) {
    return failure(
      "assignment-unavailable",
      `Assignment '${parsed.value.assignment}' is not the active Assignment`,
      parsed.value.assignment,
    );
  }
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok || !sameAssignment(lease, exact.value)) {
    return recordStaleDisposition(repositoryRoot, lease);
  }
  if (parsed.value.kind === "unable") {
    return recordUnableResponse(
      repositoryRoot,
      lease,
      responseSource,
      parsed.value.unable,
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
  return withExactActiveLease(repositoryRoot, lease, async (lease, renew) => {
    const verifyAssignment = async (): Promise<AssignmentResult<undefined>> => {
      await renew();
      const committedLease = await readLease(repositoryRoot);
      if (!committedLease.ok) return committedLease;
      return exactActiveLease(committedLease.value, lease)
        ? { ok: true, value: undefined, diagnostics: [] }
        : failure(
          "scenario-repository-changed",
          "The active Assignment changed before publication",
          leasePath(repositoryRoot),
        );
    };
    const prepared = preparedScenarioSubmission(
      repositoryRoot,
      exact.value,
      verifyAssignment,
    );
    const submitted = exact.value.lease.obligation
      ? await submitPreparedResolverScenario(
          repositoryRoot,
          exact.value.processPackage,
          exact.value.lease.package,
          {
            ...submission,
            obligationInstance: exact.value.lease.obligation.instance,
          },
          prepared,
        )
      : await submitPreparedExplicitScenario(
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
          prepared,
        );
    if (!submitted.ok) {
      if (submitted.diagnostics.some((diagnostic) =>
        diagnostic.code === "scenario-repository-changed"
      )) return writeStaleDisposition(repositoryRoot, lease, renew);
      if (submitted.diagnostics.some((diagnostic) =>
        diagnostic.code === "scenario-publication-failed"
      )) return { ok: false, diagnostics: submitted.diagnostics };
      return writeMalformedResponse(
        repositoryRoot,
        lease,
        responseSource,
        submitted.diagnostics,
        renew,
      );
    }
    await renew();
    await fs.rm(leasePath(repositoryRoot), { force: true });
    return {
      ok: true,
      value: submitted.value as AssignmentSubmission,
      diagnostics: [],
    };
  });
}

/** Revalidate one active exact Assignment and expand its harness-neutral packet. */
async function prepareAssignmentLocked(
  repositoryRoot: string,
  assignmentId: string,
  expectedLease: AssignmentLease,
  exact: AssignmentResult<ExactAssignment>,
  renewLeaseLock: () => Promise<void>,
): Promise<AssignmentResult<AssignmentPacket>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  if (!exactActiveLease(persisted.value, expectedLease)) {
    return unavailableSubmission(assignmentId);
  }
  const lease = persisted.value;
  if (!exact.ok) {
    if (exact.diagnostics.some((item) =>
      item.code === "assignment-repository-fingerprint-failed"
    )) return exact;
    await renewLeaseLock();
    await fs.rm(leasePath(repositoryRoot), { force: true });
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer matches the current exact repository state; prepare will not rebase it`,
      assignmentId,
    );
  }
  const unchanged = await confirmRepositoryFingerprint(
    repositoryRoot,
    exact.value.lease.repository,
  );
  if (!unchanged.ok) {
    if (unchanged.diagnostics.some((item) =>
      item.code === "assignment-repository-fingerprint-failed"
    )) return unchanged;
    await renewLeaseLock();
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
    const rebased = await packageMigrationRebase(repositoryRoot, lease, exact.value);
    if (rebased) {
      await renewLeaseLock();
      await writeLease(repositoryRoot, rebased);
      return {
        ok: true,
        value: packet(exact.value, rebased),
        diagnostics: [],
      };
    }
    await renewLeaseLock();
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

/** Revalidate preparation without locking unless the lease must change. */
export async function prepareAssignment(
  repositoryRoot: string,
  assignmentId: string,
): Promise<AssignmentResult<AssignmentPacket>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.disposition !== "active" || lease.id !== assignmentId) {
    return unavailableSubmission(assignmentId);
  }
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok && exact.diagnostics.some((item) =>
    item.code === "assignment-repository-fingerprint-failed"
  )) return exact;
  if (exact.ok && sameAssignment(lease, exact.value)) {
    return {
      ok: true,
      value: packet(exact.value, lease),
      diagnostics: [],
    };
  }
  if (exact.ok && sameAssignmentSource(lease, exact.value)) {
    return invalidLease(repositoryRoot);
  }
  return withRepositoryLock(
    repositoryRoot,
    leaseLockRef,
    (renew) =>
      prepareAssignmentLocked(
        repositoryRoot,
        assignmentId,
        lease,
        exact,
        renew,
      ),
  );
}
