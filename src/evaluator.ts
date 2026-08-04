import {
  compareDependencyChanges,
  type DependencyChangeRecord,
  type DependencyComparison,
} from "./dependency-changes.js";
import {
  evaluateCompiledTextExpression,
  evaluateCompiledTextValue,
  isCompiledTextExpression,
} from "./expression.js";
import type {
  ProcessDiagnostic,
  ProcessPackage,
  VersionedDefinition,
} from "./index.js";
import { effectiveOutgoingLinks } from "./payload-inheritance.js";

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

export interface HistoricalLifecycleSnapshot {
  snapshotRef: string;
  processRef: string;
  phaseId: string;
  records: LifecycleRecord[];
  dependencyComparisons: DependencyComparison[];
}

export interface LifecycleSnapshot {
  processRef: string;
  phaseId: string;
  records: LifecycleRecord[];
  dependencyComparisons: DependencyComparison[];
  historicalSnapshots?: HistoricalLifecycleSnapshot[];
}

export interface ArtifactEvaluation {
  states: Record<string, string | string[]>;
  stateExplanations: Record<string, string | string[]>;
}

export interface ScenarioOutputExplanation {
  name: string;
  types: string[];
  cardinality: string;
  requiredLinks: {
    link: string;
    target: { input: string } | { output: string };
  }[];
}

export interface ResolverScenarioExplanation {
  scenario: string;
  promptRef: string;
  expectedOutputs: ScenarioOutputExplanation[];
}

export interface WaiverExplanation {
  policy: string;
  result: {
    permitted: boolean;
    approvalRequired: boolean;
    applicable: boolean;
    scope: string | null;
    evidence: ExactTypedEntity[];
  };
}

export interface ObligationEvaluation {
  id: string;
  obligation: string;
  subject: string;
  satisfied: boolean;
  status: string;
  eventualResolver: string;
  actionableResolver: string | null;
  dispatchable: boolean;
  blockedBy: string[];
  blockerChains: string[][];
  unresolvedBindings: string[];
  resolver: ResolverScenarioExplanation;
  waiver: WaiverExplanation;
  explanation: string;
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

export interface PhaseExpressionEvidence {
  source: string;
  result: boolean | ExactTypedEntity[];
  selectors: SelectorEvaluationEvidence[];
}

export interface PolicyEvaluationEvidence {
  policy: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface PhaseGateEvaluation {
  candidate: ExactTypedEntity;
  complete: boolean;
  explanation: string;
  obligationInstance: string;
  status: string;
  eventualResolver: string;
  actionableResolver: string | null;
  dispatchable: boolean;
  blockedBy: string[];
  blockerChains: string[][];
  unresolvedBindings: string[];
  evidence: PhaseExpressionEvidence & {
    result: boolean;
    policies: PolicyEvaluationEvidence[];
  };
}

export interface PhaseEvaluation {
  id: string;
  version: number;
  entry: {
    satisfied: boolean;
    explanation: string;
    evidence: PhaseExpressionEvidence;
  };
  candidateSelection: {
    entities: ExactTypedEntity[];
    explanation: string;
    evidence: PhaseExpressionEvidence;
  };
  gate: {
    required: boolean;
    evaluations: PhaseGateEvaluation[];
  };
}

export interface ObligationHistoryEvaluation {
  snapshotRef: string;
  processRef: string;
  phaseId: string;
  instances: ObligationEvaluation[];
  diagnostics: ProcessDiagnostic[];
}

export interface LifecycleEvaluation {
  phase: PhaseEvaluation | null;
  artifacts: Record<string, ArtifactEvaluation>;
  dependencyChanges: DependencyChangeRecord[];
  obligations: ObligationEvaluation[];
  obligationHistory: ObligationHistoryEvaluation[];
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
  record?: object;
}

type EvaluationContext = Record<string, unknown>;

interface PendingObligation {
  evaluation: ObligationEvaluation;
  definition: VersionedDefinition;
  context: EvaluationContext;
  statusRule?: Record<string, unknown>;
}

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
  private readonly baseContext: EvaluationContext;
  private readonly exactBaselineType: string | undefined;
  private readonly dependencyChanges: DependencyChangeRecord[];
  private readonly comparisonDiagnostics: ProcessDiagnostic[];
  private selectorEvidence: SelectorEvaluationEvidence[] | undefined;
  private policyEvidence: PolicyEvaluationEvidence[] | undefined;

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
    if (this.comparisonDiagnostics.length > 0) {
      return {
        phase: null,
        artifacts: {},
        dependencyChanges: [],
        obligations: [],
        obligationHistory: [],
        looseEnds: [],
        diagnostics: this.comparisonDiagnostics,
      };
    }
    if (!this.processPackage.phases[this.snapshot.phaseId]) {
      return {
        phase: null,
        artifacts: {},
        dependencyChanges: this.dependencyChanges,
        obligations: [],
        obligationHistory: [],
        looseEnds: [],
        diagnostics: [{
          code: "unknown-phase",
          path: "phaseId",
          message: `Unknown Phase '${this.snapshot.phaseId}'`,
        }],
      };
    }

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

    const pendingObligations: PendingObligation[] = [];
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
        const resolverObject = object(definition.resolve_with);
        const eventualResolver = string(resolverObject?.scenario) ?? "";
        const subjectId = subject.identity?.revision_id ?? subject.key;
        const instanceId = this.obligationInstanceId(
          `${definition.id}@${definition.version}`,
          subjectId,
        );
        const waiver = this.waiverExplanation(
          definition,
          instanceId,
          subject,
        );
        const statusResult = satisfied
          ? {
              status: "satisfied",
              reason: "The obligation's satisfaction expression is true.",
            }
          : waiver.result.applicable
          ? {
              status: "waived",
              reason: "An exact structured waiver is currently applicable under the package-defined Waiver Policy.",
            }
          : this.obligationStatus(definition, context);
        pendingObligations.push({
          evaluation: {
            id: instanceId,
            obligation: definition.id,
            subject: subjectId,
            satisfied,
            status: statusResult.status,
            eventualResolver,
            actionableResolver: null,
            dispatchable: false,
            blockedBy: [],
            blockerChains: [],
            unresolvedBindings: [],
            resolver: this.resolverExplanation(definition),
            waiver,
            explanation: statusResult.reason,
          },
          definition,
          context,
          ...(statusResult.rule ? { statusRule: statusResult.rule } : {}),
        });
      }
    }

    const byInstanceId = new Map(
      pendingObligations.map((pending) => [pending.evaluation.id, pending]),
    );
    for (const pending of pendingObligations) {
      if (
        pending.evaluation.satisfied ||
        pending.evaluation.status === "waived"
      ) continue;
      pending.evaluation.blockedBy = this.blockingInstanceIds(
        pending.statusRule,
        pending.context,
        byInstanceId,
      );
      pending.evaluation.unresolvedBindings =
        this.unresolvedResolverBindings(pending.definition, pending.context);
      pending.evaluation.dispatchable =
        ["ready", "awaiting-review", "stale"].includes(
          pending.evaluation.status,
        ) &&
        pending.evaluation.blockedBy.length === 0 &&
        pending.evaluation.unresolvedBindings.length === 0;
    }
    for (const pending of pendingObligations) {
      if (
        pending.evaluation.satisfied ||
        pending.evaluation.status === "waived"
      ) continue;
      pending.evaluation.blockerChains = this.blockerChains(
        pending.evaluation,
        byInstanceId,
      );
      pending.evaluation.actionableResolver = this.actionableResolver(
        pending.evaluation,
        byInstanceId,
      );
    }
    const obligations = pendingObligations.map((pending) => pending.evaluation);
    const phase = this.evaluatePhase(obligations);

    const statusOrder: Record<string, number> = {
      ready: 0,
      "awaiting-review": 1,
      failed: 2,
      stale: 3,
      blocked: 4,
    };
    const looseEnds = obligations
      .filter(
        (obligation) =>
          !obligation.satisfied && obligation.status !== "waived",
      )
      .sort(
        (left, right) =>
          (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99) ||
          left.subject.localeCompare(right.subject) ||
          left.obligation.localeCompare(right.obligation),
      );

    return {
      phase,
      artifacts,
      dependencyChanges: this.dependencyChanges,
      obligations,
      obligationHistory: this.evaluateObligationHistory(),
      looseEnds,
      diagnostics: this.comparisonDiagnostics,
    };
  }

  private evaluateObligationHistory(): ObligationHistoryEvaluation[] {
    return (this.snapshot.historicalSnapshots ?? []).map((snapshot) => {
      const evaluation = evaluateLifecycle(this.processPackage, {
        processRef: snapshot.processRef,
        phaseId: snapshot.phaseId,
        records: snapshot.records,
        dependencyComparisons: snapshot.dependencyComparisons,
      });
      return {
        snapshotRef: snapshot.snapshotRef,
        processRef: snapshot.processRef,
        phaseId: snapshot.phaseId,
        instances: evaluation.obligations,
        diagnostics: evaluation.diagnostics,
      };
    });
  }

  private evaluatePhase(
    obligations: ObligationEvaluation[],
  ): PhaseEvaluation {
    const definition = this.processPackage.phases[this.snapshot.phaseId]!;
    const entry = this.evaluateWithSelectorEvidence(
      definition.entry,
      () => this.expression(definition.entry, this.baseContext),
    );
    const gate = object(definition.gate)!;
    const selection = this.evaluateWithSelectorEvidence(
      gate.candidate_selector,
      () => array(this.value(gate.candidate_selector, this.baseContext))
        .filter((value): value is Entity => this.isEntity(value)),
    );
    const candidates = selection.result
      .map((entity) => this.exactTypedEntity(entity))
      .filter((entity): entity is ExactTypedEntity => entity !== undefined);
    const candidateAs = string(gate.candidate_as) ?? "candidate";
    const gateObligation = string(gate.obligation) ?? "";
    const gateEvaluations = selection.result.flatMap((candidate) => {
      const exactCandidate = this.exactTypedEntity(candidate);
      const candidateRevision = candidate.identity?.revision_id;
      if (!exactCandidate || !candidateRevision) return [];
      const completion = this.evaluateWithGateEvidence(
        gate.completion,
        () => this.expression(gate.completion, {
          ...this.baseContext,
          [candidateAs]: candidate,
        }),
      );
      const obligationInstance = this.obligationInstanceId(
        gateObligation,
        candidateRevision,
      );
      const obligation = obligations.find(
        (item) => item.id === obligationInstance,
      );
      return [{
        candidate: exactCandidate,
        complete: completion.result,
        explanation: completion.result
          ? "The package-defined gate completion expression is satisfied for this exact candidate."
          : "The package-defined gate completion expression is not satisfied for this exact candidate.",
        obligationInstance,
        status: obligation?.status ?? "unresolved",
        eventualResolver: obligation?.eventualResolver ?? "",
        actionableResolver: obligation?.actionableResolver ?? null,
        dispatchable: obligation?.dispatchable ?? false,
        blockedBy: obligation?.blockedBy ?? [],
        blockerChains: obligation?.blockerChains ?? [],
        unresolvedBindings: obligation?.unresolvedBindings ?? [
          "obligation-instance",
        ],
        evidence: completion,
      }];
    });
    return {
      id: definition.id,
      version: number(definition.version),
      entry: {
        satisfied: entry.result,
        explanation: entry.result
          ? "The package-defined phase entry expression is satisfied."
          : "The package-defined phase entry expression is not satisfied.",
        evidence: {
          source: entry.source,
          result: entry.result,
          selectors: entry.selectors,
        },
      },
      candidateSelection: {
        entities: candidates,
        explanation: candidates.length > 0
          ? `The package-defined candidate selection expression returned ${candidates.length} exact ${candidates.length === 1 ? "entity" : "entities"}.`
          : "The package-defined candidate selection expression returned no exact entities.",
        evidence: {
          source: selection.source,
          result: candidates,
          selectors: selection.selectors,
        },
      },
      gate: {
        required: gate.required === true,
        evaluations: gateEvaluations,
      },
    };
  }

  private evaluateWithSelectorEvidence<T>(
    expression: unknown,
    evaluate: () => T,
  ): { source: string; result: T; selectors: SelectorEvaluationEvidence[] } {
    if (!isCompiledTextExpression(expression)) {
      throw new Error("Expected a compiled mdlm-expression@1 value");
    }
    const previousEvidence = this.selectorEvidence;
    const selectors: SelectorEvaluationEvidence[] = [];
    this.selectorEvidence = selectors;
    try {
      const result = evaluate();
      selectors.sort((left, right) => {
        const leftKey = JSON.stringify(left);
        const rightKey = JSON.stringify(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
      return { source: expression.source, result, selectors };
    } finally {
      this.selectorEvidence = previousEvidence;
    }
  }

  private evaluateWithGateEvidence(
    expression: unknown,
    evaluate: () => boolean,
  ): PhaseExpressionEvidence & {
    result: boolean;
    policies: PolicyEvaluationEvidence[];
  } {
    const previousPolicyEvidence = this.policyEvidence;
    const policies: PolicyEvaluationEvidence[] = [];
    this.policyEvidence = policies;
    try {
      const evidence = this.evaluateWithSelectorEvidence(expression, evaluate);
      policies.sort((left, right) => {
        const leftKey = JSON.stringify(left);
        const rightKey = JSON.stringify(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
      return { ...evidence, policies };
    } finally {
      this.policyEvidence = previousPolicyEvidence;
    }
  }

  private exactTypedEntity(entity: Entity): ExactTypedEntity | undefined {
    const { id, revision_id: revisionId, type, revision } = entity.identity ?? {};
    return id && revisionId && type && revision !== undefined
      ? { identity: { id, revision_id: revisionId, type, revision } }
      : undefined;
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

  private waiverExplanation(
    definition: VersionedDefinition,
    obligationInstance: string,
    subject: Entity,
  ): WaiverExplanation {
    const policyReference = string(definition.waiver_policy_ref) ?? "";
    const policy = this.processPackage.policies[
      policyReference ? referenceId(policyReference) : ""
    ];
    const waiverEvidence = this.waiverEvidence(obligationInstance);
    const evaluatedResults = waiverEvidence.map((waiver) =>
      this.policyResult(policyReference, {
        obligation: `${definition.id}@${definition.version}`,
        subject,
        waiver,
      })
    );
    const result = evaluatedResults.find(
      (candidate) => candidate.applicable === true,
    ) ?? object(policy?.default) ?? {};
    const evidence = waiverEvidence
      .map((entity) => this.exactTypedEntity(entity))
      .filter((entity): entity is ExactTypedEntity => entity !== undefined);
    return {
      policy: policyReference,
      result: {
        permitted: result.permitted === true,
        approvalRequired: result.approval_required === true,
        applicable: result.applicable === true,
        scope: string(result.scope) ?? null,
        evidence,
      },
    };
  }

  private waiverEvidence(obligationInstance: string): Entity[] {
    return this.entities.filter((entity) => {
      const type = entity.identity?.type;
      const definition = type ? this.processPackage.types[type] : undefined;
      if (!definition || !entity.datum) return false;
      const waiverLinks = new Set(
        effectiveOutgoingLinks(definition, this.processPackage.templates)
          .filter((contract) =>
            array(contract.targets).some((targetValue) => {
              const target = object(targetValue);
              return target?.kind === "obligation-instance" &&
                target.identity === "exact-obligation-instance";
            })
          )
          .map((contract) => string(contract.id))
          .filter((id): id is string => id !== undefined),
      );
      return entity.datum.links.some(
        (link) => waiverLinks.has(link.type) && link.target === obligationInstance,
      );
    }).sort((left, right) => left.key.localeCompare(right.key));
  }

  private resolverExplanation(
    definition: VersionedDefinition,
  ): ResolverScenarioExplanation {
    const resolver = object(definition.resolve_with);
    const scenarioReference = string(resolver?.scenario) ?? "";
    const scenario = this.processPackage.scenarios[
      scenarioReference ? referenceId(scenarioReference) : ""
    ];
    const expectedOutputs = array(scenario?.outputs).flatMap((outputValue) => {
      const output = object(outputValue);
      const name = string(output?.name);
      const cardinality = string(output?.cardinality);
      if (!name || !cardinality) return [];
      const types = array(output?.types).filter(
        (type): type is string => typeof type === "string",
      );
      const requiredLinks = array(output?.required_links).flatMap((linkValue) => {
        const link = object(linkValue);
        const linkId = string(link?.link);
        const target = object(link?.target);
        const input = string(target?.input);
        const targetOutput = string(target?.output);
        if (!linkId || (!input && !targetOutput)) return [];
        return [{
          link: linkId,
          target: input ? { input } : { output: targetOutput! },
        }];
      });
      return [{ name, types, cardinality, requiredLinks }];
    });
    return {
      scenario: scenarioReference,
      promptRef: string(scenario?.prompt_ref) ?? "",
      expectedOutputs,
    };
  }

  private obligationInstanceId(
    obligationReference: string,
    subjectId: string,
  ): string {
    return `${obligationReference}:${subjectId}:${this.snapshot.processRef}`;
  }

  private blockingInstanceIds(
    statusRule: Record<string, unknown> | undefined,
    context: EvaluationContext,
    byInstanceId: Map<string, PendingObligation>,
  ): string[] {
    const blockerIds = new Set<string>();
    for (const blockerValue of array(statusRule?.blocked_by)) {
      const blocker = object(blockerValue);
      const obligation = string(blocker?.obligation);
      if (!obligation || blocker?.subjects === undefined) continue;
      const subjects = array(this.value(blocker.subjects, context))
        .filter((value): value is Entity => this.isEntity(value));
      for (const subject of subjects) {
        const subjectId = subject.identity?.revision_id;
        if (!subjectId) continue;
        const instanceId = this.obligationInstanceId(obligation, subjectId);
        const pending = byInstanceId.get(instanceId);
        if (
          pending &&
          !pending.evaluation.satisfied &&
          pending.evaluation.status !== "waived"
        ) blockerIds.add(instanceId);
      }
    }
    return [...blockerIds].sort();
  }

  private unresolvedResolverBindings(
    definition: VersionedDefinition,
    context: EvaluationContext,
  ): string[] {
    const resolver = object(definition.resolve_with);
    const dispatch = object(resolver?.dispatch);
    let bindingContexts = [context];
    if (dispatch) {
      const dispatchItems = array(this.value(dispatch.for_each, context))
        .filter((value): value is Entity => this.isEntity(value));
      const alias = string(dispatch.as);
      if (dispatchItems.length === 0 || !alias) return ["dispatch"];
      bindingContexts = dispatchItems.map((item) => ({
        ...context,
        [alias]: item,
      }));
    }
    const unresolved = new Set<string>();
    for (const [name, binding] of Object.entries(object(resolver?.inputs) ?? {})) {
      for (const bindingContext of bindingContexts) {
        const value = this.value(binding, bindingContext);
        if (value === undefined || value === null ||
          (Array.isArray(value) && value.length === 0)) {
          unresolved.add(name);
        }
      }
    }
    return [...unresolved].sort();
  }

  private blockerChains(
    evaluation: ObligationEvaluation,
    byInstanceId: Map<string, PendingObligation>,
    visited = new Set<string>(),
  ): string[][] {
    if (visited.has(evaluation.id)) return [];
    const nextVisited = new Set(visited).add(evaluation.id);
    const chains = evaluation.blockedBy.flatMap((blockerId) => {
      const blocker = byInstanceId.get(blockerId)?.evaluation;
      if (!blocker) return [[blockerId]];
      const descendants = this.blockerChains(
        blocker,
        byInstanceId,
        nextVisited,
      );
      return descendants.length === 0
        ? [[blockerId]]
        : descendants.map((chain) => [blockerId, ...chain]);
    });
    return chains.sort((left, right) => {
      const leftKey = left.join("\u0000");
      const rightKey = right.join("\u0000");
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  }

  private actionableResolver(
    evaluation: ObligationEvaluation,
    byInstanceId: Map<string, PendingObligation>,
    visited = new Set<string>(),
  ): string | null {
    if (evaluation.dispatchable) return evaluation.eventualResolver;
    if (visited.has(evaluation.id)) return null;
    const nextVisited = new Set(visited).add(evaluation.id);
    for (const blockerId of evaluation.blockedBy) {
      const blocker = byInstanceId.get(blockerId)?.evaluation;
      if (!blocker) continue;
      const resolver = this.actionableResolver(
        blocker,
        byInstanceId,
        nextVisited,
      );
      if (resolver) return resolver;
    }
    return null;
  }

  private obligationStatus(
    definition: VersionedDefinition,
    context: EvaluationContext,
  ): {
    status: string;
    reason: string;
    rule?: Record<string, unknown>;
  } {
    const rules = array(definition.status_rules)
      .map(object)
      .filter((rule): rule is Record<string, unknown> => rule !== undefined)
      .sort((left, right) => number(right.priority) - number(left.priority));
    for (const rule of rules) {
      if (this.expression(rule.when, context)) {
        return {
          status: string(rule.status) ?? string(definition.default_status) ?? "blocked",
          reason: string(rule.reason) ?? "The obligation is not satisfied.",
          rule,
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
    const result = object(match?.result) ?? object(definition.default) ?? {};
    if (this.policyEvidence) {
      this.policyEvidence.push({
        policy: reference,
        arguments: this.evidenceValue(argumentsContext) as Record<string, unknown>,
        result: this.evidenceValue(result) as Record<string, unknown>,
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

  private expression(value: unknown, context: EvaluationContext): boolean {
    if (!isCompiledTextExpression(value)) {
      throw new Error(`Expected a compiled mdlm-expression@1 condition`);
    }
    return evaluateCompiledTextExpression(
      value,
      context,
      this.expressionHost(),
    );
  }

  private value(value: unknown, context: EvaluationContext): unknown {
    if (!isCompiledTextExpression(value)) {
      throw new Error(`Expected a compiled mdlm-expression@1 value`);
    }
    return evaluateCompiledTextValue(value, context, this.expressionHost());
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
      const result = this.query(definition.query, {
        ...this.baseContext,
        ...argumentsContext,
      });
      if (this.selectorEvidence) {
        this.selectorEvidence.push({
          selector: reference,
          arguments: this.evidenceValue(argumentsContext) as Record<string, unknown>,
          result: result
            .map((entity) => this.exactTypedEntity(entity))
            .filter((entity): entity is ExactTypedEntity => entity !== undefined),
        });
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
      case "scenario-inputs":
      case "scenario-outputs":
        return [];
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
      phase: null,
      artifacts: {},
      dependencyChanges: [],
      obligations: [],
      obligationHistory: [],
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
