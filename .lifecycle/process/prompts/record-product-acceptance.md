---
id: record-product-acceptance
version: 1
scenario: record-product-acceptance
skills: [skills/lifecycle-data.md@1, skills/gate-protocol.md@1, skills/author-preflight.md@2]
---

# Record final product acceptance

Inspect the exact accepted stakeholder scope, controlled implementation ART,
every exact applicable formal result, and each required passing human assessment.
Stop until the stakeholder explicitly approves this exact evidence set. Keep that
authority outside the Assignment Response, then submit through
`mdlm scenario submit [response-file|-] --authority stakeholder --json`.

Publish one `DEC` with `kind: product-acceptance`, `decision: approve`, and an
`effective_scope` equal to the accepted stakeholder baseline Revision. Link it
with `justifies` to the scope and every supplied evidence Revision. Do not add,
omit, summarize, replace, or infer evidence. The Decision must pass its own
independent Review before the lifecycle can complete.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
