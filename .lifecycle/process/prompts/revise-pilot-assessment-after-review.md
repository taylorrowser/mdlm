---
id: revise-pilot-assessment-after-review
version: 2
scenario: revise-pilot-assessment-after-review
skills: [skills/lifecycle-data.md@1, skills/pilot-assessment.md@1, skills/contextual-artifact-review.md@2, skills/author-preflight.md@2]
---

# Correct a failed pilot assessment

Revise the supplied PAS in the same Stable Datum lineage. Address only the exact
failing Review Findings, retain the supplied frozen assessment context, and
preserve the complete immutable evidence history. Keep qualification, pilot, and
formal evidence distinct. Change the rationale to explain the Correction and link
`corrects-review` to every supplied failing REV. A passing prior Review does not
satisfy Correction. The replacement requires a fresh independent Review before
any Expansion Decision.

When Assignment participation is autonomous, omit the optional `decision` output.
When participation is attended, publish exactly one `decision` DEC in the same
atomic proposal. Set `kind: scope`; set `effective_scope` to
`$proposal.<replacement-local-id>.revision_id`; include non-empty rationale,
decision, and alternatives; and link `justifies` to the replacement PAS. This DEC
records stakeholder authority for the exact escalated Correction; it does not
replace or suppress failed Review evidence. Continued failure remains on this same
attended interface without changing the frozen assessment context.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
