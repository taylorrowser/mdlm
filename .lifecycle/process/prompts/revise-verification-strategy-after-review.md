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
