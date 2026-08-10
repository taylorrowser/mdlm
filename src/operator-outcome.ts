import type {
  PhaseAttentionCheckpointEvaluation,
  TerminalOutcomeEvaluation,
} from "./evaluator.js";
import type { ScenarioParticipation } from "./participation.js";

export interface OperatorAuthorityRequirement {
  policy: string;
  authorityRequirement: ScenarioParticipation["authorityRequirement"];
  attentionSchedule: ScenarioParticipation["attentionSchedule"];
}

export interface OperatorExactSubject {
  identity: {
    id: string;
    revisionId: string;
    type: string;
    revision: number;
  };
  payload: Record<string, unknown>;
  links: { type: string; target: string }[];
  body: string;
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
  exactSubject?: OperatorExactSubject;
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

export interface CheckpointConversationItem {
  instance: string;
  scenario: string;
  exactSubject?: OperatorExactSubject;
  explanation: string;
}

export interface CheckpointConversation {
  checkpoint: string;
  consolidationGroup: string | null;
  items: CheckpointConversationItem[];
  conversation: {
    format: "freeform";
    semanticMapping: "harness";
    transcriptStorage: "none-by-default";
    publication: "serial-with-reevaluation";
    checkpointScheduling: "not-deferral";
  };
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
      checkpointConversation?: CheckpointConversation;
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

function attendedRequirement(
  work: OperatorWorkFacts,
  timing: "immediate" | "checkpoint",
): OperatorAuthorityRequirement | undefined {
  return work.authorityRequirements.find((requirement) =>
    requirement.authorityRequirement.mode === "attended" &&
    requirement.attentionSchedule.timing === timing
  );
}

function immediateAttendedRequirement(
  work: OperatorWorkFacts,
): OperatorAuthorityRequirement | undefined {
  return attendedRequirement(work, "immediate");
}

function runnableWithoutAttention(work: OperatorWorkFacts): boolean {
  return work.authorityRequirements.length === 0 ||
    work.authorityRequirements.every((requirement) =>
      requirement.authorityRequirement.mode === "autonomous" ||
      requirement.authorityRequirement.mode === "delegated"
    );
}

function compatibleCheckpointRequirement(
  candidate: OperatorAuthorityRequirement,
  selected: OperatorAuthorityRequirement,
): boolean {
  return candidate.attentionSchedule.timing === "checkpoint" &&
    candidate.attentionSchedule.checkpoint ===
      selected.attentionSchedule.checkpoint &&
    candidate.attentionSchedule.consolidationGroup ===
      selected.attentionSchedule.consolidationGroup &&
    candidate.authorityRequirement.mode ===
      selected.authorityRequirement.mode &&
    candidate.authorityRequirement.authority ===
      selected.authorityRequirement.authority &&
    candidate.authorityRequirement.delegationAllowed ===
      selected.authorityRequirement.delegationAllowed;
}

function checkpointConversation(
  work: OperatorWorkFacts[],
  selected: OperatorAuthorityRequirement,
): CheckpointConversation {
  return {
    checkpoint: selected.attentionSchedule.checkpoint!,
    consolidationGroup: selected.attentionSchedule.consolidationGroup,
    items: work.flatMap((candidate) => {
      const requirement = attendedRequirement(candidate, "checkpoint");
      return requirement && compatibleCheckpointRequirement(requirement, selected)
        ? [{
            instance: candidate.instance,
            scenario: candidate.scenario,
            ...(candidate.exactSubject
              ? { exactSubject: candidate.exactSubject }
              : {}),
            explanation: candidate.explanation,
          }]
        : [];
    }),
    conversation: {
      format: "freeform",
      semanticMapping: "harness",
      transcriptStorage: "none-by-default",
      publication: "serial-with-reevaluation",
      checkpointScheduling: "not-deferral",
    },
  };
}

/** Classify package-derived work without recognizing any package-owned IDs. */
export function classifyOperatorOutcome(
  work: OperatorWorkFacts[],
  terminal: TerminalOutcomeEvaluation | null = null,
  checkpoints: PhaseAttentionCheckpointEvaluation[] = [],
): OperatorOutcomeClassification {
  const activeCheckpoints = new Set(
    checkpoints.filter((checkpoint) => checkpoint.active).map(
      (checkpoint) => checkpoint.id,
    ),
  );
  for (const candidate of work) {
    if (!candidate.dispatchable) continue;
    const attended = attendedRequirement(candidate, "checkpoint");
    const checkpoint = attended?.attentionSchedule.checkpoint;
    if (!attended || !checkpoint || !activeCheckpoints.has(checkpoint)) continue;
    return {
      kind: "attention-required",
      work: candidate,
      authorityRequirement: attended.authorityRequirement,
      attentionSchedule: attended.attentionSchedule,
      explanation: candidate.explanation,
      checkpointConversation: checkpointConversation(work, attended),
    };
  }
  for (const candidate of work) {
    if (!candidate.dispatchable) continue;
    const attended = immediateAttendedRequirement(candidate);
    if (!attended) continue;
    return {
      kind: "attention-required",
      work: candidate,
      authorityRequirement: attended.authorityRequirement,
      attentionSchedule: attended.attentionSchedule,
      explanation: candidate.explanation,
    };
  }
  for (const candidate of work) {
    if (candidate.dispatchable && runnableWithoutAttention(candidate)) {
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
