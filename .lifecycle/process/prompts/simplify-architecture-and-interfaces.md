---
id: simplify-architecture-and-interfaces
version: 1
scenario: simplify-architecture-and-interfaces
---

# Simplify architecture and interfaces

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/scope-challenge.md@1`
3. `skills/architecture-specification.md@1`
4. `skills/interface-control-specification.md@1`
5. `skills/contextual-artifact-review.md@1`

Independently challenge every architecture element, interaction, constraint,
and interface obligation in the frozen context before DWP completion or candidate
assembly. Remove complexity that exists only to support itself. Record a terminal
Review with `review_kind: simplification-architecture-interfaces`.

A pass has no `blocks`, `removes`, or `definition_simplification`. A failure
nests every blocking primary Finding under the exact `primary_target`; only a
definition-consistency failure may add `collateral_findings`, whose exact target
set is the complete canonical blocker set.
Use `correction_set: subject` only with one canonical `blocks` link to that current
SYS Revision. Architecture, interface, or planning-DWP change uses
`definition-consistency` with `blocks` links to every and only exact SYS, ASP,
ICSP, and planning-DWP context member. Record removed SYS outputs through exact
`removes` links and rationale under `scope_reduction`; do not preserve or silently
drop obsolete work.
