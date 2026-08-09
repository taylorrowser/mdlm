import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  evaluateLifecycle,
  resolveType,
  type DatumEnvelope,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ProcessDiagnostic,
  type ProcessPackage,
  type VersionedDefinition,
} from "./index.js";
import { evaluateProcessExpression } from "./evaluator.js";
import { finalizeExactBaselineScenarioOutput } from "./exact-baseline-repository.js";
import { parseObligationInstanceIdentity } from "./obligation-instance.js";
import { authorityEvidenceContract } from "./participation.js";
import {
  deriveLifecycleRecordStorage,
  provisionalLifecycleRecord,
  publishScenarioMutation,
  repositoryLifecycleSnapshot,
  type KernelFinalizedScenarioOutput,
} from "./lifecycle-repository.js";
import {
  dryRunExplicitScenario,
  dryRunResolverScenario,
  type ScenarioDryRun,
  type ScenarioDryRunInvocation,
} from "./scenario-dry-run.js";

export interface PackageExecutionIdentity {
  reference: string;
  digest: string;
  language: string;
}

interface AdapterOutputProposal {
  name: string;
  invocation: number;
  lifecycleDatum: {
    id?: string;
    type: string;
    payload: Record<string, unknown>;
    links: { type: string; target: string }[];
    body: string;
  };
}

interface AdapterResponse {
  outputs: AdapterOutputProposal[];
  completionEvidence: unknown;
}

export interface ScenarioExecutionOutput {
  name: string;
  invocation: number;
  lifecycleDatum: {
    id: string;
    revision: number;
    revisionId: string;
    type: string;
    path: string;
  };
  data: DatumEnvelope;
}

export interface ScenarioExecutionAuthority {
  supplied: string[];
  delegations: string[];
  requirements: {
    invocation: number;
    policy: string;
    mode: "delegated" | "attended";
    authority: string;
    delegationAllowed: boolean;
    evidence: { output: string; type: string };
  }[];
}

export interface ScenarioExecution {
  contract: "mdlm-scenario-execution@1" | "mdlm-scenario-execution@2" | "mdlm-scenario-execution@3";
  id: string;
  status: "completed";
  adapter: {
    contract: "mdlm-agent-adapter@1" | "mdlm-agent-adapter@2" | "mdlm-agent-adapter@3";
    executable: string;
    digest: string;
    requestDigest: string;
    responseDigest: string;
  };
  package: PackageExecutionIdentity;
  definition: ScenarioDryRun["definition"];
  authorization: ScenarioDryRun["authorization"];
  obligation?: ScenarioDryRun["obligation"];
  inputs: ScenarioDryRunInvocation[];
  prompt: Omit<ScenarioDryRun["prompt"], "skills">;
  skills: ScenarioDryRun["prompt"]["skills"];
  policies: Array<
    | ScenarioDryRun["policies"][number]
    | { role: "participation"; reference: string }
  >;
  participation?: NonNullable<ScenarioDryRun["participation"]>;
  authority?: ScenarioExecutionAuthority;
  prohibitedInputs: string[];
  outputs: ScenarioExecutionOutput[];
  completion: {
    contractValid: true;
    expression: string;
    expressionPassed: true;
    evaluations: { invocation: number; result: true }[];
  };
  completionEvidence: unknown;
  resultingObligations: string[];
  discoveredObligations: string[];
}

export type ScenarioExecutionResult =
  | { ok: true; value: ScenarioExecution; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

type RecordValue = Record<string, unknown>;

const base32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function object(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function valueAtPath(value: unknown, pathValue: unknown): unknown {
  if (typeof pathValue !== "string") return undefined;
  return pathValue.split(".").reduce<unknown>((current, segment) =>
    object(current)?.[segment], value
  );
}

function versionedDefinition(
  catalog: Record<string, VersionedDefinition>,
  reference: string,
): VersionedDefinition | undefined {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  const definition = match?.[1] ? catalog[match[1]] : undefined;
  return definition?.version === Number(match?.[2]) ? definition : undefined;
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableId(type: string): string {
  return `${type}-${[...randomBytes(10)].map((byte) => base32[byte & 31]).join("")}`;
}

function cardinalityRange(cardinality: string): { minimum: number; maximum: number } {
  switch (cardinality) {
    case "one": return { minimum: 1, maximum: 1 };
    case "one-or-more": return { minimum: 1, maximum: Number.POSITIVE_INFINITY };
    case "zero-or-one": return { minimum: 0, maximum: 1 };
    default: return { minimum: 0, maximum: Number.POSITIVE_INFINITY };
  }
}

async function invokeAdapter(
  repositoryRoot: string,
  executable: string,
  requestSource: string,
): Promise<{
  response?: unknown;
  responseSource?: string;
  diagnostic?: ProcessDiagnostic;
}> {
  return new Promise((resolve) => {
    const child = spawn(path.resolve(repositoryRoot, executable), [], {
      cwd: repositoryRoot,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => stdout += chunk);
    child.stderr.setEncoding("utf8").on("data", (chunk) => stderr += chunk);
    child.on("error", (error) => resolve({
      diagnostic: {
        code: "scenario-adapter-unavailable",
        path: executable,
        message: `Could not invoke configured agent adapter: ${error.message}`,
      },
    }));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({
          diagnostic: {
            code: "scenario-adapter-failed",
            path: executable,
            message: `Configured agent adapter exited with status ${code}: ${stderr.trim()}`,
          },
        });
        return;
      }
      try {
        resolve({ response: JSON.parse(stdout) as unknown, responseSource: stdout });
      } catch (error) {
        resolve({
          diagnostic: {
            code: "scenario-adapter-response-invalid",
            path: executable,
            message: `Configured agent adapter did not return one JSON value: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    });
    child.stdin.end(requestSource);
  });
}

function parseAdapterResponse(value: unknown):
  | { ok: true; value: AdapterResponse }
  | { ok: false; diagnostics: ProcessDiagnostic[] } {
  const response = object(value);
  if (!response || !Array.isArray(response.outputs) ||
      !Object.hasOwn(response, "completionEvidence")) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-adapter-response-invalid",
        path: "adapter.response",
        message: "Adapter response requires 'outputs' and 'completionEvidence'",
      }],
    };
  }
  const outputs: AdapterOutputProposal[] = [];
  const diagnostics: ProcessDiagnostic[] = [];
  const responseKeys = Object.keys(response).filter((key) =>
    key !== "outputs" && key !== "completionEvidence"
  );
  if (responseKeys.length > 0) {
    diagnostics.push({
      code: "scenario-adapter-response-invalid",
      path: "adapter.response",
      message: `Adapter response contains undeclared fields: ${responseKeys.sort().join(", ")}`,
    });
  }
  response.outputs.forEach((candidate, index) => {
    const output = object(candidate);
    const datum = object(output?.lifecycleDatum);
    const links = array(datum?.links);
    const parsedLinks = links.flatMap((value) => {
      const link = object(value);
      return typeof link?.type === "string" && typeof link.target === "string"
        ? [{ type: link.type, target: link.target }]
        : [];
    });
    const outputKeys = output
      ? Object.keys(output).filter((key) =>
        key !== "name" && key !== "invocation" && key !== "lifecycleDatum"
      )
      : [];
    const datumKeys = datum
      ? Object.keys(datum).filter((key) =>
        !["id", "type", "payload", "links", "body"].includes(key)
      )
      : [];
    if (!output || outputKeys.length > 0 || typeof output.name !== "string" ||
        !Number.isInteger(output.invocation) || Number(output.invocation) < 0 ||
        !datum || datumKeys.length > 0 || typeof datum.type !== "string" ||
        (datum.id !== undefined && typeof datum.id !== "string") ||
        !object(datum.payload) || !Array.isArray(datum.links) ||
        parsedLinks.length !== links.length || typeof datum.body !== "string") {
      diagnostics.push({
        code: "scenario-output-invalid",
        path: `adapter.outputs[${index}]`,
        message: "Adapter output must declare a name, invocation, and complete Lifecycle Datum proposal",
      });
      return;
    }
    outputs.push({
      name: output.name,
      invocation: Number(output.invocation),
      lifecycleDatum: {
        ...(typeof datum.id === "string" ? { id: datum.id } : {}),
        type: datum.type,
        payload: object(datum.payload)!,
        links: parsedLinks,
        body: datum.body,
      },
    });
  });
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : {
        ok: true,
        value: { outputs, completionEvidence: response.completionEvidence },
      };
}

function outputContractDiagnostics(
  scenario: VersionedDefinition,
  invocations: ScenarioDryRunInvocation[],
  outputs: AdapterOutputProposal[],
): ProcessDiagnostic[] {
  const contracts = array(scenario.outputs)
    .map(object)
    .filter((value): value is RecordValue => value !== undefined);
  const declared = new Set(contracts.map((contract) => String(contract.name)));
  const diagnostics: ProcessDiagnostic[] = [];
  outputs.forEach((output, index) => {
    if (!declared.has(output.name)) {
      diagnostics.push({
        code: "scenario-output-undeclared",
        path: `adapter.outputs[${index}].name`,
        message: `Adapter returned undeclared Scenario output '${output.name}'`,
      });
    }
    if (output.invocation >= invocations.length) {
      diagnostics.push({
        code: "scenario-output-invocation-invalid",
        path: `adapter.outputs[${index}].invocation`,
        message: `Adapter output '${output.name}' names unknown invocation ${output.invocation}`,
      });
    }
  });
  for (let invocation = 0; invocation < invocations.length; invocation += 1) {
    for (const contract of contracts) {
      const name = String(contract.name);
      const values = outputs.filter((output) =>
        output.invocation === invocation && output.name === name
      );
      const range = cardinalityRange(String(contract.cardinality));
      if (values.length < range.minimum || values.length > range.maximum) {
        diagnostics.push({
          code: "scenario-output-cardinality-invalid",
          path: `outputs.${name}`,
          message: `Scenario output '${name}' requires ${String(contract.cardinality)} per invocation, received ${values.length}`,
        });
      }
      const types = array(contract.types);
      for (const value of values) {
        if (!types.includes(value.lifecycleDatum.type)) {
          diagnostics.push({
            code: "scenario-output-type-invalid",
            path: `outputs.${name}.type`,
            message: `Scenario output '${name}' cannot return type '${value.lifecycleDatum.type}'`,
          });
        }
      }
    }
  }
  return diagnostics;
}

function requiredLinkDiagnostics(
  processPackage: ProcessPackage,
  scenario: VersionedDefinition,
  dryRun: ScenarioDryRun,
  outputs: { proposal: AdapterOutputProposal; datum: DatumEnvelope }[],
): ProcessDiagnostic[] {
  const contracts = new Map(array(scenario.outputs).flatMap((value) => {
    const contract = object(value);
    return typeof contract?.name === "string" ? [[contract.name, contract] as const] : [];
  }));
  const diagnostics: ProcessDiagnostic[] = [];
  for (const output of outputs) {
    const contract = contracts.get(output.proposal.name);
    for (const requiredValue of array(contract?.required_links)) {
      const required = object(requiredValue);
      const target = object(required?.target);
      const linkType = typeof required?.link === "string" ? required.link : "";
      const resolvedOutputType = resolveType(processPackage, output.datum.type);
      const linkContract = resolvedOutputType.ok
        ? resolvedOutputType.type.outgoingLinks
          .map(object)
          .find((candidate) => candidate?.id === linkType)
        : undefined;
      const linkTargets = array(linkContract?.targets).map(object);
      const requiredIdentity = (type: string): unknown =>
        linkTargets.find((candidate) =>
          candidate?.kind === "datum" && array(candidate.types).includes(type)
        )?.identity;
      const invocation = dryRun.invocations[output.proposal.invocation];
      const payloadTarget = object(target?.payload);
      const expected = typeof target?.input === "string"
        ? invocation?.inputs.find((input) => input.name === target.input)?.values.map(
          (value) => requiredIdentity(value.identity.type) === "stable"
            ? value.identity.id
            : value.identity.revision_id ?? value.identity.id,
        ) ?? []
        : typeof target?.output === "string"
          ? outputs.filter((candidate) =>
            candidate.proposal.invocation === output.proposal.invocation &&
            candidate.proposal.name === target.output
          ).map((candidate) => requiredIdentity(candidate.datum.type) === "stable"
            ? candidate.datum.id
            : candidate.datum.revision_id)
          : payloadTarget
            ? outputs.filter((candidate) =>
              candidate.proposal.invocation === output.proposal.invocation &&
              candidate.proposal.name === payloadTarget.output
            ).flatMap((candidate) => {
              const value = valueAtPath(
                candidate.datum.payload,
                payloadTarget.path,
              );
              return typeof value === "string" ? [value] : [];
            })
            : [];
      const actual = output.datum.links
        .filter((link) => link.type === linkType)
        .map((link) => link.target);
      for (const identity of expected) {
        if (!actual.includes(identity)) {
          diagnostics.push({
            code: "scenario-output-required-link-missing",
            path: `outputs.${output.proposal.name}.links.${linkType}`,
            message: `Scenario output '${output.proposal.name}' must link '${linkType}' to '${identity}'`,
          });
        }
      }
    }
  }
  return diagnostics;
}

function expressionBindings(
  dryRun: ScenarioDryRun,
  invocation: ScenarioDryRunInvocation,
  invocationIndex: number,
  outputs: { proposal: AdapterOutputProposal; datum: DatumEnvelope }[],
): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const input of invocation.inputs) {
    const values = input.values.map((value) =>
      value.identity.revision_id ?? value.identity.id
    );
    bindings[input.name] = input.contract.cardinality === "one" ||
        input.contract.cardinality === "zero-or-one"
      ? values[0]
      : values;
  }
  for (const outputContract of dryRun.expectedOutputs) {
    const values = outputs.filter((output) =>
      output.proposal.invocation === invocationIndex &&
      output.proposal.name === outputContract.name
    ).map((output) => output.datum.revision_id);
    bindings[outputContract.name] = outputContract.cardinality === "one" ||
        outputContract.cardinality === "zero-or-one"
      ? values[0]
      : values;
  }
  return bindings;
}

function remapPublicationDiagnostics(
  diagnostics: ProcessDiagnostic[],
): ProcessDiagnostic[] {
  return diagnostics.map((diagnostic) =>
    diagnostic.code === "datum-payload" || diagnostic.code === "datum-envelope" ||
        diagnostic.code === "datum-identity"
      ? { ...diagnostic, code: "scenario-output-schema-invalid" }
      : diagnostic
  );
}

export type RepositoryScenarioPreparationResult =
  | {
      ok: true;
      value: {
        dryRun: ScenarioDryRun;
        scenario: VersionedDefinition;
        snapshot: LifecycleSnapshot;
      };
      diagnostics: [];
    }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

type ScenarioExecutionAuthorizationRequest =
  | { mode: "explicit-initiation" }
  | { mode: "dispatchable-obligation"; obligationInstance: string };

async function prepareRepositoryScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  authorizationRequest: ScenarioExecutionAuthorizationRequest,
  requestedInputs: { name: string; value: string }[],
  requiredPhaseId?: string,
): Promise<RepositoryScenarioPreparationResult> {
  const selectedScenario = versionedDefinition(
    processPackage.scenarios,
    scenarioReference,
  );
  const scenarioPhases = array(selectedScenario?.phases).filter(
    (value): value is string => typeof value === "string",
  );
  const parsedObligation = authorizationRequest.mode === "dispatchable-obligation"
    ? parseObligationInstanceIdentity(authorizationRequest.obligationInstance)
    : undefined;
  const obligation = parsedObligation
    ? versionedDefinition(
        processPackage.obligations,
        parsedObligation.obligationReference,
      )
    : undefined;
  const obligationPhases = new Set(
    array(obligation?.phases).filter(
      (value): value is string => typeof value === "string",
    ),
  );
  const obligationPhaseId =
    parsedObligation?.subject.kind === "phase" ||
      parsedObligation?.subject.kind === "process"
      ? parsedObligation.subject.phaseId
      : undefined;
  const exactPhaseId = requiredPhaseId ?? obligationPhaseId;
  const phaseId = exactPhaseId
    ? scenarioPhases.find((candidate) =>
        candidate === exactPhaseId &&
        (authorizationRequest.mode === "explicit-initiation" ||
          obligationPhases.has(candidate))
      )
    : authorizationRequest.mode === "dispatchable-obligation"
    ? scenarioPhases.find((candidate) => obligationPhases.has(candidate))
    : scenarioPhases[0];
  if (!selectedScenario || !phaseId) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-definition-unavailable",
        path: scenarioReference,
        message: `Could not resolve an enabled Phase for exact Scenario '${scenarioReference}'`,
      }],
    };
  }
  const loaded = await repositoryLifecycleSnapshot(
    repositoryRoot,
    processPackage,
    `${packageIdentity.reference}#${packageIdentity.digest}`,
    phaseId,
  );
  if (!loaded.ok) return loaded;
  const snapshot = loaded.value;
  const dryRun = authorizationRequest.mode === "explicit-initiation"
    ? await dryRunExplicitScenario(
        processPackage,
        snapshot,
        scenarioReference,
        requestedInputs,
      )
    : await dryRunResolverScenario(
        processPackage,
        snapshot,
        scenarioReference,
        authorizationRequest.obligationInstance,
        requestedInputs,
      );
  return dryRun.ok
    ? {
        ok: true,
        value: { dryRun: dryRun.value, scenario: selectedScenario, snapshot },
        diagnostics: [],
      }
    : dryRun;
}

export async function prepareRepositoryResolverScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  obligationInstance: string,
  requestedInputs: { name: string; value: string }[],
  requiredPhaseId?: string,
): Promise<RepositoryScenarioPreparationResult> {
  return prepareRepositoryScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    scenarioReference,
    { mode: "dispatchable-obligation", obligationInstance },
    requestedInputs,
    requiredPhaseId,
  );
}

export async function prepareRepositoryExplicitScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  requestedInputs: { name: string; value: string }[],
): Promise<RepositoryScenarioPreparationResult> {
  return prepareRepositoryScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    scenarioReference,
    { mode: "explicit-initiation" },
    requestedInputs,
  );
}

async function executeScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  authorizationRequest: ScenarioExecutionAuthorizationRequest,
  requestedInputs: { name: string; value: string }[],
  adapterExecutable: string,
  suppliedAuthorities: string[],
  suppliedDelegations: string[],
): Promise<ScenarioExecutionResult> {
  const dryRunResult = await prepareRepositoryScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    scenarioReference,
    authorizationRequest,
    requestedInputs,
  );
  if (!dryRunResult.ok) return dryRunResult;
  const { dryRun, scenario: selectedScenario, snapshot } = dryRunResult.value;
  const authorityEvidence = authorityEvidenceContract(
    selectedScenario.authority_evidence,
  );
  const authorityRequirements = (dryRun.participation ?? []).flatMap(
    (participation, invocation) =>
      participation.authorityRequirement.mode === "autonomous"
        ? []
        : [{
            invocation,
            policy: participation.policy,
            mode: participation.authorityRequirement.mode as "delegated" | "attended",
            authority: participation.authorityRequirement.authority,
            delegationAllowed: participation.authorityRequirement.delegationAllowed,
            evidence: {
              output: authorityEvidence?.output ?? "",
              type: authorityEvidence?.type ?? "",
            },
          }],
  );
  if (authorityRequirements.length > 0 && !authorityEvidence) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-authority-evidence-missing",
        path: `${scenarioReference}#authority_evidence`,
        message: `Scenario '${scenarioReference}' does not name the exact Lifecycle Data output that records consequential authority`,
      }],
    };
  }
  const standingDelegation = dryRun.standingDelegation;
  const supplied = [...new Set(suppliedAuthorities)].sort();
  const delegations = [...new Set(suppliedDelegations)].sort();
  const usedDelegations = new Set<string>();
  const unsatisfiedRequirements = authorityRequirements.filter((requirement) => {
    if (supplied.includes(requirement.authority)) return false;
    if (
      !requirement.delegationAllowed ||
      !standingDelegation ||
      standingDelegation.delegate !== requirement.authority
    ) return true;
    const applicable = standingDelegation.invocations.find((candidate) =>
      candidate.invocation === requirement.invocation
    )?.applicableEvidence ?? [];
    const matched = delegations.find((delegation) =>
      applicable.includes(delegation)
    );
    if (!matched) return true;
    usedDelegations.add(matched);
    return false;
  });
  if (unsatisfiedRequirements.length > 0) {
    const missingAuthorities = [...new Set(
      unsatisfiedRequirements.map((requirement) => requirement.authority),
    )].sort();
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-authority-required",
        path: `${scenarioReference}#authority`,
        message: `Scenario '${scenarioReference}' requires explicit authority from: ${missingAuthorities.join(", ")}`,
      }],
    };
  }
  const requiredAuthorities = [...new Set(
    authorityRequirements.map((requirement) => requirement.authority),
  )].sort();
  const unexpectedAuthorities = supplied.filter((authority) =>
    !requiredAuthorities.includes(authority)
  );
  const unexpectedDelegations = delegations.filter((delegation) =>
    !usedDelegations.has(delegation)
  );
  if (unexpectedAuthorities.length > 0 || unexpectedDelegations.length > 0) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-authority-unexpected",
        path: `${scenarioReference}#authority`,
        message: `Scenario '${scenarioReference}' received authority not required by its exact participation: ${[
          ...unexpectedAuthorities,
          ...unexpectedDelegations,
        ].join(", ")}`,
      }],
    };
  }
  const executionAuthority: ScenarioExecutionAuthority | undefined =
    authorityRequirements.length > 0
      ? {
          supplied,
          delegations: [...usedDelegations].sort(),
          requirements: authorityRequirements,
        }
      : undefined;
  const participationPolicyReferences = [...new Set(
    (dryRun.participation ?? []).map((participation) => participation.policy),
  )].sort();
  const participationPolicies = participationPolicyReferences.map(
    (reference) => ({
      role: "participation" as const,
      reference,
    }),
  );
  const participationContract = executionAuthority
    ? {
        adapter: "mdlm-agent-adapter@3" as const,
        execution: "mdlm-scenario-execution@3" as const,
      }
    : dryRun.participation
      ? {
          adapter: "mdlm-agent-adapter@2" as const,
          execution: "mdlm-scenario-execution@2" as const,
        }
      : {
          adapter: "mdlm-agent-adapter@1" as const,
          execution: "mdlm-scenario-execution@1" as const,
        };
  const adapterRequest = {
    contract: participationContract.adapter,
    scenario: scenarioReference,
    authorization: dryRun.authorization,
    ...(dryRun.obligation
      ? { obligation: dryRun.obligation.instance }
      : {}),
    invocations: dryRun.invocations,
    prompt: dryRun.prompt,
    policies: dryRun.policies,
    ...(dryRun.participation ? { participation: dryRun.participation } : {}),
    ...(executionAuthority ? { authority: executionAuthority } : {}),
    prohibitedInputs: dryRun.prohibitedInputs,
    expectedOutputs: dryRun.expectedOutputs,
    completion: dryRun.completion,
  };
  let adapterDigest: string;
  try {
    adapterDigest = sha256(
      await fs.readFile(path.resolve(repositoryRoot, adapterExecutable)),
    );
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-adapter-unavailable",
        path: adapterExecutable,
        message: `Could not read configured agent adapter: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
  const adapterRequestSource = `${JSON.stringify(adapterRequest)}\n`;
  const invoked = await invokeAdapter(
    repositoryRoot,
    adapterExecutable,
    adapterRequestSource,
  );
  if (invoked.diagnostic) return { ok: false, diagnostics: [invoked.diagnostic] };
  const parsedResponse = parseAdapterResponse(invoked.response);
  if (!parsedResponse.ok) return parsedResponse;
  if (executionAuthority && authorityEvidence) {
    const requiredInvocations = [...new Set(
      executionAuthority.requirements.map((requirement) => requirement.invocation),
    )].sort((left, right) => left - right);
    const missingEvidenceInvocations = requiredInvocations.flatMap((invocation) =>
      parsedResponse.value.outputs.some((output) =>
        output.invocation === invocation &&
        output.name === authorityEvidence.output &&
        output.lifecycleDatum.type === authorityEvidence.type
      ) ? [] : [invocation]
    );
    if (missingEvidenceInvocations.length > 0) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-authority-evidence-missing",
          path: `${scenarioReference}#authority_evidence`,
          message: `Scenario '${scenarioReference}' must publish '${authorityEvidence.output}' as exact ${authorityEvidence.type} authority evidence for invocation(s): ${missingEvidenceInvocations.join(", ")}`,
        }],
      };
    }
  }
  const scenario = selectedScenario;
  const contractDiagnostics = outputContractDiagnostics(
    scenario,
    dryRun.invocations,
    parsedResponse.value.outputs,
  );
  if (contractDiagnostics.length > 0) {
    return { ok: false, diagnostics: contractDiagnostics };
  }

  const existingById = new Map<string, LifecycleRecord[]>();
  for (const record of snapshot.records) {
    const lineage = existingById.get(record.datum.id) ?? [];
    lineage.push(record);
    existingById.set(record.datum.id, lineage);
  }
  const usedIds = new Set(existingById.keys());
  const policies = [...new Set([
    ...dryRun.policies.map((policy) => policy.reference),
    ...participationPolicyReferences,
  ])].sort();
  const outputData = parsedResponse.value.outputs.map((proposal) => {
    const requestedId = proposal.lifecycleDatum.id;
    let id = requestedId;
    if (!id) {
      do id = stableId(proposal.lifecycleDatum.type); while (usedIds.has(id));
      usedIds.add(id);
    }
    const lineage = existingById.get(id) ?? [];
    const revision = lineage.length === 0
      ? 1
      : Math.max(...lineage.map((record) => record.datum.revision)) + 1;
    const datum: DatumEnvelope = {
      id,
      revision,
      revision_id: `${id}-r${String(revision).padStart(5, "0")}`,
      type: proposal.lifecycleDatum.type,
      payload: proposal.lifecycleDatum.payload,
      links: proposal.lifecycleDatum.links,
      created_by: {
        scenario: scenarioReference,
        prompt_ref: dryRun.prompt.reference,
        process_ref: `${packageIdentity.reference}#${packageIdentity.digest}`,
        loaded_skill_refs: dryRun.prompt.skills.map((skill) => skill.reference),
        policy_refs: policies,
      },
      body: proposal.lifecycleDatum.body,
    };
    return { proposal, datum };
  });
  const linkDiagnostics = requiredLinkDiagnostics(
    processPackage,
    scenario,
    dryRun,
    outputData,
  );
  if (linkDiagnostics.length > 0) return { ok: false, diagnostics: linkDiagnostics };

  const kernelFinalizedOutputs: KernelFinalizedScenarioOutput[] = [];
  const exactBaselineType = processPackage.kernelCapabilities["exact-baseline@1"]?.type;
  if (exactBaselineType) {
    for (const output of outputData) {
      if (output.datum.type !== exactBaselineType) continue;
      const finalized = await finalizeExactBaselineScenarioOutput(
        repositoryRoot,
        processPackage,
        `${packageIdentity.reference}#${packageIdentity.digest}`,
        output.datum,
      );
      if (!finalized.ok) return finalized;
      output.datum = finalized.value.output.datum;
      kernelFinalizedOutputs.push(finalized.value.output);
    }
  }

  const resultingRecords = deriveLifecycleRecordStorage(processPackage, [
    ...snapshot.records,
    ...outputData.map(({ datum }): LifecycleRecord =>
      provisionalLifecycleRecord(datum)
    ),
  ]);
  const resultingSnapshot: LifecycleSnapshot = {
    ...snapshot,
    records: resultingRecords,
    execution: { integrity: { contract_valid: true } },
  };
  const completionEvaluations: { invocation: number; result: true }[] = [];
  for (let index = 0; index < dryRun.invocations.length; index += 1) {
    let passed = false;
    try {
      passed = evaluateProcessExpression(
        processPackage,
        resultingSnapshot,
        `${scenarioReference}#completion`,
        expressionBindings(
          dryRun,
          dryRun.invocations[index]!,
          index,
          outputData,
        ),
      ).result === true;
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-completion-invalid",
          path: `${scenarioReference}#completion`,
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
    if (!passed) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-completion-failed",
          path: `${scenarioReference}#completion`,
          message: `Scenario '${scenarioReference}' did not satisfy its package-authored completion expression`,
        }],
      };
    }
    completionEvaluations.push({ invocation: index, result: true });
  }

  const beforeObligations = new Set(evaluateLifecycle(processPackage, snapshot).obligations.map(
    (obligation) => obligation.id,
  ));
  const reevaluation = evaluateLifecycle(processPackage, resultingSnapshot);
  if (reevaluation.diagnostics.length > 0) {
    return { ok: false, diagnostics: reevaluation.diagnostics };
  }
  const resultingObligations = reevaluation.obligations
    .map((obligation) => obligation.id)
    .sort();
  const discoveredObligations = resultingObligations
    .filter((id) => !beforeObligations.has(id));
  const executionId = randomUUID();
  const { skills, ...prompt } = dryRun.prompt;
  const executionBase = {
    contract: participationContract.execution,
    id: executionId,
    status: "completed" as const,
    adapter: {
      contract: participationContract.adapter,
      executable: adapterExecutable,
      digest: adapterDigest,
      requestDigest: sha256(adapterRequestSource),
      responseDigest: sha256(invoked.responseSource ?? ""),
    },
    package: packageIdentity,
    definition: dryRun.definition,
    authorization: dryRun.authorization,
    ...(dryRun.obligation ? { obligation: dryRun.obligation } : {}),
    inputs: dryRun.invocations,
    prompt,
    skills,
    policies: [...dryRun.policies, ...participationPolicies],
    ...(dryRun.participation ? { participation: dryRun.participation } : {}),
    ...(executionAuthority ? { authority: executionAuthority } : {}),
    prohibitedInputs: dryRun.prohibitedInputs,
    completion: {
      contractValid: true as const,
      expression: dryRun.completion.expression,
      expressionPassed: true as const,
      evaluations: completionEvaluations,
    },
    completionEvidence: parsedResponse.value.completionEvidence,
    resultingObligations,
    discoveredObligations,
  };
  const provisionalOutputs: ScenarioExecutionOutput[] = outputData.map(({ proposal, datum }) => ({
    name: proposal.name,
    invocation: proposal.invocation,
    lifecycleDatum: {
      id: datum.id,
      revision: datum.revision,
      revisionId: datum.revision_id,
      type: datum.type,
      path: `.lifecycle/data/.transactions/${executionId}/${datum.type}/${datum.id}/r${String(datum.revision).padStart(5, "0")}.md`,
    },
    data: datum,
  }));
  const execution: ScenarioExecution = { ...executionBase, outputs: provisionalOutputs };
  const published = await publishScenarioMutation(
    repositoryRoot,
    processPackage,
    snapshot.records.map((record) => record.datum),
    outputData.map((output) => output.datum),
    executionId,
    execution,
    kernelFinalizedOutputs,
  );
  if (!published.ok) {
    return { ok: false, diagnostics: remapPublicationDiagnostics(published.diagnostics) };
  }
  execution.outputs = execution.outputs.map((output, index) => ({
    ...output,
    lifecycleDatum: {
      ...output.lifecycleDatum,
      path: published.value.created[index]!.path,
    },
  }));
  return { ok: true, value: execution, diagnostics: [] };
}

export async function executeResolverScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  obligationInstance: string,
  requestedInputs: { name: string; value: string }[],
  adapterExecutable: string,
  suppliedAuthorities: string[] = [],
  suppliedDelegations: string[] = [],
): Promise<ScenarioExecutionResult> {
  return executeScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    scenarioReference,
    { mode: "dispatchable-obligation", obligationInstance },
    requestedInputs,
    adapterExecutable,
    suppliedAuthorities,
    suppliedDelegations,
  );
}

export async function executeExplicitScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  requestedInputs: { name: string; value: string }[],
  adapterExecutable: string,
  suppliedAuthorities: string[] = [],
  suppliedDelegations: string[] = [],
): Promise<ScenarioExecutionResult> {
  return executeScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    scenarioReference,
    { mode: "explicit-initiation" },
    requestedInputs,
    adapterExecutable,
    suppliedAuthorities,
    suppliedDelegations,
  );
}

export async function readScenarioExecution(
  repositoryRoot: string,
  executionId: string,
): Promise<ScenarioExecutionResult> {
  if (!/^[0-9a-f-]{36}$/.test(executionId)) {
    return {
      ok: false,
      diagnostics: [{
        code: "invalid-scenario-execution",
        path: executionId,
        message: `Invalid Scenario Execution identity '${executionId}'`,
      }],
    };
  }
  try {
    const source = await fs.readFile(
      path.join(
        repositoryRoot,
        ".lifecycle/data/.transactions",
        executionId,
        "execution.json",
      ),
      "utf8",
    );
    return { ok: true, value: JSON.parse(source) as ScenarioExecution, diagnostics: [] };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-scenario-execution",
        path: executionId,
        message: `Could not read Scenario Execution '${executionId}': ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
}
