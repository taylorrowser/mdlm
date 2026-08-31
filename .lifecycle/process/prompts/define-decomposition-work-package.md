---
id: define-decomposition-work-package
version: 3
scenario: define-decomposition-work-package
---

# Define decomposition work package

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/information-allocation.md@1`
3. `skills/dwp-planning.md@1`
4. `skills/decomposition.md@1`
5. `skills/coverage-analysis.md@1`
6. `skills/traceability.md@1`
7. `skills/clarification-protocol.md@1`
8. `skills/author-preflight.md@2`

Prefer one bounded cohesive many-to-many change-and-verification slice covering
all exact supplied parents governed by the architecture. A stakeholder parent
decomposes to SYS, while a system parent decomposes to CMP. Produce a small set only
for distinct responsibility, boundary, risk, or verification need, never merely
for parent count. Every output must cover at least one supplied parent and every
supplied parent must be covered by at least one output.
Record the architecture element,
target child type, intended slice, expected coverage, exclusions, dependencies,
blocking questions, and review policy in the payload. Record exact parents,
architecture, every applicable interface (or none when the architecture declares
no interaction requiring a controlled boundary), and verification strategy only through
the source-owned canonical links. Do not begin decomposition before the exact
plan passes review.
