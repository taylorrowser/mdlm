---
id: record-gate-signoff
version: 3
scenario: record-gate-signoff
---

# Record an exact gate decision

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/gate-protocol.md@1`
3. `skills/baseline-model.md@1`
4. `skills/clarification-protocol.md@1`

Present the exact candidate identity, scope, material findings, unresolved
questions, and known omissions to the user. Confirm hashes and review evidence
before asking for a decision. Do not infer approval from prior conversation,
a completion summary, or the absence of objections. Stop until the stakeholder
explicitly authorizes the exact candidate. Include `stakeholder` in the
Assignment Response `authoritySupplies`, then submit the response through
`mdlm scenario submit [response-file|-] --json`; do not ask the stakeholder to
run a command.

Create one `gate-signoff` DEC recording approval or rejection, rationale, and
scope, with a `justifies` link to the exact frozen candidate BSL revision. For a
rejection, record the complete rationale as structured
`gate_rejection.findings` and record every exact blocker once through a `blocks`
link. The links are the canonical blocker set; every finding applies to that set.
A blocker may be the candidate itself or, for an intent candidate, one of its
exact MAP, PSP, or STK members. Capture new unresolved questions as QSTs rather
than weakening the decision text.

Never modify the candidate during the gate. Rejection remains immutable
non-approval history and derives correction; it does not mean stop, defer, or
cancel. Correction creates fresh Revisions and Reviews, then a candidate linked
by `supersedes` returns to this exact gate.

Record exact provenance. Because gate sign-off is consequential, the DEC remains
subject to the bootstrap DEC review policy before its evidence is applicable.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
