import { compareImplementationScopes } from "./requirement-trace-inspection.js";
import { requirementTraceBinding, selectedRequirementGraph } from "./requirement-trace.js";
import type { PayloadCollection, PayloadView } from "./payload-collections.js";
import { verificationBinding, verificationContract, runVerificationReceipt } from "./verification-receipt.js";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { AssignmentOutputRoute } from "./assignment-projection-compiler.js";
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
  readScenarioExecution,
  submitPreparedExplicitScenario,
  submitPreparedResolverScenario,
  type PackageExecutionIdentity,
  type PreparedScenarioSubmission,
  type ScenarioExecution,
  type ScenarioProposal,
} from "./scenario-execution.js";
import {
  scenarioInputPayloadReference,
  scenarioInputRevisionReference,
} from "./scenario-payload-reference.js";
import { selectedRepositoryPackage } from "./selected-package.js";
import type { PackageSummary } from "./repository-contract.js";
import { withRepositoryLock } from "./repository-lock.js";

const executeFile = promisify(execFile);
const leaseRelativePath = ".lifecycle/work/active-assignment.json";
const settlementRelativePath = ".lifecycle/work/submission-settlement.json";
const durableSettlementRefPrefix = "refs/mdlm/submission-settlements";
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
  request?: {instance: string; subject: string};
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
  repository: RepositoryFingerprint;
  contract: "mdlm-next@2";
  phase: string;
}

export interface AttentionContext {
  invocations: {
    inputs: { name: string; values: ScenarioBoundEntity[] }[];
  }[];
}

export type OperatorOutcome =
  | OperatorOutcomeBase & {
      outcome: "publication-required";
      materializedExecutions: {
        id: string;
        scenario: string;
        status: "completed";
      }[];
    }
  | OperatorOutcomeBase & {
      outcome: "assignment";
      assignment: { id: string; packet: AssignmentPacket };
    }
  | OperatorOutcomeBase & {
      outcome: "attention-required";
      assignment: { id: string; packet: AssignmentPacket };
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

export type SubmissionOutcome =
  | {
      contract: "mdlm-submission-outcome@1";
      outcome: "accepted";
      assignment: { id: string };
      responseDigest: string;
      settlement: { assignment: string; execution: string };
      receipt: {
        publications: {
          handle: string;
          stableId: string;
          revisionId: string;
        }[];
      };
    }
  | {
      contract: "mdlm-submission-outcome@1";
      outcome: "rejected";
      assignment: { id: string };
      responseDigest: string;
      diagnostics: ProcessDiagnostic[];
      retryable: boolean;
      correctionConsumed: false;
    }
  | {
      contract: "mdlm-submission-outcome@1";
      outcome: "settlement-required";
      assignment: { id: string };
      responseDigest: string;
      settlement: { assignment: string; execution: string };
      reason: "publication-closure-uncertain";
      orchestration: { action: "inspect-settlement"; replay: false };
    };

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

export interface AssignmentPayloadConditionalRule {
  path: string;
  context?: {
    if: Record<string, unknown>;
    branch: "then" | "else";
  }[];
  if: Record<string, unknown>;
  then?: Record<string, unknown>;
  else?: Record<string, unknown>;
}

export interface AssignmentPayloadDependentRule {
  path: string;
  context?: AssignmentPayloadConditionalRule["context"];
  required: Record<string, string[]>;
}

export interface AssignmentPayloadSummary {
  required: string[];
  kernelManaged: string[];
  /** Exact Scenario-required values, including same-response identity references. */
  requiredValues?: Record<string, unknown>;
  /** Compact construction hints for required authored fields. */
  fieldShapes?: Record<string, Record<string, unknown>>;
  conditional?: AssignmentPayloadConditionalRule[];
  dependentRequired?: AssignmentPayloadDependentRule[];
}

function compactAssignmentFieldSchema(
  value: unknown,
): Record<string, unknown> | undefined {
  const schema = object(value);
  if (!schema) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of [
    "type",
    "description",
    "examples",
    "enum",
    "const",
    "format",
    "pattern",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "uniqueItems",
    "additionalProperties",
  ]) {
    if (Object.hasOwn(schema, key)) result[key] = structuredClone(schema[key]);
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === "string")
    : [];
  if (required.length > 0) result.required = required;
  const properties = object(schema.properties);
  if (properties && required.length > 0) {
    const requiredProperties = Object.fromEntries(required.flatMap((field) => {
      const projected = compactAssignmentFieldSchema(properties[field]);
      return projected ? [[field, projected]] : [];
    }));
    if (Object.keys(requiredProperties).length > 0) {
      result.properties = requiredProperties;
    }
  }

  const items = compactAssignmentFieldSchema(schema.items);
  if (items) result.items = items;
  if (Array.isArray(schema.prefixItems)) {
    const prefixItems = schema.prefixItems
      .map(compactAssignmentFieldSchema)
      .filter((item): item is Record<string, unknown> => item !== undefined);
    if (prefixItems.length > 0) result.prefixItems = prefixItems;
  }
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (!Array.isArray(schema[key])) continue;
    const alternatives = schema[key]
      .map(compactAssignmentFieldSchema)
      .filter((item): item is Record<string, unknown> => item !== undefined);
    if (alternatives.length > 0) result[key] = alternatives;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Render fields required by the active payload-schema branch. */
export function assignmentPayloadScaffold(
  summary: AssignmentPayloadSummary,
  conditionContext: Record<string, unknown> = {},
  requiredPayload: Record<string, unknown> = {},
): Record<string, unknown> {
  const fields = new Set(summary.required);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const rule of summary.conditional ?? []) {
    if (/\/(properties|items)(\/|$)/.test(rule.path) || !rule.then) continue;
    const validate = ajv.compile(rule.if);
    if (!validate(conditionContext)) continue;
    const required = Array.isArray(rule.then.required)
      ? rule.then.required.filter((field): field is string =>
        typeof field === "string"
      )
      : [];
    required.forEach((field) => fields.add(field));
  }
  Object.keys(requiredPayload).forEach((pathValue) =>
    fields.add(pathValue.split(".")[0]!)
  );
  const payload = Object.fromEntries([...fields].map((field) => [
    field,
    Object.hasOwn(requiredPayload, field) ? requiredPayload[field] : null,
  ]));
  return nestedPayloadValues(requiredPayload, payload);
}

/** Expand dotted `required_payload` paths into nested payload objects. */
function nestedPayloadValues(
  flat: Record<string, unknown>,
  into: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [pathValue, value] of Object.entries(flat)) {
    const segments = pathValue.split(".");
    let parent = into;
    for (const segment of segments.slice(0, -1)) {
      const child = object(parent[segment]);
      parent[segment] = child ?? {};
      parent = parent[segment] as Record<string, unknown>;
    }
    parent[segments.at(-1)!] = value;
  }
  return into;
}

/** Surface authored payload obligations without choosing a conditional schema branch. */
export function assignmentPayloadSummary(
  payloadSchema: Record<string, unknown>,
  kernelManagedPayloadPaths: string[],
  requiredValues: Record<string, unknown> = {},
): AssignmentPayloadSummary {
  const kernelManaged = new Set(kernelManagedPayloadPaths);
  const required = Array.isArray(payloadSchema.required)
    ? payloadSchema.required.filter((field): field is string =>
      typeof field === "string" && !kernelManaged.has(field)
    )
    : [];
  const conditional: AssignmentPayloadConditionalRule[] = [];
  const conditionalKeys = new Set<string>();
  const dependentRequired: AssignmentPayloadDependentRule[] = [];
  const pointerToken = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");
  const properties = object(payloadSchema.properties) ?? {};
  const fieldShapes = Object.fromEntries(required.flatMap((field) => {
    const projected = compactAssignmentFieldSchema(properties[field]);
    return projected ? [[field, projected]] : [];
  }));

  const visit = (
    value: unknown,
    path = "",
    context: NonNullable<AssignmentPayloadConditionalRule["context"]> = [],
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`, context));
      return;
    }
    const schema = object(value);
    if (!schema) return;

    const condition = object(schema.if);
    const consequent = object(schema.then);
    const alternative = object(schema.else);
    if (condition && (consequent || alternative)) {
      const rule = {
        path,
        ...(context.length > 0 ? { context } : {}),
        if: condition,
        ...(consequent ? { then: consequent } : {}),
        ...(alternative ? { else: alternative } : {}),
      };
      const key = JSON.stringify(rule);
      if (!conditionalKeys.has(key)) {
        conditionalKeys.add(key);
        conditional.push(rule);
      }
    }

    const dependencies = object(schema.dependentRequired);
    if (dependencies) {
      const required: Record<string, string[]> = {};
      for (const [field, dependenciesForField] of Object.entries(dependencies)) {
        if (!Array.isArray(dependenciesForField)) continue;
        const fields = dependenciesForField.filter((dependency): dependency is string =>
          typeof dependency === "string" && !kernelManaged.has(dependency)
        );
        if (fields.length > 0) required[field] = [...new Set(fields)].sort();
      }
      if (Object.keys(required).length > 0) {
        dependentRequired.push({
          path,
          ...(context.length > 0 ? { context } : {}),
          required,
        });
      }
    }

    for (const [key, child] of Object.entries(schema)) {
      const childPath = `${path}/${pointerToken(key)}`;
      if (condition && key === "then") {
        visit(child, childPath, [...context, { if: condition, branch: "then" }]);
      } else if (condition && key === "else") {
        visit(child, childPath, [...context, { if: condition, branch: "else" }]);
      } else {
        visit(child, childPath, context);
      }
    }
  };
  visit(payloadSchema);

  return {
    required,
    kernelManaged: kernelManagedPayloadPaths,
    ...(Object.keys(requiredValues).length > 0
      ? { requiredValues: structuredClone(requiredValues) }
      : {}),
    ...(Object.keys(fieldShapes).length > 0 ? { fieldShapes } : {}),
    ...(conditional.length > 0 ? { conditional } : {}),
    ...(dependentRequired.length > 0 ? { dependentRequired } : {}),
  };
}

export interface AssignmentPacket {
  contract: "mdlm-assignment-packet@3";
  assignment: { id: string };
  package: PackageExecutionIdentity;
  repository: RepositoryFingerprint;
  phase: string;
  work: {
    kind: "obligation" | "phase-progression" | "explicit-request";
    instance: string;
    definition: string;
    subject: string;
  };
  scenario: {
    reference: string;
    definition: { id: string; version: number };
    prompt: Omit<ScenarioDryRun["prompt"], "skills">;
    skills: ScenarioDryRun["prompt"]["skills"];
  };
  exactInputs: ScenarioDryRunInvocation[];
  schemas: Record<string, {
    envelope: Record<string, unknown>;
    payload: Record<string, unknown>;
    outgoingLinks: Record<string, unknown>[];
    payloadCollections?: PayloadCollection[];
    payloadViews?: PayloadView[];
  }>;
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
  outputs: (Omit<ScenarioDryRun["expectedOutputs"][number], "types"> & {
    handle: string;
    type: string;
    identity?: { input: string };
    payloadSummary: AssignmentPayloadSummary;
  })[];
  completion: ScenarioDryRun["completion"];
  /** New packets emit these; optional for historical v3 packet readers/fixtures.
   * Ordinary submit-proposal input. Payload semantics are checked at submission. */
  execution?: { command: string[]; receipt: string };
  authorValuesSchema?: Record<string, unknown>;
  authorValuesScaffold?: AssignmentAuthorValues;
  sourceScopes?: {implementation: string; scopes: {revision: string; payload: Record<string, unknown>; links: {type: string; target: string}[]}[]; changes: unknown; comparison: ReturnType<typeof compareImplementationScopes> | null}[];
  requirementGraphs?: { selection: string; requirements: {id: string; revision: string; payload: Record<string, unknown>; links: {type: string; target: string}[]; leaf: boolean}[] }[];
  responseSchema: Record<string, unknown>;
  responseScaffold: AssignmentResponseSkeleton;
  checkpointConversation?: CheckpointConversation;
}

export interface AssignmentResponseSkeleton {
  contract: "mdlm-assignment-response@2";
  assignment: string;
  kind: "proposal";
  proposal: {
    outputs: {
      handle: string;
      output?: string;
      invocation?: number;
      type: string;
      payload: Record<string, unknown> | null;
      links: SymbolicProposalLink[];
      body: null;
    }[];
    completionEvidence: null;
  };
}

interface AssignmentAuthorValues {
  outputs: {
    slot: string;
    handle?: string;
    links?: SymbolicProposalLink[];
    revision_of?: string;
    payload: Record<string, unknown>;
    body: string;
  }[];
  completionEvidence: unknown;
}

export interface CompiledAssignmentProposal {
  source: string;
}

/** Render the active exact Assignment's existing response scaffold without mutation. */
export async function inspectActiveAssignmentResponseScaffold(
  repositoryRoot: string,
): Promise<AssignmentResult<AssignmentResponseSkeleton>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.disposition !== "active") {
    return failure(
      "assignment-unavailable",
      "No active Assignment is available for a response scaffold",
    );
  }
  const pending = await readPendingSettlement(repositoryRoot, lease.id);
  if (pending) {
    return failure(
      "submission-settlement-required",
      "The active Assignment has uncertain publication closure; inspect settlement and do not replay it",
      pending.execution,
    );
  }
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok) return exact;
  if (!sameAssignment(lease, exact.value)) {
    return failure(
      "assignment-stale",
      `Assignment '${lease.id}' no longer matches the current exact repository state`,
      lease.id,
    );
  }
  const current = await readLease(repositoryRoot);
  if (!current.ok) return current;
  if (!exactActiveLease(current.value, lease)) {
    return failure(
      "assignment-unavailable",
      `Assignment '${lease.id}' is no longer the active Assignment`,
      lease.id,
    );
  }
  return {
    ok: true,
    value: packet(exact.value, lease).responseScaffold,
    diagnostics: [],
  };
}

/** Compile transient author-owned values into the active exact response envelope. */
export async function compileActiveAssignmentProposal(
  repositoryRoot: string,
  authorValuesSource: string,
): Promise<AssignmentResult<CompiledAssignmentProposal>> {
  const authored = parseAssignmentAuthorValues(authorValuesSource);
  if (!authored.ok) return authored;
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.disposition !== "active") {
    return failure(
      "assignment-unavailable",
      "No active Assignment is available for proposal submission",
    );
  }
  const pending = await readPendingSettlement(repositoryRoot, lease.id);
  if (pending) {
    return failure(
      "submission-settlement-required",
      "The active Assignment has uncertain publication closure; inspect settlement and do not replay it",
      pending.execution,
    );
  }
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok) return exact;
  if (!sameAssignment(lease, exact.value)) {
    return failure(
      "assignment-stale",
      `Assignment '${lease.id}' no longer matches the current exact repository state`,
      lease.id,
    );
  }
  const current = await readLease(repositoryRoot);
  if (!current.ok) return current;
  if (!exactActiveLease(current.value, lease)) {
    return failure(
      "assignment-unavailable",
      `Assignment '${lease.id}' is no longer the active Assignment`,
      lease.id,
    );
  }
  const compiled = assignmentResponseFromAuthorValues(
    exact.value,
    lease,
    authored.value,
  );
  if (!compiled.ok) return compiled;
  const source = `${JSON.stringify(compiled.value)}\n`;
  const parsed = parseAssignmentResponse(source);
  if (!parsed.ok) return parsed;
  if (parsed.value.kind !== "proposal") {
    return failure(
      "assignment-author-values-invalid",
      "Author values must compile to a proposal response",
      "authorValues",
    );
  }
  const projected = scenarioProposalFromResponse(exact.value, lease, parsed.value);
  return projected.ok
    ? { ok: true, value: { source }, diagnostics: [] }
    : projected;
}

type AssignmentResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

type AssignmentSubmissionResult =
  | {
      ok: true;
      value: SubmissionOutcome;
      diagnostics: [];
    }
  | {
      ok: false;
      value?: SubmissionOutcome;
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

interface PendingSettlement {
  contract: "mdlm-pending-settlement@1";
  assignment: string;
  execution: string;
  responseDigest: string;
}

function settlementPath(repositoryRoot: string): string {
  return path.join(repositoryRoot, settlementRelativePath);
}

function pendingSettlement(value: unknown): PendingSettlement | undefined {
  const candidate = object(value);
  return candidate?.contract === "mdlm-pending-settlement@1" &&
      typeof candidate.assignment === "string" &&
      typeof candidate.execution === "string" &&
      typeof candidate.responseDigest === "string"
    ? candidate as unknown as PendingSettlement
    : undefined;
}

async function readSettlementFile(target: string): Promise<PendingSettlement | undefined> {
  try {
    return pendingSettlement(JSON.parse(await fs.readFile(target, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function durableSettlementRef(assignment: string): string {
  return `${durableSettlementRefPrefix}/${assignment}`;
}

async function readSettlementRef(
  repositoryRoot: string,
  reference: string,
): Promise<PendingSettlement | undefined> {
  let objectId: string;
  try {
    objectId = (await git(repositoryRoot, ["rev-parse", "--verify", reference])).trim();
  } catch (error) {
    if ((error as { code?: number }).code === 128) return undefined;
    throw error;
  }
  const settlement = pendingSettlement(JSON.parse(await git(repositoryRoot, [
    "cat-file",
    "-p",
    objectId,
  ])));
  if (!settlement) {
    throw new Error(`Durable settlement ref '${reference}' is invalid`);
  }
  return settlement;
}

async function readDurableSettlements(
  repositoryRoot: string,
): Promise<PendingSettlement[]> {
  const references = (await git(repositoryRoot, [
    "for-each-ref",
    "--format=%(refname)",
    durableSettlementRefPrefix,
  ])).trim().split("\n").filter(Boolean);
  const settlements: PendingSettlement[] = [];
  for (const reference of references) {
    const settlement = await readSettlementRef(repositoryRoot, reference);
    if (settlement) settlements.push(settlement);
  }
  return settlements;
}

async function writePendingSettlement(
  repositoryRoot: string,
  settlement: PendingSettlement,
): Promise<void> {
  const source = `${JSON.stringify(settlement, null, 2)}\n`;
  const reference = durableSettlementRef(settlement.assignment);
  const existing = await readSettlementRef(repositoryRoot, reference);
  if (existing && JSON.stringify(existing) !== JSON.stringify(settlement)) {
    throw new Error(
      `Assignment '${settlement.assignment}' already has a different durable settlement`,
    );
  }
  const target = settlementPath(repositoryRoot);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.writeFile(temporary, source, { flag: "wx" });
    if (!existing) {
      const objectId = (await git(repositoryRoot, [
        "hash-object",
        "-w",
        temporary,
      ])).trim();
      await git(repositoryRoot, [
        "update-ref",
        reference,
        objectId,
        "0".repeat(objectId.length),
      ]);
    }
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readPendingSettlement(
  repositoryRoot: string,
  identity?: string,
): Promise<PendingSettlement | undefined> {
  const legacy = await readSettlementFile(settlementPath(repositoryRoot));
  if (
    legacy &&
    (identity === undefined || legacy.assignment === identity || legacy.execution === identity)
  ) return legacy;
  if (identity === undefined) return undefined;
  const direct = await readSettlementRef(repositoryRoot, durableSettlementRef(identity));
  if (direct) return direct;
  for (const candidate of await readDurableSettlements(repositoryRoot)) {
    if (candidate?.assignment === identity || candidate?.execution === identity) {
      return candidate;
    }
  }
  return undefined;
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
  const request = object(lease?.request);
  const requestValid = obligation === undefined && progression === undefined && request !== undefined && typeof request.instance === "string" && typeof request.subject === "string" && request.instance === `change:${request.subject}`;
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
      (obligationValid || progressionValid || requestValid) &&
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
      ...(work.kind === "explicit-request" ? {request: {instance: work.instance, subject: work.subject}} : {}),
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

export interface DerivedOperatorOutcome {
  evaluation: LifecycleEvaluation;
  work: OperatorWorkFacts[];
  classification: OperatorOutcomeClassification;
}

/** Derive one decision without observing clocks, identities, leases, or storage. */
export function deriveOperatorOutcome(
  authenticatedSnapshot: LifecycleSnapshot,
  exactProcessPackage: ProcessPackage,
): AssignmentResult<DerivedOperatorOutcome> {
  const evaluation = activeLifecycleEvaluation(
    exactProcessPackage,
    authenticatedSnapshot,
  );
  if (evaluation.diagnostics.length > 0) {
    return { ok: false, diagnostics: evaluation.diagnostics };
  }
  const work = operatorWorkProjection(
    evaluation,
    authenticatedSnapshot.records,
  );
  return {
    ok: true,
    value: {
      evaluation,
      work,
      classification: classifyOperatorOutcome(
        work,
        evaluation.terminalOutcome,
        evaluation.phase?.attentionCheckpoints
          .filter((checkpoint) => checkpoint.active)
          .map((checkpoint) => checkpoint.id) ?? [],
      ),
    },
    diagnostics: [],
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
  const derived = deriveOperatorOutcome(snapshot, processPackage);
  if (!derived.ok) return derived;
  const { evaluation, work: workItems, classification } = derived.value;
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
  const trace = requirementTraceBinding(processPackage);
  if (trace && classification.kind === "lifecycle-complete") {
    const sets = snapshot.records.filter((r) => r.datum.type === trace.type);
    const latest = sets.filter((r) => !sets.some((other) => other.datum.id === r.datum.id && other.datum.revision > r.datum.revision));
    for (const selected of latest) {
      const requestPath = path.join(repositoryRoot, ".lifecycle/work/change-requests", `${selected.datum.revision_id}.json`);
      let request: {scenario: string; subject: string; process: string};
      try { request = JSON.parse(await fs.readFile(requestPath, "utf8")); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        return failure("change-request-invalid", String(error), requestPath);
      }
      if (request.subject !== selected.datum.revision_id || request.process !== `${summary.reference}#${summary.digest}`) return failure("change-request-stale", "Change request identity does not match the exact selected requirement graph", requestPath);
      const scenario = definition(processPackage.scenarios, request.scenario);
      if (!scenario || scenario.initiation !== "explicit") return failure("change-scenario-unavailable", "Change request requires an explicitly initiable package Scenario");
      const dryRun = await dryRunExplicitScenario(processPackage, snapshot, request.scenario, [{name: "subject", value: request.subject}]);
      if (!dryRun.ok) return dryRun;
      const work: OperatorWorkFacts = {kind: "explicit-request", phase: phaseReference(evaluation), instance: `change:${request.subject}`, definition: request.scenario, subject: request.subject, scenario: request.scenario, dispatchable: true, authorityRequirements: (dryRun.value.participation ?? []).map((p) => ({policy: p.policy, authorityRequirement: p.authorityRequirement, attentionSchedule: p.attentionSchedule})), explanation: "Explicitly requested revision of the accepted requirement graph", status: "ready", blockedBy: [], blockerChains: [], unresolvedBindings: []};
      const explicitClassification = classifyOperatorOutcome([work], undefined, []);
      if (explicitClassification.kind !== "assignment" && explicitClassification.kind !== "attention-required") return failure("change-request-not-dispatchable", "Package does not permit the requested revision");
      state.classification = explicitClassification;
      state.work = [work];
      state.assignment = assignmentFromPreparedWork(summary, processPackage, inspection, transaction, evaluation, fingerprint, explicitClassification, {dryRun: dryRun.value, scenario, snapshot});
    }
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
    isDeepStrictEqual(lease.progression, exact.lease.progression) &&
    isDeepStrictEqual(lease.request, exact.lease.request);
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

function exactBaselineMaterializationContract(
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

export function exactBaselineMaterialization(
  scenario: VersionedDefinition,
): ExactBaselineMaterialization | undefined {
  const materialization = exactBaselineMaterializationContract(scenario);
  const declaredOutputs = Array.isArray(scenario.outputs)
    ? scenario.outputs.map(object).filter((output) => output !== undefined)
    : [];
  return materialization && declaredOutputs.length === 1 &&
      declaredOutputs[0]?.name === materialization.output
    ? materialization
    : undefined;
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
      beforeCommit,
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
          if (!fingerprint.ok) return fingerprint;
          const verified = await verifyAssignment();
          if (!verified.ok || !beforeCommit) return verified;
          return beforeCommit();
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
    contract: "mdlm-assignment-response@2",
    assignment: assignmentId,
    kind: "proposal",
    proposal: {
      outputs: proposal.outputs.map((output) => ({
        handle: output.localId ?? output.name,
        type: output.lifecycleDatum.type,
        payload: output.lifecycleDatum.payload,
        links: output.lifecycleDatum.links.map((link) => ({
          type: link.type,
          target: { datum: link.target },
        })),
        body: output.lifecycleDatum.body,
      })),
      completionEvidence: proposal.completionEvidence,
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
  lease: AssignmentLease,
): AssignmentOutcome {
  const base = {
    package: exact.summary,
    repository: exact.lease.repository,
    contract: "mdlm-next@2" as const,
    phase: exact.lease.phase,
    assignment: { id: lease.id, packet: packet(exact, lease) },
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
async function claimNextWorkLocked(
  repositoryRoot: string,
  renewLeaseLock: () => Promise<void>,
): Promise<AssignmentResult<AssignmentOutcome>> {
  for (const settlement of await readDurableSettlements(repositoryRoot)) {
    const reconciled = await reconcilePendingSettlement(repositoryRoot, settlement);
    if (!reconciled.ok) return reconciled;
    if (reconciled.value.outcome === "settlement-required") {
      return failure(
        "submission-settlement-required",
        "A prior submission has uncertain publication closure; inspect its stable settlement identity and do not continue or replay it",
        settlement.execution,
      );
    }
  }
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
  const materializedExecutions: Extract<OperatorOutcome, {
    outcome: "publication-required";
  }>["materializedExecutions"] = [];
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
      status: materialized.value.status,
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
        repository: state.value.fingerprint,
        contract: "mdlm-next@2",
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
      repository: state.value.fingerprint,
      contract: "mdlm-next@2" as const,
      phase: phaseReference(state.value.evaluation),
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
      value: leasedOutcome(exact, activeLease),
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
    value: leasedOutcome(exact, lease),
    diagnostics: [],
  };
}

/** Classify the repository and atomically own every resulting lease transition. */
export function claimNextWork(
  repositoryRoot: string,
): Promise<AssignmentResult<AssignmentOutcome>> {
  return withRepositoryLock(
    repositoryRoot,
    leaseLockRef,
    (renew) => claimNextWorkLocked(repositoryRoot, renew),
  );
}

/** Request a new package-declared revision; accepted lifecycle data stays immutable. */
export async function requestRequirementChange(repositoryRoot: string, subject: string): Promise<AssignmentResult<AssignmentOutcome>> {
  return withRepositoryLock(repositoryRoot, leaseLockRef, async (renew) => {
    const state = await exactOperatorState(repositoryRoot);
    if (!state.ok) return state;
    const trace = requirementTraceBinding(state.value.processPackage);
    if (!trace || state.value.classification.kind !== "lifecycle-complete") return failure("change-request-boundary", "A requirement change can start only after the current product is accepted and complete");
    const datum = state.value.snapshot.records.find((r) => r.datum.revision_id === subject)?.datum;
    if (!datum || datum.type !== trace.type || state.value.snapshot.records.some((r) => r.datum.id === datum.id && r.datum.revision > datum.revision)) return failure("change-request-subject", "Select the exact current requirement-set revision");
    const scenarios = Object.values(state.value.processPackage.scenarios).filter((s) => s.initiation === "explicit" && Array.isArray(s.inputs) && s.inputs.some((i) => object(i)?.name === "subject" && (object(i)?.types as unknown[] | undefined)?.includes(trace.type)) && Array.isArray(s.outputs) && s.outputs.some((o) => (object(o)?.types as unknown[] | undefined)?.includes(trace.requirement_type)));
    if (scenarios.length !== 1) return failure("change-scenario-unavailable", "The package must declare one explicit requirement revision Scenario");
    const scenario = `${scenarios[0]!.id}@${scenarios[0]!.version}`;
    const prepared = await dryRunExplicitScenario(state.value.processPackage, state.value.snapshot, scenario, [{name: "subject", value: subject}]);
    if (!prepared.ok) return prepared;
    const directory = path.join(repositoryRoot, ".lifecycle/work/change-requests");
    await fs.mkdir(directory, {recursive: true});
    try { await fs.writeFile(path.join(directory, `${subject}.json`), JSON.stringify({scenario, subject, process: `${state.value.summary.reference}#${state.value.summary.digest}`}) + "\n", {flag: "wx"}); }
    catch (error) { return failure("change-request-exists", `Cannot create a second request for this exact requirement set: ${String(error)}`); }
    return claimNextWorkLocked(repositoryRoot, renew);
  });
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

interface SymbolicProposalLink {
  type: string;
  target:
    | { input: string }
    | { output: string }
    | { payload: { output: string; path: string } }
    | { datum: string };
}

interface SymbolicProposalOutput {
  revision_of?: string;
  handle: string;
  output?: string;
  invocation?: number;
  type: string;
  payload: Record<string, unknown> | null;
  links: SymbolicProposalLink[];
  body: string | null;
}

interface ProposalAssignmentResponse {
  contract: "mdlm-assignment-response@2";
  assignment: string;
  kind: "proposal";
  proposal: {
    outputs: SymbolicProposalOutput[];
    completionEvidence: unknown;
  };
}

interface UnableAssignmentResponse {
  contract: "mdlm-assignment-response@2";
  assignment: string;
  kind: "unable";
  unable: {
    reason: UnableReason;
    diagnostics: ProcessDiagnostic[];
  };
}

type AssignmentResponse = ProposalAssignmentResponse | UnableAssignmentResponse;

export function assignmentResponseSchema(
  assignment?: string,
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
  const target = {
    oneOf: [
      ...["input", "output", "datum"].map((name) => ({
        type: "object",
        additionalProperties: false,
        required: [name],
        properties: { [name]: { type: "string", minLength: 1 } },
      })),
      {
        type: "object",
        additionalProperties: false,
        required: ["payload"],
        properties: {
          payload: {
            type: "object",
            additionalProperties: false,
            required: ["output", "path"],
            properties: {
              output: { type: "string", minLength: 1 },
              path: { type: "string", minLength: 1 },
            },
          },
        },
      },
    ],
  };
  const common = {
    contract: { const: "mdlm-assignment-response@2" },
    assignment: assignment ? { const: assignment } : { type: "string", minLength: 1 },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://mdlm.dev/contracts/mdlm-assignment-response@2",
    title: "MDLM Assignment Response",
    oneOf: [{
      type: "object",
      additionalProperties: false,
      required: ["contract", "assignment", "kind", "proposal"],
      properties: {
        ...common,
        kind: { const: "proposal" },
        proposal: {
          type: "object",
          additionalProperties: false,
          required: ["outputs", "completionEvidence"],
          properties: {
            outputs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["handle", "type", "payload", "links", "body"],
                properties: {
                  handle: {
                    type: "string",
                    pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
                    description: "Unique response-local item handle. Repeated values need different handles.",
                  },
                  output: {
                    type: "string",
                    pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
                    description: "Declared Scenario output name. Keep it unchanged across repeated values.",
                  },
                  invocation: {
                    type: "integer",
                    minimum: 0,
                    description: "Zero-based Scenario invocation index, not a repeated-output occurrence. Omit for one invocation.",
                  },
                  revision_of: { type: "string" },
                  type: { type: "string", pattern: "^[A-Z]{3,8}$" },
                  payload: {
                    type: ["object", "null"],
                    description: "Authored payload. An exact {output: \"<handle>\"} value references that same response output's generated Revision ID.",
                  },
                  links: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["type", "target"],
                      properties: { type: { type: "string" }, target },
                    },
                  },
                  body: { type: ["string", "null"] },
                },
              },
            },
            completionEvidence: {},
          },
        },
      },
    }, {
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
    }],
  };
}

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

const assignmentAuthorValuesSchema = {
    type: "object",
    additionalProperties: false,
    required: ["outputs", "completionEvidence"],
    properties: {
      outputs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slot", "payload", "body"],
          properties: {
            slot: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]*$" },
            handle: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]*$" },
            revision_of: { type: "string" },
            links: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "target"], properties: {type: {type: "string"}, target: {type: "object", additionalProperties: false, properties: {output: {type: "string"}, datum: {type: "string"}}, oneOf: [{required: ["output"]}, {required: ["datum"]}]}}}},
            payload: { type: "object" },
            body: { type: "string" },
          },
        },
      },
      completionEvidence: {},
    },
  };

const validateAssignmentAuthorValues = new Ajv2020({ allErrors: true, strict: false })
  .compile<AssignmentAuthorValues>(assignmentAuthorValuesSchema);

function parseAssignmentAuthorValues(
  source: string,
): AssignmentResult<AssignmentAuthorValues> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return failure(
      "assignment-author-values-invalid",
      `Author values must contain one JSON object: ${error instanceof Error ? error.message : String(error)}`,
      "authorValues",
    );
  }
  if (!validateAssignmentAuthorValues(value)) {
    return {
      ok: false,
      diagnostics: (validateAssignmentAuthorValues.errors ?? []).map((error) => ({
        code: "assignment-author-values-invalid",
        path: error.instancePath.length > 0
          ? `authorValues${error.instancePath}`
          : "authorValues",
        message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
      })),
    };
  }
  return { ok: true, value: value as AssignmentAuthorValues, diagnostics: [] };
}

function payloadPaths(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    const nested = object(child);
    return nested ? [current, ...payloadPaths(nested, current)] : [current];
  });
}

function nonNullPayloadPaths(
  value: Record<string, unknown>,
  prefix = "",
): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    const nested = object(child);
    if (nested) {
      const paths = nonNullPayloadPaths(nested, current);
      return paths.length > 0 ? paths : [current];
    }
    return child === null ? [] : [current];
  });
}

function protectedPayloadPath(candidate: string, protectedPath: string): boolean {
  return candidate === protectedPath || candidate.startsWith(`${protectedPath}.`);
}

/** Shared ownership rules for author guidance and canonical submission. */
function authorPayloadOwnership(
  contract: AssignmentPacket["outputs"][number],
  template: SymbolicProposalOutput,
): { fixed: string[]; managed: string[] } {
  return {
    fixed: [...new Set([
      ...Object.keys(contract.payloadSummary.requiredValues ?? {}),
      ...nonNullPayloadPaths(template.payload ?? {}),
    ])],
    managed: contract.payloadSummary.kernelManaged,
  };
}

function authorPayloadSchema(
  schema: Record<string, unknown>,
  excluded: string[],
): Record<string, unknown> {
  // This is the authoring shape. Conditional and cross-output semantics still
  // use the original payload schema and Scenario at canonical submission.
  const properties = Object.fromEntries(Object.entries(object(schema.properties) ?? {})
    .filter(([key]) => !excluded.includes(key))
    .map(([key, value]) => {
      const nested = excluded.filter((entry) => entry.startsWith(`${key}.`))
        .map((entry) => entry.slice(key.length + 1));
      return [key, nested.length > 0
        ? authorPayloadSchema(object(value) ?? {}, nested)
        : structuredClone(value)];
    }));
  return {
    type: "object",
    additionalProperties: schema.additionalProperties ?? true,
    properties,
    ...((excluded.some((entry) => !entry.includes("."))) ? {
      allOf: excluded.filter((entry) => !entry.includes("."))
        .map((entry) => ({ not: { required: [entry] } })),
    } : {}),
    required: (Array.isArray(schema.required) ? schema.required : [])
      .filter((key) => typeof key === "string" && !excluded.includes(key)),
  };
}

function authorPayloadScaffold(
  payload: Record<string, unknown>,
  excluded: string[],
  prefix = "",
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).flatMap(([key, value]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    if (excluded.some((field) => protectedPayloadPath(current, field))) return [];
    const nested = object(value);
    return [[key, nested ? authorPayloadScaffold(nested, excluded, current) : value]];
  }));
}

function authorValuesContract(
  packet: AssignmentPacket,
  materializedOutput: string | undefined,
  trace: ReturnType<typeof requirementTraceBinding>,
): { schema: Record<string, unknown>; scaffold: AssignmentAuthorValues } {
  const variants: Record<string, unknown>[] = [];
  const outputs: AssignmentAuthorValues["outputs"] = [];
  for (const template of packet.responseScaffold.proposal.outputs) {
    const contract = packet.outputs.find((output) =>
      output.handle === (template.output ?? template.handle))!;
    if (contract.name === materializedOutput || [trace?.type, trace?.scope_type].includes(template.type)) continue;
    const { fixed, managed } = authorPayloadOwnership(contract, template);
    const payloadSchema = authorPayloadSchema(packet.schemas[template.type]!.payload,
      [...fixed, ...managed]);
    const repeated = ["one-or-more", "zero-or-more"].includes(contract.cardinality);
    const base = assignmentAuthorValuesSchema.properties.outputs.items;
    variants.push({
      ...base,
      required: [...base.required, ...(repeated ? ["handle"] : [])],
      properties: {
        slot: { const: template.handle },
        ...(repeated ? { handle: base.properties.handle } : {}),
        ...(template.type === trace?.requirement_type ? { links: base.properties.links, revision_of: base.properties.revision_of } : {}),
        payload: payloadSchema,
        body: base.properties.body,
      },
    });
    if (!contract.cardinality.startsWith("zero-")) {
      outputs.push({
        slot: template.handle,
        ...(repeated ? { handle: `${template.handle}-1` } : {}),
        payload: authorPayloadScaffold(template.payload ?? {}, [...fixed, ...managed]),
        body: "",
      });
    }
  }
  return {
    schema: {
      ...assignmentAuthorValuesSchema,
      description: "Author values for assignment submit-proposal. The CLI checks the full payload schema and Scenario after deriving fixed fields.",
      properties: {
        ...assignmentAuthorValuesSchema.properties,
        outputs: { type: "array", items: variants.length ? { oneOf: variants } : false },
      },
    },
    scaffold: { outputs, completionEvidence: null },
  };
}

function mergePayloadValues(
  base: Record<string, unknown>,
  authored: Record<string, unknown>,
): Record<string, unknown> {
  const merged = structuredClone(base);
  for (const [key, authoredValue] of Object.entries(authored)) {
    const authoredObject = object(authoredValue);
    const baseObject = object(merged[key]);
    merged[key] = authoredObject && baseObject
      ? mergePayloadValues(baseObject, authoredObject)
      : structuredClone(authoredValue);
  }
  return merged;
}

function assignmentResponseFromAuthorValues(
  exact: ExactAssignment,
  lease: AssignmentLease,
  authored: AssignmentAuthorValues,
): AssignmentResult<ProposalAssignmentResponse> {
  const scaffold = assignmentResponseSkeleton(exact, lease);
  if (!scaffold) {
    return failure(
      "assignment-response-scaffold-unavailable",
      "The exact Scenario cannot be represented by the v2 symbolic response contract",
      exact.lease.scenario,
    );
  }
  const assignmentPacket = packet(exact, lease);
  const materialization = exactBaselineMaterializationContract(exact.scenario);
  const templates = scaffold.proposal.outputs;
  const templateBySlot = new Map(templates.map((output) => [output.handle, output]));
  const templateHandleByInvocationAndOutput = new Map<string, string>();
  for (const template of templates) {
    const route = template.output ?? template.handle;
    const contract = assignmentPacket.outputs.find((candidate) =>
      candidate.handle === route
    );
    if (contract) {
      templateHandleByInvocationAndOutput.set(
        `${template.invocation ?? 0}:${contract.name}`,
        template.handle,
      );
    }
  }
  const suppliedBySlot = new Map<string, AssignmentAuthorValues["outputs"]>();
  const diagnostics: ProcessDiagnostic[] = [];

  for (const output of authored.outputs) {
    const template = templateBySlot.get(output.slot);
    if (!template) {
      diagnostics.push({
        code: "assignment-author-values-slot-invalid",
        path: `authorValues.outputs.${output.slot}`,
        message: `Authored output slot '${output.slot}' is not present in the active Assignment`,
      });
      continue;
    }
    const route = template.output ?? template.handle;
    const contract = assignmentPacket.outputs.find((candidate) =>
      candidate.handle === route
    );
    const isMaterialized = materialization?.output === contract?.name;
    if (isMaterialized) {
      diagnostics.push({
        code: "assignment-author-values-kernel-output",
        path: `authorValues.outputs.${output.slot}`,
        message: `Output slot '${output.slot}' is materialized by the kernel and cannot be supplied`,
      });
      continue;
    }
    const repeated = contract && ["one-or-more", "zero-or-more"].includes(
      contract.cardinality,
    );
    if (repeated && !output.handle) {
      diagnostics.push({
        code: "assignment-author-values-handle-required",
        path: `authorValues.outputs.${output.slot}.handle`,
        message: `Repeated output slot '${output.slot}' requires a response-local handle`,
      });
    } else if (!repeated && output.handle) {
      diagnostics.push({
        code: "assignment-author-values-handle-forbidden",
        path: `authorValues.outputs.${output.slot}.handle`,
        message: `Output slot '${output.slot}' has a fixed response handle`,
      });
    }
    suppliedBySlot.set(output.slot, [
      ...(suppliedBySlot.get(output.slot) ?? []),
      output,
    ]);
  }

  const omittedHandles = new Set(templates.flatMap((template) => {
    const route = template.output ?? template.handle;
    const contract = assignmentPacket.outputs.find((candidate) =>
      candidate.handle === route
    );
    return contract?.cardinality.startsWith("zero-") &&
        (suppliedBySlot.get(template.handle)?.length ?? 0) === 0
      ? [template.handle]
      : [];
  }));
  const activeTemplateLinks = (links: SymbolicProposalLink[]) => links.filter((link) =>
    !("output" in link.target && omittedHandles.has(link.target.output)) &&
    !("payload" in link.target && omittedHandles.has(link.target.payload.output))
  );
  const trace = requirementTraceBinding(exact.processPackage);
  const authoredHandleByTemplate = new Map<string, string>();

  const resultOutputs: SymbolicProposalOutput[] = [];
  for (const template of templates) {
    const route = template.output ?? template.handle;
    const contract = assignmentPacket.outputs.find((candidate) =>
      candidate.handle === route
    );
    if (!contract) continue;
    let supplied = suppliedBySlot.get(template.handle) ?? [];
    if ([trace?.type, trace?.scope_type].includes(template.type)) {
      if (supplied.length) diagnostics.push({code: "trace-generated-output", message: "Requirement sets and source scopes are generated by the CLI"});
      if (template.type === trace?.scope_type) continue;
      supplied = [{slot: template.handle, payload: {}, body: ""}];
    }
    const repeated = ["one-or-more", "zero-or-more"].includes(contract.cardinality);
    const definition = (Array.isArray(exact.scenario.outputs)
      ? exact.scenario.outputs.map(object)
      : []).find((candidate) => candidate?.name === contract.name);
    const invocationInputs = exact.dryRun.invocations[template.invocation ?? 0]
      ?.inputs ?? [];
    const requiredLinks = Array.isArray(definition?.required_links)
      ? definition.required_links.map(object)
      : [];
    const requiredLinkCount = requiredLinks.reduce((count, required) => {
      const target = object(required?.target);
      if (typeof target?.input !== "string") return count + 1;
      return count + (invocationInputs.find((input) =>
        input.name === target.input
      )?.values.length ?? 0);
    }, 0);
    const activeLinks = activeTemplateLinks(template.links);
    const permittedLinks = activeTemplateLinks(
      template.links.slice(requiredLinkCount),
    );
    if (permittedLinks.length > 0 && supplied.length > 0) {
      diagnostics.push({
        code: "assignment-proposal-routing-underdetermined",
        path: `authorValues.outputs.${template.handle}`,
        message: `Output slot '${template.handle}' has permitted link choices that author-only values cannot determine; use the full Assignment Response interface`,
      });
    }
    const distributedLinkTypes = new Set(requiredLinks
      .filter((required) =>
        ["partition", "cover"].includes(String(required?.distribution))
      )
      .map((required) => String(required!.link)));
    if (
      supplied.length > 1 &&
      activeLinks.some((link) => distributedLinkTypes.has(link.type))
    ) {
      diagnostics.push({
        code: "assignment-proposal-routing-underdetermined",
        path: `authorValues.outputs.${template.handle}`,
        message: `Repeated output slot '${template.handle}' has distributed link ownership that author-only values cannot determine; use the full Assignment Response interface`,
      });
    }
    if (!repeated && supplied.length > 1) {
      diagnostics.push({
        code: "assignment-author-values-slot-duplicate",
        path: `authorValues.outputs.${template.handle}`,
        message: `Authored output slot '${template.handle}' may appear only once`,
      });
      continue;
    }
    if (materialization?.output === contract.name) {
      const invocation = template.invocation ?? 0;
      const subject = inputEntities(exact, materialization.subjectInput, invocation)[0];
      const materialized = subject?.identity.revision_id
        ? exactBaselineProposal(
            template.type,
            subject,
            inputEntities(exact, materialization.supportInput, invocation),
            materialization,
            invocation,
          ).outputs[0]
        : undefined;
      if (!materialized) {
        diagnostics.push({
          code: "kernel-materialization-input-invalid",
          path: `proposal.outputs.${template.handle}`,
          message: `Kernel could not materialize output slot '${template.handle}' from the active Assignment`,
        });
        continue;
      }
      resultOutputs.push({
        ...template,
        payload: materialized.lifecycleDatum.payload,
        body: materialized.lifecycleDatum.body,
      });
      continue;
    }
    if (supplied.length === 0) {
      if (contract.cardinality.startsWith("zero-")) {
        resultOutputs.push(template);
      } else {
        diagnostics.push({
          code: "assignment-author-values-slot-required",
          path: `authorValues.outputs.${template.handle}`,
          message: `Authored output slot '${template.handle}' is required by the active Assignment`,
        });
      }
      continue;
    }
    if (repeated && supplied.length === 1) {
      authoredHandleByTemplate.set(template.handle, supplied[0]!.handle!);
    }
    for (const value of supplied) {
      const invocation = template.invocation ?? 0;
      const fixedPayload = assignmentRequiredPayload(
        exact,
        definition,
        invocation,
        (output) =>
          templateHandleByInvocationAndOutput.get(`${invocation}:${output}`) ??
          output,
      );
      const { fixed, managed } = authorPayloadOwnership(contract, template);
      for (const suppliedPath of payloadPaths(value.payload)) {
        const fixedPath = fixed.find((candidate) =>
          protectedPayloadPath(suppliedPath, candidate)
        );
        const managedPath = managed.find((candidate) =>
          protectedPayloadPath(suppliedPath, candidate)
        );
        if (fixedPath || managedPath) {
          diagnostics.push({
            code: fixedPath
              ? "assignment-author-values-fixed-payload"
              : "assignment-author-values-kernel-payload",
            path: `authorValues.outputs.${value.slot}.payload.${suppliedPath}`,
            message: fixedPath
              ? `Payload '${fixedPath}' is fixed by the active Scenario and cannot be supplied`
              : `Payload '${managedPath}' is managed by the kernel and cannot be supplied`,
          });
        }
      }
      resultOutputs.push({
        ...template,
        handle: repeated ? value.handle! : template.handle,
        ...(value.revision_of ? {revision_of: value.revision_of} : {}),
        links: [...template.links, ...(value.links ?? [])],
        payload: mergePayloadValues(
          mergePayloadValues(
            template.payload ?? {},
            nestedPayloadValues(fixedPayload),
          ),
          value.payload,
        ),
        body: value.body,
      });
    }
  }
  const handles = resultOutputs.map((output) => output.handle);
  if (new Set(handles).size !== handles.length) {
    diagnostics.push({
      code: "assignment-author-values-handle-duplicate",
      path: "authorValues.outputs",
      message: "Authored response-local handles must be unique",
    });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const routedOutputs = resultOutputs.map((output) => ({
    ...output,
    links: output.links.map((link) => {
      if ("output" in link.target) {
        return {
          ...link,
          target: {
            output: authoredHandleByTemplate.get(link.target.output) ??
              link.target.output,
          },
        };
      }
      if ("payload" in link.target) {
        return {
          ...link,
          target: {
            payload: {
              ...link.target.payload,
              output: authoredHandleByTemplate.get(link.target.payload.output) ??
                link.target.payload.output,
            },
          },
        };
      }
      return link;
    }),
  }));
  return {
    ok: true,
    value: {
      ...scaffold,
      proposal: {
        outputs: routedOutputs,
        completionEvidence: authored.completionEvidence,
      },
    },
    diagnostics: [],
  };
}

type ProjectedTypeSchema = {
  type: string;
  envelope: Record<string, unknown>;
  payload: Record<string, unknown>;
  outgoingLinks: Record<string, unknown>[];
  payloadCollections?: PayloadCollection[];
  payloadViews?: PayloadView[];
};

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
            ...(resolved.type.payloadCollections.length ? { payloadCollections: resolved.type.payloadCollections } : {}),
            ...(resolved.type.payloadViews.length ? { payloadViews: resolved.type.payloadViews } : {}),
          },
        ]
      : [];
  });
}

function inputSchemas(
  processPackage: ProcessPackage,
  dryRun: ScenarioDryRun,
): ProjectedTypeSchema[] {
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
): ProjectedTypeSchema[] {
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
  const materialization = exactBaselineMaterializationContract(scenario);
  if (dryRun.invocations.length === 0) return undefined;
  const plan = processPackage.constraintContract?.assignmentPlans[scenario.id];
  if (!plan) return undefined;
  const outputByName = new Map(dryRun.expectedOutputs.map((output) => [
    output.name,
    output,
  ]));
  if (
    outputByName.size !== dryRun.expectedOutputs.length ||
    plan.outputs.length !== dryRun.expectedOutputs.length ||
    plan.outputs.some((route) => !outputByName.has(route.output))
  ) return undefined;
  const routesByName = new Map(plan.outputs.map((route) => [
    route.output,
    route,
  ]));

  const outputs: AssignmentResponseSkeleton["proposal"]["outputs"] = [];
  const batched = dryRun.invocations.length > 1;
  const responseHandle = (invocation: number, output: string) =>
    batched ? `invocation-${invocation + 1}-${output}` : output;
  const routeType = (
    route: AssignmentOutputRoute,
    invocation: ScenarioDryRunInvocation,
  ): string | undefined => {
    const typeRoute = route.type;
    if (typeRoute.kind === "declared") return typeRoute.type;
    const input = invocation.inputs.find((candidate) =>
      candidate.name === typeRoute.input
    );
    if (typeRoute.kind === "invocation-input-payload") {
      let bound: unknown = input?.values.length === 1
        ? object(input.values[0]!.data)?.payload
        : undefined;
      for (const segment of typeRoute.path.split(".")) {
        bound = object(bound)?.[segment];
      }
      return typeof bound === "string" && typeRoute.types.includes(bound)
        ? bound
        : undefined;
    }
    const bound = input?.values.length === 1
      ? input.values[0]!.identity.type
      : undefined;
    return bound && typeRoute.types.includes(bound) ? bound : undefined;
  };
  for (const [invocationIndex, invocation] of dryRun.invocations.entries()) {
    for (const route of plan.outputs) {
      const expected = outputByName.get(route.output)!;
      const outputDefinition = (Array.isArray(scenario.outputs)
        ? scenario.outputs.map(object)
        : []).find((candidate) => candidate?.name === route.output);
      const sourceType = routeType(route, invocation);
      if (!sourceType) return undefined;

      const links: SymbolicProposalLink[] = [];
      for (const required of route.links) {
        if (required.target.kind === "input") {
          const inputName = required.target.input;
          const input = invocation.inputs.find((candidate) =>
            candidate.name === inputName
          );
          if (!input) return undefined;
          for (const value of input.values) {
            const identity = requiredLinkIdentity(
              processPackage,
              sourceType,
              required.link,
              value.identity.type,
            );
            if (!identity) return undefined;
            const datum = identity === "id"
              ? value.identity.id
              : value.identity.revision_id;
            if (!datum) return undefined;
            links.push({
              type: required.link,
              target: input.values.length === 1
                ? { input: inputName }
                : { datum },
            });
          }
          continue;
        }
        const targetRoute = routesByName.get(required.target.output);
        if (!targetRoute) return undefined;
        if (required.target.kind === "output") {
          const targetType = routeType(targetRoute, invocation);
          if (!targetType) return undefined;
          const identity = requiredLinkIdentity(
            processPackage,
            sourceType,
            required.link,
            targetType,
          );
          if (!identity) return undefined;
          links.push({
            type: required.link,
            target: {
              output: responseHandle(
                invocationIndex,
                targetRoute.handle,
              ),
            },
          });
          continue;
        }
        links.push({
          type: required.link,
          target: {
            payload: {
              output: responseHandle(invocationIndex, targetRoute.handle),
              path: required.target.path,
            },
          },
        });
      }
      const repeated = ["one-or-more", "zero-or-more"].includes(expected.cardinality);
      const resolved = resolveType(processPackage, sourceType);
      if (!resolved.ok) return undefined;
      const payloadSummary = assignmentPayloadSummary(
        resolved.type.payloadSchema,
        materialization?.output === route.output
          ? Object.values(materialization.payloadFields)
          : resolved.type.kernelManagedPayloadPaths,
      );
      const identityInput = object(outputDefinition?.identity_from)?.input;
      const identityPayload = typeof identityInput === "string"
        ? object(invocation.inputs.find((input) => input.name === identityInput)
          ?.values[0]?.data.payload) ?? {}
        : {};
      const requiredPayload = assignmentRequiredPayload(
        exact,
        outputDefinition,
        invocationIndex,
        (output) => {
          const target = routesByName.get(output);
          return target
            ? responseHandle(invocationIndex, target.handle)
            : output;
        },
      ) as Record<string, unknown>;
      outputs.push({
        handle: responseHandle(invocationIndex, route.handle),
        ...(repeated || batched ? { output: route.handle } : {}),
        ...(batched ? { invocation: invocationIndex } : {}),
        type: sourceType,
        payload: expected.cardinality.startsWith("zero-")
          ? null
          : assignmentPayloadScaffold(
            payloadSummary,
            { ...identityPayload, ...requiredPayload },
            requiredPayload,
          ),
        links,
        body: null,
      });
    }
  }

  return {
    contract: "mdlm-assignment-response@2",
    assignment: lease.id,
    kind: "proposal",
    proposal: {
      outputs,
      completionEvidence: null,
    },
  };
}

function internalLinkTarget(
  exact: ExactAssignment,
  sourceType: string,
  link: SymbolicProposalLink,
  outputTypes: Map<string, string>,
  responseOutputs: SymbolicProposalOutput[],
  invocation: number,
): string | undefined {
  if ("datum" in link.target) return link.target.datum;
  if ("input" in link.target) {
    const inputName = link.target.input;
    const values = inputEntities(exact, inputName, invocation);
    if (values.length !== 1) return undefined;
    const value = values[0]!;
    const identity = requiredLinkIdentity(
      exact.processPackage,
      sourceType,
      link.type,
      value.identity.type,
    );
    return identity === "id"
      ? value.identity.id
      : identity === "revision_id"
      ? value.identity.revision_id
      : undefined;
  }
  if ("payload" in link.target) {
    const payloadTarget = link.target.payload;
    const output = responseOutputs.find((candidate) =>
      candidate.handle === payloadTarget.output
    );
    let value: unknown = output?.payload;
    for (const segment of payloadTarget.path.split(".")) {
      value = object(value)?.[segment];
    }
    return typeof value === "string" ? value : undefined;
  }
  const targetType = outputTypes.get(link.target.output);
  if (!targetType) return undefined;
  const identity = requiredLinkIdentity(
    exact.processPackage,
    sourceType,
    link.type,
    targetType,
  );
  return identity
    ? `$proposal.${link.target.output}.${identity}`
    : undefined;
}

function internalPayloadReferences(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => internalPayloadReferences(item));
  }
  const record = object(value);
  if (!record) return value;
  const entries = Object.entries(record);
  if (
    entries.length === 1 &&
    typeof record.output === "string"
  ) {
    return `$proposal.${record.output}.revision_id`;
  }
  return Object.fromEntries(entries.map(([key, item]) => [
    key,
    internalPayloadReferences(item),
  ]));
}

function publicPayloadReferences(
  value: unknown,
  outputHandle: (output: string) => string = (output) => output,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => publicPayloadReferences(item, outputHandle));
  }
  if (typeof value === "string") {
    const match = /^\$proposal\.([A-Za-z][A-Za-z0-9_-]*)\.revision_id$/.exec(value);
    return match ? { output: outputHandle(match[1]!) } : value;
  }
  const valueRecord = object(value);
  return valueRecord
    ? Object.fromEntries(Object.entries(valueRecord).map(([key, item]) => [
        key,
        publicPayloadReferences(item, outputHandle),
      ]))
    : value;
}

function publicRequiredPayloadReferences(
  requiredPayload: Record<string, unknown>,
  outputHandle: (output: string) => string = (output) => output,
  inputValue: (input: string, payloadPath?: string) => unknown =
    (input, payloadPath) => payloadPath
      ? { input, payload: payloadPath }
      : { input, identity: "revision_id" },
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(requiredPayload).map(([path, value]) => {
    const inputName = scenarioInputRevisionReference(value);
    const inputPayload = scenarioInputPayloadReference(value);
    return [
      path,
      inputName
        ? inputValue(inputName)
        : inputPayload
        ? inputValue(inputPayload.input, inputPayload.path)
        : publicPayloadReferences(value, outputHandle),
    ];
  }));
}

function assignmentRequiredPayload(
  exact: ExactAssignment,
  outputDefinition: Record<string, unknown> | undefined,
  invocation: number,
  outputHandle: (output: string) => string,
): Record<string, unknown> {
  return publicRequiredPayloadReferences(
    object(outputDefinition?.required_payload) ?? {},
    outputHandle,
    (inputName, payloadPath) => {
      const input = exact.dryRun.invocations[invocation]?.inputs.find(
        (candidate) => candidate.name === inputName,
      )?.values[0];
      if (payloadPath) {
        return payloadPath.split(".").reduce<unknown>(
          (current, segment) => object(current)?.[segment],
          input?.data.payload,
        );
      }
      return input?.identity.revision_id;
    },
  );
}

function scenarioProposalFromResponse(
  exact: ExactAssignment,
  lease: AssignmentLease,
  response: ProposalAssignmentResponse,
): AssignmentResult<ScenarioProposal> {
  const scaffold = assignmentResponseSkeleton(exact, lease);
  if (!scaffold) {
    return failure(
      "assignment-response-scaffold-unavailable",
      "The exact Scenario cannot be represented by the v2 symbolic response contract",
      exact.lease.scenario,
    );
  }
  const outputDefinitions = Array.isArray(exact.scenario.outputs)
    ? exact.scenario.outputs.map(object)
    : [];
  const handleByName = new Map(outputDefinitions.flatMap((definition) =>
    typeof definition?.name === "string"
      ? [[definition.name, typeof definition.handle === "string"
        ? definition.handle
        : definition.name] as const]
      : []
  ));
  const batched = exact.dryRun.invocations.length > 1;
  const responseInvocation = (output: SymbolicProposalOutput): number =>
    output.invocation ?? 0;
  const responseOutput = (output: SymbolicProposalOutput): string =>
    output.output ?? output.handle;
  const responseKey = (output: SymbolicProposalOutput): string =>
    `${responseInvocation(output)}:${responseOutput(output)}`;
  const supplied = new Map<string, SymbolicProposalOutput>();
  for (const output of response.proposal.outputs) {
    if (supplied.has(output.handle)) {
      return failure(
        "assignment-response-handle-duplicate",
        `Assignment Response repeats symbolic output handle '${output.handle}'`,
        `proposal.outputs.${output.handle}`,
      );
    }
    supplied.set(output.handle, output);
  }
  const expected = new Map(scaffold.proposal.outputs.map((output) => [
    responseKey(output),
    output,
  ]));
  const unexpected = [...supplied.values()]
    .filter((output) =>
      (batched && output.invocation === undefined) || !expected.has(responseKey(output))
    )
    .map((output) => responseKey(output));
  const missing = [...expected.entries()]
    .filter(([key, output]) =>
      exact.dryRun.expectedOutputs.find((candidate) =>
        (handleByName.get(candidate.name) ?? candidate.name) ===
          responseOutput(output)
      )?.cardinality === "one" &&
      ![...supplied.values()].some((value) => responseKey(value) === key)
    )
    .map(([key]) => key);
  if (unexpected.length > 0 || missing.length > 0) {
    return failure(
      "assignment-response-handles-invalid",
      `Assignment Response handles must match the packet; missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(unexpected)}`,
      "proposal.outputs",
    );
  }
  const outputTypes = new Map(response.proposal.outputs.map((output) => [
    output.handle,
    output.type,
  ]));
  const omittedOutputs = new Set(scaffold.proposal.outputs.flatMap((expectedOutput) => {
    const contract = exact.dryRun.expectedOutputs.find((candidate) =>
      (handleByName.get(candidate.name) ?? candidate.name) ===
        responseOutput(expectedOutput)
    );
    if (!contract?.cardinality.startsWith("zero-")) return [];
    const values = response.proposal.outputs.filter((output) =>
      responseKey(output) === responseKey(expectedOutput)
    );
    return values.every((output) => output.payload === null && output.body === null)
      ? [expectedOutput.handle]
      : [];
  }));
  const activeLinks = (links: SymbolicProposalLink[]) => links.filter((link) =>
    !("output" in link.target && omittedOutputs.has(link.target.output)) &&
    !("payload" in link.target &&
      omittedOutputs.has(link.target.payload.output))
  );
  const materialization = exactBaselineMaterializationContract(exact.scenario);
  const outputs: ScenarioProposal["outputs"] = [];
  for (const output of response.proposal.outputs) {
    const invocation = responseInvocation(output);
    const expectedOutput = expected.get(responseKey(output))!;
    const outputContract = exact.dryRun.expectedOutputs.find((candidate) =>
      (handleByName.get(candidate.name) ?? candidate.name) === responseOutput(output)
    )!;
    if (output.type !== expectedOutput.type) {
      return failure(
        "assignment-response-type-invalid",
        `Symbolic output '${output.handle}' must use type '${expectedOutput.type}'`,
        `proposal.outputs.${output.handle}.type`,
      );
    }
    const definition = outputDefinitions.find((candidate) =>
      candidate?.name === outputContract.name
    );
    const distributedLinkTypes = new Set(
      (Array.isArray(definition?.required_links) ? definition.required_links : [])
        .map(object)
        .filter((required) =>
          ["partition", "cover"].includes(String(required?.distribution))
        )
        .map((required) => String(required!.link)),
    );
    const fixedLinks = (links: SymbolicProposalLink[]) => links.filter((link) =>
      !distributedLinkTypes.has(link.type)
    );
    const declaredLinkTypes = new Set(
      expected.get(responseKey(output))!.links.map((link) => link.type),
    );
    const invocationInputs = exact.dryRun.invocations[invocation]?.inputs ?? [];
    const requiredLinkCount = (Array.isArray(definition?.required_links)
      ? definition.required_links
      : []).reduce((count, value) => {
        const target = object(object(value)?.target);
        if (typeof target?.input !== "string") return count + 1;
        return count + (invocationInputs.find((input) =>
          input.name === target.input
        )?.values.length ?? 0);
      }, 0);
    const requiredExpected = fixedLinks(activeLinks(
      expectedOutput.links.slice(0, requiredLinkCount),
    ));
    const permittedExpected = new Set(
      activeLinks(expectedOutput.links.slice(requiredLinkCount))
        .map((link) => JSON.stringify(link)),
    );
    const trace = requirementTraceBinding(exact.processPackage);
    const decomposition = output.type === trace?.requirement_type ? output.links.filter((l) => l.type === "decomposes") : [];
    const activeActual = activeLinks(output.links.filter((l) => !decomposition.includes(l)));
    const permittedActual = activeActual
      .map((link) => JSON.stringify(link))
      .filter((link) => permittedExpected.has(link));
    const requiredActual = fixedLinks(activeActual.filter((link) =>
      !permittedExpected.has(JSON.stringify(link))
    ));
    if (
      output.links.some((link) => !decomposition.includes(link) && !declaredLinkTypes.has(link.type)) ||
      JSON.stringify(requiredActual) !== JSON.stringify(requiredExpected) ||
      new Set(permittedActual).size !== permittedActual.length ||
      permittedActual.some((link) => !permittedExpected.has(link))
    ) {
      return failure(
        "assignment-response-links-invalid",
        `Symbolic output '${output.handle}' must preserve the exact links in the Assignment packet`,
        `proposal.outputs.${output.handle}.links`,
      );
    }
    const authoredPayload = output.payload;
    const authoredBody = output.body;
    const payloadOmitted = authoredPayload === null;
    const bodyOmitted = authoredBody === null;
    if (payloadOmitted || bodyOmitted) {
      if (
        payloadOmitted
        && bodyOmitted
        && outputContract.cardinality.startsWith("zero-")
      ) continue;
      return failure(
        "assignment-response-output-omission-invalid",
        `Symbolic output '${output.handle}' may use a null payload and body only for an optional output`,
        `proposal.outputs.${output.handle}`,
      );
    }
    const links = activeLinks(output.links).map((link) => ({
      type: link.type,
      target: internalLinkTarget(
        exact,
        output.type,
        link,
        outputTypes,
        response.proposal.outputs,
        invocation,
      ),
    }));
    if (links.some((link) => link.target === undefined)) {
      return failure(
        "assignment-response-link-unresolved",
        `Kernel could not resolve a required link for symbolic output '${output.handle}'`,
        `proposal.outputs.${output.handle}.links`,
      );
    }
    const subject = materialization &&
        outputContract.name === materialization.output
      ? inputEntities(exact, materialization.subjectInput, invocation)[0]
      : undefined;
    const kernelPayload = materialization && subject?.identity.revision_id
      ? exactBaselineProposal(
          output.type,
          subject,
          inputEntities(exact, materialization.supportInput, invocation),
          materialization,
          invocation,
        ).outputs[0]?.lifecycleDatum.payload
      : undefined;
    let revisionId: string | undefined;
    if (output.revision_of) {
      const previous = exact.snapshot.records.find((r) => r.datum.revision_id === output.revision_of)?.datum;
      const inputs = invocationInputs.flatMap((i) => i.values.map((v) => v.identity.revision_id));
      const selected = exact.snapshot.records.filter((r) => inputs.includes(r.datum.revision_id) && r.datum.type === trace?.type);
      if (output.type !== trace?.requirement_type || !previous || !selected.some((r) => r.datum.links.some((l) => l.type === "contains" && l.target === previous.revision_id))) return failure("trace-revision-outside-selection", "revision_of must name an exact requirement in the Assignment's selected input graph");
      revisionId = previous.id;
    }
    outputs.push({
      localId: output.handle,
      name: outputContract.name,
      invocation,
      lifecycleDatum: {
        ...(revisionId ? {id: revisionId} : {}),
        type: output.type,
        payload: kernelPayload ?? internalPayloadReferences(authoredPayload) as Record<string, unknown>,
        links: links as { type: string; target: string }[],
        body: authoredBody,
      },
    });
  }
  return {
    ok: true,
    value: { outputs, completionEvidence: response.proposal.completionEvidence },
    diagnostics: [],
  };
}

function packet(
  exact: ExactAssignment,
  lease: AssignmentLease,
): AssignmentPacket {
  const participation = exact.dryRun.participation ?? [];
  const responseSkeleton = assignmentResponseSkeleton(exact, lease);
  const outputHandles = new Map(
    (Array.isArray(exact.scenario.outputs) ? exact.scenario.outputs : [])
      .map(object)
      .filter((output) => typeof output?.name === "string")
      .map((output) => [
        String(output!.name),
        typeof output!.handle === "string"
          ? output!.handle
          : String(output!.name),
      ]),
  );
  const scaffoldTypes = new Map(
    responseSkeleton?.proposal.outputs.map((output) => [
      output.output ?? output.handle,
      output.type,
    ]),
  );
  if (!responseSkeleton) {
    throw new Error(`Scenario '${exact.lease.scenario}' cannot render one symbolic Assignment response`);
  }
  const schemas = Object.fromEntries(
    [...inputSchemas(exact.processPackage, exact.dryRun), ...outputSchemas(exact.processPackage, exact.dryRun)]
      .map(({ type, ...schema }) => [type, schema]),
  );
  const { skills, ...prompt } = exact.dryRun.prompt;
  const materialization = exactBaselineMaterializationContract(exact.scenario);
  const work = exact.lease.obligation
    ? { kind: "obligation" as const, ...exact.lease.obligation }
    : exact.lease.request
    ? {kind: "explicit-request" as const, ...exact.lease.request, definition: exact.lease.scenario}
    : {
        kind: "phase-progression" as const,
        instance: exact.lease.progression!.instance,
        definition: exact.lease.progression!.nextPhase,
        subject: exact.lease.progression!.subjects[0] ?? exact.lease.phase,
      };
  const rendered: AssignmentPacket = {
    contract: "mdlm-assignment-packet@3",
    assignment: { id: lease.id },
    package: exact.lease.package,
    repository: exact.lease.repository,
    phase: exact.lease.phase,
    work,
    scenario: {
      reference: exact.lease.scenario,
      definition: { id: exact.scenario.id, version: exact.scenario.version },
      prompt,
      skills,
    },
    ...(verificationContract(exact.scenario) ? {execution: {command: ["mdlm", "assignment", "run", "--json"], receipt: "Read the returned immutable Git receipt; submit only assessment and diagnosis."}} : {}),
    exactInputs: exact.dryRun.invocations,
    schemas,
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
    outputs: exact.dryRun.expectedOutputs.map(({ types, ...output }) => {
      const definition = (Array.isArray(exact.scenario.outputs)
        ? exact.scenario.outputs.map(object)
        : []).find((candidate) => candidate?.name === output.name);
      const identityFrom = object(definition?.identity_from);
      const requiredPayload = publicRequiredPayloadReferences(
        object(definition?.required_payload) ?? {},
        (outputName) => outputHandles.get(outputName) ?? outputName,
      ) as Record<string, unknown>;
      const handle = outputHandles.get(output.name) ?? output.name;
      const type = scaffoldTypes.get(handle)!;
      const resolved = resolveType(exact.processPackage, type);
      return {
        ...output,
        handle,
        type,
        ...(typeof identityFrom?.input === "string"
          ? { identity: { input: identityFrom.input } }
          : {}),
        payloadSummary: assignmentPayloadSummary(
          schemas[type]!.payload,
          materialization?.output === output.name
            ? Object.values(materialization.payloadFields)
            : resolved.ok ? resolved.type.kernelManagedPayloadPaths : [],
          requiredPayload,
        ),
      };
    }),
    completion: exact.dryRun.completion,
    responseSchema: assignmentResponseSchema(lease.id),
    responseScaffold: responseSkeleton,
    ...(exact.classification.kind === "attention-required" &&
        exact.classification.checkpointConversation
      ? {
          checkpointConversation:
            exact.classification.checkpointConversation,
        }
      : {}),
  };
  const traceBinding = requirementTraceBinding(exact.processPackage);
  if (traceBinding) {
    const data = exact.snapshot.records.map((r) => r.datum);
    const inputIds = new Set(exact.dryRun.invocations.flatMap((i) => i.inputs.flatMap((input) => input.values.map((v) => v.identity.revision_id))));
    const sets = data.filter((d) => d.type === traceBinding.type && (inputIds.has(d.revision_id) || data.some((i) => inputIds.has(i.revision_id) && i.links.some((l) => l.target === d.revision_id))));
    rendered.sourceScopes = data.filter((d) => d.type === traceBinding.implementation_type && inputIds.has(d.revision_id)).map((implementation) => {
      const baseline = object(implementation.payload.source_changes)?.baseline_implementation;
      return {implementation: implementation.revision_id, scopes: data.filter((d) => d.type === traceBinding.scope_type && d.links.some((l) => l.type === "belongs-to" && l.target === implementation.revision_id)).map((d) => ({revision: d.revision_id, payload: d.payload, links: d.links})), changes: implementation.payload.source_changes ?? null, comparison: typeof baseline === "string" ? compareImplementationScopes(data, traceBinding, baseline, implementation.revision_id) : null};
    });
    rendered.requirementGraphs = sets.map((set) => {
      const graph = selectedRequirementGraph(data, set, traceBinding);
      return {selection: set.revision_id, requirements: graph.requirements.map((d) => ({id: d.id, revision: d.revision_id, payload: d.payload, links: d.links, leaf: graph.leaves.has(d.revision_id)}))};
    });
  }
  const authorValues = authorValuesContract(rendered, materialization?.output, requirementTraceBinding(exact.processPackage));
  rendered.authorValuesSchema = authorValues.schema;
  rendered.authorValuesScaffold = authorValues.scaffold;
  assertAssignmentPacketV3(rendered);
  return rendered;
}

/** Keep every real claim on the same serialized seam frozen by the v2 fixtures. */
export function assertAssignmentPacketV3(value: unknown): asserts value is AssignmentPacket {
  const candidate = object(value);
  const scenario = object(candidate?.scenario);
  const scaffold = object(candidate?.responseScaffold);
  const required = [
    "assignment",
    "package",
    "repository",
    "phase",
    "work",
    "scenario",
    "exactInputs",
    "schemas",
    "outputs",
    "policies",
    "participation",
    "authority",
    "prohibitions",
    "completion",
    "responseScaffold",
    "responseSchema",
  ];
  if (
    candidate?.contract !== "mdlm-assignment-packet@3" ||
    required.some((key) => !(key in candidate)) ||
    !scenario || !("prompt" in scenario) || !("skills" in scenario) ||
    scaffold?.contract !== "mdlm-assignment-response@2" ||
    "allowedProjections" in candidate || "outputLinks" in candidate ||
    "prompt" in candidate || "obligation" in candidate || "progression" in candidate
  ) {
    throw new Error("Assignment packet does not satisfy mdlm-assignment-packet@3");
  }
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

function rejectedSubmission(
  assignmentId: string,
  responseSource: string,
  diagnostics: ProcessDiagnostic[],
  retryable: boolean,
): Extract<SubmissionOutcome, { outcome: "rejected" }> {
  return {
    contract: "mdlm-submission-outcome@1",
    outcome: "rejected",
    assignment: { id: assignmentId },
    responseDigest: sha256(responseSource),
    diagnostics,
    retryable,
    correctionConsumed: false,
  };
}

function pendingSettlementSubmission(
  pending: PendingSettlement,
): AssignmentSubmissionResult {
  const diagnostics = [{
    code: "submission-settlement-required",
    path: pending.execution,
    message: "The prior submission has uncertain publication closure; inspect its stable settlement identity and do not replay it",
  }];
  return {
    ok: false,
    value: {
      contract: "mdlm-submission-outcome@1",
      outcome: "settlement-required",
      assignment: { id: pending.assignment },
      responseDigest: pending.responseDigest,
      settlement: {
        assignment: pending.assignment,
        execution: pending.execution,
      },
      reason: "publication-closure-uncertain",
      orchestration: { action: "inspect-settlement", replay: false },
    },
    diagnostics,
  };
}

async function reconcilePendingSettlement(
  repositoryRoot: string,
  pending: PendingSettlement,
): Promise<AssignmentResult<SubmissionOutcome>> {
  const executionPath = path.join(
    repositoryRoot,
    ".lifecycle/data/.transactions",
    pending.execution,
    "execution.json",
  );
  try {
    await fs.access(executionPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: true,
        value: pendingSettlementSubmission(pending).value!,
        diagnostics: [],
      };
    }
    throw error;
  }
  const execution = await readScenarioExecution(repositoryRoot, pending.execution);
  if (!execution.ok) {
    return failure(
      "submission-settlement-integrity-invalid",
      "The durable settlement names a transaction that cannot be authenticated",
      pending.execution,
    );
  }
  if (
    execution.value.response.assignment !== pending.assignment ||
    execution.value.response.digest !== pending.responseDigest
  ) {
    return failure(
      "submission-settlement-integrity-invalid",
      "The durable settlement does not match its published transaction identity",
      pending.execution,
    );
  }
  return {
    ok: true,
    value: acceptedSettlement(execution.value),
    diagnostics: [],
  };
}

async function writeMalformedResponse(
  _repositoryRoot: string,
  lease: AssignmentLease,
  _responseSource: string,
  diagnostics: ProcessDiagnostic[],
  _renew: () => Promise<void>,
): Promise<AssignmentSubmissionResult> {
  return {
    ok: false,
    value: rejectedSubmission(lease.id, _responseSource, diagnostics, true),
    disposition: {
      ...dispositionBase(lease.id),
      disposition: "correction-required",
      orchestration: {
        action: "correct-response",
        automaticReplacement: false,
      },
      malformedResponse: {
        attempt: 1,
        correctionsRemaining: 1,
        diagnostics,
      },
    },
    diagnostics,
  };
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
    value: rejectedSubmission(lease.id, "", diagnostics, false),
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
  const diagnostics = unable.diagnostics.length > 0
    ? unable.diagnostics
    : [{
        code: "assignment-unable",
        message: `Assignment could not complete: ${unable.reason}`,
      }];
  return {
    ok: false,
    value: rejectedSubmission(lease.id, responseSource, diagnostics, false),
    diagnostics,
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
  authoritySupplies: string[] = [],
): Promise<AssignmentSubmissionResult> {
  const parsed = parseAssignmentResponse(responseSource);
  if (parsed.ok) {
    const pending = await readPendingSettlement(repositoryRoot, parsed.value.assignment);
    if (pending) {
      const reconciled = await reconcilePendingSettlement(repositoryRoot, pending);
      if (!reconciled.ok) return reconciled;
      if (reconciled.value.outcome === "accepted") {
        return sha256(responseSource) === pending.responseDigest
          ? reconciled
          : failure(
            "submission-settlement-response-mismatch",
            "The submitted response bytes do not match the accepted settlement",
            pending.execution,
          );
      }
      return pendingSettlementSubmission(pending);
    }
  }
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
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
  const pendingSettlement = await readPendingSettlement(
    repositoryRoot,
    parsed.value.assignment,
  );
  if (pendingSettlement) return pendingSettlementSubmission(pendingSettlement);
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
  const normalized = scenarioProposalFromResponse(
    exact.value,
    lease,
    parsed.value,
  );
  if (!normalized.ok) {
    return recordMalformedResponse(
      repositoryRoot,
      lease,
      responseSource,
      normalized.diagnostics,
    );
  }
  const proposal = normalized.value;
  const responseDigest = sha256(responseSource);
  const executionId = settlementIdentity(`${lease.id}:${responseDigest}`);
  const submission = {
    scenarioReference: exact.value.lease.scenario,
    proposal: {
      outputs: proposal.outputs,
      completionEvidence: proposal.completionEvidence,
    },
    assignment: lease.id,
    responseDigest,
    suppliedAuthorities: [
      ...new Set([
        ...(exact.value.dryRun.participation?.flatMap((item) =>
          item.authorityRequirement.mode === "delegated"
            ? [item.authorityRequirement.authority]
            : []
        ) ?? []),
        ...authoritySupplies,
      ]),
    ],
    suppliedDelegations: [],
    loadedSkillRefs: exact.value.dryRun.prompt.skills.map((skill) => skill.reference),
  };
  return withExactActiveLease(repositoryRoot, lease, async (lease, renew) => {
    const lockedPendingSettlement = await readPendingSettlement(repositoryRoot, lease.id);
    if (lockedPendingSettlement) {
      const reconciled = await reconcilePendingSettlement(
        repositoryRoot,
        lockedPendingSettlement,
      );
      if (!reconciled.ok) return reconciled;
      if (reconciled.value.outcome === "accepted") {
        return responseDigest === lockedPendingSettlement.responseDigest
          ? reconciled
          : failure(
            "submission-settlement-response-mismatch",
            "The submitted response bytes do not match the accepted settlement",
            lockedPendingSettlement.execution,
          );
      }
      return pendingSettlementSubmission(lockedPendingSettlement);
    }
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
    const prepared = {
      ...preparedScenarioSubmission(
        repositoryRoot,
        exact.value,
        verifyAssignment,
      ),
      executionId,
      beginPublication: async (publishedExecution: string, publishedDigest: string) => {
        await renew();
        await writePendingSettlement(repositoryRoot, {
          contract: "mdlm-pending-settlement@1",
          assignment: lease.id,
          execution: publishedExecution,
          responseDigest: publishedDigest,
        });
      },
    };
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
      )) {
        return {
          ok: false,
          value: {
            contract: "mdlm-submission-outcome@1",
            outcome: "settlement-required",
            assignment: { id: lease.id },
            responseDigest,
            settlement: { assignment: lease.id, execution: executionId },
            reason: "publication-closure-uncertain",
            orchestration: { action: "inspect-settlement", replay: false },
          },
          diagnostics: submitted.diagnostics,
        };
      }
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
    await fs.rm(settlementPath(repositoryRoot), { force: true });
    const execution = submitted.value;
    return {
      ok: true,
      value: {
        contract: "mdlm-submission-outcome@1",
        outcome: "accepted",
        assignment: { id: lease.id },
        responseDigest,
        settlement: { assignment: lease.id, execution: executionId },
        receipt: {
          publications: execution.outputs.map((output, index) => ({
            handle: output.handle ?? proposal.outputs[index]?.localId ?? output.name,
            stableId: output.lifecycleDatum.id,
            revisionId: output.lifecycleDatum.revisionId,
          })),
        },
      },
      diagnostics: [],
    };
  });
}

function settlementIdentity(identity: string): string {
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20)}`;
}

function acceptedSettlement(
  execution: ScenarioExecution,
): Extract<SubmissionOutcome, { outcome: "accepted" }> {
  return {
    contract: "mdlm-submission-outcome@1",
    outcome: "accepted",
    assignment: { id: execution.response.assignment },
    responseDigest: execution.response.digest,
    settlement: {
      assignment: execution.response.assignment,
      execution: execution.id,
    },
    receipt: {
      publications: execution.outputs.map((output) => ({
        handle: output.handle,
        stableId: output.lifecycleDatum.id,
        revisionId: output.lifecycleDatum.revisionId,
      })),
    },
  };
}

/** Reconcile submission closure from immutable execution data or the active lease. */
export async function inspectSubmissionSettlement(
  repositoryRoot: string,
  identity: string,
): Promise<AssignmentResult<SubmissionOutcome>> {
  const direct = await readScenarioExecution(repositoryRoot, identity);
  if (direct.ok) {
    return { ok: true, value: acceptedSettlement(direct.value), diagnostics: [] };
  }
  const pending = await readPendingSettlement(repositoryRoot, identity);
  if (pending && (pending.assignment === identity || pending.execution === identity)) {
    return reconcilePendingSettlement(repositoryRoot, pending);
  }
  const transactionsRoot = path.join(
    repositoryRoot,
    ".lifecycle/data/.transactions",
  );
  try {
    const entries = (await fs.readdir(transactionsRoot)).sort();
    for (const entry of entries) {
      const inspected = await readScenarioExecution(repositoryRoot, entry);
      if (inspected.ok && inspected.value.response.assignment === identity) {
        return {
          ok: true,
          value: acceptedSettlement(inspected.value),
          diagnostics: [],
        };
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return failure(
        "submission-settlement-inspection-failed",
        `Could not inspect submission settlement: ${error instanceof Error ? error.message : String(error)}`,
        identity,
      );
    }
  }
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  if (persisted.value?.id === identity && persisted.value.disposition === "active") {
    const diagnostics = [{
      code: "submission-not-published",
      path: identity,
      message: "No atomic publication transaction exists for the active Assignment",
    }];
    return {
      ok: true,
      value: rejectedSubmission(identity, "", diagnostics, true),
      diagnostics: [],
    };
  }
  if (persisted.value?.id === identity &&
    persisted.value.disposition === "abandoned" && persisted.value.response) {
    const unable = persisted.value.response.unable;
    const diagnostics = unable.diagnostics.length > 0
      ? unable.diagnostics
      : [{
          code: "assignment-unable",
          message: `Assignment could not complete: ${unable.reason}`,
        }];
    return {
      ok: true,
      value: {
        contract: "mdlm-submission-outcome@1",
        outcome: "rejected",
        assignment: { id: identity },
        responseDigest: persisted.value.response.digest,
        diagnostics,
        retryable: false,
        correctionConsumed: false,
      },
      diagnostics: [],
    };
  }
  return {
    ok: true,
    value: {
      contract: "mdlm-submission-outcome@1",
      outcome: "settlement-required",
      assignment: { id: identity },
      responseDigest: sha256(""),
      settlement: {
        assignment: identity,
        execution: identity,
      },
      reason: "publication-closure-uncertain",
      orchestration: { action: "inspect-settlement", replay: false },
    },
    diagnostics: [],
  };
}

/** Execute only the active Scenario's declared Docker verification capability. */
export async function runAssignmentVerification(repositoryRoot: string, retry = false): Promise<AssignmentResult<unknown>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const lease = persisted.value;
  if (!lease || lease.disposition !== "active") return failure("assignment-unavailable", "No active Assignment to run");
  return withRepositoryLock(repositoryRoot, leaseLockRef, async (renew) => {
    const current = await readLease(repositoryRoot);
    if (!current.ok || !exactActiveLease(current.value, lease)) return failure("assignment-unavailable", "Active Assignment changed");
    const exact = await exactAssignment(repositoryRoot);
    if (!exact.ok || !sameAssignment(lease, exact.value)) return failure("assignment-stale", "Assignment inputs changed before verification");
    if (!verificationContract(exact.value.scenario) || !exact.value.processPackage.kernelCapabilities["docker-verification@1"]) return failure("assignment-execution-unavailable", "This Assignment declares no Docker execution capability");
    try {
      await renew();
      const value = await runVerificationReceipt(repositoryRoot, verificationBinding(lease.id, lease.package, exact.value.scenario, exact.value.dryRun), retry);
      await renew();
      const result = value.receipt.result;
      return {ok: true, value: {...value, display: result ? {stdoutUtf8: Buffer.from(result.stdoutBase64, "base64").toString("utf8"), stderrUtf8: Buffer.from(result.stderrBase64, "base64").toString("utf8")} : null}, diagnostics: []};
    } catch (error) { return failure("verification-execution-error", String(error)); }
  });
}
