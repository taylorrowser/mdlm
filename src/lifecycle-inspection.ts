import type {
  LifecycleEvaluation,
  ObligationEvaluation,
  PhaseEvaluation,
  PhaseGateEvaluation,
} from "./evaluator.js";

export interface ObligationStatusSummary {
  count: number;
  instances: string[];
}

export interface PhaseGateStatus extends PhaseGateEvaluation {
  obligation: ObligationEvaluation | null;
}

export interface PhaseStatusProjection
  extends Omit<PhaseEvaluation, "gate"> {
  obligations: {
    total: number;
    satisfied: number;
    looseEnds: number;
    waived: number;
    byStatus: Record<string, ObligationStatusSummary>;
  };
  gate: {
    required: boolean;
    evaluations: PhaseGateStatus[];
  };
  blockers: {
    instanceIds: string[];
    chains: string[][];
    unresolvedBindings: {
      instance: string;
      bindings: string[];
    }[];
  };
}

export interface LooseEndsProjection {
  phase: string;
  items: ObligationEvaluation[];
  waiverSuppressed: ObligationEvaluation[];
}

export interface NextWorkProjection {
  phase: string;
  item: ObligationEvaluation | null;
}

function phaseReference(phase: PhaseEvaluation): string {
  return `${phase.id}@${phase.version}`;
}

export function phaseStatusProjection(
  evaluation: LifecycleEvaluation,
): PhaseStatusProjection | undefined {
  const phase = evaluation.phase;
  if (!phase) return undefined;

  const byStatusEntries = new Map<string, string[]>();
  for (const obligation of evaluation.obligations) {
    const instances = byStatusEntries.get(obligation.status) ?? [];
    instances.push(obligation.id);
    byStatusEntries.set(obligation.status, instances);
  }
  const byStatus = Object.fromEntries(
    [...byStatusEntries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([status, instances]) => [
        status,
        { count: instances.length, instances },
      ]),
  );
  const blockingEvaluations = [
    ...evaluation.looseEnds.map((looseEnd) => ({
      instance: looseEnd.id,
      blockedBy: looseEnd.blockedBy,
      blockerChains: looseEnd.blockerChains,
      unresolvedBindings: looseEnd.unresolvedBindings,
    })),
    ...phase.gate.evaluations.map((gate) => ({
      instance: gate.obligationInstance,
      blockedBy: gate.blockedBy,
      blockerChains: gate.blockerChains,
      unresolvedBindings: gate.unresolvedBindings,
    })),
  ];
  const exactBlockers = [...new Set(
    blockingEvaluations.flatMap((item) => item.blockedBy),
  )].sort();
  const chains = [...new Map(
    blockingEvaluations
      .flatMap((item) => item.blockerChains)
      .map((chain) => [JSON.stringify(chain), chain]),
  ).values()].sort((left, right) =>
    left.join("\0").localeCompare(right.join("\0"))
  );
  const unresolvedBindings = [...new Map(
    blockingEvaluations
      .filter((item) => item.unresolvedBindings.length > 0)
      .map((item) => [
        `${item.instance}\0${item.unresolvedBindings.join("\0")}`,
        { instance: item.instance, bindings: item.unresolvedBindings },
      ]),
  ).values()];
  const obligationsById = new Map(
    evaluation.obligations.map((obligation) => [obligation.id, obligation]),
  );

  return {
    id: phase.id,
    version: phase.version,
    entry: phase.entry,
    candidateSelection: phase.candidateSelection,
    obligations: {
      total: evaluation.obligations.length,
      satisfied: evaluation.obligations.filter((item) => item.satisfied).length,
      looseEnds: evaluation.looseEnds.length,
      waived: evaluation.obligations.filter((item) => item.status === "waived").length,
      byStatus,
    },
    gate: {
      required: phase.gate.required,
      evaluations: phase.gate.evaluations.map((gate) => ({
        ...gate,
        obligation: obligationsById.get(gate.obligationInstance) ?? null,
      })),
    },
    blockers: {
      instanceIds: exactBlockers,
      chains,
      unresolvedBindings,
    },
  };
}

export function looseEndsProjection(
  evaluation: LifecycleEvaluation,
): LooseEndsProjection | undefined {
  if (!evaluation.phase) return undefined;
  return {
    phase: phaseReference(evaluation.phase),
    items: evaluation.looseEnds,
    waiverSuppressed: evaluation.obligations.filter(
      (obligation) => obligation.status === "waived",
    ),
  };
}

export function nextWorkProjection(
  evaluation: LifecycleEvaluation,
): NextWorkProjection | undefined {
  if (!evaluation.phase) return undefined;
  return {
    phase: phaseReference(evaluation.phase),
    item: evaluation.looseEnds.find((looseEnd) => looseEnd.dispatchable) ?? null,
  };
}
