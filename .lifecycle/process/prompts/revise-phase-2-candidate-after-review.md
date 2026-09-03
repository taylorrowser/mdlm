---
id: revise-phase-2-candidate-after-review
version: 2
scenario: revise-phase-2-candidate-after-review
---

# Replace one level candidate

Read `skills/lifecycle-data.md@1`, `skills/baseline-model.md@1`,
`skills/contextual-artifact-review.md@2`, `skills/traceability.md@1`, and
`skills/gate-protocol.md@1`.

Publish one frozen same-lineage replacement level candidate. Preserve every
supplied definition member and evidence Revision except exact
`rejected_members` and their Review evidence. Remove a rejected member, or use
one later valid same-lineage Revision with its fresh passing Review. Do not add,
remove, or replace unrelated membership or evidence.
Replace every gate-rejected DES member with its supplied
`corrected_members` Revision and add the supplied `corrected_member_reviews` as
fresh evidence. Never refreeze the rejected Revision.
Record the process-significant predecessor through `supersedes`, every failed
Review through `corrects-review`, and every reviewed rejection through
`corrects-gate-rejection`. Rejection is not stop, defer, or cancel. The
replacement must receive a fresh independent Review before the same gate may
request authority again.

When participation is attended, publish the exact scope DEC required by the
Assignment without using it as Review evidence.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
