---
id: analyze-change-impact
version: 2
scenario: analyze-change-impact
skills: [skills/lifecycle-data.md@1, skills/traceability.md@1, skills/change-control.md@1, skills/author-preflight.md@2]
---

# Analyze exact accepted-STK change impact

Trace from the exact PRB source and bound one CHG around exactly one accepted STK Revision. Acceptance means that exact Revision belongs to an `intent-approved` baseline; an individually passing Review or a different Revision in the same Stable Datum is insufficient. Name exactly two canonical `impacts` roots: that STK Revision and the accepted baseline containing it. The package derives affected Review Contexts, Reviews, candidates, and verification evidence from those exact roots, so omission cannot turn affected evidence into reusable evidence. Preserve original-V implementation order and explicit closure criteria. Do not create CHG ceremony for a draft STK defect.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
