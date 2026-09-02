---
id: revise-formal-verification-activity-after-review
version: 1
scenario: revise-formal-verification-activity-after-review
---

# Correct a formal verification activity

Use the supplied exact failed formal VER, every current failed Review, its exact
requirement set, and its exact verification strategy. Create the next Revision
in the same VER Stable Datum lineage. Correct only the behavior, criteria,
activities, or evidence named by the blocking findings.

Preserve the formal requirement-scoped claim, every exact `verifies` and
`verifies-revision` binding, and the exact `governed-by` strategy. Cite every
supplied failed Review through `corrects-review`. Do not cite unrelated Reviews,
change the requirement set, broaden product behavior, inspect implementation
source, or alter immutable failed evidence.

The replacement receives a fresh exact Review Context and independent Review.
The prior VER and failed Review remain durable history.
