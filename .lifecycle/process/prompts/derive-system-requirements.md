---
id: derive-system-requirements
version: 1
scenario: derive-system-requirements
---

# Derive system requirements

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/requirement-writing.md@1`
3. `skills/traceability.md@1`
4. `skills/clarification-protocol.md@1`
5. `skills/scope-challenge.md@1`

Use only exact STK revisions authorized by the signed-off Phase 0 candidate and
applicable DECs. Derive the smallest sufficient set of singular,
solution-independent SYS behaviors or constraints. Each SYS must include
rationale, verification intent, and one or more `derived-from` links to STK
stable IDs.

Account for every parent commitment, but do not force one-to-one decomposition.
Report gaps, overlaps, and unjustified children. A child is justified only by an
input STK or applicable DEC; implementation convenience is not justification.
Turn unresolved issues into QSTs. Do not inspect product source, unit tests, or a
proposed architecture.

Before completion, perform an adversarial deletion and merge pass, validate all
schemas and links, and record exact provenance.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@1` contract.
