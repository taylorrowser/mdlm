---
id: execute-verification-run
version: 2
scenario: execute-verification-run
---

# Execute one qualification or pilot run

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-run-model.md@1`
3. `skills/reproducibility.md@1`

Execute the exact VAI in the exact ENV against its exact target. Attempt all
declared activities when setup and the target boundary permit them, and retain
structured evidence for every attempted, refused, skipped, or not-launched case.
A completed RUN means the bounded runner procedure completed. It does not by
itself mean product behavior was exercised.

Distinguish execution failure from infrastructure error. If mandatory setup fails,
the target safely refuses execution, or every product case is not launched, retain
the RUN and RES as durable evidence. Report the pilot result as `inconclusive` or
`unsuitable` as the observations require. Do not report `suitable` unless the run
actually observed both the expected successful behavior and the expected
discrimination behavior.

Qualification results claim only environment capability. Pilot results report both
expected success and expected discrimination and claim only verification-design
suitability. Never translate a pilot outcome into requirement acceptance or formal
evidence.
