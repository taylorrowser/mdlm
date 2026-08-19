import { randomBytes, randomUUID } from "node:crypto";
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

export interface ScenarioOutputProposal {
  localId?: string;
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

export interface ScenarioProposal {
  outputs: ScenarioOutputProposal[];
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
    authorization?:
      | { kind: "authority-supply"; authority: string }
      | { kind: "standing-delegation"; revision: string };
  }[];
}

export interface ScenarioExecution {
  contract: "mdlm-scenario-execution@4";
  id: string;
  status: "completed";
  response: {
    contract: "mdlm-assignment-response@1";
    assignment: string;
    digest: string;
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

function outputContractDiagnostics(
  scenario: VersionedDefinition,
  invocations: ScenarioDryRunInvocation[],
  outputs: ScenarioOutputProposal[],
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
        path: `proposal.outputs[${index}].name`,
        message: `Scenario Proposal contains undeclared output '${output.name}'`,
      });
    }
    if (output.invocation >= invocations.length) {
      diagnostics.push({
        code: "scenario-output-invocation-invalid",
        path: `proposal.outputs[${index}].invocation`,
        message: `Scenario Proposal output '${output.name}' names unknown invocation ${output.invocation}`,
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
        const requiredPayload = object(contract.required_payload);
        for (const [payloadPath, expected] of Object.entries(requiredPayload ?? {})) {
          const actual = valueAtPath(value.lifecycleDatum.payload, payloadPath);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            diagnostics.push({
              code: "scenario-output-required-payload-invalid",
              path: `outputs.${name}.payload.${payloadPath}`,
              message: `Scenario output '${name}' requires payload '${payloadPath}' to equal ${JSON.stringify(expected)}`,
            });
          }
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
  outputs: { proposal: ScenarioOutputProposal; datum: DatumEnvelope }[],
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
      if (["partition", "cover"].includes(String(required?.distribution))) continue;
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
  for (const [outputName, contract] of contracts) {
    for (const requiredValue of array(contract.required_links)) {
      const required = object(requiredValue);
      const distribution = String(required?.distribution);
      if (!["partition", "cover"].includes(distribution)) continue;
      const target = object(required?.target);
      const inputName = typeof target?.input === "string" ? target.input : undefined;
      const linkType = typeof required?.link === "string" ? required.link : "";
      for (let invocationIndex = 0; invocationIndex < dryRun.invocations.length; invocationIndex += 1) {
        const invocation = dryRun.invocations[invocationIndex];
        const invocationOutputs = outputs.filter((output) =>
          output.proposal.invocation === invocationIndex &&
          output.proposal.name === outputName
        );
        const input = inputName
          ? invocation?.inputs.find((candidate) => candidate.name === inputName)
          : undefined;
        if (!input) {
          diagnostics.push({
            code: "scenario-output-link-distribution-invalid",
            path: `outputs.${outputName}.required_links.${linkType}`,
            message: `Distributed link '${linkType}' requires one declared input target`,
          });
          continue;
        }
        const expected = new Set<string>();
        const actualCounts = new Map<string, number>();
        for (const output of invocationOutputs) {
          const resolvedOutputType = resolveType(processPackage, output.datum.type);
          const linkContract = resolvedOutputType.ok
            ? resolvedOutputType.type.outgoingLinks.map(object)
              .find((candidate) => candidate?.id === linkType)
            : undefined;
          const linkTargets = array(linkContract?.targets).map(object);
          for (const value of input.values) {
            const identity = linkTargets.find((candidate) =>
              candidate?.kind === "datum" &&
              array(candidate.types).includes(value.identity.type)
            )?.identity === "stable"
              ? value.identity.id
              : value.identity.revision_id ?? value.identity.id;
            expected.add(identity);
          }
          const actual = output.datum.links
            .filter((link) => link.type === linkType)
            .map((link) => link.target);
          if (actual.length === 0) {
            diagnostics.push({
              code: "scenario-output-link-distribution-empty",
              path: `outputs.${outputName}.links.${linkType}`,
              message: `Every '${outputName}' output must link '${linkType}' to at least one supplied '${inputName}' value`,
            });
          }
          for (const identity of actual) {
            if (!expected.has(identity)) {
              diagnostics.push({
                code: "scenario-output-link-distribution-unexpected",
                path: `outputs.${outputName}.links.${linkType}`,
                message: `Distributed link '${linkType}' targets '${identity}', which is not a supplied '${inputName}' value`,
              });
            }
            actualCounts.set(identity, (actualCounts.get(identity) ?? 0) + 1);
          }
        }
        for (const identity of expected) {
          const count = actualCounts.get(identity) ?? 0;
          const valid = distribution === "partition" ? count === 1 : count >= 1;
          if (!valid) {
            diagnostics.push({
              code: "scenario-output-link-distribution-incomplete",
              path: `outputs.${outputName}.links.${linkType}`,
              message: distribution === "partition"
                ? `Distributed link '${linkType}' must target '${identity}' exactly once, received ${count}`
                : `Distributed link '${linkType}' must target '${identity}' at least once`,
            });
          }
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
  outputs: { proposal: ScenarioOutputProposal; datum: DatumEnvelope }[],
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

type RepositoryScenarioPreparationResult =
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
  const phaseId = obligationPhaseId
    ? scenarioPhases.find((candidate) => candidate === obligationPhaseId)
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

async function submitScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  scenarioReference: string,
  authorizationRequest: ScenarioExecutionAuthorizationRequest,
  requestedInputs: { name: string; value: string }[],
  suppliedAuthorities: string[],
  suppliedDelegations: string[],
  submittedResponse: {
    assignment: string;
    digest: string;
    proposal: ScenarioProposal;
    loadedSkillRefs: string[];
  },
  prepared?: Extract<RepositoryScenarioPreparationResult, { ok: true }>["value"] & {
    finalizeExactBaseline?: typeof finalizeExactBaselineScenarioOutput;
    publishMutation?: typeof publishScenarioMutation;
  },
): Promise<ScenarioExecutionResult> {
  const dryRunResult: RepositoryScenarioPreparationResult = prepared
    ? { ok: true, value: prepared, diagnostics: [] }
    : await prepareRepositoryScenario(
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
  const requirementAuthorizations = new Map<
    number,
    ScenarioExecutionAuthority["requirements"][number]["authorization"]
  >();
  const unsatisfiedRequirements = authorityRequirements.filter((requirement) => {
    if (supplied.includes(requirement.authority)) {
      requirementAuthorizations.set(requirement.invocation, {
        kind: "authority-supply",
        authority: requirement.authority,
      });
      return false;
    }
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
    requirementAuthorizations.set(requirement.invocation, {
      kind: "standing-delegation",
      revision: matched,
    });
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
          requirements: authorityRequirements.map((requirement) => ({
            ...requirement,
            authorization: requirementAuthorizations.get(
              requirement.invocation,
            )!,
          })),
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
  const declaredSkillRefs = dryRun.prompt.skills.map((skill) => skill.reference);
  const loadedSkillRefs = submittedResponse.loadedSkillRefs;
  const exactSkillProvenance = loadedSkillRefs.length === declaredSkillRefs.length &&
    loadedSkillRefs.every((reference, index) => reference === declaredSkillRefs[index]);
  if (!exactSkillProvenance) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-skill-provenance-mismatch",
        path: `${scenarioReference}#skills`,
        message: `Scenario Proposal must report exact Assignment skills in packet order; expected ${JSON.stringify(declaredSkillRefs)}, received ${JSON.stringify(loadedSkillRefs)}`,
      }],
    };
  }
  const loadedSkills = loadedSkillRefs.map((reference) =>
    dryRun.prompt.skills.find((skill) => skill.reference === reference)!
  );
  const proposal = submittedResponse.proposal;
  if (executionAuthority && authorityEvidence) {
    const requiredInvocations = [...new Set(
      executionAuthority.requirements.map((requirement) => requirement.invocation),
    )].sort((left, right) => left - right);
    const missingEvidenceInvocations = requiredInvocations.flatMap((invocation) =>
      proposal.outputs.some((output) =>
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
    proposal.outputs,
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
  const kernelIdentityDiagnostics = proposal.outputs.flatMap(
    (output, index) => output.lifecycleDatum.id &&
        !existingById.has(output.lifecycleDatum.id)
      ? [{
          code: "scenario-output-identity-kernel-managed",
          path: `proposal.outputs[${index}].lifecycleDatum.id`,
          message: `New Scenario output '${output.name}' must leave Stable Datum identity for the kernel to assign`,
        }]
      : [],
  );
  if (kernelIdentityDiagnostics.length > 0) {
    return { ok: false, diagnostics: kernelIdentityDiagnostics };
  }
  const policies = [...new Set([
    ...dryRun.policies.map((policy) => policy.reference),
    ...participationPolicyReferences,
  ])].sort();
  const outputIdentities = proposal.outputs.map((proposal) => {
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
    return {
      id,
      revision,
      revisionId: `${id}-r${String(revision).padStart(5, "0")}`,
    };
  });
  const localIdentities = new Map<string, typeof outputIdentities[number]>();
  const localIdentityDiagnostics: ProcessDiagnostic[] = [];
  proposal.outputs.forEach((output, index) => {
    if (!output.localId) return;
    if (localIdentities.has(output.localId)) {
      localIdentityDiagnostics.push({
        code: "scenario-output-local-id-duplicate",
        path: `proposal.outputs[${index}].localId`,
        message: `Scenario Proposal output local identity '${output.localId}' is duplicated`,
      });
      return;
    }
    localIdentities.set(output.localId, outputIdentities[index]!);
  });
  if (localIdentityDiagnostics.length > 0) {
    return { ok: false, diagnostics: localIdentityDiagnostics };
  }
  const proposalReferenceDiagnostics: ProcessDiagnostic[] = [];
  function resolveProposalReferences(value: unknown, pathValue: string): unknown {
    if (typeof value === "string") {
      const match = /^\$proposal\.([A-Za-z][A-Za-z0-9_-]*)\.(id|revision_id)$/.exec(value);
      if (!match) return value;
      const identity = localIdentities.get(match[1]!);
      if (!identity) {
        proposalReferenceDiagnostics.push({
          code: "scenario-output-local-reference-unknown",
          path: pathValue,
          message: `Scenario Proposal references unknown local output '${match[1]}'`,
        });
        return value;
      }
      return match[2] === "id" ? identity.id : identity.revisionId;
    }
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        resolveProposalReferences(item, `${pathValue}[${index}]`)
      );
    }
    const record = object(value);
    return record
      ? Object.fromEntries(Object.entries(record).map(([key, item]) => [
          key,
          resolveProposalReferences(item, `${pathValue}.${key}`),
        ]))
      : value;
  }
  const outputData = proposal.outputs.map((proposal, index) => {
    const identity = outputIdentities[index]!;
    const datum: DatumEnvelope = {
      id: identity.id,
      revision: identity.revision,
      revision_id: identity.revisionId,
      type: proposal.lifecycleDatum.type,
      payload: resolveProposalReferences(
        proposal.lifecycleDatum.payload,
        `proposal.outputs[${index}].lifecycleDatum.payload`,
      ) as Record<string, unknown>,
      links: proposal.lifecycleDatum.links.map((link, linkIndex) => ({
        ...link,
        target: resolveProposalReferences(
          link.target,
          `proposal.outputs[${index}].lifecycleDatum.links[${linkIndex}].target`,
        ) as string,
      })),
      created_by: {
        scenario: scenarioReference,
        prompt_ref: dryRun.prompt.reference,
        process_ref: `${packageIdentity.reference}#${packageIdentity.digest}`,
        loaded_skill_refs: loadedSkillRefs,
        policy_refs: policies,
      },
      body: proposal.lifecycleDatum.body,
    };
    return { proposal, datum };
  });
  if (proposalReferenceDiagnostics.length > 0) {
    return { ok: false, diagnostics: proposalReferenceDiagnostics };
  }
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
      const finalized = await (prepared?.finalizeExactBaseline ??
        finalizeExactBaselineScenarioOutput)(
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
  const { skills: _availableSkills, ...prompt } = dryRun.prompt;
  const executionBase = {
    contract: "mdlm-scenario-execution@4" as const,
    id: executionId,
    status: "completed" as const,
    response: {
      contract: "mdlm-assignment-response@1" as const,
      assignment: submittedResponse.assignment,
      digest: submittedResponse.digest,
    },
    package: packageIdentity,
    definition: dryRun.definition,
    authorization: dryRun.authorization,
    ...(dryRun.obligation ? { obligation: dryRun.obligation } : {}),
    inputs: dryRun.invocations,
    prompt,
    skills: loadedSkills,
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
    completionEvidence: proposal.completionEvidence,
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
  const published = await (prepared?.publishMutation ?? publishScenarioMutation)(
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

export interface ResolverScenarioSubmission {
  scenarioReference: string;
  obligationInstance: string;
  proposal: ScenarioProposal;
  assignment: string;
  responseDigest: string;
  suppliedAuthorities: string[];
  suppliedDelegations: string[];
  loadedSkillRefs: string[];
}

export async function submitResolverScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  submission: ResolverScenarioSubmission,
): Promise<ScenarioExecutionResult> {
  return submitScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    submission.scenarioReference,
    {
      mode: "dispatchable-obligation",
      obligationInstance: submission.obligationInstance,
    },
    [],
    submission.suppliedAuthorities,
    submission.suppliedDelegations,
    {
      assignment: submission.assignment,
      digest: submission.responseDigest,
      proposal: submission.proposal,
      loadedSkillRefs: submission.loadedSkillRefs,
    },
  );
}

export interface PreparedScenarioSubmission {
  dryRun: ScenarioDryRun;
  scenario: VersionedDefinition;
  snapshot: LifecycleSnapshot;
  finalizeExactBaseline?: typeof finalizeExactBaselineScenarioOutput;
  publishMutation?: typeof publishScenarioMutation;
}

export async function submitPreparedResolverScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  submission: ResolverScenarioSubmission,
  prepared: PreparedScenarioSubmission,
): Promise<ScenarioExecutionResult> {
  return submitScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    submission.scenarioReference,
    {
      mode: "dispatchable-obligation",
      obligationInstance: submission.obligationInstance,
    },
    [],
    submission.suppliedAuthorities,
    submission.suppliedDelegations,
    {
      assignment: submission.assignment,
      digest: submission.responseDigest,
      proposal: submission.proposal,
      loadedSkillRefs: submission.loadedSkillRefs,
    },
    prepared,
  );
}

export interface ExplicitScenarioSubmission
  extends Omit<ResolverScenarioSubmission, "obligationInstance"> {
  requestedInputs: { name: string; value: string }[];
}

export async function submitExplicitScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  submission: ExplicitScenarioSubmission,
): Promise<ScenarioExecutionResult> {
  return submitScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    submission.scenarioReference,
    { mode: "explicit-initiation" },
    submission.requestedInputs,
    submission.suppliedAuthorities,
    submission.suppliedDelegations,
    {
      assignment: submission.assignment,
      digest: submission.responseDigest,
      proposal: submission.proposal,
      loadedSkillRefs: submission.loadedSkillRefs,
    },
  );
}

export async function submitPreparedExplicitScenario(
  repositoryRoot: string,
  processPackage: ProcessPackage,
  packageIdentity: PackageExecutionIdentity,
  submission: ExplicitScenarioSubmission,
  prepared: PreparedScenarioSubmission,
): Promise<ScenarioExecutionResult> {
  return submitScenario(
    repositoryRoot,
    processPackage,
    packageIdentity,
    submission.scenarioReference,
    { mode: "explicit-initiation" },
    submission.requestedInputs,
    submission.suppliedAuthorities,
    submission.suppliedDelegations,
    {
      assignment: submission.assignment,
      digest: submission.responseDigest,
      proposal: submission.proposal,
      loadedSkillRefs: submission.loadedSkillRefs,
    },
    prepared,
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
    const parsed = object(JSON.parse(source) as unknown);
    const response = object(parsed?.response);
    if (
      parsed?.contract !== "mdlm-scenario-execution@4" ||
      response?.contract !== "mdlm-assignment-response@1"
    ) {
      return {
        ok: false,
        diagnostics: [{
          code: "unsupported-scenario-execution-contract",
          path: executionId,
          message: `Scenario Execution '${executionId}' is not Assignment Response-backed mdlm-scenario-execution@4`,
        }],
      };
    }
    return {
      ok: true,
      value: parsed as unknown as ScenarioExecution,
      diagnostics: [],
    };
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
