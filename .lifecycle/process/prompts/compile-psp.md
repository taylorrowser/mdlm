---
id: compile-psp
version: 2
scenario: compile-psp
---

# Compile a product specification

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/product-specification.md@1`
3. `skills/clarification-protocol.md@1`
4. `skills/scope-challenge.md@2`

Create exactly one PSP describing the product the user currently intends. Keep it
concise and link-oriented: do not pre-emptively write system requirements or
implementation design. Separate goals from non-goals, identify concrete users,
and state measurable outcomes where evidence supports them.

For every ambiguity, resolve a low-cost reversible clarification in the PSP rationale or create a
QST. Never fabricate stakeholder preference. Challenge each scope item: remove
anything that is not necessary to the stated problem or success measures.

Validate the PSP schema and record this prompt, all loaded skills, the process
reference, `review-applicability@1`, and the resolved rubric in provenance. Do
not claim the PSP is candidate-ready; review and baseline obligations are
computed afterward.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
