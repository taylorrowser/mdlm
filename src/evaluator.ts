import {
  compareDependencyChanges,
  type DependencyChangeRecord,
  type DependencyComparison,
} from "./dependency-changes.js";
import {
  evaluateCompiledTextExpression,
  evaluateCompiledTextValue,
  isCompiledTextExpression,
  type CompiledTextExpression,
} from "./expression.js";
import type {
  ProcessDiagnostic,
  ProcessPackage,
  VersionedDefinition,
} from "./index.js";
export interface DatumEnvelope {
  id: string;
  revision: number;
  revision_id: string;
  type: string;
  payload: Record<string, unknown>;
  links: { type: string; target: string }[];
  created_by: {
    process_ref: string;
    [key: string]: unknown;
  };
  body: string;
}

export interface LifecycleRecord {
  datum: DatumEnvelope;
  storage: { editable: boolean; frozen: boolean };
  integrity: {
    parseable: boolean;
    schema_valid: boolean;
    identity_valid: boolean;
    references_valid: boolean;
    hash_valid: boolean;
    transaction_valid?: boolean;
  };
}

export interface HistoricalLifecycleSnapshot {
  snapshotRef: string;
  processRef: string;
  records: LifecycleRecord[];
  dependencyComparisons: DependencyComparison[];
}

export interface LifecycleSnapshot {
  processRef: string;
  records: LifecycleRecord[];
  dependencyComparisons: DependencyComparison[];
  historicalSnapshots?: HistoricalLifecycleSnapshot[];
}

export interface ArtifactEvaluation {
  states: Record<string, string | string[]>;
  stateExplanations: Record<string, string | string[]>;
}

export interface ExactTypedEntity {
  identity: {
    id: string;
    revision_id: string;
    type: string;
    revision: number;
  };
}

export interface SelectorEvaluationEvidence {
  selector: string;
  arguments: Record<string, unknown>;
  result: ExactTypedEntity[];
}

export interface LifecycleEvaluation {
  artifacts: Record<string, ArtifactEvaluation>;
  dependencyChanges: DependencyChangeRecord[];
  diagnostics: ProcessDiagnostic[];
}

export interface ProcessDefinitionEvidence {
  kind: "expression" | "policy" | "relation" | "selector" | "state";
  definition: string;
  source?: string;
  span?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  arguments?: Record<string, unknown>;
  result: unknown;
  [key: string]: unknown;
}

export interface ProcessDirectEvaluation {
  target: {
    definition: string;
    kind: "policy" | "relation" | "selector" | "state";
  };
  arguments: Record<string, unknown>;
  result: unknown;
  traversedDefinitions: string[];
  evidence: ProcessDefinitionEvidence[];
}

export interface ProcessExpressionEvaluation {
  target: {
    definition: string;
    kind: string;
    field: string;
  };
  contract: {
    expectedType: string;
    bindings: {
      name: string;
      valueType: string;
      domainKind?: string;
      lifecycleTypes?: string[];
    }[];
  };
  suppliedBindings: Record<string, unknown>;
  result: unknown;
  traversedDefinitions: string[];
  evidence: ProcessDefinitionEvidence[];
}

type EntityKind = "process" | "record" | "revision" | "stable-datum";

interface Entity {
  entityKind: EntityKind;
  key: string;
  id?: string;
  version?: number;
  current_ref?: string;
  identity?: {
    id?: string;
    revision_id?: string;
    type?: string;
    revision?: number;
  };
  payload?: Record<string, unknown>;
  storage?: LifecycleRecord["storage"];
  integrity?: LifecycleRecord["integrity"] | { package_valid: boolean };
  provenance?: { process_ref: string };
  datum?: DatumEnvelope;
  record?: object;
}

type EvaluationContext = Record<string, unknown>;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function referenceId(reference: unknown): string {
  const value = string(reference);
  if (!value) throw new Error(`Expected a versioned definition reference`);
  const match = /^(.*)@[1-9][0-9]*$/.exec(value);
  if (!match?.[1]) throw new Error(`Invalid versioned reference '${value}'`);
  return match[1];
}

class LifecycleEvaluator {
  private readonly entities: Entity[];
  private readonly byRevision = new Map<string, Entity>();
  private readonly stateMemo = new Map<string, string | string[]>();
  private readonly stateExplanationMemo = new Map<
    string,
    string | string[]
  >();
  private readonly stateStack = new Set<string>();
  private readonly selectorStack = new Set<string>();
  private readonly selectorMemo = new Map<string, Entity[]>();
  private readonly baseContext: EvaluationContext;
  private readonly exactBaselineType: string | undefined;
  private readonly dependencyChanges: DependencyChangeRecord[];
  private readonly comparisonDiagnostics: ProcessDiagnostic[];
  private definitionEvidence: ProcessDefinitionEvidence[] | undefined;
  private readonly expressionDefinitions = new Map<object, string>();
  constructor(
    private readonly processPackage: ProcessPackage,
    private readonly snapshot: LifecycleSnapshot,
  ) {
    this.exactBaselineType = processPackage.kernelCapabilities[
      "exact-baseline@1"
    ]?.type;
    const comparison = compareDependencyChanges(
      snapshot.records,
      snapshot.dependencyComparisons ?? [],
      this.exactBaselineType === undefined
        ? {}
        : { exactBaselineType: this.exactBaselineType },
    );
    this.dependencyChanges = comparison.changes;
    this.comparisonDiagnostics = comparison.diagnostics;
    this.entities = snapshot.records.map((record) => {
      const entity: Entity = {
        entityKind: "revision",
        key: record.datum.revision_id,
        identity: {
          id: record.datum.id,
          revision_id: record.datum.revision_id,
          type: record.datum.type,
          revision: record.datum.revision,
        },
        payload: record.datum.payload,
        storage: record.storage,
        integrity: record.integrity,
        provenance: {
          process_ref: record.datum.created_by.process_ref,
        },
        datum: record.datum,
      };
      this.byRevision.set(record.datum.revision_id, entity);
      return entity;
    });
    this.baseContext = { process: { entityKind: "process", key: snapshot.processRef, current_ref: snapshot.processRef, integrity: { package_valid: true } } };
    for (const definition of this.expressionBearingDefinitions()) {
      this.indexDefinitionExpressions(
        definition,
        `${definition.id}@${definition.version}`,
      );
    }
  }

  private expressionBearingDefinitions(): VersionedDefinition[] {
    return [
      ...Object.values(this.processPackage.selectors),
      ...Object.values(this.processPackage.policies),
      ...Object.values(this.processPackage.states),
      ...Object.values(this.processPackage.actions),
    ];
  }

  evaluateExpressionTarget(
    target: string,
    suppliedBindings: Record<string, unknown>,
    collectEvidence = true,
  ): ProcessExpressionEvaluation {
    const match = /^([a-z][a-z0-9-]*)@([1-9][0-9]*)#(.+)$/.exec(target);
    if (!match?.[1] || !match[2] || !match[3]) {
      throw new Error(
        `Expression target '${target}' must be <definition>@<version>#<field>`,
      );
    }
    const id = match[1];
    const version = Number(match[2]);
    const field = match[3];
    const definitions = this.expressionBearingDefinitions().filter(
      (definition) => definition.id === id && definition.version === version,
    );
    if (definitions.length !== 1) {
      throw new Error(`Unknown or ambiguous definition '${id}@${version}'`);
    }
    const definition = definitions[0]!;
    const expression = field.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>(
      (value, segment) =>
        Array.isArray(value) && /^[0-9]+$/.test(segment)
          ? value[Number(segment)]
          : object(value)?.[segment],
      definition,
    );
    if (!isCompiledTextExpression(expression) || !expression.contract) {
      throw new Error(`Definition field '${target}' is not an expression`);
    }
    const evaluatorBindings = new Set(["process"]);
    const availableBindings = new Set(
      Object.keys(expression.contract.bindings).filter(
        (name) => !evaluatorBindings.has(name),
      ),
    );
    const suppliedNames = Object.keys(suppliedBindings);
    const unknown = suppliedNames.filter((name) => !availableBindings.has(name)).sort();
    const missing = [...availableBindings].filter(
      (name) => !Object.hasOwn(suppliedBindings, name),
    ).sort();
    const bindingErrors = [
      ...unknown.map((name) => `Unknown expression binding '${name}'`),
      ...missing.map((name) => `missing required binding '${name}'`),
    ];
    if (bindingErrors.length > 0) throw new Error(bindingErrors.join("; "));
    const resolvedBindings = Object.fromEntries(
      Object.entries(suppliedBindings).map(([name, value]) => [
        name,
        this.resolveSuppliedValue(
          value,
          expression.contract?.bindings[name]?.domainKind === "stable-datum",
          expression.contract?.bindings[name]?.domainKind,
        ),
      ]),
    );
    for (const name of availableBindings) {
      const binding = expression.contract.bindings[name]!;
      const value = resolvedBindings[name];
      const valid = binding.valueType === "unknown" ||
        (binding.valueType === "entity" && this.isEntity(value)) ||
        (binding.valueType === "array" && Array.isArray(value)) ||
        (binding.valueType === "object" && object(value) !== undefined) ||
        (binding.valueType === "null" && value === null) ||
        (binding.valueType === "integer" && Number.isInteger(value)) ||
        (binding.valueType === "number" && typeof value === "number") ||
        (binding.valueType === "string" && typeof value === "string") ||
        (binding.valueType === "boolean" && typeof value === "boolean");
      if (!valid) {
        const requirement = binding.valueType === "entity"
          ? "an entity from the named snapshot"
          : `a ${binding.valueType} value`;
        throw new Error(`Expression binding '${name}' requires ${requirement}`);
      }
    }
    const previousEvidence = this.definitionEvidence;
    const evidence: ProcessDefinitionEvidence[] = [];
    this.definitionEvidence = collectEvidence ? evidence : undefined;
    try {
      const result = this.value(expression, {
        ...this.baseContext,
        ...resolvedBindings,
      });
      return {
        target: {
          definition: `${definition.id}@${definition.version}`,
          kind: definition.kind,
          field,
        },
        contract: {
          expectedType: expression.contract.expectedType,
          bindings: Object.entries(expression.contract.bindings)
            .map(([name, binding]) => ({
              name,
              valueType: binding.valueType,
              ...(binding.domainKind === undefined
                ? {}
                : { domainKind: binding.domainKind }),
              ...(binding.lifecycleTypes === undefined
                ? {}
                : { lifecycleTypes: [...binding.lifecycleTypes] }),
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        },
        suppliedBindings: this.evidenceValue(resolvedBindings) as Record<string, unknown>,
        result: this.evidenceValue(result),
        traversedDefinitions: [...new Set(
          evidence.map((item) => item.definition),
        )],
        evidence,
      };
    } finally {
      this.definitionEvidence = previousEvidence;
    }
  }

  evaluateDirectDefinition(
    kind: ProcessDirectEvaluation["target"]["kind"],
    reference: string,
    suppliedArguments: Record<string, unknown>,
  ): ProcessDirectEvaluation {
    const resolvedArguments = Object.fromEntries(
      Object.entries(suppliedArguments).map(([name, value]) => [
        name,
        this.resolveSuppliedValue(value),
      ]),
    );
    const evidence: ProcessDefinitionEvidence[] = [];
    const previousEvidence = this.definitionEvidence;
    this.definitionEvidence = evidence;
    let definitionReference = reference;
    let result: unknown;
    try {
      if (kind === "relation") {
        const source = resolvedArguments.from;
        if (!this.isEntity(source)) {
          throw new Error(`Relation evaluation requires an exact '--from' Revision`);
        }
        definitionReference = this.relationDefinition(reference);
        result = this.relation(reference, source, resolvedArguments);
      } else if (kind === "selector") {
        this.requireDefinitionReference(
          this.processPackage.selectors,
          reference,
          "Selector",
        );
        result = this.select(reference, resolvedArguments);
      } else if (kind === "policy") {
        this.requireDefinitionReference(
          this.processPackage.policies,
          reference,
          "Policy",
        );
        result = this.policyResult(reference, resolvedArguments);
      } else if (kind === "state") {
        const definition = this.requireDefinitionReference(
          this.processPackage.states,
          reference,
          "Computed State",
        );
        const subject = resolvedArguments.subject;
        if (!this.isEntity(subject)) {
          throw new Error(`Computed State evaluation requires an exact '--subject' Revision`);
        }
        result = this.state(definition.id, subject);
      }
      const projectedResult = this.evidenceValue(result);
      return {
        target: { definition: definitionReference, kind },
        arguments: this.evidenceValue(resolvedArguments) as Record<string, unknown>,
        result: projectedResult,
        traversedDefinitions: [...new Set(
          evidence.map((item) => item.definition),
        )],
        evidence,
      };
    } finally {
      this.definitionEvidence = previousEvidence;
    }
  }

  private requireDefinitionReference(
    catalog: Record<string, VersionedDefinition>,
    reference: string,
    label: string,
  ): VersionedDefinition {
    const id = referenceId(reference);
    const definition = catalog[id];
    if (!definition || `${definition.id}@${definition.version}` !== reference) {
      throw new Error(`Unknown ${label} '${reference}'`);
    }
    return definition;
  }

  evaluate(): LifecycleEvaluation {
    if (this.comparisonDiagnostics.length > 0) return { artifacts: {}, dependencyChanges: [], diagnostics: this.comparisonDiagnostics };
    const artifacts: Record<string, ArtifactEvaluation> = {};
    for (const entity of this.entities) {
      const revisionId = entity.identity?.revision_id;
      if (!revisionId) continue;
      const states: Record<string, string | string[]> = {};
      const stateExplanations: Record<string, string | string[]> = {};
      for (const state of Object.values(this.processPackage.states)) {
        states[state.id] = this.state(state.id, entity);
        stateExplanations[state.id] =
          this.stateExplanation(state.id, entity);
      }
      artifacts[revisionId] = { states, stateExplanations };
    }

    return { artifacts, dependencyChanges: this.dependencyChanges, diagnostics: [] };
  }

  evaluateValue(expression: unknown, bindings: Record<string, unknown>): unknown {
    return this.evidenceValue(this.value(expression, {
      ...this.baseContext,
      ...Object.fromEntries(Object.entries(bindings).map(([name, value]) => [name, this.resolveSuppliedValue(value)])),
    }));
  }

  private exactTypedEntity(entity: Entity): ExactTypedEntity | undefined {
    const { id, revision_id: revisionId, type, revision } = entity.identity ?? {};
    return id && revisionId && type && revision !== undefined
      ? { identity: { id, revision_id: revisionId, type, revision } }
      : undefined;
  }

  private indexDefinitionExpressions(value: unknown, reference: string): void {
    if (isCompiledTextExpression(value)) {
      const pathValue = value.contract?.definitionPath ?? "";
      const fragment = pathValue.includes("#")
        ? pathValue.slice(pathValue.indexOf("#"))
        : "";
      this.expressionDefinitions.set(value, `${reference}${fragment}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.indexDefinitionExpressions(item, reference));
      return;
    }
    const asObject = object(value);
    if (asObject) {
      Object.values(asObject).forEach((item) =>
        this.indexDefinitionExpressions(item, reference)
      );
    }
  }

  private resolveSuppliedValue(
    value: unknown,
    permitStableIdentity = false,
    domainKind?: string,
  ): unknown {
    if (typeof value === "string") {
      if (this.byRevision.has(value)) return this.byRevision.get(value);
      if (domainKind === "process") {
        const binding = this.baseContext[domainKind];
        if (this.isEntity(binding) && binding.key === value) return binding;
      }
      return permitStableIdentity ? this.entityForReference(value) ?? value : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) =>
        this.resolveSuppliedValue(item, permitStableIdentity, domainKind)
      );
    }
    const asObject = object(value);
    return asObject
      ? Object.fromEntries(
          Object.entries(asObject).map(([key, item]) => [
            key,
            this.resolveSuppliedValue(item, permitStableIdentity, domainKind),
          ]),
        )
      : value;
  }

  private evidenceValue(value: unknown): unknown {
    if (this.isEntity(value)) return this.exactTypedEntity(value) ?? { key: value.key };
    if (Array.isArray(value)) return value.map((item) => this.evidenceValue(item));
    const asObject = object(value);
    return asObject
      ? Object.fromEntries(
          Object.entries(asObject).map(([key, item]) => [
            key,
            this.evidenceValue(item),
          ]),
        )
      : value;
  }

  private state(dimension: string, subject: Entity): string | string[] {
    const memoKey = `${dimension}:${subject.key}`;
    const memoized = this.stateMemo.get(memoKey);
    if (memoized !== undefined) return memoized;
    if (this.stateStack.has(memoKey)) {
      throw new Error(`Computed-state cycle at ${memoKey}`);
    }
    const definition = this.processPackage.states[dimension];
    if (!definition) throw new Error(`Unknown state dimension '${dimension}'`);
    this.stateStack.add(memoKey);
    try {
      const subjectAs = string(definition.subject_as) ?? "subject";
      const context = { ...this.baseContext, [subjectAs]: subject };
      const rules = array(definition.rules)
        .map(object)
        .filter((rule): rule is Record<string, unknown> => rule !== undefined)
        .sort((left, right) => number(right.priority) - number(left.priority));
      let result: string | string[];
      let explanation: string | string[];
      if (definition.cardinality === "zero-or-more") {
        const matchedRules = rules.filter((rule) =>
          this.expression(rule.when, context)
        );
        result = matchedRules
          .map((rule) => string(rule.value))
          .filter((value): value is string => value !== undefined);
        explanation = matchedRules
          .map((rule) => this.ruleExplanation(rule, context))
          .filter((value): value is string => value !== undefined);
      } else {
        const rule = rules.find((candidate) =>
          this.expression(candidate.when, context),
        );
        result = string(rule?.value) ?? string(definition.default) ?? "";
        explanation = rule
          ? this.ruleExplanation(rule, context) ?? ""
          : `No rule matched; using the default value for ${definition.id}.`;
      }
      this.stateMemo.set(memoKey, result);
      this.stateExplanationMemo.set(memoKey, explanation);
      if (this.definitionEvidence) {
        this.definitionEvidence.push({
          kind: "state",
          definition: `${definition.id}@${definition.version}`,
          arguments: {
            subject: this.evidenceValue(subject),
          },
          result: this.evidenceValue(result),
        });
      }
      return result;
    } finally {
      this.stateStack.delete(memoKey);
    }
  }

  private ruleExplanation(
    rule: Record<string, unknown>,
    context: EvaluationContext,
  ): string | undefined {
    const explanation = string(rule.explanation);
    if (!explanation || rule.explanation_evidence === undefined) {
      return explanation;
    }
    const evidence = array(this.value(rule.explanation_evidence, context))
      .map((value) => object(value))
      .filter(
        (value): value is Record<string, unknown> => value !== undefined,
      )
      .map((value) => {
        const kind = string(value.kind) ?? string(value.entityKind) ?? "record";
        const before = string(value.before_revision);
        const after = string(value.after_revision);
        const qualifier = [
          string(value.path),
          string(value.link_type),
          string(value.stable_target),
        ].filter((item): item is string => item !== undefined).join(" / ");
        const comparison = before && after ? ` (${before} → ${after})` : "";
        return `${kind}${comparison}${qualifier ? ` [${qualifier}]` : ""}`;
      });
    return evidence.length === 0
      ? explanation
      : `${explanation} Structural evidence: ${evidence.join("; ")}.`;
  }

  private stateExplanation(
    dimension: string,
    subject: Entity,
  ): string | string[] {
    const memoKey = `${dimension}:${subject.key}`;
    if (!this.stateExplanationMemo.has(memoKey)) {
      this.state(dimension, subject);
    }
    return this.stateExplanationMemo.get(memoKey) ?? "";
  }

  private requirePolicyArguments(
    reference: string,
    argumentsContext: EvaluationContext,
  ): void {
    const definition = this.requireDefinitionReference(
      this.processPackage.policies,
      reference,
      "Policy",
    );
    for (const parameterValue of array(definition.parameters)) {
      const parameter = object(parameterValue);
      const name = string(parameter?.name);
      const kind = string(parameter?.kind);
      if (!name || !kind) continue;
      const value = argumentsContext[name];
      const entity = this.isEntity(value) ? value : undefined;
      const scalarType = string(parameter?.scalar_type);
      const scalarValid = kind !== "scalar" ||
        (scalarType === "string" && typeof value === "string") ||
        (scalarType === "boolean" && typeof value === "boolean") ||
        (scalarType === "number" && typeof value === "number") ||
        (scalarType === "integer" && Number.isInteger(value));
      const kindValid = kind === "scalar"
        ? scalarValid
        : kind === "revision"
        ? entity?.entityKind === "revision"
        : kind === "baseline"
        ? entity?.entityKind === "revision" &&
          entity.identity?.type === this.exactBaselineType
        : kind === "stable-datum"
        ? entity?.entityKind === "stable-datum"
        : kind === "process"
        ? entity?.entityKind === kind
        : false;
      const allowedTypes = array(parameter?.types).filter(
        (type): type is string => typeof type === "string",
      );
      const typeValid = allowedTypes.length === 0 ||
        (entity?.identity?.type !== undefined &&
          allowedTypes.includes(entity.identity.type));
      if (!kindValid || !typeValid) {
        throw new Error(
          `Policy '${reference}' argument '${name}' does not satisfy parameter kind '${kind}'`,
        );
      }
    }
  }

  private policyResult(
    reference: string,
    argumentsContext: EvaluationContext,
  ): Record<string, unknown> {
    this.requirePolicyArguments(reference, argumentsContext);
    const id = referenceId(reference);
    const definition = this.processPackage.policies[id];
    if (!definition) throw new Error(`Unknown policy '${reference}'`);
    const policyContext = { ...this.baseContext, ...argumentsContext };
    const rules = array(definition.rules)
      .map(object)
      .filter((rule): rule is Record<string, unknown> => rule !== undefined)
      .sort((left, right) => number(right.priority) - number(left.priority));
    const match = rules.find((rule) => this.expression(rule.when, policyContext));
    const result = object(match?.result) ?? object(definition.default) ?? {};
    const evidenceArguments = this.evidenceValue(argumentsContext) as Record<string, unknown>;
    const evidenceResult = this.evidenceValue(result) as Record<string, unknown>;
    if (this.definitionEvidence) {
      this.definitionEvidence.push({
        kind: "policy",
        definition: reference,
        arguments: evidenceArguments,
        result: evidenceResult,
      });
    }
    return result;
  }

  private expressionHost() {
    return {
      policy: (reference: string, argumentsValue: Record<string, unknown>) =>
        this.policyResult(reference, argumentsValue),
      select: (reference: string, argumentsValue: Record<string, unknown>) =>
        this.select(reference, argumentsValue),
      state: (subject: unknown, dimension: string) => {
        if (!this.isEntity(subject)) {
          throw new Error(`Computed State subject is not an entity`);
        }
        return this.state(dimension, subject);
      },
    };
  }

  private recordExpressionEvidence(
    expression: CompiledTextExpression,
    result: unknown,
  ): void {
    if (!this.definitionEvidence) return;
    this.definitionEvidence.push({
      kind: "expression",
      definition: this.expressionDefinitions.get(expression) ??
        expression.contract?.definitionPath ?? "expression",
      source: expression.source,
      span: expression.span,
      result: this.evidenceValue(result),
    });
  }

  private expression(value: unknown, context: EvaluationContext): boolean {
    if (!isCompiledTextExpression(value)) {
      throw new Error(`Expected a compiled mdlm-expression@1 condition`);
    }
    const result = evaluateCompiledTextExpression(
      value,
      context,
      this.expressionHost(),
    );
    this.recordExpressionEvidence(value, result);
    return result;
  }

  private value(value: unknown, context: EvaluationContext): unknown {
    if (!isCompiledTextExpression(value)) {
      throw new Error(`Expected a compiled mdlm-expression@1 value`);
    }
    const result = evaluateCompiledTextValue(value, context, this.expressionHost());
    this.recordExpressionEvidence(value, result);
    return result;
  }

  private evaluateArguments(value: unknown, context: EvaluationContext): EvaluationContext {
    const result: EvaluationContext = {};
    for (const [name, operand] of Object.entries(object(value) ?? {})) {
      result[name] = this.value(operand, context);
    }
    return result;
  }

  private invokeSelector(value: unknown, context: EvaluationContext): Entity[] {
    const invocation = object(value);
    if (!invocation) throw new Error(`Expected selector invocation`);
    const reference = string(invocation.selector);
    if (!reference) throw new Error(`Selector invocation has no selector`);
    return this.select(
      reference,
      this.evaluateArguments(invocation.arguments, context),
    );
  }

  private select(
    reference: string,
    argumentsContext: EvaluationContext,
  ): Entity[] {
    const id = referenceId(reference);
    const definition = this.processPackage.selectors[id];
    if (!definition) throw new Error(`Unknown selector '${reference}'`);
    const recursionKey = `${reference}:${Object.entries(argumentsContext)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, item]) => `${name}=${this.valueKey(item)}`)
      .join(",")}`;
    if (this.selectorStack.has(recursionKey)) throw new Error(`Selector recursion at ${recursionKey}`);
    const collectingDefinitionEvidence = this.definitionEvidence !== undefined;
    const memoized = collectingDefinitionEvidence ? undefined : this.selectorMemo.get(recursionKey);
    if (memoized) return [...memoized];
    this.selectorStack.add(recursionKey);
    try {
      const result = this.query(definition.query, {
        ...this.baseContext,
        ...argumentsContext,
      });
      const exactResult = result
        .map((entity) => this.exactTypedEntity(entity))
        .filter((entity): entity is ExactTypedEntity => entity !== undefined);
      if (this.definitionEvidence) {
        this.definitionEvidence.push({
          kind: "selector",
          definition: reference,
          arguments: this.evidenceValue(argumentsContext) as Record<string, unknown>,
          result: exactResult,
        });
      }
      if (!collectingDefinitionEvidence) {
        this.selectorMemo.set(recursionKey, [...result]);
      }
      return result;
    } finally {
      this.selectorStack.delete(recursionKey);
    }
  }

  private query(value: unknown, context: EvaluationContext): Entity[] {
    const query = object(value);
    const from = object(query?.from);
    if (!query || !from) throw new Error(`Invalid query`);
    let results: Entity[];
    if (from.collection !== undefined) {
      const collection = String(from.collection);
      results = collection === "baselines"
        ? this.entities.filter(
            (entity) =>
              entity.identity?.type === this.requireExactBaselineType(
                "Collection 'baselines'",
              ),
          )
        : collection === "stable-data"
        ? [...new Set(this.entities.map((entity) => entity.identity?.id))]
          .filter((id): id is string => id !== undefined)
          .map((id) => this.entityForReference(id))
          .filter((entity): entity is Entity => entity !== undefined)
        : this.entities;
    } else if (from.selector !== undefined) {
      results = this.invokeSelector(from, context);
    } else if (from.relation !== undefined) {
      const source = this.value(from.of, context);
      if (!this.isEntity(source)) return [];
      results = this.relation(String(from.relation), source, from);
    } else {
      throw new Error(`Unknown query source`);
    }

    const types = array(from.types).filter((item): item is string => typeof item === "string");
    if (types.length > 0) results = results.filter((result) => result.identity?.type && types.includes(result.identity.type));
    const alias = string(query.as) ?? "item";
    if (query.where !== undefined) {
      results = results.filter((result) => this.expression(query.where, { ...context, [alias]: result }));
    }
    if (query.distinct === true) {
      results = [...new Map(results.map((result) => [result.key, result])).values()];
    }
    const orderBy = array(query.order_by).filter(
      (item): item is string => typeof item === "string",
    );
    if (orderBy.length > 0) {
      results = [...results].sort((left, right) => {
        for (const path of orderBy) {
          const comparison = this.compareOrderedValues(
            this.entityPath(left, path),
            this.entityPath(right, path),
          );
          if (comparison !== 0) return comparison;
        }
        return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
      });
    }
    return results;
  }

  private entityPath(entity: Entity, path: string): unknown {
    return path.split(".").reduce<unknown>((value, segment) => {
      return object(value)?.[segment];
    }, entity);
  }

  private compareOrderedValues(left: unknown, right: unknown): number {
    if (left === right) return 0;
    if (left === undefined || left === null) return 1;
    if (right === undefined || right === null) return -1;
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    const leftText = String(left);
    const rightText = String(right);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  }

  private relation(
    name: string,
    source: Entity,
    options: Record<string, unknown>,
  ): Entity[] {
    const result = this.evaluateRelation(name, source, options);
    if (this.definitionEvidence) {
      this.definitionEvidence.push({
        kind: "relation",
        definition: this.relationDefinition(name),
        arguments: {
          from: this.evidenceValue(source),
          ...(options.link === undefined ? {} : { link: options.link }),
        },
        result: this.evidenceValue(result),
      });
    }
    return result;
  }

  private relationDefinition(name: string): string {
    for (const catalog of Object.values(this.processPackage.primitives)) {
      const directRelations = array(catalog.relations).map(object);
      const surfaces = object(catalog.capability_surfaces) ?? {};
      const capabilityRelations = Object.values(surfaces).flatMap((surface) =>
        array(object(surface)?.relations).map(object)
      );
      if ([...directRelations, ...capabilityRelations].some(
        (relation) => string(relation?.id) === name,
      )) {
        return `${catalog.id}@${catalog.version}#relation.${name}`;
      }
    }
    return `primitive#relation.${name}`;
  }

  private evaluateRelation(name: string, source: Entity, options: Record<string, unknown>): Entity[] {
    const linkFilter = string(options.link);
    switch (name) {
      case "revisions":
        return this.entities.filter((entity) => entity.identity?.id === source.identity?.id);
      case "incoming-links":
        return this.entities.filter((entity) => entity.datum?.links.some((link) => (!linkFilter || link.type === linkFilter) && this.linkTargets(link.target, source)));
      case "outgoing-links": {
        const links = source.datum?.links.filter((link) => !linkFilter || link.type === linkFilter) ?? [];
        return links.map((link) => this.entityForReference(link.target)).filter((entity): entity is Entity => entity !== undefined);
      }
      case "baseline-members":
        return this.isExactBaseline(source)
          ? this.payloadReferences(source, "definition_members")
          : [];
      case "baseline-evidence":
        return this.isExactBaseline(source)
          ? this.payloadReferences(source, "evidence")
          : [];
      case "baseline-memberships": {
        const baselineType = this.requireExactBaselineType(
          "Relation 'baseline-memberships'",
        );
        return this.entities.filter(
          (entity) =>
            entity.identity?.type === baselineType &&
            array(entity.payload?.definition_members).includes(
              source.identity?.revision_id,
            ),
        );
      }
      case "baseline-composed":
        if (!this.isExactBaseline(source)) return [];
        return (source.datum?.links ?? [])
          .filter((link) => link.type === "composes")
          .map((link) => this.entityForReference(link.target))
          .filter(
            (entity): entity is Entity =>
              entity !== undefined && this.isExactBaseline(entity),
          );
      case "dependency-changes":
        return this.dependencyChanges
          .filter(
            (change) =>
              change.subject_revision === source.identity?.revision_id,
          )
          .map((change, index) => ({
            entityKind: "record" as const,
            key: `${source.key}:change:${index}`,
            record: change,
            ...change,
          }));
      default:
        throw new Error(`Unknown primitive relation '${name}'`);
    }
  }

  private requireExactBaselineType(operation: string): string {
    if (!this.exactBaselineType) {
      throw new Error(
        `${operation} requires Kernel Capability exact-baseline@1`,
      );
    }
    return this.exactBaselineType;
  }

  private isExactBaseline(entity: Entity): boolean {
    return entity.identity?.type === this.requireExactBaselineType(
      "Baseline relation",
    );
  }

  private payloadReferences(source: Entity, field: string): Entity[] {
    return array(source.payload?.[field])
      .map((reference) => typeof reference === "string" ? this.entityForReference(reference) : undefined)
      .filter((entity): entity is Entity => entity !== undefined);
  }

  private linkTargets(target: string, source: Entity): boolean {
    return target === source.identity?.revision_id || target === source.identity?.id;
  }

  private entityForReference(reference: string): Entity | undefined {
    const exact = this.byRevision.get(reference);
    if (exact) return exact;
    const revisions = this.entities.filter((entity) => entity.identity?.id === reference);
    if (revisions.length === 0) return undefined;
    const latest = revisions.sort((left, right) => number(right.identity?.revision) - number(left.identity?.revision))[0];
    if (!latest) return undefined;
    const type = latest.identity?.type;
    return {
      entityKind: "stable-datum",
      key: reference,
      identity: type === undefined ? { id: reference } : { id: reference, type },
    };
  }

  private valueKey(value: unknown): string {
    if (this.isEntity(value)) return `entity:${value.key}`;
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.valueKey(item)).join(",")}]`;
    }
    const record = object(value);
    if (record) {
      return `{${Object.entries(record)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, item]) => `${JSON.stringify(name)}:${this.valueKey(item)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private isEntity(value: unknown): value is Entity {
    return object(value)?.entityKind !== undefined && typeof object(value)?.key === "string";
  }
}

export function evaluateProcessDefinition(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  kind: ProcessDirectEvaluation["target"]["kind"],
  reference: string,
  argumentsValue: Record<string, unknown>,
): ProcessDirectEvaluation {
  return new LifecycleEvaluator(processPackage, snapshot)
    .evaluateDirectDefinition(kind, reference, argumentsValue);
}

export function evaluateProcessExpression(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  target: string,
  bindings: Record<string, unknown>,
): ProcessExpressionEvaluation {
  return new LifecycleEvaluator(processPackage, snapshot)
    .evaluateExpressionTarget(target, bindings);
}

export function evaluateProcessExpressionResult(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
  target: string,
  bindings: Record<string, unknown>,
): unknown {
  return new LifecycleEvaluator(processPackage, snapshot)
    .evaluateExpressionTarget(target, bindings, false).result;
}

export function evaluateLifecycle(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
): LifecycleEvaluation {
  try {
    return new LifecycleEvaluator(processPackage, snapshot).evaluate();
  } catch (error) {
    return {
      artifacts: {},
      dependencyChanges: [],
      diagnostics: [
        {
          code: "evaluation-error",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

export function evaluateExpressionValue(processPackage: ProcessPackage, snapshot: LifecycleSnapshot, expression: unknown, bindings: Record<string, unknown> = {}): unknown {
  return new LifecycleEvaluator(processPackage, snapshot).evaluateValue(expression, bindings);
}
