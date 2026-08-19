---
id: escalate-foundation-review-correction
version: 3
scenario: escalate-foundation-review-correction
skills: [skills/lifecycle-data.md@1, skills/clarification-protocol.md@1, skills/requirement-writing.md@1, skills/author-preflight.md@2]
---

# Escalate a failed correction lineage

Present the complete exact Stable Datum lineage, every failed ordinary or
product-simplification Review, every reviewed gate rejection, every structured
finding, and the package-authored escalation reason to the stakeholder. Do not
consume another autonomous correction cycle and do not infer an intent change
from prior agent proposals.

Before selecting a correction, compare three concrete options against the
product purpose and the complete blocking finding set:

- the smallest bounded behavior that resolves the findings;
- deferring or removing behavior that lacks present necessity, with an exact
  condition for reconsidering it; and
- explicitly retaining broader behavior, with the stakeholder-visible need
  that makes its cost necessary.

After explicit stakeholder judgment, publish one same-lineage replacement that
cites every supplied failed Review through `corrects-review` and every supplied
gate rejection through `corrects-gate-rejection`, plus one exact scope DEC whose
`effective_scope` and `justifies` link name the replacement. Record the comparison
in `payload.scope_correction`: select `bound`, `defer-or-remove`, or `retain` as
`disposition`; describe all three alternatives in `options.bounded`,
`options.defer_or_remove`, and `options.retain`; and state why the selected scope
is necessary in `necessity`. A `defer-or-remove` selection must also state the
exact `reactivation_condition`. Do not treat determinism, prior elaboration, or
an agent proposal as authority to retain complexity.

Preserve all immutable Revisions, Review Contexts, Reviews, and findings. The
replacement must receive a fresh exact Review Context and fresh independent
Review through normal reevaluation.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
