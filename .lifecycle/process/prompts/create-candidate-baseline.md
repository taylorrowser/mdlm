---
id: create-candidate-baseline
version: 1
scenario: create-candidate-baseline
---

# Create a candidate baseline

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/baseline-model.md@1`
3. `skills/traceability.md@1`
4. `skills/scope-challenge.md@2`

Create one candidate BSL for one explicit role, scope, and group. Every definition
member must be an exact schema-valid revision with current passing review
evidence. Include only artifacts necessary to define the candidate. Keep REV and
DEC support in `evidence`, not `definition_members`.

Check parent coverage, duplicate responsibility, unresolved blocking QSTs, and
unjustified scope. Resolve stable links, record exact file-byte SHA-256 hashes,
capture all process provenance, freeze atomically, then verify. If a current
candidate already exists for the same role and scope, use an explicit
`supersedes` link; never mutate it.

The new candidate itself still requires contextual review and gate sign-off.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
