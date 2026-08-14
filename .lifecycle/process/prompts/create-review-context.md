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

For each input subject, create a review-context BSL whose `scope` is that exact
subject Revision and whose definition contains the subject plus the minimum
complete context needed to judge it. Include applicable
parents, siblings in the same authored set, governing decisions, and the
candidate baseline when one exists. The Assignment supplies every exact `context_members` Revision mandatory beside
the subject. For an STK subject, include each supplied exact current PSP parent
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

A batch may share one context only when every subject genuinely has the same
required context; otherwise create separate BSLs.
