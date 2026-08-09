import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  LifecycleEvaluation,
  ObligationEvaluation,
  ProcessDiagnostic,
  ProcessPackage,
  VersionedDefinition,
} from "./index.js";
import { nextWorkProjection } from "./lifecycle-inspection.js";
import { parseObligationInstanceIdentity } from "./obligation-instance.js";
import { authorityEvidenceContract } from "./participation.js";
import { resolveType } from "./index.js";
import {
  prepareRepositoryResolverScenario,
  type PackageExecutionIdentity,
} from "./scenario-execution.js";
import type {
  ScenarioDryRun,
  ScenarioDryRunInvocation,
} from "./scenario-dry-run.js";
import { selectedRepositoryPackage } from "./selected-package.js";

const executeFile = promisify(execFile);
const leaseRelativePath = ".lifecycle/work/active-assignment.json";

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

export interface AssignmentLease {
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
  };
  scenario: string;
  bindings: AssignmentBinding[];
  participation: NonNullable<ScenarioDryRun["participation"]>;
  retryAvailability: {
    malformedResponseCorrection: 1;
  };
}

export interface AssignmentOutcome {
  contract: "mdlm-next@1";
  outcome: "assignment";
  assignment: { id: string };
}

export interface AssignmentPacket {
  contract: "mdlm-assignment-packet@1";
  assignment: { id: string };
  package: PackageExecutionIdentity;
  repository: RepositoryFingerprint;
  phase: string;
  obligation: AssignmentLease["obligation"];
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

export type AssignmentResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

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

/** Fingerprint the exact checked-out tracked state without including ignored transport files. */
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

function hasFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validParticipation(value: unknown): boolean {
  const participation = object(value);
  const authority = object(participation?.authorityRequirement);
  const attention = object(participation?.attentionSchedule);
  if (
    !participation ||
    !hasFields(participation, [
      "policy",
      "authorityRequirement",
      "attentionSchedule",
      "transactionBatching",
    ]) ||
    !nonemptyString(participation.policy) ||
    !authority ||
    !hasFields(authority, ["mode", "authority", "delegationAllowed"]) ||
    !["autonomous", "delegated", "attended"].includes(String(authority.mode)) ||
    !nonemptyString(authority.authority) ||
    typeof authority.delegationAllowed !== "boolean" ||
    !attention ||
    !hasFields(attention, ["timing", "checkpoint", "consolidationGroup"]) ||
    !["none", "immediate", "checkpoint"].includes(String(attention.timing)) ||
    !(attention.checkpoint === null || nonemptyString(attention.checkpoint)) ||
    !(attention.consolidationGroup === null || nonemptyString(attention.consolidationGroup)) ||
    !["single", "coherent-batch", "either"].includes(
      String(participation.transactionBatching),
    )
  ) return false;
  return attention.timing === "checkpoint"
    ? attention.checkpoint !== null
    : attention.checkpoint === null && attention.consolidationGroup === null;
}

function validBinding(value: unknown, index: number): boolean {
  const binding = object(value);
  if (
    !binding ||
    !hasFields(binding, ["invocation", "inputs"]) ||
    binding.invocation !== index ||
    !Array.isArray(binding.inputs)
  ) return false;
  return binding.inputs.every((candidate) => {
    const input = object(candidate);
    return !!input &&
      hasFields(input, ["name", "values"]) &&
      nonemptyString(input.name) &&
      Array.isArray(input.values) &&
      input.values.every(nonemptyString);
  });
}

function validAssignmentLease(value: unknown): value is AssignmentLease {
  const lease = object(value);
  const packageValue = object(lease?.package);
  const repository = object(lease?.repository);
  const obligation = object(lease?.obligation);
  const retry = object(lease?.retryAvailability);
  const parsedObligation = typeof obligation?.instance === "string"
    ? parseObligationInstanceIdentity(obligation.instance)
    : undefined;
  return !!lease &&
    hasFields(lease, [
      "contract",
      "id",
      "disposition",
      "package",
      "repository",
      "phase",
      "obligation",
      "scenario",
      "bindings",
      "participation",
      "retryAvailability",
    ]) &&
    lease.contract === "mdlm-assignment-lease@1" &&
    typeof lease.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lease.id) &&
    lease.disposition === "active" &&
    !!packageValue &&
    hasFields(packageValue, ["reference", "digest", "language"]) &&
    nonemptyString(packageValue.reference) &&
    /^sha256:[0-9a-f]{64}$/.test(String(packageValue.digest)) &&
    nonemptyString(packageValue.language) &&
    !!repository &&
    hasFields(repository, ["head", "trackedState"]) &&
    /^[0-9a-f]{40}$/.test(String(repository.head)) &&
    /^sha256:[0-9a-f]{64}$/.test(String(repository.trackedState)) &&
    nonemptyString(lease.phase) &&
    !!obligation &&
    hasFields(obligation, ["instance", "definition", "subject"]) &&
    !!parsedObligation &&
    obligation.definition === parsedObligation.obligationReference &&
    obligation.subject === parsedObligation.subject.identity &&
    nonemptyString(lease.scenario) &&
    Array.isArray(lease.bindings) &&
    lease.bindings.every(validBinding) &&
    Array.isArray(lease.participation) &&
    lease.participation.every(validParticipation) &&
    !!retry &&
    hasFields(retry, ["malformedResponseCorrection"]) &&
    retry.malformedResponseCorrection === 1;
}

async function readAssignmentLease(
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
  return validAssignmentLease(value)
    ? { ok: true, value, diagnostics: [] }
    : failure(
        "assignment-lease-invalid",
        "The active Assignment lease does not satisfy mdlm-assignment-lease@1",
        target,
      );
}

async function invalidateLease(repositoryRoot: string): Promise<void> {
  await fs.rm(leasePath(repositoryRoot), { force: true });
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

function packageIdentity(
  identity: PackageExecutionIdentity,
): PackageExecutionIdentity {
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

async function exactPreparation(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  identity: PackageExecutionIdentity,
  phase: string,
  item: ObligationEvaluation,
) {
  return prepareRepositoryResolverScenario(
    repositoryRoot,
    processPackage,
    identity,
    item.actionableResolver ?? item.eventualResolver,
    item.id,
    [],
    /^(.*)@[1-9][0-9]*$/.exec(phase)?.[1],
  );
}

function exactLeaseState(
  identity: PackageExecutionIdentity,
  fingerprint: RepositoryFingerprint,
  phase: string,
  item: ObligationEvaluation,
  dryRun: ScenarioDryRun,
): Omit<AssignmentLease, "contract" | "id" | "disposition" | "retryAvailability"> {
  return {
    package: packageIdentity(identity),
    repository: fingerprint,
    phase,
    obligation: {
      instance: item.id,
      definition: obligationDefinition(item),
      subject: item.subject,
    },
    scenario: item.actionableResolver ?? item.eventualResolver,
    bindings: bindings(dryRun.invocations),
    participation: dryRun.participation ?? [],
  };
}

function sameExactState(
  lease: AssignmentLease,
  exact: ReturnType<typeof exactLeaseState>,
): boolean {
  const comparable = {
    contract: lease.contract,
    disposition: lease.disposition,
    package: lease.package,
    repository: lease.repository,
    phase: lease.phase,
    obligation: lease.obligation,
    scenario: lease.scenario,
    bindings: lease.bindings,
    participation: lease.participation,
    retryAvailability: lease.retryAvailability,
  };
  return JSON.stringify(comparable) === JSON.stringify({
    contract: "mdlm-assignment-lease@1",
    disposition: "active",
    ...exact,
    retryAvailability: { malformedResponseCorrection: 1 },
  });
}

/** Lease the one exact Dispatchable Obligation selected by declarative evaluation. */
export async function leaseNextAssignment(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  identity: PackageExecutionIdentity,
  evaluation: LifecycleEvaluation,
): Promise<AssignmentResult<AssignmentOutcome>> {
  const next = nextWorkProjection(evaluation);
  const item = next?.item;
  if (!next || !item || !("obligation" in item) || !item.dispatchable) {
    return failure(
      "assignment-unavailable",
      "The current declarative evaluation did not select a Dispatchable Obligation Instance",
    );
  }

  const [fingerprint, preparation] = await Promise.all([
    repositoryFingerprint(repositoryRoot),
    exactPreparation(repositoryRoot, processPackage, identity, next.phase, item),
  ]);
  if (!fingerprint.ok) return fingerprint;
  if (!preparation.ok) return preparation;
  const exact = exactLeaseState(
    identity,
    fingerprint.value,
    next.phase,
    item,
    preparation.value.dryRun,
  );
  const activeLease = await readAssignmentLease(repositoryRoot);
  if (!activeLease.ok) return activeLease;
  const active = activeLease.value;
  if (active && sameExactState(active, exact)) {
    return {
      ok: true,
      value: {
        contract: "mdlm-next@1",
        outcome: "assignment",
        assignment: { id: active.id },
      },
      diagnostics: [],
    };
  }
  const lease: AssignmentLease = {
    contract: "mdlm-assignment-lease@1",
    id: randomUUID(),
    disposition: "active",
    ...exact,
    retryAvailability: { malformedResponseCorrection: 1 },
  };
  await writeLease(repositoryRoot, lease);
  return {
    ok: true,
    value: {
      contract: "mdlm-next@1",
      outcome: "assignment",
      assignment: { id: lease.id },
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
      id: { type: "string" },
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
              "authoritySupplies",
              "standingDelegations",
            ],
            properties: {
              outputs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "invocation", "lifecycleDatum"],
                  properties: {
                    name: { type: "string" },
                    invocation: { type: "integer", minimum: 0 },
                    lifecycleDatum,
                  },
                },
              },
              completionEvidence: {},
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
  processPackage: ProcessPackage,
  identity: PackageExecutionIdentity,
  lease: AssignmentLease,
  dryRun: ScenarioDryRun,
  scenario: VersionedDefinition,
): AssignmentPacket {
  const participation = dryRun.participation ?? [];
  return {
    contract: "mdlm-assignment-packet@1",
    assignment: { id: lease.id },
    package: packageIdentity(identity),
    repository: lease.repository,
    phase: lease.phase,
    obligation: lease.obligation,
    scenario: {
      reference: lease.scenario,
      definition: { id: scenario.id, version: scenario.version },
    },
    prompt: dryRun.prompt,
    assets: [
      {
        reference: dryRun.prompt.reference,
        path: dryRun.prompt.path,
        digest: dryRun.prompt.digest,
        content: dryRun.prompt.content,
      },
      ...dryRun.prompt.skills,
    ],
    exactInputs: dryRun.invocations,
    allowedProjections: {
      exactLifecycleData: exactLifecycleData(dryRun),
      outputSchemas: outputSchemas(processPackage, dryRun),
    },
    policies: dryRun.policies,
    participation,
    authority: {
      evidence: authorityEvidenceContract(scenario.authority_evidence) ?? null,
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
      standingDelegation: dryRun.standingDelegation ?? null,
    },
    prohibitions: dryRun.prohibitedInputs,
    outputs: dryRun.expectedOutputs,
    outputLinks: dryRun.expectedOutputs.map((output) => ({
      output: output.name,
      requiredLinks: output.requiredLinks,
    })),
    completion: dryRun.completion,
    responseSchema: responseSchema(),
  };
}

/** Revalidate one active exact Assignment and expand its harness-neutral packet. */
export async function prepareAssignment(
  repositoryRoot: string,
  assignmentId: string,
): Promise<AssignmentResult<AssignmentPacket>> {
  const activeLease = await readAssignmentLease(repositoryRoot);
  if (!activeLease.ok) return activeLease;
  const lease = activeLease.value;
  if (!lease || lease.id !== assignmentId) {
    return failure(
      "assignment-unavailable",
      `Assignment '${assignmentId}' is not the active Assignment`,
      assignmentId,
    );
  }

  const fingerprint = await repositoryFingerprint(repositoryRoot);
  if (!fingerprint.ok) return fingerprint;
  if (JSON.stringify(lease.repository) !== JSON.stringify(fingerprint.value)) {
    await invalidateLease(repositoryRoot);
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer matches its exact tracked repository state; prepare will not rebase it`,
      assignmentId,
    );
  }

  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (
    !selected.ok ||
    JSON.stringify(lease.package) !==
      JSON.stringify(packageIdentity(selected.summary))
  ) {
    await invalidateLease(repositoryRoot);
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer matches its exact selected Process Package; prepare will not rebase it`,
      assignmentId,
    );
  }
  const preparation = await prepareRepositoryResolverScenario(
    repositoryRoot,
    selected.processPackage,
    selected.summary,
    lease.scenario,
    lease.obligation.instance,
    [],
    /^(.*)@[1-9][0-9]*$/.exec(lease.phase)?.[1],
  );
  if (!preparation.ok) {
    await invalidateLease(repositoryRoot);
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer resolves to its exact Dispatchable Obligation Instance; prepare will not rebase it`,
      assignmentId,
    );
  }
  if (
    JSON.stringify(lease.bindings) !==
      JSON.stringify(bindings(preparation.value.dryRun.invocations)) ||
    JSON.stringify(lease.participation) !==
      JSON.stringify(preparation.value.dryRun.participation ?? [])
  ) {
    await invalidateLease(repositoryRoot);
    return failure(
      "assignment-stale",
      `Assignment '${assignmentId}' no longer matches its exact bindings or participation; prepare will not rebase it`,
      assignmentId,
    );
  }
  return {
    ok: true,
    value: packet(
      selected.processPackage,
      selected.summary,
      lease,
      preparation.value.dryRun,
      preparation.value.scenario,
    ),
    diagnostics: [],
  };
}
