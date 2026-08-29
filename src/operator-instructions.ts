export type OperatorInstructionAction =
  | "execute-assignment"
  | "obtain-attention"
  | "stop-success"
  | "stop-failure";

export interface OperatorInstructions {
  contract: "mdlm-operator-instructions@1";
  guidePath: "MDLM.md";
  action: OperatorInstructionAction;
  disposition: "continuation" | "successful-stop" | "unsuccessful-stop";
  commands: string[];
  text: string;
}

export interface OperatorInstructionSource {
  outcome?:
    | "assignment"
    | "attention-required"
    | "profile-boundary-reached"
    | "lifecycle-complete"
    | "process-dead-end"
    | "invalid";
  assignment?: { id: string };
}

const base = {
  contract: "mdlm-operator-instructions@1" as const,
  guidePath: "MDLM.md" as const,
};

/** Project the immediate safe operator boundary without changing the outcome. */
export function operatorInstructions(
  source: OperatorInstructionSource,
): OperatorInstructions {
  if (source.outcome === "assignment" && source.assignment) {
    return {
      ...base,
      action: "execute-assignment",
      disposition: "continuation",
      commands: [
        "mdlm scenario submit <response-file> --json",
        "mdlm doctor --json",
        "mdlm next --json",
      ],
      text: "Begin this Assignment now. Complete only this Assignment within its exact authority and publication boundaries; do not replay it. Submit its exact response, run doctor, inspect and narrowly commit only the published transaction, then run mdlm next --json. Do not stop merely to report a fresh Assignment: begin that Assignment now and repeat this one-Assignment loop until attended authority is unavailable, an integrity failure occurs, or MDLM returns a package-declared stop, Profile Boundary Reached, Lifecycle Complete, Process Dead End, or Invalid.",
    };
  }

  if (source.outcome === "attention-required" && source.assignment) {
    return {
      ...base,
      action: "obtain-attention",
      disposition: "continuation",
      commands: [
        "mdlm scenario submit <response-file> --json",
        "mdlm doctor --json",
        "mdlm next --json",
      ],
      text: "Use this exact Assignment packet and its projected Authority Requirement and attention context. If the named authority is unavailable under the current run's explicit authority record, stop and report the requirement instead of inventing authority. After publication, run doctor, narrowly commit the transaction, and run mdlm next --json again.",
    };
  }

  if (
    source.outcome === "profile-boundary-reached" ||
    source.outcome === "lifecycle-complete"
  ) {
    return {
      ...base,
      action: "stop-success",
      disposition: "successful-stop",
      commands: [],
      text: `Stop successfully at ${source.outcome === "lifecycle-complete" ? "Lifecycle Complete" : "Profile Boundary Reached"}. Preserve the exact outcome evidence.`,
    };
  }

  return {
    ...base,
    action: "stop-failure",
    disposition: "unsuccessful-stop",
    commands: [],
    text: source.outcome === "process-dead-end"
      ? "Stop unsuccessfully at Process Dead End and preserve its exact blockers."
      : "Stop unsuccessfully at Invalid and preserve its exact diagnostics.",
  };
}
