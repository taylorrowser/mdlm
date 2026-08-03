import {
  evaluateCompiledTextExpression,
  evaluateCompiledTextValue,
  expressionValuesEqual,
  isCompiledTextExpression,
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
  };
}

export interface DependencyChange {
  subject: string;
  kind: string;
  [key: string]: unknown;
}

export interface LifecycleSnapshot {
  processRef: string;
  phaseId: string;
  records: LifecycleRecord[];
  dependencyChanges: DependencyChange[];
}

export interface ArtifactEvaluation {
  states: Record<string, string | string[]>;
}

export interface ObligationEvaluation {
  id: string;
  obligation: string;
  subject: string;
  satisfied: boolean;
  status: string;
  resolver: string;
  explanation: string;
}

export interface LifecycleEvaluation {
  artifacts: Record<string, ArtifactEvaluation>;
  obligations: ObligationEvaluation[];
  looseEnds: ObligationEvaluation[];
  diagnostics: ProcessDiagnostic[];
}

type EntityKind = "revision" | "stable-datum" | "record";

interface Entity {
  entityKind: EntityKind;
  key: string;
  identity?: {
    id?: string;
    revision_id?: string;
    type?: string;
    revision?: number;
  };
  payload?: Record<string, unknown>;
  storage?: LifecycleRecord["storage"];
  integrity?: LifecycleRecord["integrity"];
  provenance?: { process_ref: string };
  datum?: DatumEnvelope;
  record?: Record<string, unknown>;
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

function getPath(root: unknown, field: string): unknown {
  let value = root;
  for (const segment of field.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

class LifecycleEvaluator {
  private readonly entities: Entity[];
  private readonly byRevision = new Map<string, Entity>();
  private readonly stateMemo = new Map<string, string | string[]>();
  private readonly stateStack = new Set<string>();
  private readonly selectorStack = new Set<string>();
  private readonly baseContext: EvaluationContext;

  constructor(
    private readonly processPackage: ProcessPackage,
    private readonly snapshot: LifecycleSnapshot,
  ) {
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
        provenance: { process_ref: record.datum.created_by.process_ref },
        datum: record.datum,
      };
      this.byRevision.set(record.datum.revision_id, entity);
      return entity;
    });
    this.baseContext = {
      process: {
        current_ref: snapshot.processRef,
        integrity: { package_valid: true },
      },
      phase: { id: snapshot.phaseId },
    };
  }

  evaluate(): LifecycleEvaluation {
    const artifacts: Record<string, ArtifactEvaluation> = {};
    for (const entity of this.entities) {
      const revisionId = entity.identity?.revision_id;
      if (!revisionId) continue;
      const states: Record<string, string | string[]> = {};
      for (const state of Object.values(this.processPackage.states)) {
        states[state.id] = this.state(state.id, entity);
      }
      artifacts[revisionId] = { states };
    }

    const obligations: ObligationEvaluation[] = [];
    for (const definition of Object.values(this.processPackage.obligations)) {
      if (!array(definition.phases).includes(this.snapshot.phaseId)) continue;
      const forEach = definition.for_each;
      const subjects = isCompiledTextExpression(forEach)
        ? array(
            evaluateCompiledTextValue(
              forEach,
              this.baseContext,
              this.expressionHost(),
            ),
          ).filter((value): value is Entity => this.isEntity(value))
        : this.invokeSelector(forEach, this.baseContext);
      const subjectAs = string(definition.subject_as) ?? "subject";
      for (const subject of subjects) {
        const context = { ...this.baseContext, [subjectAs]: subject };
        const satisfied = this.expression(definition.satisfied_when, context);
        const statusResult = satisfied
          ? { status: "satisfied", reason: "The obligation's satisfaction expression is true." }
          : this.obligationStatus(definition, context);
        const resolverObject = object(definition.resolve_with);
        const resolver = string(resolverObject?.scenario) ?? "";
        const subjectId = subject.identity?.revision_id ?? subject.key;
        obligations.push({
          id: `${definition.id}@${definition.version}:${subjectId}:${this.snapshot.processRef}`,
          obligation: definition.id,
          subject: subjectId,
          satisfied,
          status: statusResult.status,
          resolver,
          explanation: statusResult.reason,
        });
      }
    }

    const statusOrder: Record<string, number> = {
      ready: 0,
      "awaiting-review": 1,
      failed: 2,
      stale: 3,
      blocked: 4,
    };
    const looseEnds = obligations
      .filter((obligation) => !obligation.satisfied)
      .sort(
        (left, right) =>
          (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99) ||
          left.subject.localeCompare(right.subject) ||
          left.obligation.localeCompare(right.obligation),
      );

    return {
      artifacts,
      obligations,
      looseEnds,
      diagnostics: [],
    };
  }

  private obligationStatus(
    definition: VersionedDefinition,
    context: EvaluationContext,
  ): { status: string; reason: string } {
    const rules = array(definition.status_rules)
      .map(object)
      .filter((rule): rule is Record<string, unknown> => rule !== undefined)
      .sort((left, right) => number(right.priority) - number(left.priority));
    for (const rule of rules) {
      if (this.expression(rule.when, context)) {
        return {
          status: string(rule.status) ?? string(definition.default_status) ?? "blocked",
          reason: string(rule.reason) ?? "The obligation is not satisfied.",
        };
      }
    }
    return {
      status: string(definition.default_status) ?? "blocked",
      reason: `No status rule matched; using the default status for ${definition.id}.`,
    };
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
      if (definition.cardinality === "zero-or-more") {
        result = rules
          .filter((rule) => this.expression(rule.when, context))
          .map((rule) => string(rule.value))
          .filter((value): value is string => value !== undefined);
      } else {
        const rule = rules.find((candidate) =>
          this.expression(candidate.when, context),
        );
        result = string(rule?.value) ?? string(definition.default) ?? "";
      }
      this.stateMemo.set(memoKey, result);
      return result;
    } finally {
      this.stateStack.delete(memoKey);
    }
  }

  private policy(
    reference: string,
    argumentsValue: unknown,
    context: EvaluationContext,
  ): Record<string, unknown> {
    return this.policyResult(
      reference,
      this.evaluateArguments(argumentsValue, context),
    );
  }

  private policyResult(
    reference: string,
    argumentsContext: EvaluationContext,
  ): Record<string, unknown> {
    const id = referenceId(reference);
    const definition = this.processPackage.policies[id];
    if (!definition) throw new Error(`Unknown policy '${reference}'`);
    const policyContext = { ...this.baseContext, ...argumentsContext };
    const rules = array(definition.rules)
      .map(object)
      .filter((rule): rule is Record<string, unknown> => rule !== undefined)
      .sort((left, right) => number(right.priority) - number(left.priority));
    const match = rules.find((rule) => this.expression(rule.when, policyContext));
    return object(match?.result) ?? object(definition.default) ?? {};
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

  private expression(value: unknown, context: EvaluationContext): boolean {
    if (isCompiledTextExpression(value)) {
      return evaluateCompiledTextExpression(
        value,
        context,
        this.expressionHost(),
      );
    }
    const expression = object(value);
    if (!expression) throw new Error(`Expected an expression object`);
    if (expression.compare !== undefined) {
      const comparison = object(expression.compare);
      if (!comparison) return false;
      const left = this.value(comparison.left, context);
      const right = this.value(comparison.right, context);
      switch (comparison.operator) {
        case "eq": return expressionValuesEqual(left, right);
        case "ne": return !expressionValuesEqual(left, right);
        case "in": return Array.isArray(right) && right.some((item) => expressionValuesEqual(left, item));
        case "not-in": return Array.isArray(right) && !right.some((item) => expressionValuesEqual(left, item));
        case "gt": return typeof left === "number" && typeof right === "number" && left > right;
        case "gte": return typeof left === "number" && typeof right === "number" && left >= right;
        case "lt": return typeof left === "number" && typeof right === "number" && left < right;
        case "lte": return typeof left === "number" && typeof right === "number" && left <= right;
        case "contains": return (Array.isArray(left) && left.some((item) => expressionValuesEqual(item, right))) || (typeof left === "string" && typeof right === "string" && left.includes(right));
        case "matches": return typeof left === "string" && typeof right === "string" && new RegExp(right).test(left);
        default: throw new Error(`Unknown comparison operator '${String(comparison.operator)}'`);
      }
    }
    if (expression.all !== undefined) return array(expression.all).every((item) => this.expression(item, context));
    if (expression.any !== undefined) return array(expression.any).some((item) => this.expression(item, context));
    if (expression.not !== undefined) return !this.expression(expression.not, context);
    if (expression.exists !== undefined) return this.invokeSelector(expression.exists, context).length > 0;
    if (expression.none !== undefined) return this.invokeSelector(expression.none, context).length === 0;
    if (expression.every !== undefined) {
      const every = object(expression.every);
      if (!every) return false;
      const results = this.invokeSelector(every, context);
      const alias = string(every.as) ?? "item";
      return results.every((result) => this.expression(every.satisfies, { ...context, [alias]: result }));
    }
    if (expression.present !== undefined) return this.value(expression.present, context) !== undefined;
    throw new Error(`Unknown expression form: ${JSON.stringify(expression)}`);
  }

  private value(value: unknown, context: EvaluationContext): unknown {
    if (isCompiledTextExpression(value)) {
      return evaluateCompiledTextValue(value, context, this.expressionHost());
    }
    const operand = object(value);
    if (!operand) throw new Error(`Expected an expression value`);
    if (Object.prototype.hasOwnProperty.call(operand, "literal")) return operand.literal;
    if (operand.var !== undefined) return context[String(operand.var)];
    if (operand.path !== undefined) {
      const pathValue = object(operand.path);
      if (!pathValue) return undefined;
      const root = context[String(pathValue.var)];
      return getPath(root, String(pathValue.field));
    }
    if (operand.state !== undefined) {
      const stateValue = object(operand.state);
      const subject = this.value(stateValue?.subject, context);
      if (!this.isEntity(subject)) throw new Error(`State subject is not an entity`);
      return this.state(String(stateValue?.dimension), subject);
    }
    if (operand.policy !== undefined) {
      const policyValue = object(operand.policy);
      if (!policyValue) return undefined;
      const result = this.policy(String(policyValue.ref), policyValue.arguments, context);
      return getPath(result, String(policyValue.field));
    }
    if (operand.count !== undefined) return this.invokeSelector(operand.count, context).length;
    throw new Error(`Unknown expression value: ${JSON.stringify(operand)}`);
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
    const recursionKey = `${id}:${Object.values(argumentsContext).map((item) => this.valueKey(item)).join(",")}`;
    if (this.selectorStack.has(recursionKey)) throw new Error(`Selector recursion at ${recursionKey}`);
    this.selectorStack.add(recursionKey);
    try {
      return this.query(definition.query, { ...this.baseContext, ...argumentsContext });
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
        ? this.entities.filter((entity) => entity.identity?.type === "BSL")
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
    return results;
  }

  private relation(name: string, source: Entity, options: Record<string, unknown>): Entity[] {
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
        return this.payloadReferences(source, "definition_members");
      case "baseline-evidence":
        return this.payloadReferences(source, "evidence");
      case "baseline-memberships":
        return this.entities.filter((entity) => entity.identity?.type === "BSL" && array(entity.payload?.definition_members).includes(source.identity?.revision_id));
      case "baseline-composed":
        return (source.datum?.links ?? []).filter((link) => link.type === "composes").map((link) => this.entityForReference(link.target)).filter((entity): entity is Entity => entity !== undefined);
      case "dependency-changes":
        return this.snapshot.dependencyChanges.filter((change) => change.subject === source.identity?.revision_id).map((change, index) => ({ entityKind: "record" as const, key: `${source.key}:change:${index}`, record: change, ...change }));
      case "scenario-inputs":
      case "scenario-outputs":
        return [];
      default:
        throw new Error(`Unknown primitive relation '${name}'`);
    }
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
    if (this.isEntity(value)) return value.key;
    return JSON.stringify(value);
  }

  private isEntity(value: unknown): value is Entity {
    return object(value)?.entityKind !== undefined && typeof object(value)?.key === "string";
  }
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
      obligations: [],
      looseEnds: [],
      diagnostics: [
        {
          code: "evaluation-error",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
