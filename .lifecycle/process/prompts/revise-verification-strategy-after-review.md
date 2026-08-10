---
id: revise-verification-strategy-after-review
version: 1
scenario: revise-verification-strategy-after-review
skills: [skills/lifecycle-data.md@1, skills/verification-strategy-specification.md@1, skills/contextual-artifact-review.md@1, skills/verification-independence.md@1]
---

# Correct a failed verification strategy

Create the next Revision in the supplied VSP lineage. Address every and only the
supplied exact failed Review findings while retaining the exact current requirement
boundary and black-box independence. Preserve immutable failed history. Link
`corrects-review` to every supplied failed REV and preserve exact governs links.
Do not inspect product source or unit tests. The replacement requires a fresh exact
Review Context and independent Review; environments tied to the prior strategy
Revision cannot be borrowed.

When the Assignment participation is autonomous, omit the optional `decision`
output. When it is attended, publish exactly one `decision` DEC in the same atomic
proposal. Set `kind: scope`; using the replacement output's local ID, set
`effective_scope` to `$proposal.<replacement-local-id>.revision_id`; include a
non-empty decision, rationale, and alternatives; and link `justifies`
to the replacement Revision. This DEC records the stakeholder's authority for this
exact correction; it does not replace or suppress the failed Review.
