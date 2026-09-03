---
id: execute-verification-run
version: 5
scenario: execute-verification-run
---

# Execute one exact verification run

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-run-model.md@1`
3. `skills/reproducibility.md@1`

Execute the exact VAI in the exact ENV against its exact target. For a
qualification VAI, execute the exact inline instructions in
`VAI.payload.execution_procedure.content`, including their positive capability
check and negative control. Attempt all declared activities when setup and the
target boundary permit them, and retain structured evidence for every attempted,
refused, skipped, or not-launched case. A completed RUN means the bounded runner
procedure completed. It does not by itself mean product behavior was exercised.

When the target supplies inline disposable controls, invoke the exact known-good
and known-bad argv in a fresh temporary directory. For each, retain base64 stdin,
stdout, and stderr bytes, exit status or signal, timeout and truncation state,
the exact ART Revision and control name, and the exact VER Revision in
`RUN.control_observations`. Record both control names in `activities_expected`
and `activities_invoked`. For a suitable pilot, set
`RES.payload.control_judgments` to exactly these entries:

```yaml
known_good: {observation_ref: known_good, outcome: pass}
known_bad: {observation_ref: known_bad, outcome: fail}
```

Missing, truncated, timed-out, or mismatched observations remain durable only as
an inconclusive or unsuitable result, never a suitable pilot result.

For a formal VAI, execute it only against the supplied exact accepted STK, SYS,
CMP, or DES Revision and the supplied controlled implementation ART. Publish one
immutable formal RUN and one formal RES in the same transaction. Link the RES to
the exact requirement with `verifies-revision`. A deterministic result uses
`assessment_state: recorded`; an analysis, inspection, or witnessed result uses
`assessment_state: assessment-required` and awaits independent Review.

For every formal activity, record its machine-readable expected cases in
`VER.payload.expected_observations`. Record the attempted cases under the same
keys in `RUN.payload.actual_observations`, retaining exact base64 stdin, stdout,
and stderr, exit status or signal, timeout state, and truncation state. A formal
RES may claim `pass` only when the two maps have exactly the same keys and values.
Missing, extra, renamed, or different observations require `fail` or
`inconclusive` as the evidence warrants. This correspondence checks submitted
Lifecycle Data; it does not prove that a process produced the submitted values.

Distinguish execution failure from infrastructure error. If mandatory setup fails,
the target safely refuses execution, or every product case is not launched, retain
the RUN and RES as durable evidence. Report the pilot result as `inconclusive` or
`unsuitable` as the observations require. Do not report `suitable` unless the run
actually observed both the expected successful behavior and the expected
discrimination behavior.

For formal execution, an aborted or infrastructure-error RUN publishes an
`inconclusive` RES whose observations make no product conclusion. A later
attempt is a fresh Assignment with fresh RUN and RES identities. Never resubmit,
revise, or replay the earlier transaction. A completed formal fail is product
evidence and must remain distinct from infrastructure failure.

Qualification results claim only environment capability. Pilot results report both
expected success and expected discrimination and claim only verification-design
suitability. Never translate a pilot outcome into requirement acceptance or
formal evidence. Formal evidence applies only through the exact accepted
requirement, reviewed VER and VAI, qualified ENV, controlled ART, and declared
assessment route supplied by the Assignment.
