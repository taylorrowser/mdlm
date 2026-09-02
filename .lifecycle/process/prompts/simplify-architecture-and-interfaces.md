---
id: simplify-architecture-and-interfaces
version: 2
scenario: simplify-architecture-and-interfaces
---

# Simplify architecture and interfaces

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/scope-challenge.md@2`
3. `skills/architecture-specification.md@1`
4. `skills/interface-control-specification.md@1`
5. `skills/contextual-artifact-review.md@2`

Independently challenge every architecture element, interaction, constraint,
interface obligation, and SYS behavior in the frozen context. Across the complete
SYS set, identify missing behavior, duplicate or mergeable statements, conflicts,
unjustified splits, implementation leakage, and behavior not traceable to an exact
accepted parent. Remove complexity that exists only to support itself. Record a terminal Review with
`review_kind: simplification-architecture-interfaces` against the supplied exact
Review Context. Preserve the scaffold's exact `reviews` and `contextualizes`
links. A pass has no `blocks` links and omits `correction_authority`.

A failure declares one `definition_simplification`. For `correction_set:
subject`, retain only the scaffold's `blocks` link to the selected exact SYS
Revision and remove the others. For `correction_set: definition-consistency`,
retain the scaffold's `blocks` link to every exact Revision supplied in
`definition_members`, including the ASP, each ICSP when present, the planning
DWP, and every SYS. Do not retain any other `blocks` link.
Every failed Review includes `correction_authority`: use `stakeholder` when a
blocker requires a new choice about intent, priority, scope retention, or
tradeoffs; use `package-evidence` when the exact supplied package evidence fully
determines the correction. Passing and cancelled Reviews omit
`correction_authority` and remove every scaffold `blocks` link.

Use `removes` and a `scope_reduction` rationale only for exact SYS outputs made
unnecessary. Retain at least one SYS output. If the accepted parent requires no
system behavior, return typed inability because parent-scope cancellation is
outside this Assignment.
