export type OperatorInstructionAction =
  | "publish-materialized-executions"
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
    | "publication-required"
    | "assignment"
    | "attention-required"
    | "profile-boundary-reached"
    | "lifecycle-complete"
    | "process-dead-end"
    | "invalid";
  assignment?: { id: string };
  authorityRequirement?: { authority: string };
  materializedExecutions?: {
    id: string;
    scenario: string;
    status: "completed";
  }[];
}

const base = {
  contract: "mdlm-operator-instructions@1" as const,
  guidePath: "MDLM.md" as const,
};

const loopReminder = "Own the lifecycle loop. For continuing outcomes, complete and submit the exact Assignment, then run mdlm next --json again. On Attention Required, ask the named authority. Stop only when this outcome or an integrity boundary says to stop.";

/** Project the immediate safe operator boundary without changing the outcome. */
export function operatorInstructions(
  source: OperatorInstructionSource,
): OperatorInstructions {
  if (source.outcome === "publication-required") {
    const executions = source.materializedExecutions ?? [];
    return {
      ...base,
      action: "publish-materialized-executions",
      disposition: "continuation",
      commands: ["mdlm doctor --json", "mdlm next --json"],
      text: `Inspect and commit only the exact materialized Lifecycle Data (${executions.map((item) => `${item.id} (${item.scenario})`).join(", ")}), then run mdlm next --json for a fresh outcome. No Assignment is leased at this publication boundary.`,
    };
  }

  if (source.outcome === "assignment" && source.assignment) {
    return {
      ...base,
      action: "execute-assignment",
      disposition: "continuation",
      commands: [
        "mdlm assignment response --json > .lifecycle/work/assignment-response.json",
        "mdlm scenario submit <response-file> --json",
        "mdlm doctor --json",
        "mdlm next --json",
      ],
      text: `${loopReminder} Begin this Assignment now within its exact authority and no-replay boundaries.`,
    };
  }

  if (source.outcome === "attention-required" && source.assignment) {
    const authority = source.authorityRequirement?.authority;
    return {
      ...base,
      action: "obtain-attention",
      disposition: "continuation",
      commands: [
        "mdlm assignment response --json > .lifecycle/work/assignment-response.json",
        `mdlm scenario submit <response-file>${authority ? ` --authority ${authority}` : ""} --json`,
        "mdlm doctor --json",
        "mdlm next --json",
      ],
      text: `${loopReminder} Ask authorityRequirement.authority using only the returned attention context, then resume this exact Assignment. Never invent or self-supply authority.`,
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
      text: `${loopReminder} This outcome says to stop successfully at ${source.outcome === "lifecycle-complete" ? "Lifecycle Complete" : "Profile Boundary Reached"}; preserve its exact evidence.`,
    };
  }

  return {
    ...base,
    action: "stop-failure",
    disposition: "unsuccessful-stop",
    commands: [],
    text: `${loopReminder} ${source.outcome === "process-dead-end"
      ? "This outcome says to stop unsuccessfully at Process Dead End; preserve its exact blockers."
      : "This outcome says to stop unsuccessfully at Invalid; preserve its exact diagnostics."}`,
  };
}
