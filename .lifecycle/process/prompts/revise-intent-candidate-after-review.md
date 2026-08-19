---
id: revise-intent-candidate-after-review
version: 4
scenario: revise-intent-candidate-after-review
---

# Replace a failed or rejected intent candidate

Read `skills/lifecycle-data.md@1`, `skills/baseline-model.md@1`, and
`skills/scope-challenge.md@1`. Use only the exact candidate lineage, complete
failed Review/finding history, reviewed current foundation members, their exact
supplied `member_reviews`, reviewed gate rejections, and the exact supplied
`question_dispositions` with their applicable reviewed `question_decisions`.
Never infer a Question answer or disposition from a finding, member, or candidate.
Publish one frozen replacement Revision in the same BSL lineage. Its evidence must
contain every supplied current member Review, retain prior non-Review evidence,
and omit obsolete or unrelated Review evidence. Link `supersedes` to the prior
candidate, link `corrects-review` to every supplied failed Review, and link
`corrects-gate-rejection` to every supplied rejection.

The first two causal Review-correction cycles are autonomous. When participation
is attended, present the same exact packet to the stakeholder and additionally
publish the required scope DEC that justifies the replacement; do not route to a
parallel recovery Scenario. The replacement requires a fresh independent
`simplification-product-definition` Review. A reviewed rejection returns the
passing replacement to this same gate; it never implies stop, defer, or cancel.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@1` contract.
