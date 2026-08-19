import { createHash } from "node:crypto";
import {
  evaluateLifecycle,
  evaluateProcessDefinition,
  evaluateProcessExpression,
  evaluateResolverInputs,
  evaluateScenarioParticipation,
  evaluateScenarioReviewPolicy,
  scenarioOutputExplanations,
  type DatumEnvelope,
  type ExactTypedEntity,
  type LifecycleEvaluation,
  type LifecycleSnapshot,
  type ObligationEvaluation,
  type ScenarioOutputExplanation,
} from "./evaluator.js";
import { isCompiledTextExpression } from "./expression.js";
import {
  markdownAssetFrontmatter,
  promptSkillReferences,
  readPackageMarkdownAsset,
} from "./markdown-asset.js";
import type {
  ProcessDiagnostic,
  ProcessPackage,
  VersionedDefinition,
} from "./index.js";
import { parseObligationInstanceIdentity } from "./obligation-instance.js";
import { recordWork } from "./performance-diagnostics.js";
import type { ScenarioParticipation } from "./participation.js";

export interface ScenarioInputCheck {
  check: "resolution" | "cardinality" | "identity" | "type" | "condition";
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

export interface ScenarioBoundEntity {
  identity: {
    id: string;
    type: string;
    revision_id?: string;
    revision?: number;
  };
  data: DatumEnvelope;
}

export interface ScenarioDryRunInput {
  name: string;
  contract: {
    types: string[];
    cardinality: string;
    identity: string;
  };
  values: ScenarioBoundEntity[];
  checks: ScenarioInputCheck[];
}

export interface ScenarioDryRunInvocation {
  inputs: ScenarioDryRunInput[];
}

export interface ResolvedProcessAsset {
  reference: string;
  path: string;
  digest: string;
  content: string;
}

export interface ResolvedPrompt extends ResolvedProcessAsset {
  skills: ResolvedProcessAsset[];
}

export interface ResolvedScenarioPolicyEvaluation {
  invocation: number;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  assets: ResolvedProcessAsset[];
}

export interface ResolvedScenarioPolicy {
  role: "review" | "waiver";
  reference: string;
  definition: { id: string; version: number };
  result?: Record<string, unknown>;
  evaluations?: ResolvedScenarioPolicyEvaluation[];
}

export type ScenarioAuthorization =
  | {
      mode: "explicit-initiation";
    }
  | {
      mode: "dispatchable-obligation";
      obligation: string;
    };

export interface ScenarioStandingDelegation {
  selector: string;
  authority: string;
  delegate: string;
  targetInput: string;
  invocations: {
    invocation: number;
    target: string | null;
    applicableEvidence: string[];
  }[];
}

export interface ScenarioDryRun {
  executable: true;
  sideEffectFree: true;
  definition: {
    obligation?: string;
    scenario: string;
  };
  authorization: ScenarioAuthorization;
  obligation?: {
    instance: string;
    subject: string;
    status: string;
    dispatchable: true;
  };
  invocations: ScenarioDryRunInvocation[];
  prompt: ResolvedPrompt;
  policies: ResolvedScenarioPolicy[];
  participation?: ScenarioParticipation[];
  standingDelegation?: ScenarioStandingDelegation;
  prohibitedInputs: string[];
  expectedOutputs: ScenarioOutputExplanation[];
  completion: {
    expression: string;
    status: "pending-output";
    genericChecks: string[];
  };
}

export type ScenarioDryRunResult =
  | { ok: true; value: ScenarioDryRun; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

interface RequestedInput {
  name: string;
  value: string;
}

type RecordValue = Record<string, unknown>;

function object(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function exactEntity(value: unknown): ExactTypedEntity | undefined {
  const identity = object(object(value)?.identity);
  return typeof identity?.id === "string" &&
    typeof identity.revision_id === "string" &&
    typeof identity.type === "string" &&
    typeof identity.revision === "number"
    ? {
        identity: {
          id: identity.id,
          revision_id: identity.revision_id,
          type: identity.type,
          revision: identity.revision,
        },
      }
    : undefined;
}

function referenceDefinition(
  catalog: Record<string, VersionedDefinition>,
  reference: string,
): VersionedDefinition | undefined {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  const definition = match?.[1] ? catalog[match[1]] : undefined;
  return definition?.version === Number(match?.[2]) ? definition : undefined;
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function resolvedAsset(
  processPackage: ProcessPackage,
  reference: string,
  kind: "prompt" | "skill" | "policy-asset",
): Promise<{ asset?: ResolvedProcessAsset; diagnostic?: ProcessDiagnostic }> {
  try {
    const read = await readPackageMarkdownAsset(processPackage.root, reference);
    if (!read.ok) {
      return {
        diagnostic: {
          code: read.reason === "invalid-reference"
            ? `invalid-${kind}-reference`
            : `${kind}-${read.reason}`,
          path: read.path,
          message: read.message,
        },
      };
    }
    const assetCatalog = object(processPackage.manifest.assets);
    const declared = kind === "policy-asset"
      ? Object.values(assetCatalog ?? {}).some((catalog) =>
          array(catalog).includes(reference)
        )
      : array(assetCatalog?.[`${kind}s`]).includes(reference);
    if (!declared) {
      return {
        diagnostic: {
          code: `${kind}-not-declared`,
          path: reference,
          message: `Resolved ${kind} '${reference}' is not declared by the exact Process Package`,
        },
      };
    }
    return {
      asset: {
        reference,
        path: read.asset.relativePath,
        digest: sha256(read.asset.content),
        content: read.asset.content,
      },
    };
  } catch (error) {
    return {
      diagnostic: {
        code: `${kind}-unavailable`,
        path: reference,
        message: `Could not resolve ${kind} '${reference}': ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

function referencedPolicyAssets(
  processPackage: ProcessPackage,
  result: Record<string, unknown>,
): string[] {
  const catalog = object(processPackage.manifest.assets);
  const declared = new Set(
    Object.values(catalog ?? {}).flatMap((value) =>
      array(value).filter((item): item is string => typeof item === "string")
    ),
  );
  const references = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (declared.has(value)) references.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (object(value)) Object.values(value as RecordValue).forEach(visit);
  };
  visit(result);
  return [...references].sort();
}

async function resolvePolicyAssets(
  processPackage: ProcessPackage,
  result: Record<string, unknown>,
): Promise<{ assets: ResolvedProcessAsset[]; diagnostics: ProcessDiagnostic[] }> {
  const resolved = await Promise.all(
    referencedPolicyAssets(processPackage, result).map((reference) =>
      resolvedAsset(processPackage, reference, "policy-asset")
    ),
  );
  return {
    assets: resolved.flatMap((value) => value.asset ? [value.asset] : []),
    diagnostics: resolved.flatMap((value) =>
      value.diagnostic ? [value.diagnostic] : []
    ),
  };
}

async function resolvePrompt(
  processPackage: ProcessPackage,
  reference: string,
): Promise<{ prompt?: ResolvedPrompt; diagnostics: ProcessDiagnostic[] }> {
  const resolved = await resolvedAsset(processPackage, reference, "prompt");
  if (!resolved.asset) {
    return { diagnostics: resolved.diagnostic ? [resolved.diagnostic] : [] };
  }
  const skillDeclaration = promptSkillReferences(resolved.asset.content);
  if (!skillDeclaration.ok) {
    return {
      diagnostics: [{
        code: "prompt-skills-invalid",
        path: resolved.asset.path,
        message: `Prompt '${reference}' must declare an ordered unique array of exact skill references`,
      }],
    };
  }
  const skillReferences = skillDeclaration.references;
  const skills: ResolvedProcessAsset[] = [];
  const diagnostics: ProcessDiagnostic[] = [];
  for (const skillReference of skillReferences) {
    const skill = await resolvedAsset(processPackage, skillReference, "skill");
    if (skill.asset) skills.push(skill.asset);
    if (skill.diagnostic) diagnostics.push(skill.diagnostic);
  }
  return {
    ...(diagnostics.length === 0
      ? { prompt: { ...resolved.asset, skills } }
      : {}),
    diagnostics,
  };
}

function obligationReference(instance: ObligationEvaluation): string {
  return parseObligationInstanceIdentity(instance.id)?.obligationReference ?? "";
}

function expressionValue(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  target: string,
  bindings: Record<string, unknown>,
): unknown {
  return evaluateProcessExpression(processPackage, snapshot, target, bindings)
    .result;
}

function cardinalityRange(cardinality: string): {
  minimum: number;
  maximum: number;
} {
  switch (cardinality) {
    case "one":
      return { minimum: 1, maximum: 1 };
    case "one-or-more":
      return { minimum: 1, maximum: Number.POSITIVE_INFINITY };
    case "zero-or-one":
      return { minimum: 0, maximum: 1 };
    default:
      return { minimum: 0, maximum: Number.POSITIVE_INFINITY };
  }
}

function boundEntity(
  value: unknown,
  snapshot: LifecycleSnapshot,
): ScenarioBoundEntity | undefined {
  const exact = exactEntity(value);
  const reference = exact?.identity.revision_id ?? string(value) ??
    string(object(value)?.key);
  if (!reference) return undefined;
  const revisions = snapshot.records
    .filter(
      (record) =>
        record.datum.id === reference || record.datum.revision_id === reference,
    )
    .sort((left, right) => right.datum.revision - left.datum.revision);
  const resolved = revisions[0];
  if (!resolved) return undefined;
  return resolved.datum.revision_id === reference
    ? {
        identity: {
          id: resolved.datum.id,
          revision_id: resolved.datum.revision_id,
          type: resolved.datum.type,
          revision: resolved.datum.revision,
        },
        data: resolved.datum,
      }
    : {
        identity: { id: resolved.datum.id, type: resolved.datum.type },
        data: resolved.datum,
      };
}

function boundValues(
  value: unknown,
  snapshot: LifecycleSnapshot,
): ScenarioBoundEntity[] {
  return (Array.isArray(value) ? value : [value])
    .map((item) => boundEntity(item, snapshot))
    .filter((item): item is ScenarioBoundEntity => item !== undefined)
    .sort((left, right) =>
      (left.identity.revision_id ?? left.identity.id).localeCompare(
        right.identity.revision_id ?? right.identity.id,
      ),
    );
}

function inputChecks(
  input: RecordValue,
  rawValue: unknown,
  values: ScenarioBoundEntity[],
): ScenarioInputCheck[] {
  const cardinality = string(input.cardinality) ?? "one";
  const range = cardinalityRange(cardinality);
  const expectedTypes = array(input.types)
    .filter((value): value is string => typeof value === "string")
    .sort();
  const identity = string(input.identity) ?? "revision";
  const authoredValues =
    rawValue === undefined || rawValue === null
      ? []
      : Array.isArray(rawValue)
        ? rawValue
        : [rawValue];
  return [
    {
      check: "resolution",
      passed: values.length === authoredValues.length,
      expected: "named lifecycle identities from the evaluated snapshot",
      actual: `${values.length}/${authoredValues.length} resolved`,
    },
    {
      check: "cardinality",
      passed: values.length >= range.minimum && values.length <= range.maximum,
      expected: cardinality,
      actual: values.length,
    },
    {
      check: "identity",
      passed:
        identity === "either" ||
        values.every(
          (value) =>
            identity === (value.identity.revision_id ? "revision" : "stable"),
        ),
      expected: identity,
      actual: values.map((value) =>
        value.identity.revision_id ? "revision" : "stable",
      ),
    },
    {
      check: "type",
      passed: values.every((value) =>
        expectedTypes.includes(value.identity.type),
      ),
      expected: expectedTypes,
      actual: values.map((value) => value.identity.type),
    },
  ];
}

function bindingCombinations(
  valuesByName: Record<string, ScenarioBoundEntity[]>,
): Record<string, ScenarioBoundEntity | undefined>[] {
  return Object.entries(valuesByName).sort(([left], [right]) =>
    left.localeCompare(right)
  ).reduce<Record<string, ScenarioBoundEntity | undefined>[]>(
    (contexts, [name, values]) => contexts.flatMap((context) =>
      (values.length > 0 ? values : [undefined]).map((value) => ({
        ...context,
        [name]: value,
      }))
    ),
    [{}],
  );
}

function policyProjection(
  role: ResolvedScenarioPolicy["role"],
  reference: string,
  processPackage: ProcessPackage,
  result?: Record<string, unknown>,
): ResolvedScenarioPolicy | undefined {
  const definition = referenceDefinition(processPackage.policies, reference);
  return definition
    ? {
        role,
        reference,
        definition: { id: definition.id, version: definition.version },
        ...(result ? { result } : {}),
      }
    : undefined;
}

async function resolveReviewPolicyEvaluations(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  scenarioReference: string,
  invocationBindings: Record<string, unknown>[],
): Promise<{
  evaluations: ResolvedScenarioPolicyEvaluation[];
  diagnostics: ProcessDiagnostic[];
}> {
  let evaluated: ReturnType<typeof evaluateScenarioReviewPolicy>;
  try {
    evaluated = evaluateScenarioReviewPolicy(
      processPackage,
      snapshot,
      scenarioReference,
      invocationBindings,
    );
  } catch (error) {
    return {
      evaluations: [],
      diagnostics: [{
        code: "review-policy-evaluation-failed",
        path: `${scenarioReference}#review_policy_arguments`,
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
  const evaluations: ResolvedScenarioPolicyEvaluation[] = [];
  for (const [invocation, evaluation] of (evaluated ?? []).entries()) {
    const resolvedAssets = await resolvePolicyAssets(
      processPackage,
      evaluation.result,
    );
    if (resolvedAssets.diagnostics.length > 0) {
      return { evaluations: [], diagnostics: resolvedAssets.diagnostics };
    }
    evaluations.push({
      invocation,
      arguments: evaluation.arguments,
      result: evaluation.result,
      assets: resolvedAssets.assets,
    });
  }
  return { evaluations, diagnostics: [] };
}

function requestedInputDiagnostics(
  requestedInputs: RequestedInput[],
  scenario: VersionedDefinition,
  snapshot: LifecycleSnapshot,
  invocationBindings: Record<string, unknown>[],
): ProcessDiagnostic[] {
  const prohibited = new Set(
    array(scenario.prohibited_inputs).filter(
      (value): value is string => typeof value === "string",
    ),
  );
  const declared = new Set(
    array(scenario.inputs).flatMap((value) => {
      const name = string(object(value)?.name);
      return name ? [name] : [];
    }),
  );
  const diagnostics: ProcessDiagnostic[] = [];
  for (const requested of requestedInputs) {
    if (prohibited.has(requested.name)) {
      diagnostics.push({
        code: "prohibited-scenario-input",
        path: requested.name,
        message: `Scenario '${scenario.id}@${scenario.version}' prohibits input '${requested.name}'`,
      });
      continue;
    }
    if (!declared.has(requested.name)) {
      diagnostics.push({
        code: "scenario-input-undeclared",
        path: requested.name,
        message: `Scenario '${scenario.id}@${scenario.version}' does not declare input '${requested.name}'`,
      });
      continue;
    }
    const resolved = invocationBindings.flatMap((bindings) =>
      boundValues(bindings[requested.name], snapshot).map(
        (value) => value.identity.revision_id ?? value.identity.id,
      ),
    );
    const supplied = requested.value.split(",").filter(Boolean).sort();
    if (
      JSON.stringify([...new Set(resolved)].sort()) !== JSON.stringify(supplied)
    ) {
      diagnostics.push({
        code: "scenario-input-binding-mismatch",
        path: requested.name,
        message: `Supplied input '${requested.name}' does not match the exact package-resolved binding`,
      });
    }
  }
  return diagnostics;
}

type ScenarioDryRunAuthorizationRequest =
  | { mode: "explicit-initiation" }
  | { mode: "dispatchable-obligation"; obligationInstance: string };

async function dryRunScenario(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  scenarioReference: string,
  authorizationRequest: ScenarioDryRunAuthorizationRequest,
  requestedInputs: RequestedInput[],
  preparedEvaluation?: LifecycleEvaluation,
): Promise<ScenarioDryRunResult> {
  const scenario = referenceDefinition(
    processPackage.scenarios,
    scenarioReference,
  );
  if (!scenario) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-definition-unavailable",
        path: scenarioReference,
        message: `Could not resolve exact Scenario '${scenarioReference}'`,
      }],
    };
  }

  let invocationBindings: Record<string, unknown>[];
  let definition: ScenarioDryRun["definition"];
  let authorization: ScenarioAuthorization;
  let obligationProjection: ScenarioDryRun["obligation"];
  let policies: ResolvedScenarioPolicy[];
  let participationProjection: ScenarioParticipation[] | undefined;
  let expectedOutputs: ScenarioOutputExplanation[];

  if (authorizationRequest.mode === "explicit-initiation") {
    const resolves = array(scenario.resolves);
    if (scenario.initiation !== "explicit" || resolves.length > 0) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-explicit-initiation-prohibited",
          path: scenarioReference,
          message: `Scenario '${scenarioReference}' is not declared for explicit initiation`,
        }],
      };
    }
    const requestedByName = new Map(
      requestedInputs.map((input) => [
        input.name,
        input.value.split(",").filter(Boolean),
      ]),
    );
    invocationBindings = [Object.fromEntries(
      array(scenario.inputs).flatMap((inputValue) => {
        const input = object(inputValue);
        const name = string(input?.name);
        if (!name) return [];
        const values = requestedByName.get(name) ?? [];
        return [[
          name,
          ["one", "zero-or-one"].includes(string(input?.cardinality) ?? "")
            ? values[0]
            : values,
        ]];
      }),
    )];
    definition = { scenario: scenarioReference };
    authorization = { mode: "explicit-initiation" };
    const reviewPolicyReference = string(scenario.review_policy_ref) ?? "";
    policies = [
      policyProjection("review", reviewPolicyReference, processPackage),
    ].filter((value): value is ResolvedScenarioPolicy => value !== undefined);
    if (policies.length !== 1) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-policy-unavailable",
          path: scenarioReference,
          message: `Could not resolve exact review Policy for '${scenarioReference}'`,
        }],
      };
    }
    expectedOutputs = scenarioOutputExplanations(scenario);
  } else {
    const obligationInstance = authorizationRequest.obligationInstance;
    const evaluation = preparedEvaluation ?? (() => {
      recordWork("lifecycle.evaluation.snapshots");
      return evaluateLifecycle(processPackage, snapshot);
    })();
    if (evaluation.diagnostics.length > 0) {
      return { ok: false, diagnostics: evaluation.diagnostics };
    }
    const instance = evaluation.obligations.find(
      (candidate) => candidate.id === obligationInstance,
    );
    if (!instance) {
      return {
        ok: false,
        diagnostics: [{
          code: "unknown-obligation-instance",
          path: obligationInstance,
          message: `Unknown Obligation Instance '${obligationInstance}' in the evaluated lifecycle snapshot`,
        }],
      };
    }
    if (instance.eventualResolver !== scenarioReference) {
      return {
        ok: false,
        diagnostics: [{
          code: "resolver-scenario-mismatch",
          path: scenarioReference,
          message: `Obligation Instance '${obligationInstance}' resolves with '${instance.eventualResolver}', not '${scenarioReference}'`,
        }],
      };
    }
    if (
      !instance.dispatchable ||
      instance.actionableResolver !== scenarioReference
    ) {
      return {
        ok: false,
        diagnostics: [{
          code: "obligation-not-dispatchable",
          path: obligationInstance,
          message: `Obligation Instance '${obligationInstance}' is not Dispatchable (status '${instance.status}', blockers ${instance.blockedBy.length}, unresolved bindings ${instance.unresolvedBindings.join(", ") || "none"})`,
        }],
      };
    }
    const obligation = referenceDefinition(
      processPackage.obligations,
      obligationReference(instance),
    );
    if (!obligation) {
      return {
        ok: false,
        diagnostics: [{
          code: "resolver-definition-unavailable",
          path: scenarioReference,
          message: `Could not resolve exact definitions for '${scenarioReference}' and '${obligationReference(instance)}'`,
        }],
      };
    }
    try {
      invocationBindings = evaluateResolverInputs(
        processPackage,
        snapshot,
        `${obligation.id}@${obligation.version}`,
        instance.subject,
      );
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-input-resolution-failed",
          path: obligationInstance,
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
    definition = {
      obligation: `${obligation.id}@${obligation.version}`,
      scenario: scenarioReference,
    };
    authorization = {
      mode: "dispatchable-obligation",
      obligation: obligationInstance,
    };
    obligationProjection = {
      instance: instance.id,
      subject: instance.subject,
      status: instance.status,
      dispatchable: true,
    };
    participationProjection = evaluateScenarioParticipation(
      processPackage,
      snapshot,
      scenarioReference,
      invocationBindings,
    );
    const reviewPolicyReference = string(scenario.review_policy_ref) ?? "";
    const waiverPolicyReference = instance.waiver.policy;
    policies = [
      policyProjection("review", reviewPolicyReference, processPackage),
      policyProjection("waiver", waiverPolicyReference, processPackage, {
        permitted: instance.waiver.result.permitted,
        approval_required: instance.waiver.result.approvalRequired,
        applicable: instance.waiver.result.applicable,
        scope: instance.waiver.result.scope,
      }),
    ].filter((value): value is ResolvedScenarioPolicy => value !== undefined);
    if (policies.length !== 2) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-policy-unavailable",
          path: scenarioReference,
          message: `Could not resolve exact review and waiver Policies for '${scenarioReference}'`,
        }],
      };
    }
    expectedOutputs = instance.resolver.expectedOutputs;
  }

  const requestedDiagnostics = requestedInputDiagnostics(
    requestedInputs,
    scenario,
    snapshot,
    invocationBindings,
  );
  if (requestedDiagnostics.length > 0) {
    return { ok: false, diagnostics: requestedDiagnostics };
  }

  const scenarioInputs = array(scenario.inputs)
    .map(object)
    .filter((value): value is RecordValue => value !== undefined);
  const invocations: ScenarioDryRunInvocation[] = [];
  const diagnostics: ProcessDiagnostic[] = [];
  for (const bindings of invocationBindings) {
    const inputs = scenarioInputs.map((input) => {
      const name = string(input.name) ?? "";
      const values = boundValues(bindings[name], snapshot);
      return {
        name,
        contract: {
          types: array(input.types)
            .filter((value): value is string => typeof value === "string")
            .sort(),
          cardinality: string(input.cardinality) ?? "",
          identity: string(input.identity) ?? "",
        },
        values,
        checks: inputChecks(input, bindings[name], values),
      };
    });
    for (const input of inputs) {
      for (const check of input.checks) {
        if (check.passed) continue;
        diagnostics.push({
          code: `scenario-input-${check.check}-invalid`,
          path: `scenarios.${scenario.id}.inputs.${input.name}`,
          message: `Scenario input '${input.name}' failed its ${check.check} contract check`,
        });
      }
    }
    invocations.push({ inputs });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  for (
    let inputIndex = 0;
    inputIndex < scenarioInputs.length;
    inputIndex += 1
  ) {
    const input = scenarioInputs[inputIndex]!;
    if (!isCompiledTextExpression(input.conditions)) continue;
    const name = string(input.name) ?? "";
    for (const invocation of invocations) {
      const valuesByName = Object.fromEntries(
        invocation.inputs.map((item) => [item.name, item.values]),
      );
      for (const context of bindingCombinations(valuesByName)) {
        const conditionBindings = Object.fromEntries(
          Object.entries(context).map(([bindingName, value]) => [
            bindingName,
            value?.identity.revision_id ?? value?.identity.id,
          ]),
        );
        let passed = false;
        try {
          passed =
            expressionValue(
              processPackage,
              snapshot,
              `${scenarioReference}#inputs[${inputIndex}].conditions`,
              conditionBindings,
            ) === true;
        } catch (error) {
          return {
            ok: false,
            diagnostics: [
              {
                code: "scenario-input-condition-invalid",
                path: `scenarios.${scenario.id}.inputs.${name}.conditions`,
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
        if (!passed) {
          return {
            ok: false,
            diagnostics: [
              {
                code: "scenario-input-condition-failed",
                path: `scenarios.${scenario.id}.inputs.${name}.conditions`,
                message: `Scenario input '${name}' does not satisfy its package-authored condition`,
              },
            ],
          };
        }
      }
      invocation.inputs
        .find((candidate) => candidate.name === name)
        ?.checks.push({
          check: "condition",
          passed: true,
          expected: input.conditions.source,
          actual: true,
        });
    }
  }

  const reviewPolicyEvaluations = await resolveReviewPolicyEvaluations(
    processPackage,
    snapshot,
    scenarioReference,
    invocationBindings,
  );
  if (reviewPolicyEvaluations.diagnostics.length > 0) {
    return { ok: false, diagnostics: reviewPolicyEvaluations.diagnostics };
  }
  const reviewPolicy = policies.find((policy) => policy.role === "review");
  if (reviewPolicy && reviewPolicyEvaluations.evaluations.length > 0) {
    reviewPolicy.evaluations = reviewPolicyEvaluations.evaluations;
  }

  if (authorizationRequest.mode === "explicit-initiation") {
    try {
      participationProjection = evaluateScenarioParticipation(
        processPackage,
        snapshot,
        scenarioReference,
        invocationBindings,
      );
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: "scenario-participation-evaluation-failed",
          path: `${scenarioReference}#participation`,
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
  }

  const standingDelegation = object(scenario.standing_delegation);
  let standingDelegationProjection: ScenarioStandingDelegation | undefined;
  if (standingDelegation) {
    const selector = string(standingDelegation.selector_ref);
    const authority = string(standingDelegation.authority);
    const delegate = string(standingDelegation.delegate);
    const targetInput = string(standingDelegation.target_input);
    if (selector && authority && delegate && targetInput) {
      standingDelegationProjection = {
        selector,
        authority,
        delegate,
        targetInput,
        invocations: invocations.map((invocation, invocationIndex) => {
          const target = invocation.inputs.find((input) =>
            input.name === targetInput
          )?.values[0]?.identity.revision_id ?? null;
          if (!target) {
            return {
              invocation: invocationIndex,
              target,
              applicableEvidence: [],
            };
          }
          const evaluated = evaluateProcessDefinition(
            processPackage,
            snapshot,
            "selector",
            selector,
            {
              target,
              scenario: scenarioReference,
              authority,
              delegate,
            },
          ).result;
          const applicableEvidence = Array.isArray(evaluated)
            ? evaluated.flatMap((value) => {
                const identity = object(value)?.identity;
                const revisionId = string(object(identity)?.revision_id);
                return revisionId ? [revisionId] : [];
              }).sort()
            : [];
          return {
            invocation: invocationIndex,
            target,
            applicableEvidence: [...new Set(applicableEvidence)],
          };
        }),
      };
    }
  }

  const promptReference = string(scenario.prompt_ref) ?? "";
  const resolvedPrompt = await resolvePrompt(processPackage, promptReference);
  if (!resolvedPrompt.prompt) {
    return { ok: false, diagnostics: resolvedPrompt.diagnostics };
  }
  const promptFrontmatter = markdownAssetFrontmatter(resolvedPrompt.prompt.content);
  if (promptFrontmatter?.scenario !== scenario.id) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "prompt-scenario-mismatch",
          path: resolvedPrompt.prompt.path,
          message: `Prompt '${promptReference}' does not declare Scenario '${scenario.id}'`,
        },
      ],
    };
  }
  const completion = scenario.completion;
  if (!isCompiledTextExpression(completion)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "scenario-completion-unavailable",
          path: `${scenarioReference}#completion`,
          message: `Scenario '${scenarioReference}' has no compiled completion expression`,
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      executable: true,
      sideEffectFree: true,
      definition,
      authorization,
      ...(obligationProjection ? { obligation: obligationProjection } : {}),
      invocations,
      prompt: resolvedPrompt.prompt,
      policies,
      ...(participationProjection
        ? { participation: participationProjection }
        : {}),
      ...(standingDelegationProjection
        ? { standingDelegation: standingDelegationProjection }
        : {}),
      prohibitedInputs: array(scenario.prohibited_inputs)
        .filter((value): value is string => typeof value === "string")
        .sort(),
      expectedOutputs,
      completion: {
        expression: completion.source,
        status: "pending-output",
        genericChecks: [
          "declared-output-cardinality",
          "no-undeclared-outputs",
          "output-schema-validity",
          "source-owned-required-links",
        ],
      },
    },
    diagnostics: [],
  };
}

export async function dryRunResolverScenario(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  scenarioReference: string,
  obligationInstance: string,
  requestedInputs: RequestedInput[],
  preparedEvaluation?: LifecycleEvaluation,
): Promise<ScenarioDryRunResult> {
  return dryRunScenario(
    processPackage,
    snapshot,
    scenarioReference,
    { mode: "dispatchable-obligation", obligationInstance },
    requestedInputs,
    preparedEvaluation,
  );
}

export async function dryRunExplicitScenario(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  scenarioReference: string,
  requestedInputs: RequestedInput[],
): Promise<ScenarioDryRunResult> {
  return dryRunScenario(
    processPackage,
    snapshot,
    scenarioReference,
    { mode: "explicit-initiation" },
    requestedInputs,
  );
}
