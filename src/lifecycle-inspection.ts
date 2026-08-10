import {
  evaluateLifecycle,
  type ExactTypedEntity,
  type LifecycleEvaluation,
  type LifecycleSnapshot,
  type ObligationEvaluation,
  type PhaseEvaluation,
  type PhaseGateEvaluation,
} from "./evaluator.js";
import type { ProcessPackage } from "./index.js";

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

export interface PhaseProgressionWork {
  kind: "phase-progression";
  id: string;
  nextPhase: string;
  status: "awaiting-authority";
  dispatchable: boolean;
  scenario: string;
  subjects: ExactTypedEntity[];
  authority: NonNullable<PhaseEvaluation["progression"]>["authority"];
  explanation: string;
}

export interface NextWorkProjection {
  phase: string;
  item: ObligationEvaluation | PhaseProgressionWork | null;
}

function phaseReference(phase: PhaseEvaluation): string {
  return `${phase.id}@${phase.version}`;
}

export function initialPhaseId(processPackage: ProcessPackage): string | undefined {
  return Object.values(processPackage.phases)
    .sort((left, right) =>
      Number(left.order) - Number(right.order) || left.id.localeCompare(right.id)
    )[0]?.id;
}

export function activeLifecycleEvaluation(
  processPackage: ProcessPackage,
  snapshot: LifecycleSnapshot,
): LifecycleEvaluation {
  let phaseId = initialPhaseId(processPackage) ?? snapshot.phaseId;
  const visited = new Set<string>();
  while (!visited.has(phaseId)) {
    visited.add(phaseId);
    const evaluation = evaluateLifecycle(processPackage, { ...snapshot, phaseId });
    const nextPhase = evaluation.phase?.progression?.complete
      ? evaluation.phase.progression.nextPhase
      : undefined;
    if (!nextPhase) return evaluation;
    phaseId = nextPhase;
  }
  return evaluateLifecycle(processPackage, { ...snapshot, phaseId });
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
    attentionCheckpoints: phase.attentionCheckpoints,
    entry: phase.entry,
    candidateSelection: phase.candidateSelection,
    progression: phase.progression,
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
  const obligation = evaluation.looseEnds.find((looseEnd) =>
    looseEnd.dispatchable
  );
  const progression = evaluation.phase.progression;
  const progressionWork: PhaseProgressionWork | null = !obligation &&
      progression?.ready === true && !progression.authorized
    ? {
        kind: "phase-progression",
        id: `phase-progression:${phaseReference(evaluation.phase)}`,
        nextPhase: progression.nextPhase,
        status: "awaiting-authority",
        dispatchable: progression.authority.subjects.length > 0,
        scenario: progression.authority.scenario,
        subjects: progression.authority.subjects,
        authority: progression.authority,
        explanation: progression.explanation,
      }
    : null;
  return {
    phase: phaseReference(evaluation.phase),
    item: obligation ?? progressionWork,
  };
}
