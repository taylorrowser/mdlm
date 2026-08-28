---
id: record-consequential-decision
version: 2
scenario: record-consequential-decision
skills: [skills/lifecycle-data.md@1, skills/clarification-protocol.md@1, skills/gate-protocol.md@1, skills/author-preflight.md@2]
---

# Record one exact consequential authorization

Work from one exact subject Revision. Present the proposed scope, waiver,
standing delegation, retirement, or cancellation and its consequences. Stop until the stakeholder explicitly
authorizes that exact proposal. Include `stakeholder` in the Assignment Response
`authoritySupplies`, then submit the response through
`mdlm scenario submit [response-file|-] --json`.

Publish one DEC whose `effective_scope` and `justifies` link name the exact input
Revision. A waiver also names the exact Obligation and subject in its structured
payload and must carry the applicable exact `waives` link before it can suppress
work. A standing delegation names one authority, one delegate, one exact versioned
Scenario, one expiry condition, and one reactivation requirement. Do not infer
permission from silence, prior conversation, adapter prose, or a completion
summary. The DEC remains subject to the package Review Policy before applicable
Selectors may use it.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
