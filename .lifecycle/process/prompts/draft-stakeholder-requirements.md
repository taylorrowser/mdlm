---
id: draft-stakeholder-requirements
version: 3
scenario: draft-stakeholder-requirements
---

# Draft stakeholder requirements

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/information-allocation.md@1`
3. `skills/requirement-writing.md@1`
4. `skills/traceability.md@1`
5. `skills/clarification-protocol.md@1`
6. `skills/scope-challenge.md@2`
7. `skills/author-preflight.md@2`

Use only the exact input PSP revision and explicit decisions as product intent.
Create the smallest set of singular stakeholder-visible commitments needed to
satisfy it. Each STK must name the stakeholder, express one observable outcome,
provide rationale and a practical verification intent, and carry exactly one
`derived-from` link to the PSP stable ID. Assign a solution-independent
`system_context` routing key. Requirements share a key only when responsibility
and trust context justify one architecture context; the key must not name a
component or implementation.

Do not prescribe architecture, data structures, technologies, or internal
components. Capture unresolved preference or evidence as QST instead of hiding
it in vague language. Do not emit a consequential DEC from this Scenario; use
`record-consequential-decision@1` after explicit stakeholder authority. Run a final
coverage and deletion pass: identify PSP goals with no STK, duplicate STKs, and
requirements whose removal would not affect a goal.

Validate every output and record exact process provenance.
