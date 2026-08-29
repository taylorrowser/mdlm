# Operate this MDLM lifecycle

This repository carries its process and lifecycle truth with it. MDLM decides
valid work from the selected Process Package and current Lifecycle Data. Operate
the CLI until it returns a truthful stop.

## Start or resume

Begin at a clean ordinary Git boundary:

```bash
mdlm start --json
mdlm next --json > .lifecycle/work/outcome.json
```

Follow the returned `operatorInstructions`. Assignment and Attention Required
outcomes include the complete `mdlm-assignment-packet@3`; ordinary operation
goes directly from `next` to `submit`. A Review, gate, checkpoint, commit, or
Phase transition does not finish the lifecycle.

## Complete one Assignment

Read the packet from the saved outcome in bounded sections. Use its prompt,
skills, exact inputs, schemas, Policies, participation, authority, prohibitions,
symbolic outputs, completion conditions, response schema, and response scaffold.
Do not reconstruct these from raw Lifecycle Data or Process Package files.

Fill one complete `mdlm-assignment-response@2`. Symbolic output handles let MDLM
allocate durable identities and required links after proposal validation. Submit
the response from ignored work storage:

```bash
mdlm scenario submit .lifecycle/work/assignment-response.json --json
```

Handle the returned `mdlm-submission-outcome@1`:

- on `accepted`, run `mdlm doctor --json`, inspect and commit only the Lifecycle
  Data transaction, then call `mdlm next --json` once;
- on retryable `rejected`, correct the response against the same active
  Assignment; and
- on `settlement-required`, call
  `mdlm scenario settlement <assignment-or-execution-id> --json` and never replay
  submission after uncertain closure.

## Supply authority

Package-delegated participation needs fresh read-only judgment from a separate
agent or person. The operating agent does not supply that judgment.

For attended work, use only the exact Authority Requirement and attention
context in the outcome. Supply the named authority ID as submit transport
metadata only when that authority was present. In ordinary work, route the
requirement to its actual holder. Stop and report the exact requirement when the
authority is unavailable.

## Stop boundaries

Stop successfully only on Profile Boundary Reached or Lifecycle Complete. Stop
unsuccessfully on Process Dead End or Invalid and preserve the exact blockers or
diagnostics. Also stop on typed inability, stale or exhausted Assignment, failed
doctor, unexpected Git state, unauthenticated settlement, or command failure.
