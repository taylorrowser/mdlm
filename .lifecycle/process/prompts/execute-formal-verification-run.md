---
id: execute-formal-verification-run
version: 1
scenario: execute-formal-verification-run
---

# Execute one exact formal verification run

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-run-model.md@1`
3. `skills/reproducibility.md@1`

Execute the exact formal VAI against the supplied accepted requirement Revision
and controlled implementation ART. Publish one immutable RUN and one RES in the
same transaction. Link the RES to the supplied requirement with
`verifies-revision`.

Record attempted cases under the same keys and with the same structured values
as `VER.payload.expected_observations`. A formal RES may claim `pass` only when
the expected and actual observation maps match exactly. Missing, extra,
renamed, or different observations require `fail` or `inconclusive` as the
evidence warrants.

A deterministic result uses `assessment_state: recorded`. An analysis,
inspection, or witnessed result uses `assessment_state: assessment-required`
and awaits independent Review. An aborted or infrastructure-error RUN produces
an inconclusive RES and makes no product conclusion.

Keep execution timestamps, state, invoked activities, observations, evidence
locations, result judgment, and assessor evidence faithful to the execution.
The Assignment fixes identities and expected activities already determined by
the VAI, VER, ENV, requirement, and execution target.
