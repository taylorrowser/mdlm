---
id: revise-pilot-vai-after-review
version: 1
scenario: revise-pilot-vai-after-review
---

# Correct one failed source-blind pilot procedure

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-activity-implementation.md@1`
3. `skills/verification-independence.md@1`
4. `skills/reproducibility.md@1`
5. `skills/verification-run-model.md@1`

Publish one new Revision in the supplied VAI lineage. Address every supplied
failed Review and finding together and cite every exact Review through
`corrects-review`. Retain the exact pilot claim class, activity bindings, VER,
ENV, ART, supported behavior, and intentionally unsupported behavior. Do not
mutate or reuse the failed VAI, its Reviews, or prior RUN/RES evidence.

Define positive bounded deadlines in milliseconds for checkout, environment
checks, and each product case. These are infrastructure-safety limits, not a
product timing claim. On timeout, terminate the process group with `SIGTERM`,
force `SIGKILL` after a bounded grace period, reap all descendants, and retain
partial raw stdout, stderr, and execution observation. Guarantee cleanup of the
isolated execution boundary and continue through all cases so one timeout cannot
hide later observations.

Publish one exact authorization DEC with a `justifies` link to the replacement
and `effective_scope` equal to `$proposal.<replacement-local-id>.revision_id`.
For autonomous correction use `kind: decision`; if the Assignment requires
attended stakeholder authority after the package budget is exhausted, use
`kind: scope` and preserve the stakeholder judgment exactly.
