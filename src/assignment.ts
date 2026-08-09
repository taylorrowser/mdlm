import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type {
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
import { repositoryLifecycleSnapshot } from "./lifecycle-repository.js";
import { parseObligationInstanceIdentity } from "./obligation-instance.js";
import { authorityEvidenceContract } from "./participation.js";
import { resolveType } from "./index.js";
import {
  dryRunResolverScenario,
  type ScenarioDryRun,
  type ScenarioDryRunInvocation,
} from "./scenario-dry-run.js";
import {
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
  };
  scenario: string;
  bindings: AssignmentBinding[];
  participation: NonNullable<ScenarioDryRun["participation"]>;
  retryAvailability: {
    malformedResponseCorrection: 1;
  };
}

export interface AssignmentOutcome {
  package: PackageSummary;
  contract: "mdlm-next@1";
  outcome: "assignment";
  assignment: { id: string };
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
  const retry = object(lease?.retryAvailability);
  const parsedObligation = typeof obligation?.instance === "string"
    ? parseObligationInstanceIdentity(obligation.instance)
    : undefined;
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
      typeof obligation?.instance === "string" &&
      typeof obligation.definition === "string" &&
      obligation.definition === parsedObligation?.obligationReference &&
      typeof obligation.subject === "string" &&
      obligation.subject === parsedObligation?.subject.identity &&
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

async function exactAssignment(
  repositoryRoot: string,
): Promise<AssignmentResult<ExactAssignment>> {
  const selected = await selectedRepositoryPackage(repositoryRoot);
  if (!selected.ok) return { ok: false, diagnostics: selected.diagnostics };
  const firstPhase = initialPhaseId(selected.processPackage);
  if (!firstPhase) {
    return failure("phase-required", "The selected Process Package declares no Phase");
  }
  const [loaded, fingerprint] = await Promise.all([
    repositoryLifecycleSnapshot(
      repositoryRoot,
      selected.processPackage,
      `${selected.summary.reference}#${selected.summary.digest}`,
      firstPhase,
    ),
    repositoryFingerprint(repositoryRoot),
  ]);
  if (!loaded.ok) return loaded;
  if (!fingerprint.ok) return fingerprint;
  const evaluation = activeLifecycleEvaluation(
    selected.processPackage,
    loaded.value,
  );
  if (evaluation.diagnostics.length > 0) {
    return { ok: false, diagnostics: evaluation.diagnostics };
  }
  const next = nextWorkProjection(evaluation);
  const item = next?.item;
  if (!next || !item || !("obligation" in item) || !item.dispatchable) {
    return failure(
      "assignment-unavailable",
      "The current declarative evaluation did not select a Dispatchable Obligation Instance",
    );
  }
  const scenarioReference = item.actionableResolver ?? item.eventualResolver;
  const scenario = definition(selected.processPackage.scenarios, scenarioReference);
  const phaseId = unversioned(next.phase);
  if (!scenario || !phaseId) {
    return failure(
      "scenario-definition-unavailable",
      `Could not resolve exact Scenario '${scenarioReference}' in Phase '${next.phase}'`,
      scenarioReference,
    );
  }
  const prepared = await dryRunResolverScenario(
    selected.processPackage,
    { ...loaded.value, phaseId },
    scenarioReference,
    item.id,
    [],
  );
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    value: {
      summary: selected.summary,
      processPackage: selected.processPackage,
      lease: {
        contract: "mdlm-assignment-lease@1",
        disposition: "active",
        package: packageIdentity(selected.summary),
        repository: fingerprint.value,
        phase: next.phase,
        obligation: {
          instance: item.id,
          definition: obligationDefinition(item),
          subject: item.subject,
        },
        scenario: scenarioReference,
        bindings: bindings(prepared.value.invocations),
        participation: prepared.value.participation ?? [],
        retryAvailability: { malformedResponseCorrection: 1 },
      },
      dryRun: prepared.value,
      scenario,
    },
    diagnostics: [],
  };
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

/** Lease the one exact Assignment selected from the current repository. */
export async function leaseNextAssignment(
  repositoryRoot: string,
): Promise<AssignmentResult<AssignmentOutcome>> {
  const persisted = await readLease(repositoryRoot);
  if (!persisted.ok) return persisted;
  const exact = await exactAssignment(repositoryRoot);
  if (!exact.ok) {
    if (
      persisted.value &&
      !exact.diagnostics.some((item) =>
        item.code === "assignment-repository-fingerprint-failed"
      )
    ) await fs.rm(leasePath(repositoryRoot), { force: true });
    return exact;
  }
  if (persisted.value && sameAssignment(persisted.value, exact.value)) {
    return {
      ok: true,
      value: {
        package: exact.value.summary,
        contract: "mdlm-next@1",
        outcome: "assignment",
        assignment: { id: persisted.value.id },
      },
      diagnostics: [],
    };
  }
  if (persisted.value && sameAssignmentSource(persisted.value, exact.value)) {
    return invalidLease(repositoryRoot);
  }
  const lease: AssignmentLease = {
    ...exact.value.lease,
    id: randomUUID(),
  };
  await writeLease(repositoryRoot, lease);
  return {
    ok: true,
    value: {
      package: exact.value.summary,
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
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    responseSchema(),
  );
  if (!validate(value)) {
    return { ok: false, diagnostics: responseDiagnostics(validate.errors) };
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
  const submitted = await submitResolverScenario(
    repositoryRoot,
    exact.value.processPackage,
    exact.value.lease.package,
    exact.value.lease.scenario,
    exact.value.lease.obligation.instance,
    {
      outputs: proposal.outputs,
      completionEvidence: proposal.completionEvidence,
    },
    lease.id,
    sha256(responseSource),
    proposal.authoritySupplies,
    proposal.standingDelegations,
    proposal.loadedSkillRefs,
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
