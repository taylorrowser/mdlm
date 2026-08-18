---
id: create-review-context
version: 2
scenario: create-review-context
---

# Create an exact review context

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/traceability.md@1`
3. `skills/baseline-model.md@1`

For each input subject, materialize a review-context BSL whose `scope` is that
exact subject Revision. Context construction is package-owned, not an authoring
judgment: `definition_members` must equal the subject plus every and only supplied
`context_members`, in canonical order. Do not search for, add, omit, or substitute
context. For an STK subject, the supplied set includes each exact current PSP parent
resolved from its stable `derived-from` link. For a Phase 0 candidate or an
executed Phase 2 planning DWP, include all supplied members so later independent
Assignments receive the complete exact set. Do not include unrelated artifacts
merely because they are nearby.

Use exact revision IDs for every member. Keep definition members separate from
REV and DEC evidence. Resolve stable outbound links, hash exact file bytes,
capture process provenance, freeze atomically, and verify the frozen baseline.
Never use `latest` or generated indexes as authority.

For an ENV subject, wait for passing environment-capability qualification. Include
the exact ENV and realized VSP as definition members, and include the exact
qualification VER, VAI, completed RUN, and passing RES as evidence. Do not ask for
Review before that complete assurance boundary is available.

A batch may share one context only when the Assignment supplies the same exact
required set for every subject; otherwise create separate BSLs. The kernel owns
source-byte hashing, stable-link resolution, process provenance, atomic freeze,
and verification. The operator contributes no semantic context decision.
