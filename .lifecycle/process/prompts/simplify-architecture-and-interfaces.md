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

A pass has no `blocks` links or `definition_simplification`. A failure records
exact primary and collateral `findings`, declares the primary target and correction
boundary in `definition_simplification`, and links `blocks` to exactly every
blocking target. Use
`correction_set: subject` only for one SYS Revision. Architecture, interface, or
planning-DWP change uses `definition-consistency` and names every exact SYS, ASP,
ICSP, and planning-DWP member because their exact references must change
atomically. Record actual removed scope separately under `scope_reduction`; do not
preserve a removed element, boundary, behavior, or output as ceremony.
