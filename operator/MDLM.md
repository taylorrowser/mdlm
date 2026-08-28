# Operate this MDLM lifecycle

This repository carries its process and lifecycle truth with it. MDLM decides
what work is valid from the selected Process Package and current Lifecycle Data.
You operate the CLI until it returns a truthful stop.

## Start or resume

Begin at a clean ordinary Git boundary. Run:

```bash
mdlm start --json
```

Read the returned guide and repository state. If the repository is ready, obtain
current work only with:

```bash
mdlm next --json
```

Follow the returned `operatorInstructions`. Run `next` again after every
published and committed transaction. A Review, gate, checkpoint, commit, or
Phase transition does not finish the lifecycle. Fresh reevaluation decides what
happens next.

If this host already has a goal for operating the lifecycle, keep that goal
active until a stop below. Goal support is optional host state, not part of the
MDLM contract.

## Complete one Assignment

For an Assignment, use its exact ID:

```bash
mdlm scenario prepare <assignment-id> --json
```

Capture the complete command output in an ignored working file such as
`.lifecycle/work/assignment-<assignment-id>.json`; do not rely on a console or
tool rendering that may truncate a large packet. Inspect the saved JSON in
bounded sections: `prompt` and its skills, `exactInputs`,
`allowedProjections.outputSchemas`, `policies`, `outputs`, `completion`, and
`responseSchema`. Before authoring the response, make a checklist of every
required payload property for each selected output type.

Treat that complete prepared packet as the instruction bundle. Perform only its
declared work, using only its inputs, prompt, skills, Policies, participation,
output contracts, and completion conditions. Return one complete
`mdlm-assignment-response@1` and submit it:

```bash
mdlm scenario submit <response-file> --json
mdlm doctor --json
```

Inspect the exact transaction diff. Commit only that Lifecycle Data transaction
with ordinary Git, then immediately run `mdlm next --json` again.

One `correction-required` response may be corrected against the same Assignment.
Stop and preserve the exact evidence if correction is exhausted, the Assignment
is stale, the worker returns a typed inability, doctor fails, Git state is
unexpected, the state is genuinely ambiguous, or any command fails.

## Supply authority

Package-delegated independent participation needs fresh read-only judgment from
a separate agent or person. The operator performing the Assignment does not
supply that judgment.

For attended work, use only the exact Authority Requirement and attention
context projected in the Assignment. Exercise stakeholder authority only when
the current demonstration record explicitly grants that exact authority. In
ordinary work, route the requirement to the actual named authority holder. Stop
and report the exact requirement when that authority is unavailable.

## Publish materialized executions first

If `mdlm next --json` returns non-empty `materializedExecutions`, those
executions take precedence over any outcome returned by the same invocation.
Inspect every named execution, run `mdlm doctor --json`, inspect and commit only
their exact transaction data, and discard any Assignment returned by that
`next`. The commit changes repository identity. Run `mdlm next --json` again to
obtain a fresh outcome before preparing more work.

## Stop boundaries

Stop successfully only on `Profile Boundary Reached` or `Lifecycle Complete`.
Stop unsuccessfully on `Process Dead End` or `Invalid` and preserve their exact
blockers or diagnostics. The command-specific `operatorInstructions` returned
by `mdlm next --json` state the immediate safe boundary for every outcome.
