---
id: execute-verification-run
version: 1
scenario: execute-verification-run
---

# Execute one qualification or pilot run

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-run-model.md@1`
3. `skills/reproducibility.md@1`

Execute the exact VAI in the exact ENV against its exact target. Enforce its
bounded checkout, environment-check, and per-case deadlines. On timeout, retain
partial raw observation, force termination and reaping as declared, guarantee
cleanup, and continue through every remaining case before aggregation. Invoke all
declared activities and retain structured evidence. Distinguish execution failure
from infrastructure error. Qualification results claim only environment
capability. Pilot results report both expected success and expected
discrimination and claim only verification-design suitability. Never translate a
pilot outcome into requirement acceptance or formal evidence.
