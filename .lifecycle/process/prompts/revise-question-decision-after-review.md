---
id: revise-question-decision-after-review
version: 1
scenario: revise-question-decision-after-review
---

# Correct a failed Question Decision

Read `skills/lifecycle-data.md@1`, `skills/clarification-protocol.md@1`, and
`skills/gate-protocol.md@1`. Present the exact Question, current Decision, failed
Review findings, and supplied causal correction lineage to the stakeholder.
Publish one replacement Revision in the same DEC Stable Datum lineage. Preserve
its Decision kind and exact Question scope. Link `resolves` to that exact QST
Revision and `corrects-review` to every supplied failed Review. The answered QST
contains the normalized attended answer. Retain that answer exactly unless the
stakeholder explicitly narrows, defers, or removes behavior in this correction.
For such a change, record `attended_answer_change.disposition` and a specific
`attended_answer_change.rationale`, then make the replacement `decision` the
complete current authority. Do not reinterpret omitted Decision text as an
attended change. Do not rewrite an unfavorable Review or infer a different
preference. Normal reevaluation must require a fresh independent Review of the
replacement.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
