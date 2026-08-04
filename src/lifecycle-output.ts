import type { ObligationEvaluation } from "./evaluator.js";
import type {
  LooseEndsProjection,
  NextWorkProjection,
  PhaseStatusProjection,
} from "./lifecycle-inspection.js";

function humanObligation(obligation: ObligationEvaluation): string[] {
  const outputs = obligation.resolver.expectedOutputs.map((output) =>
    `${output.name} ${output.types.join("|")} ${output.cardinality}; required links ${JSON.stringify(output.requiredLinks)}`
  );
  return [
    `Obligation Instance: ${obligation.id}`,
    `Obligation: ${obligation.obligation}`,
    `Subject: ${obligation.subject}`,
    `Satisfied: ${obligation.satisfied}`,
    `Status: ${obligation.status}`,
    `Dispatchable: ${obligation.dispatchable}`,
    `Blocked By: ${obligation.blockedBy.join(", ") || "none"}`,
    `Blocker Chains: ${JSON.stringify(obligation.blockerChains)}`,
    `Unresolved Bindings: ${obligation.unresolvedBindings.join(", ") || "none"}`,
    `Eventual Resolver: ${obligation.eventualResolver || "none"}`,
    `Actionable Resolver: ${obligation.actionableResolver ?? "none"}`,
    `Resolver Prompt: ${obligation.resolver.promptRef}`,
    `Expected Outputs: ${outputs.join(" | ") || "none"}`,
    `Waiver Policy: ${obligation.waiver.policy}`,
    `Waiver Permitted: ${obligation.waiver.result.permitted}`,
    `Waiver Approval Required: ${obligation.waiver.result.approvalRequired}`,
    `Waiver Applicable: ${obligation.waiver.result.applicable}`,
    `Waiver Scope: ${obligation.waiver.result.scope ?? "none"}`,
    `Waiver Evidence: ${obligation.waiver.result.evidence.map((item) => item.identity.revision_id).join(", ") || "none"}`,
    `Explanation: ${obligation.explanation}`,
  ];
}

export function humanPhaseStatus(
  packageReference: string,
  phase: PhaseStatusProjection,
): string {
  const candidates = phase.candidateSelection.entities.map(
    (candidate) => candidate.identity.revision_id,
  );
  const statuses = Object.entries(phase.obligations.byStatus).map(
    ([status, summary]) =>
      `${status}=${summary.count} [${summary.instances.join(", ")}]`,
  );
  const gates = phase.gate.evaluations.flatMap((gate) => [
    `Gate Candidate: ${gate.candidate.identity.revision_id}`,
    `Gate Complete: ${gate.complete}`,
    `Gate Explanation: ${gate.explanation}`,
    `Gate Obligation Instance: ${gate.obligationInstance}`,
    `Gate Status: ${gate.status}`,
    `Gate Dispatchable: ${gate.dispatchable}`,
    `Gate Blocked By: ${gate.blockedBy.join(", ") || "none"}`,
    `Gate Blocker Chains: ${JSON.stringify(gate.blockerChains)}`,
    `Gate Unresolved Bindings: ${gate.unresolvedBindings.join(", ") || "none"}`,
    `Gate Eventual Resolver: ${gate.eventualResolver || "none"}`,
    `Gate Actionable Resolver: ${gate.actionableResolver ?? "none"}`,
    `Gate Completion Expression: ${gate.evidence.source}`,
    `Gate Selector Evidence: ${JSON.stringify(gate.evidence.selectors)}`,
    `Gate Policy Evidence: ${JSON.stringify(gate.evidence.policies)}`,
    ...(gate.obligation
      ? humanObligation(gate.obligation).map((line) => `Gate ${line}`)
      : ["Gate Obligation: unresolved"]),
  ]);
  return [
    `Process Package: ${packageReference}`,
    `Phase: ${phase.id}@${phase.version}`,
    `Entry Satisfied: ${phase.entry.satisfied}`,
    `Entry Explanation: ${phase.entry.explanation}`,
    `Entry Expression: ${phase.entry.evidence.source}`,
    `Entry Selector Evidence: ${JSON.stringify(phase.entry.evidence.selectors)}`,
    `Candidates: ${candidates.join(", ") || "none"}`,
    `Candidate Explanation: ${phase.candidateSelection.explanation}`,
    `Candidate Expression: ${phase.candidateSelection.evidence.source}`,
    `Candidate Selector Evidence: ${JSON.stringify(phase.candidateSelection.evidence.selectors)}`,
    `Obligations: total=${phase.obligations.total}, satisfied=${phase.obligations.satisfied}, loose-ends=${phase.obligations.looseEnds}, waived=${phase.obligations.waived}`,
    `Obligation Statuses: ${statuses.join("; ") || "none"}`,
    `Gate Required: ${phase.gate.required}`,
    ...gates,
    `Phase Blockers: ${phase.blockers.instanceIds.join(", ") || "none"}`,
    `Phase Blocker Chains: ${JSON.stringify(phase.blockers.chains)}`,
    `Phase Unresolved Bindings: ${JSON.stringify(phase.blockers.unresolvedBindings)}`,
  ].join("\n");
}

export function humanLooseEnds(
  packageReference: string,
  looseEnds: LooseEndsProjection,
): string {
  const items = looseEnds.items.flatMap((item, index) => [
    `Loose End ${index + 1}`,
    ...humanObligation(item),
  ]);
  const suppressed = looseEnds.waiverSuppressed.flatMap((item, index) => [
    `Waiver-Suppressed Obligation ${index + 1}`,
    ...humanObligation(item),
  ]);
  return [
    `Process Package: ${packageReference}`,
    `Phase: ${looseEnds.phase}`,
    `Loose Ends: ${looseEnds.items.length}`,
    ...items,
    `Waiver-Suppressed Obligations: ${looseEnds.waiverSuppressed.length}`,
    ...suppressed,
  ].join("\n");
}

export function humanNextWork(
  packageReference: string,
  next: NextWorkProjection,
): string {
  return [
    `Process Package: ${packageReference}`,
    `Phase: ${next.phase}`,
    ...(next.item
      ? ["Next Dispatchable Loose End", ...humanObligation(next.item)]
      : ["Next Dispatchable Loose End: none"]),
  ].join("\n");
}
