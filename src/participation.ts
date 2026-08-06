import { Ajv2020 } from "ajv/dist/2020.js";
import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";

export type AuthorityMode = "autonomous" | "delegated" | "attended";
export type AttentionTiming = "none" | "immediate" | "checkpoint";
export type ScenarioTransactionBatching =
  | "single"
  | "coherent-batch"
  | "either";

export interface AuthorityEvidenceContract {
  output: string;
  type: string;
}

export interface ScenarioParticipation {
  policy: string;
  authorityRequirement: {
    mode: AuthorityMode;
    authority: string;
    delegationAllowed: boolean;
  };
  attentionSchedule: {
    timing: AttentionTiming;
    checkpoint: string | null;
    consolidationGroup: string | null;
  };
  transactionBatching: ScenarioTransactionBatching;
}

const resultFields = [
  "authority_mode",
  "authority",
  "delegation_allowed",
  "attention_timing",
  "attention_checkpoint",
  "consolidation_group",
] as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function authorityEvidenceContract(
  value: unknown,
): AuthorityEvidenceContract | undefined {
  const contract = object(value);
  return typeof contract?.output === "string" &&
      typeof contract.type === "string"
    ? { output: contract.output, type: contract.type }
    : undefined;
}

function sameMembers(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item) => value.includes(item));
}

export function participationResult(
  value: unknown,
): Omit<ScenarioParticipation, "policy" | "transactionBatching"> | undefined {
  const result = object(value);
  const mode = result?.authority_mode;
  const authority = result?.authority;
  const delegationAllowed = result?.delegation_allowed;
  const timing = result?.attention_timing;
  const checkpoint = result?.attention_checkpoint;
  const consolidationGroup = result?.consolidation_group;
  if (
    !result || !sameMembers(Object.keys(result), [...resultFields]) ||
    !["autonomous", "delegated", "attended"].includes(String(mode)) ||
    typeof authority !== "string" || authority.length === 0 ||
    typeof delegationAllowed !== "boolean" ||
    !["none", "immediate", "checkpoint"].includes(String(timing)) ||
    !(checkpoint === null ||
      (typeof checkpoint === "string" && checkpoint.length > 0)) ||
    !(consolidationGroup === null ||
      (typeof consolidationGroup === "string" && consolidationGroup.length > 0))
  ) return undefined;
  if (
    timing === "checkpoint"
      ? checkpoint === null
      : checkpoint !== null || consolidationGroup !== null
  ) return undefined;
  return {
    authorityRequirement: {
      mode: mode as AuthorityMode,
      authority,
      delegationAllowed,
    },
    attentionSchedule: {
      timing: timing as AttentionTiming,
      checkpoint,
      consolidationGroup,
    },
  };
}

export function scenarioParticipation(
  policy: string,
  result: unknown,
  transactionBatching: unknown,
): ScenarioParticipation {
  const projected = participationResult(result);
  if (!projected) {
    throw new Error(`Participation Policy '${policy}' returned an invalid standardized result`);
  }
  if (!["single", "coherent-batch", "either"].includes(String(transactionBatching))) {
    throw new Error(`Scenario participation has invalid transaction batching '${String(transactionBatching)}'`);
  }
  return {
    policy,
    ...projected,
    transactionBatching: transactionBatching as ScenarioTransactionBatching,
  };
}

export function participationPolicyRequiresAuthorityEvidence(
  policy: VersionedDefinition,
): boolean {
  const results = [
    policy.default,
    ...(Array.isArray(policy.rules)
      ? policy.rules.flatMap((value) =>
          typeof value === "object" && value !== null
            ? [(value as Record<string, unknown>).result]
            : []
        )
      : []),
  ];
  return results.some((value) =>
    object(value)?.authority_mode !== "autonomous"
  );
}

export function validateParticipationPolicy(
  policy: VersionedDefinition,
  path: string,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  const schema = object(policy.result_schema);
  const properties = object(schema?.properties);
  const required = schema?.required;
  const shapeValid = schema?.type === "object" &&
    schema.additionalProperties === false &&
    properties !== undefined &&
    sameMembers(Object.keys(properties), [...resultFields]) &&
    sameMembers(required, [...resultFields]) &&
    object(properties?.authority_mode)?.type === "string" &&
    sameMembers(object(properties?.authority_mode)?.enum, [
      "autonomous",
      "delegated",
      "attended",
    ]) &&
    object(properties?.authority)?.type === "string" &&
    object(properties?.authority)?.minLength === 1 &&
    object(properties?.delegation_allowed)?.type === "boolean" &&
    object(properties?.attention_timing)?.type === "string" &&
    sameMembers(object(properties?.attention_timing)?.enum, [
      "none",
      "immediate",
      "checkpoint",
    ]) &&
    sameMembers(object(properties?.attention_checkpoint)?.type, [
      "string",
      "null",
    ]) &&
    sameMembers(object(properties?.consolidation_group)?.type, [
      "string",
      "null",
    ]);
  if (!shapeValid) {
    diagnostics.push({
      code: "participation-policy-result-schema",
      path: `${path}.result_schema`,
      message: `Participation Policy '${policy.id}@${policy.version}' must declare the standardized Authority Requirement and Attention Schedule result fields`,
    });
  }
  let validateResult: ((value: unknown) => boolean) | undefined;
  if (schema) {
    try {
      validateResult = new Ajv2020({ allErrors: true, strict: false }).compile(
        schema,
      );
    } catch {
      validateResult = undefined;
    }
  }
  const results = [
    { path: `${path}.default`, value: policy.default },
    ...(Array.isArray(policy.rules) ? policy.rules : []).map(
      (rule, index) => ({
        path: `${path}.rules[${index}].result`,
        value: object(rule)?.result,
      }),
    ),
  ];
  for (const candidate of results) {
    if (
      participationResult(candidate.value) &&
      (validateResult?.(candidate.value) ?? false)
    ) continue;
    diagnostics.push({
      code: "participation-policy-result",
      path: candidate.path,
      message: `Participation Policy '${policy.id}@${policy.version}' has an invalid Authority Requirement or Attention Schedule result`,
    });
  }
  return diagnostics;
}
