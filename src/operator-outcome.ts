import type { TerminalOutcomeEvaluation } from "./evaluator.js";
import type { ScenarioParticipation } from "./participation.js";

export interface OperatorAuthorityRequirement {
  policy: string;
  authorityRequirement: ScenarioParticipation["authorityRequirement"];
  attentionSchedule: ScenarioParticipation["attentionSchedule"];
}

export interface OperatorWorkFacts {
  kind: "obligation" | "phase-progression";
  phase: string;
  instance: string;
  definition: string;
  subject: string;
  scenario: string;
  dispatchable: boolean;
  authorityRequirements: OperatorAuthorityRequirement[];
  explanation: string;
  status: string;
  blockedBy: string[];
  blockerChains: string[][];
  unresolvedBindings: string[];
  progression?: {
    nextPhase: string;
    subjects: string[];
  };
}

export interface OperatorBlockerDiagnostic {
  instance: string;
  definition: string;
  subject: string;
  status: string;
  blockedBy: string[];
  blockerChains: string[][];
  unresolvedBindings: string[];
  explanation: string;
}

export type OperatorOutcomeClassification =
  | {
      kind: "assignment";
      work: OperatorWorkFacts;
    }
  | {
      kind: "attention-required";
      work: OperatorWorkFacts;
      authorityRequirement: ScenarioParticipation["authorityRequirement"];
      attentionSchedule: ScenarioParticipation["attentionSchedule"];
      explanation: string;
    }
  | ({ kind: "profile-boundary-reached" } & Omit<
      Extract<TerminalOutcomeEvaluation, { outcome: "profile-boundary-reached" }>,
      "outcome"
    >)
  | ({ kind: "lifecycle-complete" } & Omit<
      Extract<TerminalOutcomeEvaluation, { outcome: "lifecycle-complete" }>,
      "outcome"
    >)
  | {
      kind: "process-dead-end";
      explanation: string;
      blockers: OperatorBlockerDiagnostic[];
    };

function immediateAttendedRequirement(
  work: OperatorWorkFacts,
): OperatorAuthorityRequirement | undefined {
  return work.authorityRequirements.find((requirement) =>
    requirement.authorityRequirement.mode === "attended" &&
    requirement.attentionSchedule.timing === "immediate"
  );
}

function runnableWithoutAttention(work: OperatorWorkFacts): boolean {
  return work.authorityRequirements.length === 0 ||
    work.authorityRequirements.every((requirement) =>
      requirement.authorityRequirement.mode === "autonomous" ||
      requirement.authorityRequirement.mode === "delegated"
    );
}

/** Classify package-derived work without recognizing any package-owned IDs. */
export function classifyOperatorOutcome(
  work: OperatorWorkFacts[],
  terminal: TerminalOutcomeEvaluation | null = null,
): OperatorOutcomeClassification {
  for (const candidate of work) {
    if (!candidate.dispatchable) continue;
    const attended = immediateAttendedRequirement(candidate);
    if (attended) {
      return {
        kind: "attention-required",
        work: candidate,
        authorityRequirement: attended.authorityRequirement,
        attentionSchedule: attended.attentionSchedule,
        explanation: candidate.explanation,
      };
    }
    if (runnableWithoutAttention(candidate)) {
      return { kind: "assignment", work: candidate };
    }
  }
  if (terminal) {
    const { outcome: kind, ...result } = terminal;
    return { kind, ...result } as OperatorOutcomeClassification;
  }
  return {
    kind: "process-dead-end",
    explanation:
      "The supported profile is unfinished, but no Assignment or immediate Attention Requirement can advance it.",
    blockers: work.map((candidate) => ({
      instance: candidate.instance,
      definition: candidate.definition,
      subject: candidate.subject,
      status: candidate.status,
      blockedBy: candidate.blockedBy,
      blockerChains: candidate.blockerChains,
      unresolvedBindings: candidate.unresolvedBindings,
      explanation: candidate.explanation,
    })),
  };
}
