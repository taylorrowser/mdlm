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

Independently challenge every exact requirement in the frozen context. Look for
removable, mergeable, duplicated, conflicting, unjustified, or missing behavior.
Record a terminal Review with `review_kind: simplification-requirements` against
the supplied exact Review Context. A pass has no blockers. A failure declares one
`definition_simplification`: use `subject` with one exact SYS `primary_target` and
all of its primary Findings, or `definition-consistency` only when the complete
SYS/ASP/ICSP/planning-DWP set must change atomically. Canonical `blocks` links
name the one subject or every member of that exact set. Use `removes` plus a
`scope_reduction` rationale only for exact SYS outputs that no longer apply.
