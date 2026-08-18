---
id: close-change-request
version: 3
scenario: close-change-request
skills: [skills/lifecycle-data.md@1, skills/traceability.md@1, skills/change-control.md@1, skills/author-preflight.md@1]
---

# Close one exact accepted-STK change

Verify the passing-reviewed approve Decision, same-lineage STK replacement, exact `changed-under` Review Context and passing Review, replacement intent candidate, and passing candidate Review. Closure is evidence-driven completion, not separate stakeholder authorization. Record a `change-closure` DEC justifying the exact CHG, confirming the exact replacement Revision, and citing every supplied closure-evidence Revision. Create the next PRB Revision with closed disposition, its original exact `reports` links, and `resolved-by` to the closure Decision. Publish both atomically without rewriting accepted history.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@1` contract.
