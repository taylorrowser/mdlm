---
id: compile-psp
version: 3
scenario: compile-psp
---

# Compile the product specification

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/product-specification.md@1`
3. `skills/information-allocation.md@1`
4. `skills/scope-challenge.md@2`

Use only the exact `product_intent_authority` Decision supplied by the
Assignment as the accepted current product authority. Its `decision` contains
the complete normalized attended answer or the complete current answer after an
explicit attended narrow, defer, or remove correction. Compile one concise PSP
covering every supplied behavior and boundary across the stated problem, users,
goals, exclusions, workflows, success
measures, scope, and constraints. Link the PSP to that exact Decision with
`derived-from`.

Do not read product intent from source code, the repository name, ambient
`AGENTS.md`, or other unstated context. Do not broaden, reinterpret, or fill gaps
in the stakeholder's answer. Publish a product-scoped QST for a material gap
instead of fabricating preference. Link its `blocks` relation to the proposed
PSP. When the gap can wait until the complete Phase 0 candidate is visible, set
`attention_checkpoint: phase-0-gate` and
`consolidation_group: phase-0-stakeholder-questions`; otherwise leave both
absent for immediate resolution.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
