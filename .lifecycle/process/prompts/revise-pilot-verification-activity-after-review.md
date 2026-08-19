---
id: revise-pilot-verification-activity-after-review
version: 2
scenario: revise-pilot-verification-activity-after-review
skills: [skills/lifecycle-data.md@1, skills/verification-writing.md@1, skills/contextual-artifact-review.md@2, skills/verification-independence.md@1, skills/author-preflight.md@2]
---

# Correct a failed pilot verification activity

Create the next Revision in the supplied pilot VER lineage. Address every and only
the supplied exact failed Review findings while preserving the exact requirement,
strategy, accepted parent intent, pilot claim, and source-independent boundary.
Use parent intent only to resolve relative terms in the requirement. Do not add
behavior absent from those exact definitions. Link `derived-from` to the exact
supplied parent PSP Revision and link `corrects-review` to every supplied failed
REV. Preserve immutable failed history and do not inspect
product source, unit tests, or private implementation details. The replacement
requires a fresh exact Review Context and independent Review before implementation.

When the Assignment participation is autonomous, omit the optional `decision`
output. When it is attended, publish exactly one `decision` DEC in the same atomic
proposal. Set `kind: scope`; using the replacement output's local ID, set
`effective_scope` to `$proposal.<replacement-local-id>.revision_id`; include a
non-empty decision, rationale, and alternatives; and link `justifies`
to the replacement Revision. This DEC records the stakeholder's authority for this
exact correction; it does not replace or suppress the failed Review.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
