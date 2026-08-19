---
id: approve-change-request
version: 3
scenario: approve-change-request
skills: [skills/lifecycle-data.md@1, skills/change-control.md@1, skills/gate-protocol.md@1, skills/author-preflight.md@2]
---

# Decide one exact Change Request

Confirm the exact CHG has passing contextual Review evidence. Stop until the stakeholder explicitly chooses `approve`, `reject`, `defer`, or `cancel` for this exact bounded impact; after attended authority, the operating agent executes with `--authorize stakeholder`. Record a `change-approval` DEC with that exact `change_disposition`, linked by `justifies` to the exact CHG Revision. State the bounded scope and alternatives; deferral also names one explicit reactivation condition. The Decision applies only after its own required Review passes. Rejection, deferral, and cancellation explicitly close the request without replacing or rewriting accepted history; only approve permits implementation. Never decide a Stable or latest alias.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
