---
id: execute-qualification-verification-run
version: 1
scenario: execute-qualification-verification-run
---

# Execute one exact qualification run

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-run-model.md@1`
3. `skills/reproducibility.md@1`

Execute the exact inline instructions in the supplied qualification VAI against
the exact ENV. Attempt every declared activity when the environment permits it.
Retain structured evidence for every attempted, refused, skipped, or
not-launched activity.

A completed RUN means the bounded procedure completed. It does not mean product
behavior was exercised. The RES claims only environment capability, records a
pass or fail outcome, and never becomes formal product evidence.

Keep execution timestamps, state, invoked activities, observations, evidence
locations, result judgment, and assessor evidence faithful to the execution.
The Assignment fixes identities and expected activities already determined by
the VAI, VER, ENV, and execution target.
