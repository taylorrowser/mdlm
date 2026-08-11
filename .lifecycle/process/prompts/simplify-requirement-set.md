---
id: simplify-requirement-set
version: 1
scenario: simplify-requirement-set
---

# Simplify requirement set

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/scope-challenge.md@1`
3. `skills/coverage-analysis.md@1`
4. `skills/contextual-artifact-review.md@1`

Independently challenge every exact requirement in the frozen context before DWP
completion or candidate assembly. Look for removable, mergeable, duplicated,
conflicting, unjustified, or missing behavior. Record a terminal Review with
`review_kind: simplification-requirements`.

A pass has no `blocks`, `removes`, or `definition_simplification`. A failure
nests every blocking primary Finding under the exact `primary_target`; only a
definition-consistency failure may add `collateral_findings`, whose exact target
set is the complete canonical blocker set.
Use `correction_set: subject` only with one canonical `blocks` link to that current
SYS Revision. Use `definition-consistency` only with `blocks` links to every and
only exact SYS, ASP, ICSP, and planning-DWP context member that must change
atomically. When challenged SYS scope is actually removed, link each exact
historical output through `removes` and record the rationale under
`scope_reduction`; do not retain or silently drop downstream work.
