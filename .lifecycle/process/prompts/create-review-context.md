---
id: create-review-context
version: 1
scenario: create-review-context
---

# Create an exact review context

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/traceability.md@1`
3. `skills/baseline-model.md@1`

For each input subject, create a review-context BSL containing the exact subject
revision and the minimum complete context needed to judge it. Include applicable
parents, siblings in the same authored set, governing decisions, and the
candidate baseline when one exists. Do not include unrelated artifacts merely
because they are nearby.

Use exact revision IDs for every member. Keep definition members separate from
REV and DEC evidence. Resolve stable outbound links, hash exact file bytes,
capture process provenance, freeze atomically, and verify the frozen baseline.
Never use `latest` or generated indexes as authority.

For an ENV subject, wait for passing environment-capability qualification. Include
the exact ENV and realized VSP as definition members, and include the exact
qualification VER, VAI, completed RUN, and passing RES as evidence. Do not ask for
Review before that complete assurance boundary is available.

A batch may share one context only when every subject genuinely has the same
required context; otherwise create separate BSLs.
