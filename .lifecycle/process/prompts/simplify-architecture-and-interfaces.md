---
id: simplify-architecture-and-interfaces
version: 1
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
Review Context. A pass has no blockers. A failure declares one
`definition_simplification`: use `subject` only for one exact SYS target, or
`definition-consistency` when the complete SYS/ASP/ICSP/planning-DWP set must
change atomically. Canonical `blocks` links name exactly that scope. Use `removes`
and a `scope_reduction` rationale only for exact SYS outputs made unnecessary.
Retain at least one SYS output. If the accepted parent requires no system behavior,
return typed inability because parent-scope cancellation is outside this Assignment.
