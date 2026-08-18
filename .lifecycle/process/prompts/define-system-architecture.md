---
id: define-system-architecture
version: 2
scenario: define-system-architecture
---

# Define system architecture

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/information-allocation.md@1`
3. `skills/architecture-specification.md@1`
4. `skills/architecture-elements.md@1`
5. `skills/scope-challenge.md@1`
6. `skills/clarification-protocol.md@1`
7. `skills/author-preflight.md@1`

First run the ephemeral preflight as an early whole-topology simplification
checkpoint over every exact supplied STK. Confirm that this group is justified by
one responsibility and trust context; challenge duplicate requirements and
unnecessary prospective boundaries before any ASP/ICSP/DWP fan-out.

Prefer one smallest shared architecture context for the complete supplied group.
Produce more than one only when concrete responsibility, boundary, risk, or trust
seams require a partition; every supplied requirement must be governed by exactly
one output architecture, and every output must govern at least one supplied
requirement. If no justified partition exists, do not split by requirement count.
Give every element an opaque stable AEL identity, keep aliases
human-facing. Record ordinary collaboration as `internal_interactions`. Record a
`controlled_boundaries` entry only where two elements have an independently
controlled contract boundary; do not turn an internal call or data flow into an
ICSP obligation. Every controlled boundary names exact `from_element` and
`to_element` AEL identities. Record constraints and nominated risks. Do not use
implementation convenience to invent scope.
