import {
  compileAssignmentProjection,
  type AssignmentProjectionPlan,
  type AssignmentRendererContract,
} from "./assignment-projection-compiler.js";
import {
  compiledExpressionFacts,
  directIdentityEqualities,
  type CompiledExpressionPath,
} from "./expression.js";
import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function referenceId(reference: unknown): string | undefined {
  if (typeof reference !== "string") return undefined;
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  return match?.[1];
}

function sameStrings(left: string[], right: string[]): boolean {
  const sortedLeft = [...new Set(left)].sort();
  const sortedRight = [...new Set(right)].sort();
  return sortedLeft.length === sortedRight.length &&
    sortedLeft.every((item, index) => item === sortedRight[index]);
}

function pathMatches(
  candidate: CompiledExpressionPath,
  binding: string,
  segments: string[],
): boolean {
  return candidate.binding === binding &&
    candidate.segments.length === segments.length &&
    candidate.segments.every((segment, index) => segment === segments[index]);
}

function identityType(path: CompiledExpressionPath): boolean {
  return path.segments.length === 2 &&
    path.segments[0] === "identity" &&
    path.segments[1] === "type";
}

export type ProcessConstraintStatus =
  | "proved"
  | "contradictory"
  | "inconclusive";

export type ProcessConstraintKind =
  | "discriminated-output"
  | "phase-admission";

export interface ProcessConstraintCheck {
  name: string;
  kind: ProcessConstraintKind;
  status: ProcessConstraintStatus;
  paths: string[];
  fact: string;
  diagnostics: ProcessDiagnostic[];
}

export interface CompiledProcessContract {
  status: ProcessConstraintStatus;
  checks: ProcessConstraintCheck[];
  assignmentPlans: Record<string, AssignmentProjectionPlan>;
}

export interface ProcessConstraintCatalogs {
  types: Record<string, VersionedDefinition>;
  templates: Record<string, VersionedDefinition>;
  obligations: Record<string, VersionedDefinition>;
  scenarios: Record<string, VersionedDefinition>;
  selectors: Record<string, VersionedDefinition>;
  phases: Record<string, VersionedDefinition>;
}

export type CompileProcessConstraintsResult =
  | {
      ok: true;
      contract: CompiledProcessContract;
      diagnostics: [];
    }
  | {
      ok: false;
      contract: CompiledProcessContract;
      diagnostics: ProcessDiagnostic[];
    };

function identityDiagnostics(
  scenarios: Record<string, VersionedDefinition>,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const scenario of Object.values(scenarios)) {
    const inputs = Array.isArray(scenario.inputs) ? scenario.inputs : [];
    const outputs = Array.isArray(scenario.outputs) ? scenario.outputs : [];
    const inputNames = new Set(inputs.flatMap((value) => {
      const name = record(value)?.name;
      return typeof name === "string" ? [name] : [];
    }));
    const outputNames = new Set(outputs.flatMap((value) => {
      const name = record(value)?.name;
      return typeof name === "string" ? [name] : [];
    }));
    for (const equality of directIdentityEqualities(scenario.completion)) {
      const [outputName, inputName] =
        outputNames.has(equality.left) && inputNames.has(equality.right)
          ? [equality.left, equality.right]
          : outputNames.has(equality.right) && inputNames.has(equality.left)
          ? [equality.right, equality.left]
          : [];
      if (!outputName || !inputName) continue;
      const outputIndex = outputs.findIndex((value) =>
        record(value)?.name === outputName
      );
      const output = record(outputs[outputIndex]);
      if (record(output?.identity_from)?.input === inputName) continue;
      diagnostics.push({
        code: "scenario-output-identity-binding-mismatch",
        path: `scenarios.${scenario.id}.outputs[${outputIndex}].identity_from`,
        message: `Scenario '${scenario.id}' output '${outputName}' requires identity_from input '${inputName}' to satisfy its direct completion identity equality`,
      });
    }
  }
  return diagnostics;
}

function outputDiscriminatorChecks(
  catalogs: ProcessConstraintCatalogs,
): ProcessConstraintCheck[] {
  const checks: ProcessConstraintCheck[] = [];
  for (const scenario of Object.values(catalogs.scenarios).sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const scenarioReference = `${scenario.id}@${scenario.version}`;
    const scenarioInputs = new Set(
      (Array.isArray(scenario.inputs) ? scenario.inputs : []).flatMap((value) => {
        const name = record(value)?.name;
        return typeof name === "string" ? [name] : [];
      }),
    );
    const relatedObligations = Object.values(catalogs.obligations).filter(
      (obligation) => {
        const resolver = record(obligation.resolve_with);
        return resolver?.scenario === scenarioReference ||
          strings(scenario.resolves).includes(obligation.id);
      },
    );
    const finiteDomains = relatedObligations.flatMap((obligation) =>
      (Array.isArray(obligation.status_rules) ? obligation.status_rules : [])
        .flatMap((value, ruleIndex) => {
          const rule = record(value);
          if (rule?.status !== "ready") return [];
          const facts = compiledExpressionFacts(rule.when);
          return facts?.finitePathMemberships.flatMap((membership) => {
            if (
              !scenarioInputs.has(membership.path.binding) ||
              membership.path.segments[0] !== "payload" ||
              membership.path.segments.length < 2 ||
              membership.values.length < 2
            ) return [];
            return [{
              input: membership.path.binding,
              path: membership.path.segments.slice(1).join("."),
              values: [...new Set(membership.values)].sort(),
              declarationPath:
                `obligations.${obligation.id}.status_rules[${ruleIndex}].when`,
            }];
          }) ?? [];
        })
    );
    for (const domain of finiteDomains) {
      const completionPath = `scenarios.${scenario.id}.completion`;
      const completionFacts = compiledExpressionFacts(scenario.completion);
      const hasEquality = completionFacts?.pathEqualities.some((equality) => {
        const discriminatorSegments = ["payload", ...domain.path.split(".")];
        return identityType(equality.left) &&
            pathMatches(
              equality.right,
              domain.input,
              discriminatorSegments,
            ) ||
          identityType(equality.right) &&
            pathMatches(
              equality.left,
              domain.input,
              discriminatorSegments,
            );
      }) ?? false;
      const outputs = Array.isArray(scenario.outputs) ? scenario.outputs : [];
      const routes = outputs.flatMap((value, outputIndex) => {
        const output = record(value);
        const typeFrom = record(output?.type_from);
        if (
          typeFrom?.input !== domain.input ||
          typeFrom.path !== domain.path ||
          !sameStrings(strings(output?.types), domain.values)
        ) return [];
        return [{
          outputIndex,
          path: `scenarios.${scenario.id}.outputs[${outputIndex}].type_from`,
        }];
      });
      const routePath = routes.length === 1
        ? routes[0]!.path
        : `scenarios.${scenario.id}.outputs`;
      if (!hasEquality && routes.length === 0) continue;
      const paths = [completionPath, domain.declarationPath, routePath];
      const symbolicPath = `${domain.input}.payload.${domain.path}`;
      const fact = `${symbolicPath} in [${domain.values.join(", ")}]; output.identity.type == ${symbolicPath}; routes=${routes.length}`;
      const name = `discriminated-output:${scenario.id}:${domain.input}.${domain.path}`;
      if (!hasEquality) {
        checks.push({
          name,
          kind: "discriminated-output",
          status: "inconclusive",
          paths,
          fact,
          diagnostics: [{
            code: "process-constraint-inconclusive",
            path: completionPath,
            message: `Cannot prove the finite output discriminator across ${completionPath}, ${domain.declarationPath}, and ${routePath}: ${fact}`,
          }],
        });
      } else if (routes.length !== 1) {
        checks.push({
          name,
          kind: "discriminated-output",
          status: "contradictory",
          paths,
          fact,
          diagnostics: [{
            code: "process-constraint-discriminated-output",
            path: routePath,
            message: `Contradictory finite output discriminator across ${completionPath}, ${domain.declarationPath}, and ${routePath}: ${fact}`,
          }],
        });
      } else {
        checks.push({
          name,
          kind: "discriminated-output",
          status: "proved",
          paths,
          fact,
          diagnostics: [],
        });
      }
    }
  }
  return checks;
}

function phaseAdmissionChecks(
  catalogs: ProcessConstraintCatalogs,
): ProcessConstraintCheck[] {
  const checks: ProcessConstraintCheck[] = [];
  for (const source of Object.values(catalogs.phases).sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const progression = record(source.progression);
    const nextId = typeof progression?.next_phase === "string"
      ? progression.next_phase
      : undefined;
    const next = nextId ? catalogs.phases[nextId] : undefined;
    if (!next) continue;
    const entryFacts = compiledExpressionFacts(next.entry);
    const entrySelectors = entryFacts?.selectorCalls.filter((call) =>
      call.operation === "exists"
    ).map((call) => call.reference) ?? [];
    const gateFacts = compiledExpressionFacts(record(source.gate)?.candidate_selector);
    const gateSelectors = new Set(
      gateFacts?.selectorCalls.filter((call) => call.operation === "select")
        .map((call) => call.reference) ?? [],
    );
    for (const targetReference of entrySelectors) {
      const targetId = referenceId(targetReference);
      const target = targetId ? catalogs.selectors[targetId] : undefined;
      const from = record(record(target?.query)?.from);
      const sourceReference = typeof from?.selector === "string"
        ? from.selector
        : undefined;
      if (!sourceReference || !gateSelectors.has(sourceReference)) continue;
      const readinessPath = `phases.${source.id}.progression.readiness`;
      const entryPath = `phases.${next.id}.entry`;
      const selectorPath = `selectors.${target?.id}.query.from.selector`;
      const paths = [readinessPath, entryPath, selectorPath];
      const readinessFacts = compiledExpressionFacts(progression?.readiness);
      const hasSourceQuantifier = readinessFacts?.selectorCalls.some((call) =>
        call.operation === "every" && call.reference === sourceReference
      ) ?? false;
      const admitted = readinessFacts?.selectorAdmissions.some((fact) =>
        fact.source === sourceReference && fact.target === targetReference
      ) ?? false;
      if (!hasSourceQuantifier) continue;
      const fact = `${sourceReference} candidate admitted to ${targetReference}; adjacent entry requires exists(${targetReference})`;
      const name = `phase-admission:${source.id}:${next.id}`;
      if (!admitted) {
        checks.push({
          name,
          kind: "phase-admission",
          status: "contradictory",
          paths,
          fact,
          diagnostics: [{
            code: "process-constraint-phase-admission",
            path: readinessPath,
            message: `Contradictory adjacent Phase admission across ${readinessPath} and ${entryPath}: ${fact}`,
          }],
        });
      } else {
        checks.push({
          name,
          kind: "phase-admission",
          status: "proved",
          paths,
          fact,
          diagnostics: [],
        });
      }
    }
  }
  return checks;
}

/** Compile reusable runtime routes and bounded declaration proofs once. */
export function compileProcessConstraints(input: {
  catalogs: ProcessConstraintCatalogs;
  renderer: AssignmentRendererContract;
  scenarioSources?: Record<string, string>;
}): CompileProcessConstraintsResult {
  const diagnostics = identityDiagnostics(input.catalogs.scenarios);
  const assignmentPlans: Record<string, AssignmentProjectionPlan> = {};
  for (const scenario of Object.values(input.catalogs.scenarios).sort(
    (left, right) => left.id.localeCompare(right.id),
  )) {
    const compiled = compileAssignmentProjection({
      scenario,
      renderer: input.renderer,
      source: input.scenarioSources?.[scenario.id] ??
        `scenarios.${scenario.id}`,
    });
    if (!compiled.ok) diagnostics.push(...compiled.diagnostics);
    else assignmentPlans[scenario.id] = compiled.plan;
  }
  const checks = [
    ...outputDiscriminatorChecks(input.catalogs),
    ...phaseAdmissionChecks(input.catalogs),
  ].sort((left, right) => left.name.localeCompare(right.name));
  diagnostics.push(...checks.flatMap((check) =>
    check.status === "contradictory" ? check.diagnostics : []
  ));
  const status = checks.some((check) => check.status === "contradictory")
    ? "contradictory"
    : checks.some((check) => check.status === "inconclusive")
    ? "inconclusive"
    : "proved";
  const contract: CompiledProcessContract = {
    status,
    checks,
    assignmentPlans,
  };
  return diagnostics.length === 0
    ? { ok: true, contract, diagnostics: [] }
    : { ok: false, contract, diagnostics };
}
