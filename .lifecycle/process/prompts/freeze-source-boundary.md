---
id: freeze-source-boundary
version: 1
scenario: freeze-source-boundary
---

# Freeze an exact same-lineage source boundary

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/traceability.md@1`
3. `skills/baseline-model.md@1`

Create one `source-boundary` BSL for the exact input QST Revision. Set its scope
to that exact Revision ID, its group to `SAME-LINEAGE`, and include exactly that
Revision as its sole definition member with no evidence members. Freeze and
verify it atomically through this Scenario. Do not use piecemeal baseline
commands, Review Context provenance, a mutable alias, or any unrelated Revision.

The boundary preserves the source as immutable history and permits the package's
subsequent same-lineage Scenario to publish the next QST Revision.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@1` contract.
