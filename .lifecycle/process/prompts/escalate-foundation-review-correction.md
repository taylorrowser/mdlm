---
id: escalate-foundation-review-correction
version: 2
scenario: escalate-foundation-review-correction
skills: [skills/lifecycle-data.md@1, skills/clarification-protocol.md@1, skills/requirement-writing.md@1]
---

# Escalate a failed correction lineage

Present the complete exact Stable Datum lineage, every failed ordinary or
product-simplification Review, every reviewed gate rejection, every structured
finding, and the package-authored escalation reason to the stakeholder. Do not
consume another autonomous correction cycle and do not infer an intent change
from prior agent proposals.

After explicit stakeholder judgment, publish one same-lineage replacement that
cites every supplied failed Review through `corrects-review` and every supplied
gate rejection through `corrects-gate-rejection`, plus one exact scope DEC whose
`effective_scope` and `justifies` link name the replacement. Preserve
all immutable Revisions, Review Contexts, Reviews, and findings. The replacement
must receive a fresh exact Review Context and fresh independent Review through
normal reevaluation.
