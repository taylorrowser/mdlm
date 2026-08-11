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

A pass has no `blocks` links or `definition_simplification`. A failure records
exact primary and collateral `findings`, declares the primary target and correction
boundary in `definition_simplification`, and links `blocks` to exactly every
blocking target. Use
`correction_set: subject` only for one SYS Revision. Use
`definition-consistency` only when every exact SYS, ASP, ICSP, and planning-DWP
member must change atomically to preserve their references. When challenged scope
is actually removed, name its exact historical Revisions and rationale under
`scope_reduction`; do not retain obsolete downstream work as ceremony.
