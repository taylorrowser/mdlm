---
id: record-gate-signoff
version: 2
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
explicitly authorizes the exact candidate; after that authorization, the operating
agent executes this Scenario with `--authorize stakeholder` rather than asking the
stakeholder to run a command.

Create one `gate-signoff` DEC recording approval or rejection, rationale, and
scope, with a `justifies` link to the exact frozen candidate BSL revision. Capture
new unresolved questions as QSTs rather than weakening the decision text. Never
modify the candidate during the gate; revisions require a new candidate and a
new gate.

Record exact provenance. Because gate sign-off is consequential, the DEC remains
subject to the bootstrap DEC review policy before its evidence is applicable.
